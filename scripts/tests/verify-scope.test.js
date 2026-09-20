// Drives the REAL scope map shipped in scripts/verify.sh. `--plan` computes the
// section selection and exits before a single check runs, and VERIFY_PATHS
// feeds it an explicit change set, so the map can be asserted on instead of
// trusted. Zero dependencies (node only). No network, no browser.
//
// Why this exists:
//   * verify.sh now scopes itself to the sections a change can reach. A map
//     that quietly drops a section is worse than the slow gate it replaced: the
//     run still prints VERIFY PASSED, and the one check that would have failed
//     never ran. That failure mode is a missing arm in a bash case statement —
//     invisible in review, silent at runtime.
//   * So the contract is pinned: known paths select the sections that read
//     them, unknown paths select everything, the four cheap global scans always
//     run, and the folded-away section numbers stay folded away.
//
// Run with: node scripts/tests/verify-scope.test.js
'use strict';
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

/* Placeholders, rel=noopener, the secret scan and git state: cheap, global,
   and never scoped away. */
const ALWAYS = [2, 3, 6, 7];
/* Section 4 folded into 10 and 19 into 13. Numbers are stable identities
   (ARCHITECTURE.md and docs/OPERATIONS.md cite them), so the holes must stay
   holes rather than coming back as duplicates. */
const FOLDED = [4, 19];

function plan(paths, extraEnv) {
  const r = spawnSync('bash', ['scripts/verify.sh', '--plan'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      VERIFY_PATHS: Array.isArray(paths) ? paths.join(' ') : paths,
    }, extraEnv || {}),
  });
  assert.equal(r.status, 0, `verify.sh --plan exited ${r.status}: ${r.stderr || r.stdout}`);
  const fields = {};
  for (const line of r.stdout.split('\n')) {
    const i = line.indexOf(': ');
    if (i > 0) fields[line.slice(0, i)] = line.slice(i + 2).trim();
  }
  const nums = (k) => String(fields[k] || '').split(/\s+/).filter(Boolean).map(Number);
  return { stdout: r.stdout, run: nums('run'), skip: nums('skip'), widened: fields.widened || '' };
}

/* Every plan must be internally consistent before any of them is believed. */
function assertShape(p, label) {
  for (const n of ALWAYS) assert.ok(p.run.includes(n), `${label}: always-run section ${n} was scoped away`);
  for (const n of FOLDED) {
    assert.ok(!p.run.includes(n), `${label}: folded section ${n} came back`);
    assert.ok(!p.skip.includes(n), `${label}: folded section ${n} came back`);
  }
  const overlap = p.run.filter((n) => p.skip.includes(n));
  assert.deepEqual(overlap, [], `${label}: section(s) both run and skipped`);
  for (const list of [p.run, p.skip]) {
    assert.deepEqual(list.filter((n, i) => list.indexOf(n) !== i), [], `${label}: duplicate section in the plan`);
  }
  assert.deepEqual(p.run, [...p.run].sort((a, b) => a - b), `${label}: sections are not in ascending order`);
  return p.run.length + p.skip.length;
}

/* --plan must not run anything: no section header, no verdict, no timing. */
const quiet = plan('README.md');
assert.ok(!quiet.stdout.includes('=='), '--plan printed a section header — it ran a check');
assert.ok(!/VERIFY (PASSED|FAILED)/.test(quiet.stdout), '--plan printed a verdict');
assert.ok(!quiet.stdout.includes('slowest'), '--plan printed the timing table');

const TOTAL = assertShape(quiet, 'baseline');
assert.ok(TOTAL >= 20, `the suite should still have ~21 sections, saw ${TOTAL}`);

