#!/usr/bin/env node
'use strict';

// perf-budget.js — speed has a floor, and the gate holds it.
//
// The most expensive bug this site has ever shipped was not a crash: it was
// 210 KB of JSON requested by the home page at idle, which is 42% of the page
// over the wire and 1.4 s of load on a throttled phone (4x CPU, 1.6 Mbps,
// 150 ms RTT) to fill a section four screens down that most visits never
// reach. It came back twice, because nothing failed when it did.
//
// So the numbers live here, next to the code that moves them, and
// scripts/verify.sh runs this on every PR. Three kinds of rule:
//
//   1. BYTES. The resources a first-time visitor has to download before the
//      page can paint, and before it can be used, have a budget in gzip
//      bytes. Exceeding one fails the gate and names the file — a budget is
//      not a style guide, it is the difference between a page that appears
//      when you tap it and one that hangs.
//
//   2. WHAT IS NOT ON THE FIRST SCREEN. The search catalogue is the largest
//      thing on the site and the least urgent: it is loaded when the visitor
//      reaches the list, searches, or follows a deep link. index.html must
//      not reference it, and explore.js must fetch it exactly once, behind
//      the guarded paths that were measured.
//
//   3. THE SCROLL PATH WRITES NOTHING DOCUMENT-WIDE. Custom properties
//      inherit, so writing one on <html> restyles every element: the home
//      page used to rewrite `--xp-sticky-h` twice per direction change to
//      move one toolbar (measured at ~40 ms per toggle, a dropped frame
//      every time the visitor crossed the hero search). The bar's height is
//      published once and its state is a class. If a future edit starts
//      writing inherited properties from a scroll handler, the gate says so.
//
// Usage:
//   node scripts/perf-budget.js            # exit 1 on any breach
//   node scripts/perf-budget.js --verbose  # print every row
//
// The numbers themselves were measured with /home/user/baseline.mjs in the
// perf work of 2026-10-20; the docstrings in explore.js and home-core.js say
// what each one bought. When a budget is raised, raise it here, in the same
// commit, with the reason — that is the review that stops the regression.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name));
const text = (name) => read(name).toString('utf8');
const gz = (name) => zlib.gzipSync(read(name), { level: 9 }).length;
const kb = (bytes) => (bytes / 1024).toFixed(1) + ' KB';

// ---------------------------------------------------------------------------
// 1. Bytes
// ---------------------------------------------------------------------------

// What the browser must have before it can paint anything: the document, its
// render-blocking stylesheets, and the list layer's stylesheet (all three are
// in the head with no media trick). The font is not here — the head's
// @font-face is font-display: swap, so text paints in the fallback first.
const FIRST_PAINT = ['index.html', 'home.css', 'explore.css'];
// 43 KB as of 2026-10-20: the home page carries its own small sections
// (seasonal band, random-tool band) directly in the document so they paint
// with no script at all.
const FIRST_PAINT_BUDGET = 43 * 1024;

// Everything a first-time visitor downloads for the first screen: the above,
// plus the deferred stylesheet, the three scripts that make the page work, and
// the one font file the hero actually uses. The catalogue is deliberately not
// in this list.
const FIRST_SCREEN = [
    ...FIRST_PAINT,
    'home-deferred.css',
    'toolbox.css',
    'risk-notices.js',
    'home-core.js',
    'explore.js',
    'toolbox.js',
    'fonts/inter-latin.woff2',
];
const FIRST_SCREEN_BUDGET = 150 * 1024;

// Per-file ceilings. Each is the measured size plus a little room: enough that
// a comment or a small fix never fails the gate, little enough that a feature
// arriving with 5 KB of new script has to be a decision.
const FILE_BUDGETS = {
    'index.html': 17 * 1024,
    // The random-tool band (00 / Random) replaced a canvas instrument that cost
    // 4.5 KB of CSS and a lazily fetched 19 KB script for the same job. This
    // ceiling did not move: the band it pays for is smaller than the dial it
    // replaced, and the difference is headroom, not a target.
    'home.css': 20 * 1024,
    'home-deferred.css': 3 * 1024,
    // +0.4 KB on 2026-10-20 for the shelf arrows' styling and a drag cursor:
    // the two home-page rows were only reachable by trackpad or thumb, and a
    // mouse user could not get past the fourth Most-used tool at all.
    'explore.css': 7.5 * 1024,
    'toolbox.css': 4 * 1024,
    'home-core.js': 14 * 1024,
    // +2 KB on 2026-10-20 for the same reason, and the same trade: the
    // controller is wheel, drag, edge buttons and arrow keys. It is deferred
    // (never render-blocking), so it delays no paint; the first screen still
    // sits under its 150 KB budget.
    'explore.js': 25 * 1024,
    'toolbox.js': 12 * 1024,
    'fonts/inter-latin.woff2': 50 * 1024,
    // The catalogue is the biggest transfer on the site. It is allowed to be
    // big (1,424 tools with their descriptions); it is not allowed to grow
    // without someone noticing.
    'tools-index.json': 220 * 1024,
    'cards/cards-lite.json': 40 * 1024,
};

// ---------------------------------------------------------------------------
// 2. The catalogue is not on the first screen
// ---------------------------------------------------------------------------

