'use strict';
// Regression vectors for the decisions Russell approved on 2026-10-18 ("fix it all").
// Expected values were derived independently of the cards:
//   burn fluids   70 kg, 40 %TBSA, 2 mL/kg/% = 5,600 mL; first half 2,800 mL, standard 350 mL/h.
//                 3 h gone: 2,800 / 5 = 560 mL/h (unchanged, under the 2x cap of 700 mL/h).
//                 1,000 mL already given at 3 h: 1,800 / 5 = 360 mL/h.
//                 6 h gone: 2,800 / 2 = 1,400 mL/h would be needed -> capped at 700 mL/h with a warning.
//                 8 h or later: no catch-up; 8-24 h rate 2,800 / 16 = 175 mL/h (old card: 11,200 mL/h).
//   notice period corresponding-date rule (Dodds v Walker [1981]): notice 28 Feb 2026 + 1 month,
//                 counted from the next day, ends 28 Mar 2026 (not 31 Mar); 30 Sep 2026 ends 30 Oct;
//                 31 Jan ends 28 Feb; including the day of notice, 1 Oct ends 31 Oct.
//   resistor code IEC 60062: no tolerance band = ±20%, so brown black red + none = 1 kΩ, 800 Ω to 1.2 kΩ;
//                 grey multiplier ×10^8; values in kilohms are written kΩ, not KΩ.
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
  const html = '<div class="card">' + fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8') + '</div>';
  const w = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/' }).window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  return w;
}
function input(w, id, value) {
  const e = w.document.getElementById(id);
  assert.ok(e, 'no #' + id);
  e.value = String(value);
  e.dispatchEvent(new w.Event('input', { bubbles: true }));
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
const text = (w, id) => w.document.getElementById(id).textContent.replace(/\s+/g, ' ').trim();
const longDate = (y, m, d) => new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

test('burn fluids: fluid already given, capped catch-up, no catch-up after 8 hours', { skip }, () => {
  const w = mount('clinical-fluid-requirements-calculator');
  w.document.querySelector('[data-cfmode="burn"]').click();
  input(w, 'clinfluid-bwt', 70); input(w, 'clinfluid-mult', 2); input(w, 'clinfluid-tbsa', 40);
  input(w, 'clinfluid-since', 0); input(w, 'clinfluid-given', 0);
  assert.match(text(w, 'clinfluid-out'), /Start rate ?350 mL\/hour/);
  input(w, 'clinfluid-since', 3);
  assert.match(text(w, 'clinfluid-out'), /Start rate ?560 mL\/hour/);
  input(w, 'clinfluid-given', 1000);
  assert.match(text(w, 'clinfluid-out'), /Start rate ?360 mL\/hour/);
  input(w, 'clinfluid-given', 0); input(w, 'clinfluid-since', 6);
  let o = text(w, 'clinfluid-out');
  assert.match(o, /Start rate ?700 mL\/hour/, 'catch-up is capped at twice the standard rate');
  assert.match(o, /do not bolus to catch up/);
  assert.doesNotMatch(o, /Start rate ?1400/);
  for (const h of [8, 10]) {
    input(w, 'clinfluid-since', h);
    o = text(w, 'clinfluid-out');
    assert.doesNotMatch(o, /Start rate/, 'no catch-up rate at ' + h + ' h');
    assert.doesNotMatch(o, /11200 mL\/hour|2800 mL in the/);
    assert.match(o, /Rate now \(8–24 h phase\) ?175 mL\/hour/);
    assert.match(o, /contact a burns centre now/);
  }
  input(w, 'clinfluid-since', 24);
  assert.match(text(w, 'clinfluid-out'), /first 24 hours after the burn only/);
  w.close();
});

test('notice period: corresponding-date rule, no last-day-of-month shortcut', { skip }, () => {
  const w = mount('notice-period-end-date-calculator');
  const run = (given, n, unit, inc) => {
    input(w, 'ntce-given', given); input(w, 'ntce-n', n); input(w, 'ntce-u', unit); input(w, 'ntce-inc', inc);
    return text(w, 'ntce-out');
  };
  assert.ok(run('2026-02-28', 1, 'month', 'after').includes('Last day (inclusive)' + longDate(2026, 3, 28)), '28 Feb + 1 month ends 28 Mar');
  assert.ok(run('2026-09-30', 1, 'month', 'after').includes('Last day (inclusive)' + longDate(2026, 10, 30)), '30 Sep + 1 month ends 30 Oct');
  assert.ok(run('2026-01-31', 1, 'month', 'after').includes('Last day (inclusive)' + longDate(2026, 2, 28)), '31 Jan + 1 month ends 28 Feb');
  assert.ok(run('2026-10-01', 1, 'month', 'same').includes('Last day (inclusive)' + longDate(2026, 10, 31)), '1 Oct inclusive ends 31 Oct');
  assert.ok(run('2026-01-31', 1, 'month', 'same').includes('Last day (inclusive)' + longDate(2026, 2, 28)));
  assert.ok(run('2026-11-30', 3, 'month', 'after').includes('Last day (inclusive)' + longDate(2027, 2, 28)), '30 Nov + 3 months clamps to 28 Feb');
  w.close();
});

test('resistor colour code: no-band ±20% tolerance, grey multiplier, kΩ', { skip }, () => {
  const w = mount('resistor-color-code');
  input(w, 'rcc-mode', 4); w.rccUpdateBands();
  const set = cols => cols.forEach((c, i) => { w.document.getElementById('rcc-band-' + (i + 1)).value = c; });
  set(['brown', 'black', 'red', 'none']);
  assert.equal(w.document.getElementById('rcc-band-4').value, 'none', 'no-band option exists');
  w.rccCalculate();
  assert.equal(text(w, 'rcc-nominal'), '1 kΩ');
  assert.equal(text(w, 'rcc-tolerance'), '±20%');
  assert.equal(text(w, 'rcc-range'), '800 Ω – 1.2 kΩ');
  set(['brown', 'black', 'gray', 'gold']);
  assert.equal(w.document.getElementById('rcc-band-3').value, 'gray', 'grey multiplier exists');
  w.rccCalculate();
  assert.equal(text(w, 'rcc-nominal'), '1 GΩ');
  w.close();
});
