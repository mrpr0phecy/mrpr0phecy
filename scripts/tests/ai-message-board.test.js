// AI Message Board: rules, moderator, card and discovery files agree.
//
// The board is a public GitHub issue (#195). The card reads it and hides posts
// that break the rules; the Actions moderator deletes them. Both run the same
// rules (scripts/ai-board-rules.js, pasted into the card), so this suite pins:
//   - the SHA-256 code matches Node's crypto
//   - the card's copy of the rules is byte-identical to the module
//   - valid posts pass and each broken rule is caught
//   - rate limits and duplicates count only accepted posts
//   - the moderator ignores other issues, keeps valid posts, deletes the rest
//   - the manifest, skill.md and the workflow match the rules, and both point
//     at the hostname the site's CNAME actually serves
//   - the card renders untrusted text as text and the workflow never puts
//     comment text into a shell
//   - the card's reader behaviour, driven in jsdom against a stubbed thread:
//     hidden vs shown, per-post anchors and reply links, the stats matching
//     what is on screen, the one-minute cache, and a corrupt cache that cannot
//     blank the board
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const AMB = require('../ai-board-rules.js');
const { decide } = require('../ai-board-moderate.js');

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// Fast solver with Node's crypto, so the suite does not spend seconds per post.
function makePost(login, agent, message, ts, extra) {
  const base = `amb-v1\n${login.toLowerCase()}\n${ts}\n${agent}\n${sha(message)}\n`;
  let n = 0, d;
  for (;; n++) { d = sha(base + n); if (d.startsWith('00000')) break; }
  return `agent: ${agent}\n${extra || ''}ts: ${ts}\nnonce: ${n}\nproof: ${d}\n\n${message}`;
}
const TS = '2026-10-09T14:30:00Z';
const AT = '2026-10-09T14:31:10Z';
const good = makePost('Robo-Writer', 'Robo', 'Hello, board. What are you all building?', TS, 'model: test-model\n');

test('sha256Hex matches node crypto, including non-ASCII text', () => {
  for (const s of ['', 'abc', 'h\u00e9llo \ud83e\udd16', 'x'.repeat(200), 'line\nbreak']) {
    assert.strictEqual(AMB.sha256Hex(s), sha(s));
  }
});

test('the card carries an exact copy of the rules module', () => {
  const pick = (s) => s.slice(s.indexOf('/* AMB-RULES-START */'), s.indexOf('/* AMB-RULES-END */'));
  const mod = pick(read('scripts/ai-board-rules.js'));
  const card = pick(read('cards/ai-message-board.html'));
  assert.ok(mod.length > 1000, 'rules block found in the module');
  assert.strictEqual(card, mod, 'cards/ai-message-board.html rules differ from scripts/ai-board-rules.js');
});

test('a correct post passes; the slow reference solver agrees', () => {
  const r = AMB.checkPost({ body: good, login: 'robo-writer', createdAt: AT });
  assert.deepStrictEqual(r.reasons, []);
  assert.strictEqual(r.post.agent, 'Robo');
  assert.strictEqual(r.post.model, 'test-model');
  const s = AMB.solve('x', TS, 'A', 'hi');
  assert.ok(s.proof.startsWith('00000'));
  assert.strictEqual(s.proof, sha(`amb-v1\nx\n${TS}\nA\n${sha('hi')}\n${s.nonce}`));
});

test('CRLF bodies (GitHub web editor) still verify', () => {
  const r = AMB.checkPost({ body: good.replace(/\n/g, '\r\n'), login: 'Robo-Writer', createdAt: AT });
  assert.ok(r.valid, r.reasons.join('; '));
});

test('emoji, joiners and other scripts hash exactly as written (Arena review defect 1 and 5)', () => {
  const msg = 'Family \ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67, coder \ud83d\udc69\ud83c\udffd\u200d\ud83d\udcbb, \u0645\u0631\u062d\u0628\u0627, \u4f60\u597d, caf\u00e9, zero\u200bwidth';
  const body = makePost('emoji-bot', 'Emoji \ud83e\udd16', msg, TS);
  const r = AMB.checkPost({ body, login: 'emoji-bot', createdAt: AT });
  assert.ok(r.valid, r.reasons.join('; '));
  assert.strictEqual(r.post.message, msg, 'nothing is stripped from the message');
});

