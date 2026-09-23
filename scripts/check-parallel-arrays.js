#!/usr/bin/env node
/**
 * check-parallel-arrays.js — cards that index two arrays with the same index.
 *
 *   node scripts/check-parallel-arrays.js --all       # every card
 *   node scripts/check-parallel-arrays.js --changed   # cards touched vs HEAD
 *   node scripts/check-parallel-arrays.js cards/x.html [...]
 *   node scripts/check-parallel-arrays.js --all --json
 *
 * Why this exists. creative-writing.html shipped four parallel arrays for its
 * plot generator — 12 titles, 8 descriptions, 8 structures — and picked one
 * index into all of them:
 *
 *   const plotIndex = Math.floor(Math.random() * plotTitles.length);
 *   plotTitle.textContent = plotTitles[plotIndex];
 *   plotStructure.innerHTML = plotStructures[plotIndex].map(...)
 *
 * Four clicks in ten chose an index past the end of the shorter arrays, and
 * the generator died with "Cannot read properties of undefined (reading
 * 'map')". Nothing else in the suite can see that: the JavaScript parses, the
 * card responds to its own button (a click usually succeeds), and the handler
 * resolves. It is a data-shape bug, and it only fires on the unlucky draw.
 *
 * The shape it looks for, precisely:
 *
 *   1. two or more array literals in one card are indexed with the SAME
 *      variable (`a[i]` and `b[i]`), and
 *   2. that variable is derived from the length of one of those arrays — a
 *      `Math.random() * arr.length` pick, a `% arr.length` wrap or
 *      `Math.floor(Math.random() * arr.length)` — so the variable is in range
 *      for that array by construction, and
 *   3. those arrays are not all the same length.
 *
 * That is a mismatch by definition: the card's own code says the arrays are
 * parallel (one index serves both) and their lengths disagree, so some draws
 * must read undefined. It is a finding, not a proof of a crash: an index that
 * is also clamped or defaulted is reported as a note instead.
 *
 * Deliberately not flagged: index variables bound to an array's length that
 * only ever index that one array; `for (let i = 0; i < a.length; i++)` loops
 * over a single array; arrays indexed by a literal or a constant. Those are
 * the false positives that would make the check unwelcome in the gate.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CARDS = path.join(ROOT, 'cards');

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const CHANGED = args.includes('--changed');
const JSON_OUT = args.includes('--json');

/** Inline <script> bodies, with the line each one starts on. */
function scriptBlocks(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/i.test(m[1])) continue;          // external: not ours
    out.push({ code: m[2], line: html.slice(0, m.index).split('\n').length + 1 });
  }
  return out;
}

/** Array literals declared with const/let/var, with their length when the
 *  literal is evaluable. The walker skips strings and comments, so a `[`
 *  inside prose or a regex does not open a literal. */
function arrayLiterals(code) {
  const found = [];
  const decl = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g;
  let m;
  while ((m = decl.exec(code))) {
    const open = m.index + m[0].length - 1;
    let i = open, depth = 0, closed = false;
    while (i < code.length) {
      const c = code[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c; i += 1;
        while (i < code.length && code[i] !== q) i += code[i] === '\\' ? 2 : 1;
      } else if (c === '/' && code[i + 1] === '/') {
        while (i < code.length && code[i] !== '\n') i += 1;
      } else if (c === '/' && code[i + 1] === '*') {
        i += 2;
        while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i += 1;
        i += 1;
      } else if (c === '[') {
        depth += 1;
      } else if (c === ']') {
        depth -= 1;
        if (depth === 0) { closed = true; break; }
      }
      i += 1;
    }
    if (!closed) continue;
    const text = code.slice(open, i + 1);
    let len = null;
    try {
      const v = eval(text);                          // an array literal: pure data
      if (Array.isArray(v)) len = v.length;
    } catch { len = null; }
    found.push({ name: m[1], len, line: code.slice(0, m.index).split('\n').length });
  }
  return found;
}

function isClamped(code, arr, idx) {
  const wins = [
    // a[i] ?? fallback / a[i] || fallback — the undefined is handled
    new RegExp(`\\b${arr}\\s*\\[\\s*${idx}\\s*\\]\\s*(\\|\\||\\?\\?)`),
    // Math.min(i, …) in front of the read
    new RegExp(`Math\\s*\\.\\s*min\\s*\\(\\s*${idx}\\b`),
    // i = i % arr.length, i %= arr.length
    new RegExp(`\\b${idx}\\s*(?:%=\\s*|=\\s*[^;\\n]*?%\\s*)${arr}\\s*\\.\\s*length`),
    // arr.length - 1 used right where the index is read
    new RegExp(`\\b${arr}\\s*\\.\\s*length\\s*-\\s*1[^;\\n]*?\\b${idx}\\b`),
  ];
  return wins.some((re) => re.test(code));
}

/** Index variables the card itself bounds by an array's length. `idxVar` is
 *  in range for every array in `fromArrays` by construction. */
