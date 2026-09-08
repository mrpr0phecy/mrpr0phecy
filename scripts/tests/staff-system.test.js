'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { loadDefinitions, validateDefinitions, workflowIntegrity, parseOptions, resolveFocus } = require('../staff/config');
const { auditOne, runCommand, runFacility, transactionalCountFix, hash, redactor } = require('../staff/engine');
const { validateDraft, callProvider, generateDrafts } = require('../staff/drafts');
const { renderHtml, renderMarkdown, writeReports, FILTER_SCRIPT } = require('../staff/report');
const { failedReport } = require('../ai-developer');

const ROOT = path.resolve(__dirname, '../..');
const REAL = loadDefinitions(ROOT);
const BRANCH = 'arena/01a07ea6-mrpr0phecy';
const ok = stdout => ({ exitCode: 0, stdout: stdout || 'PASS: fixture check', stderr: '', error: null, signal: null });
const fail = stdout => ({ ...ok(stdout || 'FAIL: reproducible fixture finding'), exitCode: 1 });
const clone = value => structuredClone(value);

function command(root, ...args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'staff-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'cards'));
  fs.writeFileSync(path.join(root, 'cards/cards.json'), JSON.stringify([{ name: 'existing', title: 'Existing tool', category: 'Productivity', file: 'existing.html' }]));
  fs.writeFileSync(path.join(root, 'cards/existing.html'), '<h2>Existing</h2>');
  fs.writeFileSync(path.join(root, '.gitignore'), 'ai-developer/\n');
  fs.writeFileSync(path.join(root, 'README.md'), 'There are 700 tools.\n');
  command(root, 'init', '-b', BRANCH);
  command(root, 'config', 'user.name', 'Staff fixture');
  command(root, 'config', 'user.email', 'staff-test@example.invalid');
  command(root, 'add', '.');
  command(root, 'commit', '-qm', 'Fixture');
  return root;
}
function definition(id = 'catalogue', owner = 'catalogue') {
  return { id, owner, title: `${id} fixture`, product: 'tools', gate: 'blocking', priority: 'P1', command: ['node', `${id}.js`], timeoutMs: 1000, why: 'Test evidence', remediation: 'Repair the fixture finding.' };
}
function opts(mode = 'audit', extra = {}) {
  return { mode, focus: '', category: '', brief: '', maxTools: 1, ...extra };
}
function facility(root, options, execute, extra = {}) {
  return runFacility({ root, options, definitions: { ...REAL, audits: [definition()] }, env: {}, execute: execute || (() => ok()), ...extra });
}
function countPlan(root, after = 'There are 1 tools.\n') {
  return { count: 1, changes: [{ path: 'README.md', beforeSha256: hash(fs.readFileSync(path.join(root, 'README.md'))), after }] };
}
function candidate() {
  return {
    title: 'Sample Helper', description: 'A local helper for counting characters.',
    html: `<h2 id="sample-helper-title">Sample Helper</h2><p id="sample-helper-desc">Count characters without sending text anywhere. ${'A useful local calculation with accessible controls. '.repeat(13)}</p><label for="sample-helper-input">Text</label><textarea id="sample-helper-input" aria-describedby="sample-helper-desc"></textarea><button id="sample-helper-run" type="button">Count</button><output id="sample-helper-output" aria-live="polite"></output><script>(function(){ const input = document.getElementById('sample-helper-input'); const result = document.getElementById('sample-helper-output'); document.getElementById('sample-helper-run').addEventListener('click', function(){ result.textContent = String(input.value.length); }); })();</script>`,
  };
}

