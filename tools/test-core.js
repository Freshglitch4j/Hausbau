/* Tests der Kernlogik. Aufruf: node tools/test-core.js */
const C = require('../core.js');
let pass = 0, fail = 0;
function eq(a, e, name) {
  if (JSON.stringify(a) === JSON.stringify(e)) pass++;
  else { fail++; console.log('✗ ' + name + '\n   erwartet ' + JSON.stringify(e) + '\n   bekommen ' + JSON.stringify(a)); }
}
const now = new Date(2026, 9, 14, 10, 30); // Mi 14.10.2026 10:30

// Reihenfolge
eq(C.moveWithin(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c'], 'ganz nach oben');
eq(C.moveWithin(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd'], 'nach unten');
eq(C.moveWithin(['a', 'x', 'b', 'y', 'c'], ['a', 'b', 'c'], 2, 0), ['c', 'x', 'a', 'y', 'b'], 'im Filter: Ausgeblendete bleiben stehen');
eq(C.moveWithin(['a', 'b'], ['a', 'b'], 0, 5), ['a', 'b'], 'ungültiges Ziel ändert nichts');
eq(C.orderBy([{ id: 'a' }, { id: 'b' }], ['b', 'a']).map((x) => x.id), ['b', 'a'], 'orderBy');

// Datum
eq(C.fmtDate('2026-10-20', now), 'Di 20.10.', 'Datum im laufenden Jahr');
eq(C.fmtDate('2027-01-05', now), '05.01.2027', 'Datum im nächsten Jahr');
eq(C.fmtDateTime('2026-10-14T09:05', now), 'Mi 14.10., 09:05', 'Datum mit Uhrzeit');
eq(C.relDays('2026-10-14', now), 'heute', 'heute');
eq(C.relDays('2026-10-15', now), 'morgen', 'morgen');
eq(C.relDays('2026-10-20', now), 'in 6 Tagen', 'in Tagen');
eq(C.relDays('2026-10-10', now), 'seit 4 Tagen', 'überfällig');
eq(C.dueState({ due: '2026-10-13' }, now), 'overdue', 'Frist vorbei');
eq(C.dueState({ due: '2026-10-14' }, now), 'today', 'Frist heute');
eq(C.dueState({ due: '2026-10-19' }, now), 'soon', 'Frist bald');
eq(C.dueState({ due: '2026-12-01' }, now), null, 'Frist weit weg');
eq(C.dueState({ due: '2026-10-13', done: true }, now), null, 'Erledigtes ist nie überfällig');
eq(C.parseDate('2026-02-30'), null, 'ungültiges Datum');

// Erinnerungen
const todos = [
  { id: '1', title: 'A', remindAt: '2026-10-14T10:00' },
  { id: '2', title: 'B', remindAt: '2026-10-14T11:00' },
  { id: '3', title: 'C', remindAt: '2026-10-13T08:00', remindAck: true },
  { id: '4', title: 'D', remindAt: '2026-10-12T08:00', done: true },
  { id: '5', title: 'E', remindAt: '2026-10-13T09:00' }
];
eq(C.dueReminders(todos, now).map((t) => t.id), ['5', '1'], 'fällige Erinnerungen, älteste zuerst');
eq(C.nextReminder(todos, now).todo.id, '2', 'nächste Erinnerung');
eq(C.snooze('2026-10-12T08:15', now), '2026-10-15T08:15', 'Schlummern: morgen, gleiche Uhrzeit');

// Kalender
const g = C.gcalUrl({ title: 'Bank', phase: 'finanzen', remindAt: '2026-10-20T09:00', note: '' });
eq(/dates=20261020T090000\/20261020T093000/.test(g), true, 'Google-Kalender: Uhrzeit');
const g2 = C.gcalUrl({ title: 'Bank', phase: 'finanzen', due: '2026-10-31', remindAt: '' });
eq(/dates=20261031\/20261101/.test(g2), true, 'Google-Kalender: ganztägig, Monatswechsel');
eq(C.gcalUrl({ title: 'x' }), null, 'ohne Termin kein Kalenderlink');
const ics = C.icsText({ id: 'abc', title: 'Bank, Termin; wichtig', phase: 'finanzen', remindAt: '2026-10-20T09:00', note: 'Zeile1\nZeile2' }, now);
eq(ics.includes('SUMMARY:Hausbau: Bank\\, Termin\\; wichtig'), true, 'ICS: Sonderzeichen');
eq(ics.includes('DTSTART:20261020T090000'), true, 'ICS: Start');
eq(ics.includes('BEGIN:VALARM'), true, 'ICS: Alarm');

// Daten
eq(C.normalizeTodo({ title: '  ' }), null, 'leerer Titel wird verworfen');
const n = C.normalizeTodo({ title: 'X', phase: 'quatsch', due: 'morgen', remindAt: '2026-10-14T09:00:00' });
eq([n.phase, n.due, n.remindAt, n.done], ['quatsch', '', '2026-10-14T09:00', false], 'normalizeTodo');
const backup = JSON.stringify(C.makeBackup([{ id: 'a', title: 'T' }, { id: 'a', title: 'U' }],
  [{ title: 'Architekt – Alois Huber' }, { title: '' }], [{ id: 'x', label: 'Keller', color: 3 }], now));
const back = C.parseBackup(backup);
eq([back.todos.length, back.contacts.length], [2, 1], 'Sicherung: leere Person fällt weg');
eq(back.phases, [{ id: 'x', label: 'Keller', color: 3 }], 'Sicherung: eigene Bereiche');
const old = C.parseBackup(JSON.stringify({ app: 'hausbau', format: 1, todos: [], notes: [{ title: '', text: 'Fragen\nWärmepumpe?' }] }));
eq([old.contacts[0].name, old.contacts[0].role, old.contacts[0].info, old.phases], ['Fragen', '', 'Wärmepumpe?', null], 'alte Sicherung: Notizen werden Personen-Einträge');
eq([back.contacts[0].name, back.contacts[0].role], ['Alois Huber', 'Architekt'], 'Sicherung 1.5–1.7: Titel wird zu Name + Funktion');
eq(back.todos[0].id !== back.todos[1].id, true, 'Sicherung: doppelte IDs werden aufgelöst');
let err = '';
try { C.parseBackup('{"app":"andere"}'); } catch (e) { err = e.message; }
eq(err, 'Die Datei stammt nicht aus der Hausbau-App.', 'fremde Datei');
eq(C.sampleTodos(now).length >= 15, true, 'Vorlage');
eq(C.sampleTodos(now, [{ id: 'bau', label: 'Bau', color: 4 }]).filter((t) => t.phase).every((t) => t.phase === 'bau'), true, 'Vorlage: gelöschte Bereiche bleiben leer');

// Bereiche
eq(C.normalizePhases('kaputt').length, 6, 'Bereiche: Vorgabe bei Unsinn');
eq(C.normalizePhases([{ id: 'a', label: ' A ', color: 99 }, { id: 'a', label: 'doppelt' }, { id: 'b', label: '' }]), [{ id: 'a', label: 'A', color: 6 }], 'Bereiche prüfen');
eq(C.nextColor([{ color: 1 }, { color: 2 }]), 3, 'nächste freie Farbe');
eq(C.phaseLabel('x', [{ id: 'x', label: 'Keller' }]), 'Keller', 'eigener Bereichsname');
eq(C.phaseLabel('weg', []), '', 'gelöschter Bereich ohne Namen');

// Personen
const pc = (o) => { const c = C.normalizeContact(o); return c && [c.name, c.role]; };
eq(pc({ name: ' Alois Huber ', role: ' Architekt ', phases: ['planung', 3, ''] }), ['Alois Huber', 'Architekt'], 'Person: Name + Funktion');
eq(C.normalizeContact({ name: 'A', phases: ['planung', 3, ''] }).phases, ['planung'], 'Person: Bereiche geprüft');
eq(C.normalizeContact({ name: ' ', role: '' }), null, 'leere Person');
// Ältere Formen – nie doppelt
eq(pc({ title: 'Architekt – Alois Huber' }), ['Alois Huber', 'Architekt'], '1.5–1.7: Titel aufgeteilt');
eq(pc({ title: 'Architekt Alois Huber' }), ['Architekt Alois Huber', ''], '1.5–1.7: Titel ohne Strich = Name');
eq(pc({ role: 'Architekt', name: 'Alois Huber' }), ['Alois Huber', 'Architekt'], '1.3/1.4: Funktion + Name');
eq(pc({ role: 'Architekt Alois Huber', name: '' }), ['Architekt Alois Huber', ''], '1.3/1.4: nur Funktion → Name');
eq(pc({ role: 'Alois Huber', name: 'alois huber' }), ['alois huber', ''], 'gleicher Text nur einmal');
eq(pc({ role: 'Notiz', name: 'Fragen' }), ['Fragen', ''], 'umgezogene Notiz ohne „Notiz“');
eq(C.normalizeContact({ name: 'X' }).phases, [], 'ohne Bereiche');

// Links in Beschreibungen
const segs = C.linkify('Tel. 0664 123 45 67, Mail alois.huber@arch.at, Web www.huber-architektur.at. Termin 14.10.2026 um 9');
const kinds = segs.filter((s) => s.type !== 'text').map((s) => s.type + ':' + s.href);
eq(kinds, ['tel:tel:06641234567', 'mail:mailto:alois.huber@arch.at', 'url:https://www.huber-architektur.at'], 'Links erkennen');
eq(segs.map((s) => s.text).join(''), 'Tel. 0664 123 45 67, Mail alois.huber@arch.at, Web www.huber-architektur.at. Termin 14.10.2026 um 9', 'Text bleibt vollständig');
eq(C.linkify('+43 1 234 5678').map((s) => s.href), ['tel:+4312345678'], 'internationale Nummer');
eq(C.linkify('PLZ 0123').map((s) => s.type), ['text'], 'zu kurze Zahl ist kein Telefon');

// Update-Sicherheit: index.html lädt alle eigenen Dateien mit ?v=<Service-Worker-Version>
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const swVersion = /const VERSION = 'hausbau-v(\d+)'/.exec(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'))[1];
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
['styles.css', 'core.js', 'app.js'].forEach((f) => {
  eq(html.includes(f + '?v=' + swVersion + '"'), true, f + ' in index.html mit ?v=' + swVersion + ' (wie sw.js)');
});

console.log(fail ? '\n' + fail + ' Fehler, ' + pass + ' ok' : 'Alle ' + pass + ' Tests ok');
process.exit(fail ? 1 : 0);
