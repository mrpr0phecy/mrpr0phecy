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

// ---------------------------------------------------------------- card stub
const STUB = { scrollY: 0, innerHeight: 900, cards: [] };

function makeCard(name, { top, height, hidden }) {
  const card = {
    dataset: { name },
    style: { display: hidden ? 'none' : '' },
    offsetParent: hidden ? null : {},
    classes: new Set(),
    getBoundingClientRect: () => ({ top: top - STUB.scrollY, height }),
  };
  card.classList = {
    add: c => card.classes.add(c),
    remove: c => card.classes.delete(c),
    contains: c => card.classes.has(c),
  };
  return card;
}

// ---------------------------------------------------------------- suite 1
// scrollFallbackLoader: what it queues, in what order, and what it skips.
{
  const queued = [];
  const loadedCards = new Set();
  const loadingCards = new Set();

  const api = run(
    grab('scrollFallbackLoader') + '\n;({ scrollFallbackLoader });',
    {
      loadedCards, loadingCards,
      loadCard: (card, name) => queued.push(name),
      document: {
        querySelectorAll: sel => {
          assert.strictEqual(sel, '.card:not(.loaded):not(.loading-fallback)');
          return STUB.cards.filter(c => !c.classes.has('loaded') && !c.classes.has('loading-fallback'));
        },
      },
      window: { get scrollY() { return STUB.scrollY; }, get innerHeight() { return STUB.innerHeight; } },
    }, 'scrollFallbackLoader');

  // 20 cards, 100px apart. Viewport 900 + 300 margin each side => tops 0..1200
  // are in view, i.e. 13 cards. The point is 13 > 6: the old code capped at 6.
  STUB.scrollY = 0;
  STUB.cards = Array.from({ length: 20 }, (_, i) => makeCard(`c${i}`, { top: i * 100, height: 90, hidden: false }));
  queued.length = 0;
  api.scrollFallbackLoader();
  assert.strictEqual(queued.length, 13, `expected 13 in-view cards, got ${queued.length}`);
  assert.ok(queued.length > 6, 'the old 6-card cap is back');
  console.log(`  ok   no 6-card cap: queued ${queued.length} in-view cards`);

  // Nearest-to-viewport first, so a fast scroll fills in what you can see.
  STUB.scrollY = 1000; STUB.innerHeight = 900;
  STUB.cards = [
    makeCard('far', { top: 1000, height: 90, hidden: false }),
    makeCard('near', { top: 1400, height: 90, hidden: false }),
    makeCard('mid', { top: 1800, height: 90, hidden: false }),
  ];
  queued.length = 0;
  api.scrollFallbackLoader();
  assert.strictEqual(queued[0], 'near', `expected nearest first, got ${queued.join(',')}`);
  console.log(`  ok   nearest-first ordering: ${queued.join(' -> ')}`);

  // Filtered-out cards are display:none; their rect is all zeroes and would
  // otherwise match the viewport test and load tools the user filtered away.
  STUB.scrollY = 0; STUB.innerHeight = 900;
  STUB.cards = [
    makeCard('shown', { top: 100, height: 90, hidden: false }),
    makeCard('hidden', { top: 120, height: 90, hidden: true }),
  ];
  queued.length = 0;
  api.scrollFallbackLoader();
  assert.deepStrictEqual(queued, ['shown'], `hidden card must not load, got ${queued.join(',')}`);
  console.log('  ok   filtered-out cards skipped');
}

// ---------------------------------------------------------------- suite 2
// onScrollLazyLoad must be a throttle, not a debounce. A debounce keeps
// resetting while scroll events arrive, so during continuous scrolling the
// loader never runs at all — which is exactly when cards get missed.
{
  let passes = 0;
  let timers = [];
  let clock = 0;

  const api = run(
    'let scrollLoadTimeout = null;\nlet lastScrollLoadRun = 0;\nconst SCROLL_LOAD_INTERVAL = 200;\n'
    + 'const Date = { now: nowFn };\n'
    + grab('scrollFallbackLoader') + '\n' + grab('onScrollLazyLoad')
    + '\n;({ onScrollLazyLoad });',
    {
      document: { querySelectorAll: () => { passes++; return []; } },
      window: { scrollY: 0, innerHeight: 900 },
      nowFn: () => clock,
      setTimeout: (fn, ms) => { const id = timers.length; timers.push({ fn, at: clock + ms, id }); return id; },
      clearTimeout: id => { const t = timers.find(t => t.id === id); if (t) t.cancelled = true; },
    }, 'onScrollLazyLoad');

  const runTimers = () => timers.filter(t => !t.cancelled && t.at <= clock && !t.ran)
    .forEach(t => { t.ran = true; t.fn(); });

  // 1050ms of continuous scrolling, an event every 50ms. Ending off the 200ms
  // boundary is deliberate, so a trailing pass is required.
  for (let i = 0; i < 21; i++) { clock += 50; api.onScrollLazyLoad(); runTimers(); }
  assert.ok(passes >= 4,
    `expected >=4 passes during continuous scrolling, got ${passes} (debounce behaviour?)`);
  console.log(`  ok   throttle ran ${passes}x during continuous scrolling (a debounce runs 0)`);

  passes = 0; clock += 500; runTimers();
  assert.ok(passes >= 1, 'expected a trailing pass after scrolling stops');
  console.log('  ok   trailing pass fires after scrolling stops');
}

console.log('\nlazy-loader tests passed');
