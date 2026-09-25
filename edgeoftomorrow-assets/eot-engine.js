/* EOT Engine — the game loop, input, and the wiring between sim/net/render.
 *
 * Three things this file is responsible for and nothing else:
 *
 *   1. TIME. The simulation runs on a fixed 60 Hz tick, decoupled from the
 *      render rate. Rendering interpolates. This is non-negotiable for
 *      netcode: a variable-timestep sim cannot be reproduced on a peer.
 *      The accumulator also caps catch-up steps so a backgrounded tab does
 *      not come back and try to simulate ten minutes at once.
 *
 *   2. HITSTOP. On a real hit the tick is suspended for a few frames while
 *      the renderer keeps drawing. Nothing about the motion changes; the
 *      freeze alone is what makes a hit feel like it cost something.
 *
 *   3. INPUT. Keyboard/mouse/touch are sampled into the compact input struct
 *      the netcode sends. Raw device state never reaches the sim.
 *
 * Browser: window.EOTEngine
 */
(function (root) {
'use strict';

var C = root.EOTCore;
var S = root.EOTSim;
var AI = root.EOTAI;
var N = root.EOTNet;
var R = root.EOTRender;
var A = root.EOTAudio;

var clamp = C.clamp;
var TICK = S.K.TICK_RATE;
var DT = S.K.FIXED;
var MAX_STEPS = 5;          /* catch-up cap: never spiral */

/* ============================ INPUT ============================ */
function InputState() {
  this.keys = Object.create(null);
  this.mx = 0; this.my = 0;         /* aim in screen space */
  this.aim = 0;
  this.moveX = 0; this.moveY = 0;
  this.touchMove = null;
  this.touchAim = null;
  this.pressed = Object.create(null);   /* edge-triggered, cleared each tick */
  this.pointerDown = false;
  this.enabled = false;
}
InputState.prototype.down = function (k) { return !!this.keys[k]; };
InputState.prototype.hit = function (k) {
  if (this.pressed[k]) { this.pressed[k] = false; return true; }
  return false;
};
InputState.prototype.markPress = function (k) { this.keys[k] = true; this.pressed[k] = true; };
InputState.prototype.release = function (k) { this.keys[k] = false; };

/* Build the compact input struct the sim/netcode consume. */
InputState.prototype.toInput = function () {
  var i = S.makeInput();
  /* WASD/arrows -> unit-ish move vector. Keys arrive lowercased by the
   * handler, except named keys like ArrowUp which keep their case. */
  var mx = this.moveX, my = this.moveY;
  if (this.down('w') || this.down('ArrowUp')) my -= 1;
  if (this.down('s') || this.down('ArrowDown')) my += 1;
  if (this.down('a') || this.down('ArrowLeft')) mx -= 1;
  if (this.down('d') || this.down('ArrowRight')) mx += 1;
  /* touch overrides the stick when a finger is down */
  if (this.touchMove) { mx = this.touchMove.x; my = this.touchMove.y; }
  var ml = Math.sqrt(mx * mx + my * my);
  if (ml > 1) { mx /= ml; my /= ml; }
  if (ml < 0.12) { mx = 0; my = 0; }
  i.x = mx; i.y = my;
  i.aim = this.touchAim ? this.touchAim : this.aim;
  i.sprint = this.down('shift') || this.down('Shift');
  i.crouch = this.down('control') || this.down('Control');
  i.attack = this.down('mouse0') || this.down('j');
  i.dash = this.hit(' ') || this.hit('space');
  i.ult = this.hit('q') || this.hit('e');
  i.interact = this.down('mouse2') || this.down('f');
  i.cancel = this.hit('g');
  i.emote = this.hit('t');
  return i;
};

/* ============================ GAME ============================ */
function Game(opts) {
  opts = opts || {};
  this.canvas = opts.canvas;
  this.hud = opts.hud || {};
  this.renderer = new R.Renderer(this.canvas);
  this.input = new InputState();
  this.session = null;
  this.world = null;
  this.state = 'menu';      /* menu | lobby | playing | results */
  this.mode = 'solo';       /* solo | host | client */
  this.localId = 1;
  this.localRole = S.ROLES.SURV;
  this.roomCode = opts.roomCode || '';
  this.playerName = opts.playerName || 'You';

  this.acc = 0;
  this.last = 0;
  this.hitstop = 0;
  this.slowmo = 0;
  this.running = false;
  this.raf = 0;
  this.frames = 0; this.fpsT = 0; this.fps = 60;
  this.terror = 0;
  this.heartbeatT = 0;
  this.interp = new N.Interpolator(6);
  this.results = null;
  this.onState = opts.onState || null;
  this.bannerT = 0; this.bannerText = '';

  this._bindInput();
  this._bindResize();
}

/* ------------------------- setup ------------------------- */
Game.prototype.startSolo = function (opts) {
  opts = opts || {};
  this.mode = 'solo';
  this.localRole = opts.role || S.ROLES.SURV;
  var seed = opts.seed || ('eot-' + Date.now());
  this.world = S.makeWorld({ seed: seed });
  S.buildArena(this.world);

  S.addPlayer(this.world, { id: 1, name: this.playerName, role: this.localRole, bot: false });
  this.localId = 1;
  /* fill the remaining survivor slots with bots so solo is a full match */
  var survCount = this.localRole === S.ROLES.SLAYER ? 0 : 1;
  var id = 2;
  while (survCount < 4) {
    S.addPlayer(this.world, { id: id, name: AI.nameFor(S.ROLES.SURV, id), role: S.ROLES.SURV, bot: true });
    id++; survCount++;
  }
  /* the slayer: a bot, unless the player chose to be it */
  if (this.localRole !== S.ROLES.SLAYER) {
    S.addPlayer(this.world, { id: 9, name: AI.nameFor(S.ROLES.SLAYER, 0), role: S.ROLES.SLAYER, bot: true });
  }
  S.beginMatch(this.world);

  this.session = new N.Session({
    role: 'host', localId: this.localId, world: this.world,
    transport: new N.LoopbackTransport()
  });
  this.renderer.cam.x = this.world.players[0].x;
  this.renderer.cam.y = this.world.players[0].y;
  this.renderer.cam.tx = this.renderer.cam.x;
  this.renderer.cam.ty = this.renderer.cam.y;
  this.setState('playing');
  this.banner('SURVIVE THE NIGHT');
  return this;
};

/* Host a room other tabs can join over BroadcastChannel. */
Game.prototype.startHost = function (opts) {
  opts = opts || {};
  this.mode = 'host';
  this.localRole = opts.role || S.ROLES.SURV;
  this.roomCode = opts.room || N.makeRoomCode();
  var transport = new N.BroadcastChannelTransport(this.roomCode);
  if (!transport.available) return this.startSolo(opts);

  this.world = S.makeWorld({ seed: 'eot-room-' + this.roomCode });
  S.buildArena(this.world);
  S.addPlayer(this.world, { id: 1, name: this.playerName, role: this.localRole, bot: false });
  this.localId = 1;

  var self = this;
  this.session = new N.Session({
    role: 'host', localId: 1, world: this.world, transport: transport,
    onPeerChange: function (roster) { self.updateRoster(roster); }
  });
  /* bots fill whatever humans have not claimed, so a 1-person room is still
   * a full 4v1 — the match does not wait for a queue */
  this.backfillBots();
  this.setState('lobby');
  this.banner('ROOM ' + this.roomCode);
  return this;
};

Game.prototype.startClient = function (opts) {
  opts = opts || {};
  this.mode = 'client';
  this.roomCode = opts.room || '';
  var transport = new N.BroadcastChannelTransport(this.roomCode);
  if (!transport.available) return this.startSolo(opts);

  this.world = S.makeWorld({ seed: 'eot-room-' + this.roomCode });
  S.buildArena(this.world);
  var self = this;
  this.session = new N.Session({
    role: 'client', localId: 0, world: this.world, transport: transport,
    onSnapshot: function (snap) { self.interp.push(snap); },
    onLobby: function (msg) { self.updateRoster(msg.roster); },
    onEvent: function (e) {
      if (e && e.t === 'welcome') {
        self.localId = e.id; self.localRole = e.role;
        self.setState('lobby');
        self.banner('JOINED ' + self.roomCode);
      }
    }
  });
  transport.send({ t: N.MSG.HELLO, name: this.playerName, wantRole: opts.role || S.ROLES.SURV });
  this.setState('lobby');
  return this;
};

Game.prototype.backfillBots = function () {
  var w = this.world;
  if (!w) return;
  var surv = 0, hasSlayer = false, nextId = 10;
  for (var i = 0; i < w.players.length; i++) {
    if (w.players[i].role === S.ROLES.SURV) surv++;
    if (w.players[i].role === S.ROLES.SLAYER) hasSlayer = true;
    if (w.players[i].id >= nextId) nextId = w.players[i].id + 1;
  }
  while (surv < 4) { S.addPlayer(w, { id: nextId++, name: AI.nameFor(S.ROLES.SURV, nextId), role: S.ROLES.SURV, bot: true }); surv++; }
  if (!hasSlayer) S.addPlayer(w, { id: nextId++, name: AI.nameFor(S.ROLES.SLAYER, 0), role: S.ROLES.SLAYER, bot: true });
};

/* Lobby countdown -> match start. Hosts drive it; clients follow the phase
 * that arrives in the snapshot. */
Game.prototype.beginMatch = function () {
  if (!this.world) return;
  this.backfillBots();
  S.beginMatch(this.world);
  if (this.session) this.session.broadcastLobby();
  this.setState('playing');
  this.banner('SURVIVE THE NIGHT');
};

Game.prototype.setState = function (s) {
  this.state = s;
  if (this.onState) this.onState(s, this);
};

Game.prototype.banner = function (text) {
  this.bannerText = text;
  this.bannerT = 2.4;
};

/* ------------------------- input binding ------------------------- */
Game.prototype._bindInput = function () {
  var self = this;
  var inp = this.input;

  this._onKey = function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.type === 'keydown') {
      if (!e.repeat) inp.markPress(k); else inp.keys[k] = true;
      /* space/arrows scroll the page otherwise */
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) >= 0) e.preventDefault();
    } else {
      inp.release(k);
    }
  };
  root.addEventListener('keydown', this._onKey, { passive: false });
  root.addEventListener('keyup', this._onKey);

  this._onMove = function (e) {
    inp.mx = e.clientX; inp.my = e.clientY;
    self._updateAim();
  };
  this._onDown = function (e) {
    A.resume();
    inp.pointerDown = true;
    inp.markPress(e.button === 2 ? 'mouse2' : 'mouse0');
    inp.keys[e.button === 2 ? 'mouse2' : 'mouse0'] = true;
    self._updateAim();
  };
  this._onUp = function (e) {
    inp.pointerDown = false;
    inp.release(e.button === 2 ? 'mouse2' : 'mouse0');
  };
  this._onCtx = function (e) { e.preventDefault(); };

  this.canvas.addEventListener('mousemove', this._onMove);
  this.canvas.addEventListener('mousedown', this._onDown);
  root.addEventListener('mouseup', this._onUp);
  this.canvas.addEventListener('contextmenu', this._onCtx);

  /* touch: left half moves, right half aims/fires */
  this._touches = new Map();
  this._onTouch = function (e) {
    A.resume();
    var rect = self.canvas.getBoundingClientRect();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var x = t.clientX - rect.left, y = t.clientY - rect.top;
      var left = x < rect.width / 2;
      if (e.type === 'touchstart') {
        self._touches.set(t.identifier, { left: left, ox: x, oy: y, x: x, y: y });
        if (!left) inp.keys['mouse0'] = true;
      } else if (e.type === 'touchmove') {
        var rec = self._touches.get(t.identifier);
        if (rec) { rec.x = x; rec.y = y; }
      } else {
        var rec2 = self._touches.get(t.identifier);
        if (rec2 && !rec2.left) inp.keys['mouse0'] = false;
        self._touches.delete(t.identifier);
      }
    }
    self._syncTouch(rect);
    e.preventDefault();
  };
  this.canvas.addEventListener('touchstart', this._onTouch, { passive: false });
  this.canvas.addEventListener('touchmove', this._onTouch, { passive: false });
  this.canvas.addEventListener('touchend', this._onTouch, { passive: false });
  this.canvas.addEventListener('touchcancel', this._onTouch, { passive: false });
};

