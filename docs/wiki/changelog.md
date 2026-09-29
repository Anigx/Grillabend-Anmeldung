# Changelog

Hier stehen nur tatsächlich abgeschlossene, überprüfbare Änderungen. Offene Vorhaben stehen in [[planung]]. Für die Entwicklung vor Einrichtung dieses Wikis liegt kein belegter Änderungsverlauf vor; er wird nicht rekonstruiert.

Frühere Einträge nennen die damaligen Dateipfade; die aktuelle Struktur steht in [[architektur/ueberblick]].

## 2026-09-29

- Ungenutzte CSS-Selektoren für einen früheren Auth-Umschalter, ein nicht verwendetes Badge sowie alte Modal-Elemente entfernt (`public/css/style.css`, `public/css/modal.css`). Den mit `start` identischen `dev`-Alias entfernt und den Startbefehl im Wiki aktualisiert (`package.json`, [[entwicklung/lokal-starten]]).
- Voraussetzungen für eine spätere Entfernung der lokalen Alt-Datenbanken konkretisiert: getrennte Sicherung und Abgleich der übernommenen Daten; die Bestandsdateien bleiben bis dahin erhalten ([[daten/sqlite]], [[planung]]).
- Die drei lokalen Alt-Datenbanken mit `data/app.sqlite` abgeglichen: 24 von 24 Konten einschließlich Adminrechten und Passwortvergleich, 19 von 19 Zusagen einschließlich Zeitstempel und Veranstaltungsdaten; der neu generierte Maps-Link stammt aus dem aktuellen Karten-Pin. Die Altdateien anschließend außerhalb des Projekts unter `../legacy-sqlite-backup-2026-09-29/` mit Prüfsummen- und SQLite-Integritätsprüfung gesichert und aus dem Projektordner entfernt ([[daten/sqlite]]).
- Auf ausdrücklichen Wunsch auch die drei zwischenzeitlichen Kopien und den Backup-Ordner entfernt. Die aktuelle lokale `data/app.sqlite` bleibt bestehen ([[daten/sqlite]]).

## 2026-09-28

- Internes Wiki und Agent-Arbeitsregeln anhand des vorhandenen Projekts dokumentiert (`docs/wiki/`, `AGENTS.md`).
- Lokales Git-Repository eingerichtet und lokale SQLite-Dateien, `data/` sowie `node_modules/` für künftige Commits ausgeschlossen (`.gitignore`).
- Gewünschtes Erscheinungsbild der bestehenden Oberfläche als Designreferenz festgehalten (`docs/wiki/design/erscheinungsbild.md`).
- Anwendung für einen aktuellen Grillabend neu aufgebaut: serverseitige Sessions, gehashte Passwörter, rollenbasierte Administration, geschützte Datenrouten und Kapazitätsprüfungen (`server.js`, `security.js`, `db.js`).
- Anmeldung, Teilnahme, Veranstaltungsinformationen und Kartenbereich im bestehenden dunklen Stil erneuert (`index.html`, `script.js`, `style.css`, `modal.css`).
- Einmalige lesende Übernahme der alten SQLite-Daten, lokale Projektanleitung und API-Tests hinzugefügt (`db.js`, `README.md`, `test/app.test.js`, `package.json`).
- Abhängigkeiten auf Express 5 und `sqlite3` 6 aktualisiert; die Produktionsabhängigkeiten wurden mit `npm audit --omit=dev --audit-level=high` überprüft (`package.json`, `package-lock.json`).
- Sicherheitstests für Kryptografie, Anmeldung, Sessions, Rechte, CSRF, Eingabegrenzen, parallele Buchung und Alt-Datenübernahme ergänzt. Dabei parallele Groß-/Kleinschreibungs-Duplikate bei Konten und den Import fehlender Alt-Passwörter behoben (`test/security.test.js`, `test/app.test.js`, `server.js`, `db.js`).
- Admin- und Löschdialog außerhalb der begrenzenden Hauptkarte platziert, damit sie nach dem Klick sichtbar sind; Fokus beim Öffnen und Schließen angepasst (`index.html`, `script.js`).
- Admin-Dialog durch eigene, rollenbeschränkte HTML-Seite `/admin` mit Belegungsübersicht, Vorschau und eigenem Browsercode ersetzt (`public/admin.html`, `public/js/admin.js`, `public/css/admin.css`). Adminlesen/-speichern auf `GET`/`PUT /api/admin/party-info` gebündelt, frühere Schreibroute entfernt (`src/server.js`, `test/app.test.js`).
- Projektdateien nach `src/` und `public/` geordnet; `server.js` bleibt Einstieg, Alt-Datenbanken und `data/` bleiben am bisherigen Ort. Tests und Dokumentation auf die neuen Pfade umgestellt (`README.md`, `AGENTS.md`, `docs/wiki/`).
- Farbige Oberkante der Adminkarte an deren abgerundeten Ecken begrenzt (`public/css/admin.css`).
- Klickbaren Karten-Picker im Adminbereich ergänzt: Koordinaten werden in `party_info` gespeichert, bestehende Datenbanken additiv migriert und Google-Maps-Link und Mitgliederkarte aus dem Pin gespeist. Bestehende Links bleiben ohne Pin bestehen; API-/Migrationstests erweitert (`public/admin.html`, `public/js/admin.js`, `public/js/app.js`, `src/server.js`, `src/db.js`, `test/app.test.js`).
- Manuell gestartete Ortssuche im Karten-Picker ergänzt: Suchfeld oben rechts mit `5px` Abstand, Ergebnisse über Nominatim, Auswahl zentriert die Karte ohne den Pin ungefragt zu setzen (`public/admin.html`, `public/css/admin.css`, `public/js/admin.js`).
- Für Produktionsbetrieb HTTPS hinter einem lokalen Nginx-Reverse-Proxy abgesichert: Node bindet an Loopback, lehnt Anfragen ohne bestätigtes HTTPS mit `426` ab und behält lokal HTTP für Entwicklung bei. Nginx-Vorlage und Tests ergänzt; die Vorlage wurde noch nicht produktiv aktiviert (`server.js`, `src/server.js`, `deploy/nginx.conf.example`, `test/app.test.js`).

## Verwandte Seiten

[[index]] · [[architektur/ueberblick]] · [[wiki-pflege]] · [[planung]]
