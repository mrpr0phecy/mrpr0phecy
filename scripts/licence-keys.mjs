#!/usr/bin/env node
/* licence-keys.mjs — signed, offline licence keys for the embed product.
 *
 * Why this exists
 * ---------------
 * STRATEGY.md prices the embed tiers (£99 single / £299 category / £899
 * white-label) but a static GitHub Pages site has no licence server. This
 * module is the whole fulfilment stack instead:
 *
 *   1. The owner generates an ECDSA P-256 keypair once (keygen), keeps the
 *      private half offline / in the owner console's localStorage.
 *   2. When a licence is sold, the owner signs {domain, tier, expiry} (sign)
 *      and emails the resulting `MUS1.…` string to the buyer.
 *   3. The buyer pastes the key at embed.html; every snippet the site hands
 *      out then carries a tiny verifier that checks the signature against the
 *      PUBLIC key baked into embed.html plus the embedding page's hostname,
 *      and only then removes the credit line.
 *
 * No server, no database, no secret in the repo. The public key ships in a
 * <meta name="mus-licence-pubkey"> tag on embed.html; until the owner pastes
 * one in, every snippet is the free credited tier (which is the safe default).
 *
 * Enforcement honesty: this is tamper-EVIDENT, not DRM. A licensee could strip
 * the verifier from their copy of the snippet — that is a licence breach, not
 * a technical impossibility, exactly like every static-site licence scheme.
 * What it does guarantee is that a key cannot be forged, moved to an
 * unlicensed domain, or reused after expiry without the forgery being
 * detectable.
 *
 * Format
 * ------
 *   MUS1.<base64url(payload JSON)>.<base64url(signature)>
 *   payload: {"v":1,"d":"example.com","t":"single|category|whitelabel","e":"2027-09-15"}
 *   signature: ECDSA P-256 / SHA-256 over the ASCII bytes "MUS1.<payload>"
 *
 * CLI
 * ---
 *   node scripts/licence-keys.mjs keygen  --out owner-key.json
 *   node scripts/licence-keys.mjs pubkey  --key  owner-key.json
 *   node scripts/licence-keys.mjs sign    --key owner-key.json --domain example.com \
 *                                         [--tier category] [--expires 2027-09-15]
 *   node scripts/licence-keys.mjs verify  --licence MUS1.… --domain example.com \
 *                                         [--key owner-key.json | --pubkey '<jwk>']
 *
 * Every command also works as an import (see scripts/tests/licence-keys.test.js),
 * which is what licence-admin.html (the browser console) and the embed.html
 * verifier are built on.
 */
'use strict';

import { webcrypto as crypto } from 'node:crypto';

export const KEY_PREFIX = 'MUS1';
export const TIERS = ['single', 'category', 'whitelabel'];
export const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
export const SIGN_ALG = { name: 'ECDSA', hash: 'SHA-256' };

/* ---------- base64url ---------- */

export function b64uEncode(bytes) {
  const bin = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of bin) s += String.fromCharCode(b);
  return Buffer.from(s, 'binary').toString('base64url');
}

export function b64uDecode(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  return new Uint8Array(Buffer.from(b64 + pad, 'base64'));
}

export function encodeJson(obj) {
  return b64uEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

export function decodeJson(s) {
  return JSON.parse(new TextDecoder().decode(b64uDecode(s)));
}

/* ---------- keys ---------- */

/** Generate a fresh P-256 keypair. Returns {privateJwk, publicJwk, created}. */
export async function generateKeyPair() {
  const pair = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  // A private JWK carries the public material anyway; keep the shipped public
  // half minimal and deterministic so the embed.html meta tag is stable.
  const pub = { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y };
  return { privateJwk, publicJwk: pub, created: new Date().toISOString() };
}

async function importPrivate(privateJwk) {
  return crypto.subtle.importKey('jwk', privateJwk, ALG, false, ['sign']);
}

async function importPublic(publicJwk) {
  return crypto.subtle.importKey('jwk', publicJwk, ALG, false, ['verify']);
}

/* ---------- licences ---------- */

export function normaliseDomain(d) {
  return String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}

/** Does `host` (a page hostname) sit inside the licensed domain? */
export function domainMatches(licensed, host) {
  const l = normaliseDomain(licensed);
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!l || !h) return false;
  if (l === '*') return true; // whitelabel: any site
  return h === l || h.endsWith('.' + l);
}

/**
 * Sign a licence. `key` is the object returned by generateKeyPair (or a bare
 * private JWK). Returns the MUS1.… string.
 */
export async function signLicence(key, { domain, tier = 'single', expires }) {
  if (!key || !key.privateJwk) throw new Error('signLicence: no private key');
  const t = String(tier).toLowerCase();
  if (!TIERS.includes(t)) throw new Error(`signLicence: tier must be one of ${TIERS.join(', ')}`);
  const d = domain === '*' ? '*' : normaliseDomain(domain);
  if (!d) throw new Error('signLicence: domain is required ("*" for whitelabel)');
  if (t !== 'whitelabel' && d === '*') throw new Error('signLicence: "*" domains are only valid on the whitelabel tier');
  const e = expires || defaultExpiry();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) throw new Error('signLicence: expires must be YYYY-MM-DD');
  const payload = { v: 1, d, t, e };
  const signingInput = `${KEY_PREFIX}.${encodeJson(payload)}`;
  const priv = await importPrivate(key.privateJwk);
  const sig = await crypto.subtle.sign(SIGN_ALG, priv, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64uEncode(new Uint8Array(sig))}`;
}

function defaultExpiry() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Parse without verifying. Returns {payload, signingInput, sig} or throws. */
export function parseLicence(licence) {
  const parts = String(licence || '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== KEY_PREFIX) throw new Error('not a MUS1 licence key');
  const payload = decodeJson(parts[1]);
  if (payload.v !== 1) throw new Error(`unsupported licence version: ${payload.v}`);
  if (!TIERS.includes(payload.t)) throw new Error(`unknown tier: ${payload.t}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.e || '')) throw new Error('licence has no valid expiry date');
  return { payload, signingInput: `${parts[0]}.${parts[1]}`, sig: b64uDecode(parts[2]) };
}

