const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { createApp } = require('../server');
const { verifyPassword } = require('../src/security');

const SEED_SCRIPT = path.join(__dirname, '..', 'src', 'seed-demo-users.js');

function runSeed(rootDir, args = []) {
    return new Promise(resolve => {
        execFile(process.execPath, [SEED_SCRIPT, ...args], {
            env: { ...process.env, DATA_DIR: path.join(rootDir, 'data') }
        }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }));
    });
}

async function createDatabase(setup) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-seed-'));
    const { db } = await createApp({ dataDir: path.join(root, 'data'), legacyDir: root });
    if (setup) await setup(db);
    await db.close();
    return root;
}

function query(rootDir, sql, params = []) {
    const db = new DatabaseSync(path.join(rootDir, 'data', 'app.sqlite'));
    try {
        const statement = db.prepare(sql);
        return sql.trimStart().toLowerCase().startsWith('select') ? statement.all(...params).map(row => ({ ...row })) : undefined;
    } finally {
        db.close();
    }
}

function assertValidRsvp(rsvp) {
    assert.ok(['Ja', 'Nein', 'Vielleicht'].includes(rsvp.kommt));
    assert.ok(['Ja', 'Nein'].includes(rsvp.huette));
    assert.ok(['Ja', 'Nein'].includes(rsvp.luftmatratze));
    assert.ok(['Ja', 'Nein'].includes(rsvp.bettzeug));
    if (rsvp.kommt !== 'Ja') assert.equal(rsvp.huette, 'Nein');
    if (rsvp.huette !== 'Ja') {
        assert.equal(rsvp.luftmatratze, 'Nein');
        assert.equal(rsvp.bettzeug, 'Nein');
    }
}

test('seed-demo-users erzeugt standardmäßig so viele Konten wie die Hütten-Kapazität', async () => {
    const root = await createDatabase(db => db.run(
        'UPDATE party_info SET max_cabin_capacity = 5, max_luftmatratze = 2, max_bettzeug = 2 WHERE id = 1'));
    try {
        const { code, stdout, stderr } = await runSeed(root);
        assert.equal(code, 0, stderr);
        const match = /Passwort: (\S+)/.exec(stdout);
        assert.ok(match, `Ausgabe ohne Passwort: ${stdout}`);
        const password = match[1];

        const users = query(root, 'SELECT id, username, password_hash, is_admin FROM users');
        assert.equal(users.length, 5);
        const seen = new Set();
        for (const user of users) {
            assert.equal(user.is_admin, 0);
            assert.match(user.username, /^[\p{L}\p{N} _.-]{2,40}$/u);
            assert.ok(user.username.includes(' '), `Kein Vor-/Nachname: ${user.username}`);
            assert.ok(!seen.has(user.username.toLowerCase()));
            seen.add(user.username.toLowerCase());
            assert.equal(await verifyPassword(password, user.password_hash), true);
        }

        const rsvps = query(root, 'SELECT user_id, kommt, huette, luftmatratze, bettzeug, updated_at FROM rsvps');
        const knownIds = new Set(users.map(user => user.id));
        for (const rsvp of rsvps) {
            assert.ok(knownIds.has(rsvp.user_id));
            assert.match(rsvp.updated_at, /^\d{4}-\d{2}-\d{2}T/);
            assertValidRsvp(rsvp);
        }
        assert.ok(rsvps.filter(row => row.kommt === 'Ja' && row.huette === 'Ja').length <= 5);
        assert.ok(rsvps.filter(row => row.luftmatratze === 'Ja').length <= 2);
        assert.ok(rsvps.filter(row => row.bettzeug === 'Ja').length <= 2);

        const tracked = query(root, "SELECT value FROM metadata WHERE key = 'demo_seed_users'");
        assert.equal(tracked.length, 1);
        assert.equal(JSON.parse(tracked[0].value).length, 5);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('seed-demo-users hält Hütte, Luftmatratze und Bettzeug innerhalb der Kapazitäten', async () => {
    const root = await createDatabase(db => db.run(
        'UPDATE party_info SET max_cabin_capacity = 3, max_luftmatratze = 1, max_bettzeug = 1 WHERE id = 1'));
    try {
        const { code, stderr } = await runSeed(root, ['12']);
        assert.equal(code, 0, stderr);
        assert.equal(query(root, 'SELECT id FROM users').length, 12);
        const rsvps = query(root, 'SELECT kommt, huette, luftmatratze, bettzeug FROM rsvps');
        rsvps.forEach(assertValidRsvp);
        assert.ok(rsvps.filter(row => row.kommt === 'Ja' && row.huette === 'Ja').length <= 3);
        assert.ok(rsvps.filter(row => row.luftmatratze === 'Ja').length <= 1);
        assert.ok(rsvps.filter(row => row.bettzeug === 'Ja').length <= 1);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('seed-demo-users bricht bei vorhandenen Konten ab und hängt nur mit --force an', async () => {
    const root = await createDatabase();
    try {
        assert.equal((await runSeed(root, ['3'])).code, 0);
        const blocked = await runSeed(root, ['2']);
        assert.equal(blocked.code, 1);
        assert.match(blocked.stderr, /bereits 3 Konten/);
        assert.equal(query(root, 'SELECT id FROM users').length, 3);

        const forced = await runSeed(root, ['2', '--force']);
        assert.equal(forced.code, 0, forced.stderr);
        assert.equal(query(root, 'SELECT id FROM users').length, 5);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('seed-demo-users --cleanup entfernt nur die erzeugten Konten und deren Antworten', async () => {
    const root = await createDatabase(async db => {
        await db.run("INSERT INTO users (username, password_hash, is_admin) VALUES ('Organisator', 'synthetischer-Hash', 1)");
    });
    try {
        assert.equal((await runSeed(root, ['4', '--force'])).code, 0);
        assert.equal(query(root, 'SELECT id FROM users').length, 5);
        assert.ok(query(root, 'SELECT user_id FROM rsvps').length >= 0);

        const cleaned = await runSeed(root, ['--cleanup']);
        assert.equal(cleaned.code, 0, cleaned.stderr);
        const remaining = query(root, 'SELECT username, is_admin FROM users');
        assert.equal(remaining.length, 1);
        assert.equal(remaining[0].username, 'Organisator');
        assert.equal(remaining[0].is_admin, 1);
        assert.equal(query(root, 'SELECT user_id FROM rsvps').length, 0);
        assert.equal(query(root, "SELECT value FROM metadata WHERE key = 'demo_seed_users'").length, 0);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('seed-demo-users lehnt ungültige Anzahlen ab', async () => {
    const root = await createDatabase();
    try {
        for (const value of ['0', '1001', 'abc']) {
            const result = await runSeed(root, [value]);
            assert.equal(result.code, 1, `${value} wurde nicht abgelehnt`);
            assert.match(result.stderr, /Anzahl/);
        }
        assert.equal(query(root, 'SELECT id FROM users').length, 0);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('seed-demo-users verlangt eine initialisierte Datenbank', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-seed-'));
    try {
        const result = await runSeed(root, ['2']);
        assert.equal(result.code, 1);
        assert.match(result.stderr, /Datenbank nicht gefunden/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