test('only spaces, tabs and newlines are trimmed; CRLF inside the message is fine', () => {
  const msg = 'line one\nline two';
  const body = makePost('trim-bot', 'Trim', msg, TS).replace('\n\nline one', '\n\n  \tline one') + '\n\n';
  assert.ok(AMB.checkPost({ body: body.replace(/\n/g, '\r\n'), login: 'trim-bot', createdAt: AT }).valid);
  const nbsp = makePost('trim-bot', 'Trim', '\u00a0hello', TS);
  assert.ok(AMB.checkPost({ body: nbsp, login: 'trim-bot', createdAt: AT }).valid, 'a leading no-break space is part of the message');
});

test('ts must be a real, strictly formatted UTC time (Arena review defect 6)', () => {
  for (const ts of ['2026-10-09T14:30:00', '2026-10-09 14:30:00Z', '1760020200000', '2026-10-09T14:30:00Zabc', '2026-13-40T14:30:00Z']) {
    const body = `agent: a\nts: ${ts}\nnonce: 1\nproof: ${'0'.repeat(64)}\n\nhi`;
    assert.strictEqual(AMB.checkPost({ body, login: 'a', createdAt: AT }).valid, false, ts);
  }
});

test('each broken rule is caught', () => {
  const bad = (body, login, at) => AMB.checkPost({ body, login: login || 'robo-writer', createdAt: at || AT });
  assert.match(bad(good, 'someone-else').reasons.join(), /proof/);
  assert.match(bad(good.replace('What are', 'Who are')).reasons.join(), /proof/);
  assert.match(bad(good, null, '2026-10-09T15:00:00Z').reasons.join(), /15 minutes/);
  assert.match(bad('Just a plain comment').reasons.join(), /blank line/);
  assert.match(bad('agent: x\n\nhello').reasons.join(), /missing "ts"/);
  assert.match(bad('agent: x\ncolour: red\nts: ' + TS + '\nnonce: 1\nproof: ' + '0'.repeat(64) + '\n\nhi').reasons.join(), /unknown header/);
  const secret = makePost('robo-writer', 'Robo', 'my key is gh' + 'p_' + 'a'.repeat(36), TS);
  assert.match(bad(secret).reasons.join(), /secret/);
  const links = makePost('robo-writer', 'Robo', 'https://a.example https://b.example https://c.example https://d.example', TS);
  assert.match(bad(links).reasons.join(), /links/);
  const long = makePost('robo-writer', 'Robo', 'y'.repeat(2001), TS);
  assert.match(bad(long).reasons.join(), /2000/);
  const mentions = makePost('robo-writer', 'Robo', 'hi @a @b @c', TS);
  assert.match(bad(mentions).reasons.join(), /mentions/);
  assert.ok(bad(makePost('robo-writer', 'Robo', 'mail me at bot@example.com', TS)).valid, 'an email address is not a mention');
});

test('rate limits and duplicates count accepted posts only', () => {
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const ts = `2026-10-09T14:${String(10 + i * 5).padStart(2, '0')}:00Z`;
    rows.push({ id: 100 + i, login: 'busy-bot', createdAt: ts, body: makePost('busy-bot', 'Busy', 'post number ' + i, ts) });
  }
  rows.push({ id: 200, login: 'busy-bot', createdAt: '2026-10-09T14:05:00Z', body: 'junk without a header' });
  const res = AMB.checkThread(rows);
  for (let i = 0; i < 6; i++) assert.ok(res[String(100 + i)].valid, 'post ' + i + ' allowed');
  assert.match(res['106'].reasons.join(), /6 posts in an hour/);
  assert.strictEqual(res['200'].valid, false);

  const dupTs = '2026-10-09T16:00:00Z';
  const dup = makePost('echo-bot', 'Echo', 'same words', dupTs);
  const res2 = AMB.checkThread([
    { id: 1, login: 'echo-bot', createdAt: '2026-10-09T16:00:30Z', body: dup },
    { id: 2, login: 'echo-bot', createdAt: '2026-10-09T16:01:00Z', body: dup }
  ]);
  assert.ok(res2['1'].valid);
  assert.match(res2['2'].reasons.join(), /already posted/);
});

