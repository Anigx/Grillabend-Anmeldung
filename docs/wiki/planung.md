# Offene Vorhaben

Diese Liste enthält offene Punkte ohne zugesagten Zeitplan oder behaupteten Fortschritt. Ein Eintrag hier allein beauftragt keine Codeänderung.

- **Produktiver Betrieb:** Nginx als HTTPS-Reverse-Proxy und eine nicht aktivierte Vorlage unter `deploy/nginx.conf.example` sind festgelegt. `Unklar:` Zielplattform, Domain, Pfade der vorhandenen Zertifikatsdateien, tatsächliche Proxy-Aktivierung, Backup/Restore und Anzahl der Serverinstanzen. `src/server.js` synchronisiert Kapazitätsänderungen nur innerhalb einer Serverinstanz; vor einem Mehrinstanzbetrieb ist eine gemeinsame atomare Reservierung erforderlich. Die Anmeldungslimitierung liegt ebenfalls nur im Prozessspeicher. Siehe [[architektur/ueberblick]] und [[entwicklung/lokal-starten]].
- **Feinheiten von Inhalt und Karte:** `Unklar:` endgültiger Veranstaltungsname, endgültige Regeln/Infotexte und der vom Admin tatsächlich auszuwählende Treffpunkt. Ohne gesetzten Pin bleibt die Adresssuche als Fallback bestehen ([[features/administration]]).

Der gewünschte Neuaufbau mit Login, Teilnahme, Bettgarnitur, administrierbaren Infos und Kartenbereich ist in Code umgesetzt; der Abschluss steht in [[changelog]].

## Verwandte Seiten

[[projekt/ueberblick]] · [[design/erscheinungsbild]] · [[architektur/ueberblick]] · [[entscheidungen/neuaufbau]] · [[changelog]]
