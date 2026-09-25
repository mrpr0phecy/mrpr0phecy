// The list engine: the one component every list page on the site now uses.
//
// Two kinds of check, and the header says which is which because the
// difference matters when one of them fails:
//
//   DRIVEN  — the real matching and sorting functions are pulled out of the
//             shipped explore.js by name and run against fixture rows. If the
//             filter starts matching differently, this fails.
//   PINNED  — the contract the rest of the site depends on (the row markup the
//             generators write, the keyboard map, the per-page reveal, the
//             single results surface) is asserted against the file text. These
//             are the rules a future edit is most likely to break silently.
//
// Why a multi-word query is the interesting case: with substring matching,
// "truck weight" returns every trucking tool plus every weight tool, and a
// visitor concludes the search is broken. Every word has to match.
//
// Run with: node scripts/tests/explore-list.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'explore.js'), 'utf8');

/* ------------------------------------------------ pull real functions out --- */
function extract(name) {
  const start = SOURCE.indexOf(`function ${name}(`);
  assert(start !== -1, `${name} is not in explore.js any more`);
  let depth = 0, i = SOURCE.indexOf('{', start), end = -1;
  for (; i < SOURCE.length; i++) {
    if (SOURCE[i] === '{') depth++;
    else if (SOURCE[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert(end !== -1, `${name} does not close`);
  return SOURCE.slice(start, end);
}

const state = { q: '', cat: '', sort: 'az', shown: 60, rows: [] };
const sandbox = {
  state,
  // explore.js keeps these at module scope; the extracted functions read and
  // write them exactly as they do in the page.
  sortOrders: {},
  lastVisible: null,
  console,
  localStorage: { getItem: () => null, setItem: () => {} },
  Date,
  String,
  Number,
  Math,
  Object,
  Array,
  RegExp
};
sandbox.window = sandbox;
vm.createContext(sandbox);
const code = [extract('esc'), extract('norm'), extract('sortTitle'), extract('byTitle'),
  extract('haystack'), extract('matches'), extract('comparatorFor'), extract('ordered'),
  extract('visible')].join('\n');
vm.runInContext(code + '\nthis.api = { esc, norm, haystack, matches, ordered, visible };', sandbox, { filename: 'explore-filters.js' });
const { esc, norm, haystack, matches, ordered, visible } = sandbox.api;

/* ---------------------------------------------------------------- fixtures -- */
const rows = [
  { slug: 'truck-axle-weight-bridge-formula', title: '⚖️ Axle Weight & Bridge Formula Checker', desc: 'Type in the scale ticket, check the bridge formula and slide the tandems.', catName: 'Trucking & Freight', tags: ['truck', 'weight', 'axle'], pop: 800, updated: '2026-09-21' },
  { slug: 'bmi', title: 'BMI Calculator', desc: 'Body mass index from height and weight.', catName: 'Health & Fitness', tags: ['health', 'weight'], pop: 9900, updated: '2026-08-01' },
  { slug: 'mortgage', title: 'Mortgage Calculator', desc: 'Monthly payments, interest and term.', catName: 'Finance & Money', tags: ['loan', 'interest'], pop: 9700, updated: '2026-09-01' },
  { slug: 'alcohol', title: 'Alcohol & ABV Calculator', desc: 'Dilution and proof for home distilling.', catName: 'Culinary & Food Science', tags: ['drink'], pop: 500, updated: '2026-07-15' }
];
state.rows = rows;

/* ------------------------------------------------- 1. DRIVEN: how it filters */
{
  // Case-insensitive, and a single word can match anywhere — title, text, tag
  // or slug. A visitor who types "abv" means the tool whose slug is "alcohol"
  // and whose title is "Alcohol & ABV Calculator".
  assert.strictEqual(visible().length, 4, 'an empty query shows everything');
  state.q = 'TANDEMS';
  assert.strictEqual(visible().length, 1, 'matching is case-insensitive and reaches the description');
  state.q = 'truck';
  assert.strictEqual(visible().length, 1, 'a tag matches');
  state.q = 'weight';
  assert.strictEqual(visible().length, 2, '"weight" appears in two tools');

  // The multi-word rule: every word must appear somewhere in the tool.
  state.q = 'truck weight';
  assert.strictEqual(visible().length, 1, '"truck weight" narrows to the tool that has both');
  state.q = 'weight truck';
  assert.strictEqual(visible().length, 1, 'word order does not matter');
  state.q = 'truck mortgage';
  assert.strictEqual(visible().length, 0, 'a query with no single tool matching every word returns nothing');

  // Whitespace and punctuation must not produce a phantom empty word that
  // matches nothing (the classic "why did my search stop working" bug).
  state.q = '  truck   weight  ';
  assert.strictEqual(visible().length, 1, 'extra whitespace is ignored');
  state.q = '';
}

/* ---------------------------------------------- 2. DRIVEN: category + sort */
{
  state.q = '';
  state.cat = 'Finance & Money';
  assert.strictEqual(visible().length, 1, 'a category filter narrows the list');
  state.cat = '';
  assert.strictEqual(visible().length, 4);

  state.sort = 'az';
  // A–Z sorts by title with the decorative emoji ignored: "⚖️ Axle Weight…"
  // files under A (after "Alcohol"), not under the emoji block.
  assert.deepStrictEqual(
    Array.from(visible(), r => r.slug),
    ['alcohol', 'truck-axle-weight-bridge-formula', 'bmi', 'mortgage'],
    'A–Z sorts by title, not by slug, and ignores a leading emoji');
  state.sort = 'za';
  assert.strictEqual(visible()[0].slug, 'mortgage', 'Z–A reverses it');
  state.sort = 'popular';
  assert.strictEqual(visible()[0].slug, 'bmi', 'most-used comes from the popularity figure');
  state.sort = 'newest';
  assert.strictEqual(visible()[0].slug, 'truck-axle-weight-bridge-formula', 'recently updated first');
  state.sort = 'az';

  // Sorting never mutates the source list: two sorts in a row give the same
  // answer, and 'az' twice is stable.
  const before = rows.map(r => r.slug);
  state.sort = 'za'; visible(); state.sort = 'az'; visible();
  assert.deepStrictEqual(rows.map(r => r.slug), before, 'the fixture list is left alone');
}

/* --------------------------- 2b. DRIVEN: the optimised pipeline ---------- */
// The 2026-09-25 pass moved three costs off the keystroke: the sort (now one
// full pass per mode, cached in sortOrders), the word split (now once per
// query) and the haystack (now built lazily per row). Each of those is a
// re-implementation of the old behaviour, so each is driven here against the
// same fixtures the old code is still asserted on above.
{
  state.q = '';
  state.cat = '';

  // matches() now takes the pre-split words. A partial word still fails:
  // "truck weight" is not satisfied by a row that has only "truck".
  const truckRow = rows.find(r => r.slug === 'truck-axle-weight-bridge-formula');

  // rowFromTool() rows ship without _hay, exactly like this fresh one:
  // built on first use, kept afterwards. (The fixture rows above were
  // already warmed by the filter tests, so the laziness needs a row that
  // has never been matched.)
  const freshRow = { slug: 'zebra-fresh-tool', title: 'Fresh Tool', desc: 'something unique-zebra',
    catName: 'A Category', tags: [], pop: 0, updated: '', featured: false,
    url: 'tool.html?card=zebra-fresh-tool', cat: 'a-category', _hay: undefined };
  assert.strictEqual(freshRow._hay, undefined, 'a fresh row has no haystack yet');
  assert.ok(haystack(freshRow).includes('unique-zebra'), 'the haystack reaches the description');
  assert.strictEqual(freshRow._hay, haystack(freshRow), 'a second read is the cached one');
  assert.ok(matches(freshRow, ['unique-zebra']), 'a fresh row matches from its lazily built haystack');

  assert.ok(!matches(truckRow, ['truck', 'bridge', 'moon']), 'a word the row lacks fails the match');
  assert.ok(matches(truckRow, ['weight', 'truck']), 'word order does not matter');
  // words arrive pre-lowercased from visible() (norm) — the contract matches
  // has always had.
  assert.ok(matches(rows.find(r => r.slug === 'bmi'), ['body']), 'the haystack is lowercased at build time');

  // The cached order must be equivalent to the old algorithm — sort the
  // filtered list with the same comparators — for every sort mode.
  const col = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const refTitle = (t) => String(t == null ? '' : t).replace(/^[^\p{L}\p{N}]+/u, '') || String(t == null ? '' : t);
  const refByTitle = (a, b, dir) => {
    const c = col.compare(refTitle(a), refTitle(b));
    return dir === 'za' ? -c : c;
  };
  const refHay = (r) => String(r.title + ' ' + r.desc + ' ' + r.catName + ' ' + r.tags.join(' ') + ' ' + r.slug).toLowerCase();
  const reference = (q, cat, sort) => {
    const words = q ? q.toLowerCase().split(/\s+/).filter(Boolean) : [];
    const filtered = rows.filter(r =>
      (!cat || r.catName === cat) &&
      words.every(w => refHay(r).includes(w)));
    const out = filtered.slice();
    if (sort === 'az') out.sort((a, b) => refByTitle(a.title, b.title));
    else if (sort === 'za') out.sort((a, b) => refByTitle(a.title, b.title, 'za'));
    else if (sort === 'popular') out.sort((a, b) => (b.pop - a.pop) || refByTitle(a.title, b.title));
    else if (sort === 'newest') out.sort((a, b) => String(b.updated).localeCompare(String(a.updated)) || refByTitle(a.title, b.title));
    else if (sort === 'category') out.sort((a, b) => (a.catName || '').localeCompare(b.catName || '') || refByTitle(a.title, b.title));
    return out.map(r => r.slug);
  };
  for (const [q, cat, sort] of [
    ['', '', 'az'], ['a', '', 'az'], ['truck weight', '', 'az'],
    ['weight', '', 'za'], ['tandem', '', 'popular'], ['', 'Finance & Money', 'newest'],
    ['e', '', 'category'], ['', '', 'popular'], ['weight', '', 'category']
  ]) {
    state.q = q; state.cat = cat; state.sort = sort;
    assert.deepStrictEqual(Array.from(visible(), r => r.slug), reference(q, cat, sort),
      `visible() matches the old algorithm for q="${q}" cat="${cat}" sort=${sort}`);
  }
  state.q = ''; state.cat = ''; state.sort = 'az';

  // The order cache must not leak between queries: filtering "a", then
  // clearing, then filtering again gives the same rows the first time did —
  // i.e. the second pass over a cached order is not a stale one.
  state.q = 'a';
  const firstA = Array.from(visible(), r => r.slug);
  state.q = 'tandem';
  visible();
  state.q = 'a';
  assert.deepStrictEqual(Array.from(visible(), r => r.slug), firstA, 're-filtering after another query reuses the order, not a stale answer');

  // A replaced catalogue invalidates the cache: swapping state.rows under the
  // same (q, cat, sort) must produce the NEW rows, not the memoised old ones.
  // finish() does sortOrders = {} / lastVisible = null; mimic that here.
  const saved = state.rows;
  state.rows = [rows[1]];
  sandbox.sortOrders = {};
  sandbox.lastVisible = null;
  assert.deepStrictEqual(Array.from(visible(), r => r.slug), ['bmi'], 'a reloaded catalogue is not answered from the old memo');
  state.rows = saved;
  sandbox.sortOrders = {};
  sandbox.lastVisible = null;
}

/* ----------------------------------------------------- 3. DRIVEN: escaping */
{
  assert.strictEqual(esc('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;', 'row text is escaped');
  assert.strictEqual(norm(null), '', 'a null description does not throw');
}

/* ---------------------------------------------------- 4. PINNED: contracts */
{
  // The row component generators must emit, and that the engine writes at
  // runtime. A generator that drifts from this produces rows the toolbar
  // cannot see (no data-slug) or the ＋ cannot attach to.
  assert(/class="xp-row/.test(SOURCE) && /data-slug=/.test(SOURCE),
    'the engine writes .xp-row elements with data-slug');
  assert(/data-toolbox-add/.test(SOURCE), 'rows carry the toolbox hook');
  assert(/data-xp-details/.test(SOURCE), 'rows carry a details toggle');

  // The keyboard map is part of the interface now: it is documented in the
  // toolbar hint and in the home page's hero tip.
  for (const [key, why] of [["'/'", 'focus the filter'], ["'j'", 'move down'], ["'k'", 'move up'],
                            ["'x'", 'toggle details'], ["'b'", 'add to the toolbox'],
                            ["'Enter'", 'open the highlighted row']]) {
    assert(SOURCE.includes(`e.key === ${key}`), `the keyboard map must keep ${key} (${why})`);
  }

  // One results surface: while a filter is on, the browse sections step aside.
  assert(/data-xp-browse/.test(SOURCE), 'the browse sections must be hidden during a search');
  assert(/function logSearch/.test(SOURCE) && /__mp_zero_searches/.test(SOURCE),
    'a search that returns nothing is still logged — it is the best "what to build next" signal there is');

  // Progressive reveal. A 1,205-row index must not be laid out for a visitor
  // who reads the first screen; the number is per group, which is why tools.html
  // shows 60 per category rather than 60 in total.
  assert(/var PAGE_SIZE = 60;/.test(SOURCE), 'the page size is 60');
  assert(/n < state\.shown/.test(SOURCE), 'static lists reveal only as far as the visitor has asked for');
  assert(/state\.shown \+= PAGE_SIZE/.test(SOURCE), 'and "show more" extends it');

  // URL state is what makes a filtered view shareable.
  assert(/URLSearchParams/.test(SOURCE) && /history\.replaceState/.test(SOURCE),
    'filters live in the URL, so a filtered list can be linked and reloaded');
  assert(/'cat'/.test(SOURCE) && /'sort'/.test(SOURCE), 'category and sort survive a reload too');

  // The catalogue fetch is bounded and recoverable. A stalled download once
  // wedged the home list on "Searching the catalogue…" with no timeout and no
  // retry — and the rejected promise stayed cached, so the list could never
  // appear without a reload. The fetch carries an abort window spanning
  // headers and body, a failed load re-arms instead of caching the failure,
  // and the empty state offers a retry next to the directory link.
  assert(/CATALOGUE_TIMEOUT_MS/.test(SOURCE) && /AbortController/.test(SOURCE),
    'the catalogue fetch must time out instead of hanging the list');
  assert(/data-xp-retry/.test(SOURCE),
    'a failed catalogue load must offer a retry next to the directory link');

  // The 2026-09-25 pass: each sort mode is sorted once and the order is
  // reused; a catalogue (re)load must clear that cache and the memoised
  // visible() answer, or a retry after a failed fetch answers a fresh
  // download with the previous catalogue's rows.
  assert(/var sortOrders = \{\};/.test(SOURCE), 'the sorted order is cached per mode');
  assert(/sortOrders = \{\};/.test(SOURCE), 'and the cache is cleared when the catalogue (re)loads');
  // The haystack is never built eagerly in rowFromTool — that was the heaviest
  // string work in finish() and the first render does not need it.
  const rowFn = SOURCE.split('function rowFromTool(')[1].split('\n  }')[0];
  assert(!/_hay\s*=/.test(rowFn), 'rowFromTool must not build the haystack');
  assert(/row\._hay === undefined/.test(SOURCE), 'the haystack is built lazily on first search');
  assert(/function warmHaystacks/.test(SOURCE) && /warmHaystacks\(\);/.test(SOURCE),
    'the haystacks are pre-warmed at idle after the first render');
}

console.log('explore-list: filtering, sorting, escaping and the list contracts all hold');
