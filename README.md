# WDID – What Did I Do

Offline-Alltags-App fürs iPhone: Tagesliste statt Stundenraster, Fristen mit Vorlauf, ortsgebundene Listen (z. B. Einkauf bei Kaufland), Privat/Arbeit. Alle Daten bleiben auf dem iPhone, kein Konto, kein Server.

Aufbau: Die Oberfläche ist eine einzige Datei (`www/index.html`, Vanilla JS). Capacitor packt sie in eine native iOS-App. Gespeichert wird über `@capacitor/preferences`, Erinnerungen laufen als lokale Benachrichtigungen (`@capacitor/local-notifications`).

## Einmalige Einrichtung am Mac (ca. 20 Minuten)

1. **Xcode** aus dem App Store installieren, einmal öffnen und die Zusatzkomponenten installieren lassen (inkl. iOS-Plattform).
2. **Node.js** (LTS) von [nodejs.org](https://nodejs.org) installieren.
3. **Apple-ID in Xcode:** Xcode → Einstellungen → Accounts → „+“ → Apple-ID. Dann den Account auswählen → *Manage Certificates* → „+“ → *Apple Development*.
4. **Repo holen:** Terminal öffnen und eingeben:
   ```
   cd ~ && git clone https://github.com/DeroixDev/WDID.git
   ```
5. **iPhone vorbereiten:** per Kabel anschließen, entsperren, „Diesem Computer vertrauen“ tippen. Danach auf dem iPhone *Einstellungen → Datenschutz & Sicherheit → Entwicklermodus* einschalten (iPhone startet neu).
6. Im Finder den Ordner `WDID` öffnen und **„WDID aktualisieren.command“ doppelklicken**. Beim ersten Mal fragt macOS evtl. nach Erlaubnis (Rechtsklick → Öffnen) und der Schlüsselbund nach deinem Mac-Passwort („Immer erlauben“).
7. Beim ersten Start auf dem iPhone: *Einstellungen → Allgemein → VPN & Geräteverwaltung →* deine Apple-ID → *Vertrauen*.

## Jede Woche

WDID legt am Samstag vor Ablauf der Signatur automatisch den Eintrag „iPhone an den Mac anschließen“ an und erinnert dich um 10 Uhr. Dann:

iPhone anschließen → **„WDID aktualisieren.command“ doppelklicken**. Das Skript holt den neuesten Code, baut die App, erneuert die Signatur und spielt sie auf. Deine Daten bleiben erhalten.

## Wenn etwas hakt

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
