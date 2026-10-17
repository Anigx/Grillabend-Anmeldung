#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const { hashPassword } = require('./security');

const PROJECT_DIR = path.resolve(__dirname, '..');

function usage() {
    console.log([
        'Admin-Passwort zurücksetzen',
        '',
        'Aufruf:',
        '  npm run reset-admin-password [-- <benutzername>]',
        '',
        'Setzt für das Admin-Konto ein neues Zufallspasswort und gibt es aus.',
        'Der Benutzername ist nur nötig, wenn mehrere Admin-Konten existieren.'
    ].join('\n'));
}

function fail(text) {
    console.error(text);
    process.exitCode = 1;
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

function report(username, password) {
    const line = '='.repeat(52);
    console.log([
        line,
        '  Admin-Passwort zurückgesetzt',
        line,
        `  Benutzer: ${username}`,
        `  Passwort: ${password}`,
        line,
        '  Alle bisherigen Sitzungen dieses Kontos wurden beendet.',
        line
    ].join('\n'));
}

async function main() {
    const args = process.argv.slice(2).filter(argument => argument !== '--');
    if (args.includes('-h') || args.includes('--help')) return usage();
    const requested = args[0];
    if (requested && !/^[\p{L}\p{N} _.-]{2,40}$/u.test(requested.trim())) {
        return fail('Ungültiger Benutzername. Erwartet werden 2–40 Zeichen.');
    }

    const dataDir = process.env.DATA_DIR || path.join(PROJECT_DIR, 'data');
    const databaseFile = path.join(dataDir, 'app.sqlite');
    if (!fs.existsSync(databaseFile)) {
        return fail(`Datenbank nicht gefunden: ${databaseFile}\nLege zuerst über die Ersteinrichtung (/) einen Admin an.`);
    }

    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(databaseFile);
    try {
        db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
        const admins = db.prepare('SELECT id, username FROM users WHERE is_admin = 1 ORDER BY id').all();
        if (!admins.length) {
            return fail('Kein Admin-Konto gefunden. Lege zuerst über die Ersteinrichtung (/) einen Admin an.');
        }

        let target;
        if (requested) {
            target = admins.find(admin => admin.username.toLowerCase() === requested.trim().toLowerCase());
            if (!target) return fail(`Kein Admin-Konto mit dem Namen "${requested.trim()}" gefunden.`);
        } else if (admins.length === 1) {
            [target] = admins;
        } else {
            return fail(`Mehrere Admin-Konten gefunden: ${admins.map(admin => admin.username).join(', ')}.\nBitte einen Namen angeben: npm run reset-admin-password -- <benutzername>`);
        }

        const password = randomPassword();
        const passwordHash = await hashPassword(password);
        db.exec('BEGIN IMMEDIATE');
        try {
            db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, target.id);
            db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
        report(target.username, password);
    } finally {
        db.close();
    }
}

main().catch(error => {
    console.error('Passwort zurücksetzen fehlgeschlagen:', error.message);
    process.exitCode = 1;
});
