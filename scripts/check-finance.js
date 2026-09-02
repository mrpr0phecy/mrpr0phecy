#!/usr/bin/env node
/* check-finance.js — correctness tests for the money tools in cards/.
 *
 * Why this exists
 * ---------------
 * A finance calculator that is merely *plausible* is worse than no calculator
 * at all: people act on the number. These tools are indexed by search engines
 * and linked from a page that promises they are useful, so the arithmetic has
 * to be defensible against the statutory source, not against intuition.
 *
 * Each test computes the expected value from an INDEPENDENT implementation
 * written from the published HMRC/SLC rules, then compares it against the
 * function actually shipped in the card. Copying the card's own logic into
 * the test would prove nothing.
 *
 * Statutory basis: 2026/27 tax year (England, Wales & Northern Ireland).
 *   Personal allowance      £12,570   (frozen to April 2028)
 *   Basic rate 20%          to £50,270
 *   Higher rate 40%         to £125,140
 *   Additional rate 45%     above £125,140
 *   PA taper                £1 per £2 of income above £100,000
 *   Class 1 employee NI     8% £12,570–£50,270, then 2%
 *
 * Run:  node scripts/check-finance.js
 * Exit: 0 = all pass, 1 = at least one failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let checks = 0;

const red = s => `\x1b[31m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;

function section(name) { console.log(`\n${bold('== ' + name)}`); }
function pass(msg) { checks++; console.log(`  ${green('OK')}   ${msg}`); }
function fail(msg) { checks++; failures++; console.log(`  ${red('FAIL')} ${msg}`); }

function assertNear(label, actual, expected, tol = 1) {
  if (Number.isFinite(actual) && Math.abs(actual - expected) <= tol) {
    pass(`${label}: ${actual}`);
  } else {
    fail(`${label}: got ${actual}, expected ${expected}`);
  }
}

/* Pull a slice of <script> logic out of a card and evaluate it in a sandbox.
   The cards are HTML fragments with inline script; there is no build step and
   no module system, so extraction by marker is the pragmatic approach. */
function loadCard(file, startMarker, endMarker) {
  const src = fs.readFileSync(path.join(ROOT, 'cards', file), 'utf8');
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`${file}: could not locate ${JSON.stringify(startMarker)} .. ${JSON.stringify(endMarker)} — has the file been restructured?`);
  }
  const sandbox = { console, Math, Number, Infinity, Intl, Date, __exports: {} };
  vm.createContext(sandbox);
  // `const`/`let` at the top level of a vm script do not become properties of
  // the sandbox object, so name them explicitly on the way out.
  const wanted = ['TAX_PERSONAL_ALLOWANCE', 'NI_BANDS', 'taxBandsFor', 'taxCalculateProgressive',
                  'scUkTaxBrackets', 'scUkNationalInsurance', 'scStudentLoan', 'SC_STUDENT_PLANS'];
  const epilogue = '\n' + wanted
    .map(n => `try { __exports[${JSON.stringify(n)}] = ${n}; } catch (e) {}`)
    .join('\n');
  vm.runInContext(src.slice(start, end) + epilogue, sandbox, { filename: file });
  return Object.assign(sandbox, sandbox.__exports);
}

/* ------------------------------------------------------------------ *
 * Reference implementations — written from the statutory rules only.  *
 * ------------------------------------------------------------------ */

/* Note the basic rate band is a £37,700 WIDTH sitting on top of whatever
   personal allowance survives the taper — so the 40% starting point slides
   down from £50,270 as income passes £100,000. */
function refIncomeTax(income) {
  const taper = Math.min(12570, Math.max(0, Math.floor(Math.max(0, income - 100000) / 2)));
  const pa = 12570 - taper;
  const higherStart = pa + 37700;
  let t = 0;
  t += Math.max(0, Math.min(income, higherStart) - pa) * 0.20;
  t += Math.max(0, Math.min(income, 125140) - higherStart) * 0.40;
  t += Math.max(0, income - 125140) * 0.45;
  return Math.round(t);
}

function refEmployeeNI(income) {
  return Math.round(
    Math.max(0, Math.min(income, 50270) - 12570) * 0.08 +
    Math.max(0, income - 50270) * 0.02
  );
}

/* ------------------------------------------------------------------ *
 * tax.html — UK income tax + National Insurance                       *
 * ------------------------------------------------------------------ */

