# Current Project State

Last updated: 2026-11-04
Last verified: 2026-11-04
Status: active
Confidence: high

## Purpose

This is the rolling snapshot of the project: what works, what is broken or unverified, what comes next, and which risks are active. It is not a history; older detail belongs in [log.md](log.md) or the relevant area page.

## Snapshot

Grillabend-Anmeldung is at package version 2.0.0 and is functionally complete for a single grill evening: open registration, server-side sessions, RSVP with cabin/air-mattress/bedding capacity, first-run admin setup, admin event editing, user overview, exports, and an admin reset for the next evening. The last commit is `b6c9ae5` (2026-10-18), which removed the name-visibility switch. The local suite is green: 51 tests, 50 passed, 1 skipped, 0 failed on 2026-11-04.

## What works

- **Participant flow:** login/register, session restore, yes/no/maybe, cabin sleep, independent air-mattress and bedding choices, edit/delete RSVP (`public/index.html`; `public/js/app.js`; `src/server.js:364-402`).
- **First-run setup:** `/` redirects to `/setup` until an admin exists; `POST /api/setup` creates exactly one first admin (`src/server.js:113-131,406-417`).
- **Admin flow:** event data, map pin, capacities, rules/info, occupancy, all-account overview, filtered exports, password-confirmed RSVP reset (`public/admin.html`; `public/js/admin.js`; `src/server.js:276-362`).
- **Security basics:** scrypt with explicit costs, hashed session tokens, `HttpOnly; SameSite=Lax` cookies, per-IP/account auth limits, server-side admin checks, 16 KB JSON limit, parameterized SQL (`src/security.js`; `src/auth-limit.js`; `src/server.js:43-47,111-166`).
- **Persistence and migration:** SQLite schema creation, legacy name-table migration, bedding-column split, optional read-only legacy import, session pruning (`src/db.js:57-217`).
- **Delivery:** Docker image, Compose service, Nginx templates, Linux/Windows installers, CI build/smoke/publish, manual VM preview (`.github/workflows/docker.yml`; `deploy/`; `install*`).
- **Tests:** `npm test` covers API behavior, security, exports, migrations, seed CLI, and an optional real-Nginx test (`test/`).

## What is broken or unverified

- **VM preview cookie check is inconsistent.** `deploy/preview-vm.sh:96` requires a `Secure` cookie, but the app sets none (`src/server.js:50`) and the container smoke test explicitly asserts no `Secure` (`deploy/smoke-image.cjs:26-27`). The preview check therefore cannot pass as written. See [the contradiction](contradictions/2026-11-04-preview-cookie-check.md).
- **Active documentation has stale post-refactor claims.** `docs/wiki/features/administration.md:9,13` still describes a name-visibility setting and Origin protection; `docs/wiki/daten/sqlite.md:16` and `docs/wiki/entscheidungen/neuaufbau.md:7` still describe a configured admin account/password. These conflict with the current code and README. See [the drift page](contradictions/2026-11-04-legacy-wiki-drift.md).
- **No multi-instance safety.** Capacity checks, auth limits, and the write queue live in one Node process (`src/server.js:81-87`; `docs/handbuch/sicherheit.md:19`).
- **Open registration exposes event and response data.** This is intentional but remains a privacy risk (`docs/handbuch/sicherheit.md:17`).
- **No `Secure` cookies and no Origin/CSRF check.** Acceptable only behind the proxy and loopback binding (`docs/handbuch/sicherheit.md:9,21`).
- **Installer coverage is partial.** A full Windows Docker Desktop run, WSL2 reboot, Linux update path, and ARM64 native run are not proven in the docs (`docs/wiki/planung.md:9-10`; `docs/wiki/entwicklung/lokal-starten.md:22`).
- **Browser-only behavior is not fully automated.** Map search, PDF/PNG rendering, and real downloads remain manual checks (`docs/wiki/entwicklung/lokal-starten.md:32`).

## What is next

1. Fix the VM preview cookie assertion or deliberately add `Secure` at the proxy, then re-run the manual preview workflow (T-001).
2. Reconcile the stale claims in `docs/wiki` and the handbook with the post-HTTP-only code (T-002).
3. Decide and record the production operating model: host, domain, TLS certificate ownership, backup/restore, and single- vs multi-instance (T-003).
4. Keep the overlay in sync and run the first lint pass after the next substantial wiki change (M-001, M-002).

## Active risks

| Risk | Impact | Current control | Source |
|---|---|---|---|
| Open registration | Any new account can read event and RSVP data | Product decision; no invite gate | `docs/handbuch/sicherheit.md:17` |
| No `Secure` cookie | Session cookie can travel over HTTP if the proxy is bypassed | App bound to loopback behind proxy; `SameSite=Lax` | `docs/handbuch/sicherheit.md:9,21` |
| No Origin/CSRF check | Same-site or legacy-browser write attempts | `SameSite=Lax`; proxy-only exposure | `docs/handbuch/sicherheit.md:9,20` |
| Single process | Capacity race across multiple instances | In-process write queue | `src/server.js:81-87` |
| Startup migrations | A bad migration can affect the only database | Transactions; backup before upgrade | `src/db.js:120-164`; `docs/handbuch/betrieb.md:120-124` |
| Preview workflow mismatch | Manual VM preview stops at the cookie assertion | None; static defect | `deploy/preview-vm.sh:96`; `deploy/smoke-image.cjs:26-27` |

## Related pages

- [Overview](overview.md)
- [Tasks](tasks.md)
- [Log](log.md)
- [Architecture overview](architecture/overview.md)
- [Security](architecture/security.md)
- [Delivery](architecture/delivery.md)
- [Contradictions index](contradictions/README.md)
