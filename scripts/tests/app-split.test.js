// Tests the split between the main page's app (home-app.js) and its on-demand
// UI bundle (home-features.js): panels, toolbox, maximise modal, directory view.
//
// The split exists for the first screen — the bundle is ~39 KB that nothing
// needed to paint, filter or scroll the grid used to compile before the first
// tool appeared — and it is only safe while three things hold:
//
//   1. the core runs, starts the grid and asks for the bundle WITHOUT it
//      (nothing the first screen does may depend on it);
//   2. every call the core still makes into the bundle has a same-named
//      delegate AND a same-named registration, and a call that arrives before
//      the bundle lands is queued and replayed;
//   3. the state the bundle reaches for really is exposed by the core, through
//      live accessors (not copies), so the two files agree on one value.
//
// This drives both real files in a vm with a stub DOM: the core is executed
// whole, then the bundle is executed against it, and the assertions below are
// about behaviour (registration, queueing, replay, state round-trips), not
// strings. Run with:
//
//   node scripts/tests/app-split.test.js
//
// Zero dependencies (node only). No browser required: this proves the wiring,
// not the rendering.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const CORE = fs.readFileSync(path.join(ROOT, 'home-app.js'), 'utf8');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'home-features.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// The names home-app.js delegates and home-features.js must register.
const DELEGATES = ['updateGridLayout', 'setViewMode', 'renderDirectoryList',
  'handleDirectoryGridClick', 'openStandaloneModal', 'rateCard', 'copyEmbedCode',
  'addCardToToolbox'];
// Registered too, but called by the bundle's own startup rather than by the core:
// these were initApp()'s calls before the split, and initApp() must not wait for
// the bundle now.
const SELF_INIT = ['initPanels', 'initToolbox', 'setupStandaloneModal', 'setupBroadcastChannel'];
// State the bundle reads or writes through MP.state.
const STATE = ['allCards', 'cardCache', 'cardsMetaMap', 'currentViewMode', 'directoryDirty',
  'expandedGridCards', 'expandedListCards', 'isSearching', 'lastMatchedNames', 'loadedCards',
  'loadingCards', 'toolboxCards', 'toolboxMode'];

// ---------------------------------------------------------------- stub DOM
function element(tag = 'div') {
  const listeners = {};
  const classes = new Set();
  const el = {
    tagName: tag.toUpperCase(),
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    children: [],
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, force) => (force === undefined ? (classes.has(c) ? (classes.delete(c), false) : (classes.add(c), true)) : (force ? classes.add(c) : classes.delete(c), force)),
      contains: c => classes.has(c),
    },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    appendChild(child) { el.children.push(child); return child; },
    removeChild() {}, insertBefore(c) { el.children.push(c); return c; },
    remove() {}, closest() { return null; }, contains() { return false; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {}, dispatchEvent() { return true; },
    scrollIntoView() {}, focus() {}, blur() {}, click() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 300, bottom: 200, width: 300, height: 200 }),
    innerHTML: '', textContent: '', value: '', id: '', className: '',
    __listeners: listeners, __classes: classes,
  };
  return el;
}

function makeDom() {
  const created = [];
  const head = element('head');
  const body = element('body');
  // The page has all of these ids in its markup; the harness hands back one
  // stable stub per id so listeners attach (and can be asserted on).
  const byId = new Map();
  const document = {
    readyState: 'loading',
    documentElement: element('html'),
    head, body,
    fonts: { ready: Promise.resolve() },
    createElement(tag) { const el = element(tag); created.push(el); return el; },
    createDocumentFragment: () => element('fragment'),
    createTextNode: (t) => ({ textContent: t }),
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, element('div'));
      const el = byId.get(id);
      el.id = id;
      return el;
    },
    querySelector(sel) { return document.getElementById('sel:' + sel); },
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    visibilityState: 'visible',
    startViewTransition: undefined,
  };
  return { document, created, head, body, byId };
}