// Configuration is executable policy, not an unused second roster.
test('real staff configuration has one owner for every executable check', () => {
  assert.equal(REAL.staff.members.length, 8);
  assert.equal(REAL.audits.length, 13);
  assert.deepEqual(workflowIntegrity(ROOT), []);
});
test('configuration rejects duplicate staff ids, orphan checks and unsupported execution', () => {
  const original = { staff: REAL.staff, audits: { version: 2, audits: REAL.audits }, config: REAL.config };
  for (const mutate of [d => d.staff.members.push(d.staff.members[0]), d => d.audits.audits[0].owner = 'absent', d => d.audits.audits[0].command = ['node', '-e', 'bad'], d => d.config.generation.maxTools = 200]) {
    const data = clone(original); mutate(data);
    assert.throws(() => validateDefinitions(data, ROOT));
  }
});
test('focus matching is exact, not a silently widened substring', () => {
  assert.equal(resolveFocus(REAL.staff, 'design'), 'visual-design');
  assert.equal(resolveFocus(REAL.staff, '@music'), 'music');
  assert.equal(resolveFocus(REAL.staff, 'tools'), 'tools');
  assert.throws(() => resolveFocus(REAL.staff, 'vis'), /Unknown/);
});
test('CLI validates modes, complete options and bounded request budgets', () => {
  assert.equal(parseOptions(['plan', '--focus', 'privacy'], {}, REAL.config).focus, 'privacy');
  assert.equal(parseOptions(['audit'], { AI_CATEGORY: 'design' }, REAL.config).focus, 'design');
  for (const args of [['nonsense'], ['audit', '--focus'], ['generate', '--max-tools', '4'], ['generate', '--max-tools', '3oops'], ['audit', '--bogus']]) assert.throws(() => parseOptions(args, {}, REAL.config));
  assert.throws(() => parseOptions(['auto'], { AI_MAX_TOOLS: '0' }, REAL.config));
});
test('merge markers and floating action tags fail the workflow integrity check', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  for (const file of ['ai-developer.yml', 'agent-guardrails.yml']) fs.copyFileSync(path.join(ROOT, '.github/workflows', file), path.join(root, '.github/workflows', file));
  fs.appendFileSync(path.join(root, '.github/workflows/ai-developer.yml'), '\n' + '<'.repeat(7) + ' HEAD\n');
  fs.appendFileSync(path.join(root, '.github/workflows/agent-guardrails.yml'), '\n  - uses: actions/checkout@v7\n');
  assert.ok(workflowIntegrity(root).some(e => e.includes('merge conflict')));
  assert.ok(workflowIntegrity(root).some(e => e.includes('pinned')));
});

