# Betrieb

## Konfiguration

Alle Werte sind fest verdrahtet; es gibt keine `.env` und keine konfigurierbaren Umgebungsvariablen:

| Wert | Festlegung |
| --- | --- |
| Host-Mapping | `127.0.0.1:1621` → Container `80` (in `compose.yaml`) |
| Image | `ghcr.io/anigx/grillabend-anmeldung:latest` (in `compose.yaml`) |
| `NODE_ENV` | `production` (im Image) |
| `PORT` | `80` (im Image) |
| `DATA_DIR` | `/app/data` (im Image) |
| `HOST` | `0.0.0.0` (Server-Default) |

Änderungen am Mapping oder Image direkt in `compose.yaml` vornehmen. Ein Admin-Konto wird nicht über Umgebungsvariablen angelegt, sondern beim ersten Aufruf über die Ersteinrichtung (`/setup`, siehe [Installation](installation.md)).

Der Installer ändert `compose.yaml` nicht. Für die LAN-Freigabe legt er eine lokale `compose.override.yaml` mit `ports: !override` und `0.0.0.0:1621:80` an; sie ist von Git ausgeschlossen und wird von Docker Compose automatisch geladen. Ohne diese Datei bleibt es bei `127.0.0.1:1621`. Compose muss dafür mindestens 2.24.4 unterstützen.

Sitzungen laufen nach sieben Tagen ab; abgelaufene Einträge werden beim Start und beim Ausstellen neuer Sitzungen entfernt, pro Konto bleiben höchstens zehn aktive Sitzungen.

## Automatischer Installer

`install.sh` (Debian/Ubuntu) und `install.ps1` (Windows/Docker Desktop) sind interaktive Fullscreen-Installer. Sie prüfen bzw. installieren Docker, klonen das Projekt, ziehen das GHCR-Image, richten das Volume ein, bieten den Import einer vorhandenen `data/app.sqlite` an und unterstützen Update, Backup, Deinstallation und Autostart.

| Betriebssystem | Status/Logs | Entfernen |
| --- | --- | --- |
| Linux | `/var/lib/grillabend-installer/state`, `/var/log/grillabend-installer/` | `bash install.sh --uninstall` bzw. `--purge` |
| Windows | `%ProgramData%\Grillabend-Installer\state.json`, `...\Logs\` | `.\install.ps1 -Uninstall` bzw. `-Purge` |

- **Linux:** Standardziel `/opt/grillabend`, Standardbindung nur lokal (`127.0.0.1:1621`). Docker wird bei Bedarf aus dem offiziellen Repository installiert. Nginx/HTTPS werden nicht eingerichtet; der spätere Proxy zeigt auf `127.0.0.1:1621`.
- **Windows:** Standardziel `%USERPROFILE%\Grillabend-Anmeldung`, Standardbindung LAN (`0.0.0.0:1621`) nach Bestätigung; Firewall-Regel nur für private/Domänen-Netze und das lokale Subnetz. Docker Desktop wird per `winget` installiert; WSL2 dient nur als Backend, ohne Ubuntu-Distribution.
- **Sicherheit:** Die App spricht nur HTTP und hat keinen Origin-/CSRF-Check. Die LAN-Freigabe ist nur in vertrauenswürdigen Netzen sinnvoll; für öffentliche Erreichbarkeit muss ein HTTPS-Proxy davorsitzen.
- **Updates:** Vor dem Update wird die SQLite-Datenbank automatisch gesichert (die letzten fünf Backups bleiben in `backups/`). Bei einem Fehler versucht der Installer, die App mit dem vorhandenen Stand neu zu starten.
- **Deinstallation:** `--uninstall`/`-Uninstall` entfernt Container und Image, behält Projektordner, Volume und Backups. `--purge`/`-Purge` entfernt zusätzlich Volume, Projektordner und Backups. Docker Desktop, WSL2 und Git werden nicht entfernt.

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


## HTTP intern, TLS am Reverse Proxy

Die App spricht ausschließlich HTTP. Im Container lauscht Node auf `0.0.0.0:80`; Docker veröffentlicht `127.0.0.1:1621`. Ein lokaler Reverse Proxy terminiert TLS auf 443 und leitet an `127.0.0.1:1621` weiter.

- Es gibt **keine** HTTPS-Erzwingung (`426`), **keine** `Secure`-Cookies und **keinen** Origin-/CSRF-Check mehr. `SameSite=Lax` bleibt als einzige CSRF-Bremse.
- Der Proxy setzt `X-Forwarded-For`; die App vertraut Loopback- und privaten Docker-Adressen, damit die Login-Limits pro echter Client-IP gelten.
- `deploy/nginx.conf.example` zeigt die Konfiguration (Weiterleitung 80 → 443, Zertifikat, Upstream `127.0.0.1:1621`, Anti-Framing-Header). Domain und **beide Dateipfade** ersetzen; keine Zertifikate oder privaten Schlüssel ins Repository übernehmen.
- Die App nie direkt öffentlich erreichbar machen: Standardbindung `127.0.0.1` beibehalten und nur den Proxy auf 80/443 veröffentlichen.

### Selbstsigniertes HTTPS (Test)

Für Tests ohne echtes Zertifikat richtet ein Skript Nginx mit einem selbstsignierten Zertifikat ein:

```sh
sudo bash deploy/setup-https-selfsigned.sh <host-oder-ip> [weitere-san...]
```

- Installiert bei Bedarf Nginx und OpenSSL, erzeugt das Zertifikat unter `/etc/nginx/ssl/grillabend/` und proxyt Port 443 auf `127.0.0.1:1621`.
- Leitet `http://…` (Port 80) und `https://…:8443` auf `https://…` (Port 443) um und startet Compose neu.
- Der Browser zeigt eine Zertifikatswarnung; für ein echtes Zertifikat später die Nginx-Konfiguration aus `deploy/nginx.conf.example` verwenden.

## Docker und Compose

- Das `Dockerfile` erstellt ein Node-22-Produktionsimage (Debian Trixie slim, per Digest fixiert) mit `npm ci --omit=dev --ignore-scripts`. SQLite stammt aus Node selbst.
- `compose.yaml` startet das Image im Container `grillabend` mit dem persistenten Volume `grillabend-data` und veröffentlicht Container-Port `80` fest auf `127.0.0.1:1621`. Alle Werte stehen direkt in `compose.yaml`; eine `.env` wird nicht verwendet.
- Das `Dockerfile` setzt `PORT=80` und `EXPOSE 80`. Docker erlaubt dem unprivilegierten Benutzer `node` das Binden von 80 im Container; nach außen ist nur der gemappte Port sichtbar.
- **Windows/Docker Desktop:** dieselbe `compose.yaml` verwenden; Portmapping funktioniert dort ohne Host-Netzwerk.

```sh
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
