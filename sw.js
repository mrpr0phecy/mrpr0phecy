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
   - And if it does go wrong: it says so at the URL you clicked, counts its own
     fallbacks, and stands down after three of them. These three are the
     properties scripts/check-sw-discipline.py enforces in the gate.
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
// Still v39: three permanent guarantees, because this report had been raised and
// "documented as fixed" three times before it actually was. (1) The rules the
// handler must obey are machine-checked: scripts/check-sw-discipline.py runs in
// `verify.sh`'s fast gate and CI, and the deployed worker failed 31 of them.
// (2) The behaviour is checked by driving a session, not one request at a time:
// scripts/tests/service-worker-session.test.js clicks through twelve page views
// against a congested origin and fails on orphaned requests, on a cache hit that
// costs bandwidth, and on any view that renders something other than the page it
// asked for. (3) The worker cannot be the reason a page fails even when all of
// that is wrong: routing runs inside a try, an unanswerable navigation gets an
// honest 504 at its own URL rather than another page, and after STUCK_LIMIT
// fallbacks it cool-off unregisters itself. `mp:stats` reports what it did;
// sw-check.html shows it to a human, no devtools needed.
// v40: the full-page split. Every tool now has its own page (tool/<slug>.html,
// built by scripts/build-tool-fullpages.py) and the browse surfaces link there
// instead of tool.html?card=; the toolbox panel's styles moved out of
// explore.css into toolbox.css, which the tool pages load WITHOUT the list
// layer — so toolbox.css gets its own precache entry and ?v=, and the edited
// home-core.js / toolbox.js / explore.css must ship at the same version as
// always. tool.html is unchanged: it stays the stateful shell for filled
// links, jobs and &embed=1.
// v41: the two pages the v40 split left behind, plus two CSS corrections.
// new.html and popular.html were still pinned at v30 and never received
// toolbox.css when the panel's chrome moved there, so the ＋ buttons
// toolbox.js builds for them (and the toast) rendered as browser defaults —
// explore.css's own comment states the invariant they broke: every page that
// loads toolbox.js loads toolbox.css. home.css's shelf cards lost their
// :last-child selectors, which added no declaration but enough specificity to
// beat the prefers-reduced-motion override on the last card of each shelf; and
// the @supports test in explore.css / toolbox.css now accepts
// -webkit-backdrop-filter as well, because Safari honoured only the prefix
// until 18 — those visitors were blurring behind a surface that never thinned.
// v42: phones and first paint. cards/card.css stopped padding the body — its
// 24 px stacked on the tool page frame's own insets and left a ~224 px card
// column on a 360 px screen — and now sizes text fields at 16 px on small
// screens, so iOS Safari stops zooming the page on focus; the generated tool
// pages step their frame back under 600 px and let the below-fold related grid
// and footer skip layout until approached (content-visibility); toolbox.css,
// which styles only chrome toolbox.js injects, loads non-blocking on every
// surface — one less render-blocking request per page; and card.css finally
// carries a ?v= of its own, like every other asset on the site.
// v43: repeated home visits. The v39 prefetch guard never matched a real
// prefetch — Chromium sends speculation-rule prefetches to the worker as
// mode:'navigate' with Sec-Purpose: prefetch — so each hover still became a
// worker-owned navigation the browser could not cancel; route() now checks the
// header (isSpeculative). explore.js stopped writing the default sort into the
// address, which had turned every visit to / into /?sort=az and made the
// reload fetch the 1 MB catalogue before first paint; and home-core.js skips
// the cross-document view transition for destinations that do not opt in,
// which threw an uncaught InvalidStateError on every tool page opened from home.
// v44: catalogue interaction polish and shared, cacheable tool-page chrome.
// v46: the seasonal Halloween band on the home page. index.html gains a
// head script (the 10 Oct – 2 Nov window), the band's markup and links, and
// home.css gains §13; home-core.js gains the dismissal. All three carry the
// version, so a returning visitor's cached page can never pair the new
// band with the old stylesheet, or the new stylesheet with a page that has
// no band to style.
// v53: speed up static list surfaces (categories/*.html, tools.html,
// tools-index.html) and tool/*.html head discovery — move JSON-LD out of
// <head>, pre-sort category hubs in emoji-stripped A–Z title order, skip
// orderStatic() DOM re-appends on already-sorted buckets, clone one action
// template per list instead of per-row innerHTML parsing, and batch sticky +
// overflow-fade geometry reads ahead of DOM writes.
// v54: make organic entry pages (tool/*.html, categories/*.html, tools.html,
// tools-index.html) warm the next click — precache cards/card.css alongside
// tool-page.css in STATIC_CACHE, register sw.js at post-load idle from
// toolbox.js with root scope across nested directories, and ship conservative
// pointerdown speculation rules on tool, category and directory pages.
const CACHE_VERSION = 'v54-2026-10-23';
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
    `./toolbox.css?v=${PAGE_VERSION}`,
    `./explore.js?v=${PAGE_VERSION}`,
    `./toolbox.js?v=${PAGE_VERSION}`,
    `./home-core.js?v=${PAGE_VERSION}`,
    // Warm both shared tool-page stylesheets at install/idle, not on the first tool click.
    `./tool-page.css?v=${PAGE_VERSION}`,
    `./cards/card.css?v=${PAGE_VERSION}`
];
// Pathnames the handler must serve from STATIC_CACHE, where they are precached.
const PAGE_ASSET_PATHS = ['/home.css', '/home-deferred.css', '/risk-notices.js',
                          '/explore.css', '/toolbox.css', '/explore.js', '/toolbox.js',
                          '/home-core.js', '/tool-page.css', '/cards/card.css'];

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
            // Enable navigation preload here in activate (where registration.active
            // exists — calling enable() in install rejects with InvalidStateError).
            try {
                if (self.registration && 'navigationPreload' in self.registration) {
                    await self.registration.navigationPreload.enable();
                }
            } catch (e) { /* unsupported or already enabled */ }
            await readCooloff();
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
    // The one read-only window into what the worker is doing, for
    // sw-check.html. Nothing is stored and nothing leaves the page.
    if (event.data.type === 'mp:stats') {
        const report = async () => {
            const sizes = {};
            try {
                for (const name of [STATIC_CACHE, CARDS_CACHE, RUNTIME_CACHE]) {
                    const c = await openCache(name);
                    sizes[name] = c ? (await c.keys()).length : -1;
                }
            } catch (e) { /* a store we cannot read is not worth reporting */ }
            return Object.assign({
                cacheVersion: CACHE_VERSION,
                disarmedUntil: cooloffUntil,
                disarmedMs: cooloffUntil ? Math.max(0, cooloffUntil - Date.now()) : 0
            }, stats, { sizes });
        };
        report().then((data) => {
            try { if (event.source) event.source.postMessage({ type: 'mp:stats', data }); } catch (e) {}
        });
        return;
    }
    if (event.data.type === 'WARM_CACHE' && Array.isArray(event.data.urls)) {
        for (const url of event.data.urls) {
            try {
                startBackground(new Request(url, { credentials: 'same-origin' }), RUNTIME_CACHE);
            } catch (e) { /* a URL the Request constructor rejects is not worth warming */ }
        }
    }
});

