// Tests the REAL sw.js fetch handler and cache policy. Card-grid "missing
// tools" reports have twice come from this file: v4 fixed first-party code
// being pinned to the version a visitor first saw, and v5 fixes the catalogue
// and fragments being served from the copy that predates the deploy — a
// returning visitor rebuilt the grid without every tool added since their last
// visit, and nothing in the repository noticed.
//
// The shipped service worker is driven in a vm with stubbed caches/fetch/self,
// so the routing and freshness rules are pinned by behaviour, not by grepping
// for strings. Run with:
//
//   node scripts/tests/service-worker.test.js
//
// Zero dependencies (node only). No browser required.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const ORIGIN = 'https://example.test';
const CACHE_VERSION = (SRC.match(/const CACHE_VERSION = '([^']+)'/) || [])[1];
assert(CACHE_VERSION, 'could not read CACHE_VERSION from sw.js');
const STALE_MS = 60 * 60 * 1000;     // an hour old: outside any freshness window
const FRESH_MS = 60 * 1000;          // a minute old: inside GitHub Pages max-age

// ------------------------------------------------------------------ harness
function makeWorker() {
  const stores = new Map();          // cacheName -> Map(url -> Response)
  const networkCalls = [];
  const signals = [];                // {url, signal}: what the worker passed to fetch()
  const waits = [];                  // promise the worker asked the browser to hold open
  let network = () => new Response('live', { status: 200 });
  let cachesBroken = false;          // simulate a quota error / private mode
  const listeners = {};

  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (req) => {
        // The real Cache API resolves a relative match() URL against the
        // worker's location; do the same so the worker's absolute-path
        // lookups ('/index.html') find Request-keyed entries.
        const k = keyOf(req);
        const hit = m.get(k) || (k.startsWith('/') ? m.get(ORIGIN + k) : undefined);
        return hit ? hit.clone() : undefined;
      },
      put: async (req, res) => { m.set(keyOf(req), res); },
      add: async () => true,
      addAll: async () => true,
      delete: async (req) => m.delete(keyOf(req)),
      keys: async () => [...m.keys()],
    };
  };
  const keyOf = (r) => (typeof r === 'string' ? r : r.url);

  const sandbox = {
    console,
    URL,
    Request,
    Response,
    Headers,
    Date,
    Promise,
    // A real ServiceWorkerGlobalScope has AbortController; a bare vm context
    // does not, and the worker's abort-on-timeout path is untestable without it.
    AbortController,
    // The patience timers are 2.5 s / 8 s in production; scale them so the
    // tests stay fast while keeping the ordering the races depend on — the
    // uncached bound must still outlast the cached one and the preload skip,
    // or a hung preload plus a working network would resolve to the fallback
    // in the harness and the live page in production.
    setTimeout: (fn, ms) => setTimeout(fn, (ms || 0) >= 8000 ? 80 : Math.min(ms || 0, 30)),
    clearTimeout,
    caches: {
      open: async (name) => {
        if (cachesBroken) throw new Error('QuotaExceededError: the cache store cannot be opened');
        return store(name);
      },
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
      match: async (req) => {
        for (const m of stores.values()) {
          const hit = m.get(keyOf(req));
          if (hit) return hit.clone();
        }
        return undefined;
      },
    },
    fetch: (req, init) => {
      const url = typeof req === 'string' ? req : req.url;
      networkCalls.push(url);
      if (init && init.signal) signals.push({ url, signal: init.signal });
      return Promise.resolve().then(() => network(url, networkCalls.length));
    },
    self: {
      location: { origin: ORIGIN },
      navigator: { onLine: true },
      registration: { scope: ORIGIN + '/', navigationPreload: { enable: async () => {} } },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
  };
  sandbox.self.self = sandbox.self;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'sw.js' });

  const dispatch = (url, { mode = 'no-cors', preload, destination, expectResponse = true } = {}) => {
    // Node's Request constructor rejects mode:'navigate' (script cannot mint
    // navigation requests) — but that is exactly the mode every real page
    // navigation arrives in, so navigations are dispatched as the plain
    // request-like object the fetch handler actually consumes.
    // `destination` has to be set on a plain object: it is a read-like getter on
    // a real Request, and a speculation-rules prefetch arrives as
    // mode:'no-cors' + destination:'document'.
    const request = (mode === 'navigate' || destination !== undefined)
      ? { url: ORIGIN + url, method: 'GET', mode, destination: destination || 'document' }
      : new Request(ORIGIN + url, { method: 'GET', mode });
    let responded = null;
    listeners.fetch({
      request,
      preloadResponse: preload === undefined ? Promise.resolve(undefined) : preload,
      respondWith: (p) => { responded = p; },
      // A real FetchEvent keeps the worker alive for waitUntil() promises, and
      // cache writes are parked there — so a test that inspects the stores has to
      // settle them the same way the browser does.
      waitUntil: (p) => { waits.push(Promise.resolve(p).catch(() => {})); },
    });
    if (expectResponse) assert(responded, `the fetch handler did not respond for ${url}`);
    return responded;
  };

  const put = async (cacheName, url, body, ageMs) => {
    const headers = { date: new Date(Date.now() - ageMs).toUTCString() };
    const cache = await sandbox.caches.open(cacheName);
    await cache.put(new Request(ORIGIN + url), new Response(body, { status: 200, headers }));
  };

  return {
    sandbox, stores, networkCalls, signals, dispatch, put, listeners,
    // Settle every cache write the worker handed to the browser.
    drained: async () => { const p = waits.splice(0, waits.length); await Promise.all(p); },
    setNetwork: (fn) => { network = fn; },
    breakCaches: () => { cachesBroken = true; },
    setOnline: (v) => { sandbox.self.navigator.onLine = v; },
  };
}

