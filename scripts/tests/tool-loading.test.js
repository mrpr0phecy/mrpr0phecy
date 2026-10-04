'use strict';

// Drives the real tool shell in jsdom with controlled network responses. The
// catalogue may improve labels and suggestions, but it must never stand
// between a click and the calculator the visitor asked to open.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

let JSDOM;
let VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('/tmp/tenv/node_modules/jsdom'));
} catch (_) {
  try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (_) { JSDOM = null; }
}

const ROOT = path.join(__dirname, '..', '..');
const TOOL_HTML = fs.readFileSync(path.join(ROOT, 'tool.html'), 'utf8');
const BMI_HTML = fs.readFileSync(path.join(ROOT, 'cards', 'bmi.html'), 'utf8');
const skip = !JSDOM && 'jsdom is not installed (see AGENTS.md §2)';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(String(body)),
    json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body)
  };
}

async function waitFor(predicate, message, timeout = 1500) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (predicate()) return;
    await wait(5);
  }
  assert.ok(predicate(), message);
}

function makeDom(fetch, options = {}) {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', err => errors.push(err.message));
  const dom = new JSDOM(TOOL_HTML, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://www.themostusefulsiteintheworld.com/tool.html?card=bmi',
    virtualConsole,
    beforeParse(window) {
      window.fetch = fetch;
      window.SiteRiskNotices = {
        attach(container, card) {
          options.onRiskNotice?.(card);
          if (card.category !== 'Health & Fitness') return null;
          const notice = window.document.createElement('div');
          notice.className = 'risk-notice';
          notice.dataset.riskKind = 'medical';
          container.insertBefore(notice, container.firstChild);
          return notice;
        }
      };
      if (options.scaleNetworkTimeouts) {
        const nativeSetTimeout = window.setTimeout.bind(window);
        window.setTimeout = (fn, ms, ...args) =>
          nativeSetTimeout(fn, [8000, 10000, 15000].includes(ms) ? 35 : ms, ...args);
      }
    }
  });
  return { dom, errors };
}

test('a stalled catalogue cannot delay a tool click, and late metadata enhances the live card', { skip }, async () => {
  const requests = [];
  const riskNotices = [];
  let releaseCatalogue;
  const { dom, errors } = makeDom(url => {
    requests.push(String(url));
    if (url === 'cards/bmi.html') return Promise.resolve(response(BMI_HTML));
    if (url === 'cards/cards-lite.json') {
      return Promise.resolve({
        ok: true,
        status: 200,
        // Headers have arrived, but the body intentionally stalls until after
        // the user has already opened and used the calculator.
        json: () => new Promise(resolve => { releaseCatalogue = resolve; }),
        text: () => new Promise(() => {})
      });
    }
    if (url === 'related.json') {
      return Promise.resolve({
        ok: true,
        status: 200,
        // Ranked suggestions can stall too; the visible same-category fallback
        // should already be usable while that below-the-fold enhancement waits.
        json: () => new Promise(() => {})
      });
    }
    return Promise.resolve(response('', 404));
  }, { onRiskNotice: card => riskNotices.push(card) });

  try {
    const { window } = dom;
    const { document } = window;
    await waitFor(() => document.getElementById('bmi-calculate-btn'),
      'the calculator should mount while cards/cards-lite.json is still stalled');
    assert.deepEqual(requests.slice(0, 2), ['cards/bmi.html', 'cards/cards-lite.json'],
      'the card fragment is requested first and catalogue work starts alongside it');
    assert.equal(document.querySelector('.cool-loader'), null, 'the loader is replaced by the working card');

    // Exercise the real click handler before the catalogue body is released.
    document.getElementById('bmi-weight-input').value = '80';
    document.getElementById('bmi-calculate-btn').click();
    await waitFor(() => document.getElementById('bmi-value')?.textContent === '26.1',
      'the Calculate button should run before catalogue metadata arrives');
    assert.equal(releaseCatalogue instanceof Function, true, 'the metadata response is still pending');

    releaseCatalogue([
      { n: 'bmi', t: 'BMI Calculator', c: 'Health & Fitness' },
      { n: 'bmr', t: 'BMR Calculator', c: 'Health & Fitness' }
    ]);
    await waitFor(() => document.title.startsWith('BMI Calculator'),
      'late catalogue metadata should update the title without reloading the card');
    await waitFor(() => document.querySelector('.risk-notice[data-risk-kind="medical"]'),
      'late category metadata should attach its risk notice to the already-mounted card');
    await waitFor(() => document.querySelector('#relatedGrid a[href*="card=bmr"]'),
      'related suggestions should render after metadata arrives');
    assert.equal(document.getElementById('categoryBadge').textContent, 'Health & Fitness');
    assert.ok(riskNotices.some(card => card.name === 'bmi' && card.category === 'Health & Fitness'));
    assert.deepEqual(errors, [], `the live tool shell logged jsdom errors: ${errors.join('; ')}`);
  } finally {
    dom.window.close();
  }
});

test('a response whose body stalls becomes an actionable error instead of a permanent loader', { skip }, async () => {
  const requests = [];
  const { dom, errors } = makeDom(url => {
    requests.push(String(url));
    if (url === 'cards/bmi.html') {
      // A response can resolve at the headers and then never produce body
      // bytes. Simulate that without waiting for the production timeout.
      return Promise.resolve({ ok: true, status: 200, text: () => new Promise(() => {}) });
    }
    if (url === 'cards/cards-lite.json') return Promise.resolve(response([
      { n: 'bmi', t: 'BMI Calculator', c: 'Health & Fitness' }
    ]));
    if (url === 'related.json') return Promise.resolve(response({}));
    return Promise.resolve(response('', 404));
  }, { scaleNetworkTimeouts: true });

  try {
    const { document } = dom.window;
    await waitFor(() => document.querySelector('#toolContainer h3'),
      'a stalled response body should resolve to the retry UI', 1000);
    assert.match(document.querySelector('#toolContainer h3').textContent, /Failed to load tool \(bmi\)/);
    assert.equal(document.querySelector('.cool-loader'), null, 'an error replaces the animated loading screen');
    assert.ok(document.querySelector('#toolContainer button'), 'the failure surface offers Retry');
    assert.ok(requests.includes('cards/bmi.html'));
    assert.deepEqual(errors, [], `the failure path logged jsdom errors: ${errors.join('; ')}`);
  } finally {
    dom.window.close();
  }
});
