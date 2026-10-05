/* Service Worker — caching for The Most Useful Site in the World
   - Catalogue, card fragments and first-party code: freshFast() — a cached copy
     answers with NO request while it is inside the origin's own freshness
     window; after that the network decides, with the cache as the safety net.
   - Binaries (fonts, images): cache-first. Everything else: cached copy now,
     one bounded refresh queued for next time.
   - Navigations: network-first, a cached copy of THAT url after NETWORK_PATIENCE,
     one retry on a fresh request when a stall has nothing cached, and the cached
     index only for a network that genuinely failed (offline).
   - Background work is bounded: one queue, two requests at a time, one per URL,
     cleared when the visitor navigates. A request nobody awaits is aborted, not
     abandoned — see the network section below for why that mattered.
   - Every store is capped, and no cache call may fail a navigation.
   - Offline fallback; module and classic registration; Navigation Preload when
     available.
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
// v26: the list layer's responsiveness and failure pass. explore.js sorts once
// per order and memoises the filter (typing no longer re-sorts 1,285 rows),
// warms the catalogue on search intent, validates the payload and re-arms on
// `online`; toolbox.js re-reads storage before every change so another tab's
// additions are never overwritten; home-core.js isolates each feature so one
// failure cannot leave the page inert. All three are precached by version.
// v30: the shared list stylesheet now honors [hidden] on filtered rows and
// empty category groups, rather than letting its grid display override it.
// v32: catalogue cross-promotions were removed from the home page; the paired
// home styles changed as well, so version the HTML, app, and precache together.
// v33: category pages opt out of directory pagination so every tool in a
// focused category remains visible after the shared list enhancer mounts.
// v34: the home hero, featured shelf and browse surface are restyled; keep the
// page assets and cached HTML/CSS on the same version for returning visitors.
// v35: add a scroll-linked progress trace and focused/hover feedback to the home UI.
// v36: narrow horizontal shelves hint at their continuation with a trailing fade.
// v37: align homepage and design-brief category counts with the 31-category catalogue.
// v38: remeasure shared shelf fades when a previously hidden row becomes visible.
// v39: the stall that ends on the wrong page. "After five or six clicks the tab
// stops and then shows me a different page" had been patched twice (v19, v21) by
// putting a timeout on the worker's network waits — which is how the wrong page
// got there: past the patience the handler hands over the CACHED INDEX for a
// navigation whose fetch was merely slow. The timeouts were treating a queue the
// worker had filled itself. Every intercepted request started a revalidation
// BEFORE the freshness window was consulted, so a page view that answered 15
// assets out of cache still put 15 downloads into the origin's queue, and
// `bounded()` left each one running after its page was gone — nothing counted,
// deduped, capped or aborted them. Clicking around is what builds that queue,
// and each click added to it, so the session got worse the faster it went and a
// reload made it look fine. A fresh-enough cached copy now costs no request at
// all; a refresh nobody waits for goes through one bounded, per-URL-deduped
// queue that a navigation clears before it starts; a timed-out request is aborted
// instead of abandoned; an uncached navigation that stalls is retried once on a
// fresh connection, and the cached index is reserved for a network that actually
// failed. Cache access can no longer fail a navigation either — open/match/put
// are guarded (a quota error used to reject respondWith and render an error
// page), and every store is capped, because 1,389 fragments plus a page per tool
// only ever grew. Document requests that are not navigations (the hover
// prefetches the speculation rules ask for) are passed straight back to the
// browser, which prioritises and cancels them properly.
const CACHE_VERSION = 'v39-2026-10-04';
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
// a slow origin still gets its chance. Past it a stalled socket is aborted and
// a navigation gets ONE more attempt on a fresh connection; only if that fails
// too does a navigation fall back to the cached index (the same page an offline
// visit gets) and a subresource fail fast (503) so the page renders its error UI
// and its retry. Nothing awaits the network forever, and nothing keeps a
// connection after the wait is over.
const UNCACHED_PATIENCE_MS = 8000;

// Install — precache critical assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            // Free the previous deploy's stores before adding to this one: a
            // device near its quota otherwise fails install, which leaves the
            // whole caching layer missing rather than merely cold.
            try {
                const names = await caches.keys();
                await Promise.all(names
                    .filter(k => ![STATIC_CACHE, CARDS_CACHE, RUNTIME_CACHE].includes(k))
                    .map(k => caches.delete(k).catch(() => {})));
            } catch (e) { /* nothing to clean */ }
            const cache = await caches.open(STATIC_CACHE).catch(() => null);
            if (!cache) { self.skipWaiting(); return; }   // no store: run uncached
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

