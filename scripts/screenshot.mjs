#!/usr/bin/env node
/**
 * screenshot.mjs — look at a page at 360 px and 1440 px without a desktop.
 *
 * AGENTS.md §5 asks you to inspect visible UI changes at
 * both widths. In a sandbox that is the slow part: Playwright's browser
 * download is often blocked, apt is often unavailable, and the one Chromium
 * that installs from npm alone (@sparticuz/chromium) dies on a missing
 * libnspr4.so unless it thinks it is on AWS Lambda. This script does the
 * whole dance: it serves the repository itself, unpacks Chromium's shared
 * libraries where the browser can find them, and writes one PNG per width.
 *
 * One-time setup, OUTSIDE the repository (AGENTS.md §2):
 *
 *   mkdir -p /tmp/tenv && cd /tmp/tenv && npm i puppeteer-core @sparticuz/chromium
 *
 * Usage (from the repository root):
 *
 *   node scripts/screenshot.mjs index.html
 *   node scripts/screenshot.mjs "tool.html?card=bmi" /tmp/shots/bmi --full
 *   node scripts/screenshot.mjs guides.html --widths 390 --dpr 2 --scroll 600
 *   node scripts/screenshot.mjs https://example.com/          (any URL works too)
 *
 *   <page>          a repository path (query string allowed) or a full URL
 *   [out-prefix]    default /tmp/shots/<page>; writes <out-prefix>-<width>.png
 *   --widths a,b    viewport widths (default 360,1440)
 *   --height n      viewport height (default 900)
 *   --full          capture the full page, not just the viewport
 *   --dpr n         device pixel ratio (default 1)
 *   --scroll y      scroll to y before capturing
 *   --wait ms       settle time after load (default 700)
 *   --network       allow requests off the local server (blocked by default,
 *                   so analytics and CDNs cannot stall or vary a screenshot)
 *
 * Set CHROME_PATH to use a browser you already have instead of Sparticuz.
 * Motion is emulated as reduced, so every screenshot is the settled page.
 * Known limit: Sparticuz ships no colour-emoji font, so emoji render as boxes.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync, readdirSync, createReadStream } from 'node:fs';
import { join, extname, dirname, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const TENV = process.env.TENV || '/tmp/tenv';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.wasm': 'application/wasm',
};

function usage(msg) {
  if (msg) console.error(`screenshot: ${msg}`);
  console.error('usage: node scripts/screenshot.mjs <page> [out-prefix] [--widths 360,1440] [--height 900] [--full] [--dpr 1] [--scroll 0] [--wait 700] [--network]');
  process.exit(2);
}

function parseArgs(argv) {
  const o = { widths: [360, 1440], height: 900, full: false, dpr: 1, scroll: 0, wait: 700, network: false, pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) usage(`${a} needs a value`); return argv[++i]; };
    if (a === '--widths') o.widths = val().split(',').map(Number).filter(Boolean);
    else if (a === '--height') o.height = Number(val());
    else if (a === '--dpr') o.dpr = Number(val());
    else if (a === '--scroll') o.scroll = Number(val());
    else if (a === '--wait') o.wait = Number(val());
    else if (a === '--full') o.full = true;
    else if (a === '--network') o.network = true;
    else if (a === '-h' || a === '--help') usage();
    else if (a.startsWith('--')) usage(`unknown option ${a}`);
    else o.pos.push(a);
  }
  if (!o.pos.length) usage('no page given');
  if (!o.widths.length) usage('--widths needs at least one number');
  return o;
}

// Scratch modules live in /tmp/tenv, not beside this file, so resolve them by
// hand: read the package's own entry point and import it by absolute URL.
async function loadScratch(name) {
  const dir = join(TENV, 'node_modules', name);
  if (!existsSync(join(dir, 'package.json'))) {
    console.error(`screenshot: ${name} is not installed in ${TENV}.\n  mkdir -p ${TENV} && cd ${TENV} && npm i puppeteer-core @sparticuz/chromium`);
    process.exit(3);
  }
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const pick = (e) => (typeof e === 'string' ? e : e && (pick(e.import) || pick(e.node) || pick(e.default) || pick(e.require)));
  const entry = pick(pkg.exports && (pkg.exports['.'] || pkg.exports)) || pkg.module || pkg.main || 'index.js';
  const mod = await import(pathToFileURL(join(dir, entry)).href);
  return mod.default || mod;
}

// Sparticuz unpacks its own shared libraries only on Amazon Linux 2023. Do it
// here for every other Linux: brotli is built into Node, tar is everywhere.
function sparticuzEnv() {
  const bin = join(TENV, 'node_modules', '@sparticuz', 'chromium', 'bin');
  const base = join(tmpdir(), 'al2023');
  const lib = join(base, 'lib');
  if (!existsSync(lib) && existsSync(join(bin, 'al2023.tar.br'))) {
    mkdirSync(base, { recursive: true });
    execFileSync('tar', ['-x', '-C', base], { input: brotliDecompressSync(readFileSync(join(bin, 'al2023.tar.br'))) });
  }
  const env = { ...process.env, LD_LIBRARY_PATH: [lib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') };
  // Keep the system's fonts when it has any; otherwise use Sparticuz's own.
  const fontDirs = ['/usr/share/fonts', '/usr/local/share/fonts'];
  const hasSystemFonts = fontDirs.some((d) => existsSync(d) && readdirSync(d).length > 0);
  if (!hasSystemFonts && !env.FONTCONFIG_PATH) env.FONTCONFIG_PATH = join(tmpdir(), 'fonts');
  return env;
}

// A tiny static server over the repository, so a relative page just works and
// nothing needs to be left running.
function serveRepo() {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = resolve(ROOT, '.' + path);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const opts = parseArgs(process.argv.slice(2));
const target = opts.pos[0];
const isUrl = /^https?:\/\//i.test(target);
const slug = target.replace(/^https?:\/\//i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';
const prefix = opts.pos[1] || join('/tmp/shots', slug);
mkdirSync(dirname(resolve(prefix)), { recursive: true });

const puppeteer = await loadScratch('puppeteer-core');
let executablePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
let args = ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--hide-scrollbars'];
let env = process.env;
if (!executablePath) {
  const chromium = await loadScratch('@sparticuz/chromium');
  executablePath = await chromium.executablePath();
  args = [...chromium.args, ...args];
  env = sparticuzEnv();
}

const server = isUrl ? null : await serveRepo();
const origin = server ? `http://127.0.0.1:${server.address().port}` : null;
const url = isUrl ? target : `${origin}/${target.replace(/^\.?\//, '')}`;
const browser = await puppeteer.launch({ executablePath, args, env, headless: true });
let errors = 0;
try {
  for (const width of opts.widths) {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setViewport({ width, height: opts.height, deviceScaleFactor: opts.dpr });
    if (origin && !opts.network) {
      await page.setRequestInterception(true);
      page.on('request', (r) => (r.url().startsWith(origin) || r.url().startsWith('data:') || r.url().startsWith('blob:') ? r.continue() : r.abort()));
    }
    page.on('pageerror', (e) => { errors++; console.error(`  PAGEERROR ${e.message.split('\n')[0]}`); });
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|ERR_BLOCKED/.test(m.text())) console.error(`  console.error ${m.text().slice(0, 200)}`);
    });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 }).catch((e) => { errors++; console.error(`  goto ${e.message}`); });
    if (opts.scroll) await page.evaluate((y) => window.scrollTo(0, y), opts.scroll);
    await new Promise((r) => setTimeout(r, opts.wait));
    const out = `${prefix}-${width}${opts.dpr !== 1 ? `@${opts.dpr}x` : ''}.png`;
    await page.screenshot({ path: out, fullPage: opts.full });
    console.log(`wrote ${out}`);
    await page.close();
  }
} finally {
  await browser.close();
  if (server) server.close();
}
if (errors) console.error(`screenshot: ${errors} page error(s) above — the PNGs were still written.`);
