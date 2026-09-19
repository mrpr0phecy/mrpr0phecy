#!/usr/bin/env node
// Real-browser probe for the main page's live window and park — the counterpart
// of scripts/staff/browser-check.mjs, for the one class of claim a node harness
// cannot answer: what a layout engine *does*, not what the code asked for.
//
// It is optional and manual on purpose. The zero-dependency CI suite must stay
// zero-dependency (AGENTS.md), and no CI here has a browser. Install Playwright
// OUTSIDE the repository and point this at it, exactly like browser-check.mjs:
//
//   cd /tmp && npm i playwright && npx playwright install chromium
//   STAFF_PLAYWRIGHT=/tmp/node_modules/playwright node /path/to/repo/scripts/staff/live-window-check.mjs
//   STAFF_CHROMIUM_PATH=/usr/bin/chromium-browser node scripts/staff/live-window-check.mjs --json
//
// It serves the repository itself over node:http (index.html fetches
// cards/*.html, so file:// cannot work), and prints measured numbers. Invariants
// it treats as hard failures are the ones home-app.js claims:
//
//   1. a parked row is a tile — the same height a never-mounted tile has
//   2. parking a row above the viewport does not move what the reader is looking
//      at (this is `commitScrollHold()`'s whole job, and no node test can prove it)
//   3. a parked tool keeps its canvas bitmap (the park must be a move, not a reset)
//   4. `?park=full` behaves like the old page: the row stays claimed
//
// Everything else (frame timings on a throttled phone) is reported, not asserted:
// those numbers are for a human deciding what MOUNT_WINDOW_DEFAULT should be.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
};
const asJson = process.argv.includes('--json');
const keepOpen = process.argv.includes('--keep');

function serve() {
  const server = http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '');
    } catch { rel = ''; }
    if (!rel || rel === '/') rel = 'index.html';
    const file = path.resolve(ROOT, rel);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      }).end(buf);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const results = [];
function check(label, ok, detail) {
  results.push({ label, ok, detail });
  if (!asJson) console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}
