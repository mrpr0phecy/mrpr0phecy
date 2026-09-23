#!/usr/bin/env node
'use strict';
// check-card-init.js — a card that can only start while the document is LOADING
// never starts at all.
//
// tool.html fetches the fragment, injects it into a page that finished loading
// long ago, appends the card's <script> and *then* dispatches DOMContentLoaded.
// So when a card's script runs, `document.readyState` is 'complete' (or
// 'interactive' on a very fast cached deep link) — never 'loading'. A card whose
// only start-up sits inside
//
//     if (document.readyState === 'loading') {
//         document.addEventListener('DOMContentLoaded', function () { …the whole card… });
//     }
//
// therefore registers no listener, never runs, and the visitor gets markup with
// no behaviour: tic-tac-toe drew no board at all, cooking-unit-converter never
// ran its first conversion, cover-letter never filled in the date. Forty-three
// cards were in this state, left behind by the bulk edit in 494fa7e that wrapped
// their init in the guard and gave the other 95 cards the `else` half.
//
// Nothing else in this repo can see it. The markup is valid, the scripts
// compile, every inline handler resolves — the card simply never starts. The
// harness did not see it either: it used to mount into a document jsdom had not
// finished parsing, so `readyState` really was 'loading' and the guard passed.
// `scripts/test-card.js` waits for the document now, which is what exposed the
// class, but a card that starts and does nothing is silent under any harness —
// the rule belongs in a check.
//
// The rule: a `readyState === 'loading'` guard whose body registers a
// DOMContentLoaded listener must have an `else` branch. If the guard is about
// something else, it is not this check's business.
//
//   node scripts/check-card-init.js --all
//   node scripts/check-card-init.js --changed
//   node scripts/check-card-init.js cards/x.html [--json]
//
// Brace matching runs on a masked copy of the block (strings, comments and
// regex literals blanked, every offset preserved), because an apostrophe in a
// comment must not be able to move the closing brace.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GUARD = /if\s*\(\s*document\.readyState\s*===?\s*['"]loading['"]\s*\)/g;
const LISTENER = /document\.addEventListener\(\s*['"]DOMContentLoaded['"]/;

function mask(code) {
  const out = code.split('');
  const n = code.length;
  const blank = (a, b) => {
    for (let k = Math.max(0, a); k < Math.min(b, n); k++) out[k] = code[k] === '\n' ? '\n' : ' ';
  };
  let i = 0, prev = '';
  while (i < n) {
    const c = code[i], nxt = code[i + 1] || '';
    if (c === '/' && nxt === '/') {
      const start = i;
      while (i < n && code[i] !== '\n') i++;
      blank(start, i);
      continue;
    }
    if (c === '/' && nxt === '*') {
      const start = i;
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i = Math.min(i + 2, n);
      blank(start, i);
      continue;
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%^~<>'.includes(prev))) {
      // a regex literal, or a division — decide by whether it closes on the line
      const start = i;
      i += 1;
      let inClass = false, closed = false;
      while (i < n) {
        const ch = code[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { i += 1; closed = true; break; }
        else if (ch === '\n') break;
        i += 1;
      }
      if (closed) { blank(start, i); prev = '/'; } else { i = start + 1; prev = c; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const start = i;
      i += 1;
      while (i < n && code[i] !== c) {
        if (code[i] === '\\') { i += 2; continue; }
        i += 1;
      }
      i = Math.min(i + 1, n);
      blank(start, i);
      prev = c;
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i += 1;
  }
  return out.join('');
}

function matchBrace(masked, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < masked.length; i++) {
    if (masked[i] === '{') depth++;
    else if (masked[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Guards that register DOMContentLoaded with no else: the card never starts. */
function deadGuards(code) {
  const masked = mask(code);
  const out = [];
  GUARD.lastIndex = 0;
  let m;
  while ((m = GUARD.exec(code))) {
    const brace = masked.slice(m.index + m[0].length).match(/^\s*\{/);
    if (!brace) {
      // statement form: `if (…) document.addEventListener('DOMContentLoaded', init);`
      const end = code.indexOf(';', m.index + m[0].length);
      const stmt = code.slice(m.index, end < 0 ? undefined : end + 1);
      if (LISTENER.test(stmt)) out.push({ index: m.index, shape: 'statement' });
      continue;
    }
    const open = m.index + m[0].length + brace[0].length - 1;
    const close = matchBrace(masked, open);
    if (close < 0) continue;
    const body = code.slice(open + 1, close);
    if (!LISTENER.test(body)) continue;
    const tail = masked.slice(close + 1, close + 12);
    if (/^\s*else\b/.test(tail)) continue;
    out.push({ index: m.index, shape: 'block' });
  }
  return out;
}

function lineOf(code, index) {
  return code.slice(0, index).split('\n').length;
}

function scriptBlocks(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/type=["'](application\/json|text\/template|text\/plain)/i.test(m[1])) continue;
    const line = html.slice(0, m.index).split('\n').length;
    out.push({ code: m[2], line });
  }
  return out;
}

function checkCard(rel) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const html = fs.readFileSync(abs, 'utf8');
  const findings = [];
  for (const block of scriptBlocks(html)) {
    for (const g of deadGuards(block.code)) {
      findings.push({ rel, line: block.line + lineOf(block.code, g.index) - 1, shape: g.shape });
    }
  }
  return findings;
}

function changedCards() {
  const out = new Set();
  const run = args => {
    try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }); }
    catch (e) { return ''; }
  };
  for (const line of (run(['diff', '--name-only']) + run(['diff', '--name-only', '--cached']) +
                      run(['ls-files', '--others', '--exclude-standard'])).split('\n')) {
    if (/^cards\/[a-z0-9-]+\.html$/.test(line.trim())) out.add(line.trim());
  }
  return [...out];
}

function allCards() {
  return fs.readdirSync(path.join(ROOT, 'cards'))
    .filter(f => f.endsWith('.html')).sort().map(f => `cards/${f}`);
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const positional = args.filter(a => !a.startsWith('--'));
  let files;
  if (args.includes('--all')) files = allCards();
  else if (args.includes('--changed')) files = changedCards();
  else if (positional.length) files = positional;
  else {
    console.error('usage: node scripts/check-card-init.js --all | --changed | cards/x.html […] [--json]');
    return 2;
  }

  const findings = [];
  for (const rel of files) {
    try {
      findings.push(...checkCard(rel));
    } catch (e) {
      findings.push({ rel, line: 0, error: String(e.message || e) });
    }
  }

  const message = f => f.error
    ? `${f.rel}: could not be read: ${f.error}`
    : `${f.rel}:${f.line}: this card only starts inside ` +
      `\`if (document.readyState === 'loading')\` and has no \`else\` — tool.html ` +
      `injects the fragment into an already-loaded document, so the listener is ` +
      `never registered and the card never starts for a visitor. Give the guard an ` +
      `else branch that calls the same init, or drop the guard.`;

  if (json) {
    console.log(JSON.stringify({ checked: files.length, findings: findings.map(message) }, null, 1));
  } else {
    for (const f of findings) console.log(`  FAIL ${message(f)}`);
    if (!findings.length) {
      console.log(`  ${files.length} card(s): every card can start in an already-loaded document`);
    }
  }
  return findings.length ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { deadGuards, mask };
