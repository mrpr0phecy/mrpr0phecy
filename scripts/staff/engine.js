'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { safePath, resolveFocus } = require('./config');
const { generateDrafts } = require('./drafts');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const cleanAnsi = value => String(value || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
const gatePassed = result => ['passed', 'warning'].includes(result.status);
const blockers = results => results.filter(r => r.gate === 'blocking' && !gatePassed(r));

function redactor(env) {
  const secrets = Object.entries(env).filter(([key, value]) => /(?:TOKEN|KEY|SECRET|PASSWORD)/i.test(key) && typeof value === 'string' && value.length > 6)
    .flatMap(([, value]) => [value, encodeURIComponent(value)]).sort((a, b) => b.length - a.length);
  return value => secrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), cleanAnsi(value));
}

function runCommand(command, { root, timeoutMs, maxOutputBytes, env = process.env }) {
  const childEnv = { ...env };
  for (const key of Object.keys(childEnv)) if (/(?:TOKEN|KEY|SECRET|PASSWORD)/i.test(key)) delete childEnv[key];
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root, env: childEnv, encoding: 'utf8', timeout: timeoutMs,
    maxBuffer: maxOutputBytes, shell: false, killSignal: 'SIGKILL',
  });
  return { exitCode: result.status, stdout: result.stdout || '', stderr: result.stderr || '', signal: result.signal || null, error: result.error ? result.error.code || 'SPAWN_ERROR' : null };
}

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 2097152 });
  if (result.status !== 0) throw new Error(`Git ${args[0]} failed; repository state is unknown`);
  return result.stdout;
}
function snapshot(root) {
  const modified = git(root, 'diff', '--no-renames', '--name-only', '-z', 'HEAD').split('\0').filter(Boolean);
  const untracked = git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
  return {
    branch: git(root, 'rev-parse', '--abbrev-ref', 'HEAD').trim(),
    revision: git(root, 'rev-parse', 'HEAD').trim(),
    dirty: Boolean(modified.length || untracked.length),
    changedFiles: [...new Set([...modified, ...untracked])].sort(),
  };
}
function inventory(root) {
  const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'cards/cards.json'), 'utf8'));
  if (!Array.isArray(catalogue) || !catalogue.length) throw new Error('Catalogue is missing or empty');
  const onDisk = fs.readdirSync(path.join(root, 'cards')).filter(f => f.endsWith('.html')).length;
  const categories = {};
  for (const card of catalogue) categories[card.category || 'Uncategorised'] = (categories[card.category || 'Uncategorised'] || 0) + 1;
  return { catalogue, summary: { indexed: catalogue.length, onDisk, categories } };
}

async function auditOne(audit, { root, config, env, execute = runCommand, redact = cleanAnsi }) {
  const started = Date.now();
  let raw;
  try { raw = await execute(audit.command, { root, timeoutMs: audit.timeoutMs, maxOutputBytes: config.maxOutputBytes, env }); }
  catch { raw = { exitCode: null, error: 'RUNNER_ERROR', stdout: '', stderr: '' }; }
  const output = redact([raw.stdout, raw.stderr].filter(Boolean).join('\n'));
  const warningLines = output.split('\n').filter(l => /^\s*(?:WARN|NOTE)\b/.test(l));
  const skipped = /not on disk|not available.*skipped|— skipped\b|^\s*SKIP:/im.test(output);
  const status = raw.error || raw.signal || raw.exitCode === null ? 'error' : raw.exitCode !== 0 ? 'failed' : skipped ? 'skipped' : warningLines.length ? 'warning' : 'passed';
  const interesting = output.split('\n').filter(l => /\b(?:FAIL|WARN|NOTE|Error|error|not ok|AssertionError)\b/.test(l));
  return {
    id: audit.id, title: audit.title, owner: audit.owner, product: audit.product, gate: audit.gate, priority: audit.priority,
    command: audit.command, why: audit.why, remediation: audit.remediation,
    status, exitCode: raw.exitCode, signal: raw.signal || null, error: raw.error || null,
    durationMs: Date.now() - started, warnings: warningLines.length,
    evidence: interesting.slice(0, 10),
    output: output.length > 26000 ? output.slice(0, 19000) + '\n… report excerpt truncated …\n' + output.slice(-6000) : output,
  };
}

function numericOnly(before, after, count) {
  const a = before.match(/\d+/g) || [], b = after.match(/\d+/g) || [];
  return before.replace(/\d+/g, '#') === after.replace(/\d+/g, '#') && a.length === b.length && b.every((n, i) => n === a[i] || n === String(count));
}

