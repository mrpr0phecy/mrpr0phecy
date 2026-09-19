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
// v4: first-party JS/JSON are stale-while-revalidate, not cache-first.
// Cache-first with no expiry pinned home-app.js (and risk-notices.js) to
// whatever version a visitor first saw: every later deploy shipped a new
// index.html against the OLD app script until someone bumped this
// constant — tools "went missing" for returning visitors while the site
// looked fine in a fresh profile. Card fragments are stale-while-revalidate
// too (instant from cache, refreshed for next time). The full 548 KB
// cards.json left the precache: the page already downloads it once at low
// priority and the fetch handler caches that copy, so precaching it (with
// cache:'reload', bypassing the HTTP cache) was a second full download on
// every install.
// v5: ships the catalogue-watchdog home-app.js (a stalled fast-path fetch can
// no longer freeze the grid on the first screen) and the precache trim:
// tools-index.html and og-tools.png moved to runtime caching (they cost
// ~110 KB of background bandwidth on EVERY install/reactivation, and the
// navigate fallback chain already covers the index offline), './' removed as
// a duplicate of './index.html'.
// Still v5: "stale while revalidate" meant a returning visitor rendered the
// PREVIOUS catalogue on their first visit after a deploy — every tool added
// since their last visit was simply absent from the grid until they came back
// a second time. The catalogue, card fragments and first-party code now use
// freshFast(): the cached copy may answer instantly only while it is inside
// GitHub Pages' own 10-minute freshness window, and after that the network
// decides, with the cached copy as a safety net if the network is slow or gone.
// Nobody runs yesterday's tool list any more, and repeat visits inside the
// window are served from cache with no request at all.
// v6: ships card faces (zero loading screens) plus the idle trickle loader, and
// the main page's 118 KB inline stylesheet becomes two cached files (home.css
// render-blocking, home-deferred.css applied after the first paint). Navigation
// responses are network-first so the HTML is always fresh, but JS is
// stale-while-revalidate — without a version bump a returning visitor's first
// paint could pair the new HTML with the previous JS.
// v7: the app is split. The first screen no longer contains the panels, the
// toolbox, the maximise modal or the directory view — those live in
// home-features.js and are fetched at idle — so a version bump is what makes
// returning visitors pick the new pair up. The page's own files (both
// stylesheets, both scripts, risk-notices.js) are also precached into
// STATIC_CACHE now, without cache:'reload' and served from there: before this,
// a first visit followed by an offline visit rendered an unstyled page with no
// cards. Every one of those URLs carries a ?v= derived from this constant, so a
// deploy is a new URL and a stale entry is impossible.
const CACHE_VERSION = 'v13-2026-09-19';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const CARDS_CACHE = `cards-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// Only what the fetch handler serves out of STATIC_CACHE: index.html (the
// offline navigation fallback) and the lite catalogue (the grid). Anything
// else cached here would never be read — the handler would keep serving the
// RUNTIME_CACHE copy — and precaching it costs a second download per install.
//
// These two are fetched with cache:'reload', so they are always a fresh
// download at install time.
const PRECACHE_URLS = [
    './index.html',
    './cards/cards-lite.json'
];

// The page's own code and stylesheets — including home-features.js, which
// home-app.js fetches at idle (it is the on-demand UI: panels, toolbox, modal,
// directory view) — cached in the same store the fetch handler serves them
// from, WITHOUT cache:'reload'. They are the reason a
// first visit followed by an offline visit used to render an unstyled page
// with no cards: the browser fetched them before the worker controlled the
// page, so nothing had stored them for the worker to serve.
//
// Two details make this free rather than another ~260 KB per install:
//   * the URLs carry ?v=, derived from CACHE_VERSION, so a new deploy is a new
//     URL — there is no such thing as a stale entry under them, which is the
//     only reason cache:'reload' exists above; and
//   * because the URL is fresh, the browser's HTTP cache cannot hold a wrong
//     copy either, so the precache reuses the response the page just fetched
//     instead of downloading it a second time.
// Bump CACHE_VERSION (and the ?v= with it — scripts/check-critical-css.py
// compares the two) or a deploy serves the previous version's code.
const PAGE_VERSION = CACHE_VERSION.split('-')[0].replace(/^v/, '');
const PRECACHE_ASSETS = [
    `./home.css?v=${PAGE_VERSION}`,
    `./home-deferred.css?v=${PAGE_VERSION}`,
    `./home-app.js?v=${PAGE_VERSION}`,
    `./home-features.js?v=${PAGE_VERSION}`,
    `./risk-notices.js?v=${PAGE_VERSION}`
];
// Pathnames the handler must serve from STATIC_CACHE, where they are precached.
const PAGE_ASSET_PATHS = ['/home.css', '/home-deferred.css', '/home-app.js',
                          '/home-features.js', '/risk-notices.js'];

// GitHub Pages serves max-age=600, so a copy younger than this is exactly as
// fresh as the browser's own HTTP cache entry.
const FRESH_WINDOW_MS = 10 * 60 * 1000;
// If the network has not answered by then, a cached copy wins: a slow origin
// must not hold the grid hostage.
const NETWORK_PATIENCE_MS = 2500;

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
            // Page code and stylesheets: no 'reload', so these come from the
            // HTTP cache entry the page itself just created.
            for (const url of PRECACHE_ASSETS) {
                try { await cache.add(url); } catch { /* dev / partial deploy */ }
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

    // Catalogue tiers (lite = grid, full = search) and the per-tool machine
    // specs (api/tools/*.json — pointer #4). These decide which tools exist,
    // so they must never be answered from a copy that predates the deploy:
    // freshFast() only lets the cache answer inside the server's own
    // freshness window.
    if (url.pathname.endsWith('cards/cards-lite.json') || url.pathname.endsWith('cards/cards.json')
        || url.pathname === '/api/tools.json' || url.pathname.startsWith('/api/tools/')) {
        event.respondWith(freshFast(req, STATIC_CACHE));
        return;
    }

    // Card fragments: cards/*.html — same policy, so a fixed tool is the one
    // the visitor actually sees rather than the one before the fix.
    if (url.pathname.includes('/cards/') && url.pathname.endsWith('.html')) {
        event.respondWith(freshFast(req, CARDS_CACHE));
        return;
    }

    // Tool standalone: tool.html?card=*
    if (url.pathname.endsWith('tool.html')) {
        event.respondWith(networkFirst(req, RUNTIME_CACHE));
        return;
    }

    // The page's own code and stylesheets: precached, and served from the same
    // STATIC_CACHE they are precached into — otherwise a worker that has never
    // fetched them (first visit, before it controlled anything) answers an
    // offline navigation with a styled, script-less page.
    if (PAGE_ASSET_PATHS.includes(url.pathname)) {
        event.respondWith(freshFast(req, STATIC_CACHE));
        return;
    }

    // Scripts / styles / JSON: freshFast — never pin code to the version a
    // visitor first saw (v4 note), and never serve the version from before the
    // deploy either (v5 note). Inside the 10-minute window a repeat visit
    // still costs no request at all; home-app.js and risk-notices.js are
    // small enough that revalidating them is noise.
    if (/\.(js|css|json)$/.test(url.pathname)) {
        event.respondWith(freshFast(req, RUNTIME_CACHE));
        return;
    }

    // Immutable-ish binaries: images and fonts — cache-first.
    if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)) {
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

// How old the stored copy is, in ms. GitHub Pages sends Date (and Age when a
// CDN answered), which is enough to know whether the entry is still inside the
// freshness window the origin itself advertised.
function ageOf(response) {
    const date = Date.parse(response.headers.get('date') || '');
    if (!Number.isFinite(date)) return Infinity;   // unknown age: treat as stale
    const age = parseInt(response.headers.get('age') || '0', 10) || 0;
    return Math.max(0, Date.now() - date - age * 1000);
}

// Network-first, with the cache allowed to answer instantly only while the
// stored copy is inside GitHub Pages' own freshness window (max-age=600).
// After that the network decides; if it is slower than NETWORK_PATIENCE_MS or
// fails, the cached copy is served and the fetch keeps running to refresh the
// cache for next time.
//
// This replaces stale-while-revalidate for the catalogue, the card fragments
// and first-party code. SWR always handed over the cached copy first, so a
// returning visitor rebuilt the grid from the catalogue that predated the
// deploy — every tool added since their last visit was missing until they
// happened to load the page a second time.
async function freshFast(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then((res) => {
            // 200 only: a 206 or an opaque response cannot be stored, and
            // cache.put() would reject.
            if (res && res.status === 200) cache.put(request, res.clone()).catch(() => {});
            return res;
        })
        .catch(() => null);

    if (!cached) {
        const net = await network;
        return net || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
    if (ageOf(cached) < FRESH_WINDOW_MS) return cached;

    const winner = await Promise.race([
        network,
        new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_PATIENCE_MS))
    ]);
    return winner || cached;
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
