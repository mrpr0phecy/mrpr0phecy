'use strict';
// Regression coverage for the evidence-first Field Investigation & Evidence cards.
// jsdom is scratch-only; static catalogue contracts still run without it.
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
  'field-protocol-control-planner', 'environmental-baseline-survey',
  'room-sweep-grid-mapper', 'investigation-timeline-logger',
  'evp-blind-listening-worksheet', 'witness-statement-worksheet',
  'equipment-reference-check-log', 'evidence-integrity-manifest',
  'alternative-explanation-review', 'investigation-report-builder',
];

function mount(slug) {
  const dom = new JSDOM(fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8'), {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://tools.example.test/tool.html',
    beforeParse(window) {
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
      window.URL.createObjectURL = () => 'blob:field-test';
      window.URL.revokeObjectURL = () => {};
      window.HTMLMediaElement.prototype.load = function () {};
      window.HTMLMediaElement.prototype.pause = function () {};
    },
  });
  return { dom, document: dom.window.document, close: () => dom.window.close() };
}

const browserTest = (name, fn) => test(name, { skip: !JSDOM && 'jsdom is not installed (see AGENTS.md §2)' }, fn);

test('all ten fieldwork cards are indexed in the dedicated category', () => {
  const cards = JSON.parse(fs.readFileSync(path.join(CARDS, 'cards.json'), 'utf8'));
  const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools-index.json'), 'utf8'));
  const found = cards.filter(card => SLUGS.includes(card.name));
  assert.equal(found.length, 10);
  assert.ok(found.every(card => card.category === 'Field Investigation & Evidence'));
  assert.deepEqual(found.map(card => card.name).sort(), [...SLUGS].sort());
  const category = catalogue.categories.find(item => item.name === 'Field Investigation & Evidence');
  assert.ok(category);
  assert.equal(category.count, 10);
  assert.equal(category.slug, 'field-investigation-and-evidence');
  assert.ok(fs.existsSync(path.join(ROOT, 'categories', category.slug + '.html')));
});

test('all fieldwork cards are local-only fragments with titles and descriptions', () => {
  for (const slug of SLUGS) {
    const html = fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8');
    assert.match(html, /<h2[^>]*id="[a-z]+-title"/, slug + ' has a title');
    assert.match(html, /id="[a-z]+-desc"/, slug + ' has a description');
    assert.doesNotMatch(html.replace(/<script\b[\s\S]*?<\/script>/gi, ''), /<!doctype\b|<html\b|<head\b|<body\b/i, slug + ' is a fragment');
    assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|https?:\/\//i, slug + ' has no remote dependency');
  }
});

browserTest('protocol planner gates the schedule and produces paired A/B trials', () => {
  const t = mount('field-protocol-control-planner');
  try {
    const d = t.document;
    const q = id => d.getElementById('ficp-' + id);
    assert.equal(q('build').disabled, true);
    q('question').value = 'Does condition affect the manual reading?';
    ['authorized', 'blind', 'rule'].forEach(id => { q(id).checked = true; q(id).dispatchEvent(new t.dom.window.Event('change', { bubbles: true })); });
    q('pairs').value = '6';
    assert.equal(q('build').disabled, false);
    q('build').click();
    const trials = Array.from(q('sequence').querySelectorAll('li')).map(li => li.textContent);
    assert.equal(trials.length, 12);
    for (let pair = 1; pair <= 6; pair++) {
      const members = trials.filter(text => text.includes('pair ' + pair + ' ·'));
      assert.equal(members.length, 2);
      assert.notEqual(members[0].split(' · ').at(-1), members[1].split(' · ').at(-1));
    }
  } finally { t.close(); }
});

browserTest('baseline survey compares manual pairs, accepts zero, and rejects out-of-range humidity', () => {
  const t = mount('environmental-baseline-survey');
  try {
    const d = t.document;
    d.getElementById('ebs-temp-base').value = '0';
    d.getElementById('ebs-temp-observed').value = '1.2';
    d.getElementById('ebs-rh-base').value = '40';
    d.getElementById('ebs-rh-observed').value = '101';
    d.getElementById('ebs-calc').click();
    assert.equal(d.getElementById('ebs-temp-delta').textContent, '+1.2 °C');
    assert.equal(d.getElementById('ebs-rh-delta').textContent, 'check range');
    assert.match(d.getElementById('ebs-status').textContent, /1 matched measure/);
  } finally { t.close(); }
});

