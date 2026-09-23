#!/usr/bin/env node
'use strict';
// Run: node --test scripts/tests/a11y.test.js
//
// `scripts/check-a11y.py` grew a fourth rule on 2026-09-23: a click handler
// belongs on something the keyboard can reach. A `<div>` or `<span>` with
// `onclick=` and no `role=`/`tabindex=` cannot be focused, so it cannot be
// activated without a mouse at all — the visitor using a keyboard sees a row
// that does nothing, and a screen reader is told nothing is there. Eighteen of
// these were live: trigonometry's six quick-nav pills (one of which pointed at
// a section id the card never had), ai-toolbox's four trending rows (a click
// threw on a block that does not exist), linux-regex-tester's five pattern
// chips, xmas-card-writer-assistant's three alternative tiles, and
// opensourcenews.html's volume button and three presenter badges.
//
// Pinned here: the unreachable shapes fail with the line, the reachable shapes
// (a real button, a div that declares role= and tabindex=, an element with no
// handler) stay quiet, and the catalogue is clean.
//
// Fixtures are .card, not .html: the sitemap lists every tracked .html file, so
// a fixture with that extension would be published to the live site.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CHECKER = path.join(ROOT, 'scripts', 'check-a11y.py');
const f = name => path.join('scripts', 'tests', 'fixtures', name);

function run(...files) {
  try {
    return { code: 0, out: execFileSync('python3', [CHECKER, ...files], { cwd: ROOT, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('a div or span with a click handler fails, naming the line', () => {
  const r = run(f('a11y-click-unreachable.card'));
  assert.strictEqual(r.code, 1, 'the keyboard cannot reach either element');
  assert.match(r.out, /a11y-click-unreachable\.card:4: <div> has a click handler but cannot be focused/);
  assert.match(r.out, /a11y-click-unreachable\.card:5: <span> has a click handler but cannot be focused/);
  assert.match(r.out, /use <button type="button">/, 'and says what to use instead');
});

test('a real button, and a div that declares itself, stay quiet', () => {
  const r = run(f('a11y-click-reachable.card'));
  assert.strictEqual(r.code, 0, `both shapes are reachable — ${r.out}`);
  assert.doesNotMatch(r.out, /FAIL/);
});

test('the catalogue is clean', () => {
  const r = run();
  assert.strictEqual(r.code, 0, `a click target is unreachable — ${r.out}`);
  const files = fs.readdirSync(path.join(ROOT, 'cards')).filter(n => n.endsWith('.html')).length +
    fs.readdirSync(ROOT).filter(n => n.endsWith('.html')).length;
  assert.match(r.out, new RegExp(`a11y scan: ${files} files`));
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
