// The JSON-mode renderer, driven for real in jsdom.
//
// explore.js's home-page mode is the one place rows are *built* from data,
// and since 2026-09-25 a keystroke no longer rebuilds the list: paintRows
// keeps row nodes keyed by slug, inserts what arrived, removes what left and
// re-orders what stayed — falling back to a full innerHTML build when the
// diff is bigger than half the window. A bug there is silent (rows in the
// wrong order, nodes lost, a selection that points at nothing), so this test
// mounts the SHIPPED explore.js in a jsdom document with a stubbed fetch and
// drives it through the public API exactly like the home page does:
//
//   1. first render: 60 rows, A–Z, correct count
//   2. a small sort diff: one row moves to the top — the other 59 nodes must
//      be the SAME DOM elements (reused, not rebuilt), with updated indices
//   3. a large sort diff (full reversal): a rebuild is allowed, order must be
//      right
//   4. a query that shrinks the window, repeated: the second call is a no-op
//   5. clear, then "Show more": the append reuses every existing node
//   6. an empty result: the empty state replaces the rows
//
// Run with: node scripts/tests/explore-render.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (e) {
  try { ({ JSDOM } = require('jsdom')); }
  catch (e2) {
    console.log('NOTE jsdom is not installed, so the render half was skipped for ' +
      '(mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom)');
    process.exit(0);
  }
}

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'explore.js'), 'utf8');

/* ---------------------------------------------------------------- fixture -- */
// 150 tools. Numeric-padded titles sort A–Z as 000, 001, … 149. Tool 010
// alone carries a high popularity, so "Most used" is the A–Z window with
// exactly one row moved to the front — the minimal non-trivial diff.
const N = 150;
const tools = [];
for (let i = 0; i < N; i++) {
  tools.push({
    slug: 'tool-' + String(i).padStart(3, '0'),
    title: 'Tool ' + String(i).padStart(3, '0'),
    description: 'Description number ' + i,
    category: 'base',
    categoryName: 'Base',
    tags: [],
    popularity: i === 10 ? 2000 : 1000 - i,
    featured: false,
    updated: '2026-09-19',
    url: 'tool.html?card=tool-' + String(i).padStart(3, '0')
  });
}
const CATALOGUE = { version: 'test', count: N, categories: [{ slug: 'base', name: 'Base', count: N }], tools };

/* ----------------------------------------------------------------- mount --- */
const dom = new JSDOM(
  '<!doctype html><html><head><title>render test</title></head><body>' +
  '<input id="tool-search">' +
  '<section id="all-tools-section" data-xp-browse>' +
  '<div id="all-tools" data-explore="json"></div>' +
  '</section></body></html>',
  { url: 'https://example.test/', pretendToBeVisual: true, runScripts: 'dangerously' }
);
const { window } = dom;
const { document } = window;

// The idle kick must be deterministic, and the fetch must answer with the
// fixture. Both are set before explore.js runs, because mount() captures
// window.requestIdleCallback at that moment.
window.requestIdleCallback = (fn) => setTimeout(fn, 1);
window.fetch = (url) => {
  assert.strictEqual(url, 'tools-index.json', 'the list reads tools-index.json only');
  return Promise.resolve({ ok: true, json: () => Promise.resolve(CATALOGUE) });
};

window.eval(SOURCE);
assert.ok(window.mpExplore, 'explore.js published window.mpExplore');

const slugs = () => Array.prototype.map.call(
  document.querySelectorAll('#all-tools ul.xp-list .xp-row[data-slug]'),
  (n) => n.getAttribute('data-slug'));
const node = (slug) => document.querySelector('#all-tools ul.xp-list .xp-row[data-slug="' + slug + '"]');

function waitFor(fn, ms, what) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      let v;
      try { v = fn(); } catch (e) { v = false; }
      if (v) { clearInterval(iv); resolve(v); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error('timed out waiting for ' + what)); }
    }, 5);
  });
}

