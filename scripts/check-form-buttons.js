#!/usr/bin/env node
/**
 * check-form-buttons.js — the buttons that submit the tool away.
 *
 *   node scripts/check-form-buttons.js --all
 *   node scripts/check-form-buttons.js --changed     # cards touched vs HEAD
 *   node scripts/check-form-buttons.js cards/x.html [more]
 *   node scripts/check-form-buttons.js --all --json
 *
 * Why this exists. A `<button>` with no `type` attribute inside a `<form>` is a
 * submit button. In a card on this site that means: the visitor clicks
 * "Calculate BMI" (fitnesscore.html), the card computes and renders — and then
 * the browser submits the form, which navigates to the tool's own URL, and the
 * page reloads with the form empty. The result is shown for a few milliseconds
 * and thrown away. Fifteen cards shipped this (109 buttons between them): the
 * whole of percentages.html's keypad, clip-short's GENERATE, palette-swapper's
 * Extract Colors, cleaning.html's ADD TASK.
 *
 * Nothing in the suite could see it. The JavaScript parses, the handlers
 * resolve and fire, and the response sweep passes the card — jsdom does not
 * implement form submission, so the probe sees the DOM change the click made
 * and never the navigation. It is a browser-only defect, and the browser is
 * where the visitor is.
 *
 * The rule, in the form the site already uses everywhere else:
 *
 *   * a control button inside a form says `type="button"`; or
 *   * the form handles its own submission — `onsubmit="event.preventDefault()"`,
 *     `onsubmit="return false"`, or a `submit` listener on the form (the
 *     convention in business-days-working-days-calculator.html and the other
 *     calculators, whose Calculate buttons really are submit buttons).
 *
 * A card is only reported when it does neither. A `submit` listener is taken as
 * evidence of intent on its own: whether it calls preventDefault is not
 * something a source scan can settle, and a false positive costs a maintainer
 * more than a false negative does here.
 *
 * Forms and buttons the card builds in JavaScript are not read by this check —
 * the source text is not the markup the visitor gets — but the harness mounts
 * those and the response sweep reports what it finds.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CARDS = path.join(ROOT, 'cards');

/** Strip <script> bodies, keeping offsets (and therefore line numbers). */
function markupOnly(source) {
  return source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,
    (block) => block.replace(/[^\n]/g, ' '));
}

/** Does the card handle a submit itself, anywhere in its own script? */
function handlesSubmit(source) {
  const scripts = (source.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [])
    .map(b => b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/i, ''))
    .join('\n');
  return /addEventListener\s*\(\s*['"]submit['"]/.test(scripts) ||
    /\bon(submit)\s*=/.test(scripts) ||
    // an inline onsubmit attribute on the form itself is checked per form
    /\[['"]submit['"]\]\s*=/.test(scripts);
}

function checkCard(rel) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  let source;
  try { source = fs.readFileSync(abs, 'utf8'); } catch { return []; }
  if (!/<form\b/i.test(source)) return [];
  const markup = markupOnly(source);
  const findings = [];
  const formRe = /<form\b([^>]*)>/gi;
  let m;
  while ((m = formRe.exec(markup))) {
    const attrs = m[1];
    const end = markup.toLowerCase().indexOf('</form>', formRe.lastIndex);
    if (end < 0) continue;
    const formLine = markup.slice(0, m.index).split('\n').length;
    const ownOnSubmit = /\bonsubmit\s*=/i.test(attrs);
    const cancelInline = /preventDefault|return\s+false/i.test(attrs);
    for (const b of markup.slice(formRe.lastIndex, end).matchAll(/<button\b([^>]*)>/gi)) {
      const battrs = b[1];
      const type = (/(?<![\w-])type\s*=\s*["']?([a-z]+)/i.exec(battrs) || [])[1];
      if (type && type.toLowerCase() !== 'submit') continue;      // type="button"/"reset"
      if (ownOnSubmit && cancelInline) continue;                  // the form owns it
      if (!ownOnSubmit && handlesSubmit(source)) continue;         // the card owns it
      const line = markup.slice(0, formRe.lastIndex + b.index).split('\n').length;
      findings.push({
        file: rel,
        line,
        formLine,
        button: (battrs.match(/id\s*=\s*["']([^"']+)/i) || [])[1] || '(no id)',
        type: type ? type.toLowerCase() : '(none)',
        detail: `<button${type ? ` type="${type}"` : ''}> inside the <form> on line ` +
                `${formLine} submits it: the click runs, the browser navigates to the ` +
                `tool's own URL, and the result is gone. Give it type="button", or ` +
                `have the form cancel the submit (onsubmit="event.preventDefault()").`,
        severity: 'FAIL',
      });
    }
  }
  return findings;
}

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const CHANGED = args.includes('--changed');
const JSON_OUT = args.includes('--json');

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
  files = fs.readdirSync(CARDS).filter((f) => f.endsWith('.html')).sort().map((f) => `cards/${f}`);
} else if (CHANGED) {
  files = changedCards();
} else {
  files = args.filter((a) => !a.startsWith('--'));
}
if (!files.length) {
  if (CHANGED) { console.log('no cards changed vs HEAD — nothing to check'); process.exit(0); }
  console.error('usage: node scripts/check-form-buttons.js --all | --changed | cards/x.html [...] [--json]');
  process.exit(2);
}

const findings = [];
for (const f of files) findings.push(...checkCard(f));
const scope = ALL ? `${files.length} card(s)` : files.length === 1 ? files[0] : `${files.length} card(s)`;

if (JSON_OUT) {
  console.log(JSON.stringify({ scope, findings }, null, 2));
} else if (!findings.length) {
  console.log(`\n${scope}: no button submits the form it sits in\n`);
} else {
  console.log('');
  for (const f of findings) console.log(`  FAIL ${f.file}:${f.line}: ${f.button} — ${f.detail}`);
  console.log(`\n${findings.length} button(s) in ${scope} would submit (and therefore reload) the tool.\n`);
}

process.exit(findings.length ? 1 : 0);
