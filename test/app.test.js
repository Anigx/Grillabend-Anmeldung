const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createApp } = require('../server');
const { tokenHash } = require('../src/security');
const { scryptSync } = require('node:crypto');

async function instance(legacyDir, options = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-test-'));
    const { app, db } = await createApp({ dataDir: path.join(root, 'data'), legacyDir: legacyDir || root, ...options });
    const server = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(route, method = 'GET', body, cookie, origin) {
        const headers = {};
        if (body) headers['Content-Type'] = 'application/json';
        if (cookie) headers.Cookie = cookie;
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && origin !== '') {
            headers.Origin = origin ?? `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${new URL(base).host}`;
        }
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
        for (const asset of ['/css/style.css', '/css/modal.css', '/css/admin.css', '/js/app.js', '/js/admin.js', '/js/admin-exports.js',
            '/vendor/leaflet/leaflet.css', '/vendor/leaflet/leaflet.js', '/vendor/exceljs/exceljs.min.js',
            '/vendor/pdfmake/pdfmake.min.js', '/vendor/jszip/jszip.min.js']) {
            const response = await fetch(`${app.base}${asset}`);
            assert.equal(response.status, 200, asset);
            assert.ok((await response.arrayBuffer()).byteLength > 0, asset);
        }
        assert.equal((await fetch(`${app.base}/vendor/exceljs/package.json`)).status, 404);
        const created = await app.request('/api/register', 'POST', { username: 'Testperson', password: 'ein-lang-genuges-Testpasswort1' });
        assert.equal(created.status, 200);
        assert.equal(created.data.is_admin, false);
        assert.equal(created.data.show_name, true);
        assert.match(created.cookie, /^sid=[a-f0-9]{64}$/);
        const stored = await app.db.get('SELECT password_hash FROM users WHERE username = ?', ['Testperson']);
        assert.match(stored.password_hash, /^scrypt:/);
        assert.equal((await app.db.get('SELECT show_name FROM users WHERE username = ?', ['Testperson'])).show_name, 1);
        assert.equal((await app.request('/api/admin/party-info', 'PUT', {}, created.cookie)).status, 403);
        assert.equal((await app.request('/api/admin/party-info', 'GET', null, created.cookie)).status, 403);
        assert.equal((await fetch(`${app.base}/admin`, { headers: { Cookie: created.cookie } })).status, 403);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', luftmatratze: 'Nein', bettzeug: 'Nein', username: 'Admin' })).status, 401);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Nein', luftmatratze: 'Nein', bettzeug: 'Nein' }, created.cookie, 'https://attacker.example')).status, 403);
        const saved = await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', luftmatratze: 'Nein', bettzeug: 'Nein', username: 'Admin' }, created.cookie);
        assert.equal(saved.status, 200);
        assert.deepEqual((await app.request('/api/attendees', 'GET', null, created.cookie)).data[0], {
            username: 'Testperson', kommt: 'Ja', huette: 'Ja', luftmatratze: 'Nein', bettzeug: 'Nein', is_self: 1
        });
        assert.equal((await app.request('/api/logout', 'POST', null, created.cookie)).status, 200);
        assert.equal((await app.request('/api/attendees', 'GET', null, created.cookie)).status, 401);
    } finally { await app.close(); }
});

test('Namensanzeige ist freiwillig, Änderungen wirken nur für das eigene Konto und Antworten bleiben bestehen', async () => {
    process.env.ADMIN_USERNAME = 'Organisator';
    process.env.ADMIN_PASSWORD = 'ein-sicheres-Beispielpasswort';
    let app;
    try { app = await instance(); }
    finally { delete process.env.ADMIN_USERNAME; delete process.env.ADMIN_PASSWORD; }
    try {
        const admin = await app.request('/api/login', 'POST', { username: 'Organisator', password: 'ein-sicheres-Beispielpasswort' });
        const alice = await app.request('/api/register', 'POST', { username: 'Alice', password: 'ein-lang-genuges-Testpasswort1' });
        const bob = await app.request('/api/register', 'POST', { username: 'Bob', password: 'ein-lang-genuges-Testpasswort1' });
        assert.equal((await app.request('/api/session', 'GET', null, alice.cookie)).data.show_name, true);
        const answer = { kommt: 'Ja', huette: 'Nein', luftmatratze: 'Nein', bettzeug: 'Nein' };
        assert.equal((await app.request('/api/rsvp', 'POST', answer, alice.cookie)).status, 200);
        assert.equal((await app.request('/api/rsvp', 'POST', answer, bob.cookie)).status, 200);
        const initial = await app.request('/api/attendees', 'GET', null, bob.cookie);
        assert.equal(initial.cacheControl, 'no-store');
        assert.deepEqual(initial.data.map(row => row.username), ['Bob', 'Alice']);
        assert.deepEqual(initial.data.map(row => row.is_self), [1, 0]);
        assert.ok(initial.data.every(row => !Object.hasOwn(row, 'updated_at')));
        assert.deepEqual((await app.request('/api/attendees', 'GET', null, alice.cookie)).data.map(row => row.is_self), [0, 1]);

        assert.equal((await app.request('/api/profile/visibility', 'PUT', { show_name: true })).status, 401);
        assert.equal((await app.request('/api/profile/visibility', 'PUT', { show_name: true }, alice.cookie, 'https://fremd.example')).status, 403);
        for (const body of [{}, { show_name: 1 }, { show_name: 'true' }]) {
            assert.equal((await app.request('/api/profile/visibility', 'PUT', body, alice.cookie)).status, 400);
        }
        assert.deepEqual((await app.request('/api/profile/visibility', 'PUT', { show_name: false }, alice.cookie)).data, { show_name: false });
        assert.equal((await app.request('/api/session', 'GET', null, alice.cookie)).data.show_name, false);
        assert.deepEqual((await app.request('/api/attendees', 'GET', null, bob.cookie)).data.map(row => row.username), ['Bob', 'Anonym']);
        assert.deepEqual((await app.request('/api/profile/visibility', 'PUT', { show_name: false }, bob.cookie)).data, { show_name: false });
        assert.deepEqual((await app.request('/api/attendees', 'GET', null, bob.cookie)).data.map(row => row.username), ['Anonym', 'Anonym']);
        const changed = await app.request('/api/profile/visibility', 'PUT', { show_name: true, user_id: 999 }, alice.cookie);
        assert.deepEqual(changed.data, { show_name: true });
        assert.equal((await app.request('/api/session', 'GET', null, alice.cookie)).data.show_name, true);
        assert.equal((await app.request('/api/login', 'POST', { username: 'Alice', password: 'ein-lang-genuges-Testpasswort1' })).data.show_name, true);
        assert.equal((await app.db.get('SELECT show_name FROM users WHERE username = ?', ['Alice'])).show_name, 1);
        assert.equal((await app.db.get('SELECT show_name FROM users WHERE username = ?', ['Bob'])).show_name, 0);
        assert.deepEqual((await app.request('/api/attendees', 'GET', null, bob.cookie)).data.map(row => row.username), ['Anonym', 'Alice']);
        assert.equal((await app.request('/api/admin/users', 'GET', null, admin.cookie)).data.some(row => row.username === 'Bob'), true);

        assert.deepEqual((await app.request('/api/profile/visibility', 'PUT', { show_name: false }, alice.cookie)).data, { show_name: false });
        assert.deepEqual((await app.request('/api/attendees', 'GET', null, bob.cookie)).data.map(row => row.username), ['Anonym', 'Anonym']);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM rsvps')).count, 2);
    } finally { await app.close(); }
});

