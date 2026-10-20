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
- **Papiere:** Brief scannen (Texterkennung auf dem iPhone, erkennt Absender, Aktenzeichen, Betrag und Frist), Fristrechner mit Zugangsfiktion, Wochenenden und Feiertagen deines Bundeslands, Vorgänge mit Zeitleiste und Fotos, Kündigungswecker für Verträge, Dokumente mit Ablaufdatum, „Wartet auf“ mit Nachhaken, Nachweis („erledigt per Einschreiben“).
- **Orte:** Listen für einen Laden, für „jeden Supermarkt“ oder für Personen („Wenn du Mama siehst“). Einkaufslisten sind nach Abteilungen sortiert, WDID lernt deinen Weg durch den Laden und schlägt Dinge vor, die du regelmäßig kaufst. Mit Standort „Immer“ meldet sich WDID bei Ankunft, auch wenn die App zu ist.
- **Verlauf:** alles Erledigte mit Uhrzeit und Ort, durchsuchbar, Wochenrückblick, Tagesrückblick mit „auf morgen schieben“.
- **Mitteilungen:** Morgen-Briefing und Tagesabschluss (Uhrzeit in den Einstellungen), Erinnerungen, Fristen, Kündigungstermine.
- **Einstellungen** (Zahnrad unter „Alles“): Bundesland, Briefing-Zeiten, Arbeit nach Feierabend ausblenden, Face-ID-Sperre, verschlüsseltes Backup in die Dateien-App und zurück.

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
