#!/usr/bin/env node
/**
 * ai-developer.js — scheduled checker for .github/workflows/ai-developer.yml.
 *
 * Runs the audits defined in scripts/ai-audits.json, applies only safe
 * deterministic fixes, and (with a provider key) drafts new tool cards. It
 * never commits: the workflow's create-pull-request step turns whatever it
 * changed into a reviewable PR.
 *
 * Modes (env AI_TASK or first CLI arg; default 'auto'):
 *   audits    list the configured audits and this help
 *   audit     run every configured audit (filter: AI_CATEGORY)
 *   fix       audit, then apply safe deterministic fixes (tool-count sync);
 *             re-verify with bash scripts/verify.sh
 *   generate  ask the LLM provider for tool-card draft(s) -> ai-developer/drafts/
 *             (gitignored, never auto-promoted; requires AI_API_KEY)
 *   auto      audit + fix, then generate when a key is present
 *
 * Env (set by the workflow):
 *   AI_PROVIDER   gemini (default) | openai
 *   AI_API_KEY    provider key (repository secret). Absent -> generation skipped.
 *   AI_TASK       auto | audit | generate | fix
 *   AI_CATEGORY   audit domain (visual-design/catalogue/seo/design/ui/...) or a
 *                 tool-category focus for generation (finance, science, ...).
 *   AI_MAX_TOOLS  max draft cards per run (default 3)
 *
 * Safety rails:
 *   - Writes are limited to deterministic count-sync in index.html/404.html
 *     and new files under ai-developer/drafts/ (gitignored).
 *   - Any edit path ends with `bash scripts/verify.sh`; failures are reported.
 *   - Without AI_API_KEY it audits and fixes only — no generation.
 * Zero dependencies; Node 18+ (CI: Node 22).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const AUDITS = path.join(ROOT, 'scripts', 'ai-audits.json');
const DRAFT_DIR = path.join(ROOT, 'ai-developer', 'drafts');
const REPORT_DIR = path.join(ROOT, 'ai-developer', 'reports');

const TASK = process.argv[2] || process.env.AI_TASK || 'auto';
const CATEGORY = (process.env.AI_CATEGORY || '').trim().toLowerCase();
const MAX_TOOLS = Math.max(0, parseInt(process.env.AI_MAX_TOOLS || '3', 10) || 0);
const API_KEY = (process.env.AI_API_KEY || '').trim();
const PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

// ───────────────────────────── config ─────────────────────────────
function loadAudits() {
  const cfg = JSON.parse(fs.readFileSync(AUDITS, 'utf8'));
  cfg.members = cfg.audits;   // internal alias
  return cfg;
}

function memberMatches(member, filter) {
  if (!filter) return true;
  const tags = [member.id, member.domain, ...(member.tags || [])].map(t => t.toLowerCase());
  return tags.some(t => t.includes(filter) || filter.includes(t));
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function log(prefix, text) {
  if (!text) return;
  text.split('\n').forEach(l => console.log(`  ${prefix} ${l}`));
}

function banner(t) { console.log(`\n── ${t}`); }

// ──────────────────────────── audits task ───────────────────────────
function staffTask() {
  const cfg = loadAudits();
  banner('Configured audits');
  console.log(`  workflow:   ${cfg.workflow}`);
  console.log(`  schedule:   ${cfg.schedule}`);
  console.log(`  rule:       ${cfg.rule}`);
  for (const m of cfg.audits) {
    console.log(`\n  • ${m.domain} [${m.id}]`);
    console.log(`    covers: ${m.owns.join(', ')}`);
    console.log(`    audit:  ${m.auditCmd.join(' ')}`);
    console.log(`    fixes:  ${m.fixScope.join('; ')}`);
  }
  console.log('\nUsage: node scripts/ai-developer.js [audits|audit|fix|generate|auto]');
  console.log('Env:   AI_TASK, AI_CATEGORY, AI_MAX_TOOLS, AI_API_KEY, AI_PROVIDER');
  return 0;
}

// ──────────────────────────── audit task ────────────────────────────
function auditTask() {
  const facility = loadAudits();
  banner(`Audit (task=${TASK}${CATEGORY ? `, focus=${CATEGORY}` : ''})`);
  let failures = 0;
  const active = facility.members.filter(m => memberMatches(m, CATEGORY));
  if (active.length === 0) {
    console.log(`No audit matched '${CATEGORY}' — running all of them.`);
    active.push(...facility.members);
  }
  for (const m of active) {
    banner(`${m.domain} — ${m.auditCmd.join(' ')}`);
    const r = run(m.auditCmd[0], m.auditCmd.slice(1));
    log('', r.out);
    if (r.err) log('stderr', r.err);
    if (r.code !== 0) {
      failures += 1;
      console.log(`  ✗ ${m.domain} audit exited ${r.code}`);
    } else {
      console.log(`  ✓ ${m.domain} audit passed`);
    }
  }
  banner('Audit summary');
  console.log(failures === 0 ? 'All audits passed.' : `${failures} audit(s) reported failures.`);
  return failures === 0 ? 0 : 1;
}

// ───────────────────────── deterministic fixes ─────────────────────────
function syncCounts() {
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards', 'cards.json'), 'utf8'));
  const N = cards.length;
  const edits = [];
  const touch = (rel, before, after) => {
    const p = path.join(ROOT, rel);
    const s = fs.readFileSync(p, 'utf8');
    const next = s.split(before).join(after);
    if (next !== s) {
      fs.writeFileSync(p, next);
      edits.push(`${rel}: ${before.replace(/\s+/g, ' ').slice(0, 60)} → ${after.replace(/\s+/g, ' ').slice(0, 60)}`);
    }
  };
  if (TASK !== 'generate') {
    // Hub claims must equal the real catalogue size (index.html static spots).
    touch('index.html', `id="heroToolCount">${N - 1}+`, `id="heroToolCount">${N}+`);
    touch('index.html', `Search ${N - 1}+ free tools`, `Search ${N}+ free tools`);
    touch('index.html', `id="count-all">${N - 1}<`, `id="count-all">${N}<`);
    touch('index.html', `Showing all <strong>${N - 1}</strong> tools`, `Showing all <strong>${N}</strong> tools`);
    touch('404.html', `${N - 1} free offline browser tools`, `${N} free offline browser tools`);
  }
  return edits;
}

function fixTask() {
  const facility = loadAudits();
  banner(`Fix (task=${TASK}) — deterministic fixes only`);
  const edits = syncCounts();
  if (edits.length === 0) {
    console.log('Nothing to fix: catalogue counts already match the hub pages.');
  } else {
    edits.forEach(e => console.log(`  ✎ ${e}`));
  }
  banner('Re-verifying');
  const v = run('bash', ['scripts/verify.sh']);
  log('', v.out.split('\n').slice(-6).join('\n'));
  if (v.err) log('stderr', v.err);
  const ok = v.code === 0;
  console.log(ok ? '✓ verify.sh passed after fixes.' : `✗ verify.sh failed (${v.code}) — changes left in place for review.`);
  return ok ? 0 : 1;
}

// ──────────────────────────── generation ────────────────────────────
async function callProvider(prompt) {
  const timeout = 150000;
  if (PROVIDER === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(API_KEY)}`;
    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(timeout),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  }
  if (PROVIDER === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(timeout),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
  throw new Error(`Unsupported AI_PROVIDER '${PROVIDER}' (use gemini or openai)`);
}

function stripFences(text) {
  return String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

const FORBIDDEN_FRAGMENT = /<!doctype|<html|<body|<head|<iframe|fetch\s*\(|XMLHttpRequest|https?:\/\/|dQw4w9WgXcQ|VIDEO_ID|PLAYLIST_ID|your_video_id|(src|href)=['"][^'"]*YOUR_/i;

function validateDraft(html) {
  const errors = [];
  if (!/<h2/i.test(html)) errors.push('no <h2> title (cards.json derives the title from it)');
  if (!/<script/i.test(html)) errors.push('no <script> (cards are self-contained tools)');
  if (html.length < 600) errors.push('suspiciously short fragment');
  if (FORBIDDEN_FRAGMENT.test(html)) errors.push('contains forbidden markup/network calls/placeholders');
  if (errors.length) throw new Error('draft rejected: ' + errors.join('; '));
}

function slugify(title) {
  const slug = String(title).toLowerCase().trim()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.slice(0, 60);
}

async function draftOne(ideaIndex) {
  const prompt = [
    'You are the tool-catalogue expert for a static, offline-only website of free browser tools.',
    `Write ONE new tool card${CATEGORY ? ` in the category "${CATEGORY}"` : ''}${ideaIndex > 1 ? ` — different from the previous ${ideaIndex - 1}` : ''}.`,
    'Return ONLY a JSON object: {"title": "...", "description": "...", "html": "..."}',
    'Rules for html (a fragment, NOT a full page):',
    '- No <!doctype>, <html>, <head>, <body>, <iframe>, fetch, XMLHttpRequest, or any network URL.',
    '- Starts with <h2> containing the title with a leading emoji; ids are unique and prefixed by the slug.',
    '- Interactive, real logic in one IIFE-wrapped <script>; inline styles only; CSS vars from the host (--accent, --bg-primary, --text, --text-secondary, --border-light, --success, --error).',
    '- Forms use onsubmit="event.preventDefault();" (if any). No placeholders like VIDEO_ID or YOUR_*.',
    '- A short <p class="small"> description under the h2.',
    'Description: 1-2 plain sentences, < 200 chars, no HTML.',
  ].join('\n');
  const raw = stripFences(await callProvider(prompt));
  const data = JSON.parse(raw);
  const slug = slugify(data.title);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error('could not derive a safe slug from title');
  if (data.html.length > 120000) throw new Error('draft too large');
  validateDraft(data.html);
  fs.mkdirSync(DRAFT_DIR, { recursive: true });
  const file = path.join(DRAFT_DIR, `${slug}.html`);
  if (fs.existsSync(file)) throw new Error(`draft already exists: ${slug}`);
  fs.writeFileSync(file, `<!-- AI Developer draft — review & promote manually:
  1. mv ${path.relative(ROOT, file)} cards/${slug}.html
  2. add '${slug}' to the right category list in generate-cards-json.js
  3. node generate-cards-json.js && regenerate sitemap (ARCHITECTURE.md §6)
  4. bash scripts/verify.sh, then commit. -->
${data.html.trim()}
`);
  return { slug, file: path.relative(ROOT, file), title: data.title, description: data.description };
}

async function generateTask() {
  banner(`Generate (provider=${PROVIDER}, category=${CATEGORY || 'auto'}, max=${MAX_TOOLS})`);
  if (!API_KEY) {
    console.log('AI_API_KEY not set — generation skipped. Add the repository secret');
    console.log('(AI_API_KEY, with AI_PROVIDER=gemini|openai) to enable draft generation.');
    console.log('Audit + deterministic fix still run in auto mode.');
    return 0;
  }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const lines = [];
  const n = CATEGORY ? MAX_TOOLS : 1;
  for (let i = 1; i <= n; i++) {
    try {
      const d = await draftOne(i);
      lines.push(`- [x] ${d.title} → ${d.file}`);
      console.log(`  ✓ drafted ${d.file}`);
    } catch (e) {
      lines.push(`- [ ] draft ${i} failed: ${e.message}`);
      console.log(`  ✗ draft ${i} failed: ${e.message}`);
    }
  }
  const report = [
    '# AI Developer — generation report',
    `Date: ${new Date().toISOString()}`,
    `Provider: ${PROVIDER} · Category: ${CATEGORY || 'auto'}`,
    '',
    ...lines,
    '',
    'Promotion checklist (never automated):',
    '1. Move the accepted draft into cards/<slug>.html.',
    "2. Add its slug to the matching category list in generate-cards-json.js.",
    '3. Run: node generate-cards-json.js (reindex) + regenerate sitemap.xml (ARCHITECTURE.md §6).',
    '4. Run: bash scripts/verify.sh, review the diff, then commit.',
  ].join('\n');
  const reportFile = path.join(REPORT_DIR, `generate-${Date.now()}.md`);
  fs.writeFileSync(reportFile, report + '\n');
  console.log(`  Report: ${path.relative(ROOT, reportFile)}`);
  return 0;
}

// ─────────────────────────────── auto ───────────────────────────────
async function autoTask() {
  banner('Auto run');
  auditTask();
  fixTask();
  if (API_KEY && MAX_TOOLS > 0) await generateTask();
  return 0;
}

// ─────────────────────────────── main ───────────────────────────────
(async () => {
  let code = 0;
  try {
    switch (TASK) {
      case 'audits': case 'staff': code = staffTask(); break;
      case 'audit': code = auditTask(); break;
      case 'fix': code = fixTask(); break;
      case 'generate': code = await generateTask(); break;
      case 'auto': code = await autoTask(); break;
      default:
        console.error(`Unknown task '${TASK}' — use audits|audit|fix|generate|auto`);
        code = 1;
    }
  } catch (e) {
    console.error(`FATAL: ${e.message}`);
    code = 1;
  }
  process.exit(code);
})();
