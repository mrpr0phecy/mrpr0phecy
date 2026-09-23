// The home page does not run tools. This test is what keeps that true.
//
// On 2026-09-21 the home page stopped mounting the catalogue: the live grid
// (home-app.js + home-features.js, ~235 KB, plus a <head> bootstrap that
// started two catalogue fetches and six card-fragment fetches during parse) was
// removed, because a page that runs 1,205 tools has 1,205 ways to look broken —
// half-drawn cards, clicks that land before the listener exists, memory
// pressure on a phone — and every one of those reports costs a visitor.
//
// A decision like that regrows one convenient shortcut at a time: "just mount
// the card here", "the list would be nicer with a preview". So the rules are
// pinned as a test rather than left to memory:
//
//   1. index.html fetches no card fragment and no cards.json
//   2. index.html mounts no card shell, has no #dashboard, no maximise modal
//      and no directory view
//   3. the list layer is what it loads: explore.css / explore.js / toolbox.js
//      plus its own small script
//   4. every asset it loads is versioned and exists in the repository
//   5. the removed files stay removed
//
// Run with: node scripts/tests/no-live-tools.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const index = read('index.html');

// ---- 1. no catalogue fetches, no card fragments -----------------------------
assert.ok(!/cards\/cards(?:-lite)?\.json/.test(index),
  'index.html must not fetch the catalogue: the list reads tools-index.json only when the visitor scrolls to it');
assert.ok(!/cards\/['"]\s*\+/.test(index),
  'index.html must not build a path to a card fragment');
assert.ok(!/fetch\(['"]cards\//.test(index),
  'index.html must not request a card fragment during parse');
assert.ok(!/HOME-FAST-PATH|EARLY-CLICKS/.test(index),
  'the first-screen bootstrap and the early-click queue existed only to serve the live grid');
assert.ok(!/cards-lite\.json/.test(index),
  'the lite catalogue tier was the grid shells\' data source — the list does not need it');

// ---- 2. no mounting surfaces ------------------------------------------------
for (const id of ['dashboard', 'standaloneModal', 'directoryView', 'directoryGrid',
                  'noResultsState', 'categoryBar', 'catalogSortSelect', 'gridModeBtn']) {
  assert.ok(!index.includes(`id="${id}"`),
    `index.html still ships #${id} — a surface for running tools inside the home page`);
}
assert.ok(!/class="card-grid"/.test(index), 'the featured/trending sections must be lists, not card grids');
assert.ok(!/data-name="/.test(index), 'a data-name attribute means a card the loader would build');
assert.ok(!/HOME-PRERENDER/.test(index), 'the pre-rendered card shells belonged to the grid');

// ---- 3. the list layer is what the page loads -------------------------------
for (const asset of ['explore.css', 'explore.js', 'toolbox.js', 'home-core.js']) {
  assert.ok(index.includes(asset), `index.html must load ${asset}`);
}
assert.ok(!/home-app\.js|home-features\.js|discovery-app\.js/.test(index),
  'the grid scripts and the old discovery module are gone; the list layer replaced both');
assert.ok(index.includes('data-explore="json"'),
  'the catalogue list must be marked for the list engine');
assert.ok(index.includes('popovertarget="toolbox"') && index.includes('id="toolbox"'),
  'the toolbox panel and its opener are still wired by native popovers');

// ---- 4. versioned, present, and the same version as the worker --------------
const sw = read('sw.js');
const cacheVersion = (sw.match(/CACHE_VERSION\s*=\s*'v(\d+)-/) || [])[1];
assert.ok(cacheVersion, 'sw.js must declare CACHE_VERSION as vN-date');
for (const asset of ['explore.css', 'explore.js', 'toolbox.js', 'home-core.js',
                     'home.css', 'home-deferred.css', 'risk-notices.js']) {
  assert.ok(index.includes(`${asset}?v=${cacheVersion}`),
    `${asset} must be loaded with ?v=${cacheVersion} — an unversioned asset is served from another deploy's cache`);
  assert.ok(fs.existsSync(path.join(ROOT, asset)), `${asset} is linked but not in the repository`);
}
assert.ok(sw.includes(`/explore.css`) && sw.includes(`/toolbox.js`),
  'sw.js must precache the list layer, or a returning visitor gets a 503 for it');

// ---- 5. what was removed stays removed --------------------------------------
for (const gone of ['home-app.js', 'home-features.js', 'discovery-app.js']) {
  assert.ok(!fs.existsSync(path.join(ROOT, gone)),
    `${gone} was deleted with the live grid; if it is back, so is the overhead it carried`);
}

// ---- the list layer is real, not a stub --------------------------------------
for (const file of ['explore.js', 'toolbox.js', 'home-core.js']) {
  const src = read(file);
  assert.ok(src.length > 4000, `${file} looks like a stub`);
  assert.ok(!/\bfetch\(\s*['"]https?:/.test(src), `${file} must not fetch anything off-site`);
}

console.log('no-live-tools: the home page lists tools and does not run them');
console.log('  checked: no catalogue fetch, no card shells, list layer loaded and versioned, removed files stay gone');
