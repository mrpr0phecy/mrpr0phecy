#!/usr/bin/env node
/**
 * build-intents.js — the home page's solve box: plain words → a prefilled tool.
 *
 * What this is
 * ------------
 * The hero search box takes a question ("20% of 340", "180cm 75kg") and, when
 * it recognises one, turns the status line into a link that opens the right
 * tool with those numbers already in it: `tool.html?card=bmi&bmi-height-input=180
 * &bmi-weight-input=75&run=1`. Nothing runs on the home page and nothing is
 * sent anywhere — the hit is an ordinary same-origin tool link, built in the
 * browser (AGENTS.md §3: the home page does not run tools).
 *
 * Why the patterns live here
 * --------------------------
 * Same reason the job definitions do: a pattern is a promise about ids. It
 * says "fill `pct-a`", and if that control is ever renamed, the link opens the
 * tool with an empty field — the failure is invisible until a visitor notices
 * the tool is not answering. `validate()` re-reads every card through
 * scripts/lib/card-fields.js on each build and fails on a missing field, an
 * unmatched group in an example, or a `run: true` whose card has no control
 * `&run=1` could press.
 *
 * Conservative on purpose: a pattern that fires on a query it should not is
 * worse than no pattern at all, because the visitor gets the wrong tool with
 * their numbers in it. Every pattern is anchored, needs its own keywords, and
 * unmatched text falls through to the normal search — a miss costs nothing.
 *
 * Output: intents.json (generated; never hand-edit). The matcher that reads it
 * lives in home-core.js (marker: SOLVE MATCHER) and is pinned to this data by
 * scripts/tests/intents.test.js.
 *
 * Usage:
 *   node scripts/build-intents.js
 *   node scripts/build-intents.js --check     # exit 1 if intents.json is stale
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { readCard, hasRunTrigger } = require('./lib/card-fields.js');

const ROOT = path.join(__dirname, '..');
const CARDS = path.join(ROOT, 'cards');
const OUT = path.join(ROOT, 'intents.json');
const BASE = 'https://www.themostusefulsiteintheworld.com';
const VERSION = new Date().toISOString().slice(0, 10);

// The engine's own caps (tool.html): a link that is not a link any more is
// worse than no link, so the builder refuses to publish an intent whose
// example cannot be carried.
const MAX_PARAMS = 40;
const MAX_VALUE = 512;
const MAX_URL = 1800;

const NUM = '(\\d+(?:\\.\\d+)?)';
const MONEY = '[£$€]?\\s*';
const WHEN = '(?:\\s*(?:over|for)\\s*(\\d{1,3})\\s*(?:years?|yrs?))?';
const ASK = '(?:what\\s+is\\s+|what\'s\\s+|how\\s+much\\s+is\\s+|calculate\\s+)?';
const END = '\\s*\\??\\s*';

const LENGTH_UNITS = {
  metre: 'm', metres: 'm', meter: 'm', meters: 'm', m: 'm',
  kilometre: 'km', kilometres: 'km', kilometer: 'km', kilometers: 'km', km: 'km',
  centimetre: 'cm', centimetres: 'cm', centimeter: 'cm', centimeters: 'cm', cm: 'cm',
  mile: 'mi', miles: 'mi', mi: 'mi',
  foot: 'ft', feet: 'ft', ft: 'ft'
};
const LENGTH_TOKEN = '(metres?|meters?|kilometres?|kilometers?|centimetres?|centimeters?|miles?|feet|foot|km|cm|mi|m|ft)';

/**
 * One intent. `fills` values are a literal or `$n` group references; a `?`
 * suffix means "only when that group matched" (an optional part of the
 * sentence, e.g. "over 25 years").
 */