test('Benutzername lässt sich nur nach Passwortprüfung eindeutig ändern; eigene Antwort und Sitzungen bleiben erhalten', async () => {
    const app = await instance();
    try {
        const alice = await app.request('/api/register', 'POST', { username: 'Alice', password: 'Gutes-Passwort123!' });
        const bob = await app.request('/api/register', 'POST', { username: 'Bob', password: 'Anderes-Passwort123!' });
        const answer = { kommt: 'Ja', huette: 'Ja', luftmatratze: 'Nein', bettzeug: 'Nein' };
        assert.equal((await app.request('/api/rsvp', 'POST', answer, alice.cookie)).status, 200);
        const original = await app.db.get('SELECT user_id, updated_at FROM rsvps');
        const route = '/api/profile/username';
        assert.equal((await app.request(route, 'PUT', { username: 'Neuer Name', current_password: 'Gutes-Passwort123!' })).status, 401);
        assert.equal((await app.request(route, 'PUT', { username: 'Neuer Name', current_password: 'Gutes-Passwort123!' }, alice.cookie, 'https://fremd.example')).status, 403);
        assert.equal((await app.request(route, 'PUT', { username: '<script>', current_password: 'Gutes-Passwort123!' }, alice.cookie)).status, 400);
        assert.equal((await app.request(route, 'PUT', { username: 'Neuer Name', current_password: 'falsch' }, alice.cookie)).status, 422);
        assert.equal((await app.request(route, 'PUT', { username: 'bOb', current_password: 'Gutes-Passwort123!' }, alice.cookie)).status, 409);
        const renamed = await app.request(route, 'PUT', { username: 'Neuer Name', current_password: 'Gutes-Passwort123!', user_id: 999 }, alice.cookie);
        assert.deepEqual(renamed.data, { username: 'Neuer Name' });
        assert.equal((await app.request('/api/session', 'GET', null, alice.cookie)).data.username, 'Neuer Name');
        assert.deepEqual(await app.db.get('SELECT user_id, updated_at FROM rsvps'), original);
        assert.equal((await app.request('/api/login', 'POST', { username: 'Alice', password: 'Gutes-Passwort123!' })).status, 401);
        assert.equal((await app.request('/api/login', 'POST', { username: 'Neuer Name', password: 'Gutes-Passwort123!' })).status, 200);
        assert.equal((await app.request('/api/rsvp', 'POST', { ...answer, luftmatratze: 'Ja', bettzeug: 'Ja' }, alice.cookie)).status, 200);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM rsvps')).count, 1);
        assert.equal((await app.request('/api/session', 'GET', null, bob.cookie)).data.username, 'Bob');
    } finally { await app.close(); }
});

test('Passwortwechsel verlangt altes Passwort, rotiert die Sitzung und widerruft weitere Sitzungen', async () => {
    const app = await instance();
    try {
        const first = await app.request('/api/register', 'POST', { username: 'Alice', password: 'Gutes-Passwort123!' });
        const second = await app.request('/api/login', 'POST', { username: 'Alice', password: 'Gutes-Passwort123!' });
        const other = await app.request('/api/register', 'POST', { username: 'Bob', password: 'Anderes-Passwort123!' });
        const route = '/api/profile/password';
        const newPassword = 'Neues-GeheimesPasswort123!';
        const body = { current_password: 'Gutes-Passwort123!', new_password: newPassword };
        assert.equal((await app.request(route, 'PUT', body)).status, 401);
        assert.equal((await app.request(route, 'PUT', body, first.cookie, 'https://fremd.example')).status, 403);
        assert.equal((await app.request(route, 'PUT', { current_password: 'falsch', new_password: newPassword }, first.cookie)).status, 422);
        for (const invalid of ['kurz', 'Gutes-Passwort123!']) {
            assert.equal((await app.request(route, 'PUT', { current_password: 'Gutes-Passwort123!', new_password: invalid }, first.cookie)).status, 400);
        }
        const changed = await app.request(route, 'PUT', body, first.cookie);
        assert.deepEqual(changed.data, { success: true });
        assert.match(changed.setCookie, /HttpOnly; SameSite=Lax/);
        assert.notEqual(changed.cookie, first.cookie);
        assert.equal((await app.request('/api/session', 'GET', null, first.cookie)).data.username, null);
        assert.equal((await app.request('/api/session', 'GET', null, second.cookie)).data.username, null);
        assert.equal((await app.request('/api/session', 'GET', null, changed.cookie)).data.username, 'Alice');
        assert.equal((await app.request('/api/session', 'GET', null, other.cookie)).data.username, 'Bob');
        assert.equal((await app.request('/api/login', 'POST', { username: 'Alice', password: 'Gutes-Passwort123!' })).status, 401);
        assert.equal((await app.request('/api/login', 'POST', { username: 'Alice', password: newPassword })).status, 200);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)', ['Alice'])).count, 2);
    } finally { await app.close(); }
});

test('parallel begonnene Anmeldung mit altem Passwort behält nach einem Passwortwechsel keine Sitzung', async () => {
    const app = await instance();
    try {
        const alice = await app.request('/api/register', 'POST', { username: 'Alice', password: 'Gutes-Passwort123!' });
        const [changed, login] = await Promise.all([
            app.request('/api/profile/password', 'PUT', { current_password: 'Gutes-Passwort123!', new_password: 'Neues-GeheimesPasswort123!' }, alice.cookie),
            app.request('/api/login', 'POST', { username: 'Alice', password: 'Gutes-Passwort123!' })
        ]);
        assert.equal(changed.status, 200);
        assert.ok([200, 401].includes(login.status));
        if (login.cookie) assert.equal((await app.request('/api/session', 'GET', null, login.cookie)).data.username, null);
        assert.equal((await app.request('/api/session', 'GET', null, changed.cookie)).data.username, 'Alice');
    } finally { await app.close(); }
});

