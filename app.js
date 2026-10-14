/*
 * Hausbau – Oberfläche
 * Daten: localStorage (bleibt auf dem Gerät). Logik ohne DOM steckt in core.js.
 */
(function () {
  'use strict';

  var C = window.HausCore;
  var APP_VERSION = '1.1';
  var KEY_TODOS = 'hausbau.todos.v1';
  var KEY_NOTES = 'hausbau.notes.v1';
  var KEY_SETTINGS = 'hausbau.settings.v1';

  var state = {
    todos: [],          // Reihenfolge im Array = Priorität / Zeitachse
    notes: [],
    settings: { theme: 'auto', filter: 'all' },
    view: 'todos',
    editTodo: null,     // id oder null (= neu)
    newPos: 'bottom',
    editNote: null
  };

  /* -------------------------------------------------------------- Helfer */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  var toastTimer = null;
  var toastHandler = null;
  function toast(msg, opts) {
    opts = opts || {};
    var t = $('#toast');
    var btn = $('#toastAction');
    // Offene Dialoge liegen über allem – der Hinweis muss dann hinein
    var host = openDialog || document.body;
    if (t.parentNode !== host) host.appendChild(t);
    $('#toastMsg').textContent = msg;
    t.classList.toggle('is-error', !!opts.error);
    toastHandler = opts.onAction || null;
    btn.hidden = !opts.action;
    btn.textContent = opts.action || '';
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opts.action ? 5000 : 2600);
  }
  function hideToast() {
    $('#toast').classList.remove('is-visible');
    toastHandler = null;
  }

  function nowDate() { return new Date(); }

  /* ------------------------------------------------------------ Speicher */

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      toast('Speichern fehlgeschlagen. Der Gerätespeicher ist voll oder gesperrt.', { error: true });
      return false;
    }
  }

  function saveTodos() { return save(KEY_TODOS, state.todos); }
  function saveNotes() { return save(KEY_NOTES, state.notes); }
  function saveSettings() { return save(KEY_SETTINGS, state.settings); }

  function loadAll() {
    state.todos = (load(KEY_TODOS, []) || []).map(C.normalizeTodo).filter(Boolean);
    state.notes = (load(KEY_NOTES, []) || []).map(C.normalizeNote).filter(Boolean);
    var s = load(KEY_SETTINGS, {}) || {};
    state.settings.theme = ['auto', 'dark', 'light'].indexOf(s.theme) >= 0 ? s.theme : 'auto';
    state.settings.filter = s.filter === 'all' || C.isPhase(s.filter) ? s.filter : 'all';
  }

  function findTodo(id) {
    for (var i = 0; i < state.todos.length; i++) if (state.todos[i].id === id) return state.todos[i];
    return null;
  }
  function findNote(id) {
    for (var i = 0; i < state.notes.length; i++) if (state.notes[i].id === id) return state.notes[i];
    return null;
  }

  function openTodos() { return state.todos.filter(function (t) { return !t.done; }); }

  function visibleTodos() {
    var f = state.settings.filter;
    return openTodos().filter(function (t) { return f === 'all' || t.phase === f; });
  }

  /* ------------------------------------------------------------- Design */

  var darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function applyTheme() {
    var t = state.settings.theme;
    var resolved = t === 'auto' ? (darkMQ && !darkMQ.matches ? 'light' : 'dark') : t;
    document.documentElement.setAttribute('data-theme', resolved);
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'light' ? '#f1efeb' : '#15181d');
    $$('#themeSeg [data-theme-choice]').forEach(function (b) {
      b.setAttribute('aria-checked', b.dataset.themeChoice === t ? 'true' : 'false');
    });
  }

  /* -------------------------------------------------------- Ansichten */

  function showView(name) {
    state.view = name;
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + name); });
    $$('.tab').forEach(function (b) {
      var on = b.dataset.view === name;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var fab = $('#fab');
    fab.hidden = name === 'more';
    fab.setAttribute('aria-label', name === 'notes' ? 'Neue Notiz' : 'Neues To-do');
    if (name === 'more') renderMore();
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------ To-dos */

  function renderTodos() {
    var open = openTodos();
    var done = state.todos.filter(function (t) { return t.done; });
    var now = nowDate();

    var sub = open.length + ' offen';
    if (done.length) sub += ' · ' + done.length + ' erledigt';
    var overdue = open.filter(function (t) { return C.dueState(t, now) === 'overdue'; }).length;
    if (overdue) sub += ' · ' + overdue + ' überfällig';
    $('#todoSub').textContent = sub;

    renderChips(open);
    $('#phaseChips').hidden = !state.todos.length;
    renderReminders();

    var list = $('#todoList');
    list.textContent = '';
    var vis = visibleTodos();
    vis.forEach(function (t, i) { list.appendChild(todoRow(t, i, vis.length)); });

    var empty = $('#todoEmpty');
    empty.textContent = '';
    if (!state.todos.length) {
      empty.appendChild(el('p', null, [el('strong', { text: 'Willkommen bei deinem Hausbau-Planer.' })]));
      empty.appendChild(el('p', { text: 'Hier stehen deine nächsten Schritte – das Wichtigste immer ganz oben. Leg selbst los oder starte mit einer Liste typischer Hausbau-Schritte.' }));
      empty.appendChild(el('div', { class: 'btnrow btnrow-center' }, [
        el('button', { class: 'btn btn-primary', type: 'button', text: 'Erstes To-do anlegen', onclick: function () { openTodo(null); } }),
        el('button', { class: 'btn', type: 'button', text: 'Typische Schritte laden', onclick: addSamples })
      ]));
      empty.hidden = false;
    } else if (!vis.length) {
      empty.appendChild(el('p', { text: state.settings.filter === 'all'
        ? 'Alles erledigt. Stark!'
        : 'Keine offenen To-dos im Bereich „' + C.phaseLabel(state.settings.filter) + '“.' }));
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }

    $('#sortHint').hidden = vis.length < 2;

    var doneBox = $('#doneBox');
    doneBox.hidden = !done.length;
    $('#doneTitle').textContent = 'Erledigt (' + done.length + ')';
    var dl = $('#doneList');
    dl.textContent = '';
    done.slice().sort(function (a, b) { return a.doneAt < b.doneAt ? 1 : -1; })
      .forEach(function (t) { dl.appendChild(doneRow(t)); });
  }

  function renderChips(open) {
    var box = $('#phaseChips');
    box.textContent = '';
    var counts = { all: open.length };
    open.forEach(function (t) { counts[t.phase] = (counts[t.phase] || 0) + 1; });
    var items = [{ id: 'all', label: 'Alle' }].concat(C.PHASES);
    items.forEach(function (p) {
      var on = state.settings.filter === p.id;
      box.appendChild(el('button', {
        type: 'button', class: 'chip' + (on ? ' is-on' : ''), role: 'tab',
        'aria-selected': on ? 'true' : 'false',
        'data-phase': p.id,
        onclick: function () {
          state.settings.filter = p.id;
          saveSettings();
          renderTodos();
        }
      }, [p.label, counts[p.id] ? el('span', { class: 'chip-count', text: String(counts[p.id]) }) : null]));
    });
  }

  function metaParts(t) {
    var now = nowDate();
    var parts = [];
    parts.push(el('span', { class: 'tag tag-' + t.phase, text: C.phaseLabel(t.phase) }));
    if (t.due) {
      var ds = C.dueState(t, now);
      parts.push(el('span', { class: 'meta' + (ds ? ' meta-' + ds : '') },
        [icon('cal'), 'bis ' + C.fmtDate(t.due, now) + (t.done ? '' : ' · ' + C.relDays(t.due, now))]));
    }
    if (t.remindAt && !t.done) {
      var past = C.parseLocal(t.remindAt) <= now;
      parts.push(el('span', { class: 'meta' + (past && !t.remindAck ? ' meta-today' : '') },
        [icon('bell'), C.fmtDateTime(t.remindAt, now)]));
    }
    return parts;
  }

  function todoRow(t, index, total) {
    var row = el('div', { class: 'todo-row' + (index === 0 ? ' is-next' : '') + (C.dueState(t, nowDate()) === 'overdue' ? ' is-overdue' : '') });
    row.dataset.id = t.id;

    row.appendChild(el('button', {
      class: 'grip', type: 'button',
      'aria-label': '„' + t.title + '“ verschieben, Platz ' + (index + 1) + ' von ' + total + '. Pfeiltasten oder ziehen.',
      onkeydown: function (ev) {
        if (ev.key === 'ArrowUp') { ev.preventDefault(); moveTodo(index, index - 1, true); }
        if (ev.key === 'ArrowDown') { ev.preventDefault(); moveTodo(index, index + 1, true); }
      },
      onpointerdown: function (ev) { startDrag(ev, row); },
      oncontextmenu: function (ev) { ev.preventDefault(); }
    }, [el('span', { class: 'rank', text: String(index + 1) }), el('span', { class: 'dots', 'aria-hidden': 'true', text: '⠿' })]));

    row.appendChild(el('button', {
      class: 'check', type: 'button', 'aria-label': '„' + t.title + '“ als erledigt markieren',
      onclick: function () { completeTodo(t.id, row); }
    }, [el('span', { class: 'check-ring', 'aria-hidden': 'true' })]));

    var body = el('button', { class: 'todo-body', type: 'button', onclick: function () { openTodo(t.id); } });
    if (index === 0) body.appendChild(el('span', { class: 'next-label', text: 'Als Nächstes' }));
    body.appendChild(el('span', { class: 'todo-title', text: t.title }));
    body.appendChild(el('span', { class: 'todo-meta' }, metaParts(t)));
    if (t.note) {
      var first = t.note.split('\n').filter(function (l) { return l.trim(); })[0] || '';
      body.appendChild(el('span', { class: 'todo-note' }, [icon('note'), first]));
    }
    row.appendChild(body);
    return row;
  }

  function doneRow(t) {
    var row = el('div', { class: 'todo-row is-done' });
    row.appendChild(el('button', {
      class: 'check is-checked', type: 'button', 'aria-label': '„' + t.title + '“ wieder öffnen',
      onclick: function () { setDone(t.id, false); toast('Wieder offen.'); }
    }, [el('span', { class: 'check-ring', 'aria-hidden': 'true' })]));
    var body = el('button', { class: 'todo-body', type: 'button', onclick: function () { openTodo(t.id); } }, [
      el('span', { class: 'todo-title', text: t.title }),
      el('span', { class: 'todo-meta' }, [
        el('span', { class: 'tag tag-' + t.phase, text: C.phaseLabel(t.phase) }),
        t.doneAt ? el('span', { class: 'meta', text: 'erledigt ' + C.fmtDate(t.doneAt.slice(0, 10)) }) : null
      ])
    ]);
    row.appendChild(body);
    return row;
  }

  var ICONS = {
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    note: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>'
  };
  function icon(name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', '14');
    s.setAttribute('height', '14');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.innerHTML = ICONS[name];
    return s;
  }

  function setDone(id, done) {
    var t = findTodo(id);
    if (!t) return;
    t.done = done;
    t.doneAt = done ? new Date().toISOString() : '';
    saveTodos();
    renderTodos();
  }

  function completeTodo(id, row) {
    var t = findTodo(id);
    if (!t) return;
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    if (row) row.classList.add('is-completing');
    setTimeout(function () {
      setDone(id, true);
      toast('„' + shorten(t.title, 34) + '“ erledigt.', {
        action: 'Rückgängig',
        onAction: function () { setDone(id, false); }
      });
    }, row ? 320 : 0);
  }

  function shorten(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // Umsortieren -------------------------------------------------------

  function moveTodo(from, to, refocus) {
    var vis = visibleTodos();
    if (to < 0 || to >= vis.length || from === to) return;
    var allIds = state.todos.map(function (t) { return t.id; });
    var visIds = vis.map(function (t) { return t.id; });
    state.todos = C.orderBy(state.todos, C.moveWithin(allIds, visIds, from, to));
    saveTodos();
    renderTodos();
    if (refocus) {
      var grips = $$('#todoList .grip');
      if (grips[to]) grips[to].focus();
    }
  }

  // Ziehen per Zeigereignis – Finger und Maus. Unterschiedlich hohe Zeilen
  // werden berücksichtigt; am Bildschirmrand scrollt die Liste mit.
  function startDrag(ev, row) {
    if (ev.button !== undefined && ev.button !== 0) return;
    var listBox = $('#todoList');
    var rows = Array.prototype.slice.call(listBox.children);
    var index = rows.indexOf(row);
    if (index < 0 || rows.length < 2) return;
    ev.preventDefault();

    var scroll0 = window.scrollY;
    var startY = ev.clientY;
    var lastY = ev.clientY;
    var rects = rows.map(function (r) {
      var b = r.getBoundingClientRect();
      return { top: b.top + scroll0, h: b.height };
    });
    var gap = rects.length > 1 ? Math.max(0, rects[1].top - (rects[0].top + rects[0].h)) : 8;
    var centers = rects.map(function (r) { return r.top + r.h / 2; });
    var span = rects[index].h + gap;
    var target = index;
    var raf = null;
    var pointerId = ev.pointerId;

    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
    row.classList.add('is-dragging');
    listBox.classList.add('is-sorting');
    document.body.classList.add('no-select');
    if (ev.target.setPointerCapture && pointerId !== undefined) {
      try { ev.target.setPointerCapture(pointerId); } catch (e) {}
    }

    function layout() {
      var delta = (lastY + window.scrollY) - (startY + scroll0);
      var center = centers[index] + delta;
      var n = 0;
      centers.forEach(function (c, i) { if (i !== index && c < center) n++; });
      target = n;
      row.style.transform = 'translateY(' + delta + 'px)';
      rows.forEach(function (other, i) {
        if (i === index) return;
        var shift = 0;
        if (index < target && i > index && i <= target) shift = -span;
        if (index > target && i < index && i >= target) shift = span;
        other.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
      });
    }

    function autoScroll() {
      raf = null;
      var edge = 90;
      var v = 0;
      if (lastY < edge) v = -Math.ceil((edge - lastY) / 6);
      else if (lastY > window.innerHeight - edge - 70) v = Math.ceil((lastY - (window.innerHeight - edge - 70)) / 6);
      if (v) {
        var before = window.scrollY;
        window.scrollBy(0, v);
        if (window.scrollY !== before) layout();
        raf = requestAnimationFrame(autoScroll);
      }
    }

    function onMove(e) {
      if (pointerId !== undefined && e.pointerId !== pointerId) return;
      lastY = e.clientY;
      layout();
      if (!raf) raf = requestAnimationFrame(autoScroll);
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      if (raf) cancelAnimationFrame(raf);
      rows.forEach(function (r) { r.style.transform = ''; });
      row.classList.remove('is-dragging');
      listBox.classList.remove('is-sorting');
      document.body.classList.remove('no-select');
      if (target !== index) {
        moveTodo(index, target);
        if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
      }
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  // Vorlage ----------------------------------------------------------

  function addSamples() {
    var existing = {};
    state.todos.forEach(function (t) { existing[t.title.toLowerCase()] = true; });
    var add = C.sampleTodos().filter(function (t) { return !existing[t.title.toLowerCase()]; });
    if (!add.length) { toast('Die typischen Schritte sind schon alle in deiner Liste.'); return; }
    state.todos = state.todos.concat(add);
    state.settings.filter = 'all';
    saveSettings();
    saveTodos();
    renderTodos();
    showView('todos');
    toast(add.length + ' Schritte hinzugefügt. Sortiere sie so, wie es für dich passt.');
  }

  /* ------------------------------------------------------- Erinnerungen */

  function renderReminders() {
    var box = $('#reminderBox');
    box.textContent = '';
    var due = C.dueReminders(state.todos, nowDate());
    due.forEach(function (t) {
      box.appendChild(el('div', { class: 'reminder' }, [
        el('div', { class: 'reminder-head' }, [icon('bell'), el('span', { text: 'Erinnerung · ' + C.fmtDateTime(t.remindAt) })]),
        el('button', { class: 'reminder-title', type: 'button', text: t.title, onclick: function () { openTodo(t.id); } }),
        el('div', { class: 'reminder-actions' }, [
          el('button', { class: 'pill', type: 'button', text: 'Erledigt', onclick: function () { completeTodo(t.id); } }),
          el('button', { class: 'pill', type: 'button', text: 'Morgen wieder', onclick: function () {
            t.remindAt = C.snooze(t.remindAt, nowDate());
            t.remindAck = false; t.notified = false;
            saveTodos(); renderTodos();
            toast('Erinnerung auf ' + C.fmtDateTime(t.remindAt) + ' verschoben.');
          } }),
          el('button', { class: 'pill', type: 'button', text: 'OK', onclick: function () {
            t.remindAck = true; saveTodos(); renderTodos();
          } })
        ])
      ]));
    });
  }

  function notifyPermission() {
    return 'Notification' in window ? Notification.permission : 'unsupported';
  }

  function checkReminders() {
    var due = C.dueReminders(state.todos, nowDate());
    var fresh = due.filter(function (t) { return !t.notified; });
    if (fresh.length) {
      fresh.forEach(function (t) { t.notified = true; showNotification(t); });
      saveTodos();
    }
    // Liste neu zeichnen, wenn sich etwas geändert haben kann (Fristen, Erinnerungen) –
    // aber nicht mitten im Ziehen oder Abhaken
    if (!$('#todoList.is-sorting') && !$('.todo-row.is-completing')) renderTodos();
  }

  function showNotification(t) {
    if (notifyPermission() !== 'granted') return;
    var title = 'Hausbau: ' + t.title;
    var opts = {
      body: t.note ? shorten(t.note.replace(/\s+/g, ' '), 120) : 'Erinnerung ' + C.fmtDateTime(t.remindAt),
      tag: 'hausbau-' + t.id,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { id: t.id }
    };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then(function (reg) { return reg.showNotification(title, opts); })
        .catch(function () { try { new Notification(title, opts); } catch (e) {} });
    } else {
      try { new Notification(title, opts); } catch (e) {}
    }
  }

  function askNotify() {
    if (!('Notification' in window)) { toast('Dieser Browser kann keine Benachrichtigungen anzeigen.', { error: true }); return; }
    Notification.requestPermission().then(function () { renderMore(); });
  }

  // Präziser Wecker für die nächste Erinnerung, solange die App läuft
  var reminderTimer = null;
  function scheduleNext() {
    clearTimeout(reminderTimer);
    var next = C.nextReminder(state.todos, nowDate());
    if (!next) return;
    var ms = next.at - nowDate();
    if (ms > 0 && ms < 2147483647) reminderTimer = setTimeout(function () { checkReminders(); scheduleNext(); }, ms + 500);
  }

  /* ------------------------------------------------------ Dialog-Helfer */

  // Die Zurück-Taste von Android schließt den offenen Dialog statt der App
  var openDialog = null;
  var dialogDirty = null;

  function showDialog(dlg, dirtyFn) {
    openDialog = dlg;
    dialogDirty = dirtyFn;
    dlg.showModal();
    try { history.pushState({ dlg: dlg.id }, ''); } catch (e) {}
  }

  function closeDialog(force) {
    var dlg = openDialog;
    if (!dlg) return true;
    if (!force && dialogDirty && dialogDirty() && !confirm('Änderungen verwerfen?')) return false;
    openDialog = null;
    dialogDirty = null;
    dlg.close();
    if (history.state && history.state.dlg) { try { history.back(); } catch (e) {} }
    return true;
  }

  window.addEventListener('popstate', function () {
    var dlg = openDialog;
    if (!dlg) return;
    if (dialogDirty && dialogDirty() && !confirm('Änderungen verwerfen?')) {
      try { history.pushState({ dlg: dlg.id }, ''); } catch (e) {}
      return;
    }
    openDialog = null;
    dialogDirty = null;
    dlg.close();
  });

  /* ---------------------------------------------------- To-do-Editor */

  var todoSnapshot = '';
  function todoFormValue() {
    return JSON.stringify([$('#tTitle').value, currentPhase(), $('#tDue').value, $('#tRemind').value, $('#tNote').value]);
  }

  function currentPhase() {
    var b = $('#tPhase .chip.is-on');
    return b ? b.dataset.phase : 'planung';
  }

  function setPhase(id) {
    $$('#tPhase .chip').forEach(function (b) {
      var on = b.dataset.phase === id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function setPos(pos) {
    state.newPos = pos;
    $$('#tPos [data-pos]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.pos === pos ? 'true' : 'false'); });
  }

  function openTodo(id) {
    var t = id ? findTodo(id) : null;
    state.editTodo = t ? t.id : null;
    $('#todoDlgTitle').textContent = t ? 'To-do' : 'Neues To-do';
    $('#tTitle').value = t ? t.title : '';
    setPhase(t ? t.phase : (state.settings.filter !== 'all' ? state.settings.filter : 'planung'));
    $('#tDue').value = t ? t.due : '';
    $('#tRemind').value = t ? t.remindAt : '';
    $('#tNote').value = t ? t.note : '';
    $('#tPosField').hidden = !!t;
    setPos('bottom');
    $('#tEditOnly').hidden = !t;
    $('#tDoneBtn').textContent = t && t.done ? 'Wieder öffnen' : 'Als erledigt markieren';
    updateCalButtons();
    autosize($('#tNote'));
    todoSnapshot = todoFormValue();
    showDialog($('#todoDlg'), function () { return todoFormValue() !== todoSnapshot; });
    if (!t) setTimeout(function () { $('#tTitle').focus(); }, 60);
  }

  function formTodo() {
    return {
      id: state.editTodo || 'neu',
      title: $('#tTitle').value.trim(),
      phase: currentPhase(),
      due: $('#tDue').value,
      remindAt: $('#tRemind').value,
      note: $('#tNote').value
    };
  }

  function updateCalButtons() {
    var f = formTodo();
    $('#tCal').hidden = !(f.title && (C.parseLocal(f.remindAt) || C.parseDate(f.due)));
  }

  function saveTodoForm() {
    var f = formTodo();
    if (!f.title) {
      toast('Bitte kurz beschreiben, was zu tun ist.', { error: true });
      $('#tTitle').focus();
      return;
    }
    var t = state.editTodo ? findTodo(state.editTodo) : null;
    var remindChanged = !t || t.remindAt !== f.remindAt;
    if (t) {
      t.title = f.title; t.phase = f.phase; t.due = f.due; t.note = f.note;
      t.remindAt = f.remindAt;
    } else {
      t = C.normalizeTodo({ title: f.title, phase: f.phase, due: f.due, remindAt: f.remindAt, note: f.note });
      if (state.newPos === 'top') {
        // Vor das erste sichtbare offene To-do, damit es auch im Filter oben steht
        var vis = visibleTodos();
        var at = vis.length ? state.todos.indexOf(vis[0]) : 0;
        state.todos.splice(at, 0, t);
      } else {
        state.todos.push(t);
      }
    }
    if (remindChanged) {
      t.remindAck = false;
      // Eine Erinnerung, die beim Speichern schon vorbei ist, nicht nochmal aufs Handy schicken
      t.notified = !!(t.remindAt && C.parseLocal(t.remindAt) <= nowDate());
    }
    if (!saveTodos()) return;
    // Filter so lassen, aber sicherstellen, dass das neue To-do sichtbar ist
    if (state.settings.filter !== 'all' && state.settings.filter !== t.phase) {
      state.settings.filter = 'all';
      saveSettings();
    }
    closeDialog(true);
    renderTodos();
    scheduleNext();
    if (t.remindAt && remindChanged && notifyPermission() === 'default') askNotify();
    toast('Gespeichert.');
  }

  function deleteTodo() {
    var t = findTodo(state.editTodo);
    if (!t || !confirm('„' + shorten(t.title, 60) + '“ löschen?')) return;
    var pos = state.todos.indexOf(t);
    state.todos.splice(pos, 1);
    saveTodos();
    closeDialog(true);
    renderTodos();
    toast('Gelöscht.', {
      action: 'Rückgängig',
      onAction: function () {
        state.todos.splice(Math.min(pos, state.todos.length), 0, t);
        saveTodos();
        renderTodos();
      }
    });
  }

  function quickRemind(kind) {
    var n = nowDate();
    var d;
    if (kind === 'tonight') {
      d = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 19, 0);
      if (d <= n) d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 19, 0);
    }
    if (kind === 'tomorrow') d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 8, 0);
    if (kind === 'week') d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 7, 8, 0);
    $('#tRemind').value = C.isoLocal(d);
    updateCalButtons();
    toast('Erinnerung: ' + C.fmtDateTime(C.isoLocal(d)));
  }

  function downloadFile(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function slug(s) {
    return s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'termin';
  }

  /* ---------------------------------------------------------- Notizen */

  function renderNotes() {
    var list = $('#noteList');
    list.textContent = '';
    var notes = state.notes.slice().sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; });
    $('#noteSub').textContent = notes.length === 1 ? '1 Notiz' : notes.length + ' Notizen';
    $('#noteEmpty').hidden = notes.length > 0;
    notes.forEach(function (n) {
      var lines = n.text.split('\n').filter(function (l) { return l.trim(); });
      var title = n.title || lines.shift() || '';
      list.appendChild(el('button', { class: 'note-card', type: 'button', onclick: function () { openNote(n.id); } }, [
        el('span', { class: 'note-title', text: title }),
        lines.length ? el('span', { class: 'note-preview', text: lines.join(' · ') }) : null,
        el('span', { class: 'note-date', text: fmtStamp(n.updatedAt) })
      ]));
    });
  }

  function fmtStamp(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return C.fmtDate(C.isoDate(d)) + ', ' + C.pad(d.getHours()) + ':' + C.pad(d.getMinutes());
  }

  var noteSnapshot = '';
  function noteFormValue() { return JSON.stringify([$('#nTitle').value, $('#nText').value]); }

  function openNote(id) {
    var n = id ? findNote(id) : null;
    state.editNote = n ? n.id : null;
    $('#noteDlgTitle').textContent = n ? 'Notiz' : 'Neue Notiz';
    $('#nTitle').value = n ? n.title : '';
    $('#nText').value = n ? n.text : '';
    $('#nMeta').textContent = n ? 'Erstellt ' + fmtStamp(n.createdAt) + (n.updatedAt !== n.createdAt ? ' · geändert ' + fmtStamp(n.updatedAt) : '') : '';
    $('#nEditOnly').hidden = !n;
    autosize($('#nText'));
    noteSnapshot = noteFormValue();
    showDialog($('#noteDlg'), function () { return noteFormValue() !== noteSnapshot; });
    if (!n) setTimeout(function () { $('#nText').focus(); }, 60);
  }

  function saveNoteForm() {
    var title = $('#nTitle').value.trim();
    var text = $('#nText').value;
    if (!title && !text.trim()) {
      if (state.editNote) { deleteNote(true); return; }
      closeDialog(true);
      return;
    }
    var stamp = new Date().toISOString();
    var n = state.editNote ? findNote(state.editNote) : null;
    if (n) {
      if (n.title !== title || n.text !== text) { n.title = title; n.text = text; n.updatedAt = stamp; }
    } else {
      state.notes.push(C.normalizeNote({ title: title, text: text, createdAt: stamp, updatedAt: stamp }));
    }
    if (!saveNotes()) return;
    closeDialog(true);
    renderNotes();
    toast('Notiz gespeichert.');
  }

  function deleteNote(skipConfirm) {
    var n = findNote(state.editNote);
    if (!n) return;
    if (!skipConfirm && !confirm('Diese Notiz löschen?')) return;
    state.notes = state.notes.filter(function (x) { return x !== n; });
    saveNotes();
    closeDialog(true);
    renderNotes();
    toast('Notiz gelöscht.', {
      action: 'Rückgängig',
      onAction: function () { state.notes.push(n); saveNotes(); renderNotes(); }
    });
  }

  /* ------------------------------------------------------------- Mehr */

  function renderMore() {
    var p = notifyPermission();
    var status = {
      granted: 'Benachrichtigungen sind erlaubt.',
      denied: 'Benachrichtigungen sind blockiert. Freigeben: Android-Einstellungen → Apps → Hausbau (bzw. Chrome) → Benachrichtigungen.',
      'default': 'Benachrichtigungen sind noch nicht erlaubt. Ohne sie siehst du Erinnerungen nur in der App.',
      unsupported: 'Dieser Browser unterstützt keine Benachrichtigungen. Erinnerungen erscheinen in der App.'
    }[p];
    $('#notifyStatus').textContent = status;
    $('#notifyBtn').hidden = p !== 'default';
    var total = state.todos.length;
    $('#versionInfo').textContent = 'Hausbau ' + APP_VERSION + ' · ' + total + ' To-dos · ' + state.notes.length + ' Notizen · alles lokal gespeichert';
  }

  function exportData() {
    var data = C.makeBackup(state.todos, state.notes);
    downloadFile('hausbau-sicherung-' + C.isoDate(nowDate()) + '.json', JSON.stringify(data, null, 2), 'application/json');
    toast('Sicherung gespeichert (Ordner „Downloads“).');
  }

  function importData(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = C.parseBackup(String(reader.result)); } catch (e) { toast(e.message, { error: true }); return; }
      if (!confirm('Sicherung mit ' + data.todos.length + ' To-dos und ' + data.notes.length +
        ' Notizen laden? Die aktuellen Daten auf diesem Handy werden dabei ersetzt.')) return;
      state.todos = data.todos;
      state.notes = data.notes;
      saveTodos(); saveNotes();
      renderAll();
      toast('Sicherung geladen.');
    };
    reader.onerror = function () { toast('Die Datei konnte nicht gelesen werden.', { error: true }); };
    reader.readAsText(file);
  }

  function wipe() {
    if (!confirm('Wirklich alle To-dos und Notizen löschen? Das lässt sich nicht rückgängig machen.')) return;
    state.todos = [];
    state.notes = [];
    saveTodos(); saveNotes();
    renderAll();
    toast('Alle Daten gelöscht.');
  }

  /* ------------------------------------------------------------- Diverses */

  function autosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 2, window.innerHeight * 0.55) + 'px';
  }

  function renderAll() {
    renderTodos();
    renderNotes();
    renderMore();
  }

  /* ---------------------------------------------------------- Verkabeln */

  function wire() {
    $$('.tab').forEach(function (b) { b.addEventListener('click', function () { showView(b.dataset.view); }); });
    $('#fab').addEventListener('click', function () {
      if (state.view === 'notes') openNote(null); else openTodo(null);
    });
    $$('[data-action="new-note"]').forEach(function (b) { b.addEventListener('click', function () { openNote(null); }); });

    // Bereichs-Auswahl im Editor
    var phaseBox = $('#tPhase');
    C.PHASES.forEach(function (p) {
      phaseBox.appendChild(el('button', {
        type: 'button', class: 'chip', role: 'radio', 'data-phase': p.id, text: p.label,
        onclick: function () { setPhase(p.id); }
      }));
    });
    $$('#tPos [data-pos]').forEach(function (b) { b.addEventListener('click', function () { setPos(b.dataset.pos); }); });

    $('#todoForm').addEventListener('submit', function (ev) { ev.preventDefault(); saveTodoForm(); });
    $('#noteForm').addEventListener('submit', function (ev) { ev.preventDefault(); saveNoteForm(); });
    $$('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closeDialog(false); }); });
    $$('dialog').forEach(function (d) {
      // Escape bzw. Zurück-Geste über das Dialog-Element selbst
      d.addEventListener('cancel', function (ev) { ev.preventDefault(); closeDialog(false); });
    });

    $$('[data-clear]').forEach(function (b) {
      b.addEventListener('click', function () { $('#' + b.dataset.clear).value = ''; updateCalButtons(); });
    });
    $$('[data-quick]').forEach(function (b) { b.addEventListener('click', function () { quickRemind(b.dataset.quick); }); });
    ['#tTitle', '#tDue', '#tRemind'].forEach(function (s) {
      $(s).addEventListener('input', updateCalButtons);
      $(s).addEventListener('change', updateCalButtons);
    });
    $('#tNote').addEventListener('input', function () { autosize(this); });
    $('#nText').addEventListener('input', function () { autosize(this); });

    $('#tGcal').addEventListener('click', function () {
      var url = C.gcalUrl(formTodo());
      if (url) window.open(url, '_blank', 'noopener');
    });
    $('#tIcs').addEventListener('click', function () {
      var f = formTodo();
      var ics = C.icsText(f);
      if (ics) downloadFile('hausbau-' + slug(f.title) + '.ics', ics, 'text/calendar');
      toast('Kalenderdatei gespeichert – antippen, um sie im Kalender zu öffnen.');
    });
    $('#tDoneBtn').addEventListener('click', function () {
      var t = findTodo(state.editTodo);
      if (!t) return;
      var wasDone = t.done;
      closeDialog(true);
      if (wasDone) { setDone(t.id, false); toast('Wieder offen.'); } else completeTodo(t.id);
    });
    $('#tDelete').addEventListener('click', deleteTodo);
    $('#nDelete').addEventListener('click', function () { deleteNote(false); });

    $('#toastAction').addEventListener('click', function () {
      var fn = toastHandler;
      hideToast();
      if (fn) fn();
    });

    $$('#themeSeg [data-theme-choice]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.settings.theme = b.dataset.themeChoice;
        saveSettings();
        applyTheme();
      });
    });
    if (darkMQ) {
      var onScheme = function () { if (state.settings.theme === 'auto') applyTheme(); };
      if (darkMQ.addEventListener) darkMQ.addEventListener('change', onScheme);
      else if (darkMQ.addListener) darkMQ.addListener(onScheme);
    }

    $('#notifyBtn').addEventListener('click', askNotify);
    $('#exportBtn').addEventListener('click', exportData);
    $('#importBtn').addEventListener('click', function () { $('#importFile').value = ''; $('#importFile').click(); });
    $('#importFile').addEventListener('change', function () { importData(this.files && this.files[0]); });
    $('#sampleBtn').addEventListener('click', addSamples);
    $('#wipeBtn').addEventListener('click', wipe);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { checkReminders(); scheduleNext(); }
    });
    setInterval(checkReminders, 30000);

    // Tippen auf eine Benachrichtigung öffnet das To-do
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', function (ev) {
        if (ev.data && ev.data.type === 'open-todo' && findTodo(ev.data.id)) {
          showView('todos');
          openTodo(ev.data.id);
        }
      });
    }
  }

  /* -------------------------------------------------------- Installieren */

  // Eigener Installieren-Knopf über das Ereignis „beforeinstallprompt“.
  // Er nutzt Chromes regulären Installationsweg und umgeht damit den
  // Menüdialog „Installieren und Verknüpfung erstellen“, der auf manchen
  // Geräten fälschlich „bereits installiert“ meldet.
  var KEY_INSTALL_HIDE = 'hausbau.installHidden';
  var installEvt = null;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }

  function installUi() {
    var can = !!installEvt && !isStandalone();
    var hidden = false;
    try { hidden = localStorage.getItem(KEY_INSTALL_HIDE) === '1'; } catch (e) { /* egal */ }
    $('#installBar').hidden = !can || hidden;
    $('#installCard').hidden = !can;
  }

  function doInstall() {
    if (!installEvt) return;
    var evt = installEvt;
    installEvt = null;
    evt.prompt();
    evt.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') toast('Wird installiert – das Symbol erscheint gleich.');
      installUi();
    }).catch(function () { installUi(); });
  }

  function wireInstall() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      installEvt = e;
      installUi();
    });
    window.addEventListener('appinstalled', function () {
      installEvt = null;
      installUi();
      toast('Hausbau ist installiert.');
    });
    $('#installBtn').addEventListener('click', doInstall);
    $('#installBtn2').addEventListener('click', doInstall);
    $('#installHide').addEventListener('click', function () {
      try { localStorage.setItem(KEY_INSTALL_HIDE, '1'); } catch (e) { /* egal */ }
      installUi();
    });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  function init() {
    loadAll();
    applyTheme();
    wire();
    wireInstall();
    renderAll();
    showView('todos');
    checkReminders();
    scheduleNext();
    registerSW();
    var m = /[?&]todo=([^&]+)/.exec(location.search);
    if (m && findTodo(decodeURIComponent(m[1]))) openTodo(decodeURIComponent(m[1]));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Für Tests
  window.__app = { state: state, moveTodo: moveTodo, checkReminders: checkReminders, openTodo: openTodo };
})();
