# Hausbau

Ein persönlicher Hausbau-Planer als installierbare Web-App (PWA) – gebaut wie
das Schlaftagebuch. Alle Daten bleiben auf deinem Handy. Kein Konto, kein
Server, keine Werbung, offline nutzbar.

**Version 1** kann:

- **To-dos in deiner Reihenfolge** – oben steht immer, was als Nächstes dran ist
  (hervorgehoben als „Als Nächstes“). Umsortieren am Griff **⠿** links: gedrückt
  halten und nach oben oder unten ziehen. Am Bildschirmrand scrollt die Liste mit.
- **Bereiche** frei festlegen (Mehr → Bereiche): umbenennen, hinzufügen,
  löschen, umsortieren, Farbe wählen. Vorgabe: Planung, Finanzierung, Behörden,
  Bau, Ausbau, Sonstiges. Oben per Chip filtern – auch in der gefilterten
  Ansicht lässt sich sortieren.
- **Frist** („Erledigen bis“) mit Hinweis „in 3 Tagen“ bzw. rot bei Überfälligem.
- **Erinnerungen** mit Datum und Uhrzeit, Schnellwahl „Heute 19 Uhr“,
  „Morgen 8 Uhr“, „In 1 Woche“. Fällige Erinnerungen erscheinen oben in der App
  (Erledigt / Morgen wieder / OK) und als Handy-Benachrichtigung.
- **In Kalender eintragen** (Google Kalender oder Kalenderdatei für den
  Samsung-Kalender) – für Termine, die auf keinen Fall untergehen dürfen.
- **Titel und Beschreibung**: In der Liste steht nur der Titel als schmaler
  Block, Antippen klappt die Beschreibung auf.
- **Personen**: alle, mit denen du beim Hausbau zu tun hast – Funktion und Name
  (z. B. „Architekt · Alois Huber“), aufgeklappt eine freie Beschreibung für
  Telefon, E-Mail, Adresse und Notizen. Telefonnummern, E-Mail- und
  Internetadressen sind antippbar, dazu Knöpfe „Anrufen“ und „E-Mail“.
- **Abhaken** mit „Rückgängig“; erledigte To-dos landen unten unter „Erledigt“.
- **Vorlage** mit rund 18 typischen Hausbau-Schritten zum Starten.
- **Datensicherung** als Datei (Mehr → Sicherung speichern / laden).
- Dunkles und helles Design.

---

## Teil 1 – App aufs Handy bringen

Wie beim Schlaftagebuch: Die Dateien liegen in diesem GitHub-Repository und
werden über **GitHub Pages** veröffentlicht. Danach läuft die App offline.

### Schritt 1 – Änderungen nach `main` übernehmen

Die App wurde auf einem eigenen Branch entwickelt. Den Pull Request auf GitHub
mit **Merge pull request** übernehmen, damit die Dateien im Branch `main` liegen.

### Schritt 2 – Veröffentlichen (einmalig)

1. Im Repository **Hausbau** oben auf **Settings**.
2. Links auf **Pages**.
3. Bei „Source“: **Deploy from a branch**.
4. Bei „Branch“: **main**, Ordner **/ (root)**, **Save**.
5. Ein bis zwei Minuten warten. Die App liegt dann unter

   ```
   https://freshglitch4j.github.io/Hausbau/
   ```

### Schritt 3 – Auf den Startbildschirm des Galaxy A55

1. Die Adresse in **Chrome** öffnen.
2. Oben in der App erscheint die Leiste **Als App installieren** →
   **Installieren** antippen. (Alternativ unter **Mehr → App installieren**.)
   Der Knopf nutzt Chromes regulären Installationsweg und umgeht damit den
   Menüdialog, der auf manchen Geräten fälschlich „bereits installiert“ meldet.
   Die Leiste verschwindet, sobald die App installiert ist.
3. Beim ersten Setzen einer Erinnerung fragt die App, ob sie Benachrichtigungen
   schicken darf → **Zulassen**.

**Updates:** Neue Versionen holt sich die App beim Öffnen automatisch, sobald
das Handy online ist. Spätestens beim zweiten Öffnen ist die neue Version aktiv.

---

## Teil 2 – Bedienung

| Was | Wie |
| --- | --- |
| Neues To-do | Orangener **+**-Knopf unten rechts: **Titel**, direkt darunter die **Beschreibung**. „Einreihen: Ganz oben“ setzt es direkt an die Spitze. |
| Beschreibung lesen | In der Liste steht nur der Titel als schmaler Block. Antippen klappt Beschreibung, Bereich, Frist und Erinnerung auf, nochmal antippen klappt zu. |
| Reihenfolge ändern | Griff **⠿** (mit Platznummer) gedrückt halten und ziehen |
| Erledigt | Kreis antippen – kurz danach „Rückgängig“ möglich |
| Bearbeiten | Block aufklappen → **Bearbeiten** |
| Löschen | Im To-do ganz unten |
| Nach Bereich filtern | Chips oberhalb der Liste |
| Bereiche ändern | **Mehr → Bereiche**: Namen antippen, Farbpunkt antippen, × zum Löschen (die To-dos bleiben, stehen dann „ohne Bereich“) |
| Person anlegen | Reiter **Personen** → **+**: Funktion, Name, Beschreibung |
| Person ansehen | Antippen klappt die Beschreibung auf; Nummer oder Adresse antippen ruft an bzw. öffnet die E-Mail |

### Wie zuverlässig sind Erinnerungen?

Android erlaubt Web-Apps keine echten Wecker. Die App meldet sich, solange sie
geöffnet ist oder noch im Hintergrund läuft, und zeigt alles Fällige
spätestens beim nächsten Öffnen oben an. Wenn eine Erinnerung **sicher** zur
richtigen Minute klingeln muss: im To-do **In Google Kalender** bzw.
**Als Kalenderdatei** antippen und den Termin im Kalender speichern.

### Daten sichern

Alles liegt nur im Speicher von Chrome auf dem Handy. Wenn du Chrome-Daten
löschst oder das Handy wechselst, sind sie weg – außer du hast vorher unter
**Mehr → Sicherung speichern** eine Datei angelegt (landet in „Downloads“).
Mit **Sicherung laden** holst du sie zurück.

---

## Ideen für die nächsten Versionen

- Fotodokumentation (Fotos je Bauabschnitt/To-do, mit Datum)
- Unteraufgaben bzw. Checklisten je To-do
- Kosten und Budget-Übersicht
- Zeitleiste/Bauphasen-Ansicht

---

## Für Entwicklung

Reines HTML/CSS/JavaScript, kein Build-Schritt.

```
index.html  styles.css  core.js (Logik ohne DOM)  app.js (Oberfläche)
sw.js (Offline)  manifest.webmanifest  icon-*.png
```

- Tests der Logik: `node tools/test-core.js`
- Oberflächen-Tests im Chromium: `NODE_PATH=$(npm root -g) node tools/test-ui.js`
  (braucht Playwright)
- Icons neu erzeugen: `python3 tools/make-icons.py` (braucht Pillow)
- Bei jeder Änderung in `sw.js` die `VERSION` erhöhen, damit das Handy die
  neuen Dateien lädt.
