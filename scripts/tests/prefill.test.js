'use strict';
// Filled links — the contract that lets a tool URL carry the visitor's values
// (`tool.html?card=bmi&bmi-height=180&bmi-weight=75&run=1`).
//
//   node scripts/tests/prefill.test.js
//
// Why this file exists: the engine is the one piece of the site that writes
// values that came *from outside the page* into a form, and it is the piece
// three other surfaces now depend on (the share panel's "with my values"
// button, jobs.html's step hand-off, and the home page's solver). A regression
// here is silent in every other check: the page still loads, the card still
// runs, it is just set up wrong.
//
// Two kinds of check:
//   DRIVEN — the shipped functions are pulled out of tool.html and run against
//            a fixture card and against two real fragments from cards/, so the
//            assertions are about behaviour, not about text that mentions it.
//   PINNED — the rules the URL contract must never break (reserved names, the
//            XSS boundary, isolation from the host page) asserted against the
//            file, because a future edit could satisfy every driven test while
//            removing them.
//
// jsdom is scratch-only, outside the repository (AGENTS.md §2):
//   mkdir -p /tmp/tenv && cd /tmp/tenv && npm install jsdom
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) {
  try { ({ JSDOM } = require('jsdom')); }
  catch (e) {
    console.log('NOTE: jsdom not installed — filled-link tests skipped');
    console.log('      install with: mkdir -p /tmp/tenv && cd /tmp/tenv && npm install jsdom');
    process.exit(0);
  }
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'tool.html'), 'utf8');
const CARDS = path.join(ROOT, 'cards');

// ------------------------------------------------------------------ engine --
// The JS engine block, not the CSS one: the CSS header says "FILLED LINKS —"
// (em dash) while the script's says "FILLED LINKS =====", so this marker is
// the script block only.
const START = SHELL.indexOf('/* ===== FILLED LINKS =====');
const END = SHELL.indexOf('let toolHeightTimer = null;');
assert.ok(START !== -1 && END > START,
  'the filled-link engine block is not where this test reads it from in tool.html');
const ENGINE = SHELL.slice(START, END);

// A fixture shaped like the catalogue's hardest cards: a mirror pair (range +
// number), a select, a label-addressed select, a checkbox, a radio group, a
// multi-select, a textarea, a date, an action button, a Download button that
// must never be pressed by a link, and a result the test can read back.
const fixtureHtml = (opts) => {
  const guard = !opts || opts.guard !== false;
  return `
<div id="fx-root">
  <h2 id="fx-title">Fixture</h2>
  <form id="fx-form"${guard ? ' onsubmit="event.preventDefault(); window.__submits = (window.__submits || 0) + 1;"' : ''}>
    <label for="fx-name">Your name</label>
    <input id="fx-name" type="text" value="ship">
    <label for="fx-size">Size</label>
    <input id="fx-size" type="number" value="10" min="1" max="100">
    <input id="fx-size-range" type="range" min="1" max="100" value="10">
    <label for="fx-plan">Plan</label>
    <select id="fx-plan">
      <option value="free">Free — no card</option>
      <option value="pro">Pro (monthly)</option>
    </select>
    <select id="fx-units" multiple>
      <option value="kg">Kilograms</option>
      <option value="lb">Pounds</option>
      <option value="st">Stones</option>
    </select>
    <label for="fx-agree">I agree</label>
    <input id="fx-agree" type="checkbox" value="on">
    <input id="fx-yes" type="radio" name="fx-pick" value="yes">
    <input id="fx-no" type="radio" name="fx-pick" value="no" checked>
    <label for="fx-notes">Notes</label>
    <textarea id="fx-notes"></textarea>
    <label for="fx-when">When</label>
    <input id="fx-when" type="date">
    <button type="button" id="fx-go">Calculate</button>
    <button type="button" id="fx-dl">Download PDF</button>
    <div id="fx-out" aria-live="polite">—</div>
  </form>
</div>
<script>window.__runs = 0;
var fxRoot = (document.currentScript && document.currentScript.closest('.card')) || document;
var fx = function (id) { return fxRoot.querySelector('[id="' + id + '"]'); };
fx('fx-go').addEventListener('click', function () {
  window.__runs++;
  fx('fx-out').textContent = 'answer ' + fx('fx-size').value;
});</script>`;
};
const FIXTURE = fixtureHtml({ guard: true });

