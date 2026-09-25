/* EOT Sim — the authoritative simulation for EDGE OF TOMORROW.
 *
 * THE RULE: this file is a pure function of (seed, tick, inputs). It has no
 * DOM, no canvas, no timers and no Math.random(). Every random number comes
 * from a per-tick seeded stream (EOTCore.simRng). Because of that:
 *
 *   - the host can run it and clients can re-run the same tick and agree
 *     (see eot-net.js, worldHash)
 *   - the whole game can be tested headlessly in Node (test/smoke-sim.js)
 *   - replays are just a list of inputs
 *
 * Anything cosmetic (particles, shake, sound) is NOT simulated. The sim emits
 * deterministic *events*; the renderer turns them into spectacle. Keeping the
 * two apart is what lets the netcode stay small.
 *
 * Browser: window.EOTSim   Node: module.exports
 */
(function (root, factory) {
  var api = factory(typeof globalThis !== 'undefined' && globalThis.EOTCore ? globalThis.EOTCore : require('./eot-core.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EOTSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
'use strict';

var clamp = C.clamp, lerp = C.lerp, TAU = C.TAU;

/* ============================ TUNING ============================
 * Every gameplay number lives here and nowhere else, so balancing is a
 * one-file job and the netcode can hash the table to prove peers agree. */
var K = {
  TICK_RATE: 60,
  FIXED: 1 / 60,

  WORLD: { w: 2400, h: 2400 },
  PLAYER_R: 15,

  /* --- movement (units / second) --- */
  SURV_WALK: 168,
  SURV_SPRINT: 274,
  SURV_CROUCH: 96,
  SURV_INJURED_MUL: 0.9,
  SURV_DOWN_SPEED: 46,
  SLAYER_WALK: 212,
  SLAYER_SPRINT: 292,
  SLAYER_STUNNED_MUL: 0.35,
  ACCEL: 14,            // exponential approach rate toward target velocity
  FRICTION: 16,

  /* --- stamina --- */
  STAM_MAX: 100,
  STAM_SPRINT_DRAIN: 21,
  STAM_REGEN: 17,
  STAM_REGEN_DELAY: 0.75,
  STAM_DASH: 26,

  /* --- dash: the survivor's burst-movement answer to a faster slayer --- */
  DASH_SPEED: 640,
  DASH_TIME: 0.22,
  DASH_CD: 1.1,
  DASH_IFRAMES: 0.18,

  /* --- survivor combat --- */
  SURV_HP: 100,
  SURV_ATK_WINDUP: 0.15,
  SURV_ATK_ACTIVE: 0.11,
  SURV_ATK_RECOVER: 0.22,
  SURV_ATK_RANGE: 52,
  SURV_ATK_ARC: 105,
  SURV_ATK_DMG: 10,
  SURV_ATK_STUN: 0.34,
  SURV_ATK_CD: 0.5,

  /* --- slayer combat --- */
  SLAYER_HP: 380,
  SLAYER_ATK_WINDUP: 0.28,
  SLAYER_ATK_ACTIVE: 0.13,
  SLAYER_ATK_RECOVER: 0.5,
  SLAYER_ATK_RANGE: 74,
  SLAYER_ATK_ARC: 116,
  SLAYER_ATK_DMG: 50,   // two hits: healthy -> injured -> downed
  SLAYER_ATK_CD: 0.75,

  /* --- ultimates --- */
  ULT_CHARGE_MAX: 100,
  SURV_ULT_R: 150,
  SURV_ULT_DMG: 55,
  SURV_ULT_KNOCK: 460,
  SURV_ULT_TIME: 0.5,
  SLAYER_ULT_R: 96,
  SLAYER_ULT_DMG: 72,
  SLAYER_ULT_DASH: 760,
  SLAYER_ULT_TIME: 0.42,
  SLAYER_ULT_CD: 9,

  /* --- objectives --- */
  ANCHORS: 7,
  ANCHORS_NEEDED: 4,
  ANCHOR_RATE_1: 1 / 17,
  ANCHOR_RATE_2: 1 / 12,
  ANCHOR_RATE_3: 1 / 9,
  ANCHOR_REGRESS: 0.24,
  ANCHOR_SMASH_TIME: 1.15,
  ANCHOR_R: 40,
  SKILL_CHECK_EVERY: 0.34,
  SKILL_CHECK_CHANCE: 0.5,
  SKILL_WINDOW: 0.42,
  SKILL_GREAT: 0.1,
  SKILL_MISS_REGRESS: 0.07,
  GATES: 2,
  GATE_R: 52,
  GATE_CHANNEL: 3.0,
  GATE_ESCAPE_TIME: 0.9,

  /* --- downed / hooked --- */
  BLEEDOUT: 30,
  PICKUP_TIME: 1.35,
  HOOK_TIME: 22,
  HOOKS_TO_DIE: 2,
  RESCUE_TIME: 1.9,
  HEAL_TIME: 4.2,
  HEAL_DELAY: 3.5,        // no passive regen for 5s after taking a hit
  HEAL_SELF_RATE: 0.9,
  INTERACT_R: 46,

  /* --- tracking / pressure --- */
  ECHO_TIME: 3.6,
  ECHO_EVERY: 0.22,
  TERROR_R: 430,
  MATCH_TIME: 240,

  HOOK_STAGES: 3
};

var ROLES = { SURV: 'survivor', SLAYER: 'slayer' };
var STATE = {
  ALIVE: 'alive', DOWNED: 'downed', CARRIED: 'carried',
  HOOKED: 'hooked', DEAD: 'dead', ESCAPED: 'escaped'
};
var PHASE = { LOBBY: 'lobby', PLAY: 'play', OVER: 'over' };

/* ============================ INPUT ============================
 * Compact by design: the wire format in eot-net.js is 4 bytes per player
 * per tick. Move axes are quantised to -8..8, everything else is a bit. */
var F = {
  SPRINT: 1, CROUCH: 2, ATTACK: 4, DASH: 8, ULT: 16,
  INTERACT: 32, CANCEL: 64, EMOTE: 128
};

function makeInput() {
  return { x: 0, y: 0, aim: 0, sprint: false, crouch: false, attack: false, dash: false, ult: false, interact: false, cancel: false, emote: false };
}
function inputFlags(inp) {
  var f = 0;
  if (inp.sprint) f |= F.SPRINT;
  if (inp.crouch) f |= F.CROUCH;
  if (inp.attack) f |= F.ATTACK;
  if (inp.dash) f |= F.DASH;
  if (inp.ult) f |= F.ULT;
  if (inp.interact) f |= F.INTERACT;
  if (inp.cancel) f |= F.CANCEL;
  if (inp.emote) f |= F.EMOTE;
  return f & 0xFF;
}
function inputFromFlags(x, y, aim, f) {
  var i = makeInput();
  i.x = x; i.y = y; i.aim = aim;
  i.sprint = !!(f & F.SPRINT); i.crouch = !!(f & F.CROUCH);
  i.attack = !!(f & F.ATTACK); i.dash = !!(f & F.DASH);
  i.ult = !!(f & F.ULT); i.interact = !!(f & F.INTERACT);
  i.cancel = !!(f & F.CANCEL); i.emote = !!(f & F.EMOTE);
  return i;
}

/* ============================ WORLD ============================ */
function makeWorld(opts) {
  opts = opts || {};
  var seed = typeof opts.seed === 'number' ? opts.seed >>> 0 : C.hashStr(String(opts.seed || 'edge-of-tomorrow'));
  return {
    seed: seed,
    tick: 0,
    phase: PHASE.LOBBY,
    time: K.MATCH_TIME,
    players: [],
    byId: new Map(),
    nextId: 1,
    anchors: [],
    gates: [],
    props: [],
    hooks: [],
    echoes: [],
    events: [],
    alerts: [],          // slayer-visible pings from loud mistakes
    winner: null,
    endedAt: 0,
    stats: { escapes: 0, eliminations: 0, anchorsDone: 0, chases: 0 }
  };
}

/* ---------------------- procedural arena ----------------------
 * Seeded layout: border walls, a scatter of cover blocks, a few vaults
 * (survivors slip through, the slayer has to go round) and the objective
 * sites. Regenerating with the same seed yields the same map, which is what
 * lets a joining client build the level locally from the seed alone. */
function buildArena(world, opts) {
  opts = opts || {};
  var rnd = C.mulberry32(C.mix32(world.seed, 0xB0B));
  var W = K.WORLD.w, H = K.WORLD.h;
  world.props.length = 0;
  world.anchors.length = 0;
  world.gates.length = 0;
  world.hooks.length = 0;

  var T = 60;
  world.props.push({ x: 0, y: 0, w: W, h: T, type: 'wall' });
  world.props.push({ x: 0, y: H - T, w: W, h: T, type: 'wall' });
  world.props.push({ x: 0, y: 0, w: T, h: H, type: 'wall' });
  world.props.push({ x: W - T, y: 0, w: T, h: H, type: 'wall' });

  /* Interior structures on a jittered grid — enough cover for LoS jukes
   * without turning the map into a maze. */
  var cells = 5, step = (W - T * 2) / cells;
  for (var cx = 0; cx < cells; cx++) {
    for (var cy = 0; cy < cells; cy++) {
      if ((cx + cy) % 2 === 0) continue;
      var bx = T + cx * step + step * (0.2 + rnd() * 0.2);
      var by = T + cy * step + step * (0.2 + rnd() * 0.2);
      var bw = step * (0.28 + rnd() * 0.22);
      var bh = step * (0.28 + rnd() * 0.22);
      var type = rnd() < 0.3 ? 'vault' : (rnd() < 0.35 ? 'pillar' : 'crate');
      world.props.push({ x: bx, y: by, w: bw, h: bh, type: type });
    }
  }
  /* A couple of long walls to create loops (loops are what make chases). */
  world.props.push({ x: W * 0.5 - 20, y: H * 0.16, w: 40, h: H * 0.24, type: 'wall' });
  world.props.push({ x: W * 0.16, y: H * 0.6, w: W * 0.24, h: 40, type: 'wall' });

  /* Anchors: spread out so survivors are forced to split up — isolation is
   * where the pressure comes from. */
  var spots = [], guard = 0;
  while (spots.length < K.ANCHORS && guard++ < 4000) {
    var ax = T + 160 + rnd() * (W - T * 2 - 320);
    var ay = T + 160 + rnd() * (H - T * 2 - 320);
    var ok = true;
    for (var s = 0; s < spots.length; s++) {
      if (C.dist(ax, ay, spots[s].x, spots[s].y) < 460) { ok = false; break; }
    }
    if (ok && !blocked(world, ax, ay, K.ANCHOR_R + 26)) spots.push({ x: ax, y: ay });
  }
  for (var i = 0; i < spots.length; i++) {
    world.anchors.push({
      id: i, x: spots[i].x, y: spots[i].y, r: K.ANCHOR_R,
      progress: 0, done: false, smash: 0, smashing: 0, marked: 0,
      workers: [], lastSkill: 0
    });
  }

  /* Gates on opposite edges so the team can never turtle in one corner. */
  for (var g = 0; g < K.GATES; g++) {
    var gy = H * (g === 0 ? 0.22 : 0.78);
    world.gates.push({
      id: g, x: W - T - 34, y: gy, r: K.GATE_R,
      powered: false, progress: 0, open: false, channeller: -1
    });
  }

  /* Hooks near the middle-ish, spread so camping one is punished. */
  var hSpots = [
    { x: W * 0.3, y: H * 0.3 }, { x: W * 0.7, y: H * 0.3 },
    { x: W * 0.3, y: H * 0.7 }, { x: W * 0.7, y: H * 0.7 },
    { x: W * 0.5, y: H * 0.5 }
  ];
  for (var h = 0; h < hSpots.length; h++) {
    world.hooks.push({ id: h, x: hSpots[h].x, y: hSpots[h].y, r: 26, occupant: -1 });
  }
  return world;
}

function blocked(world, x, y, r) {
  for (var i = 0; i < world.props.length; i++) {
    var p = world.props[i];
    if (p.type === 'vault') continue;
    if (C.circleBox(x, y, r, p.x, p.y, p.w, p.h)) return true;
  }
  return false;
}

/* ============================ PLAYERS ============================ */
function addPlayer(world, o) {
  o = o || {};
  var id = (typeof o.id === 'number') ? o.id : world.nextId++;
  if (id >= world.nextId) world.nextId = id + 1;
  var role = o.role === ROLES.SLAYER ? ROLES.SLAYER : ROLES.SURV;
  var spawn = spawnPoint(world, role, id);
  var p = {
    id: id,
    name: String(o.name || ('Player ' + id)).slice(0, 18),
    role: role,
    x: spawn.x, y: spawn.y, z: 0,
    vx: 0, vy: 0, facing: spawn.ang,
    hp: role === ROLES.SLAYER ? K.SLAYER_HP : K.SURV_HP,
    maxHp: role === ROLES.SLAYER ? K.SLAYER_HP : K.SURV_HP,
    state: STATE.ALIVE,
    stamina: K.STAM_MAX, stamDelay: 0, healDelay: 0,
    atkCd: 0, atkT: 0, atkPhase: null, atkHitDone: false,
    dashT: 0, dashCd: 0, dashAng: 0, iframes: 0,
    stun: 0, slow: 0, invuln: 1.2,
    ult: role === ROLES.SLAYER ? 35 : 0, ultT: 0, ultCd: 0, ultAng: 0,
    bleed: 0, hooks: 0, hookT: 0, hookId: -1, carrier: -1, carryT: 0,
    carrying: -1,
    interactId: -1, interactT: 0, interactKind: null,
    skill: null,                 // active skill-check prompt
    echoT: 0, chaseT: 0, inChase: false,
    score: { obj: 0, chase: 0, stun: 0, heal: 0, dmg: 0, escape: 0 },
    bot: !!o.bot, aim: spawn.ang,
    flash: 0, hitFlash: 0
  };
  world.players.push(p);
  world.byId.set(p.id, p);
  return p;
}

function spawnPoint(world, role, id) {
  var rnd = C.mulberry32(C.mix32(world.seed, 0x5EED ^ ((role === ROLES.SLAYER ? 7 : 3) * 977 + id * 31)));
  var W = K.WORLD.w, H = K.WORLD.h, x, y, guard = 0;
  if (role === ROLES.SLAYER) {
    do { x = W * 0.5 + (rnd() - 0.5) * 300; y = H * 0.5 + (rnd() - 0.5) * 300; }
    while (blocked(world, x, y, 40) && guard++ < 200);
  } else {
    /* Survivors spawn on the outer ring — far from the centre, far from
     * each other, so the first 20 seconds are a scramble. */
    var n = 0;
    for (var i = 0; i < world.players.length; i++) if (world.players[i].role === ROLES.SURV) n++;
    var a = (n / 4) * TAU + rnd() * 0.7;
    var rad = Math.min(W, H) * 0.36;
    do {
      x = W * 0.5 + Math.cos(a) * rad + (rnd() - 0.5) * 160;
      y = H * 0.5 + Math.sin(a) * rad + (rnd() - 0.5) * 160;
    } while ((blocked(world, x, y, 40) || x < 120 || y < 120 || x > W - 120 || y > H - 120) && guard++ < 300);
  }
  return { x: x, y: y, ang: rnd() * TAU };
}

function alive(p) { return p.state === STATE.ALIVE || p.state === STATE.DOWNED; }
function acting(p) { return p.state === STATE.ALIVE; }

/* ============================ EVENTS ============================
 * Deterministic gameplay events. The renderer/audio layers listen; the sim
 * itself never draws or beeps. Because they are derived from the sim they
 * replay identically on every peer. */
function ev(world, e) {
  e.tick = world.tick;
  world.events.push(e);
  if (world.events.length > 256) world.events.shift();
  return e;
}
function alert(world, x, y, strength, kind) {
  world.alerts.push({ x: x, y: y, strength: strength, kind: kind || 'noise', t: 6 });
  if (world.alerts.length > 24) world.alerts.shift();
}

/* ============================ MOVEMENT ============================ */
function moveAndCollide(world, p, dt) {
  var nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
  var r = K.PLAYER_R * (p.state === STATE.DOWNED ? 0.7 : 1);
  for (var i = 0; i < world.props.length; i++) {
    var pr = world.props[i];
    /* Vaults are passable to survivors at speed — that asymmetry is the
     * whole chase: the slayer must break the loop or lose it. */
    if (pr.type === 'vault' && p.role === ROLES.SLAYER) { /* solid */ }
    else if (pr.type === 'vault') {
      if (p.sprintingNow || p.dashT > 0) continue;
    }
    var fix = C.resolveCircleBox(nx, ny, r, pr.x, pr.y, pr.w, pr.h);
    if (fix) { nx = fix.x; ny = fix.y; }
  }
  /* Soft body separation so players do not stack into one pixel. */
  for (var j = 0; j < world.players.length; j++) {
    var q = world.players[j];
    if (q === p || !alive(q)) continue;
    var d2 = C.dist2(nx, ny, q.x, q.y), min = r * 1.7;
    if (d2 < min * min && d2 > 1e-4) {
      var d = Math.sqrt(d2), push = (min - d) * 0.5;
      nx += ((nx - q.x) / d) * push; ny += ((ny - q.y) / d) * push;
    }
  }
  p.x = clamp(nx, 12, K.WORLD.w - 12);
  p.y = clamp(ny, 12, K.WORLD.h - 12);
}

/* ============================ COMBAT ============================ */
function startAttack(world, p) {
  if (p.atkCd > 0 || p.atkPhase || p.ultT > 0 || p.stun > 0) return false;
  var slayer = p.role === ROLES.SLAYER;
  p.atkPhase = 'windup';
  p.atkT = slayer ? K.SLAYER_ATK_WINDUP : K.SURV_ATK_WINDUP;
  p.atkHitDone = false;
  ev(world, { t: 'swing', by: p.id, role: p.role, x: p.x, y: p.y, ang: p.aim, heavy: slayer });
  return true;
}

function startUlt(world, p) {
  if (p.ult < K.ULT_CHARGE_MAX || p.ultT > 0 || p.ultCd > 0 || !acting(p)) return false;
  p.ult = 0;
  p.ultT = p.role === ROLES.SLAYER ? K.SLAYER_ULT_TIME : K.SURV_ULT_TIME;
  p.ultAng = p.aim;
  p.atkPhase = null;
  if (p.role === ROLES.SLAYER) p.ultCd = K.SLAYER_ULT_CD;
  ev(world, { t: 'ult', by: p.id, role: p.role, x: p.x, y: p.y, ang: p.aim });
  return true;
}

function resolveAttackHit(world, p) {
  var slayer = p.role === ROLES.SLAYER;
  var range = slayer ? K.SLAYER_ATK_RANGE : K.SURV_ATK_RANGE;
  var arc = (slayer ? K.SLAYER_ATK_ARC : K.SURV_ATK_ARC) * Math.PI / 180;
  var dmg = slayer ? K.SLAYER_ATK_DMG : K.SURV_ATK_DMG;
  var hitAny = false;
  for (var i = 0; i < world.players.length; i++) {
    var q = world.players[i];
    if (q === p || !alive(q)) continue;
    if ((p.role === ROLES.SLAYER) !== (q.role === ROLES.SLAYER)) { /* hostile */ }
    else continue;
    if (q.invuln > 0 || q.iframes > 0) continue;
    var d = C.dist(p.x, p.y, q.x, q.y);
    if (d > range + K.PLAYER_R) continue;
    if (Math.abs(C.angDiff(p.aim, Math.atan2(q.y - p.y, q.x - p.x))) > arc * 0.5) continue;
    damage(world, p, q, dmg, slayer ? 260 : 190, 'attack');
    hitAny = true;
  }
  ev(world, { t: 'slash', by: p.id, role: p.role, x: p.x, y: p.y, ang: p.aim, range: range, arc: arc, hit: hitAny });
  if (!hitAny && slayer) ev(world, { t: 'whiff', by: p.id, x: p.x, y: p.y, ang: p.aim });
}

function resolveUltHit(world, p) {
  var slayer = p.role === ROLES.SLAYER;
  var r = slayer ? K.SLAYER_ULT_R : K.SURV_ULT_R;
  var dmg = slayer ? K.SLAYER_ULT_DMG : K.SURV_ULT_DMG;
  for (var i = 0; i < world.players.length; i++) {
    var q = world.players[i];
    if (q === p || !alive(q)) continue;
    if ((p.role === ROLES.SLAYER) === (q.role === ROLES.SLAYER)) continue;
    if (q.invuln > 0 || q.iframes > 0) continue;
    var d = C.dist(p.x, p.y, q.x, q.y);
    if (d > r + K.PLAYER_R) continue;
    damage(world, p, q, dmg, K.SURV_ULT_KNOCK, 'ult');
  }
  ev(world, { t: 'nova', by: p.id, role: p.role, x: p.x, y: p.y, r: r });
}

function damage(world, src, tgt, amount, knock, kind) {
  if (tgt.state === STATE.DOWNED || tgt.state === STATE.HOOKED) return;
  tgt.hp -= amount;
  tgt.hitFlash = 0.16;
  tgt.invuln = Math.max(tgt.invuln, 0.18);
  /* Damage suspends passive regen. Without this a survivor who has been
   * ticking their self-heal back up survives the second hit on a fraction of
   * a point, and the slayer's core promise — two hits, they go down — starts
   * failing at random. It also makes pressure mean something. */
  tgt.healDelay = K.HEAL_DELAY;
  if (src) {
    src.score.dmg += amount;
    var gain = amount * (src.role === ROLES.SLAYER ? 0.55 : 1.5);
    src.ult = clamp(src.ult + gain, 0, K.ULT_CHARGE_MAX);
    var a = Math.atan2(tgt.y - src.y, tgt.x - src.x);
    tgt.vx += Math.cos(a) * knock; tgt.vy += Math.sin(a) * knock;
  }
  ev(world, { t: 'hit', by: src ? src.id : -1, to: tgt.id, x: tgt.x, y: tgt.y, amount: amount, kind: kind });

  /* Epsilon, not `<= 0`: hp is accumulated float arithmetic, so an exact
   * two-hit kill lands on values like 1e-14 and must still count as down. */
  if (tgt.hp <= 1e-6) {
    tgt.hp = 0;
    if (tgt.role === ROLES.SLAYER) {
      /* REGICIDE — the survivors' high-octane alternate win condition. */
      ev(world, { t: 'core', x: tgt.x, y: tgt.y });
      endMatch(world, 'survivors', 'regicide');
      return;
    }
    tgt.state = STATE.DOWNED;
    tgt.bleed = K.BLEEDOUT;
    tgt.vx = 0; tgt.vy = 0;
    tgt.interactId = -1; tgt.interactT = 0; tgt.skill = null;
    ev(world, { t: 'down', by: src ? src.id : -1, to: tgt.id, x: tgt.x, y: tgt.y });
    if (src && src.role === ROLES.SLAYER) { src.score.chase += 120; world.stats.chases++; }
  }
}

/* ============================ OBJECTIVES ============================ */
function nearestAnchor(world, p) {
  var best = null, bd = Infinity, reach = K.ANCHOR_R + K.INTERACT_R;
  for (var i = 0; i < world.anchors.length; i++) {
    var a = world.anchors[i];
    if (a.done) continue;
    var d = C.dist(p.x, p.y, a.x, a.y);
    if (d < bd) { bd = d; best = a; }
  }
  return bd <= reach ? best : null;
}
function nearestGate(world, p) {
  var best = null, bd = Infinity;
  for (var i = 0; i < world.gates.length; i++) {
    var g = world.gates[i];
    var d = C.dist(p.x, p.y, g.x, g.y);
    if (d < bd) { bd = d; best = g; }
  }
  return bd <= K.GATE_R + K.INTERACT_R ? best : null;
}
function anchorsDone(world) {
  var n = 0;
  for (var i = 0; i < world.anchors.length; i++) if (world.anchors[i].done) n++;
  return n;
}

function trySkillCheck(world, p, a) {
  if (p.skill) return;
  p.skill = { anchor: a.id, t: 0, ttl: K.SKILL_WINDOW, great: K.SKILL_GREAT, resolved: false };
  ev(world, { t: 'skillcheck', by: p.id, x: p.x, y: p.y });
}
function resolveSkill(world, p, great) {
  if (!p.skill) return;
  var a = world.anchors[p.skill.anchor];
  p.skill.resolved = true;
  if (great) {
    a.progress = clamp(a.progress + 0.04, 0, 1);
    p.ult = clamp(p.ult + 9, 0, K.ULT_CHARGE_MAX);
    p.score.obj += 25;
    ev(world, { t: 'great', by: p.id, x: p.x, y: p.y });
  } else {
    p.score.obj += 8;
    ev(world, { t: 'good', by: p.id, x: p.x, y: p.y });
  }
  p.skill = null;
  if (a) a.lastSkill = 0;
}
function failSkill(world, p) {
  if (!p.skill) return;
  var a = world.anchors[p.skill.anchor];
  if (a) {
    a.progress = clamp(a.progress - K.SKILL_MISS_REGRESS, 0, 1);
    a.marked = 4;
  }
  p.skill = null;
  alert(world, p.x, p.y, 1, 'spark');
  ev(world, { t: 'fail', by: p.id, x: p.x, y: p.y });
}

/* ============================ MAIN STEP ============================ */
/* Per-tick seeded stream the AI draws from. The engine calls prepare()
 * before the bots think so a bot decision belongs to the tick it affects;
 * step() then reuses the same stream instead of replacing it. */
function prepare(world) {
  if (!world.rndAi || world.rndAiTick !== world.tick) {
    world.rndAi = C.simRng(world.seed, world.tick, 2);
    world.rndAiTick = world.tick;
  }
  return world.rndAi;
}

function step(world, inputs) {
  world.events.length = 0;
  if (world.phase === PHASE.OVER) { world.tick++; return world.events; }

  var dt = K.FIXED;
  var rndSkill = C.simRng(world.seed, world.tick, 1);
  prepare(world);

  if (world.phase === PHASE.PLAY) {
    world.time -= dt;
    if (world.time <= 0) { world.time = 0; endMatch(world, 'slayer', 'clock'); }
  }

  var slayer = null;
  for (var i = 0; i < world.players.length; i++) if (world.players[i].role === ROLES.SLAYER) slayer = world.players[i];

  /* ---- per player ---- */
  for (var pi = 0; pi < world.players.length; pi++) {
    var p = world.players[pi];
    var inp = (inputs && inputs[p.id]) || makeInput();
    p.sprintingNow = false;
    stepPlayer(world, p, inp, dt, rndSkill, slayer);
  }

  /* ---- anchors ---- */
  updateAnchors(world, dt, rndSkill);
  /* ---- gates ---- */
  updateGates(world, dt);
  /* ---- echoes / alerts ---- */
  for (var ei = world.echoes.length - 1; ei >= 0; ei--) {
    world.echoes[ei].t -= dt;
    if (world.echoes[ei].t <= 0) world.echoes.splice(ei, 1);
  }
  for (var ai = world.alerts.length - 1; ai >= 0; ai--) {
    world.alerts[ai].t -= dt;
    if (world.alerts[ai].t <= 0) world.alerts.splice(ai, 1);
  }

  /* Safety net: end conditions are also checked at the moment they happen,
   * but re-checking once per tick means no state change can slip through. */
  checkEnd(world);

  world.tick++;
  return world.events;
}

function stepPlayer(world, p, inp, dt, rndSkill, slayer) {
  p.flash = Math.max(0, p.flash - dt);
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.iframes = Math.max(0, p.iframes - dt);
  p.stun = Math.max(0, p.stun - dt);
  p.slow = Math.max(0, p.slow - dt);
  p.ultCd = Math.max(0, p.ultCd - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.echoT -= dt;
  p.chaseT = Math.max(0, p.chaseT - dt);

  /* ---------------- downed / hooked / carried ---------------- */
  if (p.state === STATE.DOWNED) return stepDowned(world, p, inp, dt, slayer);
  if (p.state === STATE.HOOKED) return stepHooked(world, p, dt);
  if (p.state === STATE.CARRIED) return stepCarried(world, p, dt);
  if (p.state === STATE.DEAD || p.state === STATE.ESCAPED) return;

  var isSlayer = p.role === ROLES.SLAYER;

  /* ---------------- facing ---------------- */
  p.aim = inp.aim;
  var wantAng = inp.aim;
  if (isFinite(wantAng)) p.facing = C.angLerp(p.facing, wantAng, 0.55);

  /* ---------------- stamina ---------------- */
  var wantSprint = !!inp.sprint && (inp.x !== 0 || inp.y !== 0) && p.stamina > 1 && p.stun <= 0;
  if (wantSprint) {
    p.stamina = clamp(p.stamina - K.STAM_SPRINT_DRAIN * dt, 0, K.STAM_MAX);
    p.stamDelay = K.STAM_REGEN_DELAY;
    p.sprintingNow = true;
  } else {
    p.stamDelay -= dt;
    if (p.stamDelay <= 0) p.stamina = clamp(p.stamina + K.STAM_REGEN * dt, 0, K.STAM_MAX);
  }

  /* ---------------- dash ---------------- */
  if (inp.dash && p.dashCd <= 0 && p.dashT <= 0 && p.stamina >= K.STAM_DASH && p.stun <= 0 && !isSlayer) {
    p.dashT = K.DASH_TIME;
    p.dashCd = K.DASH_CD;
    p.dashAng = (inp.x || inp.y) ? Math.atan2(inp.y, inp.x) : p.facing;
    p.stamina = clamp(p.stamina - K.STAM_DASH, 0, K.STAM_MAX);
    p.iframes = K.DASH_IFRAMES;
    p.stamDelay = K.STAM_REGEN_DELAY;
    ev(world, { t: 'dash', by: p.id, x: p.x, y: p.y, ang: p.dashAng });
  }
  if (p.dashT > 0) {
    p.dashT -= dt;
    var ds = K.DASH_SPEED * (0.45 + 0.55 * (p.dashT / K.DASH_TIME));
    p.vx = Math.cos(p.dashAng) * ds; p.vy = Math.sin(p.dashAng) * ds;
    moveAndCollide(world, p, dt);
    return;
  }

  /* ---------------- movement ---------------- */
  var base = isSlayer ? K.SLAYER_WALK : K.SURV_WALK;
  if (isSlayer && wantSprint) base = K.SLAYER_SPRINT;
  else if (!isSlayer && wantSprint) base = K.SURV_SPRINT;
  if (!isSlayer && inp.crouch) base = K.SURV_CROUCH;
  if (!isSlayer && p.hp <= K.SURV_HP * 0.5) base *= K.SURV_INJURED_MUL;
  if (p.stun > 0) base *= K.SLAYER_STUNNED_MUL;
  if (p.slow > 0) base *= 0.55;
  if (p.atkPhase) base *= isSlayer ? 0.35 : 0.55;

  var mx = inp.x, my = inp.y;
  var ml = Math.sqrt(mx * mx + my * my);
  if (ml > 1) { mx /= ml; my /= ml; }
  var tvx = mx * base, tvy = my * base;
  var rate = (ml > 0.05 ? K.ACCEL : K.FRICTION);
  var k = 1 - Math.exp(-rate * dt);
  p.vx += (tvx - p.vx) * k;
  p.vy += (tvy - p.vy) * k;
  if (Math.abs(p.vx) < 1) p.vx = 0;
  if (Math.abs(p.vy) < 1) p.vy = 0;
  moveAndCollide(world, p, dt);

  /* ---------------- echo trail (survivor tracking) ---------------- */
  if (!isSlayer && (p.sprintingNow || p.dashT > 0) && p.echoT <= 0) {
    p.echoT = K.ECHO_EVERY;
    world.echoes.push({ x: p.x, y: p.y, t: K.ECHO_TIME, by: p.id });
    if (world.echoes.length > 90) world.echoes.shift();
  }

  /* ---------------- chase tracking ---------------- */
  updateChase(world, p, slayer, dt);

  /* ---------------- attack ---------------- */
  if (p.atkPhase) {
    p.atkT -= dt;
    if (p.atkT <= 0) {
      if (p.atkPhase === 'windup') {
        p.atkPhase = 'active';
        p.atkT = isSlayer ? K.SLAYER_ATK_ACTIVE : K.SURV_ATK_ACTIVE;
      } else if (p.atkPhase === 'active') {
        if (!p.atkHitDone) { resolveAttackHit(world, p); p.atkHitDone = true; }
        p.atkPhase = 'recover';
        p.atkT = isSlayer ? K.SLAYER_ATK_RECOVER : K.SURV_ATK_RECOVER;
      } else {
        p.atkPhase = null;
        p.atkCd = isSlayer ? K.SLAYER_ATK_CD : K.SURV_ATK_CD;
      }
    }
  } else if (inp.attack && p.atkCd <= 0) {
    startAttack(world, p);
  } else {
    p.atkCd = Math.max(0, p.atkCd - dt);
  }

  /* ---------------- ultimate ---------------- */
  if (p.ultT > 0) {
    p.ultT -= dt;
    if (isSlayer) {
      p.vx = Math.cos(p.ultAng) * K.SLAYER_ULT_DASH;
      p.vy = Math.sin(p.ultAng) * K.SLAYER_ULT_DASH;
      moveAndCollide(world, p, dt);
      if (!p.atkHitDone) { resolveUltHit(world, p); p.atkHitDone = true; }
    } else if (p.ultT <= K.SURV_ULT_TIME * 0.5 && !p.atkHitDone) {
      resolveUltHit(world, p); p.atkHitDone = true;
    }
    if (p.ultT <= 0) { p.ultT = 0; p.atkHitDone = false; }
  } else if (inp.ult) {
    p.atkHitDone = false;
    startUlt(world, p);
  }

  /* ---------------- interactions ---------------- */
  stepInteract(world, p, inp, dt, rndSkill, isSlayer);
}

/* ---- chase state: short and decisive, per the DBD-design research ---- */
function updateChase(world, p, slayer, dt) {
  if (!slayer || p === slayer || slayer.state === STATE.DEAD) return;
  var d = C.dist(p.x, p.y, slayer.x, slayer.y);
  var near = d < 330;
  if (near && !p.inChase) {
    p.inChase = true;
    ev(world, { t: 'chaseStart', by: p.id, x: p.x, y: p.y });
  } else if (!near && p.inChase && d > 520) {
    p.inChase = false;
    p.chaseT = 6;
    ev(world, { t: 'chaseEnd', by: p.id, x: p.x, y: p.y });
  }
  if (p.inChase) p.score.chase += dt * 9;
}

function stepInteract(world, p, inp, dt, rndSkill, isSlayer) {
  /* ---- carried victim handling for the slayer ---- */
  if (isSlayer) {
    if (p.carrying >= 0) return stepCarry(world, p, inp, dt);
    /* pick up a downed survivor */
    if (inp.interact) {
      for (var i = 0; i < world.players.length; i++) {
        var q = world.players[i];
        if (q.role === ROLES.SLAYER || q.state !== STATE.DOWNED) continue;
        if (C.dist(p.x, p.y, q.x, q.y) <= K.PLAYER_R + 30) {
          q.state = STATE.CARRIED; q.carrier = p.id; q.carryT = 0;
          p.carrying = q.id;
          ev(world, { t: 'pickup', by: p.id, to: q.id, x: q.x, y: q.y });
          return;
        }
      }
    }
    /* smash an anchor */
    var a = nearestAnchor(world, p);
    if (a && inp.interact && !a.done) {
      a.smashing = 1;
      a.smash += dt / K.ANCHOR_SMASH_TIME;
      if (a.smash >= 1) {
        a.smash = 0; a.progress = clamp(a.progress - K.ANCHOR_REGRESS, 0, 1);
        a.marked = 5;
        p.score.obj += 60;
        p.ult = clamp(p.ult + 14, 0, K.ULT_CHARGE_MAX);
        alert(world, a.x, a.y, 0.7, 'smash');
        ev(world, { t: 'anchorHit', by: p.id, id: a.id, x: a.x, y: a.y });
      }
      return;
    }
    for (var k = 0; k < world.anchors.length; k++) world.anchors[k].smashing = 0;
    return;
  }

  /* ---- survivor: repair / heal / rescue / escape ---- */
  if (p.skill && !inp.interact) { failSkill(world, p); }

  /* rescue a downed teammate (or yourself by crawling to a hook-free zone) */
  for (var r = 0; r < world.players.length; r++) {
    var m = world.players[r];
    if (m === p || m.role === ROLES.SLAYER) continue;
    if (m.state === STATE.DOWNED && C.dist(p.x, p.y, m.x, m.y) <= K.PLAYER_R + 34 && inp.interact) {
      p.interactKind = 'rescue'; p.interactId = m.id;
      p.interactT += dt / K.RESCUE_TIME;
      if (p.interactT >= 1) {
        p.interactT = 0; p.interactKind = null; p.interactId = -1;
        m.state = STATE.ALIVE; m.hp = K.SURV_HP * 0.5; m.invuln = 1.6;
        p.score.heal += 90;
        p.ult = clamp(p.ult + 22, 0, K.ULT_CHARGE_MAX);
        ev(world, { t: 'rescue', by: p.id, to: m.id, x: m.x, y: m.y });
      }
      return;
    }
    /* unhook */
    if (m.state === STATE.HOOKED && C.dist(p.x, p.y, m.x, m.y) <= K.PLAYER_R + 40 && inp.interact) {
      p.interactKind = 'unhook'; p.interactId = m.id;
      p.interactT += dt / K.RESCUE_TIME;
      if (p.interactT >= 1) {
        p.interactT = 0; p.interactKind = null; p.interactId = -1;
        m.state = STATE.ALIVE; m.hp = K.SURV_HP * 0.45; m.invuln = 2;
        m.hookT = K.HOOK_TIME;
        if (m.hookId >= 0 && world.hooks[m.hookId]) world.hooks[m.hookId].occupant = -1;
        m.hookId = -1;
        p.score.heal += 120;
        p.ult = clamp(p.ult + 26, 0, K.ULT_CHARGE_MAX);
        ev(world, { t: 'unhook', by: p.id, to: m.id, x: m.x, y: m.y });
      }
      return;
    }
    /* heal an injured teammate */
    if (m.state === STATE.ALIVE && m.hp < K.SURV_HP && C.dist(p.x, p.y, m.x, m.y) <= K.PLAYER_R + 34 && inp.interact) {
      p.interactKind = 'heal'; p.interactId = m.id;
      p.interactT += dt / K.HEAL_TIME;
      if (p.interactT >= 1) {
        p.interactT = 0; p.interactKind = null; p.interactId = -1;
        m.hp = K.SURV_HP;
        p.score.heal += 60;
        ev(world, { t: 'heal', by: p.id, to: m.id, x: m.x, y: m.y });
      }
      return;
    }
  }

  /* escape gate */
  var g = nearestGate(world, p);
  if (g && g.open && C.dist(p.x, p.y, g.x, g.y) <= g.r) {
    p.interactKind = 'escape'; p.interactId = g.id;
    p.interactT += dt / K.GATE_ESCAPE_TIME;
    if (p.interactT >= 1) {
      p.interactT = 0; p.interactKind = null; p.interactId = -1;
      p.state = STATE.ESCAPED; p.score.escape += 400;
      world.stats.escapes++;
      ev(world, { t: 'escape', by: p.id, x: g.x, y: g.y });
      checkEnd(world);
    }
    return;
  }
  if (g && g.powered && !g.open && inp.interact) {
    p.interactKind = 'gate'; p.interactId = g.id;
    g.channeller = p.id;
    g.progress += dt / K.GATE_CHANNEL;
    p.interactT = g.progress;
    if (g.progress >= 1) {
      g.progress = 1; g.open = true; g.channeller = -1;
      p.interactKind = null; p.interactId = -1; p.interactT = 0;
      p.score.obj += 150;
      p.ult = clamp(p.ult + 30, 0, K.ULT_CHARGE_MAX);
      alert(world, g.x, g.y, 1, 'gate');
      ev(world, { t: 'gateOpen', by: p.id, id: g.id, x: g.x, y: g.y });
    }
    return;
  }

  /* repair anchor */
  var a2 = nearestAnchor(world, p);
  if (a2 && inp.interact && !a2.done) {
    p.interactKind = 'repair'; p.interactId = a2.id;
    a2.workers.push(p.id);
    var n = Math.min(3, a2.workers.length);
    var rate = n === 1 ? K.ANCHOR_RATE_1 : (n === 2 ? K.ANCHOR_RATE_2 : K.ANCHOR_RATE_3);
    a2.progress += rate * dt;
    /* repairing is loud: it is the slayer's main way to find people */
    if (world.tick % 40 === 0) alert(world, a2.x, a2.y, 0.55, 'repair');
    /* skill check prompt */
    if (!p.skill && a2.progress - a2.lastSkill >= K.SKILL_CHECK_EVERY) {
      a2.lastSkill = a2.progress;
      if (rndSkill() < K.SKILL_CHECK_CHANCE) trySkillCheck(world, p, a2);
    }
    if (p.skill) {
      p.skill.t += dt;
      var frac = p.skill.t / p.skill.ttl;
      p.skill.frac = frac;
      p.skill.inGreat = frac > 0.62 && frac < 0.62 + K.SKILL_GREAT;
      if (inp.attack) { resolveSkill(world, p, p.skill.inGreat); p.atkCd = Math.max(p.atkCd, 0.12); }
      else if (p.skill.t >= p.skill.ttl) failSkill(world, p);
    }
    if (a2.progress >= 1) {
      a2.progress = 1; a2.done = true; a2.marked = 0;
      world.stats.anchorsDone++;
      p.score.obj += 220;
      p.ult = clamp(p.ult + 28, 0, K.ULT_CHARGE_MAX);
      alert(world, a2.x, a2.y, 1, 'complete');
      ev(world, { t: 'anchorDone', by: p.id, id: a2.id, x: a2.x, y: a2.y });
      if (anchorsDone(world) >= K.ANCHORS_NEEDED) {
        for (var gi = 0; gi < world.gates.length; gi++) world.gates[gi].powered = true;
        ev(world, { t: 'powered', x: K.WORLD.w / 2, y: K.WORLD.h / 2 });
      }
      checkEnd(world);
    }
    return;
  }

  /* self-heal while injured, idle and out of recent danger */
  if (p.hp < K.SURV_HP && !inp.interact) {
    if (p.healDelay > 0) p.healDelay -= dt;
    else p.hp = clamp(p.hp + dt * K.HEAL_SELF_RATE, 0, K.SURV_HP);
  }
  if (p.interactKind) { p.interactKind = null; p.interactId = -1; p.interactT = 0; }
}

function updateAnchors(world, dt) {
  for (var i = 0; i < world.anchors.length; i++) {
    var a = world.anchors[i];
    a.workers.length = 0;
    if (a.marked > 0) a.marked -= dt;
    /* slow regression on untouched anchors keeps the clock honest */
    if (!a.done && a.progress > 0 && a.workers.length === 0 && a.smash <= 0) {
      a.progress = clamp(a.progress - dt * 0.004, 0, 1);
    }
  }
}

function updateGates(world, dt) {
  for (var i = 0; i < world.gates.length; i++) {
    var g = world.gates[i];
    if (!g.open && g.progress > 0 && g.progress < 1) {
      var stillHeld = false;
      for (var j = 0; j < world.players.length; j++) {
        var p = world.players[j];
        if (p.interactKind === 'gate' && p.interactId === g.id) { stillHeld = true; break; }
      }
      if (!stillHeld) g.progress = clamp(g.progress - dt / (K.GATE_CHANNEL * 2.5), 0, 1);
    }
  }
}

function stepCarry(world, p, inp, dt) {
  var q = world.byId.get(p.carrying);
  if (!q) { p.carrying = -1; return; }
  q.x = p.x; q.y = p.y; q.z = 30;
  if (inp.cancel) {
    q.state = STATE.DOWNED; q.carrier = -1; q.z = 0; q.invuln = 0.6;
    p.carrying = -1;
    ev(world, { t: 'drop', by: p.id, to: q.id, x: q.x, y: q.y });
    return;
  }
  /* hook the victim */
  if (inp.interact) {
    for (var i = 0; i < world.hooks.length; i++) {
      var h = world.hooks[i];
      if (h.occupant >= 0) continue;
      if (C.dist(p.x, p.y, h.x, h.y) <= h.r + 26) {
        h.occupant = q.id;
        q.state = STATE.HOOKED; q.hookId = h.id; q.carrier = -1;
        q.x = h.x; q.y = h.y; q.z = 0;
        q.hookT = K.HOOK_TIME;
        q.hooks++;
        p.carrying = -1;
        p.score.chase += 250;
        p.ult = clamp(p.ult + 30, 0, K.ULT_CHARGE_MAX);
        alert(world, h.x, h.y, 1, 'hook');
        ev(world, { t: 'hook', by: p.id, to: q.id, x: h.x, y: h.y });
        checkEnd(world);
        return;
      }
    }
  }
}

function stepDowned(world, p, inp, dt, slayer) {
  p.bleed -= dt;
  var mx = inp.x, my = inp.y;
  var ml = Math.sqrt(mx * mx + my * my);
  if (ml > 1) { mx /= ml; my /= ml; }
  p.vx = mx * K.SURV_DOWN_SPEED; p.vy = my * K.SURV_DOWN_SPEED;
  moveAndCollide(world, p, dt);
  if (p.bleed <= 0) eliminate(world, p, 'bleedout');
}

function stepHooked(world, p, dt) {
  p.hookT -= dt;
  if (p.hookT <= 0) eliminate(world, p, 'hook');
}
function stepCarried(world, p, dt) { p.carryT += dt; }

function eliminate(world, p, cause) {
  if (p.state === STATE.DEAD) return;
  p.state = STATE.DEAD;
  p.hp = 0; p.vx = 0; p.vy = 0;
  if (p.hookId >= 0 && world.hooks[p.hookId]) world.hooks[p.hookId].occupant = -1;
  p.hookId = -1;
  world.stats.eliminations++;
  ev(world, { t: 'eliminate', to: p.id, x: p.x, y: p.y, cause: cause });
  checkEnd(world);
}

function endMatch(world, winner, reason) {
  if (world.phase === PHASE.OVER) return;
  world.phase = PHASE.OVER;
  world.winner = winner;
  world.winReason = reason;
  world.endedAt = world.tick;
  ev(world, { t: 'matchEnd', winner: winner, reason: reason });
}

/* Lobby -> play. The engine calls this once every peer has confirmed in;
 * before it, step() advances the tick without running the clock so late
 * joiners do not lose match time while they load the arena. */
function beginMatch(world) {
  world.phase = PHASE.PLAY;
  world.time = K.MATCH_TIME;
  for (var i = 0; i < world.players.length; i++) {
    var p = world.players[i];
    p.invuln = 2;
    p.ult = p.role === ROLES.SLAYER ? 35 : 0;
  }
  ev(world, { t: 'matchStart', x: K.WORLD.w / 2, y: K.WORLD.h / 2 });
  return world;
}

function checkEnd(world) {
  if (world.phase !== PHASE.PLAY) return;
  var surv = 0, aliveSurv = 0, escaped = 0;
  for (var i = 0; i < world.players.length; i++) {
    var p = world.players[i];
    if (p.role !== ROLES.SURV) continue;
    surv++;
    if (p.state === STATE.ESCAPED) escaped++;
    else if (alive(p)) aliveSurv++;
  }
  if (aliveSurv === 0 && surv > 0) { endMatch(world, 'slayer', escaped > 0 ? 'partial' : 'wipe'); return; }
  if (escaped >= Math.max(1, Math.ceil(surv * 0.5))) endMatch(world, 'survivors', 'escape');
}

/* ============================ SNAPSHOT / HASH ============================
 * snapshot() is what a host broadcasts; it is a flat, ordered structure so
 * delta-encoding can be layered on later without touching the sim.
 *
 * worldHash() hashes *the snapshot*, not the live world. That is deliberate
 * and load-bearing: the hash can never claim a precision the wire format
 * does not carry. If the two ever disagreed, a client that rebuilt its world
 * from a snapshot would produce a different hash from the host on every
 * single tick and the divergence check would fire forever. Hashing the
 * snapshot also means you cannot add a replicated field and forget the hash —
 * it is included by construction.
 *
 * Cost is a snapshot allocation per hash. Hashes run at ~7.5 Hz (every 8
 * ticks), not every tick, so this is free. */

function snapshot(world) {
  var ps = [];
  for (var i = 0; i < world.players.length; i++) {
    var p = world.players[i];
    ps.push({
      id: p.id, role: p.role, name: p.name, bot: p.bot ? 1 : 0,
      x: round1(p.x), y: round1(p.y), z: round1(p.z),
      facing: round2(p.facing), hp: round1(p.hp), state: p.state,
      stamina: Math.round(p.stamina), ult: Math.round(p.ult),
      atkPhase: p.atkPhase || '', atkT: round2(p.atkT), ultT: round2(p.ultT),
      dashT: round2(p.dashT), iframes: round2(p.iframes), stun: round2(p.stun),
      bleed: round1(p.bleed), hooks: p.hooks, hookId: p.hookId,
      interactKind: p.interactKind || '', interactT: round2(p.interactT),
      interactId: p.interactId, skill: p.skill ? round2(p.skill.frac || 0) : -1,
      skillGreat: p.skill ? (p.skill.inGreat ? 1 : 0) : -1,
      score: {
        obj: Math.round(p.score.obj), chase: Math.round(p.score.chase),
        stun: Math.round(p.score.stun), heal: Math.round(p.score.heal),
        dmg: Math.round(p.score.dmg), escape: Math.round(p.score.escape)
      },
      inChase: p.inChase ? 1 : 0, carrying: (p.carrying === undefined ? -1 : p.carrying),
      hitFlash: round2(p.hitFlash)
    });
  }
  var as = [];
  for (var a = 0; a < world.anchors.length; a++) {
    var an = world.anchors[a];
    as.push({ id: an.id, x: round1(an.x), y: round1(an.y), progress: round3(an.progress), done: an.done ? 1 : 0, marked: round2(Math.max(0, an.marked)) });
  }
  var gs = [];
  for (var g = 0; g < world.gates.length; g++) {
    var gt = world.gates[g];
    gs.push({ id: gt.id, x: round1(gt.x), y: round1(gt.y), powered: gt.powered ? 1 : 0, open: gt.open ? 1 : 0, progress: round3(gt.progress) });
  }
  var hs = [];
  for (var h = 0; h < world.hooks.length; h++) hs.push({ id: world.hooks[h].id, x: round1(world.hooks[h].x), y: round1(world.hooks[h].y), occupant: world.hooks[h].occupant });
  return {
    v: 1, seed: world.seed, tick: world.tick, phase: world.phase,
    time: round2(world.time), players: ps, anchors: as, gates: gs, hooks: hs,
    echoes: world.echoes.map(function (e) { return { x: round1(e.x), y: round1(e.y), t: round2(e.t) }; }),
    alerts: world.alerts.map(function (e) { return { x: round1(e.x), y: round1(e.y), kind: e.kind, t: round2(e.t) }; }),
    stats: {
      escapes: world.stats.escapes, eliminations: world.stats.eliminations,
      anchorsDone: world.stats.anchorsDone, chases: world.stats.chases
    },
    winner: world.winner || '', winReason: world.winReason || ''
  };
}

function applySnapshot(world, s) {
  world.seed = s.seed; world.tick = s.tick; world.phase = s.phase; world.time = s.time;
  world.stats = s.stats || world.stats;
  world.winner = s.winner || null; world.winReason = s.winReason || '';
  world.byId.clear();
  world.players = s.players.map(function (sp) {
    var sc = sp.score || {};
    var p = {
      id: sp.id, name: sp.name, role: sp.role, bot: !!sp.bot,
      x: sp.x, y: sp.y, z: sp.z || 0, vx: 0, vy: 0, facing: sp.facing,
      hp: sp.hp, maxHp: sp.role === ROLES.SLAYER ? K.SLAYER_HP : K.SURV_HP,
      state: sp.state, stamina: sp.stamina, stamDelay: 0,
      atkCd: 0, atkT: sp.atkT, atkPhase: sp.atkPhase || null, atkHitDone: true,
      dashT: sp.dashT, dashCd: 0, dashAng: 0, iframes: sp.iframes,
      stun: sp.stun, slow: 0, invuln: 0, ult: sp.ult, ultT: sp.ultT, ultCd: 0, ultAng: 0,
      bleed: sp.bleed, hooks: sp.hooks, hookT: 0, hookId: sp.hookId,
      carrier: -1, carryT: 0, carrying: (typeof sp.carrying === 'number' && sp.carrying >= 0) ? sp.carrying : -1,
      interactId: sp.interactId, interactT: sp.interactT, interactKind: sp.interactKind || null,
      skill: sp.skill >= 0 ? { frac: sp.skill, inGreat: !!sp.skillGreat, t: 0, ttl: 1 } : null,
      echoT: 0, chaseT: 0, inChase: !!sp.inChase,
      score: {
        obj: sc.obj || 0, chase: sc.chase || 0, stun: sc.stun || 0,
        heal: sc.heal || 0, dmg: sc.dmg || 0, escape: sc.escape || 0
      },
      aim: sp.facing, flash: 0, hitFlash: sp.hitFlash, sprintingNow: false
    };
    world.byId.set(p.id, p);
    return p;
  });
  world.anchors = s.anchors.map(function (a) {
    return { id: a.id, x: a.x, y: a.y, r: K.ANCHOR_R, progress: a.progress, done: !!a.done, smash: 0, smashing: 0, marked: a.marked, workers: [], lastSkill: 0 };
  });
  world.gates = s.gates.map(function (g) {
    return { id: g.id, x: g.x, y: g.y, r: K.GATE_R, powered: !!g.powered, progress: g.progress, open: !!g.open, channeller: -1 };
  });
  world.hooks = s.hooks.map(function (h) {
    return { id: h.id, x: h.x, y: h.y, r: 26, occupant: h.occupant };
  });
  world.echoes = (s.echoes || []).map(function (e) { return { x: e.x, y: e.y, t: e.t, by: -1 }; });
  world.alerts = (s.alerts || []).map(function (e) { return { x: e.x, y: e.y, kind: e.kind, t: e.t }; });
  return world;
}

/* Canonical fold over a snapshot. Object key order is the literal order in
 * snapshot(), which is identical on every peer, so keys are hashed too —
 * a reordered literal then fails loudly instead of silently misaligning. */
function hashValue(h, v) {
  if (typeof v === 'number') {
    if (!isFinite(v)) return C.fnvByte(h, 0xFE);
    return C.fnvNum(h, v);
  }
  if (typeof v === 'boolean') return C.fnvByte(h, v ? 1 : 0);
  if (typeof v === 'string') {
    for (var i = 0; i < v.length; i++) h = C.fnvByte(h, v.charCodeAt(i) & 0xFF);
    return C.fnvByte(h, v.length);
  }
  if (v === null || v === undefined) return C.fnvByte(h, 0);
  if (Array.isArray(v)) {
    h = C.fnvByte(h, 0xAA);
    h = C.fnvNum(h, v.length);
    for (var a = 0; a < v.length; a++) h = hashValue(h, v[a]);
    return h;
  }
  var keys = Object.keys(v);
  h = C.fnvByte(h, 0xBB);
  for (var k = 0; k < keys.length; k++) {
    h = hashValue(h, keys[k]);
    h = hashValue(h, v[keys[k]]);
  }
  return h;
}

function worldHash(world) {
  return hashValue(C.fnv(), snapshot(world)) >>> 0;
}

function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }

/* ============================ FULL STATE CAPTURE ============================
 * snapshot() above is the *interpolation* snapshot: compact, quantised, what
 * a host broadcasts 20x a second. It is deliberately lossy (atkCd, dashCd,
 * stamDelay, healDelay and friends never go on the wire) so it is NOT enough
 * to roll a simulation back.
 *
 * captureState()/restoreState() are the lossless pair the rollback path uses
 * (see eot-net.js: divergence => host sends a capture, client restores and
 * replays inputs). Every simulated player field is listed explicitly in
 * PLAYER_FIELDS; test/smoke-sim.js asserts that list covers every own key of
 * a live player, so adding a simulated field without updating the capture
 * fails a test instead of silently desyncing peers. */
var PLAYER_FIELDS = [
  'id', 'name', 'role', 'bot', 'x', 'y', 'z', 'vx', 'vy', 'facing',
  'hp', 'maxHp', 'state', 'stamina', 'stamDelay', 'healDelay',
  'atkCd', 'atkT', 'atkPhase', 'atkHitDone', 'dashT', 'dashCd', 'dashAng',
  'iframes', 'stun', 'slow', 'invuln', 'ult', 'ultT', 'ultCd', 'ultAng',
  'bleed', 'hooks', 'hookT', 'hookId', 'carrier', 'carryT', 'carrying',
  'interactId', 'interactT', 'interactKind', 'skill',
  'echoT', 'chaseT', 'inChase', 'score', 'aim', 'flash', 'hitFlash', 'sprintingNow'
];

function clonePlayer(p) {
  var o = {};
  for (var i = 0; i < PLAYER_FIELDS.length; i++) {
    var k = PLAYER_FIELDS[i];
    var v = p[k];
    if (v && typeof v === 'object') {
      o[k] = Array.isArray(v) ? v.slice() : Object.assign({}, v);
    } else {
      o[k] = v;
    }
  }
  return o;
}
function cloneList(list) {
  return list.map(function (o) {
    var c = {};
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      c[k] = Array.isArray(o[k]) ? o[k].slice() : o[k];
    }
    return c;
  });
}

function captureState(world) {
  return {
    seed: world.seed, tick: world.tick, phase: world.phase, time: world.time,
    nextId: world.nextId,
    players: world.players.map(clonePlayer),
    anchors: cloneList(world.anchors),
    gates: cloneList(world.gates),
    hooks: cloneList(world.hooks),
    echoes: cloneList(world.echoes),
    alerts: cloneList(world.alerts),
    stats: Object.assign({}, world.stats),
    winner: world.winner, winReason: world.winReason || ''
  };
}

function restoreState(world, cap) {
  world.seed = cap.seed; world.tick = cap.tick; world.phase = cap.phase;
  world.time = cap.time; world.nextId = cap.nextId;
  world.players = cap.players.map(function (cp) {
    var p = clonePlayer(cp);
    /* the skill-check prompt is a small object; clone it, do not share it */
    p.skill = cp.skill ? Object.assign({}, cp.skill) : null;
    p.score = Object.assign({}, cp.score);
    return p;
  });
  world.byId.clear();
  for (var i = 0; i < world.players.length; i++) world.byId.set(world.players[i].id, world.players[i]);
  world.anchors = cloneList(cap.anchors);
  for (var a = 0; a < world.anchors.length; a++) world.anchors[a].workers = [];
  world.gates = cloneList(cap.gates);
  world.hooks = cloneList(cap.hooks);
  world.echoes = cloneList(cap.echoes);
  world.alerts = cloneList(cap.alerts);
  world.stats = Object.assign({}, cap.stats);
  world.winner = cap.winner || null;
  world.winReason = cap.winReason || '';
  /* Force the per-tick RNG stream to be rebuilt for the restored tick —
   * carrying a half-consumed stream across a rollback would desync. */
  world.rndAi = null;
  world.rndAiTick = -1;
  world.events.length = 0;
  return world;
}

/* ============================ HELPERS FOR CALLERS ============================ */
function getPlayer(world, id) { return world.byId.get(id) || null; }

function teamOf(p) { return p.role === ROLES.SLAYER ? 'slayer' : 'survivors'; }

function distanceToSlayer(world, p) {
  for (var i = 0; i < world.players.length; i++) {
    if (world.players[i].role === ROLES.SLAYER) return C.dist(p.x, p.y, world.players[i].x, world.players[i].y);
  }
  return Infinity;
}

/* Grade a player DBD-style: degrees of success, so a losing side can still
 * have played well. This is the number the end screen shows. */
function grade(p) {
  var s = p.score;
  var total = s.obj + s.chase + s.stun + s.heal + s.dmg * 0.6 + s.escape;
  if (p.role === ROLES.SLAYER) total = s.chase + s.obj + s.dmg * 0.8;
  var g = 'D';
  if (total > 1400) g = 'S';
  else if (total > 950) g = 'A';
  else if (total > 600) g = 'B';
  else if (total > 300) g = 'C';
  return { grade: g, total: Math.round(total) };
}

return {
  K: K, ROLES: ROLES, STATE: STATE, PHASE: PHASE, F: F,
  makeInput: makeInput, inputFlags: inputFlags, inputFromFlags: inputFromFlags,
  makeWorld: makeWorld, buildArena: buildArena, addPlayer: addPlayer,
  prepare: prepare, beginMatch: beginMatch,
  step: step, snapshot: snapshot, applySnapshot: applySnapshot, worldHash: worldHash,
  captureState: captureState, restoreState: restoreState, PLAYER_FIELDS: PLAYER_FIELDS,
  getPlayer: getPlayer, teamOf: teamOf, alive: alive, acting: acting,
  anchorsDone: anchorsDone, distanceToSlayer: distanceToSlayer, grade: grade,
  endMatch: endMatch, blocked: blocked
};
});
