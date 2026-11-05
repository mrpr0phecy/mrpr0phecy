'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) { ({ JSDOM } = require('jsdom')); }
function mount(slug) {
  const html = fs.readFileSync(path.join(__dirname, '../../cards', slug + '.html'), 'utf8');
  return new JSDOM('<!doctype html><body>' + html + '</body>', {runScripts: 'dangerously'});
}
const set = (d,id,v) => { d.getElementById(id).value = v; };
const click = (d,id) => d.getElementById(id).click();
const text = (d,id) => d.getElementById(id).textContent;

test('quiz requires all answers, scores, explains and resets', () => {
  const dom = mount('fireworks-night-quiz'), d = dom.window.document;
  click(d, 'fwquiz-score'); assert.match(text(d, 'fwquiz-result'), /answer all eight/);
  [0,1,0,1,1,0,1,0].forEach((answer,i) => { d.querySelector(`input[name="fwquiz-q${i}"][value="${answer}"]`).checked = true; });
  click(d, 'fwquiz-score'); assert.match(text(d, 'fwquiz-result'), /8 \/ 8/);
  d.querySelector('input[name="fwquiz-q0"][value="1"]').checked = true;
  click(d, 'fwquiz-score'); assert.match(text(d, 'fwquiz-result'), /7 \/ 8/); assert.match(text(d, 'fwquiz-result'), /Not quite/);
  click(d, 'fwquiz-reset'); assert.equal(d.querySelectorAll('input:checked').length, 0);
  dom.window.close();
});
test('bingo progress and reset', () => {
  const dom = mount('fireworks-night-bingo'), d = dom.window.document;
  d.querySelector('input').click(); assert.match(text(d, 'fwbingo-progress'), /1 of 9/);
  click(d, 'fwbingo-reset'); assert.match(text(d, 'fwbingo-progress'), /0 of 9/); dom.window.close();
});
test('drinks arithmetic, fractional cups and validation', () => {
  const dom = mount('bonfire-night-hot-chocolate-calculator'), d = dom.window.document;
  click(d, 'fwhot-run'); assert.match(text(d, 'fwhot-result'), /2\.64 litres/); assert.match(text(d, 'fwhot-result'), /at least 14/);
  set(d, 'fwhot-cups', '0.5'); set(d, 'fwhot-reserve', '0'); click(d, 'fwhot-run'); assert.match(text(d, 'fwhot-result'), /1\.20 litres/);
  set(d, 'fwhot-guests', '0'); click(d, 'fwhot-run'); assert.match(text(d, 'fwhot-result'), /valid values/); dom.window.close();
});
test('invitation treats user text as text and validates blanks', () => {
  const dom = mount('fireworks-night-invitation'), d = dom.window.document;
  set(d, 'fwinvite-name', '<img src=x onerror=alert(1)>'); click(d, 'fwinvite-run');
  assert.match(text(d, 'fwinvite-result'), /<img src=x/); assert.equal(d.querySelector('#fwinvite-result img'), null);
  set(d, 'fwinvite-name', ' '); click(d, 'fwinvite-run'); assert.match(text(d, 'fwinvite-result'), /fill in all four/); dom.window.close();
});
test('caption generator changes style and copy fallback is clear', async () => {
  const dom = mount('fireworks-night-captions'), d = dom.window.document;
  click(d, 'fwcaption-run'); assert.match(text(d, 'fwcaption-result'), /shiny things/);
  set(d, 'fwcaption-mood', 'cosy'); click(d, 'fwcaption-run'); assert.match(text(d, 'fwcaption-result'), /Cold hands/);
  click(d, 'fwcaption-copy'); await new Promise(r => setTimeout(r, 0)); assert.match(text(d, 'fwcaption-status'), /manually/); dom.window.close();
});
test('planners respond to selections', () => {
  const cases = [
    ['fireworks-photo-settings','fwphoto','camera','manual',/Manual camera|Handheld/],
    ['fireworks-night-what-to-wear','fwwear','rain','rain',/waterproof/],
    ['fireworks-sensory-friendly-plan','fwquiet','need','both',/hearing protection/],
    ['report-fireworks-noise-uk','fwreport','situation','noise',/local council/],
    ['bonfire-night-ideas-without-fireworks','fwideas','setting','indoor',/hot chocolate/]
  ];
  for (const [slug,prefix,field,value,expected] of cases) {
    const dom = mount(slug), d = dom.window.document; set(d, prefix + '-' + field, value); click(d, prefix + '-run'); assert.match(text(d, prefix + '-result'), expected); dom.window.close();
  }
});
