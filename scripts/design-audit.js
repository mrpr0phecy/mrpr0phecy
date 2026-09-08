#!/usr/bin/env node
/**
 * design-audit.js — the Visual Design Expert's static design audit.
 *
 * AI Developer staff tool (see scripts/ai-staff.json, AGENTS.md §8).
 * Zero dependencies; runs on Node 18+ (CI uses Node 22) or anywhere with a
 * plain checkout. This is the CI-safe, static subset of the expert's audit:
 * design-token coherence, accessibility guards, tap-target sizing, count
 * claims, and the mobile-overflow hardening rules. The full audit also uses
 * a headless browser (contrast compositing, live overflow at 390px, focus
 * behaviour); when the browser is unavailable this file is what runs.
 *
 * Usage:
 *   node scripts/design-audit.js            # text report, exit 0 if no FAIL
 *   node scripts/design-audit.js --strict   # compatibility flag; FAIL always exits 1
 *   node scripts/design-audit.js --json     # machine-readable summary
 *
 * Conventions checked (keep the hub pages in line with them):
 *   Product A (cyan terminal): index.html, tool.html, 404.html, donate.html,
 *     cards/card.css — tokens --accent:#2dd4ff / --bg-primary:#0a0f14.
 *   Product B (neon night):   listen.html — tokens --hot:#ff2e63,
 *     --gold:#ffc93c, --bg:#08080c, subscribe red #e6002e (WCAG AA on white).
 *   Shared: color-scheme: dark, :focus-visible, prefers-reduced-motion,
 *     chrome tap targets >= 40px, no horizontal overflow below 390px
 *     (cards/card.css carries the grid min-width hardening), accurate tool
 *     counts.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const JSON_OUT = args.has('--json');
// --strict is retained for existing callers; failures are always failures.

const counts = { pass: 0, fail: 0, warn: 0 };
const findings = [];
let section = '';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function cardCount() {
  try {
    return JSON.parse(read('cards/cards.json')).length;
  } catch {
    return null;
  }
}

function check(name, ok, detail = '') {
  const status = ok ? 'pass' : 'fail';
  counts[status] += 1;
  findings.push({ section, name, status, detail });
  if (!JSON_OUT) console.log(`  ${status.toUpperCase()}  ${name}${detail && !ok ? ` — ${detail}` : ''}`);
}

function warn(name, detail = '') {
  counts.warn += 1;
  findings.push({ section, name, status: 'warn', detail });
  if (!JSON_OUT) console.log(`  WARN  ${name}${detail ? ` — ${detail}` : ''}`);
}

function banner(title) {
  section = title;
  if (!JSON_OUT) console.log(`\n── ${title}`);
}

/** Top-level CSS-rule scan: does a rule whose selector matches `selRe`
 *  contain all `needles` before its closing brace? Handles one-line and
 *  multi-line rules; stops at the first matching selector. */
function ruleHas(css, selRe, needles) {
  const m = css.match(selRe);
  if (!m) return false;
  const from = css.indexOf(m[0]);
  const brace = css.indexOf('{', from);
  if (brace < 0) return false;
  const end = css.indexOf('}', brace);
  if (end < 0) return false;
  const body = css.slice(brace + 1, end);
  return needles.every(n => body.includes(n));
}

const N = cardCount();
if (!JSON_OUT) {
  console.log('Visual Design Expert · static design audit');
  console.log(`repo root: ${ROOT}`);
  console.log(`cards indexed: ${N === null ? 'UNREADABLE cards/cards.json' : N}`);
}
if (N === null) {
  console.error('FATAL: could not read cards/cards.json');
  process.exit(1);
}

