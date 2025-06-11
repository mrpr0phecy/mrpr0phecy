const CACHE_NAME = 'mrprophecy-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/mrprophecypic-low.jpg',
  '/mrprophecypic-high.jpg',
  '/fonts/neuropol.woff2',
  '/fonts/neuropol.woff',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Exo+2:wght@400;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
