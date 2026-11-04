# Frontend

Status: active
Last verified: 2026-11-04
Confidence: high

## Purpose

The browser layer is a small, framework-free German UI. This page explains the three pages, their JavaScript modules, the visual system, and the client-side export path. The visual reference is documented in [Gewünschtes Erscheinungsbild](../../../docs/wiki/design/erscheinungsbild.md).

## What exists

| File | Responsibility |
|---|---|
| `public/index.html` + `public/js/app.js` | Login/register, RSVP dashboard, attendee list, settings dialog, delete modal |
| `public/setup.html` + `public/js/setup.js` | First-run admin form |
| `public/admin.html` + `public/js/admin.js` | Event form, map picker/search, occupancy, user table, reset dialog |
| `public/js/admin-exports.js` | CSV, XLSX, PDF, PNG, and ZIP export generation |
| `public/css/style.css` | Shared dark visual system, responsive layout, modals |
| `public/css/admin.css` | Admin layout and table |
| `public/css/modal.css` | Participant delete modal |

The server exposes only the explicit files in `PUBLIC_FILES` plus the vendor libraries (`src/server.js:11,419-427`).

## How it works

1. **Participant page:** `DOMContentLoaded` initializes the auth form and dashboard. The same form switches between login and registration; registration adds password confirmation and a five-rule strength panel (`public/js/app.js:29-89`). After authentication, the page loads party info and attendees, renders the RSVP form, and conditionally reveals cabin/equipment choices (`public/js/app.js:91-242`).
2. **RSVP constraints in the UI:** sleeping is only offered for `kommt = Ja`, equipment only for `huette = Ja`; the server remains authoritative (`public/index.html:93-130`; `src/server.js:364-384`).
3. **Profile dialog:** the gear opens a native `dialog` with separate username and password forms. Both call the API with the current password; a password change rotates the session cookie (`public/index.html:149-176`; `public/js/app.js:244-310`).
4. **Admin page:** three tabs (event, users, reset). Event edits use `PUT /api/admin/party-info`; the user tab loads `GET /api/admin/users` and filters locally; the reset tab opens a password-confirmed dialog (`public/js/admin.js:75-120,271-350`).
5. **Map pin:** Leaflet with OpenStreetMap tiles. Search is explicitly triggered, sends the query to Nominatim from the browser, shows at most five results, and only a click on the map sets the pin. A result centers the map but does not save a pin (`public/js/admin.js:9-18,380-425`).
6. **Exports:** the current filtered rows are exported in the browser. CSV uses UTF-8 BOM, semicolons, and formula-injection guards; XLSX uses ExcelJS; PDF/PNG use a canvas layout; large PNG sets are zipped (`public/js/admin-exports.js:1-120`). Libraries load lazily from local `/vendor/` routes (`public/js/admin-exports.js:42-55`).
7. **Safety:** user values are written with `textContent`; the Maps link is restricted to allowed HTTPS hosts (`public/js/app.js:104-118`). The server also restricts maps URLs (`src/server.js:23-31`).

## Interfaces and data

- API endpoints consumed: session, party info, attendees, RSVP, profile, admin party info, admin users, admin reset (`public/js/app.js`; `public/js/admin.js`).
- External browser calls: OpenStreetMap tiles and Nominatim for the map; Google Maps links; Google Fonts for Outfit (`public/admin.html:8-13`; `public/index.html:9-13`).
- No direct database access and no server-side export endpoint; exports are client-side from the admin response (`docs/wiki/features/administration.md:15`).

## Risks and gotchas

- **Network dependency:** the map picker and place search need internet access to OpenStreetMap/Nominatim; Google Fonts also loads remotely. Server startup does not need them (`docs/handbuch/installation.md:7`).
- **Browser-only paths are not fully tested.** Map search, PDF/PNG canvas rendering, and actual downloads remain manual checks (`docs/wiki/entwicklung/lokal-starten.md:32`).
- **No framework or build step.** Changes are direct HTML/CSS/JS; there is no bundler or type check.
- **The name-visibility switch is gone.** The participant list always shows account names; do not reintroduce a visibility control without a product decision (`test/app.test.js:103`; [documentation drift](../contradictions/2026-11-04-legacy-wiki-drift.md)).
- **Admin exports contain account names and response timestamps.** They are generated only after the admin-authenticated fetch; treat downloaded files as sensitive (`public/js/admin-exports.js:10-18`).

## Open questions

- Should the UI be tested with a browser automation suite, or remain manual? **Confidence: low.** No browser automation is in `package.json`.
- Should Google Fonts be self-hosted to avoid a third-party request? **Confidence: low.** No decision is recorded.

## Related pages

- [Architecture overview](overview.md)
- [HTTP API](http-api.md)
- [Security](security.md)
- [Existing German design reference](../../../docs/wiki/design/erscheinungsbild.md)
- [Existing German participant feature](../../../docs/wiki/features/anmeldung-und-teilnahme.md)
- [Existing German admin feature](../../../docs/wiki/features/administration.md)
