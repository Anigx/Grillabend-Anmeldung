# Grillabend-Anmeldung LLM Wiki

Language: English
Visibility: public
Scope: full filtered
Schema: 1
Created: 2026-11-04
Last updated: 2026-11-04

## Purpose

This wiki is the durable, compounding memory of Grillabend-Anmeldung. It is the English, agent-facing entry point: read the index first, then the page that matches the task, then the existing German deep-dive under `docs/wiki/` where more detail is needed. It is not a RAG index.

## Relationship to `docs/wiki`

The repository already had a maintained German project wiki when this overlay was created. The user chose an **overlay** rather than a second full wiki:

- `llm-wiki/` owns the agent entry point, current state, tasks, log, changelog, compact architecture/security/delivery summaries, and contradiction records.
- `docs/wiki/` remains the German deep-dive and the authoritative long-form documentation for architecture, API details, data migrations, feature behavior, and visual design.
- `docs/handbuch/` remains the user and operations handbook.
- When a fact changes, update its owning page. If the fact is long-form German detail, that is `docs/wiki`; if it is agent state, a task, a summary, or a conflict, that is `llm-wiki`. Link, do not duplicate.
- Code and verified project files win over every wiki claim. If sources disagree, keep both claims with sources and a status, then file the conflict.

## The three layers

- `raw/` — immutable sources. Read-only. Never edit a file in `raw/`. If a source changes, add a new version and mark the old one `superseded`. **This layer is currently absent:** no document was explicitly historical enough to migrate. `docs/wiki` is active documentation, not raw history.
- `wiki/` — curated, LLM-maintained pages. Extend and rewrite them; do not append chronological notes to topic pages.
- `AGENTS.md` plus this file — the schema. Keep both in sync. The `AGENTS.md` block is the short contract; this file is the full schema.

## Reading order

1. `wiki/index.md`
2. `wiki/current-project-state.md`
3. `wiki/tasks.md`
4. The pages linked from the index that match the task
5. Recent entries in `wiki/log.md`

For deep detail, follow the explicit links to `docs/wiki/` and `docs/handbuch/`.

## Operations

### Ingest

1. Put an external source in `raw/` unchanged, if and only if it is a historical source. Create `raw/README.md` with path, original path, origin, date, license, status, and notes.
2. Read it and summarize the key takeaways.
3. Update every affected page; one source may touch many pages.
4. Update `index.md`, `log.md`, and `changelog.md` when the outcome is durable.
5. If the source contradicts an existing claim, do not silently overwrite it: mark the old claim `superseded`, keep both with sources, and record the conflict under `contradictions/` if it spans pages.

For large or ambiguous sources, summarize the intended changes and ask before writing.

For a code change, prefer the code itself as the source. Update the `llm-wiki` summary and the owning `docs/wiki` page if the deeper page is now stale.

### Query

1. Read `index.md` first, then the relevant pages.
2. Answer with citations to the pages and, through them, to `raw/` sources or code paths.
3. If the answer synthesizes several pages and is likely to be reused, file it as `analyses/YYYY-MM-DD-short-title.md`, link it from `index.md`, and log it.

### Lint

Run when the wiki grows by roughly 20 pages or before a release:

- contradictions between pages
- claims that a newer source superseded
- orphan pages with no inbound links
- important concepts mentioned but lacking a page
- missing cross-references
- broken relative links
- near-duplicate pages that should be merged
- open questions that can now be answered
- drift between `llm-wiki` summaries and the cited code or `docs/wiki` pages

File findings as tasks. Record the lint pass in `log.md`.

## Rules

- Extend before create: search the index and existing pages for a near-duplicate before adding a page.
- Rewrite, don't append: topic pages are syntheses, not diaries.
- `raw/` is immutable when present.
- No secrets; paths and variable names only. Never copy passwords, tokens, keys, cookies, connection strings, account identifiers, or personal data.
- This wiki is **public**: no internal IPs, hostnames, private domains, customer names, or email addresses. Use roles and repository-internal paths.
- Relative Markdown links only. No `[[wikilinks]]`; every link must resolve from the page that contains it.
- Filenames are lowercase kebab-case ASCII. Content is English; code identifiers, commands, and UI labels keep their original form.
- One source of truth per fact. Summarize and link; do not copy large blocks from `README.md`, `docs/wiki`, or `docs/handbuch`.
- Mark uncertainty with `Confidence: low` and open questions.
- Wiki content does not authorize code changes by itself.
- No orphan pages: every page is reachable from `wiki/index.md`.

## Scale

The index is the retrieval layer up to a few hundred pages. Beyond that, add a local Markdown search tool (for example qmd) or split the index by area. Do not add embeddings by default.

## Task and log conventions

- One task = one checkbox = one verifiable acceptance criterion.
- Done tasks are dated, proved, and moved to `Done`; never deleted.
- `log.md` is append-only and newest first. Use a consistent prefix:
  `## [YYYY-MM-DD] <type> | <title>`.
- Types include `ingest`, `query`, `lint`, `bootstrap`, `feature`, `fix`, `docs`, `ops`, `verification`.
- `changelog.md` records outcomes, not work.

## Schema

This file is the full schema. The `AGENTS.md` block is the short contract. When a convention changes, update both together and add a log entry. If the change is significant, write an ADR.

Current schema version: **1**. The overlay decision is recorded in `wiki/decisions/2026-11-04-wiki-overlay.md`.
