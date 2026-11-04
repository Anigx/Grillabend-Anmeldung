# Data Model

Status: active
Last verified: 2026-11-04
Confidence: high

## Purpose

The application stores all state in one SQLite file. This page explains the tables, the ownership model, and the startup migrations that make older installations usable without silently reassigning old answers. The longer German page is [SQLite-Daten und Übernahme](../../../docs/wiki/daten/sqlite.md).

## What exists

| Table | Key columns | Role |
|---|---|---|
| `users` | `id`, unique `username`, `password_hash`, `is_admin` | Accounts and admin flag |
| `sessions` | `token_hash`, `user_id`, `expires_at` | Server-side sessions; token is stored only as a hash |
| `rsvps` | `user_id` primary key, `kommt`, `huette`, `luftmatratze`, `bettzeug`, `updated_at` | One current response per account |
| `rsvps_legacy_names` | `username` primary key, same response fields | Preserved name-bound legacy answers; not exposed through member/admin APIs |
| `party_info` | `id = 1`, date/place/address/maps, capacities, rules, info, `latitude`, `longitude` | The single current event |
| `metadata` | `key`, `value` | Legacy-import marker and demo-seed tracking |

Schema creation is in `src/db.js:170-195`. The RSVP table is defined separately for migrations at `src/db.js:113-118`.

## How it works

1. **Database location:** default `data/app.sqlite` under the project; `DATA_DIR` overrides it (`src/server.js:34-37`). In Docker the data directory is the persistent volume `grillabend-data` (`compose.yaml:8-13`).
2. **Startup migration order:** create missing tables → add missing coordinate columns → migrate old name-bound RSVPs → split the old single bedding column → import legacy databases → ensure `party_info` row → delete expired sessions → cap sessions per account (`src/db.js:170-211`).
3. **Name-bound migration:** if `rsvps` still has `username` and no `user_id`, the old table is renamed to `rsvps_legacy_names`, a new ID-based table is created, and only unambiguous single-owner answers are copied. Ambiguous or orphaned answers stay in the legacy table (`src/db.js:120-144`).
4. **Bedding split:** an existing `bettgarnitur` value is copied to both `luftmatratze` and `bettzeug`, then the old column is dropped; the old `max_bettgarnitur` becomes both new capacities (`src/db.js:146-164`).
5. **Legacy import:** if `accounts.sqlite`, `party_eintraege.sqlite`, and `Datum.sqlite` exist in the project root, the server reads them once, hashes plaintext passwords, and writes into an empty new database. Any error rolls back; a metadata marker prevents a second import (`src/db.js:57-111`). The old files are not present in this checkout.
6. **Session pruning:** expired sessions are deleted at startup, and each account is limited to ten active sessions by expiry order (`src/db.js:205-211`; `src/server.js:89-109`).
7. **Write serialization:** `exclusive()` in `src/server.js` serializes account, session, RSVP, and capacity writes on one process. SQLite transactions are used for multi-statement changes (`src/server.js:81-87,236-253,305-318`).

## Interfaces and data

- **Ownership:** RSVPs reference immutable `users.id`; the visible name is joined from `users`. A rename or later reuse of an old name does not transfer an answer (`src/server.js:265-274`; `src/db.js:113-118`).
- **Capacity semantics:** occupancy counts only `huette = 'Ja' AND kommt = 'Ja'`; air mattress and bedding additionally require their own `Ja` (`src/server.js:276-283`).
- **Timestamps:** `rsvps.updated_at` is ISO text and is returned only through the admin users endpoint (`src/server.js:290-297`).
- **No secrets in the database docs:** password hashes and session-token hashes are stored, but no plaintext password or raw session token (`src/security.js:17-37`).

## Contradictions and superseded claims

- `docs/wiki/daten/sqlite.md:16` still refers to a "configured admin account" and its password rotation; `docs/wiki/entscheidungen/neuaufbau.md:7` says a configured admin password is compared at restart. The current code has no configured admin; the first admin is created through `/setup`, and there is no admin environment credential (`README.md:58`; `src/server.js:113-131`). See [the documentation-drift contradiction](../contradictions/2026-11-04-legacy-wiki-drift.md).
- The old `users.show_name` column is ignored by current code; new databases do not create it. Existing databases remain startable, but the column is not migrated (`src/db.js:170-195`; `test/app.test.js:727`).

## Risks and gotchas

- **One file, one point of failure.** Back up `data/app.sqlite` or the volume before upgrades, moves, or destructive resets (`docs/handbuch/betrieb.md:120-124`).
- **Startup migrations are destructive by design in the bedding split.** The old column is dropped after copying; take a backup first (`src/db.js:146-164`).
- **Ambiguous legacy rows are not surfaced.** They are preserved for manual reconciliation but do not count as active bookings (`docs/wiki/daten/sqlite.md:20`).
- **`docker compose down -v` deletes the volume.** Use `down` without `-v` to keep data (`docs/handbuch/betrieb.md:113`).
- **`data/`, `*.sqlite*`, and backups are gitignored.** Do not expect the repository to contain the current database (`.gitignore:1-6`).

## Open questions

- What backup/restore process will production use, and who owns it? **Confidence: low.** Source: `docs/wiki/planung.md:5`.
- Will production run one instance or require a shared atomic reservation? **Confidence: low.** Source: `docs/wiki/planung.md:5`.

## Related pages

- [Architecture overview](overview.md)
- [HTTP API](http-api.md)
- [Security](security.md)
- [Runbook](../operations/runbook.md)
- [Existing German data page](../../../docs/wiki/daten/sqlite.md)
