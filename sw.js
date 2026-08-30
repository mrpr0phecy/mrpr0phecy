/* MrProphecy service worker
 *
 * NOTE: this worker is currently not registered by any page. It is kept
 * correct so that enabling it is a one-line change and cannot break the site.
 *
 * Strategy:
 *   - HTML / navigation  -> network-first, cache as fallback (offline only).
 *     Cache-first on HTML is what makes a site serve stale pages after a
 *     deploy; never do it here.
 *   - Static assets      -> stale-while-revalidate.
 * Bump CACHE_NAME on any change to force old caches out.
 */
const CACHE_NAME = 'mrprophecy-cache-v3';

// Only precache URLs that are guaranteed to exist. cache.addAll() is atomic:
// a single 404 rejects the whole install and the worker never activates.
const PRECACHE = [
  '/',
  '/index.html',
  '/listen.html',
  '/music.html',
  '/mrprophecypic.jpg',
  '/logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // Add individually so one missing file cannot abort the install.
      .then(cache => Promise.all(
        PRECACHE.map(url => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Never touch non-GET or cross-origin (YouTube, CDNs) requests.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Network-first: always try for fresh HTML, fall back to cache offline.
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Static assets: serve cached copy immediately, refresh in the background.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