// Failure propagation, incomplete coverage and provider gating.
test('audit failures survive auto mode and prevent both fixes and provider calls', async t => {
  const root = fixture(t); let calls = 0;
  const r = await facility(root, opts('auto'), cmd => cmd[0] === 'bash' ? ok() : fail(), { env: { AI_API_KEY: 'private-fixture-value' }, providerCall: () => { calls++; } });
  assert.equal(r.exitCode, 1); assert.equal(r.report.fix.status, 'blocked'); assert.equal(r.report.gate.proposeChanges, false); assert.equal(calls, 0);
});
test('auto mode never calls a provider even with a key and green checks', async t => {
  const root = fixture(t); let calls = 0;
  const r = await facility(root, opts('auto'), cmd => cmd.includes('--plan') ? ok(JSON.stringify({ count: 1, changes: [] })) : ok(), { env: { AI_API_KEY: 'private-fixture-value', AI_MODEL: 'example-model' }, providerCall: () => { calls++; } });
  assert.equal(r.exitCode, 0); assert.equal(r.report.fix.status, 'unchanged'); assert.equal(calls, 0); assert.equal(r.report.gate.proposeChanges, false);
});
test('verify.sh failures propagate and block generation', async t => {
  const root = fixture(t); let calls = 0;
  const r = await facility(root, opts('generate'), cmd => cmd[0] === 'bash' ? fail() : ok(), { providerCall: () => { calls++; } });
  assert.equal(r.exitCode, 1); assert.deepEqual(r.report.gate.blockers, ['repo-verify']); assert.equal(calls, 0);
});
test('focused read-only reports never imply full release readiness', async t => {
  const root = fixture(t);
  const definitions = { ...REAL, audits: [definition(), definition('design', 'visual-design')] };
  const r = await facility(root, opts('plan', { focus: 'catalogue' }), () => ok(), { definitions });
  assert.equal(r.report.coverage, 'partial'); assert.equal(r.report.audits.length, 1); assert.equal(r.report.gate.ready, false); assert.equal(r.exitCode, 0);
});
test('focus cannot bypass unrelated gates in mutation modes', async t => {
  const root = fixture(t);
  const definitions = { ...REAL, audits: [definition(), definition('finance', 'finance')] };
  const r = await facility(root, opts('fix', { focus: 'catalogue' }), cmd => cmd.includes('finance.js') ? fail() : ok(), { definitions });
  assert.equal(r.report.audits.length, 2); assert.equal(r.report.coverage, 'full'); assert.equal(r.exitCode, 1);
});
test('advisory warnings create assigned work without masquerading as failures', async t => {
  const root = fixture(t);
  const r = await facility(root, opts('plan'), cmd => cmd[0] === 'bash' ? ok() : ok('WARN: incomplete metadata'));
  assert.equal(r.exitCode, 0); assert.equal(r.report.audits[0].status, 'warning'); assert.equal(r.report.plan[0].owner, 'catalogue'); assert.equal(r.report.plan[0].status, 'review');
});
test('timeout, signal, missing executable and sparse skips never count as passes', async () => {
  for (const raw of [{ ...ok(), exitCode: null, error: 'ETIMEDOUT' }, { ...ok(), signal: 'SIGKILL' }, { ...ok(), exitCode: null, error: 'ENOENT' }, ok('cards/ not on disk (sparse checkout) — skipped')]) {
    const result = await auditOne(definition(), { root: ROOT, config: REAL.config, execute: () => raw });
    assert.ok(['error', 'skipped'].includes(result.status));
  }
  const tap = await auditOne(definition(), { root: ROOT, config: REAL.config, execute: () => ok('# skipped 0\n# pass 2') });
  assert.equal(tap.status, 'passed');
});
test('subprocesses are shell-free, timeout-bound and do not inherit provider secrets', () => {
  const r = runCommand(['node', '-e', 'console.log(process.env.AI_API_KEY || "absent")'], { root: ROOT, timeoutMs: 1000, maxOutputBytes: 1024, env: { PATH: process.env.PATH, AI_API_KEY: 'private-fixture-value' } });
  assert.equal(r.stdout.trim(), 'absent');
  assert.equal(runCommand(['node', '-e', 'while (true) {}'], { root: ROOT, timeoutMs: 50, maxOutputBytes: 1024 }).error, 'ETIMEDOUT');
});
test('known credentials are redacted from output and final report data', async t => {
  const root = fixture(t), secret = 'private-fixture-value';
  const r = await facility(root, opts(), () => fail(`FAIL: ${secret}`), { env: { AI_API_KEY: secret } });
  assert.ok(!JSON.stringify(r.report).includes(secret));
  assert.ok(JSON.stringify(r.report).includes('[REDACTED]'));
  assert.equal(redactor({ SOMETHING_TOKEN: 'a/b/secret' })('a%2Fb%2Fsecret'), '[REDACTED]');
});
test('unknown focus yields a failed durable report and still records verify.sh', async t => {
  const root = fixture(t);
  const r = await facility(root, opts('audit', { focus: 'unknown' }));
  assert.equal(r.exitCode, 1); assert.ok(r.report.errors.length); assert.equal(r.report.verification.status, 'passed');
});

