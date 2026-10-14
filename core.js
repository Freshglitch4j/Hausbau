/*
 * Hausbau – Kernlogik
 * Reine Funktionen ohne DOM-Zugriff, damit sie in Node getestet werden können.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HausCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------ Bereiche */

  var PHASES = [
    { id: 'planung', label: 'Planung' },
    { id: 'finanzen', label: 'Finanzierung' },
    { id: 'behoerden', label: 'Behörden' },
    { id: 'bau', label: 'Bau' },
    { id: 'ausbau', label: 'Ausbau' },
    { id: 'sonstiges', label: 'Sonstiges' }
  ];

  function phaseLabel(id) {
    for (var i = 0; i < PHASES.length; i++) if (PHASES[i].id === id) return PHASES[i].label;
    return 'Sonstiges';
  }

  function isPhase(id) {
    return PHASES.some(function (p) { return p.id === id; });
  }

  /* ---------------------------------------------------------------- Zeit */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Date -> "2026-10-14"
  function isoDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // Date -> "2026-10-14T09:30" (lokale Zeit, wie <input type="datetime-local">)
  function isoLocal(d) {
    return isoDate(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // "2026-10-14" -> Date (00:00 lokal) ; ungültig -> null
  function parseDate(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }

  // "2026-10-14T09:30" -> Date ; ungültig -> null
  function parseLocal(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
    if (!m || +m[4] > 23 || +m[5] > 59) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }

  var DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  // Datum kurz: im laufenden Jahr "Mi 14.10.", sonst "14.10.2027"
  function fmtDate(iso, now) {
    var d = parseDate(iso);
    if (!d) return '';
    now = now || new Date();
    var base = pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.';
    return d.getFullYear() === now.getFullYear() ? DOW[d.getDay()] + ' ' + base : base + d.getFullYear();
  }

  function fmtDateTime(local, now) {
    var d = parseLocal(local);
    if (!d) return '';
    return fmtDate(isoDate(d), now) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // Ganze Kalendertage von heute bis zum Datum (negativ = vorbei)
  function daysUntil(iso, now) {
    var d = parseDate(iso);
    if (!d) return null;
    now = now || new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((d - today) / 86400000);
  }

  function relDays(iso, now) {
    var n = daysUntil(iso, now);
    if (n === null) return '';
    if (n === 0) return 'heute';
    if (n === 1) return 'morgen';
    if (n === -1) return 'seit gestern';
    if (n > 1) return n < 14 ? 'in ' + n + ' Tagen' : n < 70 ? 'in ' + Math.round(n / 7) + ' Wochen' : 'in ' + Math.round(n / 30.4) + ' Monaten';
    return 'seit ' + (-n) + ' Tagen';
  }

  // Zustand der Frist: 'overdue' | 'today' | 'soon' (≤ 7 Tage) | null
  function dueState(todo, now) {
    if (!todo || todo.done || !todo.due) return null;
    var n = daysUntil(todo.due, now);
    if (n === null) return null;
    if (n < 0) return 'overdue';
    if (n === 0) return 'today';
    if (n <= 7) return 'soon';
    return null;
  }

  /* ----------------------------------------------------------- Reihenfolge */

  // Verschiebt innerhalb einer gefilterten Ansicht. Die sichtbaren Einträge
  // tauschen nur untereinander ihre Plätze in der Gesamtliste – alles, was
  // gerade ausgeblendet ist, bleibt exakt an seiner Stelle.
  function moveWithin(allIds, visibleIds, from, to) {
    if (from === to || from < 0 || to < 0 || from >= visibleIds.length || to >= visibleIds.length) {
      return allIds.slice();
    }
    var slots = visibleIds.map(function (id) { return allIds.indexOf(id); });
    var moved = visibleIds.slice();
    var item = moved.splice(from, 1)[0];
    moved.splice(to, 0, item);
    var out = allIds.slice();
    slots.forEach(function (slot, k) { out[slot] = moved[k]; });
    return out;
  }

  // Ordnet Objekte nach einer ID-Liste
  function orderBy(items, ids) {
    var map = {};
    items.forEach(function (t) { map[t.id] = t; });
    return ids.map(function (id) { return map[id]; }).filter(Boolean);
  }

  /* ---------------------------------------------------------- Erinnerungen */

  // Offene Aufgaben, deren Erinnerung erreicht ist und die noch nicht
  // weggeklickt wurden – älteste zuerst.
  function dueReminders(todos, now) {
    now = now || new Date();
    return todos.filter(function (t) {
      if (t.done || !t.remindAt || t.remindAck) return false;
      var d = parseLocal(t.remindAt);
      return d && d <= now;
    }).sort(function (a, b) { return a.remindAt < b.remindAt ? -1 : 1; });
  }

  function nextReminder(todos, now) {
    now = now || new Date();
    var best = null;
    todos.forEach(function (t) {
      if (t.done || !t.remindAt || t.remindAck) return;
      var d = parseLocal(t.remindAt);
      if (d && d > now && (!best || d < best.at)) best = { todo: t, at: d };
    });
    return best;
  }

  // Erinnerung um einen Tag verschieben (gleiche Uhrzeit, frühestens morgen)
  function snooze(remindAt, now) {
    now = now || new Date();
    var d = parseLocal(remindAt) || now;
    var t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, d.getHours(), d.getMinutes());
    return isoLocal(t);
  }

  /* -------------------------------------------------------------- Kalender */

  function compact(local) { return local.replace(/[-:]/g, ''); }

  function calText(todo) {
    var parts = [];
    if (todo.note) parts.push(todo.note);
    parts.push('Bereich: ' + phaseLabel(todo.phase));
    parts.push('– aus der Hausbau-App');
    return parts.join('\n\n');
  }

  // Termin für den Kalender: Erinnerung (30 min) oder ganztägig zur Frist
  function calSlot(todo) {
    var r = parseLocal(todo.remindAt || '');
    if (r) {
      var end = new Date(r.getTime() + 30 * 60000);
      return { allDay: false, start: compact(isoLocal(r)) + '00', end: compact(isoLocal(end)) + '00' };
    }
    var d = parseDate(todo.due || '');
    if (d) {
      var next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      return { allDay: true, start: compact(isoDate(d)), end: compact(isoDate(next)) };
    }
    return null;
  }

  function gcalUrl(todo) {
    var slot = calSlot(todo);
    if (!slot) return null;
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent('Hausbau: ' + todo.title) +
      '&dates=' + slot.start + '/' + slot.end +
      '&details=' + encodeURIComponent(calText(todo));
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  function icsText(todo, now) {
    var slot = calSlot(todo);
    if (!slot) return null;
    now = now || new Date();
    var stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hausbau-App//DE', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + todo.id + '@hausbau-app',
      'DTSTAMP:' + stamp,
      slot.allDay ? 'DTSTART;VALUE=DATE:' + slot.start : 'DTSTART:' + slot.start,
      slot.allDay ? 'DTEND;VALUE=DATE:' + slot.end : 'DTEND:' + slot.end,
      'SUMMARY:' + icsEscape('Hausbau: ' + todo.title),
      'DESCRIPTION:' + icsEscape(calText(todo)),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(todo.title),
      // Ganztägig: Vortag 18 Uhr ; mit Uhrzeit: genau zum Termin
      slot.allDay ? 'TRIGGER:-PT6H' : 'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    return lines.join('\r\n') + '\r\n';
  }

  /* ---------------------------------------------------------- Datenformen */

  function str(v, max) {
    return typeof v === 'string' ? v.slice(0, max || 4000) : '';
  }

  function normalizeTodo(o) {
    if (!o || typeof o !== 'object') return null;
    var title = str(o.title, 200).trim();
    if (!title) return null;
    return {
      id: str(o.id, 40) || uid(),
      title: title,
      phase: isPhase(o.phase) ? o.phase : 'sonstiges',
      note: str(o.note, 20000),
      due: parseDate(o.due) ? o.due : '',
      remindAt: parseLocal(o.remindAt) ? o.remindAt.slice(0, 16) : '',
      remindAck: !!o.remindAck,
      notified: !!o.notified,
      done: !!o.done,
      doneAt: o.done && typeof o.doneAt === 'string' ? o.doneAt : '',
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString()
    };
  }

  function normalizeNote(o) {
    if (!o || typeof o !== 'object') return null;
    var title = str(o.title, 200).trim();
    var text = str(o.text, 50000);
    if (!title && !text.trim()) return null;
    var created = typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString();
    return {
      id: str(o.id, 40) || uid(),
      title: title,
      text: text,
      createdAt: created,
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : created
    };
  }

  function normalizeList(list, fn) {
    var seen = {};
    return (Array.isArray(list) ? list : []).map(fn).filter(function (x) {
      if (!x) return false;
      if (seen[x.id]) x.id = uid();
      seen[x.id] = true;
      return true;
    });
  }

  function makeBackup(todos, notes, now) {
    return {
      app: 'hausbau',
      format: 1,
      exportedAt: (now || new Date()).toISOString(),
      todos: todos,
      notes: notes
    };
  }

  // Liest eine Sicherung; wirft einen verständlichen Fehler bei Unsinn
  function parseBackup(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Die Datei ist keine gültige Sicherung (kein JSON).'); }
    if (!data || data.app !== 'hausbau') throw new Error('Die Datei stammt nicht aus der Hausbau-App.');
    return {
      todos: normalizeList(data.todos, normalizeTodo),
      notes: normalizeList(data.notes, normalizeNote)
    };
  }

  /* ----------------------------------------------------------- Vorlage */

  // Typische Schritte als Startpunkt – in grob sinnvoller Reihenfolge
  var SAMPLE = [
    ['finanzen', 'Budget und Eigenkapital festlegen', 'Was ist realistisch leistbar? Monatliche Rate, Reserve für Unvorhergesehenes (ca. 10–15 %), Nebenkosten (Grunderwerb, Notar, Grundbuch, Anschlüsse).'],
    ['finanzen', 'Finanzierungsgespräche mit 2–3 Banken', 'Angebote vergleichen: Zinsbindung, Sondertilgung, Bereitstellungszinsen, Förderungen.'],
    ['planung', 'Wunschliste und Raumprogramm erstellen', 'Wie viele Zimmer, Größe, Keller ja/nein, Büro, Garage/Carport, Barrierefreiheit, Energiestandard.'],
    ['planung', 'Grundstück prüfen', 'Bebauungsplan, Erschließung, Baulasten, Lage, Ausrichtung, Hanglage.'],
    ['planung', 'Bodengutachten beauftragen', ''],
    ['planung', 'Architekt bzw. Baufirma auswählen', 'Referenzen ansehen, Leistungsumfang vergleichen, Festpreis?'],
    ['planung', 'Entwurf besprechen und freigeben', ''],
    ['behoerden', 'Bauantrag / Einreichplanung einreichen', ''],
    ['sonstiges', 'Bauherrenhaftpflicht und Bauleistungsversicherung abschließen', ''],
    ['planung', 'Angebote der Gewerke einholen und vergleichen', ''],
    ['planung', 'Bauvertrag prüfen lassen', 'Zahlungsplan, Fertigstellungstermin, Gewährleistung, Vertragsstrafen.'],
    ['behoerden', 'Baustrom und Bauwasser beantragen', ''],
    ['behoerden', 'Hausanschlüsse beantragen (Strom, Wasser, Kanal, Internet)', 'Lange Vorlaufzeiten – früh anfragen.'],
    ['ausbau', 'Bemusterung: Fliesen, Böden, Sanitär, Türen', ''],
    ['ausbau', 'Elektroplanung festlegen (Steckdosen, Licht, Netzwerk)', 'Muss vor der Rohinstallation fertig sein.'],
    ['bau', 'Erdarbeiten und Fundament / Bodenplatte', ''],
    ['bau', 'Rohbauabnahme', 'Mit Sachverständigem, Mängel schriftlich festhalten.'],
    ['bau', 'Endabnahme mit Mängelprotokoll', '']
  ];

  function sampleTodos(now) {
    var created = (now || new Date()).toISOString();
    return SAMPLE.map(function (s, i) {
      return normalizeTodo({ id: 'v' + i + '-' + uid(), phase: s[0], title: s[1], note: s[2], createdAt: created });
    });
  }

  return {
    PHASES: PHASES, phaseLabel: phaseLabel, isPhase: isPhase,
    uid: uid, pad: pad, isoDate: isoDate, isoLocal: isoLocal, parseDate: parseDate, parseLocal: parseLocal,
    fmtDate: fmtDate, fmtDateTime: fmtDateTime, daysUntil: daysUntil, relDays: relDays, dueState: dueState,
    moveWithin: moveWithin, orderBy: orderBy,
    dueReminders: dueReminders, nextReminder: nextReminder, snooze: snooze,
    gcalUrl: gcalUrl, icsText: icsText,
    normalizeTodo: normalizeTodo, normalizeNote: normalizeNote,
    makeBackup: makeBackup, parseBackup: parseBackup,
    sampleTodos: sampleTodos
  };
});