Game.prototype._syncTouch = function (rect) {
  var move = null, aim = null;
  this._touches.forEach(function (t) {
    if (t.left) {
      var dx = (t.x - t.ox) / 60, dy = (t.y - t.oy) / 60;
      var m = Math.sqrt(dx * dx + dy * dy);
      if (m > 1) { dx /= m; dy /= m; }
      move = { x: dx, y: dy };
    } else {
      aim = Math.atan2(t.y - rect.height / 2, t.x - rect.width / 2);
    }
  });
  this.input.touchMove = move;
  this.input.touchAim = aim;
};

Game.prototype._updateAim = function () {
  var me = this.localPlayer();
  if (!me) return;
  var sp = this.renderer.toScreen(me.x, me.y);
  this.input.aim = Math.atan2(this.input.my - sp.y, this.input.mx - sp.x);
};

Game.prototype._bindResize = function () {
  var self = this;
  this._onResize = function () { self.renderer.resize(); };
  root.addEventListener('resize', this._onResize);
};

/* ------------------------- accessors ------------------------- */
Game.prototype.localPlayer = function () {
  return this.world ? S.getPlayer(this.world, this.localId) : null;
};

/* ============================ LOOP ============================ */
Game.prototype.start = function () {
  if (this.running) return;
  this.running = true;
  this.last = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
  var self = this;
  var frame = function (t) {
    if (!self.running) return;
    self.raf = root.requestAnimationFrame(frame);
    self.frame(t);
  };
  this.raf = root.requestAnimationFrame(frame);
};

