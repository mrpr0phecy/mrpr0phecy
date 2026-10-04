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
      if (options.triggerIntersection) {
        window.IntersectionObserver = class {
          constructor(callback) { this.callback = callback; }
          observe(target) {
            if (typeof options.triggerIntersection === 'function') {
              options.triggerIntersection(target, this.callback, this);
            } else {
              this.callback([{ isIntersecting: true, target }]);
            }
          }
          disconnect() {}
        };
      }
    }
  });
  return { dom, errors };
}

test('a stalled tool spec cannot delay a tool click, and late metadata enhances the live card', { skip }, async () => {
  const requests = [];
  const riskNotices = [];
  let releaseMetadata;
  const { dom, errors } = makeDom(url => {
    requests.push(String(url));
    if (url === 'cards/bmi.html') return Promise.resolve(response(BMI_HTML));
    if (url === 'api/tools/bmi.json') {
      return Promise.resolve({
        ok: true,
        status: 200,
        // Headers have arrived, but the body intentionally stalls until after
        // the user has already opened and used the calculator.
        json: () => new Promise(resolve => { releaseMetadata = resolve; }),
        text: () => new Promise(() => {})
      });
    }
    if (url === 'related.json') {
      return Promise.resolve({
        ok: true,
        status: 200,
        // The category link remains available while this below-the-fold
        // ranking enhancement stalls.
        json: () => new Promise(() => {})
      });
    }
    return Promise.resolve(response('', 404));
  }, { onRiskNotice: card => riskNotices.push(card), triggerIntersection: true });

  try {
    const { window } = dom;
    const { document } = window;
    await waitFor(() => document.getElementById('bmi-calculate-btn'),
      'the calculator should mount while api/tools/bmi.json is still stalled');
    assert.deepEqual(requests.slice(0, 2), ['cards/bmi.html', 'api/tools/bmi.json'],
      'the card fragment is requested first and only its small metadata spec starts alongside it');
    assert.equal(requests.includes('cards/cards-lite.json'), false,
      'a normal tool view must not download the entire lite catalogue');
    assert.equal(document.querySelector('.cool-loader'), null, 'the loader is replaced by the working card');

    // Exercise the real click handler before the metadata body is released.
    document.getElementById('bmi-weight-input').value = '80';
    document.getElementById('bmi-calculate-btn').click();
    await waitFor(() => document.getElementById('bmi-value')?.textContent === '26.1',
      'the Calculate button should run before metadata arrives');
    assert.equal(releaseMetadata instanceof Function, true, 'the metadata response is still pending');

    releaseMetadata({
      slug: 'bmi', title: 'BMI Calculator', categoryName: 'Health & Fitness',
      description: 'Calculate BMI and see the WHO classification.'
    });
    await waitFor(() => document.title.startsWith('BMI Calculator'),
      'late tool metadata should update the title without reloading the card');
    await waitFor(() => document.querySelector('.risk-notice[data-risk-kind="medical"]'),
      'late category metadata should attach its risk notice to the already-mounted card');
    assert.equal(document.getElementById('categoryBadge').textContent, 'Health & Fitness');
    assert.ok(riskNotices.some(card => card.name === 'bmi' && card.category === 'Health & Fitness'));
    await waitFor(() => document.querySelector('#relatedGrid a[href*="categories/health-and-fitness.html"]'),
      'the category fallback should remain available while related ranking loads');
    assert.ok(requests.includes('related.json'), 'the related index is an optional below-the-fold request');
    assert.deepEqual(errors, [], `the live tool shell logged jsdom errors: ${errors.join('; ')}`);
  } finally {
    dom.window.close();
  }
});

test('early metadata still attaches its health notice when the slower card arrives', { skip }, async () => {
  let releaseCard;
  const riskNotices = [];
  const { dom, errors } = makeDom(url => {
    if (url === 'cards/bmi.html') {
      return new Promise(resolve => { releaseCard = () => resolve(response(BMI_HTML)); });
    }
    if (url === 'api/tools/bmi.json') return Promise.resolve(response({
      slug: 'bmi', title: 'BMI Calculator', categoryName: 'Health & Fitness',
      description: 'Calculate BMI and see the WHO classification.'
    }));
    return Promise.resolve(response('', 404));
  }, { onRiskNotice: card => riskNotices.push(card) });

  try {
    const { document } = dom.window;
    await waitFor(() => document.title.startsWith('BMI Calculator'),
      'the small tool specification should arrive while the card fragment is pending');
    assert.equal(document.querySelector('.risk-notice'), null,
      'the notice waits until there is a mounted card to attach to');
    assert.equal(releaseCard instanceof Function, true);

    releaseCard();
    await waitFor(() => document.getElementById('bmi-calculate-btn'),
      'the card should mount after its fragment arrives');
    await waitFor(() => document.querySelector('.risk-notice[data-risk-kind="medical"]'),
      'metadata that arrived first should be applied as soon as the card root exists');
    assert.ok(riskNotices.some(card => card.name === 'bmi' && card.category === 'Health & Fitness'));
    assert.deepEqual(errors, [], `the early-metadata path logged jsdom errors: ${errors.join('; ')}`);
  } finally {
    dom.window.close();
  }
});

