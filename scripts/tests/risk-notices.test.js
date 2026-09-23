// Drives the REAL shared risk-notice mapping (risk-notices.js) that both
// index.html and tool.html rely on, against the real cards/cards.json.
//
// Pins three things:
//   1. the mapping contract — category rules, tool overrides, safe tools;
//   2. the DOM contract — role="note", data-risk-kind, prepend behaviour;
//   3. drift guards — every category name and tool slug referenced by the
//      mapping must exist in cards/cards.json, so a renamed category or
//      retired tool can never leave a silently dead mapping entry.
//
// Run with: node scripts/tests/risk-notices.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// ---- run the shipped mapping in a sandbox ---------------------------------
const source = fs.readFileSync('risk-notices.js', 'utf8');
const sandbox = { window: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'risk-notices.js' });
const R = sandbox.window.SiteRiskNotices;
assert(R && typeof R.noticeFor === 'function', 'SiteRiskNotices not exported');

// ---- catalogue (for drift guards) ------------------------------------------
const catalogue = JSON.parse(fs.readFileSync('cards/cards.json', 'utf8'));
const names = new Set(catalogue.map(c => c.name));
const categories = new Set(catalogue.map(c => c.category));

// ---- 1. mapping contract ----------------------------------------------------
const fin = R.noticeFor({ name: 'mortgage', category: 'Finance & Money' });
assert(fin && fin.kind === 'financial', 'finance category must map to financial');
assert(/\bnot financial advice\b/.test(fin.text), 'financial text must say what it is not');

assert(R.noticeFor({ name: 'bmi', category: 'Health & Fitness' }).kind === 'medical');
assert(R.noticeFor({ name: 'grief-companion', category: 'Wellbeing & Community' }).kind === 'medical');
assert(R.noticeFor({ name: 'sleep', category: 'Health & Fitness' }).kind === 'medical');

// Survival & Emergency Readiness → emergency guidance
assert(R.noticeFor({ name: 'gas-leak-carbon-monoxide-response', category: 'Survival & Emergency Readiness' }).kind === 'emergency');
assert(/999/.test(R.noticeFor({ name: 'poison-chemical-exposure-response', category: 'Survival & Emergency Readiness' }).text),
  'emergency notice must mention the emergency number');

// Tool overrides beat their category (legal tools inside Finance & Money).
assert(R.noticeFor({ name: 'bank-small-claims', category: 'Finance & Money' }).kind === 'legal');
assert(R.noticeFor({ name: 'tenancy-deposit-calculator', category: 'Finance & Money' }).kind === 'legal');
// DIY overrides for tools outside any risk category.
assert(R.noticeFor({ name: 'deck-joist-span-calculator', category: 'Home & DIY' }).kind === 'diy');
assert(R.noticeFor({ name: 'stud-framing-calculator', category: 'Home & DIY' }).kind === 'diy');

// Safe tools get nothing.
assert.strictEqual(R.noticeFor({ name: 'metronome', category: 'Music & Audio' }), null);
assert.strictEqual(R.noticeFor({ name: 'qrtool', category: 'Productivity & Lifestyle' }), null);
assert.strictEqual(R.noticeFor({ name: 'paint-calculator', category: 'Home & DIY' }), null);
assert.strictEqual(R.noticeFor(null), null);
assert.strictEqual(R.noticeFor({}), null);

// Every kind has icon + sentence text.
for (const [kind, v] of Object.entries(R.kinds)) {
  assert(v.icon && v.icon.length >= 1, `${kind} missing icon`);
  assert(v.text && v.text.length > 40, `${kind} text too short`);
  assert(/[.!]$/.test(v.text), `${kind} text should end with sentence punctuation`);
}

// ---- 2. DOM contract --------------------------------------------------------
function el(tag) {
  return {
    tagName: tag, children: [], attrs: {}, _text: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; },
    set textContent(t) { this._text = t; },
    get textContent() { return this._text; },
  };
}
const doc = { createElement: tag => el(tag) };
// attach() resolves the document at call time (browser: window.document) —
// give the sandbox the same handle.
sandbox.window.document = doc;
const note = R.build(R.noticeFor({ name: 'bmi', category: 'Health & Fitness' }), doc);
assert(note.attrs.role === 'note', 'notice must be role=note');
assert(note.attrs['data-risk-kind'] === 'medical', 'notice must carry data-risk-kind');
assert(note.children.length === 2, 'icon + text children expected');
assert(note.children[0].attrs['aria-hidden'] === 'true', 'icon must be aria-hidden');
assert.strictEqual(note.children[1]._text.length > 40, true, 'text child carries the wording');

const parent = el('div');
parent.firstChild = el('span'); // existing first child
let inserted = null;
parent.insertBefore = (node, ref) => { inserted = node; parent.children.splice(0, 0, node); assert.strictEqual(ref, parent.firstChild); };
const attached = R.attach(parent, { name: 'bmi', category: 'Health & Fitness' });
assert(attached && inserted === attached, 'attach must insert the built notice');
assert.strictEqual(R.attach(parent, { name: 'metronome', category: 'Music & Audio' }), null,
  'attach must not touch safe tools');
assert.strictEqual(R.attach(null, { name: 'bmi' }), null);

// ---- 3. drift guards --------------------------------------------------------
for (const cat of Object.keys(R.categoryKinds)) {
  assert(categories.has(cat), `category "${cat}" is in the mapping but not in cards.json`);
}
for (const slug of Object.keys(R.toolKinds)) {
  assert(names.has(slug), `tool "${slug}" is in the mapping but not in cards.json`);
}
// And the reverse sanity check: the categories that carry notices exist.
for (const want of ['Finance & Money', 'Health & Fitness']) {
  assert(categories.has(want), `expected category missing from catalogue: ${want}`);
}

// ---- 4. published helpline numbers ----------------------------------------
// A wrong emergency number is the one defect on this site that can hurt
// someone directly: the card renders, looks authoritative, and the person in
// danger does not reach the service. personal-safety-awareness-planner shipped
// 0800 2000 247 for the National Domestic Abuse Helpline; the published number
// (Refuge, via gov.uk) is 0808 2000 247. Scan every tracked page and script so
// a correction cannot be reintroduced by a copy-paste.
const WRONG_NUMBERS = [
  // [wrong, correct, service]
  ['0800 2000 247', '0808 2000 247', 'National Domestic Abuse Helpline'],
];
const REPO_ROOT = path.join(__dirname, '..', '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.github']);
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walk(full); }
    else if (/\.(html|js|json)$/.test(e.name)) yield full;
  }
}
let scanned = 0;
for (const file of walk(REPO_ROOT)) {
  scanned++;
  if (file === __filename) continue; // this guard's own table contains the string
  const text = fs.readFileSync(file, 'utf8');
  for (const [wrong, correct, service] of WRONG_NUMBERS) {
    assert(!text.includes(wrong),
      `${path.relative(REPO_ROOT, file)}: ships ${wrong} for the ${service} — the published number is ${correct}`);
  }
}
assert(scanned > 500, `helpline scan covered only ${scanned} files — the walk is broken, not the site`);

console.log('risk-notices: mapping, DOM and drift guards all OK');