function mount(html, relUrl) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="host"><input id="fx-size" value="host-only"></div><div id="toolContainer"></div></body></html>',
    {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      url: 'https://www.themostusefulsiteintheworld.com/' + relUrl,
    }
  );
  const { window } = dom;
  const container = window.document.getElementById('toolContainer');

  // Mount exactly the way tool.html mounts a fragment: parse, strip scripts and
  // styles out of the markup, move the body across inside a .card wrapper,
  // re-append the styles, then append the scripts so they run.
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const card = window.document.createElement('div');
  card.className = 'card';
  const scripts = Array.from(doc.querySelectorAll('script'));
  scripts.forEach(s => s.remove());
  const styles = Array.from(doc.querySelectorAll('style'));
  styles.forEach(s => s.remove());
  while (doc.body.firstChild) card.appendChild(doc.body.firstChild);
  styles.forEach(s => {
    const style = window.document.createElement('style');
    style.textContent = s.textContent;
    card.appendChild(style);
  });
  scripts.forEach(s => {
    const script = window.document.createElement('script');
    Array.from(s.attributes).forEach(a => script.setAttribute(a.name, a.value));
    script.textContent = s.textContent;
    card.appendChild(script);
  });
  container.appendChild(card);

  // jsdom does not compile `on*` attributes on its own (`onclick="…"` sits
  // there looking bound and never fires), so the harness compiles them the way
  // scripts/test-card.js does — one pass over the mounted tree, in the window's
  // own scope. A browser does this itself; without it this file would "prove" a
  // trigger broken that works everywhere else.
  for (const node of Array.from(card.querySelectorAll('*'))) {
    for (const attr of Array.from(node.attributes)) {
      if (!/^on[a-z]+$/.test(attr.name)) continue;
      try { node[attr.name] = new window.Function('event', String(attr.value)); } catch (e) {}
    }
  }

  window.eval(ENGINE);
  try { window.document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) {}

  // The state the card shipped in, taken before any prefill — production takes
  // the same snapshot at the same moment (tool.html, right after the card's
  // scripts run and before toolApplyPrefill). Tests that forgot this used to
  // compare a filled card against its filled self and call it "unchanged".
  const pristine = window.toolSnapshot(card);

  return {
    dom, window, container, card, pristine,
    params: new window.URLSearchParams(relUrl.split('?')[1] || ''),
  };
}

// Card-scoped on purpose: the fixture puts a #fx-size on the host page too,
// so a document-wide lookup would read the wrong element.
const el = (m, id) => m.card.querySelector('[id="' + id + '"]');

// ------------------------------------------------------------ pinned rules --
test('the engine refuses to touch anything that is not a field value', () => {
  // The shell's own parameters are not fields: a card with an input called
  // `run` must not be filled by ?run=1, and a shared link must not be able to
  // rewrite which tool the page is showing.
  for (const name of ['card', 'embed', 'run', 'job', 'step', 'tool', 't']) {
    assert.match(SHELL, new RegExp(`TOOL_PREFILL_RESERVED[^;]*'${name}'`, 's'),
      `?${name}= must be reserved in tool.html, or a link can drive the shell through a field`);
  }
  assert.match(ENGINE, /\/\^\(utm_\|__\|mp_/, 'tracking parameters must be reserved too');
});

test('a URL value can never reach innerHTML', () => {
  // The whole engine is the boundary between attacker-shaped text and the DOM.
  // Nothing in it may build markup, and it must only ever assign value/checked.
  // Comments are stripped first: the block opens by *naming* the rule it keeps.
  const CODE = ENGINE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/innerHTML/.test(CODE), 'the filled-link engine must not use innerHTML');
  assert.ok(!/insertAdjacentHTML|outerHTML/.test(CODE), 'no HTML sinks in the engine');
  assert.match(ENGINE, /el\.value = String\(num\)/, 'numbers arrive through .value');
  assert.match(ENGINE, /el\.checked = checked/, 'checks arrive through .checked');
  assert.match(ENGINE, /o\.selected = true/, 'option choice arrives through selection');
  // textContent is allowed, but only for writing text the visitor sees.
  assert.match(ENGINE, /text\.textContent = '🔗 '/, 'the note is written with textContent');
});