// Fetch strategy.
//
// `route()` is wrapped, not called bare, because of what an exception in a
// fetch handler costs: `respondWith()` rejecting (or never being answered) is
// rendered by Chromium as a failed navigation — the visitor gets an error page
// for a URL that a browser with no service worker at all would have loaded
// fine. A worker that throws must cost a cache hit and nothing else, so any
// failure here passes the request through untouched instead.
self.addEventListener('fetch', (event) => {
    if (Date.now() < cooloffUntil) return;         // disarmed: stay out of the way
    try {
        route(event);
    } catch (e) {
        try { console.warn('[sw] routing error, passing through:', e); } catch (e2) {}
    }
});

// A prefetch or prerender, whatever mode the browser gave it. Sec-Purpose is
// the standard header ('prefetch', or 'prefetch;prerender'); Purpose is the
// older spelling some engines still send for <link rel=prefetch>.
function isSpeculative(req) {
    let purpose = '';
    try {
        purpose = req.headers.get('Sec-Purpose') || req.headers.get('Purpose') || '';
    } catch (e) { /* no headers on this request */ }
    return /\b(prefetch|prerender)\b/i.test(purpose);
}

function route(event) {
    const req = event.request;
    const url = new URL(req.url);

    // Only handle same-origin GET
    if (req.method !== 'GET' || url.origin !== self.location.origin) return;

    // Fetch-spec invariant: only-if-cached cannot be fetched outside same-origin.
    if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

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

    // v43: that guard alone never caught them. Chromium hands a speculation-
    // rule prefetch (and a prerender) to the worker as mode:'navigate',
    // destination:'document' — indistinguishable from a click except for its
    // Sec-Purpose header — so every hover over a catalogue row still ran
    // navigateFast(): a worker-owned 124 KB download the browser could neither
    // deprioritise nor cancel, a clearBacklog(), a RUNTIME_CACHE entry, and a
    // stall that counted towards disarming the worker. Measured on the live
    // site, eight hovers made eight worker fetches with the header stripped.
    if (isSpeculative(req)) return;

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
    // offline navigation with a styled, script-less page. When stamped with
    // this deploy's ?v=${PAGE_VERSION}, the URL itself is versioned, so serving
    // cacheFirst avoids firing 9 foreground revalidations every 10 minutes.
    if (PAGE_ASSET_PATHS.includes(url.pathname)) {
        if (url.searchParams.get('v') === PAGE_VERSION) {
            event.respondWith(cacheFirst(req, STATIC_CACHE, undefined, event));
            return;
        }
        event.respondWith(freshFast(req, STATIC_CACHE, event));
        return;
    }

    // Scripts / styles / JSON: freshFast — never pin code to the version a
    // visitor first saw (v4 note), and never serve the version from before the
    // deploy either (v5 note).
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
}

