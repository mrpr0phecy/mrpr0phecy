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
  extract('matches'), extract('sorted'), extract('visible')].join('\n');
vm.runInContext(code + '\nthis.api = { esc, norm, matches, sorted, visible };', sandbox, { filename: 'explore-filters.js' });
const { esc, norm, matches, sorted, visible } = sandbox.api;

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
}

console.log('explore-list: filtering, sorting, escaping and the list contracts all hold');
