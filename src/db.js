const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { hashPassword } = require('./security');
const MAX_USER_SESSIONS = 10;

function connect(filename, flags) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(filename, flags, error => error ? reject(error) : resolve(db));
    });
}

function store(db) {
    return {
        get(sql, params = []) {
            return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
        },
        all(sql, params = []) {
            return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
        },
        run(sql, params = []) {
            return new Promise((resolve, reject) => db.run(sql, params, function (error) {
                error ? reject(error) : resolve({ changes: this.changes, lastID: this.lastID });
            }));
        },
        exec(sql) {
            return new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
        },
        close() {
            return new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
        }
    };
}

async function legacyRows(filename, table) {
    if (!fs.existsSync(filename)) return null;
    const connection = store(await connect(filename, sqlite3.OPEN_READONLY));
    try {
        const exists = await connection.get('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', ['table', table]);
        return exists ? connection.all(`SELECT * FROM ${table}`) : [];
    } finally {
        await connection.close();
    }
}

async function importLegacy(db, legacyDir) {
    const imported = await db.get('SELECT value FROM metadata WHERE key = ?', ['legacy_imported']);
    if (imported) return;

    const files = ['accounts.sqlite', 'party_eintraege.sqlite', 'Datum.sqlite'];
    if (!files.some(name => fs.existsSync(path.join(legacyDir, name)))) return;
    const existing = await db.get('SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM rsvps) AS count');
    if (existing.count) throw new Error('Alt-Daten können nur in eine leere neue Datenbank übernommen werden. Bitte Datenbestand prüfen.');

    // All reads are read-only; failures must not mark a partial import as complete.
    const [users, rsvps, party] = await Promise.all([
        legacyRows(path.join(legacyDir, files[0]), 'users'),
        legacyRows(path.join(legacyDir, files[1]), 'rsvps'),
        legacyRows(path.join(legacyDir, files[2]), 'party_info')
    ]);

    await db.exec('BEGIN IMMEDIATE');
    try {
        for (const user of users || []) {
            if (typeof user.password !== 'string' || !user.password.length) {
                throw new Error('Alt-Konto ohne gültiges Passwort; Übernahme abgebrochen.');
            }
            await db.run('INSERT INTO users (username, password_hash, is_admin, show_name) VALUES (?, ?, ?, 1)', [
                user.username, await hashPassword(user.password), user.is_admin === 1 ? 1 : 0
            ]);
        }
        for (const rsvp of rsvps || []) {
            await db.run('INSERT INTO rsvps (username, kommt, huette, bettgarnitur, updated_at) VALUES (?, ?, ?, ?, ?)', [
                rsvp.username, rsvp.kommt, rsvp.huette, rsvp.bettgarnitur || 'Nein', rsvp.timestamp || new Date().toISOString()
            ]);
        }
        const event = (party || []).find(row => row.id === 1);
        if (event) {
            await db.run(`INSERT INTO party_info (id, date, location_name, location_address, maps_url, max_cabin_capacity, max_bettgarnitur, rules, info)
                VALUES (1, ?, ?, ?, ?, ?, ?, '', '')`, [
                event.date || '', event.location_name || '', event.location_address || '', event.maps_url || '',
                event.max_cabin_capacity ?? 15, event.max_bettgarnitur ?? 10
            ]);
        }
        await db.run('INSERT INTO metadata (key, value) VALUES (?, ?)', ['legacy_imported', new Date().toISOString()]);
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
    }
}

async function openDatabase({ dataDir, legacyDir }) {
    fs.mkdirSync(dataDir, { recursive: true });
    const db = store(await connect(path.join(dataDir, 'app.sqlite'), sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE));
    try {
        await db.exec(`
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0, show_name INTEGER NOT NULL DEFAULT 1 CHECK (show_name IN (0, 1))
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at);
            CREATE TABLE IF NOT EXISTS rsvps (
                username TEXT PRIMARY KEY, kommt TEXT NOT NULL, huette TEXT NOT NULL,
                bettgarnitur TEXT NOT NULL DEFAULT 'Nein', updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS party_info (
                id INTEGER PRIMARY KEY CHECK (id = 1), date TEXT NOT NULL DEFAULT '',
                location_name TEXT NOT NULL DEFAULT '', location_address TEXT NOT NULL DEFAULT '', maps_url TEXT NOT NULL DEFAULT '',
                max_cabin_capacity INTEGER NOT NULL DEFAULT 15, max_bettgarnitur INTEGER NOT NULL DEFAULT 10,
                rules TEXT NOT NULL DEFAULT '', info TEXT NOT NULL DEFAULT '',
                latitude REAL, longitude REAL
            );
            CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        `);
        // Newly installed databases and legacy schemas start with visible names.
        const userColumns = await db.all('PRAGMA table_info(users)');
        if (!userColumns.some(column => column.name === 'show_name')) {
            await db.run('ALTER TABLE users ADD COLUMN show_name INTEGER NOT NULL DEFAULT 1 CHECK (show_name IN (0, 1))');
        }
        // Existing installations have party_info without coordinates; keep their event data intact.
        const columns = await db.all('PRAGMA table_info(party_info)');
        for (const name of ['latitude', 'longitude']) {
            if (!columns.some(column => column.name === name)) await db.run(`ALTER TABLE party_info ADD COLUMN ${name} REAL`);
        }
        await importLegacy(db, legacyDir);
        await db.run('INSERT OR IGNORE INTO party_info (id) VALUES (1)');
        // Apply the requested change to existing accounts once; later opt-outs must survive restarts.
        const visibilityMigrated = await db.get('SELECT value FROM metadata WHERE key = ?', ['names_visible_once']);
        if (!visibilityMigrated) {
            await db.exec('BEGIN IMMEDIATE');
            try {
                await db.run('UPDATE users SET show_name = 1 WHERE show_name != 1');
                await db.run('INSERT INTO metadata (key, value) VALUES (?, ?)', ['names_visible_once', new Date().toISOString()]);
                await db.exec('COMMIT');
            } catch (error) {
                await db.exec('ROLLBACK');
                throw error;
            }
        }
        await db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
        await db.run(`DELETE FROM sessions WHERE rowid IN (
            SELECT rowid FROM (
                SELECT rowid, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY expires_at DESC, rowid DESC) AS number
                FROM sessions
            ) WHERE number > ?
        )`, [MAX_USER_SESSIONS]);
        return db;
    } catch (error) {
        await db.close();
        throw error;
    }
}

module.exports = { openDatabase, MAX_USER_SESSIONS };
