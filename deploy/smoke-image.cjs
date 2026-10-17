const assert = require('node:assert/strict');
const { createApp } = require('./server');

async function main() {
    const { NODE_ENV, DATA_DIR, PORT } = process.env;
    const port = Number(PORT || 80);
    if (NODE_ENV !== 'production' || !DATA_DIR || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Smoke-Test benötigt Produktionsmodus und ein temporäres Datenverzeichnis.');
    }
    const { app, db } = await createApp({ dataDir: DATA_DIR, legacyDir: DATA_DIR });
    let server;
    try {
        server = await new Promise((resolve, reject) => {
            const listener = app.listen(port, '127.0.0.1', () => resolve(listener));
            listener.once('error', reject);
        });
        const base = `http://127.0.0.1:${port}`;
        assert.equal((await fetch(base)).status, 200);
        assert.equal((await fetch(`${base}/api/session`)).status, 200);
        const registered = await fetch(`${base}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'SmokeUser', password: 'Synthetisches-Passwort123!' })
        });
        assert.equal(registered.status, 200);
        assert.match(registered.headers.get('set-cookie'), /HttpOnly; SameSite=Lax;/);
        assert.doesNotMatch(registered.headers.get('set-cookie'), /Secure/);
        console.log('Container-Smoke-Test bestanden.');
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await db.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