section('tax.html — income tax & National Insurance (2026/27, rUK)');
try {
  const tax = loadCard('tax.html', 'const TAX_PERSONAL_ALLOWANCE', '// Adjust salary with quick buttons');

  // Sweep the whole realistic salary range against the reference. A sweep
  // catches boundary/off-by-one errors that spot checks miss — which is
  // exactly the class of bug that previously made this tool overstate tax.
  let mismatches = [];
  for (let s = 0; s <= 200000; s += 97) {
    const gotTax = tax.taxCalculateProgressive(s, tax.taxBandsFor(s));
    const gotNI = tax.taxCalculateProgressive(s, tax.NI_BANDS);
    if (Math.abs(gotTax - refIncomeTax(s)) > 1) mismatches.push(`£${s} tax ${gotTax} vs ${refIncomeTax(s)}`);
    if (Math.abs(gotNI - refEmployeeNI(s)) > 1) mismatches.push(`£${s} NI ${gotNI} vs ${refEmployeeNI(s)}`);
  }
  if (mismatches.length === 0) pass('sweep £0–£200,000 matches statutory reference (2,062 points)');
  else fail(`sweep: ${mismatches.length} mismatches, first: ${mismatches.slice(0, 3).join('; ')}`);

  // Named anchor cases, hand-checked against HMRC published rates.
  const anchors = [
    [12570, 0, 0],            // exactly the personal allowance / primary threshold
    [20000, 1486, 594],       // typical basic-rate salary
    [35000, 4486, 1794],
    [50270, 7540, 3016],      // top of basic rate
    [60000, 11432, 3210],
    [100000, 27432, 4010],    // taper starts
    [125140, 42516, 4513],    // allowance fully withdrawn
    [150000, 53703, 5011],
  ];
  for (const [salary, expTax, expNI] of anchors) {
    assertNear(`£${salary.toLocaleString()} income tax`, tax.taxCalculateProgressive(salary, tax.taxBandsFor(salary)), expTax);
    assertNear(`£${salary.toLocaleString()} employee NI`, tax.taxCalculateProgressive(salary, tax.NI_BANDS), expNI);
  }

  // The 60% trap: £100,000 -> £100,100 must cost £60 in tax, not £40.
  const t100 = tax.taxCalculateProgressive(100000, tax.taxBandsFor(100000));
  const t101 = tax.taxCalculateProgressive(100100, tax.taxBandsFor(100100));
  assertNear('marginal tax on £100 earned at £100k (the 60% taper)', t101 - t100, 60);

  // Below the allowance nobody pays anything.
  assertNear('£10,000 income tax', tax.taxCalculateProgressive(10000, tax.taxBandsFor(10000)), 0);
  assertNear('£0 income tax', tax.taxCalculateProgressive(0, tax.taxBandsFor(0)), 0);
} catch (e) {
  fail(`could not evaluate tax.html — ${e.message}`);
}

/* ------------------------------------------------------------------ *
 * salary.html — NI banding and student loan thresholds                *
 * ------------------------------------------------------------------ */

section('salary.html — National Insurance & student loan (UK, 2026/27)');
try {
  const sc = loadCard('salary.html', 'const SC_UK_PA', '// Country-specific tax brackets');

  // NI must be banded, not a flat percentage of gross. The old flat-12%
  // behaviour charged £2,400 on a £20,000 salary; the true figure is £594.
  for (const s of [10000, 12570, 20000, 35000, 50270, 60000, 100000]) {
    assertNear(`£${s.toLocaleString()} employee NI`, Math.round(sc.scUkNationalInsurance(s)), refEmployeeNI(s));
  }
  assertNear('NI below the primary threshold is nil', sc.scUkNationalInsurance(12000), 0);

  // Student loan: a percentage of income ABOVE the threshold only.
  assertNear('Plan 2 on £35,000', Math.round(sc.scStudentLoan(35000, 'plan2')), Math.round((35000 - 29385) * 0.09));
  assertNear('Plan 1 on £35,000', Math.round(sc.scStudentLoan(35000, 'plan1')), Math.round((35000 - 26900) * 0.09));
  assertNear('Plan 5 on £35,000', Math.round(sc.scStudentLoan(35000, 'plan5')), 900);
  assertNear('Postgraduate on £35,000', Math.round(sc.scStudentLoan(35000, 'pg')), 840);
  assertNear('Plan 2 below threshold repays nothing', sc.scStudentLoan(25000, 'plan2'), 0);
  assertNear('no plan selected repays nothing', sc.scStudentLoan(90000, 'none'), 0);

  // UK income tax table must taper like tax.html does.
  const bands = sc.scUkTaxBrackets(110000);
  const pa110 = bands[0].max;
  assertNear('personal allowance at £110,000 income', pa110, 7570);
} catch (e) {
  fail(`could not evaluate salary.html — ${e.message}`);
}