test('startkonfiguriertes Admin-Konto kann Namen und Passwort nur über die Serverkonfiguration wechseln', async () => {
    process.env.ADMIN_USERNAME = 'Organisator';
    process.env.ADMIN_PASSWORD = 'ein-sicheres-Beispielpasswort';
    let app;
    try { app = await instance(); }
    finally { delete process.env.ADMIN_USERNAME; delete process.env.ADMIN_PASSWORD; }
    try {
        const admin = await app.request('/api/login', 'POST', { username: 'Organisator', password: 'ein-sicheres-Beispielpasswort' });
        assert.equal(admin.data.account_managed, true);
        assert.equal((await app.request('/api/profile/username', 'PUT', { username: 'Anderer Admin', current_password: 'ein-sicheres-Beispielpasswort' }, admin.cookie)).status, 409);
        assert.equal((await app.request('/api/profile/password', 'PUT', { current_password: 'ein-sicheres-Beispielpasswort', new_password: 'Anderes-GutesPasswort123!' }, admin.cookie)).status, 409);
        assert.equal((await app.request('/api/session', 'GET', null, admin.cookie)).data.username, 'Organisator');
        assert.equal((await app.request('/api/login', 'POST', { username: 'Organisator', password: 'ein-sicheres-Beispielpasswort' })).status, 200);
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
            max_cabin_capacity: 1, max_luftmatratze: 1, max_bettzeug: 1, rules: 'Seid freundlich.', info: 'Essen mitbringen.'
        };
        const adminPage = await fetch(`${app.base}/admin`, { headers: { Cookie: admin.cookie } });
        assert.equal(adminPage.status, 200);
        const adminHtml = await adminPage.text();
        assert.match(adminHtml, /id="adminForm"/);
        assert.match(adminHtml, /src="\/js\/admin.js"/);
        assert.match(adminHtml, /id="pinMap"/);
        assert.match(adminHtml, /src="\/vendor\/leaflet\/leaflet.js"/);
        assert.deepEqual((await app.request('/api/admin/party-info', 'GET', null, admin.cookie)).data.occupancy, { cabin: 0, luftmatratze: 0, bettzeug: 0 });
        assert.equal((await app.request('/api/admin/party-info', 'PUT', party, admin.cookie, 'https://angreifer.example')).status, 403);
        assert.equal((await app.request('/api/admin/party-info', 'PUT', party, admin.cookie)).status, 200);
        const guest = await app.request('/api/register', 'POST', { username: 'Gast 1', password: 'langes-Beispielpasswort-1' });
        assert.equal((await app.request('/api/admin/party-info', 'PUT', party, guest.cookie)).status, 403);
        const publicInfo = (await app.request('/api/party-info', 'GET', null, guest.cookie)).data;
        assert.equal(publicInfo.rules, party.rules);
        assert.equal(Object.hasOwn(publicInfo, 'occupancy'), false);
        assert.equal((await app.request('/api/party-info', 'POST', party, admin.cookie)).status, 404);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', luftmatratze: 'Ja', bettzeug: 'Ja' }, guest.cookie)).status, 200);
        assert.deepEqual((await app.request('/api/admin/party-info', 'GET', null, admin.cookie)).data.occupancy, { cabin: 1, luftmatratze: 1, bettzeug: 1 });
        const other = await app.request('/api/register', 'POST', { username: 'Gast 2', password: 'langes-Beispielpasswort-2' });
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', luftmatratze: 'Nein', bettzeug: 'Nein' }, other.cookie)).status, 409);
        assert.equal((await app.request('/api/rsvp/Gast%201', 'DELETE', null, other.cookie)).status, 404);
        assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...party, max_cabin_capacity: 0 }, admin.cookie)).status, 400);
        assert.equal((await app.request('/api/rsvp', 'DELETE', null, guest.cookie)).status, 200);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', luftmatratze: 'Nein', bettzeug: 'Nein' }, other.cookie)).status, 200);
        assert.equal((await app.request('/api/logout', 'POST', null, admin.cookie)).status, 200);
        assert.equal((await app.request('/api/admin/party-info', 'GET', null, admin.cookie)).status, 401);
        assert.equal((await fetch(`${app.base}/admin`, { headers: { Cookie: admin.cookie } })).status, 401);
    } finally { await app.close(); }
});

test('Admin-Userübersicht zeigt alle Konten mit Antworten, aber ohne Zugangsdaten', async () => {
    process.env.ADMIN_USERNAME = 'Organisator';
    process.env.ADMIN_PASSWORD = 'ein-sicheres-Beispielpasswort';
    let app;
    try { app = await instance(); }
    finally { delete process.env.ADMIN_USERNAME; delete process.env.ADMIN_PASSWORD; }
    try {
        assert.equal((await app.request('/api/admin/users')).status, 401);
        const admin = await app.request('/api/login', 'POST', { username: 'Organisator', password: 'ein-sicheres-Beispielpasswort' });
        const guest = await app.request('/api/register', 'POST', { username: 'Mara', password: 'ein-lang-genuges-Testpasswort1' });
        const noAnswer = await app.request('/api/register', 'POST', { username: 'Nina', password: 'ein-lang-genuges-Testpasswort1' });
        assert.equal((await app.request('/api/admin/users', 'GET', null, guest.cookie)).status, 403);
        assert.equal((await app.request('/api/admin/users', 'GET', null, noAnswer.cookie)).status, 403);
        const empty = await app.request('/api/admin/users', 'GET', null, admin.cookie);
        assert.equal(empty.cacheControl, 'no-store');
        assert.deepEqual(empty.data.map(user => [user.username, user.kommt]), [
            ['Mara', null], ['Nina', null], ['Organisator', null]
        ]);
        assert.deepEqual(Object.keys(empty.data[0]).sort(), ['bettzeug', 'huette', 'kommt', 'luftmatratze', 'updated_at', 'username'].sort());
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', luftmatratze: 'Ja', bettzeug: 'Ja' }, guest.cookie)).status, 200);
        const answered = (await app.request('/api/admin/users', 'GET', null, admin.cookie)).data;
        assert.equal(answered[0].kommt, 'Ja');
        assert.equal(answered[0].huette, 'Ja');
        assert.equal(answered[0].luftmatratze, 'Ja');
        assert.equal(answered[0].bettzeug, 'Ja');
        assert.ok(answered[0].updated_at);
        assert.equal(answered[1].updated_at, null);
        const page = await fetch(`${app.base}/admin`, { headers: { Cookie: admin.cookie } });
        const html = await page.text();
        assert.match(html, /id="usersTab"/);
        assert.match(html, /id="usersTableBody"/);
        assert.doesNotMatch(html, /id="userRoleFilter"|<th scope="col">Rolle<\/th>/);
        assert.match(html, /src="\/js\/admin-exports.js"/);
        assert.match(html, /data-export="xlsx"/);
        assert.match(html, /data-export="csv"/);
        assert.match(html, /data-export="pdf"/);
        assert.match(html, /data-export="png"/);
        assert.equal((await app.request('/api/logout', 'POST', null, admin.cookie)).status, 200);
        assert.equal((await app.request('/api/admin/users', 'GET', null, admin.cookie)).status, 401);
    } finally { await app.close(); }
});

