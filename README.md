# WDID – What Did I Do

Offline-Alltags-App fürs iPhone: Tagesliste statt Stundenraster, Fristen mit Vorlauf, ortsgebundene Listen (z. B. Einkauf bei Kaufland), Privat/Arbeit. Alle Daten bleiben auf dem iPhone, kein Konto, kein Server.

Aufbau: Die Oberfläche ist eine einzige Datei (`www/index.html`, Vanilla JS). Capacitor packt sie in eine native iOS-App. Gespeichert wird über `@capacitor/preferences`, Erinnerungen laufen als lokale Benachrichtigungen (`@capacitor/local-notifications`).

## Einmalige Einrichtung am Mac (ca. 20 Minuten)

1. **Xcode** aus dem App Store installieren, einmal öffnen und die Zusatzkomponenten installieren lassen (inkl. iOS-Plattform).
2. **Node.js** (LTS) von [nodejs.org](https://nodejs.org) installieren.
3. **Apple-ID in Xcode:** Xcode → Einstellungen → Accounts → „+“ → Apple-ID. Dann den Account auswählen → *Manage Certificates* → „+“ → *Apple Development*.
4. **Repo holen:** Terminal öffnen und eingeben:
   ```
   cd ~/Documents && git clone https://github.com/DeroixDev/WDID.git WDID.nosync
   ```
5. **iPhone vorbereiten:** per Kabel anschließen, entsperren, „Diesem Computer vertrauen“ tippen. Danach auf dem iPhone *Einstellungen → Datenschutz & Sicherheit → Entwicklermodus* einschalten (iPhone startet neu).
   Die Endung `.nosync` sorgt dafür, dass iCloud den Ordner nicht synchronisiert. Sonst legt iCloud Kopien wie `Datei 2.swift` an und der Build bricht ab.
6. Im Finder den Ordner `Dokumente/WDID.nosync` öffnen und **„WDID aktualisieren.command“ doppelklicken**. Beim ersten Mal fragt macOS evtl. nach Erlaubnis (Rechtsklick → Öffnen) und der Schlüsselbund nach deinem Mac-Passwort („Immer erlauben“).
7. Beim ersten Start auf dem iPhone: *Einstellungen → Allgemein → VPN & Geräteverwaltung →* deine Apple-ID → *Vertrauen*.

## Was WDID kann

- **Heute:** alles für den Tag in der richtigen Reihenfolge, Liegengebliebenes oben, Fristen mit Vorlauf, Nachhaken, Ortslisten. „Tag kopieren“ kopiert alles als Text.
- **Schnelleingabe** (oben im Plus-Fenster): „Fr 14 Uhr Friseur“, „bis 15.11. Antrag abgeben“, „bei Kaufland: Milch, Brot“, „jeden Montag Müll rausbringen #arbeit“.
- **Ablage:** alle Dokumente an einem Ort, abgelegt über die Dateien-App. PDFs, Word, Excel, PowerPoint, Pages, Numbers, Keynote, Text, CSV und Bilder (auch HEIC) öffnen in der iOS-Vorschau direkt in der App. Durchsuchen, filtern und mit Einträgen verknüpfen. Fotos aus Einträgen tauchen hier mit auf.
- **Einträge:** erst die simple Ansicht mit Titel und Termin, alles Weitere (Nummer, Person, Checkliste, Ort und Zeiten, Details, Dokumente, Fotos) zum Ausklappen.
- **Papiere:** Brief scannen (Texterkennung auf dem iPhone, erkennt Absender, Aktenzeichen, Betrag und Frist), Fristrechner mit Zugangsfiktion, Wochenenden und Feiertagen deines Bundeslands, Vorgänge mit Zeitleiste und Fotos, Kündigungswecker für Verträge, Dokumente mit Ablaufdatum, „Wartet auf“ mit Nachhaken, Nachweis („erledigt per Einschreiben“).
- **Orte:** Listen für einen Laden, für „jeden Supermarkt“ oder für Personen („Wenn du Mama siehst“). Einkaufslisten sind nach Abteilungen sortiert, WDID lernt deinen Weg durch den Laden und schlägt Dinge vor, die du regelmäßig kaufst. Mit Standort „Immer“ meldet sich WDID bei Ankunft, auch wenn die App zu ist.
- **Verlauf:** alles Erledigte mit Uhrzeit und Ort, durchsuchbar, Wochenrückblick, Tagesrückblick mit „auf morgen schieben“.
- **Mitteilungen:** Morgen-Briefing und Tagesabschluss (Uhrzeit in den Einstellungen), Erinnerungen, Fristen, Kündigungstermine.
- **Bereiche:** oben umschalten zwischen Privat, Arbeit und Beides. Neue Einträge landen automatisch im aktuellen Bereich, in der Arbeitszeit wechselt WDID von selbst auf Arbeit (abschaltbar). Im Arbeitsbereich wird die Akzentfarbe blau.
- **Arbeit:** Vorlagen mit Checklisten (z. B. „RMA anlegen“), Checklisten in jedem Eintrag, Nummern-Feld mit Etikett-Scan (Barcode, QR, Text), Personen mit eigener Karte, Anrufen, E-Mail und „Nachfrage kopieren“, Projekte mit Status und nächstem Schritt, Wochenansicht und flexible Aufgaben („diese Woche“), Zeiterfassung pro Eintrag: Ort über die Karten-Suche, Uhr startet bei Ankunft und stoppt beim Gehen (pro Eintrag einstellbar) oder per Hand, Zeiten nachtragen, „Zeiten zum Abrechnen“ pro Kunde und Monat mit Rundung, Wochenbericht und Standup als Text, Projekt-Bericht als PDF, Arbeits-Briefing zu Arbeitsbeginn und Feierabend-Übergabe.
- **Schnelleingabe bei der Arbeit:** `Rückruf Austausch #RMA-3301 @Jessen diese woche` setzt Nummer, Person und „flexibel bis Freitag“.
- **Kurzbefehle:** `wdid://bereich/arbeit`, `wdid://bereich/privat`, `wdid://uebergabe`, zum Beispiel per Fokus-Automation.
- **Fotos und Videos:** an jedem Eintrag. Betrachter mit Wischen, Zwei-Finger-Zoom und Doppeltipp, Videos mit normalem Player (Vollbild, Spulen). Videos sind nicht im Backup, damit es klein bleibt.
- **Aussehen:** acht Themes (System, Birke, Sand, Fjord, Heide, Nacht, Polarnacht, Schwarz für OLED), sanfte Übergänge, Funken und Vibration beim Abhaken, Konfetti wenn der Tag oder eine Liste geschafft ist. Animationen lassen sich abschalten und richten sich nach „Bewegung reduzieren“ von iOS.
- **Einstellungen** (Zahnrad unter „Alles“): Theme, Animationen, Bundesland, Briefing-Zeiten, Arbeit nach Feierabend ausblenden, Face-ID-Sperre, verschlüsseltes Backup in die Dateien-App und zurück.

### Action-Button

Kurzbefehle-App → neuer Kurzbefehl → Aktion „URL öffnen“ → `wdid://neu` (neuer Eintrag mit Schnelleingabe) oder `wdid://scan` (Brief scannen). Dann *Einstellungen → Action-Button → Kurzbefehl* und den neuen Kurzbefehl wählen.

### Berechtigungen

Beim ersten Mal fragt iOS nach Mitteilungen, Standort (für Ankunft: „Immer erlauben“), Kamera (Brief scannen) und Face ID. Alles bleibt auf dem iPhone.

## Jede Woche

WDID legt am Samstag vor Ablauf der Signatur automatisch den Eintrag „iPhone an den Mac anschließen“ an und erinnert dich um 10 Uhr. Dann:

iPhone anschließen → **„WDID aktualisieren.command“ doppelklicken**. Das Skript holt den neuesten Code, baut die App, erneuert die Signatur und spielt sie auf. Deine Daten bleiben erhalten.

## Wenn etwas hakt

- *„Invalid redeclaration“ oder Dateien mit „ 2“ im Namen*: Der Ordner liegt in iCloud. Frisch als `~/Documents/WDID.nosync` klonen, `npm ci`, in Xcode *Clean Build Folder* und *Reset Package Caches*.
- *Xcode zeigt „Missing package product 'CapApp-SPM'“*: Xcode schließen, im Ordner `npm install && npx cap sync ios` ausführen, dann *File → Packages → Resolve Package Versions*. Das Skript erledigt das automatisch.
- *„Kein iPhone gefunden“*: Kabel prüfen, iPhone entsperren, Vertrauen bestätigen.
- *Bundle-ID schon vergeben*: eine andere in die Datei `.wdid-bundle` schreiben, z. B. `de.deinname.wdid`.
- *Falsches Team*: Datei `.wdid-team` löschen, dann erkennt das Skript das Team neu.
- Mit kostenloser Apple-ID sind höchstens 3 selbst installierte Apps gleichzeitig möglich.

## Entwicklung

```
npm install
npm run sync        # build-info schreiben + cap sync ios
open ios/App/App.xcodeproj
```

Im Browser lässt sich `www/index.html` direkt öffnen (mit Beispieldaten, ohne Benachrichtigungen).
