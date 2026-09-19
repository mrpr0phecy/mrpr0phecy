// Tests the live-window rework: what a "screenful of tools" means, what the
// grid is allowed to run, and the CSS the geometry has to agree with.
//
// Why this suite exists: the page used to answer "how many of my 1,194 tools
// are on the main page?" with "nine". The cause was not a broken fetch — it was
// one column of 330px cards (so a screen held two tools) crossed with a loader
// that only made a tool real by fetching, parsing and executing it, throttled to
// six per 2.5 seconds (so the rest of the catalogue was an hour away). The fix
// is a dense mosaic, a mount budget tied to the viewport, and a warm-ahead path
// that separates bytes from running. All three are pinned here against the real
// shipped functions and the real shipped stylesheet.
//
// Zero dependencies (node only). No browser required. Run with:
//
//   node scripts/tests/live-window.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'home-app.js');
const CSS = path.join(ROOT, 'home.css');
const INDEX = path.join(ROOT, 'index.html');
const app = fs.readFileSync(APP, 'utf8');
const css = fs.readFileSync(CSS, 'utf8');
const index = fs.readFileSync(INDEX, 'utf8');

function grab(name) {
  const m = app.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n`));
  assert(m, `could not extract ${name}() from home-app.js — has it been renamed?`);
  return m[0];
}

function run(src, obj, name) {
  const proxy = new Proxy(obj || {}, {
    has: () => true,
    get: (t, k) => (k in t ? t[k]
      : (k in globalThis && typeof globalThis[k] !== 'undefined' ? globalThis[k] : () => {})),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  vm.createContext(proxy);
  return vm.runInContext(src, proxy, { filename: name || 'extracted' });
}

// The density table, read out of the shipped file rather than copied.
const DENSITY_SRC = app.match(/const DENSITY = \{([\s\S]*?)\n    \};/);
assert(DENSITY_SRC, 'could not read the DENSITY table from home-app.js');
const DENSITY = new Function(`return {${DENSITY_SRC[1]}};`)();

// ---------------------------------------------------------------- suite 1
// gridMetrics(): the geometry that decides how many tools a screen holds. A
// mosaic screen must hold a *catalogue-relevant* number — the old single-column
// grid produced six, which is what made the site look like it had nine tools.
{
  const api = run(
    'const CONFIG = ' + JSON.stringify({ INITIAL_LOAD: 6 }) + ';\n'
    + 'const DENSITY = ' + JSON.stringify(DENSITY) + ';\n'
    + "const DENSITY_DEFAULT = 'mosaic';\n"
    + grab('gridMetrics') + '\n;({ gridMetrics })', {}, 'gridMetrics');

  const laptop = api.gridMetrics(900, 1280, 'mosaic');
  assert.ok(laptop.cols >= 4, `a 1280px mosaic should be at least 4 tiles wide, got ${laptop.cols}`);
  assert.ok(laptop.rows >= 4, `a 900px viewport should show several rows, got ${laptop.rows}`);
  assert.ok(laptop.screen >= 16,
    `a mosaic screen must hold a real slice of the catalogue, got ${laptop.screen} tools`);
  assert.strictEqual(laptop.batch, Math.min(DENSITY.mosaic.cap, Math.max(6, laptop.screen)),
    'the first batch must be the screenful, bounded by the density cap');
  assert.ok(laptop.batch >= 12,
    `the first batch is ${laptop.batch} tools — that is the nine-tool page again`);

  const focus = api.gridMetrics(900, 1280, 'focus');
  assert.strictEqual(focus.cols, 1, 'focus mode is one tool per row');
  assert.ok(focus.batch <= DENSITY.focus.cap, 'focus mode must not over-mount a mosaic-sized batch');

  const phone = api.gridMetrics(800, 360, 'mosaic');
  assert.ok(phone.cols >= 2, `a 360px phone still shows two tiles side by side, got ${phone.cols}`);

  // Junk in, sane out: this feeds a fetch loop, so a NaN batch is a hung page.
  for (const junk of [[0, 0], [NaN, NaN], [-100, -100], [undefined, undefined]]) {
    const m = api.gridMetrics(junk[0], junk[1], 'mosaic');
    assert.ok(Number.isFinite(m.batch) && m.batch >= 1 && m.batch <= 64,
      `gridMetrics(${junk[0]}, ${junk[1]}) returned batch=${m.batch}`);
  }
  assert.strictEqual(api.gridMetrics(900, 1280, 'not-a-mode').cols, laptop.cols,
    'an unknown density must fall back to the default, not to zero columns');
  console.log(`  ok   a mosaic screenful is ${laptop.screen} tiles (${laptop.cols}×${laptop.rows}); the first batch mounts ${laptop.batch}`);
}

// ---------------------------------------------------------------- suite 2
// The CSS and the JS describe the same grid. They are two files written by one
// change, and if they drift the loader sizes the first batch for a grid that is
// not on screen.
{
  const mosaicBlock = css.slice(css.indexOf('===== MOSAIC DENSITY'));
  assert(mosaicBlock.length > 200, 'the MOSAIC DENSITY block is missing from home.css');
  assert.ok(mosaicBlock.includes(`minmax(${DENSITY.mosaic.min}px, 1fr)`),
    `home.css must lay the mosaic out at minmax(${DENSITY.mosaic.min}px, 1fr) to match DENSITY.mosaic.min`);
  assert.ok(mosaicBlock.includes(`max-width: ${DENSITY.mosaic.narrowAt}px`),
    `the narrow-screen breakpoint in home.css must match DENSITY.mosaic.narrowAt (${DENSITY.mosaic.narrowAt}px)`);
  assert.ok(mosaicBlock.includes(`minmax(${DENSITY.mosaic.narrowMin}px, 1fr)`),
    'the narrow tile width in home.css must match DENSITY.mosaic.narrowMin');
  // A running tool owns a whole row; a pending tool is a tile.
  assert.ok(/\.card\.loaded\s*\{\s*grid-column: 1 \/ -1;/.test(mosaicBlock),
    'a loaded tool must span the full row in mosaic mode');
  // The pre-rendered first screen stays valid either way, so the shell count
  // must remain within the batch: twelve shells, cap >= 12.
  assert.ok(DENSITY.mosaic.cap >= 12,
    'HOME-PRERENDER ships twelve shells; the mosaic cap must be at least that, or the first screen waits on JSON again');
  console.log('  ok   home.css mosaic geometry matches DENSITY in home-app.js (and a live tool spans the row)');
}

// ---------------------------------------------------------------- suite 3
// savedDensity() + applyDensity(): the preference is read from storage, only
// ever one of two values, and the class it sets is the class the CSS keys on.
{
  const saved = (store) => run(
    'const DENSITY = ' + JSON.stringify(DENSITY) + ';\n'
    + "const DENSITY_DEFAULT = 'mosaic';\n"
    + 'const localStorage = ' + store + ';\n'
    + grab('savedDensity') + '\n;({ savedDensity })', {}, 'savedDensity');

  assert.strictEqual(saved(`({ getItem: () => 'focus' })`).savedDensity(), 'focus');
  assert.strictEqual(saved(`({ getItem: () => 'mosaic' })`).savedDensity(), 'mosaic');
  assert.strictEqual(saved(`({ getItem: () => 'wide' })`).savedDensity(), 'mosaic',
    'an unknown stored density must fall back to the default');
  assert.strictEqual(saved(`({ getItem: () => { throw new Error('blocked'); } })`).savedDensity(), 'mosaic',
    'a blocked localStorage must not take the grid down with it');

  const buttons = [
    { dataset: { density: 'mosaic' }, classes: new Set(['active']), attrs: {}, classList: null, setAttribute(k, v) { this.attrs[k] = v; } },
    { dataset: { density: 'focus' }, classes: new Set(), attrs: {}, classList: null, setAttribute(k, v) { this.attrs[k] = v; } },
  ];
  buttons.forEach(b => {
    b.classList = { toggle: (c, on) => { if (on) b.classes.add(c); else b.classes.delete(c); } };
  });
  const bodyClasses = new Set(['density-mosaic']);
  const api = run(
    'const DENSITY = ' + JSON.stringify(DENSITY) + ';\n'
    + "const DENSITY_DEFAULT = 'mosaic';\n"
    + 'let currentDensity = DENSITY_DEFAULT;\n'
    + grab('applyDensity') + '\n;({ applyDensity, density: () => currentDensity })',
    {
      document: {
        body: { classList: { toggle: (c, on) => { if (on) bodyClasses.add(c); else bodyClasses.delete(c); } } },
        querySelectorAll: () => buttons,
        getElementById: () => null,
      },
      updateLiveCount: () => {},
    }, 'applyDensity');

  assert.strictEqual(api.applyDensity('focus'), 'focus');
  assert.ok(bodyClasses.has('density-focus'), 'focus mode must set .density-focus — home.css keys on it');
  assert.ok(!bodyClasses.has('density-mosaic'), 'the two density classes must not fight');
  assert.strictEqual(buttons[1].attrs['aria-pressed'], 'true', 'the pressed button must say so');
  assert.strictEqual(buttons[0].attrs['aria-pressed'], 'false', 'the other one must say so too');
  // An unknown mode never leaves the page with no density class at all.
  bodyClasses.clear();
  assert.strictEqual(api.applyDensity('sideways'), 'mosaic');
  assert.ok(bodyClasses.has('density-mosaic'), 'an unknown density must land on the default');
  console.log('  ok   density is read from storage, defaults to mosaic, and is what the CSS selects');
}

// ---------------------------------------------------------------- suite 4
// The mount budget's memory: cardCache is what makes a mount a millisecond
// instead of a round trip, so it must be allowed to grow to a warm screenful
// and no further. Pruning keeps everything that is actually running.
{
  const CAP = 8;
  const cardCache = new Map();
  const loadedCards = new Set(['running-1', 'running-2']);
  const loadingCards = new Set();
  const api = run(
    `const CONFIG = ${JSON.stringify({ CARD_CACHE_MAX: CAP })};\n`
    + grab('rememberWarmed') + '\n' + grab('pruneCardCache')
    + '\n;({ rememberWarmed, pruneCardCache, size: () => cardCache.size })',
    { cardCache, loadedCards, loadingCards, parkedCards: new Set(['parked-1']), Date }, 'cardCache');

  for (let i = 0; i < CAP * 2; i++) api.rememberWarmed(`c${i}`, `<i>${i}</i>`);
  assert.ok(api.size() <= CAP, `cardCache grew to ${api.size()}, over its cap of ${CAP}`);
  for (const key of loadedCards) {
    api.rememberWarmed('push', 'x');
  }
  api.rememberWarmed('running-1', '<b>still here</b>');
  assert.ok(cardCache.has('running-1'), 'a running tool must never be pruned out of the cache');
  // Parked tools are the same promise in weaker form: their bytes are what makes
  // a wake-up instant, so the cap must not spend them first.
  cardCache.set('parked-1', '<b>parked</b>');
  api.rememberWarmed('push-2', 'x');
  assert.ok(cardCache.has('parked-1'),
    'a parked tool must keep its bytes: losing them means a wake-up that has to re-fetch');
  // Warming an entry that is already cached refreshes it, it does not add a
  // second row (the cap would otherwise fill with duplicates of the same tool).
  const before = api.size();
  api.rememberWarmed('running-1', '<b>still here</b>');
  assert.strictEqual(api.size(), before, 're-warming a cached card grew the cache');
  console.log(`  ok   cardCache is capped (${CAP}) and never evicts a running tool`);
}

// ---------------------------------------------------------------- suite 5
// The shipped shape of the loader: warm-ahead exists, the trickle does not.
// These are the greppable promises behind the fix; a regression here is the
// nine-tool page coming back with a new name.
{
  assert.ok(!/TRICKLE_BATCH|startIdleTrickle/.test(app),
    'the idle trickle is back. Mounting the catalogue on a timer is exactly what made 1,194 tools look like nine; warming is the background path now.');
  assert.ok(/function startCacheWarm\(/.test(app), 'no warm-ahead pass in the loader');
  assert.ok(/startCacheWarm\(\);/.test(app), 'the grid build never starts warming');
  // The mount decision and the download decision must stay separate calls:
  // loadCard() mounts, warmCard() fetches.
  assert.ok(/function loadCard\(card, cardName\)/.test(app), 'loadCard() signature changed — the mount path is the viewport’s');
  assert.ok(/function warmCard\(cardName\)/.test(app), 'warmCard() must take a name, not a card: no DOM, no render');
  // Filters must not mount the whole result set on a keystroke.
  const filters = app.slice(app.indexOf('function applyFiltersCore'), app.indexOf('function applyFilters('));
  assert.ok(!/loadCard\(cardEl, name\)/.test(filters),
    'applyFiltersCore mounts every match again — a 152-tool category pill would queue 152 fetch+parse+execute jobs at once');
  assert.ok(/resetWarmWindow\(\)/.test(filters), 'a filter change must move the warm window with it');
  // Click-to-run still bypasses everything, and in mosaic the whole tile is the
  // click target (a 212px tile has no spare corner for a "run" button).
  assert.ok(/closest\('\.card\.card-pending'\)/.test(app), 'mosaic tiles must be runnable by clicking anywhere on them');
  console.log('  ok   trickle gone, warm-ahead in, filters do not mount, tiles are clickable anywhere');
}

// ---------------------------------------------------------------- suite 6
// The page's own chrome: the density control and the live counter exist in the
// shipped HTML, so the mosaic is a choice the visitor can see and undo rather
// than a silent re-skin.
{
  assert.ok(/id="liveToolCount"/.test(index), 'the toolbar must say how many tools are running, not just how many exist');
  const mosaic = index.match(/<button[^>]*data-density="mosaic"[^>]*>/);
  const focus = index.match(/<button[^>]*data-density="focus"[^>]*>/);
  assert(mosaic && focus, 'both density controls must ship in the markup (no-JS and crawlers see the choice)');
  for (const btn of [mosaic[0], focus[0]]) {
    assert(/class="view-btn/.test(btn), 'density controls reuse the toolbar button style');
    assert(/aria-pressed="(true|false)"/.test(btn), 'a density control must expose its pressed state');
    assert(/type="button"/.test(btn), 'type=button, or the toolbar button submits the search form');
  }
  assert(/aria-label="Grid density"/.test(index), 'the density pair needs a group label');
  console.log('  ok   Mosaic/Focus and the live counter ship in index.html');
}

// ---------------------------------------------------------------- suite 7
// First screen: twelve pre-rendered shells plus a mosaic batch must not put the
// visitor back on a loading state. computeInitialBatch() is the number the
// loader uses; it has to be the grid’s screenful, not a hard-coded 12.
{
  const api = run(
    'const CONFIG = ' + JSON.stringify({ INITIAL_LOAD: 6 }) + ';\n'
    + 'const DENSITY = ' + JSON.stringify(DENSITY) + ';\n'
    + "const DENSITY_DEFAULT = 'mosaic';\n"
    + 'let currentDensity = "mosaic";\n'
    + grab('gridMetrics') + '\n' + grab('computeInitialBatch')
    + '\n;({ computeInitialBatch, setDensity: d => { currentDensity = d; } })',
    { window: { innerHeight: 900, innerWidth: 1280 } }, 'computeInitialBatch');

  const mosaic = api.computeInitialBatch();
  api.setDensity('focus');
  const focus = api.computeInitialBatch();
  assert.ok(mosaic > focus, `a mosaic must start more tools than focus (${mosaic} vs ${focus})`);
  assert.ok(mosaic <= 32, `first batch of ${mosaic} tools is past the point where mounting is the bottleneck`);
  assert.ok(!/Math\.min\(12,/.test(app),
    'computeInitialBatch() hard-caps at 12 again — that is a sixth-of-a-screen batch in mosaic mode');

  // No usable window (an odd embed, a headless pass): the fallback is the
  // documented 900×1200 default, not a throw and not zero tools.
  const bare = run(
    'const CONFIG = ' + JSON.stringify({ INITIAL_LOAD: 6 }) + ';\n'
    + 'const DENSITY = ' + JSON.stringify(DENSITY) + ';\n'
    + "const DENSITY_DEFAULT = 'mosaic';\nlet currentDensity = 'mosaic';\n"
    + grab('gridMetrics') + '\n' + grab('computeInitialBatch') + '\n;({ computeInitialBatch })',
    { window: undefined }, 'computeInitialBatch-bare');
  const fallback = bare.computeInitialBatch();
  assert.ok(Number.isFinite(fallback) && fallback >= 6 && fallback <= DENSITY.mosaic.cap,
    `a window-less first batch must stay inside sane bounds, got ${fallback}`);
  console.log(`  ok   first batch follows the grid: ${mosaic} tiles in mosaic, ${focus} in focus`);
}


// ============================================================ THE PARK suites
// A minimal element, enough to prove that a node *move* is a move: parents,
// children, classes, the `hidden` flag, an inline style. This has to be about
// real nodes — parking is DOM surgery rather than re-rendering, and a stub that
// only counted calls would pass for an implementation that threw the subtree away.
function node(tag, cls, id) {
  const self = {
    tagName: tag, id: id || '', className: cls || '', dataset: {}, style: {},
    hidden: false, textContent: '', children: [], parent: null, rect: null,
    isConnected: true, _matches: false,
    findAll(sel) {
      const test = (n) => sel[0] === '#' ? n.id === sel.slice(1)
        : sel[0] === '.' ? n.classList.contains(sel.slice(1))
        : n.tagName === sel.toUpperCase();
      const out = [];
      const walk = (n) => { for (const c of n.children) { if (test(c)) out.push(c); walk(c); } };
      walk(self);
      return out;
    },
  };
  self.classList = {
    add(...names) { const s = new Set(self.className.split(' ').filter(Boolean)); names.forEach(n => s.add(n)); self.className = [...s].join(' '); },
    remove(...names) { const s = new Set(self.className.split(' ').filter(Boolean)); names.forEach(n => s.delete(n)); self.className = [...s].join(' '); },
    contains(name) { return self.className.split(' ').includes(name); },
    toggle(name, on) { if (on) self.classList.add(name); else self.classList.remove(name); },
  };
  self.appendChild = (child) => {
    if (child.parent) child.parent.children = child.parent.children.filter(n => n !== child);
    child.parent = self;
    self.children.push(child);
    return child;
  };
  self.remove = () => {
    if (self.parent) self.parent.children = self.parent.children.filter(n => n !== self);
    self.parent = null;
  };
  self.contains = (other) => { let p = other; while (p) { if (p === self) return true; p = p.parent; } return false; };
  self.matches = () => self._matches;
  self.getBoundingClientRect = () => {
    self.rectReads = (self.rectReads || 0) + 1;   // a forced layout, counted
    return self.rect || { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
  };
  self.setAttribute = (k, v) => { if (k === 'class') self.className = v; else self.dataset[k] = v; };
  self.querySelector = (sel) => self.findAll(sel)[0] || null;
  // Enough of the Web Animations API to prove a pause is a pause: subtree walks
  // the children, and every animation records its own playState.
  self.getAnimations = (opts) => {
    if (self._animThrows) throw new Error('no getAnimations here');
    const out = (self.anims || []).slice();
    if (opts && opts.subtree) for (const c of self.children) out.push(...(c.getAnimations ? c.getAnimations(opts) : []));
    return out;
  };
  self.querySelectorAll = (sel) => self.findAll(sel);
  return self;
}

function fakeAnim(name) {
  const anim = {
    name, playState: 'running', pauses: 0, plays: 0,
    pause() { this.pauses++; this.playState = 'paused'; },
    play() { this.plays++; this.playState = 'running'; },
  };
  return anim;
}

// One card as renderCardContent leaves it: shell + face + tool content + an
// injected style, and a rating footer the card created for itself.
function makeTool(name, top, height, tileHeight) {
  const card = node('div', 'card loaded visible');
  card.dataset.name = name;
  card._top = top; card._row = height; card._tile = tileHeight || 0;
  // The rect answers to the card's own classes the way the grid does: in the
  // mosaic a row wearing `card-pending` is a 172px tile and a row wearing
  // `card.loaded` claims the whole line. A park is exactly that swap, so a test
  // about jumping has to be shown a height that changes. `tileHeight` of 0 keeps
  // a card one-stable-height, which is what every other suite here wants;
  // assigning `.rect` (older suites do, to move a card) pins the geometry and
  // turns the model off for that card.
  Object.defineProperty(card, 'rect', {
    configurable: true,
    get() {
      const h = card._tile && card.classList.contains('card-pending') ? card._tile : card._row;
      return { top: card._top, bottom: card._top + h, left: 0, right: 948, width: 948, height: h };
    },
    set(v) { card._top = v.top; card._row = v.height; card._tile = 0; },
  });
  const content = node('div', 'card-content');
  content.style.minHeight = height + 'px';
  const sandbox = node('div', 'card-sandbox', 'card-' + name);
  const face = node('div', 'card-face');
  const hint = node('div', 'card-face-hint');
  hint.textContent = 'Click to run';   // the words the shipped shell template uses
  face.appendChild(hint);
  face.hidden = true;
  const tool = node('div', 'card-sandbox-content');
  tool.anims = [fakeAnim('spin'), fakeAnim('pulse')];
  const injected = node('style');
  const footer = node('div', 'card-footer');
  sandbox.appendChild(face);
  sandbox.appendChild(tool);
  sandbox.appendChild(injected);
  content.appendChild(sandbox);
  card.appendChild(content);
  card.appendChild(footer);
  return { card, content, sandbox, face, hint, tool, injected, footer };
}

const HINTS = app.match(/const FACE_HINT_RUN = '([^']+)';\s*const FACE_HINT_PARKED = '([^']+)';/);
assert(HINTS, 'could not read the parked/tile face hints from home-app.js');
assert(HINTS[1] !== HINTS[2], 'a parked face and a tile face need two different sentences');
const HINT_RUN = HINTS[1];
const HINT_PARKED = HINTS[2];

const PARK_CONST = app.match(/const PARK_MARGIN_VH = ([\d.]+);/);
assert(PARK_CONST, 'could not read PARK_MARGIN_VH from home-app.js — is the hysteresis still a named constant?');
const MARGIN_VH = parseFloat(PARK_CONST[1]);
// The scroll gate, read from the source so this file follows it instead of
// duplicating it: an undeclared name here would resolve to a no-op stub and the
// gate would silently stop being tested.
const PARK_STEP_M = app.match(/const PARK_STEP = (\d+);\s*const PARK_STEP_MAX = (\d+);/);
assert(PARK_STEP_M, 'could not read the park pass scroll gate (PARK_STEP / PARK_STEP_MAX) from home-app.js');
const PARK_STEP = parseInt(PARK_STEP_M[1], 10);
const PARK_STEP_MAX = parseInt(PARK_STEP_M[2], 10);
assert(PARK_STEP > 60 && PARK_STEP_MAX > PARK_STEP,
    `the park pass must be gated on real scroll distance, not on frames (${PARK_STEP}/${PARK_STEP_MAX})`);
// The governor's starting values, read out of the file: they are compared against
// performance.now(), so a harness that guesses them either tests nothing or fails
// for the wrong reason.
const INITIAL_SHRINK = (app.match(/let lastShrink = ([^;]+);/) || [])[1];
assert(INITIAL_SHRINK, 'could not read the governor lastShrink initialiser from home-app.js');
const readNum = (key) => {
  const m = app.match(new RegExp(key + ':\\s*(\\d+)'));
  assert(m, `could not read ${key} from home-app.js`);
  return parseInt(m[1], 10);
};

let __harness = null;
let __harnessWin = null;
// The pass is gated on how far the page has scrolled, so a test needs to be able
// to move the scroll position (there is no layout engine here to move it).
function harnessScroll(y) { __harnessWin.scrollY = y; }
function harnessHost() { return __harness ? __harness.host : null; }
function harnessScrolls() { return __harness ? __harness.scrolls : []; }
function parkHarness(opts) {
  const o = Object.assign({ parkMode: true, runAll: false, innerHeight: 900, memory: null, ceiling: 64,
    collapse: true }, opts || {});
  const tools = new Map();
  const loadedCards = new Set();
  const parkedCards = new Map();
  const cardElsByName = new Map();
  const pendingCards = [];
  // The park host is *not* pre-made: parkHost() builds it on the first park, and
  // getElementById has to find it the way a document would.
  const body = node('body');
  const seen = { observes: 0, sweeps: 0, liveCountUpdates: 0 };
  const parkOrder = [];
  const findHost = () => body.children.find(c => c.id === 'mp-park') || null;
  const scrolls = [];
  const win = {
    innerHeight: o.innerHeight,
    scrollY: 0,
    // Not a spy that only counts: the whole point of the park's scroll correction
    // is *which offset* the page lands on, so the fake has to actually move.
    scrollTo(x, y) { win.scrollY = y; scrolls.push(y); },
  };
  const doc = {
    body,
    activeElement: null,
    createElement: (tag) => node(tag),
    getElementById: (id) => (id === 'mp-park' ? findHost() : null),
  };
  const src = [
    'const PARK_MARGIN_VH = ' + MARGIN_VH + ';',
    `const FACE_HINT_RUN = ${JSON.stringify(HINT_RUN)};`,
    `const FACE_HINT_PARKED = ${JSON.stringify(HINT_PARKED)};`,
    'let parkMode = ' + o.parkMode + ';',
    'let mountWindow = ' + readNum('MOUNT_WINDOW_DEFAULT') + ';',
    'let parkCeiling = ' + o.ceiling + ';',
    `const PARK_STEP = ${PARK_STEP};`,
    `const PARK_STEP_MAX = ${PARK_STEP_MAX};`,
    'let lastParkScrollY = -Infinity;',
    'let parkStep = PARK_STEP;',
    'let lastLongFrame = 0;',
    `let lastShrink = ${INITIAL_SHRINK};`,
    'let collapsePark = ' + o.collapse + ';',
    'let touchActive = ' + (o.touch ? 'true' : 'false') + ';',
    'let scrollHold = 0;',
    'let holdBatch = 0;',
    'let lastWarmScrollY = 0;',
    'let governorHasLoAF = true;',
    'let frameProbed = false;',
    'const explicitRunAll = ' + o.runAll + ';',
    grab('parkHost'), grab('memoryPressure'), grab('setFaceHint'), grab('keepAlive'),
    grab('pauseParkedAnimations'),
    // `collapsing()` is the gate every collapse and every correction goes
    // through. Left out of an extracting harness it resolves to the Proxy's
    // no-op, and "no correction happened" and "the code decided not to" become
    // the same test result — which is how this file once passed while proving
    // nothing.
    grab('collapsing'), grab('canHoldScroll'),
    grab('parkMargin'), grab('aboveTheFold'), grab('noteRowHeight'), grab('beginHold'),
    grab('endHold'), grab('commitScrollHold'), grab('wakeInsideWindow'), grab('growWindowBack'),
    grab('parkCard'), grab('resumeParked'), grab('prunePark'), grab('parkOutsideWindow'),
    grab('adjustCardHeight'),
    ';({ parkCard, resumeParked, parkOutsideWindow, prunePark, parkHost, memoryPressure, adjustCardHeight,',
    '  parkMargin, beginHold, endHold, commitScrollHold, growWindowBack, aboveTheFold, noteRowHeight,',
    '  state: { loadedCards, parkedCards, cardElsByName, pendingCards, host, seen },',
    '  get mountWindow() { return mountWindow; }, set parkMode(v) { parkMode = v; },',
    '  set collapse(v) { collapsePark = v; }, get collapse() { return collapsePark; },',
    '  get lastParkScrollY() { return lastParkScrollY; },',
    '  get lastWarmScrollY() { return lastWarmScrollY; },',
    '  get scrollHold() { return scrollHold; },',
    '  parkOrder: () => parkOrder });',
  ].join('\n');
  const api = run(src, {
    document: doc,
    performance: { now: () => 0, memory: o.memory },
    window: win,
    // The pass must not need a timer or a frame of its own: it runs inside the
    // sweep's rAF. A call here is a bug, so the fake has one job — to be loud.
    requestAnimationFrame: () => { throw new Error('the park pass must not need a frame callback'); },
    navigator: { deviceMemory: 8 },
    CONFIG: { MOUNT_WINDOW_DEFAULT: readNum('MOUNT_WINDOW_DEFAULT'), MOUNT_WINDOW_MIN: readNum('MOUNT_WINDOW_MIN'),
      MOUNT_WINDOW_MAX: readNum('MOUNT_WINDOW_MAX'), PARK_CEILING: o.ceiling, LONG_FRAME_MS: readNum('LONG_FRAME_MS'),
      REMOUNT_LOOKAHEAD: readNum('REMOUNT_LOOKAHEAD') },
    isCardHidden: (card) => card.style.display === 'none',
    observer: { observe: () => { seen.observes++; }, unobserve: () => {} },
    pendingCards, parkOrder,
    loadedCards, parkedCards, cardElsByName,
    scheduleViewportSweep: () => { seen.sweeps++; },
    updateLiveCount: () => { seen.liveCountUpdates++; },
  }, 'park-harness');
  api.add = (name, top, height, tile) => {
    const t = makeTool(name, top, height, tile);
    tools.set(name, t);
    loadedCards.add(name);
    cardElsByName.set(name, t.card);
    return t;
  };
  const made = { api, tools, win, scrolls, loadedCards, parkedCards, cardElsByName, pendingCards, seen, doc,
    get host() { return findHost(); } };
  __harness = made;
  __harnessWin = win;
  return made;
}

// ---------------------------------------------------------------- suite 8
// Park and resume are a node move, not a re-render. Nothing is fetched, nothing
// is thrown away, and the visitor's tool comes back with its DOM intact.
{
  const { api, tools, loadedCards, parkedCards, pendingCards, seen } = parkHarness();
  // (loadedCards/parkedCards are the very objects the extracted code mutates.)
  assert.strictEqual(harnessHost(), null, 'a page that never scrolls past one window must not build the park host');

  const t = api.add('loan', 5000, 412);   // far below a 900px viewport
  assert.strictEqual(api.parkCard(t.card, 'loan'), true, 'parkCard must accept a mounted card');
  const host = harnessHost();
  assert.ok(host, 'parking for real must create the park host');
  assert.strictEqual(host.dataset['aria-hidden'], 'true', 'the park must be out of the a11y tree');

  // The face stays, the tool leaves — into the park, in one holder.
  assert.strictEqual(t.sandbox.children.length, 1, 'only the face may remain in a parked sandbox');
  assert.strictEqual(t.sandbox.children[0], t.face, 'and what remains must be the face');
  const holder = host.children[0];
  assert.strictEqual(holder.className, 'parked-tool', 'the holder is the styled park slot');
  assert.deepStrictEqual(holder.children.map(c => c.tagName), ['div', 'style'],
    'the tool content and its injected style must both travel to the park');
  assert.strictEqual(t.tool.parent, holder, 'the tool nodes must be in the park, not deleted');
  assert.strictEqual(t.footer.parent, t.card,
    'the rating footer stays with its shell: orphaning it would strand the vote UI');

  // A parked tool is not loaded, is parked, and its row did not collapse.
  assert.ok(!t.card.classList.contains('loaded'), 'a parked card must not claim a grid row as live');
  assert.ok(t.card.classList.contains('card-parked'), 'a parked card must say so');
  // The row goes back to being a tile, and the height it held is *stored*, not
  // left on the box: an inline min-height outranks the tile rules, so a collapse
  // that forgot to clear one would park a tool inside a 412px gap.
  assert.ok(t.card.classList.contains('card-pending'), 'a parked row is a tile again');
  assert.strictEqual(t.content.style.minHeight, '', 'and its pinned height comes off the box');
  assert.strictEqual(t.card.dataset.parkedMinHeight, '412px',
    'but is kept, verbatim, for the way back — a parked sandbox has only a face to measure');
  // …and a resize must not measure the empty parked box into anything.
  api.adjustCardHeight(t.card);
  assert.strictEqual(t.content.style.minHeight, '',
    'adjustCardHeight must leave a parked row alone: a face-only sandbox is not a tool');
  assert.strictEqual(t.card.dataset.parkedMinHeight, '412px', 'and must not corrupt the stored height');
  assert.strictEqual(t.face.hidden, false, 'the face is what a parked tile shows');
  assert.strictEqual(t.hint.textContent, HINT_PARKED,
    'a parked face must not claim the tool is unstarted');
  assert.ok(!loadedCards.has('loan') && parkedCards.has('loan'), 'the handover of ownership');
  // …and a parked tool stops repainting nothing.
  const anims = t.tool.anims;
  assert.deepStrictEqual(anims.map(a => a.playState), ['paused', 'paused'],
    'animations inside a parked subtree must be paused while nobody can see them');
  // Identity, not deep equality: `paused` is an Array built inside the vm, and a
  // cross-realm prototype makes deepStrictEqual refuse an otherwise identical
  // pair. What matters here is exactly *which* animations were remembered.
  const pausedList = parkedCards.get('loan').anims;
  assert.strictEqual(pausedList.length, 2, 'the paused set is remembered for the wake-up');
  assert.strictEqual(pausedList[0], anims[0], 'and holds the very animations it paused');
  assert.strictEqual(pausedList[1], anims[1], 'in the order it found them');
  assert.strictEqual(anims[0].pauses, 1, 'one pause per animation, not one per pass');
  assert.strictEqual(seen.observes, 1, 'a parked card must be re-armed with the observer');
  assert.deepStrictEqual(pendingCards.map(c => c.dataset.name), ['loan'],
    'and it must be back in the sweep list so the viewport can wake it');

  // Waking up: same nodes, same parents, no fetch.
  assert.strictEqual(api.resumeParked(t.card, 'loan'), true, 'resume must succeed for a parked tool');
  assert.strictEqual(t.tool.parent, t.sandbox, 'the tool content comes back to its own sandbox');
  assert.strictEqual(t.injected.parent, t.sandbox, 'including the styles it injected');
  assert.strictEqual(t.sandbox.children[0], t.face, 'the face is still there, hidden again');
  assert.strictEqual(t.face.hidden, true, 'a live tool must not show its face');
  assert.strictEqual(t.hint.textContent, HINT_RUN, 'and the hint must go back to the truth');
  assert.ok(loadedCards.has('loan') && !parkedCards.has('loan'), 'it is live again');
  assert.strictEqual(t.content.style.minHeight, '412px', 'waking it up puts the row height back');
  assert.ok(!t.card.classList.contains('card-pending'), 'and it stops being a tile');
  assert.strictEqual(t.card.dataset.parkedMinHeight, undefined, 'with nothing left to restore a second time');
  assert.deepStrictEqual(anims.map(a => a.playState), ['running', 'running'],
    'waking the tool resumes the animations it parked with');
  assert.strictEqual(anims[0].plays, 1, 'and plays them once');
  assert.strictEqual(host.children.length, 0, 'the park must not leak holders');
  assert.strictEqual(harnessHost(), host, 'the second park reuses the one host (no pile of containers)');
  assert.strictEqual(seen.sweeps, 1, 'a resume re-measures once, for the content that came back');
  assert.deepStrictEqual(harnessScrolls(), [],
    'a row below the viewport needs no scroll correction: moving the page for a change nobody can see is the bug, not the fix');
  assert.ok(seen.liveCountUpdates > 0,
    'and the toolbar must be retold: a wake-up never passes through the render path that updates it');
  // An engine that cannot answer must not cost the park.
  const noWAM = parkHarness();
  noWAM.api.add('spinner', 9000, 400);
  const spinner = noWAM.tools.get('spinner');
  spinner.tool.anims = [{ get playState() { return 'running'; }, pause() { throw new Error('unsupported'); }, play() {} }];
  spinner.tool._animThrows = true;          // getAnimations itself blows up
  assert.strictEqual(noWAM.api.parkCard(spinner.card, 'spinner'), true,
    'a tool whose animation API throws must still park: the park is the point');
  assert.ok(noWAM.parkedCards.get('spinner').anims === null, 'and no half-taken pause list is kept');

  console.log('  ok   park → resume is one node move each way, state and DOM intact');
}

// ---------------------------------------------------------------- suite 9
// Who gets parked: the viewport decides, and intent vetoes it.
{
  const { api, tools, loadedCards, parkedCards, seen } = parkHarness();
  api.add('near', 300, 400);        // on screen
  api.add('justBelow', 1000, 400);  // below the fold, inside the buffer
  api.add('far', 9000, 400);        // several screens away
  api.add('hovered', 9000, 400);    // pointer inside
  tools.get('hovered').card._matches = true;
  api.parkOutsideWindow();
  assert.ok(!parkedCards.has('near'), 'a tool on screen must never be parked');
  assert.ok(!parkedCards.has('justBelow'), 'the buffer is what makes scrolling back free');
  assert.ok(parkedCards.has('far'), 'a tool screens away is what the park is for');
  assert.strictEqual(parkedCards.size, 1, 'only the far tool was parked, so the pass cannot overreach');
  assert.strictEqual(seen.liveCountUpdates, 1,
    'the pass that parked something retells the toolbar once — a pass that parked nothing stays quiet');

  // Scrolling is what moves the window, so the pass is gated on scroll distance
  // and not on frames: a second call at the same position must not measure again.
  const readBefore = tools.get('near').card.rectReads;
  api.parkOutsideWindow();
  api.parkOutsideWindow();
  assert.strictEqual(tools.get('near').card.rectReads, readBefore,
    'the park pass re-measured on a frame where nothing scrolled — that is the layout bill this page exists to avoid');
  // A real scroll re-arms it, and the tool the viewport left behind goes to the
  // park on that pass. Nothing is laid out here, so the scroll is simulated the
  // only honest way left: by moving the card's viewport-relative rect, which is
  // exactly what scrolling does to it in a browser.
  const below = tools.get('justBelow').card;
  const belowBefore = below.rectReads;
  harnessScroll(3000);
  below.rect = { top: -2000, bottom: -1600, left: 0, right: 948, width: 948, height: 400 };
  api.parkOutsideWindow();
  assert.ok(below.rectReads > belowBefore, 'a scrolled window must be re-measured');
  assert.ok(parkedCards.has('justBelow'), 'and what the window left behind parks itself');
  assert.ok(!parkedCards.has('near'), 'a tool the band still covers stays live');
  assert.ok(MARGIN_VH * 900 > 600 + PARK_STEP,
    'the dead band has to swallow the scroll gate too, or a card can be re-measured back into the window it just left');

  // Intent vetoes the geometry, however far away the card is: the caret wins.
  const typing = parkHarness();
  typing.api.add('typing', 9000, 400);
  typing.doc.activeElement = typing.tools.get('typing').tool;
  typing.api.parkOutsideWindow();
  assert.strictEqual(typing.parkedCards.size, 0, 'a tool with the caret in it is never parked');
  const pinned = parkHarness();
  pinned.api.add('pinned', 9000, 400);
  pinned.tools.get('pinned').card.dataset.keep = '1';
  pinned.api.parkOutsideWindow();
  assert.strictEqual(pinned.parkedCards.size, 0, 'data-keep is a card saying "stay mounted"');

  // A card the filter hides is laid out for nobody, so it must not hold a slot
  // in the window either.
  const filtered = parkHarness();
  filtered.api.add('hidden-far', 300, 400);
  filtered.tools.get('hidden-far').card.style.display = 'none';
  filtered.api.parkOutsideWindow();
  assert.ok(filtered.parkedCards.has('hidden-far'), 'a filtered-out live tool parks itself');

  // The two switches that mean "keep it all on the grid".
  const off = parkHarness({ parkMode: false });
  off.api.add('far', 9000, 400);
  off.api.parkOutsideWindow();
  assert.strictEqual(off.parkedCards.size, 0, '?park=off must stop the grid putting tools back');
  const runAll = parkHarness({ runAll: true });
  runAll.api.add('far', 9000, 400);
  runAll.api.parkOutsideWindow();
  assert.strictEqual(runAll.parkedCards.size, 0, '⚡ Run all asked for these tools on the grid; do not park them');
  console.log('  ok   the viewport parks, hover/focus refuse, and both opt-outs refuse');
}

// ---------------------------------------------------------------- suite 10
// Eviction is the destructive path, so it requires a memory signal — and then
// takes the oldest parked tool, not an arbitrary one.
{
  // Parked directly rather than through a sweep, so prunePark() is the only
  // thing deciding what survives: a sweep would have pruned in the middle.
  const six = (harness) => {
    const made = [];
    for (let i = 0; i < 6; i++) {
      made.push(harness.api.add('p' + i, 9000 + i * 10, 400));
      harness.api.parkCard(made[i].card, 'p' + i);
    }
    return made;
  };

  const calm = parkHarness({ ceiling: 4 });
  const calmCards = six(calm);
  assert.strictEqual(calm.parkedCards.size, 6, 'six tools parked while the heap is quiet');
  calm.api.prunePark();
  assert.strictEqual(calm.parkedCards.size, 6,
    'no memory signal means no eviction: a parked tool is cheaper than a lost one');
  assert.strictEqual(calm.api.memoryPressure(), false, 'no performance.memory means no pressure');
  assert.ok(calmCards.every(t => t.card.classList.contains('card-parked')),
    'nothing was taken away from any of them');

  const hot = parkHarness({ ceiling: 4, memory: { usedJSHeapSize: 400 * 1024 * 1024, jsHeapSizeLimit: 512 * 1024 * 1024 } });
  const made = six(hot);
  assert.strictEqual(hot.api.memoryPressure(), true, '400 MB of a 512 MB heap is pressure');
  hot.api.prunePark();
  assert.strictEqual(hot.parkedCards.size, Math.floor(4 * 0.7),
    'under pressure the park shrinks to 70% of its ceiling, oldest first');
  assert.ok(!hot.parkedCards.has('p0') && !hot.parkedCards.has('p1'), 'the longest-parked tools go first');
  assert.ok(hot.parkedCards.has('p5'), 'the most recently parked tool is kept');
  const evictedTool = made[0];
  const evicted = evictedTool.card;
  assert.strictEqual(hot.host.children.length, hot.parkedCards.size, 'an evicted holder is really removed');
  assert.ok(evicted.classList.contains('card-pending'), 'an evicted card goes back to being a tile');
  assert.ok(!evicted.classList.contains('card-parked'), 'and stops claiming the parked state');
  assert.strictEqual(evictedTool.content.style.minHeight, '',
    'its height goes with it: an empty tall row would haunt the layout forever');
  assert.strictEqual(evictedTool.hint.textContent, HINT_RUN, 'and its face tells the truth again');
  assert.strictEqual(hot.doc.body.children.length, 1, 'and the park host is all the document gained');
  console.log('  ok   parked tools are only dropped when the heap asks, oldest-first');
}

// ---------------------------------------------------------------- suite 11
// The invariants that are invisible in a node move and expensive to get wrong:
// the hysteresis, the stylesheet that must not hide the park, and the render
// path that must stop wiping the shell.
{
  // The dead band between the two passes is the one number they must agree on
  // without talking to each other: park further out than the observer looks in,
  // or a boundary row is parked and woken on alternate frames. This used to be a
  // hand-check on two literals; it is a clamp in the code now, so it is checked
  // by driving parkMargin() — including the viewport sizes that used to break it.
  const LOOKAHEAD = readNum('REMOUNT_LOOKAHEAD');
  const observerMargin = app.match(/rootMargin:\s*`\$\{CONFIG\.REMOUNT_LOOKAHEAD\}px 0px`/);
  assert(observerMargin, 'the observer must interpolate CONFIG.REMOUNT_LOOKAHEAD, not carry its own copy of the number');
  const band = parkHarness().api;
  assert.strictEqual(band.parkMargin(900), Math.round(MARGIN_VH * 900),
    `on a 900px window the margin is still ${MARGIN_VH} viewports (${band.parkMargin(900)}px)`);
  for (const vh of [700, 500, 400, 300]) {
    assert.ok(band.parkMargin(vh) > LOOKAHEAD,
      `a ${vh}px window must still leave a dead band (got ${band.parkMargin(vh)}px vs a ${LOOKAHEAD}px look-ahead)`);
  }
  assert.ok(band.parkMargin(300) === LOOKAHEAD + 100,
    'below the clamp the margin is the look-ahead plus a gutter, not a viewport fraction');

  const deferred = fs.readFileSync(path.join(ROOT, 'home-deferred.css'), 'utf8');
  assert.ok(css.includes('#mp-park'), 'the park container needs its styles before it can be used at all');
  assert.ok(!deferred.includes('#mp-park'),
    'the park must not live in the deferred sheet: late CSS would flash a pile of tools over the page');
  const parkRule = css.slice(css.indexOf('#mp-park {'), css.indexOf('}', css.indexOf('#mp-park {')));
  assert.ok(/visibility:\s*hidden/.test(parkRule), 'the park is hidden by visibility, which keeps layout');
  assert.ok(!/display:\s*none/.test(parkRule),
    'display:none on the park zeroes every clientWidth inside it — a canvas tool would resize to 0 and stay broken');
  assert.ok(/position:\s*fixed/.test(parkRule) && /-100000px|-\d{4,}px/.test(parkRule),
    'the park has to be out of the flow and off the visible page');

  const render = grab('renderCardContent');
  assert.ok(!/cardSandbox\.innerHTML\s*=/.test(render),
    'renderCardContent must keep the face: wiping it is what makes a parked tile unable to go back to being a tile');
  assert.ok(/hidden = true/.test(render), 'a live tool hides its face rather than losing it');

  const loadCardSrc = grab('loadCard');
  assert.ok(loadCardSrc.indexOf('resumeParked') < loadCardSrc.indexOf('loadQueue.push'),
    'loadCard must consult the park before it queues a fetch');
  assert.ok(!/fetchCard|executeLoadCard/.test(loadCardSrc.slice(loadCardSrc.indexOf('resumeParked'), loadCardSrc.indexOf('loadQueue.push'))),
    'a parked tool must not touch the fetch path on its way back');

  // Warm + cache must treat a parked tool as already owned by the page.
  assert.ok(app.includes('if (parkedCards.has(cardName)) return false;'),
    'warming a parked tool would re-download bytes that are already in the DOM');
  assert.ok(/loadingCards\.has\(key\) \|\| parkedCards\.has\(key\)/.test(app),
    'the in-memory cache must not drop a parked tool it still needs to restore');
  console.log('  ok   dead band, park CSS, face-preserving render, park-before-fetch');
}


// ---------------------------------------------------------------- suite 12
// The warm cursor follows the reader in *both* directions. Warming one way was
// correct while a catalogue was only ever read downwards; the park made scrolling
// back up the common case, and a tool woken from the park should find its bytes
// cached rather than re-fetched (a tool evicted under memory pressure should cost
// a re-render, not a download). So the cursor turns around with the visitor.
{
  const NAMES = Array.from({ length: 40 }, (_, i) => `c${i}`);
  const WARM_C = parseInt((app.match(/WARM_CONCURRENCY:\s*(\d+)/) || [])[1], 10);
  const LOOKBEHIND = parseInt((app.match(/WARM_LOOKBEHIND:\s*(\d+)/) || [])[1], 10);
  assert(WARM_C >= 2, 'could not read WARM_CONCURRENCY from home-app.js');
  assert(Number.isFinite(LOOKBEHIND) && LOOKBEHIND >= 2,
    'could not read WARM_LOOKBEHIND from home-app.js — the reverse pass needs to know how far above the fold to start');

  function warmWorld(opts) {
    const o = Object.assign({ cursor: 20, dir: 1, scrollY: 0, lastScrollY: -1, eligible: null }, opts || {});
    const requested = [];
    const ctx = {
      allCards: NAMES,
      cardIndexByName: new Map(NAMES.map((n, i) => [n, i])),
      cardsMetaMap: new Map(),
      CONFIG: { WARM_CONCURRENCY: WARM_C, WARM_TIMEOUT: 12000, WARM_LOOKBEHIND: LOOKBEHIND },
      MAX_CONCURRENT_LOADS: 6,
      activeLoads: 0,
      document: { hidden: false },
      window: { scrollY: o.scrollY },
      navigator: {},
      // Everything the real warmEligible would refuse is refused here by the
      // caller's predicate; the walk itself is what this suite is about.
      warmEligible: o.eligible ? () => o.eligible() : () => true,
      rememberWarmed: () => {},
      pumpWarmSoon: () => {},
      fetchTextWithTimeout: (url) => {
        requested.push(String(url).replace(/^cards\//, '').replace(/\.html$/, ''));
        // Never settles, so warmActive stays raised and one pass is bounded by
        // WARM_CONCURRENCY exactly as it is in the browser.
        return new Promise(() => {});
      },
      setTimeout: () => 0,
      console: { warn() {}, log() {}, error() {} },
    };
    const api = run([
      'let warmStarted = true;',
      'let warmActive = 0;',
      `let warmCursor = ${o.cursor};`,
      'let warmSweeping = false;',
      'let warmPending = false;',
      `let warmDir = ${o.dir};`,
      `let lastWarmScrollY = ${o.lastScrollY};`,
      grab('warmCard'), grab('pumpWarm'), grab('noteReadingPosition'),
      ';({ pumpWarm, noteReadingPosition,',
      '  state: () => ({ warmCursor, warmDir, warmStarted, warmActive }),',
      '  set: (k, v) => {',
      '    if (k === "cursor") warmCursor = v;',
      '    if (k === "active") warmActive = v;',
      '    if (k === "started") warmStarted = v;',
      '  },',
      '  scroll: (y) => { window.scrollY = y; } });',
    ].join('\n'), ctx, 'warm-cursor');
    return { api, requested };
  }

  // A note is only compared against a previous note, so these worlds start with
  // one scroll position recorded (the first one on a real page only records).
  // a) a forward pass walks WARM_CONCURRENCY names and leaves the cursor behind them
  const fwd = warmWorld({ scrollY: 0, lastScrollY: 0 });
  fwd.api.pumpWarm();
  assert.deepStrictEqual(fwd.requested, ['c20', 'c21', 'c22'],
    'a warm pass must take exactly WARM_CONCURRENCY names from the cursor');
  assert.strictEqual(fwd.api.state().warmCursor, 20 + WARM_C, 'and stop there, not at the end of the catalogue');
  assert.strictEqual(fwd.api.state().warmDir, 1, 'a page that has not turned around walks forwards');

  // b) a note from the sweep while still going the same way must not move it
  fwd.api.scroll(9000);
  fwd.api.noteReadingPosition([{ cardName: 'c30' }]);
  assert.strictEqual(fwd.api.state().warmCursor, 20 + WARM_C,
    'the cursor was already ahead of the reader in the same direction — do not drag it back');
  // …and no movement at all is not a direction.
  const still = warmWorld({ scrollY: 5000, lastScrollY: 5000 });
  still.api.noteReadingPosition([{ cardName: 'c10' }]);
  assert.strictEqual(still.api.state().warmCursor, 20, 'a frame without scroll must not re-anchor the cursor');

  // c) turning around re-anchors just above the top of the screen and warms up
  const back = warmWorld({ scrollY: 4000, lastScrollY: 4000 });
  back.api.scroll(0);                          // …and now the reader is going up
  back.api.noteReadingPosition([{ cardName: 'c12' }]);
  const st = back.api.state();
  assert.strictEqual(st.warmDir, -1, 'the walk reverses with the reader');
  assert.strictEqual(st.warmCursor, 12 - LOOKBEHIND,
    'and restarts a look-behind above the front card, so what comes next is already warm');
  back.api.set('active', 0);                   // pretend the in-flight warm fetches landed
  back.api.pumpWarm();
  assert.deepStrictEqual(back.requested, ['c6', 'c5', 'c4'],
    'a reversed pass warms upwards through the catalogue, starting at the anchor');

  // d) running off an end turns around, and two empty passes stop the walk for good
  const top = warmWorld({ cursor: 1, dir: -1, scrollY: 0, lastScrollY: 0, eligible: () => false });
  top.api.pumpWarm();
  const endState = top.api.state();
  assert.strictEqual(endState.warmDir, 1, 'reaching the top turns the walk around');
  assert.strictEqual(endState.warmCursor, 0, 'and restarts it at the end it just turned towards');
  assert.strictEqual(endState.warmStarted, false,
    'a pass that queued nothing at an end stops walking 1,194 names forever — in either direction');

  // e) the wiring that makes any of this true: the sweep tells the warm path where
  //    the reader is, and the catalogue index it needs is built once, not searched.
  assert.ok(/noteReadingPosition\(visible\.length \? visible : lookAhead\)/.test(app),
    'the viewport sweep must hand the reader position to the warm path');
  assert.ok(/cardIndexByName\.set\(allCards\[i\], i\)/.test(app),
    'the name→index map is built with the grid; 1,194 indexOf() calls per scroll is not how to translate');
  const reset = app.match(/function resetWarmWindow\(\)[\s\S]*?\n    \}/);
  assert(reset && /warmDir = 1;/.test(reset[0]),
    'a filter, sort or density change must reset the direction too, not just the cursor');
  console.log('  ok   warm-ahead follows the scroll in both directions and still stops when done');
}

// ---------------------------------------------------------------- suite 13
// The collapse and the correction. A parked row stops reserving the space it no
// longer needs — that is what keeps the *whole* page dense, not just the part
// below the fold — and the height it hands back above the viewport is paid for
// in the same frame, or the page jumps.
{
  const { api, tools, win, scrolls } = parkHarness({ innerHeight: 900 });
  win.scrollY = 5000;
  const high = api.add('high', -2600, 900, 172);   // 1,700px above the fold: parkable
  const low = api.add('low', 5000, 400, 172);      // far below: parkable, harmless
  api.parkOutsideWindow();

  assert.ok(high.card.classList.contains('card-parked') && low.card.classList.contains('card-parked'),
    'both rows are outside the window and go to the park');
  assert.deepStrictEqual(scrolls, [5000 - (900 - 172)],
    'the row above the viewport takes 728px of document with it, so the offset moves back by exactly that');
  assert.strictEqual(win.scrollY, 4272, 'and the fake window actually moved: the reader sees the same pixels');
  assert.strictEqual(api.lastParkScrollY, 4272,
    'the pass re-anchors its own gate, or the correction reads as another 728px of scrolling');
  assert.strictEqual(api.lastWarmScrollY, 4272,
    'and so does the warm cursor — a compensating scroll is not the reader turning around');

  const before = scrolls.length;
  api.parkOutsideWindow();
  assert.strictEqual(scrolls.length, before, 'the same pass run again corrects nothing');

  // Waking it is the same arithmetic backwards, and the round trip has to land
  // where it started — otherwise a reader who scrolls up and down drifts.
  api.resumeParked(high.card, 'high');
  assert.deepStrictEqual(scrolls.slice(before), [5000],
    'the row above the fold takes its height back and the offset is corrected the other way');
  assert.strictEqual(win.scrollY, 5000, 'exactly where the reader was, at the end of a park/wake round trip');

  // A row the fold cuts in half is being looked at: moving the page under it is
  // the jump, not the cure. A filter-hidden card is parked wherever it happens to
  // be, so this is the case that proves the guard.
  const cut = parkHarness({ innerHeight: 900 });
  cut.win.scrollY = 900;
  const straddling = cut.api.add('straddle', -80, 400, 172);
  straddling.card.style.display = 'none';
  cut.api.parkOutsideWindow();
  assert.ok(straddling.card.classList.contains('card-parked'),
    'a row hidden by a filter is parked even though it overlaps the viewport');
  assert.deepStrictEqual(cut.scrolls, [], 'and the page is not moved for it: its top edge is on screen');
  console.log('  ok   a parked row collapses to a tile, and the scroll offset is paid for above the fold');
}

// ---------------------------------------------------------------- suite 14
// `?park=full` is the opt-out, so the collapse has to be switchable without
// switching the park off — and the switch must be read before the first park,
// because a pass that half-collapses is worse than either setting.
{
  const full = parkHarness({ innerHeight: 900, collapse: false });
  full.win.scrollY = 5000;
  const t = full.api.add('tall', -2600, 900, 172);
  full.api.parkOutsideWindow();
  assert.ok(t.card.classList.contains('card-parked'), 'parking itself still happens');
  assert.ok(!t.card.classList.contains('card-pending'), 'but the row keeps its slot: no tile, no collapse');
  assert.strictEqual(t.content.style.minHeight, '900px', 'the pinned height stays on the box');
  assert.strictEqual(t.card.dataset.parkedMinHeight, undefined, 'and there is nothing to restore later');
  assert.deepStrictEqual(full.scrolls, [], 'nothing to compensate for, so nothing moved');
  assert.strictEqual(full.api.collapse, false, 'the harness is testing the flag, not the default');

  const dflt = parkHarness({ innerHeight: 900 });
  assert.strictEqual(dflt.api.collapse, true, 'the collapse is the default, not an experiment');
  assert.ok(/PARK_COLLAPSE: true/.test(app), 'and it is stated in CONFIG, where the other knobs live');
  console.log('  ok   ?park=full keeps the row claimed; the collapse is the default');
}

// ---------------------------------------------------------------- suite 15
// The wake half of the pass. A parked tool inside the window has to come back no
// matter how busy the mount budget is: the budget is about fetches, and a wake is
// a node move.
{
  const { api, win, loadedCards, parkedCards } = parkHarness({ innerHeight: 900 });
  const near = api.add('near', 120, 400, 172);
  api.parkCard(near.card, 'near');
  assert.ok(parkedCards.has('near') && !loadedCards.has('near'), 'parked by the window, in a tile');
  api.parkOutsideWindow();
  assert.ok(loadedCards.has('near') && !parkedCards.has('near'),
    'the next pass has to put it back: the reader is looking at it');
  assert.ok(!near.card.classList.contains('card-parked'), 'and it must not still claim to be parked');

  // A parked card whose shell left the DOM (a rebuild, an extension that rewrote
  // the grid) must not strand its content in the park forever.
  const ghost = api.add('ghost', 5000, 400, 172);
  api.parkCard(ghost.card, 'ghost');
  assert.ok(parkedCards.has('ghost'), 'parked first, of course');
  const hostNow = harnessHost();
  assert.ok(hostNow.children.length >= 1, 'with something in the park to lose');
  ghost.card.isConnected = false;
  win.scrollY = 2400;   // the pass is gated on a scroll step, so move the page
  api.parkOutsideWindow();
  assert.ok(!parkedCards.has('ghost'), 'a detached parked shell is dropped from the park');
  assert.strictEqual(hostNow.children.filter(c => c.dataset.name === 'ghost').length, 0,
    'and its holder is removed, not left holding a whole tool nobody can reach');

  // The other wake path: the observer. It is the one that has to react inside a
  // frame, and it must not ask the budget first.
  const io = app.slice(app.indexOf('new IntersectionObserver'), app.indexOf('rootMargin'));
  assert(io.length > 0, 'could not find the IntersectionObserver callback to read it');
  assert.ok(io.indexOf("dataset.parked === '1'") !== -1 && io.indexOf("dataset.parked === '1'") < io.indexOf('mountBudgetFree'),
    'the observer must wake a parked tool before it consults the mount budget');
  console.log('  ok   what the viewport wants comes back, budget or no budget');
}

// ---------------------------------------------------------------- suite 16
// The governor for browsers with no long-animation-frame entries. Safari and
// Firefox cannot say they dropped a frame, so the page asks for one and times
// the answer — and that has to be able to shrink the window as well as grow it.
{
  const seen = { sweeps: 0 };
  const raf = [];
  const clock = { t: 0 };
  const api = run([
    'let mountWindow = ' + readNum('MOUNT_WINDOW_DEFAULT') + ';',
    'let lastLongFrame = 0;',
    `let lastShrink = ${INITIAL_SHRINK};`,
    'let lastParkScrollY = 0;',
    'let parkStep = 0;',
    'let governorHasLoAF = false;',
    'let frameProbed = false;',
    grab('noteLongFrame'), grab('probeFrames'), grab('growWindowBack'), grab('invalidateParkPass'),
    ';({ probeFrames, growWindowBack, noteLongFrame,',
    '  get mountWindow() { return mountWindow; },',
    '  get loafs() { return governorHasLoAF; }, set loafs(v) { governorHasLoAF = v; },',
    '  get probed() { return frameProbed; } });',
  ].join('\n'), {
    performance: { now: () => clock.t },
    requestAnimationFrame: (cb) => { raf.push(cb); return raf.length; },
    CONFIG: {
      LONG_FRAME_MS: readNum('LONG_FRAME_MS'), MOUNT_WINDOW_MIN: readNum('MOUNT_WINDOW_MIN'),
      MOUNT_WINDOW_MAX: readNum('MOUNT_WINDOW_MAX'),
    },
    scheduleViewportSweep: () => { seen.sweeps++; },
  }, 'governor-harness');

  const flush = (ms) => { clock.t += ms; const cbs = raf.splice(0, raf.length); cbs.forEach(cb => cb()); };

  api.probeFrames();
  assert.strictEqual(raf.length, 1, 'one frame asked for per pass — that is the whole cost of the fallback');
  assert.strictEqual(api.probed, true, 'and the probe is in flight, so two passes cannot stack them');
  flush(5);
  assert.strictEqual(api.mountWindow, readNum('MOUNT_WINDOW_DEFAULT'), 'a 5ms frame is not pressure');
  assert.strictEqual(api.probed, false, 'the probe reports and clears itself');

  api.probeFrames();
  flush(250);
  assert.strictEqual(api.mountWindow, readNum('MOUNT_WINDOW_DEFAULT') - 4,
    'a 250ms gap is a dropped frame on a page that is mounting tools: the window narrows');
  assert.strictEqual(seen.sweeps, 1, 'and the sweep is re-run so the narrowing takes effect');
  api.probeFrames();
  flush(300);
  assert.strictEqual(api.mountWindow, readNum('MOUNT_WINDOW_DEFAULT') - 4,
    'two shrinks in the same 5s window are one shrink — the governor must not chase a stutter');

  clock.t += 1000;
  api.growWindowBack();
  assert.strictEqual(api.mountWindow, readNum('MOUNT_WINDOW_DEFAULT') - 4,
    'it does not grow back on the next pass either: the quiet period is measured from the last long frame');
  clock.t += 20000;
  api.growWindowBack();
  assert.strictEqual(api.mountWindow, readNum('MOUNT_WINDOW_DEFAULT') - 2,
    'and two tools at a time once it has been quiet for 20s');

  api.loafs = true;
  const queued = raf.length;
  api.probeFrames();
  assert.strictEqual(raf.length, queued, 'a browser that reports long frames is not timed by hand as well');
  assert.ok(/if \(!governorHasLoAF\) probeFrames\(\);/.test(app),
    'the park pass is what asks for the probe — no timer, no polling');
  console.log('  ok   no LoAF is not no governor: one frame per pass, shrinking allowed');
}

// ---------------------------------------------------------------- suite 17
// The one thing a node harness cannot argue about: a scroll correction issued
// while a finger is still flinging the page. The answer is not to be clever
// about it, it is to not do it — so the guard has to be provable from here.
{
  const hot = parkHarness({ innerHeight: 900, touch: true });
  hot.win.scrollY = 5000;
  const t = hot.api.add('midfling', -2600, 900, 172);
  hot.api.parkOutsideWindow();
  assert.ok(t.card.classList.contains('card-parked'),
    'a fling does not stop the park: the tool still leaves the grid and the page still stops painting it');
  assert.ok(!t.card.classList.contains('card-pending'),
    'but the row is not reflowed while the finger is down, because the correction it needs cannot be applied');
  assert.strictEqual(t.content.style.minHeight, '900px', 'so nothing is taken off the box to be restored later');
  assert.deepStrictEqual(hot.scrolls, [], 'and the page was not moved under the gesture');

  const idle = parkHarness({ innerHeight: 900 });
  idle.win.scrollY = 5000;
  const after = idle.api.add('settled', -2600, 900, 172);
  idle.api.parkOutsideWindow();
  assert.ok(after.card.classList.contains('card-pending'),
    'one frame after the finger lifts the next pass collapses it: the guard defers, it does not decline');
  assert.deepStrictEqual(idle.scrolls, [4272], 'and by then the correction is safe to make');

  const guard = grab('initTouchGuard');
  assert.ok(/touchstart/.test(guard) && /touchend/.test(guard) && /touchcancel/.test(guard),
    'the guard needs all three: a cancelled touch that never fires touchend would strand the flag');
  assert.strictEqual((guard.match(/passive: true/g) || []).length, 3,
    'every one of them passive — a blocking touchstart listener on a 1,194-card page is its own scroll jank');
  assert.ok(/return collapsePark && canHoldScroll\(\);/.test(app),
    'the collapse asks the scroll-owner question too, so a correction can never be skipped while a collapse happens');
  assert.ok(/function canHoldScroll\(\) \{\s*return !touchActive;/.test(app),
    'and that question is asked in exactly one place');
  console.log('  ok   no reflow under a live finger: the collapse waits for the fling to end');
}

// ---------------------------------------------------------------- suite 18
// A row that grows above the fold is the same hazard as one that shrinks, and
// the page must be the only thing paying for either. `overflow-anchor` off plus
// a correction at each of the mount's two growth points: that is the whole
// contract, and both halves are checkable from here even though the interaction
// between them is a browser's.
{
  const { api, win, scrolls } = parkHarness({ innerHeight: 900, collapse: false });
  win.scrollY = 4000;
  const t = api.add('mounting', -600, 412, 172);
  t.card.classList.remove('loaded');
  t.card.classList.add('card-pending');          // the tile a mount starts from
  const snap = api.aboveTheFold(t.card);
  assert.strictEqual(snap, 172, 'the snapshot is the height the reader has been shown');
  t.card.classList.remove('card-pending');
  t.card.classList.add('loaded');                // the mount's class flip: 172 -> 412
  api.noteRowHeight(t.card, snap);
  assert.deepStrictEqual(scrolls, [4000 + 240],
    'a row that grew above the fold pushes the reader down, so the offset is moved down to meet it');
  assert.strictEqual(win.scrollY, 4240, 'and the pixels the reader was looking at are unchanged');

  const idle = parkHarness({ innerHeight: 900, collapse: false, touch: true });
  idle.win.scrollY = 4000;
  const during = idle.api.add('flinging', -600, 412, 172);
  during.card.classList.remove('loaded');
  during.card.classList.add('card-pending');
  const held = idle.api.aboveTheFold(during.card);
  assert.strictEqual(held, null, 'under a live finger the page takes no measurement to correct with');
  during.card.classList.remove('card-pending');
  during.card.classList.add('loaded');
  idle.api.noteRowHeight(during.card, held);
  assert.deepStrictEqual(idle.scrolls, [], 'so a mount mid-fling does not move the page');

  // The mount path itself, in the shipped file: both growth points, and only them.
  const render = grab('renderCardContent');
  assert.strictEqual((render.match(/aboveTheFold\(card\)/g) || []).length, 2,
    'the mount has two moments that change a row above the fold — the class flip, and the height measurement 100ms later — and each needs its own snapshot');
  assert.strictEqual((render.match(/noteRowHeight\(card, (growBefore|expandBefore)\)/g) || []).length, 2,
    'and each is paired with the mutation it compensates for, not with a single correction at the end');
  // Every resize listener, because the file has more than one and the one that
  // walks 1,194 cards is not the first of them.
  const resizeSites = [...app.matchAll(/addEventListener\('resize'/g)].map(m => app.slice(m.index, m.index + 1200));
  assert(resizeSites.length >= 1, 'could not read the resize handlers from home-app.js');
  assert(resizeSites.some(b => b.includes('adjustCardHeight(card)')),
    'one of them must be the handler that re-measures every card (that is the block this pin is about)');
  for (const block of resizeSites) {
    assert(!block.includes('noteRowHeight'),
      'a resize handler must not compensate: every row changes at once, so no single delta belongs to the page');
  }
  assert(!grab('initReaderMode').includes('noteRowHeight'),
    'nor the reader-mode toggle, for the same reason');

  // One compensator: Blink would otherwise do the arithmetic too.
  assert(/html\s*{\s*overflow-anchor:\s*none;?\s*}/.test(css),
    'the root scroller must opt the document out of scroll anchoring while the page is correcting for itself');
  const anchorBlock = css.slice(Math.max(0, css.indexOf('overflow-anchor') - 900), css.indexOf('overflow-anchor'));
  assert(/ONE COMPENSATOR/i.test(anchorBlock),
    'and the reason has to be in the stylesheet next to the rule — `overflow-anchor: none` looks like a stray line and invites removal');
  console.log('  ok   mounts above the fold pay the same correction, and the UA is out of the business');
}

console.log('\nlive-window tests passed');