// ------------------------------------------------------------ never a cause
// Two promises this worker is not allowed to break, both earned from the same
// report ("the site stalls, then shows me a different page, every time I click
// around"):
//
//   1. it must never answer a navigation with a page the visitor did not ask
//      for while they are online — a fallback that silently lands someone on
//      the home page looks exactly like a broken site;
//   2. it must never be the REASON a page fails. If this worker cannot get out
//      of its own way, it should stop intercepting: a static site with no
//      service worker still works, and that is the floor we are defending.
//
// So after a few navigations that the worker could only answer with a fallback,
// it disarms itself for COOLOFF_MS: every request passes straight through to the
// browser, the caches stop being touched, and the next page view is a plain
// fetch. It re-arms on its own when the window passes (a transient network, a CDN
// blip, a proxy on hotel Wi-Fi), and the marker survives termination and
// re-registration, so a visitor is never left stuck behind a worker that is
// failing for them.
const STUCK_LIMIT = 3;
const COOLOFF_MS = 10 * 60 * 1000;
const COOLOFF_KEY = './mp-worker-disarmed';
let cooloffUntil = 0;
let stuckRuns = 0;

// What the worker did this session, for sw-check.html to read. Integers only: a
// diagnostics counter that grows a list is its own leak.
const stats = { cacheHits: 0, network: 0, refreshes: 0, aborted: 0, fallbacks: 0, disarmed: 0 };

async function armCooloff() {
    cooloffUntil = Date.now() + COOLOFF_MS;
    stats.disarmed++;
    const cache = await openCache(STATIC_CACHE);
    if (cache) {
        try {
            await cache.put(new Request(COOLOFF_KEY, { method: 'GET' }),
                new Response(String(cooloffUntil), { status: 200 }));
        } catch (e) { /* nothing to persist: the in-memory window still applies */ }
    }
    // Give the pages back to the browser outright. home-core.js registers the
    // worker again on the next load, and activate() re-reads this marker, so a
    // re-registration cannot undo the disarm.
    try { if (self.registration && self.registration.unregister) await self.registration.unregister(); } catch (e) {}
}

// Read at activate(): a worker that restarts mid-cooloff stays out of the way.
async function readCooloff() {
    const cache = await openCache(STATIC_CACHE);
    if (!cache) return;
    let hit = null;
    try { hit = await cache.match(new Request(COOLOFF_KEY, { method: 'GET' })); } catch (e) { return; }
    if (!hit) return;
    let until = 0;
    try { until = Number(await hit.text()) || 0; } catch (e) { return; }
    if (until > Date.now()) { cooloffUntil = until; stats.disarmed++; return; }
    try { await cache.delete(new Request(COOLOFF_KEY, { method: 'GET' })); } catch (e) {}
}

