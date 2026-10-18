'use strict';
// Regression vectors from the 2026-10-18 accuracy audit (batch 4). Expected values
// were derived independently of the cards:
//   LED resistor   (5 − 3.06) V / 20 mA = 97 Ω -> next E24 value up is 100 Ω (not 91 Ω);
//                  (24 − 2) V × 100 mA = 2.2 W, so the rating must be at least 2 × 2.2 W
//   baby formula   140 ml at 1 scoop per 30 ml is not whole scoops: offer 4 + 120 ml or
//                  5 + 150 ml, never 5 scoops in 140 ml (NHS: wrong powder ratio can make babies ill)
//   pro rata       £32,000 FTE, 22.5 of 37.5 h, 43.6 paid weeks = 32000 × 0.6 × 43.6/52 = £16,098;
//                  hourly stays 32000 / (37.5 × 52) = £16.41
//   calorie        woman 60 y, 150 cm, 45 kg, sedentary, lose 1 kg/wk: Mifflin BMR 927,
//                  maintenance 1,112; target must not drop to 112 kcal or give negative carbs
//   macros         male 30 y 70 kg 175 cm light, 15% deficit = 1,950 kcal, protein 30% = 146 g,
//                  also when the browser groups thousands with '.' (de-DE)
//   capacitor      1 µF at 50 Hz with 0.1 Ω ESR: phase = −atan(Xc/ESR) ≈ −90.00°
//   voltage divider 9 V across 1 MΩ + 1 MΩ = 4.5 µA, 20.25 µW per resistor
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('led resistor rounds up to the next E24 value and sizes the power rating', { skip }, () => {
  const w = mount('led-current-limiting-resistor');
  input(w, 'ledr-vs', 5); input(w, 'ledr-vf', 3.06); input(w, 'ledr-n', 1); input(w, 'ledr-ma', 20);
  assert.match(text(w, 'ledr-out'), /Nearest E24 \(at or above\) ?100 Ω/);
  input(w, 'ledr-vs', 5); input(w, 'ledr-vf', 2);
  assert.match(text(w, 'ledr-out'), /Nearest E24 \(at or above\) ?150 Ω/);
  input(w, 'ledr-vs', 24); input(w, 'ledr-ma', 100);
  const m = text(w, 'ledr-out').match(/use ≥ ([0-9.]+) W/);
  assert.ok(m && parseFloat(m[1]) >= 4.4, 'rating ' + (m && m[1]));
});

test('baby formula never rounds scoops against a fixed water volume', { skip }, () => {
  const w = mount('baby-formula-mixing-calculator');
  assert.match(text(w, 'bfmx-out'), /5 scoops \+ 150 ml water/);
  input(w, 'bfmx-feed', 140);
  const o = text(w, 'bfmx-out');
  assert.doesNotMatch(o, /5 scoops \+ 140 ml/);
  assert.match(o, /4 scoops \+ 120 ml, or 5 scoops \+ 150 ml/);
});

test('pro rata scales by paid weeks for term-time contracts', { skip }, () => {
  const w = mount('pro-rata-salary-calculator');
  assert.match(text(w, 'prsa-out'), /Pro rata pay ?£19,200/);
  input(w, 'prsa-weeks', 43.6);
  const o = text(w, 'prsa-out');
  assert.match(o, /Pro rata pay ?£16,098/);
  assert.match(o, /Hourly \(paid weeks\) ?£16\.41/);
});

test('calorie target never collapses below a safe floor or gives negative carbs', { skip }, async () => {
  const w = mount('calorie');
  const btn = w.document.createElement('button');
  for (const [id, v] of Object.entries({ 'calorie-age': 60, 'calorie-gender': 'female', 'calorie-height': 150, 'calorie-weight': 45, 'calorie-activity': '1.2', 'calorie-goal': '-1000' })) w.document.getElementById(id).value = v;
  w.calorieCalc(btn); await sleep(500);
  assert.match(text(w, 'calorie-bmr'), /^927/);
  assert.ok(parseFloat(text(w, 'calorie-target').replace(/,/g, '')) >= 800, text(w, 'calorie-target'));
  assert.doesNotMatch(text(w, 'calorie-carbs'), /-/);
  for (const [id, v] of Object.entries({ 'calorie-age': 30, 'calorie-gender': 'male', 'calorie-height': 175, 'calorie-weight': 70, 'calorie-activity': '1.55', 'calorie-goal': '-500' })) w.document.getElementById(id).value = v;
  w.calorieCalc(btn); await sleep(500);
  assert.match(text(w, 'calorie-target'), /^2,?056/);
});

test('macros keep working where thousands are grouped with a dot', { skip }, () => {
  const w = mount('macros');
  for (const [id, v] of Object.entries({ 'mc-age': 30, 'mc-weight': 70, 'mc-height': 175, 'mc-activity': '1.375' })) w.document.getElementById(id).value = v;
  w.mcSetGender('male'); w.mcSetGoal('loss');
  const orig = w.Number.prototype.toLocaleString;
  w.Number.prototype.toLocaleString = function () { return orig.call(this, 'de-DE'); };
  w.mcCalculateCalories();
  assert.match(text(w, 'mc-recommended-calories'), /1\.950/);
  assert.match(text(w, 'mc-protein-grams'), /146/);
});

test('capacitor phase angle is -atan(Xc/ESR)', { skip }, () => {
  const w = mount('capacitor-calculator');
  const d = w.document;
  const btn = d.createElement('button'); d.querySelector('.card').appendChild(btn);
  for (const [id, v] of Object.entries({ 'cap-mode': 'impedance', 'cap-C': 1, 'cap-C-multiplier': '1e-6', 'cap-f': 50, 'cap-esr': 0.1 })) d.getElementById(id).value = v;
  w.capCalculate(btn);
  const m = d.getElementById('cap-output').textContent.match(/Phase angle: (-?[0-9.]+)/);
  assert.ok(m && Math.abs(parseFloat(m[1]) + 90) < 0.1, 'phase ' + (m && m[1]));
});

test('voltage divider shows microamp currents with precision', { skip }, () => {
  const w = mount('voltage-divider-calculator');
  input(w, 'vdiv-vin', 9); input(w, 'vdiv-r1', 1e6); input(w, 'vdiv-r2', 1e6);
  const o = text(w, 'vdiv-out');
  assert.match(o, /Current ?4\.5 µA/);
  assert.match(o, /Power in R1 ?20\.3 µW/);
  input(w, 'vdiv-vin', 12); input(w, 'vdiv-r1', 10000); input(w, 'vdiv-r2', 10000);
  assert.match(text(w, 'vdiv-out'), /Current ?600 µA/);
});
