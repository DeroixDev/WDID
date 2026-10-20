# WDID – Konzept (Stand 20.10.2026)

## Idee
Eine ruhige Tagesliste statt Stundenraster. Alles, was heute ansteht, in der richtigen Reihenfolge. Dinge ohne feste Zeit hängen an Orten.

## Eintragstypen
| Typ | Wofür | Besondere Felder |
|---|---|---|
| Erinnerung | Feste Uhrzeit (Anruf, Termin) | Tag, Uhrzeit, Wiederholung |
| Aufgabe | Heute erledigen, Uhrzeit optional | Tag, Uhrzeit, Wiederholung |
| Frist | Brief/Bescheid mit Deadline | Woher, Eingangsdatum, Frist, „Vorher anzeigen“ (1–30 Tage) |
| Ortsliste | Einkauf, Erledigungen vor Ort | Ort, Checkliste, Radius |

Jeder Eintrag: Titel, Details, Bereich (Privat/Arbeit).

## Was über die ursprüngliche Idee hinausgeht
- **Vorlauf bei Fristen:** Eine Frist taucht schon X Tage vorher unter „Fristen in Sicht“ auf, mit Countdown.
- **Liegengeblieben:** Überfälliges wandert automatisch nach oben, nichts geht verloren.
- **Orte als eigener Tab:** Standort einmal vor Ort speichern, danach erkennt WDID, wenn du da bist.
- **Bereich Privat/Arbeit** als Filter.
- **Wiederholungen** (täglich, wöchentlich, monatlich).
- **Suche über alles**, auch über Listenpunkte und Notizen.

## Nächste Ausbaustufen
1. Foto vom Brief anhängen, Frist und Absender automatisch auslesen (OCR).
2. Push-Benachrichtigungen zur Uhrzeit und X Tage vor Fristen.
3. Schnelleingabe in einer Zeile: „morgen 9 Zahnarzt anrufen“.
4. Wiederkehrende Einkaufsartikel als Vorschläge.
5. Sync über mehrere Geräte (Konto + Backend).

## Technik
- Jetzt: eine Datei, Vanilla JS, Daten lokal im Browser. Ideal zum Ausprobieren.
- Als nächstes: PWA (installierbar, offline, Push). GPS funktioniert damit nur, solange die App offen ist.
- Echtes Geofencing im Hintergrund („du kommst bei Kaufland an“) geht nur nativ. Empfehlung: Capacitor oder Expo/React Native, damit derselbe Code als iOS- und Android-App läuft.

## Datenmodell
```
Entry { id, type, title, notes, context, date, time, repeat,
        source, received, leadDays,         // Frist
        placeId, items[{text, done}],        // Ortsliste
        done, doneAt, createdAt }
Place { id, name, lat, lng, radius }
```
