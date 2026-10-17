const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createApp } = require('../server');

test('echter Preview-Nginx trennt Besucher-IPs, ignoriert gefälschtes XFF und weist fehlende Tunnelidentität ab',
    { skip: process.env.RUN_NGINX_TESTS !== '1', timeout: 30000 }, async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grillabend-proxy-'));
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        let server;
        let nginx;
        let db;
        const prefix = root.replaceAll('\\', '/') + '/';
        const filename = path.join(root, 'nginx.conf');
        try {
            const created = await createApp({ dataDir: root, legacyDir: root });
            db = created.db;
            server = await new Promise(resolve => { const s = created.app.listen(0, '127.0.0.1', () => resolve(s)); });
            const probe = http.createServer();
            await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
            const port = probe.address().port;
            await new Promise(resolve => probe.close(resolve));
            const config = fs.readFileSync(path.join(__dirname, '../deploy/nginx-preview.conf'), 'utf8')
                .replace('127.0.0.1:8080', `127.0.0.1:${port}`)
                .replace('127.0.0.1:1621', `127.0.0.1:${server.address().port}`);
            fs.mkdirSync(path.join(root, 'logs'));
            fs.mkdirSync(path.join(root, 'temp'));
            fs.writeFileSync(filename, `pid "${prefix}nginx.pid"; error_log "${prefix}nginx.log"; events {} http { access_log off; ${config} }`);
            nginx = spawn('nginx', ['-p', prefix, '-c', filename, '-g', 'daemon off;'], { stdio: ['ignore', 'ignore', 'pipe'] });
            let stderr = '';
            nginx.stderr.on('data', data => { stderr += data.toString(); });
            let spawnError;
            nginx.on('error', error => { spawnError = error; });
            const base = `http://127.0.0.1:${port}`;
            async function request(route, body, client, forwarded = '192.0.2.99') {
                const headers = { 'X-Forwarded-For': forwarded };
                if (client !== undefined) headers['CF-Connecting-IP'] = client;
                if (body) { headers.Origin = base.replace('http:', 'https:'); headers['Content-Type'] = 'application/json'; }
                const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
                await response.arrayBuffer();
                return response.status;
            }
            let ready = false;
            for (let i = 0; i < 50; i++) {
                if (spawnError) throw spawnError;
                try { if (await request('/api/session', null, '203.0.113.2') === 200) { ready = true; break; } }
                catch { /* Wait only for this newly spawned local test process. */ }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            assert.equal(ready, true, `Nginx startet mit der tatsächlichen Preview-Konfiguration: ${stderr}`);
            assert.equal(await request('/api/session'), 403);
            assert.equal(await request('/api/session', null, 'not-an-ip'), 403);
            const account = { username: 'ProxyGuest', password: 'Kuenstliches-Proxypasswort123!' };
            assert.equal(await request('/api/register', account, '203.0.113.2'), 200);
            for (let i = 0; i < 30; i++) {
                assert.equal(await request('/api/login', { username: 'Nobody', password: 'wrong' }, '203.0.113.1', `192.0.2.${i + 1}`), 401);
            }
            assert.equal(await request('/api/login', { username: 'Nobody', password: 'wrong' }, '203.0.113.1', '192.0.2.200'), 429);
            assert.equal(await request('/api/login', account, '203.0.113.2'), 200);
        } finally {
            if (nginx && nginx.exitCode === null && nginx.pid) {
                const exited = new Promise(resolve => nginx.once('exit', resolve));
                await promisify(execFile)('nginx', ['-p', prefix, '-c', filename, '-s', 'quit']);
                await exited;
            }
            if (server) await new Promise(resolve => server.close(resolve));
            if (db) await db.close();
            if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
