// Session soak for sw.js — the test that would have caught the stall report.
//
// service-worker.test.js pins one behaviour at a time. The bug that took three
// attempts to fix needed none of that: every individual fetch was bounded,
// looked deduped and was correct. What was wrong was the SESSION — the work the
// worker left running after a page went away, and what that did to the click
// that came next. So this file drives a whole browse (home, tool, home, tool …)
// through the real worker against a modelled origin with a real connection
// budget, and asserts the four properties that make the report impossible:
//
//   1. NO ORPHANS    — when a page view ends, the fetches it started are either
//                      finished or aborted, with at most the worker's small
//                      refresh budget still running;
//   2. NO GROWTH     — the origin's queue at click N is no deeper than at click
//                      1, so browsing faster cannot make the next click worse;
//   3. THE RIGHT PAGE — every navigation resolves to the document that was
//                      asked for, never a cached substitute;
//   4. A HIT IS FREE  — a warm page view asks the origin for (almost) nothing,
//                      instead of re-downloading itself for the cache's benefit.
//
// Then the escape hatch: a worker that can only answer with fallbacks disarms
// itself and stops intercepting, because a site with no service worker still
// works and a site behind a stuck one does not.
//
//   node scripts/tests/service-worker-session.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const ORIGIN = 'https://soak.test';
const CACHE_VERSION = (SRC.match(/const CACHE_VERSION = '([^']+)'/) || [])[1];
assert(CACHE_VERSION, 'could not read CACHE_VERSION from sw.js');
const STATIC = `static-${CACHE_VERSION}`;
const CARDS = `cards-${CACHE_VERSION}`;
const RUNTIME = `runtime-${CACHE_VERSION}`;

// Patience is 2.5 s / 8 s in production; a soak must run in seconds, so the
// worker's timers are scaled. The ORDER is what the behaviour depends on (a
// cached copy beats a stalled network, a cold visit waits longer than a warm
// one), and scaling preserves it.
const SCALE = 1 / 100;
const CLICKS = 12;
const ORIGIN_BUDGET = 6;            // sockets per origin; also Chrome's per-group stream cap
const ORIGIN_MS = 8;                // service time for one request at the origin

