const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { createApp } = require('../server');
const { tokenHash } = require('../src/security');

async function instance(legacyDir) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-test-'));
    const { app, db } = await createApp({ dataDir: path.join(root, 'data'), legacyDir: legacyDir || root });
    const server = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(route, method = 'GET', body, cookie, origin) {
        const headers = {};
        if (body) headers['Content-Type'] = 'application/json';
        if (cookie) headers.Cookie = cookie;
        if (origin) headers.Origin = origin;
        if (process.env.NODE_ENV === 'production') headers['X-Forwarded-Proto'] = 'https';
        const response = await fetch(`${base}${route}`, {
            method, headers, body: body ? JSON.stringify(body) : undefined
        });
        return {
            status: response.status, data: await response.json(),
            cookie: response.headers.get('set-cookie')?.split(';')[0],
            setCookie: response.headers.get('set-cookie'), cacheControl: response.headers.get('cache-control')
        };
    }
    return {
        root, db, base, request,
        async close(remove = true) {
            await new Promise(resolve => server.close(resolve));
            await db.close();
            if (remove) fs.rmSync(root, { recursive: true, force: true });
        }
    };
}

test('öffentliche Registrierung erstellt nur Mitglieder, Daten bleiben privat und Cookies autorisieren Änderungen', async () => {
    const app = await instance();
    try {
        assert.equal((await app.request('/api/attendees')).status, 401);
        assert.equal((await app.request('/api/party-info')).status, 401);
        assert.equal((await app.request('/api/admin/party-info')).status, 401);
        assert.equal((await fetch(`${app.base}/admin`)).status, 401);
        for (const hidden of ['/accounts.sqlite', '/data/app.sqlite', '/server.js', '/src/server.js', '/src/db.js', '/package.json', '/docs/wiki/index.md', '/.git/config', '/admin.html', '/public/admin.html', '/style.css', '/script.js']) {
            assert.equal((await fetch(`${app.base}${hidden}`)).status, 404, hidden);
        }
        const page = await fetch(app.base);
        assert.equal(page.status, 200);
        const html = await page.text();
        assert.match(html, /href="\/admin"/);
        assert.doesNotMatch(html, /id="adminForm"/);
        for (const asset of ['/css/style.css', '/css/modal.css', '/css/admin.css', '/js/app.js', '/js/admin.js',
            '/vendor/leaflet/leaflet.css', '/vendor/leaflet/leaflet.js']) {
            assert.equal((await fetch(`${app.base}${asset}`)).status, 200, asset);
        }
        const created = await app.request('/api/register', 'POST', { username: 'Testperson', password: 'ein-lang-genuges-Testpasswort' });
        assert.equal(created.status, 200);
        assert.equal(created.data.is_admin, false);
        assert.match(created.cookie, /^sid=[a-f0-9]{64}$/);
        const stored = await app.db.get('SELECT password_hash FROM users WHERE username = ?', ['Testperson']);
        assert.match(stored.password_hash, /^scrypt:/);
        assert.equal((await app.request('/api/admin/party-info', 'PUT', {}, created.cookie)).status, 403);
        assert.equal((await app.request('/api/admin/party-info', 'GET', null, created.cookie)).status, 403);
        assert.equal((await fetch(`${app.base}/admin`, { headers: { Cookie: created.cookie } })).status, 403);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', bettgarnitur: 'Nein', username: 'Admin' })).status, 401);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Nein', bettgarnitur: 'Nein' }, created.cookie, 'https://attacker.example')).status, 403);
        const saved = await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', bettgarnitur: 'Nein', username: 'Admin' }, created.cookie);
        assert.equal(saved.status, 200);
        assert.equal((await app.request('/api/attendees', 'GET', null, created.cookie)).data[0].username, 'Testperson');
        assert.equal((await app.request('/api/logout', 'POST', null, created.cookie)).status, 200);
        assert.equal((await app.request('/api/attendees', 'GET', null, created.cookie)).status, 401);
    } finally { await app.close(); }
});

