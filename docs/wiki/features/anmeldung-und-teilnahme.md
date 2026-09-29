# Anmeldung und Teilnahme

Registrierung ist offen; neue Passwörter müssen mindestens 12 Zeichen, mindestens einen Großbuchstaben, einen Kleinbuchstaben, eine Ziffer und ein Sonderzeichen (kein Leerraum) enthalten. Es gibt keine eigene Obergrenze für die Passwortlänge; Anfragen unterliegen der allgemeinen JSON-Body-Grenze von `16kb`. Der Server prüft diese Vorgaben bei `/api/register`; sie gelten nicht rückwirkend für importierte Konten oder die Anmeldung bestehender Konten. Die erste Registrierung erhält **keine** Adminrechte. Anmeldungen erfolgen über serverseitige Sessions; Abmelden entfernt die Session (`src/server.js`: `/api/register`, `/api/login`, `/api/logout`, `/api/session`). Importierte Konten behalten ihr altes Passwort, das beim Import gehasht wird (`src/db.js`, `src/security.js`).

Login und Registrierung sind zwei umschaltbare Ansichten desselben Formulars auf `public/index.html`, keine getrennten Seiten. Im Registrierungsmodus steht „Passwort wiederholen“ als normales Formularfeld direkt unter „Passwort“; die einfache Stärkeanzeige ohne Erfüllungszahl liegt darunter in einer eigenen Karte, gefolgt von den fünf Passwortvorgaben. Ein zweites Passwortfeld muss mit dem ersten übereinstimmen; eine Übereinstimmungsrückmeldung erscheint erst nach der Eingabe, die Wiederholung wird nur im Browser geprüft und nicht an die API übermittelt. Für neue Passwörter wird `autocomplete="new-password"` verwendet; im Loginmodus bleibt `current-password` aktiv. Das Formular ruft je nach Modus `/api/login` oder `/api/register` auf (`public/js/app.js`). Nach erfolgreicher Anmeldung zeigt dieselbe Seite die Veranstaltungsdaten und die Rückmeldung an.

Neue Benutzernamen werden auch bei gleichzeitigen Anfragen ohne Unterscheidung der Groß-/Kleinschreibung atomar geprüft und angelegt (`src/server.js`, `test/app.test.js`).

Angemeldete Personen wählen `Ja`, `Nein` oder `Vielleicht`. Nur bei `Ja` kann ein Hüttenschlafplatz und gegebenenfalls eine Bettgarnitur beansprucht werden. Die bisherigen Antwortmöglichkeiten zur Bettgarnitur (`Ja`/`Nein`) bleiben erhalten. RSVPs können von der angemeldeten Person geändert oder gelöscht werden; der Server nimmt den Benutzernamen ausschließlich aus ihrer Sitzung (`public/index.html`, `public/js/app.js`, `src/server.js`).

Server und Oberfläche prüfen verfügbare Plätze gegen die vom Admin gesetzten Grenzen. Nur feste Zusagen (`kommt = 'Ja'`) zählen für Hütte und Bettgarnitur; die serverseitigen Prüfungen sind maßgeblich. Die Teilnehmerliste und ihre Zähler werden nach Anmeldung über `/api/attendees` geladen (`src/server.js`, `public/js/app.js`).

## Verwandte Seiten

[[projekt/ueberblick]] · [[design/erscheinungsbild]] · [[features/administration]] · [[api/http-endpunkte]] · [[daten/sqlite]]