const round = n => Math.round(n * 10) / 10;

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
let exitCode = 0;
try {
  const { chromium } = await import(process.env.STAFF_PLAYWRIGHT || 'playwright');
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.STAFF_CHROMIUM_PATH ? { executablePath: process.env.STAFF_CHROMIUM_PATH } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // 0 — the page, with at least a windowful mounted.
  await page.goto(`${base}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.card.loaded').length >= 4, { timeout: 30000 });
  const boot = await page.evaluate(() => ({
    cards: document.querySelectorAll('.card').length,
    loaded: document.querySelectorAll('.card.loaded').length,
    parked: document.querySelectorAll('.card.card-parked').length,
    live: (document.getElementById('liveToolCount') || {}).textContent || '',
    scrollHeight: document.documentElement.scrollHeight,
    parkHost: !!document.getElementById('mp-park'),
  }));
  check('the window mounts without being asked', boot.loaded >= 4, `${boot.loaded} live of ${boot.cards} cards, pill says "${boot.live.trim()}"`);

  // 1 + 2 — the arithmetic of a park. Scroll far enough that rows *above* the
  // fold get parked, and measure two things: how much document the collapse
  // removed, and how far the page moved the scroll offset in answer. They must be
  // the same number, or the reader watched the page jump. This is the claim no
  // node harness can make, because it is about what the layout engine reports.
  const probe = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // Prefer a tool that paints to a canvas: the park moves its DOM, and a moved
    // canvas that lost its bitmap is the failure this page cannot see for itself.
    const canvasHost = document.querySelector('.card.loaded canvas');
    const card = canvasHost ? canvasHost.closest('.card') : document.querySelector('.card.loaded');
    const ref = [...document.querySelectorAll('.card')]
      .find(c => { const r = c.getBoundingClientRect(); return r.top > 250 && r.top < 650; }) || card;
    const canvas = card.querySelector('canvas');
    const snap = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, height: r.height, docTop: r.top + window.scrollY };
    };
    const before = {
      row: snap(card), ref: snap(ref), scrollY: window.scrollY,
      height: document.documentElement.scrollHeight,
      canvas: canvas ? { w: canvas.width, h: canvas.height, len: canvas.toDataURL().length } : null,
    };
    const step = 2600;
    window.scrollTo(0, window.scrollY + step);
    await sleep(800);            // the pass runs in the sweep's frame; let it settle
    const after = {
      row: snap(card), ref: snap(ref), scrollY: window.scrollY,
      height: document.documentElement.scrollHeight, cls: card.className,
      canvas: canvas ? { w: canvas.width, h: canvas.height, len: canvas.toDataURL().length } : null,
      parkedCount: document.querySelectorAll('.card.card-parked').length,
      tile: (() => { const x = document.querySelector('.card.card-pending:not(.card-parked)'); return x ? x.getBoundingClientRect().height : null; })(),
    };
    return { before, after, step, name: card.dataset.name };
  });
  const { before, after, step } = probe;
  // The rule that keeps the page and Blink from both compensating for the same
  // collapse. If this fails, the drift below is meaningless: read the two numbers
  // as one result.
  const anchoring = await page.evaluate(() => getComputedStyle(document.documentElement).overflowAnchor);
  check('scroll anchoring is off while the page compensates for itself', anchoring === 'none',
    `root scroller says "${anchoring}"`);
  const removed = before.height - after.height;              // document the collapse took away
  const shift = (before.scrollY + step) - after.scrollY;     // what the page gave back
  check('rows above the viewport were parked, and the document shrank',
    after.parkedCount > 0 && removed > 100,
    `${after.parkedCount} parked · ${round(removed)}px of document removed by the collapse`);
  check('the scroll offset was corrected for exactly that much', Math.abs(shift - removed) <= 2,
    `offset moved ${round(shift)}px against ${round(removed)}px removed (drift ${round(shift - removed)}px)`);
  check('the parked row is a tile now', after.cls.includes('card-parked') && after.row.height < before.row.height,
    `${round(before.row.height)}px → ${round(after.row.height)}px`);
  if (after.tile) {
    check('a parked tile is exactly as tall as a never-mounted one',
      Math.abs(after.row.height - after.tile) <= 1.5,
      `${round(after.row.height)}px vs ${round(after.tile)}px`);
  }
  if (before.canvas) {
    check('the parked canvas kept its bitmap and its size',
      before.canvas.w === after.canvas.w && before.canvas.h === after.canvas.h
      && before.canvas.len === after.canvas.len,
      `${after.canvas.w}×${after.canvas.h}, ${after.canvas.len} chars of dataURL`);
  }
  console.log(`  note   a row still on screen sits ${round(after.ref.top - (before.ref.top - step))}px from `
    + `where the scroll alone put it (0 = the reader saw nothing move)`);

  // 4 — the opt-out has to look like the old page: no collapse, so no correction.
  await page.goto(`${base}/index.html?park=full`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.card.loaded').length >= 4, { timeout: 30000 });
  const full = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const card = document.querySelector('.card.loaded');
    const h0 = card.getBoundingClientRect().height;
    window.scrollTo(0, window.scrollY + 420);
    await sleep(700);
    return { h0, h1: card.getBoundingClientRect().height, parked: card.classList.contains('card-parked'),
      pending: card.classList.contains('card-pending') };
  });
  check('?park=full keeps a parked row claimed',
    full.parked && !full.pending && Math.abs(full.h1 - full.h0) <= 1.5,
    `${round(full.h0)}px → ${round(full.h1)}px, still not a tile`);

  // A wake has to be as cheap as the park was. Clicking the parked tile is the
  // visitor's own path, so it is the one used here.
  const wake = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const card = document.querySelector('.card.card-parked') || document.querySelector('.card.loaded');
    const name = card.dataset.name;
    window.scrollTo(0, 0);
    await sleep(600);
    const top = card.getBoundingClientRect().height;
    const face = card.querySelector('.card-face');
    if (face) face.click();
    await sleep(900);
    return { name, top, after: card.getBoundingClientRect().height,
      loaded: card.classList.contains('loaded'), fetched: performance.getEntriesByType('resource')
        .filter(r => r.name.includes(`/cards/${name}.html`)).length };
  });
  check('clicking a parked tile brings the tool back', wake.loaded,
    `${round(wake.after)}px tall again, from ${wake.fetched} fetch${wake.fetched === 1 ? '' : 'es'} of its fragment`);

  // Phone: 390×844, 4× CPU, a scripted scroll. Reported, not asserted.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const cdp = await mobile.context().newCDPSession(mobile);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }).catch(() => {});
  await mobile.goto(`${base}/index.html`, { waitUntil: 'load' });
  await mobile.waitForFunction(() => document.querySelectorAll('.card.loaded').length >= 2, { timeout: 45000 });
  const phone = await mobile.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const frames = [];
    let stop = false;
    const tick = t => { frames.push(t); if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const doc = () => document.documentElement.scrollHeight - innerHeight;
    for (let i = 0; i < 12; i++) {
      window.scrollTo(0, Math.min(doc(), i * 900));
      await sleep(120);
    }
    await sleep(400);
    stop = true;
    const gaps = frames.slice(1).map((t, i) => t - frames[i]);
    const long = gaps.filter(g => g >= 80).length;
    return {
      maxGap: Math.max(0, ...gaps), long, frames: frames.length,
      loaded: document.querySelectorAll('.card.loaded').length,
      parked: document.querySelectorAll('.card.card-parked').length,
      tiles: document.querySelectorAll('.card.card-pending').length,
      scrollHeight: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      live: (document.getElementById('liveToolCount') || {}).textContent || '',
    };
  });
  if (!asJson) {
    console.log(`  phone  390×844 @4×: ${phone.loaded} live, ${phone.parked} parked, ${phone.tiles} tiles · `
      + `${phone.scrollHeight}px document · worst frame ${round(phone.maxGap)}ms, `
      + `${phone.long}/${phone.frames} over 80ms · overflow: ${phone.overflow ? 'YES (bug)' : 'no'}`);
  }
  check('the phone layout does not overflow sideways', !phone.overflow);
  check('the phone got a window and a park, not a stall', phone.loaded + phone.parked >= 4,
    `${phone.loaded + phone.parked} of the catalogue owned on a 4× throttled device`);
  check('no console errors while any of it ran', errors.length === 0, errors.slice(0, 3).join(' | '));

  if (asJson) console.log(JSON.stringify({ boot, probe, full, wake, phone, results }, null, 2));
  await browser.close();
  exitCode = results.some(r => !r.ok) ? 1 : 0;
} finally {
  server.close();
}
if (!asJson) {
  const failed = results.filter(r => !r.ok);
  console.log(failed.length ? `\nLIVE WINDOW CHECK FAILED (${failed.length})` : '\nLIVE WINDOW CHECK PASSED');
}
process.exit(exitCode);
