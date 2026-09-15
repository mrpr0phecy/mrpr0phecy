#!/usr/bin/env node
'use strict';

// check-production.js — the production contract monitor.
//
// Why this exists: every other gate in this repo reads the working tree. None
// of them can tell you what the *deployed* site is actually serving. A push
// that Pages never deployed, a deploy that truncated a JSON file on the CDN, a
// custom-404 rule that silently stopped applying, or an HTTPS redirect that
// broke are all invisible to `verify.sh`. This script closes that loop.
//
// What it checks (each failure names itself in the report):
//   1. availability — every probed URL answers, and answers *fast enough to be
//      usable*; the https upgrade still redirects; the 404 route still 404s.
//   2. integrity    — the live bytes of the critical files are identical to the
//      bytes in this repository. This is the deploy-freshness contract: if a
//      deploy is skipped, partial, or serves a different commit, it fails here.
//   3. behaviour    — the catalogue still parses, still carries the same number
//      of cards, and the sitemap still lists the same URL set as the repo.
//
// It deliberately does NOT measure Core Web Vitals. Those are field metrics
// (CrUX, 28-day p75) and belong to `staff/scoreboard.json` (`lcp-p75`,
// `inp-p75`, `cls-p75`); the response times recorded here are server TTFB from
// one runner, which is diagnostic evidence, never a field pass.
//
// It makes no change to the site and adds no client-side tracking: it is an
// external probe of the owner's own domain, run from the owner's own CI.
//
// Usage (see docs/OPERATIONS.md for the runbook this supports):
//   node scripts/check-production.js                      # full contract
//   node scripts/check-production.js --sample 12          # more cards
//   node scripts/check-production.js --compare robots.txt --probe /help.html
//   node scripts/check-production.js --json report.json --summary summary.md
//
// Exit codes: 0 = contract held (warnings allowed), 1 = contract broken,
// 2 = the monitor itself could not run (bad arguments, no repo).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 1;

// Server response budgets (internal engineering bar, from a CI runner — NOT
// Google's field thresholds, which are LCP ≤2.5s / INP ≤200ms / CLS ≤0.1 at
// p75 for real users). Exceeding one is a warning: runner networks vary, and a
// warning that cries wolf is worse than no warning. A request that exceeds the
// hard timeout is a failure, because that is indistinguishable from broken.
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_TTFB_WARN_MS = 3000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_SAMPLE = 6;
const MAX_REDIRECTS = 5;

// Files whose live bytes must equal the repository bytes. These are the pages a
// visitor is most likely to meet first, every file the site's own correctness
// depends on (catalogue, sitemap, robots, 404, PWA manifest), and the
// machine-readable surface the site advertises to crawlers and agents.
//
// The last two earn their place from a real incident: GitHub Pages used to
// build this repository with Jekyll, which silently drops paths beginning with
// "." or "_", so `.well-known/ai.txt` and `.well-known/security.txt` were 404
// in production while four pages linked to them. `.nojekyll` disables that
// hidden build step; these checks keep their absence loud.
const CRITICAL_FILES = [
  'index.html',
  'tool.html',
  'listen.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  'manifest.json',
  'cards/cards.json',
  'llms.txt',
  'llms-full.txt',
  'feed.xml',
  'related.json',
  '.well-known/ai.txt',
  '.well-known/security.txt',
];

