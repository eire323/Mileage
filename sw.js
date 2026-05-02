// Dublin Fuels Mileage — Service Worker
// Cache-first for the app shell, network-first for everything else.
// Bump CACHE_VERSION whenever you change the HTML or manifest so users get the update.

const CACHE_VERSION = 'df-mileage-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Critical CDN assets cached on install
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Don't fail install if individual assets fail (CDN hiccups happen)
      return Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn('SW: skip cache for', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache live API calls — these need to be fresh and may need auth headers
  const liveAPIs = [
    'nominatim.openstreetmap.org',
    'router.project-osrm.org',
    'places.googleapis.com',
    'maps.googleapis.com'
  ];
  if (liveAPIs.some((host) => url.hostname.includes(host))) {
    return; // let the browser handle it normally
  }

  // App shell: cache-first, fall back to network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Cache successful responses for next time (skip opaque/error responses)
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => {
        // If the network fails and we have nothing cached, just let it fail
        return cached;
      });
    })
  );
});
