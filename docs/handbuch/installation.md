# Installation

## Voraussetzungen

- **Docker (empfohlen):** Docker mit Compose auf Linux oder Docker Desktop; die App läuft intern nur HTTP auf Container-Port 80, die öffentliche TLS-Verbindung endet an einem lokalen Reverse-Proxy (siehe [Betrieb](betrieb.md)).
- **Ohne Docker (Alternative):** Node.js ab 22.13. Die Anwendung nutzt das in Node integrierte `node:sqlite`; ein separates natives SQLite-Paket wird nicht benötigt.
- Internetzugang für die Karten- und Exporter-Funktionen ist nur im Browser nötig (OpenStreetMap/Nominatim bzw. Google Maps), nicht für den Serverstart.

## Automatische Installation (empfohlen)

Die Skripte `install.sh` (Debian/Ubuntu, x86_64) und `install.ps1` (Windows, Docker Desktop) führen durch eine interaktive Fullscreen-TUI. Unter Windows startet der kurze Einzeiler über `bootstrap.ps1`. Die Installer prüfen bzw. installieren die Voraussetzungen, klonen das Projekt, richten das Image und das Volume ein und unterstützen Update, Import einer vorhandenen `data/app.sqlite`, Backup, Deinstallation und Autostart.

### Linux (Debian/Ubuntu)

```sh
curl -fsSL https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/install.sh -o /tmp/grillabend-install.sh
bash /tmp/grillabend-install.sh
```

- Das Skript benötigt root-Rechte und ein interaktives Terminal (bei SSH z. B. `ssh -t`). Es startet sich bei Bedarf per `sudo` neu. `git` und `curl` werden nur nach Rückfrage aus dem Debian/Ubuntu-Repository installiert. Fehlt Docker, wird das offizielle Docker-Repository eingerichtet (`docker-ce`, Compose-Plugin); eine vorhandene geeignete Docker-Installation wird weiterverwendet.
- Standardziel ist `/opt/grillabend`, der Pfad wird abgefragt. Status: `/var/lib/grillabend-installer/state`, Logs: `/var/log/grillabend-installer/`.
- **Bindung:** Standard ist **nur lokal** (`127.0.0.1:1621`) für einen Reverse Proxy auf demselben Server. Optional ist die LAN-Freigabe (`0.0.0.0:1621`) mit ausdrücklicher Bestätigung; bei aktivem `ufw` kann eine Regel angelegt werden. Die App spricht nur HTTP.
- Das Image wird als `ghcr.io/anigx/grillabend-anmeldung:latest` gezogen. Es gibt nur `linux/amd64`; ARM-Systeme (z. B. Raspberry Pi) werden abgelehnt.
- Ein Update sichert die SQLite-Datenbank vorher automatisch (die letzten fünf Backups bleiben unter `backups/`). `--uninstall` entfernt Container und Image, behält Projektordner, Volume und Backups. `--purge` entfernt zusätzlich Volume, Projektordner und Backups.
- Ein lokaler Reverse Proxy kann anschließend auf `127.0.0.1:1621` zeigen. Das Skript installiert bewusst **kein** Nginx und kein Zertifikat; dafür gelten die Hinweise unter [Betrieb](betrieb.md).
- Weitere Optionen: `bash install.sh --help` (u. a. `--install-dir PFAD` oder `--install-dir=PFAD`, `--bind local|lan` oder `--bind=local`, `--yes`, `--no-color`). Die TUI führt durch die normalen Fragen.

### Windows (Docker Desktop, ohne WSL-Distribution)

```powershell
irm https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/bootstrap.ps1 | iex
```

