# Grillabend – Handbuch

Diese Anwender- und Betriebsdokumentation richtet sich an die Personen, die die Anwendung installieren, betreiben oder bedienen. Technische Details, Architekturentscheidungen und der Änderungsverlauf stehen getrennt im [internen Projekt-Wiki](../wiki/index.md).

## Inhalt

| Datei | Inhalt |
| --- | --- |
| [installation.md](installation.md) | Voraussetzungen, lokaler Start, erstes Admin-Konto, Optionen zur Erstinstallation |
| [bedienung.md](bedienung.md) | Bedienung für Gäste (Teilnahme, Luftmatratze/Bettzeug, Einstellungen) und Admins (Veranstaltung, Kapazitäten, Übersicht, Export, Reset) |
| [wichtig-zu-wissen.md](wichtig-zu-wissen.md) | Zentrale Punkte, Regeln und Stolperfallen im Kurzüberblick |
| [sicherheit.md](sicherheit.md) | Sicherheitsmodell, Schutzmaßnahmen, bekannter Scanbefund und Restrisiken |
| [betrieb.md](betrieb.md) | Umgebungsvariablen, HTTPS/Reverse-Proxy, Docker/Compose, GitHub Actions, Backup und Datenpflege |

## Ganz kurz

- **Schnellstart:** `install.sh` (Debian/Ubuntu) bzw. `install.ps1` (Windows/Docker Desktop) als interaktive Fullscreen-Installer; Einzeiler und Details stehen in [Installation](installation.md).
- **Empfohlen:** Betrieb per Docker/Compose mit Portmapping hinter einem lokalen Nginx-Reverse-Proxy; alternativ lokal mit Node.js ab 22.13.
- Docker: `docker compose pull` und `docker compose up -d`. Die App spricht intern nur HTTP auf Port 80; alle Werte stehen in `compose.yaml`, TLS macht der Proxy.
- Lokal mit Node: `npm ci --ignore-scripts`, dann `npm start`, danach <http://127.0.0.1:621>.
- Admin-Konten werden über die Ersteinrichtung unter `/setup` (solange noch kein Admin existiert) oder aus Alt-Daten angelegt; die erste öffentliche Registrierung ist **kein** Admin.
- Die Teilnahmedaten liegen in `data/app.sqlite` (im Container im Volume `grillabend-data`) und müssen bei einem Umzug separat gesichert werden.

Zurück zum [README](../../README.md).
