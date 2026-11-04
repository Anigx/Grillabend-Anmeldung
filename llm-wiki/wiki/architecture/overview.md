# Architecture Overview

Status: active
Last verified: 2026-11-04
Confidence: high

## Purpose

This page is the shortest reliable map of the running system: the browser, Express, SQLite, the reverse proxy, and the background jobs that keep the data current. It links to the detailed pages instead of duplicating the existing German project wiki.

## What exists

| Component | Path | Responsibility |
|---|---|---|
| Process entry | `server.js` | Reads `PORT`/`HOST`, calls `createApp()`, starts the HTTP listener |
| HTTP application | `src/server.js` | Routes, sessions, admin checks, RSVP capacity, static files, error handling |
| Crypto | `src/security.js` | scrypt password hashes, legacy rehash detection, SHA-256 token hashes |
| Rate limiting | `src/auth-limit.js` | Bounded in-memory limits per client IP and account/name |
| Persistence | `src/db.js` | SQLite schema, migrations, legacy import, session cleanup |
| CLIs | `src/reset-password.js`, `src/seed-demo-users.js` | Admin reset, synthetic demo data |
| Browser UI | `public/` | Participant, setup, and admin pages; CSS; map; exports |
| Delivery | `Dockerfile`, `compose.yaml`, `deploy/`, installers, workflows | Image, proxy, TLS, installation, CI |
| Documentation | `docs/handbuch/`, `docs/wiki/`, `llm-wiki/` | User/ops handbook, German deep wiki, this overlay |

## How it works

1. **Request path:** the browser calls relative URLs. In production, a local Nginx proxy terminates TLS and forwards to the Node process. Node speaks HTTP on container port 80; Compose publishes it on the host loopback by default (`compose.yaml:1-13`; `deploy/nginx.conf.example:1-28`).
2. **Application start:** `createApp()` opens the SQLite file, runs schema/migration steps, prunes expired sessions, and returns the Express app plus the database handle (`src/server.js:33-37`; `src/db.js:166-217`).
3. **Session identity:** login/register issue a random 32-byte token. The cookie carries the token; SQLite stores only its SHA-256 hash. Every protected route resolves the token to a user and checks `expires_at` (`src/server.js:49-66,89-109`; `src/security.js:35-37`).
4. **Write serialization:** all mutating account/session/RSVP writes share an in-process promise queue (`exclusive`). Capacity checks and the write happen inside that queue, so two concurrent RSVPs cannot both take the last place on one instance (`src/server.js:81-87,364-395`).
5. **RSVP ownership:** `rsvps.user_id` is the primary key and a foreign key to `users.id`. Names are joined from `users`; renaming does not move responses (`src/db.js:113-118,181-186`; `src/server.js:265-274`).
6. **Capacity model:** only `kommt = 'Ja'` counts. Cabin, air mattress, and bedding are counted independently; a request is rejected with 409 if the relevant capacity is full (`src/server.js:276-283,373-384`).
7. **Static surface:** only an explicit list of CSS/JS files, the three HTML pages, and the installed Leaflet/ExcelJS/pdfmake/JSZip vendor files are served. `data/`, `src/`, and `docs/` have no static route (`src/server.js:11,406-427`).
8. **Admin surface:** `/admin` and all `/api/admin/*` routes require a server-side admin session; the user-supplied name never grants rights (`src/server.js:76-79,285-362,418`).

## Interfaces and data

- HTTP routes and contracts: [HTTP API](http-api.md).
- Tables, migrations, and storage: [Data model](data-model.md).
- Browser behavior: [Frontend](frontend.md).
- Security controls and risks: [Security](security.md).
- Container, proxy, installers, CI: [Delivery](delivery.md).

## Risks and gotchas

- **One process only.** The write queue and auth limits do not coordinate across Node instances (`docs/handbuch/sicherheit.md:19`).
- **HTTP-only app.** There is no HTTPS enforcement, no `Secure` cookie, and no Origin check; the proxy and loopback binding are the boundary (`README.md:57`).
- **Open registration.** A new account can read the event and the other responses by design (`docs/handbuch/sicherheit.md:17`).
- **Migrations run at startup.** Back up the single SQLite file before an upgrade or a version switch (`docs/handbuch/betrieb.md:120-124`).
- **Legacy data is preserved, not guessed.** Ambiguous old names stay in `rsvps_legacy_names` and are not assigned to a later owner (`src/db.js:120-144`).

## Open questions

- What is the production topology: one instance, a shared database, or a different reservation mechanism? **Confidence: low.** Source: `docs/wiki/planung.md:5`.
- Which proxy owns TLS and how are certificate renewals and backups operated? **Confidence: low.** Source: `docs/wiki/entwicklung/lokal-starten.md:58`.

## Related pages

- [Overview](../overview.md)
- [HTTP API](http-api.md)
- [Data model](data-model.md)
- [Frontend](frontend.md)
- [Security](security.md)
- [Delivery](delivery.md)
- [Runbook](../operations/runbook.md)
- [Existing German architecture page](../../../docs/wiki/architektur/ueberblick.md)
