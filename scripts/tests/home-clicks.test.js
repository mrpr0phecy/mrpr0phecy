// Drives the REAL click plumbing out of home-app.js against a minimal DOM
// stub: what a click on a card, on 🔲/📋 and on ⛶ is allowed to do, and what
// happens to a click that lands before the app exists.
//
// Every case here is a bug the page actually had:
//
//   * 🔲 / 📋 on a card that had not run yet did nothing at all — the
//     delegated handler skipped `.card-action-btn` outright and the per-card
//     listener only existed once a tool had rendered.
//   * ⛶ cancelled the anchor's navigation unconditionally, so when
//     home-features.js had failed the click had nothing left to do.
//   * A click that arrived while home-app.js (deferred, 192 KB) was still
//     downloading was lost with no feedback: the first twelve cards are real
//     markup and say "Click to run" from the first paint.
//   * A bundle that failed to load was never retried and never reported, so
//     every panel, the toolbox and the modal ignored clicks for hours.
//
// Run with:
//
//   node scripts/tests/home-clicks.test.js
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const APP = fs.readFileSync('home-app.js', 'utf8');
const BUNDLE = fs.readFileSync('home-features.js', 'utf8');
const INDEX = fs.readFileSync('index.html', 'utf8');
const CSS = fs.readFileSync('home.css', 'utf8');
const DEFERRED_CSS = fs.readFileSync('home-deferred.css', 'utf8');

