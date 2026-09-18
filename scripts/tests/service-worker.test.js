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
  let network = () => new Response('live', { status: 200 });
  const listeners = {};

  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (req) => {
        const hit = m.get(keyOf(req));
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
    // The patience timer is 2.5 s in production; scale it so the tests stay
    // fast while keeping the ordering the race depends on.
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 30)),
    clearTimeout,
    caches: {
      open: async (name) => store(name),
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
    fetch: (req) => {
      const url = typeof req === 'string' ? req : req.url;
      networkCalls.push(url);
      return Promise.resolve().then(() => network(url));
    },
    self: {
      location: { origin: ORIGIN },
      registration: { scope: ORIGIN + '/', navigationPreload: { enable: async () => {} } },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
  };
  sandbox.self.self = sandbox.self;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'sw.js' });

  const dispatch = (url, { mode = 'no-cors' } = {}) => {
    const request = new Request(ORIGIN + url, { method: 'GET', mode });
    let responded = null;
    listeners.fetch({ request, preloadResponse: Promise.resolve(undefined), respondWith: (p) => { responded = p; } });
    assert(responded, `the fetch handler did not respond for ${url}`);
    return responded;
  };

  const put = async (cacheName, url, body, ageMs) => {
    const headers = { date: new Date(Date.now() - ageMs).toUTCString() };
    const cache = await sandbox.caches.open(cacheName);
    await cache.put(new Request(ORIGIN + url), new Response(body, { status: 200, headers }));
  };

  return { sandbox, stores, networkCalls, dispatch, put, setNetwork: (fn) => { network = fn; } };
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
  // A first visit fetches home.css / home-app.js before the worker controls
  // anything, so nothing had stored them: the next visit offline served the
  // cached index.html and then 503'd its own stylesheet and script — an
  // unstyled page with no cards. They are precached into the store the handler
  // serves them from, and an offline request must find them there.
  {
    const version = CACHE_VERSION.split('-')[0].replace(/^v/, '');
    const w = makeWorker();
    for (const [name, text] of [['/home.css', 'CACHED CSS'], ['/home-deferred.css', 'CACHED DEFERRED CSS'],
                                ['/home-app.js', 'CACHED APP'], ['/home-features.js', 'CACHED FEATURES'],
                                ['/risk-notices.js', 'CACHED NOTICES']]) {
      await w.put(STATIC, `${name}?v=${version}`, text, 0);
    }
    w.setNetwork(() => Promise.reject(new Error('offline')));
    for (const [name, text] of [['/home.css', 'CACHED CSS'], ['/home-deferred.css', 'CACHED DEFERRED CSS'],
                                ['/home-app.js', 'CACHED APP'], ['/home-features.js', 'CACHED FEATURES'],
                                ['/risk-notices.js', 'CACHED NOTICES']]) {
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
    assert.strictEqual(paths.length, 5, `expected 5 page assets, found ${paths.length}`);
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