// What a page view asks for, read from the shipped HTML rather than from a list
// anyone has to remember to update: if a page starts loading another big
// dependency, the soak's numbers move with it.
function assetList(file, extra = []) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const urls = new Set();
  for (const tag of html.matchAll(/<(?:script|link|img)[^>]*>/g)) {
    const attr = /(?:src|href)\s*=\s*"([^"]+)"/.exec(tag[0]);
    if (!attr) continue;
    const href = attr[1];
    if (/^(https?:|data:|mailto:|#)/.test(href)) continue;
    if (/rel="(canonical|manifest|alternate)"/.test(tag[0])) continue;
    if (/rel="preload"/.test(tag[0]) && !/as="font"/.test(tag[0])) continue;
    urls.add('/' + href.replace(/^\.\//, '').replace(/^\//, ''));
  }
  for (const e of extra) urls.add(e);
  return [...urls];
}

class Origin {
  constructor(limit, log, serviceMs = ORIGIN_MS) {
    this.limit = limit; this.busy = 0; this.q = []; this.log = log;
    this.peakQueue = 0; this.served = 0; this.serviceMs = serviceMs;
  }
  get pending() { return this.q.length + this.busy; }
  send(url, signal) {
    return new Promise((resolve, reject) => {
      const job = { url, resolve, reject, dead: false };
      if (signal) {
        if (signal.aborted) { reject(new Error('aborted')); return; }
        signal.addEventListener('abort', () => {
          job.dead = true;
          const i = this.q.indexOf(job);
          if (i >= 0) this.q.splice(i, 1);
          reject(new Error('aborted'));
        }, { once: true });
      }
      this.q.push(job);
      this.peakQueue = Math.max(this.peakQueue, this.q.length + this.busy);
      this.pump();
    });
  }
  pump() {
    while (this.busy < this.limit && this.q.length) {
      const job = this.q.shift();
      if (job.dead) continue;
      this.busy++;
      setTimeout(() => {
        this.busy--; this.served++;
        if (!job.dead) {
          const rec = this.log.find((r) => r.url === job.url && !r.settled && !r.aborted);
          if (rec) rec.settled = true;
          job.resolve();
        }
        this.pump();
      }, this.serviceMs);
    }
  }
}

function makeWorker(origin, log) {
  const stores = new Map();
  const listeners = {};
  const handle = { unregistered: false, online: true };
  const keyOf = (r) => (typeof r === 'string' ? r : r.url);
  const stamp = () => new Date().toUTCString();
  const asRes = (e) => new Response(e.body, { status: 200, headers: { date: e.date, age: '0' } });

  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (req) => { const hit = m.get(keyOf(req)); return hit ? asRes(hit) : undefined; },
      // Keep the bytes: "is this the page that was asked for?" has to be a
      // question about the body, not about the key.
      put: async (req, res) => { m.set(keyOf(req), { body: await res.text(), date: stamp() }); },
      add: async () => {}, addAll: async () => {},
      delete: async (k) => m.delete(keyOf(k)),
      keys: async () => [...m.keys()],
    };
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    URL, Request, Response, Headers, Date, Promise, clearTimeout, AbortController,
    setTimeout: (fn, ms) => setTimeout(fn, Math.max(0, Math.round((ms || 0) * SCALE))),
    caches: {
      open: async (name) => store(name),
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
    },
    // Every fetch the worker starts is recorded and stays in the log, so the
    // soak can ask the question that matters at the end of a page view: is
    // anything in here neither settled nor aborted?
    fetch: (req, init) => {
      const url = typeof req === 'string' ? req : req.url;
      const rec = { url, settled: false, aborted: false, signal: init && init.signal };
      log.push(rec);
      return origin.send(url, rec.signal).then(
        () => { rec.settled = true; return new Response('PAGE:' + url, { status: 200, headers: { date: stamp() } }); },
        (e) => { rec.aborted = /abort/i.test(String(e && e.message)); throw e; }
      );
    },
    self: {
      location: { origin: ORIGIN },
      navigator: { get onLine() { return handle.online; } },
      registration: {
        scope: ORIGIN + '/',
        navigationPreload: { enable: async () => {} },
        unregister: async () => { handle.unregistered = true; },
      },
      addEventListener: (t, f) => { listeners[t] = f; },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
  };
  sandbox.self.self = sandbox.self;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'sw.js' });

  return {
    sandbox, stores, handle, listeners,
    setOnline: (v) => { handle.online = v; },
    openStore: (name) => store(name),
    totalEntries: () => [...stores.values()].reduce((n, m) => n + m.size, 0),
    dispatch: (url, mode = 'no-cors') => {
      // Requests are minted as plain objects: a navigation needs mode:'navigate'
      // (which Request rejects in Node) and the soak must also be able to model
      // destination, which is read-only on a real Request.
      const request = { url: ORIGIN + url, method: 'GET', mode, destination: mode === 'navigate' ? 'document' : '' };
      let responded = null;
      listeners.fetch({
        request,
        preloadResponse: Promise.resolve(undefined),
        respondWith: (p) => { responded = p; },
        waitUntil: () => {},
      });
      return responded;
    },
  };
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const log = [];
  const origin = new Origin(ORIGIN_BUDGET, log);
  const w = makeWorker(origin, log);

  const homeAssets = assetList('index.html', ['/tools-index.json', '/cards/cards-lite.json', '/intents.json']);
  const toolAssets = assetList('tool.html', ['/cards/cards-lite.json', '/cards/bmi.html', '/api/tools/bmi.json']);
  const views = [
    { doc: '/tool.html?card=bmi', assets: toolAssets },
    { doc: '/index.html', assets: homeAssets },
  ];
  assert.ok(homeAssets.length > 5 && toolAssets.length > 3, 'soak found no page assets to drive');

  // Warm the stores the way a returning visitor has them — every entry present
  // and inside the freshness window, which is the exact state in which the old
  // worker still downloaded everything again. All three stores are filled
  // because each kind of URL is served out of a different one.
  for (const v of views) {
    for (const name of [STATIC, CARDS, RUNTIME]) {
      const cache = await w.sandbox.caches.open(name);
      for (const u of [v.doc, ...v.assets]) {
        await cache.put(new Request(ORIGIN + u), new Response('CACHED:' + u, { status: 200 }));
      }
    }
  }
  const warmed = w.totalEntries();
  assert.ok(warmed > 10, 'soak failed to warm the caches');

  const perClick = [];
  for (let i = 0; i < CLICKS; i++) {
    const v = views[i % views.length];
    const before = log.length;
    const queueAtClick = origin.pending;

    const nav = w.dispatch(v.doc, 'navigate');
    for (const u of v.assets) w.dispatch(u);                 // the page's own subresources
    const res = await nav;
    const body = await res.text();
    await settle(100);                                        // the visitor reads, then clicks on
    const added = log.slice(before);
    perClick.push({
      doc: v.doc,
      queueAtClick,
      requests: added.length,
      unresolved: added.filter((r) => !r.settled && !r.aborted).length,
      served: body,
      rightPage: body.endsWith(v.doc),
    });
  }

  await settle(300);                                          // let the last refreshes land
  const stillRunning = log.filter((r) => !r.settled && !r.aborted);

  // 1 ─ no orphans. A page view may keep its refresh budget busy; it may not
  // leave requests running because nobody cancelled them. The old worker left
  // one per asset per view, and they never stopped.
  const worstUnresolved = Math.max(...perClick.map((p) => p.unresolved));
  assert.ok(worstUnresolved <= 3,
    `a page view left ${worstUnresolved} requests running after the visitor moved on — that is the queue that starves the next click`);
  console.log(`  ok   no orphaned requests (worst page view left ${worstUnresolved}; the refresh budget is 2)`);

  // 2 ─ no growth: the queue at click 12 is no deeper than at click 1.
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const first = mean(perClick.slice(0, 3).map((p) => p.queueAtClick));
  const last = mean(perClick.slice(-3).map((p) => p.queueAtClick));
  assert.ok(last <= first + 3,
    `the origin's queue grew as the session went on (${first.toFixed(1)} at the start, ${last.toFixed(1)} after ${CLICKS} clicks)`);
  console.log(`  ok   the queue does not grow with clicks (${first.toFixed(1)} → ${last.toFixed(1)} pending at click time)`);

  // 3 ─ the right page, every time.
  const wrong = perClick.filter((p) => !p.rightPage);
  assert.strictEqual(wrong.length, 0,
    wrong.length ? `a navigation was answered with something else (${wrong[0].doc} → ${String(wrong[0].served).slice(0, 70)})` : '');
  console.log(`  ok   every navigation returned the document that was asked for (${CLICKS}/${CLICKS})`);

  // 4 ─ a cache hit is free.
  const maxPerView = Math.max(...perClick.map((p) => p.requests));
  const avgAssets = Math.round((views[0].assets.length + views[1].assets.length) / 2) + 1;
  assert.ok(maxPerView <= Math.ceil(avgAssets * 0.6),
    `a warm page view still asked the origin for ${maxPerView} of its ~${avgAssets} files — cache hits are costing bandwidth`);
  console.log(`  ok   a warm view costs the origin ≤${maxPerView} request(s) across ~${avgAssets} assets`);

  assert.ok(stillRunning.length <= 3, `the session ended with ${stillRunning.length} requests still running`);
  console.log('  ok   the session goes quiet once the browsing stops');

  // ── phase 2: a congested origin, which is when the report happened ────────
  // An idle origin makes the orphan rule vacuous: the abandoned requests finish
  // before anyone notices. Under a real demo connection the opposite is true —
  // the work is still running when the next click arrives — so this phase asks
  // the one question that separates the two designs: when a page view ENDS, is
  // every request it started either finished or cancelled? The old worker left
  // a request per asset running for a page nobody was looking at any more; this
  // worker may hold only its refresh budget.
  {
    origin.serviceMs = 900;                        // congested: nothing finishes inside the view
    for (let i = 0; i < 2; i++) {
      const v = views[i % views.length];
      const before = log.length;
      const nav = w.dispatch(v.doc, 'navigate');
      for (const u of v.assets) w.dispatch(u);
      await nav.catch(() => null);
      const added = log.slice(before);
      await settle(150);                            // the visitor clicks on, mid-download
      const running = added.filter((r) => !r.settled && !r.aborted);
      assert.ok(running.length <= 3,
        `a page view left ${running.length} requests running against a congested origin — ` +
        'abandoned downloads are what starved the next click');
      if (i === 0) console.log(`  ok   a congested origin: a view leaves ≤${running.length} request(s) running (was one per asset)`);
    }
    origin.serviceMs = ORIGIN_MS;
    await settle(200);
  }

  // ── the escape hatch ──────────────────────────────────────────────────────
  // Three navigations the worker could only answer with a fallback means the
  // worker is the problem. It then stops intercepting and releases the
  // registration: the visitor gets the plain static site, which works.
  {
    const log2 = [];
    const origin2 = new Origin(0, log2);      // an origin that never picks anything up
    const w2 = makeWorker(origin2, log2);
    for (let i = 0; i < 3; i++) {
      const res = await w2.dispatch('/tool.html?card=slow-' + i, 'navigate');
      assert.strictEqual(res.status, 504, 'a stuck navigation should fail honestly at its own URL');
      await settle(40);
    }
    await settle(120);
    assert.strictEqual(w2.dispatch('/index.html', 'navigate'), null,
      'after repeated fallbacks the worker kept intercepting instead of disarming');
    assert.strictEqual(w2.dispatch('/home.css'), null, 'the disarmed worker still intercepted stylesheets');
    assert.ok(w2.handle.unregistered, 'the disarmed worker never gave the pages back to the browser');
    console.log('  ok   three stuck navigations and the worker gets out of the way');
  }

  // ── a broken worker must never become a broken page ───────────────────────
  // An exception inside the routing used to reject respondWith(), which Chromium
  // renders as a failed navigation for a URL that no-worker browsing loads fine.
  {
    const log3 = [];
    const origin3 = new Origin(ORIGIN_BUDGET, log3);
    const w3 = makeWorker(origin3, log3);
    w3.sandbox.URL = undefined;               // the first thing route() touches
    const p = w3.dispatch('/index.html', 'navigate');
    assert.strictEqual(p, null, 'an exception in the worker escaped into the navigation');
    console.log('  ok   a throwing worker passes the request through instead of failing it');
  }

  console.log('\nservice-worker session soak passed');
  process.exit(0);
})().catch((e) => { console.error('\nservice-worker session soak FAILED:', e && e.message); process.exit(1); });
