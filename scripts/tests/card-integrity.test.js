#!/usr/bin/env node
'use strict';
// Run: node --test scripts/tests/card-integrity.test.js
//
// The mounted card has to be consistent with itself. Four things it can get
// wrong, none of them visible in the source file and none of them noticed by
// any other check in this repo — the markup is valid, the page does not throw,
// and the visitor's cost is invisible rather than loud:
//
//   1. two elements with the same id. `getElementById`, every `label for=` and
//      every aria reference resolve to the FIRST one, so the duplicate is a
//      control or a readout nobody can reach. Reported from the rendered card,
//      not the source: dog-photo-viewer and creative-writing re-render the id
//      they replace and were named for a duplicate they do not have.
//   2. a reference to an id nothing carries — `for=`, `aria-labelledby=`,
//      `aria-describedby=`, `list=`. The browser keeps the attribute and
//      ignores it, so the label or the help text simply never arrives.
//   3. a control with no accessible name: a screen reader announces the role
//      and nothing else. A nameless control FAILS — there is nothing to read
//      and nothing to see, and the catalogue's 150 of them (121 coordinate
//      cells, 8 tic-tac-toe cells, braille dot toggles, colour swatches, beat
//      pads) are all named now, so a new one is a regression. A nameless FIELD
//      is a NOTE: 861 of them, all the same shape (a read-only output textarea,
//      a slider whose label sits beside it unassociated), and a check that
//      fails on hundreds of pre-existing fields is a check nobody reads.
//   4. a card that initialises on DOMContentLoaded must be initialised ONCE.
//      The harness used to mount into a document jsdom had not finished
//      parsing, so the card saw its own event plus jsdom's — mealplanner built
//      its seven day columns twice and the sweep reported duplicate ids no
//      browser can produce. `loads-once.card` pins that: it appends a row per
//      init, so a second init is a duplicate id and fails.
//
// Fixtures are .card, not .html: the sitemap lists every tracked .html file, so
// a fixture with that extension would be published to the live site.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const HARNESS = path.join(ROOT, 'scripts', 'test-card.js');
const FIXTURES = path.join(__dirname, 'fixtures');
const f = name => path.join('scripts', 'tests', 'fixtures', name);

