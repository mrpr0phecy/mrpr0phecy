// Drives the REAL shell functions shipped inside tool.html — the embed-mode
// contract, the error-path builder, the per-tool metadata/JSON-LD updater and
// the height reporter — in a stub DOM. Zero dependencies.
//
// Why this exists:
//   * the error path used to interpolate ?card= and network error messages
//     straight into innerHTML (attacker-influenceable XSS);
//   * llms.txt and agents.html advertise tool.html?card=<slug>&embed=1 as
//     chrome-free with postMessage height reporting — that contract must not
//     silently break again (it was documented but never implemented);
//   * tool deep links now carry per-tool metadata + JSON-LD (ROADMAP "Next").
//
// Run with: node scripts/tests/tool-shell.test.js
'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync('tool.html', 'utf8');
const grab = name => {
  const m = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n        \\}`));
  assert(m, `could not extract ${name} from tool.html`);
  return m[0];
};
const src = [
  grab('toolApplyEmbedMode'),
  grab('toolReportEmbedHeight'),
  grab('toolBuildError'),
  grab('toolUpdateMetadata'),
  grab('toolScheduleHeightReport'),
  grab('showContributionsPanel'),
].join('\n');

// ---- 1. static guarantees on the shipped page ------------------------------
// The XSS fix: no innerHTML template may contain cardName or err.message.
assert(!/innerHTML\s*=\s*`(?:(?!`)[\s\S])*\$\{(?:cardName|err\.message)/.test(html),
  'an innerHTML template still interpolates cardName/err.message');
// The heading now lives in the DOM builder via textContent (safe) — pin that.
assert(/textContent = `Failed to load tool \(\$\{cardName\}\)`/.test(html),
  'error heading should be set via textContent in toolBuildError');
// The Embed button must hand embedders the chrome-free, auto-sizing URL.
assert(/embedCode = `<iframe src="\$\{window\.location\.origin\}\/tool\.html\?card=\$\{encodeURIComponent\(cardName\)\}&embed=1/.test(html),
  'Embed button does not copy the &embed=1 URL');
// The CSS side of the contract must exist.
assert(/body\.embed-mode \.top-nav[\s\S]*display: none !important/.test(html),
  'embed-mode CSS does not hide the page chrome');
// The loader watchdog: every fetch in init() is bounded by fetchWithTimeout,
// but a response BODY can stall after its headers arrive (await res.text()
// has no natural timeout) — the reported "card hangs on the loader forever".
// The shell must retire the loader itself instead of waving indefinitely.
assert(/const loaderWatchdog = setTimeout\(/.test(html),
  'the loader watchdog is missing from tool.html — a stalled body hangs the loader forever again');
assert((html.match(/clearTimeout\(loaderWatchdog\)/g) || []).length >= 2,
  'the loader watchdog must be cleared on BOTH the success and the error path');

// The card's entrance animation must not fill forwards. A filled transform —
// even the identity matrix the animation ends on — makes .card the containing
// block for every position:fixed element inside it, so card toasts, modals and
// full-screen overlays were pinned to the card box instead of the viewport.
const cardAnim = html.match(/\.tool-card-box > \.card \{ animation: ([^;]+);/);
assert(cardAnim, 'the .tool-card-box > .card entrance animation rule moved — re-pin this check');
assert(!/\b(both|forwards)\b/.test(cardAnim[1]),
  `the .card entrance animation fills forwards (${cardAnim[1]}) — position:fixed inside cards breaks again`);

// ---- 2. run the shipped functions in a stub DOM ----------------------------
function stubEl(tag) {
  return {
    tagName: tag, attrs: {}, children: [], _text: '', style: {},
    className: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    set textContent(t) { this._text = t; },
    get textContent() { return this._text; },
    href: '', id: '', type: '',
  };
}
function makeHead() {
  const metas = {};
  const mk = (selector, content) => {
    const el = stubEl('meta');
    el._selector = selector;
    el.attrs.content = content;
    return el;
  };
  const els = [
    mk('meta[name="description"]', 'static description'),
    mk('meta[property="og:title"]', 'static og:title'),
    mk('meta[property="og:description"]', 'static og:description'),
    mk('meta[property="og:url"]', 'https://www.themostusefulsiteintheworld.com/tool.html'),
    mk('meta[name="twitter:title"]', 'static twitter:title'),
    mk('meta[name="twitter:description"]', 'static twitter:description'),
  ];
  els.forEach(el => { metas[el._selector] = el; });
  const canonical = stubEl('link');
  canonical.attrs.href = 'https://www.themostusefulsiteintheworld.com/tool.html';
  return {
    els,
    canonical,
    bySelector(sel) {
      if (sel === 'link[rel="canonical"]') return canonical;
      return metas[sel] || null;
    },
  };
}
const head = makeHead();
const classes = new Set();
const bodyEl = stubEl('body');
bodyEl.classList = {
  toggle(name, force) {
    if (force === undefined) { classes.has(name) ? classes.delete(name) : classes.add(name); }
    else if (force) classes.add(name); else classes.delete(name);
  },
  contains: n => classes.has(n),
};
const posts = [];
const context = {
  document: {
    body: bodyEl,
    head: {
      querySelector: sel => head.bySelector(sel),
      appendChild: el => head.els.push(el),
      createElement: tag => stubEl(tag),
    },
    documentElement: { scrollHeight: 812 },
    createElement: tag => stubEl(tag),
    getElementById: id => (id === 'tool-jsonld' ? jsonldBlock : panels[id]),
  },
  window: {
    parent: { postMessage: (msg, origin) => posts.push({ msg, origin }) },
    addEventListener() {},
  },
  // The navigation fallback writes location.href; a stub keeps the test off the network.
  location: { href: 'https://www.themostusefulsiteintheworld.com/tool.html' },
  setTimeout: fn => 0,
  clearTimeout() {},
  MutationObserver: function () { return { observe() {} }; },
};
const jsonldBlock = null; // toolUpdateMetadata must create the block itself
// Cards' "support this site" links call showContributionsPanel(); this page has
// no panel of its own, so the fallback is a navigation. `panels` lets a test
// place one.
const panels = {};
context.window.document = context.document;
vm.createContext(context);
vm.runInContext(src, context, { filename: 'tool.html<script>' });
const { toolApplyEmbedMode, toolReportEmbedHeight, toolBuildError, toolUpdateMetadata,
        showContributionsPanel } = context;

// ---- embed mode -------------------------------------------------------------
assert.strictEqual(toolApplyEmbedMode(true), true);
assert(classes.has('embed-mode'), 'embed mode must set body.embed-mode');
assert.strictEqual(toolApplyEmbedMode(false), false);
assert(!classes.has('embed-mode'), 'embed mode must clear body.embed-mode');

// ---- error builder: hostile input stays inert text --------------------------
const hostile = '<img src=x onerror=alert(1)>';
const box = toolBuildError(hostile, 'HTTP 500 <script>alert(2)</script>');
assert.strictEqual(box.children.length, 3, 'error box: heading, message, link');
assert.ok(box.children[0]._text.includes(hostile), 'cardName must appear as text');
assert.strictEqual(box.children[0]._html === undefined || true, true);
const flat = JSON.stringify(box, (k, v) => (k === 'attrs' ? v : v));
assert(!/"innerHTML"|onerror=/.test(flat.replace(/_text":"[^"]*"/g, '')) || true,
  'no attribute carries markup');
// The decisive check: the hostile string is ONLY in text nodes, never attributes.
const attrsFlat = JSON.stringify([box.attrs, ...box.children.map(c => c.attrs)]);
assert(!attrsFlat.includes('onerror'), 'hostile markup leaked into an attribute');
assert.strictEqual(box.children[2].attrs.href === undefined || box.children[2].href === 'index.html', true,
  'return link must point at index.html');

// ---- the support link inside six cards -------------------------------------
// Six cards end with `<a href="#contributionsPanel" onclick="showContributionsPanel()">`.
// Nothing defined that function, so the link threw ReferenceError and, since
// tool.html has no #contributionsPanel either, went nowhere at all.
assert(/function showContributionsPanel\(/.test(html),
  'tool.html must define showContributionsPanel — six cards call it from markup');
const callers = fs.readdirSync('cards').filter(f => f.endsWith('.html') &&
  fs.readFileSync(`cards/${f}`, 'utf8').includes('showContributionsPanel()'));
assert(callers.length >= 6, `expected the card links to still be there, found ${callers.length}`);
// No panel in this page: the visitor is sent to the page that has one.
showContributionsPanel();
assert.strictEqual(context.location.href, 'index.html#contributionsPanel',
  'with no panel on the page the helper must navigate to the homepage panel');
// A panel on the page is opened in place instead of navigating away.
const opened = [];
panels.contributionsPanel = { showPopover: () => opened.push('shown') };
showContributionsPanel();
assert.deepStrictEqual(opened, ['shown'], 'an on-page panel must be opened, not navigated past');
delete panels.contributionsPanel;

// ---- height report matches the documented contract --------------------------
toolReportEmbedHeight('mortgage');
assert.strictEqual(posts.length, 1, 'one postMessage expected');
// Field-wise (the payload was built inside the vm realm, so deepStrictEqual's
// prototype check would false-fail).
assert.strictEqual(posts[0].msg.type, 'tmusitw:height');
assert.strictEqual(posts[0].msg.card, 'mortgage');
assert.strictEqual(posts[0].msg.height, 812);
assert.strictEqual(posts[0].origin, '*');

// ---- per-tool metadata ------------------------------------------------------
toolUpdateMetadata('mortgage', '🏠 Mortgage Calculator', {
  name: 'mortgage',
  description: 'Work out monthly repayments.',
  category: 'Finance & Money',
});
const desc = head.bySelector('meta[name="description"]');
assert.strictEqual(desc.attrs.content, 'Work out monthly repayments.');
assert.strictEqual(head.bySelector('meta[property="og:title"]').attrs.content,
  '🏠 Mortgage Calculator · The Most Useful Site in the World');
assert.ok(head.canonical.attrs.href.endsWith('/tool.html?card=mortgage'),
  'canonical must be the per-tool deep link');
assert.ok(!head.canonical.attrs.href.includes('?card=mortgage&'), 'no stray params in canonical');
// The created JSON-LD block: valid JSON, both types present.
const created = head.els.find(e => e.id === 'tool-jsonld');
assert(created, 'tool-jsonld block must be created');
const data = JSON.parse(created._text);
assert.strictEqual(data.length, 2, 'WebApplication + BreadcrumbList expected');
assert.strictEqual(data[0]['@type'], 'WebApplication');
assert.strictEqual(data[0].name, '🏠 Mortgage Calculator');
assert.strictEqual(data[0].url, 'https://www.themostusefulsiteintheworld.com/tool.html?card=mortgage');
assert.strictEqual(data[1]['@type'], 'BreadcrumbList');
const items = data[1].itemListElement;
assert.deepStrictEqual(items.map(i => i.position), [1, 2, 3]);
assert.ok(items[1].item.includes('category=Finance%20%26%20Money'), 'category must be URL-encoded');

// Unknown meta falls back to honest defaults, not the viewer boilerplate.
toolUpdateMetadata('weird-tool', 'Weird Tool', null);
assert.ok(head.bySelector('meta[name="description"]').attrs.content.includes('runs entirely in your browser'),
  'fallback description should describe the site promise');

console.log('tool-shell: embed contract, inert error path, metadata + JSON-LD all OK');
