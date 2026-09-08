#!/usr/bin/env node
/**
 * Mission-led staff facility. Node 22+, Python 3, git; no npm dependencies.
 *
 * staff/check are informational. audit/plan are read-only. auto/fix can only
 * apply canonical numeric count fixes after all unrelated gates pass.
 * generate is explicit, bounded, gated, and quarantines untrusted text.
 * Every operational run writes JSON, Markdown and an offline HTML report.
 */
'use strict';

const path = require('node:path');
const { loadDefinitions, workflowIntegrity, parseOptions } = require('./staff/config');
const { runFacility, redactor } = require('./staff/engine');
const { writeReports } = require('./staff/report');
const ROOT = path.resolve(__dirname, '..');

const HELP = `Site Staff — evidence before action

Usage: node scripts/ai-developer.js <mode> [options]

  staff      Responsibility profiles, missions and executable checks
  check      Validate configuration and workflow integrity (no API key)
  audit      Run checks, report failures, change no tracked files
  plan       Same read-only checks, with an owned, prioritised handoff
  auto       Audit + gated, transactional count fixes; NEVER calls an LLM
  fix        Explicit canonical count maintenance, with the same gates
  generate   Audit + explicit, human-reviewed plain-text drafts

Options:
  --focus <id|tools|music|shared>  Focus read-only runs; mutation modes still run ALL gates
  --category <catalogue label>    Generation category, validated against cards.json
  --brief <useful gap>            Required for provider-backed generation
  --max-tools <1..3>              Request budget (default 1; no automatic retries)
  --json                         Machine-readable stdout; reports are always saved

Environment: AI_TASK, AI_FOCUS, AI_CATEGORY, AI_MAX_TOOLS, AI_BRIEF.
Generation only: AI_API_KEY, AI_PROVIDER=gemini|openai, AI_MODEL (explicit).
Reports: ai-developer/reports/latest.{html,json,md} (gitignored).
Drafts: ai-developer/drafts/*.html.txt (never executed or auto-promoted).
Docs: STAFF.md, staff/README.md, docs/AI-DEVELOPER-SETUP.md.
`;

function failedReport(message, mode, definitions) {
  return {
    version: 2, generatedAt: new Date().toISOString(), durationMs: 0,
    mode, focus: '', coverage: 'none', definitionsHash: '',
    mission: definitions?.staff.mission || 'The staff facility could not load its configuration.',
    operatingModel: 'Responsibility profiles, not independent agents.',
    products: definitions?.staff.products || [], members: definitions?.staff.members || [], guardrails: definitions?.staff.guardrails || [],
    repository: null, inventory: null, audits: [], verification: null, plan: [], errors: [message],
    fix: { status: 'blocked', reason: 'Configuration or invocation failed before mutation.', files: [] },
    generation: { status: 'blocked', reason: 'No provider request made.', drafts: [], errors: [] },
    gate: { ready: false, proposeChanges: false, blockers: ['configuration'], reason: 'Configuration/invocation failed. No audit success is implied.' },
    limitations: ['This failed run collected no usable audit evidence. Repair the reported error and rerun.'],
  };
}

async function main(argv = process.argv.slice(2), env = process.env, root = ROOT) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(HELP); return 0; }
  const redact = redactor(env);
  let definitions;
  try {
    definitions = loadDefinitions(root);
    const options = parseOptions(argv, env, definitions.config);
    if (options.mode === 'check') {
      const errors = workflowIntegrity(root);
      if (errors.length) { errors.forEach(e => console.error(`FAIL: ${redact(e)}`)); return 1; }
      console.log(`PASS: ${definitions.staff.members.length} staff profiles, ${definitions.audits.length} owned checks, validated limits and workflow contracts.`);
      return 0;
    }
    if (options.mode === 'staff') {
      if (options.json) console.log(JSON.stringify({ ...definitions.staff, audits: definitions.audits }, null, 2));
      else {
        console.log(`${definitions.staff.facility}\n${definitions.staff.mission}\n\n${definitions.staff.operatingModel}\n`);
        for (const member of definitions.staff.members) {
          console.log(`${member.handle} · ${member.role} [${member.id}]\n  ${member.profile}`);
          definitions.audits.filter(a => a.owner === member.id).forEach(a => console.log(`  ${a.gate}: ${a.command.join(' ')}`));
          console.log(`  Review: ${member.reviewRequired.join('; ')}\n`);
        }
        console.log(HELP);
      }
      return 0;
    }
    const result = await runFacility({ root, definitions, options, env, onProgress: options.json ? () => {} : line => console.log(line) });
    const file = writeReports(root, result.report, env);
    if (options.json) console.log(JSON.stringify(result.report, null, 2));
    else {
      console.log(`\n${result.report.gate.ready ? 'READY FOR HUMAN REVIEW' : 'NOT READY'} — ${result.report.gate.reason}`);
      console.log(`Blocking checks: ${result.report.gate.blockers.join(', ') || 'none in the checks that ran'}`);
      console.log(`Count fixes: ${result.report.fix.status} · Drafts: ${result.report.generation.status}`);
      result.report.errors.forEach(e => console.error(`ERROR: ${e}`));
      console.log(`Dashboard: ${path.relative(root, file)}\nEvidence: ai-developer/reports/latest.json\nHandoff: ai-developer/reports/latest.md`);
    }
    return result.exitCode;
  } catch (error) {
    const message = redact(error.message);
    console.error(`FAIL: ${message}`);
    const mode = argv[0] || env.AI_TASK || 'auto';
    if (!['check', 'staff'].includes(mode)) {
      try { writeReports(root, failedReport(message, redact(mode), definitions), env); }
      catch { console.error('FAIL: could not write a report; check workspace permissions.'); }
    }
    return 1;
  }
}

if (require.main === module) main().then(code => { process.exitCode = code; }).catch(() => { console.error('FAIL: unexpected staff runner error'); process.exitCode = 1; });
module.exports = { main, failedReport };
