const CACHE = 'fingr-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/notes.js',
  '/js/scales.js',
  '/js/audio.js',
  '/js/staff.js',
  '/js/ui.js',
  '/js/app.js',
  '/icons/icon.svg',
];

const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isCDN = CDN_HOSTS.some(h => url.hostname.includes(h));

  if (isCDN) {
    // Network-first for fonts/CDN — cache on success for offline use
    e.respondWith(
      caches.open(CACHE).then(cache =>
        fetch(e.request)
          .then(response => { cache.put(e.request, response.clone()); return response; })
          .catch(() => caches.match(e.request))
      )
    );
  } else {
    // Cache-first for all app assets
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
