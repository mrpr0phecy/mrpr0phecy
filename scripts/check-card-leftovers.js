#!/usr/bin/env node
'use strict';
// check-card-leftovers.js — nothing a card puts in the document may outlive it.
//
// tool.html can clear the card's container on every navigation. It cannot clear
// `document.body` or `document.head`. So anything a card appends there outlives
// the card: a share dialog or a modal stays on screen over the tool the visitor
// opened next, with its own Close button still wired to markup that is gone; a
// hidden YouTube wrapper keeps its iframe — and its audio — playing, and the
// next visit finds the stale wrapper, skips creating a player, and leaves the
// card's own music control dead. That last one was measured: visit 1 → 1
// player, 1 playVideo, wrapper still in the body after leaving; visit 2 → 0
// players, 0 playVideo, pauseVideo never called.
//
// The harness cannot be the only guard. Its teardown probe sees exactly the
// leftovers its own clicks produced — a dialog that opens behind a Share button
// is never clicked, so it is never counted. This is a source-level rule, so it
// sees the paths nothing exercises.
//
// The rule: a `document.body.appendChild(x)` / `document.head.appendChild(x)`
// must be matched by a removal of the same reference somewhere in the same
// script block — `x.remove()`, `x.parentNode.removeChild(x)` or
// `removeChild(x)`. That is the shape of the three legitimate uses:
//
//   * the download/copy helper, which appends an <a> or a <textarea>, clicks or
//     selects it, and removes it again in the same tick;
//   * a toast that removes itself on its own timer;
//   * a third-party library <script src> — inert once it has run, and a CDN
//     script is not a node the visitor can see (an INLINE script does not
//     qualify: appending one runs code, which is not inert).
//
// Anything else is a leftover, and the fix is to append into the card's own
// container instead:
//
//   const <prefix>Root = (document.currentScript && document.currentScript.closest('.card')) || document.body;
//
//   node scripts/check-card-leftovers.js --all
//   node scripts/check-card-leftovers.js --changed
//   node scripts/check-card-leftovers.js cards/x.html [--json]
//
// Matching runs on a masked copy of each block (scripts/lib/mask-js.js): a
// `.remove()` written inside a comment or a string is not a removal.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { mask } = require('./lib/mask-js.js');

const ROOT = path.join(__dirname, '..');
const APPEND = /(?<![\w$.])(?:window\.)?document\.(body|head)\.appendChild\(\s*([A-Za-z_$][\w$]*)\s*\)/g;

/** Does anything remove this reference? */
function removed(masked, name) {
  const n = name.replace(/[$]/g, '\\$&');
  return new RegExp(`\\b${n}\\s*\\.\\s*remove\\s*\\(`).test(masked) ||          // x.remove()
         new RegExp(`removeChild\\s*\\(\\s*${n}\\s*\\)`).test(masked) ||        // parent.removeChild(x)
         new RegExp(`\\b${n}\\s*\\.\\s*parentNode\\s*\\.\\s*removeChild`).test(masked);
}

/** Is this reference an external library script — inert once it has run?
 *  Read from the RAW block: the masker blanks the `'script'` literal the
 *  createElement call is made with. */
function isExternalScript(raw, name) {
  const n = name.replace(/[$]/g, '\\$&');
  const created = new RegExp(`\\b${n}\\s*=\\s*document\\.createElement\\(\\s*['"\`]script`).test(raw);
  const hasSrc = new RegExp(`\\b${n}\\s*\\.\\s*src\\s*=`).test(raw);
  return created && hasSrc;
}

/** A stylesheet the card brings with it: inert, and check-card-css-leaks.py is
 *  the check that owns the harm a global stylesheet can actually do. */
function isStyle(raw, name) {
  const n = name.replace(/[$]/g, '\\$&');
  return new RegExp(`\\b${n}\\s*=\\s*document\\.createElement\\(\\s*['"\`](style|link)`).test(raw);
}

/** Appends that nothing removes: { line, target, name } per finding. */
function leftovers(code, lineOffset) {
  const masked = mask(code);
  const out = [];
  APPEND.lastIndex = 0;
  let m;
  while ((m = APPEND.exec(masked))) {
    const name = m[2];
    if (removed(masked, name) || isExternalScript(code, name) || isStyle(code, name)) continue;
    out.push({ line: lineOffset + masked.slice(0, m.index).split('\n').length - 1,
               target: m[1], name });
  }
  return out;
}

function scriptBlocks(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/type=["'](application\/json|text\/template|text\/plain)/i.test(m[1])) continue;
    out.push({ code: m[2], line: html.slice(0, m.index).split('\n').length });
  }
  return out;
}

const message = f =>
  `${f.rel}:${f.line}: this card appends \`${f.name}\` to document.${f.target} and nothing ever ` +
  `removes it — tool.html clears the card's container, not the document, so it outlives the card ` +
  `and sits over the next tool the visitor opens. Append it into the card's own container instead ` +
  `(\`(document.currentScript && document.currentScript.closest('.card')) || document.body\`).`;

function checkCard(rel) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const html = fs.readFileSync(abs, 'utf8');
  const findings = [];
  for (const block of scriptBlocks(html)) {
    for (const l of leftovers(block.code, block.line)) findings.push({ rel, ...l });
  }
  return findings;
}

function changedCards() {
  const out = new Set();
  const run = args => {
    try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }); }
    catch (e) { return ''; }
  };
  const diff = run(['diff', '--name-only']) + run(['diff', '--name-only', '--cached']) +
               run(['ls-files', '--others', '--exclude-standard']);
  for (const line of diff.split('\n')) {
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
    console.error('usage: node scripts/check-card-leftovers.js --all | --changed | cards/x.html […] [--json]');
    return 2;
  }

  const findings = [];
  for (const rel of files) {
    try {
      findings.push(...checkCard(rel));
    } catch (e) {
      findings.push({ rel, line: 0, name: '', target: '', error: String(e.message || e) });
    }
  }

  const text = f => (f.error
    ? `${f.rel}: could not be read: ${f.error}`
    : message(f));

  if (json) {
    console.log(JSON.stringify({ checked: files.length, findings: findings.map(text) }, null, 1));
  } else {
    for (const f of findings) console.log(`  FAIL ${text(f)}`);
    if (!findings.length) {
      console.log(`  ${files.length} card(s): nothing a card adds to the document outlives it`);
    }
  }
  return findings.length ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { leftovers };
