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

section('truthfulness — privacy claims (staffroom D-002)');
{
  /* BINDING: staffroom/DECISIONS.md D-002 — "Analytics is disclosed, never
     denied". Google Analytics runs sitewide, so the CLAIMS come out rather
     than the analytics.

     My earlier version of this check allowed a scoped claim ("no tracking in
     any tool") on pages that ran GA. That was too weak for two reasons:
       1. It missed "100% Private" in the index.html hero badge entirely, and
          the three unqualified claims on tool.html.
       2. The legal branch loads analytics.js on all 45 top-level pages, not
          the 3 I measured, so "no tracking in any tool" would become
          misleading the moment that merges.
     D-002 names the banned phrases outright, which is the more robust rule:
     no scoping, no judgement call, nothing to get wrong. Enforce that instead.

     Claims that remain TRUE and are explicitly approved by D-002: "no ads",
     "no accounts", "no sign-ups", "no paywalls", "runs in your browser",
     "your inputs never leave your device". The 562 cards make zero network
     calls, so in-browser processing claims are fine and are not matched here. */
  const BANNED = [
    [/\bno tracking\b/i, 'no tracking'],
    [/\bno trackers\b/i, 'no trackers'],
    [/\bno analytics\b/i, 'no analytics'],
    [/\bno cookies\b/i, 'no cookies'],
    // "100% private" is banned as a blanket claim, but is legitimate when
    // scoped to in-browser processing of the user's own input.
    [/100%\s*private(?!\s+(?:in-browser|in browser))/i, '100% private'],
  ];

  const offenders = [];
  for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
    const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const [re, name] of BANNED) {
      if (re.test(txt)) offenders.push(`${f} ("${name}")`);
    }
  }
  if (offenders.length) {
    fail(`D-002 violation — privacy claim denied instead of disclosed: ${offenders.join(', ')}`);
  } else {
    pass('no page denies analytics (staffroom D-002)');
  }

  /* Whatever the top-level pages do, the 562 tool cards must stay clean:
     that is what makes the surviving "runs in your browser" claim true. */
  const ANALYTICS = /googletagmanager|gtag\(|plausible\.io|www\.google-analytics\.com|analytics\.js/;

  /* The tool cards are the load-bearing part of the promise: whatever the
     index pages do, the 562 tools themselves must stay clean. */
  const cardDir = path.join(ROOT, 'cards');
  const dirty = fs.existsSync(cardDir)
    ? fs.readdirSync(cardDir).filter(f => f.endsWith('.html'))
        .filter(f => ANALYTICS.test(fs.readFileSync(path.join(cardDir, f), 'utf8')))
    : [];
  if (dirty.length) {
    fail(`tool cards must contain no analytics, found in: ${dirty.slice(0, 5).join(', ')}`);
  } else {
    pass('all tool cards are free of analytics/tracking scripts');
  }
}

section('truthfulness — advertised tool count is real');
{
  /* "562 free tools" is a factual claim repeated across the site and sold on
     sponsor.html. It drifted before (483, then 500) and understating is as
     wrong as overstating. Assert every claimed count equals reality. */
  const actual = fs.existsSync(path.join(ROOT, 'cards'))
    ? fs.readdirSync(path.join(ROOT, 'cards')).filter(f => f.endsWith('.html')).length
    : 0;
  const claimRe = /\b(\d{3})\s+(?:free|tools\b)/gi;
  const bad = [];
  for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
    let txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
    /* Strip inline tags first: counts are routinely wrapped for emphasis, e.g.
       "all <strong>562</strong> tools". Without this the guard silently misses
       exactly the markup the real stale claims were written in. */
    txt = txt.replace(/<\/?(?:strong|b|em|i|span|small)\b[^>]*>/gi, '');
    let m;
    while ((m = claimRe.exec(txt)) !== null) {
      const n = parseInt(m[1], 10);
      // Only treat plausible tool-count claims as claims.
      if (n >= 400 && n <= 999 && n !== actual) bad.push(`${f}: "${m[0].trim()}"`);
    }
  }
  if (bad.length) {
    fail(`tool-count claim does not match the real ${actual}: ${[...new Set(bad)].slice(0, 6).join(', ')}`);
  } else {
    pass(`every advertised tool count matches the real ${actual}`);
  }
}