// A navigation the visitor could not be given the page for. Fallbacks are not
// free: they are the sound of the worker guessing, so three in a row means the
// guessing is what is going wrong.
function markStuckNavigation() {
    stats.fallbacks++;
    stuckRuns++;
    if (stuckRuns >= STUCK_LIMIT) { stuckRuns = 0; void armCooloff(); }
}

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
    stats.refreshes++;
    for (let i = 0; i < backgroundQueue.length; i++) {
        if (backgroundQueue[i].url === url) return;
    }
    backgroundQueue.push({ url, request, cacheName });
    // A queue nobody drains while the visitor keeps clicking must stay short:
    // the oldest entries are for pages that are already gone.
    while (backgroundQueue.length > BACKGROUND_BACKLOG) backgroundQueue.shift();
    pumpBackground();
}

// Own a refresh through the body/cache write, not just the response headers.
// Neither a stalled socket nor a stalled body may hold a slot indefinitely.
function trackRefresh(url, ctl, work) {
    refreshSlots--;
    backgroundRunning.set(url, ctl);
    let finished = false;
    let timer;
    const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        // An older request must not remove a newer refresh of the same URL.
        if (backgroundRunning.get(url) === ctl) backgroundRunning.delete(url);
        refreshSlots++;
        pumpBackground();
    };
    timer = setTimeout(() => { abort(ctl); finish(); }, UNCACHED_PATIENCE_MS);
    Promise.resolve(work).then(finish, finish);
}

function pumpBackground() {
    while (refreshSlots > 0 && backgroundQueue.length) {
        const job = backgroundQueue.shift();
        const ctl = newAbort();
        const work = Promise.resolve().then(() =>
            ctl ? fetch(job.request, { signal: ctl.signal }) : fetch(job.request)
        ).then((res) => {
            if (res && res.status === 200) return store(job.cacheName, job.request, res);
            // Nobody consumes an error response; don't leave its body downloading.
            if (res && res.body) return res.body.cancel().catch(() => {});
            return null;
        });
        trackRefresh(job.url, ctl, work);
    }
}

// Adopt only within the same per-URL and concurrency budget as queued work.
function adoptRefresh(request, ctl, promise) {
    const url = request && request.url;
    if (!url || refreshSlots <= 0 || backgroundRunning.has(url)) {
        abort(ctl);
        return false;
    }
    trackRefresh(url, ctl, promise);
    return true;
}

// The next click outranks ALL previous-page traffic, including in-flight
// foreground subresources (e.g. a 779 KB tools-index.json started by the page
// the visitor just clicked away from — the browser will not unload that page or
// abort its request signals until this navigation commits, so holding those
// sockets deadlocks the commit). Let background completion handlers return their
// slots; resetting refreshSlots directly would inflate the budget.
function clearBacklog() {
    backgroundQueue.length = 0;
    backgroundRunning.forEach((ctl) => abort(ctl));
    foregroundRunning.forEach((entry) => abort(entry.ctl));
    foregroundRunning.clear();
}