// Exposed so the offline suite can prove every probed file still exists.
function criticalFiles() {
  return [...CRITICAL_FILES];
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readArgValue(argv, index, name) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} needs a value`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    root: path.resolve(__dirname, '..'),
    base: '',
    allowHttp: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    ttfbWarnMs: DEFAULT_TTFB_WARN_MS,
    concurrency: DEFAULT_CONCURRENCY,
    sample: DEFAULT_SAMPLE,
    seed: null,
    retries: 2,
    retryMismatch: 0,
    retryDelayMs: 3000,
    strict: false,
    quiet: false,
    jsonPath: '',
    summaryPath: '',
    commit: process.env.GITHUB_SHA || '',
    extraFiles: [],
    extraProbes: [],
    repoUrl: process.env.GITHUB_REPOSITORY || '',
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = readArgValue(argv, i, arg);
      i += 1;
      return value;
    };
    switch (arg) {
      // --base is optional by design: CNAME is the authoritative public host
      // (CONSTRAINTS.md) and reading it here means the monitor follows the
      // repository rather than a second, silently diverging copy of the domain.
      case '--base': options.base = next().replace(/\/+$/, ''); break;
      case '--root': options.root = path.resolve(next()); break;
      case '--allow-http': options.allowHttp = true; break;
      case '--timeout': options.timeoutMs = Number(next()); break;
      case '--ttfb-warn': options.ttfbWarnMs = Number(next()); break;
      case '--concurrency': options.concurrency = Number(next()); break;
      case '--sample': options.sample = Number(next()); break;
      case '--seed': options.seed = Number(next()); break;
      case '--retries': options.retries = Number(next()); break;
      case '--retry-mismatch': options.retryMismatch = Number(next()); break;
      case '--retry-delay': options.retryDelayMs = Number(next()); break;
      case '--commit': options.commit = next(); break;
      case '--json': options.jsonPath = next(); break;
      case '--summary': options.summaryPath = next(); break;
      case '--compare': options.extraFiles.push(next().replace(/^\/+/, '')); break;
      case '--probe': options.extraProbes.push(next().replace(/^\/+/, '')); break;
      case '--repo': options.repoUrl = next().replace(/^https:\/\/github\.com\//, '').replace(/\/+$/, ''); break;
      case '--strict': options.strict = true; break;
      case '--quiet': options.quiet = true; break;
      case '--help': case '-h': options.help = true; break;
      default:
        throw new Error(`unknown argument ${arg}`);
    }
  }

  for (const key of ['timeoutMs', 'ttfbWarnMs', 'concurrency', 'sample', 'retries', 'retryMismatch', 'retryDelayMs']) {
    if (!Number.isFinite(options[key]) || options[key] < 0) {
      throw new Error(`--${key.replace(/Ms$/, '').replace(/[A-Z]/g, m => '-' + m.toLowerCase())} must be a non-negative number`);
    }
  }
  if (options.sample < 0) throw new Error('--sample must not be negative');
  if (options.concurrency < 1) throw new Error('--concurrency must be at least 1');
  return options;
}

function usage() {
  return [
    'check-production.js — probe the deployed site against this repository.',
    '',
    '  --base <url>        public origin (default: https:// + CNAME)',
    '  --compare <path>    extra repo file that must match live bytes (repeatable)',
    '  --probe <path>      extra live path that must answer 200 (repeatable)',
    '  --sample <n>        catalogue cards to verify byte-for-byte (default 6)',
    '  --seed <n>          rotate the card sample deterministically (default: day of year)',
    '  --timeout <ms>      per-request timeout (default 20000)',
    '  --ttfb-warn <ms>    response-time warning line (default 3000)',
    '  --retries <n>       retries for network errors, 5xx and 429 (default 2)',
    '  --retry-mismatch <n> retries when live bytes differ (post-deploy use)',
    '  --strict            treat warnings as failures',
    '  --json <file>       write the machine-readable report',
    '  --summary <file>    write the Markdown report (issue body / step summary)',
    '  --repo <owner/name> repository slug for report links (default: GITHUB_REPOSITORY)',
    '  --allow-http        permit plain http (local fixtures only)',
  ].join('\n');
}

// ---------------------------------------------------------------- repository

function loadRepo(root) {
  const read = rel => fs.readFileSync(path.join(root, rel));
  const cnamePath = path.join(root, 'CNAME');
  if (!fs.existsSync(cnamePath)) {
    // CNAME deletion breaks the custom domain (CONSTRAINTS.md) and the monitor
    // has no other authoritative source for the public host.
    throw new Error('CNAME is missing — refusing to guess the production host');
  }
  const cname = read('CNAME').toString('utf8').trim();
  if (!cname) throw new Error('CNAME is empty');

  const cards = JSON.parse(read('cards/cards.json').toString('utf8'));
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error('cards/cards.json is not a non-empty array');
  }

  const sitemapUrls = extractSitemapUrls(read('sitemap.xml').toString('utf8'));

  // Derived artefacts are permitted to change checkout-to-checkout; the tool
  // pages are the P1-R2 prerender pilot and are worth checking while they exist.
  const toolPages = fs.existsSync(path.join(root, 'tools'))
    ? fs.readdirSync(path.join(root, 'tools')).filter(f => f.endsWith('.html')).sort().map(f => `tools/${f}`)
    : [];

  return { cname, cards, sitemapUrls, toolPages, read, has: rel => fs.existsSync(path.join(root, rel)) };
}

function extractSitemapUrls(xml) {
  const urls = new Set();
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) urls.add(match[1]);
  return urls;
}

// Deterministic sample rotation: same seed, same cards; the default seed is the
// day of year, so consecutive scheduled runs walk the catalogue instead of
// re-checking the same six files forever.
function sampleCards(cards, count, seed) {
  if (count === 0) return [];
  const names = cards.map(card => card.name).sort();
  const picked = [];
  let state = (seed >>> 0) || 1;
  const next = () => {
    // mulberry32 — small, seeded, and dependency-free.
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const remaining = new Set(names);
  const wanted = Math.min(count, names.length);
  while (picked.length < wanted) {
    const name = names[Math.floor(next() * names.length)];
    if (remaining.delete(name)) picked.push(name);
  }
  return picked;
}

// --------------------------------------------------------------------- http

async function httpGet(url, { timeoutMs, allowHttp, maxRedirects = MAX_REDIRECTS }) {
  const started = Date.now();
  const chain = [];
  let current = url;
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    throw new Error(`refusing ${parsed.protocol} request to ${url} (use --allow-http for local fixtures)`);
  }

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'mrpr0phecy-production-monitor/1 (repo-owned probe)', 'accept': '*/*' },
      });
    } catch (error) {
      const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      const failure = new Error(timedOut
        ? `timed out after ${timeoutMs}ms`
        : `${error && error.message ? error.message : error}`);
      failure.code = timedOut ? 'TIMEOUT' : 'NETWORK';
      failure.chain = chain;
      throw failure;
    }

    const ttfbMs = Date.now() - started;
    const location = response.headers.get('location') || '';
    chain.push({ url: current, status: response.status, location, ttfbMs });

    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }

    const body = Buffer.from(await response.arrayBuffer());
    return {
      url,
      finalUrl: current,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      ttfbMs,
      totalMs: Date.now() - started,
      chain,
      redirects: chain.length - 1,
    };
  }
  throw new Error(`more than ${maxRedirects} redirects from ${url}`);
}

// A successful response is cached for the lifetime of one run so the hashing
// checks and the parsing checks share a single request per URL.
async function getWithRetries(url, options) {
  if (options.cache && options.cache.has(url)) return options.cache.get(url);
  const retryable = status => status >= 500 || status === 429;
  let lastError = null;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      const response = await httpGet(url, options);
      if (retryable(response.status) && attempt < options.retries) {
        await sleep(options.retryDelayMs);
        continue;
      }
      if (options.cache && response.status === 200) options.cache.set(url, response);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < options.retries) {
        await sleep(options.retryDelayMs);
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('unreachable');
}

// Live bytes differing from the repository is the one failure that is usually
// transient (a CDN edge catching up seconds after a deploy), so post-deploy
// runs pass --retry-mismatch <n> and this helper settles the question.
async function fetchBody(ctx, url) {
  let response = await getWithRetries(url, ctx);
  const repoPath = path.join(ctx.root, new URL(url).pathname.replace(/^\/+/, '').split('?')[0]);
  if (!fs.existsSync(repoPath)) return response;
  const repoHash = sha256(fs.readFileSync(repoPath));
  for (let attempt = 0; attempt < (ctx.retryMismatch || 0); attempt += 1) {
    if (sha256(response.body) === repoHash) break;
    await sleep(ctx.retryDelayMs);
    ctx.cache.delete(url);
    response = await getWithRetries(url, ctx);
  }
  return response;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ------------------------------------------------------------------- checks

function makeCheck(kind, surface, severity, ok, detail, evidence) {
  return { kind, surface, severity, ok, detail, evidence: evidence || {} };
}

// A skipped check is not a pass. It stays visible so nobody reads "no failures"
// as "everything was verified" — the same honesty rule the scoreboard applies to
// "not-measured".
function skipCheck(surface, detail) {
  return { kind: 'skipped', surface, severity: 'info', ok: true, skipped: true, detail, evidence: {} };
}

// The https and apex checks describe Pages settings that exist only for the
// public https origin, so local fixture runs skip them explicitly.
function isPublicHostname(host) {
  const bare = host.split(':')[0].replace(/^www\./, '');
  if (/^(localhost|127\.|0\.0\.0\.0)/.test(bare)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return false;
  return bare.includes('.');
}

function contentTypeExpectedFor(rel) {
  if (rel.endsWith('.json')) return [/^application\/json\b/i];
  if (rel.endsWith('.xml')) return [/^(application|text)\/xml\b/i];
  if (rel.endsWith('.html')) return [/^text\/html\b/i];
  if (rel.endsWith('.txt')) return [/^text\/plain\b/i];
  return null;
}

async function checkFile(ctx, rel) {
  const url = `${ctx.base}/${rel}`;
  const repoPath = path.join(ctx.root, rel);
  if (!fs.existsSync(repoPath)) {
    // A file the monitor was told to verify but cannot find in the repository
    // is a contract failure, never a quiet warning: this is the exact shape of
    // the .well-known incident, where the probe list and the repository had
    // silently stopped agreeing.
    return makeCheck('integrity', rel, 'fail', false,
      `repository file ${rel} is missing, so the live copy cannot be verified`, { url });
  }
  const repoBody = fs.readFileSync(repoPath);
  const repoHash = sha256(repoBody);

  let response;
  try {
    response = await fetchBody(ctx, url);
  } catch (error) {
    return makeCheck('availability', rel, 'fail', false, `unreachable: ${error.message}`,
      { url, error: error.code || 'NETWORK' });
  }

  const evidence = {
    url,
    finalUrl: response.finalUrl,
    status: response.status,
    ttfbMs: response.ttfbMs,
    bytes: response.body.length,
    contentType: response.headers['content-type'] || '',
    repoHash,
    liveHash: sha256(response.body),
    redirects: response.redirects,
  };

  if (response.status !== 200) {
    return makeCheck('availability', rel, 'fail', false,
      `expected 200, received ${response.status}`, evidence);
  }

  const checks = [];
  const mismatch = evidence.liveHash !== repoHash;
  if (mismatch) {
    checks.push(makeCheck('integrity', rel, 'fail', false,
      `live bytes differ from the repository (${repoBody.length} bytes in repo, ${response.body.length} live) — a deploy may be missing, partial, or stale`,
      evidence));
  } else {
    checks.push(makeCheck('integrity', rel, 'fail', true,
      `live bytes identical to the repository (${response.body.length} bytes)`, evidence));
  }

  // A wrong media type is a real visitor-facing defect (a JSON file served as
  // text/html breaks the catalogue loader), but tolerate parameter suffixes.
  const expected = response.status === 200 ? contentTypeExpectedFor(rel) : null;
  if (expected && !expected.some(pattern => pattern.test(evidence.contentType))) {
    checks.push(makeCheck('behaviour', rel, 'warn', false,
      `content-type ${evidence.contentType || '(missing)'} does not match ${rel}`, evidence));
  }

  if (response.ttfbMs > ctx.ttfbWarnMs) {
    checks.push(makeCheck('performance', rel, 'warn', false,
      `slow response: ${response.ttfbMs}ms (warning line ${ctx.ttfbWarnMs}ms; runner TTFB, not a field metric)`, evidence));
  }

  if (response.redirects > 0) {
    checks.push(makeCheck('behaviour', rel, 'warn', false,
      `${rel} redirected ${response.redirects} hop(s) to ${response.finalUrl}`, evidence));
  }

  return checks;
}

async function checkProbe(ctx, rel, { expect }) {
  const url = `${ctx.base}/${rel.replace(/^\/+/, '')}`;
  let response;
  try {
    response = await fetchBody(ctx, url);
  } catch (error) {
    return makeCheck('availability', rel, 'fail', false, `unreachable: ${error.message}`,
      { url, error: error.code || 'NETWORK' });
  }
  const evidence = {
    url,
    finalUrl: response.finalUrl,
    status: response.status,
    ttfbMs: response.ttfbMs,
    bytes: response.body.length,
    contentType: response.headers['content-type'] || '',
    redirects: response.redirects,
  };
  if (response.status !== expect) {
    return makeCheck('availability', rel, 'fail', false, `expected ${expect}, received ${response.status}`, evidence);
  }
  if (response.ttfbMs > ctx.ttfbWarnMs) {
    return makeCheck('performance', rel, 'warn', false,
      `slow response: ${response.ttfbMs}ms (warning line ${ctx.ttfbWarnMs}ms; runner TTFB, not a field metric)`, evidence);
  }
  return makeCheck('availability', rel, 'fail', true, `${response.status} in ${response.ttfbMs}ms`, evidence);
}

// The custom 404 is a shipped deliverable (`custom_404: true` on Pages): a
// missing page must 404 *and* must serve the repository's own 404.html. Losing
// the second half silently turns every broken link into a GitHub default page.
async function checkNotFound(ctx) {
  const rel = `__monitor-missing-${Date.now().toString(36)}.html`;
  const url = `${ctx.base}/${rel}`;
  const repoPath = path.join(ctx.root, '404.html');
  let response;
  try {
    response = await fetchBody(ctx, url);
  } catch (error) {
    return makeCheck('behaviour', '404 handling', 'fail', false, `unreachable: ${error.message}`,
      { url, error: error.code || 'NETWORK' });
  }
  const evidence = {
    url,
    status: response.status,
    contentType: response.headers['content-type'] || '',
    liveHash: sha256(response.body),
    repoHash: fs.existsSync(repoPath) ? sha256(fs.readFileSync(repoPath)) : '',
  };
  if (response.status !== 404) {
    return makeCheck('behaviour', '404 handling', 'fail', false,
      `a nonexistent path returned ${response.status}, not 404`, evidence);
  }
  if (!evidence.repoHash || evidence.liveHash !== evidence.repoHash) {
    return makeCheck('behaviour', '404 handling', 'fail', false,
      'the 404 route served a body that is not this repository\'s 404.html', evidence);
  }
  return makeCheck('behaviour', '404 handling', 'fail', true, 'missing paths 404 with the shipped page', evidence);
}

// HTTPS enforcement is a Pages setting (`https_enforced`), not a file in the
// repository, so it can only be verified from outside: the plain-http origin
// must redirect to https with the path preserved.
async function checkHttpsUpgrade(ctx) {
  const host = new URL(ctx.base).host;
  if (!ctx.base.startsWith('https://') || !isPublicHostname(host)) {
    return skipCheck('https enforcement', 'only meaningful against the real https origin');
  }
  const url = `http://${host}/robots.txt`;
  let response;
  try {
    response = await httpGet(url, { ...ctx, allowHttp: true });
  } catch (error) {
    return makeCheck('behaviour', 'https enforcement', 'fail', false,
      `plain-http request failed: ${error.message}`, { url, error: error.code || 'NETWORK' });
  }
  const firstHop = response.chain[0];
  const evidence = { url, firstStatus: firstHop ? firstHop.status : null, chain: response.chain, finalUrl: response.finalUrl };
  const redirectedToHttps = firstHop && firstHop.status >= 300 && firstHop.status < 400 && /^https:\/\//i.test(firstHop.location || '');
  if (!redirectedToHttps) {
    return makeCheck('behaviour', 'https enforcement', 'fail', false,
      `http:// did not redirect to https:// (status ${firstHop ? firstHop.status : 'none'})`, evidence);
  }
  if (!/\/robots\.txt$/.test(new URL(response.finalUrl).pathname)) {
    return makeCheck('behaviour', 'https enforcement', 'fail', false,
      `the https redirect lost the path (landed on ${response.finalUrl})`, evidence);
  }
  return makeCheck('behaviour', 'https enforcement', 'fail', true, 'plain http upgrades to https and keeps the path', evidence);
}

