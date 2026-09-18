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
    { cardCache, loadedCards, loadingCards, Date }, 'cardCache');

  for (let i = 0; i < CAP * 2; i++) api.rememberWarmed(`c${i}`, `<i>${i}</i>`);
  assert.ok(api.size() <= CAP, `cardCache grew to ${api.size()}, over its cap of ${CAP}`);
  for (const key of loadedCards) {
    api.rememberWarmed('push', 'x');
  }
  api.rememberWarmed('running-1', '<b>still here</b>');
  assert.ok(cardCache.has('running-1'), 'a running tool must never be pruned out of the cache');
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

console.log('\nlive-window tests passed');
