# SQLite-Daten und Übernahme

Die neue Datenbank liegt standardmäßig unter `data/app.sqlite` im Projektverzeichnis; `DATA_DIR` kann den Speicherort anpassen (`src/db.js`, `src/server.js`). `src/db.js` legt folgende Tabellen an:

| Tabelle | Aufgabe |
| --- | --- |
| `users` | eindeutiger Name, `password_hash` mit Salt und scrypt, Admin-Flag |
| `sessions` | Hash eines zufälligen Session-Tokens, Benutzer-ID und Ablaufzeit |
| `rsvps` | Name, Teilnahme, Hüttenschlaf, Bettgarnitur, Zeit der Änderung |
| `party_info` | aktueller Termin (`id = 1`), Adresse, Maps-Link, optionale Koordinaten (`latitude`, `longitude`), Kapazitäten, Regeln und Informationen |
| `metadata` | Kennzeichnung der abgeschlossenen Alt-Datenübernahme |

Beim ersten Start sucht `src/db.js` nach `accounts.sqlite` (`users`), `party_eintraege.sqlite` (`rsvps`) und `Datum.sqlite` (`party_info`) **im Projektordner oberhalb von `src/`**. Vorhandene Dateien werden **nur lesend** geöffnet. Der Import läuft in einer Transaktion; importierte Klartextpasswörter werden vor dem Speichern gehasht. Ein Kennzeichen verhindert den erneuten Import. Bei vorhandenen Benutzern/RSVPs in der neuen Datenbank wird ein noch ausstehender Alt-Import abgebrochen, statt Datensätze still zu überschreiben. Fehlende alte Tabellen sind zulässig. Nach dem Abgleich vom 2026-09-29 liegen die drei Altdateien nicht mehr im Projektordner; der Importcode bleibt für Wiederherstellungen und andere Installationen erhalten.

Fehlt bei einem Alt-Konto ein gültiges Passwort, bricht die Übernahme mit Rollback ab, statt aus einem fehlenden Wert ein erratbares neues Passwort zu erzeugen (`src/db.js`, `test/app.test.js`).

Bei einer bestehenden `data/app.sqlite` ergänzt `src/db.js` fehlende Spalten `latitude`/`longitude` per `ALTER TABLE`, ohne die bisherigen Ortsangaben und Maps-Links zu ändern. Ohne Pin sind beide Werte `NULL`; mit Pin liegen sie in den Bereichen −90 bis 90 bzw. −180 bis 180 und werden vor dem Speichern auf sechs Nachkommastellen gerundet (`src/server.js`). Der Google-Maps-Link wird bei gesetztem Pin serverseitig aus den Koordinaten erzeugt; Mitglieder erhalten beide Werte über `GET /api/party-info`.

**Wichtig:** Die drei Altdateien und ihre zwischenzeitlichen Kopien sind nach ausdrücklichem Wunsch entfernt; lokal ist nur `data/app.sqlite` als aktueller Bestand vorhanden. Diese Datei wird nicht in Git aufgenommen (`.gitignore`). Das Kennzeichen `metadata.legacy_imported` zeigt nur einen abgeschlossenen Importlauf an und ersetzt keinen Datenabgleich. Bei einem Umzug oder einer Wiederherstellung muss `data/app.sqlite` separat gesichert und übertragen werden; ein Neuaufbau ohne aktuelle Datenbank und ohne Altdateien erzeugt keine bisherigen Konten oder Zusagen.

Am 2026-09-29 wurden alle vier Datenbanken lesend auf SQLite-Integrität geprüft. Die aktuelle Datenbank enthält alle 24 Altkonten mit unveränderten Adminrechten und gegen die Hashes verifizierten alten Passwörtern sowie ein zusätzliches Konto. Alle 19 alten Zusagen entsprechen der aktuellen Datenbank einschließlich Auswahl und Zeitstempel. Termin, Ortsangaben und Kapazitäten stimmen überein; nur der alte Maps-Link unterschied sich: Die aktuelle Datenbank enthält einen Karten-Pin, und ihr Link wird nachweislich aus dessen Koordinaten erzeugt (`src/server.js`). Die Altdateien wurden zunächst außerhalb des Projekts kopiert und per Prüfsumme und SQLite-Integritätsprüfung kontrolliert; nach Entfernung der Originale wurden auf Wunsch auch diese Kopien entfernt. Der alte Link ist damit nicht mehr verfügbar. Dieser Abgleich betrifft den lokalen Stand, nicht eine unbekannte andere Installation.

Der Projektverantwortliche hat anschließend ausdrücklich die Entfernung auch dieser drei Kopien angefordert. Damit bleibt `data/app.sqlite` der einzige im Projekt bekannte aktuelle Datenbestand; der frühere Maps-Link wird nicht benötigt, weil der aktuelle Pin den gültigen Link bestimmt. Für eine spätere Wiederherstellung ist eine eigene Sicherung von `data/app.sqlite` erforderlich.

## Verwandte Seiten

[[architektur/ueberblick]] · [[api/http-endpunkte]] · [[entwicklung/lokal-starten]] · [[entscheidungen/neuaufbau]]
