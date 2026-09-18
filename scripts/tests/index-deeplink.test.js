// Drives the REAL deep-link parser shipped inside home-app.js (the externalised
// homepage application; index.html loads it with `defer`) — ?q= search
// pre-fill, ?expand= open-one-tool-inline, ?cat= one category — in a vm
// sandbox. Zero dependencies.
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
vm.runInContext(grab('slugifyLabel') + NL + grab('parseIndexDeepLink'), ctx);
const parse = vm.runInContext('parseIndexDeepLink', ctx);
const slug = vm.runInContext('slugifyLabel', ctx);

const cases = [
  ['?q=mortgage', { q: 'mortgage', expand: '', cat: '', view: '' }],
  ['?expand=mortgage', { q: '', expand: 'mortgage', cat: '', view: '' }],
  ['?q=BMI&expand=bmi', { q: 'BMI', expand: 'bmi', cat: '', view: '' }],
  ['', { q: '', expand: '', cat: '', view: '' }],
  ['?q=&expand=', { q: '', expand: '', cat: '', view: '' }],
  ['?expand=MORTGAGE', { q: '', expand: 'mortgage', cat: '', view: '' }],
  ['?q=  spaced  ', { q: 'spaced', expand: '', cat: '', view: '' }],
  ['?q=' + encodeURIComponent('<script>alert(1)'), { q: '<script>alert(1)', expand: '', cat: '', view: '' }],
  // Hostile slugs are rejected, never passed through.
  ['?expand=<img src=x onerror=1>', { q: '', expand: '', cat: '', view: '' }],
  ['?expand=../../etc/passwd', { q: '', expand: '', cat: '', view: '' }],
  ['?expand=' + 'a'.repeat(100), { q: '', expand: '', cat: '', view: '' }],
  // ?cat= is a slug of a label the catalogue owns; `category=` is the same link
  // under the longer name agents.html publishes. Case and punctuation fold, and
  // a value that matches no pill simply filters nothing.
  ['?cat=music-audio', { q: '', expand: '', cat: 'music-audio', view: '' }],
  ['?cat=Music%20%26%20Audio', { q: '', expand: '', cat: 'music-audio', view: '' }],
  ['?category=Mathematics', { q: '', expand: '', cat: 'mathematics', view: '' }],
  ['?cat=music-audio&cat=mathematics', { q: '', expand: '', cat: 'music-audio', view: '' }],
  ['?cat=&category=mathematics', { q: '', expand: '', cat: 'mathematics', view: '' }],
  ['?cat=all', { q: '', expand: '', cat: 'all', view: '' }],
  ['?cat=' + encodeURIComponent("<img src=x onerror='1'>"), { q: '', expand: '', cat: 'img-src-x-onerror-1', view: '' }],
  ['?cat=../../etc/passwd', { q: '', expand: '', cat: 'etc-passwd', view: '' }],
  ['?cat=' + 'a'.repeat(200), { q: '', expand: '', cat: 'a'.repeat(60), view: '' }],
  ['?cat=health-fitness&q=vo2', { q: 'vo2', expand: '', cat: 'health-fitness', view: '' }],
  // ?view= selects the grid the link means, and nothing else does.
  ['?view=directory', { q: '', expand: '', cat: '', view: 'directory' }],
  ['?view=CARDS', { q: '', expand: '', cat: '', view: 'cards' }],
  ['?view=list', { q: '', expand: '', cat: '', view: '' }],
  ['?view=' + encodeURIComponent('<script>'), { q: '', expand: '', cat: '', view: '' }],
  // ?park=off is the mount window's escape hatch, and only that word means it:
  // parking is the default the page believes in, so a typo must not disable it.
  ['?park=off', { q: '', expand: '', cat: '', view: '', park: 'off' }],
  ['?park=OFF&cat=music-audio', { q: '', expand: '', cat: 'music-audio', view: '', park: 'off' }],
  ['?park=on', { q: '', expand: '', cat: '', view: '', park: '' }],
  ['?park=', { q: '', expand: '', cat: '', view: '', park: '' }],
];
// Compared as whole objects, so a key added to parseIndexDeepLink() must be
// spelled out in every vector — which is the point. The fill keeps the
// parser's own key order.
const PARSED_KEYS = { q: '', expand: '', cat: '', view: '', park: '' };
for (const [input, want] of cases) {
  assert.strictEqual(JSON.stringify(parse(input)), JSON.stringify(Object.assign({}, PARSED_KEYS, want)),
    'parse(' + JSON.stringify(input) + ')');
}
console.log('  ok   parseIndexDeepLink: ' + cases.length + ' vectors (incl. hostile slugs rejected)');

// Malformed input must not throw (plain homepage, not a broken page).
assert.doesNotThrow(() => parse(null));
assert.doesNotThrow(() => parse(undefined));
assert.doesNotThrow(() => parse('?q=%E0%A4%A'));
console.log('  ok   parseIndexDeepLink never throws on malformed input');

// ---- 1b. the category slug is one function, used in both directions --------
// The pills write `?cat=<slug>` and the parser reads it; if the two ever
// disagree, the URL a visitor shares selects nothing. Both go through this
// function, so pin its shape rather than trusting two implementations to match.
for (const [label, want] of [
  ['Music & Audio', 'music-audio'],
  ['Health & Fitness', 'health-fitness'],
  ['AI & Autonomous Agents', 'ai-autonomous-agents'],
  ['  SaaS & Business Killers  ', 'saas-business-killers'],
  ['all', 'all'],
  [null, ''],
  [undefined, ''],
  ['3D — Spirograph!!', '3d-spirograph'],
]) {
  assert.strictEqual(slug(label), want, 'slugifyLabel(' + JSON.stringify(label) + ')');
}
assert.strictEqual(slug('Music & Audio'), 'music-audio',
  'a pill label and a ?cat= link must reduce to the same string');
console.log('  ok   slugifyLabel folds labels and slugs to one form');

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
// ?cat= must resolve against the pills that exist, not against the link text:
// an unknown cat leaves the catalogue unfiltered rather than inventing a state.
assert(applier.includes("slugifyLabel(p.dataset.category)"),
  'cat must be matched against the shipped category pills');
assert(applier.includes('currentSelectedCategory = pill.dataset.category'),
  'cat must apply the real filter state, so a reload and a click agree');
// ?park=off must reach the one flag that turns parking on or off, and must be
// read before the early return (a URL that only changes behaviour is still a URL).
const parkAt = applier.indexOf("link.park === 'off'");
assert(parkAt !== -1 && applier.includes('parkMode = false'),
  'applyIndexDeepLink must hand ?park=off to parkMode');
assert(parkAt < applier.indexOf('if (!link.q && !link.expand'),
  '?park=off is applied before the "nothing to do" early return');
// and the pills must write the same URL back, or the shared link is a lie
const writer = grab('slugifyLabel') + NL + html.slice(html.indexOf('// Category pills filter'),
  html.indexOf('// Search clear button'));
assert(writer.includes('history.replaceState') && writer.includes('?cat='),
  'a category click must put ?cat= in the URL (replaceState: a view, not a page)');
console.log('  ok   applyIndexDeepLink has no HTML sink; expand is map-validated + click-driven');

console.log(NL + 'index deep-link tests passed');