Game.prototype.stop = function () {
  this.running = false;
  if (this.raf) root.cancelAnimationFrame(this.raf);
  this.raf = 0;
};

Game.prototype.frame = function (t) {
  var nowT = t || ((root.performance && root.performance.now) ? root.performance.now() : Date.now());
  var raw = (nowT - this.last) / 1000;
  this.last = nowT;
  /* clamp the frame delta: a backgrounded tab must not try to catch up */
  var dt = clamp(raw, 0, 0.25);

  this.frames++; this.fpsT += raw;
  if (this.fpsT >= 0.5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; }

  /* ---- simulate on a fixed tick ---- */
  if (this.world && (this.state === 'playing' || this.state === 'lobby')) {
    /* hitstop suspends the sim, not the renderer */
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
    } else {
      var scale = this.slowmo > 0 ? 0.35 : 1;
      if (this.slowmo > 0) this.slowmo = Math.max(0, this.slowmo - dt);
      this.acc += dt * scale;
      var steps = 0;
      while (this.acc >= DT && steps < MAX_STEPS) {
        this.tick();
        this.acc -= DT;
        steps++;
      }
      if (this.acc > DT * MAX_STEPS) this.acc = 0;   /* give up rather than spiral */
    }
  }

  /* ---- render ---- */
  var me = this.localPlayer();
  var drawMe = me;
  if (this.mode === 'client' && me && this.session) {
    var dp = this.session.localDrawPos();
    if (dp) { drawMe = { x: dp.x, y: dp.y, aim: me.aim }; }
  }
  this.renderer.update(dt, drawMe);
  if (this.world) {
    this.renderer.render(this.world, {
      localId: this.localId, localRole: this.localRole, terror: this.terror
    });
  }
  this.updateHud(dt);
};

