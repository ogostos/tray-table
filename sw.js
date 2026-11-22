// Tray Table service worker — cache everything, serve offline.
const CACHE = 'tray-table-f081087687';
const FILES = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    // network first for the page (picks up new versions), cached copy when offline
    const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); } return res; });
    const timeout = new Promise((r) => setTimeout(r, 2500)).then(() => caches.match('./index.html', { ignoreSearch: true }));
    e.respondWith(Promise.race([net.catch(() => caches.match('./index.html', { ignoreSearch: true })), timeout]).then((r) => r || net));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && new URL(req.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
