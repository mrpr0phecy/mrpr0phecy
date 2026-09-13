// Tests the REAL first-screen fast-path functions extracted out of index.html,
// the same way scripts/tests/lazy-loader.test.js does: drive the shipped source
// with stubs instead of reimplementing it, so a change to index.html that breaks
// the fast path breaks this test. Run with:
//
//   node scripts/tests/home-fast-path.test.js
//
// Zero dependencies (node only). No browser required.
//
// What the fast path is: <head> starts the catalogue fetch and the first few
// card-fragment fetches while the document is still parsing, and #dashboard
// ships those first cards as generated markup. Both halves are consumed exactly
// once by the loader. These tests hold the two invariants that make that safe:
// nothing is downloaded twice, and no card is ever built twice into the shared
// DOM (ARCHITECTURE.md §7's duplicate-id trap).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const INDEX = path.join(__dirname, '..', '..', 'index.html');
const CARDS = path.join(__dirname, '..', '..', 'cards', 'cards.json');
const html = fs.readFileSync(INDEX, 'utf8');

function context(obj) {
  const proxy = new Proxy(obj, {
    has: () => true,
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

// ---------------------------------------------------------------- suite 1
// A prefetched response is handed over once. Reuse would render stale content
// after a card is reloaded; never consuming it would download it twice.
{
  const jsonPromise = Promise.resolve('[]');
  const cardPromise = Promise.resolve('<div>tool</div>');
  const api = run(
    grab('takePrefetchedCatalogue') + grab('takePrefetchedCard')
    + '\n;({ takePrefetchedCatalogue, takePrefetchedCard });',
    { window: { __mpFastPath: { json: jsonPromise, cards: new Map([['a-card', cardPromise]]) } } },
    'takePrefetched*');

  assert.strictEqual(api.takePrefetchedCatalogue(), jsonPromise, 'catalogue promise not handed over');
  assert.strictEqual(api.takePrefetchedCatalogue(), null, 'catalogue prefetch consumed twice — would refetch or go stale');
  assert.strictEqual(api.takePrefetchedCard('a-card'), cardPromise, 'card promise not handed over');
  assert.strictEqual(api.takePrefetchedCard('a-card'), null, 'card prefetch consumed twice');
  assert.strictEqual(api.takePrefetchedCard('never-prefetched'), null, 'unknown card must fall through to a normal fetch');
  console.log('  ok   prefetches are consumed exactly once, misses fall through');

  // No bootstrap at all (old cached HTML, blocked inline script, file://): every
  // helper must degrade to null rather than throw.
  const bare = run(grab('takePrefetchedCatalogue') + grab('takePrefetchedCard')
    + '\n;({ takePrefetchedCatalogue, takePrefetchedCard });',
  { window: {} }, 'takePrefetched*-bare');
  assert.strictEqual(bare.takePrefetchedCatalogue(), null);
  assert.strictEqual(bare.takePrefetchedCard('a-card'), null);
  console.log('  ok   fast path is inert when the bootstrap never ran');
}

// ---------------------------------------------------------------- suite 2
// buildPlaceholders must never build a card that is already in the DOM: the
// pre-rendered shells are real cards with real ids (card-<name>), and a second
// copy would put duplicate ids in the one DOM every card shares.
function makeDashboard(existing) {
  const children = [...existing];
  return {
    children,
    querySelectorAll(sel) {
      assert.strictEqual(sel, '.card[data-name]', 'unexpected selector in buildPlaceholders');
      return children.filter(c => c.dataset && c.dataset.name);
    },
    appendChild(frag) { children.push(...frag.children); },
  };
}
function shell(name) {
  return { dataset: { name }, className: 'card card-pending', isConnected: true };
}

{
  const cardFiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const dashboard = makeDashboard([shell('a'), shell('b')]);   // pre-rendered
  const observed = [];
  const built = [];
  let initialKicks = 0;
  const rafQueue = [];
  const timeouts = [];

  const api = run(
    'let pendingCards = [];\nlet initialLoadKicked = false;\n'
    + grab('buildPlaceholders')
    + '\n;({ buildPlaceholders, __pending: () => pendingCards, __kicked: () => initialLoadKicked });',
    {
      PLACEHOLDER_BATCH: 4,
      FIRST_SCREEN_CHUNKS: 1,
      YIELD_FRAME_LIMIT: 60,
      activeLoads: 0,
      loadQueue: [],
      observer: { observe: c => observed.push(c.dataset.name) },
      createPlaceholder: (name, i) => { built.push(name); return shell(name); },
      document: { createDocumentFragment: () => { const children = []; return { children, appendChild: c => children.push(c) }; } },
      loadInitialCards: () => { initialKicks++; },
      updateBuildProgress: () => {},
      isSearching: false,
      applyFilters: () => {},
      scrollFallbackLoader: () => {},
      requestAnimationFrame: cb => rafQueue.push(cb),
      setTimeout: (cb, ms) => timeouts.push(cb),
    }, 'buildPlaceholders');

  api.buildPlaceholders(cardFiles, dashboard);
  const flush = () => { while (rafQueue.length) rafQueue.shift()(); while (timeouts.length) timeouts.shift()(); };
  flush();

  assert.deepStrictEqual(built, ['c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
    `pre-rendered cards were rebuilt: ${built.join(',')}`);
  assert.strictEqual(dashboard.children.length, cardFiles.length,
    `expected one card per catalogue entry, got ${dashboard.children.length}`);
  const names = dashboard.children.map(c => c.dataset.name);
  assert.strictEqual(new Set(names).size, names.length, `duplicate card in the shared DOM: ${names.join(',')}`);
  assert.deepStrictEqual(observed.sort(), cardFiles.slice(2).sort(), 'new placeholders were not observed');
  assert.deepStrictEqual([...api.__pending().map(c => c.dataset.name)].sort(), cardFiles.slice(2).sort(),
    'new placeholders were not added to the pending list');
  console.log('  ok   pre-rendered shells are adopted, never duplicated');

  // The first screen kicks the loader exactly once, even though the build
  // continued for several more frames afterwards.
  assert.strictEqual(initialKicks, 1, `loadInitialCards ran ${initialKicks} times`);
  assert.strictEqual(api.__kicked(), true);
  console.log('  ok   the initial load is kicked exactly once');
}

// ---------------------------------------------------------------- suite 3
// After the first screen's worth of placeholders exists, the tail yields while
// the loader is busy — but a permanently busy page must not starve the
// catalogue, so the yield is bounded.
{
  const cardFiles = Array.from({ length: 12 }, (_, i) => `c${i}`);
  const dashboard = makeDashboard([]);
  const rafQueue = [];
  const timeouts = [];
  const state = { activeLoads: 4, loadQueue: [{ cardName: 'x' }] };
  let built = 0;

  const api = run(
    'let pendingCards = [];\nlet initialLoadKicked = true;\n'
    + grab('buildPlaceholders')
    + '\n;({ buildPlaceholders });',
    {
      PLACEHOLDER_BATCH: 2,
      FIRST_SCREEN_CHUNKS: 2,
      YIELD_FRAME_LIMIT: 3,
      get activeLoads() { return state.activeLoads; },
      get loadQueue() { return state.loadQueue; },
      observer: { observe() {} },
      createPlaceholder: (name) => { built++; return shell(name); },
      document: { createDocumentFragment: () => { const children = []; return { children, appendChild: c => children.push(c) }; } },
      loadInitialCards: () => {},
      updateBuildProgress: () => {},
      isSearching: false,
      applyFilters: () => {},
      scrollFallbackLoader: () => {},
      requestAnimationFrame: cb => rafQueue.push(cb),
      setTimeout: cb => timeouts.push(cb),
    }, 'buildPlaceholders-yield');

  api.buildPlaceholders(cardFiles, dashboard);
  // Two chunks at full speed = FIRST_SCREEN_CHUNKS, then the tail must wait.
  const stepOnce = () => { if (rafQueue.length) rafQueue.shift()(); else if (timeouts.length) timeouts.shift()(); };
  stepOnce(); stepOnce();
  assert.strictEqual(built, 4, `expected FIRST_SCREEN_CHUNKS x PLACEHOLDER_BATCH = 4 before yielding, got ${built}`);
  stepOnce();
  assert.strictEqual(built, 4, 'the tail built while the loader pipeline was busy');
  assert.ok(timeouts.length + rafQueue.length > 0, 'the yielded build was dropped instead of rescheduled');
  console.log('  ok   the catalogue tail yields to the first screen');

  // Still busy after YIELD_FRAME_LIMIT frames: build anyway rather than never.
  for (let i = 0; i < 10; i++) stepOnce();
  assert.ok(built > 4, `the bounded yield starved the build (built ${built})`);
  state.activeLoads = 0; state.loadQueue = [];
  for (let i = 0; i < 20; i++) stepOnce();
  assert.strictEqual(built, cardFiles.length, `build never finished: ${built}/${cardFiles.length}`);
  console.log('  ok   the yield is bounded and the build always finishes');
}

// ---------------------------------------------------------------- suite 4
// adoptPrerenderedCards: pick up the generated shells, queue them, and start
// the first screen without waiting for cards.json.
{
  const shells = [shell('a'), shell('b'), shell('c')];
  const dashboard = { querySelectorAll: () => shells };
  let initialKicks = 0, ratingsLoads = 0, observerInits = 0;

  const api = run(
    'let pendingCards = [];\nlet initialLoadKicked = false;\n'
    + 'const loadedCards = new Set();\nconst loadingCards = new Set();\n'
    + grab('adoptPrerenderedCards')
    + '\n;({ adoptPrerenderedCards, __pending: () => pendingCards, __kicked: () => initialLoadKicked });',
    {
      document: { getElementById: id => (id === 'dashboard' ? dashboard : null) },
      loadRatings: () => { ratingsLoads++; },
      initIntersectionObserver: () => { observerInits++; },
      loadInitialCards: () => { initialKicks++; },
      console: { log() {} },
    }, 'adoptPrerenderedCards');

  assert.strictEqual(api.adoptPrerenderedCards(), 3, 'shells were not adopted');
  assert.deepStrictEqual([...api.__pending().map(c => c.dataset.name)], ['a', 'b', 'c']);
  assert.strictEqual(initialKicks, 1, 'the first screen was not started during parse');
  assert.strictEqual(ratingsLoads, 1, 'ratings must be loaded before content renders its footer');
  assert.strictEqual(observerInits, 1, 'adopted cards must be observed for scroll loading');
  assert.strictEqual(api.__kicked(), true);

  // A second adoption (defensive re-entry) must not queue or kick again.
  assert.strictEqual(api.adoptPrerenderedCards(), 3);
  assert.strictEqual(initialKicks, 1, 'adoption kicked the loader twice');
  console.log('  ok   pre-rendered shells are adopted and start the first screen once');

  // No shells at all (block stripped, or a cached older page): inert, no throw.
  const empty = run('let pendingCards = [];\nlet initialLoadKicked = false;\n'
    + 'const loadedCards = new Set();\nconst loadingCards = new Set();\n'
    + grab('adoptPrerenderedCards') + '\n;({ adoptPrerenderedCards });',
  { document: { getElementById: () => ({ querySelectorAll: () => [] }) }, console: { log() {} } },
  'adoptPrerenderedCards-empty');
  assert.strictEqual(empty.adoptPrerenderedCards(), 0);
  console.log('  ok   adoption is inert when the generated block is missing');
}

// ---------------------------------------------------------------- suite 5
// Cross-artifact invariants, read straight out of the shipped files.
{
  // The head bootstrap must prefetch exactly the cards the markup pre-renders
  // first — a prefetch for a card that is not on screen is wasted bandwidth,
  // and a shell with no prefetch waits for the catalogue like it used to.
  const bootstrap = html.match(/const FIRST_SCREEN = \[([^\]]*)\];/);
  assert(bootstrap, 'could not find the FIRST_SCREEN list in the head bootstrap');
  const fetched = bootstrap[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
  const rendered = [...html.matchAll(/<div class="card card-pending" data-name="([^"]+)"/g)].map(m => m[1]);
  assert.ok(rendered.length >= fetched.length, 'fewer pre-rendered shells than prefetched fragments');
  assert.deepStrictEqual(rendered.slice(0, fetched.length), fetched,
    'the head bootstrap prefetches cards that are not the pre-rendered first screen');

  if (fs.existsSync(CARDS)) {
    const names = JSON.parse(fs.readFileSync(CARDS, 'utf8')).map(c => c.name).sort();
    assert.deepStrictEqual(rendered, names.slice(0, rendered.length),
      'pre-rendered shells are not the first cards in catalogue order');
    console.log(`  ok   ${rendered.length} shells + ${fetched.length} prefetches match cards.json order`);
  }

  // Descriptions used to be copied into a data-desc attribute on all 1128
  // cards: ~190 KB of catalogue text written into the DOM during the build.
  assert.ok(!/card\.dataset\.desc\s*=/.test(html),
    'createPlaceholder is writing data-desc again — that duplicates the catalogue into the DOM');
  console.log('  ok   no data-desc duplication of the catalogue');
}

// ---------------------------------------------------------------- suite 6
// withTimeout: a stalled prefetch is abandoned, a settled one passes through.
(async () => {
  const api = run(grab('withTimeout') + '\n;({ withTimeout });', {}, 'withTimeout');

  assert.strictEqual(await api.withTimeout(Promise.resolve('<div>tool</div>'), 1000), '<div>tool</div>');
  assert.strictEqual(await api.withTimeout(Promise.reject(new Error('network')), 1000), null,
    'a rejected prefetch must resolve null so the loader refetches');
  const never = new Promise(() => {});
  const started = Date.now();
  assert.strictEqual(await api.withTimeout(never, 30), null, 'a stalled prefetch was not abandoned');
  assert.ok(Date.now() - started < 500, 'withTimeout waited far longer than its budget');
  console.log('  ok   stalled or failed prefetches are abandoned, not awaited forever');

  console.log('\nhome fast-path tests passed');
})().catch(err => { console.error(err); process.exit(1); });
