# Changelog

## 2026-11-04

- Initialized `llm-wiki/` as the English, public, agent-facing overlay over the existing German `docs/wiki/`. The overlay adds a short reading path, current state, tasks, log, architecture/security/delivery summaries, decisions, and contradiction records. Existing documentation was not rewritten. ([log](log.md), [overview](overview.md), [ADR](decisions/2026-11-04-wiki-overlay.md))
- Documented the VM preview cookie mismatch: the preview script requires a `Secure` cookie that the app and container smoke test deliberately do not set. ([contradiction](contradictions/2026-11-04-preview-cookie-check.md), [task](tasks.md))
- Documented stale German documentation around removed name visibility, Origin protection, and the former configured admin. ([contradiction](contradictions/2026-11-04-legacy-wiki-drift.md), [task](tasks.md))
- Verified the current baseline: `npm test` -> 51 tests, 50 passed, 1 skipped, 0 failed. ([log](log.md))