test('a value the card does not have is reported, not dropped', () => {
  assert.match(ENGINE, /report\.missed\.push/, 'misses must be collected');
  assert.match(ENGINE, /not recognised/, 'and said out loud');
});

// ------------------------------------------------------------- driven rules --
test('fills every control type the catalogue uses, and only inside the card', () => {
  const m = mount(FIXTURE, 'tool.html?card=fixture&fx-name=Ann&fx-size=42&fx-size-range=42&fx-plan=pro&fx-units=kg,st&fx-agree=1&fx-yes=yes&fx-when=2026-12-25&fx-notes=hello');
  const report = m.window.toolApplyPrefill(m.card, m.params);

  assert.deepEqual(Array.from(report.missed), [], 'nothing should be reported as unrecognised');
  assert.equal(el(m, 'fx-name').value, 'Ann');
  assert.equal(el(m, 'fx-size').value, '42');
  assert.equal(el(m, 'fx-size-range').value, '42');
  assert.equal(el(m, 'fx-plan').value, 'pro', 'select matches by value');
  assert.deepEqual(Array.from(el(m, 'fx-units').selectedOptions).map(o => o.value).sort(), ['kg', 'st']);
  assert.equal(el(m, 'fx-agree').checked, true);
  assert.equal(el(m, 'fx-yes').checked, true);
  assert.equal(el(m, 'fx-no').checked, false, 'the other radio in the group is cleared by the browser');
  assert.equal(el(m, 'fx-when').value, '2026-12-25');
  assert.equal(el(m, 'fx-notes').value, 'hello');

  // The host page has its own #fx-size. A link must not be able to write to it.
  assert.equal(m.window.document.getElementById('host').querySelector('input').value, 'host-only',
    'the engine filled a control outside the mounted card');
});

test('a select can be addressed by the text the visitor reads, not just its value', () => {
  const m = mount(FIXTURE, 'tool.html?card=fixture&fx-plan=Pro (monthly)');
  const report = m.window.toolApplyPrefill(m.card, m.params);
  assert.deepEqual(Array.from(report.applied), ['fx-plan']);
  assert.equal(el(m, 'fx-plan').value, 'pro');
});

test('off means off: an unchecked box and a falsy value are carried', () => {
  const m = mount(FIXTURE, 'tool.html?card=fixture&fx-agree=0&fx-yes=0');
  const report = m.window.toolApplyPrefill(m.card, m.params);
  assert.deepEqual(Array.from(report.applied), ['fx-agree']);
  assert.equal(el(m, 'fx-agree').checked, false);
  // fx-yes is a radio and "0" is not its value: refusing is the honest answer.
  assert.deepEqual(Array.from(report.missed), ['fx-yes']);
});

test('an impossible value reports as unrecognised instead of pretending', () => {
  const m = mount(FIXTURE, 'tool.html?card=fixture&fx-plan=enterprise&fx-when=25/12/2026&fx-size=lots&fx-nope=1');
  const report = m.window.toolApplyPrefill(m.card, m.params);
  assert.deepEqual(Array.from(report.missed).sort(), ['fx-nope', 'fx-plan', 'fx-size', 'fx-when']);
  assert.deepEqual(Array.from(report.applied), []);
  assert.equal(el(m, 'fx-when').value, '', 'a rejected date stays empty — and is reported');
});

test('&run=1 presses Calculate, and would never press Download', () => {
  const m = mount(fixtureHtml({ guard: false }), 'tool.html?card=fixture&fx-size=77&run=1');
  m.window.toolApplyPrefill(m.card, m.params);
  const trigger = m.window.toolTriggerCard(m.card);
  assert.equal(trigger, 'button');
  assert.equal(m.window.__runs, 1, 'the card ran once');
  assert.equal(el(m, 'fx-out').textContent, 'answer 77', 'and used the value from the link');
  assert.equal(el(m, 'fx-dl') === null, false, 'fixture sanity');
});