test('Admin wird separat angelegt; Kapazitäten und Bearbeitung fremder Daten sind geschützt', async () => {
    process.env.ADMIN_USERNAME = 'Organisator';
    process.env.ADMIN_PASSWORD = 'ein-sicheres-Beispielpasswort';
    let app;
    try { app = await instance(); }
    finally { delete process.env.ADMIN_USERNAME; delete process.env.ADMIN_PASSWORD; }
    try {
        const admin = await app.request('/api/login', 'POST', { username: 'Organisator', password: 'ein-sicheres-Beispielpasswort' });
        assert.equal(admin.data.is_admin, true);
        const party = {
            date: 'Samstag 19 Uhr', location_name: 'Hütte', location_address: 'Berlin', maps_url: 'https://maps.google.com/',
            max_cabin_capacity: 1, max_bettgarnitur: 1, rules: 'Seid freundlich.', info: 'Essen mitbringen.'
        };
        const adminPage = await fetch(`${app.base}/admin`, { headers: { Cookie: admin.cookie } });
        assert.equal(adminPage.status, 200);
        const adminHtml = await adminPage.text();
        assert.match(adminHtml, /id="adminForm"/);
        assert.match(adminHtml, /src="\/js\/admin.js"/);
        assert.match(adminHtml, /id="pinMap"/);
        assert.match(adminHtml, /src="\/vendor\/leaflet\/leaflet.js"/);
        assert.deepEqual((await app.request('/api/admin/party-info', 'GET', null, admin.cookie)).data.occupancy, { cabin: 0, bedding: 0 });
        assert.equal((await app.request('/api/admin/party-info', 'PUT', party, admin.cookie, 'https://angreifer.example')).status, 403);
        assert.equal((await app.request('/api/admin/party-info', 'PUT', party, admin.cookie)).status, 200);
        const guest = await app.request('/api/register', 'POST', { username: 'Gast 1', password: 'langes-Beispielpasswort-1' });
        assert.equal((await app.request('/api/admin/party-info', 'PUT', party, guest.cookie)).status, 403);
        const publicInfo = (await app.request('/api/party-info', 'GET', null, guest.cookie)).data;
        assert.equal(publicInfo.rules, party.rules);
        assert.equal(Object.hasOwn(publicInfo, 'occupancy'), false);
        assert.equal((await app.request('/api/party-info', 'POST', party, admin.cookie)).status, 404);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', bettgarnitur: 'Ja' }, guest.cookie)).status, 200);
        assert.deepEqual((await app.request('/api/admin/party-info', 'GET', null, admin.cookie)).data.occupancy, { cabin: 1, bedding: 1 });
        const other = await app.request('/api/register', 'POST', { username: 'Gast 2', password: 'langes-Beispielpasswort-2' });
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', bettgarnitur: 'Nein' }, other.cookie)).status, 409);
        assert.equal((await app.request('/api/rsvp/Gast%201', 'DELETE', null, other.cookie)).status, 404);
        assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...party, max_cabin_capacity: 0 }, admin.cookie)).status, 400);
        assert.equal((await app.request('/api/rsvp', 'DELETE', null, guest.cookie)).status, 200);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', bettgarnitur: 'Nein' }, other.cookie)).status, 200);
        assert.equal((await app.request('/api/logout', 'POST', null, admin.cookie)).status, 200);
        assert.equal((await app.request('/api/admin/party-info', 'GET', null, admin.cookie)).status, 401);
        assert.equal((await fetch(`${app.base}/admin`, { headers: { Cookie: admin.cookie } })).status, 401);
    } finally { await app.close(); }
});

function createLegacy(filename, sql) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(filename);
        db.exec(sql, error => db.close(closeError => error || closeError ? reject(error || closeError) : resolve()));
    });
}

