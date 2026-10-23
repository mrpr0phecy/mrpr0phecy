'use strict';
// Regression vectors from the 2026-10-19 daily audit (batch 6). Expected values were
// worked by hand, independently of the cards:
//   phantom zero   "4, 7, 7, 9\n" (a pasted list ending in a newline) has n = 4 and
//                  mean 6.75; a trailing or leading separator must not add a 0
//   quartiles      12 15 15 17 18 21 21 21 24 30, inclusive method (Excel QUARTILE.INC):
//                  Q1 at position 2.25 = 15 + 0.25 × (17 − 15) = 15.5, Q3 at 6.75 = 21
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
  return new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/' }).window;
}
const flat = (w, id) => w.document.getElementById(id).textContent.replace(/\s+/g, ' ').trim();

test('mean-median-mode: trailing newline and leading space add no phantom zero', { skip }, () => {
  const w = mount('mean-median-mode');
  w.document.getElementById('stats').value = ' 4, 7, 7, 9\n';
  w.document.getElementById('stats-go').click();
  const out = flat(w, 'stats-out');
  assert.match(out, /Count: 4/);
  assert.match(out, /Mean: 6\.75/);
  assert.match(out, /Median: 7/);
});

test('mean-median-mode-stdev: trailing newline adds no phantom zero', { skip }, () => {
  const w = mount('mean-median-mode-stdev');
  const el = w.document.getElementById('mmms-in');
  el.value = '\n4, 7, 7, 9\n';
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  const out = flat(w, 'mmms-out');
  assert.match(out, /Count n ?4Mean/);
  assert.match(out, /Mean ?6\.75/);
});

test('mean-median-mode-stdev: quartiles use the inclusive interpolated method', { skip }, () => {
  const w = mount('mean-median-mode-stdev');
  const out = flat(w, 'mmms-out');
  assert.match(out, /Q1 \/ Q3 \(inclusive\) ?15\.5 \/ 21\b/);
});