// Safe signal-bearing fetch across engines. WebKit/Safari and strict Fetch
// implementations throw synchronously in `new Request(navRequest, { signal })`
// when `navRequest.mode === 'navigate'`; testing that synchronous construction
// first lets Chromium/Firefox keep the original Request while Safari falls back
// to fetching the URL string with matching same-origin manual-redirect semantics.
function fetchCancellable(request, ctl) {
    if (!ctl) return ctl ? fetch(request, { signal: ctl.signal }) : fetch(request);
    if (request && request.mode === 'navigate') {
        let canCloneNavigate = false;
        if (typeof Request === 'function' && request instanceof Request) {
            try {
                void new Request(request, { signal: ctl.signal });
                canCloneNavigate = true;
            } catch (e) {
                canCloneNavigate = false;
            }
        }
        return canCloneNavigate
            ? fetch(request, { signal: ctl.signal })
            : fetch(request.url, { signal: ctl.signal, credentials: 'same-origin', redirect: 'manual' });
    }
    return fetch(request, { signal: ctl.signal });
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
// Single-flight subresources: concurrent consumers (including separate tabs)
// share the network/cache write, but receive independent Response streams.
// Never merge document navigations or requests with different fetch semantics.
const foregroundRunning = new Map();
const FOREGROUND_LIMIT = 64;
function foreground(request, ms, cacheName, event, adopt) {
    if (request.mode === 'navigate') return fetchForeground(request, ms, cacheName, event, adopt, newAbort());
    const callerSignal = event && event.request && event.request.signal;
    if (callerSignal && callerSignal.aborted) return Promise.resolve(null);
    let key;
    try {
        key = JSON.stringify([request.url, cacheName, ms, !!adopt,
            request.mode, request.destination, request.credentials, request.cache,
            request.redirect, request.integrity, request.referrer, request.referrerPolicy,
            request.headers ? Array.from(request.headers.entries()) : []]);
    } catch (e) {
        return fetchForeground(request, ms, cacheName, event, adopt, newAbort());
    }
    let entry = foregroundRunning.get(key);
    if (!entry) {
        // Keep bookkeeping bounded even if a page requests many distinct URLs.
        if (foregroundRunning.size >= FOREGROUND_LIMIT) {
            return fetchForeground(request, ms, cacheName, event, adopt, newAbort());
        }
        const ctl = newAbort();
        const item = { pending: null, ctl, consumers: 0, untracked: 0, liveSignals: 0, adopt: !!adopt, settled: false };
        const pending = fetchForeground(request, ms, cacheName, event, adopt, ctl);
        item.pending = pending;
        foregroundRunning.set(key, item);
        const clear = () => {
            item.settled = true;
            if (foregroundRunning.get(key) === item) foregroundRunning.delete(key);
        };
        pending.then(clear, clear);
        entry = item;
    }
    entry.consumers++;
    let cleanupSignal = null;
    if (callerSignal && typeof callerSignal.addEventListener === 'function') {
        entry.liveSignals++;
        const onAbort = () => {
            entry.liveSignals = Math.max(0, entry.liveSignals - 1);
            if (!entry.settled && !entry.adopt && entry.untracked === 0 && entry.liveSignals === 0) {
                abort(entry.ctl);
            }
        };
        callerSignal.addEventListener('abort', onAbort, { once: true });
        cleanupSignal = () => {
            try { callerSignal.removeEventListener('abort', onAbort); } catch (e) {}
        };
    } else {
        entry.untracked++;
    }
    return entry.pending.then((res) => {
        if (cleanupSignal) cleanupSignal();
        entry.consumers = Math.max(0, entry.consumers - 1);
        if (!res) return null;
        return entry.consumers > 0 ? res.clone() : res;
    });
}

async function fetchForeground(request, ms, cacheName, event, adopt, ctlIn) {
    const ctl = ctlIn === undefined ? newAbort() : ctlIn;
    let settled = false;
    let saved = Promise.resolve();
    let work;
    try {
        work = fetchCancellable(request, ctl);
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
            saved = store(cacheName, request, copy);
            if (event) { try { event.waitUntil(saved); } catch (e3) { /* event over */ } }
        }
        return res || null;
    }, () => { settled = true; stats.aborted++; return null; });
    stats.network++;
    const winner = await bounded(p, ms);
    if (winner === STALLED) {
        if (!settled) {
            if (!adopt || !adoptRefresh(request, ctl, p.then(() => saved))) abort(ctl);
        }
        return null;
    }
    return winner;
}

async function cacheFirst(request, cacheName, maxAge, event) {
    const cache = await openCache(cacheName);
    const cached = await matchQuietly(cache, request);
    if (cached) {
        stats.cacheHits++;
        // Immutable-ish binaries: a copy inside the caller's maxAge is the
        // answer, and asking the origin about it is pure queue pressure.
        if (!maxAge || ageWithin(cached, maxAge)) return cached;
        startBackground(request, cacheName);
        return cached;
    }
    const net = await foreground(request, UNCACHED_PATIENCE_MS, cacheName, event);
    return net || new Response('Offline', { status: 503, statusText: 'Offline' });
}

