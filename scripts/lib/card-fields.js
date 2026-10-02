#!/usr/bin/env node
/**
 * card-fields.js — read a card's *addressable surface*: the controls a link can
 * fill in, and the elements that carry an answer out.
 *
 * Why this exists
 * ---------------
 * Filled links (`tool.html?card=bmi&bmi-height=180&bmi-weight=75`) work because
 * a card's control ids are stable and unique across the catalogue. Three
 * generators depend on that being true and on *agreeing* about what a card
 * exposes:
 *
 *   - scripts/build-tool-specs.js   — the per-tool machine spec agents read
 *   - scripts/build-jobs.js         — curated multi-step jobs (validate every
 *                                     field a job fills and every element it
 *                                     reads a number out of)
 *   - scripts/build-intents.js      — the home page's plain-English solver
 *
 * Each of those used to be a place where "the card has an input called X" was
 * assumed and never checked. This module is the single answer, so a card edit
 * that renames a control fails the build in one place rather than silently
 * producing a link that loads a blank field.
 *
 * Parsing rules
 * -------------
 * Dependency-free and regex-based (generators run on stock Node). Script and
 * style bodies are stripped first: a card that builds markup inside a JS
 * template string exposes nothing addressable, because nothing exists until a
 * click, and claiming otherwise would produce links that fill in nothing.
 *
 * Labels come from a real `<label for=…>`, an ancestor label, `aria-label` or
 * the nearest text node in the control's own line — never from the id's
 * prefix alone, which is how the old inference produced specs labelled
 * "sg3 sl a".
 *
 * Usage
 *   const { readCard, readCards } = require('./lib/card-fields.js');
 *   readCard('cards/bmi.html')   // -> { slug, fields, outputs, values }
 *
 *   node scripts/lib/card-fields.js cards/bmi.html      # human-readable dump
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

// Controls a link may fill. `image`/`button`/`submit`/`reset`/`file`/`password`
// are excluded on purpose: none has a value a URL should carry, and a file
// input cannot be set from script at all.
const FILLABLE_TYPES = new Set([
  'text', 'search', 'url', 'tel', 'email', 'number', 'range', 'date', 'time',
  'datetime-local', 'month', 'week', 'color', 'checkbox', 'radio',
  'select', 'select-one', 'select-multiple', 'textarea'
]);
const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'file', 'image', 'password']);

// Does this card carry a control that a linked `&run=1` could press? The rule
// lives here because three places must agree on it: jobs.json (`runs` per
// step), the per-tool specs (`runs` per tool) and — pinned by
// scripts/tests/jobs.test.js — the engine in tool.html.
const RUN_VERB_RE = /^[^a-zA-Z]*(calculate|compute|work out|convert|update|solve|run|go|recalculate)\b/i;
const RUN_BLOCK_RE = /download|print|save|export|reset|clear|delete|remove|share|copy|email|pdf|csv|upload|record|stop|cancel/i;
const FORM_RE = /<form\b[^>]*onsubmit\s*=\s*["']([^"']*)["']/gi;
const BUTTON_RE = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;

// Does a form's own `onsubmit` actually do anything? Every card carries
// `onsubmit="event.preventDefault();"` as a navigation guard (733 of them), and
// treating that guard as "the card handles its own submit" made the engine
// dispatch a submit that provably does nothing — then stop, never reaching the
// real Calculate button underneath. The mortgage card's totals stayed at "–"
// because of exactly that. A form counts only when its handler does something
// beyond cancelling the event.
function formHandlesSubmit(html) {
  FORM_RE.lastIndex = 0;
  let m;
  while ((m = FORM_RE.exec(html))) {
    const body = m[1];
    if (!/preventdefault/i.test(body)) continue;
    const rest = body
      .replace(/[^;]*preventdefault\(\)\s*;?/gi, '')
      .replace(/return\s+(false|!1)\s*;?/gi, '')
      .replace(/^[\s;]+|[\s;]+$/g, '');
    if (rest) return true;
  }
  return false;
}

function hasRunTrigger(html) {
  if (formHandlesSubmit(html)) return true;
  let m;
  BUTTON_RE.lastIndex = 0;
  while ((m = BUTTON_RE.exec(html))) {
    const text = m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 40) continue;
    if (RUN_BLOCK_RE.test(text) || !RUN_VERB_RE.test(text)) continue;
    return true;
  }
  return false;
}

// An id that reads as "the answer". Used only as a *hint* — the jobs data
// names its own outputs and the build validates each one exists.
const OUTPUT_ID_RE = /(?:^|-)(out|output|result|results|answer|value|total|amount|score|readout|display|summary)$/i;

function stripCode(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function attrs(tag) {
  const out = Object.create(null);
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(tag))) {
    const name = m[1].toLowerCase();
    // Skip the tag name itself (the regex matches it as a bare word).
    if (m[2] === undefined && ['input', 'select', 'textarea', 'label', 'option'].includes(name)) continue;
    out[name] = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : (m[5] !== undefined ? m[5] : ''));
  }
  return out;
}

function textOf(html) {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// "📏 Height (cm)" -> { label: "Height", unit: "cm" }
function splitLabel(raw) {
  let s = textOf(raw)
    // A leading emoji is the site's visual key, not part of the name.
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '')
    .replace(/\s*[*:]+$/, '')
    .trim();
  let unit = '';
  const paren = s.match(/^(.*?)\s*[（(]\s*([^()（）]{1,12})\s*[)）]\s*$/);
  if (paren) {
    s = paren[1].trim();
    unit = paren[2].trim();
    if (/^(required|optional|e\.g\.|eg|default|leave blank|mm\/dd)$/i.test(unit)) unit = '';
  }
  return { label: s, unit };
}

function slugFromPath(file) {
  return path.basename(file).replace(/\.html$/, '');
}

/**
 * Read one card fragment.
 * @param {string} file path (absolute, or relative to the repo root)
 * @returns {{slug:string, file:string, fields:Array, outputs:Array, values:Object}}
 */
