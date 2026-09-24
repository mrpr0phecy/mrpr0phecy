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
// v16: the home page stopped running tools. The live-grid apparatus
// (home-app.js 195 KB + home-features.js 42 KB, the head bootstrap, the card
// shells in #dashboard) is gone; the page now ships a small core plus the
// shared list layer (explore.js / explore.css / toolbox.js), which tools.html
// and all 28 category pages use too. The precache list follows the scripts —
// leave it alone and a returning visitor gets a 404 for the toolbox on the
// first load after this deploy, which is exactly the bug this constant exists
// to prevent.
// v17: popular-chip buttons were dead clicks (no handler) and fetch() used
// Chromium-only {priority:'low'} that could throw synchronously on
// Safari/Firefox, falling back to only a „list could not load“ notice. Both
// fixes live in home-core.js / explore.js / toolbox.js, so the precache
// has to version them or a returning visitor keeps the broken script.
//
// v7: the app is split. The first screen no longer contains the panels, the
// toolbox, the maximise modal or the directory view — those live in
// home-features.js and are fetched at idle — so a version bump is what makes
// returning visitors pick the new pair up. The page's own files (both
// stylesheets, both scripts, risk-notices.js) are also precached into
// STATIC_CACHE now, without cache:'reload' and served from there: before this,
// a first visit followed by an offline visit rendered an unstyled page with no
// cards. Every one of those URLs carries a ?v= derived from this constant, so a
// deploy is a new URL and a stale entry is impossible.
//
// v19: navigations got the patience every other resource already had.
// Reported: click a tool on the home page, go back, click a tool again — the
// tab hung. The tool.html handler (networkFirst) and the generic navigate
// branch both awaited fetch() with NO bound: a stalled socket held the
// navigation hostage forever even though the worker already had a usable
// copy of the page. tool.html now rides the same handler as every other
// navigation: network-first, but a cached copy answers after
// NETWORK_PATIENCE_MS, an offline navigation falls back to the cached index,
// and the network fetch keeps running to refresh the entry for next time.
// v20: the home page is a launcher. The sticky bar follows the hero search
// instead of a hard pixel threshold, the catalogue waits until a search, a
// deep link, the list, or idle, and scrolling no longer measures chrome on
// every frame. Those fixes live in home-core.js / explore.js / home.css, so
// the precache has to move with them or a returning visitor keeps the old pair.
// v21: v19 bounded the navigations that already had a cached copy and left the
// uncached path open — and the report came back: browse back and forth between
// the index and a few tools and the tab hangs. Every first visit to a URL (each
// new tool.html?card=* leg of exactly that browse) awaited the network with no
// bound, so one stalled socket was a white screen forever; the catalogue,
// fragments, fonts and fallback fetches had the same hole, and explore.js
// waited on tools-index.json with no timeout of its own, wedging the home list
// on "Searching the catalogue…". Nothing here awaits the network unbounded any
// more: uncached navigations fall back to the cached index past
// UNCACHED_PATIENCE_MS (the same fallback an offline visit gets), uncached
// subresources fail fast so the page renders its error UI, and a navigation
// preload that never settles no longer stops the fetch from starting.
// v23: the brand redesign. The mark (logo-mark.svg, the favicon and icons) is
// redrawn and the hero and footer lockups change markup and home.css, so a
// returning visitor must not keep the old sheet against the new page.
const CACHE_VERSION = 'v23-2026-09-24';
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

// The page's own code and stylesheets — the two home sheets, the risk notices,
// and the four files the list layer is made of (explore.css, explore.js,
// toolbox.js, home-core.js) — cached in the same store the fetch handler
// serves them from, WITHOUT cache:'reload'. They are the reason a
// first visit followed by an offline visit used to render an unstyled page
// with no cards: the browser fetched them before the worker controlled the
// page, so nothing had stored them for the worker to serve.
//
// Two details make this free rather than another ~200 KB per install:
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
    `./risk-notices.js?v=${PAGE_VERSION}`,
    `./explore.css?v=${PAGE_VERSION}`,
    `./explore.js?v=${PAGE_VERSION}`,
    `./toolbox.js?v=${PAGE_VERSION}`,
    `./home-core.js?v=${PAGE_VERSION}`
];
// Pathnames the handler must serve from STATIC_CACHE, where they are precached.
const PAGE_ASSET_PATHS = ['/home.css', '/home-deferred.css', '/risk-notices.js',
                          '/explore.css', '/explore.js', '/toolbox.js', '/home-core.js'];

