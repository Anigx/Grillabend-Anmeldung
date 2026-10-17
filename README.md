# Grillabend-Anmeldung

Webanwendung für einen aktuellen Grillabend: Anmeldung, Zu- und Absagen, Schlafplätze in der Hütte sowie der getrennte Bedarf an **Luftmatratze** und **Bettzeug** – dazu eine Adminseite für Termin, Ort, Kapazitäten, Regeln und Informationen. Der visuelle Stil orientiert sich an der importierten Oberfläche.

## Dokumentation

Die Anwender- und Betriebsdokumentation ist bewusst ausgelagert, damit dieses README ein kurzer Einstieg bleibt:

| Thema | Datei |
| --- | --- |
| Schnellstart, Voraussetzungen, Admin einrichten | [docs/handbuch/installation.md](docs/handbuch/installation.md) |
| Bedienung für Gäste und Admins | [docs/handbuch/bedienung.md](docs/handbuch/bedienung.md) |
| Wichtige Punkte und Gotchas | [docs/handbuch/wichtig-zu-wissen.md](docs/handbuch/wichtig-zu-wissen.md) |
| Sicherheitsmodell und Schwachstellen-Scan | [docs/handbuch/sicherheit.md](docs/handbuch/sicherheit.md) |
| Betrieb: Umgebungsvariablen, HTTPS, Docker, Backup | [docs/handbuch/betrieb.md](docs/handbuch/betrieb.md) |
| Übersicht des Handbuchs | [docs/handbuch/README.md](docs/handbuch/README.md) |

Internes Projektwissen (Architektur, Entscheidungen, Datenmodell, Changelog) steht getrennt im [Projekt-Wiki](docs/wiki/index.md); die Pflege-Regeln für Coding-Agents in [AGENTS.md](AGENTS.md).

## Auf einen Blick

- **Empfohlen: Docker.** `.env` aus `.env.example` erstellen, dort `APP_ORIGIN` als HTTPS-Origin aktivieren, dann `docker compose pull` und `docker compose up -d` (Details: [Betrieb](docs/handbuch/betrieb.md)).
- **Selbstsigniertes HTTPS (Test):** `sudo bash deploy/setup-https-selfsigned.sh <host-oder-ip>` installiert Nginx, erzeugt ein selbstsigniertes Zertifikat, leitet HTTP auf HTTPS um und setzt `APP_ORIGIN`/`HOST` in `.env`. Später durch einen Proxy mit echtem Zertifikat ersetzbar.
- **Lokal mit Node (Alternative):** Node.js ab 22.13, `npm ci --ignore-scripts` und `npm start`, danach <http://127.0.0.1:621> (SQLite kommt aus Node selbst, kein natives npm-Binding). Der Server bindet standardmäßig an `0.0.0.0` (per `HOST` änderbar) und ist damit auch über die Netzwerk-IP erreichbar.
- **Windows mit Docker Desktop:** `.env.windows.example` nach `.env.windows` kopieren, dann `docker compose --env-file .env.windows -f compose.windows.yaml up -d` und <http://127.0.0.1:1621> öffnen (Portmapping statt Host-Netzwerk; Details: [Installation](docs/handbuch/installation.md)).
- **Erstes Admin-Konto:** Solange kein Admin existiert, leitet die Startseite auf `/setup` um; dort wird der Admin angelegt. Keine Admin-Umgebungsvariablen nötig.
- **Passwort vergessen:** im Container `npm run reset-admin-password` (gibt ein neues Passwort aus).
- **Showcase-Daten:** im Container `npm run seed-demo-users` erzeugt Demo-Konten mit echten Namen und Antworten (optional Anzahl, `--force`, `--cleanup`).
- **Tests:** `npm test` (ausschließlich temporäre, künstliche Datenbanken).
- **Ein Abend gleichzeitig** mit offener Registrierung und serverseitigen Sessions.

## Projektstruktur

- `server.js` – kleiner Startpunkt; `src/server.js` – HTTP-Routen, Sitzungen und Kapazitätslogik.
- `src/db.js`, `src/security.js`, `src/auth-limit.js` – SQLite-Initialisierung/Alt-Import, Passwort-/Token-Funktionen und Auth-Limits; `src/reset-password.js` – CLI zum Zurücksetzen des Admin-Passworts; `src/seed-demo-users.js` – CLI für Showcase-Daten.
- `public/` – `index.html`/`js/app.js` (Anmeldung und Teilnahme), `setup.html`/`js/setup.js` (Ersteinrichtung), `admin.html`/`js/admin.js` (Adminoberfläche), `css/`.
- `test/` – automatisierte Tests.
- `docs/handbuch/` – Anwender-/Betriebsdoku; `docs/wiki/` – internes Projektwissen.
- `data/app.sqlite` – lokale Datenbank (nicht über HTTP ausgeliefert, von Git ausgeschlossen).