/* One simulation tick. This is the only place the world advances. */
Game.prototype.tick = function () {
  var w = this.world;
  var sess = this.session;

  S.prepare(w);

  var inputs;
  if (this.mode === 'client' && sess) {
    /* client: send intent, predict locally, never simulate the world */
    var inp = this.input.toInput();
    sess.clientPushInput(inp);
    sess.clientPredict(inp, this.localRole);
    this._updateTerror();
    return;
  }

  /* host / solo: bots think, then the world steps */
  inputs = AI.think(w);
  var local = S.getPlayer(w, this.localId);
  if (local && !local.bot && S.alive(local)) {
    inputs[this.localId] = this.input.toInput();
    this._updateAim();
    inputs[this.localId].aim = this.input.aim;
  }

  /* relay any remote inputs the transport delivered this tick */
  if (sess && this.mode === 'host' && this._remoteQueue && this._remoteQueue.length) {
    for (var i = 0; i < this._remoteQueue.length; i++) {
      var ri = this._remoteQueue[i];
      inputs[ri.id] = ri.inp;
    }
    this._remoteQueue.length = 0;
  }

  var events = S.step(w, inputs);
  if (sess) sess.hostTick(inputs);
  this.consumeEvents(events);

  /* client-mode snapshot application is handled by the session; here we keep
   * the render world's tick aligned for interpolation */
  this._updateTerror();

  if (w.phase === S.PHASE.OVER && this.state === 'playing') this.finish();
};