/**
 * Verify a licence against a public JWK.
 * Returns {valid, reason, payload}. Never throws for a bad key — a bad key is
 * an invalid licence, not an exception.
 */
export async function verifyLicence(licence, publicJwk, { host = null, today = null } = {}) {
  try {
    const { payload, signingInput, sig } = parseLicence(licence);
    const pub = await importPublic(publicJwk);
    const ok = await crypto.subtle.verify(
      SIGN_ALG, pub, sig, new TextEncoder().encode(signingInput)
    );
    if (!ok) return { valid: false, reason: 'bad signature', payload };
    if (today === null) today = new Date().toISOString().slice(0, 10);
    if (payload.e < today) return { valid: false, reason: `expired ${payload.e}`, payload };
    if (host !== null && !domainMatches(payload.d, host)) {
      return { valid: false, reason: `domain ${host} is not licensed (licensed: ${payload.d})`, payload };
    }
    return { valid: true, reason: 'ok', payload };
  } catch (err) {
    return { valid: false, reason: err.message, payload: null };
  }
}

/* ---------- the browser verifier we hand to licensees ---------- */

/**
 * The exact verifier script embedded in licensed snippets. Kept here so the
 * tests can assert the shipped verifier and the node implementation agree on
 * the format (embed.html builds its copy from the same template strings —
 * scripts/tests/licence-keys.test.js checks both sides stay in sync).
 */
export function verifierSource() {
  return [
    '(function(){var s=document.currentScript,L=s.getAttribute("data-mus-licence"),P=s.getAttribute("data-mus-pubkey");',
    'if(!L||!P||L.split(".").length!==3||L.indexOf("MUS1.")!==0)return;try{',
    'function b(x){x=x.replace(/-/g,"+").replace(/_/g,"/");while(x.length%4)x+="=";return atob(x)}',
    'var j=JSON.parse(b(L.split(".")[1])),u=new Uint8Array(b(L.split(".")[2]));',
    'var h=new TextEncoder().encode(L.split(".")[0]+"."+L.split(".")[1]);',
    'crypto.subtle.importKey("jwk",JSON.parse(P),{name:"ECDSA",namedCurve:"P-256"},false,["verify"])',
    '.then(function(k){return crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},k,u,h)})',
    '.then(function(ok){var h2=location.hostname.replace(/^www\\\\./,""),d=String(j.d).replace(/^www\\\\./,"");',
    'if(ok&&(d==="*"||h2===d||h2.slice(-d.length-1)==="."+d)&&new Date(j.e)>new Date()){',
    'document.querySelectorAll("[data-mus-credit]").forEach(function(n){n.remove()})}})}catch(e){}})();',
  ].join('\n');
}

/* ---------- CLI ---------- */

async function readKeyFile(path) {
  const { readFileSync } = await import('node:fs');
  return JSON.parse(readFileSync(path, 'utf8'));
}

function argv(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === 'help') {
    console.log('usage: licence-keys.mjs <keygen|pubkey|sign|verify> [...]\n' +
      '  keygen --out owner-key.json\n' +
      '  pubkey --key owner-key.json\n' +
      '  sign   --key owner-key.json --domain example.com [--tier single] [--expires 2027-09-15]\n' +
      '  verify --licence MUS1.… --domain example.com [--key owner-key.json | --pubkey \'<jwk>\']');
    process.exit(0);
  }
  if (cmd === 'keygen') {
    const out = argOut('--out', 'owner-key.json');
    const pair = await generateKeyPair();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(out, JSON.stringify(pair, null, 2) + '\n');
    console.log(`keypair written to ${out}`);
    console.log(`public JWK (paste into embed.html's mus-licence-pubkey meta tag):\n${JSON.stringify(pair.publicJwk)}`);
    console.log('keep the private half safe — it is the only thing that can issue licences.');
    return;
  }
  if (cmd === 'pubkey') {
    const key = await readKeyFile(argv('--key'));
    console.log(JSON.stringify(key.publicJwk));
    return;
  }
  if (cmd === 'sign') {
    const key = await readKeyFile(argv('--key'));
    const licence = await signLicence(key, {
      domain: argv('--domain'),
      tier: argv('--tier') || 'single',
      expires: argv('--expires'),
    });
    console.log(licence);
    return;
  }
  if (cmd === 'verify') {
    const licence = argv('--licence');
    const host = argv('--domain');
    let pub;
    if (argv('--pubkey')) pub = JSON.parse(argv('--pubkey'));
    else pub = (await readKeyFile(argv('--key'))).publicJwk;
    const res = await verifyLicence(licence, pub, { host });
    if (res.valid) {
      console.log(`VALID — tier ${res.payload.t}, domain ${res.payload.d}, expires ${res.payload.e}`);
      process.exit(0);
    } else {
      console.error(`INVALID — ${res.reason}`);
      process.exit(1);
    }
  }
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}

function argOut(flag, dflt) {
  const v = argv(flag);
  return v && v !== 'undefined' ? v : dflt;
}

const isMain = process.argv[1] && process.argv[1].endsWith('licence-keys.mjs');
if (isMain) main();