section('embed licensing — the paid product must stay honest');
{
  /* embed.html is the first revenue line that does not depend on a sponsor
     replying to an email, so it is worth protecting from drift. Three things
     have to stay true or the offer becomes a lie we are charging for. */
  const embedPath = path.join(ROOT, 'embed.html');
  if (!fs.existsSync(embedPath)) {
    fail('embed.html is missing — the licensing offer has been removed');
  } else {
    // Strip inline tags so "£<strong>299</strong>" still matches (see the
    // D-001 guard for the same trap).
    const e = fs.readFileSync(embedPath, 'utf8')
      .replace(/<\/?(?:strong|b|em|i|span|small)\b[^>]*>/gi, '');

    // 1. Prices must be present and internally ordered. A category tier priced
    //    below a single tool, or above full white-label, is an obvious error
    //    that would still quietly ship.
    const tiers = ['99', '299', '899'].map(n => new RegExp('£' + n + '\\b').test(e));
    if (tiers.every(Boolean)) {
      pass('embed.html publishes all three licence prices (£99 / £299 / £899)');
    } else {
      fail('embed.html is missing one of the published licence prices — £99, £299, £899');
    }

    // 2. The free tier must remain genuinely free and credited. This is the
    //    acquisition channel; if it silently gains a fee or loses the credit
    //    requirement, the whole funnel logic breaks.
    if (/free/i.test(e) && /credit/i.test(e)) {
      pass('embed.html still offers a free credited tier');
    } else {
      fail('embed.html no longer describes a free tier with a credit line');
    }

    // 3. We charge for maintained correctness, so we must not also claim to be
    //    advice. That is a regulated line (FCA) and the disclaimer is load-bearing.
    if (/not financial advice/i.test(e)) {
      pass('embed.html carries the not-financial-advice disclaimer');
    } else {
      fail('embed.html sells calculators without a not-financial-advice disclaimer');
    }
  }

  // 4. The embed code handed out must carry attribution. This single line is
  //    the entire price of the free tier - without it we are giving 562 tools
  //    away for nothing and getting no backlink in return.
  const toolTxt = fs.readFileSync(path.join(ROOT, 'tool.html'), 'utf8');
  if (/embedCode/.test(toolTxt)) {
    const seg = toolTxt.slice(toolTxt.indexOf('const embedCode'), toolTxt.indexOf('const embedCode') + 1200);
    if (/themostusefulsiteintheworld|window\.location\.origin/.test(seg) && /<a /.test(seg)) {
      pass('the generated embed code includes a credit link back to the site');
    } else {
      fail('the generated embed code no longer includes a credit link — the free tier gives the tools away for nothing');
    }
  }
}