/* Sim events -> sound + spectacle + hitstop. */
Game.prototype.consumeEvents = function (events) {
  if (!events || !events.length) return;
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    this.renderer.onEvent(e, this.localId);
    if (A.started) A.playEvent(e);
    /* hitstop: heavier for the slayer's hits and for anything that downs */
    if (e.t === 'hit') {
      var near = (e.to === this.localId || e.by === this.localId);
      this.hitstop = Math.max(this.hitstop, e.amount >= 40 ? (near ? 0.075 : 0.05) : 0.03);
      if (near) this.slowmo = Math.max(this.slowmo, e.amount >= 60 ? 0.16 : 0);
    } else if (e.t === 'ult') {
      this.hitstop = Math.max(this.hitstop, 0.11);
    } else if (e.t === 'down' || e.t === 'eliminate' || e.t === 'core') {
      this.hitstop = Math.max(this.hitstop, 0.13);
      this.slowmo = Math.max(this.slowmo, 0.28);
    }
  }
};

Game.prototype._updateTerror = function () {
  var me = this.localPlayer();
  if (!me || this.localRole === S.ROLES.SLAYER) { this.terror = 0; return; }
  var d = S.distanceToSlayer(this.world, me);
  var target = 1 - clamp(d / S.K.TERROR_R, 0, 1);
  this.terror += (target - this.terror) * 0.08;

  /* the heartbeat is the proximity alarm: its rate carries the information */
  if (A.started && this.terror > 0.05 && !me.bot) {
    this.heartbeatT -= S.K.FIXED;
    if (this.heartbeatT <= 0) {
      A.heartbeat(this.terror);
      this.heartbeatT = A.heartbeatInterval(this.terror);
    }
  }
};

/* ============================ HUD ============================ */
Game.prototype.updateHud = function (dt) {
  var h = this.hud;
  var w = this.world;
  if (!w) return;
  var me = this.localPlayer();

  if (h.fps) h.fps.textContent = this.fps + ' fps';

  if (h.clock) {
    var t = Math.max(0, w.time);
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    h.clock.textContent = m + ':' + (s < 10 ? '0' : '') + s;
  }
  if (h.anchors) {
    var done = S.anchorsDone(w);
    h.anchors.textContent = done + ' / ' + S.K.ANCHORS_NEEDED;
    if (h.anchorBar) h.anchorBar.style.width = clamp(done / S.K.ANCHORS_NEEDED, 0, 1) * 100 + '%';
  }

  if (me && h.hp) {
    var frac = clamp(me.hp / me.maxHp, 0, 1);
    h.hp.style.width = frac * 100 + '%';
    h.hp.className = 'bar-fill' + (frac <= 0.35 ? ' crit' : (this.localRole === S.ROLES.SLAYER ? ' slayer' : ''));
  }
  if (me && h.hpText) h.hpText.textContent = Math.ceil(me.hp) + ' / ' + me.maxHp;
  if (me && h.stam) h.stam.style.width = clamp(me.stamina / S.K.STAM_MAX, 0, 1) * 100 + '%';
  if (me && h.ult) {
    var u = clamp(me.ult / S.K.ULT_CHARGE_MAX, 0, 1);
    h.ult.style.width = u * 100 + '%';
    if (h.ultWrap) h.ultWrap.classList.toggle('ready', me.ult >= S.K.ULT_CHARGE_MAX);
  }
  if (me && h.state) h.state.textContent = me.state === S.STATE.DOWNED ? 'DOWNED' :
    (me.state === S.STATE.HOOKED ? 'HOOKED' : (me.hp <= me.maxHp * 0.5 ? 'INJURED' : 'HEALTHY'));

  /* skill check prompt */
  if (h.skill) {
    var on = !!(me && me.skill);
    h.skill.classList.toggle('hide', !on);
    if (on && h.skillNeedle && h.skillZone) {
      h.skillNeedle.style.left = (me.skill.frac * 100) + '%';
      h.skillZone.classList.toggle('great', !!me.skill.inGreat);
      h.skillZone.style.left = '62%';
    }
  }

  /* interaction prompt */
  if (h.prompt) {
    var label = this._promptLabel(me);
    h.prompt.textContent = label;
    h.prompt.classList.toggle('hide', !label);
  }

  /* team list */
  if (h.team) this._drawTeam(h.team, w);

  /* slayer proximity bar */
  if (h.terrorBar) h.terrorBar.style.opacity = this.terror > 0.02 ? String(0.25 + this.terror * 0.75) : '0';

  if (h.banner) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      h.banner.textContent = this.bannerText;
      h.banner.classList.remove('hide');
      h.banner.style.opacity = String(clamp(this.bannerT, 0, 1));
    } else {
      h.banner.classList.add('hide');
    }
  }
};

