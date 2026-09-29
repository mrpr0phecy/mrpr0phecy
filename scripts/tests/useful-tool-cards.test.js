'use strict';
// Behavioral regressions for the eleven new utility cards in this work session:
// run the real fragment scripts in jsdom and verify private/local processing,
// comparison arithmetic, safe text rendering, and date-aware cash-flow math.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const CARDS = path.join(ROOT, 'cards');
let JSDOM;
try {
  ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom'));
} catch (_) {
  try { ({ JSDOM } = require('jsdom')); } catch (_) { JSDOM = null; }
}

function mount(slug) {
  const html = fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8');
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://www.themostusefulsiteintheworld.com/tool.html',
    beforeParse(window) {
      window.navigator.clipboard = { writeText: () => Promise.resolve() };
    },
  });
  const { window } = dom;
  const document = window.document;
  const parsed = new window.DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(parsed.querySelectorAll('script'));
  scripts.forEach(script => script.remove());
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  while (parsed.body.firstChild) wrapper.appendChild(parsed.body.firstChild);
  document.getElementById('host').appendChild(wrapper);
  scripts.forEach(script => window.eval(script.textContent));

  return {
    dom,
    window,
    document,
    $: id => document.getElementById(id),
    set(id, value) {
      const control = document.getElementById(id);
      control.value = String(value);
      control.dispatchEvent(new window.Event('input', { bubbles: true }));
      control.dispatchEvent(new window.Event('change', { bubbles: true }));
    },
    submit(id) {
      document.getElementById(id).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    },
    click(id) { document.getElementById(id).click(); },
  };
}

const skip = !JSDOM && 'jsdom is not installed (see AGENTS.md §2)';

test('batch link cleaner removes known trackers, preserves useful params/fragments, and keeps unsafe schemes', { skip }, () => {
  const t = mount('batch-link-cleaner');
  t.set('batch-link-cleaner-input', [
    'https://example.com/story?utm_source=mail&section=3&fbclid=demo#comments',
    'https://example.org/?ref=partner&continue=1',
    'ftp://example.net/file?utm_campaign=x',
  ].join('\n'));
  t.click('batch-link-cleaner-clean');
  const output = t.$('batch-link-cleaner-output').value.split('\n');
  assert.equal(output[0], 'https://example.com/story?section=3#comments');
  assert.equal(output[1], 'https://example.org/?ref=partner&continue=1', 'generic referral keys are preserved by default');
  assert.equal(output[2], 'ftp://example.net/file?utm_campaign=x', 'non-HTTP schemes are left as entered');
  assert.match(t.$('batch-link-cleaner-status').textContent, /1 link cleaned/);
  assert.match(t.$('batch-link-cleaner-status').textContent, /1 unrecognized line left unchanged/);

  t.$('batch-link-cleaner-referrals').checked = true;
  t.$('batch-link-cleaner-referrals').dispatchEvent(new t.window.Event('change', { bubbles: true }));
  t.click('batch-link-cleaner-clean');
  assert.equal(t.$('batch-link-cleaner-output').value.split('\n')[1], 'https://example.org/?continue=1');
  t.dom.window.close();
});

test('sensitive data redactor masks common patterns, honors custom terms, and leaves date-like text intact', { skip }, () => {
  const t = mount('sensitive-data-redactor');
  const original = 'Email alex@example.com. Call +1 (202) 555-0188. IP 192.168.1.7. Card 4242 4242 4242 4242. Date 2026-09-28.';
  t.set('sensitive-data-redactor-input', original);
  const output = t.$('sensitive-data-redactor-output').value;
  for (const secret of ['alex@example.com', '+1 (202) 555-0188', '192.168.1.7', '4242 4242 4242 4242']) {
    assert.ok(!output.includes(secret), `${secret} should be masked`);
  }
  assert.ok(output.includes('2026-09-28'), 'an ISO date is not mistaken for a phone number');
  assert.match(t.$('sensitive-data-redactor-status').textContent, /4 unique matches masked/);

  t.set('sensitive-data-redactor-input', 'Casey Jones is the account contact.');
  t.set('sensitive-data-redactor-custom', 'Casey Jones');
  assert.ok(!t.$('sensitive-data-redactor-output').value.includes('Casey Jones'));
  t.dom.window.close();
});

