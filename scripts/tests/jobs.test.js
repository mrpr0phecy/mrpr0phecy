'use strict';
// Jobs — the multi-step flows over the catalogue (jobs.html / jobs.json) and
// the rail that runs them inside tool.html.
//
//   node scripts/tests/jobs.test.js
//
// Why this file exists: a job is a *promise about ids*. It says "read the
// number out of #gma-dep and put it into #mortgage-down", and if either ever
// changes, the page still renders, the links still open, and the next tool
// just arrives empty — the worst kind of broken, because it looks fine. So
// this file re-derives every reference from the cards themselves (not from
// jobs.json, which the builder wrote) and then *walks two real jobs end to end*
// in a DOM: BMI → BMR → macros, and the room job's dimensions.
//
// jsdom is scratch-only, outside the repository (AGENTS.md §2):
//   mkdir -p /tmp/tenv && cd /tmp/tenv && npm install jsdom
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) {
  try { ({ JSDOM } = require('jsdom')); }
  catch (e) {
    console.log('NOTE: jsdom not installed — job rail tests skipped');
    console.log('      install with: mkdir -p /tmp/tenv && cd /tmp/tenv && npm install jsdom');
    process.exit(0);
  }
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { readCard } = require('../lib/card-fields.js');

const ROOT = path.join(__dirname, '..', '..');
const CARDS = path.join(ROOT, 'cards');
const SHELL = fs.readFileSync(path.join(ROOT, 'tool.html'), 'utf8');
const JOBS = JSON.parse(fs.readFileSync(path.join(ROOT, 'jobs.json'), 'utf8'));
const PAGE = fs.readFileSync(path.join(ROOT, 'jobs.html'), 'utf8');
const BUILDER = require('../build-jobs.js');

const START = SHELL.indexOf('/* ===== FILLED LINKS =====');
const END = SHELL.indexOf('let toolHeightTimer = null;');
const ENGINE = SHELL.slice(START, END);

/* ------------------------------------------------------------- the promise -- */
test('every job fills fields that exist and reads elements that exist', () => {
  const problems = [];
  for (const job of JOBS.jobs) {
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(job.id)) problems.push(`${job.id}: not a slug`);
    if (!job.steps || job.steps.length < 2) problems.push(`${job.id}: fewer than two steps`);
    (job.steps || []).forEach((step, i) => {
      const file = path.join(CARDS, step.card + '.html');
      if (!fs.existsSync(file)) { problems.push(`${job.id} step ${i + 1}: no cards/${step.card}.html`); return; }
      const card = readCard(file);
      const fields = new Set(card.fields.map(f => f.id));
      const html = fs.readFileSync(file, 'utf8');
      const ids = new Set((html.match(/\bid\s*=\s*("([^"]*)"|'([^']*)')/gi) || [])
        .map(s => s.replace(/^.*?=\s*["']?/, '').replace(/["']$/, '')));
      for (const id of Object.keys(step.fills || {})) {
        if (!ids.has(id)) problems.push(`${job.id} step ${i + 1}: fills #${id}, not on ${step.card}`);
      }
      for (const pair of step.carry || []) {
        if (!ids.has(pair.from)) problems.push(`${job.id} step ${i + 1}: carries from #${pair.from}, not on ${step.card}`);
        if (!pair.label) problems.push(`${job.id} step ${i + 1}: #${pair.from} has no label for the rail to say`);
        const next = job.steps[i + 1];
        if (next) {
          const nextFields = new Set(readCard(path.join(CARDS, next.card + '.html')).fields.map(f => f.id));
          if (!nextFields.has(pair.to)) {
            problems.push(`${job.id} step ${i + 1}: carries into ${next.card}#${pair.to}, which the link cannot fill`);
          }
        }
      }
      if (i === job.steps.length - 1 && (step.carry || []).length) {
        problems.push(`${job.id} step ${i + 1}: the last step carries into nothing`);
      }
    });
  }
  assert.deepEqual(problems, [], 'jobs reference ids the cards do not have:\n' + problems.join('\n'));
});

test('the builder and the page agree about which cards can run themselves', () => {
  // jobs.json promises `runs: true` for a step the rail will add &run=1 to. If
  // the builder's idea of a run trigger and the engine's ever diverge, a job
  // arrives with the numbers in but no result — the exact failure this feature
  // exists to avoid. Compare them on the same shapes.
  const cases = [
    ['<form onsubmit="event.preventDefault(); calc()"><input id="x" type="number"></form>', true],
    ['<button type="button" onclick="go()">\u{1F525} Calculate</button>', true],
    ['<button type="button" onclick="dl()">Download PDF</button>', false],
    ['<button type="button" onclick="r()">\u{1F504} Reset</button>', false],
  ];
  for (const [html, expected] of cases) {
    assert.equal(BUILDER.hasRunTrigger(html), expected, 'build-jobs disagrees with itself on: ' + html);
    const m = mount('<div id="fx-root">' + html + '</div>', 'tool.html?card=fixture');
    assert.equal(!!m.window.toolHasRunTrigger(m.card), expected, 'the engine disagrees about: ' + html);
  }
  // And the generator is stable: re-deriving from the source must produce what
  // is on disk (verify.sh --deep runs the same re-derivation as a check).
  assert.equal(JSON.stringify(BUILDER.buildJson(), null, 2) + '\n', fs.readFileSync(path.join(ROOT, 'jobs.json'), 'utf8'));
  assert.equal(BUILDER.buildHtml(), PAGE, 'jobs.html is stale — run: node scripts/build-jobs.js');
});
test('jobs.html is a real page for people and crawlers', () => {
  assert.match(PAGE, /<title>Jobs — \d+ Multi-Step Tool Workflows/);
  assert.match(PAGE, /<link rel="canonical" href="https:\/\/www\.themostusefulsiteintheworld\.com\/jobs\.html">/);
  assert.match(PAGE, /property="og:title"/);
  assert.match(PAGE, /name="twitter:card" content="summary_large_image"/);
  assert.match(PAGE, /<h1>/);
  assert.equal((PAGE.match(/<h1>/g) || []).length, 1, 'exactly one h1');
  // Every step is a plain link a crawler can follow, and each one names the
  // job and step so the rail knows where it is.
  for (const job of JOBS.jobs) {
    for (const step of job.steps) {
      assert.ok(PAGE.includes(`tool.html?card=${step.card}&amp;job=${job.id}&amp;step=${step.n}`) ||
                PAGE.includes(`tool.html?card=${step.card}&job=${job.id}&step=${step.n}`),
        `jobs.html has no link to ${job.id} step ${step.n}`);
    }
  }
  // The page must not promise a server, an account or a stored history.
  assert.ok(!/sign ?up|log ?in|create an account/i.test(PAGE), 'jobs.html must not imply an account');
});

/* ----------------------------------------------------------------- walk it -- */
function mount(cardHtml, relUrl) {
  const dom = new JSDOM('<!doctype html><html><body><div id="toolContainer"></div></body></html>', {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://www.themostusefulsiteintheworld.com/' + relUrl,
  });
  const { window } = dom;
  const container = window.document.getElementById('toolContainer');
  const doc = new window.DOMParser().parseFromString(cardHtml, 'text/html');
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

  // jsdom does not compile inline on* attributes (see scripts/test-card.js).
  for (const node of Array.from(card.querySelectorAll('*'))) {
    for (const attr of Array.from(node.attributes)) {
      if (!/^on[a-z]+$/.test(attr.name)) continue;
      try { node[attr.name] = new window.Function('event', String(attr.value)); } catch (e) {}
    }
  }
  window.eval(ENGINE);
  try { window.document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) {}
  return {
    window, card,
    params: new window.URLSearchParams(relUrl.split('?')[1] || ''),
    id: key => card.querySelector('[id="' + key + '"]'),
    live: null,
  };
}

function openStep(cardHtml, url) {
  const m = mount(cardHtml, url);
  m.live = { card: m.params.get('card'), root: m.card, snapshot: m.window.toolSnapshot(m.card) };
  m.window.toolApplyPrefill(m.card, m.params);
  if (m.params.get('run') === '1') m.window.toolTriggerCard(m.card);
  return m;
}

const settle = (ms) => new Promise(r => setTimeout(r, ms || 450));   // bmr computes 300 ms after the press

test('walk a real job end to end: BMI → BMR → macros', async () => {
  const job = JOBS.jobs.find(j => j.id === 'weight-to-macros');
  assert.ok(job, 'weight-to-macros is gone from jobs.json');

  // Step 1 — the visitor types height, weight and age into the BMI card.
  const s1 = openStep(fs.readFileSync(path.join(CARDS, 'bmi.html'), 'utf8'),
    'tool.html?card=bmi&job=weight-to-macros&step=1&bmi-height-input=180&bmi-weight-input=75&bmi-age=40&run=1');
  const url2 = s1.window.toolJobNextUrl(job, 0, s1.live);
  assert.ok(url2, 'the rail could not build step 2 — a carried value was missing');
  assert.match(url2, /card=bmr/);
  assert.match(url2, /bmr-height-input=180/);
  assert.match(url2, /bmr-weight-input=75/);
  assert.match(url2, /bmr-age-input=40/);
  assert.match(url2, /job=weight-to-macros&step=2/);

  // Step 2 — BMR opens with those numbers already in; its own control runs it.
  const s2 = openStep(fs.readFileSync(path.join(CARDS, 'bmr.html'), 'utf8'), url2);
  await settle();   // this card computes inside a setTimeout
  assert.equal(s2.id('bmr-height-input').value, '180');
  assert.equal(s2.id('bmr-weight-input').value, '75');
  assert.equal(s2.id('bmr-age-input').value, '40');
  const tdee = s2.window.toolReadNumber(s2.card, 'tdee-result');
  assert.ok(isFinite(tdee) && tdee > 800 && tdee < 6000,
    `expected a plausible daily energy figure, read ${JSON.stringify(s2.window.toolReadOutput(s2.card, 'tdee-result'))}`);

  const url3 = s2.window.toolJobNextUrl(job, 1, s2.live);
  assert.match(url3, /card=macros/);
  assert.ok(url3.includes('mc-custom-calories=' + tdee), 'the daily figure must be carried, not re-typed');
  assert.match(url3, /mc-height=180/);
  assert.match(url3, /mc-weight=75/);
  assert.match(url3, /mc-age=40/);

  // Step 3 — the macro card receives all four.
  const s3 = openStep(fs.readFileSync(path.join(CARDS, 'macros.html'), 'utf8'), url3);
  assert.equal(s3.id('mc-height').value, '180');
  assert.equal(s3.id('mc-weight').value, '75');
  assert.equal(s3.id('mc-age').value, '40');
  assert.equal(s3.id('mc-custom-calories').value, String(tdee));
});

test('the rail waits instead of carrying nothing', async () => {
  const job = JOBS.jobs.find(j => j.id === 'do-up-a-room');
  const m = openStep(fs.readFileSync(path.join(CARDS, 'paint-calculator.html'), 'utf8'),
    'tool.html?card=paint-calculator&job=do-up-a-room&step=1');
  await settle();
  // Nothing typed yet: every control sits at its shipped value, so the room
  // dimensions ARE present (a card ships defaults) — the rail carries those.
  const url = m.window.toolJobNextUrl(job, 0, m.live);
  assert.ok(url, 'with the card holding real numbers the rail should build step 2');
  assert.match(url, /wallpap-w=/);
  assert.match(url, /wallpap-l=/);
  assert.match(url, /wallpap-h=/);

  // Now the negative case: a value that cannot be read at all.
  const fake = { id: 'ghost-job', steps: [
    { n: 1, card: 'paint-calculator', carry: [{ from: 'pntcalc-nonexistent', to: 'wallpap-w', label: 'a value that is not there' }] },
    { n: 2, card: 'wallpaper-estimator', runs: true }
  ] };
  assert.equal(m.window.toolJobNextUrl(fake, 0, m.live), '',
    'a missing value must produce no URL — never a step that lost the number');
  const state = m.window.toolJobCarryState(m.live, fake.steps[0]);
  assert.deepEqual(Array.from(state.missing), ['a value that is not there']);
  assert.ok(!/innerHTML/.test(ENGINE.replace(/\/\*[\s\S]*?\*\//g, '')),
    'the rail must build its DOM with textContent/DOM APIs only');
});

test('the rail renders where you are, and only when a job link asks', () => {
  assert.match(SHELL, /<div id="jobRail" aria-label="Job progress">/);
  assert.match(SHELL, /#jobRail\{display:none;/, 'hidden at first paint');
  assert.match(SHELL, /body\.embed-mode #jobRail\{display:none !important\}/,
    'an embed is chrome-free — the rail must not appear inside one');
  assert.match(SHELL, /fetch\('jobs\.json'/, 'the rail reads the published job list');
  assert.match(SHELL, /if \(!embedMode\) toolStartJob\(params, toolLive\)/,
    'jobs.json must not be fetched for an embed');
});
