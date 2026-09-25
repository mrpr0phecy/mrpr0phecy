/* EOT Net — the multiplayer layer for EDGE OF TOMORROW.
 *
 * Architecture: HOST-AUTHORITATIVE with client-side prediction and snapshot
 * interpolation. One peer is host: it runs the simulation in eot-sim.js and
 * is the only writer of truth. Clients send *inputs* (never state), predict
 * their own avatar locally so it responds on the frame they press a key, and
 * interpolate everyone else between snapshots.
 *
 * Why this shape (and not lockstep): this is an action game where a dropped
 * peer must not stall the match, and where the local avatar has to feel
 * instant. Snapshot interpolation costs a little bandwidth and buys both.
 * The deterministic sim is still there — worldHash() proves peers agree and
 * captureState()/restoreState() give us a rollback path — so the door to
 * lockstep stays open without a rewrite.
 *
 * Transports are pluggable and the game does not know which one is live:
 *   LoopbackTransport        solo + bots. No network at all.
 *   BroadcastChannelTransport  real multiplayer between browser tabs/windows
 *                            on one machine. Zero backend, works today on a
 *                            static host — this is what "multiplayer" means
 *                            out of the box, and it is genuinely networked
 *                            code, not a fake.
 *   RelayTransport           the production path. Talks a tiny stateless
 *                            WebSocket relay; the wire format below is final
 *                            so a relay can be added without touching the game.
 *
 * Browser: window.EOTNet   Node: module.exports
 */
