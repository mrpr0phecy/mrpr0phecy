'use strict';

// The home page's shelves: a row of cards that scrolls sideways, and a mouse.
//
// #featured and #trending are horizontal strips wherever they are wider than
// the window (below 1040 px for Most used, below 760 px for Start here). A
// thumb swipes them and a trackpad pushes them sideways, but a mouse has no
// gesture for "right": the wheel scrolls the page, the overlay scrollbar only
// appears while scrolling, and the row simply looked cut off. At 1000 px wide
// six of the eight Most-used tools could not be reached at all.
//
// So explore.js grows a small controller, and this file drives it in jsdom
// with the geometry a browser would report:
//
//   * the vertical wheel scrolls the row while it still has room, and gives
//     the page its scroll back at either end (a shelf must never trap a page);
//   * pressing and dragging the row scrolls it, and the click that ends a drag
//     is swallowed so a drag never opens the card it finished on;
//   * a plain click still opens the card (the first version of the drag used
//     pointer capture, which retargets the click for exactly this reason);
//   * the edge buttons move one card and disable at the ends;
//   * Left/Right scroll a row that has keyboard focus;
//   * a row that fits the window is left completely alone.
//
// jsdom has no layout: scrollWidth, clientWidth and offsetLeft are all 0 there,
// so each element's geometry is defined explicitly. That is the point — the
// controller's decisions are all arithmetic on those numbers, and this pins the
// arithmetic rather than a browser's rendering of it.
//
// Run with: node scripts/tests/shelf-controls.test.js

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) { ({ JSDOM } = require('jsdom')); }

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'explore.js'), 'utf8');

const ROWS = 8;
const CARD = 220;          // card + gap, what one press should move
const VISIBLE = 960;       // a 1000 px window minus the page gutter
const TOTAL = ROWS * CARD + 150;  // a row wider than the window

/** A page with one shelf, and the geometry a browser would report for it. */
function boot({ rowWidth = TOTAL, visibleWidth = VISIBLE, section = 'Most used' } = {}) {
    const rows = Array.from({ length: ROWS }, (_, i) =>
        `<li class="xp-row"><a href="tool/t${i}.html">Tool ${i + 1}</a></li>`).join('');
    const dom = new JSDOM(
        `<!doctype html><html><body>
            <main><section id="most-used"><h2>${section}</h2><ul id="trending">${rows}</ul></section></main>
        </body></html>`,
        { url: 'https://shelf.test/index.html', runScripts: 'outside-only', pretendToBeVisual: true },
    );
    const w = dom.window;
    const el = w.document.getElementById('trending');

    // Explicit geometry: jsdom reports zero for all of these.
    let left = 0;
    Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => rowWidth });
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => visibleWidth });
    Object.defineProperty(el, 'scrollLeft', {
        configurable: true,
        get: () => left,
        set: (v) => { left = Math.max(0, Math.min(rowWidth - visibleWidth, Number(v) || 0)); },
    });
    // One press = one card. The controller measures the gap between the first
    // two rows rather than hard-coding a width.
    [...el.children].forEach((li, i) => {
        Object.defineProperty(li, 'offsetLeft', { configurable: true, get: () => i * CARD });
    });
    // scrollBy is what a smooth press uses; keep it on the same geometry.
    el.scrollBy = (opts) => { el.scrollLeft = el.scrollLeft + (opts.left || 0); };

    w.eval(SOURCE);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    return { dom, w, el };
}

const arrow = (w, el, dir) => el.parentNode.querySelector(`[data-dir="${dir}"]`);

/* jsdom does not fire a scroll event when scrollLeft is written, and the
   buttons' state is synced from that event (as it is in a browser). Settle the
   row the way a real scroll would: one event, one frame. */
/* Click a card and report whether the page's own code cancelled the click.
   jsdom tries to navigate an anchor it cannot navigate, which prints a warning
   over the suite's output; a guard listener reads defaultPrevented first and
   then cancels the navigation jsdom would attempt anyway. */
function clickCard(w) {
    const a = w.document.querySelector('#trending a');
    let prevented;
    const guard = (ev) => { prevented = ev.defaultPrevented; ev.preventDefault(); };
    w.document.addEventListener('click', guard, true);
    const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    w.document.removeEventListener('click', guard, true);
    return prevented;
}

async function settle(w, el) {
    el.dispatchEvent(new w.Event('scroll'));
    await new Promise((r) => w.requestAnimationFrame(() => w.requestAnimationFrame(r)));
}

function wheel(w, el, deltaY, extra = {}) {
    const ev = new w.MouseEvent('wheel', { bubbles: true, cancelable: true, ...extra });
    Object.defineProperty(ev, 'deltaY', { value: deltaY });
    Object.defineProperty(ev, 'deltaX', { value: extra.deltaX || 0 });
    Object.defineProperty(ev, 'deltaMode', { value: 0 });
    el.dispatchEvent(ev);
    return ev;
}

function pointer(w, el, type, x, { pointerId = 1, button = 0, pointerType = 'mouse' } = {}) {
    const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button });
    Object.defineProperty(ev, 'pointerId', { value: pointerId });
    Object.defineProperty(ev, 'pointerType', { value: pointerType });
    el.dispatchEvent(ev);
    return ev;
}

