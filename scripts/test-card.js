#!/usr/bin/env node
/**
 * test-card.js — smoke-test a card fragment the way tool.html loads it.
 *
 *   node scripts/test-card.js cards/my-tool.html [more cards...]
 *   node scripts/test-card.js --all               # every card
 *   node scripts/test-card.js --all --batch=40    # window batch size
 *   node scripts/test-card.js --leaks cards/*.html  # exact leftover audit
 *
 * What it checks (each FAIL exits 1):
 *   - the file is a fragment (no doctype/html/head/body outside <script>)
 *   - an <h2 id="…-title"> and a <p id="…-desc"> exist (cards.json needs them)
 *   - every <script> block parses (node --check equivalent via new Function)
 *   - the fragment mounts into a shared DOM alongside the shell and its
 *     scripts execute with zero uncaught exceptions (jsdom; window.alert and
 *     console.error are captured, network calls are refused and reported)
 *   - no element ids collide with ids already used by another card (a leak
 *     rather than a duplicate: only DOM outside the container outlives one)
 *   - every target=_blank link carries rel=noopener
 *   - the card makes no network request (fetch/XHR/Image/src=https)
 *
 * Mount efficiency: one jsdom window per card is ~1 s of pure boot cost, so a
 * full --all sweep used to take half an hour. With more than one file the
 * script hands several cards through a single window (--batch, default 40) —
 * but mounts them ONE AT A TIME, removing the previous card's container first,
 * because that is what tool.html does:

 *     container.innerHTML = ''      // tool.html, before every injection
 *     ...inject fragment, run scripts
 *     document.dispatchEvent(new Event('DOMContentLoaded'))
 *
 * The document, and everything a card leaves on it, outlives the container.
 * That is the point of batching: a classic inline script cannot undeclare a
 * `let`/`const`/`class`, listeners on `document`/`window` are never removed,
 * and DOM appended outside the container is never cleaned up — so a card can
 * be hit by a card the visitor opened ten tools ago. A window is still created
 * per batch, never per card. Each card is probed for leftovers the way
 * tool.html navigates: its container is removed and DOMContentLoaded is
 * dispatched again, with nothing else mounted, so a handler that could not
 * cope with the card being gone is named and counted separately from a card
 * that fails to mount at all.
 *
 * `--leaks` is the exact form of that question and uses one window per card:
 * mount, poke, clear the container, then dispatch the events that follow a
 * navigation (DOMContentLoaded, which tool.html re-dispatches, and the click /
 * keydown / input the visitor's next action produces). Nothing else has ever
 * been mounted in that window, so every error after the clear is this card's.
 * The batch path above answers the same question faster, by difference, and
 * can charge one card's leftover to another when the message varies — reach
 * for --leaks when the answer has to be exact.
 *
 * A full --all sweep mounts every card, so it needs more heap than node's
 * default — run it as: node --max-old-space-size=6144 scripts/test-card.js --all
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
function mountCard(card, window, sink) {
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
  // let timers/RAF settle briefly
  const t0 = Date.now();
  while (Date.now() - t0 < 30) { /* spin: jsdom timers are real timers; a short sync wait is enough for setTimeout(…,0) */ }
  return { errors, container };
}

// ------------------------------------------------------- 7a. exact leftover audit
if (args.includes('--leaks')) {
  let leaking = 0;
  for (const card of parsedCards) {
    const errs = [];
    const sink = { push: e => errs.push(e) };
    const { window } = makeWindow(sink);
    let container = null;
    try {
      container = mountCard(card, window, sink).container;
    } catch (e) {
      errs.push(`mount threw: ${e && e.message ? e.message : e}`);
    }
    if (container && container.isConnected) container.remove();
    const mark = errs.length;
    // What the visitor's next move produces in tool.html: the loader
    // re-dispatches DOMContentLoaded for the incoming card, and then the
    // visitor clicks and types somewhere else on the page.
    const nextMove = [
      () => window.document.dispatchEvent(new window.Event('DOMContentLoaded')),
      () => window.document.dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
      () => window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true })),
      () => window.document.dispatchEvent(new window.Event('input', { bubbles: true })),
    ];
    for (const fire of nextMove) {
      try { fire(); } catch (e) { errs.push(`after teardown: ${e && e.message ? e.message : e}`); }
    }
    window.close();
    const leftovers = [...new Set(errs.slice(mark))];
    if (leftovers.length) {
      leaking++;
      console.log(`  LEAK ${card.rel}`);
      leftovers.slice(0, 3).forEach(e => console.log(`       ${e.slice(0, 120)}`));
    }
  }
  console.log(`\n${leaking} of ${parsedCards.length} card(s) still run code after their container ` +
              `is cleared — tool.html cannot unregister a listener it did not add.`);
  process.exit(leaking ? 1 : 0);
}