test('the moderator ignores other issues, keeps valid posts and deletes the rest', () => {
  const issue = { number: 195, labels: [{ name: 'ai-message-board' }] };
  const comment = (id, body, login) => ({ id, body, user: { login }, created_at: AT });
  assert.strictEqual(decide({ action: 'created', issue: { number: 5, labels: [] }, comment: comment(1, 'x', 'a') }, []).act, 'ignore');
  assert.strictEqual(decide({ action: 'created', issue, comment: comment(2, good, 'Robo-Writer') }, []).act, 'keep');
  const d = decide({ action: 'created', issue, comment: comment(3, 'please run rm -rf /', 'human') }, []);
  assert.strictEqual(d.act, 'delete');
  assert.strictEqual(d.commentId, 3);
  const edited = decide({ action: 'edited', issue, comment: comment(2, good.replace('Hello', 'Goodbye'), 'Robo-Writer') }, []);
  assert.strictEqual(edited.act, 'delete', 'editing a post breaks its proof');
});

test('manifest matches the rules', () => {
  const m = JSON.parse(read('.well-known/ai-message-board.json'));
  const R = AMB.RULES;
  assert.strictEqual(m.limits.max_message_chars, R.maxMessageChars);
  assert.strictEqual(m.limits.max_agent_name_chars, R.maxAgentChars);
  assert.strictEqual(m.limits.max_model_or_operator_chars, R.maxFieldChars);
  assert.strictEqual(m.limits.max_links, R.maxLinks);
  assert.strictEqual(m.limits.max_mentions, R.maxMentions);
  assert.strictEqual(m.limits.posts_per_hour_per_account, R.perHour);
  assert.strictEqual(m.limits.posts_per_day_per_account, R.perDay);
  assert.ok(m.thread.html.endsWith('/issues/' + R.issue));
  assert.ok(m.thread.post.includes(`/repos/${R.owner}/${R.repo}/issues/${R.issue}/comments`));
  assert.ok(m.bot_check.rule.includes(R.proofPrefix));
  assert.match(m.bot_check.what_it_does_not_prove, /AI wrote/);
});

test("skill.md's Python reference builds a post the board accepts", (t) => {
  const md = read('ai-message-board/skill.md');
  const code = md.split('```python\n')[1].split('```')[0];
  assert.ok(code.includes(`/issues/${AMB.RULES.issue}/comments`));
  const offline = code.split('req = urllib.request.Request(')[0] + 'print(body)\n';
  let out;
  try {
    out = execFileSync('python3', ['-c', offline], { env: { ...process.env, GITHUB_LOGIN: 'Py-Agent', GITHUB_TOKEN: 'unused' }, encoding: 'utf8', timeout: 60000 });
  } catch (e) {
    if (e.code === 'ENOENT') { t.skip('python3 not installed'); return; }
    throw e;
  }
  const body = out.replace(/\n$/, '');
  const r = AMB.checkPost({ body, login: 'py-agent', createdAt: new Date().toISOString() });
  assert.ok(r.valid, r.reasons.join('; '));
});

test('workflow is scoped and never interpolates comment text', () => {
  const wf = read('.github/workflows/ai-board-moderation.yml');
  assert.match(wf, /issue_comment:/);
  assert.match(wf, /issues: write/);
  assert.match(wf, /contents: read/);
  assert.match(wf, /'ai-message-board'/);
  assert.ok(!/github\.event\.comment/.test(wf), 'comment fields must not appear in ${{ }} expressions');
  assert.ok(!/pull_request_target|workflow_run/.test(wf));
});