Game.prototype._promptLabel = function (me) {
  if (!me || !S.alive(me)) return '';
  if (me.skill) return 'CLICK on the gold zone — GREAT bonus';
  if (me.interactKind === 'repair') return 'Sealing anchor…';
  if (me.interactKind === 'gate') return 'Opening rift…';
  if (me.interactKind === 'rescue') return 'Reviving…';
  if (me.interactKind === 'unhook') return 'Cutting down…';
  if (me.interactKind === 'heal') return 'Healing…';
  if (me.interactKind === 'escape') return 'ESCAPING';
  var w = this.world;
  if (this.localRole === S.ROLES.SLAYER) {
    for (var i = 0; i < w.players.length; i++) {
      var q = w.players[i];
      if (q.role === S.ROLES.SURV && q.state === S.STATE.DOWNED && C.dist(me.x, me.y, q.x, q.y) < 50) return '[F] TAKE THEM';
    }
    if (me.carrying >= 0) return '[F] HOOK  ·  [G] DROP';
    var an = null, bd = 1e9;
    for (var a = 0; a < w.anchors.length; a++) {
      if (w.anchors[a].done) continue;
      var d = C.dist(me.x, me.y, w.anchors[a].x, w.anchors[a].y);
      if (d < bd) { bd = d; an = w.anchors[a]; }
    }
    if (an && bd < S.K.ANCHOR_R + S.K.INTERACT_R) return '[F] SMASH ANCHOR';
    return '';
  }
  var near = null, nbd = 1e9;
  for (var j = 0; j < w.players.length; j++) {
    var m = w.players[j];
    if (m === me || m.role === S.ROLES.SLAYER) continue;
    if (m.state !== S.STATE.DOWNED && m.state !== S.STATE.HOOKED && m.hp >= S.K.SURV_HP) continue;
    var dd = C.dist(me.x, me.y, m.x, m.y);
    if (dd < nbd) { nbd = dd; near = m; }
  }
  if (near && nbd < 60) {
    return '[F] ' + (near.state === S.STATE.HOOKED ? 'CUT DOWN' : (near.state === S.STATE.DOWNED ? 'REVIVE' : 'HEAL')) + ' ' + near.name.toUpperCase();
  }
  var g = null, gbd = 1e9;
  for (var k = 0; k < w.gates.length; k++) {
    var gg = C.dist(me.x, me.y, w.gates[k].x, w.gates[k].y);
    if (gg < gbd) { gbd = gg; g = w.gates[k]; }
  }
  if (g && gbd < S.K.GATE_R + S.K.INTERACT_R) {
    if (g.open) return 'ESCAPING — hold still';
    if (g.powered) return '[F] OPEN RIFT';
    return 'Rift unpowered — seal ' + (S.K.ANCHORS_NEEDED - S.anchorsDone(w)) + ' more anchors';
  }
  var a2 = null, abd = 1e9;
  for (var b = 0; b < w.anchors.length; b++) {
    if (w.anchors[b].done) continue;
    var d2 = C.dist(me.x, me.y, w.anchors[b].x, w.anchors[b].y);
    if (d2 < abd) { abd = d2; a2 = w.anchors[b]; }
  }
  if (a2 && abd < S.K.ANCHOR_R + S.K.INTERACT_R) return '[F] SEAL ANCHOR';
  return '';
};

