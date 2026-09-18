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
// The generated first screen ships faces (with descriptions), not skeletons.
{
  const prerender = html.match(/HOME-PRERENDER:BEGIN([\s\S]*?)HOME-PRERENDER:END/);
  assert(prerender, 'HOME-PRERENDER block missing from index.html');
  const block = prerender[1];
  const faces = (block.match(/class="card-face"/g) || []).length;
  assert.strictEqual(faces, 12, `expected 12 generated faces, found ${faces}`);
  assert.ok(!block.includes('card-skeleton'),
    'generated shells still contain a skeleton');
  const descs = (block.match(/class="card-face-desc"/g) || []).length;
  assert.strictEqual(descs, 12, 'every generated face must carry a description');
  assert.ok(!/card-face-desc>\s*</.test(block),
    'a generated face has an empty description — the generator must embed it');
  // Faces are keyboard-reachable and labelled.
  assert.ok(block.includes('role="button"') && block.includes('tabindex="0"'),
    'generated faces must be focusable buttons');
  console.log('  ok   12 generated first-screen faces with descriptions, no skeleton');
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

console.log('\ncard-faces tests passed');
