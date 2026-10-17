const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthLimit } = require('../src/auth-limit');

function request(limit, ip, username, user) {
    let status = 200;
    const headers = {};
    const res = { set(name, value) { headers[name] = value; }, status(value) { status = value; return this; }, json() {} };
    limit({ ip, body: { username }, user }, res, () => {});
    return { status, headers };
}

test('Auth-Limits trennen echte Client-IPs und begrenzen Kontoangriffe über mehrere IPs', () => {
    const limit = createAuthLimit();
    for (let i = 0; i < 30; i++) assert.equal(request(limit, '203.0.113.1', 'Angreifer').status, 200);
    assert.equal(request(limit, '203.0.113.1', 'Angreifer').status, 429);
    assert.equal(request(limit, '203.0.113.2', 'Opfer').status, 200);
    const distributed = createAuthLimit();
    for (let i = 0; i < 60; i++) assert.equal(request(distributed, `2001:db8::${i}`, i % 2 ? ' Alice ' : 'alice').status, 200);
    assert.equal(request(distributed, '2001:db8::60', 'ALICE').status, 429);
    assert.equal(request(distributed, '2001:db8::61', 'Bob').status, 200);
    const unicode = createAuthLimit();
    for (let i = 0; i < 60; i++) request(unicode, `2001:db8::${i}`, 'Änne');
    assert.equal(request(unicode, '2001:db8::60', 'Änne').status, 429);
    assert.equal(request(unicode, '2001:db8::61', 'änne').status, 200);
});

test('Limit-Fenster laufen ab; authentifizierte Limits folgen der Benutzer-ID beim Umbenennen', () => {
    let time = 0;
    const limit = createAuthLimit({ now: () => time });
    for (let i = 0; i < 60; i++) assert.equal(request(limit, `2001:db8::${i}`, undefined, { id: 1, username: 'Alice' }).status, 200);
    const blocked = request(limit, '2001:db8::61', undefined, { id: 1, username: 'Neuer Name' });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers['Retry-After'], '600');
    time = 600000;
    assert.equal(request(limit, '2001:db8::61', undefined, { id: 1 }).status, 200);
});

test('Viele neue IPs setzen aktive Limits nicht zurück', () => {
    let time = 0;
    const limit = createAuthLimit({ now: () => time });
    for (let i = 0; i < 31; i++) request(limit, '203.0.113.1');
    for (let i = 0; i < 10001; i++) request(limit, `2001:db8::${i}`);
    assert.equal(request(limit, '203.0.113.1').status, 429);
    time = 600000;
    assert.equal(request(limit, '203.0.113.1').status, 200);
});
