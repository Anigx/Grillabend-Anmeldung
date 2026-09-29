# SQLite-Daten und Übernahme

Die neue Datenbank liegt standardmäßig unter `data/app.sqlite` im Projektverzeichnis; `DATA_DIR` kann den Speicherort anpassen (`src/db.js`, `src/server.js`). `src/db.js` legt folgende Tabellen an:

| Tabelle | Aufgabe |
| --- | --- |
| `users` | eindeutiger Name, `password_hash` mit Salt und scrypt, Admin-Flag, `show_name` (0/1; Standard 1) für die freiwillige Namensanzeige |
| `sessions` | Hash eines zufälligen Session-Tokens, Benutzer-ID und Ablaufzeit |
| `rsvps` | Name, Teilnahme, Hüttenschlaf, Bettgarnitur, Zeit der Änderung |
| `party_info` | aktueller Termin (`id = 1`), Adresse, Maps-Link, optionale Koordinaten (`latitude`, `longitude`), Kapazitäten, Regeln und Informationen |
| `metadata` | Kennzeichnung der abgeschlossenen Alt-Datenübernahme |

Die Tabelle `sessions` hat einen Index auf `expires_at`. Abgelaufene Einträge werden beim Datenbankstart und beim Ausstellen neuer Sitzungen entfernt; beim Start und bei weiteren Logins bleibt die Anzahl aktiver Sessions pro Konto auf zehn begrenzt. Bei einer Passwortrotation des konfigurierten Admin-Kontos aktualisiert `src/server.js` dessen Passwort-Hash und entfernt dessen Sitzungen gemeinsam in einer SQLite-Transaktion.

Ein Konto kann den Benutzernamen nach Passwortprüfung ändern. `src/server.js` reserviert Änderungen an Konten, Sitzungen und Antworten in einer gemeinsamen Prozess-Warteschlange; eine SQLite-Transaktion ändert den Benutzernamen nur bei fehlender case-insensitiver Kollision und passt den dazugehörigen `rsvps.username` an. Sitzungen referenzieren die unveränderte `users.id` und bleiben beim Umbenennen erhalten. Beim Passwortwechsel werden Hash und Session-Widerruf gemeinsam geschrieben: alle bisherigen Sitzungen werden gelöscht und nur für den aktuellen Browser ein neuer Token angelegt. Vor dem Ausstellen einer Login-Sitzung wird der zuvor geprüfte Hash erneut mit dem aktuellen DB-Hash verglichen, damit ein parallel begonnener Login mit altem Passwort nach einer Rotation keinen neuen Token mehr erhält (`src/server.js`, `test/app.test.js`).

Die Admin-Userübersicht verbindet `users` und `rsvps` lesend über den Benutzernamen (ohne Beachtung der Groß-/Kleinschreibung). So bleiben auch Konten ohne RSVP sichtbar; es wird dafür keine zusätzliche Tabelle oder Spalte angelegt. Siehe [[features/administration]].

Der Admin-Reset für einen neuen Grillabend leert ausschließlich `rsvps`, nach Prüfung des aktuellen Admin-Passworts. `users`, `sessions`, `party_info` und `metadata` bleiben erhalten. Buchungen und Kapazitätsänderungen laufen in derselben Schreibwarteschlange wie der Reset (`src/server.js`); danach sind alle bisherigen Belegungen wieder null und User können erneut antworten.

Beim ersten Start sucht `src/db.js` nach `accounts.sqlite` (`users`), `party_eintraege.sqlite` (`rsvps`) und `Datum.sqlite` (`party_info`) **im Projektordner oberhalb von `src/`**. Vorhandene Dateien werden **nur lesend** geöffnet. Der Import läuft in einer Transaktion; importierte Klartextpasswörter werden vor dem Speichern gehasht. Ein Kennzeichen verhindert den erneuten Import. Bei vorhandenen Benutzern/RSVPs in der neuen Datenbank wird ein noch ausstehender Alt-Import abgebrochen, statt Datensätze still zu überschreiben. Fehlende alte Tabellen sind zulässig. Nach dem Abgleich vom 2026-09-29 liegen die drei Altdateien nicht mehr im Projektordner; der Importcode bleibt für Wiederherstellungen und andere Installationen erhalten.

Fehlt bei einem Alt-Konto ein gültiges Passwort, bricht die Übernahme mit Rollback ab, statt aus einem fehlenden Wert ein erratbares neues Passwort zu erzeugen (`src/db.js`, `test/app.test.js`).

