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
                  'taxScottishBandsFor', 'taxBandsForRegion', 'SCOT_BANDS',
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
 * tax.html — Scottish income tax                                      *
 * ------------------------------------------------------------------ */

/* Independent reference for Scotland, written from the 2026/27 Scottish rate
   resolution as GROSS thresholds (the form the published tables use), rather
   than the cumulative taxable-slice widths the card stores. Deriving it a
   different way from the implementation is the point. */
function refScottishTax(income) {
  const taper = Math.min(12570, Math.max(0, Math.floor(Math.max(0, income - 100000) / 2)));
  const pa = 12570 - taper;
  const shift = pa - 12570;   // bands move down with a tapered allowance
  const edges = [
    [16537 + shift, 0.19],
    [29526 + shift, 0.20],
    [43662 + shift, 0.21],
    [75000 + shift, 0.42],
    [125140,        0.45],
    [Infinity,      0.48]
  ];
  let tax = 0, lower = pa;
  for (const [upper, rate] of edges) {
    tax += Math.max(0, Math.min(income, upper) - lower) * rate;
    lower = Math.max(lower, upper);
  }
  return tax;
}

section('tax.html — Scottish income tax (2026/27, six bands)');
try {
  const tax = loadCard('tax.html', 'const TAX_PERSONAL_ALLOWANCE', '// Adjust salary with quick buttons');
  const scot = s => tax.taxCalculateProgressive(s, tax.taxScottishBandsFor(s));

  // Published worked example: a Scottish taxpayer on £50,000 pays £8,982.05.
  assertNear('£50,000 Scottish income tax (published worked example)', scot(50000), 8982, 1);

  // Band-by-band anchors, computed from the Scottish rate resolution.
  assertNear('£12,570 (allowance only)', scot(12570), 0);
  assertNear('£16,537 (top of starter rate)', scot(16537), Math.round(3967 * 0.19));
  assertNear('£30,000', scot(30000), Math.round(refScottishTax(30000)));
  assertNear('£43,662 (top of intermediate)', scot(43662), Math.round(refScottishTax(43662)));
  assertNear('£75,000 (top of higher)', scot(75000), Math.round(refScottishTax(75000)));
  assertNear('£150,000 (top rate)', scot(150000), Math.round(refScottishTax(150000)));

  // Sweep against the independent reference.
  let bad = [];
  for (let s = 0; s <= 200000; s += 97) {
    if (Math.abs(scot(s) - refScottishTax(s)) > 1) bad.push(s);
  }
  if (bad.length === 0) pass('sweep £0–£200,000 matches Scottish reference (2,062 points)');
  else fail(`Scottish sweep: ${bad.length} mismatches, first at £${bad[0]}`);

  // Structural facts that distinguish Scotland from rUK.
  const ruk = s => tax.taxCalculateProgressive(s, tax.taxBandsFor(s));
  if (scot(20000) < ruk(20000)) pass(`£20,000: Scotland £${scot(20000)} < rUK £${ruk(20000)} (19% starter rate)`);
  else fail(`£20,000: expected Scotland to be cheaper, got ${scot(20000)} vs ${ruk(20000)}`);
  if (scot(50000) > ruk(50000)) pass(`£50,000: Scotland £${scot(50000)} > rUK £${ruk(50000)} (42% from £43,663)`);
  else fail(`£50,000: expected Scotland to be dearer, got ${scot(50000)} vs ${ruk(50000)}`);

  // The crossover sits around £33,500 — below it Scotland is cheaper.
  let crossover = null;
  for (let s = 12570; s <= 60000; s += 10) {
    if (scot(s) > ruk(s)) { crossover = s; break; }
  }
  if (crossover && crossover > 30000 && crossover < 37000) pass(`crossover point £${crossover.toLocaleString()} (expected ~£33,500)`);
  else fail(`crossover at £${crossover} — expected between £30,000 and £37,000`);

  // Region dispatch must actually switch tables.
  assertNear('region dispatch: scotland', tax.taxBandsForRegion(50000, 'scotland')[1].rate, 0.19, 0.001);
  assertNear('region dispatch: ruk', tax.taxBandsForRegion(50000, 'ruk')[1].rate, 0.20, 0.001);

  // NI is UK-wide: identical either side of the border.
  assertNear('NI is UK-wide (unchanged by region)', tax.taxCalculateProgressive(50000, tax.NI_BANDS), refEmployeeNI(50000));
} catch (e) {
  fail(`could not evaluate Scottish bands — ${e.message}`);
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
 * compoundinterest.html — growth engine                               *
 * ------------------------------------------------------------------ */

section('compoundinterest.html — compounding across all frequencies');
try {
  const src = fs.readFileSync(path.join(ROOT, 'cards', 'compoundinterest.html'), 'utf8');
  const start = src.indexOf('function ciCalculateFutureValue');
  const end = src.indexOf('function ciCalculateInflationAdjusted');
  if (start === -1 || end === -1) throw new Error('markers not found');
  const sandbox = { console, Math, Number, Infinity, __exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end) + '\n__exports.fv = ciCalculateFutureValue;',
    sandbox, { filename: 'compoundinterest.html' });
  const fv = sandbox.__exports.fv;

  /* Reference: monthly simulation, contribution at end of month
     (ordinary annuity), growth factor derived from the stated frequency. */
  function refFV(principal, annualRate, years, frequency, monthly, increase) {
    const periodic = annualRate / 100 / frequency;
    const g = Math.pow(1 + periodic, frequency / 12);
    let total = principal;
    for (let y = 1; y <= years; y++) {
      const amt = monthly * Math.pow(1 + increase / 100, y - 1);
      for (let m = 0; m < 12; m++) { total = total * g + amt; }
    }
    return total;
  }

  // No-contribution case has a closed form: P(1 + r/n)^(n*t). Any frequency.
  for (const freq of [1, 2, 4, 12, 52, 365]) {
    const got = fv(10000, 7, 10, freq, 0, 0).total;
    const want = 10000 * Math.pow(1 + 0.07 / freq, freq * 10);
    assertNear(`£10,000 @7% 10y, freq ${freq}, no contributions`, Math.round(got), Math.round(want), 2);
  }

  // With contributions, across the frequencies that were previously broken.
  for (const freq of [1, 2, 4, 12, 52]) {
    const got = fv(10000, 7, 10, freq, 500, 0).total;
    const want = refFV(10000, 7, 10, freq, 500, 0);
    assertNear(`£10,000 + £500/mo @7% 10y, freq ${freq}`, Math.round(got), Math.round(want), 2);
  }

  // Escalating contributions.
  assertNear('escalating contributions (3%/yr), freq 4',
    Math.round(fv(10000, 7, 10, 4, 500, 3).total),
    Math.round(refFV(10000, 7, 10, 4, 500, 3)), 2);

  /* Regression guard for the specific bug: annual compounding with
     contributions must report interest that reflects the contributions
     earning a return, not just interest on the opening balance. The old
     code reported exactly £700 here (7% of £10,000 and nothing else). */
  const y1 = fv(10000, 7, 1, 1, 500, 0).yearlyData[0];
  if (y1.interest > 800) pass(`year-1 interest with contributions: £${Math.round(y1.interest)} (old bug reported £700)`);
  else fail(`year-1 interest £${Math.round(y1.interest)} — contributions appear to earn nothing`);

  // Sanity: money in must never exceed money out at a positive rate.
  const r = fv(10000, 7, 20, 12, 500, 0);
  const paidIn = 10000 + 500 * 12 * 20;
  if (r.total > paidIn) pass(`20-year balance £${Math.round(r.total).toLocaleString()} exceeds £${paidIn.toLocaleString()} paid in`);
  else fail(`balance £${Math.round(r.total)} does not exceed contributions £${paidIn}`);
} catch (e) {
  fail(`could not evaluate compoundinterest.html — ${e.message}`);
}

