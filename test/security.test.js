const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, tokenHash } = require('../src/security');

test('Passwörter erhalten unabhängige Salts und werden nur mit dem richtigen Passwort geprüft', async () => {
    const first = await hashPassword('nur-ein-kuenstliches-Testpasswort');
    const second = await hashPassword('nur-ein-kuenstliches-Testpasswort');
    assert.match(first, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    assert.notEqual(first, second);
    assert.equal(await verifyPassword('nur-ein-kuenstliches-Testpasswort', first), true);
    assert.equal(await verifyPassword('falsches-Testpasswort', first), false);
    for (const invalid of ['', 'scrypt:abc:123', 'sha256:' + 'a'.repeat(32) + ':' + 'b'.repeat(128), 'scrypt:' + 'x'.repeat(32) + ':' + 'a'.repeat(128)]) {
        assert.equal(await verifyPassword('nur-ein-kuenstliches-Testpasswort', invalid), false);
    }
});

test('Session-Token-Hash speichert nicht den Cookie-Wert', () => {
    const token = 'a'.repeat(64);
    assert.match(tokenHash(token), /^[a-f0-9]{64}$/);
    assert.notEqual(tokenHash(token), token);
    assert.notEqual(tokenHash(token), tokenHash('b'.repeat(64)));
    assert.equal(tokenHash(token), tokenHash(token));
});
