#!/usr/bin/env node
'use strict';
// Run: node scripts/tests/fire-tools.test.js (jsdom installed in /tmp/tenv).
//
// The ten fire-service cards added 2026-09-21 produce numbers people drive
// apparatus, set pumps and commit crews against. `scripts/test-card.js` proves
// they mount and do not throw; it cannot prove that FL = C Q^2 L gives 69.75 psi
// for 200 ft of 1 3/4" at 150 gpm. So the formulas are driven here, in jsdom,
// through the real DOM: set the inputs, read the rendered output, compare
// against vectors recomputed from the published sources named in each card.
//
// Vectors, and where each one comes from:
//   fire flow   60x40 single storey, 50% involved -> NFA (2400/3)x0.5 = 400 gpm;
//               Iowa (2400x10)/100 = 240; ISO 18x1.5xsqrt(2400) = 1322.7.
//               Two exposed sides -> 400 x 1.5 = 600.
//   hydraulics  200 ft 1 3/4" at 150 gpm, fog, 1 floor up -> FL 15.5x2.25x2 =
//               69.75; PDP 100+69.75+5 = 174.75; NR 0.0505x150x10 = 75.75 lb.
//               Hand methods: 2 1/2" 2Q^2+Q, 3" Q^2, 4" Q^2/5, 5" Q^2/15 -- and
//               deliberately NOTHING for 1 3/4", which has no valid shortcut.
//   hydrant     72 static / 48 residual / 800 gpm -> 33% drop, NFPA 291 AFF =
//               800 x 52^0.54 / 24^0.54 = 1214; <10% drop must be rejected.
//   shuttle     2500 gal, 3 mi, 1000 gpm, 2 min make/break -> cycle 20.5 min,
//               TDR 2250/20.5x0.9 = 98.8 gpm, 500 gpm needs 6 tenders.
//   drafting    PC = (lift + intake FL)/2.3; NPDP = PDP + PC; theoretical lift
//               14.7/0.434 = 33.9 ft at sea level, -0.5 psi per 1000 ft of
//               elevation; derating 10 ft = 100%, 15 ft = 70%, 20 ft = 60%.
//   SCBA        NFPA 1970 EOSTI 34%/31%/29% for 2216/4500/5500 psi; turnaround
//               ((entry-EOSTI)/2)+EOSTI -> 4500 @25% = 2812.5; volume = rated
//               minutes x the NIOSH 40 L/min test consumption.
//   ladder      quarter rule -> acos(1/4) = 75.5 deg; reach = L x sin(75.5 deg)
//               = 0.968 L; measured butt 10 ft on a 24 ft ladder -> 65.4 deg.
//   WBGT        outdoor 0.7Tnwb+0.2Tg+0.1Tdb; ACGIH TLV/AL table cells
//               (moderate @25-50% -> 30.0 / 27.0; heavy @25-50% -> 29.0 / 25.5);
//               heavy work at 75-100% duty has NO published threshold.
//   hazmat      mg/m3 = ppm x MW / 24.45 -> 35 ppm CO = 40.1 mg/m3; general
//               molar volume 62.4(273.15+T)/P; %LEL = ppm/(LEL% x 10000) x 100.
//   foam        2000 ft2 x 0.10 = 200 gpm solution; x3% = 6 gal/min; x15 min =
//               90 gal concentrate, 3000 gal solution.
//
// jsdom is deliberately not a repository dependency (the site is zero-dep), so
// it lives outside the workspace. Without it this suite SKIPs loudly and exits
// 0, exactly like producer-tools.test.js:   mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); } catch (_) {
  try { ({ JSDOM } = require('jsdom')); } catch (e) {
    console.log('SKIP fire-tools: jsdom not installed (mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom)');
    process.exit(0);
  }
}
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const CARDS = path.join(__dirname, '..', '..', 'cards');

