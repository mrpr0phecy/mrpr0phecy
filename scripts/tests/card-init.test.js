#!/usr/bin/env node
'use strict';
// Run: node --test scripts/tests/card-init.test.js
//
// A card that can only start while the document is LOADING never starts.
// tool.html injects the fragment into a page that has been loaded for a long
// time and *then* dispatches DOMContentLoaded, so `document.readyState` is
// 'complete' when the card's script runs and
//
//     if (document.readyState === 'loading') {
//         document.addEventListener('DOMContentLoaded', function () { …the card… });
//     }
//
// registers nothing. Forty-three cards were in exactly that state — tic-tac-toe
// drew no board, cover-letter never filled in the date, cooking-unit-converter
// never ran a first conversion — and no other check here can see it: the markup
// is valid, the scripts compile, every handler resolves, and the card simply
// never starts.
//
// Pinned here: the guard without an else fails (block and brace-less form, each
// naming the line), the guard with its else passes in both forms (the one-line
// form is the idiom CONSTRAINTS.md documents), a `readyState` test that is
// about something else is not this rule's business, and the whole catalogue is
// clean.
//
// Fixtures are .card, not .html: the sitemap lists every tracked .html file, so
// a fixture with that extension would be published to the live site.

const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CHECKER = path.join(ROOT, 'scripts', 'check-card-init.js');
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

test('a guard with no else fails, naming the line', () => {
  const r = run(f('card-init-guard-only.card'));
  assert.strictEqual(r.code, 1, 'the card cannot start, so the check must fail');
  assert.match(r.out, /card-init-guard-only\.card:10: this card only starts inside/);
  assert.match(r.out, /the listener is never registered and the card never starts for a visitor/);
});

test('the brace-less form of the same mistake fails too', () => {
  const r = run(f('card-init-statement.card'));
  assert.strictEqual(r.code, 1, 'no braces, same dead registration');
  assert.match(r.out, /card-init-statement\.card:7: this card only starts inside/);
});

test('the guard with its else branch passes', () => {
  const r = run(f('card-init-guard-else.card'));
  assert.strictEqual(r.code, 0, `the else runs the init — ${r.out}`);
  assert.doesNotMatch(r.out, /FAIL/);
});

test('the documented one-line idiom with its else passes', () => {
  // CONSTRAINTS.md prescribes `if (…loading) document.addEventListener(…, init);
  // else init();` — the brace-less branch used to fail it whatever followed.
  const r = run(f('card-init-statement-else.card'));
  assert.strictEqual(r.code, 0, `the else runs the init — ${r.out}`);
  assert.doesNotMatch(r.out, /FAIL/);
});

test('a readyState test that registers no listener is not a finding', () => {
  const r = run(f('card-init-other-loading.card'));
  assert.strictEqual(r.code, 0, `nothing to fix here — ${r.out}`);
});

test('the catalogue is clean', () => {
  const r = run('--all');
  assert.strictEqual(r.code, 0, `some card cannot start in an already-loaded document — ${r.out}`);
  // Counted from the directory rather than written down: the catalogue grows.
  const cards = require('fs').readdirSync(path.join(ROOT, 'cards')).filter(n => n.endsWith('.html')).length;
  assert.match(r.out, new RegExp(`${cards} card\\(s\\): every card can start in an already-loaded document`));
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
