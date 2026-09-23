#!/usr/bin/env node
'use strict';
// Run: node --test scripts/tests/handler-compile.test.js
//
// handler-check.js answers two questions about an inline `on*="…"` attribute:
// does the name it calls exist in window scope, and does the attribute compile
// at all. The second question was added after a full response sweep found 37
// attributes that named a function which exists — so the scope pass was happy —
// but were not JavaScript: `onclick="bfCopyResults(), this)"`. The browser never
// compiles those, so the button is dead for every visitor, and no other check
// could see it.
//
// What is pinned here:
//   1. a non-compiling attribute is reported, and fails the run;
//   2. the finding names the file, the line and the attribute;
//   3. a clean card is silent (the check has to be worth keeping in the gate);
//   4. every card named on the command line is really checked — the first
//      positional argument used to be dropped when --json was absent, so
//      `handler-check.js cards/a cards/b` checked b only — and an absolute path
//      is read as given rather than joined onto the repository root twice.
//
// Fixtures are .card, not .html: the sitemap lists every tracked .html file, so
// a fixture with that extension would be published to the live site.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CHECKER = path.join(ROOT, 'scripts', 'handler-check.js');
const FIXTURES = path.join(__dirname, 'fixtures');
const BAD = path.join(FIXTURES, 'handler-compile-bad.card');
const GOOD = path.join(FIXTURES, 'handler-compile-good.card');

function run(...files) {
  try {
    const stdout = execFileSync(process.execPath, [CHECKER, ...files], { encoding: 'utf8' });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('an attribute that is not JavaScript is a dead control, and fails the run', () => {
  const r = run(BAD);
  assert.strictEqual(r.code, 1, 'a dead control must fail the check');
  assert.match(r.out, /FAIL .*handler-compile-bad\.card/, 'the card is named');
  assert.match(r.out, /onclick="hcbCopy\(\), this\)"/, 'the attribute is quoted as it is in the file');
  assert.match(r.out, /does not compile, so that control can never fire/);
  assert.match(r.out, /line \d+/, 'and the line to open');
});

test('a card whose handlers compile is silent', () => {
  const r = run(GOOD);
  assert.strictEqual(r.code, 0, `a clean card must pass — ${r.out}`);
  assert.doesNotMatch(r.out, /FAIL/);
});

test('every card named on the command line is checked, not just the last', () => {
  const r = run(BAD, GOOD);
  assert.match(r.out, /2 card\(s\)/, 'both cards are counted in the summary');
  assert.match(r.out, /onclick="hcbCopy\(\), this\)"/,
    'and the first card on the line is the one that is broken');
  assert.strictEqual(r.code, 1);
});

test('the check is fast enough for the gate', () => {
  const started = Date.now();
  run(BAD, GOOD);
  const seconds = (Date.now() - started) / 1000;
  assert.ok(seconds < 15, `the two-card run took ${seconds.toFixed(1)}s`);
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
