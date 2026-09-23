#!/usr/bin/env node
/**
 * fix-label-for.js — associate a label that is already sitting beside its field.
 *
 * The biggest accessibility backlog in this catalogue is not a missing label,
 * it is a label nobody is connected to:
 *
 *     <div><label style="font-size:0.68rem;">Due date</label><input id="irs-due" …>
 *
 * The text is on screen and reads fine to anyone looking at it. A screen reader
 * announces "date field" and moves on, because a <label> only names a control
 * when they are associated — either by `for=` on the label, or by the control
 * being inside the label. 213 fields in 69 cards are this exact shape.
 *
 * The fix is additive and has no layout to break: put `for="…"` on the label it
 * already sits on, pointing at the control that already has an id. Nothing else
 * about the card changes.
 *
 *   node scripts/fix-label-for.js                 # report, change nothing
 *   node scripts/fix-label-for.js --apply         # rewrite the cards it can fix
 *   node scripts/fix-label-for.js --apply --only cards/moving.html
 *
 * A card is only kept if scripts/test-card.js agrees: the harness counts the
 * fields with no accessible name in the mounted card, so --apply runs it before
 * and after and reverts the file unless the count goes down and nothing new
 * fails. A source-level rule can be wrong in ways the source cannot show (the
 * id is generated twice, the markup is a template that never renders); the
 * mounted card is the only thing that knows.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// One label immediately followed by one control, with nothing but whitespace
// between them. Attributes may hold `>` inside a quoted value (`title="a > b"`),
// so the tag ends at the first `>` that is not inside quotes.
const TAG = String.raw`<label\b((?:"[^"]*"|[^">])*)>([^<]{1,60})<\/label>(\s*)<(input|select|textarea)\b((?:"[^"]*"|[^">])*)>`;
const PAIR = new RegExp(TAG, 'g');

const idOf = attrs => {
  const m = /\bid="([^"]+)"/.exec(attrs);
  return m ? m[1] : '';
};
const hasName = attrs => /\b(aria-label|aria-labelledby|title)\s*=/.test(attrs);

/**
 * Add `for=` to every label that is only missing the association. Pure: the
 * same input always gives the same output, and the report says what moved.
 */
function associate(html) {
  const fixes = [];
  const once = new Map(); // id -> times seen, to refuse a duplicated id
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) once.set(m[1], (once.get(m[1]) || 0) + 1);

  const out = html.replace(PAIR, (whole, lattrs, text, gap, tag, cattrs) => {
    if (/\bfor\s*=/.test(lattrs)) return whole;          // already associated
    if (hasName(cattrs)) return whole;                   // named another way
    if (!text.trim()) return whole;                      // nothing to say
    const id = idOf(cattrs);
    if (!id) return whole;                               // no handle to point at
    if (once.get(id) > 1) return whole;                  // two of them: guessing is worse
    const label = `<label${lattrs} for="${id}">${text}</label>`;
    fixes.push({ id, text: text.trim().slice(0, 40) });
    return `${label}${gap}<${tag}${cattrs}>`;
  });
  return { html: out, fixes };
}

// --------------------------------------------------------------- harness probe
function namelessCount(file) {
  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'test-card.js'), file],
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    out = `${e.stdout || ''}${e.stderr || ''}`;
  }
  const m = /(\d+) field\(s\) with no accessible name/.exec(out);
  return {
    fields: m ? Number(m[1]) : 0,
    failed: /^ {2}FAIL /m.test(out),
    output: out,
  };
}

function cardsToScan(only) {
  if (only) return only;
  const files = [];
  const dir = path.join(ROOT, 'cards');
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.endsWith('.html')) files.push(`cards/${name}`);
  }
  return files;
}

function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx === -1 ? null : argv.slice(onlyIdx + 1);
  const wanted = cardsToScan(only);

  let scanned = 0, candidates = 0, applied = 0, reverted = 0, pairsAdded = 0;
  const revertedCards = [];

  for (const rel of wanted) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) { console.error(`  missing ${rel}`); continue; }
    const before = fs.readFileSync(abs, 'utf8');
    const { html, fixes } = associate(before);
    if (!fixes.length) continue;
    scanned += 1;
    candidates += fixes.length;

    if (!apply) {
      console.log(`  ${rel}: ${fixes.length} label(s) to associate — ${fixes.slice(0, 3).map(f => `"${f.text}" → #${f.id}`).join(', ')}${fixes.length > 3 ? ', …' : ''}`);
      continue;
    }

    const was = apply ? namelessCount(rel) : null;
    fs.writeFileSync(abs, html);
    const now = namelessCount(rel);
    const better = now.fields < was.fields && !now.failed;
    const same = now.fields === was.fields && !now.failed && !was.failed;

    if (better) {
      applied += 1;
      pairsAdded += fixes.length;
      console.log(`  ${rel}: ${was.fields} → ${now.fields} nameless field(s), ${fixes.length} association(s) added`);
    } else {
      // Put the file back exactly as it was: the harness is the judge, and it
      // just said this rewrite did not help (or broke something).
      fs.writeFileSync(abs, before);
      reverted += 1;
      revertedCards.push(rel);
      console.log(`  ${rel}: REVERTED — ${was.fields} → ${now.fields} nameless field(s)` +
                  `${now.failed ? ', and the card failed' : ''}, ${fixes.length} candidate(s)`);
    }
  }

  console.log('');
  if (!apply) {
    console.log(`${scanned} card(s) have ${candidates} label(s) sitting beside their field with no association. ` +
                `Re-run with --apply to fix them, keeping only the cards the harness agrees improve.`);
  } else {
    console.log(`${applied} card(s) improved by ${pairsAdded} association(s); ${reverted} reverted.`);
    if (revertedCards.length) console.log(`reverted: ${revertedCards.join(', ')}`);
  }
}

if (require.main === module) main();
module.exports = { associate };
