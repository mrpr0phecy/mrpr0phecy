'use strict';
// Regression vectors from the 2026-10-10 accuracy audit. Expected values were
// derived independently of the cards:
//   pregnancy  Naegele: LMP + 280 calendar days, in Europe/London so a BST LMP
//              with a GMT due date (and vice versa) is exercised
//   SDLT       HMRC: a purchase under £40,000 carries no SDLT or 5% surcharge
//   eGFR       85F, 45 kg, 90 umol/L: CKD-EPI 2021 54, Cockcroft-Gault 28.7 mL/min
//              — the renal dosing table must mark the CrCl band, not only eGFR
//   notice     31 Jan + 1 month ends 28 Feb (not 2 March); first free day after 25 Oct 2026 is 26 Oct
//   quadratic  x² + 1e8x + 1: small root −1e-8 (not 0); steps show −b as 3, not −-3
process.env.TZ = 'Europe/London';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); } catch (_) {
  try { ({ JSDOM } = require('jsdom')); } catch (_) { JSDOM = null; }
}
const skip = !JSDOM && 'jsdom is not installed (see AGENTS.md §2)';
const CARDS = path.join(__dirname, '..', '..', 'cards');
function mount(slug) {
  return new JSDOM(fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8'), { runScripts: 'dangerously' }).window;
}
function input(w, id, value) {
  const e = w.document.getElementById(id);
  assert.ok(e, 'no #' + id);
  e.value = String(value);
  e.dispatchEvent(new w.Event('input', { bubbles: true }));
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
const text = (w, id) => w.document.getElementById(id).textContent.replace(/\s+/g, ' ');
const longDate = (y, m, d) => new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

test('pregnancy due date is LMP + 280 calendar days across BST/GMT changes', { skip }, () => {
  const w = mount('pregnancy-due-date-calculator');
  const cases = [
    ['lmp', '2026-01-10', [2026, 10, 17]],
    ['lmp', '2026-04-01', [2027, 1, 6]],
    ['lmp', '2026-06-01', [2027, 3, 8]],
    ['lmp', '2026-09-01', [2027, 6, 8]],
    ['ivf5', '2026-07-01', [2027, 3, 19]],
  ];
  for (const [method, date, due] of cases) {
    input(w, 'pdwc-method', method);
    input(w, 'pdwc-cycle', 28);
    input(w, 'pdwc-date', date);
    assert.equal(text(w, 'pdwc-due'), longDate(...due), method + ' ' + date);
  }
});

test('stamp duty: additional property under £40,000 owes nothing', { skip }, () => {
  const w = mount('uk-stamp-duty-calculator');
  input(w, 'uksdc-type', 'additional');
  input(w, 'uksdc-price', 30000); w.uksdcRun();
  assert.match(text(w, 'uksdc-out'), /SDLT due: £0(?![0-9,])/);
  input(w, 'uksdc-price', 300000); w.uksdcRun();
  assert.match(text(w, 'uksdc-out'), /SDLT due: £20,000(?![0-9,])/);
});

test('eGFR card marks the Cockcroft-Gault band when it differs from eGFR', { skip }, () => {
  const w = mount('egfr-creatinine-clearance-calculator');
  input(w, 'egfrx-unit', 'umol'); input(w, 'egfrx-sex', 'f');
  input(w, 'egfrx-age', 85); input(w, 'egfrx-weight', 45); input(w, 'egfrx-scr', 90);
  const out = text(w, 'egfrx-out');
  assert.match(out, /Check the SPC — many agents start needing a review here ← this patient \(eGFR\)/);
  assert.match(out, /avoid some agents entirely ← this patient \(CrCl\)/);
});

test('notice period: month ends clamp, and first free day survives the October clock change', { skip }, () => {
  const w = mount('notice-period-end-date-calculator');
  const run = (given, n, unit, inc) => {
    input(w, 'ntce-given', given); input(w, 'ntce-n', n); input(w, 'ntce-u', unit); input(w, 'ntce-inc', inc);
    return text(w, 'ntce-out');
  };
  let out = run('2026-01-31', 1, 'month', 'same');
  assert.ok(out.includes('Last day (inclusive)' + longDate(2026, 2, 28)), '31 Jan + 1 month must not overflow into March');
  out = run('2026-03-31', 1, 'month', 'same');
  assert.ok(out.includes('Last day (inclusive)' + longDate(2026, 4, 30)));
  out = run('2026-10-01', 1, 'month', 'same');
  assert.ok(out.includes('Last day (inclusive)' + longDate(2026, 10, 31)));
  out = run('2026-09-28', 4, 'week', 'same');
  assert.ok(out.includes('Last day (inclusive)' + longDate(2026, 10, 25)));
  assert.ok(out.includes('First day free' + longDate(2026, 10, 26)), 'first free day after the 25-hour Sunday');
});

test('quadratic solver: stable small root and clean step signs', { skip }, () => {
  const w = mount('quadratic-solver');
  assert.ok(!text(w, 'qdr-out').includes('−-'), 'default steps must not print −-3');
  input(w, 'qdr-a', 1); input(w, 'qdr-b', 1e8); input(w, 'qdr-c', 1);
  w.document.getElementById('qdr-go').click();
  const out = text(w, 'qdr-out');
  assert.match(out, /x₁ = -1e-8 /);
  assert.match(out, /x₂ = -100000000(?![0-9])/);
});
