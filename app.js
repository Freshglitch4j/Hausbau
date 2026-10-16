/*
 * Hausbau – Oberfläche
 * Daten: localStorage (bleibt auf dem Gerät). Logik ohne DOM steckt in core.js.
 */
(function () {
  'use strict';

  var C = window.HausCore;
  var APP_VERSION = '1.9';
  var KEY_TODOS = 'hausbau.todos.v1';
  var KEY_CONTACTS = 'hausbau.contacts.v1';
  var KEY_NOTES = 'hausbau.notes.v1';      // bis 1.2 – wird zu Personen übernommen
  var KEY_SETTINGS = 'hausbau.settings.v1';
  var NONE = '_none';                       // Filter „ohne Bereich“

  var state = {
    todos: [],          // Reihenfolge im Array = Priorität / Zeitachse
    contacts: [],       // Reihenfolge frei sortierbar
    settings: { theme: 'auto', filter: 'all', peopleFilter: 'all', phases: [] },
    view: 'todos',
    editTodo: null,     // id oder null (= neu)
    newPos: 'bottom',
    editPhase: '',
    editContact: null,
    editContactPhases: [],
    expanded: {}        // aufgeklappte Einträge (nur für diese Sitzung)
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
  function saveContacts() { return save(KEY_CONTACTS, state.contacts); }
  function saveSettings() { return save(KEY_SETTINGS, state.settings); }

  var migratedNotes = 0;
  function loadAll() {
    state.todos = (load(KEY_TODOS, []) || []).map(C.normalizeTodo).filter(Boolean);
    var s = load(KEY_SETTINGS, {}) || {};
    state.settings.theme = ['auto', 'dark', 'light'].indexOf(s.theme) >= 0 ? s.theme : 'auto';
    state.settings.phases = C.normalizePhases(s.phases);
    state.settings.filter = validFilter(s.filter);
    state.settings.peopleFilter = validFilter(s.peopleFilter);

    var contacts = load(KEY_CONTACTS, null);
    state.contacts = (contacts || []).map(C.normalizeContact).filter(Boolean);
    // Ältere Formen (1.3–1.7) einmalig in der neuen Form speichern
    if ((contacts || []).some(function (c) { return c && (!('name' in c) || 'title' in c || !Array.isArray(c.phases)); })) saveContacts();
    // Einmalig: Notizen aus Version 1.2 bei den Personen übernehmen
    var notes = load(KEY_NOTES, null);
    if (Array.isArray(notes) && notes.length) {
      var add = notes.map(C.noteToContact).filter(Boolean);
      state.contacts = state.contacts.concat(add);
      if (saveContacts()) {
        try { localStorage.removeItem(KEY_NOTES); } catch (e) { /* egal */ }
        migratedNotes = add.length;
      }
    }
  }

  function phases() { return state.settings.phases; }
  function phaseOf(t) { return C.findPhase(phases(), t.phase); }

  function contactPhases(c) {
    return c.phases.map(function (id) { return C.findPhase(phases(), id); }).filter(Boolean);
  }

  function validFilter(f) {
    return f === 'all' || f === NONE || C.findPhase(phases(), f) ? f : 'all';
  }

  function findTodo(id) {
    for (var i = 0; i < state.todos.length; i++) if (state.todos[i].id === id) return state.todos[i];
    return null;
  }
  function findContact(id) {
    for (var i = 0; i < state.contacts.length; i++) if (state.contacts[i].id === id) return state.contacts[i];
    return null;
  }

  function openTodos() { return state.todos.filter(function (t) { return !t.done; }); }

  function visibleTodos() {
    var f = state.settings.filter;
    return openTodos().filter(function (t) {
      if (f === 'all') return true;
      if (f === NONE) return !phaseOf(t);
      return t.phase === f;
    });
  }

  function visibleContacts() {
    var f = state.settings.peopleFilter;
    return state.contacts.filter(function (c) {
      if (f === 'all') return true;
      if (f === NONE) return !contactPhases(c).length;
      return c.phases.indexOf(f) >= 0;
    });
  }

  /* ------------------------------------------------------------- Filter */

  // Unauffällig: kleines Trichter-Symbol in der Kopfzeile, Auswahl als kurze
  // Liste. Ein aktiver Filter steht klein unter der Überschrift (× hebt ihn auf).
  var FILTER_KEY = { todos: 'filter', people: 'peopleFilter' };

  function filterLabel(f) {
    return f === NONE ? 'Ohne Bereich' : C.phaseLabel(f, phases());
  }

  function setFilter(kind, f) {
    state.settings[FILTER_KEY[kind]] = validFilter(f);
    saveSettings();
    if (kind === 'todos') renderTodos(); else renderPeople();
  }

  // Unterzeile: Text + ggf. kleiner Hinweis auf den aktiven Filter
  function renderSub(box, text, kind) {
    var f = state.settings[FILTER_KEY[kind]];
    box.textContent = '';
    if (f !== 'all') {
      box.appendChild(el('button', {
        class: 'filter-pill', type: 'button', 'aria-label': 'Filter „' + filterLabel(f) + '“ aufheben',
        onclick: function () { setFilter(kind, 'all'); }
      }, [filterLabel(f) + ' ', el('span', { 'aria-hidden': 'true', text: '×' })]));
      box.appendChild(document.createTextNode(' '));
    }
    box.appendChild(document.createTextNode(text));
    var btn = $('.filterbtn[data-filter="' + kind + '"]');
    btn.classList.toggle('is-on', f !== 'all');
    btn.hidden = !phases().length && f === 'all';
  }

  function openFilterMenu(kind, btn) {
    var menu = $('#filterMenu');
    if (!menu.hidden && menu.dataset.kind === kind) { closeFilterMenu(); return; }
    var current = state.settings[FILTER_KEY[kind]];
    var items = kind === 'todos' ? openTodos() : state.contacts;
    var hasNone = items.some(function (x) { return kind === 'todos' ? !phaseOf(x) : !contactPhases(x).length; });
    var opts = [{ id: 'all', label: 'Alle' }].concat(phases());
    if (hasNone || current === NONE) opts.push({ id: NONE, label: 'Ohne Bereich' });
    menu.textContent = '';
    menu.dataset.kind = kind;
    opts.forEach(function (p) {
      var on = current === p.id;
      menu.appendChild(el('button', {
        type: 'button', class: 'menu-item' + (on ? ' is-on' : ''), role: 'menuitemradio',
        'aria-checked': on ? 'true' : 'false', 'data-phase': p.id,
        onclick: function () { closeFilterMenu(); setFilter(kind, p.id); }
      }, [
        el('span', { class: 'menu-dot' + (p.color ? ' ph-' + p.color : ''), 'aria-hidden': 'true' }),
        el('span', { class: 'menu-label', text: p.label }),
        on ? el('span', { class: 'menu-check', 'aria-hidden': 'true', text: '✓' }) : null
      ]));
    });
    var r = btn.getBoundingClientRect();
    menu.style.top = Math.round(r.bottom + window.scrollY + 6) + 'px';
    menu.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }

  function closeFilterMenu() {
    var menu = $('#filterMenu');
    if (menu.hidden) return;
    menu.hidden = true;
    $$('.filterbtn').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }

  /* ------------------------------------------------------------- Design */

  var darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function applyTheme() {
    var t = state.settings.theme;
    var resolved = t === 'auto' ? (darkMQ && !darkMQ.matches ? 'light' : 'dark') : t;
    document.documentElement.setAttribute('data-theme', resolved);
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'light' ? '#f1efeb' : '#1c4d5c');
    $$('#themeSeg [data-theme-choice]').forEach(function (b) {
      b.setAttribute('aria-checked', b.dataset.themeChoice === t ? 'true' : 'false');
    });
  }

  /* -------------------------------------------------------- Ansichten */

  var VIEW_ORDER = ['todos', 'people'];

  function showView(name, from) {
    closeFilterMenu();
    var prev = state.view;
    state.view = name;
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + name); });
    $$('.tab').forEach(function (b) {
      var on = b.dataset.view === name;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var fab = $('#fab');
    fab.hidden = name === 'more';
    fab.setAttribute('aria-label', name === 'people' ? 'Neue Person' : 'Neues To-do');
    if (name === 'more') renderMore();
    // Beim Wischen gleitet die neue Seite von der passenden Seite herein
    if (from && prev !== name) {
      var v = $('#view-' + name);
      v.classList.remove('slide-l', 'slide-r');
      void v.offsetWidth;
      v.classList.add(from === 'right' ? 'slide-l' : 'slide-r');
    }
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
    renderSub($('#todoSub'), sub, 'todos');
    renderReminders();

    var list = $('#todoList');
    list.textContent = '';
    var vis = visibleTodos();
    vis.forEach(function (t, i) { list.appendChild(todoRow(t, i, vis.length)); });

    var empty = $('#todoEmpty');
    empty.textContent = '';
    if (!state.todos.length) {
      empty.appendChild(el('p', { text: 'Noch keine To-dos.' }));
      empty.appendChild(el('div', { class: 'btnrow btnrow-center' }, [
        el('button', { class: 'btn btn-primary', type: 'button', text: 'To-do anlegen', onclick: function () { openTodo(null); } }),
        el('button', { class: 'btn', type: 'button', text: 'Typische Schritte laden', onclick: addSamples })
      ]));
      empty.hidden = false;
    } else if (!vis.length) {
      empty.appendChild(el('p', { text: state.settings.filter === 'all'
        ? 'Alles erledigt. Stark!'
        : state.settings.filter === NONE ? 'Keine offenen To-dos ohne Bereich.'
          : 'Keine offenen To-dos im Bereich „' + C.phaseLabel(state.settings.filter, phases()) + '“.' }));
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

  function metaParts(t) {
    var now = nowDate();
    var parts = [];
    parts.push(phaseTag(t));
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
      onpointerdown: function (ev) { startDrag(ev, row, $('#todoList'), function (a, b) { moveTodo(a, b); }); },
      oncontextmenu: function (ev) { ev.preventDefault(); }
    }, [el('span', { class: 'rank', text: String(index + 1) }), el('span', { class: 'dots', 'aria-hidden': 'true', text: '⠿' })]));

    row.appendChild(el('button', {
      class: 'check', type: 'button', 'aria-label': '„' + t.title + '“ als erledigt markieren',
      onclick: function () { completeTodo(t.id, row); }
    }, [el('span', { class: 'check-ring', 'aria-hidden': 'true' })]));

    row.appendChild(todoBody(t, row, metaParts(t)));
    return row;
  }

  // Zugeklappt nur der Titel; Antippen zeigt Beschreibung und Details
  function todoBody(t, row, meta) {
    var open = !!state.expanded[t.id];
    var detailId = 'detail-' + t.id;
    var detail = el('div', { class: 'todo-detail', id: detailId }, [
      t.note
        ? el('p', { class: 'todo-desc', text: t.note })
        : el('p', { class: 'todo-desc is-empty', text: 'Keine Beschreibung.' }),
      el('div', { class: 'todo-meta' }, meta),
      el('div', { class: 'detail-actions' }, [
        el('button', { class: 'pill', type: 'button', text: 'Bearbeiten', onclick: function () { openTodo(t.id); } }),
        el('button', { class: 'pill pill-danger', type: 'button', text: 'Löschen', onclick: function () { deleteTodo(t.id); } })
      ])
    ]);
    detail.hidden = !open;
    var head = el('button', {
      class: 'todo-head', type: 'button', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': detailId,
      onclick: function () {
        var now = !state.expanded[t.id];
        if (now) state.expanded[t.id] = true; else delete state.expanded[t.id];
        detail.hidden = !now;
        row.classList.toggle('is-open', now);
        this.setAttribute('aria-expanded', now ? 'true' : 'false');
      }
    }, [
      el('span', { class: 'todo-title', text: t.title }),
      el('span', { class: 'chev', 'aria-hidden': 'true' })
    ]);
    if (open) row.classList.add('is-open');
    return el('div', { class: 'todo-body' }, [head, detail]);
  }

  function doneRow(t) {
    var row = el('div', { class: 'todo-row is-done' });
    row.appendChild(el('button', {
      class: 'check is-checked', type: 'button', 'aria-label': '„' + t.title + '“ wieder öffnen',
      onclick: function () { setDone(t.id, false); toast('Wieder offen.'); }
    }, [el('span', { class: 'check-ring', 'aria-hidden': 'true' })]));
    row.appendChild(todoBody(t, row, [
      phaseTag(t),
      t.doneAt ? el('span', { class: 'meta', text: 'erledigt ' + C.fmtDate(t.doneAt.slice(0, 10)) }) : null
    ]));
    return row;
  }

  function phaseTag(t) {
    var p = phaseOf(t);
    return p ? el('span', { class: 'tag ph-' + p.color, text: p.label }) : null;
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
  function startDrag(ev, row, listBox, onDrop) {
    if (ev.button !== undefined && ev.button !== 0) return;
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
        onDrop(index, target);
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
    var add = C.sampleTodos(nowDate(), phases()).filter(function (t) { return !existing[t.title.toLowerCase()]; });
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
    if (!$('.is-sorting') && !$('.todo-row.is-completing')) renderTodos();
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

  function currentPhase() { return state.editPhase; }

  // Bereichs-Chips im Editor – nochmal antippen hebt die Auswahl auf
  function buildPhaseChips() {
    var box = $('#tPhase');
    box.textContent = '';
    phases().forEach(function (p) {
      box.appendChild(el('button', {
        type: 'button', class: 'chip chip-ph ph-' + p.color, role: 'radio', 'data-phase': p.id, text: p.label,
        onclick: function () { setPhase(state.editPhase === p.id ? '' : p.id); }
      }));
    });
    $('#tPhaseNone').hidden = phases().length > 0;
  }

  function setPhase(id) {
    state.editPhase = C.findPhase(phases(), id) ? id : '';
    $$('#tPhase .chip').forEach(function (b) {
      var on = b.dataset.phase === state.editPhase;
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
    buildPhaseChips();
    setPhase(t ? t.phase : state.settings.filter);
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
    if (state.settings.filter !== 'all' && state.settings.filter !== (phaseOf(t) ? t.phase : NONE)) {
      state.settings.filter = 'all';
      saveSettings();
    }
    closeDialog(true);
    renderTodos();
    scheduleNext();
    if (t.remindAt && remindChanged && notifyPermission() === 'default') askNotify();
    toast('Gespeichert.');
  }

  // Ein Tipp löscht – statt Sicherheitsabfrage gibt es „Rückgängig“
  function deleteTodo(id) {
    var t = findTodo(id);
    if (!t) return;
    var pos = state.todos.indexOf(t);
    state.todos.splice(pos, 1);
    delete state.expanded[t.id];
    saveTodos();
    if (openDialog) closeDialog(true);
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

  /* ---------------------------------------------------------- Personen */

  function renderPeople() {
    var list = $('#contactList');
    list.textContent = '';
    var n = state.contacts.length;
    var vis = visibleContacts();
    renderSub($('#peopleSub'), n === 1 ? '1 Person' : n + ' Personen', 'people');
    $('#peopleEmpty').hidden = vis.length > 0;
    $('#peopleEmptyText').textContent = n ? 'Keine Personen in diesem Bereich.' : 'Noch keine Personen.';
    vis.forEach(function (c, i) { list.appendChild(contactRow(c, i, vis.length)); });
  }

  function contactRow(c, index, total) {
    var row = el('div', { class: 'todo-row contact-row' });
    row.dataset.id = c.id;
    row.appendChild(el('button', {
      class: 'grip', type: 'button',
      'aria-label': '„' + c.name + '“ verschieben, Platz ' + (index + 1) + ' von ' + total + '. Pfeiltasten oder ziehen.',
      onkeydown: function (ev) {
        if (ev.key === 'ArrowUp') { ev.preventDefault(); moveContact(index, index - 1, true); }
        if (ev.key === 'ArrowDown') { ev.preventDefault(); moveContact(index, index + 1, true); }
      },
      onpointerdown: function (ev) { startDrag(ev, row, $('#contactList'), function (a, b) { moveContact(a, b); }); },
      oncontextmenu: function (ev) { ev.preventDefault(); }
    }, [el('span', { class: 'dots', 'aria-hidden': 'true', text: '⠿' })]));

    var open = !!state.expanded[c.id];
    var detailId = 'detail-' + c.id;
    var segs = C.linkify(c.info || '');
    var tags = contactPhases(c).map(function (p) { return el('span', { class: 'tag ph-' + p.color, text: p.label }); });
    var detail = el('div', { class: 'todo-detail', id: detailId }, [
      c.info.trim()
        ? el('p', { class: 'todo-desc' }, segs.map(function (s) {
          return s.type === 'text' ? s.text
            : el('a', { href: s.href, target: s.type === 'url' ? '_blank' : null, rel: s.type === 'url' ? 'noopener' : null, text: s.text });
        }))
        : null,
      tags.length ? el('div', { class: 'todo-meta' }, tags) : null,
      el('div', { class: 'detail-actions' }, [
        el('button', { class: 'pill', type: 'button', text: 'Bearbeiten', onclick: function () { openContact(c.id); } }),
        el('button', { class: 'pill pill-danger', type: 'button', text: 'Löschen', onclick: function () { deleteContact(c.id); } })
      ])
    ]);
    detail.hidden = !open;
    var head = el('button', {
      class: 'todo-head', type: 'button', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': detailId,
      onclick: function () {
        var now = !state.expanded[c.id];
        if (now) state.expanded[c.id] = true; else delete state.expanded[c.id];
        detail.hidden = !now;
        row.classList.toggle('is-open', now);
        this.setAttribute('aria-expanded', now ? 'true' : 'false');
      }
    }, [
      el('span', { class: 'contact-text' }, [
        el('span', { class: 'todo-title', text: c.name }),
        c.role ? el('span', { class: 'contact-role', text: c.role }) : null
      ]),
      el('span', { class: 'chev', 'aria-hidden': 'true' })
    ]);
    if (open) row.classList.add('is-open');
    row.appendChild(el('div', { class: 'todo-body' }, [head, detail]));
    return row;
  }

  function moveContact(from, to, refocus) {
    var vis = visibleContacts();
    if (to < 0 || to >= vis.length || from === to) return;
    var allIds = state.contacts.map(function (c) { return c.id; });
    var visIds = vis.map(function (c) { return c.id; });
    state.contacts = C.orderBy(state.contacts, C.moveWithin(allIds, visIds, from, to));
    saveContacts();
    renderPeople();
    if (refocus) {
      var grips = $$('#contactList .grip');
      if (grips[to]) grips[to].focus();
    }
  }

  // Bereiche einer Person – mehrere möglich, Antippen schaltet um
  function buildContactPhaseChips() {
    var box = $('#cPhase');
    box.textContent = '';
    phases().forEach(function (p) {
      var on = state.editContactPhases.indexOf(p.id) >= 0;
      box.appendChild(el('button', {
        type: 'button', class: 'chip chip-ph ph-' + p.color + (on ? ' is-on' : ''), 'aria-pressed': on ? 'true' : 'false',
        'data-phase': p.id, text: p.label,
        onclick: function () {
          var list = state.editContactPhases;
          var k = list.indexOf(p.id);
          if (k >= 0) list.splice(k, 1); else list.push(p.id);
          buildContactPhaseChips();
        }
      }));
    });
    $('#cPhaseField').hidden = !phases().length;
  }

  var contactSnapshot = '';
  function contactFormValue() {
    return JSON.stringify([$('#cName').value, $('#cRole').value, state.editContactPhases.slice().sort(), $('#cInfo').value]);
  }

  function openContact(id) {
    var c = id ? findContact(id) : null;
    state.editContact = c ? c.id : null;
    $('#contactDlgTitle').textContent = c ? 'Person' : 'Neue Person';
    $('#cName').value = c ? c.name : '';
    $('#cRole').value = c ? c.role : '';
    $('#cInfo').value = c ? c.info : '';
    var f = state.settings.peopleFilter;
    state.editContactPhases = c ? contactPhases(c).map(function (p) { return p.id; })
      : (f !== 'all' && f !== NONE ? [f] : []);
    buildContactPhaseChips();
    $('#cEditOnly').hidden = !c;
    autosize($('#cInfo'));
    contactSnapshot = contactFormValue();
    showDialog($('#contactDlg'), function () { return contactFormValue() !== contactSnapshot; });
    if (!c) setTimeout(function () { $('#cName').focus(); }, 60);
  }

  function saveContactForm() {
    var name = $('#cName').value.trim();
    var role = $('#cRole').value.trim();
    var info = $('#cInfo').value;
    if (!name && !role) {
      toast('Bitte einen Namen eintragen.', { error: true });
      $('#cName').focus();
      return;
    }
    var stamp = new Date().toISOString();
    var data = C.normalizeContact({ name: name, role: role, phases: state.editContactPhases.slice(), info: info, createdAt: stamp, updatedAt: stamp });
    var c = state.editContact ? findContact(state.editContact) : null;
    if (c) {
      if (contactFormValue() !== contactSnapshot) {
        c.name = data.name; c.role = data.role; c.phases = data.phases; c.info = data.info; c.updatedAt = stamp;
      }
    } else {
      c = data;
      state.contacts.push(c);
    }
    if (!saveContacts()) return;
    // Sicherstellen, dass die gespeicherte Person im aktuellen Filter sichtbar ist
    if (visibleContacts().indexOf(c) < 0) { state.settings.peopleFilter = 'all'; saveSettings(); }
    closeDialog(true);
    renderPeople();
    toast('Gespeichert.');
  }

  function deleteContact(id) {
    var c = findContact(id);
    if (!c) return;
    var pos = state.contacts.indexOf(c);
    state.contacts.splice(pos, 1);
    delete state.expanded[c.id];
    saveContacts();
    if (openDialog) closeDialog(true);
    renderPeople();
    toast('Gelöscht.', {
      action: 'Rückgängig',
      onAction: function () {
        state.contacts.splice(Math.min(pos, state.contacts.length), 0, c);
        saveContacts();
        renderPeople();
      }
    });
  }

  /* ---------------------------------------------------------- Bereiche */

  function renderPhases() {
    var box = $('#phaseList');
    box.textContent = '';
    var list = phases();
    list.forEach(function (p, index) {
      var row = el('div', { class: 'phase-row' });
      row.appendChild(el('button', {
        class: 'grip', type: 'button',
        'aria-label': 'Bereich „' + p.label + '“ verschieben. Pfeiltasten oder ziehen.',
        onkeydown: function (ev) {
          if (ev.key === 'ArrowUp') { ev.preventDefault(); movePhase(index, index - 1, true); }
          if (ev.key === 'ArrowDown') { ev.preventDefault(); movePhase(index, index + 1, true); }
        },
        onpointerdown: function (ev) { startDrag(ev, row, box, function (a, b) { movePhase(a, b); }); },
        oncontextmenu: function (ev) { ev.preventDefault(); }
      }, [el('span', { class: 'dots', 'aria-hidden': 'true', text: '⠿' })]));
      row.appendChild(el('button', {
        class: 'color-dot ph-' + p.color, type: 'button', 'aria-label': 'Farbe von „' + p.label + '“ ändern',
        onclick: function () {
          p.color = p.color % C.COLORS + 1;
          savePhases();
        }
      }));
      row.appendChild(el('input', {
        type: 'text', class: 'phase-input', value: p.label, maxlength: '40', 'aria-label': 'Name des Bereichs',
        enterkeyhint: 'done',
        onkeydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); this.blur(); } },
        onchange: function () {
          var v = this.value.trim();
          if (!v) { this.value = p.label; return; }
          p.label = v;
          savePhases(true);
        }
      }));
      row.appendChild(el('button', {
        class: 'phase-del', type: 'button', text: '×', 'aria-label': 'Bereich „' + p.label + '“ löschen',
        onclick: function () { deletePhase(p); }
      }));
      box.appendChild(row);
    });
    if (!list.length) box.appendChild(el('p', { class: 'note-small', text: 'Keine Bereiche – die To-dos stehen dann einfach ohne Bereich in der Liste.' }));
  }

  // keepInputs: beim Umbenennen nicht neu zeichnen, sonst springt der Fokus
  function savePhases(keepInputs) {
    state.settings.filter = validFilter(state.settings.filter);
    state.settings.peopleFilter = validFilter(state.settings.peopleFilter);
    saveSettings();
    if (!keepInputs) renderPhases();
    renderTodos();
    renderPeople();
  }

  function movePhase(from, to, refocus) {
    var list = phases();
    if (to < 0 || to >= list.length || from === to) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    savePhases();
    if (refocus) {
      var grips = $$('#phaseList .grip');
      if (grips[to]) grips[to].focus();
    }
  }

  function addPhase() {
    var list = phases();
    var p = { id: 'b' + C.uid(), label: 'Neuer Bereich', color: C.nextColor(list) };
    list.push(p);
    savePhases();
    var inputs = $$('#phaseList .phase-input');
    var inp = inputs[inputs.length - 1];
    if (inp) { inp.focus(); inp.select(); }
  }

  function deletePhase(p) {
    var n = state.todos.filter(function (t) { return t.phase === p.id; }).length +
      state.contacts.filter(function (c) { return c.phases.indexOf(p.id) >= 0; }).length;
    var msg = '„' + p.label + '“ löschen?';
    if (n) msg += '\n\nZugeordnete To-dos und Personen bleiben erhalten, nur ohne diesen Bereich.';
    if (!confirm(msg)) return;
    var list = phases();
    var pos = list.indexOf(p);
    list.splice(pos, 1);
    savePhases();
    toast('Bereich gelöscht.', {
      action: 'Rückgängig',
      onAction: function () {
        list.splice(Math.min(pos, list.length), 0, p);
        savePhases();
      }
    });
  }

  /* ------------------------------------------------------------- Mehr */

  function renderMore() {
    var p = notifyPermission();
    var status = {
      granted: 'Benachrichtigungen sind erlaubt.',
      denied: 'Benachrichtigungen sind blockiert (Android-Einstellungen → Apps → Hausbau).',
      'default': 'Benachrichtigungen sind noch nicht erlaubt.',
      unsupported: 'Erinnerungen erscheinen nur in der App.'
    }[p];
    $('#notifyStatus').textContent = status;
    $('#notifyBtn').hidden = p !== 'default';
    renderPhases();
    $('#versionInfo').textContent = 'Hausbau ' + APP_VERSION + ' · ' + state.todos.length + ' To-dos · ' +
      state.contacts.length + ' Personen · alles lokal gespeichert';
  }

  function exportData() {
    var data = C.makeBackup(state.todos, state.contacts, phases());
    downloadFile('hausbau-sicherung-' + C.isoDate(nowDate()) + '.json', JSON.stringify(data, null, 2), 'application/json');
    toast('Sicherung gespeichert (Ordner „Downloads“).');
  }

  function importData(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = C.parseBackup(String(reader.result)); } catch (e) { toast(e.message, { error: true }); return; }
      if (!confirm('Sicherung mit ' + data.todos.length + ' To-dos und ' + data.contacts.length +
        ' Personen laden? Die aktuellen Daten auf diesem Handy werden dabei ersetzt.')) return;
      state.todos = data.todos;
      state.contacts = data.contacts;
      if (data.phases) state.settings.phases = data.phases;
      state.settings.filter = validFilter(state.settings.filter);
      state.settings.peopleFilter = validFilter(state.settings.peopleFilter);
      saveTodos(); saveContacts(); saveSettings();
      renderAll();
      toast('Sicherung geladen.');
    };
    reader.onerror = function () { toast('Die Datei konnte nicht gelesen werden.', { error: true }); };
    reader.readAsText(file);
  }

  function wipe() {
    if (!confirm('Wirklich alle To-dos und Personen löschen? Das lässt sich nicht rückgängig machen.')) return;
    state.todos = [];
    state.contacts = [];
    saveTodos(); saveContacts();
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
    renderPeople();
    renderMore();
  }

  /* ---------------------------------------------------------- Verkabeln */

  function wire() {
    $$('.tab').forEach(function (b) { b.addEventListener('click', function () { showView(b.dataset.view); }); });
    $('#fab').addEventListener('click', function () {
      if (state.view === 'people') openContact(null); else openTodo(null);
    });
    $$('[data-action="new-contact"]').forEach(function (b) { b.addEventListener('click', function () { openContact(null); }); });
    $$('#tPos [data-pos]').forEach(function (b) { b.addEventListener('click', function () { setPos(b.dataset.pos); }); });

    $('#todoForm').addEventListener('submit', function (ev) { ev.preventDefault(); saveTodoForm(); });
    $('#contactForm').addEventListener('submit', function (ev) { ev.preventDefault(); saveContactForm(); });
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
    $('#cInfo').addEventListener('input', function () { autosize(this); });

    $('#tGcal').addEventListener('click', function () {
      var f = formTodo();
      var url = C.gcalUrl(f, C.phaseLabel(f.phase, phases()));
      if (url) window.open(url, '_blank', 'noopener');
    });
    $('#tIcs').addEventListener('click', function () {
      var f = formTodo();
      var ics = C.icsText(f, nowDate(), C.phaseLabel(f.phase, phases()));
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
    $('#tDelete').addEventListener('click', function () { deleteTodo(state.editTodo); });
    $('#cDelete').addEventListener('click', function () { deleteContact(state.editContact); });

    // Filter
    $$('.filterbtn').forEach(function (b) {
      b.setAttribute('aria-haspopup', 'menu');
      b.addEventListener('click', function (ev) { ev.stopPropagation(); openFilterMenu(b.dataset.filter, b); });
    });
    document.addEventListener('click', function (ev) {
      if (!$('#filterMenu').hidden && !ev.target.closest('#filterMenu')) closeFilterMenu();
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeFilterMenu(); });

    wireSwipe();
    $('#phaseAdd').addEventListener('click', addPhase);

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

  /* ------------------------------------------------------------ Wischen */

  // Seitlich wischen wechselt zwischen To-dos und Personen
  function wireSwipe() {
    var start = null;
    var BLOCK = '.grip, input, textarea, select, dialog, .menu, .phase-list, .toast';
    document.addEventListener('touchstart', function (ev) {
      start = null;
      if (ev.touches.length !== 1 || openDialog || ev.target.closest(BLOCK)) return;
      if (VIEW_ORDER.indexOf(state.view) < 0) return;
      var t = ev.touches[0];
      start = { x: t.clientX, y: t.clientY, at: Date.now() };
    }, { passive: true });
    document.addEventListener('touchend', function (ev) {
      if (!start || $('.is-sorting')) { start = null; return; }
      var t = ev.changedTouches[0];
      var dx = t.clientX - start.x;
      var dy = t.clientY - start.y;
      var quick = Date.now() - start.at < 800;
      start = null;
      if (!quick || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      var i = VIEW_ORDER.indexOf(state.view);
      var next = VIEW_ORDER[i + (dx < 0 ? 1 : -1)];
      if (next) showView(next, dx < 0 ? 'right' : 'left');
    }, { passive: true });
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
    if (migratedNotes) toast('Deine Notizen stehen jetzt unter „Personen“.');
    var m = /[?&]todo=([^&]+)/.exec(location.search);
    if (m && findTodo(decodeURIComponent(m[1]))) openTodo(decodeURIComponent(m[1]));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Für Tests
  window.__app = { state: state, moveTodo: moveTodo, checkReminders: checkReminders, openTodo: openTodo, openContact: openContact };
})();