test('Neuer Grillabend setzt nur Antworten nach erneuter Admin-Passwortprüfung zurück', async () => {
    process.env.ADMIN_USERNAME = 'Organisator';
    process.env.ADMIN_PASSWORD = 'ein-sicheres-Beispielpasswort';
    let app;
    try { app = await instance(); }
    finally { delete process.env.ADMIN_USERNAME; delete process.env.ADMIN_PASSWORD; }
    try {
        const admin = await app.request('/api/login', 'POST', { username: 'Organisator', password: 'ein-sicheres-Beispielpasswort' });
        const guest = await app.request('/api/register', 'POST', { username: 'Mara', password: 'ein-lang-genuges-Testpasswort1' });
        const other = await app.request('/api/register', 'POST', { username: 'Nina', password: 'ein-lang-genuges-Testpasswort2' });
        const party = {
            date: 'Samstag', location_name: 'Hütte', location_address: 'Berlin', maps_url: '',
            max_cabin_capacity: 2, max_luftmatratze: 1, max_bettzeug: 1, rules: 'Regeln', info: 'Informationen'
        };
        assert.equal((await app.request('/api/admin/party-info', 'PUT', party, admin.cookie)).status, 200);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', luftmatratze: 'Ja', bettzeug: 'Ja' }, guest.cookie)).status, 200);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Nein', huette: 'Nein', luftmatratze: 'Nein', bettzeug: 'Nein' }, other.cookie)).status, 200);
        const page = await fetch(`${app.base}/admin`, { headers: { Cookie: admin.cookie } });
        const html = await page.text();
        assert.match(html, /id="resetTab"/);
        assert.match(html, /id="resetDialog"/);
        assert.match(html, /id="resetPassword" name="password" type="password"/);
        const route = '/api/admin/reset-rsvps';
        await app.db.run("INSERT INTO rsvps_legacy_names VALUES ('Archivierter Testname', 'Ja', 'Nein', 'Nein', 'Nein', '2026-01-01')");
        const correct = { password: 'ein-sicheres-Beispielpasswort' };
        assert.equal((await app.request(route, 'POST', correct)).status, 401);
        assert.equal((await app.request(route, 'POST', correct, guest.cookie)).status, 403);
        assert.equal((await app.request(route, 'POST', correct, admin.cookie, 'https://fremd.example')).status, 403);
        assert.equal((await app.request(route, 'POST', {}, admin.cookie)).status, 400);
        assert.equal((await app.request(route, 'POST', { password: 'falsch' }, admin.cookie)).status, 422);
        assert.equal((await app.request('/api/attendees', 'GET', null, guest.cookie)).data.length, 2);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM rsvps_legacy_names')).count, 1);
        const reset = await app.request(route, 'POST', correct, admin.cookie);
        assert.deepEqual(reset.data, { success: true, deleted: 2 });
        assert.equal(reset.cacheControl, 'no-store');
        assert.deepEqual((await app.request('/api/attendees', 'GET', null, guest.cookie)).data, []);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM rsvps_legacy_names')).count, 0);
        const people = (await app.request('/api/admin/users', 'GET', null, admin.cookie)).data;
        assert.deepEqual(people.map(person => person.username), ['Mara', 'Nina', 'Organisator']);
        assert.ok(people.every(person => person.kommt === null && person.huette === null && person.luftmatratze === null && person.bettzeug === null && person.updated_at === null));
        const info = (await app.request('/api/admin/party-info', 'GET', null, admin.cookie)).data;
        assert.equal(info.date, party.date);
        assert.equal(info.rules, party.rules);
        assert.deepEqual(info.occupancy, { cabin: 0, luftmatratze: 0, bettzeug: 0 });
        assert.equal((await app.request('/api/session', 'GET', null, guest.cookie)).data.username, 'Mara');
        assert.equal((await app.request('/api/login', 'POST', { username: 'Nina', password: 'ein-lang-genuges-Testpasswort2' })).status, 200);
        assert.deepEqual((await app.request(route, 'POST', correct, admin.cookie)).data, { success: true, deleted: 0 });
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', luftmatratze: 'Ja', bettzeug: 'Ja' }, guest.cookie)).status, 200);
    } finally { await app.close(); }
});

test('Neustart mit geändertem Admin-Passwort rotiert den Hash und widerruft nur Admin-Sitzungen', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-rotation-'));
    const previousName = process.env.ADMIN_USERNAME;
    const previousPassword = process.env.ADMIN_PASSWORD;
    const dataDir = path.join(dataRoot, 'data');
    const firstPassword = 'synthetisches-Adminpasswort-1';
    const nextPassword = 'synthetisches-Adminpasswort-2';
    let app;
    try {
        process.env.ADMIN_USERNAME = 'Auditadmin';
        process.env.ADMIN_PASSWORD = firstPassword;
        app = await instance(dataRoot, { dataDir });
        const admin = await app.request('/api/login', 'POST', { username: 'Auditadmin', password: firstPassword });
        const member = await app.request('/api/register', 'POST', { username: 'Mitglied', password: 'synthetisches-Mitgliedspasswort1' });
        assert.equal(admin.status, 200);
        assert.equal(member.status, 200);
        await app.close();
        app = null;
        app = await instance(dataRoot, { dataDir });
        assert.equal((await app.request('/api/session', 'GET', null, admin.cookie)).data.username, 'Auditadmin');
        await app.close();
        app = null;

        process.env.ADMIN_PASSWORD = nextPassword;
        app = await instance(dataRoot, { dataDir });
        assert.equal((await app.request('/api/session', 'GET', null, admin.cookie)).data.username, null);
        assert.equal((await app.request('/api/login', 'POST', { username: 'Auditadmin', password: firstPassword })).status, 401);
        const rotated = await app.request('/api/login', 'POST', { username: 'Auditadmin', password: nextPassword });
        assert.equal(rotated.data.is_admin, true);
        assert.equal((await app.request('/api/session', 'GET', null, member.cookie)).data.username, 'Mitglied');
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)', ['Auditadmin'])).count, 1);
    } finally {
        if (app) await app.close();
        if (previousName === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = previousName;
        if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = previousPassword;
        fs.rmSync(dataRoot, { recursive: true, force: true });
    }
});