// GitHub Pages serves max-age=600, so a copy younger than this is exactly as
// fresh as the browser's own HTTP cache entry.
const FRESH_WINDOW_MS = 10 * 60 * 1000;
// If the network has not answered by then, a cached copy wins: a slow origin
// must not hold the grid hostage.
const NETWORK_PATIENCE_MS = 2500;
// The bound for fetches with NO cached copy to fall back on. Longer than the
// one above, because a first visit has no alternative worth racing toward and
// a slow origin still gets its chance — but it exists: past it, a navigation
// falls back to the cached index (the same page an offline visit gets) and a
// subresource fails fast (503) so the page renders its error UI and its retry
// instead of hanging. Nothing in this worker awaits the network forever.
const UNCACHED_PATIENCE_MS = 8000;

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

    // Navigations — every page the visitor opens, tool.html?card=* included.
    // Two ways a navigation used to die here, both reported as "the second
    // click on a tool hangs":
    //   * tool.html had its own branch (networkFirst) that awaited fetch()
    //     with NO bound — a stalled socket held the page hostage forever even
    //     though a cached copy sat in RUNTIME_CACHE;
    //   * the generic branch waited on fetch() unbounded too before it ever
    //     considered the cache.
    // One handler now covers both: network-first (fresh HTML, the v6 rule),
    // but when a cached copy exists the network only gets NETWORK_PATIENCE_MS
    // — then the cache answers and the fetch keeps running to refresh the
    // entry for next time. Offline falls back to the cached page, then to the
    // cached index. tool.html therefore no longer needs its own branch.
    if (req.mode === 'navigate') {
        const preload = event.preloadResponse ? event.preloadResponse.catch(() => null) : null;
        event.respondWith(navigateFast(req, preload));
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
    // still costs no request at all; explore.js, toolbox.js and
    // risk-notices.js are small enough that revalidating them is noise.
    if (/\.(js|css|json)$/.test(url.pathname)) {
        event.respondWith(freshFast(req, RUNTIME_CACHE));
        return;
    }

    // Immutable-ish binaries: images and fonts — cache-first.
    if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)) {
        event.respondWith(cacheFirst(req, RUNTIME_CACHE));
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
        // Uncached and stalled is the same hang as everywhere else: bound it.
        // A settled response — even a 404 — still passes through untouched.
        const net = await bounded(fetch(request), UNCACHED_PATIENCE_MS);
        if (net && net.ok) cache.put(request, net.clone());
        return net || new Response('Offline', { status: 503 });
    } catch {
        return cached || new Response('Offline', { status: 503 });
    }
}

// A promise that resolves (with null) after ms. The work it races is NOT
// cancelled: a slow fetch still lands in the cache for the visit after this
// one — the bound only decides what THIS response waits for.
function after(ms) {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}
function bounded(promise, ms) {
    return Promise.race([promise, after(ms)]);
}

// Navigations: network-first with the catalogue's patience. The browser's
// navigation-preload response (when the worker has one) is preferred as the
// network source — it is already in flight when the event fires — and the
// cache is allowed to answer only after NETWORK_PATIENCE_MS, or instantly
// when the network has already failed. Either way the in-flight fetch keeps
// running so the stored copy is fresh for the visit after this one.
//
// The unbounded version of this handler is what hung the second click on a
// tool (see the v19 note at the top): with a cached copy available, a stalled
// socket now costs 2.5 seconds, not the rest of the session. v21 bounds the
// uncached path the same way (see below): a stalled first visit falls back to
// the cached index instead of hanging the tab on a white screen.
async function navigateFast(request, preload) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    // Navigation preload normally settles first and saves a round trip — but
    // the fetch below must never wait on it forever. If the preload has not
    // answered within the usual patience, skip it and fetch directly; in the
    // pathological case that costs one duplicate request, and everywhere else
    // it costs nothing because the preload already won the race.
    const PRELOAD_SKIP = 'mp-preload-skip';
    const network = Promise.race([preload || Promise.resolve(null), after(NETWORK_PATIENCE_MS).then(() => PRELOAD_SKIP)])
        .then((p) => (p === PRELOAD_SKIP || !p ? fetch(request) : p))
        .then((res) => {
            if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
            return res || null;
        })
        .catch(() => null);

    if (!cached) {
        // Nothing cached: the network is the honest answer (a 404 must pass
        // through untouched — falling back to the index for a settled 404
        // would show the home page at a dead URL). But it is not allowed
        // forever: every new tool.html?card=* leg of a back-and-forth browse
        // arrives here, and one stalled socket used to hold the tab hostage
        // with a white screen. Past UNCACHED_PATIENCE_MS the stall is treated
        // like offline, and the visitor gets the cached index they can
        // navigate instead of a navigation that never resolves.
        const net = await bounded(network, UNCACHED_PATIENCE_MS);
        if (net) return net;
        return cachedIndex();
    }

    const winner = await bounded(network, NETWORK_PATIENCE_MS);
    return winner || cached;
}

// The offline navigation fallback: the cached index the visitor can actually
// navigate, whatever leg of the browse failed. The install handler requests
// './index.html', which the Cache API stores resolved against the worker's
// URL — '/index.html'. Try the absolute form first, then the literal ones,
// then '/'.
async function cachedIndex() {
    const staticCache = await caches.open(STATIC_CACHE);
    const index = await staticCache.match('/index.html')
        || await staticCache.match('./index.html')
        || await staticCache.match('/');
    return index || new Response('Offline', { status: 503, statusText: 'Offline' });
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
        // No copy at all: the network must answer, but — as with navigations
        // above — it is not allowed forever. A stall here used to hang the
        // page's own fetch with it: explore.js waited on tools-index.json with
        // no timeout of its own, so the home list sat on "Searching the
        // catalogue…" until the tab was reloaded. Failing fast lets the page
        // render its error UI (and its retry) instead.
        const net = await bounded(network, UNCACHED_PATIENCE_MS);
        return net || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
    if (ageOf(cached) < FRESH_WINDOW_MS) return cached;

    const winner = await bounded(network, NETWORK_PATIENCE_MS);
    return winner || cached;
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    // A cached hit returns immediately (the revalidation dangles harmlessly);
    // with nothing cached, the fetch gets the same bound as every other
    // uncached fetch rather than hanging the response forever.
    const fetchPromise = bounded(fetch(request).then(net => {
        if (net.ok) cache.put(request, net.clone());
        return net;
    }).catch(() => null), UNCACHED_PATIENCE_MS);
    return cached || (await fetchPromise) || new Response('Offline', { status: 503 });
}

function eventRevalidate(request, cache) {
    // Fire-and-forget revalidation
    fetch(request).then(res => {
        if (res.ok) cache.put(request, res);
    }).catch(()=>{});
}
