# Anmeldung und Teilnahme

Registrierung ist offen; neue Passwörter müssen 12–256 Zeichen haben. Die erste Registrierung erhält **keine** Adminrechte. Anmeldungen erfolgen über serverseitige Sessions; Abmelden entfernt die Session (`src/server.js`: `/api/register`, `/api/login`, `/api/logout`, `/api/session`). Importierte Konten behalten ihr altes Passwort, das beim Import gehasht wird (`src/db.js`, `src/security.js`).

Neue Benutzernamen werden auch bei gleichzeitigen Anfragen ohne Unterscheidung der Groß-/Kleinschreibung atomar geprüft und angelegt (`src/server.js`, `test/app.test.js`).

Angemeldete Personen wählen `Ja`, `Nein` oder `Vielleicht`. Nur bei `Ja` kann ein Hüttenschlafplatz und gegebenenfalls eine Bettgarnitur beansprucht werden. Die bisherigen Antwortmöglichkeiten zur Bettgarnitur (`Ja`/`Nein`) bleiben erhalten. RSVPs können von der angemeldeten Person geändert oder gelöscht werden; der Server nimmt den Benutzernamen ausschließlich aus ihrer Sitzung (`public/index.html`, `public/js/app.js`, `src/server.js`).

Server und Oberfläche prüfen verfügbare Plätze gegen die vom Admin gesetzten Grenzen. Nur feste Zusagen (`kommt = 'Ja'`) zählen für Hütte und Bettgarnitur; die serverseitigen Prüfungen sind maßgeblich. Die Teilnehmerliste und ihre Zähler werden nach Anmeldung über `/api/attendees` geladen (`src/server.js`, `public/js/app.js`).

## Verwandte Seiten

[[projekt/ueberblick]] · [[design/erscheinungsbild]] · [[features/administration]] · [[api/http-endpunkte]] · [[daten/sqlite]]