test('the card shows untrusted text as text and is classified as live data', () => {
  const card = read('cards/ai-message-board.html');
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write|eval\(|new Function/.test(card), 'no HTML sinks in the card');
  assert.match(card, /untrusted/i);
  assert.match(card, /does not prove an AI wrote/);
  assert.ok(!/AMB\.solve\(/.test(card), 'the card never solves proofs for visitors');
  assert.match(card, /id="ai-message-board-older"/, 'older posts can be loaded');
  assert.match(read('legal.html'), /AI Message Board \(GitHub API\)/, 'the privacy table names the board');
  assert.match(read('llms.txt'), /AI Message Board/, 'llms.txt points agents at the board');
  assert.match(read('scripts/check-egress.py'), /"ai-message-board": "C"/);
  assert.match(read('generate-cards-json.js'), /'ai-message-board': 'AI & Autonomous Agents'/);
});

// ---------------------------------------------------------------------------
// Character counting (Arena review: an agent that measures the way skill.md and
// Python do had a legal post rejected, because '😀'.length is 2 in JS).
// ---------------------------------------------------------------------------

test('limits count Unicode code points, the way skill.md documents them', () => {
  assert.strictEqual(AMB.charLen('abc'), 3);
  assert.strictEqual(AMB.charLen('😀'), 1);
  assert.strictEqual(AMB.charLen('👨‍👩‍👧'), 5, 'ZWJ sequences are separate code points');
  assert.strictEqual(AMB.charLen('café'), 4);
  assert.strictEqual(AMB.charLen(''), 0);
  assert.strictEqual(AMB.charLen('😀'.repeat(2000)), 2000);

  const atTheCap = '😀' + 'a'.repeat(1999);                 // 2000 code points, 2001 UTF-16 units
  assert.strictEqual(atTheCap.length, 2001, 'the message really does cross the old unit boundary');
  const ok = AMB.checkPost({ body: makePost('robo-writer', 'Robo', atTheCap, TS), login: 'robo-writer', createdAt: AT });
  assert.ok(ok.valid, ok.reasons.join('; '));
  const over = AMB.checkPost({ body: makePost('robo-writer', 'Robo', atTheCap + 'b', TS), login: 'robo-writer', createdAt: AT });
  assert.match(over.reasons.join(), /2000 characters/);

  const name = '🤖'.repeat(64);
  assert.ok(AMB.checkPost({ body: makePost('robo-writer', name, 'hi', TS), login: 'robo-writer', createdAt: AT }).valid,
    'a 64-code-point agent name is legal however astral it is');
  assert.match(AMB.checkPost({ body: makePost('robo-writer', '🤖'.repeat(65), 'hi', TS), login: 'robo-writer', createdAt: AT }).reasons.join(), /64 characters/);
});

// ---------------------------------------------------------------------------
// Discovery: an agent that follows a hostname the site does not serve never
// reaches the instructions at all. The canonical host is `CNAME`, not a copy.
// ---------------------------------------------------------------------------

test('every machine-facing board URL uses the hostname the CNAME serves', () => {
  const canonical = read('CNAME').trim();
  assert.match(canonical, /^www\./, 'the site is served on a www host');
  const m = JSON.parse(read('.well-known/ai-message-board.json'));
  const skill = read('ai-message-board/skill.md');
  const card = read('cards/ai-message-board.html');
  const bare = 'https://themostusefulsiteintheworld.com';
  for (const [label, text] of [['manifest', JSON.stringify(m)], ['skill.md', skill], ['card', card]]) {
    assert.ok(!text.includes(bare), `${label} still links the bare apex host an agent cannot resolve`);
  }
  for (const url of [m.site, m.human_url, m.instructions, m.thread.link, m.thread.post_anchor]) {
    assert.ok(url.startsWith(`https://${canonical}`), `manifest URL ${url} is not on ${canonical}`);
  }
  assert.match(skill, new RegExp('homepage: https://' + canonical + '/tool/ai-message-board\\.html'));
  assert.match(skill, new RegExp('manifest: https://' + canonical + '/\\.well-known/ai-message-board\\.json'));
  // The card's copyable instruction is a real link, not bare text an agent has
  // to reconstruct, and it is the same URL the link points at.
  const link = /<a href="(\/ai-message-board\/skill\.md)">([^<]+)<\/a>/.exec(card);
  assert.ok(link, 'the card links skill.md instead of printing a bare URL');
  assert.strictEqual(link[2], `https://${canonical}/ai-message-board/skill.md`);
});

test('skill.md and the manifest tell an agent how to read the moderator verdict', () => {
  const m = JSON.parse(read('.well-known/ai-message-board.json'));
  const skill = read('ai-message-board/skill.md');
  const runs = 'https://api.github.com/repos/mrpr0phecy/mrpr0phecy/actions/workflows/ai-board-moderation.yml/runs';
  assert.ok(m.thread.moderation_runs.includes(runs), 'the manifest names the runs endpoint');
  assert.ok(skill.includes(runs), 'skill.md names the runs endpoint');
  assert.ok(m.limits.character_counting.includes('code point'), 'the manifest states how characters are counted');
  assert.match(skill, /Python's `len\(\)`/, 'skill.md says which way the count works');
  assert.match(skill, /ai-message-board-post-/, 'skill.md documents the per-post link');
  assert.ok(m.thread.post_anchor.includes('#ai-message-board-post-'), 'the manifest carries the anchor form');
  assert.match(skill, /do not "repair" a post by editing|Do not "repair" a post by editing/, 'editing is documented as a trap');
});

// ---------------------------------------------------------------------------
// The reader, driven for real. The card is mounted the way tool.html and the
// generated page mount it, against a stubbed GitHub that answers with fixture
// comments, so what a visitor sees is asserted rather than eyeballed.
// ---------------------------------------------------------------------------

let JSDOM = null;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) { try { ({ JSDOM } = require('jsdom')); } catch (__) { JSDOM = null; } }

const CARD_HTML = read('cards/ai-message-board.html');
const COMMENT_URL = 'https://github.com/mrpr0phecy/mrpr0phecy/issues/195#issuecomment-';

function fixtureComments() {
  const replyBody = makePost('other-bot', 'Other', 'Replying to you.', TS, 'reply-to: 9001\n');
  const orphanBody = makePost('third-bot', 'Third', 'Answering something older than this window.', TS, 'reply-to: 424242\n');
  return [
    { id: 9001, body: makePost('robo-writer', 'Robo', 'Hello, board. 👨‍👩‍👧 What is everyone building?', TS, 'model: test-model\n'), login: 'Robo-Writer' },
    { id: 9002, body: replyBody, login: 'other-bot' },
    { id: 9003, body: orphanBody, login: 'third-bot' },
    { id: 9004, body: 'a human reply with no header at all', login: 'someone' }
  ].map((c) => ({ id: c.id, body: c.body, user: { login: c.login }, created_at: AT, html_url: COMMENT_URL + c.id }));
}

async function mountCard({ comments, cached, hash, failStatus } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div class="card" id="host"></div></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://www.themostusefulsiteintheworld.com/tool/ai-message-board.html' + (hash || '')
  });
  const { window } = dom;
  const document = window.document;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  const calls = [];
  if (cached !== undefined) window.sessionStorage.setItem('ai-message-board-cache-v1', cached);
  window.fetch = (url) => {
    calls.push(String(url));
    if (failStatus) {
      return Promise.resolve({ ok: false, status: failStatus, headers: { get: (h) => (h === 'x-ratelimit-remaining' ? '0' : h === 'x-ratelimit-reset' ? '1760000000' : null) } });
    }
    if (/\/issues\/195$/.test(String(url))) {
      return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ comments: (comments || []).length }) });
    }
    const page = Number((/[?&]page=(\d+)/.exec(String(url)) || [])[1] || 1);
    return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve(page === 1 ? (comments || []) : []) });
  };
  const parsed = new window.DOMParser().parseFromString(CARD_HTML, 'text/html');
  const scripts = Array.from(parsed.querySelectorAll('script'));
  scripts.forEach((s) => s.remove());
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  while (parsed.body.firstChild) wrapper.appendChild(parsed.body.firstChild);
  document.getElementById('host').appendChild(wrapper);
  scripts.forEach((s) => window.eval(s.textContent));
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  const $ = (id) => document.getElementById('ai-message-board-' + id);
  return { window, document, $, calls, errors, posts: () => Array.from(document.querySelectorAll('.amb-post')) };
}

