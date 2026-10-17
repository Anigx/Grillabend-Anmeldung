// All formats use the same filtered rows and the same visible column order.
const AdminExports = (() => {
    const headings = ['User', 'Teilnahme', 'Hüttenschlaf', 'Luftmatratze', 'Bettzeug', 'Antwort vom'];
    const widths = [240, 170, 180, 180, 160, 174];
    const pageHeight = 1697;
    const rowHeight = 52;
    const tableTop = 184;
    const rowsPerPage = Math.floor((pageHeight - tableTop - 54) / rowHeight);

    function toRows(users) {
        return users.map(user => {
            const date = user.updated_at ? new Date(user.updated_at) : null;
            return [user.username, user.kommt || 'Keine Antwort', user.huette || '–', user.luftmatratze || '–', user.bettzeug || '–',
                date && !Number.isNaN(date.getTime()) ?
                    new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date) :
                    user.updated_at || '–'];
        });
    }

    function csvContent(rows) {
        // A BOM and semicolons make the CSV open as UTF-8 with separate columns in German Excel.
        const cell = value => {
            const text = String(value);
            // CSV cells can otherwise be interpreted as formulas by spreadsheet applications.
            const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
            return `"${safe.replaceAll('"', '""')}"`;
        };
        return '\uFEFF' + [headings, ...rows].map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
    }

    function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    function loadLibrary(path, globalName) {
        if (window[globalName]) return Promise.resolve(window[globalName]);
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = path;
            script.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error('Exportbibliothek konnte nicht geladen werden.'));
            script.onerror = () => reject(new Error('Exportbibliothek konnte nicht geladen werden.'));
            document.head.append(script);
        });
    }

    async function excel(rows, name) {
        const ExcelJS = await loadLibrary('/vendor/exceljs/exceljs.min.js', 'ExcelJS');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('User');
        sheet.columns = headings.map((header, index) => ({ header, key: String(index), width: [24, 18, 20, 20, 18, 22][index] }));
        sheet.addRows(rows);
        sheet.autoFilter = 'A1:F1';
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8A2BE2' } };
        const buffer = await workbook.xlsx.writeBuffer();
        saveBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`);
    }

    function drawPage(rows, page, pages, height = pageHeight, totalCount = rows.length) {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Bildexport wird in diesem Browser nicht unterstützt.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#8a2be2';
        ctx.fillRect(0, 0, canvas.width, 12);
        ctx.fillStyle = '#17172b';
        ctx.font = 'bold 40px Outfit, sans-serif';
        ctx.fillText('User-Übersicht', 48, 73);
        ctx.fillStyle = '#53536a';
        ctx.font = '24px Outfit, sans-serif';
        ctx.fillText(`${totalCount} User · ${new Intl.DateTimeFormat('de-DE').format(new Date())}`, 48, 115);
        ctx.fillStyle = '#202032';
        ctx.fillRect(48, tableTop - 48, 1104, 48);

        function cellText(text, x, y, width) {
            let value = String(text);
            while (ctx.measureText(value).width > width - 18 && value.length > 1) value = value.slice(0, -2) + '…';
            ctx.fillText(value, x + 9, y);
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 21px Outfit, sans-serif';
        let x = 48;
        headings.forEach((heading, index) => { cellText(heading, x, tableTop - 17, widths[index]); x += widths[index]; });
        rows.forEach((row, index) => {
            const y = tableTop + index * rowHeight;
            ctx.fillStyle = index % 2 ? '#ffffff' : '#f1eff8';
            ctx.fillRect(48, y, 1104, rowHeight);
            ctx.fillStyle = '#17172b';
            ctx.font = '22px Outfit, sans-serif';
            let columnX = 48;
            row.forEach((value, column) => { cellText(value, columnX, y + 34, widths[column]); columnX += widths[column]; });
        });
        if (pages > 1) {
            ctx.fillStyle = '#53536a';
            ctx.font = '20px Outfit, sans-serif';
            ctx.fillText(`Seite ${page} von ${pages}`, 48, height - 22);
        }
        return canvas;
    }

    function pngBlob(canvas) {
        return new Promise((resolve, reject) => canvas.toBlob(blob =>
            blob ? resolve(blob) : reject(new Error('Bild konnte nicht erzeugt werden.')), 'image/png'));
    }

    async function image(rows, name) {
        // Large canvases exceed browser size limits; provide all pages in one ZIP instead.
        const maxRows = Math.floor((16000 - tableTop - 54) / rowHeight);
        if (rows.length <= maxRows) {
            const canvas = drawPage(rows, 1, 1, Math.max(300, tableTop + rows.length * rowHeight + 54));
            saveBlob(await pngBlob(canvas), `${name}.png`);
            return;
        }
        const JSZip = await loadLibrary('/vendor/jszip/jszip.min.js', 'JSZip');
        const zip = new JSZip();
        const pages = Math.ceil(rows.length / maxRows);
        for (let page = 0; page < pages; page++) {
            const segment = rows.slice(page * maxRows, (page + 1) * maxRows);
            const canvas = drawPage(segment, page + 1, pages, Math.max(300, tableTop + segment.length * rowHeight + 54), rows.length);
            zip.file(`${name}-seite-${page + 1}.png`, await pngBlob(canvas));
        }
        saveBlob(await zip.generateAsync({ type: 'blob' }), `${name}-bilder.zip`);
    }

    async function pdf(rows, name) {
        const pdfMake = await loadLibrary('/vendor/pdfmake/pdfmake.min.js', 'pdfMake');
        const pages = Math.ceil(rows.length / rowsPerPage);
        const content = [];
        for (let page = 0; page < pages; page++) {
            const canvas = drawPage(rows.slice(page * rowsPerPage, (page + 1) * rowsPerPage), page + 1, pages, pageHeight, rows.length);
            content.push({ image: canvas.toDataURL('image/png'), width: 595.28, height: 841.89,
                absolutePosition: { x: 0, y: 0 }, ...(page ? { pageBreak: 'before' } : {}) });
        }
        const buffer = await pdfMake.createPdf({ pageSize: { width: 595.28, height: 841.89 }, pageMargins: 0, content }).getBuffer();
        saveBlob(new Blob([buffer], { type: 'application/pdf' }), `${name}.pdf`);
    }

    async function download(format, users) {
        if (!users.length) throw new Error('Keine User zum Exportieren vorhanden.');
        const rows = toRows(users);
        const name = `user-uebersicht-${new Date().toISOString().slice(0, 10)}`;
        if (format === 'csv') saveBlob(new Blob([csvContent(rows)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
        else if (format === 'xlsx') await excel(rows, name);
        else if (format === 'pdf') await pdf(rows, name);
        else if (format === 'png') await image(rows, name);
        else throw new Error('Unbekanntes Exportformat.');
    }

    return { download, toRows, csvContent };
})();

if (typeof window !== 'undefined') window.AdminExports = AdminExports;
if (typeof module !== 'undefined') module.exports = AdminExports;