test('Alt-Daten werden einmalig und ohne Änderung der Quell-Dateien übernommen', async () => {
    const legacy = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-legacy-'));
    let app;
    try {
        await createLegacy(path.join(legacy, 'accounts.sqlite'), `CREATE TABLE users (username TEXT, password TEXT, is_admin INTEGER);
            INSERT INTO users VALUES ('Alt-Admin', 'alt-passwort', 1);`);
        await createLegacy(path.join(legacy, 'party_eintraege.sqlite'), `CREATE TABLE rsvps (username TEXT, kommt TEXT, huette TEXT, bettgarnitur TEXT, timestamp TEXT);
            INSERT INTO rsvps VALUES ('Alt-Admin', 'Ja', 'Ja', 'Nein', '2024-10-30 12:00:00');`);
        await createLegacy(path.join(legacy, 'Datum.sqlite'), `CREATE TABLE party_info (id INTEGER, date TEXT, location_name TEXT, location_address TEXT, maps_url TEXT, max_cabin_capacity INTEGER, max_bettgarnitur INTEGER);
            INSERT INTO party_info VALUES (1, 'Früher', 'Hütte', 'Beispielort', 'https://maps.google.com/', 15, 10);`);
        app = await instance(legacy);
        const signed = await app.request('/api/login', 'POST', { username: 'Alt-Admin', password: 'alt-passwort' });
        assert.equal(signed.data.is_admin, true);
        assert.equal((await app.request('/api/attendees', 'GET', null, signed.cookie)).data[0].kommt, 'Ja');
        const importedEvent = (await app.request('/api/party-info', 'GET', null, signed.cookie)).data;
        assert.equal(importedEvent.date, 'Früher');
        assert.equal(importedEvent.latitude, null);
        assert.equal(importedEvent.longitude, null);
        const secret = await app.db.get('SELECT password_hash FROM users WHERE username = ?', ['Alt-Admin']);
        assert.match(secret.password_hash, /^scrypt:/);
        const root = app.root;
        await app.close(false);
        app = null;
        // The source remains intact, and the target must not import again on restart.
        const reopened = await createApp({ dataDir: path.join(root, 'data'), legacyDir: legacy });
        assert.equal((await reopened.db.get('SELECT COUNT(*) AS count FROM users')).count, 1);
        assert.equal((await reopened.db.get('SELECT COUNT(*) AS count FROM rsvps')).count, 1);
        await reopened.db.close();
        fs.rmSync(root, { recursive: true, force: true });
        assert.equal(fs.existsSync(path.join(legacy, 'accounts.sqlite')), true);
    } finally {
        if (app) await app.close();
        fs.rmSync(legacy, { recursive: true, force: true });
    }
});

test('Registrierung prüft Namen und Passwort, erlaubt keine Admin-Selbstvergabe und verhindert SQL-Injection', async () => {
    const app = await instance();
    try {
        for (const body of [
            { username: '<script>', password: 'ein-laengeres-Testpasswort' },
            { username: 'G', password: 'ein-laengeres-Testpasswort' },
            { username: 'Guter Name', password: 'kurz' },
            { username: 'Guter Name', password: 12345 },
            { username: 'X'.repeat(41), password: 'ein-laengeres-Testpasswort' }
        ]) assert.equal((await app.request('/api/register', 'POST', body)).status, 400);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM users')).count, 0);
        const signed = await app.request('/api/register', 'POST', {
            username: 'Gast', password: 'ein-laengeres-Testpasswort', is_admin: true
        });
        assert.equal(signed.data.is_admin, false);
        assert.equal((await app.request('/api/register', 'POST', { username: 'gast', password: 'ein-laengeres-Testpasswort' })).status, 409);
        assert.equal((await app.request('/api/login', 'POST', { username: "Gast' OR 1=1 --", password: 'ein-laengeres-Testpasswort' })).status, 401);
        assert.equal((await app.request('/api/login', 'POST', { username: 'Gast', password: 'falsches-Testpasswort' })).status, 401);
        assert.equal((await app.db.get('SELECT is_admin FROM users WHERE username = ?', ['Gast'])).is_admin, 0);
    } finally { await app.close(); }
});

test('gleichzeitige Registrierungen dürfen keine Namen erzeugen, die sich nur in Groß-/Kleinschreibung unterscheiden', async () => {
    const app = await instance();
    try {
        const results = await Promise.all(['Alpha', 'alpha'].map(username =>
            app.request('/api/register', 'POST', { username, password: 'ein-lang-genuges-Testpasswort' })));
        assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM users')).count, 1);
    } finally { await app.close(); }
});