function mount(slug) {
  const dom = new JSDOM(fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8'), {
    runScripts: 'dangerously', pretendToBeVisual: false
  });
  return dom.window;
}
function input(w, id, value) {
  const e = w.document.getElementById(id);
  assert.ok(e, 'no #' + id);
  e.value = String(value);
  e.dispatchEvent(new w.Event('input', { bubbles: true }));
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
function click(w, selector) {
  const e = w.document.querySelector(selector);
  assert.ok(e, 'no ' + selector);
  e.click();
}
function text(w, id) {
  const e = w.document.getElementById(id);
  assert.ok(e, 'no #' + id);
  return e.textContent;
}
// Read the Nth result cell. Query the value element, never the container:
// jsdom textContent concatenates sibling divs with no separator, so a regex
// over the whole output will happily match a number from the label above.
function val(w, out, cls, n) {
  const list = w.document.querySelectorAll('#' + out + ' .' + cls + '-v');
  assert.ok(list.length > n, 'cell ' + n + ' missing, only ' + list.length + ' rendered');
  return list[n].textContent;
}
function num(w, out, cls, n) {
  const m = val(w, out, cls, n).match(/-?\d[\d,]*(\.\d+)?/);
  assert.ok(m, 'no number in cell ' + n + ': ' + val(w, out, cls, n));
  return parseFloat(m[0].replace(/,/g, ''));
}

(function run() {
  /* ---- 1. Required fire flow: NFA, Iowa and ISO, side by side ------------- */
  {
    const w = mount('required-fire-flow-calculator');
    // 60 x 40 ft, 10 ft ceiling, one floor, 50% involved, frame, ordinary.
    assert.equal(num(w, 'rff-out', 'rff', 0), 400, 'NFA (2400/3) x 1 floor x 0.50 = 400 gpm');
    assert.equal(num(w, 'rff-out', 'rff', 1), 240, 'Iowa (2400 x 10)/100 = 240 gpm');
    // 18 x 1.5 x sqrt(2400) = 1322.7, shown rounded to the nearest 10.
    assert.equal(num(w, 'rff-out', 'rff', 2), 1320, 'ISO 18 x 1.5 x 48.99 = 1322.7 -> 1320');
    assert.equal(num(w, 'rff-out', 'rff', 3), 2, '400 gpm at 250 gpm a line = 2 attack lines');
    assert.equal(num(w, 'rff-out', 'rff', 4), 4000, '400 gpm for 10 minutes = 4000 gal');

    // Exposure protection: 25% of the calculated flow per exposed side.
    input(w, 'rff-exp', 2);
    assert.equal(num(w, 'rff-out', 'rff', 0), 600, 'two exposed sides add 50% -> 600 gpm');
    assert.match(text(w, 'rff-out'), /Exposure protection adds 200 gpm/, 'the exposure charge is itemised');

    // Iowa does NOT scale with involvement -- that is the whole method.
    input(w, 'rff-exp', 0);
    input(w, 'rff-inv', 100);
    assert.equal(num(w, 'rff-out', 'rff', 0), 800, 'NFA at 100% involvement = 800 gpm');
    assert.equal(num(w, 'rff-out', 'rff', 1), 240, 'Iowa is unchanged by involvement');
    assert.match(text(w, 'rff-out'), /outside its design parameters/,
      '100% involvement is well past the NFA formula\'s design parameters');
    input(w, 'rff-inv', 25);
    assert.equal(num(w, 'rff-out', 'rff', 0), 200, 'NFA at 25% involvement = 200 gpm');
    assert.doesNotMatch(text(w, 'rff-out'), /outside its design parameters/,
      'and at 25% involvement the caveat must go away');

    // Two floors multiplies the NFA figure.
    input(w, 'rff-inv', 50); input(w, 'rff-floors', 2);
    assert.equal(num(w, 'rff-out', 'rff', 0), 800, 'two floors involved doubles the NFA flow');

    // Above 50% involvement the NFA formula is outside its design parameters.
    input(w, 'rff-floors', 1); input(w, 'rff-inv', 75);
    assert.match(text(w, 'rff-out'), /outside its design parameters/,
      '75% involvement must trigger the NFA accuracy caveat');
    w.close();
    console.log('PASS required fire flow — NFA involvement and exposure charges, Iowa volume method, ISO C/O/X+P, hoseline plan.');
  }

  /* ---- 2. Fireground hydraulics ------------------------------------------- */
  {
    const w = mount('fire-hose-friction-loss-pump-pressure');
    // Default lay is the card's worked example: 200 ft of 1 3/4" at 150 gpm,
    // fog nozzle, one floor above grade.
    assert.equal(num(w, 'flp-out', 'flp', 0), 150, 'flow 150 gpm');
    // 15.5 x 1.5^2 x 2 = 69.75 psi.
    assert.equal(num(w, 'flp-out', 'flp', 1), 69.8, 'FL 15.5 x 2.25 x 2 = 69.75');
    assert.equal(num(w, 'flp-out', 'flp', 2), 5, 'one floor above grade = 5 psi');
    assert.equal(num(w, 'flp-out', 'flp', 4), 100, 'fog nozzle pressure 100 psi');
    // 100 + 69.75 + 5 + 0 = 174.75.
    assert.equal(num(w, 'flp-out', 'flp', 5), 175, 'PDP = NP + FL + EL + AL = 174.75');
    // 0.0505 x 150 x sqrt(100) = 75.75 lb.
    assert.equal(num(w, 'flp-out', 'flp', 6), 76, 'fog nozzle reaction 75.75 lb');

    // A 1 3/4" line has no valid hand method -- the coefficient table only.
    const table = w.document.getElementById('flp-out').textContent;
    assert.ok(table.indexOf('34.9') !== -1, 'the per-section table shows 69.75/2 = 34.9 psi per 100 ft of 1 3/4"');

    // Switch to 2 1/2" at 250 gpm: the Underwriters' formula applies.
    const sel = w.document.querySelector('#flp-sects select');
    sel.value = '2';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    input(w, 'flp-gpm', 250);
    // 2 x 6.25 x 2 = 25.0 psi.
    assert.equal(num(w, 'flp-out', 'flp', 1), 25, '2 1/2" at 250 gpm over 200 ft = 25 psi');
    // Hand method 2Q^2 + Q = 12.5 + 2.5 = 15 per 100 ft, x 2 = 30.
    assert.ok(w.document.getElementById('flp-out').textContent.indexOf('30.0') !== -1,
      'the 2 1/2" hand method gives 30 psi for the lay, deliberately high');

    // 5" LDH at 500 gpm: condensed Q formula Q^2/15.
    sel.value = '0.08';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    input(w, 'flp-gpm', 500);
    // 0.08 x 25 x 2 = 4 psi; hand (25/15) x 2 = 3.33.
    assert.equal(num(w, 'flp-out', 'flp', 1), 4, '5" at 500 gpm over 200 ft = 4 psi');

    // Smooth-bore tip derives the flow: 29.83 x 0.97 x d^2 x sqrt(NP).
    input(w, 'flp-gpm', '');
    input(w, 'flp-sb', '1.125');
    input(w, 'flp-np', 50);
    // 29.83 x 0.97 x 1.265625 x sqrt(50) = 258.9 gpm.
    assert.equal(num(w, 'flp-out', 'flp', 0), 259, 'a 1 1/8" tip at 50 psi flows 259 gpm');
    // Smooth-bore nozzle reaction 1.57 x d^2 x NP = 1.57 x 1.265625 x 50 = 99.4 lb.
    assert.equal(num(w, 'flp-out', 'flp', 6), 99, 'smooth-bore nozzle reaction 99.4 lb');

    // Over 250 psi the tool must refuse to be quietly helpful.
    sel.value = '15.5';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    input(w, 'flp-sb', '0'); input(w, 'flp-gpm', 250); input(w, 'flp-np', 100);
    const ln = w.document.querySelector('#flp-sects input');
    ln.value = '300';
    ln.dispatchEvent(new w.Event('input', { bubbles: true }));
    // 15.5 x 6.25 x 3 = 290.6; PDP = 100 + 290.6 + 5 = 395.6.
    assert.equal(num(w, 'flp-out', 'flp', 5), 396, 'PDP 395.6 psi');
    assert.match(text(w, 'flp-out'), /above the 250 psi/, 'a PDP over 250 psi must be flagged');
    assert.match(text(w, 'flp-out'), /97 psi per 100 ft/, 'and so must the 290.6/3 = 96.9 psi per 100 ft figure');

    // A second section adds its friction loss to the first.
    click(w, '#flp-add');
    const secs = w.document.querySelectorAll('#flp-sects .flp-sec');
    assert.equal(secs.length, 2, 'a second hose section was added');
    const s2sel = secs[1].querySelector('select');
    s2sel.value = '0.2';
    s2sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    const s2ln = secs[1].querySelector('input');
    s2ln.value = '300';
    s2ln.dispatchEvent(new w.Event('input', { bubbles: true }));
    // 290.6 + 0.2 x 6.25 x 3 = 290.6 + 3.75 = 294.4.
    assert.equal(num(w, 'flp-out', 'flp', 1), 294.4, 'two sections in series add: 290.6 + 3.75');
    w.close();
    console.log('PASS fireground hydraulics — C·Q²·L, hand methods on supply line only, smooth-bore flow and NR, 250 psi guard, series sections.');
  }

  /* ---- 3. Hydrant flow test ----------------------------------------------- */
  {
    const w = mount('hydrant-flow-test-water-supply');
    // 72 static / 48 residual / 800 gpm.
    assert.equal(num(w, 'hft-out', 'hft', 0), 24, 'pressure drop 72 - 48 = 24 psi');
    // 24/72 x 100 = 33.3%.
    assert.equal(num(w, 'hft-out', 'hft', 1), 33.3, '% drop 33.3');
    assert.match(val(w, 'hft-out', 'hft', 2), /Less than measured/, '>25% drop: less than the measured flow is available');
    // First digit of 72 is 7; 24 > 3x7 = 21, so the same verdict.
    assert.match(val(w, 'hft-out', 'hft', 3), /Less than measured/, 'the first-digit method agrees');
    // 800 x 52^0.54 / 24^0.54 = 800 x 8.4452 / 5.5638 = 1214.3 -> 1210.
    assert.equal(num(w, 'hft-out', 'hft', 4), 1210, 'NFPA 291 available fire flow at 20 psi residual');
    assert.equal(num(w, 'hft-out', 'hft', 5), 410, 'about 410 gpm available on top of the 800 flowing');

    // A pitot reading converts to flow: 29.83 x c x d^2 x sqrt(p).
    input(w, 'hft-pitot', 30); input(w, 'hft-outlet', 2.5);
    // 29.83 x 0.90 x 6.25 x sqrt(30) = 919.5.
    assert.equal(num(w, 'hft-out', 'hft', 6), 919, 'pitot discharge 29.83 x 0.90 x 2.5^2 x sqrt(30)');

    // The bands: 8% drop must read 3x additional, and be rejected as a test.
    input(w, 'hft-residual', 66);
    assert.equal(num(w, 'hft-out', 'hft', 1), 8.3, '% drop 8.3');
    assert.match(val(w, 'hft-out', 'hft', 2), /3× additional/, 'a 0-10% drop reads three times additional');
    assert.match(text(w, 'hft-out'), /too small for a usable test/, 'but NFPA 291 rejects a drop under 10%');

    input(w, 'hft-residual', 62);
    assert.equal(num(w, 'hft-out', 'hft', 1), 13.9, '% drop 13.9');
    assert.match(val(w, 'hft-out', 'hft', 2), /2× additional/, '11-15% reads two times additional');
    // 15.28% sits between the published 15 and 16 and must go to the tighter band.
    input(w, 'hft-residual', 61);
    assert.equal(num(w, 'hft-out', 'hft', 1), 15.3, '% drop 15.3, above the 11-15 band');
    assert.match(val(w, 'hft-out', 'hft', 2), /1× additional/,
      'a drop between two published bands reads into the more conservative one');
    input(w, 'hft-residual', 55);
    assert.equal(num(w, 'hft-out', 'hft', 1), 23.6, '% drop 23.6');
    assert.match(val(w, 'hft-out', 'hft', 2), /1× additional/, '16-25% reads the same amount again');

    // A residual below 20 psi means the pumper is already starving.
    input(w, 'hft-residual', 18);
    assert.match(text(w, 'hft-out'), /Residual fell to 18 psi/, 'a residual under 20 psi is called out');

    // Residual >= static is not a test at all.
    input(w, 'hft-residual', 80);
    assert.match(text(w, 'hft-out'), /must be lower than the static/, 'a negative drop is refused');
    w.close();
    console.log('PASS hydrant flow test — percentage and first-digit bands, NFPA 291 AFF at 20 psi, pitot discharge, sub-10% rejection.');
  }

  /* ---- 4. Tanker shuttle --------------------------------------------------- */
  {
    const w = mount('tanker-shuttle-calculator');
    // 2500 gal, 3 miles each way, 1000 gpm fill and dump, 2 min make/break.
    assert.equal(num(w, 'tnk-out', 'tnk', 0), 11.5, 'round-trip travel (0.65 + 1.7 x 3) x 2 = 11.5 min');
    assert.equal(num(w, 'tnk-out', 'tnk', 1), 4.5, 'fill site 2 min + 2.5 min filling');
    assert.equal(num(w, 'tnk-out', 'tnk', 2), 4.5, 'dump site 2 min + 2.5 min dumping');
    assert.equal(num(w, 'tnk-out', 'tnk', 3), 20.5, 'cycle 20.5 min');
    assert.equal(num(w, 'tnk-out', 'tnk', 4), 2250, 'usable 2500 x 0.9');
    // 2250/20.5 x 0.9 = 98.78.
    assert.equal(num(w, 'tnk-out', 'tnk', 5), 99, 'tender delivery rate 98.8 gpm');
    assert.equal(num(w, 'tnk-out', 'tnk', 6), 6, '500 gpm needs 500/98.8 = 5.06 -> 6 tenders, rounded UP');
    assert.equal(num(w, 'tnk-out', 'tnk', 7), 395, '4 tenders deliver 395 gpm');
    assert.match(text(w, 'tnk-out'), /A shortfall/, '4 tenders against a 500 gpm requirement is a shortfall');

    // A vacuum tank discharges under its own power: k = 1.0.
    input(w, 'tnk-type', '1.0');
    // 2250/20.5 = 109.76.
    assert.equal(num(w, 'tnk-out', 'tnk', 5), 110, 'k = 1.0 for a pressurised tank gives 109.8 gpm');
    assert.equal(num(w, 'tnk-out', 'tnk', 6), 5, 'and 500 gpm then needs 5 tenders');

    // Distance is the whole game: 20 miles each way.
    input(w, 'tnk-type', '0.9');
    input(w, 'tnk-dist', 20);
    // travel = (0.65 + 34) x 2 = 69.3; cycle = 78.3; 2250/78.3 x 0.9 = 25.83.
    assert.equal(num(w, 'tnk-out', 'tnk', 3), 78.3, 'a 20-mile run makes a 78.3-minute cycle');
    assert.equal(num(w, 'tnk-out', 'tnk', 5), 26, 'and the delivery rate collapses to 25.8 gpm');
    assert.match(text(w, 'tnk-out'), /rarely beats drafting from a static source/,
      'a long shuttle must be challenged against a static source');

    // Unrealistically fast handling is called out rather than accepted.
    input(w, 'tnk-dist', 3); input(w, 'tnk-mkfill', 0.5); input(w, 'tnk-mkdump', 0.5);
    assert.match(text(w, 'tnk-out'), /this cycle time is fiction/,
      'one minute of total make/break time is not credible');
    w.close();
    console.log('PASS tanker shuttle — NFPA 1142 cycle, 10% unusable, k factor, round-up tanker count, shortfall and long-run warnings.');
  }

  /* ---- 5. Drafting --------------------------------------------------------- */
  {
    const w = mount('drafting-static-water-supply');
    // 10 ft lift, 150 psi discharge, no intake FL entered -> coefficient estimate.
    // 0.08 x 10^2 x 0.2 = 1.6 psi.
    assert.equal(num(w, 'drf-out', 'drf', 0), 33.9, 'theoretical lift 14.7/0.434 = 33.9 ft at sea level');
    // PC = (10 + 1.6)/2.3 = 5.04.
    assert.equal(num(w, 'drf-out', 'drf', 1), 5, 'PC = (lift + intake FL)/2.3');
    assert.equal(num(w, 'drf-out', 'drf', 2), 155, 'NPDP = PDP + PC = 155.0');
    assert.equal(num(w, 'drf-out', 'drf', 3), 100, 'at the rated 10 ft lift the pump keeps 100% of capacity');
    assert.equal(num(w, 'drf-out', 'drf', 4), 1.6, '5" intake FL estimate 1.6 psi');
    assert.match(text(w, 'drf-out'), /omits the strainer/,
      'the estimate must say what it leaves out');

    // An entered intake friction loss overrides the estimate -- IFSTA's example.
    input(w, 'drf-ifl', 9.5); input(w, 'drf-pdp', 142);
    // (10 + 9.5)/2.3 = 8.48; NPDP = 142 + 8.48 = 150.5.
    assert.equal(num(w, 'drf-out', 'drf', 1), 8.5, 'PC = 19.5/2.3 = 8.5 psi');
    assert.equal(num(w, 'drf-out', 'drf', 2), 150.5, 'NPDP = 142 + 8.5 = 150.5 psi');

    // Capacity derating against lift.
    input(w, 'drf-ifl', ''); input(w, 'drf-lift', 15);
    assert.equal(num(w, 'drf-out', 'drf', 3), 70, '15 ft lift keeps about 70% of rated capacity');
    assert.match(text(w, 'drf-out'), /past the dependable lift of 14.7 ft/, 'and is past dependable lift');
    input(w, 'drf-lift', 20);
    assert.equal(num(w, 'drf-out', 'drf', 3), 60, '20 ft lift keeps about 60%');
    assert.match(text(w, 'drf-out'), /off its NFPA 1901 rating basis/, 'above 10 ft the pump is off its rating basis');

    // Altitude costs about 0.5 psi, i.e. roughly 1.1 ft of lift, per 1000 ft.
    input(w, 'drf-lift', 10); input(w, 'drf-alt', 5000);
    // atm = 14.7 - 2.5 = 12.2; 12.2/0.434 = 28.11.
    assert.equal(num(w, 'drf-out', 'drf', 0), 28.1, 'theoretical lift at 5000 ft = 28.1 ft');
    assert.match(text(w, 'drf-out'), /special drafting certification above 2,000 ft/,
      'NFPA 1901 altitude caveat must appear');

    // 30 ft is past the practical maximum and must not produce a pump setting.
    input(w, 'drf-alt', 0); input(w, 'drf-lift', 30);
    assert.match(text(w, 'drf-out'), /exceeds the practical maximum/, 'a 30 ft lift is refused');
    assert.match(val(w, 'drf-out', 'drf', 3), /none/, 'and capacity retained reads none');
    assert.doesNotMatch(text(w, 'drf-out'), /Keep the barrel strainer/,
      'the normal operating advice must not follow an impossible lift');

    // A vacuum gauge reading converts to lift: L = 1.13 x in. Hg.
    input(w, 'drf-lift', 12); input(w, 'drf-hg', 22);
    assert.equal(num(w, 'drf-out', 'drf', 4), 24.9, 'L = 1.13 x 22 in. Hg = 24.9 ft');
    w.close();
    console.log('PASS drafting — PC and NPDP, theoretical lift at altitude, capacity derating, 25 ft practical ceiling, vacuum-gauge lift.');
  }

  /* ---- 6. SCBA air management ---------------------------------------------- */
  {
    const w = mount('scba-air-management-turnaround');
    // 4500 psi 30-minute cylinder, entered full, no measured consumption.
    assert.equal(num(w, 'scba-out', 'scba', 0), 1395, 'NFPA 1970 EOSTI 31% of 4500 = 1395 psi');
    // ((4500-1395)/2) + 1395 = 2947.5 -> 2950 rounded to 50.
    assert.equal(num(w, 'scba-out', 'scba', 1), 2950, 'turnaround 2947.5 psi');
    assert.equal(num(w, 'scba-out', 'scba', 2), 1500, 'rule of thirds = 4500/3');
    assert.equal(num(w, 'scba-out', 'scba', 3), 30, 'with no measured rate the label is all there is');
    assert.equal(num(w, 'scba-out', 'scba', 4), 1200, 'volume = 30 min x the NIOSH 40 L/min');
    assert.match(text(w, 'scba-out'), /breathing-machine figure/,
      'the 30-minute label must be called a NIOSH machine figure');
    assert.doesNotMatch(text(w, 'scba-out'), /third you would plan on/,
      'a full cylinder with a standard EOSTI must NOT be flagged as a short cylinder');

    // The legacy 25% EOSTI reproduces the card's worked example.
    input(w, 'scba-eosti', 25);
    assert.equal(num(w, 'scba-out', 'scba', 0), 1125, '25% of 4500 = 1125 psi');
    // ((4500-1125)/2) + 1125 = 2812.5 -> 2800 rounded to 50.
    assert.equal(num(w, 'scba-out', 'scba', 1), 2800, 'turnaround 2812.5, conventionally 2800');

    // A 2216 psi cylinder carries the 34% setting.
    input(w, 'scba-eosti', 0); input(w, 'scba-psi', 2216); input(w, 'scba-entry', 2216);
    assert.equal(num(w, 'scba-out', 'scba', 0), 753, 'NFPA 1970 EOSTI 34% of 2216 = 753 psi');

    // Measured consumption rate overrides the label.
    input(w, 'scba-psi', 4500); input(w, 'scba-entry', 4500);
    input(w, 'scba-eosti', 25); input(w, 'scba-acr', 133);
    // 4500/133 = 33.83 minutes.
    assert.equal(num(w, 'scba-out', 'scba', 3), 33.8, '4500 / 133 psi per min = 33.8 min of cylinder life');
    assert.equal(num(w, 'scba-out', 'scba', 5), 133, 'the ACR is reported back');

    // A real firefighting consumption rate shortens a "30-minute" cylinder hard.
    input(w, 'scba-acr', ''); input(w, 'scba-lpm', 70);
    // 1200 L / 70 L/min = 17.1 min.
    assert.equal(num(w, 'scba-out', 'scba', 3), 17.1, '1200 L at 70 L/min = 17.1 min');
    assert.equal(num(w, 'scba-out', 'scba', 6), 17, 'and the realistic-duration cell agrees');
    assert.match(text(w, 'scba-out'), /less than the 30 min label/, 'the gap against the label is stated');

    // A short cylinder must not be talked round.
    input(w, 'scba-lpm', ''); input(w, 'scba-entry', 2000);
    // turnaround = ((2000-1125)/2)+1125 = 1562.5 -> 1550.
    assert.equal(num(w, 'scba-out', 'scba', 1), 1550, 'a 2000 psi cylinder turns around at 1562.5');
    // (1562.5-1125)/4500 = 9.7% of a full cylinder -- well short of a third.
    assert.match(text(w, 'scba-out'), /third you would plan on/,
      'a cylinder half full must be challenged, and on usable air, not on the turnaround ratio');

    // Entry pressure above the rated fill is a data-entry error.
    input(w, 'scba-entry', 5000);
    assert.match(text(w, 'scba-out'), /above the cylinder's rated fill pressure/, 'an over-fill entry is refused');
    w.close();
    console.log('PASS SCBA air management — NFPA 1970 EOSTI percentages, rule-of-thirds turnaround, ACR and L/min duration, NIOSH label caveat.');
  }

  /* ---- 7. Ground ladders ---------------------------------------------------- */
  {
    const w = mount('ground-ladder-placement-reach');
    // 24 ft ladder, quarter rule, roof access.
    assert.equal(num(w, 'lad-out', 'lad', 0), 6, 'butt distance 24/4 = 6 ft');
    assert.equal(num(w, 'lad-out', 'lad', 1), 75.5, 'acos(1/4) = 75.5 degrees');
    // sqrt(576-36) = 23.24.
    assert.equal(num(w, 'lad-out', 'lad', 2), 23.2, 'reach = 24 x sin(75.5) = 23.2 ft');
    assert.equal(num(w, 'lad-out', 'lad', 3), 19.2, 'useful height at the roofline = 23.2 - 4 ft overhang');

    // Reverse: how long a ladder to reach a 20 ft roofline with overhang?
    input(w, 'lad-mode', 'hgt'); input(w, 'lad-hgt', 20);
    // (20 + 4)/0.968148 = 24.79.
    assert.equal(num(w, 'lad-out', 'lad', 0), 6.2, 'butt distance 24.79/4 = 6.2 ft');
    assert.equal(num(w, 'lad-out', 'lad', 4), 24.8, 'working length needed 24.8 ft');
    assert.equal(num(w, 'lad-out', 'lad', 5), 26, 'nearest stock ladder is a 26-footer');
    assert.equal(num(w, 'lad-out', 'lad', 2), 24, 'and it reaches the 24 ft objective plus overhang');

    // A measured butt distance overrides the quarter rule.
    input(w, 'lad-mode', 'len'); input(w, 'lad-len', 24); input(w, 'lad-butt', 10);
    // acos(10/24) = 65.4; reach sqrt(576-100) = 21.8.
    assert.equal(num(w, 'lad-out', 'lad', 1), 65.4, 'a 10 ft butt on a 24 ft ladder is 65.4 degrees');
    assert.equal(num(w, 'lad-out', 'lad', 2), 21.8, 'reach 21.8 ft');
    assert.match(text(w, 'lad-out'), /it can slide out at the bottom/, 'a shallow ladder is warned about');

    // Steep is the other failure mode.
    input(w, 'lad-butt', 2);
    // acos(2/24) = 85.2.
    assert.equal(num(w, 'lad-out', 'lad', 1), 85.2, 'a 2 ft butt is 85.2 degrees');
    assert.match(text(w, 'lad-out'), /it can tip backwards/, 'a steep ladder is warned about');

    // Collapse zone.
    input(w, 'lad-butt', ''); input(w, 'lad-bldg', 40);
    assert.equal(num(w, 'lad-out', 'lad', 5), 60, 'collapse zone 1.5 x 40 ft = 60 ft');
    w.close();
    console.log('PASS ground ladders — quarter rule, measured-butt angle, reverse sizing, tip overhang by objective, collapse zone.');
  }

  /* ---- 8. WBGT and rehab ----------------------------------------------------- */
  {
    const w = mount('firefighter-rehab-wbgt-heat-stress');
    // Outdoor 24 nwb / 32 globe / 28 dry, moderate work, 25-50% duty.
    // 0.7x24 + 0.2x32 + 0.1x28 = 26.0.
    assert.equal(num(w, 'wbgt-out', 'wbgt', 0), 26, 'outdoor WBGT 26.0');
    assert.equal(num(w, 'wbgt-out', 'wbgt', 2), 30, 'ACGIH screening TLV moderate @25-50% = 30.0');
    assert.equal(num(w, 'wbgt-out', 'wbgt', 3), 78.8, '26 C = 78.8 F');
    assert.equal(num(w, 'wbgt-out', 'wbgt', 4), 4, 'margin 30 - 26 = 4.0');
    assert.match(val(w, 'wbgt-out', 'wbgt', 5), /below limit/, 'and the status says so');

    // Indoor drops the solar term and gives the globe more weight.
    input(w, 'wbgt-env', 'in');
    // 0.7x24 + 0.3x32 = 26.4.
    assert.equal(num(w, 'wbgt-out', 'wbgt', 0), 26.4, 'indoor WBGT 0.7x24 + 0.3x32 = 26.4');
    input(w, 'wbgt-env', 'out');

    // Unacclimatised uses the lower Action Limit.
    input(w, 'wbgt-accl', 0);
    assert.equal(num(w, 'wbgt-out', 'wbgt', 2), 27, 'ACGIH action limit moderate @25-50% = 27.0');
    assert.equal(num(w, 'wbgt-out', 'wbgt', 4), 1, 'margin 1.0');
    assert.match(text(w, 'wbgt-out'), /Only 1 °C of margin/, 'a thin margin is called out');
    input(w, 'wbgt-accl', 1);

    // Heavy work at 25-50% duty: TLV 29.0, AL 25.5.
    input(w, 'wbgt-work', 2);
    assert.equal(num(w, 'wbgt-out', 'wbgt', 2), 29, 'heavy work TLV @25-50% = 29.0');
    assert.equal(num(w, 'wbgt-out', 'wbgt', 4), 3, 'margin 3.0');

    // Very heavy work at 75-100% duty has no published threshold at all.
    input(w, 'wbgt-work', 3); input(w, 'wbgt-duty', 3);
    assert.match(val(w, 'wbgt-out', 'wbgt', 2), /not sustainable/, 'no TLV exists for that cell');
    assert.match(text(w, 'wbgt-out'), /no threshold at all/, 'and the tool says why rather than inventing one');

    // Over the limit must stop the work cycle.
    input(w, 'wbgt-work', 1); input(w, 'wbgt-duty', 1); input(w, 'wbgt-nwb', 30);
    // 0.7x30 + 0.2x32 + 0.1x28 = 21 + 6.4 + 2.8 = 30.2.
    assert.equal(num(w, 'wbgt-out', 'wbgt', 0), 30.2, 'WBGT 30.2');
    assert.match(val(w, 'wbgt-out', 'wbgt', 5), /OVER LIMIT/, '30.2 exceeds the 30.0 TLV');
    assert.match(text(w, 'wbgt-out'), /Stop the work cycle/, 'and gives the rehab action');

    // Turnout gear + SCBA: no valid ACGIH clothing factor exists.
    input(w, 'wbgt-nwb', 24); input(w, 'wbgt-cloth', -2);
    assert.match(val(w, 'wbgt-out', 'wbgt', 1), /not valid/, 'no adjusted WBGT for an encapsulating ensemble');
    assert.match(text(w, 'wbgt-out'), /must not be applied to encapsulating ensembles/,
      'the ACGIH exclusion must be stated, not worked around');
    w.close();
    console.log('PASS WBGT rehab — outdoor/indoor formula, TLV vs action limit table, unsustainable cells, over-limit action, turnout-gear exclusion.');
  }

  /* ---- 9. Hazmat concentrations ---------------------------------------------- */
  {
    const w = mount('hazmat-concentration-exposure-converter');
    // 35 ppm CO (MW 28.01) at 25 C / 760 mmHg.
    // molar volume 62.4 x 298.15 / 760 = 24.48.
    assert.equal(num(w, 'haz-out', 'haz', 0), 40.05, 'mg/m3 = 35 x 28.01 / 24.48');
    assert.equal(num(w, 'haz-out', 'haz', 1), 40.1, 'at the quoted 24.45 condition: 40.10 mg/m3');
    assert.equal(num(w, 'haz-out', 'haz', 2), 24.48, 'molar volume 62.4 x (273.15+25) / 760');

    // Round trip back to ppm.
    input(w, 'haz-mode', 'm2p'); input(w, 'haz-val', 40.1);
    assert.equal(num(w, 'haz-out', 'haz', 1), 35, '40.10 mg/m3 of CO = 35 ppm');
    input(w, 'haz-mode', 'p2m'); input(w, 'haz-val', 35);

    // A hot confined space changes the molar volume and therefore the number.
    input(w, 'haz-temp', 60);
    // 62.4 x 333.15 / 760 = 27.35; 35 x 28.01 / 27.35 = 35.84.
    assert.equal(num(w, 'haz-out', 'haz', 2), 27.35, 'molar volume at 60 C = 27.35 L/mol');
    assert.equal(num(w, 'haz-out', 'haz', 0), 35.84, 'the same ppm is a smaller mass concentration when hot');
    input(w, 'haz-temp', 25);

    // ppm <-> % by volume.
    input(w, 'haz-mode', 'p2v'); input(w, 'haz-val', 25000);
    assert.equal(num(w, 'haz-out', 'haz', 0), 2.5, '25,000 ppm = 2.5% by volume');
    input(w, 'haz-mode', 'v2p'); input(w, 'haz-val', 2.5);
    assert.equal(num(w, 'haz-out', 'haz', 0), 25000, '2.5% = 25,000 ppm');

    // %LEL requires an entered LEL -- it is deliberately not preloaded.
    input(w, 'haz-mode', 'lel2p'); input(w, 'haz-val', 25); input(w, 'haz-lel', '');
    assert.match(text(w, 'haz-out'), /deliberately not preloaded/, 'a missing LEL is refused, not guessed');
    input(w, 'haz-lel', 4);
    // 0.25 x 4 x 10000 = 10,000 ppm = 1% by volume.
    assert.equal(num(w, 'haz-out', 'haz', 0), 10000, '25% LEL of a 4% LEL gas = 10,000 ppm');
    assert.equal(num(w, 'haz-out', 'haz', 1), 1, 'and 1% by volume');
    assert.match(text(w, 'haz-out'), /says nothing about toxicity/, 'the LEL-vs-toxicity point must be made');

    input(w, 'haz-mode', 'p2lel'); input(w, 'haz-val', 10000);
    assert.equal(num(w, 'haz-out', 'haz', 0), 25, '10,000 ppm is 25% LEL');

    // Oxygen thresholds.
    input(w, 'haz-mode', 'p2m'); input(w, 'haz-val', 35);
    input(w, 'haz-o2', 18);
    assert.match(text(w, 'haz-out'), /Oxygen-deficient/, '18% O2 is deficient');
    assert.match(text(w, 'haz-out'), /cartridge or air-purifying respirator will not protect/,
      'and supplied air is the answer, not a cartridge');
    input(w, 'haz-o2', 24);
    assert.match(text(w, 'haz-out'), /Oxygen-enriched/, '24% O2 is enriched');
    input(w, 'haz-o2', 20.9);
    assert.match(text(w, 'haz-out'), /necessary condition for entry, never a sufficient one/,
      'a normal O2 reading must not be read as clearance');
    w.close();
    console.log('PASS hazmat converter — 24.45 and T/P-corrected molar volume, ppm round trip, %LEL with no invented constants, O2 thresholds.');
  }

  /* ---- 10. Foam proportioning ------------------------------------------------- */
  {
    const w = mount('foam-proportioning-application');
    // 50 x 40 ft hydrocarbon spill at 0.10 gpm/ft2, 3% concentrate, 15 minutes.
    assert.equal(num(w, 'foam-out', 'foam', 0), 2000, 'area 2000 ft2');
    assert.equal(num(w, 'foam-out', 'foam', 1), 200, 'solution flow 2000 x 0.10 = 200 gpm');
    assert.equal(num(w, 'foam-out', 'foam', 2), 6, 'concentrate 200 x 3% = 6 gal/min');
    assert.equal(num(w, 'foam-out', 'foam', 3), 194, 'water 200 - 6 = 194 gpm');
    assert.equal(num(w, 'foam-out', 'foam', 4), 90, 'total concentrate 6 x 15 = 90 gal');
    assert.equal(num(w, 'foam-out', 'foam', 5), 3000, 'total solution 200 x 15 = 3000 gal');
    assert.match(text(w, 'foam-out'), /below the 0.16 gpm\/ft²/,
      '0.10 is a spill rate, not a tank rate, and must be qualified');

    // A polar solvent doubles the rate.
    input(w, 'foam-rate', '0.20');   // option value is the string '0.20', not '0.2'
    assert.equal(num(w, 'foam-out', 'foam', 1), 400, 'a polar solvent needs 0.20 gpm/ft2 -> 400 gpm');
    assert.equal(num(w, 'foam-out', 'foam', 4), 180, 'and 180 gal of concentrate for 15 minutes');

    // An under-15-minute run breaches NFPA 11.
    input(w, 'foam-rate', '0.10'); input(w, 'foam-min', 10);
    assert.match(text(w, 'foam-out'), /below the 15-minute minimum/, 'a 10-minute run is refused');
    input(w, 'foam-min', 15);

    // The supply calculation is the one that decides the operation.
    input(w, 'foam-tank', 20);
    // 20 gal / 6 gal per min = 3.3 min.
    assert.equal(num(w, 'foam-out', 'foam', 6), 3.3, '20 gal on board lasts 3.3 minutes');
    assert.match(text(w, 'foam-out'), /shortfall of 70 gal/, 'and the shortfall is stated');

    // A Class A induction rate on a Class B fire is a mistake.
    input(w, 'foam-tank', ''); input(w, 'foam-pct', 0.5);
    assert.match(text(w, 'foam-out'), /Class A induction rate/, '0.5% is called out as a Class A rate');
    input(w, 'foam-class', 'a');
    assert.doesNotMatch(text(w, 'foam-out'), /Class A induction rate/,
      'and the warning goes away once Class A is selected');
    w.close();
    console.log('PASS foam proportioning — solution flow, induction maths, 15-minute minimum, polar-solvent rate, on-board supply shortfall.');
  }

  console.log('\nALL FIRE SERVICE TOOL CHECKS PASSED.');
})();
