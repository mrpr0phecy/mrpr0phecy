'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MODES = new Set(['staff', 'check', 'audit', 'plan', 'fix', 'generate', 'auto']);
const PRODUCTS = new Set(['tools', 'music', 'shared']);
const ID = /^[a-z][a-z0-9-]*$/;

function assert(ok, message) {
  if (!ok) throw new Error(message);
}
function text(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, `${label} must be non-empty text`);
}
function strings(value, label) {
  assert(Array.isArray(value) && value.length > 0, `${label} must be a non-empty array`);
  value.forEach(v => text(v, label));
}
function integer(value, min, max, label) {
  assert(Number.isInteger(value) && value >= min && value <= max, `${label} must be an integer from ${min} to ${max}`);
}
function safePath(value) {
  return typeof value === 'string' && !path.isAbsolute(value) && !value.includes('\\') &&
    value.split('/').every(p => p && p !== '.' && p !== '..');
}
function unique(rows, label) {
  assert(Array.isArray(rows) && rows.length > 0, `${label} must not be empty`);
  const ids = new Set();
  for (const row of rows) {
    assert(ID.test(row.id) && !ids.has(row.id), `${label}: invalid or duplicate id ${row.id}`);
    ids.add(row.id);
  }
  return ids;
}

function validateDefinitions({ staff, audits, config }, root) {
  assert(staff.version === 2 && audits.version === 2 && config.version === 2, 'Staff/config/audits must all use version 2');
  ['facility', 'mission', 'operatingModel', 'schedule'].forEach(k => text(staff[k], `staff.${k}`));
  strings(staff.guardrails, 'staff.guardrails');
  const productIds = unique(staff.products, 'products');
  assert(productIds.size === 2 && productIds.has('tools') && productIds.has('music'), 'Keep exactly the tools and music products');
  for (const product of staff.products) {
    ['name', 'purpose', 'success'].forEach(k => text(product[k], `product.${k}`));
    assert(safePath(product.entry) && fs.existsSync(path.join(root, product.entry)), `Missing product entry ${product.entry}`);
  }
  const owners = unique(staff.members, 'members');
  for (const member of staff.members) {
    ['handle', 'role', 'profile'].forEach(k => text(member[k], `member.${k}`));
    assert(PRODUCTS.has(member.product), `Unknown product for ${member.id}`);
    ['owns', 'tags', 'deliverables', 'reviewRequired'].forEach(k => strings(member[k], `${member.id}.${k}`));
  }
  unique(audits.audits, 'audits');
  const used = new Set();
  for (const audit of audits.audits) {
    assert(owners.has(audit.owner), `Unknown owner ${audit.owner} for ${audit.id}`);
    used.add(audit.owner);
    assert(PRODUCTS.has(audit.product), `Unknown product for ${audit.id}`);
    assert(['blocking', 'advisory'].includes(audit.gate), `Unknown gate for ${audit.id}`);
    assert(/^P[0-3]$/.test(audit.priority), `Invalid priority for ${audit.id}`);
    ['title', 'why', 'remediation'].forEach(k => text(audit[k], `${audit.id}.${k}`));
    integer(audit.timeoutMs, 1000, 300000, `${audit.id}.timeoutMs`);
    strings(audit.command, `${audit.id}.command`);
    assert(['node', 'python3', 'bash'].includes(audit.command[0]), `Unsupported executable for ${audit.id}`);
    let scriptCount = 0;
    for (const arg of audit.command.slice(1)) {
      assert(!/[\r\n\0]/.test(arg), `Invalid argument for ${audit.id}`);
      if (arg.startsWith('scripts/')) {
        assert(safePath(arg) && fs.existsSync(path.join(root, arg)), `Missing audit script ${arg}`);
        scriptCount++;
      } else {
        assert(['--test', '--all', '--check', '--strict', 'check', 'music', 'boundaries'].includes(arg), `Unsupported audit argument ${arg}`);
      }
    }
    assert(scriptCount > 0, `No repository script for ${audit.id}`);
  }
  for (const owner of owners) assert(used.has(owner), `Staff member ${owner} has no executable evidence`);
  integer(config.maxOutputBytes, 1024, 2097152, 'maxOutputBytes');
  integer(config.verifyTimeoutMs, 1000, 600000, 'verifyTimeoutMs');
  const g = config.generation;
  assert(g && typeof g === 'object', 'generation limits missing');
  integer(g.maxTools, 1, 3, 'generation.maxTools');
  integer(g.defaultMaxTools, 1, g.maxTools, 'generation.defaultMaxTools');
  integer(g.minBytes, 600, 10000, 'generation.minBytes');
  integer(g.maxBytes, g.minBytes, 60000, 'generation.maxBytes');
  integer(g.maxResponseBytes, g.maxBytes, 500000, 'generation.maxResponseBytes');
  integer(g.requestTimeoutMs, 1000, 90000, 'generation.requestTimeoutMs');
  return { staff, audits: audits.audits, config };
}