test('Sitzungen: Cookie-Attribute, gehashte Speicherung, Manipulation, Ablauf und Logout', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let app;
    try {
        app = await instance();
        const direct = await fetch(`${app.base}/api/session`);
        assert.equal(direct.status, 426);
        assert.equal((await direct.json()).error, 'HTTPS erforderlich.');
        assert.equal((await fetch(app.base)).status, 426);
        assert.equal((await fetch(`${app.base}/api/session`, { headers: { 'X-Forwarded-Proto': 'http' } })).status, 426);
        const signed = await app.request('/api/register', 'POST', { username: 'Mara', password: 'ein-lang-genuges-Testpasswort' });
        assert.match(signed.setCookie, /HttpOnly; SameSite=Lax; Path=\/; Max-Age=604800; Secure/);
        assert.equal(signed.cacheControl, 'no-store');
        const token = signed.cookie.slice(4);
        const row = await app.db.get('SELECT token_hash FROM sessions');
        assert.equal(row.token_hash, tokenHash(token));
        assert.notEqual(row.token_hash, token);
        assert.equal((await app.request('/api/session', 'GET', null, signed.cookie)).data.username, 'Mara');
        assert.equal((await app.request('/api/session', 'GET', null, `sid=${'0'.repeat(64)}`)).data.username, null);
        assert.equal((await app.request('/api/attendees', 'GET', null, `sid=${'0'.repeat(64)}`)).status, 401);
        await app.db.run('UPDATE sessions SET expires_at = ?', [Date.now() - 1]);
        assert.equal((await app.request('/api/session', 'GET', null, signed.cookie)).data.username, null);
        const again = await app.request('/api/login', 'POST', { username: 'Mara', password: 'ein-lang-genuges-Testpasswort' });
        const loggedOut = await app.request('/api/logout', 'POST', null, again.cookie);
        assert.match(loggedOut.setCookie, /Max-Age=0/);
        assert.equal((await app.request('/api/session', 'GET', null, again.cookie)).data.username, null);
    } finally {
        if (app) await app.close();
        if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original;
    }
});

test('fremde und fehlerhafte Origins werden bei schreibenden Anfragen verworfen', async () => {
    const app = await instance();
    try {
        const signed = await app.request('/api/register', 'POST', { username: 'Lio', password: 'ein-lang-genuges-Testpasswort' });
        const body = { kommt: 'Ja', huette: 'Nein', bettgarnitur: 'Nein' };
        for (const origin of ['https://angreifer.example', 'null', 'kein-url', app.base + '0']) {
            assert.equal((await app.request('/api/rsvp', 'POST', body, signed.cookie, origin)).status, 403);
        }
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM rsvps')).count, 0);
        assert.equal((await app.request('/api/rsvp', 'POST', body, signed.cookie, app.base)).status, 200);
        assert.equal((await app.request('/api/rsvp', 'DELETE', null, signed.cookie, 'https://angreifer.example')).status, 403);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM rsvps')).count, 1);
    } finally { await app.close(); }
});

test('Admin-API prüft Rolle und Eingaben; fremde RSVP-Änderungen bleiben unmöglich', async () => {
    process.env.ADMIN_USERNAME = 'Admin';
    process.env.ADMIN_PASSWORD = 'ein-lang-genuges-Testpasswort';
    let app;
    try { app = await instance(); }
    finally { delete process.env.ADMIN_USERNAME; delete process.env.ADMIN_PASSWORD; }
    try {
        const admin = await app.request('/api/login', 'POST', { username: 'Admin', password: 'ein-lang-genuges-Testpasswort' });
        const guest = await app.request('/api/register', 'POST', { username: 'Gaby', password: 'ein-lang-genuges-Testpasswort' });
        const fields = { date: 'Samstag', location_name: 'Hütte', location_address: 'Ort', maps_url: 'https://maps.google.com/', max_cabin_capacity: 1, max_bettgarnitur: 1, rules: 'Regeln', info: 'Info' };
        assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...fields, username: 'Admin', is_admin: true }, guest.cookie)).status, 403);
        for (const value of ['javascript:alert(1)', 'https://google.com.evil.example/maps', 'http://maps.google.com/', 'https://maps.google.com@evil.example/']) {
            assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...fields, maps_url: value }, admin.cookie)).status, 400);
        }
        assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...fields, rules: 'x'.repeat(4001) }, admin.cookie)).status, 400);
        assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...fields, max_cabin_capacity: 1.5 }, admin.cookie)).status, 400);
        assert.equal((await app.request('/api/party-info', 'GET', null, admin.cookie)).data.location_name, '');
        assert.equal((await app.request('/api/admin/party-info', 'PUT', fields, admin.cookie)).status, 200);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Vielleicht', huette: 'Ja', bettgarnitur: 'Ja' }, guest.cookie)).status, 400);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Nein', bettgarnitur: 'Ja' }, guest.cookie)).status, 400);
        const saved = await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', bettgarnitur: 'Ja', username: 'Admin' }, guest.cookie);
        assert.equal(saved.status, 200);
        assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...fields, max_bettgarnitur: 0 }, admin.cookie)).status, 409);
        assert.equal((await app.request('/api/rsvp', 'DELETE', { username: 'Admin' }, admin.cookie)).status, 200);
        assert.equal((await app.db.get('SELECT username FROM rsvps')).username, 'Gaby');
    } finally { await app.close(); }
});

