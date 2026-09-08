/* Riley Net — deterministic lockstep netcode foundation.
 *
 * This is the online-game groundwork, not a full multiplayer server:
 *  - 60 Hz fixed-tick simulation (the engine already steps physics at a
 *    fixed timestep; sim randomness comes from a seeded PRNG stream, never
 *    Math.random — that is the determinism contract)
 *  - compact input packets: 3 bytes per player per tick
 *  - tick packets carry an FNV-1a checksum for corruption detection
 *  - world-state hash every 8 ticks for divergence/rollback detection
 *  - transport-agnostic: works solo today through LoopbackTransport, and
 *    the same packet layout plugs into a WebSocket relay later (see
 *    riley-assets/NETCODE.md for the roadmap: relay -> server-authoritative)
 *
 * Pure JS (depends on RileyCore). Browser: window.RileyNet, Node: module.exports
 */
(function (root, factory) {
  var api = factory(typeof globalThis !== 'undefined' && globalThis.RileyCore ? globalThis.RileyCore : require('./riley-core.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RileyNet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
'use strict';
var clamp = C.clamp;

var TICK_RATE = 60;
var MAX_PLAYERS = 8;

/* Input layout (3 bytes) — the wire format, frozen since v1:
 *   byte0: moveX +8        (0..16, -8..8 quantised)
 *   byte1: moveY +8
 *   byte2: flags  bit0 fire, bit1 jump, bit2 dash, bit3 nova, bit4 melee, bit5 lock,
 *                 bit6 aimX+, bit7 aimY+  (aim assist direction nibble later)
 * bits 4/5 were reserved as "up/down" in the first draft and nothing ever set
 * them, so claiming them for melee / lock-on costs no bytes and breaks no
 * stored replay. */
var F = { FIRE: 1, JUMP: 2, DASH: 4, NOVA: 8, MELEE: 16, LOCK: 32, AIMX: 64, AIMY: 128 };

function makeInput() { return { x: 0, y: 0, fire: false, jump: false, dash: false, nova: false, melee: false, lock: false, aimX: false, aimY: false }; }

function encodeInput(inp) {
  var f = 0;
  if (inp.fire) f |= F.FIRE;
  if (inp.jump) f |= F.JUMP;
  if (inp.dash) f |= F.DASH;
  if (inp.nova) f |= F.NOVA;
  if (inp.melee) f |= F.MELEE;
  if (inp.lock) f |= F.LOCK;
  if (inp.aimX) f |= F.AIMX;
  if (inp.aimY) f |= F.AIMY;
  return [clamp(Math.round(inp.x) + 8, 0, 16), clamp(Math.round(inp.y) + 8, 0, 16), f & 0xFF];
}
function decodeInput(b) {
  var inp = makeInput();
  inp.x = b[0] - 8; inp.y = b[1] - 8;
  inp.fire = !!(b[2] & F.FIRE); inp.jump = !!(b[2] & F.JUMP);
  inp.dash = !!(b[2] & F.DASH); inp.nova = !!(b[2] & F.NOVA);
  inp.melee = !!(b[2] & F.MELEE); inp.lock = !!(b[2] & F.LOCK);
  inp.aimX = !!(b[2] & F.AIMX); inp.aimY = !!(b[2] & F.AIMY);
  return inp;
}
function inputEquals(a, b) {
  return a.x === b.x && a.y === b.y && a.fire === b.fire && a.jump === b.jump &&
    a.dash === b.dash && a.nova === b.nova && a.melee === b.melee && a.lock === b.lock &&
    a.aimX === b.aimX && a.aimY === b.aimY;
}

/* Tick packet: [tickLo, tickHi, nPlayers, inputs... (3 bytes each)] + 2-byte FNV checksum */
function encodeTick(tick, inputs) {
  var n = inputs.length;
  var buf = new Uint8Array(4 + n * 3 + 2);
  var h = C.fnvInit();
  buf[0] = tick & 0xFF; buf[1] = (tick >> 8) & 0xFF; buf[2] = 0; buf[3] = n;
  for (var i = 0; i < n; i++) {
    var e = encodeInput(inputs[i]);
    buf[4 + i * 3] = e[0]; buf[5 + i * 3] = e[1]; buf[6 + i * 3] = e[2];
    h = C.fnvAdd(C.fnvAdd(C.fnvAdd(h, e[0]), e[1]), e[2]);
  }
  buf[4 + n * 3] = h & 0xFF; buf[5 + n * 3] = (h >> 8) & 0xFF;
  return buf;
}
function decodeTick(buf) {
  var tick = buf[0] | (buf[1] << 8);
  var n = buf[3];
  var h = C.fnvInit(), i;
  for (i = 0; i < n; i++) h = C.fnvAdd(C.fnvAdd(C.fnvAdd(h, buf[4 + i * 3]), buf[5 + i * 3]), buf[6 + i * 3]);
  var ok = (h & 0xFFFF) === (buf[4 + n * 3] | (buf[5 + n * 3] << 8));
  var inputs = [];
  for (i = 0; i < n; i++) inputs.push(decodeInput([buf[4 + i * 3], buf[5 + i * 3], buf[6 + i * 3]]));
  return { tick: tick, inputs: inputs, checksumOk: ok };
}

/* World hash: quantised entity positions + hp — divergence detection for
 * rollback. Caller passes an array of [x, y, z, hp] per entity, in stable id
 * order. Every 8 ticks is plenty. */
function worldHash(entities) {
  var h = C.fnvInit();
  for (var i = 0; i < entities.length; i++) {
    var e = entities[i];
    h = C.fnvAddF(h, C.packF1(e[0]));
    h = C.fnvAddF(h, C.packF1(e[1]));
    h = C.fnvAddF(h, C.packF1(e[2]));
    h = C.fnvAdd(h, Math.round(e[3] * 4));
  }
  return h;
}

/* Seed the per-run sim PRNG from the shared world seed + tick — every host
 * derives identical random streams. */
function simRng(seedNum, tick) {
  return C.mulberry32((seedNum ^ (tick * 0x9E3779B9)) >>> 0);
}

/* ---------------- transports ---------------- */
/* LoopbackTransport: solo play / tests. send() is a no-op; the Session below
 * injects local inputs directly. */
function LoopbackTransport() { this.closed = false; }
LoopbackTransport.prototype.send = function () {};
LoopbackTransport.prototype.onMessage = function (cb) { this._cb = cb; };
LoopbackTransport.prototype.close = function () { this.closed = true; };

/* WebSocketTransport: the forward path for relayed lockstep.
 * Message framing: [type(1)][len(2 BE)][payload]. types: 1 tick, 2 state hash,
 * 3 handshake json, 4 input ack. */
function WebSocketTransport(ws) {
  this.ws = ws;
  this._pending = null;
  var self = this;
  ws.binaryType = 'arraybuffer';
  ws.onmessage = function (ev) {
    if (typeof ev.data === 'string') { self._cb && self._cb(3, new TextEncoder().encode(ev.data)); return; }
    var d = new Uint8Array(ev.data);
    self._cb && self._cb(d[0], d.subarray(3, 3 + (d[1] | (d[2] << 8))));
  };
}
WebSocketTransport.prototype.send = function (type, payload) {
  if (this.ws.readyState !== 1) return;
  var buf = new Uint8Array(3 + payload.length);
  buf[0] = type; buf[1] = payload.length & 0xFF; buf[2] = (payload.length >> 8) & 0xFF;
  buf.set(payload, 3);
  this.ws.send(buf);
};
WebSocketTransport.prototype.onMessage = function (cb) { this._cb = cb; };
WebSocketTransport.prototype.close = function () { try { this.ws.close(); } catch (e) {} };

/* ---------------- session ----------------
 * Solo today; the host/client split is already shaped for a relay. */
function Session(opts) {
  opts = opts || {};
  this.mode = opts.mode || 'solo';            // 'solo' | 'host' | 'client'
  this.room = opts.room || ('RLY-' + Math.floor((opts.rand ? opts.rand() : Math.random()) * 1e6));
  this.seed = opts.seed || 'RILEY';
  this.seedNum = C.hashStr(String(this.seed));
  this.players = opts.players || 1;
  this.localPlayer = opts.localPlayer || 0;
  this.tick = 0;
  this.hashTick = 0;
  this.worldHash = 0;
  this.inputHistory = [];                     // for rollback: ring of recent inputs
  this.historyCap = TICK_RATE * 4;            // 4 s of rollback depth
  this.transport = opts.transport || new LoopbackTransport();
  this._cb = opts.onMessage || null;
  this.state = 'local';                       // local | waiting | synced
}
Session.prototype.handshakeJson = function () {
  return JSON.stringify({ room: this.room, seed: this.seed, players: this.players, tickRate: TICK_RATE, protocol: 'riley/1' });
};
Session.prototype.queueInput = function (player, inp) {
  this.inputHistory.push({ tick: this.tick, player: player, input: inp });
  if (this.inputHistory.length > this.historyCap) this.inputHistory.shift();
};
Session.prototype.inputsFor = function (tick) {
  /* solo: only local input exists; other slots are zeros */
  var out = [];
  for (var p = 0; p < this.players; p++) out.push(makeInput());
  for (var i = 0; i < this.inputHistory.length; i++) {
    var h = this.inputHistory[i];
    if (h.tick === tick) out[h.player] = h.input;
  }
  return out;
};
Session.prototype.tickPacket = function () {
  return encodeTick(this.tick, this.inputsFor(this.tick));
};
Session.prototype.recordWorldHash = function (hash) {
  this.hashTick = this.tick;
  this.worldHash = hash;
};
Session.prototype.replayFrom = function (tick) {
  /* rollback: drop inputs at/after `tick` — the engine re-simulates from its
   * entity snapshot kept at that tick */
  this.inputHistory = this.inputHistory.filter(function (h) { return h.tick < tick; });
};
Session.prototype.onMessage = function (type, payload) {
  if (this._cb) this._cb(type, payload);
};
Session.prototype.close = function () { this.transport.close(); };

return {
  TICK_RATE: TICK_RATE, MAX_PLAYERS: MAX_PLAYERS, FLAGS: F,
  makeInput: makeInput, encodeInput: encodeInput, decodeInput: decodeInput, inputEquals: inputEquals,
  encodeTick: encodeTick, decodeTick: decodeTick,
  worldHash: worldHash, simRng: simRng,
  LoopbackTransport: LoopbackTransport, WebSocketTransport: WebSocketTransport,
  Session: Session
};
});
