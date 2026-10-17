#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const { hashPassword } = require('./security');

const PROJECT_DIR = path.resolve(__dirname, '..');
const METADATA_KEY = 'demo_seed_users';
const MIN_USERS = 1;
const MAX_USERS = 1000;
const FALLBACK_CABIN = 15;
const FALLBACK_LUFTMATRATZE = 10;
const FALLBACK_BETTZEUG = 10;
const NO_RSVP_SHARE = 10;

const FEMALE_FIRST_NAMES = [
    'Anna', 'Amelie', 'Andrea', 'Anja', 'Birgit', 'Carolin', 'Charlotte', 'Christina', 'Claudia', 'Ella',
    'Emma', 'Franziska', 'Frieda', 'Greta', 'Hannah', 'Heike', 'Helene', 'Ida', 'Jasmin', 'Jennifer',
    'Johanna', 'Julia', 'Katharina', 'Katrin', 'Klara', 'Laura', 'Lea', 'Lena', 'Leonie', 'Lisa',
    'Marie', 'Melanie', 'Mia', 'Michelle', 'Mila', 'Monika', 'Nadine', 'Nele', 'Nicole', 'Paula',
    'Petra', 'Pia', 'Romy', 'Sabine', 'Sandra', 'Sarah', 'Sophie', 'Susanne', 'Tanja', 'Vanessa'
];
const MALE_FIRST_NAMES = [
    'Alexander', 'Andreas', 'Anton', 'Ben', 'Bruno', 'Christian', 'Daniel', 'David', 'Dominik', 'Elias',
    'Emil', 'Fabian', 'Felix', 'Finn', 'Florian', 'Henry', 'Jakob', 'Jan', 'Johannes', 'Jonas',
    'Julian', 'Kevin', 'Leo', 'Leon', 'Louis', 'Luis', 'Lukas', 'Marc', 'Marco', 'Matthias',
    'Matteo', 'Maximilian', 'Michael', 'Moritz', 'Nico', 'Noah', 'Oskar', 'Patrick', 'Paul', 'Philipp',
    'Samuel', 'Sebastian', 'Simon', 'Stefan', 'Theo', 'Thomas', 'Tim', 'Tobias', 'Vincent', 'Werner'
];
const LAST_NAMES = [
    'Albrecht', 'Arnold', 'Bauer', 'Baumann', 'Beck', 'Becker', 'Bergmann', 'Berger', 'Böhm', 'Brandt',
    'Braun', 'Busch', 'Dietrich', 'Engel', 'Fischer', 'Frank', 'Franke', 'Friedrich', 'Fuchs', 'Graf',
    'Groß', 'Günther', 'Haas', 'Hahn', 'Hartmann', 'Heinrich', 'Herrmann', 'Hoffmann', 'Hofmann', 'Horn',
    'Huber', 'Jäger', 'Jung', 'Kaiser', 'Keller', 'Klein', 'Koch', 'Köhler', 'König', 'Krämer',
    'Kraus', 'Krause', 'Krüger', 'Kuhn', 'Kühn', 'Lang', 'Lange', 'Lehmann', 'Lorenz', 'Ludwig',
    'Maier', 'Martin', 'Mayer', 'Meier', 'Meyer', 'Möller', 'Müller', 'Neumann', 'Otto', 'Ott',
    'Peters', 'Pfeiffer', 'Pohl', 'Richter', 'Roth', 'Sauer', 'Schäfer', 'Schmid', 'Schmidt', 'Schmitt',
    'Schmitz', 'Schneider', 'Scholz', 'Schreiber', 'Schröder', 'Schubert', 'Schulte', 'Schulz', 'Schulze', 'Schumacher',
    'Schuster', 'Schwarz', 'Seidel', 'Simon', 'Sommer', 'Stein', 'Thomas', 'Voigt', 'Vogel', 'Vogt',
    'Wagner', 'Walter', 'Weber', 'Weiß', 'Werner', 'Winkler', 'Winter', 'Wolf', 'Wolff', 'Ziegler'
];

function usage() {
    console.log([
        'Showcase-Benutzer erzeugen',
        '',
        'Aufruf:',
        '  npm run seed-demo-users [-- <anzahl>] [--force] [--cleanup]',
        '',
        '  <anzahl>    Anzahl der zu erzeugenden Konten (1–1000). Ohne Angabe wird die',
        '              aktuelle Hütten-Kapazität aus den Veranstaltungseinstellungen verwendet.',
        '  --force     Auch ausführen, wenn die Datenbank bereits Konten enthält.',
        '  --cleanup   Die zuvor erzeugten Showcase-Konten samt Antworten wieder entfernen.',
        '',
        'Erzeugt Konten mit echten deutschen Vor- und Nachnamen und realistischen',
        'Teilnahmeantworten innerhalb der konfigurierten Kapazitäten. Das gemeinsame',
        'Passwort aller erzeugten Konten wird am Ende ausgegeben.'
    ].join('\n'));
}

