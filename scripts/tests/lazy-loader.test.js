// Tests the REAL lazy-loading functions extracted out of home-app.js (the
// externalised homepage application that index.html loads with `defer`).
//
// These drive the shipped source with DOM stubs rather than reimplementing it,
// so a change to home-app.js that breaks the loader breaks this test. Run with:
//
//   node scripts/tests/lazy-loader.test.js
//
// Zero dependencies (node only). No browser required.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const APP = path.join(__dirname, '..', '..', 'home-app.js');
const html = fs.readFileSync(APP, 'utf8');

// A Proxy whose unknown identifiers resolve to a no-op, contextified so it can
// be used as a vm global. That lets the extracted functions run without
// dragging in the rest of the app.
function context(obj) {
  const proxy = new Proxy(obj, {
    has: () => true,
    // Fall back to the real global for built-ins (Math, Date, parseInt, ...)
    // so the extracted code behaves as it does in a browser; only genuinely
    // unknown app identifiers become a no-op.
    get: (t, k) => (k in t ? t[k]
      : (k in globalThis && typeof globalThis[k] !== 'undefined' ? globalThis[k] : () => {})),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  vm.createContext(proxy);
  return proxy;
}

function run(src, obj, name) {
  return vm.runInContext(src, context(obj), { filename: name });
}

function grab(name) {
  const m = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n`));
  assert(m, `could not extract ${name}() from home-app.js — has it been renamed?`);
  return m[0];
}

// The shipped concurrency cap, read from the real source — not assumed.
const capMatch = html.match(/const MAX_CONCURRENT_LOADS = (\d+);/);
assert(capMatch, 'could not read MAX_CONCURRENT_LOADS from home-app.js');
const SHIPPED_CAP = parseInt(capMatch[1], 10);
assert.ok(SHIPPED_CAP >= 1 && SHIPPED_CAP <= 16,
  `MAX_CONCURRENT_LOADS=${SHIPPED_CAP} is outside sane bounds`);

// ---------------------------------------------------------------- card stub
const STUB = { innerHeight: 900 };
// Every getBoundingClientRect() a sweep performs. The real grid measures
// ~1,190 pending cards per sweep, and each read forces layout — so the tests
// below can pin exactly when measuring is allowed to happen.
let rectReads = 0;

function makeCard(name, { top, height, width = 300, hidden = false, failed = false, connected = true }) {
  const card = {
    dataset: { name },
    style: { display: hidden ? 'none' : '' },
    isConnected: connected,
    classes: new Set(),
    getBoundingClientRect: () => { rectReads++; return { top, bottom: top + height, height, width }; },
  };
  if (failed) card.dataset.errorReason = 'load';
  card.classList = {
    add: c => card.classes.add(c),
    remove: c => card.classes.delete(c),
    contains: c => card.classes.has(c),
  };
  return card;
}

// ---------------------------------------------------------------- suite 1
// scrollFallbackLoader: visible-first ordering, the concurrency cap, and what
// it skips (hidden, zero-rect, failed, finished).
{
  const queued = [];
  let errSweeps = 0;
  const loadedCards = new Set();
  const loadingCards = new Set();

  // The shipped loader state the sweep reads: activeLoads / loadQueue decide
  // whether a load slot is free, so the harness keeps them mutable.
  const runtime = {
    loadedCards, loadingCards,
    loadCard: (card, name) => queued.push(name),
    isCardHidden: card => card.style.display === 'none',
    retryErroredCards: () => { errSweeps++; },
    MAX_CONCURRENT_LOADS: SHIPPED_CAP,
    activeLoads: 0,
    loadQueue: [],
    window: { get innerHeight() { return STUB.innerHeight; } },
    // Whether the grid is allowed to lay out any more tools at all (the mount
    // window — parked tools are not part of this answer,
    // suite 6) is the other thing that can stop a sweep. Suites 1-5 hold it
    // open; suite 6 drives the shipped function against a closed budget.
    mountBudgetFree: () => true,
    pumpWarmSoon: () => {},
  };

  const api = run(
    'let scrollLoadActive = false;\nlet pendingCards = [];\n'
    + grab('scrollFallbackLoader')
    + '\n;({ scrollFallbackLoader,'
    + ' __setPending: v => { pendingCards = v; },'
    + ' __getPending: () => pendingCards,'
    + ' __reset: () => { scrollLoadActive = false; } });',
    runtime, 'scrollFallbackLoader');

  // Visible cards load nearest-to-centre first, capped at MAX_CONCURRENT_LOADS.
  STUB.innerHeight = 900;
  api.__setPending(Array.from({ length: 10 },
    (_, i) => makeCard(`c${i}`, { top: i * 100, height: 90 })));
  queued.length = 0; errSweeps = 0; api.__reset();
  api.scrollFallbackLoader();
  assert.strictEqual(queued.length, SHIPPED_CAP,
    `expected the ${SHIPPED_CAP}-card concurrency cap, got ${queued.length}`);
  // Nearest to the 450px centre first: c4 (400-490) then c5/c3...
  assert.strictEqual(queued[0], 'c4', `expected nearest-first, got ${queued.join(',')}`);
  assert.strictEqual(errSweeps, 1, 'every viewport sweep must also sweep errored cards');
  console.log(`  ok   nearest-first ordering, capped at ${SHIPPED_CAP}, error sweep wired in`);

  // Lookahead still fills the pipeline when little is visible.
  api.__setPending([
    makeCard('visible', { top: 100, height: 90 }),
    makeCard('ahead', { top: 1100, height: 90 }),     // inside the +500 lookahead
    makeCard('far', { top: 90000, height: 90 }),      // beyond it: must wait
  ]);
  queued.length = 0; api.__reset();
  api.scrollFallbackLoader();
  assert.deepStrictEqual(queued, ['visible', 'ahead'],
    `lookahead wrong, got ${queued.join(',')}`);
  console.log('  ok   lookahead queued, far cards left pending');

  // Filtered-out cards are display:none; their rect would otherwise match the
  // viewport test and load tools the user filtered away.
  api.__setPending([
    makeCard('shown', { top: 100, height: 90 }),
    makeCard('hidden', { top: 120, height: 90, hidden: true }),
  ]);
  queued.length = 0; api.__reset();
  api.scrollFallbackLoader();
  assert.deepStrictEqual(queued, ['shown'], `hidden card must not load, got ${queued.join(',')}`);
  console.log('  ok   filtered-out cards skipped');

  // Zero-rect cards (display:none without the flag, detached layout) match
  // every viewport test — they must be skipped, not loaded.
  api.__setPending([
    makeCard('shown', { top: 100, height: 90 }),
    makeCard('flat', { top: 120, height: 0, width: 0 }),
  ]);
  queued.length = 0; api.__reset();
  api.scrollFallbackLoader();
  assert.deepStrictEqual(queued, ['shown'], `zero-rect card must not load, got ${queued.join(',')}`);
  console.log('  ok   zero-rect cards skipped');

  // Failed cards belong to the bounded error sweep, not the bulk loader —
  // otherwise every scroll refetches a permanently broken card forever.
  api.__setPending([
    makeCard('shown', { top: 100, height: 90 }),
    makeCard('failed', { top: 120, height: 90, failed: true }),
  ]);
  queued.length = 0; api.__reset();
  api.scrollFallbackLoader();
  assert.deepStrictEqual(queued, ['shown'], `failed card must not reload, got ${queued.join(',')}`);
  console.log('  ok   failed cards left for the bounded error sweep');

  // Finished cards are pruned so the pending list shrinks over time instead
  // of re-walking every entry on each scroll.
  loadedCards.add('done');
  api.__setPending([
    makeCard('done', { top: 100, height: 90 }),
    makeCard('todo', { top: 200, height: 90 }),
  ]);
  queued.length = 0; api.__reset();
  api.scrollFallbackLoader();
  assert.deepStrictEqual(queued, ['todo']);
  assert.deepStrictEqual([...api.__getPending().map(c => c.dataset.name)], ['todo'],
    'finished cards must be pruned from the pending list');
  loadedCards.clear();
  console.log('  ok   finished cards pruned from the pending list');

  // A saturated pipeline (every slot busy, more work already queued) cannot
  // start anything, so the sweep must not measure the grid at all — on the
  // real catalogue that was 1,190 getBoundingClientRect() calls per scroll
  // frame, all of them for cards it could not load.
  runtime.activeLoads = SHIPPED_CAP;
  runtime.loadQueue = new Array(40).fill({ card: null, cardName: 'queued' });
  api.__setPending(Array.from({ length: 400 },
    (_, i) => makeCard(`s${i}`, { top: i * 100, height: 90 })));
  queued.length = 0; errSweeps = 0; api.__reset();
  const readsBefore = rectReads;
  api.scrollFallbackLoader();
  assert.strictEqual(rectReads, readsBefore,
    `saturated sweep measured ${rectReads - readsBefore} card(s) it could not start`);
  assert.strictEqual(queued.length, 0, 'a saturated sweep must not queue work');
  assert.strictEqual(errSweeps, 1, 'the errored-card retry sweep still runs');
  console.log('  ok   saturated pipeline: no layout reads, nothing queued');

  // ...and the moment a slot frees up the sweep measures and loads again, so
  // skipping the measurement can never strand a card.
  runtime.activeLoads = SHIPPED_CAP - 1;
  runtime.loadQueue = [];
  api.__reset();
  const readsIdle = rectReads;
  api.scrollFallbackLoader();
  assert.ok(rectReads > readsIdle, 'a free slot must trigger measuring again');
  assert.ok(queued.length > 0, 'a free slot must start a load');
  console.log('  ok   a free slot re-enables measuring and starts a load');

  runtime.activeLoads = 0;
  runtime.loadQueue = [];
}

// ---------------------------------------------------------------- suite 2
// onScrollLazyLoad must coalesce a burst of scroll events into one sweep per
// frame (rAF throttle), and the sweep must still run after scrolling stops.
{
  const rafQueue = [];
  let passes = 0;

  const api = run(
    'let scrollLoadActive = false;\nlet scrollRafPending = false;\n'
    + grab('onScrollLoad') + '\n' + grab('onScrollLazyLoad')
    + '\n;({ onScrollLazyLoad });',
    {
      scrollFallbackLoader: () => { passes++; },
      requestAnimationFrame: cb => { rafQueue.push(cb); return rafQueue.length; },
    }, 'onScrollLazyLoad');

  const flush = () => { while (rafQueue.length) rafQueue.shift()(); };

  // A burst of 21 scroll events coalesces to a single scheduled sweep.
  for (let i = 0; i < 21; i++) api.onScrollLazyLoad();
  assert.strictEqual(rafQueue.length, 1,
    `expected 1 coalesced sweep, got ${rafQueue.length}`);
  assert.strictEqual(passes, 0, 'sweep must wait for the animation frame');
  flush();
  assert.strictEqual(passes, 1, 'expected the sweep to run on the frame');
  console.log('  ok   scroll burst coalesced into one sweep per frame');

  // And scrolling after the frame schedules a fresh sweep (nothing is lost).
  api.onScrollLazyLoad();
  flush();
  assert.strictEqual(passes, 2, 'expected a further sweep after more scrolling');
  console.log('  ok   further scrolling schedules a fresh sweep');
}

// ---------------------------------------------------------------- suite 6
// The mount window: the grid lays out a windowful of tools around the viewport
// and no more. A parked tool does NOT count against the window — that is the
// whole reason the page can say "all 1,194 running" without putting 1,194 tools
// on screen — and ⚡ Run all or ?park=off lift it, because both are the visitor
// asking for the window to be the page.
{
  const read = (key) => {
    const m = html.match(new RegExp(key + ':\\s*(\\d+)'));
    assert(m, `could not read ${key} from home-app.js`);
    return parseInt(m[1], 10);
  };
  const WINDOW = read('MOUNT_WINDOW_DEFAULT');
  const WMIN = read('MOUNT_WINDOW_MIN');
  const WMAX = read('MOUNT_WINDOW_MAX');
  assert.ok(WINDOW >= 8,
    `MOUNT_WINDOW_DEFAULT=${WINDOW} is smaller than a mosaic screenful, so the grid would stop before the fold`);
  assert.ok(WMIN <= WINDOW && WINDOW <= WMAX && WMAX >= 16,
    `the window governor must have a real range to work in (${WMIN}..${WMAX}, default ${WINDOW})`);

  const grabFn = (name) => {
    const m = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n`));
    assert(m, `could not extract ${name}() from home-app.js`);
    return m[0];
  };

  const budgetSrc = 'let explicitRunAll = false;\nlet parkMode = true;\nlet mountWindow = 0;\n'
    + grabFn('liveMountCount') + '\n' + grabFn('mountBudgetFree')
    + '\n;({ liveMountCount, mountBudgetFree, setRunAll: v => { explicitRunAll = v; }, '
    + 'setPark: v => { parkMode = v; }, setWindow: v => { mountWindow = v; } });';

  // The shipped budget function, fed by the shipped counters.
  const loadedCards = new Set();
  const loadingCards = new Set();
  const loadQueue = [];
  const budget = run(budgetSrc, { loadedCards, loadingCards, loadQueue }, 'mountBudgetFree');

  budget.setWindow(4);
  assert.strictEqual(budget.mountBudgetFree(), true, 'an empty grid is never at its window');
  ['a', 'b', 'c'].forEach(n => loadedCards.add(n));
  assert.strictEqual(budget.mountBudgetFree(), true, 'three tools against a window of four is room to mount');
  loadedCards.add('d');
  assert.strictEqual(budget.liveMountCount(), 4, 'liveMountCount must count rendered tools');
  assert.strictEqual(budget.mountBudgetFree(), false, 'the grid may keep mounting past its window');

  // Parked, not counted: d's content has left the grid, so a slot is free again
  // for whatever the visitor is scrolling towards — and d is still running.
  loadedCards.delete('d');
  assert.strictEqual(budget.liveMountCount(), 3, 'a parked tool must leave the live count');
  assert.strictEqual(budget.mountBudgetFree(), true,
    'a full window must reopen as soon as one tool is parked');

  // Queued and in-flight count too: a burst must not overshoot the window simply
  // because nothing has rendered yet. 1 + 1 + 2 against a window of 4.
  const mid = run(budgetSrc,
    { loadedCards: new Set(['a']), loadingCards: new Set(['b']), loadQueue: [0] }, 'budget-mid');
  mid.setWindow(4);
  assert.strictEqual(mid.mountBudgetFree(), true, 'three tools against a window of four is not at the window');
  const full = run(budgetSrc,
    { loadedCards: new Set(['a', 'b']), loadingCards: new Set(['c']), loadQueue: [0, 1] }, 'budget-full');
  full.setWindow(4);
  assert.strictEqual(full.mountBudgetFree(), false, 'in-flight work is free to overshoot the window');

  // ⚡ Run all and ?park=off both mean "the window is the whole page".
  budget.setRunAll(true);
  assert.strictEqual(budget.mountBudgetFree(), true, 'an explicit run-all must not be capped');
  budget.setRunAll(false);
  loadedCards.add('d');
  assert.strictEqual(budget.mountBudgetFree(), false, 'run-all off again: back inside the window');
  budget.setPark(false);
  assert.strictEqual(budget.mountBudgetFree(), true, '?park=off must never cap what the grid keeps');
  console.log(`  ok   the grid lays out ${WINDOW} tools at a time; parked ones do not count, ⚡ lifts it`);

  // And a closed budget really does stop the sweep from queueing work.
  const queued = [];
  const api = run(
    'let scrollLoadActive = false;\nlet pendingCards = [];\n'
    + grabFn('scrollFallbackLoader')
    + '\n;({ scrollFallbackLoader, __setPending: v => { pendingCards = v; } });',
    {
      loadedCards: new Set(), loadingCards: new Set(), loadQueue: [],
      isCardHidden: () => false, retryErroredCards: () => {},
      MAX_CONCURRENT_LOADS: SHIPPED_CAP, activeLoads: 0,
      window: { innerHeight: 900 },
      mountBudgetFree: () => false,
      parkOutsideWindow: () => {},
      pumpWarmSoon: () => {},
      loadCard: (card, name) => queued.push(name),
    }, 'sweep-capped');
  api.__setPending(Array.from({ length: 6 }, (_, i) => makeCard(`k${i}`, { top: i * 100, height: 90 })));
  api.scrollFallbackLoader();
  assert.deepStrictEqual(queued, [], 'a grid at its window still queued mounts from the sweep');
  console.log('  ok   at the window the sweep queues nothing new (clicks and parking still do)');
}

console.log('\nlazy-loader tests passed');
