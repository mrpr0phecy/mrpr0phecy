// Tests the card-face system: an unloaded card shows a finished, readable
// face (icon, description, run hint) instead of a skeleton or a loading
// waveform — the whole grid reads as complete the moment it is built, and
// no card ever displays a "Loading…" state again.
//
// Drives the REAL createPlaceholder()/titleEmoji()/refreshCardFaceDescriptions()
// out of home-app.js in a minimal DOM stub, and reads the shipped index.html
// for the generated first-screen faces. Run with:
//
//   node scripts/tests/card-faces.test.js
//
// Zero dependencies (node only). No browser required.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'home-app.js');
const INDEX = path.join(ROOT, 'index.html');
const app = fs.readFileSync(APP, 'utf8');
const html = fs.readFileSync(INDEX, 'utf8');

// ---------------------------------------------------------------- suite 1
// Static invariants on the shipped source: the loading UI is really gone.
{
  assert.ok(!app.includes('showActiveLoader'),
    'showActiveLoader is back — cards must not show a loading waveform');
  assert.ok(!app.includes('card-skeleton'),
    'card-skeleton markup/CSS references are back in home-app.js');
  assert.ok(!/className = 'cool-loader'/.test(app),
    'home-app.js is injecting a cool-loader again (reserved for the modal only)');
  assert.ok(!/textContent = 'Loading '/.test(app),
    'a card-level Loading text is back');
  assert.ok(app.includes('card-face'),
    'createPlaceholder no longer builds card faces');
  console.log('  ok   no skeleton or loading-waveform code left in the loader');
}

