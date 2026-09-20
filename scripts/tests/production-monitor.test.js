// Tests for the production contract monitor (scripts/check-production.js).
//
// The monitor's whole job is to notice when the deployed site stops matching
// this repository — a stale deploy, a truncated catalogue, a custom-404 rule
// that stopped applying, an HTTPS redirect that broke. None of that can be
// tested against the real domain from a test run, so this file builds a
// miniature repository and serves it from a local HTTP server, then drives the
// real monitor functions against it and asserts each failure is caught.
//
// It never leaves the machine: the only server is 127.0.0.1, and the monitor's
// https/apex checks are skipped in local mode (proving skips are visible).
//
// Run with: node scripts/tests/production-monitor.test.js
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const monitor = require('../check-production.js');

// ---------------------------------------------------------------- fixtures

const CARDS = Array.from({ length: 12 }, (_, i) => ({
  id: `card-${i}-title`,
  name: `card-${i}`,
  title: `Card ${i}`,
  description: `Fixture card ${i}.`,
  category: 'Fixtures',
  file: `card-${i}.html`,
}));

function sitemap(urls) {
  return `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map(u => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;
}

function buildFixtureRepo(root) {
  const write = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  write('CNAME', 'fixture.example.com');
  write('index.html', '<!DOCTYPE html><html><body><h1>Fixture home</h1></body></html>');
  // The real page's stylesheets are probed for byte equality too.
  write('home.css', 'body { color: #e6faff; }\n');
  write('home-deferred.css', '.palette-panel { right: 16px; }\n');
  write('home-app.js', '/* fixture app */\n');
  write('home-features.js', '/* fixture on-demand bundle */\n');
  write('tool.html', '<!DOCTYPE html><html><body><h1>Fixture tool shell</h1></body></html>');
  write('listen.html', '<!DOCTYPE html><html><body><h1>Fixture music</h1></body></html>');
  write('manifest.json', JSON.stringify({ name: 'Fixture', start_url: '/' }));
  write('robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: https://fixture.example.com/sitemap.xml\n');
  write('404.html', '<!DOCTYPE html><html><body><h1>Fixture not found</h1></body></html>');
  write('cards/cards.json', JSON.stringify(CARDS));
  for (const card of CARDS) write(`cards/${card.file}`, `<!DOCTYPE html><html><body>${card.name}</body></html>`);
  // The URL set mirrors what the real repo does: pages, not assets.
  write('sitemap.xml', sitemap([
    'https://fixture.example.com/',
    'https://fixture.example.com/tool.html',
    'https://fixture.example.com/listen.html',
    ...CARDS.map(card => `https://fixture.example.com/cards/${card.file}`),
  ]));
  write('tools/bmi.html', '<!DOCTYPE html><html><body><h1>Fixture BMI page</h1></body></html>');
  // The machine-readable surface the real site advertises, including the
  // dot-directory that GitHub Pages' Jekyll build used to drop.
  write('llms.txt', '# Fixture\n\nMachine-readable summary of the fixture.\n');
  write('llms-full.txt', '# Fixture, in full\n\nEverything the short one leaves out.\n');
  write('feed.xml', '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Fixture</title></channel></rss>');
  write('related.json', JSON.stringify({ 'index.html': [] }));
  write('.well-known/ai.txt', 'User-agent: *\nAllow: /\n');
  write('.well-known/security.txt', 'Contact: mailto:security@example.com\nExpires: 2027-01-01T00:00:00Z\n');
  // A filename carrying URL-meaning characters, mirroring staff/claims (the
  // branch slash is stored as a literal %2F). The monitor must request it
  // encoded and still match retries back to the repository path (issue #91).
  write('staff/claims/arena%2Ffixture-branch.json', JSON.stringify({ branch: 'arena/fixture-branch' }));
  return root;
}

function contentTypeFor(rel) {
  if (rel.endsWith('.json')) return 'application/json';
  if (rel.endsWith('.xml')) return 'application/xml';
  if (rel.endsWith('.txt')) return 'text/plain';
  return 'text/html; charset=utf-8';
}

