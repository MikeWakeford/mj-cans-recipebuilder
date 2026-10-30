// Service worker: lets the app be installed and open when there is no connection.
// Registered by js/ui/install.js. tools/bundle.py stamps VERSION with the build time, so every new build is picked up.
//
// Strategy: the app's own files (same site) are fetched from the network first, so a new build shows up as soon as the
// device is online, and the last copy is kept to open from when it isn't. Everything else (the Firebase database, fonts)
// is not touched here. The recipes themselves are kept offline by the database's own cache, not by this file.
const VERSION = '2026-10-30.104601';
const CACHE = 'mj-cans-' + VERSION;
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const NETWORK_WAIT_MS = 5000;  // on a poor connection, open the saved copy rather than wait longer than this

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(CORE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mj-cans-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const saved = () => cache.match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === 'navigate' ? cache.match('./').then((h) => h || cache.match('index.html')) : undefined));
  try {
    const res = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('slow')), NETWORK_WAIT_MS);
      fetch(req, { cache: 'no-cache' }).then((r) => { clearTimeout(timer); resolve(r); }, (e) => { clearTimeout(timer); reject(e); });
    });
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await saved();
    if (hit) return hit;
    return Response.error();
  }
}
