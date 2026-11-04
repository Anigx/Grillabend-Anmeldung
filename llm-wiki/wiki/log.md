# Log

## [2026-11-04] bootstrap | Initialize the English public LLM wiki overlay

- Command: User request to initialize an LLM wiki for this repository, following the provided initializer prompt.
- Type: bootstrap
- Areas affected: repository root, `docs/wiki/`, `docs/handbuch/`, `src/`, `public/`, `test/`, `deploy/`, `.github/workflows/`, `AGENTS.md`.
- Files changed: `llm-wiki/**`; `AGENTS.md` only inside the new `LLM-WIKI` block. No source, test, config, or build file was modified.
- Wiki pages updated: all pages under `llm-wiki/wiki/`.
- New wiki pages: `overview.md`, `current-project-state.md`, `tasks.md`, `log.md`, `changelog.md`, `index.md`, `architecture/overview.md`, `architecture/http-api.md`, `architecture/data-model.md`, `architecture/frontend.md`, `architecture/security.md`, `architecture/delivery.md`, `operations/runbook.md`, `decisions/README.md`, `decisions/adr-template.md`, `decisions/2026-11-04-wiki-overlay.md`, `contradictions/README.md`, `contradictions/2026-11-04-preview-cookie-check.md`, `contradictions/2026-11-04-legacy-wiki-drift.md`.
- New TODOs: T-001, T-002, T-003; maintenance M-001, M-002.
- New bugs: VM preview cookie assertion mismatch, recorded in the contradiction page rather than duplicated here.
- New decisions: ADR-0001, use `llm-wiki` as an English agent-facing overlay.
- Open questions: production host/domain/certificate ownership, backup/restore, instance count; final event details; full Windows Docker Desktop/WSL2/Linux update verification; browser-only map/export behavior; whether the VM preview should be fixed or retired.
- Next steps: resolve T-001, reconcile T-002, record the production operating model in T-003, run M-001 after the next substantial change.
- Verification: `npm test` -> 51 tests, 50 passed, 1 skipped (real-Nginx test), 0 failed on 2026-11-04. Link/index/structure checker -> 19 pages, 0 errors, 0 warnings; every page is linked from `index.md` and every relative link resolves. `git status --short` -> only `AGENTS.md` and `llm-wiki/` changed.