test('the shelf gets a wrapper and a disabled back button at the start', () => {
    const { w, el } = boot();
    const wrap = el.parentNode;
    assert.equal(wrap.className, 'xp-shelf', 'the row is wrapped so the buttons can sit over it');
    assert.equal(arrow(w, el, 'prev').disabled, true, 'nothing to scroll back to');
    assert.equal(arrow(w, el, 'next').disabled, false, 'there is more to the right');
    assert.match(arrow(w, el, 'next').getAttribute('aria-label'), /Scroll Most used forward/);
    assert.equal(arrow(w, el, 'next').getAttribute('aria-controls'), 'trending');
});

test('a row that fits gets no controls at all', () => {
    const { w, el } = boot({ rowWidth: VISIBLE });
    assert.equal(arrow(w, el, 'prev').hidden, true);
    assert.equal(arrow(w, el, 'next').hidden, true);
    const ev = wheel(w, el, 300);
    assert.equal(ev.defaultPrevented, false, 'a row with nothing to scroll must not eat the wheel');
    assert.equal(el.scrollLeft, 0);
});

test('the vertical wheel scrolls the row sideways', () => {
    const { w, el } = boot();
    const ev = wheel(w, el, 240);
    assert.equal(ev.defaultPrevented, true, 'the wheel was used, so the page must not also scroll');
    assert.equal(el.scrollLeft, 240);
});

test('at the end the wheel gives the page its scroll back', async () => {
    const { w, el } = boot();
    wheel(w, el, 5000);
    assert.equal(el.scrollLeft, TOTAL - VISIBLE, 'the row stops at its last card');
    await settle(w, el);
    const ev = wheel(w, el, 240);
    assert.equal(ev.defaultPrevented, false, 'nothing left to scroll, so the page scrolls');
    assert.equal(arrow(w, el, 'next').disabled, true);
    assert.equal(arrow(w, el, 'prev').disabled, false);
});

test('at the start, scrolling up also reaches the page', () => {
    const { w, el } = boot();
    const ev = wheel(w, el, -240);
    assert.equal(ev.defaultPrevented, false);
    assert.equal(el.scrollLeft, 0);
});

test('a sideways (trackpad) gesture is left to the browser', () => {
    const { w, el } = boot();
    const ev = wheel(w, el, 0, { deltaX: 200 });
    assert.equal(ev.defaultPrevented, false, 'deltaX is already a sideways scroll');
    assert.equal(el.scrollLeft, 0);
});

test('the edge buttons move one card, not one screen', async () => {
    const { w, el } = boot();
    arrow(w, el, 'next').click();
    assert.equal(el.scrollLeft, CARD, 'one card: 220 px, measured from the rows themselves');
    await settle(w, el);
    arrow(w, el, 'next').click();
    assert.equal(el.scrollLeft, CARD * 2);
    await settle(w, el);
    arrow(w, el, 'prev').click();
    assert.equal(el.scrollLeft, CARD);
    assert.equal(arrow(w, el, 'next').disabled, false, 'the row can move again');
});

test('dragging the row scrolls it', () => {
    const { w, el } = boot();
    pointer(w, el, 'pointerdown', 500);
    pointer(w, el, 'pointermove', 400);
    assert.equal(el.scrollLeft, 100, 'dragging left moves the row right');
    pointer(w, el, 'pointerup', 400);
    assert.equal(el.parentNode.className, 'xp-shelf', 'the dragging class is removed again');
});

test('a drag does not open the card it ends on', () => {
    const { w, el } = boot();
    pointer(w, el, 'pointerdown', 500);
    pointer(w, el, 'pointermove', 380);
    pointer(w, el, 'pointerup', 380);
    assert.equal(clickCard(w), true, 'the click that ends a drag is swallowed');
    assert.equal(clickCard(w), false, 'only that one click, so the next tap still opens a tool');
});

test('a press with no movement still opens the card', () => {
    const { w, el } = boot();
    pointer(w, el, 'pointerdown', 500);
    pointer(w, el, 'pointermove', 498);   // a jittery hand, under the threshold
    pointer(w, el, 'pointerup', 498);
    assert.equal(clickCard(w), false, 'a tap is a tap: the card opens');
    assert.equal(el.scrollLeft, 0);
});

test('left and right scroll a row that holds focus', () => {
    const { w, el } = boot();
    const down = new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    el.dispatchEvent(down);
    assert.equal(down.defaultPrevented, true);
    assert.equal(el.scrollLeft, CARD);
    const back = new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
    el.dispatchEvent(back);
    assert.equal(el.scrollLeft, 0);
    // Modified arrows stay with the browser (page back/forward, tab switching).
    const alt = new w.KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true });
    el.dispatchEvent(alt);
    assert.equal(alt.defaultPrevented, false);
});

test('the controller is mounted even when the list engine has nothing to do', () => {
    // The home page's shelves must work on a page whose list failed to mount
    // (or that has no [data-explore] container at all) — watchShelves runs
    // before the list guard for that reason.
    const { w, el } = boot();
    assert.ok(w.document.querySelector('.xp-shelf'));
    assert.equal(el.id, 'trending', 'the row keeps its id: generated markup and links point at it');
});
