# Legacy Wiki Drift After the HTTP-Only and Name-Visibility Changes

Status: active
Last verified: 2026-11-04
Confidence: high

## Purpose

Several active German documentation pages still describe behavior that the current code no longer has. This page records the conflicting claims with sources so an agent does not implement the stale version.

## What exists

### Name visibility

- Stale: `docs/wiki/features/administration.md:9` says the setting "Meinen Namen anzeigen" affects the member list and that admins still see real names "auch bei anonymen Einträgen".
- Stale: `docs/handbuch/bedienung.md:41` says admins see names "auch bei in der Mitgliederansicht anonymen Einträgen".
- Current: the switch, `PUT /api/profile/visibility`, and the `show_name` behavior were removed. `GET /api/attendees` always returns real account names (`docs/wiki/features/anmeldung-und-teilnahme.md:17`; `docs/wiki/api/http-endpunkte.md:29`; `test/app.test.js:103`).
- Current code has no visibility route: `src/server.js` defines the profile routes at lines 195-258 only; there is no `/api/profile/visibility` handler.

### Origin protection

- Stale: `docs/wiki/features/administration.md:13` says the reset is protected "gegen fremde Origins".
- Current: there is no Origin or `Sec-Fetch-Site` check and no `APP_ORIGIN`; `SameSite=Lax` is the remaining CSRF brake (`README.md:57`; `docs/handbuch/sicherheit.md:9`; `docs/wiki/api/http-endpunkte.md:5`).
- The reset route does require an admin session plus the current admin password, but that is authentication, not origin protection (`src/server.js:299-322`).

### Configured admin

- Stale: `docs/wiki/daten/sqlite.md:16` describes a "konfigurierten Admin-Konto" and a password rotation of that account.
- Stale: `docs/wiki/entscheidungen/neuaufbau.md:7` says a configured admin password differing at restart updates the hash and deletes that admin's sessions.
- Current: there are no admin environment credentials. The first admin is created through `/setup`; afterward admins are normal accounts (`README.md:58`; `src/server.js:113-131,406-417`; `docs/handbuch/betrieb.md:16`).

## How it works

1. The code and the newer pages agree on the current behavior: no name-visibility feature, no Origin check, no configured admin.
2. The stale sentences are leftovers from earlier versions. They are isolated claims, not a coherent alternative design.
3. This page keeps both sides visible. The resolution is a documentation task (T-002), not a code change.

## Contradictions and superseded claims

| Claim | Source | Status |
|---|---|---|
| Name visibility setting exists | `docs/wiki/features/administration.md:9`; `docs/handbuch/bedienung.md:41` | superseded by `docs/wiki/features/anmeldung-und-teilnahme.md:17`; `test/app.test.js:103` |
| Reset is protected against foreign origins | `docs/wiki/features/administration.md:13` | superseded by `README.md:57`; `docs/handbuch/sicherheit.md:9` |
| Configured admin password/env exists | `docs/wiki/daten/sqlite.md:16`; `docs/wiki/entscheidungen/neuaufbau.md:7` | superseded by `README.md:58`; `src/server.js:113-131` |

## Interfaces and data

- No API or schema change is implied by this page. It is a documentation-drift record.
- The current profile routes are `PUT /api/profile/username` and `PUT /api/profile/password` (`src/server.js:195-258`).
- The current admin creation path is `POST /api/setup` plus `/setup` (`src/server.js:113-131,412-417`).

## Risks and gotchas

- An agent following the stale pages could reintroduce a removed visibility control or look for nonexistent admin environment variables.
- The German wiki is still the deep-dive source; correcting it is a maintainer task, not something this overlay may do during initialization.
- Code wins when docs disagree; record the correction in `log.md` when it happens.

## Open questions

- Should the stale German pages be corrected in place, or should each get a short "superseded" note? **Confidence: low.** T-002 can choose either, as long as the active claim is clear.
- Are there other stale claims not found in this pass? A full lint of `docs/wiki` is still needed. **Confidence: low.**

## Related pages

- [Tasks](../tasks.md) — T-002
- [Data model](../architecture/data-model.md)
- [Security](../architecture/security.md)
- [Frontend](../architecture/frontend.md)
- [Contradictions index](README.md)
- [Existing German wiki index](../../../docs/wiki/index.md)
