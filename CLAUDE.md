# Hausbau-App – Hinweise für die Weiterentwicklung

Persönliche PWA für den Hausbau (Samsung Galaxy A55, Chrome). Reines
HTML/CSS/JS ohne Build, Daten nur in `localStorage`. Gleiche Bauweise wie die
anderen Apps des Nutzers (Schlaftagebuch, Fitness).

## Gestaltung: schlicht und einfach (ausdrücklicher Wunsch)

- So wenig wie möglich auf dem Bildschirm. Jede Information genau **einmal** –
  nichts doppelt anzeigen (kein Titel zweimal, keine Knöpfe, die dasselbe tun
  wie ein Link daneben).
- Listen zeigen nur den **Titel** als schmalen Block. Antippen klappt die
  Beschreibung/Details auf, darin ein Knopf **Bearbeiten**.
- Wenige Eingabefelder: lieber ein Feld „Titel“ + freie „Beschreibung“ als
  viele Einzelfelder.
- Kurze Texte, keine Erklär-Absätze in der Oberfläche. Keine Zähler, Symbole
  oder Hinweise, die nicht wirklich gebraucht werden.
- Neue Funktionen fügen sich in dieses Muster ein (Liste → aufklappen →
  Bearbeiten, Sortieren am Griff ⠿).

## Ablauf bei Änderungen

1. `VERSION` in `sw.js` erhöhen **und** dieselbe Zahl in `index.html` bei
   `styles.css?v=`, `core.js?v=`, `app.js?v=` eintragen; `APP_VERSION` in
   `app.js` hochzählen. (Sonst lädt das Handy nach einem Update eine alte
   `app.js` zur neuen Seite.)
2. Tests: `node tools/test-core.js` und
   `NODE_PATH=$(npm root -g) node tools/test-ui.js <screenshot-ordner>`.
3. Gespeicherte Daten alter Versionen immer weiter lesen können (Migration in
   `normalize…`-Funktionen in `core.js`), nie Nutzerdaten verlieren.
4. Direkt auf `main` pushen (GitHub Pages veröffentlicht von dort).
