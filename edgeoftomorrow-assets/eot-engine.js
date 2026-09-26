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
  this.gamepadMove = null;
  this.gamepadAim = null;
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

/* Poll standard Gamepad API */
InputState.prototype.pollGamepad = function () {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
  var gps = navigator.getGamepads();
  if (!gps) return;
  var gp = null;
  for (var i = 0; i < gps.length; i++) {
    if (gps[i] && gps[i].connected) { gp = gps[i]; break; }
  }
  if (!gp) { this.gamepadMove = null; this.gamepadAim = null; return; }

  /* Left Stick (Move) */
  var lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
  var lm = Math.sqrt(lx * lx + ly * ly);
  if (lm > 0.18) { this.gamepadMove = { x: lx, y: ly }; }
  else { this.gamepadMove = null; }

  /* Right Stick (Aim) */
  var rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
  var rm = Math.sqrt(rx * rx + ry * ry);
  if (rm > 0.25) { this.gamepadAim = Math.atan2(ry, rx); }

  /* Buttons mapping (standard controller) */
  /* B0 = A / Cross (Interact/Use), B1 = B / Circle (Dash), B2 = X / Square (Attack), B3 = Y / Triangle (Ult) */
  /* B4 = LB (Dash), B5 = RB (Ult), B6 = LT (Interact), B7 = RT (Attack) */
  /* B10 = L3 (Sprint), B12 = Dpad Up (Ping) */
  var b = gp.buttons;
  if (b) {
    if (b[7] && b[7].pressed || b[2] && b[2].pressed) this.keys['mouse0'] = true;
    else if (!this.pointerDown) this.keys['mouse0'] = false;

    if (b[6] && b[6].pressed || b[0] && b[0].pressed) this.keys['f'] = true;
    else this.keys['f'] = false;

    if (b[4] && b[4].pressed || b[1] && b[1].pressed) this.markPress(' ');
    if (b[3] && b[3].pressed) this.markPress('r');          /* Y / Triangle: ultimate */
    if (b[5] && b[5].pressed) this.markPress('q');          /* RB: Chrono-Rewind */
    if (b[10] && b[10].pressed) this.keys['shift'] = true;
    if (b[12] && b[12].pressed) this.markPress('t');
  }
};