const INTENTS = [
  {
    id: 'percent-of',
    card: 'percentage-calculator',
    title: 'Percentage Calculator',
    pattern: `^${ASK}${NUM}\\s*(?:%|percent)\\s+of\\s+${NUM}${END}$`,
    fills: { 'pct-a': '$1', 'pct-b': '$2', 'pct-mode': 'what' },
    run: true,
    example: '20% of 340',
    note: 'X% of Y — the answer is Y × X ÷ 100.'
  },
  {
    id: 'percent-off',
    card: 'percentage-calculator',
    title: 'Percentage Calculator',
    pattern: `^${ASK}${NUM}\\s*(?:%|percent)\\s+off\\s+${NUM}${END}$`,
    fills: { 'pct-mode': 'discount', 'pct-a': '$1', 'pct-b': '$2' },
    run: true,
    example: '15% off 80',
    note: 'X% off Y — the discounted price, not just the saving.'
  },
  {
    id: 'percent-change',
    card: 'percentage-change-calculator',
    title: 'Percentage Change Calculator',
    pattern: `^(?:what\\s+is\\s+the\\s+)?(?:percentage|percent)\\s+(?:change|increase|difference)\\s+from\\s+${NUM}\\s+to\\s+${NUM}${END}$`,
    fills: { 'pct-from': '$1', 'pct-to': '$2' },
    run: true,
    example: 'percentage change from 40 to 55',
    note: 'Old value → new value, as a percentage up or down.'
  },
  {
    id: 'tip-percent-first',
    card: 'tip-calculator',
    title: 'Tip Calculator',
    pattern: `^${ASK}(?:a\\s+)?${NUM}\\s*(?:%|percent)\\s+tip\\s+(?:on|for)\\s+(?:a\\s+)?${NUM}${END}$`,
    fills: { 'tc-tip-percent': '$1', 'tc-bill': '$2' },
    run: true,
    example: '15% tip on 62',
    note: 'The bill plus the tip, and the total.'
  },
  {
    id: 'tip-bill-first',
    card: 'tip-calculator',
    title: 'Tip Calculator',
    pattern: `^(?:tip|service)\\s+(?:of\\s+)?${NUM}\\s*(?:%|percent)\\s+(?:on|for)\\s+(?:a\\s+)?${NUM}${END}$`,
    fills: { 'tc-tip-percent': '$1', 'tc-bill': '$2' },
    run: true,
    example: 'tip 15% on 62',
    note: 'Same tool, the other word order.'
  },
  {
    id: 'bmi',
    card: 'bmi',
    title: 'BMI Calculator',
    pattern: `^(?:my\\s+)?(?:bmi\\s+)?${NUM}\\s*(?:cm|centimetres?|centimeters?)\\s*(?:and|,)?\\s*(?:my\\s+)?${NUM}\\s*(?:kg|kilos?|kilograms?)${END}$`,
    fills: { 'bmi-height-input': '$1', 'bmi-weight-input': '$2' },
    run: true,
    example: '180cm 75kg',
    note: 'Both units are required — a bare pair of numbers is a guess, not a solve.'
  },
  {
    id: 'length',
    card: 'unit-converter-math',
    title: 'Length Converter',
    pattern: `^(?:convert\\s+)?${NUM}\\s*${LENGTH_TOKEN}\\s+(?:in|to|into)\\s+${LENGTH_TOKEN}${END}$`,
    fills: { 'uc-v': '$1', 'uc-f': '$2', 'uc-t': '$3' },
    map: { 2: LENGTH_UNITS, 3: LENGTH_UNITS },
    run: true,
    example: '5 km in miles',
    note: 'Length only: this card\'s unit list is fixed and known, so every value here is one it accepts.'
  },
  {
    id: 'mortgage',
    card: 'mortgage',
    title: 'Mortgage Calculator',
    pattern: `^(?:mortgage|home\\s+loan)\\s+(?:of\\s+)?${MONEY}${NUM}\\s*(?:at|@)\\s*${NUM}\\s*(?:%|percent)${WHEN}${END}$`,
    fills: { 'mortgage-price': '$1', 'mortgage-rate': '$2', 'mortgage-years': '$3?' },
    run: true,
    example: 'mortgage 250000 at 4.5% over 25 years',
    note: 'The monthly repayment for a price and a rate; the term defaults to the card\'s own when the sentence does not give one.'
  },
  {
    id: 'loan',
    card: 'loan',
    title: 'Loan Calculator',
    pattern: `^loan\\s+(?:of\\s+)?${MONEY}${NUM}\\s*(?:at|@)\\s*${NUM}\\s*(?:%|percent)${WHEN}${END}$`,
    fills: { 'lc-amount': '$1', 'lc-interest': '$2', 'lc-term-slider': '$3?' },
    run: true,
    example: 'loan 10000 at 6% over 3 years',
    note: 'Amount, rate, and the term slider when the sentence gives years.'
  },
  {
    id: 'compound',
    card: 'compoundinterest',
    title: 'Compound Interest Calculator',
    pattern: `^compound(?:\\s+interest)?\\s+(?:on\\s+)?${MONEY}(\\d{2,9})\\s*(?:at|@)\\s*${NUM}\\s*(?:%|percent)${WHEN}${END}$`,
    fills: { 'ci-principal': '$1', 'ci-annual-rate': '$2', 'ci-years': '$3?' },
    run: true,
    example: 'compound 1000 at 5% for 10 years',
    note: 'A lump sum left to grow; no monthly contribution is assumed.'
  },
  {
    id: 'take-home',
    card: 'salary',
    title: 'Take-Home Pay Calculator',
    pattern: `^(?:take\\s*home|salary|pay)\\s+(?:on\\s+|of\\s+)?${MONEY}(\\d{4,7})(?:\\s*(?:a|per)\\s+year)?${END}$`,
    fills: { 'sc-gross': '$1' },
    run: true,
    example: 'take home on 45000',
    note: 'The card\'s own country and currency defaults apply; the visitor can change them.'
  },
  {
    id: 'born',
    card: 'age-calculator',
    title: 'Age Calculator',
    pattern: `^(?:how\\s+old\\s+am\\s+i\\s+)?(?:if\\s+i\\s+was\\s+)?born\\s+(?:on\\s+)?(\\d{4}-\\d{2}-\\d{2})${END}$`,
    fills: { 'aced-dob': '$1' },
    // No &run=1: this card recalculates on the date control's own input event,
    // which filling the link already fires. Pressing anything would be theatre.
    run: false,
    example: 'born 1990-05-01',
    note: 'Needs a full ISO date — the date control refuses anything else — and the card recalculates as soon as it is set.'
  },
  {
    id: 'days-between',
    card: 'datecalc',
    title: 'Date Calculator',
    pattern: `^(?:days|difference|how\\s+many\\s+days)\\s+between\\s+(\\d{4}-\\d{2}-\\d{2})\\s+and\\s+(\\d{4}-\\d{2}-\\d{2})${END}$`,
    fills: { 'dc-start': '$1', 'dc-end': '$2' },
    run: true,
    example: 'days between 2026-01-01 and 2026-03-01',
    note: 'Two ISO dates; the card does the calendar maths.'
  }
];

