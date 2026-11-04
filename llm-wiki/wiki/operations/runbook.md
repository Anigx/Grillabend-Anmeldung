# Runbook

Status: active
Last verified: 2026-11-04
Confidence: high

## Purpose

Practical commands for a maintainer: run locally, test, start with Docker, create the first admin, reset an admin password, create demo data, back up, and check CI. The full operator documentation is [docs/handbuch/betrieb.md](../../../docs/handbuch/betrieb.md) and [docs/handbuch/installation.md](../../../docs/handbuch/installation.md).

## What exists

| Task | Command or action | Evidence |
|---|---|---|
| Install dependencies | `npm ci --ignore-scripts` | `README.md:54`; `docker.yml:23` |
| Start locally | `npm start` | `package.json:7` |
| Run tests | `npm test` | `package.json:8` |
| Docker start | `docker compose pull && docker compose up -d` | `docs/handbuch/betrieb.md:107-111` |
| First admin | Open `/setup` while no admin exists | `README.md:58`; `src/server.js:406-417` |
| Reset admin password | `npm run reset-admin-password` (optionally with a username) | `package.json:9`; `src/reset-password.js:57-105` |
| Create demo users | `npm run seed-demo-users -- <count> [--force]` | `package.json:10`; `src/seed-demo-users.js:43-58` |
| Remove demo users | `npm run seed-demo-users -- --cleanup` | `src/seed-demo-users.js:43-58` |
| Delete responses for next event | Admin tab "Neuer Grillabend" with admin password | `public/admin.html:139-160`; `src/server.js:299-322` |
| Back up | Stop the server and copy `data/app.sqlite` or the Docker volume | `docs/handbuch/betrieb.md:120-124` |

## How it works

1. **Local development:** Node 22.13+ is required. The default port is `621`; the server binds to all interfaces unless `HOST` is set (`server.js:5-7`). Open the UI on loopback, not on an externally reachable address, unless you intentionally want LAN access.
2. **Local tests:** `npm test` runs `node --test` over `test/`. It creates temporary synthetic databases and does not use `data/app.sqlite`. The real-Nginx test is skipped unless `RUN_NGINX_TESTS=1`.
3. **Docker:** Compose publishes the container on host loopback by default. The app itself listens on port 80 inside the container; the volume stores SQLite. To expose it to a network, use the installer's LAN override rather than editing the base file (`docs/handbuch/betrieb.md:16-18`).
4. **First admin:** while no `is_admin = 1` account exists, `/` redirects to `/setup`. `POST /api/setup` creates the first admin atomically. After that, `/setup` redirects to `/` and registration never grants admin (`src/server.js:113-131,406-417`).
5. **Password reset:** the CLI opens the database, finds the single admin (or the named one), generates a random password, updates the hash, deletes that account's sessions, and prints the new password to the console. Do not paste the output into the wiki (`src/reset-password.js:57-105`).
6. **Demo data:** the seed CLI uses generated accounts and responses within the current capacities. It refuses to run against a non-empty database unless `--force`; `--cleanup` removes only tracked demo accounts and their responses (`docs/handbuch/betrieb.md:58-76`).
7. **Reset for the next evening:** the admin reset requires the current admin password, deletes all RSVPs and legacy responses, and keeps accounts, sessions, and event data. It is irreversible (`src/server.js:299-322`; `docs/handbuch/bedienung.md:43-46`).

## Interfaces and data

- Local defaults: port `621`, host all interfaces (`server.js:5-7`).
- Docker defaults: container port 80, host loopback mapping, volume `grillabend-data` (`compose.yaml`).
- Data file: `data/app.sqlite` or `$DATA_DIR/app.sqlite` (`src/server.js:34-37`).
- Test switch: `RUN_NGINX_TESTS=1` enables the real-Nginx proxy test (`test/preview-proxy.test.js:11-12`).
- No admin environment variables; the first admin is created in the UI (`README.md:58`).

## Risks and gotchas

- **Do not use `docker compose down -v` for a normal restart.** It deletes the data volume (`docs/handbuch/betrieb.md:113`).
- **Back up before migrations or version switches.** Startup can alter the schema and drop old columns (`src/db.js:146-164`).
- **The local server binds to all interfaces.** Use `HOST` to restrict it when needed (`server.js:6`; `README.md:54`).
- **The reset CLI prints a secret.** Share it only with the account owner and never store it in docs or logs (`src/reset-password.js:43-55`).
- **The VM preview currently fails at the cookie assertion.** Fix T-001 before relying on it (`deploy/preview-vm.sh:96`).
- **Tests do not prove browser rendering.** Check the map, PDF, and PNG paths manually (`docs/wiki/entwicklung/lokal-starten.md:32`).

## Open questions

- What is the production backup schedule and restore drill? **Confidence: low.** Source: `docs/wiki/planung.md:5`.
- Is a permanent host planned, or is the app only for a private LAN? **Confidence: low.** Source: `docs/wiki/planung.md:5`.

## Related pages

- [Overview](../overview.md)
- [Architecture overview](../architecture/overview.md)
- [Delivery](../architecture/delivery.md)
- [Security](../architecture/security.md)
- [Existing German operations handbook](../../../docs/handbuch/betrieb.md)
- [Existing German installation handbook](../../../docs/handbuch/installation.md)
