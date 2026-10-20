#!/usr/bin/env node
/**
 * perf-home.mjs — what the home page actually costs on a phone-shaped connection.
 *
 * This is the measurement behind every speed claim in this repository, kept in
 * the repo so the next change can be measured the same way instead of being
 * argued about. It serves the working tree the way GitHub Pages does (gzip,
 * ETag/304, max-age=600), throttles the browser to a mid-range phone on a slow
 * connection (4x CPU, 1.6 Mbps, 150 ms RTT), and reports what a visitor feels:
 * when the first and largest content painted, how long the main thread was
 * blocked, how many bytes came down, and what a full-length scroll costs.
 *
 * The budgets it checks in --check mode are deliberately loose: this machine is
 * shared and a single run of a throttled browser is noisy, so the thresholds
 * catch a regression of the size that matters (a 210 KB JSON catalogue back in
 * the critical path; a document-wide restyle on every scroll) and ignore jitter.
 * scripts/perf-budget.js is the deterministic half of the same promise and runs
 * in the gate; this is the half you run before shipping anything that touches
 * the first screen.
 *
 * Usage:
 *   node scripts/perf-home.mjs                 # 3 cold runs, report the median
 *   node scripts/perf-home.mjs --check         # same, exit 1 if a budget is blown
 *   node scripts/perf-home.mjs --runs 1 --fast # one run, no throttling (dev loop)
 *   node scripts/perf-home.mjs --page tools.html
 *   LOGREQ=1 node scripts/perf-home.mjs --runs=1   # per-request sizes, LCP element
 *   LOGSRV=1 node scripts/perf-home.mjs --runs=1   # with timestamps, from the server
 *
 * Requirements: Chromium + puppeteer-core, kept OUTSIDE the repository
 * (AGENTS.md §2). The script looks for them in ./node_modules first and then in
 * /tmp/tenv/node_modules, which is where the test harness lives:
 *
 *   mkdir -p /tmp/tenv && cd /tmp/tenv
 *   npm install puppeteer-core @sparticuz/chromium
 *
 * Exit codes: 0 measured (and inside budget, with --check), 1 over budget,
 * 2 harness missing — the last is loud on purpose, because a speed check that
 * silently skips itself is how the catalogue came back twice.
 */

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync, brotliDecompressSync } from 'node:zlib';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, resolve, sep, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = process.env.PERF_SCRATCH || '/tmp/tenv';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const FAST = args.includes('--fast');
const RUNS = Math.max(1, Number((args.find((a) => a.startsWith('--runs=')) || '').split('=')[1] || 3));
const PAGE = (args.find((a) => a.startsWith('--page=')) || '').split('=')[1] || 'index.html';

// Every number here is a ceiling a visitor can feel, not an aspiration.
const BUDGET = {
  // `load` is reported but not budgeted: it is a countdown of after-load work
  // (the worker's install, the deferred stylesheet) and says nothing about when
  // the page appeared or became usable.
  fcp: 1800,           // ms to the first painted content
  lcp: 2500,           // ms to the largest painted content
  transfer: 260,       // KB gzip before the list is touched (was 501 KB with the catalogue in the critical path)
  blocked: 1000,       // ms of main-thread time over 50 ms per task
  scrollBlocked: 1400, // ms blocked across one full-page scroll
};

async function loadScratch(name) {
  for (const base of [ROOT, SCRATCH]) {
    const dir = join(base, 'node_modules', name);
    if (!existsSync(dir)) continue;
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const pick = (e) => (typeof e === 'string' ? e : e && (pick(e.import) || pick(e.node) || pick(e.default) || pick(e.require)));
    const entry = pick(pkg.exports && (pkg.exports['.'] || pkg.exports)) || pkg.module || pkg.main || 'index.js';
    const mod = await import(pathToFileURL(join(dir, entry)).href);
    return mod.default || mod;
  }
  console.error([
    `perf-home.mjs: cannot find ${name}.`,
    'Install the harness outside the repository (AGENTS.md §2):',
    '',
    `  mkdir -p ${SCRATCH} && cd ${SCRATCH}`,
    '  npm install puppeteer-core @sparticuz/chromium',
    '',
    'No dependency is added to the site itself.',
  ].join('\n'));
  process.exit(2);
}

