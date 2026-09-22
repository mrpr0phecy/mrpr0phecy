#!/usr/bin/env node
/**
 * handler-check.js — find controls whose inline handler cannot run.
 *
 *   node scripts/handler-check.js cards/some-tool.html [more cards...]
 *   node scripts/handler-check.js --changed   # cards touched vs HEAD (fast)
 *   node scripts/handler-check.js --all
 *
 * Why this exists next to test-card.js. That harness clicks every control it
 * finds in the mounted container, which is the right test — a click is what a
 * visitor does. It cannot see a handler that only appears once the card has
 * generated markup: a row built by a template, a panel rendered after a fetch,
 * a map region drawn on demand. If the name in that generated `onclick` is not
 * in scope, the visitor gets a dead button and the sweep sees a clean card.
 *
 * So this reads the source instead of the DOM. Every `on*="…"` attribute in the
 * file — static or inside a template literal — is parsed for the functions it
 * calls, and each name is then looked up in the window `test-card.js` mounts,
 * which is the scope an inline handler really runs in. A name that is missing
 * there is a button that throws ReferenceError when pressed:
 *
 *   FAIL cards/x.html: slrmvToggleHeat() — 2 handlers; not in window scope
 *
 * Scope, not existence, is the question. `evolution-walker` defines its seven
 * controls inside an IIFE, which is fine for a listener and fatal for an inline
 * attribute: the function exists, the button is still dead.
 *
 * Names are extracted conservatively — string literals, comments and property
 * access are stripped first — because a false positive here costs a maintainer
 * the same as a false negative: the check stops being read. `--json` lists
 * every handler inspected so a disagreement can be settled from the output.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
// Same resolution order as test-card.js: the shared scratch install first (the
// repo itself carries no node_modules), then whatever node can find.
let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('/tmp/tenv/node_modules/jsdom'));
} catch (_) {
  try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) {
    console.error('jsdom not found. Install with: mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom');
    process.exit(2);
  }
}

const ROOT = path.join(__dirname, '..');
const CARDS = path.join(ROOT, 'cards');

/**
 * Cards modified, staged or newly added against HEAD — the same set
 * check-card-js.py guards, so "the changed cards" means one thing across the
 * gate. A new card that has not been `git add`ed yet must still be checked, or
 * the newest code in the repository is the least covered.
 */
function changedCards() {
  const run = args => {
    try {
      return require('child_process').execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
    } catch (e) { return ''; }
  };
  const names = new Set();
  for (const line of [
    ...run(['diff', '--name-only', 'HEAD', '--', 'cards/']).split('\n'),
    ...run(['diff', '--name-only', '--cached', '--', 'cards/']).split('\n'),
    ...run(['ls-files', '--others', '--exclude-standard', '--', 'cards/']).split('\n'),
  ]) {
    const name = line.trim();
    if (name.endsWith('.html')) names.add(name);
  }
  return [...names].sort();
}

// Keywords that look like a call but are syntax. `if (` / `for (` / `while (`
// and friends are followed by a paren just like a call is.
const NOT_CALLS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'instancof',
  'new', 'do', 'else', 'await', 'delete', 'void', 'in', 'of', 'yield', 'function',
  'throw', 'case', 'super', 'this', 'async', 'instanceof',
]);

/** One `on*="…"` value, with the escapes a template literal left behind undone. */
function decodeAttribute(raw) {
  return raw
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\`/g, '`')
    .replace(/\\\\/g, '\\')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Every handler attribute in the file with its 1-based line, whether it is
 * static markup or generated inside a template literal. The attribute is
 * matched as text rather than through the DOM: a card that builds rows in a
 * template has no such attribute in its document until the rows exist, and
 * those are exactly the handlers this script is for.
 */
function handlers(source) {
  const found = [];
  const re = /\bon[a-z]{3,}\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(source))) {
    const value = m[2] !== undefined ? m[2] : m[3];
    const line = source.slice(0, m.index).split('\n').length;
    found.push({ name: m[0].split('=')[0].trim(), value: decodeAttribute(value), line });
  }
  return found;
}

/**
 * Names a fragment of code declares in its own scope: `var fmt = function (n)
 * {…}` inside a handler is already local to that handler, and flagging it would
 * be a false positive — the bug this check is for is the opposite case.
 */
