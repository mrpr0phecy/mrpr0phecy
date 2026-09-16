#!/usr/bin/env node
/**
 * lantern-core.js — run the REAL Lantern engine from ai.html in Node.
 *
 * Lantern (ai.html) ships its whole brain as one inline <script type="module">:
 * tokenising, hashed embeddings, chunking, BM25 + dense + HyDE + RRF + MMR
 * retrieval, the local tool registry, the guard layer (injection scan, PII
 * detection, claim extraction, evidence verification) and the reasoning
 * methods. None of it was covered by a test, because none of it was reachable
 * outside a browser.
 *
 * This module extracts that engine and evaluates it in a vm context with stub
 * browser globals, so a test or a benchmark can drive the shipped code exactly
 * as the browser does — the same pattern scripts/tests/home-fast-path.test.js
 * and scripts/tests/tool-shell.test.js already use for index.html and tool.html.
 * Nothing here reimplements Lantern. If ai.html changes and breaks retrieval,
 * arithmetic or a guard, these callers break too.
 *
 *   const { load } = require('./lantern-core.js');
 *   const { X } = load(['tokenize', 'KnowledgeBase', 'safeEval']);
 *
 * Zero dependencies (node only). No browser, no network, no API key.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TextEncoder, TextDecoder } = require('util');
const nodeCrypto = require('crypto');

const AI_HTML = path.join(__dirname, '..', 'ai.html');

/** First line of the inline module — the engine starts here. */
const ENGINE_START = 'const $ = (id) => document.getElementById(id);';

/**
 * The engine ends where the UI layer begins: the banner above
 * "══ 1. preferences". Everything before it is pure logic (text, storage,
 * retrieval, tools, guard, reasoning) and is what we want under test.
 */
function engineBounds(html) {
  const start = html.indexOf(ENGINE_START);
  if (start < 0) {
    throw new Error('could not find the Lantern engine start marker in ai.html — has the module been restructured?');
  }
  // The render/UI layer is introduced by a ══ banner followed by a numbered
  // section comment. Find the first banner after the engine's own header.
  const banner = html.indexOf('/* ══', start + ENGINE_START.length + 200);
  if (banner < 0) throw new Error('could not find the end of the Lantern engine');
  return { start, end: banner };
}

/** A DOM/global stub rich enough for the engine, inert enough to be honest. */
function makeSandbox(overrides = {}) {
  const ls = new Map();
  const el = () => new Proxy(function () {}, {
    get: (t, k) => {
      if (k === 'style' || k === 'dataset') return {};
      if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (k === 'value' || k === 'textContent' || k === 'innerHTML') return '';
      if (k === Symbol.toPrimitive) return () => '';
      return el();
    },
    set: () => true,
    apply: () => el(),
  });

  const sandbox = {
    console,
    Math, JSON, Date, Number, String, Boolean, Array, Object, Set, Map, WeakMap, WeakSet,
    RegExp, Error, TypeError, RangeError, Promise, Symbol, Proxy, Reflect,
    isNaN, isFinite, parseInt, parseFloat, Infinity, NaN, undefined,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    Uint8Array, Int8Array, Uint16Array, Int32Array, Float32Array, Float64Array, ArrayBuffer,
    TextEncoder, TextDecoder,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    document: {
      getElementById: () => el(),
      querySelector: () => el(),
      querySelectorAll: () => [],
      createElement: () => el(),
      addEventListener() {}, removeEventListener() {},
      readyState: 'complete',
      body: el(), head: el(), documentElement: el(),
      title: 'Lantern',
    },
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => { ls.set(String(k), String(v)); },
      removeItem: (k) => { ls.delete(String(k)); },
      clear: () => ls.clear(),
      key: (i) => [...ls.keys()][i] ?? null,
      get length() { return ls.size; },
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
    performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
    crypto: {
      randomUUID: () => nodeCrypto.randomUUID(),
      getRandomValues: (a) => nodeCrypto.randomFillSync(a),
      subtle: {
        // Real digests, so the hashing tool can be tested for correctness.
        digest: async (algo, data) => {
          const name = String(algo).replace('-', '').toLowerCase();
          return nodeCrypto.createHash(name === 'sha1' ? 'sha1' : `sha${name.replace('sha', '')}`).update(Buffer.from(data)).digest();
        },
      },
    },
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    navigator: { gpu: undefined, hardwareConcurrency: 4, deviceMemory: 8, language: 'en-GB', userAgent: 'node-lantern-harness' },
    location: { hash: '', href: 'https://www.themostusefulsiteintheworld.com/ai.html', origin: 'https://www.themostusefulsiteintheworld.com' },
    // The engine must never reach the network: a fetch here is a test failure,
    // not a silent success.
    fetch: () => { throw new Error('Lantern engine attempted a network call in the harness'); },
    indexedDB: undefined,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    ...overrides,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return sandbox;
}

/**
 * Load the shipped engine and return the named bindings.
 * @param {string[]} names  top-level identifiers to expose (functions, classes, consts)
 * @param {object}   [opts] { file, sandbox, transform }
 *   transform(src) -> src lets a *benchmark* run the engine with one switch
 *   flipped (e.g. stemming off, line-aware chunking off) so the contribution of
 *   a change can be measured instead of assumed. It is a measurement aid only —
 *   nothing in the shipped page calls it, and every transform must assert that
 *   it actually matched, so a rename breaks the ablation loudly rather than
 *   silently measuring nothing.
 */
function load(names, opts = {}) {
  const file = opts.file || AI_HTML;
  const html = fs.readFileSync(file, 'utf8');
  const { start, end } = engineBounds(html);
  let src = html.slice(start, end);
  if (opts.transform) src = opts.transform(src);
  const sandbox = makeSandbox(opts.sandbox);
  vm.createContext(sandbox);
  const missing = [];
  vm.runInContext(
    `${src}\n;globalThis.__X = { ${names.join(', ')} };\n`,
    sandbox,
    { filename: 'ai.html[lantern-engine]' },
  );
  for (const n of names) {
    if (sandbox.__X[n] === undefined) missing.push(n);
  }
  if (missing.length) {
    throw new Error(`ai.html no longer defines: ${missing.join(', ')} — update the harness or the page`);
  }
  return { X: sandbox.__X, sandbox, src, html, bounds: { start, end } };
}

module.exports = { load, makeSandbox, engineBounds, AI_HTML, ENGINE_START };
