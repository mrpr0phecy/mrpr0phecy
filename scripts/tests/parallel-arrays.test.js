#!/usr/bin/env node
'use strict';
// Run: node --test scripts/tests/parallel-arrays.test.js
//
// scripts/check-parallel-arrays.js exists because creative-writing.html shipped
// 12 plot titles beside 8 plot descriptions and 8 plot structures, then drew one
// index from the titles and used it on all three. Four clicks in ten died with
// "Cannot read properties of undefined (reading 'map')" — and no other check
// could see it: the JavaScript parses, the handlers resolve, and a click on the
// card usually succeeds.
//
// A checker that reports nothing on 1,250 cards is only trustworthy if it is
// shown catching the thing it was written for and shown staying quiet on the
// shapes that are not it. That is what these fixtures are: the real card's
// pattern (must fail), the fixed version of the same card (must pass), and the
// look-alikes that must not be reported — one array indexed by its own length,
// a single shared index over equal-length arrays, and an index that is clamped
// before use (a note, not a defect).
//
// Fixtures live in scripts/tests/fixtures/ so they cannot be mistaken for
// shipped cards: cards/ is the catalogue and every file in it is published.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CHECKER = path.join(ROOT, 'scripts', 'check-parallel-arrays.js');
const FIXTURES = path.join(__dirname, 'fixtures');

function run(file) {
  try {
    const stdout = execFileSync(process.execPath, [CHECKER, file], { encoding: 'utf8' });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

const fixtures = {
  mismatch: path.join(FIXTURES, 'parallel-arrays-mismatch.html'),
  ok: path.join(FIXTURES, 'parallel-arrays-ok.html'),
  lookalikes: path.join(FIXTURES, 'parallel-arrays-lookalikes.html'),
};

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('the shape that shipped: one index, three parallel arrays of different lengths', () => {
  const r = run(fixtures.mismatch);
  assert.strictEqual(r.code, 1, 'a mismatch must fail the check, not pass it silently');
  assert.match(r.out, /FAIL .*parallel-arrays-mismatch\.html:\d+/,
    'the finding names the file and the line to fix');
  assert.match(r.out, /plotIndex is drawn from plotTitles \(12 entries\)/,
    'the finding names the index variable and the array it is in range for');
  assert.match(r.out, /plotDescriptions \(8\), plotStructures \(8\)/,
    'and every array that is short by comparison');
  assert.match(r.out, /4 of 12 draws read past the end/,
    'and how often the bug fires — the number that says whether it is a nuisance or a bug');
});

test('the same card with the arrays made parallel is silent', () => {
  const r = run(fixtures.ok);
  assert.strictEqual(r.code, 0, 'equal-length arrays indexed by one variable are the intended pattern');
  assert.match(r.out, /no card indexes parallel arrays of different lengths/);
});

test('the look-alikes are not reported: own-length index, single array, clamped index', () => {
  const r = run(fixtures.lookalikes);
  assert.strictEqual(r.code, 0,
    'a false positive here would make the checker unwelcome in the gate');
  assert.doesNotMatch(r.out, /FAIL/, 'none of the three look-alikes is a defect');
});

test('a clamped index is a note, not a failure', () => {
  const clamped = path.join(FIXTURES, 'parallel-arrays-clamped.html');
  const r = run(clamped);
  assert.strictEqual(r.code, 0, 'a clamped index cannot read undefined, so it must not fail the run');
  assert.match(r.out, /NOTE/, 'but it is still worth seeing that two arrays were assumed parallel');
  assert.match(r.out, /clamped \(note\)/);
});

test('a whole-repository run is clean, and the checker itself is fast enough for the gate', () => {
  const shipped = fs.readdirSync(path.join(ROOT, 'cards')).filter(f => f.endsWith('.html')).length;
  const started = Date.now();
  const r = run('--all');
  const seconds = (Date.now() - started) / 1000;
  assert.strictEqual(r.code, 0, `cards/ must be clean — ${r.out}`);
  assert.match(r.out, new RegExp(`\\b${shipped} card\\(s\\)`),
    'the run reports the scope it covered, so a silently-empty sweep cannot look clean');
  assert.ok(seconds < 30, `the full sweep is a few hundred ms, not ${seconds.toFixed(1)}s`);
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