// Activate — clean old caches. Nothing here may reject: an activate that throws
// leaves the worker inactive, which silently removes the cache layer for every
// visit until the next deploy.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            try {
                const keys = await caches.keys();
                await Promise.all(
                    keys.filter(k => ![STATIC_CACHE, CARDS_CACHE, RUNTIME_CACHE].includes(k))
                        .map(k => caches.delete(k).catch(() => {}))
                );
            } catch (e) { /* no old stores to drop */ }
            try { await self.clients.claim(); } catch (e) { /* already claimed */ }
        })()
    );
});

// Message handler — warm cache on demand. It has no caller today; it goes
// through the background queue anyway, because a list of URLs fetched as fast
// as the loop can run is precisely the pile-up the rest of this file exists to
// prevent.
self.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'WARM_CACHE' && Array.isArray(event.data.urls)) {
        for (const url of event.data.urls) {
            try {
                startBackground(new Request(url, { credentials: 'same-origin' }), RUNTIME_CACHE);
            } catch (e) { /* a URL the Request constructor rejects is not worth warming */ }
        }
    }
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Only handle same-origin GET
    if (req.method !== 'GET' || url.origin !== self.location.origin) return;

    // Speculation-rule prefetches — and any other document request that is not
    // an actual navigation — are left to the browser. It already gives them
    // idle priority and cancels them when the visitor commits somewhere else;
    // the worker could not, and intercepting them was its own version of the
    // bug: every hover across the catalogue asked for a 124 KB tool page, and
    // each of those requests outlived the hover, because the worker outlives
    // the page. Passing them straight through still warms the HTTP cache, which
    // is what makes the eventual click instant, and the navigation that follows
    // is cached here like any other.
    if (req.mode !== 'navigate' && req.destination === 'document') return;

    // Catalogue tiers (lite = grid, full = search) and the per-tool machine
    // specs (api/tools/*.json — pointer #4). These decide which tools exist,
    // so they must never be answered from a copy that predates the deploy:
    // freshFast() only lets the cache answer inside the server's own
    // freshness window.
    if (url.pathname.endsWith('cards/cards-lite.json') || url.pathname.endsWith('cards/cards.json')
        || url.pathname === '/api/tools.json' || url.pathname.startsWith('/api/tools/')) {
        event.respondWith(freshFast(req, STATIC_CACHE, event));
        return;
    }

    // Card fragments: cards/*.html — same policy, so a fixed tool is the one
    // the visitor actually sees rather than the one before the fix.
    if (url.pathname.includes('/cards/') && url.pathname.endsWith('.html')) {
        event.respondWith(freshFast(req, CARDS_CACHE, event));
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
        event.respondWith(navigateFast(req, preload, event));
        return;
    }

    // The page's own code and stylesheets: precached, and served from the same
    // STATIC_CACHE they are precached into — otherwise a worker that has never
    // fetched them (first visit, before it controlled anything) answers an
    // offline navigation with a styled, script-less page.
    if (PAGE_ASSET_PATHS.includes(url.pathname)) {
        event.respondWith(freshFast(req, STATIC_CACHE, event));
        return;
    }

    // Scripts / styles / JSON: freshFast — never pin code to the version a
    // visitor first saw (v4 note), and never serve the version from before the
    // deploy either (v5 note). Inside the 10-minute window a repeat visit
    // still costs no request at all; explore.js, toolbox.js and
    // risk-notices.js are small enough that revalidating them is noise.
    if (/\.(js|css|json)$/.test(url.pathname)) {
        event.respondWith(freshFast(req, RUNTIME_CACHE, event));
        return;
    }

    // Immutable-ish binaries: images and fonts — cache-first.
    if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)) {
        event.respondWith(cacheFirst(req, RUNTIME_CACHE, undefined, event));
        return;
    }

    // Default: stale-while-revalidate
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE, event));
});

