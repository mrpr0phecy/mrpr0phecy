'use strict';
// The solve box — plain words in, a tool with the numbers already filled in.
//
//   node scripts/tests/intents.test.js
//
// Two halves, because the feature has two halves that can fail separately:
//
//   1. intents.json (scripts/build-intents.js) must keep its promises: every
//      field it fills exists on the card named, every `run: true` card really
//      has a control `&run=1` can press, and every example still matches its
//      own pattern. A pattern that rots opens the wrong tool with the wrong
//      numbers in it — the visitor sees a real calculator showing a real
//      answer to a question they did not ask.
//   2. the matcher in home-core.js must turn those examples into exactly the
//      URL the data says, and must stay quiet on ordinary searches. The block
//      is sliced out of the shipped file (same technique as
//      scripts/tests/tool-shell.test.js) so the test drives the code that
//      actually runs, not a copy that agrees with it.
//
// Run with: node scripts/tests/intents.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { readCard, hasRunTrigger } = require('../lib/card-fields.js');

const ROOT = path.join(__dirname, '..', '..');
const CARDS = path.join(ROOT, 'cards');
const HOME = fs.readFileSync(path.join(ROOT, 'home-core.js'), 'utf8');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'intents.json'), 'utf8'));

const START = '/* ===== SOLVE MATCHER ===== */';
const END = '/* ===== /SOLVE MATCHER ===== */';

function matcher() {
  const a = HOME.indexOf(START);
  const b = HOME.indexOf(END);
  assert.ok(a !== -1 && b > a, 'the SOLVE MATCHER block is missing from home-core.js');
  const block = HOME.slice(a + START.length, b);
  // Self-contained by design: no DOM, no closures from setupSearch. If that
  // ever stops being true the extraction throws here rather than in a browser.
  assert.ok(!/document\.|window\./.test(block),
    'the SOLVE MATCHER block must not touch the DOM — it is driven by this test');
  const api = new Function(block + '\nreturn { solveFor: solveFor, solve: solve };')();
  api.solve.intents = DATA.intents;
  return api.solveFor;
}