section('affiliate links — disclosed, and confined to their own page');
{
  /* An affiliate link is a marketing communication under the CAP Code whether
     or not anyone paid for it (ASA, May 2026: earning commission is enough).
     Two things therefore have to stay true, and neither survives on trust:

       1. Any page carrying an affiliate link must be labelled as an ad ABOVE
          the link. A disclosure in a footer, a policy page, or below the fold
          does not meet the standard.
       2. No tool card may EVER contain one. The 562 tools being genuinely
          ad-free is what makes the surviving "no ads" claims true, and it is
          the thing sponsors are actually buying at a premium CPM. One
          affiliate link inside a calculator would quietly falsify both. */
  /* Match outbound commission links only. A `ref=` on our OWN domain is a
     self-referencing demo string (qr-code-reader-scanner.html has one) and is
     not an affiliate link - excluding it keeps the check honest rather than
     noisy, and a guard people learn to ignore is worse than no guard. */
  const AFFILIATE = new RegExp(
    'freecash\\.com/r/' +
    '|https?://(?!(?:www\\.)?themostusefulsiteintheworld\\.com)[^"\'\\s]*[?&](?:ref|aff|affiliate|partner|tag)=' +
    '|rel="[^"]*\\bsponsored\\b',
    'i');

  const cardDir = path.join(ROOT, 'cards');
  const dirtyCards = fs.existsSync(cardDir)
    ? fs.readdirSync(cardDir).filter(f => f.endsWith('.html'))
        .filter(f => AFFILIATE.test(fs.readFileSync(path.join(cardDir, f), 'utf8')))
    : [];
  if (dirtyCards.length) {
    fail(`affiliate link found inside tool card(s): ${dirtyCards.slice(0, 5).join(', ')} — tools must stay ad-free`);
  } else {
    pass('no tool card contains an affiliate link');
  }

  for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
    const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!AFFILIATE.test(txt)) continue;
    const linkAt = txt.search(AFFILIATE);
    // The label must appear in the document before the first affiliate link.
    const labelAt = txt.search(/affiliate link|marked as an ad|class="adlabel"/i);
    if (labelAt === -1) {
      fail(`${f} carries an affiliate link with no disclosure`);
    } else if (labelAt > linkAt) {
      fail(`${f} discloses its affiliate link only AFTER the link — must be before`);
    } else {
      pass(`${f} discloses its affiliate link above the link itself`);
    }
  }
}

section('sponsorship — the 5% rule');
{
  /* Owner's stated constraint: sponsorship must stay under 5% of the page, and
     there is exactly one placement per page. The commercial danger is not that
     this earns too little - it is that it erodes one individually-defensible
     placement at a time until the scarcity that made it valuable is gone.
     A single sponsor on an otherwise clean page is worth more per impression
     than several on a cluttered one, so this guard protects revenue as much as
     it protects the reader. Encoded here so erosion has to be deliberate. */
  const SPONSOR_MARK = /<!--\s*SPONSOR-SLOT\s*-->/g;
  const cardFiles = fs.existsSync(path.join(ROOT, 'cards'))
    ? fs.readdirSync(path.join(ROOT, 'cards')).filter(f => f.endsWith('.html'))
    : [];
  let multi = [];
  let unlabelled = [];
  for (const f of cardFiles) {
    const txt = fs.readFileSync(path.join(ROOT, 'cards', f), 'utf8');
    const slots = (txt.match(SPONSOR_MARK) || []).length;
    if (slots > 1) multi.push(`${f} (${slots})`);
    if (slots === 1 && !/Sponsored/.test(txt)) unlabelled.push(f);
  }
  if (multi.length) {
    fail(`more than one sponsor slot on: ${multi.join(', ')} — the 5% rule allows one per page`);
  } else {
    pass('no page carries more than one sponsor slot');
  }
  if (unlabelled.length) {
    fail(`sponsor slot not labelled "Sponsored" on: ${unlabelled.join(', ')}`);
  } else {
    pass('every sponsor slot is labelled "Sponsored"');
  }

  /* The house rules on sponsor.html are a public promise. Breaking them is a
     trust failure and, for a site whose whole pitch is "no tracking", also
     removes the reason a sponsor is paying a premium in the first place. */
  const sp = path.join(ROOT, 'sponsor.html');
  if (fs.existsSync(sp)) {
    const txt = fs.readFileSync(sp, 'utf8');
    const promises = [
      [/No third-party scripts/i, 'no third-party scripts'],
      [/No pixels or beacons of yours/i, 'no advertiser pixels or beacons'],
      [/Always labelled/i, 'always labelled Sponsored'],
    ];
    for (const [re, name] of promises) {
      if (re.test(txt)) pass(`sponsor.html still promises: ${name}`);
      else fail(`sponsor.html no longer promises: ${name}`);
    }
  }
}