test('the lite catalogue remains a fallback if a single-tool spec is missing', { skip }, async () => {
  const requests = [];
  const { dom, errors } = makeDom(url => {
    requests.push(String(url));
    if (url === 'cards/bmi.html') return Promise.resolve(response(BMI_HTML));
    if (url === 'api/tools/bmi.json') return Promise.resolve(response('', 404));
    if (url === 'cards/cards-lite.json') return Promise.resolve(response([
      { n: 'bmi', t: 'BMI Calculator', c: 'Health & Fitness' }
    ]));
    return Promise.resolve(response('', 404));
  });

  try {
    const { document } = dom.window;
    await waitFor(() => document.querySelector('.risk-notice[data-risk-kind="medical"]'),
      'the fallback catalogue should restore the category risk notice');
    assert.equal(document.title.startsWith('BMI Calculator'), true);
    assert.ok(requests.includes('cards/cards-lite.json'));
    assert.deepEqual(errors, [], `the metadata fallback logged jsdom errors: ${errors.join('; ')}`);
  } finally {
    dom.window.close();
  }
});

test('related links hydrate only four per-tool specs after the section nears view', { skip }, async () => {
  const requests = [];
  let enterRelated;
  const { dom, errors } = makeDom(url => {
    const path = String(url);
    requests.push(path);
    if (path === 'cards/bmi.html') return Promise.resolve(response(BMI_HTML));
    if (path === 'api/tools/bmi.json') return Promise.resolve(response({
      slug: 'bmi', title: 'BMI Calculator', categoryName: 'Health & Fitness',
      description: 'Calculate BMI and see the WHO classification.'
    }));
    if (path === 'related.json') return Promise.resolve(response({ bmi: ['bmr', 'loan'] }));
    if (path === 'api/tools/bmr.json') return Promise.resolve(response({
      slug: 'bmr', title: 'BMR Calculator', description: 'Estimate basal metabolic rate.'
    }));
    if (path === 'api/tools/loan.json') return Promise.resolve(response({
      slug: 'loan', title: 'Loan Calculator', description: 'Estimate loan repayments.'
    }));
    return Promise.resolve(response('', 404));
  }, { triggerIntersection: (target, callback) => {
    enterRelated = () => callback([{ isIntersecting: true, target }]);
  } });

  try {
    const { document } = dom.window;
    await waitFor(() => document.querySelector('#relatedGrid a[href*="categories/health-and-fitness.html"]'),
      'the category link should render before ranked suggestions are requested');
    assert.equal(requests.includes('related.json'), false,
      'the ranked index should wait until its below-the-fold section nears the viewport');
    assert.equal(requests.some(path => path.startsWith('api/tools/bmr.json')), false,
      'related tool specifications should also remain deferred');

    enterRelated();
    await waitFor(() => document.querySelector('#relatedGrid a[href*="card=bmr"]'),
      'nearby related results should render from the ranked slug list and small specs');
    assert.ok(document.querySelector('#relatedGrid .related-card-title')?.textContent.includes('BMR Calculator'));
    assert.ok(requests.includes('api/tools/bmr.json'));
    assert.ok(requests.includes('api/tools/loan.json'));
    assert.equal(requests.includes('cards/cards-lite.json'), false,
      'related titles and descriptions come from only the four ranked tool specs');
    assert.deepEqual(errors, [], `the related path logged jsdom errors: ${errors.join('; ')}`);
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
    if (url === 'api/tools/bmi.json') return Promise.resolve(response({
      slug: 'bmi', title: 'BMI Calculator', categoryName: 'Health & Fitness',
      description: 'Calculate BMI and see the WHO classification.'
    }));
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
    assert.ok(requests.includes('api/tools/bmi.json'));
    assert.equal(requests.includes('cards/cards-lite.json'), false,
      'a successful small spec avoids downloading the full lite catalogue even when the card itself stalls');
    assert.deepEqual(errors, [], `the failure path logged jsdom errors: ${errors.join('; ')}`);
  } finally {
    dom.window.close();
  }
});