test('filename safety checker fixes reserved names and collisions without touching files', { skip }, () => {
  const t = mount('filename-safety-checker');
  t.set('filename-safety-checker-input', ['CON.txt', 'Quarterly report?.pdf', 'report.', 'Photo.JPG', 'photo.jpg'].join('\n'));
  t.click('filename-safety-checker-check');
  assert.deepEqual(t.$('filename-safety-checker-output').value.split('\n'), [
    '_CON.txt', 'Quarterly report_.pdf', 'report', 'Photo.JPG', 'photo (2).jpg',
  ]);
  assert.match(t.$('filename-safety-checker-status').textContent, /1 duplicate destination resolved/);
  t.$('filename-safety-checker-unique').checked = false;
  t.$('filename-safety-checker-unique').dispatchEvent(new t.window.Event('change', { bubbles: true }));
  assert.match(t.$('filename-safety-checker-rows').textContent, /Case-insensitive duplicate/);
  t.dom.window.close();
});

test('home inventory keeps the chosen currency, multiplies replacement value by quantity, and filters locally', { skip }, () => {
  const t = mount('home-inventory-worksheet');
  t.set('home-inventory-worksheet-name', 'Laptop <work>');
  t.set('home-inventory-worksheet-room', 'Office');
  t.set('home-inventory-worksheet-quantity', '2');
  t.set('home-inventory-worksheet-value', '800');
  t.set('home-inventory-worksheet-currency', 'USD');
  t.set('home-inventory-worksheet-serial', 'SN-42');
  t.set('home-inventory-worksheet-date', '2025-05-10');
  t.submit('home-inventory-worksheet-form');
  assert.equal(t.$('home-inventory-worksheet-count').textContent, '1');
  assert.equal(t.$('home-inventory-worksheet-units').textContent, '2');
  assert.match(t.$('home-inventory-worksheet-total').textContent, /1,600\.00/);
  assert.equal(t.$('home-inventory-worksheet-currency').value, 'USD', 'form reset does not silently relabel money');
  assert.equal(t.$('home-inventory-worksheet-currency').disabled, true);
  assert.match(t.$('home-inventory-worksheet-rows').textContent, /Laptop <work>/, 'untrusted-looking text is rendered literally');
  t.set('home-inventory-worksheet-search', 'not present');
  assert.match(t.$('home-inventory-worksheet-rows').textContent, /No items match this search/);
  t.click('home-inventory-worksheet-clear');
  assert.equal(t.$('home-inventory-worksheet-currency').disabled, false);
  t.dom.window.close();
});

test('cash-flow forecast clamps monthly dates without drift and reports a projected shortfall', { skip }, () => {
  const t = mount('bills-cashflow-forecast');
  t.set('bills-cashflow-forecast-start', '2026-01-01');
  t.set('bills-cashflow-forecast-days', '60');
  t.set('bills-cashflow-forecast-balance', '500');
  t.set('bills-cashflow-forecast-currency', 'USD');

  t.set('bills-cashflow-forecast-name', 'Rent');
  t.set('bills-cashflow-forecast-type', 'expense');
  t.set('bills-cashflow-forecast-amount', '700');
  t.set('bills-cashflow-forecast-date', '2026-01-15');
  t.set('bills-cashflow-forecast-frequency', 'monthly');
  t.submit('bills-cashflow-forecast-form');
  assert.equal(t.$('bills-cashflow-forecast-currency').disabled, true);

  t.set('bills-cashflow-forecast-name', 'Payday');
  t.set('bills-cashflow-forecast-type', 'income');
  t.set('bills-cashflow-forecast-amount', '1000');
  t.set('bills-cashflow-forecast-date', '2026-01-31');
  t.set('bills-cashflow-forecast-frequency', 'monthly');
  t.submit('bills-cashflow-forecast-form');

  assert.match(t.$('bills-cashflow-forecast-ending').textContent, /1,100\.00/);
  assert.match(t.$('bills-cashflow-forecast-lowest').textContent, /200\.00.*Jan 15, 2026/);
  assert.match(t.$('bills-cashflow-forecast-status').textContent, /first projected end-of-day balance below zero.*Jan 15, 2026/);
  assert.match(t.$('bills-cashflow-forecast-forecast').textContent, /Feb 28, 2026/, '31st-of-month recurrence uses February’s last day');
  assert.match(t.$('bills-cashflow-forecast-forecast').textContent, /Rent/);
  t.dom.window.close();
});