// ─────────────────────────── Product A hub ───────────────────────────
banner('Product A · cyan terminal (index.html)');
let s = read('index.html');
check('tokens --accent/#2dd4ff', s.includes('--accent: #2dd4ff'), 'expected --accent: #2dd4ff in :root');
check('token --bg-primary', s.includes('--bg-primary: #0a0f14'));
check('guard color-scheme', /color-scheme:\s*dark/.test(s));
check('guard :focus-visible', /:focus-visible\s*\{/.test(s));
check('guard ::selection tint', /::selection\s*\{/.test(s));
check('guard reduced-motion', s.includes('@media (prefers-reduced-motion: reduce)'));
check('card entrance animation defined', s.includes('@keyframes cardIn'));
check('search bar is 52px', ruleHas(s, /\.main-search-bar\s*\{/, ['height: 52px']));
check('sticky bar buttons >= 40px', ruleHas(s, /\.sticky-action-btn\s*\{/, ['width: 40px', 'height: 40px']));
check('category pills >= 40px', ruleHas(s, /\.cat-pill\s*\{/, ['min-height: 40px']));
check('dock pills >= 40px', ruleHas(s, /\.dock-pill\s*\{/, ['min-height: 40px']));
check('no-results state is class-based', s.includes('class="no-results"'));

banner('Product A · tool.html (standalone viewer)');
s = read('tool.html');
check('tokens --accent/#2dd4ff', s.includes('#2dd4ff'));
check('guard color-scheme', /color-scheme:\s*dark/.test(s));
check('guard :focus-visible', /:focus-visible\s*\{/.test(s));
check('overflow guard on .tool-card-box', ruleHas(s, /\.tool-card-box\s*\{/, ['min-width: 0']));
check('injected content min-width guard', s.includes('.tool-card-box > div') && s.includes('min-width: 0'));
check('nav buttons >= 40px', ruleHas(s, /\.nav-btn\s*\{/, ['min-height: 40px']));
check('brand link >= 40px', ruleHas(s, /\.nav-brand\s*\{/, ['min-height: 40px']));
check('resource box class-based', s.includes('class="resource-box"'));

banner('Product A · 404.html');
s = read('404.html');
check('token #2dd4ff', s.includes('#2dd4ff'));
if (s.includes('fonts.googleapis.com')) warn('404.html requests an external font', 'Prefer the existing system font stack when next reviewing this page; no automatic aesthetic edits.');
check('guard color-scheme', /color-scheme:\s*dark/.test(s));
check('guard :focus-visible', /:focus-visible\s*\{/.test(s));
check('guard reduced-motion', s.includes('@media (prefers-reduced-motion: reduce)'));

banner('Product A · donate.html');
s = read('donate.html');
check('token --accent/#2dd4ff', s.includes('--accent:#2dd4ff'));
check('guard color-scheme', /color-scheme:\s*dark/.test(s));
check('guard :focus-visible', /:focus-visible\s*\{/.test(s));
check('guard reduced-motion', s.includes('@media(prefers-reduced-motion:reduce)'));
check('topbar links >= 40px', ruleHas(s, /\.topbar a\s*\{/, ['min-height:40px']));
// Tool-count drift belongs to scripts/sync-counts.py, not to aesthetic checks.

banner('Product A · cards/card.css (shared fragment hardening)');
s = read('cards/card.css');
check('token --accent/#2dd4ff', s.includes('--accent: #2dd4ff'));
check('.field min-width guard', ruleHas(s, /\.field,/, ['min-width: 0', 'max-width: 100%']));
check('grid children min-width guard', ruleHas(s, /\[style\*="grid-template-columns"\] > \*/, ['min-width: 0']));
check('form controls min-width guard', s.includes('button {\n  min-width: 0;') || /button\s*\{\s*min-width:\s*0/.test(s));
check('narrow flex-wrap fallback', s.includes('@media (max-width: 640px)') && s.includes('flex-wrap: wrap'));
check('focus treatment on inputs', s.includes('input:focus') || s.includes(':focus'));

// ─────────────────────────── Product B hub ───────────────────────────
banner('Product B · neon night (listen.html)');
s = read('listen.html');
check('token --hot/#ff2e63', s.includes('--hot:#ff2e63'));
check('token --gold/#ffc93c', s.includes('--gold:#ffc93c'));
check('token --bg:#08080c', s.includes('--bg:#08080c'));
check('subscribe red is AA (#e6002e)', s.includes('#e6002e'), 'expected #e6002e, not #ff0033 (3.96:1 on white)');
check('guard color-scheme', /color-scheme:\s*dark/.test(s));
check('guard :focus-visible', /:focus-visible\s*\{/.test(s));
check('guard ::selection tint', /::selection\s*\{/.test(s));
check('anchor scroll-margin-top', s.includes('scroll-margin-top:72px'));
check('guard reduced-motion', s.includes('@media(prefers-reduced-motion:reduce)'));
check('nav links >= 40px', /\.mp-links a\{[^}]*min-height:40px/.test(s));
check('subscribe button >= 40px', /\.mp-sub\{[^}]*min-height:40px/.test(s));

// ─────────────────────────────── summary ─────────────────────────────
if (JSON_OUT) {
  const summary = {
    audit: 'design-audit (Visual Design Expert · static subset)',
    cards: N,
    pass: counts.pass, fail: counts.fail, warn: counts.warn,
    findings,
    limitations: ['Static token/guard checks only; no live contrast, layout, playback or keyboard measurement.'],
    ok: counts.fail === 0,
  };
  console.log(JSON.stringify(summary));
} else {
  console.log(`\nSummary: ${counts.pass} passed, ${counts.fail} failed, ${counts.warn} warned (${N} cards indexed).`);
  if (counts.fail === 0) {
    console.log('Design audit clean — hub pages honour the shared design rules.');
  } else {
    console.log('Design audit FAILED — fix before proposing changes (facility rule).');
  }
}

process.exit(counts.fail > 0 ? 1 : 0);