// ---------------------------------------------------------------- the network
// Everything above hands a request to one of the helpers below, and every one
// of them used to assume the browser cancels a fetch once the page that needed
// it goes away. It does not: a request started by the worker belongs to the
// worker, and the worker outlives every page of the session. `bounded()` only
// decided what the RESPONSE waited for — the fetch it raced kept running, and
// nothing counted, deduped or cancelled it.
//
// So a page view that answered almost everything from cache still queued a
// background revalidation for every request it intercepted — 15 on the home
// page (the 1 MB tools-index.json, the catalogue, four scripts, two
// stylesheets, a font, the notices) — and each of them sat in the same origin
// queue as the click the visitor was actually waiting for. Four or five clicks
// in, the queue held more work than a normal connection can drain, the
// downloads nobody wanted any more kept the slots, and the navigation that
// mattered timed out: a hard stall, then the patience fallback handing over a
// page the visitor did not ask for. Reloading "fixed" it, because the queue
// starts empty. Browsing fast is exactly what builds the queue, which is why
// it only ever showed up while someone was clicking through the site.
//
// Four rules make that structure impossible:
//   1. a cached copy that is still inside the freshness window is served with
//      NO request at all — a cache hit must not cost bandwidth;
//   2. a revalidation nobody is waiting for goes through one bounded queue
//      (BACKGROUND_LIMIT at a time, one per URL, the backlog capped) instead of
//      running straight away beside the page;
//   3. a request the worker timed out on is ABORTED, not abandoned — the
//      connection it holds is the resource the next click needs, and the page it
//      was fetching is one the visitor has already left;
//   4. a navigation cancels that backlog first: the visitor outranks the cache.
//
// And the failure it was hiding, now fixed at the source: nothing in this
// worker may leave a connection held by nobody, and a stall is retried once on
// a fresh request before it is treated as offline — so the patience fallback is
// the last resort it was meant to be, not the normal end of a fast browse.
const BACKGROUND_LIMIT = 2;
const BACKGROUND_BACKLOG = 24;
const backgroundQueue = [];          // {url, request, cacheName}
const backgroundRunning = new Map(); // url -> ctl: one refresh per URL at a time
let refreshSlots = BACKGROUND_LIMIT; // shared by queued refreshes and adopted ones

function newAbort() {
    try {
        return typeof AbortController === 'function' ? new AbortController() : null;
    } catch (e) {
        return null;
    }
}

function abort(ctl) {
    if (!ctl) return;
    try { ctl.abort(); } catch (e) { /* already settled */ }
}

// Queue a refresh of one URL for the next look. Dropped when that URL is already
// being refreshed, and when a navigation has made the whole backlog pointless.
function startBackground(request, cacheName) {
    const url = request && request.url;
    if (!url || backgroundRunning.has(url)) return;
    for (let i = 0; i < backgroundQueue.length; i++) {
        if (backgroundQueue[i].url === url) return;
    }
    backgroundQueue.push({ url, request, cacheName });
    // A queue nobody drains while the visitor keeps clicking must stay short:
    // the oldest entries are for pages that are already gone.
    while (backgroundQueue.length > BACKGROUND_BACKLOG) backgroundQueue.shift();
    pumpBackground();
}