// A deadline must stop existing when its request finishes. Promise.race with
// a bare setTimeout left one live timer per asset, even on a warm fast load.
function bounded(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(STALLED), ms);
        Promise.resolve(promise).then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
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
    const ctl = newAbort();
    let saved = Promise.resolve();
    const preloadPatience = cached ? NETWORK_PATIENCE_MS : UNCACHED_PATIENCE_MS;
    const start = () => fetchCancellable(request, ctl);
    const network = bounded(preload || Promise.resolve(null), preloadPatience)
        .then((p) => (p === STALLED || !p ? start() : p))
        .then((res) => {
            if (res && res.ok) {
                let copy = null;
                try { copy = res.clone(); } catch (e2) { copy = null; }
                if (copy) {
                    saved = store(RUNTIME_CACHE, request, copy);
                    try { if (event) event.waitUntil(saved); } catch (e3) { /* event over */ }
                }
            }
            return res || null;
        })
        .catch(() => null);

    if (!cached) {
        const first = await bounded(network, UNCACHED_PATIENCE_MS);
        if (first && first !== STALLED) { stuckRuns = 0; return first; }
        if (first === STALLED) {
            // Nothing answered in time. That is a stalled socket, not a dead
            // origin — abandon it (holding it is what made the next click worse)
            // and ask once more on a clean connection.
            abort(ctl);
            const again = await foreground(request, UNCACHED_PATIENCE_MS, RUNTIME_CACHE, event);
            if (again) { stuckRuns = 0; return again; }
        }
        // Nothing can be fetched for this URL. Offline, the cached index is a
        // real service: the visitor keeps what they already have. Online,
        // substituting it is the bug being reported — a page they never asked
        // for, at an address that does not match it. Fail honestly at the URL
        // they clicked, with their own retry one tap away.
        markStuckNavigation();
        if (self.navigator && self.navigator.onLine === false) return cachedIndex();
        return stallPage();
    }

    const winner = await bounded(network, NETWORK_PATIENCE_MS);
    if (winner === STALLED) {
        // The visitor gets the copy we already have, and the refresh is kept
        // only if the budget has room for it — that copy is what makes their
        // back-and-forth trip instant instead of another patience wait.
        if (!adoptRefresh(request, ctl, network.then(() => saved))) abort(ctl);
        stuckRuns = 0;                     // they got their page: the streak is broken
        return cached;
    }
    if (winner) stuckRuns = 0;
    return winner || cached;
}

// The online-failure page: rendered at the URL that was asked for, so the
// address bar, the back button and "Try again" all still mean what they usually
// mean. Fixed markup only — the requested path is deliberately NOT put into it
// (nothing visitor-controlled is ever interpolated into a response body).
function stallPage() {
    return new Response(
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        + '<meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<title>This did not load \u2014 try again</title></head>'
        + '<body style="font:16px/1.6 system-ui,sans-serif;margin:24px">'
        + '<p><strong>This page did not load, and it is not your connection.</strong></p>'
        + '<p>The request timed out twice. Everything already opened here still works.</p>'
        + '<p><a href="">Try again</a> &middot; <a href="./">Go to the front page</a></p>'
        + '</body></html>',
        { status: 504, statusText: 'Gateway Timeout',
          headers: { 'content-type': 'text/html; charset=utf-8' } });
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
    const age = Math.max(0, parseInt(response.headers.get('age') || '0', 10) || 0);
    // Age is time ALREADY spent at the CDN, not freshness to add back. Date
    // also advances while this response sits in CacheStorage. Use the older
    // estimate; subtracting Age could make an expired CDN response look new.
    return Math.max(0, Date.now() - date, age * 1000);
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
    if (cached && ageOf(cached) < FRESH_WINDOW_MS) { stats.cacheHits++; return cached; }

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
        stats.cacheHits++;
        // Refresh for next time, in the queue — not beside the page that is
        // loading now.
        startBackground(request, cacheName);
        return cached;
    }
    const net = await foreground(request, UNCACHED_PATIENCE_MS, cacheName, event);
    return net || new Response('Offline', { status: 503, statusText: 'Offline' });
}
