# Bedienung

## Für Gäste (Teilnehmerseite `/`)

1. **Konto anlegen oder anmelden.** Registrierung ist offen. Neue Passwörter brauchen mindestens 12 Zeichen mit Groß- und Kleinbuchstaben, einer Zahl und einem Sonderzeichen.
2. **Teilnahme wählen:** `Ja`, `Nein` oder `Vielleicht`. Schlafplatz und Ausstattung sind nur bei `Ja` buchbar; bei `Vielleicht` wird nichts reserviert.
3. **Hüttenschlaf:** `Ja` oder `Nein`.
4. **Ausstattung (nur bei Hüttenschlaf „Ja“):** getrennt wählbar
   - **Luftmatratze benötigt?** `Ja` / `Nein`
   - **Bettzeug benötigt?** `Ja` / `Nein`
   - Jede Kombination ist möglich (keins, nur eins oder beides). Ist eine Kapazität erreicht, zeigt die Option „Schon voll!“.
5. **Antwort speichern.** Die Antwort lässt sich jederzeit ändern oder mit „Eintrag löschen“ entfernen.

Unter „Wer ist schon dabei?“ stehen Zusagen, „Vielleicht“, belegte Schlafplätze sowie die Zähler für **Luftmatratze** und **Bettzeug** (jeweils belegt/Gesamt). Eigene Einträge sind mit „(Du)“ markiert.

### Einstellungen (Zahnrad links neben dem Namen)

- **Benutzernamen ändern** und **Passwort ändern** (jeweils mit aktuellem Passwort). Nach einem Passwortwechsel werden andere Sitzungen beendet.
- Auch Admin-Konten sind normale Konten und können Name und Passwort hier ändern.

## Für Admins (`/admin`)

Der Adminbereich ist über den Link auf der Teilnehmerseite oder direkt unter `/admin` erreichbar und erfordert eine serverseitig geprüfte Admin-Sitzung.

### Erstes Admin-Konto

Gibt es noch keinen Admin, leitet die Startseite automatisch auf `/setup` um. Dort wird einmalig das erste Admin-Konto angelegt (siehe [Installation](installation.md)). Sobald ein Admin existiert, ist `/setup` gesperrt.

### Tab „Veranstaltung“

- Datum/Uhrzeit, Ort, Adresse, Informationen und Regeln bearbeiten.
- **Treffpunkt auf der Karte:** Karte verschieben/zoomen und den genauen Ort anklicken; „Suchen“ fragt zuvor optional Nominatim (OpenStreetMap). Der Google-Maps-Link wird aus dem Pin erzeugt; „Pin entfernen“ löscht ihn. Änderungen werden erst mit „Änderungen speichern“ übernommen.
- **Kapazitäten:** maximale Schlafplätze, maximale **Luftmatratzen** und maximale **Bettzeug**-Plätze. Eine Kapazität kann nicht unter die bereits belegten Plätze gesetzt werden.
- Die Seitenleiste zeigt die aktuelle Belegung (Hüttenschlafplätze, Luftmatratzen, Bettzeug) und eine Vorschau.

### Tab „User-Übersicht“

- Zeigt alle Konten mit Teilnahme, Hüttenschlaf, **Luftmatratze**, **Bettzeug** und dem Zeitpunkt der letzten Antwort. Konten ohne Antwort erscheinen als „Keine Antwort“.
- Kombinierbare Filter für Name, Teilnahme, Hüttenschlaf, Luftmatratze und Bettzeug; „Keine Antwort“ ist auswählbar. Ein Button setzt alle Filter zurück.
- **Export** der gefilterten Auswahl als Excel (`.xlsx`), CSV (`.csv`), PDF (`.pdf`) oder Bild (`.png`; bei sehr vielen Zeilen mehrere PNGs in einer ZIP-Datei). Die Dateien werden lokal im Browser aus den Admin-Daten erzeugt.
- Admins sehen hier die tatsächlichen Kontonamen und Antwortzeitpunkte, auch bei in der Mitgliederansicht anonymen Einträgen.

### Tab „Neuer Grillabend“

- „Alle Antworten zurücksetzen“ löscht nach erneuter Eingabe des Admin-Passworts **alle bisherigen Teilnahmeantworten** (einschließlich Hüttenschlaf, Luftmatratze, Bettzeug und Antwortzeitpunkt). Konten, Passwörter, Sitzungen und Veranstaltungsdaten bleiben erhalten.
- Der Vorgang ist **nicht rückgängig zu machen**. Datum, Ort, Regeln und Kapazitäten werden anschließend im Tab „Veranstaltung“ gepflegt.