function pumpBackground() {
    while (refreshSlots > 0 && backgroundQueue.length) {
        const job = backgroundQueue.shift();
        refreshSlots--;
        const ctl = newAbort();
        const finish = () => {
            refreshSlots++;
            backgroundRunning.delete(job.url);
            pumpBackground();
        };
        backgroundRunning.set(job.url, ctl);
        let work;
        try {
            work = ctl ? fetch(job.request, { signal: ctl.signal }) : fetch(job.request);
        } catch (e) {
            finish();
            continue;
        }
        Promise.resolve(work).then((res) => {
            // This body belongs to nobody, so it goes straight into the store.
            if (res && res.status === 200) return store(job.cacheName, job.request, res);
            return null;
        }).then(finish, finish);
    }
}

// A refresh the visitor stopped waiting for. Letting it finish is worth exactly
// as much as it costs: one slot of the same budget, so at most BACKGROUND_LIMIT
// requests outlive their page, and the entry they update is what makes the next
// view answer instantly instead of waiting out the patience again. With no slot
// free the work is abandoned instead — the bound is the point.
function adoptRefresh(request, ctl, promise) {
    const url = request && request.url;
    if (!url || refreshSlots <= 0) {
        abort(ctl);
        return false;
    }
    refreshSlots--;
    backgroundRunning.set(url, ctl);
    Promise.resolve(promise).then(() => {
        refreshSlots++;
        backgroundRunning.delete(url);
        pumpBackground();
    }, () => {
        refreshSlots++;
        backgroundRunning.delete(url);
        pumpBackground();
    });
    return true;
}

// A navigation is the visitor, waiting. Everything still QUEUED belongs to a
// page they have left, so it hands the origin's budget back before this click
// starts competing with it. Work already in flight is not cancelled here: it is
// inside the same two-slot budget, it is nearly free to finish, and it is what
// keeps the next page view off the network.
function clearBacklog() {
    backgroundQueue.length = 0;
}

// The one safe way into a cache: a rejected `open()`/`match()`/`put()` used to
// reject respondWith() with it, and Chromium renders that as an error page for
// the URL the visitor clicked — with no cache layer at all for the rest of the
// session, because a failed activate left the worker uninstalled. Quota and
// disk errors are ordinary on a phone, so they are handled, not propagated.
async function openCache(name) {
    try {
        return await caches.open(name);
    } catch (e) {
        return null;
    }
}

async function matchQuietly(cache, request) {
    if (!cache) return undefined;
    try {
        return await cache.match(request);
    } catch (e) {
        return undefined;
    }
}

// How many entries a store may hold. Every distinct URL this site serves is a
// permanent entry — 1,389 card fragments, a tool page per card, an index per
// visit — and with no ceiling the stores only ever grew, which is how the
// quota errors above started happening in the first place. Oldest first: the
// Cache API iterates in insertion order, so the front of the list is the page
// from the start of the session.
const MAX_ENTRIES = 420;
const PRUNE_EVERY = 32;
const storedSincePrune = new Map();

async function store(cacheName, request, response) {
    if (!request || !response || response.status !== 200) return;
    const cache = await openCache(cacheName);
    if (!cache) return;
    try {
        await cache.put(request, response);
    } catch (e) {
        return;      // quota or a body the store cannot hold: keep serving, uncached
    }
    const n = (storedSincePrune.get(cacheName) || 0) + 1;
    storedSincePrune.set(cacheName, n);
    if (n < PRUNE_EVERY) return;
    storedSincePrune.set(cacheName, 0);
    try {
        const keys = await cache.keys();
        if (!keys || keys.length <= MAX_ENTRIES) return;
        const excess = keys.length - MAX_ENTRIES;
        for (let i = 0; i < excess; i++) {
            const entry = keys[i];
            await cache.delete(Array.isArray(entry) ? entry[0] : entry);
        }
    } catch (e) { /* the ceiling is a safety valve, not a requirement */ }
}