async function transactionalCountFix({ root, plan, validate }) {
  const result = { status: 'unchanged', reason: 'No count drift.', files: [] };
  if (!plan || !Number.isInteger(plan.count) || !Array.isArray(plan.changes)) throw new Error('Invalid canonical count plan');
  if (!plan.changes.length) return result;
  if (snapshot(root).dirty) return { ...result, status: 'blocked', reason: 'Working tree/index contains changes. Commit or finish your work first; nothing was overwritten.' };
  const backups = new Map();
  const expected = new Map();
  const denied = new Set(['token.html', 'opensourcenews.html', 'indexbeta.html', 'hokidea.html']);
  // Validate the whole plan before writing the first byte.
  for (const edit of plan.changes) {
    if (!safePath(edit.path) || !/^(?:[^/]+\.(?:html|md)|(?:guides|blog|launch)\/[^/]+\.html)$/.test(edit.path) || denied.has(edit.path) || backups.has(edit.path)) throw new Error('Count plan contains an out-of-scope or duplicate path');
    const file = path.join(root, edit.path);
    if (fs.lstatSync(file).isSymbolicLink() || fs.realpathSync(file) !== file) throw new Error('Count fixes cannot follow symlinks');
    if (git(root, 'ls-files', '--', edit.path).trim() !== edit.path) throw new Error('Count fixes may only edit existing tracked files');
    const bytes = fs.readFileSync(file);
    if (hash(bytes) !== edit.beforeSha256) throw new Error(`Count source changed since planning: ${edit.path}`);
    if (typeof edit.after !== 'string' || !numericOnly(bytes.toString('utf8'), edit.after, plan.count)) throw new Error('Count plan attempted a non-count change');
    backups.set(edit.path, bytes);
    expected.set(edit.path, Buffer.from(edit.after));
  }
  const written = [];
  let validation = null;
  try {
    for (const [rel, content] of expected) {
      // Recheck immediately before the write; do not overwrite concurrent edits.
      if (hash(fs.readFileSync(path.join(root, rel))) !== hash(backups.get(rel))) throw new Error(`Concurrent edit to ${rel}`);
      fs.writeFileSync(path.join(root, rel), content);
      written.push(rel);
    }
    validation = await validate();
    if (!validation.ok) throw new Error('Post-fix staff audits or verify.sh failed');
    const changed = snapshot(root).changedFiles;
    if (changed.some(file => !expected.has(file))) throw new Error('Unexpected files changed during verification');
    for (const rel of written) if (!fs.readFileSync(path.join(root, rel)).equals(expected.get(rel))) throw new Error(`Concurrent edit to ${rel}`);
    return { status: 'applied', reason: 'Canonical numeric-only fixes passed every staff gate and verify.sh.', files: written, validation };
  } catch (error) {
    const conflicts = [];
    for (const rel of written) {
      const file = path.join(root, rel);
      if (fs.existsSync(file) && fs.readFileSync(file).equals(expected.get(rel))) fs.writeFileSync(file, backups.get(rel));
      else {
        // Preserve the other writer's content and retain our original for recovery.
        const recovery = path.join(root, 'ai-developer', 'rollback');
        fs.mkdirSync(recovery, { recursive: true });
        fs.writeFileSync(path.join(recovery, rel.replace(/\//g, '__') + '.txt'), backups.get(rel), { mode: 0o600 });
        conflicts.push(rel);
      }
    }
    return { status: conflicts.length ? 'rollback-conflict' : 'rolled-back', reason: error.message, files: written, conflicts, validation };
  }
}

function makePlan(results) {
  return results.filter(r => !gatePassed(r) || r.status === 'warning').map(r => ({
    id: `audit:${r.id}`, title: r.title, owner: r.owner, product: r.product,
    priority: r.status === 'warning' && r.priority === 'P0' ? 'P2' : r.priority,
    status: r.gate === 'blocking' && !gatePassed(r) ? 'blocking' : 'review',
    action: r.remediation, evidence: r.evidence.length ? r.evidence : [r.error || r.status],
    acceptance: [r.command.join(' ') + ' exits 0', 'Review the actual behaviour; static checks are not a complete certification.'],
  })).sort((a, b) => a.priority.localeCompare(b.priority) || Number(b.status === 'blocking') - Number(a.status === 'blocking') || a.id.localeCompare(b.id));
}

async function runFacility({ root, definitions, options, env = process.env, execute = runCommand, providerCall, onProgress = () => {} }) {
  const { staff, audits, config } = definitions;
  const redact = redactor(env);
  const report = {
    version: 2, generatedAt: new Date().toISOString(), mode: options.mode, focus: options.focus,
    mission: staff.mission, operatingModel: staff.operatingModel, products: staff.products, guardrails: staff.guardrails, members: staff.members,
    definitionsHash: hash(JSON.stringify(definitions)), repository: null, inventory: null,
    coverage: 'full', audits: [], verification: null, plan: [], errors: [],
    fix: { status: 'not-requested', reason: 'Read-only mode.', files: [] },
    generation: { status: 'not-requested', reason: 'Only explicit generate mode calls a provider.', drafts: [], errors: [] },
    gate: { ready: false, proposeChanges: false, blockers: [], reason: 'Not evaluated.' },
    limitations: ['No traffic, Search Console, earnings, browser geometry or live playback is measured.', 'Static scanners have documented blind spots. Passing is not a security or accessibility certification.', 'Responsibility profiles do not create concurrent autonomous agents.'],
  };
  const context = { root, config, env, execute, redact };
  const verifyDefinition = { id: 'repo-verify', title: 'Repository guardrails', owner: 'delivery', product: 'shared', gate: 'blocking', priority: 'P0', command: ['bash', 'scripts/verify.sh'], timeoutMs: config.verifyTimeoutMs, why: 'The repo-wide guardrails must still pass.', remediation: 'Resolve the failing verify.sh section before proposing changes.' };
  const runAudits = async selected => {
    const rows = [];
    for (const audit of selected) {
      onProgress(`Checking ${audit.title}…`);
      const row = await auditOne(audit, context);
      rows.push(row);
      onProgress(`${row.status.toUpperCase()} · ${row.title}`);
    }
    return rows;
  };
  try {
    report.repository = snapshot(root);
    const data = inventory(root);
    report.inventory = data.summary;
    const focus = resolveFocus(staff, options.focus);
    report.focus = focus;
    if (options.category && !Object.keys(data.summary.categories).some(c => c.toLowerCase() === options.category.toLowerCase())) throw new Error(`Unknown tool category '${options.category}'; use a category from cards/cards.json`);
    const focused = ['audit', 'plan'].includes(options.mode) && focus;
    const selected = focused ? audits.filter(a => a.owner === focus || a.product === focus) : audits;
    if (!selected.length) throw new Error('Focus selected no audits');
    report.coverage = selected.length === audits.length ? 'full' : 'partial';
    report.audits = await runAudits(selected);
    if (['fix', 'auto'].includes(options.mode)) {
      if (blockers(report.audits).some(a => a.id !== 'counts')) {
        report.fix = { status: 'blocked', reason: 'Non-count staff gates failed. Triage those findings first; no tracked files were changed.', files: [] };
      } else {
        const raw = await execute(['python3', 'scripts/sync-counts.py', '--plan'], { root, timeoutMs: 30000, maxOutputBytes: 8388608, env });
        if (raw.exitCode !== 0 || raw.error) throw new Error('Canonical count planning failed');
        const plan = JSON.parse(raw.stdout);
        if (plan.count !== data.summary.indexed || plan.count !== data.summary.onDisk) throw new Error('Refusing count fixes: catalogue and disk counts disagree');
        report.fix = await transactionalCountFix({ root, plan, validate: async () => {
          const nextAudits = await runAudits(audits);
          const verification = await auditOne(verifyDefinition, context);
          return { ok: !blockers(nextAudits).length && gatePassed(verification), audits: nextAudits, verification };
        } });
        if (report.fix.status === 'applied') {
          report.beforeFix = report.audits.map(({ id, status }) => ({ id, status }));
          report.audits = report.fix.validation.audits;
          report.verification = report.fix.validation.verification;
          delete report.fix.validation;
        }
      }
    }
    // A successful transaction already ended with verify.sh while rollback was
    // still possible. Reuse that result instead of running an unprotected second
    // post-fix verifier that could fail after the rollback boundary has closed.
    if (!report.verification) report.verification = await auditOne(verifyDefinition, context);
    const canGenerate = report.coverage === 'full' && !blockers(report.audits).length && gatePassed(report.verification);
    if (options.mode === 'generate') {
      if (!canGenerate) report.generation = { ...report.generation, status: 'blocked', reason: 'All staff gates and verify.sh must pass before any provider request.' };
      else {
        report.generation = await generateDrafts({ root, options, catalogue: data.catalogue, limits: config.generation, env, providerCall });
        // Drafts are plain text. Recheck the repository anyway; nothing is promoted.
        report.verification = await auditOne(verifyDefinition, context);
      }
    }
  } catch (error) {
    report.errors.push(redact(error.message));
  } finally {
    // Even a bad focus, provider failure, or plan error gets a final guardrail
    // result and a durable failed report instead of an uncaught "green" exit.
    if (!report.verification) report.verification = await auditOne(verifyDefinition, context);
    try { report.finalRepository = snapshot(root); } catch (error) { report.errors.push(redact(error.message)); }
  }
  const allResults = [...report.audits, report.verification];
  report.plan = makePlan(allResults);
  report.gate.blockers = blockers(allResults).map(r => r.id);
  const operationFailed = ['blocked', 'rolled-back', 'rollback-conflict'].includes(report.fix.status) || ['failed', 'blocked'].includes(report.generation.status);
  report.gate.ready = report.coverage === 'full' && report.audits.length === audits.length && !report.gate.blockers.length && !report.errors.length && !operationFailed;
  report.gate.proposeChanges = report.gate.ready && report.fix.status === 'applied';
  report.gate.reason = report.gate.ready ? 'All configured static gates passed. Human review is still required.' : report.coverage === 'partial' && !report.gate.blockers.length ? 'Focused report only; unrun staff checks are not a pass or permission to propose changes.' : 'Not ready: review blocking, skipped or errored checks and operation failures.';
  report.durationMs = Date.now() - Date.parse(report.generatedAt);
  // Redact the entire serialised artifact as a last line of defence.
  const safe = JSON.parse(redact(JSON.stringify(report)));
  const exitCode = safe.errors.length || safe.gate.blockers.length || operationFailed ? 1 : 0;
  return { report: safe, exitCode };
}

module.exports = { runFacility, auditOne, runCommand, snapshot, inventory, transactionalCountFix, makePlan, blockers, gatePassed, hash, redactor };
