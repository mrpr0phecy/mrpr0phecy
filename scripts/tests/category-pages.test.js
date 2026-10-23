'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

let JSDOM;
try {
  ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom'));
} catch (_) {
  try { ({ JSDOM } = require('jsdom')); } catch (_) { JSDOM = null; }
}

const ROOT = path.join(__dirname, '..', '..');
const CATEGORIES = path.join(ROOT, 'categories');
const CATALOGUE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools-index.json'), 'utf8'));
const EXPLORE = fs.readFileSync(path.join(ROOT, 'explore.js'), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
function sortTitle(raw) {
  const s = String(raw || '');
  return s.replace(/^[^\p{L}\p{N}]+/u, '') || s;
}

function rowsIn(html) {
  return Array.from(html.matchAll(/<li class="xp-row" data-slug="([^"]+)">/g), m => m[1]);
}

function mountCategory(slug, beforeEval) {
  const filename = path.join(CATEGORIES, `${slug}.html`);
  const dom = new JSDOM(fs.readFileSync(filename, 'utf8'), {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: `https://www.themostusefulsiteintheworld.com/categories/${slug}.html`,
  });
  if (beforeEval) beforeEval(dom.window);
  dom.window.eval(EXPLORE);
  if (dom.window.document.readyState === 'loading') {
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  }
  return dom;
}

test('every generated category page ships its complete category list pre-sorted A–Z with unblocked <head>', () => {
  for (const category of CATALOGUE.categories) {
    const filename = path.join(CATEGORIES, `${category.slug}.html`);
    assert.ok(fs.existsSync(filename), `${category.slug} has a generated page`);
    const html = fs.readFileSync(filename, 'utf8');
    const expected = CATALOGUE.tools
      .filter(tool => tool.category === category.slug || tool.categoryName === category.name)
      .slice()
      .sort((a, b) => COLLATOR.compare(sortTitle(a.title), sortTitle(b.title)) || a.slug.localeCompare(b.slug))
      .map(tool => tool.slug);
    assert.match(
      html,
      /<div data-explore="static" data-explore-reveal="all" id="explore"/,
      `${category.slug} opts out of the directory-only progressive reveal`,
    );
    const headEnd = html.indexOf('</head>');
    const cssPos = html.indexOf('explore.css?v=');
    const specPos = html.indexOf('<script type="speculationrules">');
    const ldPos = html.indexOf('application/ld+json');
    assert.ok(cssPos > 0 && cssPos < headEnd, `${category.slug} links explore.css inside <head>`);
    assert.ok(specPos > cssPos && specPos < headEnd, `${category.slug} ships conservative speculationrules after critical styles in <head>`);
    assert.ok(ldPos > headEnd, `${category.slug} defers bulky JSON-LD past <head> so CSS/JS start in the first packet`);
    assert.deepEqual(rowsIn(html), expected, `${category.slug} contains every expected tool pre-sorted A–Z`);
  }
});

test('the shared enhancer does not hide or re-append pre-sorted rows on a large category page', { skip: !JSDOM && 'jsdom is not installed (see AGENTS.md §2)' }, async () => {
  const slug = 'science-and-engineering';
  let listChildMoves = 0;
  const dom = mountCategory(slug, win => {
    const ul = win.document.querySelector('#explore .xp-list');
    const observer = new win.MutationObserver(records => {
      for (const r of records) {
        if (r.target === ul && r.type === 'childList') listChildMoves += r.addedNodes.length;
      }
    });
    observer.observe(ul, { childList: true });
  });
  try {
    await wait(25);
    const rows = Array.from(dom.window.document.querySelectorAll('#explore .xp-row[data-slug]'));
    const visible = rows.filter(row => !row.hidden);
    assert.ok(rows.length > 60, 'the fixture keeps a category larger than the old 60-row cap');
    assert.equal(visible.length, rows.length, 'all category rows remain visible after explore.js mounts');
    assert.equal(listChildMoves, 0, 'pre-sorted category rows are never detached and re-appended on mount');
    assert.equal(dom.window.mpExplore.state.revealAll, true, 'the page selects the complete-list mode');
    assert.equal(dom.window.document.querySelector('[data-xp-more]').hidden, true, 'there is no misleading pagination control');
  } finally {
    dom.window.close();
  }
});

// Keep this contract close to the fixture check: the generated attribute is
// only useful if the shared engine honours it after a query or a sort too.
test('full category mode survives filtering and sorting', { skip: !JSDOM && 'jsdom is not installed (see AGENTS.md §2)' }, async () => {
  const dom = mountCategory('finance-and-money');
  try {
    await wait(25);
    const input = dom.window.document.querySelector('#xp-input');
    input.value = 'finance';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await wait(120);
    const matches = Array.from(dom.window.document.querySelectorAll('#explore .xp-row:not([hidden])'));
    assert.ok(matches.length > 60, 'a query with more than 60 category matches is not truncated');

    const sort = dom.window.document.querySelector('#xp-sort');
    sort.value = 'za';
    sort.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(dom.window.mpExplore.state.shown, Infinity, 'sorting does not restore the directory cap');
  } finally {
    dom.window.close();
  }
});

console.log(`category-pages: ${CATALOGUE.categories.length} generated category lists checked`);
