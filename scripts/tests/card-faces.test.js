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
  const sandbox = { cardsMetaMap, document, console };
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
// startIdleTrickle(): quietly queues a few pending cards per tick without
// any interaction, skips hidden/errored/in-flight cards, keeps ticking while
// the pipeline drains, and stops once everything is live. Data-saver / 2G
// visitors never get the trickle at all.
{
  // Extract the real trickle batch from the shipped file so the harness
  // follows it. The trickle is a gentle 6-per-2.5s background top-up: every
  // card already displays as a readable face, so it only stays ahead of a
  // scroll rather than refetching the catalogue in the background.
  const BATCH_M = app.match(/TRICKLE_BATCH\s*=\s*(\d+)/);
  const ACTUAL_BATCH = BATCH_M ? parseInt(BATCH_M[1], 10) : 6;
  const INTERVAL_M = app.match(/TRICKLE_INTERVAL\s*=\s*(\d+)/);
  const ACTUAL_INTERVAL = INTERVAL_M ? parseInt(INTERVAL_M[1], 10) : 2500;
  const grabTrickle = () => {
    const m = app.match(/function startIdleTrickle\([^)]*\) \{[\s\S]*?\n    \}\n/);
    assert(m, 'could not extract startIdleTrickle() from home-app.js');
    return m[0];
  };

  function runTrickle(state, timers, extra = {}) {
    const sandbox = {
      trickleStarted: false,
      TRICKLE_BATCH: ACTUAL_BATCH,
      TRICKLE_INTERVAL: ACTUAL_INTERVAL,
      navigator: state.navigator || {},
      document: { hidden: !!state.hidden },
      pendingCards: state.pending,
      loadedCards: state.loadedSet,
      loadingCards: state.loadingSet,
      isCardHidden: (c) => !!c.hidden,
      // model the real pipeline: loadCard immediately marks the card
      // in-flight (loadQueue/loadingCards), so later ticks skip it
      loadCard: (card, name) => { state.queued.push(name); state.loadingSet.add(name); },
      get activeLoads() { return state.activeLoads; },
      get loadQueue() { return state.loadQueue; },
      setTimeout: (fn) => { timers.push(fn); return timers.length; },
      console,
      ...extra,
    };
    vm.createContext(sandbox);
    vm.runInContext(grabTrickle() + ';startIdleTrickle();', sandbox);
    return sandbox;
  }

  // a) queues up to TRICKLE_BATCH eligible cards on the first tick, then
  //    keeps ticking while loads are in flight; stops when all done.
  //    Build a pending set larger than one batch so batching is exercised
  //    regardless of the current batch size.
  {
    const total = ACTUAL_BATCH + 2;
    const pending = Array.from({ length: total }, (_, i) => ({ dataset: { name: `n${i}` } }));
    const state = {
      pending,
      loadedSet: new Set(), loadingSet: new Set(),
      queued: [], activeLoads: 4, loadQueue: [],
    };
    const timers = [];
    runTrickle(state, timers);
    assert.strictEqual(timers.length, 1, 'trickle did not schedule its first tick');
    timers.shift()(); // first tick
    assert.strictEqual(state.queued.length, ACTUAL_BATCH, `expected a batch of ${ACTUAL_BATCH}, got ${state.queued.length}`);
    assert.strictEqual(timers.length, 1, 'trickle stopped while loads were still in flight');
    // pipeline drains and everything finishes: next tick queues the last two, then stops
    state.activeLoads = 0;
    state.loadingSet.clear();
    // mutate the captured Sets in place — the sandbox holds the references
    for (let i = 0; i < ACTUAL_BATCH; i++) state.loadedSet.add(`n${i}`);
    timers.shift()();
    const expectedAll = pending.map(p => p.dataset.name);
    assert.deepStrictEqual(state.queued, expectedAll,
      'the trickle never reached the tail of the catalogue');
    for (let i = ACTUAL_BATCH; i < total; i++) state.loadedSet.add(`n${i}`);
    timers.shift()(); // nothing eligible + idle -> terminal
    assert.strictEqual(timers.length, 0, 'trickle kept ticking after finishing the catalogue');
    console.log('  ok   trickle queues batches, then stops when every card is live');
  }

  // b) hidden, errored and in-flight cards are skipped; a hidden document
  //    ticks without queueing.
  {
    const state = {
      pending: [
        { dataset: { name: 'ok' } },
        { dataset: { name: 'hidden' }, hidden: true },
        { dataset: { name: 'errored', errorReason: 'load' } },
        { dataset: { name: 'inflight' } },
      ],
      loadedSet: new Set(),
      loadingSet: new Set(['inflight']),
      queued: [], activeLoads: 1, loadQueue: [],
    };
    const timers = [];
    runTrickle(state, timers);
    timers.shift()();
    assert.deepStrictEqual(state.queued, ['ok'], 'trickle queued a hidden/errored/in-flight card');
    // hidden document: no queueing, but the loop survives
    state.hidden = true;
    const before = state.queued.length;
    timers.shift()();
    assert.strictEqual(state.queued.length, before, 'trickle queued while the tab was hidden');
    assert.strictEqual(timers.length, 1, 'trickle died while the tab was hidden');
    console.log('  ok   trickle skips hidden/errored/in-flight cards and pauses on hidden tabs');
  }

  // c) data-saver and 2G never start the trickle.
  for (const [label, nav] of [
    ['Save-Data', { connection: { saveData: true, effectiveType: '4g' } }],
    ['2G', { connection: { saveData: false, effectiveType: '2g' } }],
    ['slow-2G', { connection: { saveData: false, effectiveType: 'slow-2g' } }],
  ]) {
    const state = { pending: [{ dataset: { name: 'a' } }], loadedSet: new Set(),
                    loadingSet: new Set(), queued: [], activeLoads: 0, loadQueue: [], navigator: nav };
    const timers = [];
    runTrickle(state, timers);
    assert.strictEqual(timers.length, 0, `${label} visitor got the trickle`);
    assert.strictEqual(state.queued.length, 0, `${label} visitor had cards queued`);
  }
  console.log('  ok   Save-Data / 2G / slow-2G visitors keep faces + click-to-run');

  // d) starting twice is inert.
  {
    const state = { pending: [{ dataset: { name: 'a' } }], loadedSet: new Set(),
                    loadingSet: new Set(), queued: [], activeLoads: 0, loadQueue: [] };
    const timers = [];
    const sandbox = runTrickle(state, timers);
    vm.runInContext('startIdleTrickle();', sandbox);
    assert.strictEqual(timers.length, 1, 'double start scheduled two loops');
    console.log('  ok   double start is inert');
  }
}

console.log('\ncard-faces tests passed');