/* Build the compact input struct the sim/netcode consume. */
InputState.prototype.toInput = function () {
  this.pollGamepad();
  var i = S.makeInput();
  /* WASD/arrows -> unit-ish move vector */
  var mx = this.moveX, my = this.moveY;
  if (this.down('w') || this.down('ArrowUp')) my -= 1;
  if (this.down('s') || this.down('ArrowDown')) my += 1;
  if (this.down('a') || this.down('ArrowLeft')) mx -= 1;
  if (this.down('d') || this.down('ArrowRight')) mx += 1;
  /* touch overrides stick */
  if (this.touchMove) { mx = this.touchMove.x; my = this.touchMove.y; }
  else if (this.gamepadMove) { mx = this.gamepadMove.x; my = this.gamepadMove.y; }

  var ml = Math.sqrt(mx * mx + my * my);
  if (ml > 1) { mx /= ml; my /= ml; }
  if (ml < 0.12) { mx = 0; my = 0; }
  i.x = mx; i.y = my;
  i.aim = (typeof this.gamepadAim === 'number') ? this.gamepadAim : (this.touchAim ? this.touchAim : this.aim);
  i.sprint = this.down('shift') || this.down('Shift');
  i.crouch = this.down('c') || this.down('control') || this.down('Control');
  i.attack = this.down('mouse0') || this.down('j') || this.down('z');
  i.dash = this.hit(' ') || this.hit('space') || this.down('mouse2') || this.down('k') || this.down('x');
  /* One verb per key. Q = Chrono-Rewind, R = the ultimate (Rift Nova /
   * Awakening), G = use item / drop victim. Space never interacts — it is
   * the dash/vault/skill-check key and must mean exactly one family. */
  i.ult = this.hit('r');
  i.rewind = this.hit('q');
  i.interact = this.down('e') || this.down('f');
  i.item = this.hit('g');
  i.cancel = this.hit('g');
  i.emote = this.hit('t');
  i.overclock = this.down('shift') || this.down('Shift');
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
  this.state = 'menu';      /* menu | lobby | playing | results | practice */
  this.mode = 'solo';       /* solo | host | client | practice */
  this.localId = 1;
  this.localRole = S.ROLES.SURV;
  this.localClass = opts.classId || 'duelist';
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
  this.localClass = opts.classId || (this.localRole === S.ROLES.SLAYER ? S.SLAYER_ARCHETYPES.SOVEREIGN : S.SURV_CLASSES.DUELIST);
  var seed = opts.seed || ('eot-' + Date.now());
  this.world = S.makeWorld({ seed: seed });
  S.buildArena(this.world);

  S.addPlayer(this.world, { id: 1, name: this.playerName, role: this.localRole, classId: this.localClass, bot: false });
  this.localId = 1;
  /* fill remaining survivor slots with bots */
  var survCount = this.localRole === S.ROLES.SLAYER ? 0 : 1;
  var id = 2;
  var survClasses = [S.SURV_CLASSES.MEDIC, S.SURV_CLASSES.ENGINEER, S.SURV_CLASSES.SCOUT, S.SURV_CLASSES.DUELIST];
  while (survCount < 4) {
    S.addPlayer(this.world, {
      id: id, name: AI.nameFor(S.ROLES.SURV, id),
      role: S.ROLES.SURV, classId: survClasses[id % survClasses.length], bot: true
    });
    id++; survCount++;
  }
  /* the slayer: a bot, unless player chose slayer */
  if (this.localRole !== S.ROLES.SLAYER) {
    S.addPlayer(this.world, { id: 9, name: AI.nameFor(S.ROLES.SLAYER, 0), role: S.ROLES.SLAYER, classId: S.SLAYER_ARCHETYPES.SOVEREIGN, bot: true });
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
  this.consumeEvents(this.world.events);
  return this;
};

Game.prototype.startPractice = function (opts) {
  opts = opts || {};
  this.mode = 'practice';
  this.localRole = opts.role || S.ROLES.SURV;
  this.localClass = opts.classId || (this.localRole === S.ROLES.SLAYER ? S.SLAYER_ARCHETYPES.SOVEREIGN : S.SURV_CLASSES.DUELIST);
  this.world = S.makeWorld({ seed: 'practice-mode' });
  S.buildArena(this.world);

  S.addPlayer(this.world, { id: 1, name: this.playerName, role: this.localRole, classId: this.localClass, bot: false });
  this.localId = 1;
  /* Add 1 sparring dummy */
  if (this.localRole === S.ROLES.SLAYER) {
    S.addPlayer(this.world, { id: 2, name: 'DUMMY', role: S.ROLES.SURV, classId: S.SURV_CLASSES.DUELIST, bot: true });
  } else {
    S.addPlayer(this.world, { id: 9, name: 'SPARRING SLAYER', role: S.ROLES.SLAYER, classId: S.SLAYER_ARCHETYPES.SOVEREIGN, bot: true });
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
  this.banner('PRACTICE ARENA — NO STAKES');
  this.consumeEvents(this.world.events);
  return this;
};

/* Host a room other tabs can join over BroadcastChannel */
Game.prototype.startHost = function (opts) {
  opts = opts || {};
  this.mode = 'host';
  this.localRole = opts.role || S.ROLES.SURV;
  this.localClass = opts.classId || (this.localRole === S.ROLES.SLAYER ? S.SLAYER_ARCHETYPES.SOVEREIGN : S.SURV_CLASSES.DUELIST);
  this.roomCode = opts.room || N.makeRoomCode();
  var transport = new N.BroadcastChannelTransport(this.roomCode);
  if (!transport.available) return this.startSolo(opts);

  this.world = S.makeWorld({ seed: 'eot-room-' + this.roomCode });
  S.buildArena(this.world);
  S.addPlayer(this.world, { id: 1, name: this.playerName, role: this.localRole, classId: this.localClass, bot: false });
  this.localId = 1;

  var self = this;
  this.session = new N.Session({
    role: 'host', localId: 1, world: this.world, transport: transport,
    onPeerChange: function (roster) { self.updateRoster(roster); }
  });
  this.backfillBots();
  this.setState('lobby');
  this.banner('ROOM ' + this.roomCode);
  return this;
};

Game.prototype.startClient = function (opts) {
  opts = opts || {};
  this.mode = 'client';
  this.roomCode = opts.room || '';
  this.localClass = opts.classId || S.SURV_CLASSES.DUELIST;
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
  this.session.join(this.playerName, opts.role || S.ROLES.SURV);
  this.setState('lobby');
  return this;
};

Game.prototype.backfillBots = function () {
  var w = this.world;
  var survs = 0, hasSlayer = false;
  for (var i = 0; i < w.players.length; i++) {
    if (w.players[i].role === S.ROLES.SLAYER) hasSlayer = true; else survs++;
  }
  var id = 2;
  while (survs < 4) {
    if (!S.getPlayer(w, id)) {
      S.addPlayer(w, { id: id, name: AI.nameFor(S.ROLES.SURV, id), role: S.ROLES.SURV, bot: true });
      survs++;
    }
    id++;
  }
  if (!hasSlayer) {
    S.addPlayer(w, { id: 9, name: AI.nameFor(S.ROLES.SLAYER, 0), role: S.ROLES.SLAYER, bot: true });
  }
};

Game.prototype.beginMatch = function () {
  if (this.session && this.session.role === 'host') {
    this.backfillBots();
    S.beginMatch(this.world);
    this.session.broadcastLobby('play');
  }
  this.setState('playing');
  if (this.world && this.world.events && this.world.events.length) {
    this.consumeEvents(this.world.events);
  } else {
    this.banner('SEAL THE RIFTS');
  }
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

  /* touch controls */
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
  this.last = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  var self = this;
  var frame = function (nowMs) {
    if (!self.running) return;
    var nowSec = (nowMs || (typeof performance !== 'undefined' ? performance.now() : Date.now())) / 1000;
    var dt = clamp(nowSec - self.last, 0, 0.25);
    self.last = nowSec;
    self.loop(dt);
    self.raf = requestAnimationFrame(frame);
  };
  this.raf = requestAnimationFrame(frame);
};

Game.prototype.stop = function () {
  this.running = false;
  if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
};

Game.prototype.loop = function (frameDt) {
  this.fpsT += frameDt; this.frames++;
  if (this.fpsT >= 0.5) {
    this.fps = Math.round(this.frames / this.fpsT);
    this.frames = 0; this.fpsT = 0;
  }

  /* hitstop freezes the sim tick */
  if (this.hitstop > 0) {
    this.hitstop = Math.max(0, this.hitstop - frameDt);
    this.renderer.update(frameDt, this.localPlayer());
    this.renderer.render(this.world, {
      localId: this.localId, localRole: this.localRole, terror: this.terror
    });
    this.updateHud(frameDt);
    return;
  }

  var effectiveDt = frameDt * (this.slowmo > 0 ? 0.35 : 1);
  if (this.slowmo > 0) this.slowmo = Math.max(0, this.slowmo - frameDt);

  this.acc += effectiveDt;
  var steps = 0;
  while (this.acc >= DT && steps < MAX_STEPS) {
    if (this.state === 'playing') this.tick();
    this.acc -= DT;
    steps++;
  }
  if (this.acc >= DT) this.acc = 0;

  this.update(frameDt);
};

/* Visual frame update */
Game.prototype.update = function (dt) {
  var me = this.localPlayer();
  var drawMe = me;
  if (this.mode === 'client' && this.session) {
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

/* One simulation tick */
Game.prototype.tick = function () {
  var w = this.world;
  var sess = this.session;

  S.prepare(w);

  var inputs;
  if (this.mode === 'client' && sess) {
    var inp = this.input.toInput();
    sess.clientPushInput(inp);
    sess.clientPredict(inp, this.localRole);
    this._updateTerror();
    return;
  }

  inputs = AI.think(w);
  var local = S.getPlayer(w, this.localId);
  if (local && !local.bot && S.alive(local)) {
    inputs[this.localId] = this.input.toInput();
    this._updateAim();
    inputs[this.localId].aim = this.input.aim;
  }

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

  this._updateTerror();

  if (w.phase === S.PHASE.OVER && this.state === 'playing') this.finish();
};

Game.prototype.consumeEvents = function (events) {
  if (!events || !events.length) return;
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    this.renderer.onEvent(e, this.localId);
    if (A.started) A.playEvent(e);
    if (e.t === 'hit') {
      var near = (e.to === this.localId || e.by === this.localId);
      this.hitstop = Math.max(this.hitstop, e.amount >= 40 ? (near ? 0.075 : 0.05) : 0.03);
      if (near) this.slowmo = Math.max(this.slowmo, e.amount >= 60 ? 0.16 : 0);
    } else if (e.t === 'parry') {
      this.hitstop = Math.max(this.hitstop, 0.1);
      this.slowmo = Math.max(this.slowmo, 0.2);
    } else if (e.t === 'ultSurv' || e.t === 'ultSlayer' || e.t === 'nova') {
      this.hitstop = Math.max(this.hitstop, 0.11);
      if (e.by === this.localId || e.to === this.localId) this.slowmo = Math.max(this.slowmo, 0.14);
    } else if (e.t === 'gatesPowered') {
      this.banner('RIFTS POWERED — OPEN A GATE, GET OUT');
      this.hitstop = Math.max(this.hitstop, 0.12);
    } else if (e.t === 'anchorDone') {
      if (e.by === this.localId) this.banner('ANCHOR SEALED');
    } else if (e.t === 'down' || e.t === 'eliminate') {
      this.hitstop = Math.max(this.hitstop, 0.13);
      this.slowmo = Math.max(this.slowmo, 0.28);
    } else if (e.t === 'matchEnd' && e.reason === 'regicide') {
      this.hitstop = Math.max(this.hitstop, 0.2);
      this.slowmo = Math.max(this.slowmo, 0.5);
    } else if (e.t === 'hookStage') {
      this.hitstop = Math.max(this.hitstop, 0.06);
    }
  }
  /* One-shot coaching: the game teaches its verbs by letting them happen. */
  if (!this._coach) this._coach = {};
  for (var j = 0; j < events.length; j++) {
    var ev2 = events[j];
    if (ev2.t === 'skillcheck' && !this._coach.check) {
      this._coach.check = 1;
      this.banner('SKILL CHECK — TAP [CLICK] / [SPACE] ON GOLD');
    } else if (ev2.t === 'matchStart' && !this._coach.start) {
      this._coach.start = 1;
      this.banner(this.localRole === S.ROLES.SLAYER ? 'HUNT THEM ALL DOWN' : 'SEAL THE ANCHORS — THEN ESCAPE');
    } else if (ev2.t === 'down' && ev2.to === this.localId && !this._coach.down) {
      this._coach.down = 1;
      this.banner('DOWNED — TEAMMATES CAN REVIVE YOU');
    } else if (ev2.t === 'hook' && ev2.to === this.localId && !this._coach.hooked) {
      this._coach.hooked = 1;
      this.banner('HOOKED — ' + (S.K.HOOK_STAGES) + ' STAGES UNTIL THE RIFT TAKES YOU');
    }
  }
};

Game.prototype._updateTerror = function () {
  var me = this.localPlayer();
  if (!me || this.localRole === S.ROLES.SLAYER) { this.terror = 0; return; }
  var d = S.distanceToSlayer(this.world, me);
  var target = 1 - clamp(d / S.K.TERROR_R, 0, 1);
  this.terror += (target - this.terror) * 0.08;

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
    (me.state === S.STATE.HOOKED ? ('HOOKED — STAGE ' + Math.max(1, me.hooks || 1) + '/' + S.K.HOOK_STAGES) :
      (me.hp <= me.maxHp * 0.5 ? 'INJURED' : 'HEALTHY'));

  /* item box update */
  if (h.itemBox && me) {
    if (me.item) {
      h.itemBox.classList.remove('hide');
      var itemNames = {
        flare: '⚡ FLASH FLARE',
        serum: '💉 ADRENALINE',
        tool: '🔧 OVERCLOCK TOOL',
        decoy: '👥 CHRONO DECOY'
      };
      if (h.itemName) h.itemName.textContent = itemNames[me.item] || me.item.toUpperCase();
    } else {
      if (h.itemName) h.itemName.textContent = 'NO ITEM (OPEN CRATE)';
    }
  }

  /* rewind / rage timer indicator */
  if (h.rewindStat && me) {
    if (this.localRole === S.ROLES.SLAYER) {
      h.rewindStat.textContent = me.rageT > 0 ? '🔥 BERSERK (' + Math.ceil(me.rageT) + 's)' : ('RAGE: ' + Math.round(me.rage) + '%');
      h.rewindStat.style.color = '#ff2f6d';
    } else {
      h.rewindStat.textContent = me.rewindCd > 0 ? ('REWIND: ' + Math.ceil(me.rewindCd) + 's') : '🌀 REWIND READY [Q]';
      h.rewindStat.style.color = me.rewindCd > 0 ? '#8a82b8' : '#78ffb0';
    }
  }

  /* Skill check: the good band, the gold great band, and the needle all read
   * straight from the sim's windows — the HUD cannot lie about timing. */
  if (h.skill) {
    var on = !!(me && me.skill);
    h.skill.classList.toggle('hide', !on);
    if (on && h.skillNeedle && h.skillZone) {
      h.skillNeedle.style.left = (me.skill.frac * 100) + '%';
      h.skillZone.classList.toggle('great', !!me.skill.inGreat);
      if (h.skillGood) {
        h.skillGood.style.left = (S.K.SKILL_GOOD_LO * 100) + '%';
        h.skillGood.style.width = ((S.K.SKILL_GOOD_HI - S.K.SKILL_GOOD_LO) * 100) + '%';
      }
      var greatW = (me.classId === S.SURV_CLASSES.ENGINEER) ? S.K.SKILL_GREAT_ENGINEER : S.K.SKILL_GREAT;
      h.skillZone.style.left = (S.K.SKILL_GREAT_LO * 100) + '%';
      h.skillZone.style.width = (greatW * 100) + '%';
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
  if (me.skill) return 'TAP [CLICK] / [SPACE] in the gold zone — GREAT bonus';
  if (me.interactKind === 'repair') return me.overclock ? '⚡ OVERCLOCKING ANCHOR (3x SPEED)...' : 'Sealing anchor… [HOLD SHIFT TO OVERCLOCK]';
  if (me.interactKind === 'gate') return 'Opening rift…';
  if (me.interactKind === 'rescue') return 'Reviving…';
  if (me.interactKind === 'unhook') return 'Cutting down…';
  if (me.interactKind === 'heal') return 'Healing…';
  if (me.interactKind === 'escape') return 'ESCAPING';
  if (me.interactKind === 'chest') return 'Searching supply crate…';
  var w = this.world;

  /* Check pallets */
  for (var pi = 0; pi < (w.pallets || []).length; pi++) {
    var plt = w.pallets[pi];
    if (C.dist(me.x, me.y, plt.x, plt.y) < 55) {
      if (plt.palletState === 'up' && me.role === S.ROLES.SURV) return '[E] THROW DOWN PALLET (STUN)';
      if (plt.palletState === 'down') {
        if (me.role === S.ROLES.SLAYER) return '[E] SMASH PALLET';
        return '[SPACE] VAULT PALLET';
      }
    }
  }

  /* Check supply chests */
  if (me.role === S.ROLES.SURV && !me.item) {
    for (var ci = 0; ci < (w.chests || []).length; ci++) {
      var ch = w.chests[ci];
      if (!ch.searched && C.dist(me.x, me.y, ch.x, ch.y) < 45) return '[E] SEARCH SUPPLY CRATE';
    }
  }

  /* Check lockers */
  for (var li = 0; li < (w.lockers || []).length; li++) {
    var lk = w.lockers[li];
    if (C.dist(me.x, me.y, lk.x, lk.y) < 45) {
      if (me.role === S.ROLES.SLAYER) return '[E] SEARCH PHASE POD';
      if (lk.occupant < 0) return '[E] HIDE IN PHASE POD';
    }
  }

  if (me.item) {
    return '[G] USE ' + me.item.toUpperCase();
  }

  if (this.localRole === S.ROLES.SLAYER) {
    for (var i = 0; i < w.players.length; i++) {
      var q = w.players[i];
      if (q.role === S.ROLES.SURV && q.state === S.STATE.DOWNED && C.dist(me.x, me.y, q.x, q.y) < 50) return '[E] TAKE THEM';
    }
    if (me.carrying >= 0) return '[E] HOOK  ·  [G] DROP';
    var an = null, bd = 1e9;
    for (var a = 0; a < w.anchors.length; a++) {
      if (w.anchors[a].done) continue;
      var d = C.dist(me.x, me.y, w.anchors[a].x, w.anchors[a].y);
      if (d < bd) { bd = d; an = w.anchors[a]; }
    }
    if (an && bd < S.K.ANCHOR_R + S.K.INTERACT_R) return '[E] SMASH ANCHOR';
    if (me.classId === S.SLAYER_ARCHETYPES.WEAVER) return '[G] PLACE STASIS TRAP';
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
    return '[E] ' + (near.state === S.STATE.HOOKED ? 'CUT DOWN' : (near.state === S.STATE.DOWNED ? 'REVIVE' : 'HEAL')) + ' ' + near.name.toUpperCase();
  }
  var g = null, gbd = 1e9;
  for (var k = 0; k < w.gates.length; k++) {
    var gg = C.dist(me.x, me.y, w.gates[k].x, w.gates[k].y);
    if (gg < gbd) { gbd = gg; g = w.gates[k]; }
  }
  if (g && gbd < S.K.GATE_R + S.K.INTERACT_R) {
    if (g.open) return 'ESCAPING — hold still';
    if (g.powered) return '[E] OPEN RIFT';
    return 'Rift unpowered — seal ' + (S.K.ANCHORS_NEEDED - S.anchorsDone(w)) + ' more anchors';
  }
  var a2 = null, abd = 1e9;
  for (var b = 0; b < w.anchors.length; b++) {
    if (w.anchors[b].done) continue;
    var d2 = C.dist(me.x, me.y, w.anchors[b].x, w.anchors[b].y);
    if (d2 < abd) { abd = d2; a2 = w.anchors[b]; }
  }
  if (a2 && abd < S.K.ANCHOR_R + S.K.INTERACT_R) return '[E] SEAL ANCHOR';
  return '';
};

Game.prototype._drawTeam = function (el, w) {
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
      return { name: p.name, role: p.role, classId: p.classId, state: p.state, score: g.total, grade: g.grade, bot: p.bot, id: p.id };
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