function chromiumEnv() {
  // @sparticuz/chromium ships its shared libraries as a tarball; unpack them
  // once into the scratch dir so the binary can start on a minimal image.
  const bin = join(SCRATCH, 'node_modules', '@sparticuz', 'chromium', 'bin');
  const base = join(tmpdir(), 'al2023');
  const lib = join(base, 'lib');
  if (!existsSync(lib) && existsSync(join(bin, 'al2023.tar.br'))) {
    mkdirSync(base, { recursive: true });
    execFileSync('tar', ['-x', '-C', base], { input: brotliDecompressSync(readFileSync(join(bin, 'al2023.tar.br'))) });
  }
  return { ...process.env, LD_LIBRARY_PATH: [lib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') };
}

let bytesServed = 0;
function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = resolve(ROOT, '.' + path);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('nf'); return; }
    const body = readFileSync(file);
    const etag = '"' + createHash('sha1').update(body).digest('hex').slice(0, 16) + '"';
    // GitHub Pages answers 304s and sends max-age=600. Without both, the
    // service worker's own freshness window re-downloads every asset and the
    // transfer number below is a lie.
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag }); res.end(); return; }
    // It also compresses text; a server that does not inflates every HTML, CSS
    // and JS number here by 4-5x.
    const gz = gzipSync(body, { level: 9 });
    bytesServed += gz.length;
    if (process.env.LOGSRV) console.log(`      [srv] ${String(Date.now() % 100000).padStart(5)} ${(gz.length / 1024).toFixed(0).padStart(4)} KB ${path}`);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-encoding': 'gzip', 'content-length': gz.length,
      etag, 'cache-control': 'public, max-age=600',
    });
    res.end(gz);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const puppeteer = await loadScratch('puppeteer-core');
const chromium = await loadScratch('@sparticuz/chromium');
const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
async function run(page) {
  // A fresh browser per run: the service worker outlives the tab, and a second
  // run in the same profile is served from its cache — which is the right
  // number for a returning visitor and the wrong one for this table.
  const browser = await launch();
  const tab = await browser.newPage();
  await tab.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await tab.evaluateOnNewDocument(() => {
    window.__lt = [];
    window.__lcp = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); })
        .observe({ type: 'longtask', buffered: true });
    } catch (e) {}
    try {
      window.__lcpEntries = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          window.__lcpEntries.push({ t: Math.round(e.startTime), r: Math.round(e.renderTime || 0), size: e.size, el: e.element ? e.element.tagName + '.' + (e.element.className || '') : (e.url || '?') });
          window.__lcp = Math.max(window.__lcp, e.startTime);
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {}
  });
  const cdp = await tab.createCDPSession();
  await cdp.send('Network.enable');
  const sizes = new Map();
  if (process.env.LOGREQ) {
    cdp.on('Network.responseReceived', (e) => sizes.set(e.requestId, { url: e.response.url.replace(origin, ''), size: 0 }));
    cdp.on('Network.loadingFinished', (e) => { const s = sizes.get(e.requestId); if (s) s.size = e.encodedDataLength || 0; });
  }
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  await cdp.send('Network.clearBrowserCache').catch(() => {});
  if (!FAST) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
    });
  }
  await cdp.send('Performance.enable');
  const before = bytesServed;

  const t0 = Date.now();
  await tab.goto(`${origin}/${page}`, { waitUntil: 'load', timeout: 120000 });
  const load = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 600));

  if (process.env.LOGREQ) console.log('   lcp', JSON.stringify(await tab.evaluate(() => window.__lcpEntries)));
  const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const nav = await tab.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((x) => [x.name, Math.round(x.startTime)]));
    return { dcl: Math.round(n.domContentLoadedEventEnd || 0), fcp: paint['first-contentful-paint'] || 0, lcp: Math.round(window.__lcp || 0), lt: window.__lt || [] };
  });
  const blocked = notThrottledBlocked(nav.lt);
  // The first visit's own transfer, before the scroll pass below: scrolling to
  // the list is a different purchase (it fetches the catalogue on purpose) and
  // counting it here would make every page look 210 KB heavier than it is.
  const firstVisitBytes = (bytesServed - before) / 1024;

  // A full-page scroll, the way a thumb does it: this is where a sticky bar
  // that publishes inherited properties, or a list that re-lays-out per row,
  // shows up as dropped frames.
  await tab.evaluate(() => { window.__lt = []; document.documentElement.scrollTop = 0; });
  const styleBefore = metrics.RecalcStyleDuration || 0;
  const layoutBefore = metrics.LayoutDuration || 0;
  const scrollStart = Date.now();
  await tab.evaluate(async () => {
    const height = document.documentElement.scrollHeight;
    for (let y = 0; y < height; y += 120) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 16));
    }
  });
  const scroll = Date.now() - scrollStart;
  const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const scrollStats = await tab.evaluate(() => ({ lt: window.__lt || [] }));

  if (process.env.LOGREQ) {
    for (const s of [...sizes.values()].sort((a, b) => b.size - a.size).slice(0, 16)) {
      console.log(`      ${(s.size / 1024).toFixed(0).padStart(4)} KB  ${s.url.split('?')[0]}`);
    }
  }
  const transfer = firstVisitBytes;
  const scrollBytes = (bytesServed - before) / 1024 - firstVisitBytes;
  await tab.close();
  await browser.close();
  return {
    load,
    dcl: nav.dcl,
    fcp: nav.fcp,
    // Headless Chromium occasionally reports no LCP entry at all. LCP is never
    // earlier than FCP, so falling back to it is honest, not a fudge.
    lcp: Math.max(nav.lcp, nav.fcp),
    blocked,
    longest: nav.lt.length ? Math.max(...nav.lt) : 0,
    transfer, scrollBytes,
    style: Math.round(((after.RecalcStyleDuration || 0) - styleBefore) * 1000),
    layout: Math.round(((after.LayoutDuration || 0) - layoutBefore) * 1000),
    scroll,
    scrollTasks: scrollStats.lt.length,
    scrollBlocked: notThrottledBlocked(scrollStats.lt),
  };
}

