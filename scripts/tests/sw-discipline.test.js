// Proves scripts/check-sw-discipline.py still bites.
//
// The guard is the thing that makes "don't do this again" permanent, so it is
// pinned like product code: a small worker that satisfies all nine rules, then
// nine variants that each break exactly one. Every variant must fail, and must
// name the rule it broke — no more, no less. If someone weakens a rule so it
// cannot fire, the corresponding variant goes green and this test fails; if a
// rule is written so loosely that it fires on everything, the clean fixture
// fails. Run with:
//
//   node scripts/tests/sw-discipline.test.js      (also under `npm test`)
//
// Zero dependencies (node only).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const CHECKER = path.join(ROOT, 'scripts', 'check-sw-discipline.py');

// A worker that satisfies every rule, written in its own minimal style rather
// than copied from sw.js — the checker must guard the properties, not the
// exact shape of one particular file.
const CLEAN = `
const STATIC_CACHE = 'mp-static-v1';
const RUNTIME_CACHE = 'mp-runtime-v1';
const FRESH_WINDOW_MS = 600000;
const NETWORK_PATIENCE_MS = 2500;
const UNCACHED_PATIENCE_MS = 8000;
const STUCK_LIMIT = 3;
const COOLOFF_MS = 600000;
const COOLOFF_KEY = './mp-worker-disarmed';
const BACKGROUND_LIMIT = 2;
const BACKGROUND_BACKLOG = 24;
const MAX_ENTRIES = 420;
const PRUNE_EVERY = 32;
let cooloffUntil = 0;
let stuckRuns = 0;
let refreshSlots = 0;
const backlog = [];
const stats = { fallbacks: 0, disarmed: 0 };

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
    readCooloff();
    e.waitUntil(self.clients.claim());
});
self.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'mp:stats') e.ports[0].postMessage({ ok: true, stats });
});
self.addEventListener('fetch', (event) => {
    if (Date.now() < cooloffUntil) return;
    try {
        route(event);
    } catch (err) {
        // A worker that throws must not be the reason the page fails.
    }
});

function isSpeculative(req) {
    return /prefetch|prerender/i.test(req.headers.get('Sec-Purpose') || '');
}

function route(event) {
    const req = event.request;
    if (req.mode !== 'navigate' && req.destination === 'document') return;
    if (isSpeculative(req)) return;
    if (/\\.json$/.test(req.url)) { event.respondWith(freshFast(req, RUNTIME_CACHE, event)); return; }
    event.respondWith(navigateFast(req, null, event));
}

function clearBacklog() { backlog.length = 0; }

async function navigateFast(request, preload, event) {
    clearBacklog();
    const cache = await openCache(RUNTIME_CACHE);
    const cached = await matchQuietly(cache, request);
    if (!cached) {
        markStuckNavigation();
        if (self.navigator && self.navigator.onLine === false) return cachedIndex();
        return stallPage();
    }
    stuckRuns = 0;
    return cached;
}

function markStuckNavigation() {
    stats.fallbacks++;
    stuckRuns++;
    if (stuckRuns >= STUCK_LIMIT) { stuckRuns = 0; void armCooloff(); }
}

async function armCooloff() {
    cooloffUntil = Date.now() + COOLOFF_MS;
    stats.disarmed++;
    const cache = await openCache(STATIC_CACHE);
    if (cache) { try { await cache.put(new Request(COOLOFF_KEY), new Response('1')); } catch (e) {} }
    try { await self.registration.unregister(); } catch (e) {}
}

async function readCooloff() {
    const cache = await openCache(STATIC_CACHE);
    if (!cache) return;
    let hit = null;
    try { hit = await cache.match(new Request(COOLOFF_KEY)); } catch (e) { return; }
    if (hit) cooloffUntil = Date.now() + COOLOFF_MS;
}

async function cachedIndex() {
    const cache = await openCache(STATIC_CACHE);
    if (!cache) return null;
    return await matchQuietly(cache, new Request('./index.html'));
}

function stallPage() { return new Response('stalled', { status: 504 }); }

async function openCache(name) {
    try { return await caches.open(name); } catch (e) { return null; }
}
async function matchQuietly(cache, request) {
    if (!cache) return undefined;
    try { return await cache.match(request); } catch (e) { return undefined; }
}
async function store(cacheName, request, response) {
    if (!request || !response || response.status !== 200) return;
    const cache = await openCache(cacheName);
    if (!cache) return;
    try {
        await cache.put(request, response);
        const keys = await cache.keys();
        if (keys.length > MAX_ENTRIES) {
            for (let i = 0; i < keys.length - MAX_ENTRIES; i++) { await cache.delete(keys[i]); }
        }
    } catch (e) { return; }
}
async function freshFast(request, cacheName, event) {
    const ctl = new AbortController();
    const res = await Promise.race([
        fetch(request, { signal: ctl.signal }),
        after(NETWORK_PATIENCE_MS).then(() => null),
    ]);
    if (res && res.ok) {
        const saved = store(cacheName, request, res.clone());
        if (event) event.waitUntil(saved);
    }
    return res || new Response('offline', { status: 503 });
}
function after(ms) { return new Promise((r) => setTimeout(r, ms)); }
`;

