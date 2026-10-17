const test = require('node:test');
const assert = require('node:assert/strict');
const { toRows, csvContent } = require('../public/js/admin-exports');
const ExcelJS = require('exceljs');
const pdfMake = require('pdfmake/build/pdfmake');

function pdfObjects(bytes) {
    // Read the generated PDF's actual cross-reference table independently of the writer.
    const text = bytes.toString('latin1');
    assert.match(text, /^%PDF-1\.[3-7]/);
    const ending = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
    assert.ok(ending, 'PDF besitzt einen vollständigen Trailer');
    const xref = /^xref\s+0 (\d+)\s*\n([\s\S]*?)trailer/.exec(text.slice(Number(ending[1])));
    assert.ok(xref, 'startxref verweist auf die echte Xref-Tabelle');
    const entries = xref[2].trim().split(/\r?\n/);
    assert.equal(entries.length, Number(xref[1]));
    const objects = [];
    for (let id = 1; id < entries.length; id++) {
        const entry = /^(\d{10}) \d{5} ([nf])/.exec(entries[id]);
        assert.ok(entry);
        if (entry[2] === 'f') continue;
        const offset = Number(entry[1]);
        assert.ok(text.slice(offset).startsWith(`${id} 0 obj`), `Xref für Objekt ${id} ist korrekt`);
        const end = text.indexOf('endobj', offset);
        assert.ok(end > offset);
        objects.push(text.slice(offset, end));
    }
    return objects;
}

test('CSV exportiert UTF-8 und schützt Tabellenprogramme vor Formeln in Usernamen', () => {
    const rows = toRows([
        { username: '=SUM(1,2)', kommt: null, huette: null, luftmatratze: null, bettzeug: null, updated_at: null },
        { username: 'Änne; "Test"', kommt: 'Ja', huette: 'Nein', luftmatratze: 'Nein', bettzeug: 'Nein', updated_at: null }
    ]);
    assert.deepEqual(rows[0], ['=SUM(1,2)', 'Keine Antwort', '–', '–', '–', '–']);
    assert.deepEqual(rows[1], ['Änne; "Test"', 'Ja', 'Nein', 'Nein', 'Nein', '–']);
    const csv = csvContent(rows);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.match(csv, /"User";"Teilnahme";"Hüttenschlaf";"Luftmatratze";"Bettzeug";"Antwort vom"/);
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
            { username: '=Beispiel', kommt: 'Ja', huette: 'Nein', luftmatratze: 'Nein', bettzeug: 'Nein', updated_at: null }
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
        assert.equal(sheet.columnCount, 6);
        assert.equal(sheet.autoFilter, 'A1:F1');
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
        // Exercise the same UMD browser bundle served by the application.
        global.window = { pdfMake, setTimeout() {} };
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
            username: `Gast ${i}`, kommt: 'Ja', huette: 'Nein', luftmatratze: 'Nein', bettzeug: 'Nein', updated_at: null
        }));
        await require('../public/js/admin-exports').download('pdf', people);
        assert.match(filename, /^user-uebersicht-\d{4}-\d{2}-\d{2}\.pdf$/);
        const objects = pdfObjects(Buffer.from(await downloaded.arrayBuffer()));
        const pages = objects.filter(object => /\/Type\s*\/Page\b/.test(object));
        assert.equal(pages.length, 2);
        assert.ok(pages.every(page => /\/MediaBox\s*\[0 0 595\.28 841\.89\]/.test(page)));
        assert.ok(objects.some(object => /\/Subtype\s*\/Image\b/.test(object)));
    } finally {
        global.window = originalWindow;
        global.document = originalDocument;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
    }
});

test('PNG-Export liefert PNG-Daten und teilt große Tabellen in vollständige ZIP-Seiten', async () => {
    let downloaded;
    let filename;
    const originalWindow = global.window;
    const originalDocument = global.document;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const JSZip = require('jszip');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Q5sAAAAASUVORK5CYII=', 'base64');
    try {
        global.window = { JSZip, setTimeout() {} };
        global.document = {
            body: { append() {} },
            createElement(tag) {
                if (tag === 'a') return { click() { filename = this.download; }, remove() {} };
                if (tag === 'canvas') return {
                    getContext() { return { fillRect() {}, fillText() {}, measureText(text) { return { width: text.length * 12 }; } }; },
                    toBlob(callback) { callback(new Uint8Array(png)); }
                };
                throw new Error(`Unerwartetes Element: ${tag}`);
            }
        };
        URL.createObjectURL = blob => { downloaded = blob; return 'blob:test'; };
        URL.revokeObjectURL = () => {};
        const people = Array.from({ length: 320 }, (_, i) => ({ username: `Bildgast ${i}`, kommt: 'Ja', huette: 'Nein', luftmatratze: 'Nein', bettzeug: 'Nein' }));
        await require('../public/js/admin-exports').download('png', people.slice(0, 1));
        assert.match(filename, /\.png$/);
        assert.deepEqual(Buffer.from(downloaded), png);
        await require('../public/js/admin-exports').download('png', people);
        assert.match(filename, /-bilder\.zip$/);
        const zip = await JSZip.loadAsync(await downloaded.arrayBuffer());
        const files = Object.keys(zip.files);
        assert.equal(files.length, 2);
        for (const file of files) {
            assert.match(file, /-seite-[12]\.png$/);
            assert.deepEqual(await zip.file(file).async('nodebuffer'), png);
        }
    } finally {
        global.window = originalWindow;
        global.document = originalDocument;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
    }
});
