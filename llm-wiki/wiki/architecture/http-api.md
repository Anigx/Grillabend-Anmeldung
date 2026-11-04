# HTTP API

Status: active
Last verified: 2026-11-04
Confidence: high

## Purpose

The API is the contract between the browser pages and the Express server. This page summarizes the routes, who may call them, and the invariants that matter when changing a handler. The existing German wiki has the longer endpoint narrative: [HTTP-Endpunkte](../../../docs/wiki/api/http-endpunkte.md).

## What exists

All routes are defined in `src/server.js`. JSON bodies are limited to 16 KB; `/api/*` responses carry `Cache-Control: no-store`; unknown API paths return JSON 404 (`src/server.js:43-47,404`). Browser calls use relative paths (`public/js/app.js:8-21`; `public/js/admin.js`).

### Public and member routes

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /api/setup` | none | Create the first admin; only while no admin exists |
| `POST /api/register` | none | Create a member account and issue a session |
| `POST /api/login` | none | Verify credentials and issue a session |
| `GET /api/session` | optional | Return current username/admin flag or nulls |
| `POST /api/logout` | user | Delete the current session and clear the cookie |
| `PUT /api/profile/username` | user | Rename after current-password check |
| `PUT /api/profile/password` | user | Change password, revoke other sessions, issue a fresh cookie |
| `GET /api/party-info` | user | Event data, rules, info, optional pin |
| `GET /api/attendees` | user | Joined RSVP rows with `is_self`; no timestamps |
| `POST /api/rsvp` | user | Upsert own response, with capacity checks |
| `DELETE /api/rsvp` | user | Delete own response |

### Admin routes

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/admin/party-info` | admin | Editable event data plus occupancy |
| `GET /api/admin/users` | admin | All accounts with optional RSVP fields |
| `POST /api/admin/reset-rsvps` | admin + password | Delete all active and legacy responses |
| `PUT /api/admin/party-info` | admin | Validate and save event data, capacities, pin |

### Pages and static files

`GET /` serves `public/index.html` or redirects to `/setup` while no admin exists. `GET /setup` is available only while no admin exists. `GET /admin` requires an admin session. The explicit static list is CSS and JS files plus the vendor libraries; everything else is not exposed (`src/server.js:11,406-427`).

## How it works

1. **Setup is atomic.** `POST /api/setup` inserts an admin only if no `is_admin = 1` row exists; a second attempt returns 409 (`src/server.js:113-131`).
2. **Registration is open and atomic.** The server validates the name and password, then inserts only if the case-insensitive name does not exist; parallel duplicate attempts cannot both succeed (`src/server.js:133-151`).
3. **Sessions are server-side.** The cookie is `HttpOnly; SameSite=Lax`, without `Secure`; the token is random and only its hash is stored (`src/server.js:49-66`; `src/security.js:35-37`).
4. **Profile changes re-authenticate.** Both profile writes require the current password, run in the shared write queue, and return 422 for a wrong password (`src/server.js:184-258`).
5. **RSVP validation is strict.** `kommt` is `Ja`, `Nein`, or `Vielleicht`; `huette`, `luftmatratze`, and `bettzeug` are `Ja`/`Nein`. Sleeping is only possible with `kommt = Ja`; equipment is only possible with `huette = Ja` (`src/server.js:364-372`).
6. **Capacity failures return 409.** The check excludes the caller's own existing row, so changing an existing response does not double-count it (`src/server.js:373-384`).
7. **Event edits cannot shrink below occupancy.** The update is rejected with 409 if a new capacity is below current occupancy (`src/server.js:343-360`).
8. **Admin reset requires the current admin password.** Successful reset deletes `rsvps` and `rsvps_legacy_names`; accounts, sessions, and event data remain (`src/server.js:299-322`).
9. **Errors are generic.** Malformed JSON returns 400, oversized bodies 413, internal failures 500 without internal details (`src/server.js:428-432`).

## Interfaces and data

- Request bodies use JSON; `username` is 2–40 characters from letters, numbers, space, `_`, `.`, `-`.
- New passwords need at least 12 characters, upper and lower case, a digit, and a non-letter/non-digit/non-space character (`src/server.js:17-21`).
- `GET /api/attendees` returns `username`, `kommt`, `huette`, `luftmatratze`, `bettzeug`, and `is_self`; it deliberately omits `updated_at` (`src/server.js:265-274`).
- `GET /api/admin/users` returns all accounts, left-joined to RSVPs, including accounts without a response (`src/server.js:290-297`).
- Admin event coordinates are either both null or both valid numbers; the server derives the Google Maps link from a pin (`src/server.js:324-356`).

## Risks and gotchas

- **No Origin/CSRF check.** Write requests need only a valid session; `SameSite=Lax` is the remaining browser-side control (`README.md:57`; `docs/handbuch/sicherheit.md:9`).
- **No global rate limit.** Only auth writes are limited; static/vendor assets are not (`docs/handbuch/sicherheit.md:18`).
- **Auth limits are process-local.** A restart clears them; multiple instances do not share them (`src/auth-limit.js:6-43`; `docs/handbuch/sicherheit.md:19`).
- **Open registration changes the privacy boundary.** Any new account can call member routes and see event/response data (`docs/handbuch/sicherheit.md:17`).
- **PATCH is not used.** The route table is the source of truth; do not infer additional endpoints from the UI.

## Open questions

- Should write routes gain an Origin check if the app is ever exposed beyond a trusted proxy? **Confidence: low.** The current decision is explicitly no (`docs/wiki/entscheidungen/neuaufbau.md:8`).
- Should account creation get a stricter registration limit? **Confidence: low.** The current docs say additional limits are not part of the current change (`docs/wiki/planung.md:5`).

## Related pages

- [Architecture overview](overview.md)
- [Data model](data-model.md)
- [Security](security.md)
- [Frontend](frontend.md)
- [Existing German API page](../../../docs/wiki/api/http-endpunkte.md)
