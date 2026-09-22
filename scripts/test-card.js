#!/usr/bin/env node
/**
 * test-card.js — smoke-test a card fragment the way tool.html loads it.
 *
 *   node scripts/test-card.js cards/my-tool.html [more cards...]
 *   node scripts/test-card.js --all               # every card, ~7 minutes
 *   node scripts/test-card.js --all --response    # + does it actually respond?
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
 * Inline handlers work too. 1,056 of the 1,250 cards wire their controls in
 * markup (`<button onclick="mcCalculate(this)">`), and jsdom does not compile
 * an `on*` attribute on its own: the attribute sits there, the button looks
 * bound, and no click ever reaches the card's function. The harness compiles
 * every one it inserts, in the window's own scope with `this` bound to the
 * element, which is what a browser does. An attribute that will not compile
 * (`onclick="calculate("`) is a button that can never work, and is reported.
 *
 * `--response` adds the one thing a throw-count cannot see. Everything above
 * proves a card does not *break*; none of it proves the card *works*. A tool
 * whose handler writes to an element that no longer exists in its own markup,
 * or whose result is computed and never rendered, mounts clean, pokes clean and
 * reports `ok`. So in that mode every field the card renders is filled with a
 * plausible value first, then the card's own primary control is pressed
 * (Calculate / Generate / Convert / Solve / …), and the document is compared
 * with the state just before the press. Nothing changed, and the card is named.
 * The verdict is written to be read by a person — it is a lead, not a proof:
 * an animation or a 300 ms debounce can move the DOM on its own, so the probe
 * takes a quiet reading and a settled reading and calls a card responsive only
 * when the press is what moved something.
 *
 * jsdom does not fetch external resources, so a card that appends a CDN
 * <script> and waits for it never gets its callback here. That path is poked by
 * hand once the container is gone — `load` and `error` both — because on a slow
 * connection it is exactly what happens to a visitor who opens a card, sees the
 * spinner, and picks another tool: the library lands, the handler runs, and it
 * writes to markup that was removed. Reading the leftovers then waits a second
 * longer before calling a node permanent: several cards clean up on a 400-500 ms
 * timer, and a snapshot taken too early cannot tell that from a node that stays.
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
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require(path.join('/tmp/tenv/node_modules/jsdom')));
} catch (_) {
  try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) {
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
  const card = { rel, base, html };
  parsedCards.push(card);

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
  // Where each <script> block starts *in the file*, so a throw can be reported
  // as a line of the card rather than a line of an anonymous eval.
  card.scriptLines = scripts.map(s =>
    html.slice(0, s.index + s[0].indexOf('>') + 1).split('\n').length);
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
// A throw from inside a card's own callback comes back with a stack whose only
// useful frame is a line number *inside the block that was eval'd* — "Cannot
// read properties of null" says nothing about where in a 3,000-line card it
// happened. The block text and the block's first line in the file are both
// known here, so the statement can be printed with the error: that is the
// difference between a report you act on and one you re-derive by hand.
function locate(err, blocks) {
  // `blocks` is undefined for an error that fires before a card is mounted (or
  // after its window is closed). Iterating it threw "order is not iterable"
  // inside the harness and was reported as if the card had done it — the one
  // failure mode a harness must never have.
  if (!blocks || !blocks.length) return '';
  const stack = (err && err.stack) || '';
  const m = /card-block-(\d+)\.js:(\d+):(\d+)/.exec(stack) ||
            /<anonymous>:(\d+):(\d+)/.exec(stack);
  if (!m) return '';
  // two shapes: named block (3 groups) or anonymous eval (2 groups)
  const blockNo = m.length === 4 ? Number(m[1]) : 0;
  const n = Number(m.length === 4 ? m[2] : m[1]);
  const col = m.length === 4 ? m[3] : m[2];
  const order = blockNo ? [blocks[blockNo - 1], ...blocks] : blocks;
  for (const b of order) {
    if (!b) continue;
    const line = String(b.text).split('\n')[n - 1];
    if (line !== undefined && line.trim()) {
      return ` [card line ${b.startLine + n - 1}:${col}: ${line.trim().slice(0, 100)}]`;
    }
  }
  return '';
}

// One stubbed jsdom window; `currentRel` labels errors with the card being
// mounted/poked when they fire (uncaught events are async and can only be
// attributed to the card in flight — batch mode re-runs in isolation before
// reporting, so a mis-attributed error cannot fail a clean card).
function makeWindow(sink) {
  // jsdom's window has its own error channel: an exception thrown inside a
  // timer or an event handler it dispatched arrives here as a `jsdomError`, not
  // as a node-level uncaughtException and not always as a window `error` event.
  // Left alone it goes to the default console — the stack is printed, no card
  // is charged, and a run reports ALL PASSED over a card that threw. Own it.
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', err => {
    const message = err && err.message ? err.message : String(err);
    // jsdom's own gaps (confirm(), requestSubmit(), navigation) are not card
    // defects and are already visible in the harness source as stubs.
    if (/not implemented/i.test(message)) return;
    // err.detail carries the original Error (or a string) for a throw jsdom
    // caught; without its stack the report can only say WHAT threw, never
    // which line of the card did it. locate() reads the filename off the stack.
    const detail = err && (err.detail || err.cause);
    const located = detail && detail.stack ? locate(detail, inFlightBlocks) : '';
    sink.push(`uncaught in the window: ${message.slice(0, 160)}${located}`);
  });

  const pending = [];
  const intervals = [];
  const dom = new JSDOM(shellHtml, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
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
      // Every one-shot timer the card schedules is recorded, so the harness can
      // fire the ones still pending when the visitor leaves. Those are the
      // callbacks the old spin never reached: a 500 ms preview, a 3 s toast, a
      // 1 s auto-save and a 16 ms animation frame all look the same from here,
      // and jsdom will not run one of them on its own after `window.close()`.
      const realSetTimeout = window.setTimeout.bind(window);
      const realClearTimeout = window.clearTimeout.bind(window);
      window.setTimeout = function (fn, ms, ...rest) {
        const handle = realSetTimeout(fn, ms, ...rest);
        if (typeof fn === 'function') pending.push({ handle, fn, rest });
        return handle;
      };
      window.clearTimeout = function (handle) {
        const i = pending.findIndex(t => t.handle === handle);
        if (i >= 0) pending.splice(i, 1);
        return realClearTimeout(handle);
      };
      // Repeating timers are the same problem with a longer fuse: they fire
      // again, so the guard has to live in the callback, not in the code that
      // scheduled it. Recorded for the same fast-forward, which ticks each one
      // twice after teardown — the first tick is the one a correct guard
      // catches, the second is the one that catches a guard written wrong.
      const realSetInterval = window.setInterval.bind(window);
      const realClearInterval = window.clearInterval.bind(window);
      window.setInterval = function (fn, ms, ...rest) {
        const handle = realSetInterval(fn, ms, ...rest);
        if (typeof fn === 'function') intervals.push({ handle, fn, rest });
        return handle;
      };
      window.clearInterval = function (handle) {
        const i = intervals.findIndex(t => t.handle === handle);
        if (i >= 0) intervals.splice(i, 1);
        return realClearInterval(handle);
      };
      window.requestAnimationFrame = cb => window.setTimeout(() => cb(Date.now()), 16);
      window.cancelAnimationFrame = id => window.clearTimeout(id);
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = () => {};
      // A card that builds a button with setAttribute('onclick', …) expects the
      // browser's compile-on-set behaviour. jsdom has none, so the hook runs the
      // same compile the mount pass runs below.
      const realSetAttribute = window.Element.prototype.setAttribute;
      window.Element.prototype.setAttribute = function (name, value) {
        const out = realSetAttribute.call(this, name, value);
        if (window.__compileInline) window.__compileInline(this, name, value);
        return out;
      };
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
      // jsdom ships no execCommand, so a card that falls back to it (the
      // select-and-copy trick) lands in its own catch and never reaches the
      // cleanup that follows — which then looks like a leak the card does not
      // have. Browsers still have it; a stub keeps the harness honest.
      window.document.execCommand = () => true;
      // jsdom implements no `innerText` at all (spec-wise it is a rendering
      // concept), so `element.innerText.trim()` throws "Cannot read properties
      // of undefined" in a card that works in every browser. textContent is the
      // same string for the cases cards use it for: reading output to copy or
      // export, and setting text.
      if (!('innerText' in window.HTMLElement.prototype)) {
        Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
          configurable: true,
          get() { return this.textContent; },
          set(v) { this.textContent = v; },
        });
      }
      // jsdom has no DataTransfer either, and `input.files = dt.files` is the
      // only way a script can fake a file drop. Cards that self-test their own
      // upload path use it (hash-checker loads a generated file that way), and
      // in the harness the ReferenceError looked like the card's bug.
      if (!window.DataTransfer) {
        const makeFileList = files => {
          // jsdom's `files` setter refuses anything that is not a real
          // FileList, and FileList has no public constructor — so borrow the
          // prototype (which satisfies the brand check) and fill it in.
          const list = Object.create(window.FileList.prototype);
          Object.defineProperty(list, 'length', { value: files.length });
          files.forEach((f, i) => Object.defineProperty(list, String(i), { value: f }));
          Object.defineProperty(list, 'item', { value: i => files[i] || null });
          return list;
        };
        // The setter is shadowed for the same reason (it brand-checks too), and
        // the getter has to keep jsdom's meaning for "nothing chosen": an EMPTY
        // FileList, not null. Returning null made every card that guards with
        // `if (input.files.length)` look broken.
        const emptyFileList = () => makeFileList([]);
        Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
          configurable: true,
          get() { return this.__files || emptyFileList(); },
          set(v) { this.__files = v && v.length !== undefined && !v.item ? makeFileList(Array.from(v)) : v; },
        });
        window.DataTransfer = function DataTransfer() {
          const items = { _f: [], add(f) { this._f.push(f); }, clear() { this._f = []; }, get length() { return this._f.length; } };
          this.items = items;
          Object.defineProperty(this, 'files', { get: () => makeFileList(items._f) });
          this.setData = () => {}; this.getData = () => ''; this.clearData = () => {}; this.types = [];
          this.effectAllowed = 'all'; this.dropEffect = 'none';
        };
      }
      const store = {};
      const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; }, key: i => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } };
      Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
      Object.defineProperty(window, 'sessionStorage', { value: ls, configurable: true });
      window.URL.createObjectURL = () => 'blob:mock';
      window.URL.revokeObjectURL = () => {};
    },
  });
  const { window } = dom;
  // The card's scripts are run as real scripts against this context (see the
  // block loop) so their top-level bindings behave as they do in a browser.
  const vmContext = dom.getInternalVMContext();
  // A card that catches its own deferred throw leaves only the log line, so the
  // log has to carry the location too — otherwise "Calculation error: TypeError"
  // is all a sweep can say about it.
  const logged = (...a) => {
    // the card's Error is a jsdom-realm object, so duck-type it rather than
    // ask `instanceof Error` across realms
    const err = a.find(x => x && typeof x === 'object' && typeof x.stack === 'string');
    sink.push('console.error: ' + a.map(String).join(' ').slice(0, 160) +
              (err ? locate(err, window.__blocks) : ''));
  };
  window.addEventListener('error', e => {
    sink.push(`uncaught: ${e.message}` + (e.error ? locate(e.error, window.__blocks) : ''));
  });
  window.console.error = logged;
  return { dom, window, vmContext, pending, intervals };
}

// Mount one card into a container inside window, run its scripts, fire
// DOMContentLoaded/load, poke the UI, settle. Returns the error list.
async function mountCard(card, window, vmContext, sink) {
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
  const blocks = [];
  let cursor = 0;
  for (const [blockIndex, s] of parsedScripts.entries()) {
    // The block's own text is the only reliable handle on where it starts: a
    // card can quote `<script>` in its prose, and then counting tags in the raw
    // file drifts by one and every reported line is wrong.
    const at = html.indexOf(s.textContent, cursor);
    if (at >= 0) cursor = at + s.textContent.length;
    const startLine = at >= 0
      ? html.slice(0, at).split('\n').length
      : ((card.scriptLines || [])[blockIndex] || 1);
    blocks.push({ text: s.textContent, startLine });
    const el = doc.createElement('script');
    Array.from(s.attributes).forEach(a => el.setAttribute(a.name, a.value));
    container.appendChild(el);
    try {
      Object.defineProperty(doc, 'currentScript', { value: el, configurable: true });
      // Run the block as a SCRIPT, not as an eval. A top-level `let`/`const` in
      // a classic script lands in the global lexical environment — shared with
      // the next script block and with `new Function` bodies, which is exactly
      // how an inline `onclick="someConst.doThing()"` resolves in a browser.
      // eval code keeps those bindings to itself, so the harness used to report
      // working cards as broken (and two blocks could not share a const).
      const script = new vm.Script(s.textContent, {
        filename: `card-block-${blockIndex + 1}.js`,
        displayErrors: true,
      });
      script.runInContext(vmContext);
    } catch (e) {
      errors.push(`threw during execution: ${e && e.message ? e.message : e}` +
                  locate(e, blocks));
    }
  }

  // locate() needs the block map the moment anything runs, and a click in the
  // sweep below can throw: jsdom reports that synchronously through the error
  // event, which arrived before this was set, so every such failure was reported
  // without the card line that says where it threw.
  window.__blocks = blocks;
  // Compile the card's inline handlers before anything is dispatched: an `on*`
  // attribute is inert in jsdom, so without this the click sweep (and the
  // --response probe) measure controls that are not wired to anything.
  let inlineHandlers = 0;
  const compileInline = (el, name, value) => {
    if (!/^on[a-z]+$/.test(name)) return;
    try {
      el[name] = new window.Function('event', String(value));
      inlineHandlers++;
    } catch (e) {
      errors.push(`inline ${name} does not compile, so that control can never ` +
                  `fire: ${e.message} (was: ${String(value).slice(0, 60)})`);
    }
  };
  window.__compileInline = compileInline;
  for (const el of Array.from(container.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) compileInline(el, attr.name, attr.value);
  }
  if (inlineHandlers) card.inlineHandlers = inlineHandlers;

  // fire DOMContentLoaded/load handlers registered by the card, then poke the UI
  try { doc.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true })); } catch (e) { errors.push('DOMContentLoaded handler threw: ' + e.message); }
  try { window.dispatchEvent(new window.Event('load')); } catch (e) { errors.push('load handler threw: ' + e.message); }

  // --response: give the card something to work with, then press its own
  // primary control. Done before the blind click sweep, which then runs with
  // the fields populated — a path no earlier harness ever reached.
  let responseReady = null;
  if (RESPONSE) {
    const fingerprintOf = () => {
      const root = doc.getElementById('toolbox-grid');
      return [
        container.outerHTML.length, container.outerHTML,
        root ? root.children.length : 0,
        doc.body.className, window.getComputedStyle(container).display,
      ].join('\u0000');
    };
    // The reading is taken BEFORE a single field is touched. Half the catalogue
    // recalculates as you type, so a press is often a no-op simply because the
    // answer is already on screen — measuring after the fill called those cards
    // unresponsive when they were the responsive ones.
    const quiet = fingerprintOf();
    const fields = Array.from(container.querySelectorAll('input, select, textarea')).slice(0, 80);
    for (const i of fields) {
      if (!i.isConnected) continue;
      if (i.type === 'checkbox' || i.type === 'radio') {
        i.checked = true;
      } else if (i.tagName === 'SELECT') {
        const usable = Array.from(i.options).find(o => o.value !== '' && !o.disabled);
        if (usable) i.value = usable.value;
      } else if (i.type === 'file' || i.type === 'hidden') {
        continue;
      } else if (i.value === '') {
        i.value = TYPED[i.type] || TYPED.text;
      }
      try {
        i.dispatchEvent(new window.Event('input', { bubbles: true }));
        i.dispatchEvent(new window.Event('change', { bubbles: true }));
      } catch (e) { errors.push('input event threw: ' + e.message); }
    }
    const controls = Array.from(container.querySelectorAll(PRIMARY_SELECTOR));
    const label = c => ((c.textContent || c.value || c.getAttribute('aria-label') || '') + '').trim();
    const primary = controls.filter(c => PRIMARY_WORDS.test(label(c)) && !SECONDARY_WORDS.test(label(c)));
    const chosen = primary.length ? primary : controls.filter(c => !SECONDARY_WORDS.test(label(c)));
    for (const c of chosen.slice(0, 6)) {
      if (!c.isConnected) continue;
      try { c.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); }
      catch (e) { errors.push(`click on "${label(c).slice(0, 30)}" threw: ${e.message}`); }
    }
    responseReady = { quiet, chosen: chosen.map(label).slice(0, 6),
                      fingerprint: fingerprintOf, hasInputs: fields.length > 0,
                      anyControl: controls.length > 0 };
  }

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
  return { errors, container, blocks, responseReady };
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

// How long a leftover gets to prove it is temporary. Several cards remove the
// anchor or toast they appended on a 400-500 ms timer; only a second look can
// tell those from a node that is never coming back.
const LINGER_MS = 900;

// --response: what the probe types into an empty field, and which controls it
// reads as "the thing this card is for".
const RESPONSE = process.argv.includes('--response') || process.argv.includes('--strict-response');
const STRICT_RESPONSE = process.argv.includes('--strict-response');
const TYPED = {
  number: '100', range: '50', date: '2026-01-01', 'datetime-local': '2026-01-01T09:00',
  time: '09:00', month: '2026-01', week: '2026-W01', color: '#3366ff',
  email: 'someone@example.com', tel: '07700900123', url: 'https://example.com/',
  password: 'correct horse battery staple', search: 'mortgage', text: 'Hello world',
};
const PRIMARY_WORDS = /calculate|compute|convert|generate|solve|analyz|analys|estimate|work ?out|run|start|build|create|draw|render|check|test|measure|find|search|show|plot|simulate|apply|submit/i;
const SECONDARY_WORDS = /reset|clear|copy|download|print|share|help|guide|close|back|settings|theme|menu|example|random|toggle|hide|show (help|guide|more)|more|less|next|prev/i;
const PRIMARY_SELECTOR = 'button, [role=button], input[type=submit], input[type=button]';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// A card's deferred callback runs on node's timer queue (the jsdom window is
// created with runScripts:'outside-only' and its scripts run through
// window.eval), so a throw inside one arrives here rather than in the window's
// error event and would kill the whole sweep — 1,250 cards, one crash. The
// handler attributes it to the card in flight, which is what the sink does for
// every other error; without this the harness aborted at the first card whose
// timer threw and reported nothing for the 409 cards after it.
let inFlight = null;
let inFlightBlocks = null;
process.on('uncaughtException', err => {
  const message = err && err.message ? err.message : String(err);
  if (inFlight) inFlight.push(`deferred throw: ${message}` + locate(err, inFlightBlocks));
  else console.log(`  note (before any card): ${message}`);
});
process.on('unhandledRejection', reason => {
  const message = reason && reason.message ? reason.message : String(reason);
  if (inFlight) inFlight.push(`deferred rejection: ${message}` + locate(reason, inFlightBlocks));
});

(async () => {
  let leaking = 0;
  const leftovers = [];
  const unresponsive = [];
  for (const card of parsedCards) {
    const perCard = [];
    const sink = { push: e => perCard.push(e) };
    inFlight = perCard;
    const { window, vmContext, pending, intervals } = makeWindow(sink);
    const before = new Set(window.document.body.children);
    const beforeHead = new Set(window.document.head.children);
    let container = null;
    let blocks = null;
    let responseReady = null;
    inFlightBlocks = null;
    try {
      const mounted = await mountCard(card, window, vmContext, sink);
      container = mounted.container;
      blocks = mounted.blocks;
      responseReady = mounted.responseReady;
      inFlightBlocks = blocks;
    } catch (e) {
      perCard.push(`mount threw: ${e && e.message ? e.message : e}`);
    }
    // Let the card's own timers, promises and animation frames run: that is
    // when a deferred throw surfaces, and it belongs to this card.
    await delay(SETTLE_MS);
    // --response: the settled reading. A press that only queues a debounce has
    // changed nothing yet; this is the second chance for it to show itself.
    let responsive = null;
    if (responseReady) {
      const settled = responseReady.fingerprint();
      responsive = settled !== responseReady.quiet;
    }
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
    // Time passes on the page the visitor moved to: every timer the card still
    // had pending when its container was cleared fires now. Two waves — what
    // was pending at teardown, then what that scheduled — because a card that
    // re-arms itself (an animation loop, a save-every-second) would otherwise
    // keep the flush running for as long as its own schedule allows.
    for (let wave = 0; wave < 2 && pending.length; wave++) {
      for (const t of pending.splice(0, pending.length)) {
        try { t.fn(...t.rest); }
        catch (e) {
          perCard.push(`after teardown (timer): ${e && e.message ? e.message : e}` +
                       locate(e, blocks));
        }
      }
      await delay(0);
    }

    // Two more ticks of every interval the card never cleared. A repeating
    // timer that only fails on its second tick is a real pattern — the first
    // one is what a `clearInterval` guard is supposed to catch — and jsdom will
    // not run it again after the window closes.
    for (let tick = 0; tick < 2 && intervals.length; tick++) {
      for (const t of intervals.splice(0, intervals.length)) {
        try { t.fn(...t.rest); }
        catch (e) {
          perCard.push(`after teardown (interval): ${e && e.message ? e.message : e}` +
                       locate(e, blocks));
        }
        intervals.push(t);  // still armed for the next tick, unless it cleared itself
      }
      await delay(0);
    }

    // A <script> the card appended itself is still waiting when the visitor
    // leaves. Fire what a real network would: whichever way it lands, the
    // card's continuation runs now, against markup that is gone.
    const lateScripts = [
      ...Array.from(window.document.body.children).filter(el => !before.has(el) && el.tagName === 'SCRIPT'),
      ...Array.from(window.document.head.children).filter(el => !beforeHead.has(el) && el.tagName === 'SCRIPT'),
    ];
    if (lateScripts.length) {
      for (const el of lateScripts) {
        for (const type of ['load', 'error']) {
          try { el.dispatchEvent(new window.Event(type)); }
          catch (e) {
            perCard.push(`after teardown (script ${type}): ${e && e.message ? e.message : e}` +
                         locate(e, blocks));
          }
        }
      }
      await delay(SETTLE_MS);
    }
    const leftBehind = [...new Set(perCard.slice(mark))];

    // What is still in the document that the card brought with it. <style> and
    // <link> are excluded: inert once scoped, and check-card-css-leaks.py
    // proves every one of them is.
    const inert = el => ['STYLE', 'LINK'].includes(el.tagName);
    const parked = [];
    for (const parent of [window.document.body, window.document.head]) {
      const seen = parent === window.document.body ? before : beforeHead;
      for (const el of Array.from(parent.children)) {
        if (!seen.has(el) && !inert(el)) {
          parked.push({ el, label: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}` });
        }
      }
    }
    // A card that cleans up on its own 400-500 ms timer looks identical to one
    // that never cleans up, if you only look once — the spin-era probe made a
    // self-removing toast look permanent for exactly this reason.
    let transient = 0;
    if (parked.length) {
      await delay(LINGER_MS);
      transient = parked.filter(x => !x.el.isConnected).length;
    }
    const left = parked.filter(x => x.el.isConnected).map(x => x.label);
    window.close();
    inFlight = null;
    inFlightBlocks = null;

    if (mountedErrors.length) {
      mountedErrors.slice(0, 6).forEach(e => fail(card.rel, e));
    } else if (!leftBehind.length) {
      console.log(`  ok   ${card.rel}`);
    }
    if (leftBehind.length) {
      leaking++;
      console.log(`  LEAK ${card.rel} — still runs after the next tool opens:`);
      leftBehind.slice(0, 4).forEach(e => console.log(`       ${e.slice(0, 220)}`));
    }
    if (left.length || transient) leftovers.push({ rel: card.rel, nodes: left, transient });
    if (RESPONSE && responsive === false && (responseReady.chosen.length || responseReady.hasInputs)) {
      unresponsive.push({ rel: card.rel, pressed: responseReady.chosen,
                          inputs: responseReady.hasInputs });
    }
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
      for (const l of leftovers) {
        const cleaned = l.transient ? ` (${l.transient} more cleaned up by the card's own timer)` : '';
        console.log(`  ${l.rel}: ${l.nodes.length ? l.nodes.join(', ') : 'nothing permanent'}${cleaned}`);
      }
    }
  }

  if (RESPONSE) {
    console.log(`\n${unresponsive.length} of ${parsedCards.length} card(s) did not respond to ` +
                `their own main control: every field was filled with a plausible value, the ` +
                `card's Calculate/Generate/Convert-style button was pressed, and nothing in the ` +
                `page changed — not the markup, not an attribute, not the layout. Some of these ` +
                `are cards that only react to something else (a keystroke, a file, a timer); the ` +
                `rest are tools whose result never reaches the page.`);
    for (const u of unresponsive) {
      console.log(`  ${u.rel}: pressed ${u.pressed.map(p => `"${p.slice(0, 28)}"`).join(', ')}` +
                  (u.inputs ? '' : ' (no fields to fill)'));
    }
    if (STRICT_RESPONSE) fails += unresponsive.length;
  }

  console.log(fails === 0
    ? `\nALL PASSED (${files.length} card${files.length === 1 ? '' : 's'})`
    : `\n${fails} problem(s)`);
  process.exit(fails === 0 ? 0 : 1);
})();