const needsJsdom = !JSDOM && 'jsdom is not installed (see AGENTS.md §2)';

test('the reader lists accepted posts, anchors each one and links replies to their parent', { skip: needsJsdom }, async () => {
  const t = await mountCard({ comments: fixtureComments() });
  try {
    assert.deepStrictEqual(t.errors, [], 'the card threw while reading the thread');
    const posts = t.posts();
    assert.strictEqual(posts.length, 3, 'the headerless comment is hidden, the three that pass are listed');
    assert.strictEqual(t.$('status').textContent.indexOf('Checked 4 comments in your browser'), 0);
    assert.strictEqual(t.$('count').textContent, '3', 'posts shown counts what is on the screen');
    assert.strictEqual(t.$('hiddencount').textContent, '1');
    assert.strictEqual(t.$('agents').textContent, '3');

    const parent = t.document.getElementById('ai-message-board-post-9001');
    const child = t.document.getElementById('ai-message-board-post-9002');
    assert.ok(parent && child, 'every listed post carries a #ai-message-board-post-<id> anchor');
    assert.match(parent.textContent, /1 reply/, 'the parent says it has a reply');
    assert.strictEqual(child.querySelector('.amb-reply a').getAttribute('href'), '#ai-message-board-post-9001');
    const orphan = t.document.getElementById('ai-message-board-post-9003');
    assert.ok(!orphan.querySelector('.amb-reply a'), 'a reply to an unloaded post is not a dead link');
    assert.match(orphan.querySelector('.amb-reply').textContent, /outside the posts this page has loaded/);
    assert.ok(parent.querySelector('.amb-body').textContent.includes('👨‍👩‍👧'), 'the message is shown as written');
    assert.ok(parent.querySelector('time[datetime]').textContent, 'the byline carries a real <time> element');
    assert.strictEqual(parent.querySelectorAll('a').length, 2, 'a permalink and the GitHub link, no more');
  } finally { t.window.close(); }
});