Game.prototype._drawTeam = function (el, w) {
  /* Rebuild only when the roster signature changes — the HUD is updated every
   * frame and building DOM in a render loop is how games lose their framerate */
  var sig = '';
  for (var i = 0; i < w.players.length; i++) {
    var p = w.players[i];
    sig += p.id + p.state + Math.round(p.hp) + ';';
  }
  if (el._sig === sig) return;
  el._sig = sig;
  el.textContent = '';
  for (var j = 0; j < w.players.length; j++) {
    var q = w.players[j];
    var row = document.createElement('div');
    row.className = 'team-row ' + (q.role === S.ROLES.SLAYER ? 'slayer' : '') +
      (q.id === this.localId ? ' me' : '') + ' ' + q.state;
    var nm = document.createElement('span');
    nm.className = 'team-name';
    nm.textContent = (q.role === S.ROLES.SLAYER ? '☠ ' : '') + q.name + (q.bot ? ' ·' : '');
    var bar = document.createElement('div');
    bar.className = 'team-bar';
    var fill = document.createElement('i');
    fill.style.width = clamp(q.hp / q.maxHp, 0, 1) * 100 + '%';
    bar.appendChild(fill);
    row.appendChild(nm); row.appendChild(bar);
    el.appendChild(row);
  }
};

Game.prototype.updateRoster = function (roster) {
  if (this.hud.roster) {
    this.hud.roster.textContent = '';
    for (var i = 0; i < roster.length; i++) {
      var d = document.createElement('div');
      d.textContent = roster[i].name + ' — ' + roster[i].role + (roster[i].bot ? ' (bot)' : '');
      this.hud.roster.appendChild(d);
    }
  }
};

/* ============================ RESULTS ============================ */
Game.prototype.finish = function () {
  var w = this.world;
  this.setState('results');
  var me = this.localPlayer();
  var survivorsWon = w.winner === 'survivors';
  var localWon = (this.localRole === S.ROLES.SLAYER) ? !survivorsWon : survivorsWon;
  this.results = {
    winner: w.winner, reason: w.winReason || '', localWon: localWon,
    rows: w.players.map(function (p) {
      var g = S.grade(p);
      return { name: p.name, role: p.role, state: p.state, score: g.total, grade: g.grade, bot: p.bot, id: p.id };
    }).sort(function (a, b) { return b.score - a.score; }),
    stats: { escapes: w.stats.escapes, anchors: w.stats.anchorsDone, eliminations: w.stats.eliminations },
    length: Math.round(w.tick / TICK)
  };
  if (A.started) A.matchEnd(localWon);
  this.renderer.doFlash(localWon ? [120, 255, 200] : [255, 40, 60], 0.5);
  this.renderer.shake(16);
  if (this.onState) this.onState('results', this);
};

Game.prototype.destroy = function () {
  this.stop();
  root.removeEventListener('keydown', this._onKey);
  root.removeEventListener('keyup', this._onKey);
  root.removeEventListener('mouseup', this._onUp);
  root.removeEventListener('resize', this._onResize);
  this.canvas.removeEventListener('mousemove', this._onMove);
  this.canvas.removeEventListener('mousedown', this._onDown);
  this.canvas.removeEventListener('contextmenu', this._onCtx);
  if (this.session) this.session.close();
};

root.EOTEngine = { Game: Game, InputState: InputState, TICK: TICK, MAX_STEPS: MAX_STEPS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