// The CNAME file makes the www host canonical; the bare apex is expected to
// redirect to it. Kept at warning level because the apex behaviour is a Pages
// setting rather than a repository fact, so it is reported as evidence and
// promoted to a failure only once real runs confirm the expectation.
async function checkApexRedirect(ctx) {
  const apex = new URL(ctx.base).host.replace(/^www\./, '');
  if (!isPublicHostname(apex)) {
    return skipCheck('apex host', 'only meaningful for the public domain');
  }
  const url = `https://${apex}/robots.txt`;
  let response;
  try {
    response = await getWithRetries(url, { ...ctx, retries: 0 });
  } catch (error) {
    return makeCheck('behaviour', 'apex host', 'warn', false,
      `apex host ${apex} did not answer: ${error.message}`, { url });
  }
  const evidence = { url, status: response.status, chain: response.chain, finalUrl: response.finalUrl };
  if (response.status === 200 && /^text\/plain/i.test(response.headers['content-type'] || '')) {
    return makeCheck('behaviour', 'apex host', 'warn', true,
      `${apex} serves the site directly (no redirect to ${new URL(ctx.base).host}) — confirm this is intended`, evidence);
  }
  if (response.finalUrl.includes(new URL(ctx.base).host)) {
    return makeCheck('behaviour', 'apex host', 'warn', true, `${apex} redirects to the canonical host`, evidence);
  }
  return makeCheck('behaviour', 'apex host', 'warn', false,
    `${apex} answered ${response.status} without reaching the canonical host`, evidence);
}

