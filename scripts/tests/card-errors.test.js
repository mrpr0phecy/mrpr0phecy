// Drives the REAL showCardError / retryLoadCard / retryErroredCards out of
// index.html against a minimal DOM stub.
//
// These test the shipped loader design: DOM-API error UI, load-vs-render
// reasons, manual retry that always fires, and a bounded scroll-driven
// re-sweep of visible load failures. Run with:
//
//   node scripts/tests/card-errors.test.js
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const grab = name => {
  const m = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n`));
  assert(m, `could not extract ${name}`);
  return m[0];
};
// The shipped auto-retry budget, read from the real CONFIG — not assumed.
const limitMatch = html.match(/AUTO_RETRY_LIMIT:\s*(\d+)/);
assert(limitMatch, 'could not read CONFIG.AUTO_RETRY_LIMIT from index.html');
const SHIPPED_LIMIT = parseInt(limitMatch[1], 10);
assert.ok(SHIPPED_LIMIT >= 1 && SHIPPED_LIMIT <= 10,
  `AUTO_RETRY_LIMIT=${SHIPPED_LIMIT} is outside sane bounds`);
const src = [grab('showCardError'), grab('retryLoadCard'), grab('retryErroredCards')].join('\n');

// ---- minimal DOM -------------------------------------------------------
const created = [];
function stubEl(tag) {
  const el = {
    tagName: tag, children: [], dataset: {}, attrs: {}, listeners: {},
    _text: '', _html: '', _cssText: '',
    style: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
    },
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(c) { this.children.push(c); return c; },
    getBoundingClientRect: () => el._rect || { top: 0, bottom: 100, height: 100, width: 100 },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    querySelector(sel) {
      const key = sel.replace(/^[.#]/, '');
      if (!this.children[key]) this.children[key] = stubEl('div');
      return this.children[key];
    },
  };
  Object.defineProperty(el.style, 'cssText', {
    get() { return el._cssText; },
    set(v) { el._cssText = String(v); },
  });
  created.push(el);
  return el;
}

function makeCard(name, { rect, displayName } = {}) {
  const card = stubEl('div');
  card.dataset.name = name;
  if (displayName) card.dataset.displayName = displayName;
  if (rect) card._rect = rect;
  card._sandbox = stubEl('div');
  card.querySelector = sel => (sel === '.card-sandbox' ? card._sandbox : null);
  return card;
}

const findByClass = (root, cls) =>
  created.filter(e => e.className === cls && e._text !== undefined).pop();

let loadCalls = [];
const state = { loadedCards: new Set(), loadingCards: new Set(), cards: [] };

const sandbox = new Proxy({
  loadedCards: state.loadedCards,
  loadingCards: state.loadingCards,
  retryCounts: new Map(),
  loadCard: (card, name) => loadCalls.push(name),
  CONFIG: { AUTO_RETRY_LIMIT: SHIPPED_LIMIT },
  window: { scrollY: 0, innerHeight: 900 },
  document: {
    createElement: tag => stubEl(tag),
    querySelectorAll: sel => {
      assert.match(sel, /data-error-reason="load"|data-name/);
      if (sel.includes('data-error-reason')) {
        return state.cards.filter(c => c.dataset.errorReason === 'load');
      }
      const m = sel.match(/data-name="([^"]+)"/);
      return state.cards.filter(c => c.dataset.name === m[1])[0] || null;
    },
    querySelector: sel => {
      const m = sel.match(/data-name="([^"]+)"/);
      return m ? state.cards.find(c => c.dataset.name === m[1]) : null;
    },
  },
  parseInt, String, console,
}, { has: () => true, get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => (t[k] = v, true) });

vm.createContext(sandbox);
// runInContext returns the script's completion value, which avoids relying on
// globalThis propagating back through the Proxy sandbox.
const api = vm.runInContext(
  src + '\n;({ showCardError, retryLoadCard, retryErroredCards });',
  sandbox, { filename: 'index.html(extracted)' });
assert.strictEqual(typeof api.showCardError, 'function', 'extraction failed');
assert.strictEqual(typeof api.retryErroredCards, 'function', 'extraction failed');

// ---- 1. the ampersand must survive verbatim ---------------------------
const c1 = makeCard('anime-japanese-phrases-tropes',
  { displayName: '🎌 Anime Phrases & Tropes' });
api.showCardError(c1, 'anime-japanese-phrases-tropes',
  new Error('NetworkError when attempting to fetch resource.'), 'load');
const title = findByClass(c1._sandbox, 'card-error-title');
assert.ok(title, 'error UI must include a .card-error-title element');
assert.ok(title._text.includes('Anime Phrases & Tropes'), `title was: ${title._text}`);
assert.ok(!title._text.includes('&amp;'), `title is HTML-escaped: ${title._text}`);
console.log(`  ok   heading shows a literal ampersand: "${title._text}"`);

// ---- 2. the error text is data, not markup ----------------------------
created.length = 0;
api.showCardError(c1, 'x', new Error('<img src=q onerror=alert(1)>'), 'load');
const detail = created.find(e => e.className === 'card-error-detail');
assert.ok(detail, 'error UI must include a .card-error-detail element');
assert.strictEqual(detail._text,
  '<img src=q onerror=alert(1)>', 'error message must be inert text');
assert.strictEqual(c1._sandbox._html, '',
  'error UI must not interpolate anything into innerHTML');
for (const e of created) {
  assert.ok(!String(e._html).includes('onerror=alert'),
    'error message leaked into markup');
}
console.log('  ok   a hostile error message is rendered as inert text');

// ---- 3. load vs render are distinguishable ----------------------------
const cLoad = makeCard('a', { displayName: 'A' });
const cRender = makeCard('b', { displayName: 'B' });
created.length = 0;
api.showCardError(cLoad, 'a', new Error('net'), 'load');
api.showCardError(cRender, 'b', new Error('boom'), 'render');
const titles = created.filter(e => e.className === 'card-error-title');
assert.ok(titles[0]._text.startsWith('Failed to load'),
  'load failure should say "Failed to load"');
assert.ok(titles[1]._text.startsWith("Couldn't render"),
  'render failure should NOT blame the network');
assert.strictEqual(cLoad.dataset.errorReason, 'load');
assert.strictEqual(cRender.dataset.errorReason, 'render');
console.log('  ok   a render failure no longer masquerades as a network failure');

// ---- 4. the retry button is wired without an inline onclick -----------
const retryBtns = created.filter(e => e.className === 'card-error-retry');
const retryBtn = retryBtns[retryBtns.length - 1];
assert.ok(retryBtn, 'error UI must include a .card-error-retry button');
assert.deepStrictEqual(Object.keys(retryBtn.listeners), ['click']);
assert.ok(!('onclick' in retryBtn.attrs), 'inline onclick still present');
loadCalls = [];
state.cards = [cRender];
retryBtn.listeners.click[0]();   // clicking Retry must actually retry
assert.deepStrictEqual(loadCalls, ['b'], 'retry click should call loadCard');
console.log('  ok   Retry is bound with addEventListener and fires loadCard');

// ---- 5. the sweep retries only visible 'load' failures ----------------
state.cards = [];
loadCalls = [];
const near = makeCard('near', { rect: { top: 100, bottom: 200, height: 100, width: 100 } });
near.dataset.errorReason = 'load';
const offscreen = makeCard('far', { rect: { top: 90000, bottom: 90100, height: 100, width: 100 } });
offscreen.dataset.errorReason = 'load';
const rendered = makeCard('broken', { rect: { top: 100, bottom: 200, height: 100, width: 100 } });
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
for (let i = 0; i < SHIPPED_LIMIT + 3; i++) {
  near.dataset.errorReason = 'load';   // simulate the retry having failed again
  api.retryErroredCards();
}
assert.strictEqual(loadCalls.length, SHIPPED_LIMIT - 1,
  `expected ${SHIPPED_LIMIT - 1} more retries before AUTO_RETRY_LIMIT=${SHIPPED_LIMIT}, got ${loadCalls.length}`);
assert.strictEqual(near.dataset.autoRetries, String(SHIPPED_LIMIT));
// And it stays refused while the counter is exhausted.
near.dataset.errorReason = 'load';
api.retryErroredCards();
assert.strictEqual(loadCalls.length, SHIPPED_LIMIT - 1,
  'sweep must stop retrying once the limit is hit');
console.log(`  ok   sweep stops after AUTO_RETRY_LIMIT=${SHIPPED_LIMIT} instead of looping forever`);

// ---- 7. a manual retry resets the allowance ---------------------------
loadCalls = [];
api.retryLoadCard('near');
assert.deepStrictEqual(loadCalls, ['near'], 'manual retry should always work');
assert.strictEqual(near.dataset.autoRetries, '0', 'manual retry should reset the counter');
assert.ok(!('errorReason' in near.dataset), 'manual retry should clear the failure flag');
console.log('  ok   a manual Retry resets the allowance and always fires');

console.log('\ncard-error and recovery tests passed');