- Der Einzeiler lädt den schlanken Bootstrap aus dem `main`-Branch. Dieser legt den vollständigen Installer unter `%LOCALAPPDATA%\Grillabend-Installer\install.ps1` ab und startet die TUI; bei fehlenden Adminrechten wird er per UAC erhöht. Nur ausführen, wenn du dem Repository vertraust.
- **Nicht `/install.ps1 | iex` verwenden:** `install.ps1` ist der vollständige Installer mit UTF-8-BOM; `iex` scheitert daran. Der Einzeiler zeigt deshalb auf `bootstrap.ps1`.
- Die heruntergeladene Datei bleibt für spätere Aufrufe mit Optionen liegen, z. B. `powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\Grillabend-Installer\install.ps1" -Uninstall` oder `-Purge`. Die gleichen Optionen bietet die TUI.
- Unterstützt Windows 11 sowie Windows 10 22H2 mit Warnung; nur x64. Die TUI benötigt eine normale PowerShell-Konsole (nicht ISE); bei fehlenden Adminrechten öffnet sich ein erhöhtes Fenster. Docker Desktop wird bei Bedarf per `winget` installiert; dafür muss der Microsoft App Installer (`winget`) vorhanden sein, sonst bricht der Installer mit einem Hinweis ab. WSL2 wird **nur als von Docker Desktop benötigtes Backend** aktiviert; es wird keine Ubuntu-Distribution eingerichtet. Git wird bei Bedarf per `winget` installiert.
- Standardziel ist `%USERPROFILE%\Grillabend-Anmeldung`, der Pfad wird abgefragt. Status und Logs: `%ProgramData%\Grillabend-Installer`.
- **Bindung:** Standard ist die LAN-Freigabe (`0.0.0.0:1621`) nach ausdrücklicher Bestätigung. Der Installer legt eine Windows-Firewall-Regel für TCP 1621 in privaten/Domänen-Netzen und dem lokalen Subnetz an. „Nur lokal“ (`127.0.0.1:1621`) ist ebenfalls wählbar. Die App spricht nur HTTP; im LAN sind Zugangsdaten unverschlüsselt.
- Docker Desktop wird beim Anmelden über eine Aufgabe gestartet, damit der Container mit `restart: unless-stopped` wieder hochkommt. Die Aufgabe und die Firewall-Regel werden nur von der App angelegt und bei der Deinstallation entfernt; Docker Desktop, WSL2 und Git bleiben installiert.
- Ein Neustart nach der WSL2-Aktivierung oder Docker-Desktop-Installation wird erkannt. Nach dem Neustart den Installer erneut starten; er bietet das Fortsetzen an. Updates sichern die Datenbank automatisch. `-Uninstall` behält Daten, `-Purge` löscht zusätzlich Volume, Projekt und Backups.
- Docker Desktop ist für Privatanwender, Bildung und kleine Unternehmen kostenlos; für größere Unternehmen gelten die Lizenzbedingungen von Docker. Der Installer zeigt vor der Installation einen entsprechenden Hinweis.
- Weitere Optionen des heruntergeladenen Installers: `-Help` (u. a. `-InstallDir`, `-Bind local|lan`, `-Yes`, `-NoPause`). Die TUI führt durch die normalen Fragen.

### Windows ohne Docker (bare metal, Node.js + npm)

Diese Variante braucht weder Docker noch WSL oder Git. Sie bietet ein vorhandenes Node.js ab 22.13 an und lädt sonst Node.js 22 als offizielles ZIP mit SHA-256-Prüfung. Die App kommt als GitHub-ZIP; `npm ci` läuft leise (`--no-audit --no-fund --loglevel=error`) und wird übersprungen, wenn sich `package-lock.json` nicht geändert hat.

```powershell
irm https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/bootstrap-native.ps1 | iex
```