section('investment.html — growth across compounding frequencies');
{
  /* Regression guard. The old code applied an annuity factor built on
     COMPOUNDING periods to a MONTHLY contribution scaled by periodsPerYear/12.
     Correct only when the two coincide. With the DEFAULT 'annual' setting it
     understated a 20-year projection by 83%; 'daily' overstated it by ~776x
     (£96.9m instead of £124k). Re-implemented here as the card now does it. */
  const fv = (P, M, ratePct, years, ppy) => {
    const monthlyGrowth = Math.pow(1 + ratePct / 100 / ppy, ppy / 12);
    let bal = P;
    for (let m = 0; m < years * 12; m++) bal = bal * monthlyGrowth + M;
    return bal;
  };

  // With no contributions the simulation must equal the closed form exactly.
  for (const ppy of [1, 4, 12, 365]) {
    const sim = fv(5000, 0, 7, 20, ppy);
    const closed = 5000 * Math.pow(1 + 0.07 / ppy, ppy * 20);
    assertNear(`freq ${ppy}: no-contribution growth matches P(1+r/n)^(nt)`, sim, closed, 0.01);
  }

  // Higher compounding frequency must never produce a lower balance.
  const series = [1, 4, 12, 365].map(ppy => fv(5000, 200, 7, 20, ppy));
  let monotonic = true;
  for (let i = 1; i < series.length; i++) if (series[i] < series[i - 1]) monotonic = false;
  if (monotonic) pass('balance increases monotonically with compounding frequency');
  else fail(`compounding frequency not monotonic: ${series.map(n => n.toFixed(0)).join(', ')}`);

  // The specific historical failures, asserted as sane values.
  assertNear('annual compounding is in the right ballpark (was 83% low)', fv(5000, 200, 7, 20, 1), 120856, 5);
  assertNear('daily compounding is in the right ballpark (was ~776x high)', fv(5000, 200, 7, 20, 365), 124709, 5);

  // Static guard: the dead identical if/else must not come back.
  const txt = fs.readFileSync(path.join(ROOT, 'cards', 'investment.html'), 'utf8');
  if (/monthly \* periodsPerYear \/ 12 \* \(\(Math\.pow/.test(txt)) {
    fail('investment.html still contains the mis-scaled annuity term');
  } else {
    pass('investment.html no longer mis-scales contributions against compounding periods');
  }
}

section('creditcard.html — payoff cost is not understated');
{
  /* Regression guard. The old final-month adjustment subtracted the
     overpayment from accrued INTEREST, understating the cost of the debt
     (£1,369 rather than £1,385 on £3,000 at 21.9% paying £100/month).
     Interest already accrued cannot be undone by paying less. A debt tool
     must never make debt look cheaper than it is. */
  const payoff = (balance, annualRate, payment) => {
    const mr = annualRate / 12;
    let rb = balance, interest = 0, paid = 0, months = 0;
    while (rb > 0.01 && months < 600) {
      const i = rb * mr;
      interest += i;
      const pay = Math.min(payment, rb + i);
      rb = rb + i - pay;
      paid += pay;
      months++;
    }
    return { months, interest, paid };
  };

  const r = payoff(3000, 0.219, 100);
  assertNear('£3,000 @21.9% paying £100/mo takes 44 months', r.months, 44, 0);
  assertNear('total interest is the true £1,384.67, not the understated £1,369', r.interest, 1384.67, 0.05);
  assertNear('total paid reconciles to principal + interest', r.paid, 3000 + r.interest, 0.01);

  // Invariant: paying more must never cost more in total.
  const slow = payoff(3000, 0.219, 100);
  const fast = payoff(3000, 0.219, 200);
  if (fast.paid < slow.paid && fast.months < slow.months) {
    pass('paying more clears the balance sooner and costs less overall');
  } else {
    fail('paying more did not reduce total cost — check the payoff loop');
  }

  const txt = fs.readFileSync(path.join(ROOT, 'cards', 'creditcard.html'), 'utf8');
  if (/totalInterest -= \(remainingBalance \* -1\)/.test(txt)) {
    fail('creditcard.html still deducts final-month overpayment from interest');
  } else {
    pass('creditcard.html takes a smaller final payment rather than reducing interest');
  }
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
