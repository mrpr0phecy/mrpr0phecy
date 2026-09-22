#!/usr/bin/env node
/**
 * sweep-cards.js — run the card harness over the whole catalogue, unattended.
 *
 *   node scripts/sweep-cards.js                    # every card, ~7 minutes
 *   node scripts/sweep-cards.js --strict           # exit 1 on a hang
 *   node scripts/sweep-cards.js -- --response      # also: does it respond?
 *
 * `test-card.js` mounts cards in one process, which is fast and is why it is
 * the harness. It also means one card can take the whole audit down: a
 * synchronous loop inside a card's own handler cannot be interrupted from
 * inside the process, so the run stops where the visitor's browser would have
 * stopped too — with nothing printed for the cards after it.
 *
 * That is not hypothetical. On 2026-09-22 `cards/quiz.html` froze the sweep at
 * card 875 of 1,250, for ten minutes of CPU, because its Clear button walked a
 * static `querySelectorAll` NodeList:
 *
 *     const options = container.querySelectorAll('.option-item');
 *     while (options.length > 2) options[options.length - 1].remove();
 *
 * `remove()` does not change `options.length`, so the loop removed the same
 * node for ever. A visitor who added a third option and pressed Clear lost the
 * tab. Nothing in the harness could say which card, because the process never
 * got another turn.
 *
 * So the catalogue sweep runs the harness in chunks, in child processes, with a
 * timeout. A chunk that finishes is printed and its cost is recorded. A chunk
 * that times out is NOT reported as a whole-chunk failure: it is split in half
 * and re-run, recursively, until the card that hangs is named on its own. The
 * rest of the chunk still runs, so one bad card costs one card.
 *
 * Flags after `--` are passed straight to test-card.js (--response, --leftovers,
 * --strict-response). Everything else is this script's:
 *
 *   --chunk N        cards per child process (default 40)
 *   --timeout S      seconds a chunk may take (default 90)
 *   --jobs N         chunks in parallel (default 2)
 *   --only PATTERN   run only cards whose path matches (repeatable)
 *   --json FILE      write the per-card verdicts to FILE
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(__dirname, 'test-card.js');

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const CHUNK = Number(flag('--chunk', 40));
const TIMEOUT_MS = Number(flag('--timeout', 90)) * 1000;
const JOBS = Number(flag('--jobs', 2));
const ONLY = process.argv.reduce((acc, a, i) =>
  (a === '--only' && process.argv[i + 1] ? acc.concat(process.argv[i + 1]) : acc), []);
const JSON_OUT = flag('--json', null);
const STRICT = process.argv.includes('--strict');
const PASSTHROUGH = (() => {
  const at = process.argv.indexOf('--');
  return at < 0 ? [] : process.argv.slice(at + 1);
})();

const allCards = fs.readdirSync(path.join(ROOT, 'cards'))
  .filter(f => f.endsWith('.html'))
  .sort()
  .map(f => path.join('cards', f))
  .filter(p => !ONLY.length || ONLY.some(pat => p.includes(pat)));

// --------------------------------------------------------------- one child
// Returns { cards, out, verdicts, hang, seconds, code }. `hang` names the card
// the chunk was waiting on when it ran out of time (the child prints in order,
// so the first card with no verdict is the one it was stuck on).
function runChunk(cards, { verbose = true } = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(process.execPath, ['--max-old-space-size=6144', HARNESS,
                                           ...cards, ...PASSTHROUGH],
                        { cwd: ROOT });
    let out = '';
    let killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, TIMEOUT_MS);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => {
      clearTimeout(timer);
      const seconds = (Date.now() - started) / 1000;
      const verdicts = new Map();
      for (const line of out.split('\n')) {
        const m = /^\s+(ok|FAIL|LEAK)\s+(cards\/\S+\.html)/.exec(line);
        if (m) verdicts.set(m[2], m[1]);
      }
      if (verbose) process.stdout.write(out.endsWith('\n') || !out ? out : out + '\n');
      const covered = cards.filter(c => verdicts.has(c));
      const hang = killed ? cards.find(c => !verdicts.has(c)) : null;
      resolve({ cards, out, verdicts, hang, seconds, code, covered });
    });
  });
}

// A timed-out chunk is split until the hanging card stands alone: running 40
// cards again could take another 90 s and still say nothing.
async function handleChunk(cards, results) {
  const r = await runChunk(cards);
  if (!r.hang) {
    for (const c of cards) results.set(c, { verdict: r.verdicts.get(c) || 'none', seconds: r.seconds / cards.length });
    return;
  }
  if (cards.length === 1) {
    results.set(cards[0], { verdict: 'HANG', seconds: r.seconds });
    console.log(`  HANG ${cards[0]} — did not finish in ${TIMEOUT_MS / 1000}s. ` +
                `That is a synchronous loop in the card's own code: the same ` +
                `click freezes a visitor's tab. Split the run to confirm, then ` +
                `find the loop the harness was in when it stopped.`);
    return;
  }
  const half = Math.ceil(cards.length / 2);
  console.log(`  … chunk of ${cards.length} timed out after ${TIMEOUT_MS / 1000}s; ` +
              `splitting to find the card`);
  await handleChunk(cards.slice(0, half), results);
  await handleChunk(cards.slice(half), results);
}

(async () => {
  const chunks = [];
  for (let i = 0; i < allCards.length; i += CHUNK) chunks.push(allCards.slice(i, i + CHUNK));
  console.log(`sweeping ${allCards.length} card(s) in ${chunks.length} chunk(s) of ${CHUNK}, ` +
              `${JOBS} at a time, ${TIMEOUT_MS / 1000}s per chunk` +
              (PASSTHROUGH.length ? ` [harness: ${PASSTHROUGH.join(' ')}]` : ''));

  const results = new Map();
  let next = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(JOBS, chunks.length) }, async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      await handleChunk(chunk, results);
    }
  }));

  const counts = { ok: 0, FAIL: 0, LEAK: 0, HANG: 0, none: 0 };
  for (const { verdict } of results.values()) counts[verdict] = (counts[verdict] || 0) + 1;
  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\n${allCards.length} card(s) in ${minutes} min: ` +
              `${counts.ok} ok, ${counts.FAIL} FAIL, ${counts.LEAK} LEAK, ${counts.HANG || 0} HANG` +
              (counts.none ? `, ${counts.none} unaccounted` : ''));
  for (const [card, v] of [...results].filter(([, v]) => v.verdict === 'HANG')) {
    console.log(`  HANG ${card}`);
  }
  if (JSON_OUT) {
    const payload = { when: new Date().toISOString(), harness: PASSTHROUGH,
                      counts, cards: Object.fromEntries(results) };
    fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2));
    console.log(`  verdicts written to ${JSON_OUT}`);
  }
  process.exit(STRICT && (counts.HANG || counts.FAIL || counts.LEAK) ? 1 : 0);
})();