/* One path at a time: what it must reach, and what it must be allowed to skip. */
const CASES = [
  /* Lantern: the engine ships inside ai.html, which is also a site-brain input. */
  { path: 'ai.html', want: [12, 21], not: [13, 20, 22] },
  { path: 'scripts/evaluate-lantern.js', want: [21], not: [13, 20] },
  { path: 'scripts/tests/fixtures/lantern-corpus.json', want: [21], not: [13] },
  /* Catalogue: cards/ feeds every derived surface, but not the staff facility. */
  { path: 'cards/bmi.html', want: [1, 8, 9, 11, 14, 15, 16, 18, 22], not: [13, 20, 21] },
  { path: 'generate-cards-json.js', want: [1, 9, 12, 22], not: [13, 21] },
  /* Site brain inputs. */
  { path: 'scripts/build-site-brain.py', want: [12], not: [13, 21] },
  { path: 'local-ai-knowledge.json', want: [12], not: [13, 21] },
  { path: 'learning/approved.json', want: [12], not: [13, 21] },
  { path: 'CONSTRAINTS.md', want: [12], not: [13, 21] },
  /* Staff facility and the AI Developer contract. */
  { path: 'staff/BOARD.md', want: [13], not: [12, 15, 21, 22] },
  { path: 'scripts/ai-developer.js', want: [13], not: [12, 21] },
  { path: 'scripts/tests/staff-system.test.js', want: [13], not: [21] },
  /* Production monitor. */
  { path: 'scripts/check-production.js', want: [20], not: [13, 21] },
  /* Home page and its generated first screen. */
  { path: 'index.html', want: [9, 15], not: [13, 21] },
  { path: 'home-app.js', want: [15], not: [13, 21] },
  { path: 'sw.js', want: [15], not: [13] },
  /* Tool shell, deep pages and egress classification. */
  { path: 'tool.html', want: [16], not: [13, 21] },
  { path: 'tools/bmi.html', want: [16], not: [13, 21] },
  { path: 'scripts/check-egress.py', want: [16], not: [13, 21] },
  /* Derived discovery surfaces. */
  { path: 'embed.html', want: [18], not: [13, 21] },
  { path: 'tools.html', want: [22], not: [13, 21] },
  { path: 'sitemap.xml', want: [10], not: [13, 21] },
  { path: 'api/tools.json', want: [9, 22], not: [13, 21] },
  { path: 'categories/productivity-lifestyle.html', want: [22], not: [13, 21] },
  /* The gate's own map. */
  { path: 'scripts/tests/verify-scope.test.js', want: [23], not: [13, 21] },
];

for (const c of CASES) {
  const p = plan(c.path);
  assertShape(p, c.path);
  for (const n of c.want) assert.ok(p.run.includes(n), `${c.path}: section ${n} must run (got ${p.run.join(' ')})`);
  for (const n of c.not) assert.ok(!p.run.includes(n), `${c.path}: section ${n} must be skippable (got ${p.run.join(' ')})`);
  /* Scoping has to actually save something, or the map is decoration. */
  assert.ok(p.skip.length > 0, `${c.path}: nothing was skipped — the map narrowed nothing`);
}

/* Unknown paths widen to the whole suite. This is the safety property the rest
   of the map is allowed to be fast because of. */
for (const unknown of ['scripts/some-new-check.py', 'brand-new-thing.ts', 'weird/dir/file.bin', '.github/hooks/pre-push']) {
  const p = plan(unknown);
  assertShape(p, unknown);
  assert.deepEqual(p.skip, [], `${unknown}: an unrecognised path must run every section, skipped ${p.skip.join(' ')}`);
  assert.equal(p.run.length, TOTAL, `${unknown}: expected all ${TOTAL} sections`);
}

/* The gate itself, its entry points and the CI that runs it are never scoped. */
for (const gate of ['scripts/verify.sh', 'package.json', '.github/workflows/agent-guardrails.yml']) {
  const p = plan(gate);
  assertShape(p, gate);
  assert.deepEqual(p.skip, [], `${gate}: changing the gate must run the whole gate`);
}

/* Paths nothing reads narrow to the always-run scans alone. */
for (const inert of ['docs/BRAND.md', 'ROADMAP.md', 'mrprophecypic.jpg', '.gitattributes', 'CV.pdf']) {
  const p = plan(inert);
  assertShape(p, inert);
  assert.deepEqual(p.run, ALWAYS, `${inert}: expected only the always-run scans, got ${p.run.join(' ')}`);
}

/* A change set is the union of its paths, not the last one seen. */
const union = plan(['ai.html', 'staff/BOARD.md', 'cards/bmi.html']);
assertShape(union, 'union');
for (const n of [1, 12, 13, 21, 22]) assert.ok(union.run.includes(n), `union: section ${n} must run`);

/* Explicit widening still wins. */
const forced = plan('docs/BRAND.md', { VERIFY_ALL: '1' });
assert.deepEqual(forced.skip, [], 'VERIFY_ALL=1 must run every section');
assert.equal(forced.run.length, TOTAL, 'VERIFY_ALL=1 must run every section');

console.log(`verify-scope: ${CASES.length} mapped paths, 4 unknown-path widenings, 3 gate widenings, 5 inert paths and the union all select the sections that read them (${TOTAL} sections, ${ALWAYS.join('/')} always run)`);