function fail(text) {
    console.error(text);
    process.exitCode = 1;
}

function pick(items) {
    return items[randomInt(items.length)];
}

function randomPassword(length = 20) {
    const sets = [
        'ABCDEFGHJKLMNPQRSTUVWXYZ',
        'abcdefghijkmnopqrstuvwxyz',
        '23456789',
        '!@#$%*+-_=?'
    ];
    const all = sets.join('');
    const chars = sets.map(set => set[randomInt(set.length)]);
    while (chars.length < length) chars.push(all[randomInt(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

function normalize(name) {
    return name.toLowerCase();
}

// A shuffled cartesian product of first and last names guarantees unique display names.
function buildNameQueue(taken) {
    const firstNames = [...FEMALE_FIRST_NAMES, ...MALE_FIRST_NAMES];
    const combos = [];
    for (const first of firstNames) {
        for (const last of LAST_NAMES) {
            const name = `${first} ${last}`;
            if (/^[\p{L}\p{N} _.-]{2,40}$/u.test(name)) combos.push(name);
        }
    }
    for (let i = combos.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [combos[i], combos[j]] = [combos[j], combos[i]];
    }
    return combos.filter(name => !taken.has(normalize(name)));
}

function readTrackedUsers(db) {
    const row = db.prepare('SELECT value FROM metadata WHERE key = ?').get(METADATA_KEY);
    if (!row) return [];
    try {
        const parsed = JSON.parse(row.value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function occupancy(db) {
    const used = db.prepare(`SELECT
        SUM(CASE WHEN huette = 'Ja' AND kommt = 'Ja' THEN 1 ELSE 0 END) AS cabin,
        SUM(CASE WHEN huette = 'Ja' AND kommt = 'Ja' AND luftmatratze = 'Ja' THEN 1 ELSE 0 END) AS luftmatratze,
        SUM(CASE WHEN huette = 'Ja' AND kommt = 'Ja' AND bettzeug = 'Ja' THEN 1 ELSE 0 END) AS bettzeug
        FROM rsvps`).get();
    return {
        cabin: Number(used.cabin) || 0,
        luftmatratze: Number(used.luftmatratze) || 0,
        bettzeug: Number(used.bettzeug) || 0
    };
}

// Only valid combinations are produced, and every capacity is respected including existing books.
function planRsvp(limits) {
    if (randomInt(100) < NO_RSVP_SHARE) return null;
    const roll = randomInt(100);
    const kommt = roll < 65 ? 'Ja' : roll < 85 ? 'Nein' : 'Vielleicht';
    if (kommt !== 'Ja') return { kommt, huette: 'Nein', luftmatratze: 'Nein', bettzeug: 'Nein' };
    if (limits.cabin >= limits.maxCabin || randomInt(100) >= 70) {
        return { kommt, huette: 'Nein', luftmatratze: 'Nein', bettzeug: 'Nein' };
    }
    limits.cabin += 1;
    let luftmatratze = 'Nein';
    let bettzeug = 'Nein';
    if (limits.luftmatratze < limits.maxLuftmatratze && randomInt(100) < 50) {
        luftmatratze = 'Ja';
        limits.luftmatratze += 1;
    }
    if (limits.bettzeug < limits.maxBettzeug && randomInt(100) < 40) {
        bettzeug = 'Ja';
        limits.bettzeug += 1;
    }
    return { kommt, huette: 'Ja', luftmatratze, bettzeug };
}

function reportSeed(count, withoutAnswer, password) {
    const line = '='.repeat(52);
    console.log([
        line,
        '  Showcase-Daten erzeugt',
        line,
        `  Konten:   ${count} (davon ${withoutAnswer} ohne Teilnahmeantwort)`,
        `  Antworten: ${count - withoutAnswer}`,
        `  Passwort: ${password}`,
        line,
        '  Alle erzeugten Konten nutzen dasselbe Passwort.',
        '  Entfernen mit: npm run seed-demo-users -- --cleanup',
        line
    ].join('\n'));
}

function reportCleanup(removed) {
    const line = '='.repeat(52);
    console.log([
        line,
        '  Showcase-Daten entfernt',
        line,
        `  Gelöschte Konten: ${removed}`,
        line
    ].join('\n'));
}

function cleanup(db) {
    const entries = readTrackedUsers(db);
    if (!entries.length) {
        console.log('Keine Showcase-Konten vermerkt; nichts zu entfernen.');
        return;
    }
    let removed = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
        const byIdAndName = db.prepare('DELETE FROM users WHERE id = ? AND username = ? AND is_admin = 0');
        const byId = db.prepare('DELETE FROM users WHERE id = ? AND is_admin = 0');
        for (const entry of entries) {
            if (entry && typeof entry === 'object') {
                if (!Number.isInteger(entry.id) || typeof entry.username !== 'string') continue;
                removed += Number(byIdAndName.run(entry.id, entry.username).changes);
            } else if (Number.isInteger(entry)) {
                removed += Number(byId.run(entry).changes);
            }
        }
        db.prepare('DELETE FROM metadata WHERE key = ?').run(METADATA_KEY);
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    reportCleanup(removed);
}

async function seed(db, requested, force) {
    const total = Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count);
    if (total > 0 && !force) {
        return fail(`Es sind bereits ${total} Konten vorhanden. Zum Anhängen erneut mit --force ausführen.`);
    }

    const party = db.prepare('SELECT max_cabin_capacity, max_luftmatratze, max_bettzeug FROM party_info WHERE id = 1').get() || {};
    const maxCabin = Number.isInteger(party.max_cabin_capacity) ? party.max_cabin_capacity : FALLBACK_CABIN;
    const maxLuftmatratze = Number.isInteger(party.max_luftmatratze) ? party.max_luftmatratze : FALLBACK_LUFTMATRATZE;
    const maxBettzeug = Number.isInteger(party.max_bettzeug) ? party.max_bettzeug : FALLBACK_BETTZEUG;

    let count = requested;
    if (count === null) count = maxCabin > 0 ? maxCabin : FALLBACK_CABIN;
    if (!Number.isInteger(count) || count < MIN_USERS || count > MAX_USERS) {
        return fail(`Ungültige Anzahl "${requested ?? count}". Erwartet wird eine Ganzzahl zwischen ${MIN_USERS} und ${MAX_USERS}.`);
    }

    const taken = new Set(db.prepare('SELECT username FROM users').all().map(row => normalize(row.username)));
    const queue = buildNameQueue(taken);
    if (queue.length < count) {
        return fail(`Nur ${queue.length} freie Namenskombinationen verfügbar; ${count} angefragt.`);
    }
    const names = queue.slice(0, count);

    const limits = { ...occupancy(db), maxCabin, maxLuftmatratze, maxBettzeug };
    const password = randomPassword();
    const plans = names.map(username => ({ username, rsvp: planRsvp(limits) }));
    const hashes = await Promise.all(plans.map(() => hashPassword(password)));

    const insertUser = db.prepare('INSERT INTO users (username, password_hash, is_admin, show_name) VALUES (?, ?, 0, 1)');
    const insertRsvp = db.prepare(`INSERT INTO rsvps (user_id, kommt, huette, luftmatratze, bettzeug, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`);
    const tracked = [];
    let withoutAnswer = 0;

    db.exec('BEGIN IMMEDIATE');
    try {
        for (let i = 0; i < plans.length; i++) {
            const id = Number(insertUser.run(plans[i].username, hashes[i]).lastInsertRowid);
            tracked.push({ id, username: plans[i].username });
            if (!plans[i].rsvp) {
                withoutAnswer += 1;
                continue;
            }
            const { kommt, huette, luftmatratze, bettzeug } = plans[i].rsvp;
            const updatedAt = new Date(Date.now() - randomInt(0, 14 * 24 * 60 * 60 * 1000)).toISOString();
            insertRsvp.run(id, kommt, huette, luftmatratze, bettzeug, updatedAt);
        }
        const merged = readTrackedUsers(db).concat(tracked);
        db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .run(METADATA_KEY, JSON.stringify(merged));
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    reportSeed(plans.length, withoutAnswer, password);
}

async function main() {
    const args = process.argv.slice(2).filter(argument => argument !== '--');
    if (args.includes('-h') || args.includes('--help')) return usage();
    const force = args.includes('--force');
    const cleanupRequested = args.includes('--cleanup');
    const positional = args.filter(argument => !['--force', '--cleanup', '-h', '--help'].includes(argument));
    if (positional.length > 1) return fail(`Zu viele Argumente: ${positional.join(', ')}.`);
    const requestedArg = positional[0];
    let requested = null;
    if (requestedArg !== undefined) {
        if (!/^\d+$/.test(requestedArg)) return fail(`Ungültige Anzahl "${requestedArg}". Erwartet wird eine Ganzzahl zwischen ${MIN_USERS} und ${MAX_USERS}.`);
        requested = Number(requestedArg);
    }

    const dataDir = process.env.DATA_DIR || path.join(PROJECT_DIR, 'data');
    const databaseFile = path.join(dataDir, 'app.sqlite');
    if (!fs.existsSync(databaseFile)) {
        return fail(`Datenbank nicht gefunden: ${databaseFile}\nStarte zuerst die Anwendung einmal, damit Schema und Einstellungen angelegt werden.`);
    }

    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(databaseFile);
    try {
        db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
        const initialized = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
        if (!initialized) {
            return fail('Die Datenbank enthält noch kein Schema. Starte zuerst die Anwendung einmal.');
        }
        if (cleanupRequested) {
            cleanup(db);
            return;
        }
        await seed(db, requested, force);
    } finally {
        db.close();
    }
}

main().catch(error => {
    console.error('Showcase-Daten fehlgeschlagen:', error.message);
    process.exitCode = 1;
});
