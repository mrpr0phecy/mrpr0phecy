// check-ymyl.js — extend the finance-test method to the highest-stakes
// non-finance calculators (P1-U1): sourced vectors, boundary sweeps and
// caveat guards. v1 covers BMI (WHO bands + formula) and the England
// tenancy-deposit cap (Tenant Fees Act 2019 rule as the card states it).
//
// Run with: node scripts/check-ymyl.js (exit 1 on failure)
'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

let failures = 0;
const pass = m => console.log('  ok   ' + m);
const fail = m => { failures++; console.log('  FAIL ' + m); };

// Extract a function by balanced-brace scan (cards are IIFE-wrapped; a
// naive closing-brace regex would stop early).
function grabFunction(src, name) {
  const head = 'function ' + name + '(';
  const start = src.indexOf(head);
  assert(start !== -1, 'missing ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

// ---- 1. BMI: WHO bands, formula, conversions, caveats ----------------------
console.log('== BMI (cards/bmi.html) — WHO classification');
{
  const src = fs.readFileSync('cards/bmi.html', 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext(grabFunction(src, 'bmiGetCategory'), ctx);
  const cat = vm.runInContext('bmiGetCategory', ctx);
  const name = bmi => JSON.parse(JSON.stringify(cat(bmi))).name;

  // Boundary sweep: every WHO threshold, both sides.
  const vectors = [
    [15.9, 'Severely Underweight'], [16, 'Moderately Underweight'],
    [16.9, 'Moderately Underweight'], [17, 'Mildly Underweight'],
    [18.4, 'Mildly Underweight'], [18.5, 'Normal Weight'],
    [24.9, 'Normal Weight'], [25, 'Overweight'],
    [29.9, 'Overweight'], [30, 'Obese Class I'],
    [34.9, 'Obese Class I'], [35, 'Obese Class II'],
    [39.9, 'Obese Class II'], [40, 'Obese Class III'],
  ];
  let bad = 0;
  for (const [bmi, want] of vectors) {
    if (name(bmi) !== want) { bad++; fail(`BMI ${bmi} -> ${name(bmi)}, want ${want}`); }
  }
  if (!bad) pass(vectors.length + ' WHO boundary vectors classify correctly');

  // Formula + conversions pinned to source (read and verified by a human).
  if (src.includes('weightKg / (heightM * heightM)')) pass('metric formula is kg/m^2');
  else fail('metric BMI formula not found');
  if (src.includes('/ 2.20462')) pass('pounds convert at 2.20462 kg/lb');
  else fail('lb->kg factor not found');
  if (src.includes('18.5 * (heightM * heightM)') && src.includes('24.9 * (heightM * heightM)')) {
    pass('healthy-weight range derives from 18.5/24.9 bands');
  } else fail('healthy-range derivation not found');

  // Caveats: screening framing + muscle limitation + share-text disclaimer.
  const caveats = ['screening tool, not a diagnostic', 'Muscle mass vs. body fat',
    'screening tool only. Consult healthcare professional'];
  const missing = caveats.filter(c => !src.includes(c));
  if (!missing.length) pass('screening caveats present (page, limits list, share text)');
  else fail('missing BMI caveats: ' + missing.join(' | '));

  // Worked anchor: 80 kg / 1.75 m = 26.1 Overweight (also on tools/bmi.html).
  const anchor = 80 / (1.75 * 1.75);
  if (anchor.toFixed(1) === '26.1' && name(anchor) === 'Overweight') {
    pass('worked anchor 80kg/1.75m = 26.1 Overweight');
  } else fail('worked anchor mismatch');
}

// ---- 2. Tenancy deposit cap (England) --------------------------------------
console.log('== deposit (cards/tenancy-deposit-calculator.html) — Tenant Fees Act rule');
{
  const src = fs.readFileSync('cards/tenancy-deposit-calculator.html', 'utf8');
  // The rule, pinned to source (verified against the card's stated England
  // basis): 5 weeks under £50k/yr annual rent, else 6; weekly = annual/52.
  const rules = ['annual < 50000 ? 5 : 6', 'annual / 52', 'weekly * weeks'];
  const missing = rules.filter(r => !src.includes(r));
  if (!missing.length) pass('cap rule pinned: 5/6 weeks at £50k, weekly=annual/52');
  else fail('cap rule drift: ' + missing.join(' | '));

  // Independent vectors for the rule (documentation of intent; the card's
  // arithmetic was read and verified, not executed here).
  const cap = annual => (annual / 52) * (annual < 50000 ? 5 : 6);
  const vectors = [[12000, 1153.85], [49999.99, 4807.69], [50000, 5769.23], [60000, 6923.08]];
  let bad = 0;
  for (const [annual, want] of vectors) {
    if (Math.abs(cap(annual) - want) > 0.01) { bad++; fail(`cap(${annual}) = ${cap(annual)}`); }
  }
  if (!bad) pass('cap vectors hold (£1k/mo->£1,153.85, £5k/mo->£6,923.08, £50k boundary)');

  // Jurisdiction + remedy honesty.
  if (src.includes('England rules') && src.includes('The rules (England)')) {
    pass('jurisdiction scoped to England');
  } else fail('England scoping missing');
  if (src.includes('prescribed information') && src.includes('1–3× the deposit')) {
    pass('protection/remedy guidance present');
  } else fail('remedy guidance missing');
}

if (failures) { console.log(`\nYMYL CHECKS FAILED — ${failures} failure(s).`); process.exit(1); }
console.log('\nYMYL checks passed.');
