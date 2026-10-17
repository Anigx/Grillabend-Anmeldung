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

## Automatische Installation

Für Debian/Ubuntu (x86_64) und Windows (Docker Desktop, Windows 10 22H2+ oder Windows 11, x64) gibt es interaktive Fullscreen-Installer. Sie prüfen bzw. installieren Docker, klonen das Projekt, richten das Daten-Volume ein und begleiten Updates und Deinstallationen. Das erste Admin-Konto wird weiterhin im Browser unter `/setup` angelegt.

**Linux** (Debian/Ubuntu, führt sich bei Bedarf per `sudo` neu aus):

```sh
curl -fsSL https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/install.sh -o /tmp/grillabend-install.sh && bash /tmp/grillabend-install.sh
```

Ohne `curl` alternativ `wget -qO /tmp/grillabend-install.sh <URL> && bash /tmp/grillabend-install.sh`. Standardziel ist `/opt/grillabend`; die Bindung ist standardmäßig nur lokal (`127.0.0.1:1621`) für einen späteren Reverse Proxy. LAN-Freigabe ist mit Sicherheitswarnung wählbar.

**Windows** (PowerShell, lädt sich bei Bedarf nach `%PUBLIC%\Grillabend-Installer` und startet sich bei fehlenden Adminrechten per UAC neu):

```powershell
irm https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/install.ps1 | iex
```

Der Windows-Installer richtet Docker Desktop per `winget` ein und aktiviert WSL2 ausschließlich als Docker-Backend (keine Ubuntu-Distribution). Standard ist die LAN-Freigabe auf `0.0.0.0:1621` mit Bestätigung und einer Firewall-Regel für private/Domänen-Netze; „nur lokal“ ist ebenfalls wählbar. Docker Desktop, WSL2 und Git werden bei einer Deinstallation nicht entfernt.

Status und Logs liegen unter `/var/lib/grillabend-installer` bzw. `/var/log/grillabend-installer` (Linux) und `%ProgramData%\Grillabend-Installer` (Windows). Updates sichern die SQLite-Datenbank automatisch. Entfernen: `--uninstall` (App, Daten bleiben) oder `--purge` (inklusive Volume, Projekt und Backups); unter Windows `-Uninstall` bzw. `-Purge`. Details: [Installation](docs/handbuch/installation.md).

## Auf einen Blick

- **Empfohlen: Docker + Reverse Proxy.** `docker compose pull` und `docker compose up -d` (Mapping in `compose.yaml`: `127.0.0.1:1621` → Container `80`). Der Installer kann für LAN eine lokale `compose.override.yaml` anlegen. TLS übernimmt ein lokaler Proxy auf 443 (Details: [Betrieb](docs/handbuch/betrieb.md)).
- **Selbstsigniertes HTTPS (Test):** `sudo bash deploy/setup-https-selfsigned.sh <host-oder-ip>` installiert Nginx, erzeugt ein selbstsigniertes Zertifikat und proxyt 443 auf `127.0.0.1:1621`. Später durch ein echtes Zertifikat ersetzbar.
- **Lokal mit Node (Alternative):** Node.js ab 22.13, `npm ci --ignore-scripts` und `npm start`, danach <http://127.0.0.1:621> (SQLite kommt aus Node selbst, kein natives npm-Binding). Der Server bindet standardmäßig an `0.0.0.0` (per `HOST` änderbar) und ist damit auch über die Netzwerk-IP erreichbar.
- **Windows mit Docker Desktop:** gleiche `compose.yaml`; Docker Desktop nutzt Portmapping statt Host-Netzwerk. Danach <http://127.0.0.1:1621> öffnen.
- **Sicherheit:** Die App spricht nur HTTP und hat keinen Origin-/CSRF-Check sowie keine `Secure`-Cookies. Sie darf nur über den vorgelagerten Proxy erreichbar sein (Standardbindung `127.0.0.1`).
- **Erstes Admin-Konto:** Solange kein Admin existiert, leitet die Startseite auf `/setup` um; dort wird der Admin angelegt. Keine Admin-Umgebungsvariablen nötig.
- **Passwort vergessen:** im Container `npm run reset-admin-password` (gibt ein neues Passwort aus).
- **Showcase-Daten:** im Container `npm run seed-demo-users` erzeugt Demo-Konten mit echten Namen und Antworten (optional Anzahl, `--force`, `--cleanup`).
- **Tests:** `npm test` (ausschließlich temporäre, künstliche Datenbanken).
- **Ein Abend gleichzeitig** mit offener Registrierung und serverseitigen Sessions.

## Projektstruktur

- `install.sh`, `install.ps1` – interaktive Installer für Linux bzw. Windows.
- `server.js` – kleiner Startpunkt; `src/server.js` – HTTP-Routen, Sitzungen und Kapazitätslogik.
- `src/db.js`, `src/security.js`, `src/auth-limit.js` – SQLite-Initialisierung/Alt-Import, Passwort-/Token-Funktionen und Auth-Limits; `src/reset-password.js` – CLI zum Zurücksetzen des Admin-Passworts; `src/seed-demo-users.js` – CLI für Showcase-Daten.
- `public/` – `index.html`/`js/app.js` (Anmeldung und Teilnahme), `setup.html`/`js/setup.js` (Ersteinrichtung), `admin.html`/`js/admin.js` (Adminoberfläche), `css/`.
- `test/` – automatisierte Tests.
- `docs/handbuch/` – Anwender-/Betriebsdoku; `docs/wiki/` – internes Projektwissen.
- `data/app.sqlite` – lokale Datenbank (nicht über HTTP ausgeliefert, von Git ausgeschlossen).