// Transactional canonical fixes: never leave failed proposed edits behind.
test('canonical numeric count fixes apply only after successful validation', async t => {
  const root = fixture(t);
  const result = await transactionalCountFix({ root, plan: countPlan(root), validate: async () => ({ ok: true }) });
  assert.equal(result.status, 'applied'); assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), 'There are 1 tools.\n');
});
test('failed or throwing post-fix checks roll back byte-for-byte', async t => {
  for (const validate of [async () => ({ ok: false }), async () => { throw new Error('fixture verifier crashed'); }]) {
    const root = fixture(t), original = fs.readFileSync(path.join(root, 'README.md'));
    const result = await transactionalCountFix({ root, plan: countPlan(root), validate });
    assert.equal(result.status, 'rolled-back'); assert.ok(fs.readFileSync(path.join(root, 'README.md')).equals(original)); assert.equal(command(root, 'status', '--porcelain').trim(), '');
  }
});
test('end-to-end count maintenance reuses transaction verification and can propose only its own edits', async t => {
  const root = fixture(t); let verifications = 0;
  const definitions = { ...REAL, audits: [definition('counts')] };
  const r = await facility(root, opts('fix'), cmd => {
    if (cmd[0] === 'bash') { verifications++; return ok(); }
    if (cmd.includes('--plan')) return ok(JSON.stringify(countPlan(root)));
    return fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('700') ? fail('FAIL: stale count') : ok();
  }, { definitions });
  assert.equal(r.exitCode, 0); assert.equal(r.report.fix.status, 'applied');
  assert.equal(r.report.gate.proposeChanges, true); assert.equal(verifications, 1);
  assert.equal(r.report.beforeFix[0].status, 'failed');
  assert.deepEqual(r.report.finalRepository.changedFiles, ['README.md']);
});
test('end-to-end rollback retains failed post-fix evidence and returns nonzero', async t => {
  const root = fixture(t);
  const definitions = { ...REAL, audits: [definition('counts')] };
  const r = await facility(root, opts('fix'), cmd => {
    if (cmd[0] === 'bash') return fail('FAIL: post-fix guardrail fixture');
    if (cmd.includes('--plan')) return ok(JSON.stringify(countPlan(root)));
    return fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('700') ? fail('FAIL: stale count') : ok();
  }, { definitions });
  assert.equal(r.exitCode, 1); assert.equal(r.report.fix.status, 'rolled-back');
  assert.equal(r.report.fix.validation.verification.status, 'failed');
  assert.equal(r.report.gate.proposeChanges, false);
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), 'There are 700 tools.\n');
});
test('staged and unstaged work is never overwritten by safe fixes', async t => {
  const root = fixture(t), plan = countPlan(root);
  fs.writeFileSync(path.join(root, 'README.md'), 'Human work'); command(root, 'add', 'README.md');
  const result = await transactionalCountFix({ root, plan, validate: async () => ({ ok: true }) });
  assert.equal(result.status, 'blocked'); assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), 'Human work');
});
test('stale hashes, non-numeric edits and out-of-scope paths reject the whole plan', async t => {
  for (const mutate of [p => p.changes[0].beforeSha256 = 'stale', p => p.changes[0].after = 'A new policy', p => p.changes.push({ path: '../outside', after: '' }), p => p.changes.push({ path: 'scripts/ai-developer.js', after: '' })]) {
    const root = fixture(t), plan = countPlan(root); mutate(plan);
    await assert.rejects(transactionalCountFix({ root, plan, validate: async () => ({ ok: true }) }));
    assert.equal(command(root, 'status', '--porcelain').trim(), '');
  }
});
test('rollback preserves concurrent human edits and saves a recovery copy', async t => {
  const root = fixture(t);
  const result = await transactionalCountFix({ root, plan: countPlan(root), validate: async () => {
    fs.writeFileSync(path.join(root, 'README.md'), 'Concurrent human update'); return { ok: false };
  } });
  assert.equal(result.status, 'rollback-conflict'); assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), 'Concurrent human update');
  assert.equal(fs.readFileSync(path.join(root, 'ai-developer/rollback/README.md.txt'), 'utf8'), 'There are 700 tools.\n');
});
test('canonical count planner emits a no-write JSON plan', () => {
  const result = spawnSync('python3', ['scripts/sync-counts.py', '--plan'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); const plan = JSON.parse(result.stdout);
  assert.equal(plan.count, JSON.parse(fs.readFileSync(path.join(ROOT, 'cards/cards.json'))).length); assert.ok(Array.isArray(plan.changes));
});

// AI output is parsed, bounded, never executed and never promoted.
test('complete local-only draft passes conservative static quarantine validation', () => {
  assert.equal(validateDraft(candidate(), [], REAL.config.generation).slug, 'sample-helper');
});
test('draft validator rejects dangerous sinks, network APIs, global scripts and duplicate IDs', () => {
  const unsafe = [
    d => d.html += '<iframe src="https://example.invalid"></iframe>',
    d => d.html = d.html.replace('result.textContent', 'result.innerHTML'),
    d => d.html = d.html.replace('const input', 'fetch("/egress"); const input'),
    d => d.html = d.html.replace('(function(){', '').replace('})();', ''),
    d => d.html = d.html.replace('sample-helper-input" aria-describedby', 'sample-helper-title" aria-describedby'),
    d => d.html = d.html.replace('for="sample-helper-input"', 'for="missing"'),
    d => d.html = d.html.replace('type="button"', 'onclick="alert(1)"'),
    d => d.html = d.html.replace('const input', 'const = ; const input'),
    d => d.html += '<form><input id="sample-helper-other"></form>',
    d => d.html = d.html.replace('id="sample-helper-input"', 'id=unquoted'),
    d => d.path = '../../index.html',
  ];
  for (const mutate of unsafe) { const draft = candidate(); mutate(draft); assert.throws(() => validateDraft(draft, [], REAL.config.generation)); }
});
test('draft size uses UTF-8 bytes and known tools cannot be regenerated', () => {
  const draft = candidate(); draft.html += '<p>' + 'é'.repeat(1000) + '</p>';
  assert.throws(() => validateDraft(draft, [], { ...REAL.config.generation, maxBytes: draft.html.length + 2 }), /bytes/);
  assert.throws(() => validateDraft(candidate(), [{ title: '🔧 Sample Helper', name: 'old-alias' }], REAL.config.generation), /already exists/);
});
test('provider keys are headers only and redirects are refused', async () => {
  let request;
  const result = await callProvider({ provider: 'gemini', model: 'chosen-model', apiKey: 'private-fixture-value', prompt: 'Local tool', limits: REAL.config.generation, fetchImpl: async (url, init) => {
    request = { url, init }; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(candidate()) }] } }] }));
  } });
  assert.equal(result.title, 'Sample Helper'); assert.ok(!request.url.includes('private-fixture-value')); assert.equal(request.init.headers['x-goog-api-key'], 'private-fixture-value'); assert.equal(request.init.redirect, 'error');
});
test('provider HTTP errors never expose response bodies and size limits are enforced', async () => {
  const base = { provider: 'openai', model: 'chosen-model', apiKey: 'private-fixture-value', prompt: 'x', limits: REAL.config.generation };
  await assert.rejects(callProvider({ ...base, fetchImpl: async () => new Response('private-fixture-value', { status: 429 }) }), error => error.message.includes('429') && !error.message.includes('private-fixture-value'));
  await assert.rejects(callProvider({ ...base, fetchImpl: async () => new Response('x', { headers: { 'content-length': '99999999' } }) }), /size limit/);
  await assert.rejects(callProvider({ ...base, model: '', fetchImpl: () => { throw new Error('must not call'); } }), /AI_MODEL/);
});
test('generation is explicit, plain-text only, bounded and never overwrites a draft', async t => {
  const root = fixture(t); let count = 0;
  const params = { root, options: opts('generate', { brief: 'A character-count helper' }), catalogue: [], limits: REAL.config.generation, env: { AI_API_KEY: 'private-fixture-value', AI_MODEL: 'chosen-model' }, providerCall: async () => { count++; return candidate(); } };
  const first = await generateDrafts(params);
  assert.equal(first.status, 'drafted'); assert.equal(count, 1);
  assert.ok(fs.existsSync(path.join(root, 'ai-developer/drafts/sample-helper.html.txt')));
  assert.ok(!fs.existsSync(path.join(root, 'cards/sample-helper.html')));
  const second = await generateDrafts(params); assert.equal(second.status, 'failed'); assert.match(second.errors[0], /not overwritten/);
});
test('generation failure yields nonzero facility status instead of a green run', async t => {
  const root = fixture(t);
  const r = await facility(root, opts('generate', { brief: 'A useful gap' }), () => ok(), { env: { AI_API_KEY: 'private-fixture-value', AI_MODEL: 'chosen-model' }, providerCall: async () => { throw new Error('Provider unavailable'); } });
  assert.equal(r.exitCode, 1); assert.equal(r.report.generation.status, 'failed'); assert.equal(r.report.gate.ready, false);
});
test('no-key generation still audits, reports a skip and makes no request', async t => {
  const root = fixture(t); let count = 0;
  const r = await facility(root, opts('generate'), () => ok(), { providerCall: () => { count++; } });
  assert.equal(r.exitCode, 0); assert.equal(r.report.audits.length, 1); assert.equal(r.report.generation.status, 'skipped'); assert.equal(count, 0);
});

