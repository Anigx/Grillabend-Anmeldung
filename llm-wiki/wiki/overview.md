# Project Overview

Status: active
Last verified: 2026-11-04
Confidence: high

## Purpose

Grillabend-Anmeldung is a German-language web application for organizing one current grill evening. Participants create an account, sign in, answer yes/no/maybe, and optionally request a cabin sleep place plus independent air-mattress and bedding needs. An admin maintains the date, place, capacities, rules, and information, and can review or export responses. The README states the product scope directly: one current grill evening, with registration, responses, cabin places, and separate air-mattress/bedding demand (`README.md:3`).

## Who it is for

It serves a small private group and the person organizing the evening. The UI is German, the deployment is self-hosted, and the app has one admin console rather than multi-tenant roles. Registration is deliberately open, so any new account can see the event and the other responses after registering (`docs/handbuch/sicherheit.md:17`). That openness is a product decision, not an access-control bug.

## Stack and runtime

- Node.js 22.13 or newer, CommonJS (`package.json:16-17`).
- Express 5 for HTTP, Node's built-in `node:sqlite` for storage (`package.json:19-25`; `src/db.js:3`).
- Vanilla HTML, CSS, and browser JavaScript; no frontend build step (`public/`; `src/server.js:11`).
- Leaflet for the admin map pin; ExcelJS, pdfmake, and JSZip for browser-side exports.
- Docker/Compose as the recommended runtime, Nginx as the TLS-terminating reverse proxy, and interactive installers for Linux and Windows (`README.md:20-56`; `Dockerfile`; `compose.yaml`).

## Top-level parts

| Part | Responsibility | Evidence |
|---|---|---|
| `server.js`, `src/server.js` | Process entry, Express routes, sessions, RSVP capacity rules, static allowlist | `server.js:1-14`; `src/server.js:33-433` |
| `src/security.js`, `src/auth-limit.js` | scrypt password hashes, session-token hashes, IP/account auth limits | `src/security.js:1-39`; `src/auth-limit.js:1-46` |
| `src/db.js` | SQLite schema, migrations, legacy import, session pruning | `src/db.js:166-217` |
| `src/reset-password.js`, `src/seed-demo-users.js` | Admin password reset and synthetic demo accounts | `src/reset-password.js:57-105`; `src/seed-demo-users.js:43-80` |
| `public/` | Participant page, setup page, admin page, CSS, client-side exports | `public/index.html`; `public/setup.html`; `public/admin.html` |
| `deploy/`, installers, `.github/workflows/` | Container, reverse proxy, VM preview, CI, Linux/Windows installation | `Dockerfile`; `compose.yaml`; `.github/workflows/docker.yml` |
| `docs/handbuch/` | User and operations handbook | `docs/handbuch/README.md` |
| `docs/wiki/` | Existing German deep-dive project wiki | `docs/wiki/index.md` |
| `llm-wiki/` | This English, agent-facing overlay and maintenance memory | `llm-wiki/README.md` |

## How to run, test, and build

1. Install dependencies with `npm ci --ignore-scripts` (`README.md:54`; CI uses the same mode, `.github/workflows/docker.yml:23`).
2. Start locally with `npm start`. The server defaults to port `621`, binds to all interfaces, and the UI is reachable on loopback (`server.js:5-7`; `README.md:54`).
3. Run tests with `npm test`. On 2026-11-04 this produced 51 tests: 50 passed, 1 skipped (the real-Nginx preview test), 0 failed.
4. For Docker, use `docker compose pull` and `docker compose up -d`; the base mapping is loopback to container port 80 (`README.md:52`; `compose.yaml:1-13`).
5. Build the production image from `Dockerfile`; CI also builds, smoke-tests, and publishes it (`.github/workflows/docker.yml:30-90`). There is no separate frontend build.
6. Install interactively with `install.sh` (Debian/Ubuntu), `bootstrap.ps1` (Windows + Docker), or `bootstrap-native.ps1` (Windows without Docker) (`README.md:20-48`).
7. The first admin is created in the browser at `/setup`; no admin credentials come from environment variables (`README.md:58`; `src/server.js:406-417`).

## Current status

Active development, package version 2.0.0 (`package.json:3`). The last commit in this checkout is `b6c9ae5` from 2026-10-18, "feat: Namensanzeige-Schalter entfernen". The application, tests, container definition, CI, and installers are present; the current test suite is green apart from the intentionally skipped Nginx integration test.

This is not a finished production deployment. The repository does not fix a production host, domain, certificate paths, backup/restore ownership, or an instance count (`docs/wiki/planung.md:5`). The final event name, rules, texts, and pin are also operational data, not repository facts (`docs/wiki/planung.md:6`).

## Explicit non-goals and boundaries

- **One event at a time.** The next evening is prepared by resetting responses and editing the event, not by running multiple events (`README.md:62`; `docs/handbuch/wichtig-zu-wissen.md:5`).
- **No invite-only registration.** Open registration is intentional (`docs/handbuch/sicherheit.md:17`).
- **No multi-instance coordination.** Capacity checks, auth limits, and the write queue are process-local (`docs/wiki/planung.md:5`; `docs/handbuch/sicherheit.md:19`).
- **No Origin/CSRF check and no `Secure` cookie.** The app is HTTP behind a proxy; `SameSite=Lax` and loopback binding are the remaining controls (`README.md:57`; `docs/handbuch/sicherheit.md:9,21`).
- **The Node process is not meant to be directly public.** TLS terminates at the proxy (`README.md:57`; `docs/handbuch/betrieb.md:79-86`).
- **No multi-tenant or role-management system.** There is one admin flag and normal member accounts (`src/db.js:172-175`; `src/server.js:76-79`).

## Unknowns

- Production host, public domain, real certificate paths, backup/restore process, and desired instance count. **Confidence: low.** Source: `docs/wiki/planung.md:5`; `docs/wiki/entwicklung/lokal-starten.md:58`.
- Final event name, rules, information texts, and actual map pin. **Confidence: low.** Source: `docs/wiki/planung.md:6`.
- Full Windows Docker Desktop installer run, WSL2 reboot, and Linux update path. **Confidence: low.** Source: `docs/wiki/planung.md:10`; `docs/wiki/entwicklung/lokal-starten.md:22`.
- Browser-only map search, PDF/PNG rendering, and real downloads are not fully automated. **Confidence: low.** Source: `docs/wiki/entwicklung/lokal-starten.md:32`.
- The VM preview cookie assertion currently conflicts with the app's cookie policy; see [the contradiction page](contradictions/2026-11-04-preview-cookie-check.md).

## Related pages

- [Current project state](current-project-state.md)
- [Architecture overview](architecture/overview.md)
- [HTTP API](architecture/http-api.md)
- [Data model](architecture/data-model.md)
- [Frontend](architecture/frontend.md)
- [Security](architecture/security.md)
- [Delivery and operations](architecture/delivery.md)
- [Runbook](operations/runbook.md)
- [Index](index.md)
- [README](../../README.md)
- [Handbook](../../docs/handbuch/README.md)
- [Existing German wiki](../../docs/wiki/index.md)
