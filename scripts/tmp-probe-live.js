'use strict';

// TEMPORARY probe used to answer one question from CI, where the network
// reaches the live site: which advertised endpoints does the deployed site
// actually serve? Deleted with .github/workflows/tmp-live-probe2.yml.

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

const ORIGIN = 'https://www.themostusefulsiteintheworld.com';

function tracked(pattern) {
  try {
    return execSync('git ls-files -- ' + pattern, { encoding: 'utf8' })
      .split('\n')
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

const rootFiles = tracked('*.txt').concat(tracked('*.xml')).concat(tracked('*.json'));
const wellKnown = tracked('.well-known/*');
const buildFiles = tracked('_build/*');

const paths = [];
rootFiles.forEach(function (rel) {
  if (fs.existsSync(rel)) paths.push(rel);
});
wellKnown.forEach(function (rel) { paths.push(rel); });
buildFiles.forEach(function (rel) { paths.push(rel); });
paths.push('index.html', 'tool.html', 'listen.html', '404.html', 'about.html', 'press.html', 'changelog.html', 'sitemap.html');
paths.push('cards/mortgage.html', 'tools/mortgage.html', 'cards/cards.json');
paths.push('this-path-does-not-exist-9f3a2b.html');

async function once(rel) {
  const url = ORIGIN + '/' + rel;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
      headers: { 'user-agent': 'themostusefulsiteintheworld-production-monitor/0.1 (+https://github.com/mrpr0phecy/mrpr0phecy)' }
    });
    const body = Buffer.from(await response.arrayBuffer());
    return {
      rel: rel,
      status: response.status,
      type: (response.headers.get('content-type') || '').split(';')[0],
      bytes: body.length,
      sha: crypto.createHash('sha256').update(body).digest('hex').slice(0, 12),
      ms: Date.now() - started,
      bytes_repo: fs.existsSync(rel) ? fs.statSync(rel).size : null
    };
  } catch (error) {
    return { rel: rel, status: 'ERROR', type: String(error && error.name), bytes: 0, sha: '-', ms: Date.now() - started, bytes_repo: null };
  }
}

// The deployment this run is checking may still be in flight, so a non-200 is
// only believed after three attempts, 20 s apart.
async function probe(rel) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await once(rel);
    if (result.status === 200 || attempt === 3) return result;
    await new Promise(function (resolve) { setTimeout(resolve, 20000); });
  }
  return once(rel);
}

(async function main() {
  const results = [];
  for (const rel of paths) {
    const result = await probe(rel);
    results.push(result);
    console.log(JSON.stringify(result));
  }

  const missing = results.filter(function (r) { return r.status !== 200 && r.rel !== 'this-path-does-not-exist-9f3a2b.html'; });
  const notFound = results.filter(function (r) { return r.rel === 'this-path-does-not-exist-9f3a2b.html'; });

  const lines = results.map(function (r) {
    return r.rel + '=' + r.status + ' (' + r.type + ', ' + r.bytes + 'B' + (r.bytes_repo === null ? '' : ' repo ' + r.bytes_repo + 'B') + ')';
  });

  const summary = [
    '## TEMP live surface probe',
    '',
    'Bogus path (must be 404): ' + notFound.map(function (r) { return r.status; }).join(', '),
    '',
    '| path | status | content-type | live bytes | repo bytes | ms |',
    '| --- | --- | --- | --- | --- | --- |'
  ].concat(results.map(function (r) {
    return '| `' + r.rel + '` | ' + r.status + ' | ' + r.type + ' | ' + r.bytes + ' | ' + (r.bytes_repo === null ? '-' : r.bytes_repo) + ' | ' + r.ms + ' |';
  })).join('\n');

  if (fs.existsSync(process.env.GITHUB_STEP_SUMMARY || '')) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  }

  if (missing.length > 0) {
    const detail = missing.map(function (r) { return r.rel + ' -> ' + r.status; }).join(' | ');
    console.log('::error title=' + missing.length + ' advertised endpoint(s) not served::' + detail);
    process.exit(1);
  }
  console.log('::notice title=every advertised endpoint is served::' + lines.length + ' endpoints probed');
}());