test('email header inspector unfolds fields, reports auth claims, and flags a reply-path mismatch without network checks', { skip }, () => {
  const t = mount('email-header-inspector');
  t.set('email-header-inspector-input', [
    'From: Billing Team <billing@acme.example>',
    'Reply-To: help@lookalike.example',
    'Return-Path: <bounce@mailer.example>',
    'Authentication-Results: mx.example; spf=pass smtp.mailfrom=mailer.example; dkim=pass header.d=acme.example; dmarc=fail header.from=acme.example',
    'Received: from sender.example',
    '  by mx.example with ESMTPS',
    '',
    'This body is ignored.'
  ].join('\n'));
  t.click('email-header-inspector-analyze');
  assert.match(t.$('email-header-inspector-results').textContent, /billing@acme\.example/);
  assert.match(t.$('email-header-inspector-results').textContent, /pass reported/);
  assert.match(t.$('email-header-inspector-results').textContent, /fail reported/);
  assert.match(t.$('email-header-inspector-report').value, /Reply-To uses a different domain/);
  assert.match(t.$('email-header-inspector-report').value, /Received fields: 1/);
  assert.match(t.$('email-header-inspector-status').textContent, /No network checks were made/);
  t.dom.window.close();
});

test('job offer comparator separates gross package from commute-adjusted cash and does not rank offers', { skip }, () => {
  const t = mount('job-offer-comparator');
  t.set('job-offer-comparator-name-a', 'Role A');
  t.set('job-offer-comparator-base-a', 60000);
  t.set('job-offer-comparator-bonus-a', 6000);
  t.set('job-offer-comparator-pension-a', 3000);
  t.set('job-offer-comparator-benefits-a', 2000);
  t.set('job-offer-comparator-commute-a', 10);
  t.set('job-offer-comparator-days-a', 150);
  t.set('job-offer-comparator-minutes-a', 45);
  t.set('job-offer-comparator-hours-a', 37.5);
  t.set('job-offer-comparator-leave-a', 25);
  t.set('job-offer-comparator-name-b', 'Role B');
  t.set('job-offer-comparator-base-b', 55000);
  t.set('job-offer-comparator-pension-b', 4000);
  t.set('job-offer-comparator-commute-b', 5);
  t.set('job-offer-comparator-days-b', 50);
  t.click('job-offer-comparator-compare');
  assert.match(t.$('job-offer-comparator-results').textContent, /71,000\.00/);
  assert.match(t.$('job-offer-comparator-results').textContent, /64,500\.00/);
  assert.match(t.$('job-offer-comparator-results').textContent, /225\.0 hours/);
  assert.match(t.$('job-offer-comparator-status').textContent, /no offer is ranked/i);
  t.dom.window.close();
});

test('home project quote comparison adds only separate known extras and renders notes as literal text', { skip }, () => {
  const t = mount('home-project-quote-comparator');
  t.set('home-project-quote-comparator-name-a', 'North <crew>');
  t.set('home-project-quote-comparator-total-a', 1200);
  t.set('home-project-quote-comparator-extras-a', 100);
  t.set('home-project-quote-comparator-scope-a', 'Fit tap');
  t.set('home-project-quote-comparator-exclusions-a', '<script>not markup</script>');
  t.set('home-project-quote-comparator-name-b', 'South');
  t.set('home-project-quote-comparator-total-b', 1350);
  t.click('home-project-quote-comparator-compare');
  assert.match(t.$('home-project-quote-comparator-results').textContent, /1,300\.00/);
  assert.match(t.$('home-project-quote-comparator-results').textContent, /1,350\.00/);
  assert.match(t.$('home-project-quote-comparator-results').textContent, /<script>not markup<\/script>/);
  assert.equal(t.$('home-project-quote-comparator-results').querySelector('script'), null);
  assert.match(t.$('home-project-quote-comparator-status').textContent, /same scope/);
  t.dom.window.close();
});