test('bei gleichzeitigem RSVP gewinnt höchstens ein Benutzer den letzten freien Platz', async () => {
    process.env.ADMIN_USERNAME = 'Admin';
    process.env.ADMIN_PASSWORD = 'ein-lang-genuges-Testpasswort';
    let app;
    try { app = await instance(); }
    finally { delete process.env.ADMIN_USERNAME; delete process.env.ADMIN_PASSWORD; }
    try {
        const admin = await app.request('/api/login', 'POST', { username: 'Admin', password: 'ein-lang-genuges-Testpasswort' });
        const config = { date: '', location_name: '', location_address: '', maps_url: '', max_cabin_capacity: 1, max_bettgarnitur: 1, rules: '', info: '' };
        assert.equal((await app.request('/api/admin/party-info', 'PUT', config, admin.cookie)).status, 200);
        const a = await app.request('/api/register', 'POST', { username: 'Erster', password: 'ein-lang-genuges-Testpasswort' });
        const b = await app.request('/api/register', 'POST', { username: 'Zweiter', password: 'ein-lang-genuges-Testpasswort' });
        const body = { kommt: 'Ja', huette: 'Ja', bettgarnitur: 'Ja' };
        const results = await Promise.all([a.cookie, b.cookie].map(cookie => app.request('/api/rsvp', 'POST', body, cookie)));
        assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
        assert.equal((await app.db.get("SELECT COUNT(*) AS count FROM rsvps WHERE huette = 'Ja' AND kommt = 'Ja'")).count, 1);
    } finally { await app.close(); }
});

test('Anmeldung wird nach zu vielen Versuchen begrenzt', async () => {
    const app = await instance();
    try {
        for (let count = 0; count < 30; count++) {
            assert.equal((await app.request('/api/login', 'POST', { username: 'niemand', password: 'falsch' })).status, 401);
        }
        assert.equal((await app.request('/api/login', 'POST', { username: 'niemand', password: 'falsch' })).status, 429);
        assert.equal((await app.request('/api/register', 'POST', { username: 'Gast', password: 'ein-lang-genuges-Testpasswort' })).status, 429);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM users')).count, 0);
    } finally { await app.close(); }
});

test('beschädigtes und zu großes JSON wird ohne Datenübernahme zurückgewiesen', async () => {
    const app = await instance();
    try {
        const invalid = await fetch(`${app.base}/api/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"username":'
        });
        assert.equal(invalid.status, 400);
        assert.equal((await invalid.json()).error, 'Ungültiges JSON.');
        const oversized = await fetch(`${app.base}/api/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'Test', password: 'P'.repeat(17000) })
        });
        assert.equal(oversized.status, 413);
        const answer = await oversized.json();
        assert.equal(answer.error, 'Anfrage zu groß.');
        assert.equal(JSON.stringify(answer).includes('PPPP'), false);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM users')).count, 0);
    } finally { await app.close(); }
});

test('unvollständige Alt-Passwörter werden nicht als berechenbare neue Passwörter importiert', async () => {
    const legacy = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-invalid-legacy-'));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-invalid-target-'));
    try {
        await createLegacy(path.join(legacy, 'accounts.sqlite'), `CREATE TABLE users (username TEXT, password TEXT, is_admin INTEGER);
            INSERT INTO users VALUES ('A', 'ein-altes-Testpasswort', 0);
            INSERT INTO users VALUES ('B', NULL, 1);`);
        await assert.rejects(createApp({ dataDir: path.join(root, 'data'), legacyDir: legacy }), /Passwort|password/i);
        const file = path.join(root, 'data', 'app.sqlite');
        const target = new sqlite3.Database(file, sqlite3.OPEN_READONLY);
        try {
            const row = await new Promise((resolve, reject) => target.get('SELECT COUNT(*) AS count FROM users', (error, result) => error ? reject(error) : resolve(result)));
            assert.equal(row.count, 0);
        } finally { await new Promise(resolve => target.close(resolve)); }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(legacy, { recursive: true, force: true });
    }
});

