const CACHE = 'fingr-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/notes.js',
  '/js/scales.js',
  '/js/audio.js',
  '/js/metronome.js',
  '/js/staff.js',
  '/js/ui.js',
  '/js/app.js',
  '/icons/icon.svg',
  '/icons/icon-57.png',
  '/icons/icon-60.png',
  '/icons/icon-72.png',
  '/icons/icon-76.png',
  '/icons/icon-114.png',
  '/icons/icon-120.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-167.png',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/splash-iphone-se.png',
  '/icons/splash-iphone-8.png',
  '/icons/splash-iphone-8plus.png',
  '/icons/splash-iphone-x.png',
  '/icons/splash-iphone-xr.png',
  '/icons/splash-iphone-12.png',
  '/icons/splash-iphone-12max.png',
  '/icons/splash-iphone-14pro.png',
  '/icons/splash-iphone-14promax.png',
  '/icons/splash-ipad.png',
  '/icons/splash-ipad-pro11.png',
  '/icons/splash-ipad-pro12.png',
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
    e.respondWith(
      caches.open(CACHE).then(cache =>
        fetch(e.request)
          .then(response => { cache.put(e.request, response.clone()); return response; })
          .catch(() => caches.match(e.request))
      )
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
