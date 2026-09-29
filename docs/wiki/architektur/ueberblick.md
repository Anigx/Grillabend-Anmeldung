# Architekturüberblick

`server.js` ist der Startpunkt; `src/server.js` erstellt die Express-Anwendung. Browserdateien liegen unter `public/`: `index.html`/`js/app.js` für Anmeldung und Teilnahme, `admin.html`/`js/admin.js` für die Administration, Stylesheets unter `public/css/`. Nur ausdrücklich freigegebene Assets werden ausgeliefert; die Admin-HTML-Seite unter `/admin` erfordert eine geprüfte Admin-Sitzung. `src/db.js` verwaltet SQLite unter `data/app.sqlite` (oder `DATA_DIR`); `src/security.js` berechnet Passwort- und Session-Token-Hashes. Weder `data/` noch Alt-Datenbanken, Quellmodule oder `docs/` sind statisch erreichbar (`src/server.js`, `.gitignore`).

Für den Karten-Picker lädt `/admin` Leaflet-Dateien über explizite `/vendor/leaflet/`-Routen aus der installierten Abhängigkeit. `public/js/admin.js` nutzt OpenStreetMap-Kacheln und sendet den angeklickten Punkt als Koordinaten an dieselbe Admin-API; `src/server.js` speichert diese in `party_info` und erzeugt den Google-Maps-Link. `public/js/app.js` nutzt den gespeicherten Punkt für die eingebettete Karte in der angemeldeten Mitgliederansicht. Ohne Pin greift die bisherige Adresssuche. Siehe [[features/administration]] und [[daten/sqlite]].

Die Ortssuche im Admin-Karten-Picker fragt nur nach bewusster Benutzereingabe per Browser-`fetch` Nominatim direkt ab (`public/js/admin.js`), begrenzt auf fünf Ergebnisse und mit kurzem Mindestabstand zwischen Abfragen. Die Suche ist **kein** eigener Server-Endpunkt. Ein ausgewählter Treffer verschiebt lediglich die Karte; gespeichert wird weiterhin ausschließlich nach Setzen eines Pins und dem Klick auf Speichern. Näheres in [[features/administration]].

Beim Login/Registrieren setzt der Server ein `HttpOnly`-/`SameSite=Lax`-Cookie für eine zufällige Session, deren Token nur gehasht in SQLite gespeichert ist. `GET /api/session` stellt den Anmeldestand wieder her; API-Routen prüfen die Session serverseitig. Adminrechte werden für `/admin` und `GET`/`PUT /api/admin/party-info` in der Datenbank geprüft, nicht aus einer Browserangabe übernommen. Die Teilnehmerseite liest `GET /api/party-info` und `GET /api/attendees`; Adminänderungen laufen nur über den eigenen API-Pfad. Bei `NODE_ENV=production` wird zusätzlich das Cookie-Attribut `Secure` gesetzt (`src/server.js`, `src/security.js`).

Für Produktion hat der Projektverantwortliche Nginx als HTTPS-Reverse-Proxy gewählt. `server.js` bindet Node dann nur an `127.0.0.1`; `src/server.js` vertraut nur einem Loopback-Proxy und lehnt Anfragen ohne von diesem gesetztes HTTPS-Protokoll mit `426` ab. Nginx soll öffentlichen HTTP-Verkehr zu HTTPS weiterleiten und `X-Forwarded-Proto` selbst auf `https` setzen (`deploy/nginx.conf.example`). Das ist eine Vorlage, keine Aussage über ein bereits eingerichtetes Deployment; Einzelheiten in [[entwicklung/lokal-starten]].

Änderungen an RSVPs und Kapazitäten werden auf der einzelnen Serverinstanz sequenziell ausgeführt; die Kapazitätsprüfung erfolgt vor dem Schreiben (`src/server.js`, Funktion `exclusive`). `Unklar:` Wie viele Serverinstanzen die spätere Hosting-Umgebung verwenden soll; für mehrere Instanzen ist diese In-Process-Synchronisierung nicht ausreichend. Zur Begründung der aktuellen Umsetzung siehe [[entscheidungen/neuaufbau]].

Der Server kann vorhandene Alt-Daten einmalig lesend aus drei alten SQLite-Dateien in eine neue Datenbank importieren; Einzelheiten in [[daten/sqlite]]. Die lokalen Altdateien und ihre zwischenzeitlichen Kopien wurden nach Abgleich entfernt. Für den laufenden Datenbestand ist `data/app.sqlite` maßgeblich.

## Verwandte Seiten

[[api/http-endpunkte]] · [[daten/sqlite]] · [[entscheidungen/neuaufbau]] · [[entwicklung/lokal-starten]]
