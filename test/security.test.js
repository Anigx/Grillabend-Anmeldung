const test = require('node:test');
const assert = require('node:assert/strict');
const { scryptSync } = require('node:crypto');
const { hashPassword, verifyPassword, needsPasswordRehash, tokenHash } = require('../src/security');

test('Passwörter erhalten unabhängige Salts und werden nur mit dem richtigen Passwort geprüft', async () => {
    const first = await hashPassword('nur-ein-kuenstliches-Testpasswort');
    const second = await hashPassword('nur-ein-kuenstliches-Testpasswort');
    assert.match(first, /^scrypt:v1:16384:8:5:[a-f0-9]{32}:[a-f0-9]{128}$/);
    assert.notEqual(first, second);
    assert.equal(await verifyPassword('nur-ein-kuenstliches-Testpasswort', first), true);
    assert.equal(await verifyPassword('falsches-Testpasswort', first), false);
    for (const invalid of ['', 'scrypt:abc:123', 'sha256:' + 'a'.repeat(32) + ':' + 'b'.repeat(128), 'scrypt:' + 'x'.repeat(32) + ':' + 'a'.repeat(128)]) {
        assert.equal(await verifyPassword('nur-ein-kuenstliches-Testpasswort', invalid), false);
    }
});

test('scrypt-Kosten sind explizit, alte Hashes bleiben prüfbar und fremde Kosten werden abgewiesen', async () => {
    const password = 'Kuenstliches-Kompatibilitaetspasswort123!';
    const salt = Buffer.alloc(16, 0x42);
    const legacy = `scrypt:${salt.toString('hex')}:${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
    assert.equal(await verifyPassword(password, legacy), true);
    assert.equal(await verifyPassword('wrong', legacy), false);
    assert.equal(needsPasswordRehash(legacy), true);
    const current = await hashPassword(password);
    const parts = current.split(':');
    assert.equal(scryptSync(password, Buffer.from(parts[5], 'hex'), 64, { N: 16384, r: 8, p: 5 }).toString('hex'), parts[6]);
    assert.equal(needsPasswordRehash(current), false);
    for (const invalid of [current.replace(':16384:', ':1073741824:'), current.replace(':8:5:', ':8:1:'), current + ':extra', legacy + ':extra', null, {}]) {
        assert.equal(await verifyPassword(password, invalid), false);
        assert.equal(needsPasswordRehash(invalid), false);
    }
});

test('Session-Token-Hash speichert nicht den Cookie-Wert', () => {
    const token = 'a'.repeat(64);
    assert.match(tokenHash(token), /^[a-f0-9]{64}$/);
    assert.notEqual(tokenHash(token), token);
    assert.notEqual(tokenHash(token), tokenHash('b'.repeat(64)));
    assert.equal(tokenHash(token), tokenHash(token));
});
