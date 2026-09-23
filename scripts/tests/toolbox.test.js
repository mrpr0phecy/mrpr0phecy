// The visitor's toolbox, driven for real.
//
// toolbox.js is the one part of the site that remembers something about a
// visitor, so it is also the part where a bug is most expensive: a toolbox that
// forgets looks broken, and one that loses somebody's list after they spent
// five minutes assembling it is worse than never offering one.
//
// This runs the SHIPPED file in a sandbox with a stubbed DOM and a real
// localStorage shim, then exercises the paths that matter:
//
//   1. add / remove / toggle / reorder, and what survives a reload
//   2. the storage key (mp.toolbox.v1 — the `__mp_` namespace is reserved for
//      instrumentation, and a clash there would corrupt the dashboard buffers)
//   3. the share link: base64url of the slug list, and what a visitor receiving
//      one sees (an offer, never an automatic write)
//   4. the ＋ buttons a page ships: pressed state follows the saved list
//   5. a corrupt or foreign localStorage value cannot break the panel
//
// Run with: node scripts/tests/toolbox.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
// Lists cross a VM boundary, so their prototypes are not this realm's: compare
// by value, not by identity.
const same = (actual, expected, msg) =>
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), msg);
const SOURCE = fs.readFileSync(path.join(ROOT, 'toolbox.js'), 'utf8');

/* ---------------------------------------------------------------- stubs ---- */
function makeElement(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [],
    attributes: {},
    dataset: {},
    style: { cssText: '', setProperty() {} },
    className: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    type: '',
    value: '',
    files: null,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, on) { if (on === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else if (on) { this._set.add(c); } else { this._set.delete(c); } },
      contains(c) { return this._set.has(c); }
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    insertBefore(child) { this.children.unshift(child); return child; },
    removeChild(child) { this.children = this.children.filter(c => c !== child); return child; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    addEventListener(type, fn) { (this._on = this._on || {})[type] = fn; },
    dispatch(type, event) { if (this._on && this._on[type]) this._on[type](event || {}); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {},
    select() {},
    click() { this.dispatch('click', { target: this }); }
  };
  return el;
}

function makeSandbox(opts) {
  opts = opts || {};
  const store = new Map();
  if (opts.rawStorage !== undefined) store.set('mp.toolbox.v1', opts.rawStorage);

  const body = makeElement('body');
  const panel = makeElement('div');
  const content = makeElement('div');
  panel.querySelector = (sel) => (sel === '#toolboxContent' ? content : null);

  const document = {
    readyState: 'complete',
    body,
    documentElement: makeElement('html'),
    _on: {},
    getElementById(id) {
      if (id === 'toolbox') return panel;
      if (id === 'toolboxContent') return content;
      if (id === 'toolboxCardCount') return makeElement('span');
      return null;
    },
    createElement: makeElement,
    querySelectorAll(sel) {
      if (sel === '[data-toolbox-count]') return [];
      if (sel === '[data-toolbox-add]') return (opts.addButtons || []);
      if (sel === '[data-toolbox-row]') return (opts.rows || []);
      return [];
    },
    addEventListener(type, fn) { this._on[type] = fn; },
    dispatch(type, event) { if (this._on[type]) this._on[type](event); }
  };

  const sandbox = {
    console,
    document,
    location: {
      search: opts.search || '',
      pathname: opts.pathname || '/index.html',
      origin: 'https://example.test',
      href: 'https://example.test/' + (opts.pathname || '/index.html').replace(/^\//, '')
    },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0; },
    clearTimeout: () => {},
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    confirm: () => true,
    fetch: (url) => { sandbox.fetched = sandbox.fetched || []; sandbox.fetched.push(String(url));
      return Promise.resolve({ ok: false, json: () => Promise.resolve([]) }); },
    FileReader: function () {},
    CustomEvent: function () {},
    URLSearchParams
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'toolbox.js' });
  return { sandbox, store, content, addButtons: opts.addButtons || [] };
}

/* --------------------------------------------------- 1. the storage contract */
{
  const { sandbox, store } = makeSandbox();
  const T = sandbox.window.mpToolbox;
  assert(T, 'mpToolbox must be exported on window');

  same(T.slugs(), [], 'a fresh toolbox is empty');
  assert.strictEqual(T.add('bmi'), true);
  assert.strictEqual(T.add('bmi'), false, 'adding twice is a no-op, not a duplicate');
  assert.strictEqual(T.add('mortgage'), true);
  assert.strictEqual(T.count(), 2);
  assert.strictEqual(T.has('bmi'), true);

  assert.strictEqual(T.toggle('bmi'), false, 'toggle off returns false');
  assert.strictEqual(T.has('bmi'), false);
  assert.strictEqual(T.toggle('bmi'), true, 'toggle on returns true');

  // Order is the visitor's order. A tool re-added after removal goes to the
  // end, the way a bookmark list behaves — no hidden resorting.
  same(T.slugs(), ['mortgage', 'bmi']);
  T.move('bmi', -1);
  same(T.slugs(), ['bmi', 'mortgage']);
  assert.strictEqual(T.move('bmi', -1), false, 'cannot move past the top');
  assert.strictEqual(T.move('mortgage', 1), false, 'cannot move past the end');

  // What survives a reload is the same list, in the same order.
  const saved = JSON.parse(store.get('mp.toolbox.v1'));
  same(saved, ['bmi', 'mortgage'], 'the saved list is the visitor\'s list');
  const reloaded = makeSandbox({ rawStorage: store.get('mp.toolbox.v1') });
  same(reloaded.sandbox.window.mpToolbox.slugs(), ['bmi', 'mortgage'],
    'a reload keeps the toolbox');

  // The key itself is the contract with every other script on the site.
  assert(store.has('mp.toolbox.v1'));
  assert(!/__mp_/.test(Object.keys(Object.fromEntries(store)).join(',')),
    'the toolbox must not write into the __mp_ namespace reserved for instrumentation');

  T.clear();
  same(T.slugs(), []);
}

