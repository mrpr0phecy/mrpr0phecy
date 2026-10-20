'use strict';

// The home page must not download the catalogue until somebody wants it.
//
// This is the site's most expensive, most repeatable performance bug: the home
// page fetched tools-index.json (about 212 KB gzipped — the largest single thing
// the page can load) in a
// warm-up "just in case". It was removed twice and came back twice, because
// nothing failed when it did: the page still worked, it just took 3.2 s to load
// on a throttled phone instead of 0.76 s, and the list section four screens
// down was ready by the time anyone got there.
//
// So the rule is behavioural and it is tested rather than described:
//
//   * mounting the home page fetches nothing;
//   * DOMContentLoaded fetches nothing, `load` fetches nothing, and no idle
//     callback is ever scheduled (that was the warm-up's shape);
//   * reaching the list, focusing the search box, or opening a #all-tools deep
//     link DOES fetch it — the catalogue is late, not withheld.
//
// A fake IntersectionObserver stands in for the real one so the proximity path
// is driven directly, the way the browser would drive it.
//
// Run with: node scripts/tests/home-catalogue-lazy.test.js

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) { ({ JSDOM } = require('jsdom')); }

const ROOT = path.resolve(__dirname, '..', '..');
const source = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const payload = {
    tools: [
        { slug: 'bmi', title: 'BMI Calculator', description: 'Body mass index.', category: 'health', categoryName: 'Health & Fitness', tags: ['bmi'], popularity: 9 },
        { slug: 'loan', title: 'Loan Calculator', description: 'Monthly repayments.', category: 'money', categoryName: 'Finance & Money', tags: ['loan'], popularity: 8 },
    ],
    categories: [{ name: 'Health & Fitness', slug: 'health', count: 1 }, { name: 'Finance & Money', slug: 'money', count: 1 }],
};

async function boot({ hash = '', search = '' } = {}) {
    const dom = new JSDOM(
        `<!doctype html><html><body>
            <input id="tool-search" type="search">
            <a class="popular-chip" data-query="bmi" href="#all-tools">BMI</a>
            <main>
                <section id="all-tools-section">
                    <div id="explore" data-explore="json"></div>
                </section>
            </main>
        </body></html>`,
        {
            url: 'https://perf.test/index.html' + (search ? '?q=' + search : '') + hash,
            runScripts: 'outside-only',
            pretendToBeVisual: true,
        },
    );
    const w = dom.window;
    await new Promise((resolve) => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));

    // The observer the page would get in a browser: records the callback and
    // its options so the test can fire the entry itself.
    const observers = [];
    w.IntersectionObserver = class {
        constructor(callback, options) {
            this.callback = callback;
            this.options = options || {};
            this.observed = [];
            observers.push(this);
        }
        observe(el) { this.observed.push(el); }
        unobserve() {}
        disconnect() { this.disconnected = true; }
    };
    // If the code ever schedules work on idle again, the test has to see it.
    const idle = [];
    w.requestIdleCallback = (fn) => { idle.push(fn); return idle.length; };
    w.cancelIdleCallback = () => {};

    const fetched = [];
    w.fetch = async (url) => {
        fetched.push(String(url));
        if (String(url).includes('tools-index.json')) {
            return { ok: true, status: 200, json: async () => payload };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    };
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.AbortController = w.AbortController || class { abort() {} signal() {} };

    w.eval(source('toolbox.js'));
    w.eval(source('explore.js'));
    return { dom, w, fetched, observers, idle };
}

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const catalogueCalls = (fetched) => fetched.filter((url) => url.includes('tools-index.json')).length;

test('mounting the home page fetches no catalogue, and no idle warm-up is scheduled', async () => {
    const { w, fetched, idle, observers } = await boot();
    try {
        await settle();
        assert.equal(catalogueCalls(fetched), 0, 'the catalogue was requested while the page was mounting');
        // The old warm-up: idle(begin, {timeout: 600}) and load -> begin.
        w.dispatchEvent(new w.Event('load'));
        await settle();
        assert.equal(idle.length, 0, 'something asked the browser for idle time during a home-page load');
        assert.equal(catalogueCalls(fetched), 0, 'the catalogue was requested on the load event');
        // It must still be ready to be asked for: the observer exists, is
        // watching the list, and starts a long way before the list is visible.
        assert.equal(observers.length, 1, 'no IntersectionObserver was created for the list');
        assert.ok(observers[0].observed.length >= 1, 'the observer is not watching anything');
        const margin = parseInt(String(observers[0].options.rootMargin || '0'), 10);
        assert.ok(margin >= 1000, `rootMargin is ${margin}px — the list would still be empty on arrival`);
    } finally {
        w.close();
    }
});

test('reaching the list starts the catalogue exactly once', async () => {
    const { w, fetched, observers } = await boot();
    try {
        const io = observers[0];
        io.callback([{ isIntersecting: true, target: io.observed[0] }], io);
        await settle();
        assert.equal(catalogueCalls(fetched), 1, 'the list arriving did not load the catalogue');
        // A second entry (the observer firing again before disconnect) must not
        // start a second download.
        io.callback([{ isIntersecting: true, target: io.observed[0] }], io);
        await settle();
        assert.equal(catalogueCalls(fetched), 1, 'the catalogue was fetched twice');
    } finally {
        w.close();
    }
});

test('focusing the search box starts the catalogue (intent, before the first keystroke)', async () => {
    const { w, fetched } = await boot();
    try {
        w.document.getElementById('tool-search').dispatchEvent(new w.FocusEvent('focusin', { bubbles: true }));
        await settle();
        assert.equal(catalogueCalls(fetched), 1, 'search intent did not start the catalogue');
    } finally {
        w.close();
    }
});

test('a #all-tools deep link loads the catalogue immediately', async () => {
    const { w, fetched } = await boot({ hash: '#all-tools' });
    try {
        await settle();
        assert.equal(catalogueCalls(fetched), 1, 'a deep link to the list did not load the catalogue');
    } finally {
        w.close();
    }
});

test('a shared ?q= link loads the catalogue immediately', async () => {
    const { w, fetched } = await boot({ search: 'bmi' });
    try {
        await settle();
        assert.equal(catalogueCalls(fetched), 1, 'a shared search link did not load the catalogue');
    } finally {
        w.close();
    }
});
