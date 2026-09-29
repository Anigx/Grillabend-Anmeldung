# Grillabend-Anmeldung

Webanwendung für einen aktuellen Grillabend: Anmeldung, Zu- und Absagen, Schlafplätze, Bettgarnitur und eine eigene Adminseite für Termin, Ort, Regeln und Informationen. Der visuelle Stil orientiert sich an der importierten Oberfläche. [Projekt-Wiki](docs/wiki/index.md) und [Agent-Regeln](AGENTS.md) beschreiben den belegten Stand und den Pflege-Workflow.

## Lokal starten

Voraussetzung: Node.js 22 oder neuer. Im Projektordner `npm install` und `npm start` ausführen, danach `http://localhost:621` öffnen. Unter PowerShell mit gesperrten Skripten funktioniert auch `npm.cmd install` und `npm.cmd start`. `npm test` führt die automatisierten Tests aus.

Admin-Konten erreichen den eigenen Bereich über den Link auf der Teilnehmerseite oder unter `/admin`. Oben rechts in der Karte kann ein Ort oder eine Adresse gesucht werden. Ein Suchergebnis zentriert nur die Karte: Den genauen Treffpunkt anschließend anklicken und mit „Änderungen speichern“ übernehmen. Der Pin kann wieder entfernt werden. Der Google-Maps-Link entsteht automatisch aus dem gewählten Pin; bestehende Links ohne Pin bleiben bis zur Änderung erhalten. Die Seite und die Verwaltungs-API erfordern serverseitig geprüfte Adminrechte. `GET /api/admin/party-info` lädt die editierbaren Angaben und Belegung, `PUT /api/admin/party-info` speichert sie. `GET /api/party-info` bleibt die lesbare Veranstaltungsansicht für angemeldete Mitglieder; die frühere Schreibroute `POST /api/party-info` existiert nicht mehr.

## Projektstruktur

- `server.js`: kleiner Startpunkt; `src/server.js`: HTTP-Routen, Sitzungen und Kapazitätslogik.
- `src/db.js` und `src/security.js`: SQLite-Initialisierung/Alt-Datenübernahme und Passwort-/Token-Funktionen.
- `public/index.html` und `public/js/app.js`: Anmeldung und Teilnahme; `public/admin.html` und `public/js/admin.js`: Adminoberfläche.
- `public/css/`: gemeinsamer Stil, Löschdialog und Adminlayout; Leaflet wird für den Karten-Picker aus der installierten Abhängigkeit unter `/vendor/leaflet/` bereitgestellt. `test/`: automatisierte Tests; `docs/wiki/`: Projektwissen.
- `data/app.sqlite` ist die aktuelle lokale Datenbank, wird nicht über HTTP ausgeliefert und ist von Git ausgeschlossen. Die drei historischen Datenbanken und ihre zwischenzeitliche Sicherung wurden nach geprüftem Import entfernt.

Die Sicherheitstests in `test/security.test.js` und `test/app.test.js` verwenden ausschließlich temporäre Datenbanken und künstliche Zugangsdaten. Sie prüfen insbesondere Sessions, Rechte, Eingabegrenzen, parallele Registrierungen und Buchungen sowie die Alt-Datenübernahme; die lokale `data/app.sqlite` wird dabei nicht verändert.

Beim ersten Start wird `data/app.sqlite` angelegt. Liegen die drei älteren SQLite-Dateien im Projektordner, werden Konten, Zusagen und Veranstaltungsdaten einmalig **lesend** importiert; alte Klartextpasswörter werden dabei gehasht. Im aktuellen lokalen Projekt wurden die Altdateien nach Datenabgleich entfernt; auf Wunsch wurden auch die zwischenzeitlichen Kopien gelöscht. **Für einen Umzug oder eine Wiederherstellung mit vorhandenen Konten und Zusagen muss die aktuelle `data/app.sqlite` separat gesichert und übertragen werden**; ohne sie und ohne Altdateien startet die Anwendung mit einer neuen, leeren Datenbank. Bei bestehenden Installationen ergänzt der Start die Koordinatenspalten in `party_info` und belässt bisherige Ortsangaben/Links. `data/` und `*.sqlite*` sind von Git ausgeschlossen.

