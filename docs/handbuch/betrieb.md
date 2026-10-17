# Betrieb

## Umgebungsvariablen

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `621` | HTTP-Port des Servers. |
| `HOST` | `0.0.0.0` | Netzwerkbindung des Servers. `127.0.0.1` beschränkt den Zugriff auf den lokalen Rechner bzw. einen lokalen Proxy. |
| `DATA_DIR` | `data/` (im Projektordner) | Ordner der SQLite-Datenbank. |
| `APP_ORIGIN` | – | Einzige zulässige öffentliche Origin für Schreibanfragen (Schema, Host, optional Port) – **ohne** abschließenden Slash oder Pfad. Mit `https://` erzwingt der Produktionsmodus HTTPS und `Secure`-Cookies; mit `http://` ist direkter HTTP-Betrieb erlaubt (nur in einem vertrauenswürdigen, verschlüsselten Netz wie VPN oder hinter einem TLS-Proxy). Ohne die Variable wird die Origin aus Anfrageprotokoll und Host abgeleitet. |
| `NODE_ENV` | – | `production` setzt bei HTTPS-Origin das Session-Cookie auf `Secure` und verlangt bestätigtes HTTPS. |

Ein Admin-Konto wird nicht mehr über Umgebungsvariablen angelegt, sondern beim ersten Aufruf über die Ersteinrichtung (`/setup`, siehe [Installation](installation.md)).

Beispiel (PowerShell, lokale Entwicklung):

```powershell
$env:APP_ORIGIN = 'http://127.0.0.1:621'
npm.cmd start
```

Sitzungen laufen nach sieben Tagen ab; abgelaufene Einträge werden beim Start und beim Ausstellen neuer Sitzungen entfernt, pro Konto bleiben höchstens zehn aktive Sitzungen.

## Admin-Passwort zurücksetzen

Geht das Admin-Passwort verloren, setzt ein Kommando im Container ein neues, zufälliges Passwort und gibt es aus:

```sh
docker exec -it <container> npm run reset-admin-password
```

- Setzt das Passwort für das Admin-Konto und widerruft dessen bisherige Sitzungen.
- Bei mehreren Admin-Konten einen Namen ergänzen: `npm run reset-admin-password -- <benutzername>`.
- Funktioniert auch im laufenden Betrieb; die Ausgabe erscheint in der Konsole.
- Das neue Passwort nur an berechtigte Personen weitergeben.


## Showcase-Daten erzeugen

Für Vorführungen erzeugt ein Kommando im Container Demo-Konten mit echten deutschen Vor- und Nachnamen sowie realistischen Teilnahmeantworten:

```sh
docker exec -it <container> npm run seed-demo-users -- 30
```

- Ohne Anzahl wird die aktuelle Hütten-Kapazität aus den Veranstaltungseinstellungen verwendet; erlaubt sind 1–1000 Konten.
- Hütte, Luftmatratze und Bettzeug werden nur im Rahmen der konfigurierten Kapazitäten und der bereits vorhandenen Belegung vergeben.
- Alle erzeugten Konten teilen ein zufälliges Passwort, das am Ende der Konsolenausgabe steht; damit lässt sich jedes Demo-Konto zum Testen anmelden.
- Standardmäßig bricht der Lauf bei bereits vorhandenen Konten ab; `--force` hängt die Demo-Konten trotzdem an.
- `npm run seed-demo-users -- --cleanup` entfernt die zuvor erzeugten Demo-Konten samt Antworten wieder; echte Konten und Admins bleiben unberührt.
- Die Namen sind frei erfunden und gehören zu keinen realen Personen.


## Produktiv: HTTPS über Proxy oder HTTP im vertrauenswürdigen Netz

Node bindet standardmäßig an `0.0.0.0:PORT` (per `HOST` änderbar) und ist damit über alle Netzwerkschnittstellen erreichbar – auch über ein VPN wie NetBird. Für eine feste öffentliche Domain `APP_ORIGIN` vor dem Start setzen; der Wert wird nicht durch Nginx gesetzt.