function readCard(file) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const html = stripCode(fs.readFileSync(abs, 'utf8'));
  const slug = slugFromPath(abs);

  // ---- labels: <label for="x">Text</label> and <label>…<input id="x">…</label>
  const labelById = Object.create(null);
  const labelRe = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
  let m;
  while ((m = labelRe.exec(html))) {
    const a = attrs('label ' + m[1]);
    const { label, unit } = splitLabel(m[2]);
    if (!label) continue;
    if (a.for) labelById[a.for] = { label, unit };
    const inner = m[2].match(/id\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
    if (inner) {
      const id = inner[2] !== undefined ? inner[2] : (inner[3] !== undefined ? inner[3] : inner[4]);
      if (id && !labelById[id]) labelById[id] = { label, unit };
    }
  }

  const fields = [];
  const seen = new Set();

  function pushField(a, tag, type, options, extra) {
    const id = a.id;
    if (!id || seen.has(id) || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) return;
    if (a.disabled !== undefined || a['aria-hidden'] === 'true') return;
    if (SKIP_TYPES.has(type)) return;
    seen.add(id);
    const named = labelById[id] || null;
    const aria = a['aria-label'] ? splitLabel(a['aria-label']) : null;
    const derived = id.replace(/^[a-z0-9]{1,6}-/i, '').replace(/[-_]+/g, ' ').trim();
    const label = (named && named.label) || (aria && aria.label) || a.placeholder || derived || id;
    const unit = (named && named.unit) || (aria && aria.unit) || '';
    const field = {
      id,
      tag,
      type,
      label,
      unit,
      default: extra && extra.default !== undefined ? extra.default : (a.value !== undefined ? a.value : undefined),
      required: a.required !== undefined,
      min: a.min !== undefined && a.min !== '' ? Number(a.min) : undefined,
      max: a.max !== undefined && a.max !== '' ? Number(a.max) : undefined,
      step: a.step !== undefined && a.step !== '' && a.step !== 'any' ? Number(a.step) : undefined
    };
    if (options && options.length) field.options = options;
    if (extra) Object.assign(field, extra);
    Object.keys(field).forEach(k => field[k] === undefined && delete field[k]);
    fields.push(field);
  }

  // ---- <input>
  const inputRe = /<input\b([^>]*)>/gi;
  while ((m = inputRe.exec(html))) {
    const a = attrs('input ' + m[1]);
    const type = (a.type || 'text').toLowerCase();
    if (type === 'radio' && !a.value) continue;      // unaddressable by value below
    const extra = (type === 'checkbox' || type === 'radio')
      ? { default: a.checked !== undefined ? '1' : '0' }
      : null;
    pushField(a, 'input', type, null, extra);
  }

  // ---- <textarea>
  const taRe = /<textarea\b([^>]*)>/gi;
  while ((m = taRe.exec(html))) {
    const a = attrs('textarea ' + m[1]);
    pushField(a, 'textarea', 'textarea');
  }

  // ---- <select> (option values, in document order)
  const selRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  while ((m = selRe.exec(html))) {
    const a = attrs('select ' + m[1]);
    const options = [];
    const optRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let om;
    while ((om = optRe.exec(m[2]))) {
      const oa = attrs('option ' + om[1]);
      const value = oa.value !== undefined ? oa.value : textOf(om[2]);
      if (value === '') continue;
      options.push(value);
    }
    const selected = m[2].match(/<option\b[^>]*\bselected\b[^>]*>/i);
    const selectedValue = selected
      ? (attrs('option ' + selected[0]).value !== undefined
          ? attrs('option ' + selected[0]).value
          : '')
      : options[0];
    pushField(a, 'select', a.multiple !== undefined ? 'select-multiple' : 'select-one', options,
      { default: selectedValue });
  }

  // ---- outputs: a hint list the job builder validates against.
  // `kind` records *how* the element was found, because the two read
  // differently: an `aria-live` region announces itself to assistive tech, so
  // its text is the answer a visitor would hear.
  const outputs = [];
  const seenOutput = new Set();
  const idRe = /\bid\s*=\s*("([^"]*)"|'([^']*)')(?=[^>]*aria-live)/gi;
  while ((m = idRe.exec(html))) {
    const id = m[2] !== undefined ? m[2] : m[3];
    if (id && !seenOutput.has(id)) { seenOutput.add(id); outputs.push({ id, kind: 'live' }); }
  }
  const allIdRe = /\bid\s*=\s*("([^"]*)"|'([^']*)')/gi;
  while ((m = allIdRe.exec(html))) {
    const id = m[2] !== undefined ? m[2] : m[3];
    if (!id || seen.has(id) || seenOutput.has(id)) continue;
    if (OUTPUT_ID_RE.test(id)) { seenOutput.add(id); outputs.push({ id, kind: 'output' }); }
  }

  return { slug, file: abs, fields, outputs };
}

