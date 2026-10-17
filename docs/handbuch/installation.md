# Installation

## Voraussetzungen

- **Docker (empfohlen):** Docker mit Compose auf Linux oder Docker Desktop; die App läuft intern nur HTTP auf Container-Port 80, die öffentliche TLS-Verbindung endet an einem lokalen Reverse-Proxy (siehe [Betrieb](betrieb.md)).
- **Ohne Docker (Alternative):** Node.js ab 22.13. Die Anwendung nutzt das in Node integrierte `node:sqlite`; ein separates natives SQLite-Paket wird nicht benötigt.
- Internetzugang für die Karten- und Exporter-Funktionen ist nur im Browser nötig (OpenStreetMap/Nominatim bzw. Google Maps), nicht für den Serverstart.

## Installation mit Docker (empfohlen)

Im Projektordner:

```sh
docker compose pull
docker compose up -d
docker compose logs -f grillabend
```

- Compose verwendet das veröffentlichte Image `ghcr.io/anigx/grillabend-anmeldung:latest`, den Container `grillabend` und das Volume `grillabend-data`. Node lauscht im Container nur auf **HTTP-Port 80**; veröffentlicht wird `127.0.0.1:1621 → 80`. Alle Werte stehen fest in `compose.yaml`; es gibt keine `.env`.
- **Selbstsigniertes HTTPS (Test):** `sudo bash deploy/setup-https-selfsigned.sh <host-oder-ip>` installiert Nginx, erzeugt ein selbstsigniertes Zertifikat, richtet die HTTP→HTTPS-Umleitung ein und proxyt 443 auf `127.0.0.1:1621`. Einzelheiten zu Nginx-Vorlage und Volume-Backup stehen unter [Betrieb](betrieb.md).
- Die App hat keinen Origin-/CSRF-Check und setzt keine `Secure`-Cookies. Sie darf deshalb nicht direkt öffentlich erreichbar sein; TLS und Zugriffsschutz gehören in den vorgelagerten Proxy.

## Alternative: lokal mit Node

Im Projektordner:

```sh
npm ci --ignore-scripts
npm start
```

Danach <http://127.0.0.1:621> öffnen. Der Server bindet standardmäßig an `0.0.0.0` (Port `621`, per `HOST` änderbar) und ist bei entsprechender Firewall-Freigabe auch über die IPv4-Adresse des Rechners im Netzwerk erreichbar; Registrierung und HTTP funktionieren dann ebenfalls über diesen Host.

Unter PowerShell mit gesperrten Skripten die `.cmd`-Variante verwenden:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd start
```

### Windows mit Docker Desktop

Dieselbe `compose.yaml` funktioniert unter Docker Desktop, weil sie Portmapping statt Host-Netzwerk nutzt:

```powershell
docker compose pull
docker compose up -d
```

- Danach <http://127.0.0.1:1621> öffnen. Im Container lauscht Node auf `0.0.0.0:80`, Docker veröffentlicht `127.0.0.1:1621`.
- Andere Ports oder LAN-Zugriff direkt in `compose.yaml` unter `ports` ändern (z. B. `"0.0.0.0:1621:80"`).
- Nginx/HTTPS entfällt lokal; für Produktion den Linux-Weg mit `deploy/setup-https-selfsigned.sh` verwenden.

Tests ausführen (verwenden ausschließlich temporäre, künstliche Datenbanken):

```sh
npm test
```

## Erstes Admin-Konto einrichten

Ein Admin-Konto wird beim ersten Start **in der Oberfläche** angelegt, nicht über Umgebungsvariablen:

1. Die Anwendung starten (per Docker oder lokal) und die Seite im Browser öffnen – bei Docker über die öffentliche HTTPS-Adresse, lokal <http://127.0.0.1:621>.
2. Solange kein Admin existiert, leitet die Startseite automatisch auf `/setup` um. Dort Benutzername (2–40 Zeichen) und Passwort (mindestens zwölf Zeichen mit Groß- und Kleinbuchstaben, Zahl und Sonderzeichen) eingeben.
3. Nach dem Anlegen zur Anmeldung zurückkehren und mit dem neuen Konto anmelden.

- `/setup` ist nur so lange erreichbar, wie **kein** Konto mit Adminrechten existiert; danach leitet die Seite auf die Startseite um.
- Die **erste öffentliche Registrierung erhält keine Adminrechte.**
- Der über `/setup` angelegte Admin ist ein normales Konto und kann Name und Passwort später selbst im Einstellungsdialog ändern.
- Admin-Konten erreichen den eigenen Bereich über den Link auf der Teilnehmerseite oder direkt unter `/admin`.

Geht das Admin-Passwort verloren, lässt es sich im Container mit `npm run reset-admin-password` zurücksetzen (siehe [Betrieb](betrieb.md)). Geheimnisse nie in versionierte Dateien oder das Wiki schreiben.

## Erster Start und Datenbestand

- Beim ersten Start legt die Anwendung die SQLite-Datei an: `data/app.sqlite` (im Container im Volume `grillabend-data`).
- Liegen im Projektordner die drei historischen SQLite-Dateien `accounts.sqlite`, `party_eintraege.sqlite` und `Datum.sqlite`, werden Konten, Zusagen und Veranstaltungsdaten einmalig **nur lesend** importiert; alte Klartextpasswörter werden dabei gehasht. Ein Kennzeichen verhindert einen erneuten Import. Im aktuellen lokalen Projekt wurden diese Altdateien nach Abgleich entfernt.
- **Für einen Umzug oder eine Wiederherstellung mit vorhandenen Konten und Zusagen muss `data/app.sqlite` separat gesichert und übertragen werden.** Ohne diese Datei (und ohne Altdateien) startet die Anwendung mit einer neuen, leeren Datenbank.

## Nächste Schritte

- [Bedienung](bedienung.md) – wie Gäste und Admins die Anwendung benutzen.
- [Betrieb](betrieb.md) – Umgebungsvariablen, HTTPS/Reverse-Proxy, Docker, Backup.