function catalogueStaysLazy(problems) {
    const home = text('index.html');
    // A preload, prefetch, script or stylesheet reference would put the
    // catalogue back on the critical path without changing any JS.
    const reference = /<link[^>]+tools-index\.json|<script[^>]+tools-index\.json/i.exec(home);
    if (reference) {
        problems.push(`index.html references tools-index.json (${reference[0].slice(0, 80)}) — ` +
                      'the catalogue is fetched by explore.js when the visitor reaches the list');
    }
    if (/fetch\(\s*['"`][^'"`]*tools-index\.json/.test(home)) {
        problems.push('index.html fetches tools-index.json — the home page must not request the catalogue');
    }

    const explore = text('explore.js');
    const fetches = (explore.match(/fetch\(\s*['"`]tools-index\.json/g) || []).length;
    if (fetches !== 1) {
        problems.push(`explore.js fetches tools-index.json in ${fetches} places — it must have exactly one ` +
                      'load path (loadCatalogue), or a second one can bypass the guards');
    }
    // The regression that came back twice: a warm-up on idle or on `load`.
    // Both existed and both downloaded 210 KB before the visitor had asked
    // for anything. The guard is deliberately blunt.
    if (/requestIdleCallback/.test(explore)) {
        problems.push('explore.js schedules work on requestIdleCallback — the catalogue warm-up was removed ' +
                      'for a reason (210 KB of background transfer on every visit); guarded loading only');
    }
    // The proximity observer replaced the idle warm. Its margin is the head
    // start that makes the list appear populated on arrival; a small one puts
    // an empty box in front of the visitor for a second or more.
    const margin = /rootMargin:\s*'(\d+)px/.exec(explore);
    if (!margin) {
        problems.push('explore.js has no rootMargin on the catalogue observer — the list would load only ' +
                      'when it is already on screen');
    } else if (Number(margin[1]) < 1000) {
        problems.push(`the catalogue observer's rootMargin is ${margin[1]}px — below 1000px the list is ` +
                      'still empty when the visitor arrives at it');
    }
    // A deep link is an explicit request for the list and must load it.
    if (!/hashchange/.test(explore)) {
        problems.push('explore.js does not listen for hashchange — a "#all-tools" link from another page ' +
                      'must load the catalogue directly');
    }
}

// ---------------------------------------------------------------------------
// 3. The scroll path writes nothing document-wide
// ---------------------------------------------------------------------------

function scrollPathStaysCheap(problems) {
    const core = text('home-core.js');
    // --xp-sticky-h is inherited from <html>, so every write restyles the
    // whole document. home-core publishes the bar's height once (--xp-bar-h)
    // and toggles a class; it must not publish the inherited property.
    if (/setProperty\(\s*['"]--xp-sticky-h/.test(core)) {
        problems.push('home-core.js writes --xp-sticky-h, an inherited property — the command bar publishes ' +
                      '--xp-bar-h once and toggles html.xp-bar-shown; a per-scroll write here restyles the page');
    }
    // The dead half of that pair: written, never read. It was one of two
    // document-wide writes per toggle.
    if (/--xp-bar-reserve/.test(core + text('home.css') + text('explore.css'))) {
        problems.push('--xp-bar-reserve is back — nothing reads it, and it was removed because writing it ' +
                      'on every show/hide of the command bar restyled the whole document');
    }
    const explore = text('explore.js');
    // explore.js does publish --xp-sticky-h, but only for static chrome
    // (topbars) and only when the number changes. Pinned: the memo is what
    // makes a scroll event a string compare instead of a style recalc.
    if (!/publishedSticky/.test(explore)) {
        problems.push('explore.js no longer memoises --xp-sticky-h (publishedSticky) — on a list page the ' +
                      'scroll handler would rewrite an inherited property on every event');
    }
}

// ---------------------------------------------------------------------------

function main() {
    const verbose = process.argv.includes('--verbose');
    const problems = [];

    const firstPaint = FIRST_PAINT.reduce((sum, name) => sum + gz(name), 0);
    const firstScreen = FIRST_SCREEN.reduce((sum, name) => sum + gz(name), 0);
    if (firstPaint > FIRST_PAINT_BUDGET) {
        problems.push(`first paint is ${kb(firstPaint)} against a ${kb(FIRST_PAINT_BUDGET)} budget ` +
                      `(${FIRST_PAINT.join(' + ')}) — see the budget's docstring before raising it`);
    }
    if (firstScreen > FIRST_SCREEN_BUDGET) {
        problems.push(`the first screen is ${kb(firstScreen)} against a ${kb(FIRST_SCREEN_BUDGET)} budget ` +
                      `(${FIRST_SCREEN.join(' + ')})`);
    }
    for (const [name, budget] of Object.entries(FILE_BUDGETS)) {
        let size;
        try {
            size = gz(name);
        } catch (err) {
            problems.push(`${name} is missing (${err.code}) — the budget cannot be checked`);
            continue;
        }
        if (size > budget) {
            problems.push(`${name} is ${kb(size)} against a ${kb(budget)} budget`);
        }
        if (verbose) console.log(`  ${size > budget ? '✗' : '✓'} ${name.padEnd(28)} ${kb(size).padStart(9)} / ${kb(budget)}`);
    }

    catalogueStaysLazy(problems);
    scrollPathStaysCheap(problems);

    if (problems.length) {
        console.log('PERF BUDGET FAILED — the page got slower to reach:\n');
        for (const p of problems) console.log('  ✗ ' + p);
        console.log('\nThese are not style rules. Each one is a load or a dropped frame a visitor feels.');
        return 1;
    }
    console.log(`PERF BUDGET OK — ${kb(firstPaint)} to first paint, ${kb(firstScreen)} for the first screen, ` +
                'catalogue still off the critical path.');
    return 0;
}

process.exit(main());