/* ------------------------------------------- 2. corrupt storage is survivable */
{
  for (const bad of ['not json', '"a string"', '{"tools":[1,2]}', 'null', '[1,2,3]']) {
    const { sandbox } = makeSandbox({ rawStorage: bad });
    const T = sandbox.window.mpToolbox;
    same(T.slugs(), [], `storage value ${bad} must fall back to an empty toolbox`);
    T.add('bmi');
    same(T.slugs(), ['bmi'], `the toolbox still works after reading ${bad}`);
  }
  // Slugs are strings, and a hostile value cannot inject markup into the panel.
  const { sandbox, content } = makeSandbox({ rawStorage: JSON.stringify(['<img src=x onerror=alert(1)>', 'ok-slug']) });
  const T = sandbox.window.mpToolbox;
  T.add('another');
  const html = content.innerHTML;
  assert(!/<img/i.test(html), 'a slug is escaped before it reaches the panel: ' + html.slice(0, 120));
  assert(html.includes('tool.html?card='), 'each saved tool links to its own page');
}

/* ------------------------------------------------------- 3. the share link */
{
  const { sandbox } = makeSandbox();
  const T = sandbox.window.mpToolbox;
  T.replace(['bmi', 'mortgage']);
  const raw = JSON.stringify(['bmi', 'mortgage']);
  const b64 = Buffer.from(raw, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  // The receiving end: a URL carrying someone else's toolbox.
  const receiver = makeSandbox({ search: '?toolbox=' + b64 });
  // Nothing is written without the visitor's click.
  same(receiver.sandbox.window.mpToolbox.slugs(), [],
    'a shared toolbox must never be added automatically');
}

/* ------------------------------------------------- 4. the ＋ buttons follow it */
{
  const button = makeElement('button');
  button.setAttribute('data-toolbox-add', 'bmi');
  const { sandbox } = makeSandbox({ addButtons: [button] });
  const T = sandbox.window.mpToolbox;
  assert.strictEqual(button.getAttribute('aria-pressed'), 'false');
  T.add('bmi');
  assert.strictEqual(button.getAttribute('aria-pressed'), 'true', 'the ＋ reflects the saved list');
  assert(button.classList.contains('xp-in'), 'and wears the saved state');
  T.remove('bmi');
  assert.strictEqual(button.getAttribute('aria-pressed'), 'false');
}

/* ------------------------------------------ 5. rows ship without dead buttons */
{
  // Generators emit plain rows; the ＋ is added by script, so a no-JS visitor
  // never meets a button that cannot work.
  const row = makeElement('li');
  row.setAttribute('data-toolbox-row', 'bmi');
  const { sandbox } = makeSandbox({ rows: [row] });
  const added = row.children.find(c => c.className === 'xp-actions');
  assert(added, 'a row marked for the toolbox gets its actions');
  const btn = added.children.find(c => c.attributes['data-toolbox-add']);
  assert(btn, 'including the ＋ button itself');
  assert.strictEqual(btn.textContent, '＋');
  assert(sandbox.window.mpToolbox.has('bmi') === false);
}

/* ---------------------------- 6. the lite tier is found from any page depth */
{
  // Category pages live one directory down. Asking for `cards/cards-lite.json`
  // from /categories/ 404s, and because the failure is swallowed the panel
  // quietly shows raw slugs instead of titles — a bug that looks like styling.
  const deep = makeSandbox({ pathname: '/categories/mathematics.html' });
  deep.sandbox.window.mpToolbox.ready();
  const deepUrls = (deep.sandbox.fetched || []).join(',');
  assert.ok(deepUrls.indexOf('../cards/cards-lite.json') !== -1,
    'a category page must ask for the lite tier one level up: ' + (deepUrls || '(nothing fetched)'));

  const root = makeSandbox({});
  root.sandbox.window.mpToolbox.ready();
  const rootUrls = (root.sandbox.fetched || []).join(',');
  assert.ok(rootUrls.indexOf('cards/cards-lite.json') === 0,
    'a root page must ask for it in place: ' + (rootUrls || '(nothing fetched)'));
}

console.log('toolbox: storage, share links, ＋ buttons and corrupt values all behave');