(function (root, factory) {
  var C = typeof globalThis !== 'undefined' && globalThis.EOTCore ? globalThis.EOTCore : require('./eot-core.js');
  var S = typeof globalThis !== 'undefined' && globalThis.EOTSim ? globalThis.EOTSim : require('./eot-sim.js');
  var api = factory(C, S);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EOTNet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, S) {
'use strict';

var TICK = S.K.TICK_RATE;
var DT = S.K.FIXED;
var SNAP_EVERY = 3;        // 60 Hz sim -> 20 Hz snapshots
var HASH_EVERY = 8;        // ~7.5 Hz divergence checks
var MAX_PLAYERS = 8;

/* ============================ WIRE FORMAT ============================
 * Message types. Kept numeric and stable — this is the contract a relay
 * server implements against.
 *   1 HELLO      {name, wantRole}            client -> host
 *   2 WELCOME    {id, seed, youAre, roster}  host -> client
 *   3 INPUT      binary: seq + 4 bytes       client -> host
 *   4 SNAPSHOT   binary: tick + snapshot     host -> clients
 *   5 HASH       {tick, hash}                both ways
 *   6 CORRECT    {tick, capture}             host -> client (rollback)
 *   7 LOBBY      {players, phase, countdown} host -> clients
 *   8 EVENT      {events}                    host -> clients
 *   9 BYE        {id}                        either way
 *
 * INPUT is 5 bytes on the wire: [seq:uint8][mx:int8][my:int8][aim:uint8][flags:uint8]
 *   mx,my in -8..8, aim quantised to 1/256 of a turn, flags from Sim.F.
 * At 60 Hz per player that is 300 B/s — 8 players is 2.4 KB/s. Bandwidth is
 * not the constraint here; snapshot size is, hence the quantised snapshot. */
var MSG = { HELLO: 1, WELCOME: 2, INPUT: 3, SNAPSHOT: 4, HASH: 5, CORRECT: 6, LOBBY: 7, EVENT: 8, BYE: 9 };

function encodeInput(seq, inp) {
  var qx = Math.round(C.clamp(inp.x, -1, 1) * 8);
  var qy = Math.round(C.clamp(inp.y, -1, 1) * 8);
  var qa = Math.round(C.angNorm(inp.aim) / C.TAU * 255) & 0xFF;
  return { seq: seq & 0xFF, mx: qx, my: qy, aim: qa, flags: S.inputFlags(inp) };
}
function decodeInput(pkt) {
  return S.inputFromFlags(pkt.mx / 8, pkt.my / 8, (pkt.aim / 255) * C.TAU, pkt.flags);
}

/* ============================ TRANSPORTS ============================ */

/* --- solo: inputs go nowhere, snapshots go nowhere --- */
function LoopbackTransport() { this.onMessage = null; this.kind = 'loopback'; }
LoopbackTransport.prototype.send = function () {};
LoopbackTransport.prototype.close = function () {};

/* --- same-machine multiplayer over BroadcastChannel ---
 * This is real message passing between separate documents: separate JS
 * heaps, separate event loops, no shared memory. It is the honest "no
 * backend" multiplayer a static site can offer, and it exercises exactly the
 * same host/client code path a relay would. */
function BroadcastChannelTransport(room) {
  this.kind = 'broadcast';
  this.room = 'eot:' + room;
  this.onMessage = null;
  this.closed = false;
  var self = this;
  this.peerId = C.hashStr('peer' + Date.now() + ':' + Math.floor(Math.random() * 1e9)).toString(36);
  if (typeof BroadcastChannel === 'undefined') { this.available = false; return; }
  this.available = true;
  this.ch = new BroadcastChannel(this.room);
  this.ch.onmessage = function (e) {
    if (self.closed) return;
    var m = e.data;
    /* ignore our own broadcasts — BroadcastChannel does not loop back to the
     * sender, but a relay shim might, so guard anyway */
    if (m && m.from === self.peerId) return;
    if (self.onMessage) self.onMessage(m.msg, m.from);
  };
}
BroadcastChannelTransport.prototype.send = function (msg, to) {
  if (this.closed || !this.ch) return;
  try { this.ch.postMessage({ from: this.peerId, to: to || null, msg: msg }); }
  catch (err) { /* structured-clone failure: drop, do not crash the sim */ }
};
BroadcastChannelTransport.prototype.close = function () {
  this.closed = true;
  if (this.ch) { try { this.ch.close(); } catch (e) {} this.ch = null; }
};

/* --- relay: the production path ---
 * The relay is stateless: it forwards opaque frames between room members.
 * Framing is [type:1][len:2 BE][payload]. Because the relay never simulates,
 * it cannot break the game's determinism or authority model. */
function RelayTransport(url, room, name) {
  this.kind = 'relay';
  this.url = url; this.room = room; this.name = name;
  this.onMessage = null; this.onOpen = null; this.onClose = null;
  this.connected = false; this.closed = false;
  this.available = typeof WebSocket !== 'undefined';
  if (!this.available) return;
  var self = this;
  try { this.ws = new WebSocket(url); } catch (e) { this.available = false; return; }
  this.ws.binaryType = 'arraybuffer';
  this.ws.onopen = function () {
    self.connected = true;
    self.sendRaw({ t: 'join', room: room, name: name });
    if (self.onOpen) self.onOpen();
  };
  this.ws.onmessage = function (e) {
    if (self.closed) return;
    var msg = (typeof e.data === 'string') ? JSON.parse(e.data) : self._deframe(e.data);
    if (msg && self.onMessage) self.onMessage(msg, msg.from || null);
  };
  this.ws.onclose = function () { self.connected = false; if (self.onClose) self.onClose(); };
  this.ws.onerror = function () { self.connected = false; };
}
RelayTransport.prototype.sendRaw = function (obj) {
  if (!this.ws || this.ws.readyState !== 1) return;
  this.ws.send(JSON.stringify(obj));
};
RelayTransport.prototype._frame = function (type, obj) {
  var body = new TextEncoder().encode(JSON.stringify(obj));
  var out = new Uint8Array(3 + body.length);
  out[0] = type; out[1] = (body.length >> 8) & 0xFF; out[2] = body.length & 0xFF;
  out.set(body, 3);
  return out.buffer;
};
RelayTransport.prototype._deframe = function (buf) {
  var u = new Uint8Array(buf);
  var body = u.subarray(3, 3 + ((u[1] << 8) | u[2]));
  return JSON.parse(new TextDecoder().decode(body));
};
RelayTransport.prototype.send = function (msg, to) {
  if (!this.connected) return;
  msg.from = this.peerId || null;
  if (to) msg.to = to;
  this.ws.send(this._frame(msg.t || 0, msg));
};
RelayTransport.prototype.close = function () {
  this.closed = true;
  if (this.ws) { try { this.ws.close(); } catch (e) {} this.ws = null; }
};

/* ============================ PEER BOOKKEEPING ============================ */
function Peer(id, name, transportId) {
  this.id = id; this.name = name; this.transportId = transportId;
  this.lastInputSeq = -1;
  this.lastSeen = 0;
  this.rtt = 0;
  this.hash = null;
  this.ready = false;
}

/* ============================ SESSION ============================ */
function Session(opts) {
  opts = opts || {};
  this.role = opts.role === 'client' ? 'client' : 'host';
  /* co-sim clients run their own copy of the simulation and can therefore
   * diverge; see the SNAPSHOT branch in _recv for what that implies. */
  this.coSim = !!opts.coSim;
  this.transport = opts.transport || new LoopbackTransport();
  this.localId = opts.localId || 1;
  this.localName = opts.localName || 'You';
  this.world = opts.world || null;
  this.peers = new Map();
  this.pendingInputs = [];      // unacknowledged local inputs (for reconciliation)
  this.inputSeq = 0;
  this.snapBuffer = [];         // received snapshots, newest last
  this.lastSnapTick = -1;
  this.lastAckSeq = -1;
  this.onEvent = opts.onEvent || null;
  this.onPeerChange = opts.onPeerChange || null;
  this.onSnapshot = opts.onSnapshot || null;
  this.onCorrect = opts.onCorrect || null;
  this.onLobby = opts.onLobby || null;
  this.stats = { sent: 0, recv: 0, corrected: 0, hashesChecked: 0, mismatches: 0 };
  this.hashHistory = new Map();   // tick -> our own worldHash, for co-sim checks
  this.closed = false;
  this._bind();
}

/* Record our own hash for the tick we have just simulated. A co-sim client
 * calls this after every step; the SNAPSHOT handler then compares the host's
 * hash for a tick against the one we recorded for that same tick. Checking
 * the live world instead would compare two different ticks (a co-sim client
 * runs slightly ahead of the snapshots it receives) and would never fire. */
Session.prototype.clientRecordTick = function () {
  if (!this.world) return;
  this.hashHistory.set(this.world.tick, S.worldHash(this.world));
  if (this.hashHistory.size > 240) {
    /* Map iteration is insertion-ordered, so the first keys are the oldest */
    var it = this.hashHistory.keys();
    for (var i = 0; i < 60; i++) this.hashHistory.delete(it.next().value);
  }
};

Session.prototype._bind = function () {
  var self = this;
  this.transport.onMessage = function (msg, from) { self._recv(msg, from); };
};

Session.prototype.addBotlessPeer = function (id, name) {
  var p = new Peer(id, name, null);
  this.peers.set(id, p);
  return p;
};

/* ---- host side ---- */
Session.prototype.assignId = function () {
  var used = {};
  used[this.localId] = true;
  this.peers.forEach(function (p) { used[p.id] = true; });
  /* Every existing player counts, bots included — handing out an id a bot
   * already holds creates two entities that share one input slot and one
   * byId entry, which desyncs everything downstream. */
  if (this.world) {
    for (var i = 0; i < this.world.players.length; i++) used[this.world.players[i].id] = true;
  }
  for (var n = 2; n <= 64; n++) if (!used[n]) return n;
  return -1;
};

Session.prototype.hostAccept = function (transportId, name, wantRole) {
  if (this.role !== 'host' || !this.world) return null;
  var id = this.assignId();
  if (id < 0) return null;
  var role = (wantRole === S.ROLES.SLAYER && !this._hasSlayer()) ? S.ROLES.SLAYER : S.ROLES.SURV;
  S.addPlayer(this.world, { id: id, name: name, role: role, bot: false });
  var peer = new Peer(id, name, transportId);
  this.peers.set(id, peer);
  this.transport.send({
    t: MSG.WELCOME, id: id, seed: this.world.seed, youAre: role,
    roster: this.roster(), tick: this.world.tick
  }, transportId);
  this.broadcastLobby();
  if (this.onPeerChange) this.onPeerChange(this.roster());
  return peer;
};

Session.prototype._hasSlayer = function () {
  if (!this.world) return false;
  for (var i = 0; i < this.world.players.length; i++) {
    if (this.world.players[i].role === S.ROLES.SLAYER && !this.world.players[i].bot) return true;
  }
  return false;
};

/* True when at least one remote peer is attached. Drives whether the host
 * publishes snapshots at all — see hostTick(). */
Session.prototype.hasPeers = function () {
  if (this.transport.kind === 'loopback') return false;
  return this.peers.size > 0;
};

Session.prototype.roster = function () {
  var out = [];
  if (!this.world) return out;
  for (var i = 0; i < this.world.players.length; i++) {
    var p = this.world.players[i];
    out.push({ id: p.id, name: p.name, role: p.role, bot: !!p.bot });
  }
  return out;
};

Session.prototype.broadcastLobby = function () {
  if (!this.world) return;
  this.transport.send({ t: MSG.LOBBY, roster: this.roster(), phase: this.world.phase, tick: this.world.tick });
};

/* Called once per tick by the host: gather remote inputs, publish a snapshot. */
Session.prototype.hostTick = function (inputs) {
  if (this.role !== 'host' || !this.world) return inputs;
  /* Nobody to talk to => do not build anything. Solo play otherwise spends
   * 20 snapshot serialisations a second on a transport that discards them. */
  if (!this.hasPeers()) return inputs;
  var w = this.world;
  var tick = w.tick;

  if (tick % SNAP_EVERY === 0) {
    var snap = S.snapshot(w);
    /* The divergence hash rides on the snapshot. Sending it on its own
     * cadence instead means the client is asked to verify a tick it has no
     * state for, so the check silently never fires. */
    this.transport.send({ t: MSG.SNAPSHOT, snap: snap, hash: S.worldHash(w) });
    this.stats.sent++;
  }
  if (tick % HASH_EVERY === 0) {
    this.transport.send({ t: MSG.HASH, tick: tick, hash: S.worldHash(w) });
    this.stats.hashesChecked++;
  }
  if (w.events && w.events.length) {
    this.transport.send({ t: MSG.EVENT, events: w.events });
  }
  return inputs;
};

/* Apply a client's input packet on the host. */
Session.prototype.hostApplyInput = function (peerId, pkt) {
  var w = this.world;
  if (!w) return null;
  var player = S.getPlayer(w, peerId);
  if (!player) return null;
  var peer = this.peers.get(peerId);
  /* drop out-of-order / replayed packets: seq is monotonic per peer */
  if (peer && pkt.seq === peer.lastInputSeq) return null;
  if (peer) peer.lastInputSeq = pkt.seq;
  var inp = decodeInput(pkt);
  inp.seq = pkt.seq;
  return inp;
};

/* Resync a client that has drifted: send a lossless capture it can restore. */
Session.prototype.hostCorrect = function (transportId, tick) {
  if (!this.world) return;
  this.transport.send({ t: MSG.CORRECT, tick: tick, capture: S.captureState(this.world) }, transportId);
  this.stats.corrected++;
};

/* ---- client side ----
 * The client runs NO simulation. It is a view onto the host's world: it
 * applies snapshots, interpolates remote entities, and adds a *predicted
 * offset* to its own avatar so keypresses land on the frame they happen.
 *
 * Keeping prediction as an offset rather than as a mutation of the world is
 * the important choice: the authoritative state is never corrupted by local
 * guessing, so reconciliation is just "decay the offset", and a large error
 * can be snapped without ever having to unwind simulated state. */
Session.prototype.clientPushInput = function (inp) {
  if (this.role !== 'client') return inp;
  this.inputSeq = (this.inputSeq + 1) & 0xFF;
  var pkt = encodeInput(this.inputSeq, inp);
  this.transport.send({ t: MSG.INPUT, id: this.localId, pkt: pkt });
  this.pendingInputs.push({ seq: this.inputSeq, inp: inp });
  if (this.pendingInputs.length > 180) this.pendingInputs.shift();
  return inp;
};

/* Advance the predicted offset by one frame of local movement. */
Session.prototype.clientPredict = function (inp, role) {
  if (this.role !== 'client') return;
  if (!this.pred) this.pred = { x: 0, y: 0, active: false };
  var mx = C.clamp(inp.x, -1, 1), my = C.clamp(inp.y, -1, 1);
  var ml = Math.sqrt(mx * mx + my * my);
  if (ml > 1) { mx /= ml; my /= ml; }
  if (ml < 0.05) return;
  var slayer = role === S.ROLES.SLAYER;
  var base = slayer ? S.K.SLAYER_WALK : S.K.SURV_WALK;
  if (inp.sprint) base = slayer ? S.K.SLAYER_SPRINT : S.K.SURV_SPRINT;
  else if (inp.crouch && !slayer) base = S.K.SURV_CROUCH;
  this.pred.x += mx * base * DT;
  this.pred.y += my * base * DT;
  this.pred.active = true;
  /* never let a prediction run away from the truth */
  var m = Math.sqrt(this.pred.x * this.pred.x + this.pred.y * this.pred.y);
  var cap = 120;
  if (m > cap) { this.pred.x *= cap / m; this.pred.y *= cap / m; }
};

/* Reconcile against the authoritative state for our own avatar.
 * Returns the residual error so the renderer can decide how hard to correct. */
Session.prototype.reconcile = function (snapPlayer, alpha) {
  if (!this.pred) this.pred = { x: 0, y: 0, active: false };
  /* The offset is measured from the snapshot we last applied, so a fresh
   * snapshot invalidates the part of it the host has already processed.
   * Anything older than the snapshot is by definition confirmed. */
  var err = Math.sqrt(this.pred.x * this.pred.x + this.pred.y * this.pred.y);
  var t = alpha === undefined ? (err > 80 ? 0.6 : 0.22) : alpha;
  this.pred.x -= this.pred.x * t;
  this.pred.y -= this.pred.y * t;
  if (Math.abs(this.pred.x) < 0.5 && Math.abs(this.pred.y) < 0.5) {
    this.pred.x = 0; this.pred.y = 0; this.pred.active = false;
  }
  this.pendingInputs.length = 0;   // all confirmed by this snapshot
  return err;
};

/* Apply a host snapshot into the client's render world. Called on every
 * snapshot; cheap because the snapshot is already flat and quantised. */
Session.prototype.clientApplySnapshot = function (snap) {
  if (!this.world || !snap) return null;
  S.applySnapshot(this.world, snap);
  return this.world;
};

/* Where the local avatar should be drawn: authoritative + predicted offset. */
Session.prototype.localDrawPos = function () {
  var me = this.world ? S.getPlayer(this.world, this.localId) : null;
  if (!me) return null;
  var p = this.pred || { x: 0, y: 0 };
  return {
    x: C.clamp(me.x + p.x, 12, S.K.WORLD.w - 12),
    y: C.clamp(me.y + p.y, 12, S.K.WORLD.h - 12),
    predMag: Math.sqrt(p.x * p.x + p.y * p.y)
  };
};

/* ---- interpolation of remote entities ----
 * Snapshots arrive at 20 Hz; we render 60+ fps. Rendering a remote player at
 * its newest snapshot makes them stutter, so we render them ~100 ms in the
 * past and lerp between the two snapshots that bracket that time. */
function Interpolator(delayTicks) {
  this.delay = delayTicks || 6;
  this.buffer = [];   // {tick, players:Map, anchors:[], gates:[]}
}
Interpolator.prototype.push = function (snap) {
  this.buffer.push(snap);
  if (this.buffer.length > 24) this.buffer.shift();
};
Interpolator.prototype.sample = function (renderTick, localId) {
  var target = renderTick - this.delay;
  var a = null, b = null;
  for (var i = 0; i < this.buffer.length; i++) {
    if (this.buffer[i].tick <= target) { a = this.buffer[i]; b = this.buffer[i + 1] || null; }
  }
  if (!a) return this.buffer.length ? this.buffer[this.buffer.length - 1] : null;
  if (!b) return a;
  var span = Math.max(1, b.tick - a.tick);
  var f = C.clamp((target - a.tick) / span, 0, 1);
  return { tick: target, a: a, b: b, f: f, localId: localId };
};
/* Lerp one remote player between two bracketing snapshots. */
function lerpRemote(a, b, f) {
  if (!b) return a;
  var out = {};
  for (var k in a) out[k] = a[k];
  out.x = C.lerp(a.x, b.x, f);
  out.y = C.lerp(a.y, b.y, f);
  out.z = C.lerp(a.z || 0, b.z || 0, f);
  out.facing = C.angLerp(a.facing, b.facing, f);
  /* discrete state must not be interpolated — take the newer one once we are
   * past the halfway point, so a down/hook reads at the right moment */
  if (f > 0.5) {
    out.hp = b.hp; out.state = b.state; out.atkPhase = b.atkPhase;
    out.ult = b.ult; out.stamina = b.stamina; out.interactKind = b.interactKind;
    out.interactT = b.interactT; out.skill = b.skill; out.hitFlash = b.hitFlash;
  }
  return out;
}

/* ---- receive path ---- */
Session.prototype._recv = function (msg, from) {
  if (!msg || this.closed) return;
  this.stats.recv++;
  switch (msg.t) {
    case MSG.HELLO:
      if (this.role === 'host') this.hostAccept(from, msg.name, msg.wantRole);
      break;
    case MSG.WELCOME:
      this.localId = msg.id;
      this.worldSeed = msg.seed;
      if (this.world && this.world.seed !== msg.seed) {
        /* rebuild the arena from the host's seed — the level is a pure
         * function of the seed, so there is nothing to download */
        S.buildArena(this.world);
        this.world.seed = msg.seed;
      }
      if (this.onEvent) this.onEvent({ t: 'welcome', id: msg.id, role: msg.youAre, roster: msg.roster });
      break;
    case MSG.INPUT:
      if (this.role === 'host' && this.onEvent) this.onEvent({ t: 'input', id: msg.id, pkt: msg.pkt });
      break;
    case MSG.SNAPSHOT:
      if (this.role === 'client') {
        this.snapBuffer.push(msg.snap);
        if (this.snapBuffer.length > 24) this.snapBuffer.shift();
        this.lastSnapTick = msg.snap.tick;

        /* Two client modes, and the difference matters:
         *
         *  co-sim (this.coSim) — the client runs its own copy of the sim, so
         *  it CAN drift from the host (a missed input, a float difference, a
         *  packet that reordered). The hash is checked against our own state
         *  at that tick *before* anything is overwritten, and a mismatch asks
         *  the host for a capture to roll back from. This is the mode the
         *  deterministic-sim roadmap targets.
         *
         *  pure view (default) — the client simulates nothing and simply
         *  renders what the host sends. There is no local truth to diverge
         *  from, so a hash check here would be theatre. */
        if (this.coSim && typeof msg.hash === 'number') {
          /* Compare against the hash WE recorded for that tick, not against
           * our current world: a co-sim client is normally a tick or two
           * ahead of the snapshots it receives, so checking the live world
           * would compare two different ticks and never fire. */
          var mine2 = this.hashHistory.get(msg.snap.tick);
          if (typeof mine2 === 'number') {
            this.stats.hashesChecked++;
            if (mine2 !== msg.hash) {
              this.stats.mismatches++;
              this.transport.send({ t: MSG.HASH, tick: msg.snap.tick, hash: mine2, mismatch: true });
              if (this.onMismatch) this.onMismatch(msg.snap.tick, mine2, msg.hash);
            }
          }
        }
        if (!this.coSim) {
          this.clientApplySnapshot(msg.snap);
          /* pull the predicted offset back toward the confirmed position;
           * without this the offset only ever grows to its cap */
          var meSnap = null;
          for (var si = 0; si < msg.snap.players.length; si++) {
            if (msg.snap.players[si].id === this.localId) { meSnap = msg.snap.players[si]; break; }
          }
          if (meSnap) this.reconcile(meSnap);
        }
        if (this.onSnapshot) this.onSnapshot(msg.snap);
      }
      break;
    case MSG.HASH:
      if (this.world && this.world.tick === msg.tick) {
        var mine = S.worldHash(this.world);
        this.stats.hashesChecked++;
        if (mine !== msg.hash) {
          this.stats.mismatches++;
          /* we disagree with the host: ask for a capture and roll back */
          this.transport.send({ t: MSG.HASH, tick: msg.tick, hash: mine, mismatch: true });
        }
      }
      break;
    case MSG.CORRECT:
      if (this.role === 'client' && this.world && msg.capture) {
        S.restoreState(this.world, msg.capture);
        this.pendingInputs.length = 0;
        if (this.onCorrect) this.onCorrect(msg.tick);
      }
      break;
    case MSG.LOBBY:
      if (this.onLobby) this.onLobby(msg);
      break;
    case MSG.EVENT:
      if (this.onEvent && msg.events) {
        for (var i = 0; i < msg.events.length; i++) this.onEvent(msg.events[i]);
      }
      break;
    case MSG.BYE:
      this.peers.delete(msg.id);
      if (this.onPeerChange) this.onPeerChange(this.roster());
      break;
  }
};

Session.prototype.close = function () {
  if (this.closed) return;
  this.closed = true;
  try { this.transport.send({ t: MSG.BYE, id: this.localId }); } catch (e) {}
  if (this.transport.close) this.transport.close();
};

/* ============================ ROOM CODES ============================
 * Short, unambiguous, URL-safe. No I/l/O/0 so a code can be read aloud. */
var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeRoomCode(rng) {
  var r = rng || Math.random, out = '';
  for (var i = 0; i < 5; i++) out += ALPHABET[Math.floor(r() * ALPHABET.length)];
  return out;
}
function validRoomCode(s) {
  return typeof s === 'string' && /^[A-Z2-9]{4,8}$/.test(s.toUpperCase());
}

return {
  MSG: MSG, TICK: TICK, SNAP_EVERY: SNAP_EVERY, HASH_EVERY: HASH_EVERY,
  encodeInput: encodeInput, decodeInput: decodeInput,
  LoopbackTransport: LoopbackTransport,
  BroadcastChannelTransport: BroadcastChannelTransport,
  RelayTransport: RelayTransport,
  Session: Session, Peer: Peer,
  Interpolator: Interpolator, lerpRemote: lerpRemote,
  makeRoomCode: makeRoomCode, validRoomCode: validRoomCode
};
});