function createLegacy(filename, sql) {
    const db = new DatabaseSync(filename);
    try { db.exec(sql); }
    finally { db.close(); }
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
            { username: '<script>', password: 'ein-laengeres-Testpasswort1' },
            { username: 'G', password: 'ein-laengeres-Testpasswort1' },
            { username: 'Guter Name', password: 'kurz' },
            { username: 'Guter Name', password: 12345 },
            { username: 'Guter Name', password: 'kleinbuchstaben1!' },
            { username: 'Guter Name', password: 'GROSSBUCHSTABEN1!' },
            { username: 'Guter Name', password: 'OhneZahl!LangesPasswort' },
            { username: 'Guter Name', password: 'OhneSonderzeichen123' },
            { username: 'Guter Name', password: 'Abcdefghij1 ' },
            { username: 'X'.repeat(41), password: 'ein-laengeres-Testpasswort1' }
        ]) assert.equal((await app.request('/api/register', 'POST', body)).status, 400);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM users')).count, 0);
        const signed = await app.request('/api/register', 'POST', {
            username: 'Gast', password: 'Aa123456789!', is_admin: true
        });
        assert.equal(signed.status, 200);
        assert.equal(signed.data.is_admin, false);
        assert.equal((await app.request('/api/register', 'POST', { username: 'gast', password: 'Aa123456789!' })).status, 409);
        assert.equal((await app.request('/api/login', 'POST', { username: "Gast' OR 1=1 --", password: 'Aa123456789!' })).status, 401);
        assert.equal((await app.request('/api/login', 'POST', { username: 'Gast', password: 'falsches-Testpasswort' })).status, 401);
        const longPassword = 'Aa1!' + 'x'.repeat(253);
        assert.equal((await app.request('/api/register', 'POST', { username: 'Langes Passwort', password: longPassword })).status, 200);
        assert.equal((await app.request('/api/login', 'POST', { username: 'Langes Passwort', password: longPassword })).status, 200);
        assert.equal((await app.db.get('SELECT is_admin FROM users WHERE username = ?', ['Gast'])).is_admin, 0);
    } finally { await app.close(); }
});

test('gleichzeitige Registrierungen dürfen keine Namen erzeugen, die sich nur in Groß-/Kleinschreibung unterscheiden', async () => {
    const app = await instance();
    try {
        const results = await Promise.all(['Alpha', 'alpha'].map(username =>
            app.request('/api/register', 'POST', { username, password: 'ein-lang-genuges-Testpasswort1' })));
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
        const signed = await app.request('/api/register', 'POST', { username: 'Mara', password: 'ein-lang-genuges-Testpasswort1' });
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
        const again = await app.request('/api/login', 'POST', { username: 'Mara', password: 'ein-lang-genuges-Testpasswort1' });
        const loggedOut = await app.request('/api/logout', 'POST', null, again.cookie);
        assert.match(loggedOut.setCookie, /Max-Age=0/);
        assert.equal((await app.request('/api/session', 'GET', null, again.cookie)).data.username, null);
    } finally {
        if (app) await app.close();
        if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original;
    }
});

test('abgelaufene Sessions werden entfernt und bestehende Sessions beim Neustart begrenzt', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-sessions-'));
    const dataDir = path.join(dataRoot, 'data');
    let app;
    try {
        app = await instance(dataRoot, { dataDir });
        const first = await app.request('/api/register', 'POST', { username: 'Gast', password: 'synthetisches-Gastpasswort1' });
        await app.db.run('UPDATE sessions SET expires_at = ?', [Date.now() - 1]);
        assert.equal((await app.request('/api/session', 'GET', null, first.cookie)).data.username, null);
        const next = await app.request('/api/login', 'POST', { username: 'Gast', password: 'synthetisches-Gastpasswort1' });
        assert.equal(next.status, 200);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM sessions')).count, 1);
        await app.db.run('UPDATE sessions SET expires_at = ?', [Date.now() - 1]);
        await app.close();
        app = null;
        app = await instance(dataRoot, { dataDir });
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM sessions')).count, 0);
        const user = await app.db.get('SELECT id FROM users WHERE username = ?', ['Gast']);
        for (let i = 0; i < 11; i++) {
            await app.db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
                i.toString(16).padStart(64, '0'), user.id, Date.now() + 60000
            ]);
        }
        await app.close();
        app = null;
        app = await instance(dataRoot, { dataDir });
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM sessions')).count, 10);
    } finally {
        if (app) await app.close();
        fs.rmSync(dataRoot, { recursive: true, force: true });
    }
});

test('ein Konto behält höchstens zehn aktive Sessions', async () => {
    const app = await instance();
    try {
        const initial = await app.request('/api/register', 'POST', { username: 'Gast', password: 'synthetisches-Gastpasswort1' });
        const other = await app.request('/api/register', 'POST', { username: 'Andere', password: 'synthetisches-Weiterespasswort1' });
        let newest;
        for (let i = 0; i < 10; i++) {
            newest = await app.request('/api/login', 'POST', { username: 'Gast', password: 'synthetisches-Gastpasswort1' });
            assert.equal(newest.status, 200);
        }
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)', ['Gast'])).count, 10);
        assert.equal((await app.request('/api/session', 'GET', null, initial.cookie)).data.username, null);
        assert.equal((await app.request('/api/session', 'GET', null, newest.cookie)).data.username, 'Gast');
        assert.equal((await app.request('/api/session', 'GET', null, other.cookie)).data.username, 'Andere');
    } finally { await app.close(); }
});