- Unterstützt Windows 10 22H2+ und Windows 11 auf x64 oder ARM64. Der Installer startet sich für Systemänderungen per UAC neu.
- Standardziel ist `C:\Program Files\Grillabend` (App unter `app\`, Node.js unter `node\`); die Daten liegen unter `%ProgramData%\Grillabend`.
- Die App läuft als geplante Aufgabe `Grillabend-Anmeldung` unter `SYSTEM` und startet beim Systemstart. Das App-Log steht unter `%ProgramData%\Grillabend\app.log`, die Installer-Logs unter `%ProgramData%\Grillabend-Installer-Native\Logs\`.
- Standard ist die LAN-Freigabe auf `0.0.0.0:1621` nach Bestätigung mit einer Firewall-Regel für private/Domänen-Netze und das lokale Subnetz; „nur lokal“ (`127.0.0.1:1621`) ist wählbar.
- Ein vorhandenes Node.js wird nur angeboten, wenn es mindestens Version 22.13 hat; die lokale Installation bleibt der Fallback. `-ForceLocalNode` erzwingt die lokale Installation.
- Updates und Deinstallation über dieselbe TUI. Direkt: `.\install-native.ps1 -Uninstall` (Daten bleiben) bzw. `-Purge` (inklusive Node.js, Daten und Backups). `-SelfTest` prüft Download, npm und Start in einem temporären Verzeichnis, ohne Task oder Firewall-Regel anzulegen; `-SelfTest -ForceLocalNode` testet zusätzlich den lokalen Node-Download.
- Ein vorhandener Datenbestand kann vor der Installation nach `%ProgramData%\Grillabend\app.sqlite` kopiert werden. Die App verwendet diese Datei beim Start.
- Nicht parallel zur Docker-Variante auf demselben Port betreiben; der Installer bricht bei belegtem Port mit einer Meldung ab.
- Weitere Optionen: `-InstallDir PFAD`, `-Bind local|lan`, `-Port NUMMER`, `-ForceLocalNode`, `-Yes`, `-NoPause`, `-Help`, `-Version`.

## Installation mit Docker (manuell)

Im Projektordner:

```sh
docker compose pull
docker compose up -d
docker compose logs -f grillabend
```

- Compose verwendet das veröffentlichte Image `ghcr.io/anigx/grillabend-anmeldung:latest`, den Container `grillabend` und das Volume `grillabend-data`. Node lauscht im Container nur auf **HTTP-Port 80**; veröffentlicht wird `127.0.0.1:1621 → 80`. Image, Portmapping und Volume stehen fest in `compose.yaml`; `NODE_ENV`, `PORT` und `DATA_DIR` kommen aus dem Image. Die App und Compose verwenden keine `.env`; eine lokale Datei wird nicht ausgewertet. Für die LAN-Freigabe legt der Installer eine lokale, nicht versionierte `compose.override.yaml` an (`0.0.0.0:1621:80`); ohne diese Datei bleibt es bei der Loopback-Bindung.
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

### Windows mit Docker Desktop (manuell)

Dieselbe `compose.yaml` funktioniert unter Docker Desktop, weil sie Portmapping statt Host-Netzwerk nutzt:

```powershell
docker compose pull
docker compose up -d
```

- Danach <http://127.0.0.1:1621> öffnen. Im Container lauscht Node auf `0.0.0.0:80`, Docker veröffentlicht `127.0.0.1:1621`.
- Für LAN-Zugriff die Bindung in einer lokalen `compose.override.yaml` auf `0.0.0.0:1621:80` ändern (so macht es der Installer) und eine Firewall-Regel für TCP 1621 anlegen. Die App spricht nur HTTP; im LAN sind Zugangsdaten unverschlüsselt.
- Der Installer richtet Docker Desktop und das WSL2-Backend ein, installiert aber keine Ubuntu-Distribution. Nginx/HTTPS entfällt lokal; für Produktion den Linux-Weg mit `deploy/setup-https-selfsigned.sh` verwenden oder einen externen HTTPS-Proxy davorsetzen.

Tests ausführen (verwenden ausschließlich temporäre, künstliche Datenbanken):

```sh
npm test
```

## Erstes Admin-Konto einrichten

Ein Admin-Konto wird beim ersten Start **in der Oberfläche** angelegt, nicht über Umgebungsvariablen:

1. Die Anwendung starten (per Installer, Docker oder lokal) und die Seite im Browser öffnen – bei Docker über die öffentliche HTTPS-Adresse, lokal <http://127.0.0.1:621>. Der automatische Installer zeigt die passende `/setup`-Adresse an und öffnet sie unter Windows auf Wunsch im Browser.
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
