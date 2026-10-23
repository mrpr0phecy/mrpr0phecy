'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) { ({ JSDOM } = require('jsdom')); }

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const version = read('sw.js').match(/CACHE_VERSION\s*=\s*'v(\d+)-/)[1];

test('hidden recents reserve no layout, and shortcuts cannot become multiline controls', () => {
  const dom = new JSDOM(`<style>${read('home.css')}</style>
    <div class="popular-chips" id="recent-chips" hidden><a class="popular-chip">Recent</a></div>
    <div class="popular-chips"><button class="popular-chip">A long shortcut label</button></div>`);
  try {
    const { document, getComputedStyle } = dom.window;
    assert.equal(getComputedStyle(document.getElementById('recent-chips')).display, 'none');
    const chip = document.querySelector('button');
    assert.equal(getComputedStyle(chip).whiteSpace, 'nowrap');
    assert.equal(getComputedStyle(chip).flexShrink, '0');
    document.getElementById('recent-chips').hidden = false;
    assert.equal(getComputedStyle(document.getElementById('recent-chips')).display, 'flex');
  } finally { dom.window.close(); }
});

test('every tool shares one versioned frame stylesheet instead of repeating inline chrome', () => {
  assert(read('tool-page.css').includes('.tp-nav'));
  const cards = JSON.parse(read('cards/cards.json'));
  for (const { name } of cards) {
    const html = read(`tool/${name}.html`);
    assert(html.includes(`<link rel="stylesheet" href="../tool-page.css?v=${version}">`), name);
    assert(!html.includes('/* tp- chrome:'), `${name}: duplicated frame CSS`);
    assert(html.includes('aria-label="The Most Useful Site in the World — home"'), `${name}: icon-only home link needs an accessible name`);
    assert(html.includes('href="#tool-root"'), `${name}: missing skip link`);
  }
});

test('category hubs have keyboard bypass links and actual section headings', () => {
  const { categories } = JSON.parse(read('tools-index.json'));
  for (const { slug } of categories) {
    const html = read(`categories/${slug}.html`);
    assert(html.includes('class="xp-skip" href="#explore"'), slug);
    assert(html.includes('id="explore" tabindex="-1"'), slug);
    assert(html.includes('<h2 class="section-title" id="tools-heading">'), slug);
  }
});

test('handwritten discovery pages use the current shared catalogue assets', () => {
  for (const page of ['index.html', 'popular.html', 'new.html', 'use-case.html']) {
    const html = read(page);
    for (const asset of ['explore.css', 'toolbox.css', 'toolbox.js']) {
      assert(html.includes(`${asset}?v=${version}`), `${page}: stale ${asset}`);
    }
  }
});

test('filtered discovery views share the obsidian + gold theme, skip links, non-blocking CSS, and accurate counts', () => {
  for (const page of ['popular.html', 'new.html', 'use-case.html']) {
    const html = read(page);
    assert(html.includes('name="theme-color" content="#04070a"'), `${page}: wrong theme-color`);
    assert(html.includes('--bg-primary:#04070a'), `${page}: missing obsidian --bg-primary`);
    assert(html.includes('--accent:#ffd700'), `${page}: missing gold --accent`);
    assert(!/#2dd4ff|#39ff14|#0a0f14/i.test(html), `${page}: legacy cyan/green token remains`);
    assert(html.includes('class="skip-link" href="#main"'), `${page}: missing keyboard skip link`);
    assert(html.includes('<script type="speculationrules">'), `${page}: missing speculationrules`);
    const withoutNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');
    assert(withoutNoscript.includes(`explore.css?v=${version}" media="print"`), `${page}: explore.css should load non-blocking`);
  }
  const uc = read('use-case.html');
  const cases = [...uc.matchAll(/<div class="case">([\s\S]*?)<\/div><\/div>/g)];
  assert(cases.length >= 30, 'use-case.html must list its situation cards');
  for (const [, block] of cases) {
    const claimed = (block.match(/<span class="count">([^<]+)<\/span>/) || [])[1];
    const pills = (block.match(/class="pill"/g) || []).length;
    assert.equal(claimed, `${pills} tool${pills === 1 ? '' : 's'}`);
  }
});

test('back/forward restoration refreshes recents and clearing history hides the row', async () => {
  const dom = new JSDOM('<div id="recent-chips" class="popular-chips" hidden></div>', {
    url: 'https://catalogue.test/', runScripts: 'outside-only'
  });
  try {
    const { window } = dom;
    await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    window.localStorage.setItem('__mp_recent', JSON.stringify([{ slug: 'bmi', title: 'BMI Calculator' }]));
    window.eval(read('home-core.js'));
    assert.equal(window.document.querySelector('#recent-chips a').getAttribute('href'), 'tool/bmi.html');
    window.localStorage.setItem('__mp_recent', JSON.stringify([{ slug: 'mortgage', title: 'Mortgage Calculator' }]));
    window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
    assert.equal(window.document.querySelector('#recent-chips a').getAttribute('href'), 'tool/mortgage.html');
    window.localStorage.removeItem('__mp_recent');
    window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
    assert.equal(window.document.getElementById('recent-chips').hidden, true);
  } finally { dom.window.close(); }
});

test('recent-tool anchors navigate normally instead of being intercepted as search queries', async () => {
  const dom = new JSDOM('<a class="popular-chip recent-chip" href="tool/bmi.html">BMI Calculator</a>', {
    url: 'https://catalogue.test/', runScripts: 'outside-only'
  });
  try {
    const { window } = dom;
    await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    window.eval(read('explore.js'));
    let searches = 0;
    window.mpExplore = { filter() { searches++; } };
    let intercepted;
    window.document.addEventListener('click', event => {
      intercepted = event.defaultPrevented;
      event.preventDefault(); // no actual jsdom navigation; inspect the earlier handler
    });
    window.document.querySelector('a').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.equal(intercepted, false);
    assert.equal(searches, 0);
  } finally { dom.window.close(); }
});


test('native popovers set their foreground explicitly instead of inheriting the browser CanvasText default', () => {
  const panel = read('home.css').match(/\.panel\s*\{([^}]+)\}/);
  assert(panel, 'shared panel styles exist');
  assert(/color:\s*var\(--text\)/.test(panel[1]), 'dark panels need the theme foreground, including their titlebar');
});