/* ---------------------------------------------------------------- helpers -- */
function cardSource(slug) {
  return fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8');
}

function groupCount(pattern) {
  // Count capturing groups without running the regex against anything. The
  // pattern is authored here, not by a visitor, so this only has to be right
  // about this file's own syntax.
  let count = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern[i] !== '(') continue;
    let escaped = false;
    for (let j = i - 1; j >= 0 && pattern[j] === '\\'; j -= 1) escaped = !escaped;
    if (escaped) continue;
    if (pattern[i + 1] !== '?' || pattern[i + 2] === '<') {
      // `(?` starts a non-capturing group, lookahead or flags; `(?<` is a named
      // group, which does capture — this file does not use one, but counting it
      // costs nothing.
      count += 1;
    }
  }
  return count;
}

function urlFor(intent) {
  const pairs = [];
  const m = new RegExp(intent.pattern, 'i').exec(intent.example);
  if (!m) return null;
  for (const id of Object.keys(intent.fills)) {
    const spec = String(intent.fills[id]).replace(/\?$/, '');
    if (!spec.startsWith('$')) { pairs.push([id, spec]); continue; }   // a literal the intent always sets
    const n = Number(spec.replace(/[^0-9]/g, ''));
    if (m[n] === undefined) continue;                 // optional part, absent
    let value = m[n];
    if (intent.map && intent.map[n]) value = intent.map[n][String(value).toLowerCase()] || value;
    pairs.push([id, value]);
  }
  if (!pairs.length) return null;
  let url = `${BASE}/tool.html?card=${encodeURIComponent(intent.card)}`;
  for (const [id, value] of pairs) {
    if (String(value).length > MAX_VALUE) return null;
    url += `&${encodeURIComponent(id)}=${encodeURIComponent(value)}`;
  }
  if (intent.run) url += '&run=1';
  return url.length + 1 > MAX_URL || pairs.length > MAX_PARAMS ? null : url;
}