test('fremde und fehlerhafte Origins werden bei schreibenden Anfragen verworfen', async () => {
    const app = await instance();
    try {
        const signed = await app.request('/api/register', 'POST', { username: 'Lio', password: 'ein-lang-genuges-Testpasswort1' });
        const body = { kommt: 'Ja', huette: 'Nein', luftmatratze: 'Nein', bettzeug: 'Nein' };
        assert.equal((await app.request('/api/login', 'POST', { username: 'Lio', password: 'ein-lang-genuges-Testpasswort1' }, null, '')).status, 403);
        for (const origin of ['https://angreifer.example', 'null', 'kein-url', app.base + '0',
            app.base.replace('http:', 'https:'), `${app.base}/pfad`, '']) {
            assert.equal((await app.request('/api/rsvp', 'POST', body, signed.cookie, origin)).status, 403);
        }
        const crossSite = await fetch(`${app.base}/api/rsvp`, {
            method: 'POST', headers: { Cookie: signed.cookie, Origin: app.base, 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        assert.equal(crossSite.status, 403);
        const sameSite = await fetch(`${app.base}/api/rsvp`, {
            method: 'POST', headers: { Cookie: signed.cookie, Origin: app.base, 'Sec-Fetch-Site': 'same-site', 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        assert.equal(sameSite.status, 403);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM rsvps')).count, 0);
        assert.equal((await app.request('/api/rsvp', 'POST', body, signed.cookie, app.base)).status, 200);
        assert.equal((await app.request('/api/rsvp', 'DELETE', null, signed.cookie, 'https://angreifer.example')).status, 403);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM rsvps')).count, 1);
    } finally { await app.close(); }
});

test('APP_ORIGIN bindet Schreibanfragen an die konfigurierte HTTPS-/Host-/Port-Kombination', async () => {
    const body = JSON.stringify({ username: 'Lina', password: 'ein-lang-genuges-Testpasswort1' });
    const request = (base, host, origin, forwardedProto) => new Promise((resolve, reject) => {
        const headers = { Host: host, Origin: origin, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
        if (forwardedProto) headers['X-Forwarded-Proto'] = forwardedProto;
        const outgoing = http.request(`${base}/api/register`, { method: 'POST', headers }, response => {
            response.resume(); response.on('end', () => resolve(response.statusCode));
        });
        outgoing.on('error', reject);
        outgoing.end(body);
    });
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = 'http://veranstaltung.example:8080';
    let app;
    try { app = await instance(); }
    finally {
        if (previousOrigin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previousOrigin;
    }
    try {
        assert.equal(await request(app.base, 'veranstaltung.example:8080', app.base), 403);
        assert.equal(await request(app.base, new URL(app.base).host, 'http://veranstaltung.example:8080'), 403);
        assert.equal(await request(app.base, 'veranstaltung.example:8080', 'http://veranstaltung.example'), 403);
        assert.equal(await request(app.base, 'veranstaltung.example:8080', 'https://veranstaltung.example:8080'), 403);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM users')).count, 0);
        assert.equal(await request(app.base, 'veranstaltung.example:8080', 'http://veranstaltung.example:8080'), 200);
    } finally { await app.close(); }
    for (const origin of ['null', 'https://example.test/path', 'https://user@example.test', 'ftp://example.test', 'https://example.test/']) {
        await assert.rejects(createApp({ dataDir: app.root, legacyDir: app.root, origin }), /APP_ORIGIN/);
    }
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let secureApp;
    try {
        await assert.rejects(createApp({ dataDir: app.root, legacyDir: app.root, origin: 'http://example.test' }), /APP_ORIGIN/);
        secureApp = await instance(undefined, { origin: 'https://veranstaltung.example' });
        assert.equal(await request(secureApp.base, 'veranstaltung.example', 'https://veranstaltung.example'), 426);
        assert.equal(await request(secureApp.base, 'veranstaltung.example', 'http://veranstaltung.example', 'https'), 403);
        assert.equal(await request(secureApp.base, 'veranstaltung.example', 'https://veranstaltung.example', 'https'), 200);
    } finally {
        if (secureApp) await secureApp.close();
        if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original;
    }
});

test('Admin-API prüft Rolle und Eingaben; fremde RSVP-Änderungen bleiben unmöglich', async () => {
    process.env.ADMIN_USERNAME = 'Admin';
    process.env.ADMIN_PASSWORD = 'ein-lang-genuges-Testpasswort';
    let app;
    try { app = await instance(); }
    finally { delete process.env.ADMIN_USERNAME; delete process.env.ADMIN_PASSWORD; }
    try {
        const admin = await app.request('/api/login', 'POST', { username: 'Admin', password: 'ein-lang-genuges-Testpasswort' });
        const guest = await app.request('/api/register', 'POST', { username: 'Gaby', password: 'ein-lang-genuges-Testpasswort1' });
        const fields = { date: 'Samstag', location_name: 'Hütte', location_address: 'Ort', maps_url: 'https://maps.google.com/', max_cabin_capacity: 1, max_luftmatratze: 1, max_bettzeug: 1, rules: 'Regeln', info: 'Info' };
        assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...fields, username: 'Admin', is_admin: true }, guest.cookie)).status, 403);
        for (const value of ['javascript:alert(1)', 'https://google.com.evil.example/maps', 'http://maps.google.com/', 'https://maps.google.com@evil.example/']) {
            assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...fields, maps_url: value }, admin.cookie)).status, 400);
        }
        assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...fields, rules: 'x'.repeat(4001) }, admin.cookie)).status, 400);
        assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...fields, max_cabin_capacity: 1.5 }, admin.cookie)).status, 400);
        assert.equal((await app.request('/api/party-info', 'GET', null, admin.cookie)).data.location_name, '');
        assert.equal((await app.request('/api/admin/party-info', 'PUT', fields, admin.cookie)).status, 200);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Vielleicht', huette: 'Ja', luftmatratze: 'Ja', bettzeug: 'Ja' }, guest.cookie)).status, 400);
        assert.equal((await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Nein', luftmatratze: 'Ja', bettzeug: 'Ja' }, guest.cookie)).status, 400);
        const saved = await app.request('/api/rsvp', 'POST', { kommt: 'Ja', huette: 'Ja', luftmatratze: 'Ja', bettzeug: 'Ja', username: 'Admin' }, guest.cookie);
        assert.equal(saved.status, 200);
        assert.equal((await app.request('/api/admin/party-info', 'PUT', { ...fields, max_luftmatratze: 0 }, admin.cookie)).status, 409);
        assert.equal((await app.request('/api/rsvp', 'DELETE', { username: 'Admin' }, admin.cookie)).status, 200);
        assert.equal((await app.db.get('SELECT users.username FROM rsvps JOIN users ON users.id = rsvps.user_id')).username, 'Gaby');
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
        const config = { date: '', location_name: '', location_address: '', maps_url: '', max_cabin_capacity: 1, max_luftmatratze: 1, max_bettzeug: 1, rules: '', info: '' };
        assert.equal((await app.request('/api/admin/party-info', 'PUT', config, admin.cookie)).status, 200);
        const a = await app.request('/api/register', 'POST', { username: 'Erster', password: 'ein-lang-genuges-Testpasswort1' });
        const b = await app.request('/api/register', 'POST', { username: 'Zweiter', password: 'ein-lang-genuges-Testpasswort1' });
        const body = { kommt: 'Ja', huette: 'Ja', luftmatratze: 'Ja', bettzeug: 'Ja' };
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
        assert.equal((await app.request('/api/register', 'POST', { username: 'Gast', password: 'ein-lang-genuges-Testpasswort1' })).status, 429);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM users')).count, 0);
    } finally { await app.close(); }
});

