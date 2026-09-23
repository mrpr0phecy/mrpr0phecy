#!/usr/bin/env node
'use strict';
// Run: node scripts/tests/clinical-tools.test.js (jsdom installed in /tmp/tenv).
//
// The ten clinician-facing cards added 2026-09-21 compute numbers that people
// act on: an eGFR that decides a drug dose, a drip rate, a NEWS2 that decides
// who gets called at 3am. `scripts/test-card.js` proves they mount and do not
// throw; it cannot prove that CKD-EPI gives 131 for a 27-year-old man with a
// creatinine of 0.68. So the formulas are driven here, in jsdom, through the
// real DOM: set the inputs, read the rendered output, compare against vectors
// taken from the published sources named in each card.
//
// Vectors, and where each one comes from:
//   eGFR     13 rows of the NKF / Tufts implementation table for the 2021
//            CKD-EPI creatinine equation (Inker et al., NEJM 2021)
//   Cockcroft 65F, 130 umol/L, 70 kg -> 42.1 mL/min (mg/dL form, unrounded)
//   IV drip  500 mL / 4 h / 20 gtt -> 125 mL/h, 42 drops/min; 400 mg in 50 mL
//            at 5 mcg/kg/min for 70 kg -> 2.63 mL/h
//   fluids   25 kg maintenance 65 mL/h (4-2-1) and 1600 mL (100/50/20);
//            10 kg at 5% -> 500 mL deficit; 70 kg / 40% TBSA at 2 mL -> 5600 mL,
//            and 2800 mL over the 5 h left when 3 h have already gone
//   ABG      pH 7.25 / PaCO2 3.2 kPa / HCO3 12 -> metabolic acidosis, Winter's
//            24-28 mmHg, A-a 29.7 mmHg against an expected 14
//   anion gap Na 130 / Cl 100 / HCO3 12 / alb 25 / glu 28 -> AG 18, corrected
//            21.8, delta 0.50, Katz Na 136.4, corrected Ca 2.40, osmolality 296
//   NEWS2    every RCP threshold boundary, the single-parameter-of-3 rule, and
//            the Scale 2 over-oxygenation points
//   GCS      13 mild, 3 severe, and a not-testable component that must not be
//            summed as if it were a zero
//   APGAR    6 at 1 minute, 9 at 5 minutes, held independently
//   AF       72F + HTN + DM + TIA -> CHA2DS2-VASc 6, HAS-BLED 3
//
// jsdom is deliberately not a repository dependency (the site is zero-dep), so
// it lives outside the workspace. Without it this suite SKIPs loudly and exits
// 0, exactly like producer-tools.test.js:   mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); } catch (_) {
  try { ({ JSDOM } = require('jsdom')); } catch (e) {
    console.log('SKIP clinical-tools: jsdom not installed (mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom)');
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
function tick(w, id, on) {
  const e = w.document.getElementById(id);
  assert.ok(e, 'no #' + id);
  e.checked = !!on;
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
function radio(w, name, value) {
  const e = w.document.querySelector(`input[name="${name}"][value="${value}"]`);
  assert.ok(e, `no radio ${name}=${value}`);
  e.checked = true;
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
function radioById(w, id) {
  const e = w.document.getElementById(id);
  assert.ok(e, 'no radio #' + id);
  e.checked = true;
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

(function run() {
  /* ---- 1. eGFR: 13 published CKD-EPI 2021 vectors + Cockcroft-Gault ----- */
  {
    const w = mount('egfr-creatinine-clearance-calculator');
    // The NKF / Tufts implementation table for Inker et al. 2021, eGFRcr.
    const vectors = [
      [27, 'm', 0.68, 131], [27, 'm', 0.90, 120], [27, 'm', 0.91, 118], [27, 'm', 1.00, 106],
      [27, 'f', 0.68, 122], [27, 'f', 0.70, 121], [27, 'f', 0.71, 119], [27, 'f', 1.00, 79],
      [54, 'm', 0.68, 110], [54, 'm', 0.90, 101], [54, 'm', 1.00, 89],
      [54, 'f', 0.68, 103], [54, 'f', 1.00, 67]
    ];
    input(w, 'egfrx-unit', 'mgdl');
    for (const [age, sex, scr, want] of vectors) {
      input(w, 'egfrx-sex', sex);
      input(w, 'egfrx-age', age);
      input(w, 'egfrx-scr', scr);
      const got = parseInt(w.document.querySelector('#egfrx-out .egfrx-v').textContent.match(/(\d+)/)[1], 10);
      assert.equal(got, want, `CKD-EPI ${age}y ${sex} Scr ${scr}: got ${got}, published ${want}`);
    }
    // Worked anchor from the card's own methodology.
    input(w, 'egfrx-unit', 'umol');
    input(w, 'egfrx-sex', 'f'); input(w, 'egfrx-age', 65);
    input(w, 'egfrx-scr', 130); input(w, 'egfrx-weight', 70);
    const out = text(w, 'egfrx-out');
    assert.match(out, /39 mL\/min\/1\.73 m²/, '65F/130 µmol/L should be 39 mL/min/1.73 m²');
    assert.match(out, /G3b/, '39 mL/min is KDIGO G3b');
    assert.match(out, /42\.1 mL\/min/, 'Cockcroft-Gault should be 42.1 mL/min');
    assert.match(out, /1\.47 mg\/dL/, '130 µmol/L is 1.47 mg/dL');
    // Under-18 must be refused, not silently scored.
    input(w, 'egfrx-age', 12);
    assert.match(text(w, 'egfrx-out'), /18 or over/, 'a 12-year-old must be refused');
    // Implausible creatinine must be caught.
    input(w, 'egfrx-age', 65); input(w, 'egfrx-scr', 5000);
    assert.match(text(w, 'egfrx-out'), /outside the plausible range/, '5000 µmol/L must be flagged');
    w.close();
    console.log('PASS eGFR — 13 NKF CKD-EPI 2021 vectors, Cockcroft-Gault, KDIGO band, age and range guards.');
  }

  /* ---- 2. IV drip rate -------------------------------------------------- */
  {
    const w = mount('iv-drip-rate-infusion-calculator');
    input(w, 'ivdrip-vol', 500); input(w, 'ivdrip-hours', 4); input(w, 'ivdrip-drop', 20);
    let out = text(w, 'ivdrip-out');
    assert.match(out, /125\.0 mL\/hour/, '500 mL over 4 h is 125 mL/h');
    assert.match(out, /42 drops\/min/, '125 mL/h on a 20 gtt/mL set is 42 drops/min');
    assert.match(out, /exact 41\.67/, 'the unrounded 41.67 must still be shown');

    // Microdrip: the same rate on 60 gtt/mL is 125 drops/min.
    input(w, 'ivdrip-drop', 60);
    assert.match(text(w, 'ivdrip-out'), /125 drops\/min/, '125 mL/h on a microdrip is 125 drops/min');

    // Dose mode: 400 mg in 50 mL, 70 kg, 5 mcg/kg/min.
    click(w, '[data-ivdrip-mode="dose"]');
    input(w, 'ivdrip-damt', 400); input(w, 'ivdrip-dunit', 'mg');
    input(w, 'ivdrip-dil', 50); input(w, 'ivdrip-dose', 5);
    input(w, 'ivdrip-drate', 'mcg-kg-min'); input(w, 'ivdrip-wt', 70);
    out = text(w, 'ivdrip-out');
    assert.match(out, /2\.63 mL\/hour/, '5 mcg/kg/min of 8 mg/mL for 70 kg is 2.63 mL/h');
    assert.match(out, /8 mg\/mL/, '400 mg in 50 mL is 8 mg/mL');
    assert.match(out, /19 h 03/, 'a 50 mL bag at 2.625 mL/h lasts 19 h 03 min');

    // Units and mg cannot be mixed — that is the error the guard exists for.
    input(w, 'ivdrip-dunit', 'unit');
    assert.match(text(w, 'ivdrip-out'), /cannot be converted/, 'units vs mg must be refused');
    input(w, 'ivdrip-dunit', 'mg');

    // Time to empty: 320 mL at 125 mL/h.
    click(w, '[data-ivdrip-mode="empty"]');
    input(w, 'ivdrip-remain', 320); input(w, 'ivdrip-rate', 125);
    assert.match(text(w, 'ivdrip-out'), /2 h 34/, '320 mL at 125 mL/h is 2 h 34 min');
    w.close();
    console.log('PASS IV drip — mL/h ↔ drops/min on both sets, dose-to-rate, unit-mixing guard, time to empty.');
  }

  /* ---- 3. Weight-based dose -------------------------------------------- */
  {
    const w = mount('weight-based-dose-calculator');
    input(w, 'wbdose-wt', 18); input(w, 'wbdose-dose', 15);
    input(w, 'wbdose-dunit', 'mg-kg'); input(w, 'wbdose-div', 4);
    input(w, 'wbdose-conc', 50); input(w, 'wbdose-max', ''); input(w, 'wbdose-max24', '');
    let out = text(w, 'wbdose-out');
    assert.match(out, /270 mg/, '15 mg/kg × 18 kg is 270 mg');
    assert.match(out, /5\.4 mL/, '270 mg at 50 mg/mL is 5.4 mL');
    assert.match(out, /1080 mg/, '4 doses a day is 1080 mg');
    assert.match(out, /60\.0 mg\/kg\/day/, '1080 mg over 18 kg is 60 mg/kg/day');

    // The guardrail must fire on the single-dose maximum.
    input(w, 'wbdose-max', 250);
    assert.match(text(w, 'wbdose-out'), /STOP: 270 mg per dose exceeds the 250 mg maximum/,
      'a dose over the entered maximum must be stopped');
    // And the 24-hour maximum independently.
    input(w, 'wbdose-max', ''); input(w, 'wbdose-max24', 1000);
    assert.match(text(w, 'wbdose-out'), /STOP: 1080 mg over 24 h exceeds the 1000 mg 24-hour maximum/,
      'a day over the entered 24 h maximum must be stopped');
    // Within limits is reported as such.
    input(w, 'wbdose-max24', 4000);
    assert.match(text(w, 'wbdose-out'), /Within the maxima you entered/, 'a safe dose should say so');
    // Reverse mode: a fixed milligram figure reports the mg/kg it represents.
    input(w, 'wbdose-dunit', 'mg'); input(w, 'wbdose-dose', 500); input(w, 'wbdose-wt', 50);
    assert.match(text(w, 'wbdose-out'), /10\.00 mg\/kg/, '500 mg for 50 kg is 10 mg/kg');
    w.close();
    console.log('PASS weight-based dose — mg/kg, volume from strength, both maxima, reverse mg/kg.');
  }

  /* ---- 4. Clinical fluids ---------------------------------------------- */
  {
    const w = mount('clinical-fluid-requirements-calculator');
    input(w, 'clinfluid-mwt', 25); input(w, 'clinfluid-mage', 'child');
    let out = text(w, 'clinfluid-out');
    assert.match(out, /65 mL\/hour/, '4-2-1 for 25 kg is 65 mL/h');
    assert.match(out, /1560 mL/, '65 mL/h × 24 is 1560 mL');
    assert.match(out, /1600 mL\/24 h/, 'the 100/50/20 daily rule gives 1600 mL for 25 kg');
    // The two rules must not be presented as equal.
    assert.match(out, /2\.5%/, 'the tool must state the 2.5% difference between the two rules');

    // Deficit: 10 kg at 5%.
    click(w, '[data-cfmode="deficit"]');
    input(w, 'clinfluid-dwt', 10); input(w, 'clinfluid-pct', 5);
    out = text(w, 'clinfluid-out');
    assert.match(out, /500 mL/, '5% of 10 kg is a 500 mL deficit');
    assert.match(out, /72\.9 mL\/hour/, 'first 8 h runs at 72.9 mL/h');
    // 10% must raise the shock warning.
    input(w, 'clinfluid-pct', 10);
    assert.match(text(w, 'clinfluid-out'), /shock is likely/, '10% dehydration must warn about shock');

    // Burns: 70 kg, 40% TBSA, ABA adult 2 mL/kg/%.
    click(w, '[data-cfmode="burn"]');
    input(w, 'clinfluid-bwt', 70); input(w, 'clinfluid-mult', 2);
    input(w, 'clinfluid-tbsa', 40); input(w, 'clinfluid-since', 0);
    out = text(w, 'clinfluid-out');
    assert.match(out, /5600 mL/, '2 × 70 × 40 is 5600 mL');
    assert.match(out, /2800 mL/, 'half of 5600 is 2800 mL');
    assert.match(out, /350 mL\/hour/, '2800 mL over 8 h is 350 mL/h');
    // The clock runs from the injury: 3 hours gone leaves 5.
    input(w, 'clinfluid-since', 3);
    assert.match(text(w, 'clinfluid-out'), /560 mL\/hour/, 'the same 2800 mL in the 5 h left is 560 mL/h');
    // Classic Parkland at 4 mL/kg/% doubles it.
    input(w, 'clinfluid-mult', 4); input(w, 'clinfluid-since', 0);
    assert.match(text(w, 'clinfluid-out'), /11200 mL/, '4 × 70 × 40 is 11200 mL');
    // Rule of Nines: head/neck + right arm + anterior trunk = 36.
    tick(w, 'clinfluid-ron-0', true); tick(w, 'clinfluid-ron-1', true); tick(w, 'clinfluid-ron-3', true);
    assert.equal(w.document.getElementById('clinfluid-tbsa').value, '36',
      'Rule of Nines 9 + 9 + 18 must fill in 36');
    w.close();
    console.log('PASS clinical fluids — 4-2-1 vs 100/50/20, deficit with 8 h split, burn clock from injury, Rule of Nines.');
  }

  /* ---- 5. ABG ---------------------------------------------------------- */
  {
    const w = mount('abg-blood-gas-interpreter');
    input(w, 'abgx-unit', 'kpa'); input(w, 'abgx-ph', 7.25); input(w, 'abgx-co2', 3.2);
    input(w, 'abgx-hco3', 12); input(w, 'abgx-po2', 12); input(w, 'abgx-fio2', 21);
    input(w, 'abgx-age', 40); input(w, 'abgx-chronic', 'acute');
    let out = text(w, 'abgx-out');
    assert.match(out, /Acidaemia/, 'pH 7.25 is acidaemia');
    assert.match(out, /Metabolic acidosis/, 'a low bicarbonate with a low PaCO2 is metabolic acidosis');
    assert.match(out, /24–28 mmHg/, "Winter's formula for HCO3 12 is 24–28 mmHg");
    assert.match(out, /compensation is appropriate/, 'PaCO2 24 mmHg is inside the predicted range');
    assert.match(out, /29\.7 mmHg/, 'A-a gradient should be 29.7 mmHg');
    assert.match(out, /expected ≈ 14/, 'expected A-a at 40 years is 14 mmHg');
    assert.match(out, /429/, 'P/F is 90/0.21 = 429');

    // A PaCO2 above the predicted range must be called out as an added disorder.
    input(w, 'abgx-co2', 4.5); // 33.8 mmHg — well above Winter's ceiling
    assert.match(text(w, 'abgx-out'), /added respiratory acidosis/, 'PaCO2 above the Winter range is a second disorder');

    // Respiratory alkalosis, chronic.
    input(w, 'abgx-ph', 7.52); input(w, 'abgx-co2', 3.0); input(w, 'abgx-hco3', 20);
    input(w, 'abgx-chronic', 'chronic');
    out = text(w, 'abgx-out');
    assert.match(out, /Alkalaemia/, 'pH 7.52 is alkalaemia');
    assert.match(out, /Respiratory alkalosis/, 'a low PaCO2 with a high pH is respiratory alkalosis');

    // Type 2 respiratory failure.
    input(w, 'abgx-ph', 7.28); input(w, 'abgx-co2', 9.0); input(w, 'abgx-hco3', 30);
    input(w, 'abgx-po2', 6.5); input(w, 'abgx-chronic', 'chronic');
    assert.match(text(w, 'abgx-out'), /Type 2 respiratory failure/, 'PaO2 6.5 kPa with PaCO2 9 kPa is type 2');
    // A pH that cannot be real is refused.
    input(w, 'abgx-ph', 6.2);
    assert.match(text(w, 'abgx-out'), /between 6\.5 and 7\.9/, 'pH 6.2 must be refused');
    w.close();
    console.log('PASS ABG — primary disorder, Winter\u2019s range, added-disorder detection, A-a, P/F, type 2, pH guard.');
  }

  /* ---- 6. Anion gap and corrections ------------------------------------- */
  {
    const w = mount('anion-gap-electrolyte-corrector');
    input(w, 'agap-units', 'si');
    input(w, 'agap-na', 130); input(w, 'agap-k', 4.0); input(w, 'agap-cl', 100);
    input(w, 'agap-hco3', 12); input(w, 'agap-alb', 25); input(w, 'agap-glu', 28);
    input(w, 'agap-urea', 8); input(w, 'agap-ca', 2.10); input(w, 'agap-osm', '');
    let out = text(w, 'agap-out');
    assert.match(out, /18 mmol\/L/, '130 − (100 + 12) is 18');
    assert.match(out, /22 mmol\/L/, 'with potassium the gap is 22');
    assert.match(out, /21\.8 mmol\/L/, 'albumin correction takes 18 to 21.8');
    assert.match(out, /0\.50/, 'the delta ratio is (18−12)/(24−12) = 0.50');
    assert.match(out, /mixed high-gap and normal-gap acidosis/, 'a delta of 0.50 reads as mixed');
    assert.match(out, /136\.4 mmol\/L/, 'Katz corrected sodium is 136.4');
    assert.match(out, /139\.6 mmol\/L/, 'Hillier corrected sodium is 139.6');
    assert.match(out, /2\.40 mmol\/L/, 'Payne corrected calcium is 2.40');
    assert.match(out, /296 mmol\/kg/, 'calculated osmolality is 296');
    // Low albumin must trigger the warning that the gap is being hidden.
    assert.match(out, /hides anion gap/, 'a low albumin must warn that it hides the gap');
    // Urine anion gap, and its invalidity when the plasma gap is raised.
    input(w, 'agap-una', 40); input(w, 'agap-unk', 25); input(w, 'agap-uncl', 80);
    out = text(w, 'agap-out');
    assert.match(out, /−15 mmol\/L|-15 mmol\/L/, 'urine (40+25)−80 is −15');
    assert.match(out, /not interpretable/, 'a raised plasma gap invalidates the urine anion gap');
    w.close();
    console.log('PASS anion gap — gap, K+ form, albumin correction, delta ratio, Katz/Hillier, Payne, osmolality, UAG.');
  }

  /* ---- 7. Glasgow Coma Scale ------------------------------------------- */
  {
    const w = mount('glasgow-coma-scale-calculator');
    input(w, 'gcsx-scale', 'adult');
    radio(w, 'gcsx-eye', 3); radio(w, 'gcsx-verbal', 4); radio(w, 'gcsx-motor', 6);
    let out = text(w, 'gcsx-out');
    assert.match(out, /E3 V4 M6/, 'the component string must be written out');
    assert.match(out, /Mild brain injury \(13–14\)/, 'E3V4M6 is 13, mild');
    radio(w, 'gcsx-eye', 2); radio(w, 'gcsx-verbal', 2); radio(w, 'gcsx-motor', 4);
    out = text(w, 'gcsx-out');
    assert.match(out, /Severe brain injury/, 'E2V2M4 is 8, severe');
    assert.match(out, /airway protection/, 'a GCS of 8 must raise the airway point');
    // A not-testable component must never be summed as a zero.
    radio(w, 'gcsx-verbal', 'NT');
    out = text(w, 'gcsx-out');
    assert.match(out, /\+NT/, 'a not-testable component is shown as +NT, not added');
    assert.match(out, /Not summed as a single score/, 'the total must be withheld');
    assert.match(out, /maximum possible with the testable components is 10/, 'E4 + M6 = 10');
    // The paediatric scale swaps the verbal options.
    input(w, 'gcsx-scale', 'paed');
    assert.ok(w.document.querySelector('input[name="gcsx-verbal"][value="5"]'),
      'the paediatric verbal scale must still offer a 5');
    assert.match(w.document.body.textContent, /Smiles, oriented to sounds/,
      'the paediatric verbal wording must be present');
    w.close();
    console.log('PASS GCS — component string, severity bands, airway prompt, NT never summed, paediatric scale.');
  }

  /* ---- 8. NEWS2 -------------------------------------------------------- */
  {
    const w = mount('news2-early-warning-score');
    input(w, 'news2-scale', '1'); input(w, 'news2-o2', '0'); input(w, 'news2-acvpu', 'A');
    input(w, 'news2-rr', 18); input(w, 'news2-spo2', 96); input(w, 'news2-sbp', 128);
    input(w, 'news2-pulse', 76); input(w, 'news2-temp', 37.0);
    assert.match(text(w, 'news2-out'), /NEWS2 0/, 'all-normal observations score 0');
    assert.match(text(w, 'news2-out'), /VERY LOW RISK/, 'a score of 0 is very low risk');

    // Worked example: 2+2+2+2+2+0+1 = 11.
    input(w, 'news2-rr', 22); input(w, 'news2-spo2', 92); input(w, 'news2-o2', '1');
    input(w, 'news2-sbp', 98); input(w, 'news2-pulse', 115); input(w, 'news2-temp', 38.4);
    let out = text(w, 'news2-out');
    assert.match(out, /NEWS2 11/, 'the worked example totals 11');
    assert.match(out, /HIGH RISK/, 'a total of 11 is high risk');
    assert.match(out, /Sepsis Six/, 'a NEWS2 of 5+ with possible infection must raise sepsis');

    // Scale 2 scores over-oxygenation; Scale 1 does not.
    input(w, 'news2-scale', '2'); input(w, 'news2-spo2', 97);
    assert.match(text(w, 'news2-out'), /NEWS2 12/, 'on Scale 2, 97% on oxygen scores 3 instead of 2');
    input(w, 'news2-scale', '1');
    assert.match(text(w, 'news2-out'), /NEWS2 9/, 'back on Scale 1, 97% scores 0 again');

    // Single parameter of 3 overrides a low total.
    input(w, 'news2-rr', 8); input(w, 'news2-spo2', 97); input(w, 'news2-o2', '0');
    input(w, 'news2-sbp', 120); input(w, 'news2-pulse', 70); input(w, 'news2-temp', 37);
    out = text(w, 'news2-out');
    assert.match(out, /NEWS2 3/, 'a respiratory rate of 8 alone scores 3');
    assert.match(out, /LOW-MEDIUM RISK/, 'a single 3 must escalate past the low-risk band');

    // Every threshold boundary, both sides, against the RCP table.
    const set = (rr, s, sbp, p, t) => {
      input(w, 'news2-rr', rr); input(w, 'news2-spo2', s);
      input(w, 'news2-sbp', sbp); input(w, 'news2-pulse', p); input(w, 'news2-temp', t);
    };
    input(w, 'news2-scale', '1'); input(w, 'news2-o2', '0'); input(w, 'news2-acvpu', 'A');
    const boundaries = [
      // [rr, spo2, sbp, pulse, temp, expected total]
      [8, 96, 120, 70, 37.0, 3], [9, 96, 120, 70, 37.0, 1], [11, 96, 120, 70, 37.0, 1],
      [12, 96, 120, 70, 37.0, 0], [20, 96, 120, 70, 37.0, 0], [21, 96, 120, 70, 37.0, 2],
      [24, 96, 120, 70, 37.0, 2], [25, 96, 120, 70, 37.0, 3],
      [18, 91, 120, 70, 37.0, 3], [18, 92, 120, 70, 37.0, 2], [18, 93, 120, 70, 37.0, 2],
      [18, 94, 120, 70, 37.0, 1], [18, 95, 120, 70, 37.0, 1], [18, 96, 120, 70, 37.0, 0],
      [18, 96, 90, 70, 37.0, 3], [18, 96, 91, 70, 37.0, 2], [18, 96, 100, 70, 37.0, 2],
      [18, 96, 101, 70, 37.0, 1], [18, 96, 110, 70, 37.0, 1], [18, 96, 111, 70, 37.0, 0],
      [18, 96, 219, 70, 37.0, 0], [18, 96, 220, 70, 37.0, 3],
      [18, 96, 120, 40, 37.0, 3], [18, 96, 120, 41, 37.0, 1], [18, 96, 120, 50, 37.0, 1],
      [18, 96, 120, 51, 37.0, 0], [18, 96, 120, 90, 37.0, 0], [18, 96, 120, 91, 37.0, 1],
      [18, 96, 120, 110, 37.0, 1], [18, 96, 120, 111, 37.0, 2], [18, 96, 120, 130, 37.0, 2],
      [18, 96, 120, 131, 37.0, 3],
      [18, 96, 120, 70, 35.0, 3], [18, 96, 120, 70, 35.1, 1], [18, 96, 120, 70, 36.0, 1],
      [18, 96, 120, 70, 36.1, 0], [18, 96, 120, 70, 38.0, 0], [18, 96, 120, 70, 38.1, 1],
      [18, 96, 120, 70, 39.0, 1], [18, 96, 120, 70, 39.1, 2]
    ];
    for (const [rr, s, sbp, p, t, want] of boundaries) {
      set(rr, s, sbp, p, t);
      const got = parseInt(text(w, 'news2-out').match(/NEWS2 (\d+)/)[1], 10);
      assert.equal(got, want, `NEWS2 rr=${rr} spo2=${s} sbp=${sbp} pulse=${p} temp=${t}: got ${got}, want ${want}`);
    }
    // Any of C/V/P/U scores 3.
    set(18, 96, 120, 70, 37.0);
    for (const c of ['C', 'V', 'P', 'U']) {
      input(w, 'news2-acvpu', c);
      assert.match(text(w, 'news2-out'), /NEWS2 3/, `ACVPU ${c} must score 3`);
    }
    // A missing observation must be refused rather than scored as zero.
    input(w, 'news2-acvpu', 'A'); input(w, 'news2-rr', '');
    assert.match(text(w, 'news2-out'), /needs every parameter/, 'a missing parameter must be refused');
    w.close();
    console.log('PASS NEWS2 — 40 RCP boundary vectors, ACVPU, Scale 2 over-oxygenation, single-3 rule, sepsis, missing data.');
  }

  /* ---- 9. APGAR -------------------------------------------------------- */
  {
    const w = mount('apgar-score-calculator');
    // 1 minute: HR 120 (2), weak irregular respiration (1), grimace (1),
    // some flexion (1), acrocyanosis (1) = 6.
    radioById(w, 'apgar-p-1-2'); radioById(w, 'apgar-r-4-1');
    radioById(w, 'apgar-g-2-1'); radioById(w, 'apgar-a2-3-1'); radioById(w, 'apgar-a-0-1');
    let out;
    assert.match(text(w, 'apgar-out'), /APGAR 6 at 1 minute/, 'the 1-minute score is 6');
    assert.match(text(w, 'apgar-out'), /Moderately abnormal/, '6 is moderately abnormal');
    assert.match(text(w, 'apgar-out'), /repeat the assessment at 10, 15 and 20 minutes/,
      'a sub-7 score at 1 minute must prompt the later time points');
    // 5 minutes: HR 140 (2), vigorous cry (2), pulls away (2), active (2), acrocyanosis (1) = 9.
    click(w, '[data-aptime="5"]');
    radioById(w, 'apgar-p-1-2'); radioById(w, 'apgar-r-4-2');
    radioById(w, 'apgar-g-2-2'); radioById(w, 'apgar-a2-3-2'); radioById(w, 'apgar-a-0-1');
    assert.match(text(w, 'apgar-out'), /APGAR 9 at 5 minutes/, 'the 5-minute score is 9');
    assert.match(text(w, 'apgar-out'), /Reassuring/, '9 is reassuring');
    // The two time points must be stored independently.
    const trend = text(w, 'apgar-trend');
    assert.match(trend, /Total/, 'the trend table must be present');
    click(w, '[data-aptime="1"]');
    assert.match(text(w, 'apgar-out'), /APGAR 6 at 1 minute/, 'switching back must restore the 1-minute score');
    // 0 across the board must say resuscitation.
    click(w, '[data-aptime="10"]');
    radioById(w, 'apgar-p-1-0'); radioById(w, 'apgar-r-4-0');
    radioById(w, 'apgar-g-2-0'); radioById(w, 'apgar-a2-3-0'); radioById(w, 'apgar-a-0-0');
    out = text(w, 'apgar-out');
    assert.match(out, /APGAR 0 at 10 minutes/, 'all zeros is 0');
    assert.match(out, /Immediate resuscitation/, '0–3 must say immediate resuscitation');
    assert.match(out, /does not predict neurological outcome/, 'the prognostic caveat must be present');
    w.close();
    console.log('PASS APGAR — five components, three independent time points, bands, resuscitation and prognosis caveats.');
  }

  /* ---- 10. CHA2DS2-VASc and HAS-BLED ------------------------------------ */
  {
    const w = mount('chads2vasc-hasbled-calculator');
    input(w, 'chav-age', 72); input(w, 'chav-sex', 'f');
    tick(w, 'chav-htn', true); tick(w, 'chav-dm', true); tick(w, 'chav-stroke', true);
    let out = text(w, 'chav-out');
    // age 65–74 (1) + HTN (1) + DM (1) + TIA (2) + female (1) = 6
    assert.match(out, /CHA₂DS₂-VASc 6 \/ 9/, 'the worked example scores 6');
    assert.match(out, /Anticoagulation recommended/, 'a score of 6 in a woman is a clear indication');
    assert.match(out, /9\.7 %/, 'the Friberg annual risk at 6 is 9.7%');
    assert.match(out, /the score is 5/, 'the non-sex score must also be shown');
    // Age points must move automatically and never both fire.
    input(w, 'chav-age', 80);
    out = text(w, 'chav-out');
    assert.match(out, /CHA₂DS₂-VASc 7 \/ 9/, 'turning 80 adds the second age point');
    assert.equal(w.document.getElementById('chav-age75').checked, true, 'age 80 ticks the ≥75 box');
    assert.equal(w.document.getElementById('chav-age65').checked, false, 'and unticks the 65–74 box');
    // A woman whose only point is female sex is not anticoagulated.
    input(w, 'chav-age', 60);
    ['chav-htn', 'chav-dm', 'chav-stroke'].forEach(k => tick(w, k, false));
    out = text(w, 'chav-out');
    assert.match(out, /CHA₂DS₂-VASc 1 \/ 9/, 'female sex alone is 1 point');
    assert.match(out, /No anticoagulation on this score/, 'sex alone is not an indication');
    // A man with exactly one clinical risk factor sits in the "consider" band.
    input(w, 'chav-sex', 'm'); tick(w, 'chav-htn', true);
    out = text(w, 'chav-out');
    assert.match(out, /CHA₂DS₂-VASc 1 \/ 9/, 'one risk factor in a man is 1');
    assert.match(out, /Consider anticoagulation/, 'and that is the consider band');
    // HAS-BLED: age over 65 (1) + drugs (1) + alcohol (1) = 3.
    input(w, 'chav-age', 72);
    tick(w, 'chav-bdrug', true); tick(w, 'chav-balc', true);
    out = text(w, 'chav-out');
    assert.match(out, /HAS-BLED 3 \/ 9/, 'the worked example bleeding score is 3');
    assert.match(out, /High bleeding risk/, '3 or more is high bleeding risk');
    assert.match(out, /not a reason to withhold anticoagulation/, 'the guideline point must be stated');
    const mod = text(w, 'chav-mod');
    assert.match(mod, /antiplatelet agents or NSAIDs/, 'the drug contributor must be listed as modifiable');
    assert.match(mod, /Address the alcohol/, 'and so must alcohol');
    w.close();
    console.log('PASS AF risk — CHA2DS2-VASc, sex-adjusted thresholds, auto age points, Friberg rates, HAS-BLED and modifiable list.');
  }

  console.log('\nALL CLINICAL TOOL CHECKS PASSED.');
})();
