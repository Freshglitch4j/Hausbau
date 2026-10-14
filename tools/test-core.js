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
eq([n.phase, n.due, n.remindAt, n.done], ['sonstiges', '', '2026-10-14T09:00', false], 'normalizeTodo');
const backup = JSON.stringify(C.makeBackup([{ id: 'a', title: 'T' }, { id: 'a', title: 'U' }], [{ text: 'hi' }, { text: '' }], now));
const back = C.parseBackup(backup);
eq([back.todos.length, back.notes.length], [2, 1], 'Sicherung: leere Notiz fällt weg');
eq(back.todos[0].id !== back.todos[1].id, true, 'Sicherung: doppelte IDs werden aufgelöst');
let err = '';
try { C.parseBackup('{"app":"andere"}'); } catch (e) { err = e.message; }
eq(err, 'Die Datei stammt nicht aus der Hausbau-App.', 'fremde Datei');
eq(C.sampleTodos(now).length >= 15, true, 'Vorlage');

console.log(fail ? '\n' + fail + ' Fehler, ' + pass + ' ok' : 'Alle ' + pass + ' Tests ok');
process.exit(fail ? 1 : 0);
