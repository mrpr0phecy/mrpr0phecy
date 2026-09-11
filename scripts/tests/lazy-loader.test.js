// Tests the REAL lazy-loading functions extracted out of index.html.
//
// These drive the shipped source with DOM stubs rather than reimplementing it,
// so a change to index.html that breaks the loader breaks this test. Run with:
//
//   node scripts/tests/lazy-loader.test.js
//
// Zero dependencies (node only). No browser required.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const INDEX = path.join(__dirname, '..', '..', 'index.html');
const html = fs.readFileSync(INDEX, 'utf8');

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
  assert(m, `could not extract ${name}() from index.html — has it been renamed?`);
  return m[0];
}

// The shipped concurrency cap, read from the real source — not assumed.
const capMatch = html.match(/const MAX_CONCURRENT_LOADS = (\d+);/);
assert(capMatch, 'could not read MAX_CONCURRENT_LOADS from index.html');
const SHIPPED_CAP = parseInt(capMatch[1], 10);
assert.ok(SHIPPED_CAP >= 1 && SHIPPED_CAP <= 16,
  `MAX_CONCURRENT_LOADS=${SHIPPED_CAP} is outside sane bounds`);

// ---------------------------------------------------------------- card stub
const STUB = { innerHeight: 900 };

function makeCard(name, { top, height, width = 300, hidden = false, failed = false, connected = true }) {
  const card = {
    dataset: { name },
    style: { display: hidden ? 'none' : '' },
    isConnected: connected,
    classes: new Set(),
    getBoundingClientRect: () => ({ top, bottom: top + height, height, width }),
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

  const api = run(
    'let scrollLoadActive = false;\nlet pendingCards = [];\n'
    + grab('scrollFallbackLoader')
    + '\n;({ scrollFallbackLoader,'
    + ' __setPending: v => { pendingCards = v; },'
    + ' __getPending: () => pendingCards,'
    + ' __reset: () => { scrollLoadActive = false; } });',
    {
      loadedCards, loadingCards,
      loadCard: (card, name) => queued.push(name),
      isCardHidden: card => card.style.display === 'none',
      retryErroredCards: () => { errSweeps++; },
      MAX_CONCURRENT_LOADS: SHIPPED_CAP,
      window: { get innerHeight() { return STUB.innerHeight; } },
    }, 'scrollFallbackLoader');

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

console.log('\nlazy-loader tests passed');
