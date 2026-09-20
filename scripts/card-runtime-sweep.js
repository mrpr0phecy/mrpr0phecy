#!/usr/bin/env node
// card-runtime-sweep.js — inject every tool card the exact way the home page
// does, and report the ones whose JavaScript throws.
//
// Why this exists
// ---------------
// check-card-js.py compiles each <script> block, which catches syntax errors.
// It cannot catch a block that is perfectly valid JavaScript and still throws
// the moment it runs: an element id that was renamed in the markup but not in
// the script, a variable declared in one function and read in another, a
// container whose innerHTML is overwritten and then queried. Those cards paint
// their face, "load", and then do nothing at all — the exact symptom of a tool
// that appears on the home page and dies when you click it.
//
// Eighteen cards shipped in that state (see check-card-runtime.py for the
// list). This is the guard.
//
// It runs the shipped home-app.js transformCardScript() over each block, so a
// change to that rewrite is exercised too. Each card gets its own jsdom window
// and is torn down immediately: several of these tools run a
// requestAnimationFrame loop forever, and holding forty of them open at once
// exhausts the heap.
//
// Usage:
//   node scripts/card-runtime-sweep.js                 # every card
//   node scripts/card-runtime-sweep.js bmi percentages # only matching cards
//
// Requires jsdom. scripts/check-card-runtime.py resolves it and skips with a
// NOTE when it is not installed, so a machine without it is not blocked.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const CARDS = path.join(ROOT, 'cards');
const appSrc = fs.readFileSync(path.join(ROOT, 'home-app.js'), 'utf8');

// The REAL rewrite, lifted out of the shipped loader — not a copy. If
// home-app.js changes how it reactivates a card's DOMContentLoaded handler,
// this sweep follows it.
const transformMatch = appSrc.match(/function transformCardScript\(code\) \{[\s\S]*?\n    \}\n/);
if (!transformMatch) {
  console.error('could not extract transformCardScript() from home-app.js — has it been renamed?');
  process.exit(2);
}
const transformCardScript = vm.runInNewContext('(' + transformMatch[0] + ')');

// Failures that are properties of this harness, not of the site. Each one is
// named with the evidence that cleared it, because a silent exclusion is how a
// real regression hides.
const HARNESS_LIMITS = new Map([
  // Loads three.js from a CDN through loadThreeJS() with a typeof guard, a
  // try/catch and its own error panel (cards/evolution-walker.html:409,1146).
  // It is a classified class-B egress exception; the sweep has no network, so
  // the dynamic <script> never arrives and THREE stays undefined.
  ['evolution-walker', /THREE is not defined/],
  // The stack is eleven frames deep, every one inside jsdom's CSS style engine
  // (@asamuzakjp/css-color) with no card frame at all. The card only ever
  // assigns literal, valid colours ('var(--accent)', '#e6faff',
  // 'rgba(45,212,255,0.2)', ''). Not reproducible as a card defect here.
  ['transposer', /Maximum call stack size exceeded/],
]);

// ---- browser APIs jsdom lacks, mirrored rather than stubbed -----------------
function instrument(window, errors) {
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.Element.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.Element.prototype.scrollIntoViewIfNeeded = function () {};
  window.Element.prototype.animate = function () { return { cancel() {}, finish() {} }; };

  const grad = { addColorStop() {} };
  const C2D = {
    canvas: null, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '',
    globalAlpha: 1, globalCompositeOperation: 'source-over', shadowBlur: 0, shadowColor: '',
    textAlign: '', textBaseline: '', lineCap: '', lineJoin: '', filter: 'none',
    imageSmoothingEnabled: true,
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
    arcTo() {}, rect() {}, roundRect() {}, fill() {}, stroke() {}, clip() {}, clearRect() {},
    fillRect() {}, strokeRect() {}, fillText() {}, strokeText() {}, translate() {}, rotate() {},
    scale() {}, transform() {}, setTransform() {}, resetTransform() {}, quadraticCurveTo() {},
    bezierCurveTo() {}, ellipse() {}, drawImage() {}, putImageData() {}, setLineDash() {},
    getLineDash: () => [], isPointInPath: () => false,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    createConicGradient: () => grad, createPattern: () => ({ setTransform() {} }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w || 1) * (h || 1) * 4)), width: w || 1, height: h || 1 }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w || 1) * (h || 1) * 4)), width: w || 1, height: h || 1 }),
  };
  window.HTMLCanvasElement.prototype.getContext = function () {
    const c = Object.assign({}, C2D); c.canvas = this; return c;
  };
  window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };

  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: param(), detune: param(), pan: param(), type: 'sine', fftSize: 2048, frequencyBinCount: 1024, buffer: null, getByteFrequencyData() {}, getFloatFrequencyData() {}, getByteTimeDomainData() {} });
  window.AudioContext = class {
    constructor() { this.destination = {}; this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.listener = {}; }
    createOscillator = node; createGain = node; createAnalyser = node; createBufferSource = node;
    createBiquadFilter = node; createWaveShaper = node; createDynamicsCompressor = node;
    createStereoPanner = node; createDelay = node; createConvolver = node; createPanner = node;
    createMediaElementSource = node; createConstantSource = node;
    createBuffer(c, l) { return { getChannelData: () => new Float32Array(l), length: l, numberOfChannels: c }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  };
  window.webkitAudioContext = window.AudioContext;
  window.speechSynthesis = { speak() {}, cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {} };
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  window.print = () => {}; window.alert = () => {}; window.confirm = () => true; window.prompt = () => '';
  window.open = () => null; window.scrollTo = () => {};
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};
  window.fetch = () => Promise.reject(new Error('network disabled in sweep'));
  window.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} addEventListener() {} abort() {} };
  window.WebSocket = class { constructor() { throw new Error('network disabled'); } };

  window.addEventListener('error', (e) => {
    errors.push((e && e.message) || String(e));
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    errors.push('unhandledrejection: ' + ((r && r.message) || String(r)));
  });
}

