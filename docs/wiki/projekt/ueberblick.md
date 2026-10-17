# Projektüberblick

Die Anwendung dient der Anmeldung einer kleinen Gruppe zu **einem aktuellen Grillabend**. Gäste können sich offen registrieren, anmelden und für Teilnahme, Hüttenschlaf sowie den getrennten Bedarf an Luftmatratze und Bettzeug eintragen. Admins bearbeiten Termin, Ort, Kapazitäten, Regeln und Informationen auf einer eigenen Seite. Belege: `public/index.html`, `public/admin.html`, `src/server.js`.

Der Projektverantwortliche wünscht die vorhandene dunkle Gestaltung als visuelle Referenz, siehe [[design/erscheinungsbild]]. „Grillabend“ ist derzeit die Bezeichnung in `public/index.html`; `Unklar:` Ob dies der endgültige Name ist.

Termindetails, Karte, Regeln und Teilnehmer sind nur nach Anmeldung sichtbar (`src/server.js`, `public/js/app.js`). Da die Registrierung auf Wunsch offen ist, kann grundsätzlich jede Person mit neuem Konto diese Angaben sehen. Hosting und öffentliche Adresse stehen noch nicht fest.

## Verwandte Seiten

[[architektur/ueberblick]] · [[design/erscheinungsbild]] · [[features/anmeldung-und-teilnahme]] · [[features/administration]] · [[planung]]
