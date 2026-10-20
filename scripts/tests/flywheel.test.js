'use strict';

// The flywheel: the home page's dial, and the rule that makes it a dial.
//
// The instrument is a fidget spinner, and the reason it is not a "random tool"
// button in fancy dress is one equation:
//
//     index = floor(angle / 2π × N) mod N
//
// The angle is the index. One turn walks the whole catalogue, so a deliberate
// turn returns the tool you started on, braking with your hand steers which
// tool you land on, and "tools passed" is the angular distance actually
// travelled. Those three properties are what this file pins, plus the two
// things that make it safe on a home page:
//
//   * it draws nothing and schedules nothing until it is asked to (no rAF while
//     the wheel is at rest, no rAF for a reduced-motion visitor);
//   * its first throw is the catalogue's load trigger — mpExplore.warm(), the
//     list engine's guarded fetch — so a visitor who never spins never
//     downloads the catalogue.
//
// jsdom has no canvas, which the module treats as "no instrument here" (the SVG
// picture stays and nothing throws); a recording stub context stands in so the
// drawing path itself is still executed.
//
// Run with: node scripts/tests/flywheel.test.js

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) { ({ JSDOM } = require('jsdom')); }

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'spin.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const TOOLS = Array.from({ length: 24 }, (_, i) => ({
    slug: `tool-${i}`,
    title: `Tool ${i}`,
    description: `Description ${i}`,
    categoryName: i % 2 ? 'Mathematics' : 'Finance & Money',
    url: `tool/tool-${i}.html`,
}));

function stubContext() {
    const noop = () => {};
    return new Proxy({}, {
        get: (t, k) => {
            if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
            if (k === 'canvas') return null;
            return noop;
        },
        set: () => true,
    });
}

async function boot({ reduced = false, loaded = true } = {}) {
    const dom = new JSDOM(
        `<!doctype html><html><body>
            <section id="flywheel">
                <div class="flywheel-copy">
                    <span id="flywheel-rpm">0</span>
                    <span id="flywheel-passed">0</span>
                    <p id="flywheel-live" role="status" aria-live="polite"></p>
                    <div id="flywheel-result" hidden></div>
                </div>
                <div id="flywheel-stage">
                    <svg id="flywheel-idle"></svg>
                    <button type="button" id="flywheel-btn">Spin the dial</button>
                </div>
            </section>
        </body></html>`,
        { url: 'https://dial.test/index.html', runScripts: 'outside-only', pretendToBeVisual: true },
    );
    const w = dom.window;

    // Canvas: a recording stub, so the drawing path runs but nothing throws.
    w.HTMLCanvasElement.prototype.getContext = function () { return stubContext(); };
    if (!w.SVGElement.prototype.getBBox) w.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 300, height: 300 });
    // Layout: jsdom measures 0.
    w.Element.prototype.getBoundingClientRect = function () {
        return { x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 300, width: 300, height: 300 };
    };
    w.matchMedia = (q) => ({
        matches: reduced && q.includes('reduced-motion'),
        media: q,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });

    /* A frame queue, not a live loop: jsdom never calls requestAnimationFrame
       itself, so the test runs the physics by hand — which is the point, since
       friction, stopping and landing are what this file is about. */
    const raf = [];
    w.requestAnimationFrame = (fn) => { raf.push(fn); return raf.length; };
    w.cancelAnimationFrame = () => { raf.length = 0; };

    // loaded: the catalogue is already in memory (most tests). Not loaded: the
    // only thing the dial may do is ask the list engine for it.
    const warmed = [];
    w.mpExplore = {
        warm() { warmed.push(1); return Promise.resolve(TOOLS); },
        all() { return loaded || warmed.length ? TOOLS : null; },
    };

    w.__rafQueue = () => raf;
    w.eval(SOURCE);
    return { dom, w, raf, warmed };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/* Run the wheel until it stops, at 60 fps, exactly as the browser would. Returns
   the number of frames it took: a throw that never stops turns the test suite
   into a hang, so the budget is bounded and the failure names it. */
function runFrames(w, budget = 900) {
    let t = 0;
    let n = 0;
    while (n < budget) {
        const queued = w.__rafQueue();
        if (!queued.length) break;
        const fn = queued.shift();
        t += 1000 / 60;
        fn(t);
        n++;
    }
    assert.ok(n < budget, 'the wheel never came to rest');
    return n;
}

test('the dial wraps: the same angle always names the same tool', async () => {
    const { w } = await boot();
    const api = w.mpFlywheel;
    api.aim(5);
    assert.equal(api.index(), 5, 'the arm is where it was aimed');
    assert.equal(w.document.querySelector('.flywheel-result-title').textContent, 'Tool 5');
    // The index is modulo N, which is what makes one turn of the wheel walk the
    // whole catalogue and return where it began rather than run out of tools.
    api.aim(5 + TOOLS.length);
    assert.equal(api.index(), 5);
    api.aim(-1);
    assert.equal(api.index(), TOOLS.length - 1, 'and backwards wraps to the last tool');
});

test('a throw travels, then stops on a real tool', async () => {
    const { w } = await boot();
    const api = w.mpFlywheel;
    api.aim(0);
    api.spin(60);
    const frames = runFrames(w);
    assert.ok(frames > 30, `a hard throw should run for a while, not ${frames} frames`);
    const index = api.index();
    assert.ok(index >= 0 && index < TOOLS.length, 'the arm stops on a tool that exists');
    const passed = Number(w.document.getElementById('flywheel-passed').textContent.replace(/,/g, ''));
    assert.ok(passed > 0, 'and the readout counted the tools it went past');
    assert.equal(w.document.getElementById('flywheel-rpm').textContent, '0', 'at rest means 0 rpm');
});

