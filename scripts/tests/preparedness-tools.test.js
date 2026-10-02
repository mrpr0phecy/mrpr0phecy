'use strict';
// Focused, in-DOM checks for civilian drone safety and service-interruption
// planning. The cards must remain advisory, privacy-first and non-operational.
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) {
  try { ({ JSDOM } = require('jsdom')); }
  catch (e) {
    console.log('NOTE: jsdom not installed — preparedness tool tests skipped');
    console.log('      install with: mkdir -p /tmp/tenv && cd /tmp/tenv && npm install jsdom');
    process.exit(0);
  }
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ROOT = path.join(__dirname, '..', '..');
const CARDS = path.join(ROOT, 'cards');

function mount(slug) {
  const writes = [];
  const dom = new JSDOM(fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://tools.example.test/',
    beforeParse(window) {
      window.navigator.clipboard = { writeText: value => { writes.push(String(value)); return Promise.resolve(); } };
    },
  });
  const d = dom.window.document;
  const prefix = slug + '-';
  return {
    dom, d, writes,
    id: key => d.getElementById(prefix + key),
    text: key => d.getElementById(prefix + key).textContent.replace(/\s+/g, ' ').trim(),
    change(key, value) {
      const el = d.getElementById(prefix + key);
      assert.ok(el, 'missing #' + prefix + key);
      el.value = value;
      el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    },
    click(key) {
      const el = d.getElementById(prefix + key);
      assert.ok(el, 'missing #' + prefix + key);
      el.click();
    },
    close() { dom.window.close(); },
  };
}
async function settle() { await new Promise(resolve => setImmediate(resolve)); }

test('drone guide stays civilian-safe, does not infer intent, and switches to jurisdiction-aware reporting', async () => {
  const t = mount('drone-sighting-safety-guide');
  try {
    assert.match(t.text('desc'), /sighting alone is not evidence of a threat/);
    assert.match(t.text('advice'), /A sighting is not a verdict/);
    assert.match(t.text('advice'), /no need to follow it/);
    assert.match(t.d.querySelector('.dsg-warning').textContent, /Do not approach, chase, touch, seize, jam or try to disable/);
    assert.match(t.d.querySelector('details').textContent, /Civil Aviation Authority/);
    assert.equal(t.d.querySelectorAll('input').length, 0, 'guide asks for no identity or location');
    assert.equal(t.dom.window.localStorage.length, 0, 'guide stores nothing');

    t.change('scenario', 'landed');
    assert.match(t.text('advice'), /Treat a crashed drone or unknown debris as off-limits/);
    assert.match(t.text('advice'), /Do not touch, move, retrieve or closely inspect/);

    t.change('region', 'uk');
    assert.match(t.text('advice'), /999 for immediate danger to life or threat of violence/);
    assert.match(t.text('status'), /UK reporting note selected/);
    t.click('copy');
    await settle();
    assert.match(t.writes[0], /Do not approach, chase or interfere/);
    assert.match(t.writes[0], /UK reporting note: CAA guidance says local police 101/);
    assert.doesNotMatch(t.writes[0], /[A-Z]{2,}\d{2,}/, 'copy contains no coordinates or personal details');

    t.change('scenario', 'official');
    assert.match(t.text('advice'), /Follow the current official instruction/);
    assert.match(t.text('advice'), /check a known government, emergency-service or venue channel/);
  } finally { t.close(); }
});

test('service disruption map builds a private dependency checklist without scoring or forecasting', async () => {
  const t = mount('service-disruption-readiness-map');
  try {
    assert.equal(t.id('copy').disabled, true);
    assert.match(t.text('results'), /Select at least one service or support need/);
    assert.match(t.d.querySelector('.sdr-warning').textContent, /not live outage information or medical advice/);
    assert.match(t.d.querySelector('details').textContent, /England/);
    assert.equal(t.d.querySelectorAll('input[type="text"],input[type="tel"],input[type="email"]').length, 0, 'no identifying details are requested');
    assert.equal(t.dom.window.localStorage.length, 0, 'selections are not persisted');

    const power = t.d.querySelector('[data-sdr-service="power"]');
    const water = t.d.querySelector('[data-sdr-service="water"]');
    const equipment = t.d.querySelector('[data-sdr-need="equipment"]');
    const medicine = t.d.querySelector('[data-sdr-need="medicine"]');
    for (const el of [power, water, equipment, medicine]) {
      el.checked = true;
      el.dispatchEvent(new t.dom.window.Event('change', { bubbles: true }));
    }
    t.change('horizon', 'extended');
    assert.match(t.text('results'), /More than a day/);
    assert.match(t.text('results'), /care team, device supplier and utility/);
    assert.match(t.text('results'), /water-provider and public-health instructions/);
    assert.match(t.text('results'), /do not rely on a generic time or temperature estimate/);
    assert.equal(t.d.querySelectorAll('[data-sdr-action]').length, 7);

    const first = t.d.querySelector('[data-sdr-action="power-source"]');
    first.checked = true;
    first.dispatchEvent(new t.dom.window.Event('change', { bubbles: true }));
    assert.match(t.text('progress'), /1 of 7 planning steps checked/);
    t.click('copy');
    await settle();
    assert.match(t.writes[0], /Service disruption rehearsal — More than a day/);
    assert.match(t.writes[0], /Electricity and home energy/);
    assert.match(t.writes[0], /powered medical or assistive equipment/i);
    assert.doesNotMatch(t.writes[0], /address:|phone:|name:/i);

    t.click('reset');
    assert.equal(t.id('copy').disabled, true);
    assert.match(t.text('progress'), /No selections yet/);
    assert.equal(t.d.querySelectorAll('[data-sdr-action]').length, 0);
  } finally { t.close(); }
});

test('new preparedness cards are catalogued outside AI and preserve privacy language', () => {
  const catalogue = JSON.parse(fs.readFileSync(path.join(CARDS, 'cards.json'), 'utf8'));
  for (const slug of ['drone-sighting-safety-guide', 'service-disruption-readiness-map']) {
    const card = catalogue.find(item => item.name === slug);
    assert.ok(card, slug + ' must be present in cards.json');
    assert.equal(card.category, 'Survival & Emergency Readiness');
    const html = fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8');
    assert.doesNotMatch(html, /\bAI\b|artificial intelligence/i, slug + ' must not be AI-related');
    assert.match(html, /No .*?(?:details|personal|location|names)|No .*?requested/i);
  }
});