Bei einer bestehenden `data/app.sqlite` ergänzt `src/db.js` fehlende Spalten `latitude`/`longitude` per `ALTER TABLE`, ohne die bisherigen Ortsangaben und Maps-Links zu ändern. Ohne Pin sind beide Werte `NULL`; mit Pin liegen sie in den Bereichen −90 bis 90 bzw. −180 bis 180 und werden vor dem Speichern auf sechs Nachkommastellen gerundet (`src/server.js`). Der Google-Maps-Link wird bei gesetztem Pin serverseitig aus den Koordinaten erzeugt; Mitglieder erhalten beide Werte über `GET /api/party-info`.

Eine bestehende `users`-Tabelle ohne Sichtbarkeitsspalte erhält beim Start `show_name INTEGER NOT NULL DEFAULT 1` (auf 0 oder 1 beschränkt). Für Datenbanken, die bereits eine frühere Spalte mit Standard 0 besitzen, stellt eine transaktionale Migration **einmalig alle Konten** auf 1. Die Markierung `metadata.names_visible_once` verhindert ein erneutes Überschreiben späterer Opt-outs beim Neustart. Neue Registrierungen, Alt-Importe und neu startkonfigurierte Admin-Konten schreiben ebenfalls ausdrücklich 1, auch falls das Schema einer bestehenden Datenbank noch den früheren Standard 0 trägt; Konten, Adminrechte und RSVPs werden bei der Umstellung nicht entfernt oder umbenannt. `PUT /api/profile/visibility` ändert anschließend nur die Spalte des eigenen Kontos. Die Mitgliederliste verbindet RSVPs mit Nutzern und gibt bei ausgeschalteter Anzeige statt des echten Namens „Anonym“ zurück; die Adminliste behält die Namen und Antwortzeitpunkte ([[features/anmeldung-und-teilnahme]], [[api/http-endpunkte]]).

**Wichtig:** Die drei Altdateien und ihre zwischenzeitlichen Kopien sind nach ausdrücklichem Wunsch entfernt; lokal ist nur `data/app.sqlite` als aktueller Bestand vorhanden. Diese Datei wird nicht in Git aufgenommen (`.gitignore`). Das Kennzeichen `metadata.legacy_imported` zeigt nur einen abgeschlossenen Importlauf an und ersetzt keinen Datenabgleich. Bei einem Umzug oder einer Wiederherstellung muss `data/app.sqlite` separat gesichert und übertragen werden; ein Neuaufbau ohne aktuelle Datenbank und ohne Altdateien erzeugt keine bisherigen Konten oder Zusagen.

Am 2026-09-29 wurden alle vier Datenbanken lesend auf SQLite-Integrität geprüft. Die aktuelle Datenbank enthält alle 24 Altkonten mit unveränderten Adminrechten und gegen die Hashes verifizierten alten Passwörtern sowie ein zusätzliches Konto. Alle 19 alten Zusagen entsprechen der aktuellen Datenbank einschließlich Auswahl und Zeitstempel. Termin, Ortsangaben und Kapazitäten stimmen überein; nur der alte Maps-Link unterschied sich: Die aktuelle Datenbank enthält einen Karten-Pin, und ihr Link wird nachweislich aus dessen Koordinaten erzeugt (`src/server.js`). Die Altdateien wurden zunächst außerhalb des Projekts kopiert und per Prüfsumme und SQLite-Integritätsprüfung kontrolliert; nach Entfernung der Originale wurden auf Wunsch auch diese Kopien entfernt. Der alte Link ist damit nicht mehr verfügbar. Dieser Abgleich betrifft den lokalen Stand, nicht eine unbekannte andere Installation.

Der Projektverantwortliche hat anschließend ausdrücklich die Entfernung auch dieser drei Kopien angefordert. Damit bleibt `data/app.sqlite` der einzige im Projekt bekannte aktuelle Datenbestand; der frühere Maps-Link wird nicht benötigt, weil der aktuelle Pin den gültigen Link bestimmt. Für eine spätere Wiederherstellung ist eine eigene Sicherung von `data/app.sqlite` erforderlich.

## Verwandte Seiten

[[architektur/ueberblick]] · [[api/http-endpunkte]] · [[entwicklung/lokal-starten]] · [[entscheidungen/neuaufbau]]