test('the angle is the index: every quarter marks a real tool', async () => {
    const { w } = await boot();
    const api = w.mpFlywheel;
    const seen = new Set();
    for (let i = 0; i < TOOLS.length; i++) {
        api.aim(i);
        seen.add(api.index());
        assert.equal(w.document.querySelector('.flywheel-result-title').textContent, `Tool ${i}`);
    }
    assert.equal(seen.size, TOOLS.length, 'each step of the dial is a different tool');
});

test('a spin says what it passed and what it landed on', async () => {
    const { w } = await boot();
    w.mpFlywheel.spin(0);
    runFrames(w);
    assert.match(w.document.getElementById('flywheel-live').textContent, /Landed on Tool \d+/);
    assert.equal(w.document.getElementById('flywheel-result').hidden, false);
    assert.equal(w.document.getElementById('flywheel-btn').textContent, 'Spin again');
});

test('the first throw is the catalogue load trigger, not a warm-up', async () => {
    const { w, warmed } = await boot({ loaded: false });
    assert.equal(warmed.length, 0, 'loading the page must not fetch the catalogue');
    w.mpFlywheel.spin(0);
    runFrames(w);
    await tick();
    assert.equal(warmed.length, 1, 'a spin is intent: the list engine is asked once');
    assert.equal(w.document.getElementById('flywheel-result').hidden, false,
        'the answer arrives even when the catalogue was not there at spin time');
});

test('nothing is scheduled while the wheel is at rest', async () => {
    const { w, raf } = await boot();
    const before = raf.length;
    await tick();
    assert.equal(raf.length, before, 'no idle animation loop on a page nobody has touched');
    w.mpFlywheel.aim(3);
    await tick();
    assert.equal(raf.length, before, 'and none after a result has landed either');
});

test('reduced motion gets the answer without the animation', async () => {
    const { w, raf } = await boot({ reduced: true });
    const before = raf.length;
    w.mpFlywheel.spin(0);
    await tick();
    assert.equal(w.__rafQueue().length, 0, 'and nothing queued to run later either');
    assert.equal(raf.length, before, 'no animation loop for a visitor who asked for none');
    assert.equal(w.document.getElementById('flywheel-result').hidden, false, 'but a real, named result');
    assert.match(w.document.querySelector('.flywheel-result-title').getAttribute('href'), /^tool\/tool-\d+\.html$/);
});

test('the result is built from text, never from HTML', async () => {
    const { w } = await boot();
    w.mpExplore.all = () => [{ slug: 'x', title: '<img src=x onerror=alert(1)>', description: '<b>bold</b>', categoryName: 'Math', url: 'tool/x.html' }];
    w.mpFlywheel.aim(0);
    const title = w.document.querySelector('.flywheel-result-title');
    assert.equal(title.textContent, '<img src=x onerror=alert(1)>');
    assert.equal(title.children.length, 0, 'a tool title is text, not markup');
});

test('the static page carries the dial before any script does', () => {
    // The resting state is the document's job: an SVG dial, a button, a live
    // region. If this HTML is ever replaced by a script-built canvas, the band
    // becomes blank for a no-JS visitor and for the first paint.
    const band = INDEX.slice(INDEX.indexOf('id="flywheel"'), INDEX.indexOf('id="featured"'));
    assert.match(band, /<svg[^>]*id="flywheel-idle"/);
    assert.match(band, /id="flywheel-btn"/);
    assert.match(band, /id="flywheel-live"[^>]*role="status"[^>]*aria-live="polite"/);
    assert.ok(!/<canvas/.test(band), 'no canvas in the served HTML');
    assert.ok(!/spin\.js/.test(band), 'and no script: it arrives on intent');
});

test('the dial is loaded on intent, and only then', () => {
    const core = fs.readFileSync(path.join(ROOT, 'home-core.js'), 'utf8');
    const start = core.indexOf('function setupFlywheel');
    const fn = core.slice(start, core.indexOf('\n  function ', start + 40));
    assert.match(fn, /'pointerenter'/, 'a pointer over the band');
    assert.match(fn, /'focusin'/, 'keyboard focus inside it');
    assert.match(fn, /rootMargin: '300px'/, 'and 300 px of head start');
    assert.match(fn, /spin\.js\?v=' \+ APP_VERSION/, 'versioned like every other asset');
    assert.ok(!/requestIdleCallback/.test(fn), 'no idle warm-up: the dial is fetched by intent alone');
    // The proximity observer must not run at mount: it starts after `load`, so
    // the dial's script cannot compete with the first paint on a phone.
    const readyAt = fn.indexOf("readyState === 'complete'");
    assert.ok(readyAt !== -1, 'the observer waits for load');
    assert.ok(fn.indexOf("addEventListener('load'") > readyAt, 'and for the load event otherwise');
    // Nothing may call the observer before that branch: the observer function is
    // defined earlier (it has to be), the call is what has to be gated.
    const firstCall = fn.indexOf('setTimeout(observeLater');
    assert.ok(firstCall > readyAt, 'observeLater is only ever called from the load path');
    assert.equal(fn.split('setTimeout(observeLater').length - 1, 2,
        'exactly two call sites: already loaded, and on load');
});
