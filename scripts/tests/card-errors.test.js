// Drives the REAL showCardError / retryErroredCards / retryLoadCard out of
// index.html against a minimal DOM stub.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const grab = name => {
  const m = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n`));
  assert(m, `could not extract ${name}`);
  return m[0];
};
const src = [grab('showCardError'), grab('retryLoadCard'), grab('retryErroredCards')].join('\n');

// ---- minimal DOM -------------------------------------------------------
function stubEl(tag) {
  const el = {
    tagName: tag, children: [], dataset: {}, _text: '', _html: '',
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
    },
    listeners: {},
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    getBoundingClientRect: () => el._rect || { top: 0, height: 100 },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this.children = []; },
    querySelector(sel) {
      const key = sel.replace(/^\./, '');
      if (!this.children[key]) this.children[key] = stubEl('div');
      return this.children[key];
    },
  };
  return el;
}

function makeCard(name, { rect, displayName }) {
  const card = stubEl('div');
  card.dataset.name = name;
  if (displayName) card.dataset.displayName = displayName;
  card._rect = rect;
  card._sandbox = stubEl('div');
  card.querySelector = sel => (sel === '.card-sandbox' ? card._sandbox : null);
  return card;
}

let loadCalls = [];
const state = { loadedCards: new Set(), loadingCards: new Set(), cards: [] };

const sandbox = new Proxy({
  loadedCards: state.loadedCards,
  loadingCards: state.loadingCards,
  loadCard: (card, name) => loadCalls.push(name),
  AUTO_RETRY_LIMIT: 3,
  window: { scrollY: 0, innerHeight: 900 },
  document: { querySelectorAll: sel => {
    assert.match(sel, /data-error-reason="load"|data-name/);
    if (sel.includes('data-error-reason')) {
      return state.cards.filter(c => c.dataset.errorReason === 'load');
    }
    const m = sel.match(/data-name="([^"]+)"/);
    return state.cards.filter(c => c.dataset.name === m[1])[0] || null;
  }, querySelector: sel => {
    const m = sel.match(/data-name="([^"]+)"/);
    return m ? state.cards.find(c => c.dataset.name === m[1]) : null;
  } },
  parseInt, String, console,
}, { has: () => true, get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => (t[k] = v, true) });

vm.createContext(sandbox);
// runInContext returns the script's completion value, which avoids relying on
// globalThis propagating back through the Proxy sandbox.
const api = vm.runInContext(
  src + '\n;({ showCardError, retryLoadCard, retryErroredCards });',
  sandbox, { filename: 'index.html(extracted)' });
assert.strictEqual(typeof api.showCardError, 'function', 'extraction failed');

// ---- 1. the ampersand must survive verbatim ---------------------------
const c1 = makeCard('anime-japanese-phrases-tropes',
  { displayName: '🎌 Anime Phrases & Tropes', rect: { top: 0, height: 100 } });
api.showCardError(c1, 'anime-japanese-phrases-tropes',
  new Error('NetworkError when attempting to fetch resource.'), 'load');
const title = c1._sandbox.children['card-error-title']._text;
assert.ok(title.includes('Anime Phrases & Tropes'), `title was: ${title}`);
assert.ok(!title.includes('&amp;'), `title is HTML-escaped: ${title}`);
console.log(`  ok   heading shows a literal ampersand: "${title}"`);

// ---- 2. the error text is data, not markup ----------------------------
api.showCardError(c1, 'x', new Error('<img src=q onerror=alert(1)>'), 'load');
assert.strictEqual(c1._sandbox.children['card-error-detail']._text,
  '<img src=q onerror=alert(1)>', 'error message must be inert text');
assert.ok(!c1._sandbox._html.includes('onerror=alert'),
  'error message leaked into markup');
console.log('  ok   a hostile error message is rendered as inert text');

// ---- 3. load vs render are distinguishable ----------------------------
const cLoad = makeCard('a', { displayName: 'A' });
const cRender = makeCard('b', { displayName: 'B' });
api.showCardError(cLoad, 'a', new Error('net'), 'load');
api.showCardError(cRender, 'b', new Error('boom'), 'render');
assert.ok(cLoad._sandbox.children['card-error-title']._text.startsWith('Failed to load'),
  'load failure should say "Failed to load"');
assert.ok(cRender._sandbox.children['card-error-title']._text.startsWith("Couldn't render"),
  'render failure should NOT blame the network');
console.log('  ok   a render failure no longer masquerades as a network failure');

// ---- 4. the retry button is wired without an inline onclick -----------
assert.strictEqual(Object.keys(cLoad._sandbox.children['card-error-retry'].listeners).length, 1);
assert.ok(!cLoad._sandbox._html.includes('onclick='), 'inline onclick still present');
console.log('  ok   Retry is bound with addEventListener, no inline onclick string');

// ---- 5. the sweep retries only 'load' failures, in view ---------------
state.cards = [];
loadCalls = [];
const near = makeCard('near', { rect: { top: 100, height: 100 } });
near.dataset.errorReason = 'load';
const offscreen = makeCard('far', { rect: { top: 90000, height: 100 } });
offscreen.dataset.errorReason = 'load';
const rendered = makeCard('broken', { rect: { top: 100, height: 100 } });
rendered.dataset.errorReason = 'render';
state.cards = [near, offscreen, rendered];

api.retryErroredCards();
assert.deepStrictEqual(loadCalls, ['near'],
  `expected only the visible load-failure to retry, got ${loadCalls.join(',')}`);
console.log('  ok   sweep retries the visible network failure only (not offscreen, not render failures)');

// ---- 6. and it gives up after the limit -------------------------------
// Each failed attempt re-sets errorReason (showCardError does that), so the
// sweep sees the card again next time. autoRetries is what persists and what
// enforces the ceiling.
loadCalls = [];
for (let i = 0; i < 6; i++) {
  near.dataset.errorReason = 'load';   // simulate the retry having failed again
  api.retryErroredCards();
}
assert.strictEqual(loadCalls.length, 2,
  `expected 2 more retries before AUTO_RETRY_LIMIT=3, got ${loadCalls.length}`);
assert.strictEqual(near.dataset.autoRetries, '3');
// And it stays refused while the counter is exhausted.
near.dataset.errorReason = 'load';
api.retryErroredCards();
assert.strictEqual(loadCalls.length, 2, 'sweep must stop retrying once the limit is hit');
console.log('  ok   sweep stops after AUTO_RETRY_LIMIT instead of looping forever');

// ---- 7. a manual retry resets the allowance ---------------------------
loadCalls = [];
api.retryLoadCard('near');
assert.deepStrictEqual(loadCalls, ['near'], 'manual retry should always work');
assert.strictEqual(near.dataset.autoRetries, '0', 'manual retry should reset the counter');
console.log('  ok   a manual Retry resets the allowance and always fires');

console.log('\ncard-error and recovery tests passed');