/* ------------------------------------------------------------------ *
 * salarycompare.html — take-home comparison                           *
 * ------------------------------------------------------------------ */

section('salarycompare.html — income tax, NI & loan thresholds');
try {
  const src = fs.readFileSync(path.join(ROOT, 'cards', 'salarycompare.html'), 'utf8');
  const start = src.indexOf('var PA = 12570');
  const end = src.indexOf('function money(');
  if (start === -1 || end === -1) throw new Error('markers not found');
  const sandbox = { console, Math, Number, Infinity, __exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end) +
    '\n__exports.incomeTax = incomeTax; __exports.nationalInsurance = nationalInsurance; __exports.LOANS = LOANS;',
    sandbox, { filename: 'salarycompare.html' });
  const sc = sandbox.__exports;

  for (const s of [20000, 60000, 110000, 125140, 150000]) {
    assertNear(`£${s.toLocaleString()} income tax`, Math.round(sc.incomeTax(s).tax), refIncomeTax(s));
    assertNear(`£${s.toLocaleString()} employee NI`, Math.round(sc.nationalInsurance(s)), refEmployeeNI(s));
  }
  // 2026/27 student loan thresholds, per SLC / Student Finance published tables.
  const expectedLoans = { '1': 26900, '2': 29385, '4': 33795, '5': 25000, 'pg': 21000 };
  for (const [k, v] of Object.entries(expectedLoans)) {
    assertNear(`loan plan ${k} threshold`, sc.LOANS[k].threshold, v, 0);
  }
} catch (e) {
  fail(`could not evaluate salarycompare.html — ${e.message}`);
}

/* ------------------------------------------------------------------ *
 * Static assertions across the money tools                            *
 * ------------------------------------------------------------------ */

section('money tools — stale statutory figures');
{
  // Any card presenting a tax year to the user should present a current one.
  // Rates change every April; a calculator labelled with a dead year is a
  // trust problem even when the frozen thresholds happen to still be right.
  // Only user-visible labels count — a comment noting "frozen since 2021/22"
  // is a factual reference, not a stale label, so comment lines are skipped.
  const STALE = /(?:tax (?:year|bands?|rates?)|bands?|rates?|thresholds?)[^\n]{0,20}20(1\d|2[0-5])\s*[-/]\s*2?\d/gi;
  const moneyCards = ['tax.html', 'salary.html', 'salarycompare.html', 'studentloan.html', 'retirement.html'];
  let stale = [];
  for (const f of moneyCards) {
    const p = path.join(ROOT, 'cards', f);
    if (!fs.existsSync(p)) continue;
    const body = fs.readFileSync(p, 'utf8')
      .split('\n')
      .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))   // drop comment lines
      .join('\n');
    const hits = (body.match(STALE) || []);
    if (hits.length) stale.push(`${f}: ${[...new Set(hits)].join(', ')}`);
  }
  if (stale.length === 0) pass('no stale tax-year labels in the money cards');
  else fail(`stale tax-year labels — ${stale.join(' | ')}`);
}

section('money tools — advice disclaimer present');
{
  // Anything that outputs a monetary decision needs to say it is not advice.
  // This is both good practice and, for regulated-adjacent topics, prudent.
  const needDisclaimer = ['tax.html', 'mortgage.html', 'retirement.html', 'investment.html',
                          'fire-financial-independence-calc.html', 'debtpayoff.html', 'studentloan.html'];
  let missing = [];
  for (const f of needDisclaimer) {
    const p = path.join(ROOT, 'cards', f);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf8').toLowerCase();
    const ok = /not (financial |tax |investment )?advice|estimate|guidance only|consult a|professional advice|indicative/.test(txt);
    if (!ok) missing.push(f);
  }
  if (missing.length === 0) pass('all checked money tools carry an estimate/advice caveat');
  else fail(`no advice caveat found in: ${missing.join(', ')}`);
}

/* ------------------------------------------------------------------ */

console.log('');
if (failures > 0) {
  console.log(red(`FINANCE CHECKS FAILED — ${failures} of ${checks} failed.`));
  process.exit(1);
}
console.log(green(`FINANCE CHECKS PASSED (${checks} checks).`));
process.exit(0);