function run(file, flags = []) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [HARNESS, ...flags, file], { cwd: ROOT, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('two elements with the same id in the rendered card is a failure', () => {
  const r = run(f('duplicate-ids-real.card'));
  assert.strictEqual(r.code, 1, 'a duplicate id must fail the harness');
  assert.match(r.out, /duplicate id in the rendered card: dup-real-count ×2/,
    'the finding names the id and the count');
  assert.match(r.out, /getElementById and every aria reference resolve to the first one/,
    'and says what it costs the visitor');
});

test('a control the card re-renders is not a duplicate', () => {
  const r = run(f('duplicate-ids-rerender.card'));
  assert.strictEqual(r.code, 0, `the DOM has one element, so the card is fine — ${r.out}`);
  assert.doesNotMatch(r.out, /duplicate id/, 'and it must not be named for it');
});

test('both duplicate-id fixtures are mounted, not read', () => {
  // Guards the change itself: if the check went back to scanning source text,
  // the re-render fixture would be reported and this test would fail first.
  const source = fs.readFileSync(path.join(FIXTURES, 'duplicate-ids-rerender.card'), 'utf8');
  assert.strictEqual((source.match(/dup-re-count/g) || []).length, 2,
    'the fixture really does name the id twice in its text');
});

test('a reference to an id nothing carries is a failure, per attribute', () => {
  const r = run(f('reference-to-nowhere.card'));
  assert.strictEqual(r.code, 1, 'the fixture must fail');
  assert.match(r.out, /for="ref-nowhere-depth" on <label> names an id no element carries: the label points at no field/);
  assert.match(r.out, /aria-describedby="ref-nowhere-help" on <input> names an id no element carries: the description is never read out/);
  assert.match(r.out, /aria-labelledby="ref-nowhere-heading" on <button> names an id no element carries: the name it should take/);
  // The dangling aria-labelledby is what the accessible-name check then walks
  // through to: `textOf(null)` used to throw and abort the run here, hiding
  // every check after this one for that card.
  assert.doesNotMatch(r.out, /harness failed before finishing/);
});

test('every way a control can be named counts as named', () => {
  const r = run(f('reference-named.card'));
  assert.strictEqual(r.code, 0, `wired-up references are not findings — ${r.out}`);
  assert.doesNotMatch(r.out, /reference to nowhere/);
  assert.doesNotMatch(r.out, /no accessible name/,
    'text, aria-label, aria-labelledby, title, a child img alt, a wrapping label, a label for=, a placeholder');
});

test('a nameless control fails; a nameless field is only noted', () => {
  const r = run(f('unnamed-control.card'));
  assert.strictEqual(r.code, 1, 'the swatch and the icon link are unreachable by name');
  assert.match(r.out,
    /control with no accessible name: <button#unnamed-swatch> is announced as nothing but "button"/);
  assert.match(r.out, /control with no accessible name: <a> is announced as nothing but "link"/);
  // The slider is a field: 861 of them catalogue-wide, so it stays a note.
  assert.match(r.out,
    /note .*1 field\(s\) with no accessible name \(first: <input#unnamed-slider> is announced as nothing but "slider"\)/);
  assert.doesNotMatch(r.out, /control with no accessible name: <input/);
});

test('a field is not named by the text it holds', () => {
  // A <select>'s options are its value, and a <textarea>'s text is its initial
  // value: neither is the name a screen reader reads out with the role. Taking
  // element text as a name made every select with options look named, so the
  // check could not see the field at all.
  const r = run(f('select-value-not-name.card'));
  assert.strictEqual(r.code, 0, `these are fields, so they are notes — ${r.out}`);
  assert.match(r.out, /2 field\(s\) with no accessible name/);
  assert.match(r.out, /first: <select#sel-currency> is announced as nothing but "combobox"/);
  assert.doesNotMatch(r.out, /sel-labelled/, 'aria-label is a name');
  assert.doesNotMatch(r.out, /sel-save/, 'a button IS named by its own text');
});

test('--nameless lists every nameless field, not just the first', () => {
  // The note reports "48 field(s) … (first: …)", and 48 is a number to work
  // from only if the other 47 can be found. Off the sweep, the default output
  // stays short: the list is opt-in.
  const fixture = f('unnamed-grid.card');
  const plain = run(fixture);
  assert.strictEqual(plain.code, 0, `four unlabelled cells are a note — ${plain.out}`);
  assert.match(plain.out, /4 field\(s\) with no accessible name/);
  assert.doesNotMatch(plain.out, /1\. field/, 'no list unless --nameless asked for one');
  const listed = run(fixture, ['--nameless']);
  assert.strictEqual(listed.code, 0, 'a listing is not a new failure');
  assert.match(listed.out, /4 control\(s\)\/field\(s\) across 1 card\(s\)/);
  for (const i of ['0', '1', '2', '3']) {
    assert.match(listed.out, new RegExp(`\\d+\\. field   <input> in #grid-rows \\[data-i="${i}"\\]`),
      `cell ${i} must be findable by container and data attribute`);
  }
});

test('a card that inits on DOMContentLoaded is initialised once', () => {
  const r = run(f('loads-once.card'));
  assert.strictEqual(r.code, 0, `one dispatch, one row — ${r.out}`);
  const out = r.out;
  assert.doesNotMatch(out, /duplicate id in the rendered card: load-once-row/,
    'a second init would append a second row with the same id');
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      fn();
      console.log(`  ok   ${name}`);
    } catch (e) {
      console.error(`  FAIL ${name}`);
      console.error(`       ${e.message.split('\n').join('\n       ')}`);
      process.exitCode = 1;
    }
  }
  console.log('');
})();