test('Admin setzt und entfernt einen Karten-Pin; der Google-Link wird aus Koordinaten erzeugt', async () => {
    process.env.ADMIN_USERNAME = 'Kartenadmin';
    process.env.ADMIN_PASSWORD = 'ein-lang-genuges-Testpasswort';
    let app;
    try { app = await instance(); }
    finally { delete process.env.ADMIN_USERNAME; delete process.env.ADMIN_PASSWORD; }
    try {
        const admin = await app.request('/api/login', 'POST', { username: 'Kartenadmin', password: 'ein-lang-genuges-Testpasswort' });
        const guest = await app.request('/api/register', 'POST', { username: 'Gast', password: 'ein-lang-genuges-Testpasswort' });
        const fields = { date: 'Heute', location_name: 'Treffpunkt', location_address: 'Berlin', maps_url: 'https://maps.google.com/',
            max_cabin_capacity: 15, max_bettgarnitur: 10, rules: '', info: '' };
        const legacyLink = await app.request('/api/admin/party-info', 'PUT', fields, admin.cookie);
        assert.equal(legacyLink.data.maps_url, fields.maps_url);
        assert.equal(legacyLink.data.latitude, null);
        assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...fields, latitude: 52.52, longitude: 13.405 }, guest.cookie)).status, 403);
        for (const coords of [{ latitude: 91, longitude: 13 }, { latitude: 52, longitude: -181 },
            { latitude: 52, longitude: null }, { latitude: '52', longitude: 13 }]) {
            assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...fields, ...coords }, admin.cookie)).status, 400);
        }
        const pinned = await app.request('/api/admin/party-info', 'PUT', {
            ...fields, maps_url: '', latitude: 52.520008, longitude: 13.404954
        }, admin.cookie);
        assert.equal(pinned.status, 200);
        assert.equal(pinned.data.latitude, 52.520008);
        assert.equal(pinned.data.longitude, 13.404954);
        assert.equal(pinned.data.maps_url, 'https://www.google.com/maps?q=52.520008,13.404954');
        const visible = (await app.request('/api/party-info', 'GET', null, guest.cookie)).data;
        assert.equal(visible.maps_url, pinned.data.maps_url);
        assert.equal(visible.latitude, 52.520008);
        assert.equal((await app.db.get('SELECT longitude FROM party_info WHERE id = 1')).longitude, 13.404954);

        const removed = await app.request('/api/admin/party-info', 'PUT', {
            ...fields, maps_url: '', latitude: null, longitude: null
        }, admin.cookie);
        assert.equal(removed.status, 200);
        assert.equal(removed.data.latitude, null);
        assert.equal(removed.data.longitude, null);
        assert.equal(removed.data.maps_url, '');
    } finally { await app.close(); }
});

test('bestehende Datenbank erhält Koordinatenspalten ohne Verlust der Ortsdaten', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-schema-'));
    const dataDir = path.join(root, 'data');
    fs.mkdirSync(dataDir);
    try {
        await createLegacy(path.join(dataDir, 'app.sqlite'), `CREATE TABLE party_info (
            id INTEGER PRIMARY KEY, date TEXT NOT NULL, location_name TEXT NOT NULL, location_address TEXT NOT NULL,
            maps_url TEXT NOT NULL, max_cabin_capacity INTEGER NOT NULL, max_bettgarnitur INTEGER NOT NULL,
            rules TEXT NOT NULL, info TEXT NOT NULL);
            INSERT INTO party_info VALUES (1, 'Alttermin', 'Alte Hütte', 'Alte Adresse', 'https://maps.google.com/', 15, 10, 'Regel', 'Info');`);
        const { db } = await createApp({ dataDir, legacyDir: root });
        try {
            const party = await db.get('SELECT * FROM party_info WHERE id = 1');
            assert.equal(party.location_address, 'Alte Adresse');
            assert.equal(party.maps_url, 'https://maps.google.com/');
            assert.equal(party.latitude, null);
            assert.equal(party.longitude, null);
            const columns = await db.all('PRAGMA table_info(party_info)');
            assert.equal(columns.filter(row => ['latitude', 'longitude'].includes(row.name)).length, 2);
        } finally { await db.close(); }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