// ---------------------------------------------------------------- 7. mount + execute
if (parsedCards.length === 1) {
  // Single card: isolated window (the original behaviour, one for one).
  const card = parsedCards[0];
  const perCard = [];
  const { dom, window } = makeWindow({ push: e => perCard.push(e) });
  mountCard(card, window, { push: e => perCard.push(e) });
  window.close();
  const unique = [...new Set(perCard)];
  if (unique.length) unique.slice(0, 6).forEach(e => fail(card.rel, e));
  else console.log(`  ok   ${card.rel}`);
} else {
  // One window per batch (booting jsdom is the expensive part), ONE CARD
  // MOUNTED AT A TIME inside it, and a teardown probe after each: remove the
  // container and dispatch DOMContentLoaded again, exactly as tool.html does
  // when the visitor opens the next tool.
  //
  // Attribution is by DIFFERENCE, because a window that has already held
  // moving.html will keep hearing from it: an error string seen during an
  // earlier card is not charged to this one, and a card is only FAILed once
  // the same failure is reproduced with nothing else in the window. An error
  // that shows up for the first time during a card's own teardown probe is
  // that card's leftover, and is reported as such.
  const leaks = [];
  let inheritedOnly = 0;
  for (let b = 0; b < parsedCards.length; b += batch) {
    const group = parsedCards.slice(b, b + batch);
    const errorsByCard = new Map(group.map(c => [c.rel, []]));
    let current = group[0].rel;
    const sink = { push: e => errorsByCard.get(current).push(e) };
    const { dom, window } = makeWindow(sink);
    const seen = new Set();        // mount/poke errors already explained here
    const probeSeen = new Set();   // leftover errors already explained here

    for (const card of group) {
      current = card.rel;
      let mounted = null;
      try {
        mounted = mountCard(card, window, sink).container;
      } catch (e) {
        errorsByCard.get(card.rel).push(`mount threw: ${e && e.message ? e.message : e}`);
      }

      // --- teardown probe: the visitor has opened another tool -------------
      if (mounted && mounted.isConnected) mounted.remove();
      const leftBehind = [];
      const realPush = sink.push;
      sink.push = e => leftBehind.push(e);
      try {
        window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
      } catch (e) {
        leftBehind.push(`dispatch threw: ${e && e.message ? e.message : e}`);
      }
      sink.push = realPush;

      const freshProbe = [...new Set(leftBehind)].filter(e => !probeSeen.has(e));
      leftBehind.forEach(e => probeSeen.add(e));
      if (freshProbe.length) leaks.push({ rel: card.rel, count: freshProbe.length, first: freshProbe[0] });

      // --- did this card actually fail, or is it standing in a shadow? -----
      const observed = [...new Set(errorsByCard.get(card.rel))];
      const fresh = observed.filter(e => !seen.has(e));
      observed.forEach(e => seen.add(e));
      if (!fresh.length) {
        if (observed.length) inheritedOnly++;
        console.log(`  ok   ${card.rel}`);
        continue;
      }
      const isolated = [];
      const solo = makeWindow({ push: e => isolated.push(e) });
      try {
        mountCard(card, solo.window, { push: e => isolated.push(e) });
      } catch (e) {
        isolated.push(`mount threw: ${e && e.message ? e.message : e}`);
      }
      solo.window.close();
      const repro = [...new Set(isolated)].filter(e => fresh.includes(e));
      if (repro.length) {
        repro.slice(0, 6).forEach(e => fail(card.rel, e));
      } else {
        // Seen for the first time here, but the card is clean on its own: an
        // earlier card in this window is throwing on its way to the next tool.
        inheritedOnly++;
        console.log(`  ok   ${card.rel}`);
      }
    }
    window.close();
  }

  if (inheritedOnly) {
    console.log(`\n  ${inheritedOnly} card(s) mounted clean and were only ever hit by another ` +
                `card's leftovers — not reported as failures`);
  }
  if (leaks.length) {
    console.log(`\n${leaks.length} card(s) keep running after the next tool opens. tool.html ` +
                `clears the container and dispatches DOMContentLoaded again, and it cannot ` +
                `unregister a listener it did not add:`);
    for (const l of leaks.slice(0, 300)) {
      console.log(`  left behind ${l.rel} (${l.count} error${l.count === 1 ? '' : 's'}, first: ${l.first.slice(0, 90)})`);
    }
    if (leaks.length > 300) console.log(`  ... and ${leaks.length - 300} more`);
    console.log('  Fix by bailing out of the handler when the card is gone — see the JS scope ' +
                'rule in CONSTRAINTS.md.');
  }
}
console.log(fails === 0 ? `\nALL PASSED (${files.length} card${files.length === 1 ? '' : 's'})` : `\n${fails} problem(s)`);
process.exit(fails === 0 ? 0 : 1);
