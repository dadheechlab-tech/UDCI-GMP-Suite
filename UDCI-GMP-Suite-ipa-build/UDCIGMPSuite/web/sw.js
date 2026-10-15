/* UDCI GMP Suite — offline app shell (PWA over HTTPS). Ignored on file://. */
const CACHE = 'udci-gmp-suite-v26.0.0';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './styles.css',
  './engine.js', './app.js', './boot.js',
  './views/_ui.js', './views/auth.js', './views/dashboard.js', './views/batches.js',
  './views/batch-detail.js', './views/inventory.js', './views/samples.js',
  './views/assays.js', './views/audit.js', './views/users.js', './views/settings.js',
  './icons/udci.png', './icons/suny.png',
  './icons/icon-120.png', './icons/icon-152.png', './icons/icon-167.png',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
