# Offene Vorhaben

Diese Liste enthält offene Punkte ohne zugesagten Zeitplan oder behaupteten Fortschritt. Ein Eintrag hier allein beauftragt keine Codeänderung.

- **Produktiver Betrieb:** Die App spricht intern nur HTTP auf Container-Port 80; Docker veröffentlicht per Portmapping (Standard `127.0.0.1:1621`), ein lokaler Nginx terminiert TLS auf 443. `deploy/nginx.conf.example` ist eine Vorlage für echte Zertifikate; das selbstsignierte Testscript ist vorhanden. Der separate GitHub-VM-Testlink ist nur während des Testlaufs erreichbar und ersetzt keinen eigenen Host. `Unklar:` tatsächlicher Zielhost, Domain, Pfade echter Zertifikatsdateien, Backup/Restore und Anzahl der Serverinstanzen. `src/server.js` synchronisiert Kapazitätsänderungen nur innerhalb einer Serverinstanz; vor einem Mehrinstanzbetrieb ist eine gemeinsame atomare Reservierung erforderlich. Die Anmeldungslimitierung liegt ebenfalls nur im Prozessspeicher. Die gewollt offene Registrierung kann unabhängig von der Session-Bereinigung zu wachsenden Kontodaten führen; **zusätzliche Registrierungsgrenzen sind auf aktuellen Nutzerwunsch nicht Teil dieser Änderung**. Siehe [[architektur/ueberblick]] und [[entwicklung/lokal-starten]].
- **Feinheiten von Inhalt und Karte:** `Unklar:` endgültiger Veranstaltungsname, endgültige Regeln/Infotexte und der vom Admin tatsächlich auszuwählende Treffpunkt. Ohne gesetzten Pin bleibt die Adresssuche als Fallback bestehen ([[features/administration]]).
- **Spätere Auswertung:** Die Admin-Userübersicht kann nach Name, Teilnahme, Hüttenschlaf, Luftmatratze und Bettzeug gefiltert werden. Eigene Statuseffekte sind noch nicht definiert oder umgesetzt; `Unklar:` Welche zusätzlichen Statusarten dafür benötigt werden ([[features/administration]]).
- **Versionswechsel und Bestandsklärung:** Die Sicherheitskorrekturen sind mit synthetischen Daten und lokalem Nginx geprüft. Die tatsächliche Bestandsdatenbank wurde dabei nicht gestartet oder migriert. Beim nächsten regulären Start werden namensgebundene RSVPs auf Benutzer-IDs umgestellt; gegebenenfalls verwaiste/mehrdeutige Antworten bleiben im Altarchiv zur Betreiberklärung. Daten vor dem Versionswechsel bei gestopptem Server sichern. Ein neuer Docker-/VM-/produktiver TLS-Lauf bleibt separat auszuführen; frühere CI-Erfolge gelten nicht als Prüfung der neuen Änderungen ([[daten/sqlite]], [[entwicklung/lokal-starten]], [[changelog]]).

Der gewünschte Neuaufbau mit Login, Teilnahme, getrenntem Bedarf an Luftmatratze und Bettzeug, administrierbaren Infos und Kartenbereich ist in Code umgesetzt; der Abschluss steht in [[changelog]].

## Verwandte Seiten

[[projekt/ueberblick]] · [[design/erscheinungsbild]] · [[architektur/ueberblick]] · [[entscheidungen/neuaufbau]] · [[changelog]]
