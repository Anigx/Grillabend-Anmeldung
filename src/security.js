const { randomBytes, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');

const deriveKey = promisify(scrypt);

async function hashPassword(password) {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, 64);
    return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
    const [algorithm, saltHex, keyHex] = (stored || '').split(':');
    if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(saltHex || '') || !/^[a-f0-9]{128}$/.test(keyHex || '')) return false;
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await deriveKey(password, Buffer.from(saltHex, 'hex'), expected.length);
    return timingSafeEqual(actual, expected);
}

function tokenHash(token) {
    return createHash('sha256').update(token).digest('hex');
}

module.exports = { hashPassword, verifyPassword, tokenHash };
