'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) { ({ JSDOM } = require('jsdom')); }
const root = path.resolve(__dirname, '../..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');

const tools = Array.from({ length: 130 }, (_, i) => ({
  slug: `fixture-${i}`, title: `${i < 65 ? 'Alpha' : 'Beta'} Tool ${String(i % 65).padStart(3, '0')}`,
  description: 'Fixture description', categoryName: 'Fixtures', category: 'fixtures', tags: []
}));
const lite = tools.map(t => ({ n: t.slug, t: t.title, c: 'Fixtures' }));
const row = t => `<li class="xp-row" data-slug="${t.slug}"><a href="tool/${t.slug}.html" data-xp-open><span class="xp-title">${t.title}</span></a><p class="xp-desc">${t.description}</p></li>`;
const staticHTML = [tools.slice(0, 65), tools.slice(65)].map((items, i) =>
  `<section data-xp-group="Group ${i}"><ul>${items.slice().reverse().map(row).join('')}</ul></section>`).join('');

async function boot(opts = {}) {
  const mode = opts.json ? 'json' : 'static';
  const dom = new JSDOM(`<main><div id="explore" data-explore="${mode}">${opts.json ? '' : staticHTML}</div></main>`, {
    url: 'https://catalogue.test/tools.html', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.localStorage.setItem('mp.toolbox.v1', JSON.stringify(opts.saved || []));
  let fetches = 0;
  w.fetch = async url => {
    if (String(url).includes('tools-index.json')) return { ok: true, json: async () => ({ tools, categories: [{ name: 'Fixtures', slug: 'fixtures', count: tools.length }] }) };
    fetches++;
    if (opts.failOnce && fetches === 1) return { ok: false, status: 503 };
    return { ok: true, json: async () => lite };
  };
  w.eval(source('toolbox.js'));
  w.eval(source('explore.js'));
  if (opts.json) await w.mpExplore.warm();
  return dom;
}
function key(w, value) {
  w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
}
function visible(w) {
  return [...w.document.querySelectorAll('.xp-row[data-slug]:not([hidden])')];
}
function sort(w, value) {
  const select = w.document.getElementById('xp-sort');
  select.value = value;
  select.dispatchEvent(new w.Event('change', { bubbles: true }));
}

test('static filters reuse structural references, touch only changed visibility, and leave toolbox buttons alone', async () => {
  const dom = await boot({ saved: ['fixture-0'] });
  try {
    const w = dom.window, host = w.document.getElementById('explore');
    const rows = [...host.querySelectorAll('.xp-row')];
    for (const el of rows) el.closest = () => { throw new Error('filter rediscovered a fixed group'); };
    const observer = new w.MutationObserver(() => {});
    observer.observe(w.document.body, { attributes: true, childList: true, subtree: true });
    w.mpExplore.filter('Alpha', { quiet: true });
    const changed = observer.takeRecords();
    assert.equal(visible(w).length, 60, 'reveal still applies per matching group');
    assert(changed.some(r => r.attributeName === 'hidden'));
    assert(!changed.some(r => r.target.hasAttribute?.('data-toolbox-add')), 'filtering is not a saved-state mutation');
    assert.equal(w.document.querySelector('[data-toolbox-add="fixture-0"]').getAttribute('aria-pressed'), 'true');
    w.mpExplore.filter('Alpha', { quiet: true });
    assert.equal(observer.takeRecords().length, 0, 'forwarding the same query performs no DOM writes');
    observer.disconnect();
    w.mpExplore.filter('does-not-exist', { quiet: true });
    assert.equal(visible(w).length, 0);
    assert.equal(w.document.querySelector('.xp-empty').hidden, false);
    w.mpExplore.clear();
    assert.equal(visible(w).length, 120, 'clearing restores both groups');
  } finally { dom.window.close(); }
});

test('static sorting reveals the first rows in displayed order without pulling links out of their lists', async () => {
  const dom = await boot();
  try {
    const w = dom.window;
    for (const direction of ['az', 'za', 'az']) {
      sort(w, direction);
      for (const group of w.document.querySelectorAll('[data-xp-group]')) {
        const rows = [...group.querySelectorAll('.xp-row')];
        assert(rows.every(el => el.parentNode.tagName === 'UL'));
        assert.deepEqual(rows.filter(el => !el.hidden), rows.slice(0, 60));
        assert.equal(rows[0].textContent.includes(direction === 'za' ? '064' : '000'), true);
      }
    }
  } finally { dom.window.close(); }
});

test('keyboard movement scans visible rows once, changes only two highlights, and invalidates after filtering', async () => {
  const dom = await boot();
  try {
    const w = dom.window, host = w.document.getElementById('explore');
    let scans = 0;
    const query = host.querySelectorAll.bind(host);
    host.querySelectorAll = selector => { if (selector.includes('.xp-row[data-slug]:not')) scans++; return query(selector); };
    const observer = new w.MutationObserver(() => {});
    observer.observe(host, { attributes: true, subtree: true });
    for (let i = 0; i < 40; i++) key(w, 'j');
    assert.equal(scans, 1);
    assert.equal(observer.takeRecords().length, 79, 'first highlight plus two writes per subsequent move');
    assert.equal(host.querySelectorAll('.xp-current').length, 1);
    observer.disconnect();
    w.mpExplore.filter('Alpha Tool 064', { quiet: true });
    assert.equal(host.querySelectorAll('.xp-current').length, 0, 'a filter clears the old highlight');
    key(w, 'j');
    assert.equal(scans, 2);
    assert.equal(host.querySelector('.xp-current').getAttribute('data-slug'), 'fixture-64');
    key(w, 'b');
    assert.equal(host.querySelector('[data-toolbox-add="fixture-64"]').getAttribute('aria-pressed'), 'true');
    key(w, 'x');
    assert(host.querySelector('.xp-current').classList.contains('xp-collapsed'));
    sort(w, 'za');
    assert.equal(host.querySelectorAll('.xp-current').length, 0);
  } finally { dom.window.close(); }
});

test('show-more invalidates keyboard row caches in both static and appended JSON lists', async () => {
  for (const json of [false, true]) {
    const dom = await boot({ json });
    try {
      const w = dom.window;
      const count = visible(w).length;
      for (let i = 0; i < count; i++) key(w, 'j');
      w.document.querySelector('[data-xp-more]').click();
      assert(visible(w).length > count);
      for (let i = 0; i < visible(w).length; i++) key(w, 'j');
      assert.equal(w.document.querySelector('.xp-current'), visible(w).at(-1));
      assert.equal(w.document.querySelectorAll('.xp-current').length, 1);
    } finally { dom.window.close(); }
  }
});

test('repeated toolbox intent preserves focused controls, selection and collapsed groups without scanning or rebuilding', async () => {
  const dom = await boot({ saved: ['fixture-0', 'fixture-65'] });
  try {
    const w = dom.window;
    w.mpToolbox.open();
    await w.mpToolbox.ready();
    const host = w.document.getElementById('toolboxContent');
    const details = host.querySelector('details');
    details.open = false;
    details.dispatchEvent(new w.Event('toggle'));
    const input = host.querySelector('input');
    input.focus(); input.setSelectionRange(0, 5);
    let scans = 0, mutations = 0;
    const query = w.document.querySelectorAll.bind(w.document);
    w.document.querySelectorAll = selector => { if (selector === '[data-toolbox-add]') scans++; return query(selector); };
    const observer = new w.MutationObserver(records => { mutations += records.length; });
    observer.observe(host, { childList: true, subtree: true });
    for (let i = 0; i < 20; i++) await w.mpToolbox.ready();
    mutations += observer.takeRecords().length;
    observer.disconnect();
    assert.equal(mutations, 0);
    assert.equal(scans, 0);
    assert.equal(host.querySelector('input'), input);
    assert.equal(w.document.activeElement, input);
    assert.equal(input.selectionEnd, 5);
    assert.equal(details.open, false);
    w.mpToolbox.add('fixture-1');
    assert.equal(scans, 1, 'one saved-state paint per mutation, not a second explorer subscription');
    assert.equal(host.querySelector('details').open, false, 'a real rerender remembers collapsed groups');
    assert.equal(w.mpToolbox.has('fixture-1'), true);
    w.mpToolbox.replace(['fixture-2', 'fixture-3', 'fixture-4']);
    assert.equal(w.mpToolbox.has('fixture-1'), false, 'same-length replacement invalidates membership');
    assert.equal(w.mpToolbox.has('fixture-4'), true);
    assert.equal(w.mpToolbox.has({ toString: () => 'fixture-4' }), false, 'membership retains strict string semantics');
  } finally { dom.window.close(); }
});

test('lookup failure remains retryable and only a new lookup replaces raw slugs', async () => {
  const dom = await boot({ failOnce: true, saved: ['fixture-0'] });
  try {
    const w = dom.window, host = w.document.getElementById('toolboxContent');
    await w.mpToolbox.ready();
    assert(host.textContent.includes('fixture-0'));
    await w.mpToolbox.ready();
    assert(host.textContent.includes('Alpha Tool 000'));
    const input = host.querySelector('input');
    await w.mpToolbox.ready();
    assert.equal(host.querySelector('input'), input);
  } finally { dom.window.close(); }
});

test('cached membership and existing buttons follow cross-tab writes and back/forward restoration', async () => {
  const dom = await boot({ saved: ['fixture-0'] });
  try {
    const w = dom.window;
    assert(w.mpToolbox.has('fixture-0'));
    for (const event of [new w.StorageEvent('storage', { key: 'mp.toolbox.v1' }), new w.PageTransitionEvent('pageshow', { persisted: true })]) {
      w.localStorage.setItem('mp.toolbox.v1', JSON.stringify(['fixture-1']));
      w.dispatchEvent(event);
      assert.equal(w.mpToolbox.has('fixture-0'), false);
      assert.equal(w.mpToolbox.has('fixture-1'), true);
      assert.equal(w.document.querySelector('[data-toolbox-add="fixture-0"]').getAttribute('aria-pressed'), 'false');
      assert.equal(w.document.querySelector('[data-toolbox-add="fixture-1"]').getAttribute('aria-pressed'), 'true');
      w.mpToolbox.replace(['fixture-0']);
    }
  } finally { dom.window.close(); }
});


test('Enter opens plain served links too, not only JSON rows with launcher attributes', async () => {
  const dom = await boot();
  try {
    const w = dom.window;
    const link = visible(w)[0].querySelector('a[href]');
    link.removeAttribute('data-xp-open');
    link.target = '_blank';
    let opened;
    w.open = (...args) => { opened = args; };
    key(w, 'j');
    key(w, 'Enter');
    assert.deepEqual(opened, [link.href, '_blank', 'noopener']);
  } finally { dom.window.close(); }
});
