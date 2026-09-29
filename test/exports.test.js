const test = require('node:test');
const assert = require('node:assert/strict');
const { toRows, csvContent } = require('../public/js/admin-exports');
const ExcelJS = require('exceljs');
const { PDFDocument } = require('pdf-lib');

test('CSV exportiert UTF-8 und schützt Tabellenprogramme vor Formeln in Usernamen', () => {
    const rows = toRows([
        { username: '=SUM(1,2)', kommt: null, huette: null, bettgarnitur: null, updated_at: null },
        { username: 'Änne; "Test"', kommt: 'Ja', huette: 'Nein', bettgarnitur: 'Nein', updated_at: null }
    ]);
    assert.deepEqual(rows[0], ['=SUM(1,2)', 'Keine Antwort', '–', '–', '–']);
    assert.deepEqual(rows[1], ['Änne; "Test"', 'Ja', 'Nein', 'Nein', '–']);
    const csv = csvContent(rows);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.match(csv, /"User";"Teilnahme";"Hüttenschlaf";"Bettgarnitur";"Antwort vom"/);
    assert.match(csv, /"'=SUM\(1,2\)";"Keine Antwort"/);
    assert.match(csv, /"Änne; ""Test""";"Ja"/);
    assert.equal(csv.trimEnd().split('\r\n').length, 3);
});

test('Excel-Export erzeugt eine echte XLSX-Datei mit genau den übergebenen Usern', async () => {
    let downloaded;
    let filename;
    const originalWindow = global.window;
    const originalDocument = global.document;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    try {
        global.window = { ExcelJS, setTimeout() {} };
        global.document = {
            body: { append() {} },
            createElement() { return { click() { filename = this.download; }, remove() {} }; }
        };
        URL.createObjectURL = blob => { downloaded = blob; return 'blob:test'; };
        URL.revokeObjectURL = () => {};
        await require('../public/js/admin-exports').download('xlsx', [
            { username: '=Beispiel', kommt: 'Ja', huette: 'Nein', bettgarnitur: 'Nein', updated_at: null }
        ]);
        assert.match(filename, /^user-uebersicht-\d{4}-\d{2}-\d{2}\.xlsx$/);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await downloaded.arrayBuffer());
        const sheet = workbook.getWorksheet('User');
        assert.equal(sheet.rowCount, 2);
        assert.equal(sheet.getCell('A1').value, 'User');
        assert.equal(sheet.getCell('A2').value, '=Beispiel');
        assert.equal(sheet.getCell('A2').type, ExcelJS.ValueType.String);
        assert.equal(sheet.getCell('B2').value, 'Ja');
        assert.equal(sheet.columnCount, 5);
        assert.equal(sheet.autoFilter, 'A1:E1');
    } finally {
        global.window = originalWindow;
        global.document = originalDocument;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
    }
});

test('PDF-Export erstellt für mehrere User gültige PDF-Seiten', async () => {
    let downloaded;
    let filename;
    const originalWindow = global.window;
    const originalDocument = global.document;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Q5sAAAAASUVORK5CYII=';
    try {
        global.window = { PDFLib: require('pdf-lib'), setTimeout() {} };
        global.document = {
            head: { append() {} }, body: { append() {} },
            createElement(tag) {
                if (tag === 'a') return { click() { filename = this.download; }, remove() {} };
                if (tag === 'canvas') return {
                    getContext() { return { fillRect() {}, fillText() {}, measureText(text) { return { width: text.length * 12 }; } }; },
                    toDataURL() { return image; }
                };
                throw new Error(`Unerwartetes Element: ${tag}`);
            }
        };
        URL.createObjectURL = blob => { downloaded = blob; return 'blob:test'; };
        URL.revokeObjectURL = () => {};
        const people = Array.from({ length: 30 }, (_, i) => ({
            username: `Gast ${i}`, kommt: 'Ja', huette: 'Nein', bettgarnitur: 'Nein', updated_at: null
        }));
        await require('../public/js/admin-exports').download('pdf', people);
        assert.match(filename, /^user-uebersicht-\d{4}-\d{2}-\d{2}\.pdf$/);
        const pdf = await PDFDocument.load(await downloaded.arrayBuffer());
        assert.equal(pdf.getPageCount(), 2);
    } finally {
        global.window = originalWindow;
        global.document = originalDocument;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
    }
});
