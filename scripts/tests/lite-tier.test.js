// Tests the REAL two-tier catalogue pipeline out of home-app.js: the home
// page builds its grid from cards/cards-lite.json (name/title/category, the
// critical path) and merges descriptions from cards/cards.json in the
// background (enrichCatalogueDescriptions). Drives the shipped source with a
// stubbed fetch over the real JSON artifacts, so a change that breaks the
// lite/full handoff breaks this test. Run with:
//
//   node scripts/tests/lite-tier.test.js
//
// Zero dependencies (node only). No browser required.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'home-app.js');
const src = fs.readFileSync(APP, 'utf8');
const files = {
  'cards/cards-lite.json': fs.readFileSync(path.join(ROOT, 'cards', 'cards-lite.json'), 'utf8'),
  'cards/cards.json': fs.readFileSync(path.join(ROOT, 'cards', 'cards.json'), 'utf8'),
};

let fetchCount = {};
const sandbox = {
  console,
  window: {},
  CONFIG: { FETCH_TIMEOUT: 15000 },
  cardsMetaMap: new Map(),
  currentSearchQuery: '',
  applyFilters: () => { sandbox.filtersRan++; },
  setTimeout, clearTimeout, AbortController,
  fetch(url) {
    fetchCount[url] = (fetchCount[url] || 0) + 1;
    const body = files[url];
    if (body === undefined) return Promise.reject(new Error('404 ' + url));
    return Promise.resolve({ ok: true, text: () => Promise.resolve(body) });
  },
};
sandbox.filtersRan = 0;
vm.createContext(sandbox);

const grab = name => {
  const m = src.match(new RegExp(`(async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n`));
  assert(m, `could not extract ${name}() from home-app.js`);
  return m[0];
};
const grabConst = name => {
  const m = src.match(new RegExp(`const ${name} = [^;]+;`));
  assert(m, `could not extract const ${name} from home-app.js`);
  return m[0];
};
vm.runInContext(
  [
    grabConst('FASTPATH_CATALOGUE_TIMEOUT'),
    grabConst('CATALOGUE_FETCH_TIMEOUT'),
    grab('withTimeout'),
    grab('fetchTextWithTimeout'),
    grab('takePrefetchedCatalogue'),
    grab('takePrefetchedFullCatalogue'),
    grab('readCatalogueJson'),
    grab('readFullCatalogueJson'),
    'let descriptionsEnriched = false;\n'
    // the merge also refreshes card faces (a DOM concern this sandbox does
    // not model); stubbed so the catalogue semantics stay the thing under test
    + 'const refreshCardFaceDescriptions = () => {};\n'
    + grab('enrichCatalogueDescriptions'),
  ].join('\n'),
  sandbox, { filename: 'home-app.js(extracted)' });
