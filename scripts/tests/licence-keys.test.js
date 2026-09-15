#!/usr/bin/env node
/* licence-keys.test.js — regression tests for scripts/licence-keys.mjs.
 *
 * The licence key IS the monetisation fulfilment path (STRATEGY.md): if these
 * tests fail, buyers cannot be issued working keys, or — worse — a forged or
 * expired key would pass. Run via verify.sh section 16.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  generateKeyPair, signLicence, verifyLicence, parseLicence,
  domainMatches, normaliseDomain, verifierSource, b64uDecode,
} = require(path.join(__dirname, '..', 'licence-keys.mjs'));

const ROOT = path.join(__dirname, '..', '..');

test('a signed licence verifies for the licensed domain', async () => {
  const key = await generateKeyPair();
  const licence = await signLicence(key, { domain: 'example.com', tier: 'category' });
  const pub = key.publicJwk;
  assert.equal((await verifyLicence(licence, pub, { host: 'example.com' })).valid, true);
  assert.equal((await verifyLicence(licence, pub, { host: 'www.example.com' })).valid, true,
    'www. prefix must not break matching');
  assert.equal((await verifyLicence(licence, pub, { host: 'broker.example.com' })).valid, true,
    'subdomains of the licensed domain are covered');
  assert.equal((await verifyLicence(licence, pub, { host: 'example.com.evil.io' })).valid, false,
    'suffix spoofing must fail');
  assert.equal((await verifyLicence(licence, pub, { host: 'notexample.com' })).valid, false);
});

test('a tampered payload fails the signature check', async () => {
  const key = await generateKeyPair();
  const licence = await signLicence(key, { domain: 'example.com', tier: 'single' });
  const parts = licence.split('.');
  const payload = JSON.parse(new TextDecoder().decode(b64uDecode(parts[1])));
  payload.t = 'whitelabel'; // upgrade ourselves for free
  const forged = [parts[0], Buffer.from(JSON.stringify(payload)).toString('base64url'), parts[2]].join('.');
  const res = await verifyLicence(forged, key.publicJwk, { host: 'example.com' });
  assert.equal(res.valid, false);
  assert.match(res.reason, /signature/);
});

test('expired licences fail, unexpired ones pass, on the same clock', async () => {
  const key = await generateKeyPair();
  const old = await signLicence(key, { domain: 'example.com', expires: '2020-01-01' });
  const soon = await signLicence(key, { domain: 'example.com', expires: '2999-01-01' });
  const today = '2026-09-15';
  assert.equal((await verifyLicence(old, key.publicJwk, { today })).valid, false);
  assert.equal((await verifyLicence(soon, key.publicJwk, { today })).valid, true);
});

test('whitelabel licences carry a "*" domain and match any host', async () => {
  const key = await generateKeyPair();
  const licence = await signLicence(key, { domain: '*', tier: 'whitelabel' });
  assert.equal((await verifyLicence(licence, key.publicJwk, { host: 'anything.net' })).valid, true);
  assert.equal((await verifyLicence(licence, key.publicJwk, { host: 'example.co.uk' })).valid, true);
  await assert.rejects(
    signLicence(key, { domain: '*', tier: 'single' }),
    /whitelabel/,
    '"*" must not be issuable below whitelabel'
  );
});

test('parseLicence rejects garbage and unknown versions', async () => {
  assert.throws(() => parseLicence('not-a-key'));
  assert.throws(() => parseLicence('MUS1. only.two'));
  const key = await generateKeyPair();
  const licence = await signLicence(key, { domain: 'example.com' });
  const parts = licence.split('.');
  const payload = JSON.parse(new TextDecoder().decode(b64uDecode(parts[1])));
  payload.v = 99;
  assert.throws(
    () => parseLicence([parts[0], Buffer.from(JSON.stringify(payload)).toString('base64url'), parts[2]].join('.')),
    /version/
  );
});

test('normaliseDomain and domainMatches agree with the browser verifier', () => {
  assert.equal(normaliseDomain('https://www.Broker.example.com/path'), 'broker.example.com');
  assert.equal(domainMatches('example.com', 'EXAMPLE.com'), true);
  assert.equal(domainMatches('example.com', ''), false);
  assert.equal(domainMatches('', 'example.com'), false);
  assert.equal(domainMatches('example.com', 'badexample.com'), false);
});

test('the browser verifier shipped in snippets matches this implementation', () => {
  const src = verifierSource();
  for (const needle of ['ECDSA', 'P-256', 'SHA-256', 'data-mus-credit', 'data-mus-licence', 'data-mus-pubkey', 'MUS1.']) {
    assert.ok(src.includes(needle), `verifier source must contain ${needle}`);
  }
  // The verifier and signLicence must sign the same string: "MUS1.<payload>".
  assert.ok(src.includes('L.split(".")[0]+"."+L.split(".")[1]'),
    'verifier must hash the same signing input as signLicence');
});

test('embed.html carries the public-key slot and the licence activation surface', () => {
  const embed = fs.readFileSync(path.join(ROOT, 'embed.html'), 'utf8');
  assert.ok(embed.includes('mus-licence-pubkey'),
    'embed.html must define the mus-licence-pubkey meta the verifier key is read from');
  assert.ok(embed.includes('MUS1.'),
    'embed.html must recognise the MUS1 licence format when a buyer pastes a key');
  assert.ok(embed.includes('data-mus-credit'),
    'embed.html snippets must carry the credit line the verifier removes');
});

test('signing twice produces different signatures that both verify (ECDSA is randomised)', async () => {
  const key = await generateKeyPair();
  const a = await signLicence(key, { domain: 'example.com' });
  const b = await signLicence(key, { domain: 'example.com' });
  assert.notEqual(a, b, 'ECDSA signatures are randomised; identical output would be suspicious');
  assert.equal((await verifyLicence(a, key.publicJwk, { host: 'example.com' })).valid, true);
  assert.equal((await verifyLicence(b, key.publicJwk, { host: 'example.com' })).valid, true);
});