function declaredIn(code) {
  const names = new Set();
  const re = /\b(?:var|let|const|function|class)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(code))) names.add(m[1]);
  // A parameter list on an inline handler's own function expression.
  const fn = /function\s*(?:[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g;
  while ((m = fn.exec(code))) {
    for (const param of m[1].split(',')) {
      const name = param.trim().split(/[\s=]/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

/**
 * Names a card's own <script> blocks put in global scope, which is what an
 * inline attribute runs in. Depth matters: a function declared inside an IIFE
 * is not reachable from markup, however present it looks in the source — that
 * is the exact shape of the evolution-walker bug this script exists to catch.
 */
function globalNames(blocks) {
  const names = new Set();
  for (const block of blocks) {
    let depth = 0, i = 0;
    const code = stripLiterals(block);
    while (i < code.length) {
      const c = code[i];
      if (c === '(' || c === '[' || c === '{') { depth += 1; i += 1; continue; }
      if (c === ')' || c === ']' || c === '}') { depth -= 1; i += 1; continue; }
      if (depth === 0) {
        const m = /^(?:var|let|const|function|class)\s+([A-Za-z_$][\w$]*)/.exec(code.slice(i));
        if (m) { names.add(m[1]); i += m[0].length; continue; }
        // `window.showToast = …` and `window['x'] = …` publish at any depth.
      }
      i += 1;
    }
    const re = /window(?:\s*\.\s*([A-Za-z_$][\w$]*)|\s*\[\s*['"]([^'"]+)['"]\s*\])\s*=/g;
    let m;
    while ((m = re.exec(block))) names.add(m[1] || m[2]);
  }
  return names;
}

/** Strip strings and comments so `'scale(1.3)'` is not read as a call. */
function stripLiterals(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < n) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === quote) break;
        i += 1;
      }
      i += 1;
      out += ' ';
      continue;
    }
    if (c === '/' && code[i + 1] === '/') {
      while (i < n && code[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** The bare names this handler calls: `foo(` but neither `x.foo(` nor `fooBar(`. */
function calledNames(handler) {
  const code = stripLiterals(handler.value);
  const names = new Set();
  const re = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    const name = m[2];
    if (!NOT_CALLS.has(name)) names.add(name);
  }
  return names;
}

/**
 * Top-level names from the page that hosts every fragment. Read once: a card
 * that calls one of these is fine, so without it this check would report the
 * host's helpers as dead on every card that uses them.
 */
const hostGlobals = (() => {
  const names = new Set();
  for (const page of ['tool.html']) {
    const file = path.join(ROOT, page);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const blocks = (src.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g) || [])
      .map(b => b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
    for (const n of globalNames(blocks)) names.add(n);
  }
  return names;
})();

function loadCard(rel) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // A fragment has no <html>/<body>; wrap it the way tool.html's shell does so
  // jsdom's parser treats the markup as content rather than a stray fragment.
  const shell = '<!doctype html><html><head></head><body><div id="toolbox-grid"></div></body></html>';
  const virtualConsole = new VirtualConsole();  // card chatter is not this script's output
  const dom = new JSDOM(shell, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
    url: 'https://www.themostusefulsiteintheworld.com/tool.html',
    beforeParse(w) {
      w.alert = () => {};
      w.prompt = () => null;
      w.confirm = () => true;
      w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.fetch = () => new Promise(() => {});
      w.HTMLCanvasElement.prototype.getContext = function () {
        const noop = () => {};
        const grad = { addColorStop: noop };
        return new Proxy({ canvas: this, measureText: () => ({ width: 10 }),
          createLinearGradient: () => grad, createRadialGradient: () => grad,
          getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: noop }, { get: (t, k) => (k in t ? t[k] : noop), set: () => true });
      };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
      w.URL.createObjectURL = () => 'blob:stub';
      w.URL.revokeObjectURL = () => {};
    },
  });
  const w = dom.window;
  // Same three steps as the harness: take the scripts out, insert the markup,
  // run the scripts in the window's own scope.
  const parsed = new w.DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(parsed.querySelectorAll('script'));
  scripts.forEach(s => s.remove());
  const container = w.document.createElement('div');
  w.document.getElementById('toolbox-grid').appendChild(container);
  container.innerHTML = parsed.body.innerHTML;
  const context = dom.getInternalVMContext();
  for (const s of scripts) {
    try { new vm.Script(s.textContent).runInContext(context); } catch (e) { /* mount errors are test-card.js's business */ }
  }
  try { w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true })); } catch (e) {}
  return { w, dom };
}