// The request a page is waiting for, with a bound on the wait AND an abort when
// the bound wins. `null` means "the network did not answer": a settled response
// — including a 404 — always passes through untouched, because substituting a
// different page for a page that exists is its own bug.
const STALLED = { stalled: true };

// `adopt` is for the caller that has a usable cached copy in hand: the fetch is
// worth letting finish for the NEXT view (bounded by the refresh budget), and
// the response it downloads is not needed by anyone now.
async function foreground(request, ms, cacheName, event, adopt) {
    const ctl = newAbort();
    let settled = false;
    let work;
    try {
        work = ctl ? fetch(request, { signal: ctl.signal }) : fetch(request);
    } catch (e) {
        return null;
    }
    const p = Promise.resolve(work).then((res) => {
        settled = true;
        if (res && res.status === 200 && cacheName) {
            let copy = null;
            try { copy = res.clone(); } catch (e2) { copy = null; }
            // waitUntil() is what lets the write finish after the response has
            // been delivered: fire-and-forget here meant the browser could kill
            // the worker mid-put, so the entry was still missing next visit and
            // the same download ran again.
            const saved = store(cacheName, request, copy);
            if (event) { try { event.waitUntil(saved); } catch (e3) { /* event over */ } }
        }
        return res || null;
    }, () => { settled = true; return null; });
    const winner = await Promise.race([p, after(ms).then(() => STALLED)]);
    if (winner === STALLED) {
        if (!settled) {
            if (!adopt || !adoptRefresh(request, ctl, p)) abort(ctl);
        }
        return null;
    }
    return winner;
}

async function cacheFirst(request, cacheName, maxAge, event) {
    const cache = await openCache(cacheName);
    const cached = await matchQuietly(cache, request);
    if (cached) {
        // Immutable-ish binaries: a copy inside the caller's maxAge is the
        // answer, and asking the origin about it is pure queue pressure.
        if (!maxAge || ageWithin(cached, maxAge)) return cached;
        startBackground(request, cacheName);
        return cached;
    }
    const net = await foreground(request, UNCACHED_PATIENCE_MS, cacheName, event);
    return net || new Response('Offline', { status: 503, statusText: 'Offline' });
}

// A promise that resolves (with null) after ms. Unlike `foreground()` this is
// for callers that own the fetch and decide for themselves what to do with it.
function after(ms) {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}
function bounded(promise, ms) {
    return Promise.race([promise, after(ms).then(() => STALLED)]);
}