// Each case: the rule it must trip, and the one edit that breaks it. Everything
// else about the worker stays compliant, so a failure names the right thing.
const CASES = [
    ['fetch-signal', (t) => t.replace('fetch(request, { signal: ctl.signal })', 'fetch(request)')],
    ['cache-guarded', (t) => t.replace('function clearBacklog() { backlog.length = 0; }',
        'function clearBacklog() { backlog.length = 0; }\nasync function bare(name) { return await caches.open(name); }')],
    ['finite-waits', (t) => t.replace('const UNCACHED_PATIENCE_MS = 8000;', 'const UNCACHED_PATIENCE_MS = Infinity;')],
    ['no-index-swap', (t) => t.replace(`        if (self.navigator && self.navigator.onLine === false) return cachedIndex();
        return stallPage();`, '        return cachedIndex();')],
    ['wrapped-dispatch', (t) => t.replace(
        '        route(event);', '        route(event);\n        if (event.request.url) event.respondWith(navigateFast(event.request, null, event));')],
    ['bounded-backlog', (t) => t.replace('    clearBacklog();\n    const cache = await openCache(RUNTIME_CACHE);',
        '    const cache = await openCache(RUNTIME_CACHE);')],
    ['escape-hatch', (t) => t.replace('    try { await self.registration.unregister(); } catch (e) {}', '')],
    ['prefetch-through', (t) => t.replace("    if (req.mode !== 'navigate' && req.destination === 'document') return;", '')],
    ['prefetch-through', (t) => t.replace('    if (isSpeculative(req)) return;', '')],
    ['store-200', (t) => t.replace('    if (!request || !response || response.status !== 200) return;',
        '    if (!request || !response) return;')],
];

function run(src) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swd-'));
    const file = path.join(dir, 'sw.js');
    fs.writeFileSync(file, src, 'utf8');
    try {
        const out = execFileSync('python3', [CHECKER, '--file', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { code: 0, out };
    } catch (e) {
        return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function rules(out) {
    return new Set([...out.matchAll(/:\s+([a-z][a-z0-9-]*):\s/g)].map((m) => m[1]));
}

let failed = 0;
function step(label, fn) {
    try {
        fn();
        console.log(`  ok   ${label}`);
    } catch (e) {
        failed++;
        console.log(`  FAIL ${label}\n       ${String(e.message).split('\n').slice(0, 6).join('\n       ')}`);
    }
}

step('the checker runs standalone and reports the file it checked', () => {
    const out = execFileSync('python3', [CHECKER, '--help'], { encoding: 'utf8' });
    assert.match(out, /usage|sw\.js|file/i);
});

step('a compliant worker passes', () => {
    const r = run(CLEAN);
    assert.strictEqual(r.code, 0, `expected clean, got:\n${r.out}`);
});

step('the real sw.js passes every rule', () => {
    const r = execFileSync('python3', [CHECKER, path.join(ROOT, 'sw.js')], { encoding: 'utf8' });
    assert.match(r, /discipline OK/);
});

for (const [rule, breakIt] of CASES) {
    step(`${rule}: breaks when the rule is violated (and only that rule)`, () => {
        const src = breakIt(CLEAN);
        assert.notStrictEqual(src, CLEAN, `the ${rule} fixture edit did not apply — the test itself is stale`);
        const r = run(src);
        assert.notStrictEqual(r.code, 0, `the ${rule} rule accepted a violation:\n${r.out}`);
        const got = rules(r.out);
        assert.ok(got.has(rule), `${rule} was violated but not named in the output:\n${r.out}`);
        assert.strictEqual(got.size, 1, `${rule} also tripped ${[...got].filter((x) => x !== rule).join(', ')} — `
            + 'either the fixture is not minimal or a rule is firing on valid code');
        assert.match(r.out, /sw\.js:\d+/, 'output must name the file and line so a contributor can act on it');
    });
}

step('the checker cannot be bypassed by the comment escape', () => {
    // the reason comments are masked is that prose mentions fetch(); a violation
    // that only LOOKS commented out (a line of code before the comment) must fire
    const r = run(CLEAN.replace('function after(ms)', 'function bare() { fetch(a); }\nfunction after(ms)'));
    assert.notStrictEqual(r.code, 0);
    assert.ok(rules(r.out).has('fetch-signal'));
});

console.log(failed ? `\nservice-worker discipline tests FAILED (${failed})` : '\nservice-worker discipline tests passed');
process.exit(failed ? 1 : 0);