function loadDefinitions(root) {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'scripts', name), 'utf8'));
  return validateDefinitions({ staff: read('ai-staff.json'), audits: read('ai-audits.json'), config: read('ai-config.json') }, root);
}

function workflowIntegrity(root) {
  const errors = [];
  for (const file of ['.github/workflows/ai-developer.yml', '.github/workflows/agent-guardrails.yml']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    if (/^(?:<{7}|={7}|>{7})(?:\s|$)/m.test(source)) errors.push(`${file}: unresolved merge conflict`);
    for (const match of source.matchAll(/\buses:\s*([^\s#]+)/g)) {
      if (!/^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/.test(match[1])) errors.push(`${file}: action must be pinned to a release commit: ${match[1]}`);
    }
  }
  const source = fs.readFileSync(path.join(root, '.github/workflows/ai-developer.yml'), 'utf8');
  for (const contract of ['workflow_dispatch:', "cron: '0 6 * * 1,4'", 'concurrency:', 'cancel-in-progress: false', 'if: always()', 'actions/upload-artifact@', 'propose_changes']) {
    if (!source.includes(contract)) errors.push(`AI Developer workflow missing ${contract}`);
  }
  if (/pull_request_target:|continue-on-error:\s*true|\|\|\s*(true|echo)/.test(source)) errors.push('AI Developer workflow contains an unsafe failure/trigger bypass');
  return errors;
}

function parseOptions(argv, env, config) {
  const args = [...argv];
  const mode = args.length && !args[0].startsWith('--') ? args.shift() : (env.AI_TASK || 'auto');
  assert(MODES.has(mode), `Unknown task '${mode}'; use ${[...MODES].join('|')}`);
  const opts = { mode, focus: env.AI_FOCUS || '', category: env.AI_CATEGORY || '', brief: env.AI_BRIEF || '', json: false };
  let max = env.AI_MAX_TOOLS === undefined ? String(config.generation.defaultMaxTools) : env.AI_MAX_TOOLS;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--json') { opts.json = true; continue; }
    const keys = { '--focus': 'focus', '--category': 'category', '--brief': 'brief', '--max-tools': 'max' };
    assert(keys[arg] && args.length && !args[0].startsWith('--'), `Unknown or incomplete option ${arg}`);
    const value = args.shift();
    if (keys[arg] === 'max') max = value;
    else opts[keys[arg]] = value;
  }
  assert(/^\d+$/.test(max), 'AI_MAX_TOOLS/--max-tools must be a whole number');
  opts.maxTools = Number(max);
  integer(opts.maxTools, 1, config.generation.maxTools, 'max-tools');
  for (const key of ['focus', 'category', 'brief']) {
    opts[key] = opts[key].trim();
    const invalid = key === 'brief' ? /[\0\r]/ : /[\x00-\x1f\x7f]/;
    assert(opts[key].length <= (key === 'brief' ? 1600 : 100) && !invalid.test(opts[key]), `${key} is too long or contains invalid characters`);
  }
  if (!opts.focus && ['audit', 'plan'].includes(mode) && opts.category) {
    // Backwards-compatible staff filtering, now exact and validated rather than fuzzy.
    opts.focus = opts.category;
    opts.category = '';
  }
  return opts;
}

function resolveFocus(staff, value) {
  if (!value) return '';
  const needle = value.toLowerCase();
  if (PRODUCTS.has(needle)) return needle;
  const matches = staff.members.filter(m => [m.id, m.handle, ...m.tags].some(t => t.toLowerCase() === needle));
  assert(matches.length === 1, `Unknown or ambiguous focus '${value}'; use a staff id or tools|music|shared`);
  return matches[0].id;
}

module.exports = { loadDefinitions, validateDefinitions, workflowIntegrity, parseOptions, resolveFocus, safePath, MODES };
