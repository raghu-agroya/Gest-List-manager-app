// Offline shell for gate staff: network first, cached copy if the network is down or slow.
// Firestore/Auth traffic is never touched (Firestore keeps its own offline cache).
const CACHE = 'sundowner-v4';
const SHELL = ['/', '/index.html', '/app.js', '/pass.js', '/config.js', '/style.css', '/manifest.json', '/book.html', '/book.js'];
const ORIGINS = [self.location.origin, 'https://www.gstatic.com', 'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!ORIGINS.includes(url.origin) || url.pathname.startsWith('/__/')) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    });
    // Give the network 4 s, then fall back to the cached copy if there is one.
    network.catch(() => {}); // a late failure after falling back to cache is fine
    const timeout = new Promise(r => setTimeout(r, 4000));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
      const cached = await cache.match(req, {ignoreSearch: true});
      return cached || await network;
    } catch {
      const cached = await cache.match(req, {ignoreSearch: true})
        || (req.mode === 'navigate' && await cache.match('/'));
      return cached || Response.error();
    }
  })());
});
