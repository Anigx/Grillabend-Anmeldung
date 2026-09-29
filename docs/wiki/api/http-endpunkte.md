# HTTP-Endpunkte

Die Routen und Autorisierungsregeln stehen in `src/server.js`; Browseraufrufe in `public/js/app.js` und `public/js/admin.js`. Anfragen mit Body nutzen JSON; fehlerhafte oder unzulässige Eingaben liefern Fehlerstatus. Sitzungen laufen über `HttpOnly`-Cookie; Benutzernamen in Request-Bodies verleihen keine Rechte. Die API verwendet `Cache-Control: no-store`.

Schreibanfragen (`POST`, `PUT`, `PATCH`, `DELETE`) benötigen immer einen gültigen `Origin`-Header. Schema, Host und Port müssen exakt zur angefragten Seite und, falls gesetzt, zu `APP_ORIGIN` passen; ein fehlender, fehlerhafter oder abweichender Wert liefert `403`. Das gilt auch für Registrierung und Login. `Sec-Fetch-Site` darf, wenn vorhanden, nur `same-origin` oder `none` sein. Bei gesetztem `APP_ORIGIN` müssen auch die effektive Seiten-Origin und der `Host` dazu passen; `APP_ORIGIN` ist keine CORS-Freigabe. Ohne Einstellung wird die erlaubte Origin aus dem Anfrageprotokoll und Host bestimmt. Beschädigtes JSON liefert nach bestandener Originprüfung `400`, ein Body über dem konfigurierten JSON-Limit von `16kb` liefert `413`; interne Fehlerdetails werden nicht als API-Antwort ausgegeben (`src/server.js`, `test/app.test.js`).

Bei `NODE_ENV=production` lehnt die Anwendung **jede** über den lokalen Nginx-Upstream nicht als HTTPS bestätigte Anfrage mit `426` ab; das gilt auch für Seiten und Assets. Der Reverse Proxy muss `X-Forwarded-Proto: https` selbst setzen (`src/server.js`, `deploy/nginx.conf.example`).

| Methode und Pfad | Anmeldung | Funktion |
| --- | --- | --- |
| `POST /api/register` | nein | Konto anlegen; `{ username, password }` mit mindestens 12 Zeichen, Groß-/Kleinbuchstabe, Ziffer und Sonderzeichen im Passwort; Namensanzeige für neu registrierte Konten einschalten, Session-Cookie setzen, nie automatisch Admin werden |
| `POST /api/login` | nein | Konto prüfen, Session-Cookie setzen |
| `GET /api/session` | nein | eigenen Benutzernamen, Adminstatus, `show_name` und `account_managed` melden, sonst `username: null`, beide Flags `false` |
| `POST /api/logout` | ja | aktuelle Session entfernen und Cookie löschen |
| `PUT /api/profile/visibility` | ja | `{ show_name: boolean }` für **das eigene** Konto speichern; Antwort `{ show_name }`; fremde Benutzer-IDs im Body haben keine Wirkung |
| `PUT /api/profile/username` | ja | `{ username, current_password }` prüft das aktuelle Passwort und ändert nur das eigene Konto samt RSVP-Namen atomar; `409` bei Namenskollision oder startverwaltetem Admin |
| `PUT /api/profile/password` | ja | `{ current_password, new_password }` prüft das aktuelle Passwort, speichert einen neuen scrypt-Hash, widerruft andere Sitzungen und setzt ein frisches Cookie; `409` beim startverwalteten Admin |
| `GET /api/party-info` | ja | Veranstaltungsdaten einschließlich Regeln, Informationen und optionalem Pin (`latitude`, `longitude`) liefern |
| `GET /api/admin/party-info` | Admin | editierbare Daten, optionalen Pin und `occupancy` (`cabin`, `bedding`) abrufen |
| `GET /api/admin/users` | Admin | registrierte Konten mit `username` und ggf. `kommt`, `huette`, `bettgarnitur`, `updated_at` aus ihrer Antwort abrufen; ohne Antwort sind diese vier Felder `null` |
| `POST /api/admin/reset-rsvps` | Admin | `{ password }` prüft das aktuelle Passwort des angemeldeten Admins; bei Erfolg alle bisherigen Antworten löschen und `{ success: true, deleted: Anzahl }` liefern; bei falschem Passwort `422`, ohne Passwort `400`, nach zu vielen Auth-Versuchen `429` |
| `PUT /api/admin/party-info` | Admin | `{ date, location_name, location_address, maps_url, latitude, longitude, max_cabin_capacity, max_bettgarnitur, rules, info }` validieren und speichern; aktualisierte Daten samt `occupancy` zurückgeben |
| `GET /api/attendees` | ja | Teilnehmerantworten mit Namen nur bei eigener Freigabe liefern, sonst `username: "Anonym"`; `is_self` (0/1) identifiziert ausschließlich den eigenen Eintrag; keine Antwortzeitpunkte an Mitglieder |
| `POST /api/rsvp` | ja | eigene Antwort mit `{ kommt, huette, bettgarnitur }` speichern, Grenzen prüfen |
| `DELETE /api/rsvp` | ja | eigenen Eintrag löschen |

Bei `PUT /api/admin/party-info` müssen übermittelte Koordinaten entweder beide `null` oder beide gültige Zahlen innerhalb der geografischen Grenzen sein. Werden sie ausgelassen, bleiben bereits gespeicherte Koordinaten bestehen. Bei gesetztem Pin bestimmt der Server den Google-Maps-Link aus den Koordinaten (`src/server.js`).

Registrierung und Login liefern zur eigenen Session ebenfalls `show_name` und `account_managed`. Die schreibenden Konto-Routen erfordern zusätzlich zur gültigen Session dieselbe Origin-Prüfung wie alle anderen Schreibanfragen sowie eine erneute Passwortbestätigung; zu viele Versuche werden pro IP mit `429` begrenzt. Ungültige Eingaben erhalten `400`, falsches aktuelles Passwort `422`. Das Mitglied kann den sichtbaren Namen später umschalten; die Antwort selbst und die Belegungszählung bleiben unverändert. Admins sehen die echten Kontonamen über ihre geschützte API. Durch die offen erlaubte Registrierung können fremde Selbstregistrierte weiterhin die übrigen Veranstaltungs- und Antwortdaten lesen ([[features/anmeldung-und-teilnahme]]).

`GET /` liefert `public/index.html`, `GET /admin` nur mit Admin-Sitzung `public/admin.html`. Aus `public/` sind lediglich `/css/style.css`, `/css/modal.css`, `/css/admin.css`, `/js/app.js`, `/js/admin.js` und `/js/admin-exports.js` über explizite Routen erreichbar; zusätzlich werden die installierten Leaflet-Dateien über `/vendor/leaflet/leaflet.css` und `/vendor/leaflet/leaflet.js` sowie `/vendor/exceljs/exceljs.min.js`, `/vendor/pdf-lib/pdf-lib.min.js` und `/vendor/jszip/jszip.min.js` bereitgestellt. Nur der Admin-geschützte Endpunkt `/api/admin/users` liefert die Daten für clientseitige Exporte. Es gibt keine Route zu SQLite-Dateien, `data/`, `src/` oder `docs/` (`src/server.js`). Die frühere Schreibroute `POST /api/party-info` wurde entfernt.

## Verwandte Seiten

[[architektur/ueberblick]] · [[features/anmeldung-und-teilnahme]] · [[features/administration]] · [[daten/sqlite]]
