#!/usr/bin/env node
// Optional browser smoke test for the GENERATED report, not production tools.
// Install Playwright/browser tooling outside the repository (AGENTS.md budget).
// STAFF_PLAYWRIGHT may name an external module; STAFF_CHROMIUM_PATH may override
// its browser binary. The required zero-dependency CI suite does not import this.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.join(root, 'ai-developer/reports/latest.html');
if (!fs.existsSync(reportPath)) throw new Error('Run node scripts/ai-developer.js plan to generate the report first.');
const { chromium } = await import(process.env.STAFF_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STAFF_CHROMIUM_PATH ? { executablePath: process.env.STAFF_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process'],
});
const screenshots = process.argv.includes('--screenshots');
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(pathToFileURL(reportPath).href);
    await page.waitForFunction(() => document.getElementById('task-count').textContent.includes('findings shown'));
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Horizontal overflow at ${width}px`);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip', 'Skip link is first keyboard stop');
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid', 'Visible keyboard focus');
    const all = await page.locator('[data-task]').count();
    const blocking = await page.locator('[data-task][data-status="blocking"]').count();
    await page.getByRole('button', { name: 'Blocking', exact: true }).click();
    assert.equal(await page.locator('[data-task]:visible').count(), blocking);
    assert.equal(await page.getByRole('button', { name: 'Blocking', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('searchbox', { name: 'Search findings' }).fill('no-match-smoke-test-value');
    assert.equal(await page.locator('#empty-state').isVisible(), true);
    await page.getByRole('searchbox', { name: 'Search findings' }).fill('');
    await page.getByRole('button', { name: 'All findings' }).click();
    await page.getByRole('combobox', { name: 'Filter findings by product' }).selectOption('music');
    assert.equal(await page.locator('[data-task]:visible').count(), await page.locator('[data-task][data-product="music"]').count());
    await page.getByRole('combobox', { name: 'Filter findings by product' }).selectOption('all');
    assert.equal(await page.locator('[data-task]:visible').count(), all);
    const audit = page.locator('.audit').first();
    if (await audit.count()) {
      await audit.locator('summary').click();
      assert.equal(await audit.getAttribute('open'), '');
      await audit.locator('summary').click();
    }
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('[data-filter]')].every(el => el.getBoundingClientRect().height >= 44)), true, 'Filter targets are at least 44px');
    await page.evaluate(() => scrollTo(0, 0));
    if (screenshots && [390, 1440].includes(width)) {
      fs.mkdirSync(path.join(root, '.design-preview'), { recursive: true });
      await page.screenshot({ path: path.join(root, `.design-preview/staff-${width}.png`), fullPage: width === 390 });
    }
    console.log(`PASS: ${width}px — overflow, filtering, empty state, keyboard focus, evidence disclosure and touch targets`);
  }
  assert.deepEqual(external, [], 'Offline report must make no external requests');
  assert.deepEqual(errors, [], 'No script or CSP errors');
  console.log('PASS: offline report; no external requests, JavaScript errors or CSP violations.');
} finally {
  await browser.close();
}