// Reports must not become an execution path for audit or model output.
test('HTML and Markdown reports escape untrusted audit content', async t => {
  const root = fixture(t), attack = '</pre><img src=x onerror=alert(1)><script>bad()</script>';
  const r = await facility(root, opts(), () => fail(attack));
  const html = renderHtml(r.report), markdown = renderMarkdown(r.report);
  assert.ok(!html.includes(attack)); assert.ok(html.includes('&lt;/pre&gt;')); assert.equal((html.match(/<script>/g) || []).length, 1);
  assert.ok(html.includes("default-src 'none'")); assert.ok(!markdown.includes('<img')); assert.ok(!html.includes('fonts.googleapis.com'));
});
test('dashboard filters execute the actual report script with accessible state updates', () => {
  const element = value => ({ value, hidden: false, listeners: {}, attrs: {}, addEventListener(k, fn) { this.listeners[k] = fn; }, setAttribute(k, v) { this.attrs[k] = v; } });
  const search = element(''), product = element('all'), count = element(), empty = element();
  const buttons = ['all', 'blocking', 'review'].map(filter => ({ ...element(), dataset: { filter } }));
  const tasks = [
    { ...element(), dataset: { status: 'blocking', product: 'tools', search: 'finance arithmetic' } },
    { ...element(), dataset: { status: 'review', product: 'music', search: 'music metadata' } },
  ];
  vm.runInNewContext(FILTER_SCRIPT, { document: { getElementById: id => ({ 'task-search': search, 'product-filter': product, 'task-count': count, 'empty-state': empty })[id], querySelectorAll: selector => selector === '[data-filter]' ? buttons : tasks } });
  assert.equal(count.textContent, '2 of 2 findings shown');
  buttons[1].listeners.click(); assert.equal(tasks[1].hidden, true); assert.equal(buttons[1].attrs['aria-pressed'], 'true');
  search.value = 'nothing'; search.listeners.input(); assert.equal(empty.hidden, false);
  search.value = ''; product.value = 'music'; buttons[0].listeners.click(); assert.equal(tasks[0].hidden, true); assert.equal(tasks[1].hidden, false);
});
test('every run writes bounded latest artifacts and a safe workflow output', async t => {
  const root = fixture(t), r = await facility(root, opts(), () => ok());
  const summary = path.join(root, 'summary.txt'), output = path.join(root, 'output.txt');
  const file = writeReports(root, r.report, { GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output });
  assert.equal(file, path.join(root, 'ai-developer/reports/latest.html'));
  assert.equal(fs.readFileSync(output, 'utf8'), 'propose_changes=false\n');
  assert.ok(fs.readFileSync(summary, 'utf8').includes('Site Staff'));
  writeReports(root, r.report, {});
  assert.equal(fs.readdirSync(path.dirname(file)).length, 3);
  assert.ok(JSON.parse(fs.readFileSync(path.join(path.dirname(file), 'latest.json'))).comparison);
});
test('invalid invocation reports clearly say no evidence was collected', () => {
  const report = failedReport('Bad input', 'unknown', REAL);
  assert.equal(report.gate.ready, false); assert.equal(report.coverage, 'none'); assert.ok(renderHtml(report).includes('No audit success is implied'));
});

// Regression for the old design --json early-return / always-green bug.
test('design JSON counts real failures and agrees with text exit status', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(path.join(ROOT, 'scripts/design-audit.js'), path.join(root, 'scripts/design-audit.js'));
  for (const file of ['index.html', 'tool.html', '404.html', 'donate.html', 'listen.html', 'cards/card.css']) fs.copyFileSync(path.join(ROOT, file), path.join(root, file));
  const index = path.join(root, 'index.html');
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('--accent: #2dd4ff', '--accent: #000000'));
  const json = spawnSync('node', ['scripts/design-audit.js', '--json'], { cwd: root, encoding: 'utf8' });
  const text = spawnSync('node', ['scripts/design-audit.js'], { cwd: root, encoding: 'utf8' });
  assert.equal(json.status, 1); assert.equal(text.status, 1);
  const data = JSON.parse(json.stdout); assert.equal(data.ok, false); assert.ok(data.fail > 0); assert.ok(data.pass > 0); assert.equal(data.findings.length, data.pass + data.fail + data.warn);
});
