const CACHE_NAME = 'mrprophecy-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/mrprophecypic.jpg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Orbitron:wght@400;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