test('rental check-in report combines meter details and room observations, keeps notes literal, and clears locally', { skip }, () => {
  const t = mount('rental-move-in-condition-report');
  t.set('rental-move-in-condition-report-address', '12 Example Road');
  t.set('rental-move-in-condition-report-date', '2026-09-29');
  t.set('rental-move-in-condition-report-electric', '12345 kWh');
  t.set('rental-move-in-condition-report-area', 'Kitchen');
  t.set('rental-move-in-condition-report-item', 'Window frame');
  t.set('rental-move-in-condition-report-condition', 'Damage noted');
  t.set('rental-move-in-condition-report-observation', '<img src=x onerror=alert(1)> chip in paint');
  t.set('rental-move-in-condition-report-photo', 'kitchen-window-01.jpg');
  t.submit('rental-move-in-condition-report-entry-form');
  assert.match(t.$('rental-move-in-condition-report-rows').textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(t.$('rental-move-in-condition-report-rows').querySelector('img'), null);
  t.click('rental-move-in-condition-report-build');
  assert.match(t.$('rental-move-in-condition-report-output').value, /Electric: 12345 kWh/);
  assert.match(t.$('rental-move-in-condition-report-output').value, /Window frame \[Damage noted\]/);
  assert.match(t.$('rental-move-in-condition-report-output').value, /kitchen-window-01\.jpg/);
  t.click('rental-move-in-condition-report-clear');
  assert.equal(t.$('rental-move-in-condition-report-output').value, '');
  assert.match(t.$('rental-move-in-condition-report-status').textContent, /cleared/);
  t.dom.window.close();
});

test('care handover builds a private text summary and treats user-entered markup as text', { skip }, () => {
  const t = mount('care-handover-sheet');
  t.set('care-handover-sheet-person', 'Taylor <script>alert(1)</script>');
  t.set('care-handover-sheet-primary', 'Morgan — 07123 456789');
  t.set('care-handover-sheet-health', 'Use the current written plan; confirm with the responsible person.');
  t.click('care-handover-sheet-build');
  assert.match(t.$('care-handover-sheet-output').value, /For: Taylor <script>alert\(1\)<\/script>/);
  assert.match(t.$('care-handover-sheet-output').value, /Morgan — 07123 456789/);
  assert.match(t.$('care-handover-sheet-output').value, /Use the current written plan/);
  assert.match(t.$('care-handover-sheet-status').textContent, /does not save it/);
  assert.equal(t.$('care-handover-sheet-root').querySelector('script'), null);
  t.dom.window.close();
});

test('MT4/MT5 genetic copy-trade lab evolves only on training rows and exports non-trading adapter gates', { skip }, () => {
  const t = mount('mt4-mt5-genetic-copy-trade-lab');
  const lines = ['time,symbol,side,pnl_points,signal_score,spread_points,copy_delay_seconds,mfe_points,mae_points'];
  for (let i = 0; i < 80; i++) {
    const time = new Date(Date.UTC(2026, 0, 1 + i)).toISOString();
    const good = i % 2 === 0;
    lines.push([
      time, 'EURUSD', good ? 'buy' : 'sell', good ? 18 : -12,
      good ? 82 : 28, good ? 11 : 45, good ? 1 : 9,
      good ? 24 : 5, good ? 4 : 18,
    ].join(','));
  }
  t.set('mt4-mt5-genetic-copy-trade-lab-csv', lines.join('\n'));
  t.set('mt4-mt5-genetic-copy-trade-lab-population', 24);
  t.set('mt4-mt5-genetic-copy-trade-lab-generations', 16);
  t.set('mt4-mt5-genetic-copy-trade-lab-seed', 42);
  t.click('mt4-mt5-genetic-copy-trade-lab-run');
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-status').textContent, /Search finished/);
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-results').textContent, /56 chronological training rows/);
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-results').textContent, /24 untouched holdout rows/);
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-results').textContent, /Average winning points/);
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-thresholds').textContent, /Maximum copy delay/);
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-mt4-code').value, /CT_AllowCopySignal/);
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-mt4-code').value, /MarketInfo\(Symbol\(\), MODE_SPREAD\)/);
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-mt5-code').value, /SymbolInfoInteger\(_Symbol, SYMBOL_SPREAD/);
  assert.doesNotMatch(t.$('mt4-mt5-genetic-copy-trade-lab-mt4-code').value, /OrderSend|WebRequest|CTrade/);
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-mt4-code').value, /signalSide != 1 && signalSide != -1/);
  assert.equal(t.$('mt4-mt5-genetic-copy-trade-lab-copy-mt4').disabled, false);
  t.set('mt4-mt5-genetic-copy-trade-lab-csv', '');
  t.click('mt4-mt5-genetic-copy-trade-lab-run');
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-status').textContent, /Add a CSV header/);
  assert.equal(t.$('mt4-mt5-genetic-copy-trade-lab-mt4-code').value, '');
  assert.equal(t.$('mt4-mt5-genetic-copy-trade-lab-copy-mt4').disabled, true);
  t.click('mt4-mt5-genetic-copy-trade-lab-clear');
  assert.equal(t.$('mt4-mt5-genetic-copy-trade-lab-mt4-code').value, '');
  assert.equal(t.$('mt4-mt5-genetic-copy-trade-lab-copy-mt5').disabled, true);
  t.dom.window.close();
});

test('MT4/MT5 genetic lab derives signed points from semicolon CSV with decimal-comma values', { skip }, () => {
  const t = mount('mt4-mt5-genetic-copy-trade-lab');
  const lines = ['time;side;pnl_points'];
  for (let i = 0; i < 30; i++) {
    const time = new Date(Date.UTC(2026, 0, 1 + i)).toISOString();
    const good = i % 2 === 0;
    lines.push([time, good ? 'buy' : 'sell', good ? '1,234' : '-1,234'].join(';'));
  }
  t.set('mt4-mt5-genetic-copy-trade-lab-csv', lines.join('\n'));
  t.set('mt4-mt5-genetic-copy-trade-lab-population', 12);
  t.set('mt4-mt5-genetic-copy-trade-lab-generations', 5);
  t.click('mt4-mt5-genetic-copy-trade-lab-run');
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-status').textContent, /Search finished/);
  const resultRows = t.$('mt4-mt5-genetic-copy-trade-lab-results').querySelectorAll('tbody tr');
  assert.equal(resultRows[0].children[1].textContent, '21 / 21');
  assert.equal(resultRows[2].children[1].textContent, '1.2');
  t.dom.window.close();
});

test('MT4/MT5 genetic lab derives signed points from entry, close, side and an explicit point size', { skip }, () => {
  const t = mount('mt4-mt5-genetic-copy-trade-lab');
  const lines = ['time,symbol,side,entry_price,close_price'];
  for (let i = 0; i < 30; i++) {
    const time = new Date(Date.UTC(2026, 0, 1 + i)).toISOString();
    lines.push([time, 'EURUSD', i % 2 === 0 ? 'buy' : 'sell', '1.10000', '1.10100'].join(','));
  }
  t.set('mt4-mt5-genetic-copy-trade-lab-csv', lines.join('\n'));
  t.set('mt4-mt5-genetic-copy-trade-lab-point-size', 0.0001);
  t.set('mt4-mt5-genetic-copy-trade-lab-population', 12);
  t.set('mt4-mt5-genetic-copy-trade-lab-generations', 5);
  t.click('mt4-mt5-genetic-copy-trade-lab-run');
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-status').textContent, /Search finished/);
  const resultRows = t.$('mt4-mt5-genetic-copy-trade-lab-results').querySelectorAll('tbody tr');
  assert.equal(resultRows[2].children[1].textContent, '10.0');
  t.dom.window.close();
});

test('MT4/MT5 genetic lab does not activate a filter from holdout-only feature variation', { skip }, () => {
  const t = mount('mt4-mt5-genetic-copy-trade-lab');
  const lines = ['time,side,pnl_points,signal_score'];
  for (let i = 0; i < 30; i++) {
    const time = new Date(Date.UTC(2026, 0, 1 + i)).toISOString();
    const score = i < 21 ? 50 : 10 + (i - 21) * 10;
    lines.push([time, 'buy', i % 2 === 0 ? 4 : -3, score].join(','));
  }
  t.set('mt4-mt5-genetic-copy-trade-lab-csv', lines.join('\n'));
  t.set('mt4-mt5-genetic-copy-trade-lab-population', 12);
  t.set('mt4-mt5-genetic-copy-trade-lab-generations', 5);
  t.click('mt4-mt5-genetic-copy-trade-lab-run');
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-status').textContent, /Search finished/);
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-thresholds').textContent, /Not learned — column unavailable/);
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-results').textContent, /signal-score filter disabled/);
  const resultRows = t.$('mt4-mt5-genetic-copy-trade-lab-results').querySelectorAll('tbody tr');
  assert.equal(resultRows[0].children[3].textContent, '9 / 9');
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-mt4-code').value, /CT_MinSignalScore = 0\.0/);
  t.dom.window.close();
});

test('MT4/MT5 genetic lab derives filter bounds from training while baseline retains all holdout trades', { skip }, () => {
  const t = mount('mt4-mt5-genetic-copy-trade-lab');
  const lines = ['time,side,pnl_points,signal_score'];
  for (let i = 0; i < 30; i++) {
    const time = new Date(Date.UTC(2026, 0, 1 + i)).toISOString();
    const score = i < 21 ? (i % 2 === 0 ? 40 : 60) : (i % 2 === 0 ? 0 : 100);
    lines.push([time, 'buy', i % 2 === 0 ? 7 : -5, score].join(','));
  }
  t.set('mt4-mt5-genetic-copy-trade-lab-csv', lines.join('\n'));
  t.set('mt4-mt5-genetic-copy-trade-lab-population', 12);
  t.set('mt4-mt5-genetic-copy-trade-lab-generations', 5);
  t.click('mt4-mt5-genetic-copy-trade-lab-run');
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-status').textContent, /Search finished/);
  const minimumScore = Number.parseFloat(t.$('mt4-mt5-genetic-copy-trade-lab-thresholds').querySelector('strong').textContent);
  assert.ok(minimumScore >= 40 && minimumScore <= 60, `threshold ${minimumScore} must use the training range only`);
  const resultRows = t.$('mt4-mt5-genetic-copy-trade-lab-results').querySelectorAll('tbody tr');
  assert.equal(resultRows[0].children[3].textContent, '9 / 9');
  t.dom.window.close();
});

test('MT4/MT5 genetic lab refuses an incomplete holdout feature instead of silently scoring it', { skip }, () => {
  const t = mount('mt4-mt5-genetic-copy-trade-lab');
  const lines = ['time,side,pnl_points,signal_score'];
  for (let i = 0; i < 30; i++) {
    const time = new Date(Date.UTC(2026, 0, 1 + i)).toISOString();
    const score = i === 25 ? '' : (i % 2 === 0 ? 40 : 60);
    lines.push([time, 'buy', i % 2 === 0 ? 5 : -4, score].join(','));
  }
  t.set('mt4-mt5-genetic-copy-trade-lab-csv', lines.join('\n'));
  t.set('mt4-mt5-genetic-copy-trade-lab-population', 12);
  t.set('mt4-mt5-genetic-copy-trade-lab-generations', 5);
  t.click('mt4-mt5-genetic-copy-trade-lab-run');
  assert.match(t.$('mt4-mt5-genetic-copy-trade-lab-status').textContent, /holdout needs complete signal scores/);
  assert.equal(t.$('mt4-mt5-genetic-copy-trade-lab-mt4-code').value, '');
  assert.equal(t.$('mt4-mt5-genetic-copy-trade-lab-copy-mt4').disabled, true);
  t.dom.window.close();
});