test('the trigger dispatches a submit event rather than calling requestSubmit', () => {
  // requestSubmit() would let a card that forgot preventDefault navigate away
  // and lose the visitor's work; a dispatched event cannot.
  const body = ENGINE.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(body, /form\.dispatchEvent\(new Event\('submit'/,
    'toolTriggerCard must dispatch the submit event');
  assert.ok(!/\.requestSubmit\(/.test(body), 'and must not call requestSubmit');
});

test('the form that guards itself is submitted; the fixture count proves it', () => {
  const m = mount(FIXTURE, 'tool.html?card=fixture&fx-name=Zoe&run=1');
  m.window.toolApplyPrefill(m.card, m.params);
  m.window.toolTriggerCard(m.card);
  assert.equal(m.window.__submits, 1, 'the guarded form must be submitted once');
});

test('a shared link round-trips: same URL in, same values out, and it carries the answer', () => {
  const m = mount(FIXTURE, 'tool.html?card=fixture&fx-size=33&fx-plan=pro');
  m.window.toolApplyPrefill(m.card, m.params);
  const built = m.window.toolFilledUrl('fixture', m.card, m.pristine);

  assert.match(built.url, /tool\.html\?card=fixture&/);
  assert.match(built.url, /fx-size=33/);
  assert.match(built.url, /fx-plan=pro/);
  assert.match(built.url, /run=1/, 'a link built off a card that can run itself asks it to run');

  // Open the built link as a fresh page and compare the result.
  const again = mount(FIXTURE, built.url.replace('https://www.themostusefulsiteintheworld.com/', ''));
  again.window.toolApplyPrefill(again.card, again.params);
  assert.equal(el(again, 'fx-size').value, '33');
  assert.equal(el(again, 'fx-plan').value, 'pro');
  assert.equal(again.window.__runs, 0, 'opening a link does not run by itself; only the explicit step does');
});

test('only what the visitor changed is carried, and the link stays sendable', () => {
  const m = mount(FIXTURE, 'tool.html?card=fixture');
  const snapshot = m.pristine;
  assert.deepEqual(Array.from(m.window.toolChangedValues(m.card, snapshot)), [],
    'a card nobody has touched has nothing to carry');

  el(m, 'fx-notes').value = 'x'.repeat(4000);
  const built = m.window.toolFilledUrl('fixture', m.card, snapshot);
  assert.equal(built.carried, 0, 'an over-long value is dropped rather than published');
  assert.equal(built.dropped, 1);
  assert.ok(built.url.length < 2000, 'and the link is still a link');
});

test('a real card: 25% of 400 is 100, computed from a link', () => {
  const fragment = fs.readFileSync(path.join(CARDS, 'percentage-calculator.html'), 'utf8');
  const m = mount(fragment, 'tool.html?card=percentage-calculator&pct-a=25&pct-b=400&run=1');
  const report = m.window.toolApplyPrefill(m.card, m.params);
  assert.deepEqual(Array.from(report.applied).sort(), ['pct-a', 'pct-b']);
  m.window.toolTriggerCard(m.card);
  assert.equal(el(m, 'pct-out').textContent.trim(), '25% of 400 = 100');
});

test('a real card: the mode select is addressable by its option value', () => {
  const fragment = fs.readFileSync(path.join(CARDS, 'percentage-calculator.html'), 'utf8');
  const m = mount(fragment, 'tool.html?card=percentage-calculator&pct-mode=discount&pct-a=20&pct-b=80&run=1');
  m.window.toolApplyPrefill(m.card, m.params);
  m.window.toolTriggerCard(m.card);
  assert.equal(el(m, 'pct-out').textContent.trim(), 'After 20% discount: 64.00');
});

test('a real card: an output can be read back as a number for the next job step', () => {
  const fragment = fs.readFileSync(path.join(CARDS, 'percentage-calculator.html'), 'utf8');
  const m = mount(fragment, 'tool.html?card=percentage-calculator&pct-a=25&pct-b=400&run=1');
  m.window.toolApplyPrefill(m.card, m.params);
  m.window.toolTriggerCard(m.card);
  assert.equal(m.window.toolReadNumber(m.card, 'pct-out'), 25, 'first number in "25% of 400 = 100"');
  assert.equal(m.window.toolReadOutput(m.card, 'pct-out'), '25% of 400 = 100');
  assert.equal(m.window.toolReadOutput(m.card, 'not-in-this-card'), '');
});

test('the note says what arrived and stays hidden without JavaScript', () => {
  assert.match(SHELL, /<div id="prefillNote" role="status" aria-live="polite">/);
  assert.match(SHELL, /#prefillNote\{display:none;/, 'hidden at first paint');
  assert.match(SHELL, /body\.embed-mode #prefillNote\{display:none !important\}/,
    'embed=1 is a documented chrome-free contract — the note must not appear in an embed');
});