// ---- one card, one window ---------------------------------------------------
function runCard(file) {
  const name = file.replace(/\.html$/, '');
  const html = fs.readFileSync(path.join(CARDS, file), 'utf8');

  const vc = new VirtualConsole();
  const vcErrors = [];
  vc.on('jsdomError', (e) => {
    const msg = (e && e.message) || String(e);
    if (/Not implemented|Could not parse CSS|Could not load/.test(msg)) return;
    vcErrors.push(msg);
  });
  vc.on('error', () => {});

  const dom = new JSDOM(
    // The `.card` ancestor matters: cards scope themselves with
    // document.currentScript.closest('.card'), and without the wrapper that
    // lookup returns null and the sweep reports a failure the home page does
    // not have.
    '<!doctype html><html><head></head><body><div id="host"><div class="card card-pending" id="cardwrap"></div></div></body></html>',
    { url: 'http://localhost/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc }
  );
  const errors = [];
  instrument(dom.window, errors);
  const { document } = dom.window;

  const cardSandbox = document.createElement('div');
  cardSandbox.className = 'card-sandbox';
  cardSandbox.id = 'card-' + name;
  const wrap = document.getElementById('cardwrap');
  wrap.dataset.name = name;
  wrap.appendChild(cardSandbox);

  let syncErr = null;
  let scriptCount = 0;
  try {
    // Exactly renderCardContent()'s order: parse, lift out script/style, take
    // the body markup, then styles, then scripts.
    const contentDiv = document.createElement('div');
    contentDiv.className = 'card-sandbox-content';
    const doc = new dom.window.DOMParser().parseFromString(html, 'text/html');

    const scripts = Array.from(doc.querySelectorAll('script'));
    scripts.forEach((s) => s.remove());
    const styles = Array.from(doc.querySelectorAll('style'));
    styles.forEach((s) => s.remove());

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = doc.body ? doc.body.innerHTML : '';
    while (tempDiv.firstChild) contentDiv.appendChild(tempDiv.firstChild);
    cardSandbox.appendChild(contentDiv);

    styles.forEach((style) => {
      const ns = document.createElement('style');
      ns.textContent = style.textContent;
      cardSandbox.appendChild(ns);
    });

    for (const script of scripts) {
      if (script.getAttribute('src')) continue;
      scriptCount++;
      try {
        const ns = document.createElement('script');
        Array.from(script.attributes).forEach((a) => ns.setAttribute(a.name, a.value));
        ns.textContent = transformCardScript(script.textContent);
        cardSandbox.appendChild(ns);
      } catch (e) { syncErr = e; }
    }
  } catch (e) {
    syncErr = e;
  }
  return { dom, cardSandbox, errors, vcErrors, syncErr, scriptCount };
}

// ---- driver -----------------------------------------------------------------
const args = process.argv.slice(2);
const all = fs.readdirSync(CARDS).filter((f) => f.endsWith('.html')).sort();
const target = args.length ? all.filter((c) => args.some((a) => c.includes(a))) : all;
const SETTLE_MS = parseInt(process.env.SWEEP_SETTLE_MS || '70', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const results = [];
  for (const file of target) {
    let r = null;
    try { r = runCard(file); } catch (e) { r = null; }
    const name = file.replace(/\.html$/, '');
    if (!r) {
      results.push({ name, scripts: 0, errors: ['harness: could not inject the card'], domNodes: 0 });
      continue;
    }
    // The loader rewrites `document.addEventListener('DOMContentLoaded', h)`
    // into a setTimeout, so give that tick its turn — a card that initialises
    // there is exactly the card that fails after it looks fine.
    await sleep(SETTLE_MS);
    const messages = [
      ...(r.syncErr ? [String((r.syncErr && r.syncErr.message) || r.syncErr)] : []),
      ...r.errors,
      ...r.vcErrors,
    ].filter(Boolean);
    results.push({
      name,
      scripts: r.scriptCount,
      errors: [...new Set(messages)],
      domNodes: r.cardSandbox ? r.cardSandbox.querySelectorAll('*').length : 0,
    });
    try { r.dom.window.close(); } catch {}
  }

  const failures = [];
  const excused = [];
  for (const r of results) {
    if (!r.errors.length) continue;
    const limit = HARNESS_LIMITS.get(r.name);
    if (limit && r.errors.every((m) => limit.test(m))) excused.push(r);
    else failures.push(r);
  }

  console.log(`runtime sweep: ${results.length} card(s) injected through the real loader path`);
  console.log(`  clean: ${results.length - failures.length - excused.length}`);
  console.log(`  threw: ${failures.length}`);
  if (excused.length) {
    console.log(`  excused as harness limits: ${excused.map((e) => e.name).join(', ')}`);
  }
  for (const f of failures) {
    console.log(`FAIL\t${f.name}\t${f.errors.join(' ;; ')}`);
  }
  fs.writeFileSync(path.join(process.env.SWEEP_OUT || '/tmp', 'card-runtime-sweep.json'),
    JSON.stringify(results, null, 2));
  process.exit(failures.length ? 1 : 0);
})();