function checkCard(rel, report) {
  const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const found = handlers(source);
  if (!found.length) return { handlers: 0, missing: [] };
  const blocks = (source.match(/<script[^>]*>([\s\S]*?)<\/script>/g) || [])
    .map(b => b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
  // A card is never served on its own: embed.html and tools-index.html both
  // hand the fragment to tool.html, whose own script defines the few helpers a
  // card may call (showContributionsPanel). Those names are in scope in the
  // browser even though they are not in this file.
  const cardGlobals = globalNames(blocks);
  for (const n of hostGlobals) cardGlobals.add(n);
  const callsPerHandler = found.map(h => ({ h, names: calledNames(h), local: declaredIn(h.value) }));
  const all = new Set();
  for (const { names } of callsPerHandler) for (const n of names) all.add(n);
  if (!all.size) return { handlers: found.length, missing: [] };

  const { w, dom } = loadCard(rel);
  const missing = [];
  for (const name of all) {
    // A handler that calls a name it declared itself is fine, so only the
    // handlers that do NOT declare it count against the card.
    const callers = callsPerHandler.filter(c => c.names.has(name) && !c.local.has(name));
    if (!callers.length) continue;
    if (cardGlobals.has(name)) continue;
    let type;
    try {
      // eslint-disable-next-line no-eval
      type = w.eval(`typeof ${name}`);
    } catch (e) {
      type = 'throws';
    }
    if (type !== 'function') {
      const where = callers.map(c => `${c.h.name}@${c.h.line}`);
      missing.push({ name, type, where });
    }
  }
  dom.window.close();
  if (report === 'json') {
    return { handlers: found.length, calls: [...all].sort(), missing };
  }
  for (const m of missing) {
    console.log(`  FAIL ${rel}: ${m.name}() — ${m.where.length} handler${m.where.length === 1 ? '' : 's'} ` +
                `(${m.where.slice(0, 3).join(', ')}${m.where.length > 3 ? ', …' : ''}) but it is ` +
                `${m.type === 'undefined' ? 'not in window scope' : m.type} — pressing it throws`);
  }
  return { handlers: found.length, missing };
}

function main() {
  const args = process.argv.slice(2);
  const JSON_OUT = args.includes('--json');
  const ALL = args.includes('--all');
  const CHANGED = args.includes('--changed');
  let files = args.filter(a => !a.startsWith('--'));
  if (CHANGED) {
    files = changedCards();
    if (!files.length) {
      console.log('no cards changed vs HEAD — nothing to check');
      process.exit(0);
    }
    console.log(`checking ${files.length} card(s) changed vs HEAD`);
  }
  if (ALL) {
    files = fs.readdirSync(CARDS).filter(f => f.endsWith('.html')).sort().map(f => `cards/${f}`);
  }
  if (!files.length) {
    console.error('usage: node scripts/handler-check.js cards/x.html [more] | --changed | --all [--json]');
    process.exit(2);
  }
  let cards = 0, handlersSeen = 0, failed = 0;
  const payload = {};
  for (const rel of files) {
    cards += 1;
    let result;
    try {
      result = checkCard(rel, JSON_OUT ? 'json' : 'text');
    } catch (e) {
      console.log(`  FAIL ${rel}: could not be checked — ${e.message}`);
      failed += 1;
      continue;
    }
    handlersSeen += result.handlers;
    if (result.missing.length) failed += 1;
    if (JSON_OUT) payload[rel] = result;
  }
  if (JSON_OUT) {
    fs.writeFileSync(path.join(ROOT, 'handler-check.json'), JSON.stringify(payload, null, 2));
    console.log(`read ${handlersSeen} handler(s) in ${cards} card(s); wrote handler-check.json`);
  } else {
    console.log(`\n${cards} card(s), ${handlersSeen} inline handler(s): ` +
                (failed ? `${failed} card(s) with an unreachable handler` : 'every handler resolves'));
  }
  process.exit(failed ? 1 : 0);
}

main();
