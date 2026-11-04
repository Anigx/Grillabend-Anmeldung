# VM Preview Cookie Check vs. HTTP-Only Cookie Policy

Status: active
Last verified: 2026-11-04
Confidence: high

## Purpose

The manual `vm-preview` workflow contains a cookie assertion that cannot pass with the current server response. This page preserves both claims and the evidence so the fix is deliberate.

## What exists

- `deploy/preview-vm.sh:96` checks the registration response header with:
  `grep -qi 'Set-Cookie:.*HttpOnly; SameSite=Lax;.*Secure'`.
- The server sets:
  `sid=...; HttpOnly; SameSite=Lax; Path=/; Max-Age=...` — no `Secure` (`src/server.js:49-51`).
- The container smoke test asserts the opposite of the preview check: it requires `HttpOnly; SameSite=Lax;` and explicitly rejects `Secure` (`deploy/smoke-image.cjs:25-27`).
- The preview proxy does not add a `Secure` flag; it only forwards HTTP and sets proxy headers (`deploy/nginx-preview.conf:14-20`).

## How it works

1. `deploy/preview-vm.sh check` runs after a public page request and an unauthenticated API check.
2. It registers a synthetic account and saves the response headers (`deploy/preview-vm.sh:89-95`).
3. It then requires the `Secure` substring (`deploy/preview-vm.sh:96`). With the current server header, the test fails under `set -e` and the workflow never publishes the preview deployment URL.
4. This was not reproduced on a VM in this pass; it is a static contradiction between two checked-in assertions. The container smoke test already encodes the intended HTTP-only behavior.

## Contradictions and superseded claims

- **Preview claim:** session cookies should include `Secure` (`deploy/preview-vm.sh:96`).
- **Application and smoke-test claim:** session cookies must not include `Secure` (`src/server.js:50`; `deploy/smoke-image.cjs:26-27`).
- **Likely cause:** the HTTP-only refactor removed `Secure` from the app and smoke test but left the preview check behind. The existing German wiki still describes a successful preview check without naming this attribute (`docs/wiki/entwicklung/lokal-starten.md:50`).

## Interfaces and data

- Cookie header: `sid`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Secure` (`src/server.js:49-51`).
- Preview workflow: manual `workflow_dispatch`; temporary GitHub VM; synthetic account only (`vm-preview.yml:1-52`).
- No production data or secrets are involved.

## Risks and gotchas

- The manual preview is currently unreliable as a release check.
- If the fix is to add `Secure` at the proxy, the smoke test and the app's documented HTTP-only policy must change together; do not create a browser-only cookie that works in preview but not in the documented deployment.
- The recommended fix is to update the preview assertion to match the HTTP-only policy, unless the project deliberately decides to add `Secure` at the proxy.

## Open questions

- Should the preview workflow be kept, or replaced by a simpler container/TLS check? **Confidence: low.**
- If `Secure` is desired, should Nginx add it with `proxy_cookie_flags`, or should the app set it conditionally? **Confidence: low.**

## Related pages

- [Tasks](../tasks.md) — T-001
- [Delivery](../architecture/delivery.md)
- [Security](../architecture/security.md)
- [Contradictions index](README.md)
