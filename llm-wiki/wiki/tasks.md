# Tasks

> One task = one checkbox = one verifiable acceptance criterion.
> Done means checked, dated, and moved to **Done** with proof.
> Never delete a task; move it.

## Now

- [ ] **T-001 Align the VM preview cookie assertion.** Acceptance: `deploy/preview-vm.sh` no longer requires a `Secure` cookie that the server does not set, or the proxy deliberately adds `Secure` and `deploy/smoke-image.cjs` plus the documented policy are updated in the same change; `npm test` passes; a manual `vm-preview` run reaches deployment success. Evidence: [preview-cookie contradiction](contradictions/2026-11-04-preview-cookie-check.md).
- [ ] **T-002 Reconcile stale claims in active documentation.** Acceptance: the name-visibility description in `docs/wiki/features/administration.md:9` and `docs/handbuch/bedienung.md:41`, the "foreign origins" claim in `docs/wiki/features/administration.md:13`, and the configured-admin claims in `docs/wiki/daten/sqlite.md:16` and `docs/wiki/entscheidungen/neuaufbau.md:7` are corrected or marked superseded; a repository search for `Meinen Namen anzeigen`, `anonymen Einträgen`, `gegen fremde Origins`, `ADMIN_USERNAME`, and `konfigurierten Admin` returns no active stale claim; `npm test` passes. Evidence: [legacy-wiki drift](contradictions/2026-11-04-legacy-wiki-drift.md).

## Next

- [ ] **T-003 Decide the production operating model.** Acceptance: one accepted ADR records the production host class, domain/TLS ownership, certificate renewal, backup/restore owner, and desired instance count; the user confirms it; no secret values are stored; `overview.md` and `current-project-state.md` link to it. Source: `docs/wiki/planung.md:5`; `docs/wiki/entwicklung/lokal-starten.md:58`.

## Backlog candidates (unverified)

- None found on 2026-11-04. A search over `src/`, `public/`, and `test/` found no `TODO`, `FIXME`, `XXX`, or `HACK` markers. `Unklar:` items in the German docs are open questions, not tasks; they need an acceptance criterion before promotion.

## Maintenance

- [ ] **M-001 Lint pass.** Run when the wiki grows by roughly 20 pages or before a release. Acceptance: contradictions, superseded claims, orphan pages, missing pages, cross-references, broken links, near-duplicates, and open questions reviewed; findings filed as tasks.
- [ ] **M-002 Overlay sync.** After a code or documentation change, verify that every `llm-wiki` summary still matches its cited code; update the owning `docs/wiki` page for deep detail; check that all cross-links resolve. Acceptance: no stale summary remains and `log.md` records the pass.

## Done

- [x] **T-000 Baseline verification.** Done 2026-11-04. Proof: `npm test` produced 51 tests, 50 passed, 1 skipped (real-Nginx test), 0 failed; the wiki self-check and relative-link check passed in the same pass.