// The live catalogue is the file every page depends on. Byte-identity already
// covers tampering; this covers the failure modes that keep the bytes valid
// JSON while breaking the site (truncated array, duplicate slugs).
async function checkCatalogueIntegrity(ctx) {
  const url = `${ctx.base}/cards/cards.json`;
  let response;
  try {
    response = await getWithRetries(url, { ...ctx, retries: 0 });
  } catch (error) {
    return makeCheck('behaviour', 'catalogue integrity', 'fail', false, `unreachable: ${error.message}`, { url });
  }
  if (response.status !== 200) {
    return makeCheck('behaviour', 'catalogue integrity', 'fail', false, `expected 200, received ${response.status}`, { url });
  }
  let live;
  try {
    live = JSON.parse(response.body.toString('utf8'));
  } catch (error) {
    return makeCheck('behaviour', 'catalogue integrity', 'fail', false,
      `live cards.json is not valid JSON: ${error.message}`, { url, bytes: response.body.length });
  }
  if (!Array.isArray(live)) {
    return makeCheck('behaviour', 'catalogue integrity', 'fail', false, 'live cards.json is not an array', { url });
  }
  const duplicates = live.map(card => card && card.name).filter((name, index, all) => name && all.indexOf(name) !== index);
  const evidence = { url, liveCount: live.length, repoCount: ctx.repo.cards.length, duplicates: duplicates.slice(0, 5) };
  const failures = [];
  if (live.length !== ctx.repo.cards.length) {
    failures.push(`live catalogue has ${live.length} cards, repository has ${ctx.repo.cards.length}`);
  }
  if (duplicates.length) failures.push(`duplicate slugs on the live site: ${duplicates.slice(0, 5).join(', ')}`);
  if (failures.length) {
    return makeCheck('behaviour', 'catalogue integrity', 'fail', false, failures.join('; '), evidence);
  }
  return makeCheck('behaviour', 'catalogue integrity', 'fail', true,
    `${live.length} cards, no duplicate slugs`, evidence);
}

