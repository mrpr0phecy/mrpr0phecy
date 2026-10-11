'use strict';
// Regression vectors from the 2026-10-11 accuracy audit (batch 2). Expected values
// were derived independently of the cards:
//   heat index  NWS (WPC) method: simple Steadman form first, Rothfusz only when the
//               average of the simple value and T is 80 °F or more, always with the
//               measured T. 20 °C/50% -> 19.4 °C; 26 °C/90% -> 27.0 °C; 26.4 °C/95% -> 29.4 °C
//   NEWS2       RCP 2017 chart: a single parameter scoring 3 needs minimum 1-hourly
//               observations; a total of 5-6 is the urgent (not emergency) response
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
  const w = new JSDOM(fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8'), { runScripts: 'dangerously', pretendToBeVisual: true }).window;
  return w;
}
function input(w, id, value) {
  const e = w.document.getElementById(id);
  assert.ok(e, 'no #' + id);
  e.value = String(value);
  e.dispatchEvent(new w.Event('input', { bubbles: true }));
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
const text = (w, id) => w.document.getElementById(id).textContent.replace(/\s+/g, ' ');

test('heat-index-calculator uses the NWS simple form below 80 °F', { skip }, () => {
  const w = mount('heat-index-calculator');
  input(w, 'htix-t', 20); input(w, 'htix-rh', 50);
  assert.match(text(w, 'htix-out'), /Heat index\s*19\.4 °C/);
  input(w, 'htix-t', 26); input(w, 'htix-rh', 90);
  assert.match(text(w, 'htix-out'), /Heat index\s*27\.0 °C/);
  input(w, 'htix-t', 32); input(w, 'htix-rh', 70);
  assert.match(text(w, 'htix-out'), /Heat index\s*40\.4 °C/);
  input(w, 'htix-rh', 150);
  assert.doesNotMatch(text(w, 'htix-out'), /Heat index/);
});

test('heat-cold-exposure-survival-calc runs Rothfusz with the measured temperature', { skip }, () => {
  const w = mount('heat-cold-exposure-survival-calc');
  input(w, 'hcx-wind', 3); input(w, 'hcx-temp', 26.4); input(w, 'hcx-hum', 95);
  const s = w.document.body.textContent.replace(/\s+/g, ' ');
  assert.match(s, /heat index\s*29\s*°C/i);
});

test('news2-early-warning-score gives the RCP response frequencies', { skip }, () => {
  const w = mount('news2-early-warning-score');
  input(w, 'news2-rr', 25);
  let s = text(w, 'news2-out');
  assert.match(s, /NEWS2 3/);
  assert.match(s, /1-hourly/);
  assert.doesNotMatch(s, /4-hourly/);
  input(w, 'news2-rr', 22); input(w, 'news2-pulse', 115); input(w, 'news2-temp', '38.5');
  s = text(w, 'news2-out');
  assert.match(s, /NEWS2 5/);
  assert.match(s, /Urgent response/);
  assert.doesNotMatch(s, /Emergency response/);
});
