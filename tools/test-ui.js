/* Oberflächen-Tests im echten Chromium (Handygröße Galaxy A55).
   Aufruf: NODE_PATH=$(npm root -g) node tools/test-ui.js [screenshot-ordner] */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) pass++; else { fail++; console.log('✗ ' + name + (extra ? '  → ' + extra : '')); }
}

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    }).listen(0, () => resolve(srv));
  });
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}

const titles = (page) => page.$$eval('#todoList .todo-title', (els) => els.map((e) => e.textContent));

// Zieht am Griff der Zeile `from` so weit, bis sie über Zeile `to` liegt
async function drag(page, from, to) {
  const grips = await page.$$('#todoList .grip');
  const a = await grips[from].boundingBox();
  const rows = await page.$$('#todoList .todo-row');
  const b = await rows[to].boundingBox();
  const x = a.x + a.width / 2, y = a.y + a.height / 2;
  const ty = b.y + b.height / 2 + (to > from ? 6 : -6);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x, y + (ty - y) * i / 12);
  await page.mouse.up();
  await page.waitForTimeout(50);
}

(async () => {
  const srv = await serve();
  const url = 'http://localhost:' + srv.address().port + '/';
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, colorScheme: 'dark', locale: 'de-DE' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.clock.install({ time: new Date('2026-10-14T10:30:00') });
  await page.goto(url);

  // Leerer Start
  ok(await page.isVisible('#todoEmpty'), 'Willkommen sichtbar');
  await shot(page, '01-leer');

  // Vorlage laden
  await page.click('#todoEmpty .btn:not(.btn-primary)');
  let t = await titles(page);
  ok(t.length >= 15, 'Vorlage geladen', t.length);
  ok(await page.$eval('#todoList .todo-row', (r) => r.classList.contains('is-next')), 'erste Zeile ist „Als Nächstes“');

  // Ziehen: Zeile 3 nach oben
  const third = t[2];
  await drag(page, 2, 0);
  t = await titles(page);
  ok(t[0] === third, 'Ziehen nach oben', t.slice(0, 3).join(' | '));
  // Ziehen: oberste Zeile auf Platz 4
  const first = t[0];
  await drag(page, 0, 3);
  t = await titles(page);
  ok(t[3] === first, 'Ziehen nach unten', t.slice(0, 5).join(' | '));

  // Filter + Ziehen im Filter
  await page.click('#phaseChips [data-phase="bau"]');
  let bau = await titles(page);
  ok(bau.length === 3, 'Filter Bau', bau.length);
  await drag(page, 2, 0);
  bau = await titles(page);
  ok(bau[0] === 'Endabnahme mit Mängelprotokoll', 'Ziehen im Filter', bau.join(' | '));
  await page.click('#phaseChips [data-phase="all"]');
  const all = await titles(page);
  ok(all.indexOf('Endabnahme mit Mängelprotokoll') < all.indexOf('Rohbauabnahme'), 'Filter-Reihenfolge in Gesamtliste übernommen');
  ok(all[all.length - 1] === 'Erdarbeiten und Fundament / Bodenplatte' || all.length === 18, 'Gesamtliste vollständig', all.length);

  // Neues To-do ganz oben mit vergangener Erinnerung
  await page.click('#fab');
  await page.fill('#tTitle', 'Termin beim Notar');
  await page.click('#tPhase [data-phase="behoerden"]');
  await page.click('#tPos [data-pos="top"]');
  await page.fill('#tDue', '2026-10-16');
  await page.fill('#tRemind', '2026-10-14T09:00');
  await page.fill('#tNote', 'Unterlagen: Ausweis, Kaufvertrag-Entwurf');
  ok(await page.isVisible('#tCal'), 'Kalender-Knöpfe sichtbar');
  await shot(page, '03-editor');
  await page.click('#todoForm button[type="submit"]');
  t = await titles(page);
  ok(t[0] === 'Termin beim Notar', 'neues To-do ganz oben', t[0]);
  ok(await page.isVisible('.reminder'), 'Erinnerung wird angezeigt');

  // Zugeklappt nur der Titel, Antippen zeigt die Beschreibung
  ok(!(await page.isVisible('#todoList .todo-row:first-child .todo-desc')), 'Beschreibung zugeklappt verborgen');
  const h0 = (await (await page.$('#todoList .todo-row:first-child')).boundingBox()).height;
  ok(h0 < 60, 'zugeklappter Block ist schmal', h0);
  await page.click('#todoList .todo-row:first-child .todo-head');
  ok((await page.textContent('#todoList .todo-row:first-child .todo-desc')) === 'Unterlagen: Ausweis, Kaufvertrag-Entwurf', 'Antippen zeigt Beschreibung');
  await page.waitForTimeout(300);
  await shot(page, '02b-aufgeklappt');
  await page.click('#todoList .todo-row:first-child .todo-head');
  ok(!(await page.isVisible('#todoList .todo-row:first-child .todo-desc')), 'nochmal Antippen klappt zu');
  // Bearbeiten aus dem aufgeklappten Block
  await page.click('#todoList .todo-row:first-child .todo-head');
  await page.click('#todoList .todo-row:first-child .detail-actions .pill');
  ok((await page.inputValue('#tTitle')) === 'Termin beim Notar' && (await page.inputValue('#tNote')).startsWith('Unterlagen'), 'Bearbeiten öffnet Editor mit Titel und Beschreibung');
  await page.click('#todoDlg [data-close]');
  await page.click('#todoList .todo-row:first-child .todo-head');
  await shot(page, '02-liste');

  // Erinnerung wegklicken
  await page.click('.reminder .pill:has-text("OK")');
  ok(!(await page.isVisible('.reminder')), 'Erinnerung quittiert');

  // Abhaken + Rückgängig
  await page.click('#todoList .todo-row:first-child .check');
  await page.waitForTimeout(400);
  t = await titles(page);
  ok(t[0] !== 'Termin beim Notar', 'abgehakt');
  ok(await page.isVisible('#doneBox'), 'Erledigt-Bereich');
  await page.click('#toastAction');
  t = await titles(page);
  ok(t[0] === 'Termin beim Notar', 'Rückgängig stellt Position wieder her');

  // Erinnerung in der Zukunft feuert, wenn die Zeit erreicht ist
  await page.click('#todoList .todo-row:nth-child(2) .todo-head');
  await page.click('#todoList .todo-row:nth-child(2) .detail-actions .pill');
  await page.click('[data-quick="tonight"]');
  await page.click('#todoForm button[type="submit"]');
  ok(!(await page.isVisible('.reminder')), 'zukünftige Erinnerung noch nicht sichtbar');
  await page.clock.fastForward('09:00:00');
  await page.waitForTimeout(100);
  ok(await page.isVisible('.reminder'), 'Erinnerung erscheint zur Zeit');

  // Personen
  await page.click('.tab[data-view="people"]');
  ok(await page.isVisible('#peopleEmpty'), 'Personen leer');
  await page.click('#fab');
  await page.fill('#cRole', 'Architekt');
  await page.fill('#cName', 'Alois Huber');
  await page.fill('#cInfo', 'Tel. 0664 123 45 67\nalois@huber-arch.at\nBüro: Hauptstraße 5\nMag es kurz und knapp.');
  await page.click('#contactForm button[type="submit"]');
  await page.click('#fab');
  await page.fill('#cRole', 'Bankberaterin');
  await page.fill('#cName', 'Maria Gruber');
  await page.click('#contactForm button[type="submit"]');
  const people = () => page.$$eval('#contactList .todo-title', (els) => els.map((e) => e.textContent));
  ok(JSON.stringify(await people()) === JSON.stringify(['Alois Huber', 'Maria Gruber']), 'Personen angelegt', (await people()).join(' | '));
  ok((await page.textContent('#contactList .contact-role')) === 'Architekt', 'Funktion sichtbar');
  ok(!(await page.isVisible('#contactList .todo-desc')), 'Beschreibung zugeklappt verborgen');
  await page.click('#contactList .todo-row:first-child .todo-head');
  ok(await page.isVisible('#contactList .todo-row:first-child .todo-desc'), 'Antippen zeigt Beschreibung');
  ok((await page.getAttribute('#contactList .todo-desc a[href^="tel:"]', 'href')) === 'tel:06641234567', 'Telefon antippbar');
  ok((await page.getAttribute('#contactList .todo-desc a[href^="mailto:"]', 'href')) === 'mailto:alois@huber-arch.at', 'E-Mail antippbar');
  ok(await page.isVisible('#contactList .detail-actions a:has-text("Anrufen")'), 'Anrufen-Knopf');
  await page.waitForTimeout(300);
  await shot(page, '04-personen');
  // Umsortieren
  await page.click('#contactList .todo-row:first-child .todo-head');
  const cg = await page.$$('#contactList .grip');
  const ca = await cg[1].boundingBox();
  const cb = await (await page.$('#contactList .todo-row:first-child')).boundingBox();
  await page.mouse.move(ca.x + ca.width / 2, ca.y + ca.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(ca.x + ca.width / 2, ca.y + ca.height / 2 + (cb.y + 5 - ca.y - ca.height / 2) * i / 10);
  await page.mouse.up();
  ok((await people())[0] === 'Maria Gruber', 'Personen umsortieren');

  // Abbrechen mit Änderungen fragt nach (Dialog wird automatisch bestätigt)
  await page.click('#contactList .todo-row:first-child .todo-head');
  await page.click('#contactList .todo-row:first-child .detail-actions .pill:has-text("Bearbeiten")');
  await page.fill('#cName', 'geändert');
  await page.click('#contactDlg [data-close]');
  ok(!(await page.isVisible('#contactDlg')), 'Abbrechen schließt Dialog');
  ok((await people())[0] === 'Maria Gruber', 'Abbrechen verwirft Änderung');

  // Bereiche selbst festlegen
  await page.click('.tab[data-view="more"]');
  const phaseNames = () => page.$$eval('#phaseList .phase-input', (els) => els.map((e) => e.value));
  ok((await phaseNames()).length === 6, 'Vorgabe-Bereiche');
  await page.fill('#phaseList .phase-row:nth-child(4) .phase-input', 'Rohbau');
  await page.press('#phaseList .phase-row:nth-child(4) .phase-input', 'Enter');
  await page.click('#phaseAdd');
  await page.keyboard.type('Garten');
  await page.keyboard.press('Enter');
  ok((await phaseNames()).slice(-1)[0] === 'Garten', 'Bereich hinzugefügt');
  await page.click('#phaseList .phase-row:nth-child(3) .phase-del');  // Behörden (hat To-dos)
  ok(!(await phaseNames()).includes('Behörden'), 'Bereich gelöscht');
  await page.click('#phaseList .phase-row:first-child .color-dot');
  await shot(page, '05b-bereiche');
  await page.click('.tab[data-view="todos"]');
  const chipNames = await page.$$eval('#phaseChips .chip', (els) => els.map((e) => e.firstChild.textContent));
  ok(chipNames.includes('Rohbau') && chipNames.includes('Garten') && !chipNames.includes('Bau'), 'Filter-Chips folgen den Bereichen', chipNames.join(','));
  ok(chipNames.includes('Ohne Bereich'), 'Chip „Ohne Bereich“ für To-dos des gelöschten Bereichs');
  await page.click('#phaseChips .chip:has-text("Ohne Bereich")');
  ok((await titles(page)).includes('Termin beim Notar'), 'To-do des gelöschten Bereichs bleibt erhalten');
  await page.click('#phaseChips [data-phase="all"]');
  await page.click('#fab');
  ok((await page.$$eval('#tPhase .chip', (els) => els.map((e) => e.textContent))).includes('Garten'), 'Editor zeigt eigene Bereiche');
  await page.click('#tPhase .chip:has-text("Garten")');
  await page.click('#tPhase .chip:has-text("Garten")');
  ok(!(await page.$('#tPhase .chip.is-on')), 'Bereich abwählbar');
  await page.click('#todoDlg [data-close]');

  // Mehr / hell
  await page.click('.tab[data-view="more"]');
  await page.click('[data-theme-choice="light"]');
  ok((await page.getAttribute('html', 'data-theme')) === 'light', 'helles Design');
  await shot(page, '05-mehr-hell');
  await page.click('.tab[data-view="todos"]');
  await shot(page, '06-liste-hell');

  // Neu laden: alles bleibt
  const before = await titles(page);
  await page.reload();
  ok(JSON.stringify(await titles(page)) === JSON.stringify(before), 'Reihenfolge bleibt nach Neustart');
  ok((await page.getAttribute('html', 'data-theme')) === 'light', 'Design bleibt nach Neustart');

  // Installieren-Knopf: erscheint erst, wenn Chrome die Installation anbietet
  ok(!(await page.isVisible('#installBar')), 'Installieren-Leiste anfangs verborgen');
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt');
    e.prompt = () => { window.__prompted = true; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  ok(await page.isVisible('#installBar'), 'Installieren-Leiste sichtbar');
  await shot(page, '07-installieren');
  await page.click('#installBtn');
  ok(await page.evaluate(() => window.__prompted === true), 'Installieren ruft Chrome-Dialog auf');
  await page.waitForTimeout(50);
  ok(!(await page.isVisible('#installBar')), 'Leiste nach dem Installieren weg');

  // Umzug: Notizen aus Version 1.2 landen bei den Personen
  const page2 = await ctx.newPage();
  page2.on('pageerror', (e) => errors.push(e.message));
  await page2.addInitScript(() => {
    if (!localStorage.getItem('seeded')) {
      localStorage.clear();
      localStorage.setItem('seeded', '1');
      localStorage.setItem('hausbau.notes.v1', JSON.stringify([{ id: 'n1', title: '', text: 'Fragen an den Architekten\nWärmepumpe?', createdAt: '2026-10-10T10:00:00Z' }]));
    }
  });
  await page2.goto(url);
  await page2.click('.tab[data-view="people"]');
  ok((await page2.textContent('#contactList .todo-title')) === 'Fragen an den Architekten', 'alte Notiz übernommen');
  ok(await page2.evaluate(() => localStorage.getItem('hausbau.notes.v1') === null), 'alte Notizen aufgeräumt');

  ok(!errors.length, 'keine JS-Fehler', errors.join(' / '));
  await browser.close();
  srv.close();
  console.log(fail ? '\n' + fail + ' Fehler, ' + pass + ' ok' : 'Alle ' + pass + ' UI-Tests ok');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
