#!/usr/bin/env node
'use strict';
// Run: node --test scripts/tests/form-buttons.test.js
//
// check-form-buttons.js exists because a `<button>` with no `type` inside a
// `<form>` is a submit button, and submitting a card navigates the tool page:
// the click's work happens, the browser reloads the URL, and the visitor is
// left with an empty form. Fifteen cards shipped this, 109 buttons between
// them, and no other check can see it — jsdom does not implement form
// submission, so the response sweep watches the DOM change and never the
// navigation.
//
// Pinned here: the typeless button is reported with the form's line; the three
// legitimate shapes stay quiet — `type="button"`, a real `type="submit"` whose
// form cancels the submit inline, and a real submit button whose form cancels
// it in a listener — and the whole catalogue is clean.
//
// Fixtures are .card, not .html: the sitemap lists every tracked .html file, so
// a fixture with that extension would be published to the live site.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CHECKER = path.join(ROOT, 'scripts', 'check-form-buttons.js');
const FIXTURES = path.join(__dirname, 'fixtures');
const TYPELESS = path.join(FIXTURES, 'form-buttons-typeless.card');
const EXPLICIT = path.join(FIXTURES, 'form-buttons-explicit.card');
const LISTENER = path.join(FIXTURES, 'form-buttons-listener.card');

function run(...files) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CHECKER, ...files], { encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('a button with no type inside a form is reported, with the line to open', () => {
  const r = run(TYPELESS);
  assert.strictEqual(r.code, 1, 'a control that reloads the tool must fail the check');
  assert.match(r.out, /FAIL .*form-buttons-typeless\.card:6/, 'the button is named by line');
  assert.match(r.out, /fbt-go/, 'and by id, so there is no guessing which control it is');
  assert.match(r.out, /submits it/, 'the finding says what would happen');
  assert.match(r.out, /type="button"/, 'and what to write instead');
});

test('type="button" is the fix, and a form that cancels its own submit is fine', () => {
  const r = run(EXPLICIT, LISTENER);
  assert.strictEqual(r.code, 0, `both shapes are correct — ${r.out}`);
  assert.doesNotMatch(r.out, /FAIL/);
});

test('a data-type attribute is not a type attribute', () => {
  // capo-calculator's example buttons carry data-type="spring"; reading that as
  // `type="…"` hid them from the first version of this scan.
  const src = fs.readFileSync(TYPELESS, 'utf8')
    .replace('id="fbt-go"', 'id="fbt-go" data-type="spring"');
  const tmp = path.join(FIXTURES, 'form-buttons-datatype.card');
  fs.writeFileSync(tmp, src);
  try {
    const r = run(tmp);
    assert.strictEqual(r.code, 1, 'the button still submits: data-type is not a type');
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('the catalogue is clean, and the check is fast enough for the gate', () => {
  const started = Date.now();
  const r = run('--all');
  const seconds = (Date.now() - started) / 1000;
  assert.strictEqual(r.code, 0, `cards/ must be clean — ${r.out}`);
  assert.match(r.out, /1250 card\(s\)|1\d{3} card\(s\)/,
    'the run says what it covered, so an empty sweep cannot look clean');
  assert.ok(seconds < 30, `the full sweep is under a second, not ${seconds.toFixed(1)}s`);
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