const tick = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---------------------------------------------------------------- suite 1
  // The lite tier is the critical path: it must parse, carry exactly the
  // grid's fields, and match the full catalogue 1:1 (same generator).
  const lite = await vm.runInContext('readCatalogueJson()', sandbox);
  assert(Array.isArray(lite) && lite.length > 0, 'lite tier must be a non-empty array');
  assert.deepStrictEqual(Object.keys(lite[0]).sort(), ['c', 'n', 't'],
    'lite entries must be {n, t, c} only — anything else is bytes back on the critical path');
  assert.strictEqual(fetchCount['cards/cards-lite.json'], 1, 'lite fetched exactly once');
  const full = JSON.parse(files['cards/cards.json']);
  assert.strictEqual(lite.length, full.length, 'lite/full entry counts must agree');
  const byName = new Map(full.map(c => [c.name, c]));
  for (const e of lite) {
    const f = byName.get(e.n);
    assert(f, `lite has no full-tier counterpart: ${e.n}`);
    assert.strictEqual(f.title, e.t, `title drift for ${e.n}`);
    assert.strictEqual(f.category, e.c, `category drift for ${e.n}`);
  }
  console.log(`  ok   lite tier parses (${lite.length} entries) and matches the full catalogue 1:1`);

  // ---------------------------------------------------------------- suite 2
  // loadCardList's mapping: lite entries become meta objects with NO
  // description until the full tier settles.
  sandbox.__lite = lite;
  vm.runInContext(
    '__lite.forEach(item => cardsMetaMap.set(item.n, { name: item.n, title: item.t, category: item.c }));',
    sandbox);
  const meta = sandbox.cardsMetaMap.get('mortgage');
  assert(meta && meta.title && meta.category, 'lite meta must carry title + category');
  assert.strictEqual(meta.description, undefined, 'lite meta must not carry a description yet');
  console.log('  ok   lite meta shape: name/title/category, no description');

  // ---------------------------------------------------------------- suite 3
  // Enrichment: no active search — descriptions merge, nothing re-filters,
  // the full tier is downloaded exactly once.
  await vm.runInContext('enrichCatalogueDescriptions()', sandbox);
  await tick(50);
  const mortgageMeta = sandbox.cardsMetaMap.get('mortgage');
  assert(mortgageMeta.description && mortgageMeta.description.length > 20,
    'descriptions must be merged into the meta map');
  assert.strictEqual(sandbox.filtersRan, 0, 'no re-filter without an active search');
  assert.strictEqual(fetchCount['cards/cards.json'], 1, 'full tier fetched exactly once');
  console.log('  ok   enrichment merges all descriptions, no filter churn');

  // ---------------------------------------------------------------- suite 4
  // Enrichment is idempotent — a second call must not re-download.
  await vm.runInContext('enrichCatalogueDescriptions()', sandbox);
  await tick(20);
  assert.strictEqual(fetchCount['cards/cards.json'], 1, 'no second full fetch');
  console.log('  ok   enrichment is idempotent');

  // ---------------------------------------------------------------- suite 5
  // An active search ran against the title-only index — when descriptions
  // arrive, the filter must re-run so results upgrade in place.
  vm.runInContext(`
    currentSearchQuery = 'amortisation';
    descriptionsEnriched = false;
    for (const m of cardsMetaMap.values()) m.description = undefined;
  `, sandbox);
  fetchCount = {};
  await vm.runInContext('enrichCatalogueDescriptions()', sandbox);
  await tick(50);
  assert.strictEqual(sandbox.filtersRan, 1, 'active search must re-run when descriptions arrive');
  console.log('  ok   active search upgrades in place when descriptions arrive');

  // ---------------------------------------------------------------- suite 6
  // Grid built from the full tier (fallback path): descriptions already
  // present, so enrichment must NOT re-download the same file.
  vm.runInContext(`
    descriptionsEnriched = false;
    for (const m of cardsMetaMap.values()) m.description = 'already full';
  `, sandbox);
  fetchCount = {};
  await vm.runInContext('enrichCatalogueDescriptions()', sandbox);
  await tick(20);
  assert.strictEqual(fetchCount['cards/cards.json'] || 0, 0,
    'full-tier-as-source path must not double-download the catalogue');
  console.log('  ok   full-tier-as-source path does not double-download');

  // ---------------------------------------------------------------- suite 7
  // REGRESSION: a stalled head-bootstrap catalogue response (a fetch that
  // never settles — service-worker black hole, blocked request) used to hang
  // readCatalogueJson() forever with no fallback, which froze the home grid
  // at the pre-rendered first screen ("only the first few tools load") with
  // no error and no retry. The bootstrap promise is now raced against
  // FASTPATH_CATALOGUE_TIMEOUT; the direct fetch must win afterwards.
  {
    fetchCount = {};
    sandbox.window.__mpFastPath = { json: new Promise(() => {}), full: null, cards: new Map() };
    const t0 = Date.now();
    const recovered = await vm.runInContext('readCatalogueJson()', sandbox);
    const elapsed = Date.now() - t0;
    assert(Array.isArray(recovered) && recovered.length > 0,
      'a stalled bootstrap fetch must fall through to the direct fetch, not hang');
    assert(elapsed >= 4500 && elapsed < 9000,
      `stalled bootstrap must be abandoned via the timeout race (took ${elapsed}ms)`);
    assert.strictEqual(fetchCount['cards/cards-lite.json'], 1,
      'the direct fetch fires exactly once after the race');
    console.log(`  ok   stalled bootstrap fetch is raced (${elapsed}ms) and the grid still builds`);
  }

  // ---------------------------------------------------------------- suite 8
  // The retry pass calls readCatalogueJson(true): the fast path is skipped
  // entirely, so even a still-stalled bootstrap promise cannot delay it.
  {
    fetchCount = {};
    sandbox.window.__mpFastPath = { json: new Promise(() => {}), full: null, cards: new Map() };
    const t0 = Date.now();
    const direct = await vm.runInContext('readCatalogueJson(true)', sandbox);
    const elapsed = Date.now() - t0;
    assert(Array.isArray(direct) && direct.length > 0, 'bypass path must fetch and parse');
    assert(elapsed < 1000, `bypass must not wait on the fast path (took ${elapsed}ms)`);
    console.log('  ok   bypass path ignores the fast path entirely');
    delete sandbox.window.__mpFastPath;
  }

  // ---------------------------------------------------------------- suite 9
  // A bootstrap response that REJECTS (network error) falls through too.
  {
    fetchCount = {};
    sandbox.window.__mpFastPath = { json: Promise.reject(new Error('network dead')), full: null, cards: new Map() };
    const rejected = await vm.runInContext('readCatalogueJson()', sandbox);
    assert(Array.isArray(rejected) && rejected.length > 0, 'rejected bootstrap must fall through to the direct fetch');
    assert.strictEqual(fetchCount['cards/cards-lite.json'], 1, 'exactly one direct fetch after rejection');
    console.log('  ok   rejected bootstrap fetch falls through cleanly');
  }

  console.log('\nlite-tier tests passed');
})().catch(err => { console.error(err); process.exit(1); });
