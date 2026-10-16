/* Service Worker – macht die App vollständig offline nutzbar.
   Bei jeder Code-Änderung VERSION erhöhen UND in index.html dieselbe Zahl bei
   ?v= eintragen (styles.css, core.js, app.js). Die Versionsnummer in der
   Adresse sorgt dafür, dass nie eine alte app.js zu einer neuen Seite geladen
   wird – auch nicht von einem noch laufenden alten Service Worker. */
const VERSION = 'hausbau-v8';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './core.js',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];
const NET_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(
        // 'reload' erzwingt frische Dateien vom Server statt aus dem Browser-Cache
        ASSETS.map((url) => new Request(url, { cache: 'reload' }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Erst das Netz (immer aktuell, alle Dateien aus demselben Stand), bei
// fehlendem oder sehr langsamem Netz der Zwischenspeicher (offline).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const fromCache = () => (req.mode === 'navigate'
    ? caches.match('./index.html').then((r) => r || caches.match('./'))
    : caches.match(req, { ignoreSearch: true }));

  event.respondWith(new Promise((resolve) => {
    let done = false;
    const finish = (res) => { if (!done && res) { done = true; resolve(res); } };
    const timer = setTimeout(() => fromCache().then(finish), NET_TIMEOUT);
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        clearTimeout(timer);
        if (res && res.status === 200) {
          const copy = res.clone();
          const key = req.mode === 'navigate' ? './index.html' : url.pathname.replace(/^.*\//, './');
          caches.open(VERSION).then((c) => c.put(key, copy));
        }
        if (done) return;
        if (res && res.ok) finish(res);
        else fromCache().then((c) => { if (!done) { done = true; resolve(c || res); } });
      })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then((c) => { if (!done) { done = true; resolve(c || Response.error()); } });
      });
  }));
});

// Tippen auf eine Erinnerung: App nach vorne holen und das To-do öffnen
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.id;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'open-todo', id });
          return client.focus();
        }
      }
      return self.clients.openWindow('./' + (id ? '?todo=' + encodeURIComponent(id) : ''));
    })
  );
});
