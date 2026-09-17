// Drives the REAL deep-link parser shipped inside home-app.js (the externalised
// homepage application; index.html loads it with `defer`) — ?q= search
// pre-fill, ?expand= open-one-tool-inline — in a vm sandbox. Zero dependencies.
//
// Why this exists:
//   * llms.txt and agents.html advertise index.html?q=<query> and
//     index.html?expand=<slug> — both were documented but never implemented,
//     so every agent following the docs hit a dead end (the same class of bug
//     as the old embed=1 phantom, fixed on tool.html).
//   * ?expand= takes attacker-influenceable input (a shared link); the slug
//     must be charset-validated and used for map lookup only, never rendered.
//
// Run with: node scripts/tests/index-deeplink.test.js
'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const NL = String.fromCharCode(10);
const html = fs.readFileSync('home-app.js', 'utf8');
// Extract a top-level 4-space-indented function by its closing line.
// (Deliberately backslash-free: plain indexOf slicing, no regex escapes.)
const grab = name => {
  const start = html.indexOf('function ' + name + '(');
  assert(start !== -1, 'could not find ' + name + ' in home-app.js');
  const endMark = NL + '    }' + NL;
  const end = html.indexOf(endMark, start);
  assert(end !== -1, 'could not find end of ' + name + ' in home-app.js');
  return html.slice(start, end + endMark.length);
};

// ---- 1. parser vectors against the shipped function ------------------------
const ctx = vm.createContext({ URLSearchParams, console });
vm.runInContext(grab('parseIndexDeepLink'), ctx);
const parse = vm.runInContext('parseIndexDeepLink', ctx);

const cases = [
  ['?q=mortgage', { q: 'mortgage', expand: '' }],
  ['?expand=mortgage', { q: '', expand: 'mortgage' }],
  ['?q=BMI&expand=bmi', { q: 'BMI', expand: 'bmi' }],
  ['', { q: '', expand: '' }],
  ['?q=&expand=', { q: '', expand: '' }],
  ['?expand=MORTGAGE', { q: '', expand: 'mortgage' }],
  ['?q=  spaced  ', { q: 'spaced', expand: '' }],
  ['?q=' + encodeURIComponent('<script>alert(1)'), { q: '<script>alert(1)', expand: '' }],
  // Hostile slugs are rejected, never passed through.
  ['?expand=<img src=x onerror=1>', { q: '', expand: '' }],
  ['?expand=../../etc/passwd', { q: '', expand: '' }],
  ['?expand=' + 'a'.repeat(100), { q: '', expand: '' }],
];
for (const [input, want] of cases) {
  assert.strictEqual(JSON.stringify(parse(input)), JSON.stringify(want), 'parse(' + JSON.stringify(input) + ')');
}
console.log('  ok   parseIndexDeepLink: ' + cases.length + ' vectors (incl. hostile slugs rejected)');

// Malformed input must not throw (plain homepage, not a broken page).
assert.doesNotThrow(() => parse(null));
assert.doesNotThrow(() => parse(undefined));
assert.doesNotThrow(() => parse('?q=%E0%A4%A'));
console.log('  ok   parseIndexDeepLink never throws on malformed input');

// ---- 2. static guarantees on the shipped page --------------------------------
// The applier exists exactly once and is hooked after the catalogue is ready.
const defCount = html.split('function applyIndexDeepLink()').length - 1;
assert.strictEqual(defCount, 1, 'applyIndexDeepLink must be defined exactly once');
const placeholdersAt = html.indexOf('buildPlaceholders(cardFiles, dashboard);');
const hookAt = html.indexOf('applyIndexDeepLink();', placeholdersAt);
assert(placeholdersAt !== -1 && hookAt !== -1 && hookAt - placeholdersAt < 600,
  'applyIndexDeepLink() must be called just after buildPlaceholders in loadCardList');
console.log('  ok   applyIndexDeepLink is defined once and hooked after placeholders');

// The applier must have no HTML sink: deep-link values flow to input.value,
// performSearch() string matching and a charset-validated map lookup only.
const applier = grab('applyIndexDeepLink');
for (const sink of ['innerHTML', 'outerHTML', 'document.write', 'insertAdjacentHTML']) {
  assert(!applier.includes(sink), 'applyIndexDeepLink must not contain ' + sink);
}
assert(applier.includes('cardsMetaMap.has(link.expand)'),
  'expand must be validated against the catalogue map before use');
assert(applier.includes('.click()'),
  'expand should reuse the real click handler, not a parallel render path');
console.log('  ok   applyIndexDeepLink has no HTML sink; expand is map-validated + click-driven');

console.log(NL + 'index deep-link tests passed');
