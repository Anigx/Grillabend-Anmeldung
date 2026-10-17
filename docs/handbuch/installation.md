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

Ein Admin-Konto wird beim ersten Start **in der Oberfläche** angelegt, nicht über Umgebungsvariablen:

1. `npm start` ausführen und <http://127.0.0.1:621> öffnen.
2. Solange kein Admin existiert, leitet die Startseite automatisch auf `/setup` um. Dort Benutzername (2–40 Zeichen) und Passwort (mindestens zwölf Zeichen mit Groß- und Kleinbuchstaben, Zahl und Sonderzeichen) eingeben.
3. Nach dem Anlegen zur Anmeldung zurückkehren und mit dem neuen Konto anmelden.

- `/setup` ist nur so lange erreichbar, wie **kein** Konto mit Adminrechten existiert; danach leitet die Seite auf die Startseite um.
- Die **erste öffentliche Registrierung erhält keine Adminrechte.**
- Der über `/setup` angelegte Admin ist ein normales Konto und kann Name und Passwort später selbst im Einstellungsdialog ändern.
- Admin-Konten erreichen den eigenen Bereich über den Link auf der Teilnehmerseite oder direkt unter `/admin`.

Geht das Admin-Passwort verloren, lässt es sich im Container mit `npm run reset-admin-password` zurücksetzen (siehe [Betrieb](betrieb.md)). Geheimnisse nie in versionierte Dateien oder das Wiki schreiben.

## Erster Start und Datenbestand

- Beim ersten Start legt die Anwendung `data/app.sqlite` an.
- Liegen im Projektordner die drei historischen SQLite-Dateien `accounts.sqlite`, `party_eintraege.sqlite` und `Datum.sqlite`, werden Konten, Zusagen und Veranstaltungsdaten einmalig **nur lesend** importiert; alte Klartextpasswörter werden dabei gehasht. Ein Kennzeichen verhindert einen erneuten Import. Im aktuellen lokalen Projekt wurden diese Altdateien nach Abgleich entfernt.
- **Für einen Umzug oder eine Wiederherstellung mit vorhandenen Konten und Zusagen muss `data/app.sqlite` separat gesichert und übertragen werden.** Ohne diese Datei (und ohne Altdateien) startet die Anwendung mit einer neuen, leeren Datenbank.

## Nächste Schritte

- [Bedienung](bedienung.md) – wie Gäste und Admins die Anwendung benutzen.
- [Betrieb](betrieb.md) – Umgebungsvariablen, HTTPS/Reverse-Proxy, Docker, Backup.