const grab = (name) => {
  const m = APP.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n`));
  assert(m, `could not extract ${name}() from home-app.js — has it been renamed?`);
  return m[0];
};

// ---------------------------------------------------------------- vm harness
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

// ------------------------------------------------------------- DOM stub
// Just enough of an element for `closest()` to answer the selectors the
// delegated handler uses: tags, .class, .class.class, .class[attr], [attr].
function attrName(sel) {
  const key = sel.slice(1, -1).split('=')[0].replace(/^data-/, '');
  return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function matchesSimple(el, sel) {
  const tokens = sel.match(/^[a-zA-Z]+|\.[-\w]+|\[[^\]]+\]/g) || [];
  assert.strictEqual(tokens.join(''), sel, `stub selector not supported: ${sel}`);
  return tokens.every((t) => {
    if (t[0] === '.') return el.classList.contains(t.slice(1));
    if (t[0] === '[') return attrName(t) in el.dataset;
    return el.tagName === t.toUpperCase();
  });
}

function el(tag, classes = [], dataset = {}) {
  const classes_ = new Set(classes);
  const node = {
    tagName: tag.toUpperCase(),
    dataset,
    parent: null,
    children: [],
    classList: {
      add: (...c) => c.forEach((x) => classes_.add(x)),
      remove: (...c) => c.forEach((x) => classes_.delete(x)),
      contains: (c) => classes_.has(c),
    },
    matches: (sel) => sel.split(',').some((part) => matchesSimple(node, part.trim())),
    closest(sel) {
      let n = node;
      while (n) {
        if (n.matches(sel)) return n;
        n = n.parent;
      }
      return null;
    },
    append(...kids) { kids.forEach((k) => { k.parent = node; node.children.push(k); }); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  return node;
}

// A pending card, exactly as the prerender ships it: header with 🔲 📋 ⛶ and a
// face in the sandbox.
function makeCard(name, extraClasses = []) {
  const card = el('div', ['card', 'card-pending', ...extraClasses], { name, displayName: name.toUpperCase() });
  const header = el('div', ['card-header']);
  const actions = el('div', ['card-actions']);
  const addGrid = el('button', ['card-action-btn', 'add-grid']);
  const addList = el('button', ['card-action-btn', 'add-list']);
  const maximize = el('a', ['card-maximize-btn']);
  actions.append(addGrid, addList, maximize);
  header.append(actions);
  const content = el('div', ['card-content']);
  const sandbox = el('div', ['card-sandbox'], {});
  const face = el('div', ['card-face']);
  const hint = el('div', ['card-face-hint']);
  face.append(hint);
  sandbox.append(face);
  content.append(sandbox);
  card.append(header, content);
  card.refs = { header, actions, addGrid, addList, maximize, face, hint, sandbox };
  return card;
}

function event(target) {
  return { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
}

// ------------------------------------------------------------------ suites
const calls = {
  load: [], modal: [], toolbox: [], notify: [], retry: [],
};
const loadedCards = new Set();
const cardElsByName = new Map();
let modalOk = true;

const SRC = [
  'const pendingToolboxAdds = new Map();',
  'const FEATURE_MAX_ATTEMPTS = 3;',
  'let featureAttempts = 0;',
  'let featureFailNotified = false;',
  grab('drainEarlyClicks'),
  grab('handleCardClick'),
  grab('requestToolboxAdd'),
  grab('flushPendingToolboxAdd'),
  grab('dropPendingToolboxAdd'),
  grab('bundleExhausted'),
  grab('modalCanOpen'),
  grab('callFeature'),
  grab('loadFeatures'),
].join('\n');

// Each suite that drives the bundle gets its own realm: the attempt counter
// and the in-flight flag are module state, and one exhausted bundle would
// otherwise leak into the next assertion.
function boot() {
const scripts = [];
const runtime = {
  loadedCards,
  cardElsByName,
  loadingCards: new Set(),
  FEATURE_COALESCE: new Set(['renderDirectoryList', 'updateGridLayout', 'setViewMode']),
  APP_VERSION: 15,
  mpHome: { features: {}, queued: [], loaded: false, failed: false },
  window: { __mpEarlyClicks: [] },
  document: {
    head: { appendChild(s) { scripts.push(s); } },
    createElement: () => ({ style: {}, setAttribute() {} }),
    querySelectorAll: (sel) => (sel === '.card[data-name]' ? Array.from(cardElsByName.values()) : []),
  },
  loadCard: (card, name) => { calls.load.push(name); loadedCards.add(name); },
  openStandaloneModal: (name) => calls.modal.push(name),
  retryLoadCard: (name) => calls.retry.push(name),
  addCardToToolbox: (...args) => calls.toolbox.push(args),
  cardSnapshotHTML: () => '<tool/>',
  showNotification: (msg) => calls.notify.push(msg),
  modalCanOpen: undefined, // supplied per suite below (the real one is extracted)
};

const sandbox = context(runtime);
const api = vm.runInContext(SRC + `
;({
  handleCardClick, requestToolboxAdd, flushPendingToolboxAdd, dropPendingToolboxAdd,
  drainEarlyClicks, bundleExhausted, callFeature, loadFeatures, pendingToolboxAdds,
  __setModalCanOpen: (fn) => { modalCanOpen = fn; },
});`, sandbox, { filename: 'home-clicks' });
return { scripts, runtime, api };
}

const { scripts, runtime, api } = boot();

// ---- 1. 🔲 / 📋 on a card that has not run yet --------------------------
// The buttons are in the header of every one of ~1,180 pending tiles and
// nothing answered them: the handler skipped `.card-action-btn` before it
// looked at anything else, and the per-card listener only exists after
// renderCardContent(). A click must now run the tool and add it once live.
{
  const card = makeCard('bmi');
  api.handleCardClick(event(card.refs.addGrid));
  assert.deepStrictEqual(calls.load, ['bmi'],
    '🔲 on a pending card must run the tool instead of doing nothing');
  assert.strictEqual(api.pendingToolboxAdds.size, 1,
    'the add must wait for the tool rather than snapshot an empty tile');
  assert.strictEqual(calls.toolbox.length, 0, 'nothing is added before the tool exists');

  // The render lands: the queued add completes.
  api.flushPendingToolboxAdd(card, 'bmi');
  assert.deepStrictEqual(calls.toolbox, [['BMI', '<tool/>', 'grid', 'bmi']],
    'the pending add must fire with the live snapshot once the card renders');
  assert.strictEqual(api.pendingToolboxAdds.size, 0, 'and only once');
  console.log('  ok   🔲 / 📋 on a pending card runs the tool, then adds it');
}

// ---- 2. a card that failed abandons the add instead of hanging ---------
{
  const card = makeCard('broken');
  api.requestToolboxAdd(card, 'broken', 'list');
  assert.strictEqual(api.pendingToolboxAdds.size, 1);
  api.dropPendingToolboxAdd('broken');
  assert.strictEqual(api.pendingToolboxAdds.size, 0,
    'a failed mount must not leave an add waiting for a render that cannot come');
  console.log('  ok   a card that fails drops the pending add');
}

// ---- 3. 🔲 on a card that is already live adds straight away -----------
{
  calls.load.length = 0;
  calls.toolbox.length = 0;
  const card = makeCard('loan', ['loaded']);
  loadedCards.add('loan');
  api.handleCardClick(event(card.refs.addList));
  assert.deepStrictEqual(calls.load, [], 'a live card is not fetched again');
  assert.deepStrictEqual(calls.toolbox, [['LOAN', '<tool/>', 'list', 'loan']],
    'a live card is snapshotted and added on the click itself');
  console.log('  ok   🔲 / 📋 on a live card adds immediately, without a refetch');
}

// ---- 4. ⛶ keeps its link when the modal cannot answer ------------------
// The handler used to preventDefault() unconditionally. With home-features.js
// dead, that left a link with its navigation cancelled and nothing in its
// place: the visitor clicked ⛶ and the page ignored them.
{
  api.__setModalCanOpen(() => false);
  const card = makeCard('bmi');
  const ev = event(card.refs.maximize);
  api.handleCardClick(ev);
  assert.strictEqual(ev.defaultPrevented, false,
    '⛶ must not be hijacked when the modal cannot open — the link is the fallback');
  assert.deepStrictEqual(calls.modal, [], 'and no modal is promised');

  api.__setModalCanOpen(() => true);
  const ev2 = event(card.refs.maximize);
  api.handleCardClick(ev2);
  assert.strictEqual(ev2.defaultPrevented, true, '⛶ opens the modal when it can');
  assert.deepStrictEqual(calls.modal, ['bmi'], 'and the modal is asked for');
  console.log('  ok   ⛶ opens the modal when it can, and stays a link when it cannot');
}

// ---- 5. clicks that landed before the app existed ----------------------
// The first screen's cards are real markup and invite a click from the first
// paint, while home-app.js is still downloading. Those clicks were lost.
{
  calls.load.length = 0;
  const bmi = makeCard('bmi');
  const loan = makeCard('loan');
  loadedCards.delete('bmi');
  loadedCards.delete('loan');
  cardElsByName.set('bmi', bmi);
  cardElsByName.set('loan', loan);
  runtime.window.__mpEarlyClicks = ['bmi', 'loan', 'ghost'];

  api.drainEarlyClicks();
  assert.deepStrictEqual(calls.load, ['bmi', 'loan'],
    'every click recorded before the app loaded must be replayed');
  // (Compared by length, not deepStrictEqual: the array the app replaces it
  // with is created inside the vm realm.)
  assert.strictEqual(runtime.window.__mpEarlyClicks.length, 0, 'and replayed once only');

  // A second pass must not re-run cards that are already live.
  calls.load.length = 0;
  api.drainEarlyClicks();
  assert.deepStrictEqual(calls.load, [], 'draining twice must not double-load');
  console.log('  ok   clicks from before the app loaded are replayed, once');
}

// ---- 6. a face click still runs a pending card -------------------------
{
  calls.load.length = 0;
  loadedCards.delete('bmi');
  const bmi = cardElsByName.get('bmi');
  bmi.classList.remove('loaded');
  delete bmi.dataset.parked;
  api.handleCardClick(event(bmi.refs.face));
  assert.deepStrictEqual(calls.load, ['bmi'], 'the face is the click-to-run target');
  console.log('  ok   clicking a card face still runs the tool');
}

// ---- 7. a bundle that fails is retried, then admitted ------------------
// `loaded` was set for good on the first call, so one 404 silenced every
// panel, the toolbox, ratings and the modal for the rest of the visit.
{
  const mpHome = runtime.mpHome;
  mpHome.failed = false;
  mpHome.loaded = false;
  scripts.length = 0;
  calls.notify.length = 0;

  api.loadFeatures(false);
  assert.strictEqual(scripts.length, 1, 'the idle prefetch fetches the bundle');
  assert.ok(/home-features\.js\?v=\d+$/.test(scripts[0].src), `unexpected bundle url: ${scripts[0].src}`);
  assert.strictEqual(scripts[0].fetchPriority, 'low',
    'at idle the bundle must stay out of the way of the card fragments');
  assert.strictEqual(mpHome.loaded, true, 'the bundle is marked in flight');

  // It fails. A later click must be able to try again.
  scripts[0].onerror();
  assert.strictEqual(mpHome.failed, true, 'the failure is recorded');
  assert.strictEqual(mpHome.loaded, false, 'and the in-flight flag is released for a retry');
  assert.strictEqual(api.bundleExhausted(), false, 'one failure is not the end');

  api.loadFeatures();
  assert.strictEqual(scripts.length, 2, 'a failed bundle is fetched again');
  assert.ok(scripts[1].src.includes('-r2'), `the retry must not be answered from the dead entry: ${scripts[1].src}`);
  scripts[1].onerror();

  api.loadFeatures();
  assert.strictEqual(scripts.length, 3, 'up to the attempt cap');
  scripts[2].onerror();

  assert.strictEqual(api.bundleExhausted(), true, 'after the last attempt the bundle is given up');
  assert.ok(calls.notify.length >= 1, 'and the visitor is told, not left clicking in silence');
  api.loadFeatures();
  assert.strictEqual(scripts.length, 3, 'no infinite retry loop');

  // A feature call after that says so instead of queueing forever.
  const before = mpHome.queued.length;
  api.callFeature('rateCard', ['bmi', 'up']);
  assert.strictEqual(mpHome.queued.length, before,
    'a dead bundle must not keep queueing calls it will never replay');
  console.log('  ok   a failed bundle is retried, then reported — clicks are never silent');

  // ... and while the bundle is still available, a click upgrades its
  // priority: the visitor is waiting for this download now, not the grid.
  const fresh = boot();
  fresh.api.callFeature('setViewMode', ['directory']);
  assert.strictEqual(fresh.scripts.length, 1, 'a click that needs the bundle fetches it now');
  assert.strictEqual(fresh.scripts[0].fetchPriority, 'high',
    'a click-driven fetch must not queue behind the card fragments');
  fresh.api.loadFeatures(false);
  assert.strictEqual(fresh.scripts.length, 1, 'and it is fetched once, not once per click');
  console.log('  ok   a click upgrades the bundle fetch; the idle prefetch does not');
}

// ---- 8. home-features.js owns the popover state ------------------------
// The buttons carry `popovertarget`; the browser's own toggle runs after the
// listener, so without preventDefault() the panel opened and closed in the
// same click and looked dead for the rest of the visit.
for (const fn of ['toggleToolbox', 'togglePanel']) {
  const body = BUNDLE.match(new RegExp(`function ${fn}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n`));
  assert(body, `could not extract ${fn}() from home-features.js`);
  assert.ok(/event\.preventDefault\(\)/.test(body[0]),
    `${fn}() must preventDefault() — the button's popovertarget activation ` +
    'otherwise toggles the panel straight back and the button does nothing');
  assert.ok(/event\.stopPropagation\(\)/.test(body[0]), `${fn}() must still stop propagation`);
}
console.log('  ok   the panel toggles cancel the browser\'s own popover toggle');

