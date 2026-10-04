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

function rowsIn(html) {
  return Array.from(html.matchAll(/<li class="xp-row" data-slug="([^"]+)">/g), m => m[1]);
}

function mountCategory(slug) {
  const filename = path.join(CATEGORIES, `${slug}.html`);
  const dom = new JSDOM(fs.readFileSync(filename, 'utf8'), {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: `https://www.themostusefulsiteintheworld.com/categories/${slug}.html`,
  });
  dom.window.eval(EXPLORE);
  if (dom.window.document.readyState === 'loading') {
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  }
  return dom;
}

test('every generated category page ships its complete category list', () => {
  for (const category of CATALOGUE.categories) {
    const filename = path.join(CATEGORIES, `${category.slug}.html`);
    assert.ok(fs.existsSync(filename), `${category.slug} has a generated page`);
    const html = fs.readFileSync(filename, 'utf8');
    const expected = CATALOGUE.tools
      .filter(tool => tool.category === category.slug || tool.categoryName === category.name)
      .map(tool => tool.slug);
    assert.match(
      html,
      /<div data-explore="static" data-explore-reveal="all" id="explore"/,
      `${category.slug} opts out of the directory-only progressive reveal`,
    );
    assert.deepEqual(rowsIn(html), expected, `${category.slug} contains every expected tool exactly once`);
  }
});

test('the shared enhancer does not hide rows on a large category page', { skip: !JSDOM && 'jsdom is not installed (see AGENTS.md §2)' }, async () => {
  const slug = 'science-and-engineering';
  const dom = mountCategory(slug);
  try {
    await wait(25);
    const rows = Array.from(dom.window.document.querySelectorAll('#explore .xp-row[data-slug]'));
    const visible = rows.filter(row => !row.hidden);
    assert.ok(rows.length > 60, 'the fixture keeps a category larger than the old 60-row cap');
    assert.equal(visible.length, rows.length, 'all category rows remain visible after explore.js mounts');
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
