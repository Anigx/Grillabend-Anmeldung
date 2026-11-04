# LLM Wiki Index

Grillabend-Anmeldung is a German-language, single-event RSVP and planning app: open registration, server-side sessions, yes/no/maybe responses, cabin places, independent air-mattress and bedding needs, and an admin console for the event, capacities, rules, map pin, users, exports, and reset. Node 22 + Express 5 + `node:sqlite`; Docker/Compose behind a TLS proxy; no frontend build step.

This is the **English, agent-facing overlay**. The existing German deep-dive remains in [docs/wiki](../../docs/wiki/index.md); the operator handbook is [docs/handbuch](../../docs/handbuch/README.md). This wiki summarizes and links; it does not replace the German pages.

## Start here

Read in this order before a non-trivial change:

1. [Overview](overview.md) — purpose, stack, run/test/build, status, boundaries.
2. [Current project state](current-project-state.md) — what works, what is broken or unverified, active risks.
3. [Tasks](tasks.md) — open work with acceptance criteria.
4. The area page that matches the change (architecture, security, delivery, frontend, data).
5. Recent [log](log.md) entries and the [changelog](changelog.md).

## Areas

### Core

| Page | Description |
|---|---|
| [Overview](overview.md) | Project purpose, audience, stack, top-level parts, commands, current status, non-goals, unknowns |
| [Current project state](current-project-state.md) | Rolling snapshot of what works, what is broken/unverified, next steps, risks |
| [Tasks](tasks.md) | Now / Next / Backlog candidates / Maintenance / Done |
| [Log](log.md) | Append-only work log, newest first |
| [Changelog](changelog.md) | Completed outcomes for humans |

### Architecture

| Page | Description |
|---|---|
| [Architecture overview](architecture/overview.md) | Components, request path, write serialization, ownership, static surface |
| [HTTP API](architecture/http-api.md) | Routes, auth, request rules, capacity and admin contracts |
| [Data model](architecture/data-model.md) | SQLite tables, migrations, legacy import, backup hazards |
| [Frontend](architecture/frontend.md) | Participant/setup/admin pages, map, settings, exports, UI risks |
| [Security](architecture/security.md) | Password/session controls, auth limits, deliberate reductions, residual risks |
| [Delivery](architecture/delivery.md) | Docker image, Compose, Nginx, installers, CI, VM preview |

### Operations

| Page | Description |
|---|---|
| [Runbook](operations/runbook.md) | Local start, tests, Docker, first admin, reset, demo data, backup |

### Decisions

| Page | Description |
|---|---|
| [Decisions index](decisions/README.md) | ADR list and conventions |
| [ADR: English overlay](decisions/2026-11-04-wiki-overlay.md) | Why this wiki is an overlay over `docs/wiki`, and what each layer owns |
| [ADR template](decisions/adr-template.md) | Skeleton for new decisions |

### Contradictions

| Page | Description |
|---|---|
| [Contradictions index](contradictions/README.md) | Cross-page conflicts and status |
| [VM preview cookie check](contradictions/2026-11-04-preview-cookie-check.md) | Preview expects `Secure`; app and smoke test deliberately do not set it |
| [Legacy wiki drift](contradictions/2026-11-04-legacy-wiki-drift.md) | German docs still describe removed name visibility, Origin protection, configured admin |

## Analyses

No reusable analysis pages have been filed yet. Add one under `analyses/YYYY-MM-DD-short-title.md` when an answer synthesizes several pages and is likely to be reused, then link it here.

## Sources

- [Existing German project wiki](../../docs/wiki/index.md) — deep architecture, API, data, features, design, decisions, planning, changelog.
- [User and operations handbook](../../docs/handbuch/README.md) — installation, usage, security, operation, gotchas.
- [README](../../README.md) — short project entry point.
- [Wiki schema](../README.md) — language, visibility, layers, maintenance loop, rules.
- `raw/` is not present: no historical documents were explicitly marked for migration in this pass.

## Recently changed

- 2026-11-04 — initialized the overlay and recorded the current baseline and two contradictions. See [log](log.md) and [changelog](changelog.md).

## Open questions

- Production host, domain, certificate ownership/renewal, backup/restore, and instance count. [See T-003](tasks.md).
- Should the VM preview workflow be fixed or retired? [Preview cookie contradiction](contradictions/2026-11-04-preview-cookie-check.md).
- Can the stale German claims be corrected in place or marked superseded? [Legacy wiki drift](contradictions/2026-11-04-legacy-wiki-drift.md).
- Are browser-only map search, PDF/PNG rendering, and real downloads covered by a future test? [Frontend](architecture/frontend.md).
- What are the final event name, rules, texts, and map pin? `docs/wiki/planung.md:6`.

## Guardrails

- Source code, tests, configuration, and build files are read-only for wiki maintenance.
- Never document secrets: no passwords, tokens, keys, cookies, connection strings, customer data, or account identifiers.
- This is a public wiki: no internal IPs, hostnames, private domains, or personal data. Use roles and repository-internal paths.
- The app is HTTP-only behind a proxy; do not describe it as directly public.
- One event at a time; open registration is intentional but is a privacy risk.
- Capacity checks, auth limits, and write serialization are single-process.
- Code and verified project files win over any wiki claim. Record conflicts instead of silently overwriting them.
- A wiki entry does not authorize a code change.
- `docs/wiki` is the German deep-dive; `llm-wiki` is the English agent overlay. Update the owning page and link, do not duplicate.