// A deliberately small static server with per-scenario misbehaviour, so each
// test can reproduce one production failure without touching the network.
function startServer(root, fault) {
  const requests = new Map();
  // The 'slow' fault holds every response behind a timer. Those timers have to
  // be cancellable: the monitor aborts a slow request at its own deadline and
  // moves on, but a Node server does not close while a pending setTimeout can
  // still fire, so `server.close()` blocked until the last delay elapsed. One
  // scenario in this suite cost 5.4 s of every verify run — the whole cost was
  // the fixture waiting on responses nobody was going to read.
  const pending = new Set();
  const later = (ms, fn) => {
    const timer = setTimeout(() => { pending.delete(timer); fn(); }, ms);
    pending.add(timer);
    return timer;
  };
  // The monitor's fetches are keep-alive, so the sockets outlive the run.
  // `server.close()` waits for every connection to end, which left the slow
  // scenario sitting on three idle sockets for 3.8 s after the assertions had
  // already passed. This is a throwaway fixture server on 127.0.0.1 with no
  // in-flight work at close time, so the sockets are destroyed outright.
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel === '') rel = 'index.html';
    const localPath = path.join(root, rel);
    const hits = (requests.get(rel) || 0) + 1;
    requests.set(rel, hits);

    const send = (status, body, type) => {
      res.writeHead(status, { 'content-type': type || contentTypeFor(rel) });
      res.end(body);
    };

    if (fault === 'slow') {
      // Cancelled the moment the client gives up (which is the whole point of
      // the scenario: the monitor must abort and report, not hang). 150 ms is
      // comfortably over the 50 ms deadline the scenario passes in, and the
      // old 700 ms delay only made the aborted requests linger.
      const timer = later(150, () => {
        if (res.writableEnded || res.destroyed) return;
        send(200, fs.existsSync(localPath) ? fs.readFileSync(localPath) : '');
      });
      res.on('close', () => { clearTimeout(timer); pending.delete(timer); });
      return;
    }

    const exists = fs.existsSync(localPath) && fs.statSync(localPath).isFile();
    if (!exists) {
      if (fault === 'bad-404') return send(200, fs.readFileSync(path.join(root, 'index.html')));
      return send(404, fs.readFileSync(path.join(root, '404.html')));
    }

    let body = fs.readFileSync(localPath);
    if (rel === 'index.html' && fault === 'stale-index') {
      body = Buffer.from(body.toString() + '<!-- stale deploy -->');
    }
    if (rel === 'cards/cards.json' && fault === 'stale-index') {
      body = Buffer.from(body.toString() + '\n');
    }
    if (rel === 'cards/cards.json' && fault === 'truncated-catalogue') {
      body = Buffer.from(JSON.stringify(CARDS.slice(0, 5)));
    }
    if (rel === 'cards/cards.json' && fault === 'duplicate-slugs') {
      body = Buffer.from(JSON.stringify([...CARDS, CARDS[0]]));
    }
    if (rel === 'sitemap.xml' && fault === 'sitemap-drift') {
      const urls = monitor.extractSitemapUrls(body.toString());
      urls.delete('https://fixture.example.com/listen.html');
      body = Buffer.from(sitemap([...urls]));
    }
    if (rel === 'cards/card-0.html' && fault === 'missing-card') {
      return send(404, fs.readFileSync(path.join(root, '404.html')));
    }
    if (rel === 'cards/cards.json' && fault === 'catch-up' && hits < 3) {
      body = Buffer.from(JSON.stringify(CARDS.slice(0, 3)));
    }
    // The encoded-path file goes stale-then-fresh under the same fault, so
    // the retry loop has to resolve it through the percent-decoding.
    if (rel === 'staff/claims/arena%2Ffixture-branch.json' && fault === 'catch-up' && hits < 3) {
      body = Buffer.from('{"stale":true}');
    }
    send(200, body);
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        base: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise(done => {
          for (const timer of pending) clearTimeout(timer);
          pending.clear();
          server.close(done);
          for (const socket of sockets) socket.destroy();
          sockets.clear();
        }),
      });
    });
  });
}

