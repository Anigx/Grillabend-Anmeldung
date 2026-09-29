# Wiki-Pflege

1. Vor einer Aufgabe über [[index]] die betroffenen Seiten auswählen und lesen. Aussagen mit den angegebenen Codepfaden und der aktuellen Projektkonfiguration abgleichen; bei Widerspruch den belegten Stand dokumentieren.
2. Nach einer Änderung neues, verifiziertes Wissen auf der zuständigen Seite ergänzen. Bestehende Seiten bevorzugen und nicht denselben Sachverhalt mehrfach erklären. Offene Punkte ausdrücklich als `Unklar:`, `TODO:` oder `Annahme:` kennzeichnen.
3. Offene Vorhaben in [[planung]], tatsächlich abgeschlossene Änderungen in [[changelog]] eintragen. Bei technischen Entscheidungen die Begründung dokumentieren, sobald eine solche Entscheidung tatsächlich getroffen wurde. Ein Wiki-Plan ist für sich kein Auftrag zur Codeänderung.
4. Neue Seiten im [[index]] und auf verwandten Seiten verlinken. Ein Link wie [[architektur/ueberblick]] muss auf `docs/wiki/architektur/ueberblick.md` zeigen; Dateinamen nur mit Kleinbuchstaben und Bindestrichen. Links nach Änderungen prüfen.
5. Keine tatsächlichen Zugangsdaten, Passwörter, Tokens oder privaten Schlüssel ins Wiki übernehmen. Vor Abschluss die betroffenen Seiten gegen den Code prüfen; nach einem Commit dessen betroffene Seiten nochmals auf Aktualität kontrollieren.

Die verbindlichen Arbeitsregeln stehen in `AGENTS.md` im Projektverzeichnis. Die `.sqlite`-Dateien können Daten enthalten und sind keine Vorlage für Wiki-Beispiele mit echten Werten.

## Verwandte Seiten

[[projekt/ueberblick]] · [[entwicklung/lokal-starten]]