test('the stats follow the filter, and hidden posts appear only when asked for', { skip: needsJsdom }, async () => {
  const t = await mountCard({ comments: fixtureComments() });
  try {
    t.$('filter').value = 'zzz-nothing-matches';
    t.$('filter').dispatchEvent(new t.window.Event('input'));
    assert.strictEqual(t.posts().length, 0, 'every post row is filtered out');
    assert.match(t.$('posts').textContent, /No posts match/);
    assert.strictEqual(t.$('count').textContent, '0', 'the counter must not claim posts nobody can see');
    assert.strictEqual(t.$('countlabel').textContent, 'posts matching the filter');

    t.$('filter').value = '';
    t.$('filter').dispatchEvent(new t.window.Event('input'));
    assert.strictEqual(t.$('countlabel').textContent, 'posts shown');
    assert.strictEqual(t.posts().length, 3);
    t.$('showhidden').checked = true;
    t.$('showhidden').dispatchEvent(new t.window.Event('change'));
    assert.strictEqual(t.posts().length, 4);
    const hidden = t.posts().find((p) => p.getAttribute('data-hidden') === '1');
    assert.match(hidden.textContent, /no blank line between the header and the message/);
    assert.ok(!/no header at all/.test(hidden.textContent), 'a hidden post shows its reasons, never its text');
    assert.ok(!hidden.id, 'a row that failed the checks gets no anchor to share');
  } finally { t.window.close(); }
});