browserTest('room mapper safely records a schematic marker and treats its note as text', () => {
  const t = mount('room-sweep-grid-mapper');
  try {
    const d = t.document;
    d.querySelector('#sgrm-grid button[aria-label^="Select grid cell A1"]').click();
    d.getElementById('sgrm-note').value = '<img src=x onerror=alert(1)>';
    d.getElementById('sgrm-add').click();
    assert.equal(d.querySelector('#sgrm-list img'), null);
    assert.match(d.getElementById('sgrm-list').textContent, /A1.*<img src=x onerror=alert\(1\)>/);
    assert.equal(d.getElementById('sgrm-count').textContent, '1');
  } finally { t.close(); }
});

browserTest('timeline captures only manually entered notes and disables entry while paused', () => {
  const t = mount('investigation-timeline-logger');
  try {
    const d = t.document;
    d.getElementById('itl-start').click();
    assert.equal(d.getElementById('itl-add').disabled, false);
    d.getElementById('itl-note').value = 'A clear tone was heard';
    d.getElementById('itl-add').click();
    assert.equal(d.getElementById('itl-count').textContent, '1');
    assert.match(d.getElementById('itl-list').textContent, /A clear tone was heard/);
    d.getElementById('itl-pause').click();
    assert.equal(d.getElementById('itl-add').disabled, true);
    d.getElementById('itl-stop').click();
    assert.match(d.getElementById('itl-status').textContent, /Clock stopped/);
  } finally { t.close(); }
});

