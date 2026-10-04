'use strict';
// Browser-level smoke tests for the local-first Horror & Paranormal cards.
// jsdom is scratch-only; the static catalogue contract still runs without it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) { try { ({ JSDOM } = require('jsdom')); } catch (_) { JSDOM = null; } }

const ROOT = path.join(__dirname, '..', '..');
const CARDS = path.join(ROOT, 'cards');
const SLUGS = [
  'spirit-box-wordstream', 'evp-review-lab', 'magnetometer-field-log',
  'sls-figure-composer', 'haunted-photo-fx-studio', 'haunt-atmosphere-generator',
  'fictional-planchette-board', 'ghost-radar-prop', 'haunt-cue-sequencer',
  'safe-night-shoot-planner'
];

function mount(slug) {
  const dom = new JSDOM(fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8'), {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://tools.example.test/tool.html',
    beforeParse(window) {
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
      window.HTMLCanvasElement.prototype.getContext = function () {
        const noop = function () {};
        const gradient = { addColorStop: noop };
        return new Proxy({
          canvas: this,
          getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
          createImageData: (w, h) => ({ data: new Uint8ClampedArray((w.width || w) * (h || w.height || 1) * 4) }),
          createLinearGradient: () => gradient,
          createRadialGradient: () => gradient,
          measureText: () => ({ width: 10 }),
          putImageData: noop, drawImage: noop, save: noop, restore: noop,
        }, { get(target, key) { return key in target ? target[key] : noop; }, set() { return true; } });
      };
      window.HTMLCanvasElement.prototype.toBlob = callback => callback(new window.Blob([]));
      const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
      const node = () => ({
        connect() { return node(); }, disconnect() {}, start() {}, stop() {},
        gain: param(), frequency: param(), playbackRate: param(), type: 'sine', buffer: null, loop: false,
      });
      window.AudioContext = window.webkitAudioContext = function () {
        return {
          currentTime: 0, sampleRate: 44100, state: 'running', destination: node(),
          createOscillator: node, createGain: node, createBiquadFilter: node,
          createBufferSource: node,
          createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
          resume() { return Promise.resolve(); }, close() { return Promise.resolve(); },
        };
      };
    },
  });
  return { dom, document: dom.window.document, close: () => dom.window.close() };
}

const browserTest = (name, fn) => test(name, { skip: !JSDOM && 'jsdom is not installed (see AGENTS.md §2)' }, fn);

test('ten tools are indexed in the dedicated Horror & Paranormal category', () => {
  const cards = JSON.parse(fs.readFileSync(path.join(CARDS, 'cards.json'), 'utf8'));
  const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools-index.json'), 'utf8'));
  const found = cards.filter(card => SLUGS.includes(card.name));
  assert.equal(found.length, 10);
  assert.ok(found.every(card => card.category === 'Horror & Paranormal'));
  assert.deepEqual(found.map(card => card.name).sort(), [...SLUGS].sort());
  const category = catalogue.categories.find(item => item.name === 'Horror & Paranormal');
  assert.ok(category);
  assert.equal(category.count, 10);
  assert.equal(category.slug, 'horror-and-paranormal');
  assert.ok(fs.existsSync(path.join(ROOT, 'categories', category.slug + '.html')));
});

test('all ten cards are fragments, have descriptions, and make no network calls', () => {
  for (const slug of SLUGS) {
    const html = fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8');
    assert.match(html, /<h2[^>]*id="[a-z]+-title"/, slug + ' has a title');
    assert.match(html, /id="[a-z]+-desc"/, slug + ' has a description');
    assert.doesNotMatch(html.replace(/<script\b[\s\S]*?<\/script>/gi, ''), /<!doctype\b|<html\b|<head\b|<body\b/i, slug + ' is a fragment');
    assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|https?:\/\//i, slug + ' has no remote dependency');
  }
});

browserTest('wordstream starts on demand and stops its fictional output', () => {
  const t = mount('spirit-box-wordstream');
  try {
    const q = id => t.document.getElementById('sbw-' + id);
    q('start').click();
    assert.notEqual(q('word').textContent, 'READY');
    assert.match(q('status').textContent, /Fictional phrase deck running/);
    assert.equal(q('start').disabled, true);
    q('stop').click();
    assert.match(q('status').textContent, /Stopped/);
    assert.equal(q('stop').disabled, true);
  } finally { t.close(); }
});

browserTest('magnetometer fallback stays blank when the device API is missing', () => {
  const t = mount('magnetometer-field-log');
  try {
    t.document.getElementById('mfl-start').click();
    assert.match(t.document.getElementById('mfl-status').textContent, /does not expose.*Magnetometer API/i);
    assert.equal(t.document.getElementById('mfl-live').textContent, '— µT');
  } finally { t.close(); }
});

browserTest('cue sequencer safely treats visitor text as text and supports pause/stop', () => {
  const t = mount('haunt-cue-sequencer');
  try {
    const d = t.document;
    const custom = d.getElementById('hcs-custom');
    custom.value = '<img src=x onerror=alert(1)>';
    d.getElementById('hcs-add').click();
    assert.equal(d.querySelector('#hcs-list img'), null);
    assert.match(d.getElementById('hcs-list').textContent, /<img src=x onerror=alert\(1\)>/);
    d.getElementById('hcs-start').click();
    assert.equal(d.getElementById('hcs-pause').disabled, false);
    d.getElementById('hcs-pause').click();
    assert.match(d.getElementById('hcs-status').textContent, /Paused/);
    d.getElementById('hcs-stop').click();
    assert.match(d.getElementById('hcs-status').textContent, /Stopped/);
  } finally { t.close(); }
});

browserTest('shoot plan stays locked until all eight permission and safety checks pass', () => {
  const t = mount('safe-night-shoot-planner');
  try {
    const d = t.document;
    const build = d.getElementById('snsp-build');
    assert.equal(build.disabled, true);
    d.getElementById('snsp-site').value = 'studio';
    d.getElementById('snsp-site').dispatchEvent(new t.dom.window.Event('change', { bubbles: true }));
    assert.equal(build.disabled, true);
    const checks = Array.from(d.querySelectorAll('[data-safety-check]'));
    assert.equal(checks.length, 8);
    checks.forEach(box => { box.checked = true; box.dispatchEvent(new t.dom.window.Event('change', { bubbles: true })); });
    assert.equal(build.disabled, false);
    build.click();
    assert.match(d.getElementById('snsp-output').textContent, /AUTHORIZED HORROR SHOOT/);
    assert.match(d.getElementById('snsp-output').textContent, /not a safety certification/);
    assert.doesNotMatch(d.body.textContent, /latitude|longitude|GPS coordinates/i);
  } finally { t.close(); }
});

browserTest('fictional planchette pauses cleanly with its partial line labeled as fiction', () => {
  const t = mount('fictional-planchette-board');
  try {
    const d = t.document;
    d.getElementById('fpb-start').click();
    assert.notEqual(d.getElementById('fpb-line').textContent, '—');
    assert.match(d.getElementById('fpb-status').textContent, /prewritten fictional phrase/);
    d.getElementById('fpb-stop').click();
    assert.match(d.getElementById('fpb-status').textContent, /partial line is fiction/);
  } finally { t.close(); }
});
