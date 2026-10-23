'use strict';
// Cross-links between overlapping tools found by the 2026-10-18 audit (batch 4): each
// tool's "See also" line must point at live cards, and the links must go both ways.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const CARDS = path.join(__dirname, '..', '..', 'cards');
const GROUPS = [
  ['calorie', 'macros', 'calorie-deficit-weight-loss-timeline'],
  ['capacitor-calculator', 'rc-time-constant-calculator'],
  ['hourly-to-annual-salary-converter', 'salary', 'pro-rata-salary-calculator'],
  ['oven-gas-mark-temperature-converter', 'air-fryer-oven-conversion'],
  // 2026-10-19 audit (batch 5 cross-links)
  ['mean-median-mode', 'mean-median-mode-stdev', 'mean-median-mode-trainer'],
  ['sl-exchange', 'sl-linden-dollar-converter'],
  ['timer', 'stopwatch-precision-timer'],
  ['speed-reading-rsvp-trainer', 'speed-reading-trainer'],
  ['equation-solver', 'quadratic-solver'],
  ['timezone', 'world-clock-timezone-board'],
  ['solar-system-3d-orrery', 'solar-system-simulator'],
  ['orbital-mechanics-calculator', 'orbital-mechanics-playground'],
  ['screw-drill-chart', 'tap-drill-size-chart'],
  ['color-palette-extractor', 'image-color-picker-palette-extractor'],
];
function seeAlso(slug) {
  const html = fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8');
  const m = html.match(/<p data-see-also[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(m, slug + ' has no See also line');
  return [...m[1].matchAll(/href="\/tool\/([a-z0-9-]+)\.html"/g)].map(x => x[1]);
}
for (const group of GROUPS) {
  test('see-also links: ' + group.join(' / '), () => {
    for (const slug of group) {
      const targets = seeAlso(slug);
      for (const other of group) {
        if (other === slug) continue;
        assert.ok(targets.includes(other), slug + ' should link to ' + other);
      }
      for (const t of targets) assert.ok(fs.existsSync(path.join(CARDS, t + '.html')), slug + ' links to missing card ' + t);
    }
  });
}
