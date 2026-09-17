/* Service Worker — modern caching for The Most Useful Site in the World
   - Cache-first for cards.json, card HTML fragments, and static assets
   - Stale-while-revalidate for tools-index, sitemap, etc.
   - Offline fallback
   - Supports module type (type: 'module' registration) and classic
   - Uses Cache API + Navigation Preload if available
*/

// v3: Inter self-hosted (fonts/ in the precache); precache trimmed —
// tools-index.html and og-tools.png moved to runtime caching (they cost
// ~110 KB of background bandwidth on EVERY install/reactivation, and the
// navigate fallback chain already covers the index offline), './' removed
// as a duplicate of './index.html'.
const CACHE_VERSION = 'v3-2026-09-17';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const CARDS_CACHE = `cards-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
    './index.html',
    './cards/cards-lite.json',
    './cards/cards.json',
    './home-app.js',
    './fonts/inter-latin.woff2',
    './fonts/inter-latin-ext.woff2',
    './risk-notices.js'
];

// Install — precache critical assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(STATIC_CACHE);
            try {
                // Use cache: reload to bypass http cache for fresh install
                await cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' })));
            } catch (e) {
                // Some URLs may 404 in dev — don't fail install
                console.warn('[SW] precache partial fail', e);
                for (const url of PRECACHE_URLS) {
                    try { await cache.add(new Request(url, { cache: 'reload' })); } catch {}
                }
            }
            // Enable navigation preload if available
            if ('navigationPreload' in self.registration) {
                try { await self.registration.navigationPreload.enable(); } catch {}
            }
            self.skipWaiting();
        })()
    );
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys.filter(k => ![STATIC_CACHE, CARDS_CACHE, RUNTIME_CACHE].includes(k))
                    .map(k => caches.delete(k))
            );
            await self.clients.claim();
        })()
    );
});

// Message handler — warm cache on demand
self.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'WARM_CACHE' && Array.isArray(event.data.urls)) {
        event.waitUntil(
            (async () => {
                const cache = await caches.open(RUNTIME_CACHE);
                for (const url of event.data.urls) {
                    try {
                        const req = new Request(url, { credentials: 'same-origin' });
                        const res = await fetch(req);
                        if (res.ok) await cache.put(req, res.clone());
                    } catch {}
                }
            })()
        );
    }
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Only handle same-origin GET
    if (req.method !== 'GET' || url.origin !== self.location.origin) return;

    // Catalogue tiers (lite = grid, full = search) — stale-while-revalidate,
    // always fresh in background. Both must track their deploy or a new tool
    // stays invisible (lite) or its description search miss (full).
    if (url.pathname.endsWith('cards/cards-lite.json') || url.pathname.endsWith('cards/cards.json')) {
        event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
        return;
    }

    // Card fragments: cards/*.html — cache-first, network fallback, cache for 1h
    if (url.pathname.includes('/cards/') && url.pathname.endsWith('.html')) {
        event.respondWith(cacheFirst(req, CARDS_CACHE, 60 * 60 * 1000));
        return;
    }

    // Tool standalone: tool.html?card=*
    if (url.pathname.endsWith('tool.html')) {
        event.respondWith(networkFirst(req, RUNTIME_CACHE));
        return;
    }

    // Static assets: js, css, png, json
    if (/\.(js|css|png|jpg|jpeg|webp|svg|json|woff2?)$/.test(url.pathname)) {
        event.respondWith(cacheFirst(req, RUNTIME_CACHE));
        return;
    }

    // Navigation requests — network first, fallback to cache, then index.html
    if (req.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const preload = await event.preloadResponse;
                    if (preload) return preload;
                    const net = await fetch(req);
                    // Cache successful navigations
                    const cache = await caches.open(RUNTIME_CACHE);
                    cache.put(req, net.clone());
                    return net;
                } catch {
                    const cache = await caches.open(STATIC_CACHE);
                    const cached = await cache.match(req);
                    if (cached) return cached;
                    // Fallback to index
                    const index = await cache.match('./index.html') || await cache.match('/');
                    if (index) return index;
                    return new Response('Offline', { status: 503, statusText: 'Offline' });
                }
            })()
        );
        return;
    }

    // Default: stale-while-revalidate
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
});

async function cacheFirst(request, cacheName, maxAge) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) {
        if (maxAge) {
            const date = cached.headers.get('date');
            if (date) {
                const age = Date.now() - new Date(date).getTime();
                if (age < maxAge) return cached;
            } else {
                // If no date, still return but revalidate in background
                eventRevalidate(request, cache);
                return cached;
            }
        } else {
            return cached;
        }
    }
    try {
        const net = await fetch(request);
        if (net.ok) cache.put(request, net.clone());
        return net;
    } catch {
        return cached || new Response('Offline', { status: 503 });
    }
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const net = await fetch(request);
        if (net.ok) cache.put(request, net.clone());
        return net;
    } catch {
        const cached = await cache.match(request);
        return cached || new Response('Offline', { status: 503 });
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request).then(net => {
        if (net.ok) cache.put(request, net.clone());
        return net;
    }).catch(() => null);
    return cached || (await fetchPromise) || new Response('Offline', { status: 503 });
}

function eventRevalidate(request, cache) {
    // Fire-and-forget revalidation
    fetch(request).then(res => {
        if (res.ok) cache.put(request, res);
    }).catch(()=>{});
}