// ---------------------------------------------------------------- suite 2
// The generated index ships first-screen faces (with descriptions), not
// skeletons — exactly MARKUP shells (twelve), not the whole catalogue.
// The grid still displays every tool: buildPlaceholders() builds the rest
// from cards-lite.json at runtime. Pre-rendering all ~1194 here made
// index.html 2.1 MB and queued every tool on first paint.
{
  const prerender = html.match(/HOME-PRERENDER:BEGIN([\s\S]*?)HOME-PRERENDER:END/);
  assert(prerender, 'HOME-PRERENDER block missing from index.html');
  const block = prerender[1];
  // Read the count from the generator itself so the two cannot drift.
  const GEN = path.join(ROOT, 'scripts', 'build-home-prerender.py');
  const genSrc = fs.readFileSync(GEN, 'utf8');
  const markupM = genSrc.match(/^MARKUP\s*=\s*(\d+)/m);
  assert(markupM, 'could not read MARKUP from scripts/build-home-prerender.py');
  const expected = parseInt(markupM[1], 10);
  const faces = (block.match(/class="card-face"/g) || []).length;
  assert.strictEqual(faces, expected, `expected ${expected} generated faces (first screen), found ${faces}`);
  assert.ok(!block.includes('card-skeleton'),
    'generated shells still contain a skeleton');
  const descs = (block.match(/class="card-face-desc"/g) || []).length;
  assert.strictEqual(descs, expected, 'every generated face must carry a description');
  assert.ok(!/card-face-desc>\s*</.test(block),
    'a generated face has an empty description — the generator must embed it');
  // Faces are keyboard-reachable and labelled.
  assert.ok(block.includes('role="button"') && block.includes('tabindex="0"'),
    'generated faces must be focusable buttons');
  // The shells must be the first cards in catalogue order (what the loader
  // would build first), so the head bootstrap's prefetches land in them.
  const CARDS_JSON = path.join(ROOT, 'cards', 'cards.json');
  const names = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf8')).map(c => c.name).sort();
  const rendered = [...block.matchAll(/<div class="card card-pending" data-name="([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(rendered, names.slice(0, expected),
    'pre-rendered shells are not the first cards in catalogue order');
  console.log(`  ok   ${expected} first-screen faces with descriptions, in catalogue order, no skeleton`);
}

// ---------------------------------------------------------------- suite 3
// Drive the real createPlaceholder(): face structure, description fallback
// and the lite-tier placeholder marker.
function grab(name) {
  const m = app.match(new RegExp(`(async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n`));
  assert(m, `could not extract ${name}() from home-app.js`);
  return m[0];
}

// Tiny DOM stub: just enough of the real API for the three functions.
function el(tag) {
  return {
    tagName: String(tag || 'div').toUpperCase(),
    children: [],
    className: '',
    dataset: {},
    attributes: {},
    style: {},
    _text: '',
    set textContent(v) { this._text = String(v); delete this.dataset.placeholder; },
    get textContent() { return this._text; },
    set innerHTML(v) { this._html = v; this.children.length = 0; },
    get innerHTML() { return this._html || ''; },
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    append(...cs) { cs.forEach(c => this.appendChild(c)); },
    setAttribute(k, v) { this.attributes[k] = v; },
    setAttributeNamed() {},
    closest() { return null; },
  };
}

{
  const cardsMetaMap = new Map([
    ['with-desc', { name: 'with-desc', title: '🌀 With Description', category: 'Testing', description: 'A real description from cards.json.' }],
    ['lite-only', { name: 'lite-only', title: '🔊 Lite Tier Only', category: 'Testing' }],
  ]);
  const document = {
    createElement: (tag) => el(tag),
    querySelectorAll: () => [],
  };
  const sandbox = { cardsMetaMap, document, console, cardElsByName: new Map() };
  vm.createContext(sandbox);
  vm.runInContext(grab('titleEmoji') + '\n' + grab('createPlaceholder'), sandbox,
    { filename: 'home-app.js(extracted)' });

  const withDesc = vm.runInContext('createPlaceholder("with-desc", 0)', sandbox);
  assert.strictEqual(withDesc.className, 'card card-pending');
  assert.strictEqual(withDesc.dataset.name, 'with-desc');
  const sandboxEl = withDesc.children.find(c => c.className === 'card-content')
    .children.find(c => c.className === 'card-sandbox');
  const face = sandboxEl.children[0];
  assert.strictEqual(face.className, 'card-face', 'placeholder body must be a card-face');
  assert.strictEqual(face.attributes['role'], 'button', 'face must be a button for a11y');
  const icon = face.children.find(c => c.className === 'card-face-icon');
  assert.strictEqual(icon.textContent, '🌀', 'the title emoji must become the face icon');
  const desc = face.children.find(c => c.className === 'card-face-desc');
  assert.strictEqual(desc.textContent, 'A real description from cards.json.',
    'the face must show the catalogue description');

  const liteCard = vm.runInContext('createPlaceholder("lite-only", 1)', sandbox);
  const liteFace = liteCard.children.find(c => c.className === 'card-content')
    .children.find(c => c.className === 'card-sandbox').children[0];
  const liteDesc = liteFace.children.find(c => c.className === 'card-face-desc');
  assert.strictEqual(liteDesc.dataset.placeholder, '1',
    'a lite-tier face must mark its stand-in description for the refresh pass');
  assert.ok(liteDesc.textContent.length > 10, 'stand-in description must still read like copy');
  console.log('  ok   createPlaceholder builds faces: icon, description, placeholder marker');

  // titleEmoji edge cases: no emoji, multi-codepoint ZWJ sequences, plain ASCII.
  const t = vm.runInContext('titleEmoji', sandbox);
  assert.strictEqual(t('⏱️ Anime Binge Calculator'), '⏱️');
  assert.strictEqual(t('no emoji here'), '🧰');
  assert.strictEqual(t(undefined), '🧰');
  console.log('  ok   titleEmoji handles ZWJ sequences and emoji-less titles');
}

// ---------------------------------------------------------------- suite 4
// refreshCardFaceDescriptions() upgrades lite-tier faces in place and skips
// everything else (no placeholder marker, or card already loaded).
{
  // faces: one placeholder-marked pending face, one filled pending face,
  // one marked face on a loaded card (must be skipped — face is gone anyway).
  function faceCard(name, marked, loaded) {
    const desc = el('p');
    desc.className = 'card-face-desc';
    if (marked) desc.dataset.placeholder = '1';
    const face = el('div');
    face.className = 'card-face';
    face.appendChild(desc);
    const sandbox = el('div');
    sandbox.className = 'card-sandbox';
    sandbox.appendChild(face);
    const card = el('div');
    card.className = loaded ? 'card loaded' : 'card card-pending';
    card.dataset.name = name;
    card.appendChild(sandbox);
    card.querySelector = (sel) => {
      if (sel === '.card-face-desc[data-placeholder]') return marked ? desc : null;
      if (sel === '.card-face-desc') return desc;
      return null;
    };
    // the real function walks desc.closest('.card')
    desc.closest = (sel) => (sel === '.card' ? card : null);
    return { card, desc, face };
  }
  const a = faceCard('a', true, false);
  const b = faceCard('b', false, false);

  const cardsMetaMap = new Map([
    ['a', { name: 'a', description: 'Fresh description for A.' }],
    ['b', { name: 'b', description: 'Fresh description for B.' }],
  ]);
  const pending = [a.card, b.card];
  const sandbox = {
    cardsMetaMap,
    document: {
      querySelectorAll: (sel) => {
        assert.strictEqual(sel, '.card.card-pending .card-face-desc[data-placeholder]');
        return [a.desc];
      },
    },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(grab('refreshCardFaceDescriptions'), sandbox);
  vm.runInContext('refreshCardFaceDescriptions();', sandbox);
  assert.strictEqual(a.desc.textContent, 'Fresh description for A.',
    'marked lite-tier face was not upgraded');
  assert.ok(!a.desc.dataset.placeholder, 'placeholder marker must clear after upgrade');
  assert.notStrictEqual(b.desc.textContent, 'Fresh description for B.',
    'non-placeholder face must be left alone');
  console.log('  ok   refreshCardFaceDescriptions upgrades only stand-in faces');
}

// ---------------------------------------------------------------- suite 5
// loadAllToolsNow(): queues every visible, unfinished card at once; skips
// hidden, errored and in-flight cards; announces the run.
{
  function simpleCard(name, state) {
    const card = el('div');
    card.dataset.name = name;
    card.className = 'card';
    if (state === 'loaded') card.className = 'card loaded';
    return card;
  }
  const all = [
    simpleCard('fresh-1', 'pending'),
    simpleCard('fresh-2', 'pending'),
    simpleCard('hidden', 'pending'),
    simpleCard('errored', 'pending'),
    simpleCard('inflight', 'pending'),
    simpleCard('done', 'loaded'),
  ];
  all[2].style.display = 'none';       // filtered out
  all[3].dataset.errorReason = 'load'; // resting for manual Retry
  const queued = [];
  const sandbox = {
    document: { querySelectorAll: (sel) => {
      assert.strictEqual(sel, '.card[data-name]:not(.loaded)');
      return all.filter(c => !c.className.includes('loaded'));
    } },
    loadedCards: new Set(['done']),
    loadingCards: new Set(['inflight']),
    isCardHidden: (c) => c.style.display === 'none',
    loadCard: (card, name) => queued.push(name),
    showNotification: (msg) => { sandbox.note = msg; },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(grab('loadAllToolsNow'), sandbox);
  vm.runInContext('loadAllToolsNow();', sandbox);
  assert.deepStrictEqual(queued, ['fresh-1', 'fresh-2'],
    `load-all must queue only runnable cards, queued: ${queued.join(',')}`);
  assert.ok(/Running all 2 tools/.test(sandbox.note), 'the run must be announced');
  console.log('  ok   loadAllToolsNow queues runnable cards, skips hidden/errored/in-flight');
}

// ---------------------------------------------------------------- suite 6
// Warm-ahead (startCacheWarm / pumpWarm / warmCard / warmEligible): the grid
// downloads the catalogue one step ahead of the reader WITHOUT mounting
// anything. This is the half of the fix for "only a handful of my tools ever
// load": the old trickle mounted 6 cards per 2.5s, so 1,194 tools were an hour
// of work and the page read as a nine-tool site. Bytes are cheap; *running* a
// tool is what has to stay tied to the viewport, so the background pass only
// fetches into cardCache and the mount path reads from it.
{
  // Read the shipped numbers from the real source instead of assuming them, the
  // way the trickle test read TRICKLE_BATCH — a silent change in the loader must
  // not be hidden by a stale constant here.
  const CONC_M = app.match(/WARM_CONCURRENCY:\s*(\d+)/);
  assert(CONC_M, 'could not read WARM_CONCURRENCY from home-app.js');
  const WARM_CONCURRENCY = parseInt(CONC_M[1], 10);
  const LOADS_M = app.match(/const MAX_CONCURRENT_LOADS = (\d+);/);
  assert(LOADS_M, 'could not read MAX_CONCURRENT_LOADS from home-app.js');
  const MAX_CONCURRENT_LOADS = parseInt(LOADS_M[1], 10);
  assert.ok(WARM_CONCURRENCY < MAX_CONCURRENT_LOADS,
    `warming (${WARM_CONCURRENCY}) must never out-eat mounting (${MAX_CONCURRENT_LOADS})`);

  const grabFn = (name) => {
    const m = app.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n`));
    assert(m, `could not extract ${name}() from home-app.js`);
    return m[0];
  };
  const SRC = grabFn('warmEligible') + '\n' + grabFn('warmCard') + '\n' + grabFn('pumpWarm');
  const PRELUDE =
    'let warmStarted = false;\nlet warmActive = 0;\nlet warmCursor = 0;\n'
    + 'let warmSweeping = false;\nlet warmPending = false;\n';

  // names: the catalogue order the cursor walks. Everything else describes the
  // state each card is in, and the real warmEligible() decides.
  function makeWorld(opts = {}) {
    const names = opts.names || Array.from({ length: WARM_CONCURRENCY + 2 }, (_, i) => `n${i}`);
    const state = { warmed: [], timers: [], pumps: 0 };
    const els = new Map(names.map(n => [n, {
      isConnected: !(opts.disconnected || []).includes(n),
      dataset: (opts.errored || []).includes(n) ? { name: n, errorReason: 'load' } : { name: n },
      style: { display: (opts.hidden || []).includes(n) ? 'none' : '' },
    }]));
    const sandbox = {
      allCards: names,
      loadedCards: new Set(opts.loaded || []),
      loadingCards: new Set(opts.loading || []),
      cardCache: new Map(Object.entries(opts.cache || {})),
      cardElsByName: els,
      cardsMetaMap: new Map(),
      isCardHidden: card => card.style.display === 'none',
      CONFIG: { WARM_CONCURRENCY, WARM_TIMEOUT: 12000, CARD_CACHE_MAX: 96 },
      MAX_CONCURRENT_LOADS,
      activeLoads: opts.activeLoads || 0,
      document: { hidden: !!opts.docHidden },
      navigator: opts.navigator || {},
      // A fragment request that never settles, so warmActive stays raised —
      // which is exactly what bounds a pass to WARM_CONCURRENCY.
      fetchTextWithTimeout: url => {
        state.warmed.push(String(url).replace(/^cards\//, '').replace(/\.html$/, ''));
        return new Promise(() => {});
      },
      rememberWarmed: name => { state.remembered = (state.remembered || []).concat(name); },
      pumpWarmSoon: () => { state.pumps++; },
      setTimeout: (fn) => { state.timers.push(fn); return state.timers.length; },
      console: { warn() {}, log() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(PRELUDE + SRC, sandbox, { filename: 'warm-ahead' });
    vm.runInContext('warmStarted = true;', sandbox);
    state.sandbox = sandbox;
    state.names = names;
    return state;
  }
  const read = (state, expr) => vm.runInContext(expr, state.sandbox);

  // a) one pass queues exactly WARM_CONCURRENCY requests and leaves the cursor
  //    after them (not after the whole catalogue), so the next pass resumes.
  {
    const world = makeWorld();
    read(world, 'pumpWarm();');
    assert.deepStrictEqual(world.warmed, world.names.slice(0, WARM_CONCURRENCY),
      `a warm pass queued ${world.warmed.join(',')} , expected the first ${WARM_CONCURRENCY}`);
    assert.strictEqual(read(world, 'warmCursor'), WARM_CONCURRENCY,
      'the cursor did not land where the pass stopped');
    assert.strictEqual(read(world, 'warmStarted'), true, 'a productive pass switched warming off');
    console.log('  ok   one warm pass queues WARM_CONCURRENCY names and parks the cursor');
  }

  // b) loaded, loading, cached, hidden, errored and detached cards are never
  //    warmed; a hidden tab downloads nothing.
  {
    const names = ['ok', 'loaded', 'loading', 'cached', 'hidden', 'errored', 'gone'];
    const world = makeWorld({
      names,
      loaded: ['loaded'], loading: ['loading'], cache: { cached: '<html>' },
      hidden: ['hidden'], errored: ['errored'], disconnected: ['gone'],
    });
    read(world, 'pumpWarm();');
    assert.deepStrictEqual(world.warmed, ['ok'],
      `the warm path queued something it must not: ${world.warmed.join(',')}`);
    console.log('  ok   warm skips loaded/in-flight/cached/hidden/errored/detached cards');

    const hiddenTab = makeWorld({ names: ['a'], docHidden: true });
    read(hiddenTab, 'pumpWarm();');
    assert.deepStrictEqual(hiddenTab.warmed, [], 'a hidden tab downloaded the catalogue');
    console.log('  ok   a hidden tab downloads nothing');
  }

  // c) the mount pipeline owns the connection: at its cap the warm pass
  //    declines outright, so a tool on screen never queues behind one the
  //    visitor has not reached.
  {
    const busy = makeWorld({ names: ['a', 'b'], activeLoads: MAX_CONCURRENT_LOADS });
    read(busy, 'pumpWarm();');
    assert.deepStrictEqual(busy.warmed, [], 'warming ran while every mount slot was busy');
    const idle = makeWorld({ names: ['a', 'b'], activeLoads: MAX_CONCURRENT_LOADS - 2 });
    read(idle, 'pumpWarm();');
    assert.ok(idle.warmed.length > 0, 'warming sat on its hands with a slot spare');
    console.log('  ok   warming yields to the mount pipeline');
  }

  // d) a catalogue that needs nothing ends the pass instead of walking 1,194
  //    names forever — the timer the old trickle kept alive is gone.
  {
    const world = makeWorld({ names: ['a', 'b', 'c'], cache: { a: '<i>', b: '<i>', c: '<i>' } });
    read(world, 'pumpWarm();');
    assert.deepStrictEqual(world.warmed, []);
    assert.strictEqual(read(world, 'warmStarted'), false, 'warming kept running after a whole empty pass');
    console.log('  ok   a warm catalogue switches the pass off (no forever timer)');
  }

  // e) startCacheWarm(): gated on Save-Data / 2G, idempotent, and it kicks a
  //    pump rather than mounting anything itself.
  {
    const grabStart = grabFn('startCacheWarm');
    const runStart = (navigator) => {
      const sandbox = {
        navigator,
        warmStarted: false,
        pumpWarmSoon: () => { sandbox.pumps = (sandbox.pumps || 0) + 1; },
      };
      vm.createContext(sandbox);
      vm.runInContext(grabStart, sandbox);
      return sandbox;
    };
    for (const [label, nav] of [
      ['Save-Data', { connection: { saveData: true, effectiveType: '4g' } }],
      ['2G', { connection: { saveData: false, effectiveType: '2g' } }],
      ['slow-2G', { connection: { saveData: false, effectiveType: 'slow-2g' } }],
    ]) {
      const sandbox = runStart(nav);
      vm.runInContext('startCacheWarm();', sandbox);
      assert.ok(!sandbox.pumps, `${label} visitor got the warm-ahead pass`);
      assert.strictEqual(vm.runInContext('warmStarted', sandbox), false, `${label} visitor had warming marked started`);
    }
    console.log('  ok   Save-Data / 2G keep tiles + click-to-run, no background download');

    const sandbox = runStart({ connection: { saveData: false, effectiveType: '4g' } });
    vm.runInContext('startCacheWarm(); startCacheWarm();', sandbox);
    assert.strictEqual(sandbox.pumps, 1, 'warming did not start exactly once on a normal connection');
    console.log('  ok   startCacheWarm kicks once, never twice');
  }

  // f) no coupling back the other way: a warm fetch must never render, execute
  //    or touch the DOM. That is what makes 1,194 of them affordable.
  {
    const warm = grabFn('warmCard');
    assert.ok(!/renderCardContent|innerHTML|loadCard\(|document\.querySelector/.test(warm),
      'warmCard() does more than fetch bytes — that is the mount path\u2019s job');
    console.log('  ok   a warm fetch is bytes only: no render, no script, no layout');
  }
}

console.log('\ncard-faces tests passed');
