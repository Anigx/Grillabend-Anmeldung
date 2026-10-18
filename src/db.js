const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./security');
const MAX_USER_SESSIONS = 10;

async function connect(filename, readOnly = false) {
    return new DatabaseSync(filename, { readOnly });
}

async function query(action) {
    try { return action(); }
    catch (error) {
        // Preserve the constraint contract used by HTTP validation and migration handling.
        if (error.code === 'ERR_SQLITE_ERROR' && (error.errcode & 255) === 19) error.code = 'SQLITE_CONSTRAINT';
        throw error;
    }
}

function store(db) {
    return {
        get(sql, params = []) {
            return query(() => {
                const row = db.prepare(sql).get(...params);
                return row && { ...row };
            });
        },
        all(sql, params = []) {
            return query(() => db.prepare(sql).all(...params).map(row => ({ ...row })));
        },
        run(sql, params = []) {
            return query(() => {
                const result = db.prepare(sql).run(...params);
                return { changes: Number(result.changes), lastID: Number(result.lastInsertRowid) };
            });
        },
        exec(sql) {
            return query(() => db.exec(sql));
        },
        close() {
            return query(() => db.close());
        }
    };
}

async function legacyRows(filename, table) {
    if (!fs.existsSync(filename)) return null;
    const connection = store(await connect(filename, true));
    try {
        const exists = await connection.get('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', ['table', table]);
        return exists ? await connection.all(`SELECT * FROM ${table}`) : [];
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
            await db.run('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)', [
                user.username, await hashPassword(user.password), user.is_admin === 1 ? 1 : 0
            ]);
        }
        for (const rsvp of rsvps || []) {
            const owners = await db.all('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [rsvp.username]);
            // A legacy bedding request counted for both air mattress and bedding.
            const bedding = rsvp.bettgarnitur === 'Ja' ? 'Ja' : 'Nein';
            const values = [rsvp.kommt, rsvp.huette, bedding, bedding, rsvp.timestamp || new Date().toISOString()];
            if (owners.length === 1) {
                await db.run('INSERT INTO rsvps (user_id, kommt, huette, luftmatratze, bettzeug, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [owners[0].id, ...values]);
            } else {
                // Preserve unowned/ambiguous imports without granting them to a future name holder.
                await db.run('INSERT INTO rsvps_legacy_names (username, kommt, huette, luftmatratze, bettzeug, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [rsvp.username, ...values]);
            }
        }
        const event = (party || []).find(row => row.id === 1);
        if (event) {
            await db.run(`INSERT INTO party_info (id, date, location_name, location_address, maps_url, max_cabin_capacity, max_luftmatratze, max_bettzeug, rules, info)
                VALUES (1, ?, ?, ?, ?, ?, ?, ?, '', '')`, [
                event.date || '', event.location_name || '', event.location_address || '', event.maps_url || '',
                event.max_cabin_capacity ?? 15, event.max_bettgarnitur ?? 10, event.max_bettgarnitur ?? 10
            ]);
        }
        await db.run('INSERT INTO metadata (key, value) VALUES (?, ?)', ['legacy_imported', new Date().toISOString()]);
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
    }
}

const RSVP_SCHEMA = `CREATE TABLE rsvps (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    kommt TEXT NOT NULL, huette TEXT NOT NULL,
    luftmatratze TEXT NOT NULL DEFAULT 'Nein',
    bettzeug TEXT NOT NULL DEFAULT 'Nein', updated_at TEXT NOT NULL
)`;

async function migrateRsvpOwners(db) {
    const columns = await db.all('PRAGMA table_info(rsvps)');
    if (columns.some(column => column.name === 'username') && !columns.some(column => column.name === 'user_id')) {
        await db.exec('BEGIN IMMEDIATE');
        try {
            // Keep the complete original table. Ambiguous duplicates must not be silently assigned.
            await db.exec('ALTER TABLE rsvps RENAME TO rsvps_legacy_names');
            await db.exec('CREATE INDEX rsvps_legacy_names_username_nocase ON rsvps_legacy_names (username COLLATE NOCASE)');
            await db.exec(RSVP_SCHEMA);
            await db.run(`INSERT INTO rsvps (user_id, kommt, huette, luftmatratze, bettzeug, updated_at)
                SELECT users.id, old.kommt, old.huette, old.bettgarnitur, old.bettgarnitur, old.updated_at
                FROM rsvps_legacy_names AS old JOIN users ON users.username = old.username COLLATE NOCASE
                WHERE (SELECT COUNT(*) FROM users AS owner WHERE owner.username = old.username COLLATE NOCASE) = 1
                  AND (SELECT COUNT(*) FROM rsvps_legacy_names AS other WHERE other.username = old.username COLLATE NOCASE) = 1`);
            await db.exec('COMMIT');
        } catch (error) {
            await db.exec('ROLLBACK');
            throw error;
        }
    }
    await db.exec(`CREATE TABLE IF NOT EXISTS rsvps_legacy_names (
        username TEXT PRIMARY KEY, kommt TEXT NOT NULL, huette TEXT NOT NULL,
        luftmatratze TEXT NOT NULL DEFAULT 'Nein', bettzeug TEXT NOT NULL DEFAULT 'Nein', updated_at TEXT NOT NULL
    )`);
}

// Existing installations carry a single bedding column; split it into two independent requests.
async function migrateBeddingColumns(db) {
    for (const table of ['rsvps', 'rsvps_legacy_names']) {
        const columns = await db.all(`PRAGMA table_info(${table})`);
        if (!columns.some(column => column.name === 'bettgarnitur') ||
            (columns.some(column => column.name === 'luftmatratze') && columns.some(column => column.name === 'bettzeug'))) continue;
        await db.exec(`ALTER TABLE ${table} ADD COLUMN luftmatratze TEXT NOT NULL DEFAULT 'Nein'`);
        await db.exec(`ALTER TABLE ${table} ADD COLUMN bettzeug TEXT NOT NULL DEFAULT 'Nein'`);
        await db.exec(`UPDATE ${table} SET luftmatratze = bettgarnitur, bettzeug = bettgarnitur`);
        await db.exec(`ALTER TABLE ${table} DROP COLUMN bettgarnitur`);
    }
    const columns = await db.all('PRAGMA table_info(party_info)');
    if (!columns.some(column => column.name === 'max_bettgarnitur') ||
        (columns.some(column => column.name === 'max_luftmatratze') && columns.some(column => column.name === 'max_bettzeug'))) return;
    await db.exec('ALTER TABLE party_info ADD COLUMN max_luftmatratze INTEGER NOT NULL DEFAULT 10');
    await db.exec('ALTER TABLE party_info ADD COLUMN max_bettzeug INTEGER NOT NULL DEFAULT 10');
    await db.exec('UPDATE party_info SET max_luftmatratze = max_bettgarnitur, max_bettzeug = max_bettgarnitur');
    await db.exec('ALTER TABLE party_info DROP COLUMN max_bettgarnitur');
}

async function openDatabase({ dataDir, legacyDir }) {
    fs.mkdirSync(dataDir, { recursive: true });
    const db = store(await connect(path.join(dataDir, 'app.sqlite')));
    try {
        await db.exec(`
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS users_username_nocase ON users (username COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at);
            CREATE TABLE IF NOT EXISTS rsvps (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                kommt TEXT NOT NULL, huette TEXT NOT NULL,
                luftmatratze TEXT NOT NULL DEFAULT 'Nein',
                bettzeug TEXT NOT NULL DEFAULT 'Nein', updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS party_info (
                id INTEGER PRIMARY KEY CHECK (id = 1), date TEXT NOT NULL DEFAULT '',
                location_name TEXT NOT NULL DEFAULT '', location_address TEXT NOT NULL DEFAULT '', maps_url TEXT NOT NULL DEFAULT '',
                max_cabin_capacity INTEGER NOT NULL DEFAULT 15, max_luftmatratze INTEGER NOT NULL DEFAULT 10,
                max_bettzeug INTEGER NOT NULL DEFAULT 10, rules TEXT NOT NULL DEFAULT '', info TEXT NOT NULL DEFAULT '',
                latitude REAL, longitude REAL
            );
            CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        `);
        // Existing installations have party_info without coordinates; keep their event data intact.
        const columns = await db.all('PRAGMA table_info(party_info)');
        for (const name of ['latitude', 'longitude']) {
            if (!columns.some(column => column.name === name)) await db.run(`ALTER TABLE party_info ADD COLUMN ${name} REAL`);
        }
        await migrateRsvpOwners(db);
        await migrateBeddingColumns(db);
        await importLegacy(db, legacyDir);
        await db.run('INSERT OR IGNORE INTO party_info (id) VALUES (1)');
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
