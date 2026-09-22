#!/usr/bin/env node
/**
 * test-card.js — smoke-test a card fragment the way tool.html loads it.
 *
 *   node scripts/test-card.js cards/my-tool.html [more cards...]
 *   node scripts/test-card.js --all               # every card, ~2.5 minutes
 *
 * What it checks (each FAIL exits 1):
 *   - the file is a fragment (no doctype/html/head/body outside <script>)
 *   - an <h2 id="…-title"> and a <p id="…-desc"> exist (cards.json needs them)
 *   - every <script> block parses (node --check equivalent via new Function)
 *   - the fragment mounts into tool.html's shell and its scripts execute with
 *     zero uncaught exceptions (jsdom; window.alert and console.error are
 *     captured, network calls are refused and reported)
 *   - no element ids collide with ids already used by another card (a leak
 *     rather than a duplicate: only DOM outside the container outlives one)
 *   - every target=_blank link carries rel=noopener
 *   - the card makes no network request (fetch/XHR/Image/src=https)
 *
 * How it mounts: one jsdom window per card — mount the fragment the way
 * tool.html does, poke the UI, then clear the container and fire what follows a
 * navigation. That second half is the point:
 *
 *     container.innerHTML = ''      // tool.html, before every injection
 *     ...inject fragment, run scripts
 *     document.dispatchEvent(new Event('DOMContentLoaded'))
 *
 * The document outlives the container, so the teardown half of the probe finds
 * what a card leaves behind: a classic inline script cannot undeclare a
 * `let`/`const`/`class`, listeners on `document`/`window` are never removed,
 * and DOM appended outside the container is never cleaned up. Anything that
 * throws there is reported as a LEAK and names the card that caused it.
 *
 * One window per card costs about what a window per batch of forty did — the
 * card's own execution dominates, not the jsdom boot — and it is the only
 * arrangement where every error is attributable. Attribution by "has this error
 * string been seen already?" charged 24 innocent cards in one catalogue-wide
 * run and never suspected 44 that were really leaking, because which cards
 * share a window decides what a leftover listener hits.
 *
 * Cross-card global collisions are deliberately not this tool's job: nothing is
 * co-mounted, so it cannot see them. scripts/check-card-collisions.py owns that
 * class and fails the gate.
 *
 * A full --all sweep needs more heap than node's default:
 *   node --max-old-space-size=6144 scripts/test-card.js --all
 *
 * Needs jsdom. Install it OUTSIDE the workspace (AGENTS.md §2):
 *   mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom
 * The script looks in /tmp/tenv/node_modules first, then the normal paths.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let JSDOM;
try {
  ({ JSDOM } = require(path.join('/tmp/tenv/node_modules/jsdom')));
} catch (_) {
  try { ({ JSDOM } = require('jsdom')); } catch (e) {
    console.error('jsdom not found. Install with: mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom');
    process.exit(2);
  }
}

const args = process.argv.slice(2);
let files;
let batch = 40;
if (args.includes('--all')) {
  files = fs.readdirSync(path.join(ROOT, 'cards')).filter(f => f.endsWith('.html')).map(f => path.join('cards', f));
} else {
  files = args.filter(a => !a.startsWith('--'));
}
const batchArg = args.find(a => a.startsWith('--batch='));
if (batchArg) batch = Math.max(1, parseInt(batchArg.split('=')[1], 10) || 40);
if (files.length === 0) {
  console.error('usage: node scripts/test-card.js cards/<name>.html [...] | --all [--batch=N]');
  process.exit(2);
}

// ids used across the rest of the catalogue (for collision detection)
const idRe = /id=["']([^"']+)["']/gi;
const idOwners = new Map();
for (const f of fs.readdirSync(path.join(ROOT, 'cards')).filter(f => f.endsWith('.html'))) {
  const text = fs.readFileSync(path.join(ROOT, 'cards', f), 'utf8');
  let m;
  while ((m = idRe.exec(text))) {
    if (!idOwners.has(m[1])) idOwners.set(m[1], f);
  }
}

let fails = 0;
function fail(file, msg) { fails += 1; console.log(`  FAIL ${file}: ${msg}`); }
function note(file, msg) { console.log(`  note ${file}: ${msg}`); }

const shellHtml = `<!doctype html><html><head><meta charset="utf-8">
<style>:root{--accent:#2dd4ff;--accent-dark:#1aa3cc;--text:#e6faff;--text-secondary:rgba(230,250,255,.7);--bg-primary:#0a0f14;--bg-secondary:#141e28;--border-light:rgba(255,255,255,.08);--success:#39ff14;--error:#ff4d4d;}</style>
</head><body><div id="toolbox-grid"></div></body></html>`;

// ---------------------------------------------------------------- static checks
const parsedCards = []; // { rel, base, html }
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  const base = path.basename(rel);
  if (!fs.existsSync(abs)) { fail(rel, 'file not found'); continue; }
  const html = fs.readFileSync(abs, 'utf8');
  parsedCards.push({ rel, base, html });

  // 1. fragment
  const stripped = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  if (/<!doctype\b|<html\b|<head\b|<body\b/i.test(stripped)) fail(rel, 'contains full-document tags — must be a fragment');

  // 2. title/desc
  const h2 = html.match(/<h2[^>]*id=["']([^"']+)["'][^>]*>/i);
  if (!h2) fail(rel, 'no <h2 id="…"> title element');
  const descOk = /<p[^>]*id=["'][^"']*desc["'][^>]*>/i.test(html) || /class=["'][^"']*(small|desc)/i.test(html);
  if (!descOk) fail(rel, 'no description <p id="…-desc"> (cards.json description would fall back)');

  // 3. scripts parse
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((s, i) => {
    if (/type=["'](application\/json|text\/template|text\/plain)/i.test(s[1])) return;
    try { new Function(s[2]); } catch (e) { fail(rel, `script #${i + 1} does not parse: ${e.message}`); }
  });
  if (scripts.length === 0) note(rel, 'no <script> block (static card)');
  // IIFE check (soft)
  scripts.forEach((s, i) => {
    const code = s[2].trim();
    if (code && !/^\(\s*(async\s*)?function|^\(\s*\(\)\s*=>|^\(\s*async\s*\(\)\s*=>|^!function|^\(function/.test(code) && !/type=/.test(s[1])) {
      note(rel, `script #${i + 1} is not IIFE-wrapped at top level (check for leaked globals)`);
    }
  });

  // 4. noopener
  for (const a of html.matchAll(/<a [^>]*target=["']_blank["'][^>]*>/gi)) {
    if (!/rel=["'][^"']*noopener/i.test(a[0])) fail(rel, `target=_blank without rel=noopener: ${a[0].slice(0, 80)}`);
  }

  // 5. network
  if (/fetch\(|XMLHttpRequest|new Image\(|\.src\s*=\s*['"`]https?:|navigator\.sendBeacon|<link[^>]+href=["']https?:|<script[^>]+src=/i.test(html)) {
    fail(rel, 'looks like it makes a network request (D-009: new cards must be zero-network)');
  }

  // 6. id collisions with other cards
  let m; idRe.lastIndex = 0;
  const seenHere = new Set();
  while ((m = idRe.exec(html))) {
    const id = m[1];
    if (id.includes('${')) continue;
    if (seenHere.has(id)) { note(rel, `duplicate id inside the card: ${id}`); }
    seenHere.add(id);
    const owner = idOwners.get(id);
    if (owner && owner !== base) fail(rel, `id "${id}" already used by ${owner}`);
  }
}

// ---------------------------------------------------------------- jsdom mount
// One stubbed jsdom window; `currentRel` labels errors with the card being
// mounted/poked when they fire (uncaught events are async and can only be
// attributed to the card in flight — batch mode re-runs in isolation before
// reporting, so a mis-attributed error cannot fail a clean card).
function makeWindow(sink) {
  const dom = new JSDOM(shellHtml, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://www.themostusefulsiteintheworld.com/',
    beforeParse(window) {
      window.alert = msg => sink.push(`alert(): ${String(msg).slice(0, 80)}`);
      // jsdom's prompt() yields undefined; real browsers yield string|null.
      // Null (= user pressed Cancel) is the faithful harness behaviour.
      window.prompt = () => null;
      window.fetch = () => { sink.push('fetch() called'); return Promise.reject(new Error('network disabled')); };
      window.HTMLCanvasElement.prototype.getContext = function () {
        // minimal 2D context stub — enough for tools that draw on load
        const noop = () => {};
        const grad = { addColorStop: noop };
        return new Proxy({
          canvas: this, measureText: () => ({ width: 10 }), getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
          createImageData: (w, h) => ({ data: new Uint8ClampedArray((w.width || w) * (h || w.height || 1) * 4) }),
          createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => ({}),
          putImageData: noop, drawImage: noop, save: noop, restore: noop,
        }, { get: (t, k) => (k in t ? t[k] : noop), set: () => true });
      };
      window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
      window.HTMLCanvasElement.prototype.toBlob = cb => cb && cb(new window.Blob([]));
      window.requestAnimationFrame = cb => window.setTimeout(() => cb(Date.now()), 16);
      window.cancelAnimationFrame = id => window.clearTimeout(id);
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.AudioContext = window.webkitAudioContext = function () {
        // AudioParam stub: real browsers provide setTargetAtTime /
        // cancelAndHoldAtTime on every AudioParam and a .pan param on
        // StereoPannerNode — the stub must too, or correct cards that pan
        // audio fail the harness with "... of undefined" errors.
        const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
        const node = () => ({ connect() { return node(); }, disconnect() {}, start() {}, stop() {}, frequency: param(), gain: param(), pan: param(), type: 'sine', buffer: null, playbackRate: { value: 1 }, Q: param(), detune: param(), getByteFrequencyData() {}, getByteTimeDomainData() {}, fftSize: 2048, frequencyBinCount: 1024 });
        return { currentTime: 0, sampleRate: 44100, state: 'running', destination: node(), createOscillator: node, createGain: node, createAnalyser: node, createBufferSource: node, createBiquadFilter: node, createStereoPanner: node, createDelay: node, createConvolver: node, createDynamicsCompressor: node, createBuffer: (c, l, r) => ({ getChannelData: () => new Float32Array(l), duration: l / r, length: l, numberOfChannels: c }), createPeriodicWave: () => ({}), resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => Promise.resolve(), decodeAudioData: () => Promise.resolve({}) };
      };
      window.speechSynthesis = { speak() {}, cancel() {}, getVoices: () => [], pause() {}, resume() {}, speaking: false, addEventListener() {} };
      window.SpeechSynthesisUtterance = function (t) { this.text = t; };
      window.navigator.clipboard = { writeText: () => Promise.resolve(), readText: () => Promise.resolve('') };
      const store = {};
      const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; }, key: i => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } };
      Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
      Object.defineProperty(window, 'sessionStorage', { value: ls, configurable: true });
      window.URL.createObjectURL = () => 'blob:mock';
      window.URL.revokeObjectURL = () => {};
    },
  });
  const { window } = dom;
  window.addEventListener('error', e => sink.push(`uncaught: ${e.message}`));
  window.console.error = (...a) => sink.push('console.error: ' + a.map(String).join(' ').slice(0, 160));
  return { dom, window };
}

// Mount one card into a container inside window, run its scripts, fire
// DOMContentLoaded/load, poke the UI, settle. Returns the error list.
async function mountCard(card, window, sink) {
  const { rel, base, html } = card;
  const errors = [];
  const doc = window.document;
  const container = doc.createElement('div');
  container.id = `card-${base.replace(/\.html$/, '')}`;
  // class="card" mirrors tool.html, the only production injector: cards scope
  // via closest('.card'), so the harness must provide that ancestor too.
  container.className = 'card card-sandbox';
  doc.getElementById('toolbox-grid').appendChild(container);

  // mirror tool.html: parse, strip scripts, append the body, then append the
  // fragment's scripts as new elements so they run in global scope
  const parsed = new window.DOMParser().parseFromString(html, 'text/html');
  const parsedScripts = Array.from(parsed.querySelectorAll('script'));
  parsedScripts.forEach(s => s.remove());
  const content = doc.createElement('div');
  content.className = 'card-sandbox-content';
  content.innerHTML = parsed.body.innerHTML;
  container.appendChild(content);

  // run each script with document.currentScript pointing at an element in the container
  for (const s of parsedScripts) {
    const el = doc.createElement('script');
    Array.from(s.attributes).forEach(a => el.setAttribute(a.name, a.value));
    container.appendChild(el);
    try {
      Object.defineProperty(doc, 'currentScript', { value: el, configurable: true });
      window.eval(s.textContent);
    } catch (e) {
      errors.push(`threw during execution: ${e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e}`);
    }
  }

  // fire DOMContentLoaded/load handlers registered by the card, then poke the UI
  try { doc.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true })); } catch (e) { errors.push('DOMContentLoaded handler threw: ' + e.message); }
  try { window.dispatchEvent(new window.Event('load')); } catch (e) { errors.push('load handler threw: ' + e.message); }

  // click every button once, fire input on every field — smoke, not semantics.
  // Nodes detached by an earlier click (e.g. a mode toggle that rewrites the
  // card) are skipped: real users can't click what's no longer on the page,
  // and detached listeners firing against a rebuilt DOM only ever produced
  // false-positive null errors.
  const clickables = Array.from(container.querySelectorAll('button, [role=button]')).slice(0, 60);
  for (const b of clickables) {
    if (!b.isConnected) continue;
    try { b.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) { errors.push(`click on "${(b.textContent || '').trim().slice(0, 30)}" threw: ${e.message}`); }
  }
  for (const i of Array.from(container.querySelectorAll('input, select, textarea')).slice(0, 60)) {
    if (!i.isConnected) continue;
    try {
      i.dispatchEvent(new window.Event('input', { bubbles: true }));
      i.dispatchEvent(new window.Event('change', { bubbles: true }));
    } catch (e) { errors.push(`input event threw: ${e.message}`); }
  }
  // The wait for timers/promises happens in the caller, asynchronously; a spin
  // here would starve the very queue it is waiting on.
  return { errors, container };
}

// ---------------------------------------------------------------- 7. mount + execute
// One window per card: mount, poke, then clear the container and dispatch the
// events that follow a navigation, exactly as tool.html does for the next tool
// (`container.innerHTML = ''` and a fresh DOMContentLoaded). Nothing else has
// ever been mounted in this document, so every error is attributable:
//
//   * errors before the teardown are the card's own mount/poke failures;
//   * errors during the teardown probe are what the card leaves behind.
//
// A window per card costs about what a window per batch of forty did (the
// card's own execution dominates, not the jsdom boot), and it removes the
// guesswork: attribution by "is this error string new?" charged 24 innocent
// cards in one catalogue-wide run and missed 44 real ones, because which cards
// share a window decides what a leftover listener hits.
//
// Cross-card global collisions are deliberately NOT this tool's job any more —
// nothing is co-mounted, so it cannot see them; scripts/check-card-collisions.py
// owns that class, and it fails the gate.
// Settling is ASYNCHRONOUS on purpose. A synchronous spin — `while (Date.now()
// - t0 < 30) {}` — blocks the event loop, so nothing a card scheduled with
// setTimeout ever runs, and the harness was blind to every deferred failure:
// a card whose rAF loop, timer or promise callback threw after mount reported
// clean. The same trap made a self-removing toast look permanent when a
// leftover probe used a spin to "wait" three seconds.
const SETTLE_MS = 120;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// A card's deferred callback runs on node's timer queue (the jsdom window is
// created with runScripts:'outside-only' and its scripts run through
// window.eval), so a throw inside one arrives here rather than in the window's
// error event and would kill the whole sweep — 1,250 cards, one crash. The
// handler attributes it to the card in flight, which is what the sink does for
// every other error; without this the harness aborted at the first card whose
// timer threw and reported nothing for the 409 cards after it.
let inFlight = null;
process.on('uncaughtException', err => {
  if (inFlight) inFlight.push(`deferred throw: ${err && err.message ? err.message : err}`);
  else console.log(`  note (before any card): ${err && err.message ? err.message : err}`);
});
process.on('unhandledRejection', reason => {
  const message = reason && reason.message ? reason.message : String(reason);
  if (inFlight) inFlight.push(`deferred rejection: ${message}`);
});

(async () => {
  let leaking = 0;
  const leftovers = [];
  for (const card of parsedCards) {
    const perCard = [];
    const sink = { push: e => perCard.push(e) };
    inFlight = perCard;
    const { window } = makeWindow(sink);
    const before = new Set(window.document.body.children);
    const beforeHead = new Set(window.document.head.children);
    let container = null;
    try {
      container = (await mountCard(card, window, sink)).container;
    } catch (e) {
      perCard.push(`mount threw: ${e && e.message ? e.message : e}`);
    }
    // Let the card's own timers, promises and animation frames run: that is
    // when a deferred throw surfaces, and it belongs to this card.
    await delay(SETTLE_MS);
    const mountedErrors = [...new Set(perCard)];

    // The visitor has opened another tool: the loader clears its container and
    // dispatches DOMContentLoaded again, then clicks and types somewhere else.
    if (container && container.isConnected) container.remove();
    const mark = perCard.length;
    const nextMove = [
      () => window.document.dispatchEvent(new window.Event('DOMContentLoaded')),
      () => window.document.dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
      () => window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true })),
      () => window.document.dispatchEvent(new window.Event('input', { bubbles: true })),
    ];
    for (const fire of nextMove) {
      try { fire(); } catch (e) { perCard.push(`after teardown: ${e && e.message ? e.message : e}`); }
    }
    await delay(SETTLE_MS);
    const leftBehind = [...new Set(perCard.slice(mark))];

    // What is still in the document that the card brought with it. <style> and
    // <link> are excluded: inert once scoped, and check-card-css-leaks.py
    // proves every one of them is.
    const inert = el => ['STYLE', 'LINK'].includes(el.tagName);
    const left = [
      ...Array.from(window.document.body.children).filter(el => !before.has(el) && !inert(el)),
      ...Array.from(window.document.head.children).filter(el => !beforeHead.has(el) && !inert(el)),
    ].map(el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`);
    window.close();
    inFlight = null;

    if (mountedErrors.length) {
      mountedErrors.slice(0, 6).forEach(e => fail(card.rel, e));
    } else if (!leftBehind.length) {
      console.log(`  ok   ${card.rel}`);
    }
    if (leftBehind.length) {
      leaking++;
      console.log(`  LEAK ${card.rel} — still runs after the next tool opens:`);
      leftBehind.slice(0, 3).forEach(e => console.log(`       ${e.slice(0, 120)}`));
    }
    if (left.length) leftovers.push({ rel: card.rel, nodes: left });
  }

  if (leaking) {
    console.log(`\n${leaking} of ${parsedCards.length} card(s) still run code after their container ` +
                `is cleared. tool.html cannot unregister a listener it did not add, so a handler ` +
                `bound to \`document\` fires in every tool opened afterwards — bail out when the ` +
                `card is gone (CONSTRAINTS.md, "A listener on \`document\` runs in the next tool too").`);
    fails += leaking;
  }
  if (leftovers.length) {
    console.log(`\n${leftovers.length} of ${parsedCards.length} card(s) leave elements in the ` +
                `document after their container is cleared — a toast or a helper that outlives the ` +
                `card, or a node parked in document.body that should live inside the card. ` +
                `Nothing here is a failure by itself; run with --leftovers to list them.`);
    if (process.argv.includes('--leftovers')) {
      for (const l of leftovers) console.log(`  ${l.rel}: ${l.nodes.join(', ')}`);
    }
  }

  console.log(fails === 0
    ? `\nALL PASSED (${files.length} card${files.length === 1 ? '' : 's'})`
    : `\n${fails} problem(s)`);
  process.exit(fails === 0 ? 0 : 1);
})();