test('beschädigtes und zu großes JSON wird ohne Datenübernahme zurückgewiesen', async () => {
    const app = await instance();
    try {
        const invalid = await fetch(`${app.base}/api/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: app.base }, body: '{"username":'
        });
        assert.equal(invalid.status, 400);
        assert.equal((await invalid.json()).error, 'Ungültiges JSON.');
        const oversized = await fetch(`${app.base}/api/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: app.base },
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
        const target = new DatabaseSync(file, { readOnly: true });
        try {
            const row = target.prepare('SELECT COUNT(*) AS count FROM users').get();
            assert.equal(row.count, 0);
        } finally { target.close(); }
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
        const guest = await app.request('/api/register', 'POST', { username: 'Gast', password: 'ein-lang-genuges-Testpasswort1' });
        const fields = { date: 'Heute', location_name: 'Treffpunkt', location_address: 'Berlin', maps_url: 'https://maps.google.com/',
            max_cabin_capacity: 15, max_luftmatratze: 10, max_bettzeug: 10, rules: '', info: '' };
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
        await createLegacy(path.join(dataDir, 'app.sqlite'), `CREATE TABLE users (
            id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0);
            INSERT INTO users (username, password_hash) VALUES ('Bestandskonto', 'synthetischer-Althash');
            CREATE TABLE party_info (
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
            const existing = await db.get('SELECT username, show_name FROM users WHERE username = ?', ['Bestandskonto']);
            assert.deepEqual(existing, { username: 'Bestandskonto', show_name: 1 });
            const columns = await db.all('PRAGMA table_info(party_info)');
            assert.equal(columns.filter(row => ['latitude', 'longitude'].includes(row.name)).length, 2);
        } finally { await db.close(); }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('bestehende Bettgarnitur-Spalte wird beim Start auf Luftmatratze und Bettzeug aufgeteilt', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-bedding-'));
    const dataDir = path.join(root, 'data');
    fs.mkdirSync(dataDir);
    try {
        await createLegacy(path.join(dataDir, 'app.sqlite'), `
            CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, show_name INTEGER NOT NULL DEFAULT 1);
            INSERT INTO users VALUES (1, 'Bestand', 'synthetischer-Althash', 0, 1);
            CREATE TABLE rsvps (user_id INTEGER PRIMARY KEY, kommt TEXT NOT NULL, huette TEXT NOT NULL, bettgarnitur TEXT NOT NULL DEFAULT 'Nein', updated_at TEXT NOT NULL);
            INSERT INTO rsvps VALUES (1, 'Ja', 'Ja', 'Ja', '2026-01-01');
            CREATE TABLE party_info (id INTEGER PRIMARY KEY, date TEXT NOT NULL, location_name TEXT NOT NULL, location_address TEXT NOT NULL, maps_url TEXT NOT NULL, max_cabin_capacity INTEGER NOT NULL, max_bettgarnitur INTEGER NOT NULL, rules TEXT NOT NULL, info TEXT NOT NULL);
            INSERT INTO party_info VALUES (1, 'Termin', 'Ort', 'Adresse', '', 15, 4, '', '');`);
        const { db } = await createApp({ dataDir, legacyDir: root });
        try {
            assert.deepEqual(await db.get('SELECT luftmatratze, bettzeug FROM rsvps WHERE user_id = 1'), { luftmatratze: 'Ja', bettzeug: 'Ja' });
            const rsvpColumns = await db.all('PRAGMA table_info(rsvps)');
            assert.equal(rsvpColumns.some(column => column.name === 'bettgarnitur'), false);
            assert.equal(rsvpColumns.filter(column => ['luftmatratze', 'bettzeug'].includes(column.name)).length, 2);
            assert.deepEqual(await db.get('SELECT max_luftmatratze, max_bettzeug FROM party_info WHERE id = 1'), { max_luftmatratze: 4, max_bettzeug: 4 });
            const partyColumns = await db.all('PRAGMA table_info(party_info)');
            assert.equal(partyColumns.some(column => column.name === 'max_bettgarnitur'), false);
        } finally { await db.close(); }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('einmalige Namensmigration aktiviert bestehende Konten und überschreibt späteres Ausschalten nicht', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-sichtbarkeit-'));
    const dataDir = path.join(root, 'data');
    fs.mkdirSync(dataDir);
    try {
        await createLegacy(path.join(dataDir, 'app.sqlite'), `CREATE TABLE users (
            id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0, show_name INTEGER NOT NULL DEFAULT 0);
            INSERT INTO users (username, password_hash, show_name) VALUES ('Bestandskonto', 'synthetischer-Althash', 0);`);
        const first = await createApp({ dataDir, legacyDir: root });
        try {
            assert.equal((await first.db.get('SELECT show_name FROM users WHERE username = ?', ['Bestandskonto'])).show_name, 1);
            assert.ok(await first.db.get('SELECT value FROM metadata WHERE key = ?', ['names_visible_once']));
            await first.db.run('UPDATE users SET show_name = 0 WHERE username = ?', ['Bestandskonto']);
        } finally { await first.db.close(); }
        const previousName = process.env.ADMIN_USERNAME;
        const previousPassword = process.env.ADMIN_PASSWORD;
        process.env.ADMIN_USERNAME = 'NeuerAdmin';
        process.env.ADMIN_PASSWORD = 'synthetisches-Adminpasswort-1';
        let restarted;
        try { restarted = await createApp({ dataDir, legacyDir: root }); }
        finally {
            if (previousName === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = previousName;
            if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = previousPassword;
        }
        try {
            assert.equal((await restarted.db.get('SELECT show_name FROM users WHERE username = ?', ['Bestandskonto'])).show_name, 0);
            assert.equal((await restarted.db.get('SELECT show_name FROM users WHERE username = ?', ['NeuerAdmin'])).show_name, 1);
        } finally { await restarted.db.close(); }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('paralleler Namenswechsel und RSVP behalten dieselbe Benutzer-ID und nur einen Schlafplatz', async () => {
    const app = await instance();
    try {
        const password = 'Kuenstliches-Racepasswort123!';
        const alice = await app.request('/api/register', 'POST', { username: 'RaceAlice', password });
        await app.db.run('UPDATE party_info SET max_cabin_capacity = 1, max_luftmatratze = 1, max_bettzeug = 1');
        const answer = { kommt: 'Ja', huette: 'Ja', luftmatratze: 'Ja', bettzeug: 'Ja' };
        assert.equal((await app.request('/api/rsvp', 'POST', answer, alice.cookie)).status, 200);
        const original = await app.db.get('SELECT user_id FROM rsvps');
        const get = app.db.get.bind(app.db);
        let signal;
        const reauthStarted = new Promise(resolve => { signal = resolve; });
        app.db.get = async (sql, params) => {
            const row = await get(sql, params);
            if (sql === 'SELECT username, password_hash, is_admin FROM users WHERE id = ?') signal();
            return row;
        };
        const renaming = app.request('/api/profile/username', 'PUT', { username: 'RaceBob', current_password: password }, alice.cookie);
        await reauthStarted;
        const [renamed, saved] = await Promise.all([renaming, app.request('/api/rsvp', 'POST', answer, alice.cookie)]);
        app.db.get = get;
        assert.equal(renamed.status, 200);
        assert.equal(saved.status, 200);
        assert.deepEqual(await app.db.all('SELECT user_id FROM rsvps'), [original]);
        const reused = await app.request('/api/register', 'POST', { username: 'RaceAlice', password: 'Anderes-Racepasswort123!' });
        const attendees = (await app.request('/api/attendees', 'GET', null, reused.cookie)).data;
        assert.equal(attendees.length, 1);
        assert.equal(attendees[0].username, 'RaceBob');
        assert.equal(attendees[0].is_self, 0);
        await app.request('/api/rsvp', 'DELETE', null, reused.cookie);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM rsvps')).count, 1);
    } finally { await app.close(); }
});

test('bereits gelesene alte Identität darf nach Namenswiedervergabe keine fremde Antwort löschen', async () => {
    const app = await instance();
    let release;
    try {
        const password = 'Kuenstliches-Loeschpasswort123!';
        const alice = await app.request('/api/register', 'POST', { username: 'DeleteAlice', password });
        const answer = { kommt: 'Ja', huette: 'Nein', luftmatratze: 'Nein', bettzeug: 'Nein' };
        await app.request('/api/rsvp', 'POST', answer, alice.cookie);
        const get = app.db.get.bind(app.db);
        let signal;
        let paused = false;
        const read = new Promise(resolve => { signal = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        app.db.get = async (sql, params) => {
            const row = await get(sql, params);
            if (!paused && sql.startsWith('SELECT users.id, users.username')) {
                paused = true;
                signal();
                await gate;
            }
            return row;
        };
        const deletion = app.request('/api/rsvp', 'DELETE', null, alice.cookie);
        await read;
        assert.equal((await app.request('/api/profile/username', 'PUT', { username: 'DeleteBob', current_password: password }, alice.cookie)).status, 200);
        const other = await app.request('/api/register', 'POST', { username: 'DeleteAlice', password: 'Anderes-Loeschpasswort123!' });
        await app.request('/api/rsvp', 'POST', answer, other.cookie);
        release();
        assert.equal((await deletion).status, 200);
        app.db.get = get;
        const remaining = (await app.request('/api/attendees', 'GET', null, other.cookie)).data;
        assert.equal(remaining.length, 1);
        assert.equal(remaining[0].username, 'DeleteAlice');
        assert.equal(remaining[0].is_self, 1);
    } finally { if (release) release(); await app.close(); }
});

test('RSVP-Migration erhält Altantworten und ordnet verwaiste oder mehrdeutige Namen nicht neu zu', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-rsvp-migration-'));
    const dataDir = path.join(root, 'data');
    fs.mkdirSync(dataDir);
    let app;
    try {
        await createLegacy(path.join(dataDir, 'app.sqlite'), `
            CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0);
            INSERT INTO users VALUES (1, 'Mara', 'synthetischer-Althash', 0), (2, 'Ben', 'synthetischer-Althash', 0);
            CREATE TABLE rsvps (username TEXT PRIMARY KEY, kommt TEXT NOT NULL, huette TEXT NOT NULL, bettgarnitur TEXT NOT NULL, updated_at TEXT NOT NULL);
            INSERT INTO rsvps VALUES ('Mara', 'Ja', 'Ja', 'Nein', '2026-01-01'), ('Ben', 'Ja', 'Nein', 'Nein', '2026-01-02'),
                ('bEN', 'Nein', 'Nein', 'Nein', '2026-01-03'), ('Verwaist', 'Ja', 'Ja', 'Ja', '2026-01-04');`);
        app = await instance(root, { dataDir });
        assert.deepEqual(await app.db.all('SELECT user_id, updated_at FROM rsvps'), [{ user_id: 1, updated_at: '2026-01-01' }]);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM rsvps_legacy_names')).count, 4);
        await assert.rejects(app.db.run("INSERT INTO rsvps VALUES (999, 'Ja', 'Nein', 'Nein', 'Nein', '2026-01-05')"), { code: 'SQLITE_CONSTRAINT' });
        const newcomer = await app.request('/api/register', 'POST', { username: 'Verwaist', password: 'Kuenstliches-Migrationspasswort123!' });
        const list = (await app.request('/api/attendees', 'GET', null, newcomer.cookie)).data;
        assert.equal(list.length, 1);
        assert.equal(list[0].is_self, 0);
        await app.close(); app = null;
        app = await instance(root, { dataDir });
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM rsvps')).count, 1);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM rsvps_legacy_names')).count, 4);
    } finally {
        if (app) await app.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('erfolgreicher Login aktualisiert alte scrypt-Kosten, falsche Logins ändern Hash und Sitzungen nicht', async () => {
    const app = await instance();
    try {
        const password = 'Kuenstliches-Rehashpasswort123!';
        const created = await app.request('/api/register', 'POST', { username: 'RehashGuest', password });
        const salt = Buffer.alloc(16, 0x42);
        const legacy = `scrypt:${salt.toString('hex')}:${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
        await app.db.run('UPDATE users SET password_hash = ? WHERE username = ?', [legacy, 'RehashGuest']);
        assert.equal((await app.request('/api/login', 'POST', { username: 'RehashGuest', password: 'wrong' })).status, 401);
        assert.equal((await app.db.get('SELECT password_hash FROM users')).password_hash, legacy);
        assert.equal((await app.db.get('SELECT COUNT(*) AS count FROM sessions')).count, 1);
        const login = await app.request('/api/login', 'POST', { username: 'RehashGuest', password });
        assert.equal(login.status, 200);
        assert.match((await app.db.get('SELECT password_hash FROM users')).password_hash, /^scrypt:v1:16384:8:5:/);
        assert.equal((await app.request('/api/session', 'GET', null, created.cookie)).data.username, 'RehashGuest');
        assert.equal((await app.request('/api/session', 'GET', null, login.cookie)).data.username, 'RehashGuest');
    } finally { await app.close(); }
});