function notThrottledBlocked(tasks) {
  return tasks.reduce((sum, ms) => sum + Math.max(0, ms - 50), 0);
}

const executable = await chromium.executablePath();
const launch = () => puppeteer.launch({
  executablePath: executable,
  args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
  env: chromiumEnv(),
  headless: true,
});
const results = [];
for (let i = 0; i < RUNS; i++) results.push(await run(PAGE));
server.close();

const median = (key) => {
  const values = results.map((r) => r[key]).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
};
const summary = Object.fromEntries(Object.keys(results[0]).map((k) => [k, median(k)]));

console.log(`\n${PAGE} — ${RUNS} cold run${RUNS === 1 ? '' : 's'}${FAST ? ' (unthrottled)' : ' at 4x CPU / 1.6 Mbps / 150 ms'}\n`);
console.log('  when it appears');
console.log(`    load            ${summary.load} ms`);
console.log(`    DOMContentLoaded ${summary.dcl} ms`);
console.log(`    FCP             ${summary.fcp} ms`);
console.log(`    LCP             ${summary.lcp} ms`);
console.log('  what it costs');
console.log(`    transfer        ${summary.transfer.toFixed(0)} KB gzip before the list is touched`);
console.log(`    later           ${summary.scrollBytes.toFixed(0)} KB gzip (worker precache + the catalogue, once the list is reached)`);
console.log(`    main thread     ${summary.blocked} ms blocked (longest task ${summary.longest} ms)`);
console.log(`    scroll          ${summary.scroll} ms · ${summary.scrollTasks} long tasks · ${summary.scrollBlocked} ms blocked`);
console.log(`    style / layout  ${summary.style} ms / ${summary.layout} ms during the scroll`);

if (!CHECK) {
  console.log('\n  (--check turns these into pass/fail against the budgets in this file)\n');
  process.exit(0);
}

const breaches = Object.entries({
  fcp: BUDGET.fcp, lcp: BUDGET.lcp,
  transfer: BUDGET.transfer, blocked: BUDGET.blocked, scrollBlocked: BUDGET.scrollBlocked,
}).filter(([key, budget]) => summary[key] > budget);

if (breaches.length) {
  console.log('\nPERF CHECK FAILED — a visitor would feel this:\n');
  for (const [key, budget] of breaches) console.log(`  ✗ ${key} ${Math.round(summary[key])} > ${budget}`);
  console.log('');
  process.exit(1);
}
console.log('\nPERF CHECK PASSED — inside every budget in this file.\n');
