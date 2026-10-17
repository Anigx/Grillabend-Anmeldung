const { randomBytes, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');

const deriveKey = promisify(scrypt);
// OWASP's 16 MiB scrypt profile; explicit costs avoid runtime-default downgrades.
const PASSWORD_COST = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };

function passwordHashParts(stored) {
    if (typeof stored !== 'string') return null;
    const legacy = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
    if (legacy) return { salt: legacy[1], key: legacy[2], legacy: true, cost: { ...PASSWORD_COST, p: 1 } };
    const current = /^scrypt:v1:16384:8:5:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
    // Only supported cost profiles are accepted; stored metadata cannot request unbounded work.
    return current ? { salt: current[1], key: current[2], legacy: false, cost: PASSWORD_COST } : null;
}

async function hashPassword(password) {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, 64, PASSWORD_COST);
    return `scrypt:v1:${PASSWORD_COST.N}:${PASSWORD_COST.r}:${PASSWORD_COST.p}:${salt.toString('hex')}:${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
    const parts = passwordHashParts(stored);
    if (!parts) return false;
    const expected = Buffer.from(parts.key, 'hex');
    const actual = await deriveKey(password, Buffer.from(parts.salt, 'hex'), expected.length, parts.cost);
    return timingSafeEqual(actual, expected);
}

function needsPasswordRehash(stored) {
    return passwordHashParts(stored)?.legacy === true;
}

function tokenHash(token) {
    return createHash('sha256').update(token).digest('hex');
}

module.exports = { hashPassword, verifyPassword, needsPasswordRehash, tokenHash };