test('Adminstart aktualisiert alte scrypt-Kosten ohne Sitzungswiderruf bei unverändertem Passwort', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-admin-rehash-'));
    const previousName = process.env.ADMIN_USERNAME;
    const previousPassword = process.env.ADMIN_PASSWORD;
    const password = 'Kuenstliches-Adminrehashpasswort123!';
    let app;
    try {
        process.env.ADMIN_USERNAME = 'RehashAdmin'; process.env.ADMIN_PASSWORD = password;
        app = await instance(root, { dataDir: root });
        const login = await app.request('/api/login', 'POST', { username: 'RehashAdmin', password });
        const salt = Buffer.alloc(16, 0x42);
        const legacy = `scrypt:${salt.toString('hex')}:${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
        await app.db.run('UPDATE users SET password_hash = ?', [legacy]);
        await app.close(); app = null;
        app = await instance(root, { dataDir: root });
        assert.match((await app.db.get('SELECT password_hash FROM users')).password_hash, /^scrypt:v1:16384:8:5:/);
        assert.equal((await app.request('/api/session', 'GET', null, login.cookie)).data.is_admin, true);
    } finally {
        if (app) await app.close();
        if (previousName === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = previousName;
        if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = previousPassword;
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('gleichzeitiges Legacy-Rehash und Passwortwechsel können keine alte Sitzung neu ausstellen', async () => {
    const app = await instance();
    try {
        const password = 'Kuenstliches-Rehashracepasswort123!';
        const created = await app.request('/api/register', 'POST', { username: 'RehashRace', password });
        const salt = Buffer.alloc(16, 0x42);
        const legacy = `scrypt:${salt.toString('hex')}:${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
        await app.db.run('UPDATE users SET password_hash = ?', [legacy]);
        const nextPassword = 'Anderes-Rehashracepasswort123!';
        const [changed, oldLogin] = await Promise.all([
            app.request('/api/profile/password', 'PUT', { current_password: password, new_password: nextPassword }, created.cookie),
            app.request('/api/login', 'POST', { username: 'RehashRace', password })
        ]);
        assert.equal(changed.status, 200);
        assert.ok([200, 401].includes(oldLogin.status));
        if (oldLogin.cookie) assert.equal((await app.request('/api/session', 'GET', null, oldLogin.cookie)).data.username, null);
        assert.equal((await app.request('/api/login', 'POST', { username: 'RehashRace', password })).status, 401);
        assert.equal((await app.request('/api/login', 'POST', { username: 'RehashRace', password: nextPassword })).status, 200);
    } finally { await app.close(); }
});