async function run(root, base, extra = {}) {
  return monitor.runChecks({
    root,
    base,
    allowHttp: true,
    timeoutMs: 5000,
    ttfbWarnMs: 5000,
    concurrency: 4,
    sample: 3,
    seed: 5,
    retries: 0,
    retryMismatch: 0,
    retryDelayMs: 10,
    strict: false,
    extraFiles: [],
    extraProbes: [],
    commit: 'fixture-sha',
    repoUrl: 'fixture/repo',
    ...extra,
  });
}

const failureSurfaces = report => report.checks.filter(c => !c.ok && c.severity === 'fail').map(c => c.surface);
const details = report => report.checks.filter(c => !c.ok).map(c => `${c.surface}: ${c.detail}`).join(' | ');

// ------------------------------------------------------------------- tests

let passed = 0;
function check(name, fn) {
  return fn().then(() => {
    passed += 1;
    console.log(`  ok   ${name}`);
  });
}

async function main() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-monitor-'));
  buildFixtureRepo(fixtureRoot);

  try {
    await check('healthy site: contract holds, and local runs report their skips', async () => {
      const server = await startServer(fixtureRoot, 'none');
      try {
        const report = await run(fixtureRoot, server.base);
        assert.strictEqual(report.summary.status, 'pass', details(report));
        assert.strictEqual(report.summary.failed, 0, details(report));
        assert.strictEqual(report.summary.warned, 0, details(report));
        assert.ok(report.summary.skipped >= 2, 'https and apex checks must be reported as skipped');
        assert.strictEqual(report.summary.passed, report.summary.checks - report.summary.skipped,
          'skipped checks must not count as passes');
        assert.ok(report.checks.some(c => c.surface === 'https enforcement' && c.skipped));
        assert.ok(report.checks.some(c => c.surface === 'catalogue integrity' && c.ok));
        assert.ok(report.checks.some(c => c.surface === '404 handling' && c.ok));
      } finally {
        await server.close();
      }
    });

    await check('stale deploy: byte-identical contract fails on the drifted file only', async () => {
      const server = await startServer(fixtureRoot, 'stale-index');
      try {
        const report = await run(fixtureRoot, server.base);
        assert.strictEqual(report.summary.status, 'fail');
        const surfaces = failureSurfaces(report);
        assert.ok(surfaces.includes('index.html'), 'index.html drift must fail');
        assert.ok(report.checks.some(c => c.surface === 'index.html' && /live bytes differ/.test(c.detail)));
        assert.ok(!surfaces.includes('robots.txt'), 'unchanged files must still pass');
      } finally {
        await server.close();
      }
    });

    await check('truncated catalogue is caught even though the JSON parses', async () => {
      const server = await startServer(fixtureRoot, 'truncated-catalogue');
      try {
        const report = await run(fixtureRoot, server.base);
        assert.ok(failureSurfaces(report).includes('catalogue integrity'));
        assert.ok(report.checks.some(c => c.surface === 'catalogue integrity' && /live catalogue has 5 cards/.test(c.detail)));
      } finally {
        await server.close();
      }
    });

    await check('duplicate slugs on the live site are caught', async () => {
      const server = await startServer(fixtureRoot, 'duplicate-slugs');
      try {
        const report = await run(fixtureRoot, server.base);
        assert.ok(report.checks.some(c => c.surface === 'catalogue integrity' && /duplicate slugs/.test(c.detail)));
      } finally {
        await server.close();
      }
    });

    await check('sitemap drift is caught by URL-set comparison', async () => {
      const server = await startServer(fixtureRoot, 'sitemap-drift');
      try {
        const report = await run(fixtureRoot, server.base);
        assert.ok(report.checks.some(c => c.surface === 'sitemap integrity' && /1 missing/.test(c.detail)));
      } finally {
        await server.close();
      }
    });

    await check('a broken custom 404 fails even though the status is 200', async () => {
      const server = await startServer(fixtureRoot, 'bad-404');
      try {
        const report = await run(fixtureRoot, server.base);
        assert.ok(report.checks.some(c => c.surface === '404 handling' && /returned 200, not 404/.test(c.detail)));
      } finally {
        await server.close();
      }
    });

    await check('a missing card file fails availability for that card', async () => {
      const server = await startServer(fixtureRoot, 'missing-card');
      try {
        // Force card-0 into the sample so the fault is deterministic.
        const report = await run(fixtureRoot, server.base, { sample: 12 });
        const surfaces = failureSurfaces(report);
        assert.ok(surfaces.includes('cards/card-0.html'), `expected cards/card-0.html in ${surfaces.join(',')}`);
        assert.ok(report.checks.some(c => c.surface === 'cards/card-0.html' && /expected 200, received 404/.test(c.detail)));
      } finally {
        await server.close();
      }
    });

    await check('a slow origin is reported as a timeout failure', async () => {
      const server = await startServer(fixtureRoot, 'slow');
      try {
        const report = await run(fixtureRoot, server.base, { timeoutMs: 50 });
        assert.strictEqual(report.summary.status, 'fail');
        assert.ok(report.checks.some(c => /timed out after 50ms/.test(c.detail)), details(report));
      } finally {
        await server.close();
      }
    });

    await check('--retry-mismatch absorbs a CDN still catching up, and is bounded', async () => {
      const server = await startServer(fixtureRoot, 'catch-up');
      try {
        const report = await run(fixtureRoot, server.base, { retryMismatch: 3, retries: 0 });
        // The first two requests per URL serve a stale catalogue; the retry
        // must settle it rather than report a false failure.
        assert.ok(report.checks.some(c => c.surface === 'cards/cards.json' && c.ok),
          details(report));
        assert.strictEqual(report.summary.status, 'pass', details(report));
      } finally {
        await server.close();
      }
    });

    await check('a persistent mismatch still fails after the retries are spent', async () => {
      const server = await startServer(fixtureRoot, 'stale-index');
      try {
        const report = await run(fixtureRoot, server.base, { retryMismatch: 2 });
        assert.ok(failureSurfaces(report).includes('index.html'), details(report));
      } finally {
        await server.close();
      }
    });

    await check('filenames with URL-meaning characters are requested encoded (issue #91)', async () => {
      const encoded = 'staff/claims/arena%2Ffixture-branch.json';
      // Unit level: % and spaces are escaped, slashes stay slashes, and
      // probe query strings pass through untouched.
      assert.strictEqual(monitor.encodeRelUrl(encoded), 'staff/claims/arena%252Ffixture-branch.json');
      assert.strictEqual(monitor.encodeRelUrl('cards/my tool.html'), 'cards/my%20tool.html');
      assert.strictEqual(monitor.encodeRelUrl('tool.html?card=x&embed=1'), 'tool.html?card=x&embed=1');
      // End to end: the fixture server decodes once, exactly like Pages, so
      // an unencoded request would 404 on the phantom nested path.
      const server = await startServer(fixtureRoot, 'none');
      try {
        const report = await run(fixtureRoot, server.base, { extraFiles: [encoded] });
        assert.ok(report.checks.some(c => c.surface === encoded && c.ok), details(report));
        assert.strictEqual(report.summary.status, 'pass', details(report));
      } finally {
        await server.close();
      }
    });

    await check('--retry-mismatch settles encoded paths against the repository', async () => {
      const encoded = 'staff/claims/arena%2Ffixture-branch.json';
      const settledServer = await startServer(fixtureRoot, 'catch-up');
      try {
        const settled = await run(fixtureRoot, settledServer.base,
          { extraFiles: [encoded], retryMismatch: 3, retries: 0 });
        assert.ok(settled.checks.some(c => c.surface === encoded && c.ok), details(settled));
        assert.strictEqual(settled.summary.status, 'pass', details(settled));
      } finally {
        await settledServer.close();
      }
      // A fresh server restarts the stale window: without retries the same
      // bytes must still fail rather than pass by accident.
      const staleServer = await startServer(fixtureRoot, 'catch-up');
      try {
        const unretried = await run(fixtureRoot, staleServer.base,
          { extraFiles: [encoded], retryMismatch: 0, retries: 0 });
        assert.ok(failureSurfaces(unretried).includes(encoded),
          `stale encoded bytes must fail without retries: ${details(unretried)}`);
      } finally {
        await staleServer.close();
      }
    });

    await check('unreachable origin fails availability without throwing', async () => {
      // Nothing is listening on this port: the monitor must report, not crash.
      const report = await run(fixtureRoot, 'http://127.0.0.1:1');
      assert.strictEqual(report.summary.status, 'fail');
      assert.ok(report.checks.some(c => /unreachable/.test(c.detail)), details(report));
    });

    await check('plain http is refused unless --allow-http is set', async () => {
      const server = await startServer(fixtureRoot, 'none');
      try {
        const report = await run(fixtureRoot, server.base, { allowHttp: false });
        assert.ok(report.checks.every(c => !c.ok || c.skipped || c.kind === 'skipped'),
          'https-only mode must not check anything over http');
        assert.ok(report.checks.some(c => /refusing http:/.test(c.detail)), details(report));
      } finally {
        await server.close();
      }
    });

    await check('CNAME is the single source of truth for the host', async () => {
      const repo = monitor.loadRepo(fixtureRoot);
      assert.strictEqual(repo.cname, 'fixture.example.com');
      assert.strictEqual(repo.cards.length, CARDS.length);
      assert.strictEqual(repo.sitemapUrls.size, CARDS.length + 3);

      const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-monitor-nocname-'));
      try {
        fs.mkdirSync(path.join(broken, 'cards'));
        fs.writeFileSync(path.join(broken, 'cards', 'cards.json'), JSON.stringify(CARDS));
        assert.throws(() => monitor.loadRepo(broken), /CNAME is missing/);
      } finally {
        fs.rmSync(broken, { recursive: true, force: true });
      }
    });

    await check('arguments are validated instead of silently defaulting', async () => {
      assert.throws(() => monitor.parseArgs(['--sample', 'nope']), /must be a non-negative number/);
      assert.throws(() => monitor.parseArgs(['--concurrency', '0']), /at least 1/);
      assert.throws(() => monitor.parseArgs(['--unknown']), /unknown argument/);
      assert.throws(() => monitor.parseArgs(['--base']), /--base needs a value/);
      const parsed = monitor.parseArgs(['--base', 'https://www.example.com/', '--sample', '4']);
      assert.strictEqual(parsed.base, 'https://www.example.com');
      assert.strictEqual(parsed.sample, 4);
    });

    await check('the CLI documents every flag the workflow depends on', async () => {
      const { execFileSync } = require('node:child_process');
      const help = execFileSync(process.execPath, [path.join(__dirname, '..', 'check-production.js'), '--help'], { encoding: 'utf8' });
      for (const flag of ['--base', '--compare', '--probe', '--sample', '--seed', '--json', '--summary', '--retry-mismatch', '--repo', '--allow-http']) {
        assert.ok(help.includes(flag), `${flag} must be documented in --help`);
      }
      assert.ok(/Exit codes: 0 = contract held/.test(fs.readFileSync(path.join(__dirname, '..', 'check-production.js'), 'utf8')),
        'exit codes must stay documented in the script header');
    });

    await check('the recovery script still plans a rollback without touching the repository', async () => {
      const { execFileSync } = require('node:child_process');
      const repoRoot = path.resolve(__dirname, '..', '..');
      try {
        execFileSync('git', ['-C', repoRoot, 'rev-parse', '--verify', 'HEAD'], { stdio: 'pipe' });
      } catch {
        console.log('       (skipped: git or commits unavailable in this checkout)');
        return;
      }
      const before = execFileSync('git', ['-C', repoRoot, 'status', '--porcelain'], { encoding: 'utf8' });
      const output = execFileSync('bash', [path.join(repoRoot, 'scripts', 'rollback.sh'), '--ref', 'HEAD'], { encoding: 'utf8' });
      assert.ok(/Plan only — nothing was changed/.test(output), 'plan mode must say it changed nothing');
      assert.ok(/git revert --no-edit/.test(output), 'the plan must show the revert command');
      const after = execFileSync('git', ['-C', repoRoot, 'status', '--porcelain'], { encoding: 'utf8' });
      assert.strictEqual(after, before, 'plan mode must not modify the working tree');
    });

    await check('the production workflow is wired to this monitor and cannot run on pull requests', async () => {
      const workflowPath = path.resolve(__dirname, '..', '..', '.github', 'workflows', 'production-monitor.yml');
      const workflow = fs.readFileSync(workflowPath, 'utf8');
      assert.ok(workflow.includes('node scripts/check-production.js'), 'workflow must run the monitor');
      // workflow_run on the dynamic "pages build and deployment" workflow was
      // verified not to fire (2026-09-15), so the push event is the trigger.
      assert.ok(/^on:\n  push:\n    branches: \[main\]$/m.test(workflow), 'workflow must run on every push to main');
      assert.ok(/schedule:/.test(workflow), 'workflow must keep a standing schedule');
      assert.ok(/sleep 45/.test(workflow), 'push runs must allow the deployment to land before probing');
      assert.ok(!/pull_request/.test(workflow), 'the monitor must never probe production from a pull request');
      // Count permission entries, not prose: the header comment explains the
      // permissions too, and only the alert job may actually hold them.
      assert.strictEqual((workflow.match(/^\s+issues: write$/gm) || []).length, 1, 'only the alert job may write issues');
      assert.strictEqual((workflow.match(/contents: write/g) || []).length, 0, 'no job may write to the repository');
    });

    await check('the Markdown report is usable as a step summary and an issue body', async () => {
      const server = await startServer(fixtureRoot, 'stale-index');
      try {
        const report = await run(fixtureRoot, server.base);
        const markdown = monitor.renderMarkdown(report);
        assert.ok(markdown.includes('Production contract: BROKEN'));
        assert.ok(markdown.includes('https://github.com/fixture/repo/blob/main/docs/OPERATIONS.md'));
        assert.ok(markdown.includes('| FAIL |'));
        assert.ok(markdown.includes('Sample seed:'));
      } finally {
        await server.close();
      }
    });

    await check('a probed file that vanishes from the repository fails loudly', async () => {
      const rel = 'llms.txt';
      const full = path.join(fixtureRoot, rel);
      const body = fs.readFileSync(full);
      fs.rmSync(full);
      try {
        const server = await startServer(fixtureRoot, 'none');
        try {
          const report = await run(fixtureRoot, server.base);
          assert.strictEqual(report.summary.status, 'fail');
          assert.ok(report.checks.some(c => c.surface === rel && c.severity === 'fail' && /repository file .* is missing/.test(c.detail)),
            details(report));
        } finally {
          await server.close();
        }
      } finally {
        fs.writeFileSync(full, body);
      }
    });

    await check('the probed surface cannot rot: every advertised file is still in the repository', async () => {
      const repoRoot = path.join(__dirname, '..', '..');
      assert.ok(fs.existsSync(path.join(repoRoot, '.nojekyll')),
        '.nojekyll is missing — without it Pages runs the repository through Jekyll, which drops dot- and underscore-paths (that is how .well-known/ai.txt was 404 in production)');
      for (const rel of monitor.criticalFiles()) {
        assert.ok(fs.existsSync(path.join(repoRoot, rel)),
          `${rel} is probed by the monitor but is not in the repository`);
      }
    });

    await check('a pipe or a newline in a finding cannot break the issue body table', async () => {
      const report = {
        base: 'https://example.test',
        repoUrl: 'fixture/repo',
        generatedAt: '2026-09-15T00:00:00Z',
        commit: 'fixture-sha',
        sample: { seed: 7, cards: [] },
        summary: { status: 'fail', warned: false, checks: 1, passed: 0, failed: 1, warned: 0, skipped: 0, slowestTtfbMs: null },
        checks: [{ ok: false, severity: 'fail', surface: 'cards/a|b.html', detail: 'line one\nline two | end' }],
      };
      const markdown = monitor.renderMarkdown(report);
      const rows = markdown.split('\n').filter(line => line.startsWith('| FAIL |'));
      assert.strictEqual(rows.length, 1, 'a newline in a detail must not split the table row');
      assert.ok(rows[0].includes('cards/a\\|b.html'), 'pipes in a surface must be escaped');
      assert.ok(rows[0].includes('line one line two \\| end'), 'newlines collapse and pipes escape in a detail');
    });

    console.log(`\nproduction-monitor: ${passed} checks passed — stale deploys, truncated catalogues, broken 404s, slow origins and unreachable hosts all fail; URL-meaning filenames probe correctly; healthy sites pass; skips stay visible.`);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('\nproduction-monitor FAILED:', error && error.message ? error.message : error);
  process.exitCode = 1;
});
