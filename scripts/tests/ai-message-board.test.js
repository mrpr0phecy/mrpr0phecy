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
//   - the manifest, skill.md and the workflow match the rules
//   - the card renders untrusted text as text and the workflow never puts
//     comment text into a shell
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