// Navigations: network-first with the catalogue's patience, and the requested
// page in preference to anything else.
//
// Two bugs lived here, both reported the same way — a few clicks, a stall, and
// a page that is not the one that was asked for.
//
// * v19/v21 bounded the wait, but a bound on a saturated queue is the
//   visitor's problem, not the worker's: the first answer this handler produced
//   for a merely SLOW (not failed) fetch was the cached index. Now a stall gets
//   one retry on a fresh request — the origin answers that, almost always,
//   because it is the queued traffic of the previous clicks that was blocking
//   the socket, and that traffic is gone (see clearBacklog and `foreground`).
// * falling back to the index is kept for the case it was written for: a
//   navigation that cannot be answered at all (offline, or a network that failed
//   twice). The visitor gets a page they can navigate instead of a white tab.
async function navigateFast(request, preload, event) {
    clearBacklog();
    const cache = await openCache(RUNTIME_CACHE);
    const cached = await matchQuietly(cache, request);

    // Navigation preload normally settles first and saves a round trip — but
    // the fetch below must never wait on it forever. If it has not answered
    // within the usual patience, skip it and fetch directly: in the pathological
    // case that costs one duplicate request, and everywhere else it costs
    // nothing because the preload already won the race.
    const PRELOAD_SKIP = 'mp-preload-skip';
    const ctl = newAbort();
    const start = () => (ctl ? fetch(request, { signal: ctl.signal }) : fetch(request));
    const network = Promise.race([preload || Promise.resolve(null), after(NETWORK_PATIENCE_MS).then(() => PRELOAD_SKIP)])
        .then((p) => (p === PRELOAD_SKIP || !p ? start() : p))
        .then((res) => {
            if (res && res.ok) {
                let copy = null;
                try { copy = res.clone(); } catch (e2) { copy = null; }
                if (copy) {
                    const saved = store(RUNTIME_CACHE, request, copy);
                    try { if (event) event.waitUntil(saved); } catch (e3) { /* event over */ }
                }
            }
            return res || null;
        })
        .catch(() => null);

    if (!cached) {
        const first = await bounded(network, UNCACHED_PATIENCE_MS);
        if (first && first !== STALLED) return first;
        if (first === STALLED) {
            // Nothing answered in time. That is a stalled socket, not a dead
            // origin — abandon it (holding it is what made the next click worse)
            // and ask once more on a clean connection.
            abort(ctl);
            const again = await foreground(request, UNCACHED_PATIENCE_MS, RUNTIME_CACHE, event);
            if (again) return again;
        }
        return cachedIndex();
    }

    const winner = await bounded(network, NETWORK_PATIENCE_MS);
    if (winner === STALLED) {
        // The visitor gets the copy we already have, and the refresh is kept
        // only if the budget has room for it — that copy is what makes their
        // back-and-forth trip instant instead of another patience wait.
        if (!adoptRefresh(request, ctl, network)) abort(ctl);
        return cached;
    }
    return winner || cached;
}

// The offline navigation fallback: the cached index the visitor can actually
// navigate, whatever leg of the browse failed. The install handler requests
// './index.html', which the Cache API stores resolved against the worker's
// URL — '/index.html'. Try the absolute form first, then the literal ones,
// then '/'.
async function cachedIndex() {
    const staticCache = await openCache(STATIC_CACHE);
    if (!staticCache) return new Response('Offline', { status: 503, statusText: 'Offline' });
    let index = null;
    try {
        index = await staticCache.match('/index.html')
            || await staticCache.match('./index.html')
            || await staticCache.match('/');
    } catch (e) { index = null; }
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

function ageWithin(response, maxAge) {
    return ageOf(response) < maxAge;
}

// Network-first, with the cache allowed to answer instantly while the stored
// copy is still inside GitHub Pages' own freshness window (max-age=600). After
// that the network decides; if it is slower than NETWORK_PATIENCE_MS or fails,
// the cached copy is served and a refresh is queued for the next look.
//
// This replaces stale-while-revalidate for the catalogue, the card fragments
// and first-party code: SWR always handed over the cached copy first, so a
// returning visitor rebuilt the grid from the catalogue that predated the
// deploy — every tool added since their last visit was missing until they
// happened to load the page a second time.
//
// The window path issues NO request. That is the whole point of the window, and
// it used to be the whole source of the stall: the fetch was started before the
// window was consulted, so every "cached" answer also spent a slot.
async function freshFast(request, cacheName, event) {
    const cache = await openCache(cacheName);
    const cached = await matchQuietly(cache, request);
    if (cached && ageOf(cached) < FRESH_WINDOW_MS) return cached;

    const net = await foreground(request, cached ? NETWORK_PATIENCE_MS : UNCACHED_PATIENCE_MS,
                                 cacheName, event, !!cached);
    if (net) return net;
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
}

async function staleWhileRevalidate(request, cacheName, event) {
    const cache = await openCache(cacheName);
    const cached = await matchQuietly(cache, request);
    if (cached) {
        // Refresh for next time, in the queue — not beside the page that is
        // loading now.
        startBackground(request, cacheName);
        return cached;
    }
    const net = await foreground(request, UNCACHED_PATIENCE_MS, cacheName, event);
    return net || new Response('Offline', { status: 503, statusText: 'Offline' });
}