const STATIC = `static-${CACHE_VERSION}`;
const CARDS = `cards-${CACHE_VERSION}`;
const RUNTIME = `runtime-${CACHE_VERSION}`;
const body = (res) => res.text();

(async () => {
  // ------------------------------------------------------------- routing 1
  // The catalogue is the list of tools that exist: a stale copy must never
  // win when the network can answer. This is the "loads of cards missing"
  // failure — the grid rendered yesterday's catalogue.
  {
    const w = makeWorker();
    await w.put(STATIC, '/cards/cards-lite.json', 'OLD CATALOGUE', STALE_MS);
    w.setNetwork(() => new Response('NEW CATALOGUE', { status: 200 }));
    const res = await w.dispatch('/cards/cards-lite.json');
    assert.strictEqual(await body(res), 'NEW CATALOGUE',
      'a stale cached catalogue beat the deployed one — new tools would be missing');
    assert.ok(w.networkCalls.includes(ORIGIN + '/cards/cards-lite.json'), 'the catalogue must be revalidated');
    console.log('  ok   stale catalogue: the deployed copy wins');

    // ...inside the server's own freshness window, the cached copy answers
    // with no request at all (instant repeat visits).
    const w2 = makeWorker();
    await w2.put(STATIC, '/cards/cards-lite.json', 'RECENT CATALOGUE', FRESH_MS);
    w2.setNetwork(() => new Promise((resolve) => setTimeout(() => resolve(new Response('SLOW', { status: 200 })), 200)));
    const res2 = await w2.dispatch('/cards/cards-lite.json');
    assert.strictEqual(await body(res2), 'RECENT CATALOGUE', 'a fresh cached catalogue must be served');
    console.log('  ok   fresh catalogue: served from cache, no waiting');

    // Slow network, stale copy: the cache is the safety net rather than a
    // multi-second stall behind an unresponsive origin.
    const w3 = makeWorker();
    await w3.put(STATIC, '/cards/cards-lite.json', 'CACHED WHILE SLOW', STALE_MS);
    w3.setNetwork(() => new Promise((resolve) => setTimeout(() => resolve(new Response('SLOW', { status: 200 })), 200)));
    const res3 = await w3.dispatch('/cards/cards-lite.json');
    assert.strictEqual(await body(res3), 'CACHED WHILE SLOW', 'a slow origin must fall back to the cache');
    console.log('  ok   slow origin: the cached catalogue answers');
  }

  // ------------------------------------------------------------- routing 2
  // Card fragments and first-party code follow the catalogue's policy — a
  // fixed tool must be the one the visitor sees, and a deploy must not ship a
  // new page against yesterday's app script.
  {
    const w = makeWorker();
    await w.put(CARDS, '/cards/bmi.html', 'OLD FRAGMENT', STALE_MS);
    await w.put(RUNTIME, '/home-app.js', 'OLD APP', STALE_MS);
    w.setNetwork(() => new Response('DEPLOYED', { status: 200 }));
    assert.strictEqual(await body(await w.dispatch('/cards/bmi.html')), 'DEPLOYED',
      'a stale card fragment beat the fixed one');
    assert.strictEqual(await body(await w.dispatch('/home-app.js')), 'DEPLOYED',
      'a stale app script beat the deployed one');
    console.log('  ok   fragments and first-party code: the deployed copy wins');

    // Offline: the cached copy is still there.
    const w2 = makeWorker();
    await w2.put(CARDS, '/cards/bmi.html', 'OFFLINE FRAGMENT', STALE_MS);
    w2.setNetwork(() => Promise.reject(new Error('offline')));
    assert.strictEqual(await body(await w2.dispatch('/cards/bmi.html')), 'OFFLINE FRAGMENT',
      'a cached fragment must survive an offline load');
    const w3 = makeWorker();
    w3.setNetwork(() => Promise.reject(new Error('offline')));
    const res = await w3.dispatch('/cards/never-seen.html');
    assert.strictEqual(res.status, 503, 'an uncached card with no network must 503');
    console.log('  ok   offline: cached cards serve, uncached ones 503');
  }

  // ------------------------------------------------------------- routing 2b
  // The "second click hangs" report (2026-09-21): open a tool from the home
  // page, go back, click a tool again — the tab hung. The tool page's
  // navigation had NO patience: a stalled socket held it hostage forever even
  // though the worker had a usable copy of tool.html in RUNTIME_CACHE. Every
  // navigation is now bounded — with a cached copy, the network gets
  // NETWORK_PATIENCE_MS and then the cache answers.
  {
    // A cached tool page must answer when the network never will. The worker's
    // own timeout is 2.5 s (scaled to ~30 ms in this harness); give the stall
    // ten times that before declaring the navigation hung.
    const w = makeWorker();
    await w.put(RUNTIME, '/tool.html?card=bmi', 'CACHED TOOL PAGE', STALE_MS);
    w.setNetwork(() => new Promise(() => {}));            // never settles: the hang
    const raced = await Promise.race([
      w.dispatch('/tool.html?card=bmi', { mode: 'navigate' }).then((r) => r.text()),
      new Promise((resolve) => setTimeout(() => resolve('STILL HANGING'), 300)),
    ]);
    assert.strictEqual(raced, 'CACHED TOOL PAGE',
      'a stalled network hung the second click on a tool instead of serving the cached page');
    console.log('  ok   second click: a stalled network falls back to the cached tool page');

    // ...and the same guarantee for every other navigation (index, categories):
    const w2 = makeWorker();
    await w2.put(RUNTIME, '/about.html', 'CACHED ABOUT', STALE_MS);
    w2.setNetwork(() => new Promise(() => {}));
    const raced2 = await Promise.race([
      w2.dispatch('/about.html', { mode: 'navigate' }).then((r) => r.text()),
      new Promise((resolve) => setTimeout(() => resolve('STILL HANGING'), 300)),
    ]);
    assert.strictEqual(raced2, 'CACHED ABOUT',
      'a stalled network hung a plain navigation instead of serving the cached page');
    console.log('  ok   second click: plain navigations are bounded the same way');

    // Offline (no network at all, nothing cached for that URL): the cached index
    // is the fallback so the visitor still has somewhere to be — never a bare
    // 503. (The install handler asks for './index.html', which the Cache API
    // resolves against the worker URL and stores as '/index.html'.)
    const w3 = makeWorker();
    await w3.put(STATIC, '/index.html', 'OFFLINE INDEX', STALE_MS);
    w3.setOnline(false);
    w3.setNetwork(() => Promise.reject(new Error('offline')));
    const res3 = await w3.dispatch('/tool.html?card=never-seen', { mode: 'navigate' });
    assert.strictEqual(await body(res3), 'OFFLINE INDEX',
      'an offline, uncached tool URL must fall back to the cached index');
    console.log('  ok   offline navigation: the cached index answers');

    // A *failed* request while the browser says it is online is not "offline":
    // it is a proxy, a reset, a blocked origin. Swapping in the home page for
    // that is the substitution this whole file exists to stop, so the visitor
    // keeps their URL and gets a retry instead.
    const w3b = makeWorker();
    await w3b.put(STATIC, '/index.html', 'OFFLINE INDEX', STALE_MS);
    w3b.setNetwork(() => Promise.reject(new Error('connection reset')));
    const res3b = await w3b.dispatch('/tool.html?card=never-seen', { mode: 'navigate' });
    assert.strictEqual(res3b.status, 504,
      'a failed-but-online navigation answered with a different page');
    console.log('  ok   failed navigation while online: its own URL, not the home page');
  }

  // ------------------------------------------------------------- routing 2c
  // The v19 bound covered navigations that already had a cached copy. The
  // uncached path — every first visit to a URL, which is every new
  // tool.html?card=* leg of a back-and-forth browse — still awaited the
  // network forever: one stalled socket hung the tab on a white screen, and
  // the "browse back and forth a few times and it hangs" report came back.
  // Nothing in the worker may wait on the network unbounded any more.
  //
  // v39 narrowed what that fallback is allowed to do, because the bound on its
  // own was how a *different* page ended up on screen: past the patience the
  // handler answered with the cached index for a network that was merely slow.
  // A stall now gets one retry on a fresh request (see routing 2d) and only a
  // network that cannot answer at all — offline, or a second stall — is
  // treated as unreachable. Both attempts hanging is therefore the case this
  // block describes.
  {
    // Online, a stalled first visit gets an honest failure AT THE URL THAT WAS
    // CLICKED. Serving the cached index here is what turned "the tab stalls"
    // into "the tab stalls and then shows me a page I never asked for" — the
    // 2026-10 stall report, twice 'fixed' by making this substitution more
    // eager. A page the visitor did not request is never an acceptable answer
    // for a network that is merely slow; it is only an answer for no network.
    const w = makeWorker();
    await w.put(STATIC, '/index.html', 'OFFLINE INDEX', STALE_MS);
    w.setNetwork(() => new Promise(() => {}));            // never settles: the hang
    const raced = await Promise.race([
      w.dispatch('/tool.html?card=brand-new-tool', { mode: 'navigate' }).then((r) => r.status),
      new Promise((resolve) => setTimeout(() => resolve('STILL HANGING'), 400)),
    ]);
    assert.strictEqual(raced, 504,
      'a stalled first visit while online either hung, or answered with the home page instead');
    console.log('  ok   stalled first visit, online: fails at its own URL, never the wrong page');

    // Offline, the same visitor gets the cached index — the page they can
    // actually read — which is what the fallback was originally written for.
    const wOff = makeWorker();
    await wOff.put(STATIC, '/index.html', 'OFFLINE INDEX', STALE_MS);
    wOff.setOnline(false);
    wOff.setNetwork(() => Promise.reject(new Error('offline')));
    const off = await Promise.race([
      wOff.dispatch('/tool.html?card=brand-new-tool', { mode: 'navigate' }).then((r) => r.text()),
      new Promise((resolve) => setTimeout(() => resolve('STILL HANGING'), 400)),
    ]);
    assert.strictEqual(off, 'OFFLINE INDEX', 'an offline visit lost its cached-index fallback');
    console.log('  ok   offline first visit: the cached index still answers');

    // ...and with no cached index either, the navigation still SETTLES (a 504
    // page the visitor can read and retry) rather than hanging the tab.
    const w2 = makeWorker();
    w2.setNetwork(() => new Promise(() => {}));
    const raced2 = await Promise.race([
      w2.dispatch('/tool.html?card=brand-new-tool', { mode: 'navigate' }).then((r) => r.status),
      new Promise((resolve) => setTimeout(() => resolve('STILL HANGING'), 400)),
    ]);
    assert.strictEqual(raced2, 504,
      'a stalled first visit with nothing cached must fail fast, not hang');
    console.log('  ok   stalled first visit, nothing cached: fails fast');

    // Uncached catalogue + hung network: fails fast (503) so the page renders
    // its error UI and its retry — explore.js used to wait on this fetch with
    // no timeout of its own, wedging the home list on "Searching…".
    const w3 = makeWorker();
    w3.setNetwork(() => new Promise(() => {}));
    const raced3 = await Promise.race([
      w3.dispatch('/tools-index.json').then((r) => r.status),
      new Promise((resolve) => setTimeout(() => resolve('STILL HANGING'), 400)),
    ]);
    assert.strictEqual(raced3, 503,
      'a stalled uncached catalogue fetch must fail fast so the page can render its error UI');
    console.log('  ok   stalled catalogue: fails fast for the page to handle');

    // A navigation preload that never settles must not stop the fetch from
    // starting: with a working network, the live page still wins.
    const w4 = makeWorker();
    w4.setNetwork(() => new Response('LIVE TOOL PAGE', { status: 200 }));
    const raced4 = await Promise.race([
      w4.dispatch('/tool.html?card=bmi', { mode: 'navigate', preload: new Promise(() => {}) })
        .then((r) => r.text()),
      new Promise((resolve) => setTimeout(() => resolve('STILL HANGING'), 400)),
    ]);
    assert.strictEqual(raced4, 'LIVE TOOL PAGE',
      'a hung navigation preload stopped the fetch from starting');
    console.log('  ok   hung preload: the fetch starts anyway and the live page wins');

    // The same bound for the remaining uncached fetches: fonts/images
    // (cache-first) and the default branch must settle, never hang.
    const w5 = makeWorker();
    w5.setNetwork(() => new Promise(() => {}));
    const raced5 = await Promise.race([
      w5.dispatch('/fonts/inter-latin.woff2').then((r) => r.status),
      new Promise((resolve) => setTimeout(() => resolve('STILL HANGING'), 400)),
    ]);
    assert.strictEqual(raced5, 503, 'a stalled uncached font must fail fast, not hang');
    const w6 = makeWorker();
    w6.setNetwork(() => new Promise(() => {}));
    const raced6 = await Promise.race([
      w6.dispatch('/sitemap.xml').then((r) => r.status),
      new Promise((resolve) => setTimeout(() => resolve('STILL HANGING'), 400)),
    ]);
    assert.strictEqual(raced6, 503, 'a stalled default-branch fetch must fail fast, not hang');
    console.log('  ok   stalled fonts and fallback fetches: fail fast');
  }

  // ------------------------------------------------------------- routing 2d
  // The v39 report: "after five or six clicks the tab stalls and then shows me
  // a page I did not ask for." The patience constants (v19, v21) treated the
  // symptom and *were* the wrong-page mechanism; the cause was the worker's own
  // queue. Every intercepted request started a revalidation before the
  // freshness window was even consulted, and nothing that timed out was ever
  // aborted — so a page view that answered 15 assets out of cache still put 15
  // downloads in front of the next click, and each click added more. These pin
  // the four rules that drained the queue, and the promise the fallbacks have to
  // keep: a navigation is answered with the page that was requested.
  {
    // A cache hit inside the window costs no request at all. Answering from the
    // cache while a fetch for the same URL runs beside it is what filled it.
    const w = makeWorker();
    await w.put(RUNTIME, '/home-app.js', 'CACHED APP', FRESH_MS);
    w.setNetwork(() => new Response('ASKED ANYWAY', { status: 200 }));
    assert.strictEqual(await body(await w.dispatch('/home-app.js')), 'CACHED APP');
    assert.deepStrictEqual(w.networkCalls, [],
      'a fresh cached copy still hit the network — every cache hit cost bandwidth');
    console.log('  ok   a fresh cache hit asks the origin for nothing');
  }

  {
    // A refresh nobody is waiting for goes through one queue, and a URL is only
    // refreshed once at a time: two views of a stale entry must not stack two
    // downloads of the same file.
    const w = makeWorker();
    await w.put(RUNTIME, '/sitemap.xml', 'CACHED SITEMAP', STALE_MS);
    w.setNetwork(() => new Promise(() => {}));          // the refresh never lands
    assert.strictEqual(await body(await w.dispatch('/sitemap.xml')), 'CACHED SITEMAP');
    assert.strictEqual(await body(await w.dispatch('/sitemap.xml')), 'CACHED SITEMAP');
    const refreshes = w.networkCalls.filter((u) => u === ORIGIN + '/sitemap.xml').length;
    assert.ok(refreshes <= 1,
      `two views of one stale entry started ${refreshes} refreshes — the backlog must dedupe per URL`);
    console.log(`  ok   stale entry refreshed once for two page views (${refreshes} call)`);
  }

  {
    // A request the worker stopped waiting for is aborted, not abandoned. The
    // connection it holds is the one the next click needs, and its response
    // belongs to a page the visitor has already left.
    const w = makeWorker();
    w.setNetwork(() => new Promise(() => {}));           // wedged socket
    const res = await w.dispatch('/tool.html?card=never-seen', { mode: 'navigate' });
    assert.ok(res, 'the navigation never settled');
    const held = w.signals.filter((s) => s.url === ORIGIN + '/tool.html?card=never-seen' && !s.signal.aborted);
    assert.deepStrictEqual(held, [],
      'a stalled request was left running with nobody waiting for it');
    assert.ok(w.signals.length > 0, 'the worker must hand its fetches an AbortSignal');
    console.log('  ok   a stalled request is aborted, not abandoned');
  }

  {
    // The complaint itself, at the source: an uncached navigation whose first
    // fetch merely STALLS must not be answered with the home page. A stall is
    // not offline — one retry on a fresh connection is, and the page the visitor
    // clicked is the only acceptable answer while the origin can still give it.
    const w = makeWorker();
    await w.put(STATIC, '/index.html', 'THE HOME PAGE', STALE_MS);
    w.setNetwork((url, call) => (call === 1
      ? new Promise(() => {})                                          // wedged
      : new Response('THE TOOL PAGE YOU CLICKED', { status: 200 })));  // retry answers
    const raced = await Promise.race([
      w.dispatch('/tool.html?card=bmi', { mode: 'navigate' }).then((r) => r.text()),
      new Promise((resolve) => setTimeout(() => resolve('STILL HANGING'), 900)),
    ]);
    assert.strictEqual(raced, 'THE TOOL PAGE YOU CLICKED',
      'a slow first fetch was replaced by another page instead of being retried');
    console.log('  ok   a stalled navigation is retried and gets the page that was asked for');
  }

  {
    // A cache layer that cannot be opened — quota full, private mode, a busy
    // disk — used to reject respondWith() with it, which Chromium renders as an
    // error page for the URL that was clicked. That is the "site keeps getting
    // errors" half of the report, and it got more likely with every click
    // because nothing bounded how big the stores could grow.
    const w = makeWorker();
    w.breakCaches();
    w.setNetwork(() => new Response('LIVE PAGE', { status: 200 }));
    assert.strictEqual(await body(await w.dispatch('/tool.html?card=bmi', { mode: 'navigate' })), 'LIVE PAGE',
      'a failing cache was allowed to fail a navigation');
    assert.strictEqual(await body(await w.dispatch('/home.css')), 'LIVE PAGE',
      'a failing cache was allowed to fail a stylesheet');
    console.log('  ok   a broken cache costs a cache miss, not the page');
  }

  {
    // Stores are capped: every distinct URL this site serves is a permanent
    // entry (1,389 card fragments, a tool page per card, an index per visit),
    // and with no ceiling the queue of writes only ever grew.
    const w = makeWorker();
    const cache = await w.sandbox.caches.open(RUNTIME);
    for (let i = 0; i < 500; i++) {
      await cache.put(new Request(`${ORIGIN}/fill-${i}.png`), new Response('x', { status: 200 }));
    }
    assert.ok((await cache.keys()).length > 420, 'fixture: the store must start over its ceiling');
    w.setNetwork(() => new Response('NEW', { status: 200 }));
    for (let i = 0; i < 32; i++) await body(await w.dispatch(`/prune-${i}.png`));
    await w.drained();
    const size = (await cache.keys()).length;
    assert.ok(size <= 460, `the store kept growing past its ceiling (${size} entries)`);
    console.log(`  ok   stores are capped (${size} entries after 532 puts)`);
  }

  {
    // A slow origin is paid for ONCE, not on every view of the page. Serving the
    // cached copy used to mean abandoning the refresh that was already running,
    // so the entry stayed stale and the next page view waited out the patience
    // again — the site got slower the longer someone browsed it. The refresh
    // that lost the race now finishes inside the worker's own budget, which is
    // what makes the following view cost nothing.
    const w = makeWorker();
    await w.put(RUNTIME, '/tools-index.json', 'STALE INDEX', STALE_MS);
    w.setNetwork(() => new Promise((resolve) => setTimeout(() => resolve(new Response('FRESH INDEX', {
      status: 200,
      // GitHub Pages answers with Date, and it is the entry's Date header that
      // decides whether a copy is still inside the freshness window.
      headers: { date: new Date().toUTCString() },
    })), 120)));
    assert.strictEqual(await body(await w.dispatch('/tools-index.json')), 'STALE INDEX',
      'a slow origin must not hold up the list that is already cached');
    await new Promise((resolve) => setTimeout(resolve, 250));      // the refresh lands
    assert.strictEqual(w.networkCalls.length, 1, 'the refresh after a timeout never ran');
    assert.strictEqual(await body(await w.dispatch('/tools-index.json')), 'FRESH INDEX',
      'the refreshed copy was not stored, so the next view pays for the slow origin again');
    assert.strictEqual(w.networkCalls.length, 1, 'a fresh cached copy hit the network again');
    console.log('  ok   a slow origin is paid for once, not on every view');
  }

  {
    // A hover is not a visit. The catalogue prefetches the tool page under the
    // pointer (speculation rules), and every one of those 124 KB documents used
    // to be intercepted, cached and — because the worker outlives the page that
    // asked — left running after the pointer moved on. Document requests that
    // are not navigations belong to the browser's own idle priority.
    const w = makeWorker();
    w.setNetwork(() => new Response('SHOULD NOT BE FETCHED BY THE WORKER', { status: 200 }));
    const responded = w.dispatch('/tool.html?card=bmi', { mode: 'no-cors', destination: 'document', expectResponse: false });
    assert.strictEqual(responded, null,
      'the worker intercepted a hover prefetch instead of leaving it to the browser');
    assert.deepStrictEqual(w.networkCalls, [], 'a passed-through prefetch still cost the worker a request');
    // ...while a real navigation to the same URL is still served and stored.
    const res = await w.dispatch('/tool.html?card=bmi', { mode: 'navigate' });
    assert.strictEqual(await body(res), 'SHOULD NOT BE FETCHED BY THE WORKER',
      'a navigation must still be handled, prefetch or not');
    console.log('  ok   hover prefetches are left to the browser, navigations are not');
  }

  // ------------------------------------------------------------- routing 3
  // Binaries stay cache-first: re-downloading a 48 KB font on every page view
  // to chase a change that almost never happens is the wrong trade.
  {
    const w = makeWorker();
    await w.put(RUNTIME, '/fonts/inter-latin.woff2', 'CACHED FONT', STALE_MS);
    w.setNetwork(() => new Response('FONT FROM NETWORK', { status: 200 }));
    assert.strictEqual(await body(await w.dispatch('/fonts/inter-latin.woff2')), 'CACHED FONT',
      'fonts must stay cache-first');
    assert.deepStrictEqual(w.networkCalls, [], 'a cached font must not hit the network');
    console.log('  ok   fonts stay cache-first');
  }

  // ------------------------------------------------------- offline page assets
  // A first visit fetches home.css / home-core.js before the worker controls
  // anything, so nothing had stored them: the next visit offline served the
  // cached index.html and then 503'd its own stylesheet and script — an
  // unstyled page with no cards. They are precached into the store the handler
  // serves them from, and an offline request must find them there.
  {
    const version = CACHE_VERSION.split('-')[0].replace(/^v/, '');
    const w = makeWorker();
    for (const [name, text] of [['/home.css', 'CACHED CSS'], ['/home-deferred.css', 'CACHED DEFERRED CSS'],
                                ['/risk-notices.js', 'CACHED NOTICES'], ['/explore.css', 'CACHED LIST CSS'],
                                ['/toolbox.css', 'CACHED TOOLBOX CSS'],
                                ['/explore.js', 'CACHED LIST'], ['/toolbox.js', 'CACHED TOOLBOX'],
                                ['/home-core.js', 'CACHED CORE']]) {
      await w.put(STATIC, `${name}?v=${version}`, text, 0);
    }
    w.setNetwork(() => Promise.reject(new Error('offline')));
    for (const [name, text] of [['/home.css', 'CACHED CSS'], ['/home-deferred.css', 'CACHED DEFERRED CSS'],
                                ['/risk-notices.js', 'CACHED NOTICES'], ['/explore.css', 'CACHED LIST CSS'],
                                ['/toolbox.css', 'CACHED TOOLBOX CSS'],
                                ['/explore.js', 'CACHED LIST'], ['/toolbox.js', 'CACHED TOOLBOX'],
                                ['/home-core.js', 'CACHED CORE']]) {
      const res = await w.dispatch(`${name}?v=${version}`);
      assert.strictEqual(res.status, 200, `${name} must be served offline from the precache`);
      assert.strictEqual(await body(res), text, `${name} offline body came from the wrong store`);
    }
    console.log('  ok   offline: the page\'s own CSS and scripts come from the precache');
  }

  // The precache list and the route must stay in step: every pathname in
  // PAGE_ASSET_PATHS has a precache entry built from CACHE_VERSION, exists in
  // the repository, and is routed through STATIC_CACHE.
  {
    const paths = [...((SRC.match(/const PAGE_ASSET_PATHS = \[([^\]]*)\]/) || [])[1] || '')
      .matchAll(/'([^']+)'/g)].map((m) => m[1]);
    // Eight: the four stylesheets (home.css / home-deferred.css / explore.css
    // / toolbox.css — the toolbox split of 2026-10-05 added the last), the
    // risk notices, and the four files that make the list layer work
    // (explore.js / toolbox.js / home-core.js …) — i.e. every file index.html
    // loads at ?v=. This count is the tripwire for exactly the change of
    // 2026-09-21 — the assets a page loads and the assets the worker precaches
    // have to be the same set, or a returning visitor gets a 503 for their own
    // toolbox.
    assert.strictEqual(paths.length, 8, `expected 8 page assets, found ${paths.length}`);
    assert.ok(SRC.includes("const PAGE_VERSION = CACHE_VERSION.split('-')[0]"),
      'PAGE_VERSION must be derived from CACHE_VERSION, or a deploy serves the old version');
    for (const name of paths) {
      assert.ok(SRC.includes(`\`./${name.slice(1)}?v=\${PAGE_VERSION}\``),
        `${name} is routed through STATIC_CACHE but not precached into it`);
      const file = name.replace(/^\//, '');
      assert.ok(fs.existsSync(file), `${name} is precached but is not in the repository`);
    }
    assert.ok(/PAGE_ASSET_PATHS\.includes\(url\.pathname\)/.test(SRC),
      'the fetch handler must branch on PAGE_ASSET_PATHS');
    console.log(`  ok   page assets are precached, routed and versioned (${paths.join(', ')})`);
  }

  // ------------------------------------------------------------- precache
  // Every precache entry is fetched with cache:'reload' (bypassing the HTTP
  // cache) on install, so an entry the fetch handler never reads out of this
  // cache is a second full download per install — that used to be the app
  // script, the risk notices and both fonts, downloaded again in the
  // background while the first screen's tools were still arriving.
  {
    const list = (SRC.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/) || [])[1] || '';
    const urls = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.ok(urls.length > 0, 'PRECACHE_URLS is empty');
    const allowed = new Set(['./index.html', './cards/cards-lite.json']);
    for (const u of urls) {
      assert.ok(allowed.has(u),
        `${u} is precached but served from RUNTIME_CACHE/CARDS_CACHE — remove it or route it here`);
    }
    console.log(`  ok   precache holds only what STATIC_CACHE serves (${urls.length} URLs)`);
  }

  // ── the diagnostics contract (sw-check.html reads these exact fields) ──────
  // A self-serve check page is only trustworthy if the numbers it prints cannot
  // silently become zeros: a diagnostics page that reports PASS because the
  // message shape drifted is worse than no page at all, so the shape is pinned
  // here against the real worker.
  {
    const tick = (ms) => new Promise((r) => setTimeout(r, ms));
    const w = makeWorker();
    let reply = null;
    w.listeners.message({ data: { type: 'mp:stats' }, source: { postMessage: (m) => { reply = m; } } });
    await tick(20);
    assert.ok(reply && reply.type === 'mp:stats', 'the worker did not answer mp:stats');
    const d = reply.data;
    for (const k of ['cacheVersion', 'cacheHits', 'network', 'refreshes', 'aborted', 'fallbacks',
                     'disarmed', 'disarmedUntil', 'sizes']) {
      assert.ok(k in d, `mp:stats replies without "${k}" — sw-check.html reads it and would show zeros as a pass`);
    }
    assert.equal(typeof d.cacheHits, 'number');
    assert.equal(typeof d.sizes, 'object');
    const stores = Object.keys(d.sizes);
    for (const name of ['static', 'cards', 'runtime']) {
      assert.ok(stores.some((k) => k.startsWith(name + '-')), `mp:stats does not report the ${name} store`);
    }
    assert.equal(d.fallbacks, 0, 'a clean start should report no fallbacks');

    // …and the counter has to move when the worker really does fall back, or the
    // page's one meaningful number measures nothing.
    w.setNetwork(() => new Promise(() => {}));            // nothing ever answers
    for (let i = 0; i < 3; i++) { await w.dispatch('/categories/survival-and-emergency-readiness.html', { mode: 'navigate' }); }
    reply = null;
    w.listeners.message({ data: { type: 'mp:stats' }, source: { postMessage: (m) => { reply = m; } } });
    await tick(20);
    assert.ok(reply.data.fallbacks >= 3,
      `three stuck navigations reported ${reply.data.fallbacks} fallback(s) — the counter the page shows is not the fallback path`);
    assert.ok(reply.data.disarmedUntil > Date.now(),
      'after three fallbacks the worker must report its cool-off, or the page cannot say it stood down');
    console.log(`  ok   mp:stats answers with the fields sw-check.html reads (${d.cacheVersion}), and counts fallbacks`);

    // A message that is not ours must be ignored without throwing (a page can
    // post anything; an exception here is an unhandled rejection in the worker).
    let threw = null;
    try {
      w.listeners.message({ data: { type: 'something-else' }, source: null });
      w.listeners.message({ data: null, source: null });
      w.listeners.message({ source: null });
    } catch (e) { threw = e; }
    assert.equal(threw, null, `an unrelated message took the worker down: ${threw && threw.message}`);
  }

  // ------------------------------------------------------------- discipline
  {
    assert.match(CACHE_VERSION, /^v\d+-/, 'CACHE_VERSION must be bumped when the policy changes');
    assert.ok(SRC.includes('function freshFast'), 'freshFast() must exist — the routing above depends on it');
    console.log(`  ok   cache version ${CACHE_VERSION} declared`);
  }

  console.log('\nservice-worker tests passed');
})().catch((err) => {
  console.error('\nservice-worker tests FAILED:', err && err.message);
  process.exit(1);
});