/** Read every `cards/*.html` (sparse-checkout safe: whatever is on disk). */
function readCards(dir) {
  const cardDir = dir || path.join(ROOT, 'cards');
  return fs.readdirSync(cardDir)
    .filter(f => f.endsWith('.html'))
    .sort()
    .map(f => readCard(path.join(cardDir, f)));
}

module.exports = { readCard, readCards, hasRunTrigger, formHandlesSubmit, FILLABLE_TYPES, OUTPUT_ID_RE, RUN_VERB_RE, RUN_BLOCK_RE };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('usage: node scripts/lib/card-fields.js <cards/slug.html> [slug…]');
    process.exit(2);
  }
  for (const target of args) {
    const file = target.includes(path.sep) || target.endsWith('.html') ? target : path.join('cards', target + '.html');
    const card = readCard(file);
    console.log(`\n${card.slug}  —  ${card.fields.length} fillable, ${card.outputs.length} output-ish`);
    for (const f of card.fields) {
      const bits = [f.type.padEnd(14), f.id.padEnd(30), f.label + (f.unit ? ` [${f.unit}]` : '')];
      if (f.options) bits.push(`options=${f.options.slice(0, 8).join('|')}${f.options.length > 8 ? '…' : ''}`);
      if (f.min !== undefined || f.max !== undefined) bits.push(`range=${f.min}..${f.max}`);
      console.log('  ' + bits.join(' '));
    }
    if (card.outputs.length) console.log('  outputs: ' + card.outputs.join(', '));
  }
}
