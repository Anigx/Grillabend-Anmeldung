const { createHash } = require('node:crypto');

const WINDOW_MS = 10 * 60 * 1000;
const MAX_KEYS = 10000;

function createAuthLimit({ now = Date.now } = {}) {
    const attempts = new Map();
    function consume(key, limit, time) {
        let entry = attempts.get(key);
        if (entry && time - entry.since >= WINDOW_MS) {
            attempts.delete(key);
            entry = null;
        }
        if (!entry) {
            if (attempts.size >= MAX_KEYS) {
                for (const [stored, value] of attempts) {
                    if (time - value.since >= WINDOW_MS) attempts.delete(stored);
                }
                // Never clear active limits when an attacker fills the bounded map.
                if (attempts.size >= MAX_KEYS) return Math.ceil(WINDOW_MS / 1000);
            }
            entry = { since: time, count: 0 };
            attempts.set(key, entry);
        }
        entry.count = Math.min(entry.count + 1, limit + 1);
        return entry.count > limit ? Math.max(1, Math.ceil((entry.since + WINDOW_MS - time) / 1000)) : 0;
    }

    return function authLimit(req, res, next) {
        const time = now();
        const ipRetry = consume(`ip:${req.ip}`, 30, time);
        // Match SQLite NOCASE (ASCII folding) without merging distinct Unicode account names.
        const name = typeof req.body?.username === 'string' && req.body.username.length <= 40 ?
            req.body.username.trim().replace(/[A-Z]/g, char => char.toLowerCase()) : '';
        const identity = req.user ? `user:${req.user.id}` : name ? `name:${createHash('sha256').update(name).digest('hex')}` : null;
        const accountRetry = !ipRetry && identity ? consume(`account:${identity}`, 60, time) : 0;
        const retry = Math.max(ipRetry, accountRetry);
        if (retry) {
            res.set('Retry-After', String(retry));
            return res.status(429).json({ error: 'Bitte später erneut versuchen.' });
        }
        next();
    };
}

module.exports = { createAuthLimit };
