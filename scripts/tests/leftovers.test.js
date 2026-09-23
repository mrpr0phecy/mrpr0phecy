#!/usr/bin/env node
'use strict';
// Run: node --test scripts/tests/leftovers.test.js
//
// `tool.html` can clear the card's container on every navigation. It cannot
// clear `document.body` or `document.head`. So a dialog, a modal or a toast a
// card appends there outlives the card — it sits over the tool the visitor
// opened next, its own Close button still wired to markup that is gone. A
// hidden YouTube wrapper is worse: it keeps its iframe playing, and the next
// visit finds the stale wrapper, skips creating a player, and leaves the card's
// own music control dead for the rest of the session.
//
// The harness cannot be the only guard: its teardown probe sees exactly the
// leftovers its own clicks produced, and a dialog behind a Share button is
// never clicked. `scripts/check-card-leftovers.js` is the source-level rule.
//
// Pinned here: an append nothing removes fails and names the line; the three
// legitimate shapes stay quiet (the transient copy helper, the toast on its own
// timer, a third-party library <script src>); appending into the card's own
// container is not a finding; and the catalogue is clean.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CHECKER = path.join(ROOT, 'scripts', 'check-card-leftovers.js');
const f = name => path.join('scripts', 'tests', 'fixtures', name);

function run(...args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CHECKER, ...args], { cwd: ROOT, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('an append nothing removes fails, naming the line and the fix', () => {
  const r = run(f('leftovers-unremoved.card'));
  assert.strictEqual(r.code, 1, 'the dialog outlives the card');
  assert.match(r.out, /leftovers-unremoved\.card:13: this card appends `shareDialog` to document\.body/);
  assert.match(r.out, /nothing ever removes it/);
  assert.match(r.out, /closest\('\.card'\)/, 'and names the shape that fixes it');
});

test('a helper that removes itself is not a finding', () => {
  const r = run(f('leftovers-cleaned.card'));
  assert.strictEqual(r.code, 0, `all three shapes clean up — ${r.out}`);
  assert.doesNotMatch(r.out, /FAIL/);
});

test('appending into the card is not a finding', () => {
  const r = run(f('leftovers-scoped.card'));
  assert.strictEqual(r.code, 0, `the node leaves with the card — ${r.out}`);
});

test('the catalogue is clean', () => {
  const r = run('--all');
  assert.strictEqual(r.code, 0, `something outlives its card — ${r.out}`);
  const cards = fs.readdirSync(path.join(ROOT, 'cards')).filter(n => n.endsWith('.html')).length;
  assert.match(r.out, new RegExp(`${cards} card\\(s\\): nothing a card adds to the document outlives it`));
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