/* ------------------------------------------------------------------ *
 * mortgage.html — amortisation & total cost of ownership              *
 * ------------------------------------------------------------------ */

section('mortgage.html — amortisation');
try {
  const src = fs.readFileSync(path.join(ROOT, 'cards', 'mortgage.html'), 'utf8');
  const start = src.indexOf('function mcCalculateAmortization');
  const end = src.indexOf('// Generate amortization schedule');
  if (start === -1 || end === -1) throw new Error('markers not found');
  const sandbox = { console, Math, Number, Infinity, __exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end) + '\n__exports.am = mcCalculateAmortization;',
    sandbox, { filename: 'mortgage.html' });
  const am = sandbox.__exports.am;

  // £250,000 over 25 years at 5%: standard annuity formula.
  const P = 250000, r = 0.05 / 12, n = 300;
  const instalment = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const base = am(P, r, n, 0);
  assertNear('£250k/25y/5% term (months)', base.payoffMonths, 300, 1);
  assertNear('£250k/25y/5% total interest', Math.round(base.totalInterest),
    Math.round(instalment * n - P), 60);
  // Total paid must equal principal + interest — the old code added the full
  // nominal instalment in the final month, overstating it.
  assertNear('total paid reconciles to principal + interest',
    Math.round(base.totalPayment), Math.round(P + base.totalInterest), 2);

  // Overpaying must shorten the term and cut interest.
  const over = am(P, r, n, 200);
  if (over.payoffMonths < base.payoffMonths && over.totalInterest < base.totalInterest) {
    pass(`£200/mo overpayment: ${base.payoffMonths}→${over.payoffMonths} months, saves £${Math.round(base.totalInterest - over.totalInterest).toLocaleString()}`);
  } else {
    fail('overpayment did not reduce term and interest');
  }
  assertNear('overpaid total reconciles', Math.round(over.totalPayment),
    Math.round(P + over.totalInterest), 2);

  // 0% interest: pure principal, exact term.
  const zero = am(120000, 0, 240, 0);
  assertNear('0% mortgage interest', Math.round(zero.totalInterest), 0);
  assertNear('0% mortgage term', zero.payoffMonths, 240, 1);

  // Total cost of ownership must carry tax/insurance for every year, not one.
  const body = src.slice(src.indexOf('const totalCost'), src.indexOf('const totalCost') + 200);
  if (/payoffYearsExact|\*\s*years|totalTax/.test(body)) pass('total cost scales tax & insurance over the term');
  else fail('total cost appears to add only one year of tax/insurance');
} catch (e) {
  fail(`could not evaluate mortgage.html — ${e.message}`);
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

section('money tools — no placebo controls');
{
  /* A control that changes a caption but not the arithmetic is worse than no
     control: it implies the tool models something it does not. debtpayoff.html
     shipped "Snowball" and "Avalanche" buttons that produced identical numbers
     on a single-balance calculator, where those multi-debt ordering strategies
     cannot apply at all. Guard against reintroduction. */
  const p = path.join(ROOT, 'cards', 'debtpayoff.html');
  if (fs.existsSync(p)) {
    const txt = fs.readFileSync(p, 'utf8');
    const hasButton = /dpSetStrategy\((['"])(snowball|avalanche)\1\)/.test(txt);
    const modelsIt = /sortedDebts|debts\.sort|byRate|byBalance/.test(txt);
    if (hasButton && !modelsIt) {
      fail('debtpayoff.html offers snowball/avalanche controls without modelling multiple debts');
    } else if (/Snowball vs Avalanche/i.test(txt)) {
      pass('debtpayoff.html explains snowball/avalanche instead of faking them');
    } else {
      pass('debtpayoff.html has no unmodelled strategy controls');
    }
  }
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
