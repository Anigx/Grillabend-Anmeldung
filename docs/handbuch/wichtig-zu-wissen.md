# Wichtig zu wissen

## Organisatorisches

- **Ein Grillabend gleichzeitig.** Die Anwendung verwaltet genau ein aktuelles Event; für den nächsten Abend werden im Adminbereich die Antworten zurückgesetzt und Termin/Ort angepasst.
- **Admin wird nicht über die Registrierung vergeben.** Admins entstehen über die Ersteinrichtung `/setup` oder aus übernommenen Alt-Daten. Die erste öffentliche Registrierung ist immer ein normales Mitglied.
- **Zeitstempel nur im Adminbereich.** Antwortzeitpunkte werden ausschließlich über die geschützte Admin-API ausgegeben, nicht an Mitglieder.

## Teilnahme und Ausstattung

- **Kapazitäten zählen nur feste Zusagen** (`kommt = Ja`). „Vielleicht“ reserviert nichts.
- **Luftmatratze und Bettzeug sind zwei unabhängige Bedarfe** mit je eigener Kapazität. Jede Kombination (keins, nur eins, beides) ist möglich. Die Anzeige „Schon voll!“ und die serverseitige Prüfung sind maßgeblich, die Oberfläche ist nur Komfort.
- **Bestehende „Bettgarnitur Ja“-Antworten** aus der früheren Version werden beim ersten Start auf **beide** Felder (Luftmatratze und Bettzeug) übertragen.

## Sichtbarkeit

- **Die Registrierung ist offen.** Jede Person mit neuem Konto kann die Veranstaltungs- und Teilnahmeangaben sehen. Das ist beabsichtigt, aber ein bewusster Risikopunkt.
- **Die Teilnehmerliste zeigt echte Namen.** Eine anonyme Namensanzeige gibt es nicht mehr; der frühere Schalter und die zugehörige API wurden entfernt. Admins sehen dieselben Namen in der Adminübersicht.

## Daten und Sicherung

- **Alle Daten liegen in `app.sqlite`.** Bei Docker im Volume `grillabend-data`, bei der Windows-Bare-Metal-Variante unter `%ProgramData%\Grillabend\app.sqlite`. Die Datei wird nicht über HTTP ausgeliefert und ist von Git ausgeschlossen.
- **Sicherung:** Vor einem Versionswechsel oder Umzug die `data/app.sqlite` (bzw. das Docker-Volume) bei gestopptem Server separat sichern. Beim Umstieg auf die Zwei-Feld-Ausstattung lohnt sich eine Kopie vor dem ersten Start.
- **Löschen ist endgültig.** Der Admin-Reset ist nicht rückgängig zu machen; ebenso entfernt das Löschen eines RSVP dauerhaft die eigene Antwort.

## Technische Mindestanforderung

- **Empfohlen wird der Betrieb per Docker/Compose** mit Portmapping und einem lokalen Nginx-Reverse-Proxy für TLS. Der Container heißt `grillabend` und spricht intern nur HTTP auf Port 80.
- **App nie direkt öffentlich freigeben:** Standardbindung ist `127.0.0.1`; es gibt keinen Origin-/CSRF-Check und keine `Secure`-Cookies. Nur der Proxy darf 80/443 anbieten.
- **LAN-Freigabe:** `install.sh` (Linux), `install.ps1` (Windows/Docker) und `install-native.ps1` (Windows bare metal) können die App auf `0.0.0.0:1621` freigeben. Das ist nur in einem vertrauenswürdigen Netz sinnvoll: Zugangsdaten und Cookies laufen unverschlüsselt. Windows legt eine Firewall-Regel für private/Domänen-Netze und das lokale Subnetz an; Linux bietet bei aktivem `ufw` optional eine Regel an. Für öffentliche Erreichbarkeit einen HTTPS-Proxy davorsetzen.
- **Selbstsigniertes HTTPS (Test):** `deploy/setup-https-selfsigned.sh` richtet Nginx mit Testzertifikat, HTTP→HTTPS-Umleitung und Proxy auf `127.0.0.1:1621` ein.
- **Für den lokalen Betrieb ohne Docker:** Node.js ab 22.13 – ältere Versionen laden die Anwendung nicht. Unter Windows richtet `install-native.ps1` Node.js 22, die App und den Autostart als geplante Aufgabe ein; Docker, WSL und Git sind dafür nicht nötig.
