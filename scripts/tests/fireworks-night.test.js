'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) { ({ JSDOM } = require('jsdom')); }

function mount(slug) {
  const source = fs.readFileSync(path.join(__dirname, '../../cards', slug + '.html'), 'utf8');
  return new JSDOM('<!doctype html><body>' + source + '</body>', { runScripts: 'dangerously' });
}
function set(doc, id, value) { doc.getElementById(id).value = value; }
function click(doc, id) { doc.getElementById(id).click(); }
function text(doc, id) { return doc.getElementById(id).textContent; }

test('checklists update and reset independently', () => {
  for (const [slug, prefix] of [
    ['fireworks-night-checklist','fwnc'], ['fireworks-pet-preparation','fwpp'],
    ['bonfire-wildlife-checklist','bfwc'], ['fireworks-spectator-packing-list','fwsp'],
    ['sparkler-safety-checklist','fwss'], ['fireworks-burn-first-aid','fwba']
  ]) {
    const dom = mount(slug), doc = dom.window.document;
    assert.match(text(doc, prefix + '-progress'), /^0 of /);
    doc.querySelector('input[type=checkbox]').click();
    assert.match(text(doc, prefix + '-progress'), /^1 of /);
    click(doc, prefix + '-reset');
    assert.match(text(doc, prefix + '-progress'), /^0 of /);
    dom.window.close();
  }
});

test('budget totals, overspending and invalid input', () => {
  const dom = mount('fireworks-night-budget'), doc = dom.window.document;
  click(doc, 'fwnbudget-run');
  assert.match(text(doc, 'fwnbudget-result'), /Estimated total: £64\.00/);
  assert.match(text(doc, 'fwnbudget-result'), /Under budget by £16\.00/);
  set(doc, 'fwnbudget-budget', '50'); click(doc, 'fwnbudget-run');
  assert.match(text(doc, 'fwnbudget-result'), /Over budget by £14\.00/);
  set(doc, 'fwnbudget-people', '0'); click(doc, 'fwnbudget-run');
  assert.match(text(doc, 'fwnbudget-result'), /valid non-negative/);
  dom.window.close();
});

test('travel accounts for previous days and accepts zero minutes', () => {
  const dom = mount('fireworks-display-travel-planner'), doc = dom.window.document;
  set(doc, 'fwtr-start', '00:15'); set(doc, 'fwtr-journey', '30');
  set(doc, 'fwtr-queue', '0'); set(doc, 'fwtr-buffer', '0'); click(doc, 'fwtr-run');
  assert.match(text(doc, 'fwtr-result'), /23:45 \(1 day earlier\)/);
  set(doc, 'fwtr-journey', '-1'); click(doc, 'fwtr-run');
  assert.match(text(doc, 'fwtr-result'), /Enter a start time/);
  dom.window.close();
});

test('curfew responds to each night and countdown rejects a past date', () => {
  const law = mount('uk-fireworks-curfew-guide'), doc = law.window.document;
  for (const [night, expected] of [['ordinary', /11:00 pm/], ['bonfire', /midnight/], ['special', /1:00 am/]]) {
    set(doc, 'fwlaw-night', night); click(doc, 'fwlaw-run');
    assert.match(text(doc, 'fwlaw-result'), expected);
  }
  law.window.close();
  const countdown = mount('fireworks-night-countdown'), cd = countdown.window.document;
  set(cd, 'fwdt-date', '2000-11-05'); click(cd, 'fwdt-run');
  assert.match(text(cd, 'fwdt-result'), /has passed/);
  countdown.window.close();
});