test('every route fills fields its card really has, and runs only where a button exists', () => {
  const problems = [];
  for (const intent of DATA.intents) {
    const file = path.join(CARDS, intent.card + '.html');
    if (!fs.existsSync(file)) { problems.push(`${intent.id}: no card at cards/${intent.card}.html`); continue; }
    const card = readCard(file);
    const ids = new Set(card.fields.map(f => f.id));
    for (const id of Object.keys(intent.fills)) {
      if (!ids.has(id)) problems.push(`${intent.id}: fills ${id}, which ${intent.card} does not expose`);
    }
    if (intent.run && !hasRunTrigger(fs.readFileSync(file, 'utf8'))) {
      problems.push(`${intent.id}: run is true, but ${intent.card} has nothing &run=1 can press`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('every example matches its own pattern and its exampleUrl', () => {
  const problems = [];
  for (const intent of DATA.intents) {
    const m = new RegExp(intent.pattern, 'i').exec(intent.example);
    if (!m) { problems.push(`${intent.id}: ${JSON.stringify(intent.example)} no longer matches`); continue; }
    if (!intent.exampleUrl) { problems.push(`${intent.id}: no exampleUrl`); continue; }
    const url = new URL(intent.exampleUrl);
    if (url.pathname !== '/tool.html') problems.push(`${intent.id}: exampleUrl is not a tool link`);
    if (url.searchParams.get('card') !== intent.card) problems.push(`${intent.id}: exampleUrl opens the wrong card`);
    for (const [name, value] of url.searchParams) {
      if (name === 'card' || name === 'run') continue;
      if (!(name in intent.fills)) problems.push(`${intent.id}: exampleUrl sets ${name}, which is not in fills`);
      else {
        const spec = String(intent.fills[name]).replace(/\?$/, '');
        if (/^\$\d+$/.test(spec)) {
          const group = m[Number(spec.slice(1))];
          const mapped = intent.map && intent.map[spec.slice(1)] ? intent.map[spec.slice(1)][String(group).toLowerCase()] : group;
          if (String(value) !== String(mapped)) {
            problems.push(`${intent.id}: exampleUrl has ${name}=${value}, the example gives ${mapped}`);
          }
        } else if (value !== spec) {
          problems.push(`${intent.id}: exampleUrl has ${name}=${value}, the intent sets ${spec}`);
        }
      }
    }
    if (!!intent.run !== url.searchParams.has('run')) {
      problems.push(`${intent.id}: exampleUrl and run disagree`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the shipped matcher builds exactly the published URL for every example', () => {
  const solveFor = matcher();
  const problems = [];
  for (const intent of DATA.intents) {
    const hit = solveFor(intent.example);
    if (!hit) { problems.push(`${intent.id}: the matcher does not solve its own example`); continue; }
    const got = new URL(hit.url, 'https://www.themostusefulsiteintheworld.com/');
    const want = new URL(intent.exampleUrl);
    const pairs = u => [...u.searchParams.entries()].sort().map(p => p.join('=')).join('&');
    if (pairs(got) !== pairs(want)) problems.push(`${intent.id}: built ${pairs(got)}, published ${pairs(want)}`);
    if (hit.url.length > DATA.limits.urlChars) problems.push(`${intent.id}: URL over the cap`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('optional parts of a sentence are optional, not empty fields', () => {
  const solveFor = matcher();
  const short = solveFor('loan 10000 at 6%');
  assert.ok(short, 'a loan without a term should still solve');
  assert.ok(short.url.includes('lc-amount=10000') && short.url.includes('lc-interest=6'),
    'amount and rate must be carried: ' + short.url);
  assert.ok(!short.url.includes('lc-term-slider'),
    'an absent term must leave the card\'s own default alone: ' + short.url);

  const long = solveFor('loan 10000 at 6% over 3 years');
  assert.ok(long && long.url.includes('lc-term-slider=3'), 'a stated term must be carried: ' + (long && long.url));

  const mortgage = solveFor('mortgage 250000 at 4.5%');
  assert.ok(mortgage && !mortgage.url.includes('mortgage-years'), 'no invented term: ' + (mortgage && mortgage.url));
});

test('the matcher stays quiet on ordinary searches', () => {
  const solveFor = matcher();
  const plain = [
    'bmi', 'percentage', 'mortgage', 'tip', 'salary', 'loan', 'json formatter', 'password',
    'mortgage calculator', 'the 20 best tools', '20% of', 'convert 180cm', '5 km',
    'days between monday and friday', 'born yesterday', '180cm', 'bmi 25', 'age 30',
    'compound', 'date calculator', 'x'.repeat(200), '', '   ', null, undefined
  ];
  const problems = [];
  for (const q of plain) {
    const hit = solveFor(q);
    if (hit) problems.push(`${JSON.stringify(q)} solved to ${hit.url}`);
  }
  assert.deepEqual(problems, [], 'the solve box answered questions it should have left alone:\n' + problems.join('\n'));
});

test('a keyword the destination does not accept is not a solve', () => {
  const solveFor = matcher();
  // The length pattern knows its units; a furlong is not one of them, and the
  // unit-converter-math card has no such option. Falling through to search is
  // the honest answer.
  assert.equal(solveFor('5 furlongs in miles'), null);
  assert.equal(solveFor('5 miles in parsecs'), null);
});

test('the data and the matcher agree about the contract they publish', () => {
  assert.equal(DATA.count, DATA.intents.length, 'count must be the number of intents');
  assert.match(DATA.version, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(DATA.limits && DATA.limits.urlChars >= 1000, 'the limits block explains the engine caps');
  for (const intent of DATA.intents) {
    assert.ok(intent.note && intent.note.length > 20, `${intent.id} needs a one-line note`);
    assert.ok(intent.title && intent.pattern && intent.example, `${intent.id} is missing a field`);
  }
});
