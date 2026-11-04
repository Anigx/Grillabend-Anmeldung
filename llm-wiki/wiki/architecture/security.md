# Security

Status: active
Last verified: 2026-11-04
Confidence: high

## Purpose

This page records the security model that the code actually implements, the deliberate reductions, and the risks that remain. The operator-facing version is [docs/handbuch/sicherheit.md](../../../docs/handbuch/sicherheit.md).

## What exists

### Authentication and sessions

- Passwords use scrypt with explicit versioned costs `N=16384, r=8, p=5` and a 32 MiB memory cap; old hashes with `p=1` remain verifiable and are rehashed after a successful login (`src/security.js:5-33`).
- Session tokens are 32 random bytes. Only a SHA-256 hash is stored in SQLite. The cookie is `sid=...; HttpOnly; SameSite=Lax; Path=/` without `Secure` (`src/server.js:49-66`; `src/security.js:35-37`).
- Sessions expire after seven days; each account keeps at most ten active sessions (`src/server.js:8,89-109`; `src/db.js:205-211`).
- Password changes revoke all existing sessions and issue a fresh cookie only to the current browser. A login verified against an old hash cannot issue a session after a concurrent password change (`src/server.js:89-109,229-258`).

### Authorization and input handling

- Admin rights are checked server-side from the session row, not from a browser-supplied name or flag (`src/server.js:76-79`).
- `/admin`, `GET`/`PUT /api/admin/party-info`, `GET /api/admin/users`, and the reset route are admin-only (`src/server.js:285-362,418`).
- Usernames are 2–40 characters from letters, numbers, space, `_`, `.`, `-`; new passwords require 12+ characters, upper/lower case, a digit, and a special character (`src/server.js:17-21,116-138`).
- JSON bodies are limited to 16 KB; SQL is parameterized; the only dynamic table names in migrations come from a hard-coded list (`src/server.js:43`; `src/db.js:146-164`).
- Auth writes are limited per client IP (30 per 10 minutes) and per account/name (60 per 10 minutes), with `Retry-After` (`src/auth-limit.js:1-43`).
- The session cookie is `HttpOnly`; browser code never reads the token (`src/server.js:49-51`).

### Deliberate reductions

- **No Origin or `Sec-Fetch-Site` check.** The app accepts writes with a valid session and JSON body; `SameSite=Lax` is the remaining CSRF brake (`README.md:57`; `docs/handbuch/sicherheit.md:9`).
- **No `Secure` cookie**, even behind HTTPS. TLS is expected to terminate at the proxy, and the app must not be directly public (`docs/handbuch/sicherheit.md:21`).
- **Open registration.** Any new account can see event details and other responses; this is intentional (`docs/handbuch/sicherheit.md:17`).
- **No global rate limit** on static/vendor assets; only auth writes are limited (`docs/handbuch/sicherheit.md:18`).

## How it works

1. A login/registration verifies the password, checks the current hash again inside the write queue, creates a random token, stores its hash, and sets the cookie (`src/server.js:89-109,153-166`).
2. A protected request parses `sid`, hashes it, joins `sessions` to `users`, and checks expiry (`src/server.js:53-74`).
3. Admin routes add a second check for `is_admin = 1` (`src/server.js:76-79`).
4. Account changes and RSVPs run inside the same in-process write queue as capacity checks, preventing the last-place race on one instance (`src/server.js:81-87`).
5. Errors return generic messages; malformed JSON is 400 and oversized bodies are 413 (`src/server.js:428-432`).

## Interfaces and data

- Cookie name `sid`; attributes `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Secure`.
- Auth limits: 30 per client IP / 10 min, 60 per account or name / 10 min; 429 with `Retry-After` (`src/auth-limit.js:31-41`).
- Environment variables are treated as trusted operator input, not attacker input (`docs/handbuch/sicherheit.md:24`).
- No secret values are documented here; certificate keys, admin passwords, and session tokens must stay out of the repository and this wiki.

## Contradictions and superseded claims

- `docs/wiki/features/administration.md:13` says the reset is protected "against foreign origins". That is not true in the current code: there is no Origin check, only session + password + `SameSite=Lax` (`src/server.js:299-322`; `docs/wiki/api/http-endpunkte.md:5`). See [the documentation-drift contradiction](../contradictions/2026-11-04-legacy-wiki-drift.md).
- The VM preview assertion still expects a `Secure` cookie, while the app and container smoke test do not. See [the preview-cookie contradiction](../contradictions/2026-11-04-preview-cookie-check.md).

## Risks and gotchas

| Risk | Why it matters | Current boundary |
|---|---|---|
| App exposed without proxy | HTTP credentials/cookies in clear; no `Secure`; no Origin check | Loopback publish + proxy template; operator must enforce |
| Open registration | Anyone can join and read event/response data | Product decision; no invite gate |
| LAN mode | HTTP over LAN; credentials/cookies unencrypted | Installer warning; trusted networks only |
| Single process | Limits and capacity reservations do not span instances | One instance until redesigned |
| Auth limit map full | New keys are refused rather than clearing active limits | 429 with `Retry-After`; bounded map |
| Static routes unlimited | Minor DoS surface | Accepted in the private setting |

## Open questions

- Should the app add Origin checks or `Secure` cookies if it is ever exposed beyond a trusted proxy? **Confidence: low.** The current decision is explicitly no (`docs/wiki/entscheidungen/neuaufbau.md:8`).
- Should registration be limited separately from auth writes? **Confidence: low.** `docs/wiki/planung.md:5` says additional registration limits are not part of the current change.

## Related pages

- [Architecture overview](overview.md)
- [HTTP API](http-api.md)
- [Data model](data-model.md)
- [Delivery](delivery.md)
- [Existing German security handbook](../../../docs/handbuch/sicherheit.md)
- [Existing German decisions page](../../../docs/wiki/entscheidungen/neuaufbau.md)
