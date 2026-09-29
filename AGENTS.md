# Anleitung für Coding-Agents

## Internes Wiki-Workflow

Einstieg: [Wiki-Index](docs/wiki/index.md). Praktische Pflegehinweise: [Wiki-Pflege](docs/wiki/wiki-pflege.md).

1. **Vor jeder Aufgabe:** Betroffene Dateien, Module, Features, APIs, Datenmodelle, Konfigurationen und technische Entscheidungen bestimmen. Im Index die passenden vorhandenen Wiki-Seiten finden und vor Änderungen lesen.
2. **Quelle der Wahrheit:** Wiki-Aussagen am Code und an überprüfbaren Projektdateien prüfen. Bei Widerspruch gilt der belegbare Projektstand; eine betroffene veraltete Wiki-Seite im selben Arbeitsdurchlauf korrigieren.
3. **Wissen laufend pflegen:** Neues, überprüftes Wissen bei der jeweiligen Aufgabe dokumentieren, nicht auf eine spätere Dokumentationsrunde verschieben. Erst eine passende Seite erweitern; neue Seiten nur bei tatsächlichem Bedarf erstellen.
4. **Verlinkung:** Neue Seiten in `docs/wiki/index.md` und auf passenden verwandten Seiten verlinken. Innerhalb des Wikis `[[seitenname]]` bzw. `[[ordner/seitenname]]` benutzen und prüfen, ob jeder Link auf die gleichnamige `.md`-Datei unter `docs/wiki/` zeigt.
5. **Änderungsumfang:** Nutzerrelevante Features und Bugfixes sowie Änderungen an Architektur, APIs, Daten, Einstellungen, Abhängigkeiten, Tests, Build oder Deployment auf den zuständigen Seiten nachführen. Geänderte technische Entscheidungen mit Begründung dokumentieren.
   Bei Änderungen an der Benutzeroberfläche zusätzlich [Gewünschtes Erscheinungsbild](docs/wiki/design/erscheinungsbild.md) lesen, mit den betroffenen Dateien unter `public/` (insbesondere `public/index.html`, `public/admin.html` und `public/css/`) abgleichen und die bestehende visuelle Richtung berücksichtigen.
6. **Planung und Verlauf:** Offene Vorhaben in [Planung](docs/wiki/planung.md) pflegen; abgeschlossene Änderungen im [Changelog](docs/wiki/changelog.md) festhalten. Keine unbelegten Fortschrittsmeldungen eintragen.
7. **Unsicherheit:** Ungeklärtes ausdrücklich mit `Unklar:`, `TODO:` oder `Annahme:` kennzeichnen; keine Details erfinden. Niemals echte Secrets, Passwörter, Tokens, private Schlüssel oder sonstige Zugangsdaten dokumentieren; nur deren Anforderungen ohne Werte beschreiben.
8. **Keine umgekehrte Automatik:** Ein Wiki-Eintrag allein beauftragt keine Änderung am produktiven Code.
9. **Zum Abschluss jeder Aufgabe:** Aktualität der betroffenen Wiki-Seiten prüfen; wenn keine Wiki-Änderung nötig ist, den Grund im Abschlussbericht kurz nennen. Nach einem Commit im Rahmen der Aufgabe zusätzlich prüfen, ob die vom Commit betroffenen Wiki-Seiten noch aktuell sind. Nicht allein dafür committen oder pushen und keine Hooks ungefragt einrichten.

Wikilinks der Form `[[...]]` gehören in Wiki-Seiten unter `docs/wiki/`; Links aus `AGENTS.md` verwenden normale Markdown-Dateipfade.

## Frontend- und UI-Skills

Die projektlokal installierten Skills liegen unter `.agents/skills/` und werden bei passenden Aufgaben mit dem `skill`-Tool geladen:

- **Design, Layout und visuelle UI-Arbeit:** Vor dem Gestalten neuer Ansichten oder dem Überarbeiten von Layout, Farben, Typografie, Komponenten oder Interaktionszuständen [`frontend-design`](.agents/skills/frontend-design/SKILL.md) laden und anwenden. Für dieses Projekt hat die bestehende Oberfläche mit [Gewünschtem Erscheinungsbild](docs/wiki/design/erscheinungsbild.md) und dem tatsächlichen CSS Vorrang vor allgemeinen Stilvorschlägen des Skills. Keine neue visuelle Identität ohne entsprechenden Auftrag erfinden.
- **UI-/UX-Review und Barrierefreiheit:** Bei Prüfungen von Frontend, Usability oder Accessibility sowie zur abschließenden Prüfung betroffener HTML-/CSS-/Browser-JS-Dateien nach UI-Änderungen [`web-design-guidelines`](.agents/skills/web-design-guidelines/SKILL.md) laden und anwenden. Die im Skill referenzierten aktuellen Web Interface Guidelines abrufen; Hinweise auf den konkreten Projektkontext und die betroffenen Dateien beziehen.

Bei reinen Backend-, Daten- oder Textänderungen ohne UI-Bezug diese Skills nicht allein wegen ihres Namens laden. Für Änderungen unter `public/` weiterhin zuerst die Wiki-Designreferenz und die vorhandene Implementierung lesen.