// ---- 9. index.html answers clicks before the app arrives ---------------
{
  const block = INDEX.match(/<!--EARLY-CLICKS:BEGIN[\s\S]*?<!--EARLY-CLICKS:END-->/);
  assert(block, 'index.html must ship the early-click bootstrap');
  assert.ok(/addEventListener\('click'[\s\S]*?true\)/.test(block[0]),
    'the bootstrap must listen in the capture phase');
  assert.ok(/__mpEarlyClicks/.test(block[0]), 'the bootstrap must record the click');
  assert.ok(/Starting/.test(block[0]), 'and answer it on the spot, with feedback');
  assert.ok(/drainEarlyClicks\(\);/.test(APP), 'the app must replay what the bootstrap recorded');
  console.log('  ok   index.html records clicks that land before home-app.js exists');
}

// ---- 10. nothing overlays the page while it animates -------------------
{
  const vt = CSS.match(/@supports \(view-transition-name: --dummy\) \{([\s\S]*?)\n        \}\n/);
  assert(vt, 'home.css must still scope its view-transition rules');
  assert.ok(/::view-transition\s*\{[^}]*pointer-events:\s*none/.test(vt[1]),
    '::view-transition must be pointer-events: none — it covers the viewport and ' +
    'swallows every click for the length of the transition');
  assert.ok(!/view-transition-name:\s*header/.test(CSS),
    'two elements sharing the name "header" aborted every transition before it started');
  assert.ok(!/view-transition-name:\s*search-meta/.test(CSS),
    'two elements sharing the name "search-meta" aborted every transition too');
  assert.ok(!/view-transition-name:\s*var\(--vt-name/.test(CSS),
    'naming every card takes every card out of hit-testing during a transition');
  const notif = CSS.match(/\.notification \{([^}]*)\}/);
  assert(notif, 'home.css must style .notification');
  assert.ok(/pointer-events:\s*none/.test(notif[1]),
    'a toast has nothing to click and must not swallow the click underneath it');
  const backdrop = DEFERRED_CSS.match(/::backdrop \{([^}]*)\}/);
  assert(backdrop, 'home-deferred.css must style ::backdrop');
  assert.ok(/pointer-events:\s*none/.test(backdrop[1]),
    'the toolbox is a manual popover: a hit-testable backdrop ate every click ' +
    'outside it, with no way to dismiss it');
  console.log('  ok   no overlay is left swallowing clicks (view transitions, toasts, backdrop)');
}

console.log('\nhome-click tests passed');