/* -------------------------------------------------------------- validation -- */
function validate() {
  const problems = [];
  const notes = [];
  const seenIds = new Set();
  const seenPatterns = new Map();
  const cards = new Map();

  for (const intent of INTENTS) {
    const at = `${intent.id}`;
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(intent.id)) problems.push(`${at}: id is not a slug`);
    if (seenIds.has(intent.id)) problems.push(`${at}: duplicate id`);
    seenIds.add(intent.id);
    if (!intent.title) problems.push(`${at}: no title`);

    let card = cards.get(intent.card);
    if (!card) {
      const file = path.join(CARDS, intent.card + '.html');
      if (!fs.existsSync(file)) {
        problems.push(`${at}: no card at cards/${intent.card}.html`);
        continue;
      }
      card = readCard(file);
      card.runs = hasRunTrigger(cardSource(intent.card));
      cards.set(intent.card, card);
    }

    let re;
    try { re = new RegExp(intent.pattern, 'i'); }
    catch (e) { problems.push(`${at}: pattern does not compile (${e.message})`); continue; }

    const groups = groupCount(intent.pattern);
    for (const [id, spec] of Object.entries(intent.fills)) {
      const clean = String(spec).replace(/\?$/, '');
      if (!card.fields.some(f => f.id === id)) {
        problems.push(`${at}: fills ${id}, which ${intent.card} does not expose`);
      }
      for (const ref of clean.match(/\$\d+/g) || []) {
        const n = Number(ref.slice(1));
        if (n < 1 || n > groups) problems.push(`${at}: ${id} refers to group ${n}, but the pattern has ${groups}`);
      }
      if (!/^\$\d+\??$/.test(String(spec)) && String(spec).length > 60) {
        problems.push(`${at}: ${id} has an implausibly long literal value`);
      }
    }

    const example = re.exec(intent.example);
    if (!example) {
      problems.push(`${at}: its own example ${JSON.stringify(intent.example)} does not match`);
      continue;
    }
    const url = urlFor(intent);
    if (!url) problems.push(`${at}: example produces no usable URL`);

    if (intent.run && !card.runs) {
      problems.push(`${at}: run is true, but ${intent.card} has no control that &run=1 can press`);
    }
    if (intent.map) {
      for (const [group, table] of Object.entries(intent.map)) {
        const n = Number(group);
        const raw = example[n];
        if (raw === undefined) { problems.push(`${at}: map for group ${n}, which its example does not give`); continue; }
        if (!table[String(raw).toLowerCase()]) problems.push(`${at}: map has no entry for ${JSON.stringify(raw)}`);
        const select = card.fields.find(f => f.options && f.options.length && String(f.id).endsWith('-f'));
        const selectTo = card.fields.find(f => f.options && f.options.length && String(f.id).endsWith('-t'));
        for (const value of Object.values(table)) {
          if (select && !select.options.includes(value)) problems.push(`${at}: map produces ${value}, which ${select.id} does not offer`);
          if (selectTo && !selectTo.options.includes(value)) problems.push(`${at}: map produces ${value}, which ${selectTo.id} does not offer`);
        }
      }
    }

    const key = intent.pattern;
    if (seenPatterns.has(key)) problems.push(`${at}: the pattern is identical to ${seenPatterns.get(key)}`);
    seenPatterns.set(key, intent.id);

    if (!intent.note) notes.push(`${at}: no note (the published file explains each route in one line)`);
  }

  return { problems, notes };
}

/* ------------------------------------------------------------------ output -- */
function buildJson() {
  return JSON.stringify({
    version: VERSION,
    count: INTENTS.length,
    about: 'Deterministic routing for the home page\'s solve box: a query that matches a pattern becomes a link to that tool with the values filled in. Nothing is sent anywhere — the match and the URL are built in the visitor\'s browser, and anything not matched falls through to the normal catalogue search. Every field id and every &run=1 is validated against the card at build time.',
    url: `${BASE}/intents.json`,
    limits: { params: MAX_PARAMS, valueChars: MAX_VALUE, urlChars: MAX_URL },
    intents: INTENTS.map(intent => ({
      id: intent.id,
      title: intent.title,
      card: intent.card,
      pattern: intent.pattern,
      fills: intent.fills,
      ...(intent.map ? { map: intent.map } : {}),
      run: !!intent.run,
      example: intent.example,
      exampleUrl: urlFor(intent),
      note: intent.note
    }))
  }, null, 2) + '\n';
}

function main() {
  const { problems, notes } = validate();
  for (const note of notes) console.log('  note: ' + note);
  if (problems.length) {
    console.error('intents FAILED — ' + problems.length + ' problem(s):');
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
  }
  const text = buildJson();
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (process.argv.includes('--check')) {
    if (current !== text) {
      console.error('FAIL: intents.json is stale — run: node scripts/build-intents.js');
      process.exit(1);
    }
    console.log(`intents OK — ${INTENTS.length} routes, all references verified against cards/`);
    return;
  }
  if (current === text) {
    console.log(`intents OK — ${INTENTS.length} routes already up to date`);
    return;
  }
  fs.writeFileSync(OUT, text);
  console.log(`✔ intents.json (${text.length} bytes) — ${INTENTS.length} routes`);
}

if (require.main === module) main();

module.exports = { INTENTS, validate, buildJson, urlFor };