async function checkSitemapIntegrity(ctx) {
  const url = `${ctx.base}/sitemap.xml`;
  let response;
  try {
    response = await getWithRetries(url, { ...ctx, retries: 0 });
  } catch (error) {
    return makeCheck('behaviour', 'sitemap integrity', 'fail', false, `unreachable: ${error.message}`, { url });
  }
  if (response.status !== 200) {
    return makeCheck('behaviour', 'sitemap integrity', 'fail', false, `expected 200, received ${response.status}`, { url });
  }
  const liveUrls = extractSitemapUrls(response.body.toString('utf8'));
  if (liveUrls.size === 0) {
    return makeCheck('behaviour', 'sitemap integrity', 'fail', false, 'live sitemap lists no URLs', { url });
  }
  const missing = [...ctx.repo.sitemapUrls].filter(u => !liveUrls.has(u));
  const extra = [...liveUrls].filter(u => !ctx.repo.sitemapUrls.has(u));
  const evidence = { url, liveCount: liveUrls.size, repoCount: ctx.repo.sitemapUrls.size, missing: missing.slice(0, 5), extra: extra.slice(0, 5) };
  if (missing.length || extra.length) {
    return makeCheck('behaviour', 'sitemap integrity', 'fail', false,
      `live sitemap differs from the repository (${missing.length} missing, ${extra.length} unexpected)`, evidence);
  }
  return makeCheck('behaviour', 'sitemap integrity', 'fail', true, `${liveUrls.size} URLs match the repository`, evidence);
}

