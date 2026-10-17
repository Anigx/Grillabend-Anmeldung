# Installation

## Voraussetzungen

- **Node.js ab 22.13.** Die Anwendung nutzt das in Node integrierte `node:sqlite`; ein separates natives SQLite-Paket wird nicht benötigt.
- Internetzugang für die Karten- und Exporter-Funktionen ist nur im Browser nötig (OpenStreetMap/Nominatim bzw. Google Maps), nicht für den Serverstart.

## Lokal starten

Im Projektordner:

```sh
npm ci --ignore-scripts
npm start
```

Danach <http://127.0.0.1:621> öffnen. Ohne Produktionsmodus bindet der Server an `0.0.0.0` (Port `621`) und ist bei entsprechender Firewall-Freigabe auch über die IPv4-Adresse des Rechners im Netzwerk erreichbar; Registrierung und HTTP funktionieren dann ebenfalls über diesen Host.

Unter PowerShell mit gesperrten Skripten die `.cmd`-Variante verwenden:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd start
```

Tests ausführen (verwenden ausschließlich temporäre, künstliche Datenbanken):

```sh
npm test
```

## Erstes Admin-Konto einrichten

Vor dem ersten `npm start` beide Umgebungsvariablen setzen (Passwort mindestens zwölf Zeichen):

```powershell
$env:ADMIN_USERNAME = 'Organisator'
$env:ADMIN_PASSWORD = 'ein-sehr-langes-passwort'
npm.cmd start
```

- Beim Start legt der Server dieses Konto als Admin an; es kann Name und Passwort **nicht** im Einstellungsdialog ändern, sondern wird über die Startkonfiguration verwaltet.
- Die **erste öffentliche Registrierung erhält keine Adminrechte.**
- Sind die Variablen nicht gesetzt, ist Registrierung möglich, der Adminbereich aber erst nach Einrichtung eines Administrators verfügbar.
- Admin-Konten erreichen den eigenen Bereich über den Link auf der Teilnehmerseite oder direkt unter `/admin`.

Wird später ein abweichendes `ADMIN_PASSWORD` gesetzt und der Prozess neu gestartet, wird das Passwort des vorhandenen Admin-Kontos rotiert und dessen bisherige Sitzungen werden ungültig. Bei unverändertem Passwort bleiben sie gültig. Geheimnisse nie in versionierte Dateien oder das Wiki schreiben; für Docker Compose die private, von Git ausgeschlossene `.env` verwenden.

## Erster Start und Datenbestand

- Beim ersten Start legt die Anwendung `data/app.sqlite` an.
- Liegen im Projektordner die drei historischen SQLite-Dateien `accounts.sqlite`, `party_eintraege.sqlite` und `Datum.sqlite`, werden Konten, Zusagen und Veranstaltungsdaten einmalig **nur lesend** importiert; alte Klartextpasswörter werden dabei gehasht. Ein Kennzeichen verhindert einen erneuten Import. Im aktuellen lokalen Projekt wurden diese Altdateien nach Abgleich entfernt.
- **Für einen Umzug oder eine Wiederherstellung mit vorhandenen Konten und Zusagen muss `data/app.sqlite` separat gesichert und übertragen werden.** Ohne diese Datei (und ohne Altdateien) startet die Anwendung mit einer neuen, leeren Datenbank.

## Nächste Schritte

- [Bedienung](bedienung.md) – wie Gäste und Admins die Anwendung benutzen.
- [Betrieb](betrieb.md) – Umgebungsvariablen, HTTPS/Reverse-Proxy, Docker, Backup.
