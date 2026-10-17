'use strict';
// Regression vectors from the 2026-10-17 accuracy audit (batch 3). Expected values
// were derived independently of the cards:
//   ideal weight  Devine male 175 cm = 70.5 kg; small frame is 5% lighter (never negative)
//   Ohm's law     5 V across 10 kΩ = 0.5 mA, 2.5 mW; after a first answer, editing one
//                 value must re-solve (24 V / 4 Ω = 6 A, 144 W)
//   voltage drop  BS 7671 Table 4D5: 2.5 mm² copper T&E = 18 mV/A/m at 70 °C, so
//                 20 A over 30 m = 10.8 V (4.7% of 230 V)
//   UK salary     2026/27 rUK bands; a 5% workplace pension on £30,000 gets tax relief:
//                 tax £3,186, NI £1,394, net £23,920 (net pay or relief at source)
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
  return new JSDOM(fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8'), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/',
    // jsdom has no canvas; the salary card draws a chart, so hand it an inert context
    beforeParse(win) {
      const stub = new Proxy(function () {}, { get: (_, k) => (k === 'width' ? 0 : stub), apply: () => stub, set: () => true });
      win.HTMLCanvasElement.prototype.getContext = () => stub;
    }
  }).window;
}
function input(w, id, value) {
  const e = w.document.getElementById(id);
  assert.ok(e, 'no #' + id);
  e.value = String(value);
  e.dispatchEvent(new w.Event('input', { bubbles: true }));
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
const text = (w, id) => w.document.getElementById(id).textContent.replace(/\s+/g, ' ').trim();

test('idealweight small frame stays positive and 5% under medium', { skip }, () => {
  const w = mount('idealweight');
  w.iwSetGender('male');
  w.document.getElementById('idealweight-height').value = '175';
  w.document.getElementById('idealweight-current').value = '70';
  w.document.getElementById('idealweight-age').value = '30';
  w.iwSetFrame('medium'); w.idealweightCalc();
  assert.match(text(w, 'iw-devine'), /^70\.5/);
  w.iwSetFrame('small'); w.idealweightCalc();
  assert.match(text(w, 'iw-devine'), /^6[67]\.\d/);
  assert.doesNotMatch(text(w, 'iw-hamwi'), /-/);
});

test("ohms-law shows milliamps and re-solves when a value changes", { skip }, () => {
  const w = mount('ohms-law');
  const type = (id, v) => { input(w, id, v); w.olCalculateOnInput(); };
  type('ol-voltage', 5); type('ol-resistance', 10000);
  assert.equal(text(w, 'ol-result-current'), '0.0005');
  assert.equal(text(w, 'ol-result-power'), '0.0025');
  w.olReset();
  type('ol-voltage', 12); type('ol-resistance', 4);
  assert.equal(text(w, 'ol-result-current'), '3.00');
  type('ol-voltage', 24);
  assert.equal(text(w, 'ol-result-current'), '6.00');
  assert.equal(text(w, 'ol-result-power'), '144.00');
});

test('voltage-drop matches BS 7671 mV/A/m at operating temperature', { skip }, () => {
  const w = mount('voltage-drop');
  const d = w.document;
  d.getElementById('vd-current').value = '20'; d.getElementById('vd-length').value = '30';
  d.getElementById('vd-size').value = '2.5'; d.getElementById('vd-voltage').value = '230';
  d.getElementById('vd-material').value = 'copper';
  Array.from(d.querySelectorAll('button')).find(b => /Calculate/.test(b.textContent)).click();
  const out = d.getElementById('vd-output').value;
  const v = parseFloat(out.match(/Voltage Drop: ([0-9.]+) V/)[1]);
  assert.ok(Math.abs(v - 10.8) <= 0.3, 'drop ' + v);
  assert.ok(!out.includes('\\n'), 'literal \\n in output');
  assert.ok(out.split('\n').length > 5);
});

test('salary (UK) gives income tax relief on pension contributions', { skip }, () => {
  const w = mount('salary');
  const d = w.document;
  d.getElementById('sc-country').value = 'uk';
  d.getElementById('sc-pay-period').value = 'annual';
  d.getElementById('sc-gross').value = '30000';
  d.getElementById('sc-pension').value = '5';
  d.getElementById('sc-other-deductions').value = '0';
  w.scCalculate();
  const s = text(w, 'sc-breakdown');
  assert.match(s, /Net Annual: £23\.9K/);
  assert.match(s, /Total Tax: £3\.2K/);
  d.getElementById('sc-pension').value = '0';
  w.scCalculate();
  assert.match(text(w, 'sc-breakdown'), /Net Annual: £25\.1K/);
});