// ------------------------------------------------------------------ runner

// Day of year (UTC) so a scheduled run walks the catalogue instead of
// re-checking the same handful of cards on every pass.
function defaultSeed() {
  const now = new Date();
  return Math.floor((now - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
}

async function pool(items, limit, worker) {
  const results = [];
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function flatten(results) {
  const out = [];
  for (const item of results) {
    if (Array.isArray(item)) out.push(...item);
    else if (item) out.push(item);
  }
  return out;
}

async function runChecks(options) {
  const repo = loadRepo(options.root);
  const base = (options.base || `https://${repo.cname}`).replace(/\/+$/, '');
  const ctx = {
    ...options,
    base,
    repo,
    root: options.root,
    strict: options.strict,
    cache: new Map(),
  };

  const seed = options.seed === null ? defaultSeed() : options.seed;
  const sampled = sampleCards(repo.cards, options.sample, seed);
  const cardBySlug = new Map(repo.cards.map(card => [card.name, card]));

  // Every file is hashed against the repository, including the three the
  // structural checks parse; those reuse the cached response, so nothing is
  // fetched twice.
  const files = [...new Set([...CRITICAL_FILES, ...repo.toolPages, ...options.extraFiles])];
  const cardFiles = sampled.map(slug => {
    const card = cardBySlug.get(slug);
    return card && card.file ? `cards/${card.file}` : `cards/${slug}.html`;
  });

  const fileChecks = await pool([...files, ...cardFiles], options.concurrency, rel => checkFile(ctx, rel));

  const probes = [
    ...cardFiles.slice(0, 1).map(rel => ({ rel: `tool.html?card=${path.basename(rel, '.html')}&embed=1`, expect: 200 })),
    ...options.extraProbes.map(rel => ({ rel, expect: 200 })),
  ];
  const probeChecks = await pool(probes, options.concurrency, probe => checkProbe(ctx, probe.rel, probe));

  const structural = await Promise.all([
    checkCatalogueIntegrity(ctx),
    checkSitemapIntegrity(ctx),
    checkNotFound(ctx),
    checkHttpsUpgrade(ctx),
    checkApexRedirect(ctx),
  ]);

  const checks = [...flatten(fileChecks), ...probeChecks, ...structural];
  const failures = checks.filter(check => !check.ok && check.severity === 'fail');
  const warnings = checks.filter(check => !check.ok && check.severity === 'warn');
  const skipped = checks.filter(check => check.skipped);
  const slowest = checks
    .filter(check => check.evidence && typeof check.evidence.ttfbMs === 'number')
    .sort((a, b) => b.evidence.ttfbMs - a.evidence.ttfbMs)[0];

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    base,
    commit: options.commit || '',
    repoUrl: options.repoUrl ? 'https://github.com/' + options.repoUrl : '',
    sample: { seed, cards: sampled },
    summary: {
      checks: checks.length,
      passed: checks.filter(check => check.ok && !check.skipped).length,
      failed: failures.length,
      warned: warnings.length,
      skipped: skipped.length,
      status: failures.length ? 'fail' : 'pass',
      slowestTtfbMs: slowest ? slowest.evidence.ttfbMs : null,
      slowestSurface: slowest ? slowest.surface : null,
    },
    checks,
  };
}

// ------------------------------------------------------------------ reports

function escapeCell(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdown(report, { maxRows = 40 } = {}) {
  const lines = [];
  const { summary } = report;
  const icon = summary.status === 'pass' ? (summary.warned ? '🟡' : '🟢') : '🔴';
  lines.push(`## ${icon} Production contract: ${summary.status === 'pass' ? 'holding' : 'BROKEN'}`);
  lines.push('');
  lines.push(`- Origin: \`${report.base}\``);
  lines.push(`- Checked: ${report.generatedAt}${report.commit ? ` (commit \`${report.commit.slice(0, 12)}\`)` : ''}`);
  lines.push(`- Result: ${summary.checks} checks — ${summary.passed} passed, ${summary.failed} failed, ${summary.warned} warning(s), ${summary.skipped || 0} skipped`);
  if (summary.slowestTtfbMs !== null) {
    lines.push(`- Slowest response: ${summary.slowestTtfbMs}ms on \`${summary.slowestSurface}\` (runner TTFB, not field data)`);
  }
  lines.push(`- Sample seed: ${report.sample.seed} → cards: ${report.sample.cards.join(', ') || '(none)'}`);
  lines.push('');
  const runbookPath = 'docs/OPERATIONS.md';
  const runbook = report.repoUrl
    ? '[' + runbookPath + '](' + report.repoUrl + '/blob/main/' + runbookPath + ')'
    : runbookPath;
  lines.push('Runbook: ' + runbook + ' — severity ladder, triage, rollback and fix-forward rules.');

  const problems = report.checks.filter(check => !check.ok);
  lines.push('');
  lines.push('| Severity | Surface | Detail |');
  lines.push('| --- | --- | --- |');
  if (!problems.length) {
    lines.push('| — | — | No failures or warnings |');
  } else {
    for (const check of problems.slice(0, maxRows)) {
      lines.push(`| ${check.severity === 'fail' ? 'FAIL' : 'WARN'} | \`${escapeCell(check.surface)}\` | ${escapeCell(check.detail)} |`);
    }
    if (problems.length > maxRows) lines.push(`| … | … | ${problems.length - maxRows} more |`);
  }
  return `${lines.join('\n')}\n`;
}

function writeReport(paths, report) {
  if (paths.jsonPath) {
    fs.mkdirSync(path.dirname(paths.jsonPath), { recursive: true });
    fs.writeFileSync(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (paths.summaryPath) {
    fs.mkdirSync(path.dirname(paths.summaryPath), { recursive: true });
    fs.writeFileSync(paths.summaryPath, renderMarkdown(report));
  }
}

function renderConsole(report) {
  const lines = [];
  for (const check of report.checks) {
    if (check.ok) continue;
    lines.push(`  ${check.severity === 'fail' ? 'FAIL' : 'WARN'}  ${check.surface}: ${check.detail}`);
  }
  const { summary } = report;
  lines.push(`production contract: ${summary.checks} checks, ${summary.failed} failure(s), ${summary.warned} warning(s) — ${summary.status.toUpperCase()}`);
  return `${lines.join('\n')}\n`;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  let report;
  try {
    report = await runChecks(options);
  } catch (error) {
    process.stderr.write(`check-production: cannot run — ${error.message}\n`);
    return 2;
  }
  writeReport(options, report);
  if (!options.quiet) process.stdout.write(renderConsole(report));
  const failed = report.summary.failed > 0 || (options.strict && report.summary.warned > 0);
  return failed ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; })
    .catch(error => {
      process.stderr.write(`check-production: unexpected failure — ${error.stack || error}\n`);
      process.exitCode = 2;
    });
}

module.exports = {
  parseArgs,
  runChecks,
  criticalFiles,
  renderMarkdown,
  renderConsole,
  writeReport,
  loadRepo,
  sampleCards,
  extractSitemapUrls,
  httpGet,
  sha256,
  usage,
  DEFAULT_TIMEOUT_MS,
};
