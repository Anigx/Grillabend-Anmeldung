# ADR: Use `llm-wiki` as an English agent-facing overlay

Status: accepted
Date: 2026-11-04
Last verified: 2026-11-04
Confidence: high

## Purpose

Record why this repository has an English agent-facing overlay instead of a second full wiki, and how the overlay and the existing German wiki divide responsibility.

## Context

The repository already has a maintained German project wiki under `docs/wiki/` with 13 pages covering architecture, API, data, features, design, decisions, planning, and changelog (`docs/wiki/index.md`). The user asked for an `llm-wiki/` initialization, chose **public** visibility and **English** as the wiki language, and chose **overlay** when asked how to handle the existing wiki. Creating a second full wiki would duplicate facts and create two maintenance states.

## Decision

`llm-wiki/` is the English, agent-facing overlay. It owns:

- the agent entry point and reading order;
- current project state, tasks, log, and changelog;
- compact architecture/security/delivery summaries with source references;
- documented contradictions and decisions about this overlay.

`docs/wiki/` remains the German deep-dive and the authoritative long-form documentation for architecture, features, API details, data migrations, and design. `llm-wiki` links to those pages instead of copying them. When code and documentation disagree, the code wins; the affected page is corrected in the same work pass.

## Consequences

- Agents get a short English entry point with durable state, tasks, and links.
- Humans keep the existing German handbook and wiki without a disruptive migration.
- Two layers must stay in sync. `M-002 Overlay sync` in [tasks](../tasks.md) makes this explicit; a lint pass checks for drift.
- Facts that exist only in `llm-wiki` (for example, the preview-cookie contradiction) have a single home here.
- The overlay does not move or rewrite `docs/wiki`; no historical documents were migrated.

## Alternatives considered

- **Full standalone `llm-wiki`** — rejected because it would duplicate the existing wiki and create a second maintenance burden.
- **Extend `docs/wiki` only** — rejected because the user explicitly asked for `llm-wiki` and selected the overlay option.
- **Abort** — rejected because the repository has enough verified material to make the overlay useful on day one.

## Sources

- User intake on 2026-11-04: overlay, public visibility, English, full filtered scope.
- `docs/wiki/index.md`; `docs/wiki/wiki-pflege.md`.
- `README.md:18` links the existing German project wiki separately.

## Related pages

- [Decisions index](README.md)
- [Overview](../overview.md)
- [Existing German wiki index](../../../docs/wiki/index.md)
- [Existing German wiki maintenance rules](../../../docs/wiki/wiki-pflege.md)
