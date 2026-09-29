# Offene Vorhaben

Diese Liste enthält offene Punkte ohne zugesagten Zeitplan oder behaupteten Fortschritt. Ein Eintrag hier allein beauftragt keine Codeänderung.

- **Produktiver Betrieb:** Nginx als HTTPS-Reverse-Proxy und eine nicht aktivierte Vorlage unter `deploy/nginx.conf.example` sind festgelegt; Dockerfile, GHCR-Build-Workflow und `compose.yaml` mit kommentierter `.env.example` liegen vor. Die dokumentierte Container-Startweise setzt einen Linux-Host mit Host-Netzwerk voraus. `Unklar:` tatsächlicher Zielhost, Domain, Pfade der vorhandenen Zertifikatsdateien, Proxy-Aktivierung, Backup/Restore und Anzahl der Serverinstanzen. `src/server.js` synchronisiert Kapazitätsänderungen nur innerhalb einer Serverinstanz; vor einem Mehrinstanzbetrieb ist eine gemeinsame atomare Reservierung erforderlich. Die Anmeldungslimitierung liegt ebenfalls nur im Prozessspeicher. Die gewollt offene Registrierung kann unabhängig von der Session-Bereinigung zu wachsenden Kontodaten führen; **zusätzliche Registrierungsgrenzen sind auf aktuellen Nutzerwunsch nicht Teil dieser Änderung**. Siehe [[architektur/ueberblick]] und [[entwicklung/lokal-starten]].
- **Feinheiten von Inhalt und Karte:** `Unklar:` endgültiger Veranstaltungsname, endgültige Regeln/Infotexte und der vom Admin tatsächlich auszuwählende Treffpunkt. Ohne gesetzten Pin bleibt die Adresssuche als Fallback bestehen ([[features/administration]]).
- **Spätere Auswertung:** Die Admin-Userübersicht kann nach Name, Teilnahme, Hüttenschlaf und Bettgarnitur gefiltert werden. Eigene Statuseffekte sind noch nicht definiert oder umgesetzt; `Unklar:` Welche zusätzlichen Statusarten dafür benötigt werden ([[features/administration]]).

Der gewünschte Neuaufbau mit Login, Teilnahme, Bettgarnitur, administrierbaren Infos und Kartenbereich ist in Code umgesetzt; der Abschluss steht in [[changelog]].

## Verwandte Seiten

[[projekt/ueberblick]] · [[design/erscheinungsbild]] · [[architektur/ueberblick]] · [[entscheidungen/neuaufbau]] · [[changelog]]