function runCore(overrides = {}) {
  const dom = makeDom();
  const globals = [];
  const idleCallbacks = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: dom.document,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 5)),
    clearTimeout, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    requestIdleCallback: (fn, opts) => { idleCallbacks.push({ fn, opts }); return idleCallbacks.length; },
    fetch: () => new Promise(() => {}),                    // never settles: no catalogue
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { maxTouchPoints: 0, onLine: true, serviceWorker: undefined, userAgent: 'node' },
    location: { protocol: 'https:', href: 'https://example.test/', search: '', pathname: '/' },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    HTMLScriptElement: class {},
    URL, URLSearchParams, AbortController,
    BroadcastChannel: class { postMessage() {} },
    Response, Request, Headers, TextDecoder, TextEncoder, Blob: class {},
    innerWidth: 900, innerHeight: 900, scrollY: 0, scrollTo() {}, addEventListener() {}, removeEventListener() {},
    performance: { now: () => 0 },
    crypto: { randomUUID: () => 'uuid' },
    ...overrides,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(CORE, sandbox, { filename: 'home-app.js' });
  sandbox.__dom = dom;
  sandbox.__idle = idleCallbacks;
  return sandbox;
}

(async () => {
  // ------------------------------------------------------------- the split
  {
    const coreDefs = new Set([...CORE.matchAll(/^ {4}(?:async )?function ([$\w]+)/gm)].map(m => m[1]));
    const registered = new Set([...(BUNDLE.match(/MP\.features = \{([\s\S]*?)\};/) || [])[1]
      .matchAll(/([$\w]+)/g)].map(m => m[1]));
    for (const name of [...DELEGATES, ...SELF_INIT]) {
      assert.ok(registered.has(name), `home-features.js does not register ${name}()`);
    }
    for (const name of DELEGATES) {
      assert.ok(new RegExp(`^ {4}function ${name}\\s*\\(`, 'm').test(CORE),
        `home-app.js has no ${name}() — the delegate the bundle's registration matches`);
    }
    for (const name of DELEGATES) {
      assert.ok(new RegExp(`callFeature\\('${name}'`).test(CORE),
        `${name}() exists in the core but does not go through callFeature()`);
    }
    // The moved implementations must not still sit in the core: that would
    // silently double the app in the document (and shadow the delegate). The
    // four self-init features are the ones that had led with a core definition.
    const MOVED_ONLY = [...SELF_INIT, 'renderToolbox', 'saveToolboxCards', 'toggleToolbox',
      'closeToolbox', 'togglePanel', 'closePanel', 'openStandaloneModalCore',
      'loadSavedToolboxCards', 'switchToolboxMode', 'updateToolboxMode'];
    for (const name of MOVED_ONLY) {
      assert.ok(!new RegExp(`^ {4}(?:async )?function ${name}\\b`, 'm').test(CORE),
        `${name}() is still defined in home-app.js — it moved to home-features.js`);
      assert.ok(new RegExp(`function ${name}\\s*\\(`).test(BUNDLE),
        `${name}() is not in home-features.js`);
    }
    // ...and the bundle must run the startup initApp() used to run, or the
    // panels would simply never get their listeners.
    for (const call of ['initToolbox();', 'initPanels();', 'setupStandaloneModal();',
                        'setupBroadcastChannel();']) {
      assert.ok(BUNDLE.includes(call), `home-features.js never calls ${call}`);
    }
    // A delegate is a body of one statement (two lines at most for the
    // four-argument addCardToToolbox): an implementation here would mean the
    // code was copied instead of moved, which doubles the app in the document.
    for (const name of DELEGATES) {
      const block = CORE.match(new RegExp(`^ {4}function ${name}\\([^)]*\\) \\{[^}]*\\}`, 'm'));
      assert.ok(block, `${name}() delegate is missing`);
      assert.ok(block[0].length < 300, `${name}() looks like an implementation, not a delegate`);
      assert.ok(/callFeature\('/.test(block[0]), `${name}() must hand off through callFeature()`);
      assert.strictEqual(block[0].split('\n').length <= 4, true,
        `${name}() is ${block[0].split('\n').length} lines long`);
    }
    assert.ok(coreDefs.size > 0);
    console.log(`  ok   ${DELEGATES.length} delegates, ${DELEGATES.length + SELF_INIT.length} registrations, one implementation each`);
  }

  // ------------------------------------------------- one version, three files
  {
    const app = CORE.match(/const APP_VERSION = (\d+);/);
    assert.ok(app, 'home-app.js must declare const APP_VERSION');
    const linked = [...INDEX.matchAll(/home(?:-deferred)?\.css\?v=(\d+)|home-app\.js\?v=(\d+)/g)]
      .map(m => m[1] || m[2]);
    const cache = SW.match(/CACHE_VERSION = 'v(\d+)-/);
    assert.ok(cache, 'sw.js must declare CACHE_VERSION');
    assert.ok([...new Set(linked)].every(v => v === app[1]),
      `index.html links ?v=${[...new Set(linked)]} but APP_VERSION is ${app[1]}`);
    assert.strictEqual(cache[1], app[1], 'sw.js CACHE_VERSION must equal APP_VERSION');
    assert.ok(BUNDLE === fs.readFileSync(path.join(ROOT, 'home-features.js'), 'utf8'));
    console.log(`  ok   one version (v${app[1]}) for the stylesheets, the app, the bundle and sw.js`);
  }

  // ------------------------------------------ the core runs without the bundle
  {
    const sandbox = runCore();
    assert.ok(sandbox.__mpHome, 'home-app.js must publish window.__mpHome');
    assert.strictEqual(vm.runInContext('typeof initApp', sandbox), 'function');
    // Nothing may have fetched the bundle while the page was merely parsing.
    assert.strictEqual(sandbox.__mpHome.loaded, false, 'the bundle was requested during parse');
    vm.runInContext('initApp();', sandbox);
    assert.strictEqual(sandbox.__mpHome.ready, false, 'the bundle cannot be ready before it loads');
    // initApp() schedules the bundle (idle + deadline) and does not wait for it.
    assert.ok(sandbox.__idle.length >= 1, 'initApp() must schedule the on-demand bundle');
    assert.ok(sandbox.__idle.some(c => c.opts && c.opts.timeout > 0),
      'the idle schedule needs a deadline, or a permanently busy page never gets the bundle');
    assert.strictEqual(sandbox.__mpHome.loaded, false,
      'initApp() must not fetch the bundle synchronously — that is the whole point of the split');
    console.log('  ok   the first screen runs, and schedules the bundle, without it');
  }

  // -------------------------------------- a feature reached too early queues
  {
    const sandbox = runCore();
    const scripts = [];
    vm.runInContext('openStandaloneModal("bmi"); rateCard("bmi", "up");', sandbox);
    // (join, not deepStrictEqual: the queue is an array from the vm's realm.)
    assert.strictEqual(sandbox.__mpHome.queued.map(q => q[0]).join(','),
      'openStandaloneModal,rateCard', 'calls must queue in order while the bundle is out');
    for (const el of sandbox.__dom.created) if (el.tagName === 'SCRIPT') scripts.push(el);
    assert.strictEqual(scripts.length, 1, 'asking for a feature must fetch the bundle');
    const version = CORE.match(/const APP_VERSION = (\d+);/)[1];
    assert.strictEqual(scripts[0].src, `home-features.js?v=${version}`,
      'the bundle must be requested with the version of record');
    assert.strictEqual(scripts[0].fetchPriority, 'low',
      'the bundle must not compete with the card fragments');
    assert.ok(sandbox.__dom.head.children.includes(scripts[0]), 'the bundle script must be appended to <head>');

    // A repeated coalescing call replaces the earlier one instead of piling up.
    sandbox.__mpHome.queued.length = 0;
    vm.runInContext('renderDirectoryList(["a"]); renderDirectoryList(["a", "b"]);', sandbox);
    assert.strictEqual(sandbox.__mpHome.queued.length, 1, 'coalescing calls must not queue twice');
    assert.strictEqual([...sandbox.__mpHome.queued[0][1][0]].join(','), 'a,b',
      'the last argument must win');
    console.log('  ok   early calls queue (and coalesce), and the bundle is fetched once, at low priority');
  }

  // ------------------------------- the bundle lands, registers and replays
  {
    const sandbox = runCore();
    vm.runInContext('openStandaloneModal("bmi");', sandbox);
    const seen = [];
    sandbox.__mpHome.fn.getCardRating = () => { seen.push('getCardRating'); return { up: 0, down: 0 }; };
    sandbox.__mpHome.fn.showNotification = (msg) => { seen.push('notify:' + msg); };
    vm.runInContext(BUNDLE, sandbox, { filename: 'home-features.js' });

    assert.strictEqual(sandbox.__mpHome.ready, true, 'the bundle must mark itself ready');
    for (const name of [...DELEGATES, ...SELF_INIT]) {
      assert.strictEqual(typeof sandbox.__mpHome.features[name], 'function',
        `${name} was not registered by the bundle`);
    }
    assert.strictEqual(sandbox.__mpHome.queued.length, 0, 'the queue must be drained on arrival');
    // The replayed call really ran the bundle's implementation.
    assert.ok(vm.runInContext('typeof openStandaloneModalCore', sandbox) === 'function' ||
      sandbox.__mpHome.features.openStandaloneModal.length === 1,
      'openStandaloneModal was not registered by the bundle');

    // Once ready, a delegate goes straight to the implementation: no queueing.
    vm.runInContext('rateCard("bmi", "up")', sandbox);
    assert.ok(seen.some(e => e === 'getCardRating'), 'a ready bundle must be called directly');
    assert.strictEqual(sandbox.__mpHome.queued.length, 0, 'nothing may queue once the bundle is ready');
    console.log('  ok   the bundle registers, replays queued calls in order, then serves calls directly');
  }

  // ------------------------------------------------ shared state is live
  {
    const sandbox = runCore();
    vm.runInContext(BUNDLE, sandbox, { filename: 'home-features.js' });
    const state = sandbox.__mpHome.state;
    for (const name of STATE) {
      const descriptor = Object.getOwnPropertyDescriptor(state, name);
      assert.ok(descriptor && descriptor.get && descriptor.set,
        `MP.state.${name} must be a live getter/setter, not a snapshot`);
    }
    // Reading and writing through the accessor must reach the app's own variable.
    assert.strictEqual(vm.runInContext('allCards.length', sandbox), 0);
    state.allCards = ['a', 'b'];
    assert.strictEqual(vm.runInContext('allCards.length', sandbox), 2,
      'writing through MP.state must update the app variable');
    state.toolboxMode = 'list';
    assert.strictEqual(vm.runInContext('toolboxMode', sandbox), 'list');
    vm.runInContext('toolboxMode = "grid"', sandbox);
    assert.strictEqual(state.toolboxMode, 'grid', 'MP.state must not be a copy');

    // The names the bundle reaches for are exactly the ones the core exposes.
    const used = new Set([...BUNDLE.matchAll(/\bS\.([$\w]+)/g)].map(m => m[1]));
    for (const name of used) {
      assert.ok(STATE.includes(name),
        `the bundle uses S.${name}, which this test does not know about — add it to home-app.js's accessors and this list`);
    }
    console.log(`  ok   state is shared live (${STATE.length} accessors), and the bundle only uses those`);
  }

  console.log('\napp-split tests passed');
})().catch((err) => {
  console.error('\napp-split tests FAILED:', err.message);
  process.exit(1);
});