(async () => {
  /* 1 — first render ------------------------------------------------------- */
  await waitFor(() => document.querySelectorAll('#all-tools ul.xp-list .xp-row[data-slug]').length, 5000,
    'the first render');
  let got = slugs();
  assert.strictEqual(got.length, 60, 'the first window is 60 rows');
  assert.deepStrictEqual(got.slice(0, 5), ['tool-000', 'tool-001', 'tool-002', 'tool-003', 'tool-004'],
    'A–Z with numeric collation, not "Tool 010" before "Tool 002"');
  assert.strictEqual(got[59], 'tool-059');
  const count = document.getElementById('xp-count');
  assert.ok(count && count.textContent.includes('150'), 'the count says 150 tools');

  /* 2 — a one-row sort diff: 59 nodes must survive ------------------------- */
  const ref5 = node('tool-005');
  const ref10 = node('tool-010');
  const sort = document.getElementById('xp-sort');
  assert.ok(sort, 'the toolbar exposes the sort control');
  sort.value = 'popular';
  sort.dispatchEvent(new window.Event('change', { bubbles: true }));
  got = slugs();
  assert.strictEqual(got[0], 'tool-010', 'the high-popularity tool comes first under "Most used"');
  assert.deepStrictEqual(got.slice(1, 6), ['tool-000', 'tool-001', 'tool-002', 'tool-003', 'tool-004'],
    'the rest of the window is unchanged');
  assert.strictEqual(got.length, 60);
  assert.strictEqual(node('tool-005'), ref5, 'an unchanged row keeps its DOM node');
  assert.strictEqual(node('tool-010'), ref10, 'the moved row keeps its DOM node');
  assert.strictEqual(ref5.getAttribute('data-index'), '6', 'indices follow the new position');
  assert.strictEqual(ref10.getAttribute('data-index'), '0');

  /* 3 — a full reversal: rebuild allowed, order mandatory ------------------ */
  sort.value = 'za';
  sort.dispatchEvent(new window.Event('change', { bubbles: true }));
  got = slugs();
  assert.strictEqual(got[0], 'tool-149', 'Z–A opens with the last tool');
  assert.strictEqual(got[59], 'tool-090');
  assert.strictEqual(got.length, 60);

  /* 4 — a shrinking query, twice: the second call must be a no-op ---------- */
  // "tool-00" is a slug prefix of exactly the ten tool-00x tools (the
  // sort is still Z–A from the last step, so they open with tool-009).
  window.mpExplore.filter('tool-00');
  got = slugs();
  assert.deepStrictEqual(got, ['tool-009', 'tool-008', 'tool-007', 'tool-006', 'tool-005',
    'tool-004', 'tool-003', 'tool-002', 'tool-001', 'tool-000'], 'the query narrows to 10 rows');
  const ten = Array.from(document.querySelectorAll('#all-tools ul.xp-list .xp-row[data-slug]'));
  window.mpExplore.filter('tool-00');
  const tenAgain = Array.from(document.querySelectorAll('#all-tools ul.xp-list .xp-row[data-slug]'));
  assert.strictEqual(tenAgain.length, 10);
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(tenAgain[i], ten[i], 'an unchanged re-render touches no node');
  }

  /* 5 — clear, then Show more: the append reuses everything ---------------- */
  // clear() resets query and category but keeps the sort (a visitor who
  // picked Z–A still wants Z–A when the filter goes away).
  window.mpExplore.clear();
  got = slugs();
  assert.strictEqual(got.length, 60, 'clear restores the full window');
  assert.strictEqual(got[0], 'tool-149', 'the Z–A sort survives the clear');
  const refClear5 = node('tool-005');
  const more = document.querySelector('[data-xp-more]');
  assert.ok(more && !more.hidden, 'Show more is offered');
  more.click();
  got = slugs();
  assert.strictEqual(got.length, 120, 'the window extends to 120');
  assert.strictEqual(got[119], 'tool-030');
  assert.strictEqual(node('tool-005'), refClear5, 'an appended page keeps the earlier nodes');
  assert.ok(node('tool-100'), 'the newly appended rows exist');

  /* 6 — an empty result ----------------------------------------------------- */
  window.mpExplore.filter('zzzqqq');
  assert.strictEqual(slugs().length, 0, 'no rows for a query nothing matches');
  assert.ok(document.querySelector('#all-tools ul.xp-list .xp-empty'), 'the empty state explains itself');
  window.mpExplore.clear();
  got = slugs();
  assert.strictEqual(got.length, 60, 'and clearing brings them back');
  assert.strictEqual(got[0], 'tool-149', '…in the sort the visitor chose');

  window.close();
  console.log('explore-render: first render, node reuse, the rebuild fallback,');
  console.log('  append, the empty state and the no-op all hold in jsdom');
})().catch((e) => {
  console.error(e && e.message);
  process.exit(1);
});