## Admin einrichten

Bei vorhandenen Alt-Daten bleiben Adminrechte aus `accounts.sqlite` erhalten. Für einen frischen Start beide Umgebungsvariablen `ADMIN_USERNAME` und `ADMIN_PASSWORD` vor dem ersten `npm start` setzen (mindestens zwölf Zeichen für das Passwort). Der Server legt damit ein Admin-Konto an; die **erste öffentliche Registrierung erhält keine Adminrechte**. Geheimnisse niemals in Dateien oder Wiki eintragen. Sind die Variablen beim Start nicht gesetzt, ist Registrierung möglich, aber der Adminbereich erst nach Einrichtung eines Administrators verfügbar.

## Einstellungen und Betrieb

- `PORT` (Standard: `621`) und `DATA_DIR` (Standard: `data/` unter dem Projektverzeichnis) können als Umgebungsvariablen gesetzt werden.
- `NODE_ENV=production` setzt das Session-Cookie auf `Secure`. Für den Betrieb mit einem öffentlichen Host ist HTTPS erforderlich. Die konkrete Hosting-Plattform ist noch nicht festgelegt.
- Browserdateien aus `public/` werden nur über ausdrücklich definierte Routen ausgeliefert; die Admin-HTML-Seite unter `/admin` nur an Admins. Veranstaltungsdaten und Teilnehmerliste erfordern eine Anmeldung; die eingebettete Google-Karte nutzt bei vorhandenem Pin die gespeicherten Koordinaten, sonst weiterhin die Adresse. Der externe Maps-Link muss eine HTTPS-URL von Google Maps sein.
- Der klickbare Karten-Picker verwendet Leaflet und OpenStreetMap-Kacheln. Eine bewusst gestartete Suche sendet den eingegebenen Text direkt aus dem Browser an Nominatim (OpenStreetMap); es gibt keine automatische Suche beim Tippen. Für Kacheln und Suche ist eine Internetverbindung erforderlich. Ein Google-Maps-API-Schlüssel wird nicht benötigt. Der Google-Maps-Link wird auf dem Server aus dem gespeicherten Pin erstellt.
- Öffentliche Registrierung ist gewollt. Bestehende Konten können sich nach Import mit ihrem alten Passwort anmelden; neue Passwörter benötigen mindestens zwölf Zeichen.

## Produktiv nur über HTTPS

In Produktion (`NODE_ENV=production`) lauscht Node ausschließlich auf `127.0.0.1` am konfigurierten `PORT` (Standard `621`). Der **lokale Nginx-Reverse-Proxy** übernimmt das vorhandene Zertifikat und leitet HTTPS-Anfragen intern an Node weiter. Die App akzeptiert dann nur Anfragen, bei denen der als `loopback` vertrauenswürdige Proxy `X-Forwarded-Proto: https` setzt; direkte HTTP-Anfragen ohne diesen Nachweis erhalten `426`. Session-Cookies tragen `Secure`. Lokal ohne Produktionsmodus bleibt HTTP für die Entwicklung möglich.

`deploy/nginx.conf.example` zeigt die nötigen Nginx-Einstellungen: Auf Port 80 erfolgt nur eine Weiterleitung zu HTTPS; Port 443 verwendet Zertifikat und Schlüssel, leitet an `127.0.0.1:621` weiter, setzt `Host` und **überschreibt** `X-Forwarded-Proto` mit `https`. Vor Einsatz Domain und beide **Dateipfade** ersetzen; keine Zertifikate oder privaten Schlüssel ins Repository übernehmen. Die Vorlage ist noch nicht produktiv aktiviert, weil Domain und Pfade noch nicht feststehen. Der Proxy muss auf demselben Host wie Node laufen; für eine andere Topologie ist die Vertrauens- und Bindungskonfiguration neu festzulegen.