function boundedIndexVars(code) {
  const bound = new Map();
  const patterns = [
    // const i = Math.floor(Math.random() * arr.length);
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*?Math\s*\.\s*floor\s*\(\s*Math\s*\.\s*random\s*\(\s*\)\s*\*\s*([A-Za-z_$][\w$]*)\s*\.\s*length/g,
    // const i = Math.random() * arr.length (used directly, not floored)
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*?Math\s*\.\s*random\s*\(\s*\)\s*[^;\n]*?\b([A-Za-z_$][\w$]*)\s*\.\s*length/g,
    // i = i % arr.length  /  i %= arr.length
    /\b([A-Za-z_$][\w$]*)\s*(?:%=\s*|=\s*[^;\n]*?%\s*)([A-Za-z_$][\w$]*)\s*\.\s*length/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code))) {
      if (!bound.has(m[1])) bound.set(m[1], new Set());
      bound.get(m[1]).add(m[2]);
    }
  }
  return bound;
}

/** Array names indexed by each variable: `a[i]`, `a[ i ]`. */
function indexSites(code, known) {
  const sites = new Map();
  const re = /\b([A-Za-z_$][\w$]*)\s*\[\s*([A-Za-z_$][\w$]*)\s*\]/g;
  let m;
  while ((m = re.exec(code))) {
    const [, arr, idx] = m;
    if (!known.has(arr)) continue;
    if (!sites.has(idx)) sites.set(idx, new Set());
    sites.get(idx).add(arr);
    sites.get(idx).line = code.slice(0, m.index).split('\n').length;
  }
  return sites;
}

function checkCard(rel) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  let html;
  try { html = fs.readFileSync(abs, 'utf8'); } catch { return []; }
  const findings = [];
  for (const block of scriptBlocks(html)) {
    const lits = arrayLiterals(block.code);
    const byName = new Map(lits.map((l) => [l.name, l]));
    const bound = boundedIndexVars(block.code);
    const sites = indexSites(block.code, byName);
    for (const [idx, names] of sites) {
      const from = bound.get(idx);
      if (!from || !from.size) continue;             // not a length-derived index
      // Only the arrays the index is in range for matter: if the card picks an
      // index from `a.length`, then `a` is safe and every other array indexed
      // by that variable is the suspect.
      const anchors = [...names].filter((n) => from.has(n));
      if (!anchors.length) continue;
      const others = [...names].filter((n) => !from.has(n));
      if (!others.length) continue;
      const anchorLen = byName.get(anchors[0]).len;
      const bad = others.filter((n) => byName.get(n).len !== null && byName.get(n).len < anchorLen);
      if (!bad.length) continue;
      const clamped = bad.every((n) => isClamped(block.code, n, idx));
      findings.push({
        file: rel,
        line: block.line + (sites.get(idx).line || 0) - 1,
        index: idx,
        bounds: `${from.size > 1 ? [...from].join('.length, ') + '.length' : [...from][0] + '.length'}`,
        matches: names.size,
        detail: `${idx} is drawn from ${anchors.join(', ')} ` +
                `(${anchorLen} entries) but also indexes ` +
                bad.map((n) => `${n} (${byName.get(n).len})`).join(', ') +
                ` — ${anchorLen - byName.get(bad[0]).len} of ${anchorLen} draws read past the end`,
        severity: clamped ? 'NOTE' : 'FAIL',
      });
    }
  }
  return findings;
}

function changedCards() {
  const git = (a) => {
    try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }); }
    catch { return ''; }
  };
  const names = new Set(
    `${git(['diff', '--name-only', 'HEAD', '--', 'cards/'])}` +
    `${git(['diff', '--name-only', '--cached', '--', 'cards/'])}` +
    `${git(['ls-files', '--others', '--exclude-standard', '--', 'cards/'])}`
      .split('\n').filter(Boolean).map((p) => path.basename(p.trim())));
  return [...names].filter((n) => n.endsWith('.html') &&
    fs.existsSync(path.join(CARDS, n))).sort().map((n) => `cards/${n}`);
}

let files;
if (ALL) {
  files = fs.readdirSync(CARDS).filter((f) => f.endsWith('.html'))
    .sort().map((f) => `cards/${f}`);
} else if (CHANGED) {
  files = changedCards();
} else {
  files = args.filter((a) => !a.startsWith('--'));
}
if (!files.length) {
  if (CHANGED) { console.log('no cards changed vs HEAD — nothing to check'); process.exit(0); }
  console.error('usage: node scripts/check-parallel-arrays.js --all | --changed | cards/x.html [...] [--json]');
  process.exit(2);
}

const findings = [];
for (const f of files) findings.push(...checkCard(f));

const scope = ALL ? `${files.length} card(s)` : files.length === 1 ? files[0] : `${files.length} card(s)`;
const bad = findings.filter((f) => f.severity === 'FAIL');
const notes = findings.filter((f) => f.severity === 'NOTE');

if (JSON_OUT) {
  console.log(JSON.stringify({ scope, findings }, null, 2));
} else if (!findings.length) {
  console.log(`\n${scope}: no card indexes parallel arrays of different lengths\n`);
} else {
  console.log('');
  for (const f of findings) {
    console.log(`  ${f.severity} ${f.file}:${f.line}: ${f.detail}`);
  }
  console.log(`\n${bad.length} parallel-array mismatch(es)` +
    (notes.length ? `, ${notes.length} clamped (note)` : '') + ` in ${scope}.`);
  console.log('The card picks one index into arrays that are not the same length,');
  console.log('so some draws read undefined and the tool dies on the click.');
  console.log('Fix the data (make the arrays parallel) rather than clamping the index.\n');
}

process.exit(bad.length ? 1 : 0);
