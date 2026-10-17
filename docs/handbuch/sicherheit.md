# Sicherheit

Dieses Dokument beschreibt die Schutzmaßnahmen der Anwendung, den Stand eines statischen Schwachstellen-Scans und die bewusst in Kauf genommenen Restrisiken. Es ersetzt keine eigene Bedrohungsanalyse für den konkreten Betrieb.

## Schutzmaßnahmen im Code

- **Sitzungen:** serverseitig geprüfte Session-Tokens im `HttpOnly`-Cookie (`SameSite=Lax`, in Produktion `Secure`), Gültigkeit sieben Tage, höchstens zehn aktive Sitzungen pro Konto. Das Cookie enthält nur einen Zufallstoken; in der Datenbank steht dessen Hash.
- **Passwörter:** scrypt mit explizitem, versioniertem Kostenprofil (`N=16384, r=8, p=5`). Neue Passwörter benötigen mindestens 12 Zeichen mit Groß-/Kleinbuchstaben, Ziffer und Sonderzeichen. Alte Hashes bleiben prüfbar und werden beim erfolgreichen Login aktualisiert.
- **CSRF/Origin:** Alle schreibenden Anfragen (`POST`, `PUT`, `PATCH`, `DELETE`) benötigen eine zur Seite passende `Origin`. Optional bindet `APP_ORIGIN` an eine feste öffentliche Adresse. Ein vorhandenes `Sec-Fetch-Site` darf nur `same-origin`/`none` sein.
- **Rate Limiting:** Auth-Writes sind begrenzt (Budget pro Client-IP und pro Konto/Name in zehn Minuten, `429` mit `Retry-After`).
- **Autorisierung:** Adminrouten (`/admin`, `GET`/`PUT /api/admin/party-info`, `/api/admin/users`, Reset) prüfen serverseitig die Adminrolle. Mitgliederrouten arbeiten ausschließlich mit der stabilen Benutzer-ID aus der Sitzung.
- **Eingaben und Datenbank:** Alle SQL-Zugriffe sind parametrisiert; die einzigen dynamischen Tabellennamen (`ALTER TABLE ${table}` in der Migration) stammen aus einer fest kodierten Liste. Längen und Wertebereich der Eingaben werden serverseitig geprüft.
- **Frontend:** Nutzerdaten werden über `textContent`/Canvas ausgegeben (kein `innerHTML` für fremde Werte); im CSV-Export werden Formel-Injektionen (`=`, `+`, `-`, `@`) entschärft; der Maps-Link wird auf erlaubte HTTPS-Hosts beschränkt.

## Bewusste Restrisiken

- **Offene Registrierung:** Jeder kann sich anlegen und die Veranstaltungs- und Antwortdaten einsehen. Das ist so gewollt; ein Schutz vor Selbstregistrierung ist nicht Teil der Anwendung.
- **Statische Routen ohne globales Rate-Limit:** Nur Auth-Routen sind limitiert; die Auslieferung von HTML/CSS/JS/Vendor-Bibliotheken ist es nicht (geringes DoS-Risiko, im privaten Umfeld akzeptabel).
- **Kein Mehrinstanz-Schutz:** Kapazitätsprüfungen und Auth-Limits gelten nur innerhalb eines Prozesses. Vor Mehrfachbetrieb wäre eine gemeinsame atomare Reservierung nötig.
- **Geheimnisse:** `.env`, Zertifikate und das über die Ersteinrichtung vergebene bzw. per `reset-admin-password` erzeugte Passwort dürfen nie ins Repository. Für Docker Compose die ignorierte `.env` verwenden.
- **Konfigurationsquelle:** `process.env.*` wird als vertrauenswürdige Betreiber-Eingabe behandelt, nicht als Angreifer-Eingabe.

## Schwachstellen-Scan (Stand 2026-10-17)

- **Werkzeug:** CodeQL 2.27.1, Sprache JavaScript, Modus „important only“ (126 Queries), Pack `codeql/javascript-queries` 2.4.6, Threat model remote.
- **Ergebnis:** 8 Findings, alle in `src/server.js`; **kein kritischer oder ausnutzbarer Befund im geänderten Code** (Datenbank-Migration, RSVP-, Admin-API und Frontend).
  - 2 × `user-controlled-bypass` (Level *error*): keine echten Schwachstellen – die „Quelle“ ist einmal die Betreiberkonfiguration (`process.env.*`) und einmal die reguläre Login-Eingabeprüfung.
  - 6 × `missing-rate-limiting` (Warnung): die Login-Route besitzt bereits ein eigenes Limit; die statischen Datei-Routen sind bewusst nicht limitiert.
- **Datenextensions:** nicht nötig – keine projekteigenen Wrapper um Sources/Sinks außer Express (modelliert); DB-Zugriff ist parametrisiert.
- **Kein Beweis der Abwesenheit:** Ein statischer Scan findet typische Muster, keine Logikfehler, und kann nicht modellierte Senken übersehen.

## Empfehlungen

- Abhängigkeiten regelmäßig prüfen, z. B. `npm audit --omit=dev --audit-level=high`.
- Vor einem Versionswechsel `data/app.sqlite` sichern.
- Bei Bedarf vertiefend: erneuter CodeQL-Lauf im Modus „run all“, `Semgrep` als zweite Meinung, oder eine Einzelverifikation der beiden `error`-Befunde.
