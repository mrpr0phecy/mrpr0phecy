'use strict';
// These tests exercise the task-exposure calculator and voice-clone scam drill
// through their actual card DOM. The percentages are explicitly user ratings,
// not researched labour-market or scam-detection claims.
//
// jsdom is scratch-only, outside the repository (AGENTS.md §2):
//   mkdir -p /tmp/tenv && cd /tmp/tenv && npm install jsdom
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) {
  try { ({ JSDOM } = require('jsdom')); }
  catch (e) {
    console.log('NOTE: jsdom not installed — AI-era tool tests skipped');
    console.log('      install with: mkdir -p /tmp/tenv && cd /tmp/tenv && npm install jsdom');
    process.exit(0);
  }
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const CARDS = path.join(__dirname, '..', '..', 'cards');

function mount(slug) {
  const writes = [];
  const dom = new JSDOM(fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://tools.example.test/',
    beforeParse(window) {
      window.confirm = () => true;
      window.navigator.clipboard = { writeText: value => { writes.push(String(value)); return Promise.resolve(); } };
    },
  });
  const d = dom.window.document;
  const prefix = slug + '-';
  return {
    dom,
    d,
    writes,
    id: key => d.getElementById(prefix + key),
    text: key => d.getElementById(prefix + key).textContent.replace(/\s+/g, ' ').trim(),
    set(key, value) {
      const el = d.getElementById(prefix + key);
      assert.ok(el, 'missing #' + prefix + key);
      el.value = String(value);
      el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    },
    submit(key) {
      const form = d.getElementById(prefix + key);
      assert.ok(form, 'missing form #' + prefix + key);
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
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

test('AI job exposure: weighted task maths, capability stress tests, and share text omits details by default', () => {
  const t = mount('ai-job-exposure-simulator');
  try {
    t.set('role', 'Operations <private>');
    t.set('task', 'Review reports <img src=x>');
    t.set('hours', 1);
    t.set('ai', 80);
    t.set('human', 25);
    t.submit('form');

    t.set('task', 'Write a summary');
    t.set('hours', 3);
    t.set('ai', 50);
    t.set('human', 40);
    t.submit('form');

    assert.equal(t.text('total-hours'), '4');
    assert.equal(t.text('assisted-hours'), '2.3');
    assert.equal(t.text('exposed-hours'), '1.5');
    assert.equal(t.text('exposed-percent'), '37.5%');
    assert.match(t.text('scenarios'), /Your ratings1\.5 h\/wk · 37\.5%/);
    assert.match(t.text('scenarios'), /\+25% capability stress test1\.9 h\/wk · 46\.9%/);
    assert.match(t.text('scenarios'), /\+50% capability stress test2\.1 h\/wk · 52\.5%/);
    assert.equal(t.id('tasks').querySelector('img'), null, 'task labels are text, never markup');
    assert.doesNotMatch(t.id('share-text').value, /Review reports|Write a summary|Operations/);
    assert.match(t.id('share-text').value, /not a job-loss prediction/);

    t.id('include-role').checked = true;
    t.id('include-role').dispatchEvent(new t.dom.window.Event('change', { bubbles: true }));
    assert.match(t.id('share-text').value, /Operations <private>/);
    assert.doesNotMatch(t.id('share-text').value, /Review reports|Write a summary/);

    const edit = Array.from(t.id('tasks').querySelectorAll('button')).find(button => button.textContent === 'Edit');
    edit.click();
    t.set('ai', 100);
    t.click('save-task');
    assert.match(t.text('status'), /updated/);
    assert.equal(t.text('exposed-hours'), '1.7');

    t.set('task', 'Extra shift');
    t.set('hours', 165);
    t.submit('form');
    assert.match(t.text('status'), /exceed 168 hours per week/);
    assert.equal(t.id('tasks').querySelectorAll('article').length, 2, 'over-limit addition is rejected');
  } finally { t.close(); }
});

test('AI job exposure: fictional starter is labeled and result has no occupational authority', () => {
  const t = mount('ai-job-exposure-simulator');
  try {
    t.click('demo');
    assert.equal(t.text('total-hours'), '25');
    assert.equal(t.id('tasks').querySelectorAll('article').length, 5);
    assert.equal(t.id('role').value, 'Operations coordinator · example');
    assert.match(t.text('status'), /Fictional example loaded/);
    assert.match(t.text('status'), /not occupational research/);
    assert.match(t.id('share-text').value, /what-if worksheet/);
  } finally { t.close(); }
});

test('voice-clone drill: scores choices without storing personal details and copies a generic plan', async () => {
  const t = mount('voice-clone-scam-drill');
  try {
    t.click('start');
    assert.match(t.text('count'), /Scenario 1 of 5/);
    const answers = [0, 2, 1, 1, 0]; // one deliberately unsafe choice, then four safer choices
    const feedback = [];
    for (const answer of answers) {
      const choices = Array.from(t.d.querySelectorAll('input[name="voice-clone-scam-drill-choice"]'));
      assert.ok(choices[answer]);
      choices[answer].checked = true;
      choices[answer].dispatchEvent(new t.dom.window.Event('change', { bubbles: true }));
      t.click('check');
      feedback.push(t.text('feedback'));
      t.click('next');
    }
    assert.match(feedback[0], /Caller ID can be spoofed|A familiar voice/);
    assert.match(t.text('result-text'), /You chose 4 of 5 safer next steps/);
    assert.match(t.text('status'), /no personal data was collected/);
    assert.doesNotMatch(t.id('share-text').value, /name|phone|number:|answer/i);

    t.click('copy-score');
    await settle();
    assert.match(t.writes[0], /4 safer next steps/);
    assert.doesNotMatch(t.writes[0], /names|numbers|secret phrase/i);

    const firstStep = t.d.querySelector('[data-vcs-plan]');
    firstStep.checked = true;
    firstStep.dispatchEvent(new t.dom.window.Event('change', { bubbles: true }));
    assert.match(t.text('plan-progress'), /1 of 5 steps checked/);
    t.click('copy-plan');
    await settle();
    assert.match(t.writes[1], /Family voice-scam verification plan/);
    assert.match(t.writes[1], /\[x\] Agree a challenge phrase/);
    assert.doesNotMatch(t.writes[1], /my secret is|my number is/i);
  } finally { t.close(); }
});

test('voice-clone drill: rerun resets score and the durable advice is independent verification', () => {
  const t = mount('voice-clone-scam-drill');
  try {
    t.click('start');
    const first = t.d.querySelector('input[name="voice-clone-scam-drill-choice"]');
    first.checked = true;
    first.dispatchEvent(new t.dom.window.Event('change', { bubbles: true }));
    t.click('check');
    t.click('next');
    t.click('again');
    assert.match(t.text('count'), /Scenario 1 of 5/);
    assert.equal(t.text('score'), 'Safer choices: 0');
    assert.match(t.d.querySelector('.vcs-warning').textContent, /not a detector or a guarantee/);
    assert.match(t.d.querySelector('details').textContent, /separately initiated call/);
  } finally { t.close(); }
});