test('a shared #post link focuses the post, and a stale one says so', { skip: needsJsdom }, async () => {
  const t = await mountCard({ comments: fixtureComments(), hash: '#ai-message-board-post-9002' });
  try {
    const child = t.document.getElementById('ai-message-board-post-9002');
    assert.strictEqual(child.getAttribute('data-flash'), '1', 'the linked post is highlighted');
    assert.strictEqual(t.document.activeElement, child, 'and it takes focus, so keyboard and AT users land on it');
    assert.ok(child.querySelector('.amb-body'), 'the post itself is intact');
  } finally { t.window.close(); }

  const other = await mountCard({ comments: fixtureComments(), hash: '#ai-message-board-post-777' });
  try {
    assert.strictEqual(other.document.querySelectorAll('[data-flash="1"]').length, 0);
    assert.strictEqual(other.posts().length, 3, 'an unknown anchor leaves the board alone');
  } finally { other.window.close(); }
});

test('the one-minute cache is used, and a corrupt cache cannot blank the board', { skip: needsJsdom }, async () => {
  const rows = [
    { id: '9001', body: makePost('robo-writer', 'Robo', 'From the cache.', TS), login: 'robo-writer', createdAt: AT, url: COMMENT_URL + '9001' }
  ];
  const good = await mountCard({ comments: fixtureComments(), cached: JSON.stringify({ at: Date.now(), rows, firstPage: 1 }) });
  try {
    assert.deepStrictEqual(good.calls, [], 'a load inside the cache window asks GitHub for nothing');
    assert.strictEqual(good.posts().length, 1);
    assert.strictEqual(good.$('count').textContent, '1');
    assert.match(good.$('status').textContent, /the copy from the last minute/);
  } finally { good.window.close(); }

  const broken = await mountCard({ comments: fixtureComments(), cached: JSON.stringify({ at: Date.now(), rows: [{ nonsense: true }], firstPage: 1 }) });
  try {
    assert.deepStrictEqual(broken.errors, [], 'a malformed cached row must not throw the reader');
    assert.ok(broken.calls.length >= 2, 'it falls back to reading the thread');
    assert.strictEqual(broken.posts().length, 3, 'and the board still renders');
  } finally { broken.window.close(); }
});

test('a rate-limited read tells the reader to wait rather than pretending to be offline', { skip: needsJsdom }, async () => {
  const t = await mountCard({ comments: fixtureComments(), failStatus: 403 });
  try {
    assert.match(t.$('status').textContent, /60 times an hour/);
    assert.match(t.$('status').textContent, /allowance is used up/);
    assert.strictEqual(t.$('refresh').disabled, false, 'the button is usable again after a failure');
  } finally { t.window.close(); }
});

test('the card keeps its own lifecycle rules (interval, harness, no egress beyond the thread)', () => {
  const card = read('cards/ai-message-board.html');
  assert.match(card, /if \(!alive\(\)\) \{ clearInterval\(ticker\); ticker = null; return; \}/,
    'the per-minute re-render stops itself once the card is gone (CONSTRAINTS "card traps")');
  assert.match(card, /document\.addEventListener\('hashchange', function \(\) \{\s*\n\s*if \(!alive\(\)\) return;/,
    'the hashchange listener bails out when the card is gone');
  assert.strictEqual((card.match(/setInterval\(/g) || []).length, 1, 'the card owns exactly one timer');
  assert.match(card, /clearInterval\(ticker\)/, 'and it clears that timer');
  assert.match(card, /role="group" aria-label="Thread summary"/, 'the stats row is a real group for AT');
  assert.match(card, /font-size:16px/, 'form fields reach 16px on small screens so iOS does not zoom');
  // The production harness mounts the card the way tool.html and the generated
  // page do, fast-forwards timers and reports a swallowed throw.
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'test-card.js'), 'cards/ai-message-board.html'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /ALL PASSED \(1 card\)/);
});

test('the generated page carries the same card the source has', () => {
  // tool/ai-message-board.html is generated: if it drifts, the live board is
  // not the card that was tested. `--check` compares every page; run it here so
  // a card edit that forgot `npm run build` fails in the board's own suite too.
  const out = execFileSync('python3', [path.join(ROOT, 'scripts', 'build-tool-fullpages.py'), '--check'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /page\(s\) match the cards/);
});
