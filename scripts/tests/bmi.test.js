'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

let JSDOM;
try {
  ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom'));
} catch (_) {
  try { ({ JSDOM } = require('jsdom')); } catch (_) { JSDOM = null; }
}

const ROOT = path.join(__dirname, '..', '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function mountBmi() {
  const html = fs.readFileSync(path.join(ROOT, 'cards', 'bmi.html'), 'utf8');
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://www.themostusefulsiteintheworld.com/tool.html?card=bmi',
  });
  const { window } = dom;
  const document = window.document;
  const parsed = new window.DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(parsed.querySelectorAll('script'));
  scripts.forEach(script => script.remove());
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  while (parsed.body.firstChild) wrapper.appendChild(parsed.body.firstChild);
  document.getElementById('host').appendChild(wrapper);
  scripts.forEach(script => window.eval(script.textContent));
  return { dom, window, document, $: id => document.getElementById(id) };
}

const skip = !JSDOM && 'jsdom is not installed (see AGENTS.md §2)';

test('BMI unit switches convert values, keep the result stable, expose selection, and reset cleanly', { skip }, async () => {
  const t = mountBmi();
  try {
    // Let the card's initial ready-state calculation settle before comparing it.
    await wait(650);
    const initialBmi = t.$('bmi-value').textContent;
    assert.equal(initialBmi, '22.9');

    t.window.bmiSetHeightUnit('in', false);
    assert.equal(t.$('bmi-height-input').value, '68.9', '175 cm converts to 68.9 inches');
    assert.equal(t.$('bmi-height').value, '68.9', 'the height slider remains in sync at the converted precision');
    assert.equal(t.$('bmi-height-input').min, '40');
    assert.equal(t.$('bmi-height-input').max, '100');
    assert.equal(t.$('bmi-height-input').getAttribute('aria-label'), 'Height in inches');
    assert.equal(t.$('bmi-height').getAttribute('aria-valuetext'), '68.9 inches');
    assert.equal(t.$('bmi-height-min').textContent, '40 in');
    assert.equal(t.$('bmi-height-max').textContent, '100 in');
    assert.equal(t.document.querySelector('[onclick="bmiSetHeightUnit(\'in\')"]').getAttribute('aria-pressed'), 'true');
    assert.equal(t.document.querySelector('[onclick="bmiSetHeightUnit(\'cm\')"]').getAttribute('aria-pressed'), 'false');

    t.window.bmiSetWeightUnit('lb', false);
    assert.equal(t.$('bmi-weight-input').value, '154.3', '70 kg converts to 154.3 pounds');
    assert.equal(t.$('bmi-weight').value, '154.3', 'the weight slider remains in sync at the converted precision');
    assert.equal(t.$('bmi-weight-input').min, '66');
    assert.equal(t.$('bmi-weight-input').max, '440');
    assert.equal(t.$('bmi-weight-input').getAttribute('aria-label'), 'Weight in pounds');
    assert.equal(t.$('bmi-weight').getAttribute('aria-valuetext'), '154.3 pounds');
    assert.equal(t.$('bmi-weight-min').textContent, '66 lb');
    assert.equal(t.$('bmi-weight-max').textContent, '440 lb');
    assert.equal(t.document.querySelector('[onclick="bmiSetWeightUnit(\'lb\')"]').getAttribute('aria-pressed'), 'true');
    assert.equal(t.document.querySelector('[onclick="bmiSetWeightUnit(\'kg\')"]').getAttribute('aria-pressed'), 'false');

    t.window.bmiSetHeightUnit('cm', false);
    t.window.bmiSetWeightUnit('kg', false);
    assert.equal(t.$('bmi-height-input').value, '175', 'switching back restores the metric height');
    assert.equal(t.$('bmi-weight-input').value, '70', 'switching back restores the metric weight');
    t.window.bmiSetHeightUnit('in', false);
    t.window.bmiSetWeightUnit('lb', false);

    t.window.bmiCalculate();
    await wait(350);
    assert.equal(t.$('bmi-value').textContent, initialBmi, 'unit conversions do not alter the calculated BMI');

    t.window.bmiReset();
    assert.equal(t.$('bmi-height-input').value, '175');
    assert.equal(t.$('bmi-height-display').textContent, '175 cm');
    assert.equal(t.$('bmi-weight-input').value, '70');
    assert.equal(t.$('bmi-weight-display').textContent, '70 kg');
    assert.equal(t.$('bmi-height-input').getAttribute('aria-label'), 'Height in centimetres');
    await wait(450);
    assert.equal(t.$('bmi-value').textContent, '–', 'reset remains cleared instead of a queued unit-change calculation repopulating it');
  } finally {
    t.dom.window.close();
  }
});

test('BMI slider and number input labels follow the selected unit', { skip }, async () => {
  const t = mountBmi();
  try {
    await wait(10);
    t.window.bmiSetHeightUnit('in', false);
    t.window.bmiSetWeightUnit('lb', false);

    t.$('bmi-height').value = '70';
    t.$('bmi-height').dispatchEvent(new t.window.Event('input', { bubbles: true }));
    assert.equal(t.$('bmi-height-input').value, '70');
    assert.equal(t.$('bmi-height-display').textContent, '70 in');
    assert.equal(t.$('bmi-height').getAttribute('aria-valuetext'), '70 inches');

    t.$('bmi-weight-input').value = '155';
    t.$('bmi-weight-input').dispatchEvent(new t.window.Event('input', { bubbles: true }));
    assert.equal(t.$('bmi-weight').value, '155');
    assert.equal(t.$('bmi-weight-display').textContent, '155 lb');
    assert.equal(t.$('bmi-weight').getAttribute('aria-valuetext'), '155 pounds');
  } finally {
    t.dom.window.close();
  }
});