- **`APP_ORIGIN=https://…` (empfohlen):** Ein lokaler Nginx-Reverse-Proxy übernimmt Zertifikat und TLS. Die App akzeptiert nur Anfragen, bei denen der als `loopback` vertrauenswürdige Proxy `X-Forwarded-Proto: https` setzt; direkte HTTP-Anfragen ohne diesen Nachweis erhalten `426`. Das Session-Cookie ist `Secure`.
- **`APP_ORIGIN=http://…`:** Direkter HTTP-Betrieb ohne TLS und ohne `Secure`-Cookie. Nur geeignet, wenn die Verbindung anderweitig verschlüsselt ist (z. B. VPN wie NetBird) oder ein vorgelagerter Proxy TLS terminiert. `HOST=127.0.0.1` zusammen mit einem lokalen Proxy entspricht der früheren, strengeren Konfiguration.

`deploy/nginx.conf.example` zeigt die nötige Konfiguration (Weiterleitung von Port 80 auf 443, Zertifikat, Upstream `127.0.0.1:1621`, Setzen von `Host` und Überschreiben von `X-Forwarded-Proto`, Anti-Framing-Header). Vor dem Einsatz Domain und **beide Dateipfade** ersetzen; keine Zertifikate oder privaten Schlüssel ins Repository übernehmen. Die Vorlage ist noch nicht produktiv aktiviert, weil Domain und Pfade noch offen sind.

## Docker und Compose

- Das `Dockerfile` erstellt ein Node-22-Produktionsimage (Debian Trixie slim, per Digest fixiert) mit `npm ci --omit=dev --ignore-scripts`. SQLite stammt aus Node selbst.
- `compose.yaml` startet das Image mit dem persistenten Volume `grillabend-data` und verlangt eine konfigurierte `APP_ORIGIN`. Die versionierte `.env.example` enthält alle Angaben kommentiert; `.env` ist die lokale, ignorierte Kopie.
- Die dokumentierte Startweise setzt einen **Linux-Host mit Host-Netzwerk** voraus: Node ist auf `0.0.0.0:1621` erreichbar; mit `HOST=127.0.0.1` bleibt es auf den lokalen Proxy beschränkt. Der Host-Port 1621 liegt oberhalb der privilegierten Ports.

```sh
cp .env.example .env   # APP_ORIGIN aktivieren
docker compose pull
docker compose up -d
docker compose logs -f grillabend
```

`docker compose down` lässt das Volume bestehen; `docker compose down -v` würde es löschen. Vor einem Start mit leerem Volume die vorhandene `data/app.sqlite` **bei gestopptem Server** in das Volume übernehmen und die Schreibrechte für UID 1000 sicherstellen.

## GitHub Actions

- `.github/workflows/docker.yml` führt bei Pull Requests/Pushes Tests, Image-Build und einen Container-Smoke-Test mit flüchtiger künstlicher Datenbank aus; Pushes nach `main` und Tags veröffentlichen nach GHCR.
- `.github/workflows/vm-preview.yml` baut das Image auf einer kurzlebigen Ubuntu-VM und stellt eine befristete HTTPS-Testadresse über einen Cloudflare-Tunnel bereit (nur künstliche Daten).

## Daten, Backup und Updates

- Die gesamte Anwendung nutzt eine Datei: `data/app.sqlite` (im Container das Volume `grillabend-data`).
- **Backup:** bei gestopptem Server die Datenbank bzw. das Volume separat sichern. Beim Umzug in ein Docker-Volume die Datei übertragen und Schreibrechte sicherstellen; sonst startet die App mit leerer Datenbank.
- **Updates:** Image/Code aktualisieren, dann starten. Beim Umstieg auf die getrennten Ausstattungsfelder überträgt der Start vorhandene „Bettgarnitur Ja“-Angaben automatisch auf Luftmatratze und Bettzeug; vorher eine Kopie der Datenbank anlegen.