browserTest('blind EVP review requires a first playback, locks pass one, and requires a replay', () => {
  const t = mount('evp-blind-listening-worksheet');
  try {
    const d = t.document;
    const input = d.getElementById('ebw-file');
    const file = new t.dom.window.File(['audio'], 'clip.wav', { type: 'audio/wav' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new t.dom.window.Event('change', { bubbles: true }));
    d.getElementById('ebw-pass-one').value = 'No clear speech';
    d.getElementById('ebw-lock-one').click();
    assert.match(d.getElementById('ebw-status').textContent, /Play the clip/);
    const audio = d.getElementById('ebw-audio');
    audio.dispatchEvent(new t.dom.window.Event('play'));
    audio.dispatchEvent(new t.dom.window.Event('ended'));
    d.getElementById('ebw-lock-one').click();
    assert.equal(d.getElementById('ebw-pass-one').readOnly, true);
    assert.equal(d.getElementById('ebw-step-two').hidden, false);
    d.getElementById('ebw-context').value = 'Could this be a name?';
    d.getElementById('ebw-pass-two').value = 'Unclear';
    d.getElementById('ebw-finalize').click();
    assert.match(d.getElementById('ebw-status').textContent, /second playback/);
    audio.dispatchEvent(new t.dom.window.Event('play'));
    audio.dispatchEvent(new t.dom.window.Event('ended'));
    d.getElementById('ebw-finalize').click();
    assert.equal(d.getElementById('ebw-record').hidden, false);
    assert.match(d.getElementById('ebw-pass-one-out').textContent, /No clear speech/);
    assert.match(d.getElementById('ebw-context-out').textContent, /Could this be a name/);
    d.getElementById('ebw-context').value = 'Edited after review';
    d.getElementById('ebw-context').dispatchEvent(new t.dom.window.Event('input', { bubbles: true }));
    assert.equal(d.getElementById('ebw-record').hidden, true);
    d.getElementById('ebw-finalize').click();
    assert.equal(d.getElementById('ebw-record').hidden, false);
    assert.equal(d.getElementById('ebw-context-out').textContent, 'Edited after review');
  } finally { t.close(); }
});

browserTest('witness worksheet keeps participant text inert in a structured record', () => {
  const t = mount('witness-statement-worksheet');
  try {
    const d = t.document;
    d.getElementById('wsw-build').click();
    assert.match(d.getElementById('wsw-status').textContent, /witness code/);
    d.getElementById('wsw-code').value = 'W-02';
    d.getElementById('wsw-narrative').value = '<img src=x onerror=alert(1)> I heard a noise.';
    d.getElementById('wsw-build').click();
    assert.equal(d.querySelector('#wsw-preview img'), null);
    assert.match(d.getElementById('wsw-preview').textContent, /<img src=x onerror=alert\(1\)>/);
    assert.equal(d.getElementById('wsw-export').disabled, false);
  } finally { t.close(); }
});

browserTest('equipment check uses entered tolerance and handles a zero reference', () => {
  const t = mount('equipment-reference-check-log');
  try {
    const d = t.document;
    d.getElementById('erc-device').value = 'M-1';
    d.getElementById('erc-unit').value = 'µT';
    d.getElementById('erc-reference').value = '0';
    d.getElementById('erc-reading').value = '1';
    d.getElementById('erc-tolerance').value = '0.2';
    d.getElementById('erc-check').click();
    assert.match(d.getElementById('erc-result').textContent, /outside entered tolerance/);
    d.getElementById('erc-reading').value = '0.1';
    d.getElementById('erc-check').click();
    assert.match(d.getElementById('erc-result').textContent, /within entered tolerance/);
    assert.equal(d.getElementById('erc-count').textContent, '2');
  } finally { t.close(); }
});

browserTest('integrity manifest hashes selected bytes locally and offers file-specific custody scope', async () => {
  const t = mount('evidence-integrity-manifest');
  try {
    const d = t.document;
    const file = new t.dom.window.File(['audio'], 'clip.wav', { type: 'audio/wav' });
    file.arrayBuffer = () => Promise.resolve(Uint8Array.from([1, 2, 3]).buffer);
    Object.defineProperty(t.dom.window.crypto, 'subtle', { configurable: true, value: { digest: async (algorithm, bytes) => {
      assert.equal(algorithm, 'SHA-256');
      assert.deepEqual(Array.from(new Uint8Array(bytes)), [1, 2, 3]);
      return Uint8Array.from([0xab, 0xcd]).buffer;
    } } });
    Object.defineProperty(d.getElementById('eim-files'), 'files', { configurable: true, value: [file] });
    d.getElementById('eim-hash').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.match(d.getElementById('eim-files-list').textContent, /abcd/);
    assert.match(d.getElementById('eim-status').textContent, /Inventory ready/);
    assert.ok(Array.from(d.getElementById('eim-target').options).some(option => option.value === 'file:0'));
  } finally { t.close(); }
});

browserTest('integrity manifest requires an explicit handling action and logs it locally', () => {
  const t = mount('evidence-integrity-manifest');
  try {
    const d = t.document;
    d.getElementById('eim-add-event').click();
    assert.match(d.getElementById('eim-status').textContent, /Choose the affected file or scope/);
    d.getElementById('eim-target').value = 'session';
    d.getElementById('eim-add-event').click();
    assert.match(d.getElementById('eim-status').textContent, /Choose the handling action/);
    d.getElementById('eim-action').value = 'Copied for review';
    d.getElementById('eim-operator').value = 'OP-2';
    d.getElementById('eim-note').value = 'Write-protected copy';
    d.getElementById('eim-add-event').click();
    assert.match(d.getElementById('eim-events').textContent, /Copied for review.*OP-2.*Write-protected copy/);
    assert.equal(d.getElementById('eim-export').disabled, false);
  } finally { t.close(); }
});

browserTest('alternative review starts unchecked and reports unresolved items without scoring them', () => {
  const t = mount('alternative-explanation-review');
  try {
    const d = t.document;
    d.getElementById('aer-review').click();
    assert.match(d.getElementById('aer-status').textContent, /0 of 9/);
    assert.match(d.getElementById('aer-status').textContent, /9 remain unchecked or unresolved/);
    const first = d.querySelector('tbody tr[data-row] [data-status]');
    first.selectedIndex = 2;
    d.getElementById('aer-review').click();
    assert.match(d.getElementById('aer-status').textContent, /1 of 9/);
    assert.match(d.getElementById('aer-status').textContent, /8 remain unchecked or unresolved/);
  } finally { t.close(); }
});

browserTest('report builder requires permission and keeps submitted notes under observation headings', () => {
  const t = mount('investigation-report-builder');
  try {
    const d = t.document;
    d.getElementById('irb-build').click();
    assert.match(d.getElementById('irb-status').textContent, /Confirm permission/);
    d.getElementById('irb-permission').checked = true;
    d.getElementById('irb-code').value = 'FI-01';
    d.getElementById('irb-date').value = '2026-10-04';
    d.getElementById('irb-site').value = 'authorized site · Room A';
    d.getElementById('irb-objective').value = '# User-entered heading\nTest a baseline';
    d.getElementById('irb-observations').value = 'A manual reading was recorded.';
    d.getElementById('irb-build').click();
    assert.match(d.getElementById('irb-preview').textContent, /> # User-entered heading/);
    assert.match(d.getElementById('irb-preview').textContent, /does not by itself establish paranormal activity/);
    assert.equal(d.getElementById('irb-download').disabled, false);
  } finally { t.close(); }
});
