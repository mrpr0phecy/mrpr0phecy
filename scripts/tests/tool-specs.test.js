'use strict';
// Per-tool specs — the agent contract (api/tools.json + api/tools/<slug>.json).
//
//   node scripts/tests/tool-specs.test.js
//
// Why this file exists: `inputs[].name` is not prose, it is the exact URL
// parameter a filled link carries, and `prefill.runs` is a promise that
// `&run=1` presses the tool's own Calculate. If either drifts from the card,
// an agent hands a visitor a link that opens the tool with empty fields — or
// with numbers in it that never compute because nothing pressed the button —
// and nothing on the page says so. The link looks fine; only the visitor's
// result is missing.
//
// The specs are written by scripts/build-tool-specs.js from
// scripts/lib/card-fields.js; this file re-reads the cards itself, so it
// cannot agree with the generator by repeating the generator's mistake.
// Reading every card takes well under a second, so the whole catalogue is
// checked rather than a sample: a spec that rots on tool 900 is exactly the
// one nobody would have sampled.
//
// Run with: node scripts/tests/tool-specs.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { readCard, hasRunTrigger } = require('../lib/card-fields.js');

const ROOT = path.join(__dirname, '..', '..');
const CARDS = path.join(ROOT, 'cards');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'api', 'tools.json'), 'utf8'));

function specFile(slug) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'api', 'tools', slug + '.json'), 'utf8'));
}

test('every input a spec publishes is a control the card really has', () => {
  const problems = [];
  for (const spec of MANIFEST.tools) {
    const file = path.join(CARDS, spec.slug + '.html');
    if (!fs.existsSync(file)) { problems.push(`${spec.slug}: no card at cards/${spec.slug}.html`); continue; }
    const card = readCard(file);
    const ids = new Set(card.fields.map(f => f.id));
    for (const input of spec.inputs || []) {
      if (!ids.has(input.name)) {
        problems.push(`${spec.slug}: names input ${input.name}, which the card does not expose`);
      }
    }
    if (card.fields.length && !(spec.inputs || []).length) {
      problems.push(`${spec.slug}: card has ${card.fields.length} fillable control(s), the spec publishes none`);
    }
  }
  assert.deepEqual(problems, [], 'specs name controls the cards do not have:\n' + problems.join('\n'));
});

test('prefill.runs is the same answer the card gives the engine', () => {
  // The engine's rule lives in tool.html (it cannot require a Node module) and
  // the builder's copy lives in scripts/lib/card-fields.js; both are exercised
  // here against every card, so a new button label on one card cannot quietly
  // make a spec promise more than the engine will do.
  const problems = [];
  for (const spec of MANIFEST.tools) {
    const file = path.join(CARDS, spec.slug + '.html');
    if (!fs.existsSync(file)) continue;
    const runs = hasRunTrigger(fs.readFileSync(file, 'utf8'));
    if (!!(spec.prefill || {}).runs !== runs) {
      problems.push(`${spec.slug}: spec says runs=${!!(spec.prefill || {}).runs}, the card says ${runs}`);
    }
  }
  assert.deepEqual(problems, [], 'the run promise and the card disagree:\n' + problems.join('\n'));
});

test('every example link only carries ids from its own card, with the card\'s own values', () => {
  const problems = [];
  let examples = 0;
  for (const spec of MANIFEST.tools) {
    const example = (spec.prefill || {}).example;
    if (!example) continue;
    examples += 1;
    let url;
    try { url = new URL(example); } catch (e) { problems.push(`${spec.slug}: example is not a URL`); continue; }
    if (url.origin + url.pathname !== 'https://www.themostusefulsiteintheworld.com/tool.html') {
      problems.push(`${spec.slug}: example points at ${url.origin + url.pathname}`);
    }
    if (url.searchParams.get('card') !== spec.slug) {
      problems.push(`${spec.slug}: example opens card=${url.searchParams.get('card')}`);
    }
    const byName = new Map((spec.inputs || []).map(i => [i.name, i]));
    for (const [name, value] of url.searchParams) {
      if (name === 'card' || name === 'run') continue;
      const input = byName.get(name);
      if (!input) { problems.push(`${spec.slug}: example fills ${name}, which the spec does not publish`); continue; }
      if (input.default !== undefined && String(value) !== String(input.default)) {
        problems.push(`${spec.slug}: example sets ${name}=${value} but the card defaults to ${input.default}`);
      }
    }
    if ((spec.prefill || {}).runs && !url.searchParams.has('run')) {
      problems.push(`${spec.slug}: runs is true but the example does not ask for it`);
    }
  }
  assert.ok(examples > 500, `only ${examples} specs carry a worked example — the contract is thin`);
  assert.deepEqual(problems, [], 'example links are not self-consistent:\n' + problems.join('\n'));
});

test('the manifest and the per-tool files are the same document', () => {
  // Two writers, one shape: everything api/tools.json shows for a tool must be
  // byte-identical to api/tools/<slug>.json, or an agent that fetches one and
  // an agent that fetches the other act on different contracts.
  const KEYS = ['slug', 'title', 'description', 'category', 'categoryName', 'url', 'embedUrl',
    'standaloneUrl', 'inputs', 'outputs', 'prefill', 'formula', 'sources', 'tags',
    'popularity', 'featured', 'updated'];
  const problems = [];
  for (const spec of MANIFEST.tools) {
    const full = specFile(spec.slug);
    for (const key of KEYS) {
      if (JSON.stringify(spec[key]) !== JSON.stringify(full[key])) {
        problems.push(`${spec.slug}: api/tools.json and api/tools/${spec.slug}.json disagree on ${key}`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the spec names the same URL the catalogue does, and the fields an agent needs to call it', () => {
  const problems = [];
  for (const spec of MANIFEST.tools) {
    // Since the full-page split the browse URL is the tool's own page; the
    // stateful shell (tool.html?card=) is what filled links are built on, so
    // the prefill URLs extend the shell, never spec.url — a query string on a
    // static .html URL lands nowhere.
    if (spec.url !== `https://www.themostusefulsiteintheworld.com/tool/${spec.slug}.html`) {
      problems.push(`${spec.slug}: url is ${spec.url}`);
    }
    if (!spec.prefill || typeof spec.prefill.urlTemplate !== 'string') {
      problems.push(`${spec.slug}: no prefill.urlTemplate`);
      continue;
    }
    const shell = `https://www.themostusefulsiteintheworld.com/tool.html?card=${spec.slug}`;
    if (!spec.prefill.urlTemplate.startsWith(shell + '&')) {
      problems.push(`${spec.slug}: urlTemplate does not extend the shell URL (${shell})`);
    }
    for (const input of spec.inputs || []) {
      for (const key of ['name', 'type', 'label']) {
        if (typeof input[key] !== 'string' || !input[key]) problems.push(`${spec.slug}: input ${input.name} has no ${key}`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});
