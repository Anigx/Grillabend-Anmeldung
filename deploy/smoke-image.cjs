const assert = require('node:assert/strict');
const { createApp } = require('./server');

async function main() {
    const { NODE_ENV, DATA_DIR, APP_ORIGIN, PORT } = process.env;
    const port = Number(PORT || 621);
    if (NODE_ENV !== 'production' || !DATA_DIR || !Number.isInteger(port) || port < 1 || port > 65535 ||
        APP_ORIGIN !== `https://127.0.0.1:${port}`) {
        throw new Error('Smoke-Test benötigt Produktionsmodus, ein temporäres Datenverzeichnis und die Test-Origin.');
    }
    const { app, db } = await createApp({ dataDir: DATA_DIR, legacyDir: DATA_DIR });
    let server;
    try {
        server = await new Promise((resolve, reject) => {
            const listener = app.listen(port, '127.0.0.1', () => resolve(listener));
            listener.once('error', reject);
        });
        const base = `http://127.0.0.1:${port}`;
        const proxied = await fetch(base, { headers: { 'X-Forwarded-Proto': 'https' } });
        assert.equal(proxied.status, 200);
        const direct = await fetch(`${base}/api/session`);
        assert.equal(direct.status, 426);
        const registered = await fetch(`${base}/api/register`, {
            method: 'POST',
            headers: {
                Origin: APP_ORIGIN,
                'X-Forwarded-Proto': 'https',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username: 'SmokeUser', password: 'Synthetisches-Passwort123!' })
        });
        assert.equal(registered.status, 200);
        assert.match(registered.headers.get('set-cookie'), /HttpOnly; SameSite=Lax;.*Secure/);
        console.log('Container-Smoke-Test bestanden.');
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await db.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
