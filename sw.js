const CACHE = 'glcrm-v6';
const OLD_CACHES = ['glcrm-v1','glcrm-v2','glcrm-v3','glcrm-v4','glcrm-v5'];
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
];
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
      .then(() => caches.keys().then(keys => Promise.all(
        keys.filter(k => OLD_CACHES.includes(k)).map(k => caches.delete(k))
      )))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(r => {
      if (r) {
        fetch(req).then(resp => {
          if (resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
        }).catch(() => {});
        return r;
      }
      return fetch(req).then(res => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
