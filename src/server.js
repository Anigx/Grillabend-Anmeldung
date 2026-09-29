const express = require('express');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { openDatabase, MAX_USER_SESSIONS } = require('./db');
const { hashPassword, verifyPassword, tokenHash } = require('./security');

const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const PROJECT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(PROJECT_DIR, 'public');
const PUBLIC_FILES = ['css/style.css', 'css/modal.css', 'css/admin.css', 'js/app.js', 'js/admin.js', 'js/admin-exports.js'];

function validText(value, max = 200) {
    return typeof value === 'string' && value.trim().length <= max;
}

function validNewPassword(value) {
    return typeof value === 'string' && value.length >= 12 &&
        /\p{Lu}/u.test(value) && /\p{Ll}/u.test(value) && /\p{Nd}/u.test(value) &&
        /[^\p{L}\p{N}\s]/u.test(value);
}

function mapsUrl(value) {
    if (!value) return true;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl'].includes(url.hostname);
    } catch {
        return false;
    }
}

function parseOrigin(value) {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && value === url.origin ? url.origin : null;
    } catch {
        return null;
    }
}

async function createApp(options = {}) {
    const originSetting = options.origin ?? process.env.APP_ORIGIN;
    const allowedOrigin = originSetting === undefined ? null : parseOrigin(originSetting);
    if (originSetting !== undefined && (!allowedOrigin || (process.env.NODE_ENV === 'production' && !allowedOrigin.startsWith('https://')))) {
        throw new Error('APP_ORIGIN muss eine gültige Origin sein (Schema, Host, optional Port; in Produktion HTTPS).');
    }
    const db = await openDatabase({
        dataDir: options.dataDir || process.env.DATA_DIR || path.join(PROJECT_DIR, 'data'),
        legacyDir: options.legacyDir || PROJECT_DIR
    });
    const adminName = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (Boolean(adminName) !== Boolean(adminPassword)) {
        await db.close();
        throw new Error('ADMIN_USERNAME und ADMIN_PASSWORD müssen gemeinsam gesetzt werden.');
    }
    if (adminName && adminPassword) {
        if (!/^[\p{L}\p{N} _.-]{2,40}$/u.test(adminName.trim()) || adminPassword.length < 12) {
            await db.close();
            throw new Error('Ungültige Admin-Zugangsdaten: Benutzername 2–40 Zeichen, Passwort mindestens 12 Zeichen.');
        }
        const existing = await db.get('SELECT id, is_admin, password_hash FROM users WHERE username = ? COLLATE NOCASE', [adminName.trim()]);
        if (existing) {
            if (existing.is_admin !== 1) {
                await db.close();
                throw new Error('Der konfigurierte Admin-Name gehört bereits zu einem normalen Konto.');
            }
            if (!(await verifyPassword(adminPassword, existing.password_hash))) {
                const newHash = await hashPassword(adminPassword);
                await db.exec('BEGIN IMMEDIATE');
                try {
                    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, existing.id]);
                    await db.run('DELETE FROM sessions WHERE user_id = ?', [existing.id]);
                    await db.exec('COMMIT');
                } catch (error) {
                    await db.exec('ROLLBACK');
                    await db.close();
                    throw error;
                }
            }
        } else {
            await db.run('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)', [adminName.trim(), await hashPassword(adminPassword)]);
        }
    }

    const app = express();
    app.disable('x-powered-by');
    if (process.env.NODE_ENV === 'production') {
        // Only the local reverse proxy may report the original HTTPS scheme.
        app.set('trust proxy', 'loopback');
        app.use((req, res, next) => {
            if (req.secure) return next();
            res.set('Cache-Control', 'no-store');
            res.status(426).json({ error: 'HTTPS erforderlich.' });
        });
    }
    app.use(express.json({ limit: '16kb' }));
    app.use('/api', (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });
    app.use((req, res, next) => {
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
        const origin = req.get('origin');
        const site = req.get('sec-fetch-site');
        const host = req.get('host');
        let requestOrigin = null;
        if (host) {
            try {
                const url = new URL(`${req.protocol}://${host}`);
                if (!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) requestOrigin = url.origin;
            } catch { /* Ein fehlerhafter Host wird abgelehnt. */ }
        }
        // Same-origin browser writes carry Origin; reject missing, malformed, cross-scheme or cross-site writes.
        if (!requestOrigin || (allowedOrigin && requestOrigin !== allowedOrigin) || parseOrigin(origin) !== requestOrigin ||
            (site && !['same-origin', 'none'].includes(site))) {
            return res.status(403).json({ error: 'Ungültiger Anfrageursprung.' });
        }
        next();
    });

    function cookie(res, token, maxAge) {
        const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
        res.set('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
    }

    async function session(req) {
        const token = /(?:^|;\s*)sid=([a-f0-9]{64})(?:;|$)/.exec(req.get('cookie') || '')?.[1];
        if (!token) return null;
        return db.get(`SELECT users.id, users.username, users.is_admin FROM sessions
            JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`, [tokenHash(token), Date.now()]);
    }

    async function requireUser(req, res, next) {
        try {
            req.user = await session(req);
            if (!req.user) return res.status(401).json({ error: 'Bitte zuerst anmelden.' });
            next();
        } catch (error) { next(error); }
    }

    function requireAdmin(req, res, next) {
        if (req.user.is_admin !== 1) return res.status(403).json({ error: 'Adminrechte erforderlich.' });
        next();
    }

    let sessionWrites = Promise.resolve();
    async function issueSession(res, user) {
        const current = sessionWrites.then(async () => {
            const token = randomBytes(32).toString('hex');
            await db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
            await db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [tokenHash(token), user.id, Date.now() + SESSION_AGE]);
            await db.run(`DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (
                SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY expires_at DESC, rowid DESC LIMIT ?
            )`, [user.id, user.id, MAX_USER_SESSIONS]);
            return token;
        });
        sessionWrites = current.catch(() => {});
        const token = await current;
        cookie(res, token, SESSION_AGE / 1000);
        res.json({ username: user.username, is_admin: user.is_admin === 1 });
    }

    // Simple per-IP window for auth writes; persistent throttling can be added once deployment is known.
    const attempts = new Map();
    function authLimit(req, res, next) {
        const key = req.ip;
        const now = Date.now();
        const entry = attempts.get(key);
        const count = entry && now - entry.since < 10 * 60 * 1000 ? entry.count + 1 : 1;
        attempts.set(key, { since: count === 1 ? now : entry.since, count });
        if (attempts.size > 10000) attempts.clear();
        if (count > 30) return res.status(429).json({ error: 'Bitte später erneut versuchen.' });
        next();
    }

    app.post('/api/register', authLimit, async (req, res, next) => {
        try {
            const { username, password } = req.body || {};
            if (typeof username !== 'string' || !/^[\p{L}\p{N} _.-]{2,40}$/u.test(username.trim()) ||
                !validNewPassword(password)) {
                return res.status(400).json({ error: 'Name: 2–40 Zeichen; Passwort: mindestens 12 Zeichen mit Groß- und Kleinbuchstaben, Zahl und Sonderzeichen.' });
            }
            const name = username.trim();
            const passwordHash = await hashPassword(password);
            // A single SQLite write checks case-insensitive uniqueness atomically, including parallel registrations.
            const result = await db.run(`INSERT INTO users (username, password_hash, is_admin)
                SELECT ?, ?, 0 WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = ? COLLATE NOCASE)`, [name, passwordHash, name]);
            if (!result.changes) return res.status(409).json({ error: 'Dieser Name ist bereits vergeben.' });
            await issueSession(res, { id: result.lastID, username: name, is_admin: 0 });
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'Dieser Name ist bereits vergeben.' });
            next(error);
        }
    });

    app.post('/api/login', authLimit, async (req, res, next) => {
        try {
            const { username, password } = req.body || {};
            if (typeof username !== 'string' || typeof password !== 'string' || username.length > 40) {
                return res.status(400).json({ error: 'Ungültige Eingabe.' });
            }
            const user = await db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username.trim()]);
            if (!user || !(await verifyPassword(password, user.password_hash))) {
                return res.status(401).json({ error: 'Name oder Passwort falsch.' });
            }
            await issueSession(res, user);
        } catch (error) { next(error); }
    });

    app.get('/api/session', async (req, res, next) => {
        try {
            const user = await session(req);
            res.json(user ? { username: user.username, is_admin: user.is_admin === 1 } : { username: null, is_admin: false });
        } catch (error) { next(error); }
    });

    app.post('/api/logout', requireUser, async (req, res, next) => {
        try {
            const token = /(?:^|;\s*)sid=([a-f0-9]{64})(?:;|$)/.exec(req.get('cookie') || '')?.[1];
            await db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash(token)]);
            cookie(res, '', 0);
            res.json({ success: true });
        } catch (error) { next(error); }
    });

    app.get('/api/party-info', requireUser, async (req, res, next) => {
        try { res.json(await db.get('SELECT * FROM party_info WHERE id = 1')); }
        catch (error) { next(error); }
    });

    app.get('/api/attendees', requireUser, async (req, res, next) => {
        try { res.json(await db.all('SELECT username, kommt, huette, bettgarnitur, updated_at FROM rsvps ORDER BY updated_at DESC')); }
        catch (error) { next(error); }
    });

    // Serialize capacity-changing writes on the single SQLite connection.
    let writes = Promise.resolve();
    function exclusive(action) {
        const current = writes.then(action);
        writes = current.catch(() => {});
        return current;
    }

    async function adminPartyInfo() {
        const party = await db.get('SELECT * FROM party_info WHERE id = 1');
        const used = await db.get(`SELECT
            SUM(CASE WHEN huette = 'Ja' AND kommt = 'Ja' THEN 1 ELSE 0 END) AS cabin,
            SUM(CASE WHEN huette = 'Ja' AND kommt = 'Ja' AND bettgarnitur = 'Ja' THEN 1 ELSE 0 END) AS bedding FROM rsvps`);
        return { ...party, occupancy: { cabin: used.cabin || 0, bedding: used.bedding || 0 } };
    }

    app.get('/api/admin/party-info', requireUser, requireAdmin, async (req, res, next) => {
        try { res.json(await exclusive(adminPartyInfo)); }
        catch (error) { next(error); }
    });

    app.get('/api/admin/users', requireUser, requireAdmin, async (req, res, next) => {
        try {
            res.json(await db.all(`SELECT users.username, rsvps.kommt, rsvps.huette,
                rsvps.bettgarnitur, rsvps.updated_at FROM users
                LEFT JOIN rsvps ON rsvps.username = users.username COLLATE NOCASE
                ORDER BY users.username COLLATE NOCASE, users.id`));
        } catch (error) { next(error); }
    });

    app.post('/api/admin/reset-rsvps', requireUser, requireAdmin, authLimit, async (req, res, next) => {
        try {
            const password = req.body?.password;
            if (typeof password !== 'string' || !password) {
                return res.status(400).json({ error: 'Bitte Admin-Passwort eingeben.' });
            }
            const result = await exclusive(async () => {
                const admin = await db.get('SELECT password_hash FROM users WHERE id = ? AND is_admin = 1', [req.user.id]);
                if (!admin || !(await verifyPassword(password, admin.password_hash))) return null;
                return db.run('DELETE FROM rsvps');
            });
            if (!result) return res.status(422).json({ error: 'Admin-Passwort falsch. Bitte erneut eingeben.' });
            res.json({ success: true, deleted: result.changes });
        } catch (error) { next(error); }
    });

    app.put('/api/admin/party-info', requireUser, requireAdmin, async (req, res, next) => {
        try {
            const fields = ['date', 'location_name', 'location_address', 'maps_url', 'rules', 'info'];
            const values = fields.map(key => req.body?.[key]);
            const cabin = req.body?.max_cabin_capacity;
            const bedding = req.body?.max_bettgarnitur;
            const latitude = req.body?.latitude;
            const longitude = req.body?.longitude;
            const pinProvided = latitude !== undefined || longitude !== undefined;
            const validPin = !pinProvided || (latitude === null && longitude === null) ||
                (typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
                 typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);
            if (values.some((value, index) => !validText(value, index >= 4 ? 4000 : 300)) || !mapsUrl(values[3]) ||
                !validPin || !Number.isInteger(cabin) || cabin < 1 || cabin > 1000 ||
                !Number.isInteger(bedding) || bedding < 0 || bedding > 1000) {
                return res.status(400).json({ error: 'Ungültige Veranstaltungsdaten, Koordinaten oder Maps-URL.' });
            }
            const outcome = await exclusive(async () => {
                const current = await adminPartyInfo();
                if (cabin < current.occupancy.cabin || bedding < current.occupancy.bedding) return null;
                const pin = pinProvided ? {
                    latitude: latitude === null ? null : Number(latitude.toFixed(6)),
                    longitude: longitude === null ? null : Number(longitude.toFixed(6))
                } : { latitude: current.latitude, longitude: current.longitude };
                const link = pin.latitude === null ? values[3].trim() :
                    `https://www.google.com/maps?q=${pin.latitude},${pin.longitude}`;
                await db.run(`UPDATE party_info SET date = ?, location_name = ?, location_address = ?, maps_url = ?,
                    rules = ?, info = ?, max_cabin_capacity = ?, max_bettgarnitur = ?, latitude = ?, longitude = ? WHERE id = 1`,
                [values[0].trim(), values[1].trim(), values[2].trim(), link,
                    values[4].trim(), values[5].trim(), cabin, bedding, pin.latitude, pin.longitude]);
                return adminPartyInfo();
            });
            if (!outcome) return res.status(409).json({ error: 'Kapazität kleiner als bereits belegte Plätze.' });
            res.json(outcome);
        } catch (error) { next(error); }
    });

    app.post('/api/rsvp', requireUser, async (req, res, next) => {
        try {
            const { kommt, huette, bettgarnitur } = req.body || {};
            if (!['Ja', 'Nein', 'Vielleicht'].includes(kommt) || !['Ja', 'Nein'].includes(huette) ||
                !['Ja', 'Nein'].includes(bettgarnitur) || (kommt !== 'Ja' && huette !== 'Nein') ||
                (huette !== 'Ja' && bettgarnitur !== 'Nein')) {
                return res.status(400).json({ error: 'Ungültige Auswahl.' });
            }
            const outcome = await exclusive(async () => {
                const limits = await db.get('SELECT max_cabin_capacity, max_bettgarnitur FROM party_info WHERE id = 1');
                if (huette === 'Ja') {
                    const occupied = await db.get(`SELECT
                        SUM(CASE WHEN huette = 'Ja' AND kommt = 'Ja' THEN 1 ELSE 0 END) AS cabin,
                        SUM(CASE WHEN huette = 'Ja' AND kommt = 'Ja' AND bettgarnitur = 'Ja' THEN 1 ELSE 0 END) AS bedding
                        FROM rsvps WHERE username != ?`, [req.user.username]);
                    if (occupied.cabin >= limits.max_cabin_capacity) return 'Hütte ist voll.';
                    if (bettgarnitur === 'Ja' && occupied.bedding >= limits.max_bettgarnitur) return 'Keine Bettgarnitur mehr verfügbar.';
                }
                await db.run(`INSERT INTO rsvps (username, kommt, huette, bettgarnitur, updated_at)
                    VALUES (?, ?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET
                    kommt = excluded.kommt, huette = excluded.huette, bettgarnitur = excluded.bettgarnitur, updated_at = excluded.updated_at`,
                [req.user.username, kommt, huette, bettgarnitur, new Date().toISOString()]);
                return null;
            });
            if (outcome) return res.status(409).json({ error: outcome });
            res.json({ success: true });
        } catch (error) { next(error); }
    });

    app.delete('/api/rsvp', requireUser, async (req, res, next) => {
        try {
            await exclusive(() => db.run('DELETE FROM rsvps WHERE username = ?', [req.user.username]));
            res.json({ success: true });
        } catch (error) { next(error); }
    });

    app.use('/api', (req, res) => res.status(404).json({ error: 'Unbekannter Endpunkt.' }));

    app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
    app.get('/admin', requireUser, requireAdmin, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
    for (const file of PUBLIC_FILES) app.get(`/${file}`, (req, res) => res.sendFile(path.join(PUBLIC_DIR, file)));
    for (const file of ['leaflet.js', 'leaflet.css']) {
        app.get(`/vendor/leaflet/${file}`, (req, res) => res.sendFile(path.join(PROJECT_DIR, 'node_modules', 'leaflet', 'dist', file)));
    }
    for (const [route, file] of [
        ['exceljs/exceljs.min.js', 'exceljs/dist/exceljs.min.js'],
        ['pdf-lib/pdf-lib.min.js', 'pdf-lib/dist/pdf-lib.min.js'],
        ['jszip/jszip.min.js', 'jszip/dist/jszip.min.js']
    ]) app.get(`/vendor/${route}`, (req, res) => res.sendFile(path.join(PROJECT_DIR, 'node_modules', file)));
    app.use((error, req, res, next) => {
        const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
        if (status === 500) console.error(error);
        res.status(status).json({ error: status === 400 ? 'Ungültiges JSON.' : status === 413 ? 'Anfrage zu groß.' : 'Interner Fehler.' });
    });
    return { app, db };
}

module.exports = { createApp };
