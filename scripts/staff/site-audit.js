#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');

// Deliberately a static contract check, NOT a browser, privacy certification,
// traffic measurement, or permission to remove existing owner-controlled content.
function visibleMarkup(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}
function auditSite(root, domain) {
  const findings = [];
  const record = (ok, message, file, severity = 'FAIL') => findings.push({ status: ok ? 'PASS' : severity, file, message });
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  if (domain === 'music') {
    const source = read('listen.html');
    const markup = visibleMarkup(source);
    const check = (ok, message) => record(ok, message, 'listen.html');
    check(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']https:\/\/www\.themostusefulsiteintheworld\.com\/listen\.html["']/i.test(source), 'canonical identifies the music hub');
    const schemas = [...source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    let musicGroup = false;
    for (const match of schemas) {
      try {
        const data = JSON.parse(match[1]);
        const nodes = Array.isArray(data) ? data : (data['@graph'] || [data]);
        musicGroup ||= nodes.some(n => n['@type'] === 'MusicGroup' && n.name === 'MrProphecy');
      } catch { check(false, 'structured data must parse as JSON'); }
    }
    check(musicGroup, 'MusicGroup identifies MrProphecy');
    check(!/<iframe\b/i.test(markup), 'no eager iframe in the initial music markup');
    check(/addEventListener\(\s*['"]click['"]/.test(source) && /createElement\(\s*['"]iframe['"]/.test(source), 'click handler and deferred player construction are present (manual playback still required)');
    check(source.includes('https://www.youtube-nocookie.com/embed/'), 'deferred player uses the privacy-enhanced YouTube host');
    check(/https:\/\/www\.youtube\.com\/@MrProphecy\b/.test(markup), 'verified YouTube handle is linked');
    check(/https:\/\/soundcloud\.com\/mrpr0phecy\b/.test(markup), 'intentional zero in the SoundCloud handle is retained');
    check(!/href=["'](?:\.\/|\/)?(?:index\.html|tool\.html|tools\.html|cards\/)/i.test(markup), 'listener hub does not link into the tool catalogue');
  } else if (domain === 'boundaries') {
    for (const file of ['index.html', 'tool.html', 'donate.html']) {
      const markup = visibleMarkup(read(file));
      const crossPromo = [...markup.matchAll(/<a\b[^>]*href=["']((?:\.\/|\/)?(?:listen|music|radio|youtubepromo\d*)\.html(?:[?#][^"']*)?)["']/gi)];
      for (const match of crossPromo) record(false, `Tool-side link to ${match[1]} conflicts with the documented product boundary; owner review, not automatic removal.`, file, 'WARN');
    }
    for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
      const source = read(file);
      if (!/googletagmanager\.com|google-analytics\.com|analytics\.js/i.test(source)) continue;
      const copy = visibleMarkup(source).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      const claim = copy.match(/\b(?:100%\s+private|no\s+(?:tracking|analytics|cookies))\b/i);
      if (claim) record(false, `Analytics-bearing page contains “${claim[0]}”; inspect context and replace only genuinely false claims.`, file, 'WARN');
    }
    if (!findings.length) record(true, 'No drift found by this limited static subset; manual policy review still applies.', 'site');
  } else throw new Error(`Unknown site audit '${domain}'`);
  return findings;
}

if (require.main === module) {
  try {
    const findings = auditSite(ROOT, process.argv[2]);
    for (const f of findings) console.log(`${f.status}: ${f.file}: ${f.message}`);
    console.log('Scope: static entry-point checks only; no external requests or playback.');
    process.exitCode = findings.some(f => f.status === 'FAIL') ? 1 : 0;
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { auditSite, visibleMarkup };
