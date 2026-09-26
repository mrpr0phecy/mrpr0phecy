/* EOT SIMULATION — authoritative, deterministic game rules.
 *
 * Design constraints:
 *   1. Deterministic: identical inputs + identical seed -> identical state.
 *   2. Fixed timestep: simulation advances in discrete dt = 1/60s ticks.
 *   3. Zero allocation in the hot loop where possible.
 *   4. Clean rollback support: `captureState` and `restoreState` are cheap and lossless.
 *
 * Combat / Horror Dynamics:
 *   - 4v1 asymmetric rift horror combat with anime cel-shaded aesthetics.
 *   - Survivor Classes: Duelist (parry/clash master), Medic (revive/heal specialist),
 *     Engineer (fast anchor calibration/overclock), Scout (high mobility/stealth).
 *   - Slayer Archetypes: Void Sovereign (heavy terror pressure), Rift Weaver (stasis snare traps),
 *     Blood Reaper (bloodlust frenzy/extended lunge).
 *   - Interactive Map Elements: Temporal Drop Pallets, Supply Crates with usable items
 *     (Flash Flare, Adrenaline Serum, Overclock Nanite Tool, Hologram Decoy), Stasis Traps,
 *     Phase Lockers (stealth hiding).
 *   - Tactical Mechanics: Chrono-Rewind (1.5s temporal echo warp), Parry & Counter Riposte,
 *     Slayer Rift Rage Awakening (Phase 2 Berserk), Anchor Overclock Mini-game.
 */
(function (root, factory) {
  var C = typeof globalThis !== 'undefined' && globalThis.EOTCore ? globalThis.EOTCore : require('./eot-core.js');
  var api = factory(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EOTSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
'use strict';

var clamp = C.clamp;

/* Balance constants — tuned for 90-180 second matches. */
var K = {
  TICK_RATE: 60,
  FIXED: 1 / 60,

  WORLD: { w: 2400, h: 2400 },
  PLAYER_R: 15,

  /* Movement speeds (units / sec) */
  SURV_WALK: 168,
  SURV_SPRINT: 274,
  SURV_CROUCH: 96,
  SURV_INJURED_MUL: 0.9,
  SURV_DOWN_SPEED: 46,

  SLAYER_WALK: 212,
  SLAYER_SPRINT: 292,
  SLAYER_STUNNED_MUL: 0.35,

  ACCEL: 14,
  FRICTION: 16,

  /* Stamina */
  STAM_MAX: 100,
  STAM_SPRINT_DRAIN: 21,
  STAM_REGEN: 17,
  STAM_REGEN_DELAY: 0.75,
  STAM_DASH: 26,

  /* Dash */
  DASH_SPEED: 640,
  DASH_TIME: 0.22,
  DASH_CD: 1.1,
  DASH_IFRAMES: 0.18,

  /* Survivor Combat */
  SURV_HP: 100,
  SURV_ATK_WINDUP: 0.15,
  SURV_ATK_ACTIVE: 0.11,
  SURV_ATK_RECOVER: 0.22,
  SURV_ATK_RANGE: 52,
  SURV_ATK_ARC: 105,
  SURV_ATK_DMG: 10,
  SURV_ATK_STUN: 0.34,
  SURV_ATK_CD: 0.5,

  /* Slayer Combat */
  SLAYER_HP: 380,
  SLAYER_ATK_WINDUP: 0.28,
  SLAYER_ATK_ACTIVE: 0.13,
  SLAYER_ATK_RECOVER: 0.5,
  SLAYER_ATK_RANGE: 74,
  SLAYER_ATK_ARC: 116,
  SLAYER_ATK_DMG: 50,
  SLAYER_ATK_CD: 0.75,

  /* Ultimates */
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

  /* Objectives (Rift Anchors) */
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

  /* Gates & Escape */
  GATES: 2,
  GATE_R: 52,
  GATE_CHANNEL: 3.0,
  GATE_ESCAPE_TIME: 0.9,

  /* Health & Downed States */
  BLEEDOUT: 30,
  PICKUP_TIME: 1.35,
  HOOK_TIME: 22,
  HOOKS_TO_DIE: 2,
  RESCUE_TIME: 1.9,
  HEAL_TIME: 4.2,
  HEAL_DELAY: 3.5,
  HEAL_SELF_RATE: 0.9,
  INTERACT_R: 46,

  /* Horror / Stealth */
  ECHO_TIME: 3.6,
  ECHO_EVERY: 0.22,
  TERROR_R: 430,
  MATCH_TIME: 240,
  HOOK_STAGES: 3,

  /* Pallets, Crates, Lockers, Items */
  PALLET_DROP_R: 48,
  PALLET_STUN_R: 56,
  PALLET_STUN_TIME: 1.75,
  PALLET_BREAK_TIME: 0.85,
  CHEST_SEARCH_TIME: 2.2,
  CHEST_R: 40,
  LOCKER_R: 42,
  LOCKER_SEARCH_TIME: 0.9,
  REWIND_COOLDOWN: 28.0,
  REWIND_IFRAMES: 0.45,
  HEAVY_CHARGE_TIME: 0.35,
  RAGE_MAX: 100,
  AWAKENING_TIME: 15.0,
  OVERCLOCK_SPEED_MUL: 2.6
};

var ROLES = { SURV: 'survivor', SLAYER: 'slayer' };

var SURV_CLASSES = {
  DUELIST: 'duelist',
  MEDIC: 'medic',
  ENGINEER: 'engineer',
  SCOUT: 'scout'
};

var SLAYER_ARCHETYPES = {
  SOVEREIGN: 'sovereign',
  WEAVER: 'weaver',
  REAPER: 'reaper'
};

var STATE = {
  ALIVE: 'alive',
  DOWNED: 'downed',
  CARRIED: 'carried',
  HOOKED: 'hooked',
  DEAD: 'dead',
  ESCAPED: 'escaped'
};

var PHASE = {
  LOBBY: 'lobby',
  PLAY: 'play',
  OVER: 'over'
};

/* Packed 8-bit input bitmask */
var F = {
  SPRINT:   1 << 0,
  CROUCH:   1 << 1,
  ATTACK:   1 << 2,
  DASH:     1 << 3,
  ULT:      1 << 4,
  INTERACT: 1 << 5,
  CANCEL:   1 << 6,
  EMOTE:    1 << 7
};

function makeInput() {
  return {
    x: 0, y: 0, aim: 0,
    sprint: false, crouch: false, attack: false, dash: false,
    ult: false, interact: false, cancel: false, emote: false,
    item: false, rewind: false, overclock: false, heavy: false
  };
}

function inputFlags(inp) {
  var f = 0;
  if (inp.sprint) f |= F.SPRINT;
  if (inp.crouch) f |= F.CROUCH;
  if (inp.attack || inp.heavy) f |= F.ATTACK;
  if (inp.dash) f |= F.DASH;
  if (inp.ult || inp.rewind) f |= F.ULT;
  if (inp.interact) f |= F.INTERACT;
  if (inp.cancel || inp.item) f |= F.CANCEL;
  if (inp.emote) f |= F.EMOTE;
  return f;
}

function inputFromFlags(x, y, aim, f) {
  return {
    x: x, y: y, aim: aim,
    sprint: !!(f & F.SPRINT), crouch: !!(f & F.CROUCH),
    attack: !!(f & F.ATTACK), dash: !!(f & F.DASH),
    ult: !!(f & F.ULT), interact: !!(f & F.INTERACT),
    cancel: !!(f & F.CANCEL), emote: !!(f & F.EMOTE),
    item: !!(f & F.CANCEL), rewind: !!(f & F.ULT),
    overclock: false, heavy: false
  };
}

/* ============================ WORLD CREATION ============================ */

function makeWorld(opts) {
  opts = opts || {};
  var seed = typeof opts.seed === 'number' ? opts.seed : C.hashStr(opts.seed || 'eot-arena-1');
  return {
    seed: seed,
    tick: 0,
    time: 0,
    phase: PHASE.LOBBY,
    winner: null,
    winReason: '',
    players: [],
    byId: new Map(),
    props: [],
    anchors: [],
    gates: [],
    hooks: [],
    traps: [],
    echoes: [],
    alerts: [],
    events: [],
    pallets: [],
    chests: [],
    lockers: [],
    stats: {
      escapes: 0,
      eliminations: 0,
      anchorsDone: 0,
      chases: 0
    },
    nextId: 1,
    rndAi: null,
    rndAiTick: 0
  };
}

function buildArena(world, opts) {
  opts = opts || {};
  var rnd = C.mulberry32(C.mix32(world.seed, 0xB0B));
  var W = K.WORLD.w, H = K.WORLD.h;
  world.props.length = 0;
  world.anchors.length = 0;
  world.gates.length = 0;
  world.hooks.length = 0;
  world.traps.length = 0;
  world.pallets.length = 0;
  world.chests.length = 0;
  world.lockers.length = 0;

  var T = 60;
  world.props.push({ x: 0, y: 0, w: W, h: T, type: 'wall' });
  world.props.push({ x: 0, y: H - T, w: W, h: T, type: 'wall' });
  world.props.push({ x: 0, y: 0, w: T, h: H, type: 'wall' });
  world.props.push({ x: W - T, y: 0, w: T, h: H, type: 'wall' });

  /* Interior structures on a jittered grid */
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

  /* Structural loop walls */
  world.props.push({ x: W * 0.5 - 20, y: H * 0.16, w: 40, h: H * 0.24, type: 'wall' });
  world.props.push({ x: W * 0.16, y: H * 0.6, w: W * 0.24, h: 40, type: 'wall' });

  /* Anchors */
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

  /* Gates */
  for (var g = 0; g < K.GATES; g++) {
    var gy = H * (g === 0 ? 0.22 : 0.78);
    world.gates.push({
      id: g, x: W - T - 34, y: gy, r: K.GATE_R,
      powered: false, progress: 0, open: false, channeller: -1
    });
  }

  /* Hooks */
  var hSpots = [
    { x: W * 0.3, y: H * 0.3 }, { x: W * 0.7, y: H * 0.3 },
    { x: W * 0.3, y: H * 0.7 }, { x: W * 0.7, y: H * 0.7 },
    { x: W * 0.5, y: H * 0.5 }
  ];
  for (var h = 0; h < hSpots.length; h++) {
    world.hooks.push({ id: h, x: hSpots[h].x, y: hSpots[h].y, r: 26, occupant: -1 });
  }

  /* Pallets placed at tactical choke corridors */
  var palletSpots = [
    { x: W * 0.38, y: H * 0.28, w: 52, h: 16, ang: 0 },
    { x: W * 0.62, y: H * 0.28, w: 52, h: 16, ang: 0 },
    { x: W * 0.28, y: H * 0.52, w: 16, h: 52, ang: Math.PI * 0.5 },
    { x: W * 0.72, y: H * 0.52, w: 16, h: 52, ang: Math.PI * 0.5 },
    { x: W * 0.45, y: H * 0.72, w: 52, h: 16, ang: 0 },
    { x: W * 0.55, y: H * 0.72, w: 52, h: 16, ang: 0 }
  ];
  for (var pi = 0; pi < palletSpots.length; pi++) {
    var ps = palletSpots[pi];
    world.pallets.push({
      id: pi, x: ps.x, y: ps.y, w: ps.w, h: ps.h, ang: ps.ang,
      palletState: 'up', hp: 100
    });
  }

  /* Supply Crates */
  var chestSpots = [
    { x: W * 0.22, y: H * 0.25 },
    { x: W * 0.78, y: H * 0.25 },
    { x: W * 0.22, y: H * 0.75 },
    { x: W * 0.78, y: H * 0.75 }
  ];
  for (var ci = 0; ci < chestSpots.length; ci++) {
    world.chests.push({
      id: ci, x: chestSpots[ci].x, y: chestSpots[ci].y,
      searched: false, searchT: 0, opener: -1
    });
  }

  /* Lockers / Phase Pods */
  var lockerSpots = [
    { x: T + 32, y: H * 0.4 },
    { x: T + 32, y: H * 0.6 },
    { x: W - T - 32, y: H * 0.4 },
    { x: W - T - 32, y: H * 0.6 }
  ];
  for (var li = 0; li < lockerSpots.length; li++) {
    world.lockers.push({
      id: li, x: lockerSpots[li].x, y: lockerSpots[li].y,
      occupant: -1
    });
  }

  return world;
}

function blocked(world, x, y, r) {
  for (var i = 0; i < world.props.length; i++) {
    var p = world.props[i];
    if (p.type === 'vault') continue;
    if (C.circleBox(x, y, r, p.x, p.y, p.w, p.h)) return true;
  }
  for (var j = 0; j < (world.pallets || []).length; j++) {
    var pal = world.pallets[j];
    if (pal.palletState === 'down') {
      if (C.circleBox(x, y, r, pal.x - pal.w * 0.5, pal.y - pal.h * 0.5, pal.w, pal.h)) return true;
    }
  }
  return false;
}

function defaultSurvClass(id) {
  var classes = [SURV_CLASSES.DUELIST, SURV_CLASSES.MEDIC, SURV_CLASSES.ENGINEER, SURV_CLASSES.SCOUT];
  return classes[Math.abs(id - 1) % classes.length];
}

/* ============================ PLAYERS ============================ */

/* Every player state field captured for rollback & synchronization */
var PLAYER_FIELDS = [
  'id', 'name', 'role', 'classId', 'bot',
  'x', 'y', 'z', 'vx', 'vy', 'facing',
  'hp', 'maxHp', 'state', 'stamina', 'stamDelay', 'healDelay',
  'atkCd', 'atkT', 'atkPhase', 'atkHitDone',
  'dashT', 'dashCd', 'dashAng', 'iframes',
  'stun', 'slow', 'invuln', 'ult', 'ultT', 'ultCd', 'ultAng',
  'bleed', 'hooks', 'hookT', 'hookId',
  'carrier', 'carryT', 'carrying',
  'interactId', 'interactT', 'interactKind', 'skill',
  'echoT', 'chaseT', 'inChase', 'score',
  'aim', 'flash', 'hitFlash', 'sprintingNow', 'boostT', 'vaultCd',
  'item', 'itemUses', 'blindT', 'riposteT', 'rewindCd',
  'rage', 'rageT', 'inLocker', 'heavyCharge', 'overclock'
];

function addPlayer(world, spec) {
  var id = spec.id || world.nextId++;
  var role = spec.role || ROLES.SURV;
  var isSlayer = role === ROLES.SLAYER;
  var classId = spec.classId || (isSlayer ? SLAYER_ARCHETYPES.SOVEREIGN : defaultSurvClass(id));

  var maxHp = isSlayer ? K.SLAYER_HP : K.SURV_HP;
  var p = {
    id: id,
    name: spec.name || (isSlayer ? 'Slayer' : 'Survivor ' + id),
    role: role,
    classId: classId,
    bot: !!spec.bot,

    x: spec.x !== undefined ? spec.x : 0,
    y: spec.y !== undefined ? spec.y : 0,
    z: 0,
    vx: 0,
    vy: 0,
    facing: isSlayer ? Math.PI : 0,
    aim: isSlayer ? Math.PI : 0,

    hp: maxHp,
    maxHp: maxHp,
    state: STATE.ALIVE,
    stamina: K.STAM_MAX,
    stamDelay: 0,
    healDelay: 0,

    atkCd: 0,
    atkT: 0,
    atkPhase: null,
    atkHitDone: false,

    dashT: 0,
    dashCd: 0,
    dashAng: 0,
    iframes: 0,

    stun: 0,
    slow: 0,
    invuln: 1.2,

    ult: 0,
    ultT: 0,
    ultCd: 0,
    ultAng: 0,

    bleed: 0,
    hooks: 0,
    hookT: 0,
    hookId: -1,

    carrier: -1,
    carryT: 0,
    carrying: -1,

    interactId: -1,
    interactT: 0,
    interactKind: null,
    skill: null,

    echoT: 0,
    chaseT: 0,
    inChase: false,

    score: { obj: 0, chase: 0, stun: 0, heal: 0, dmg: 0, escape: 0 },

    flash: 0,
    hitFlash: 0,
    sprintingNow: false,
    boostT: 0,
    vaultCd: 0,

    item: null,
    itemUses: 0,
    blindT: 0,
    riposteT: 0,
    rewindCd: 0,
    rage: 0,
    rageT: 0,
    inLocker: -1,
    heavyCharge: 0,
    overclock: 0
  };

  world.players.push(p);
  world.byId.set(id, p);
  return p;
}

function spawnPositions(world) {
  var rnd = C.mulberry32(C.mix32(world.seed, 0x5EED));
  var W = K.WORLD.w, H = K.WORLD.h, T = 80;

  var survs = world.players.filter(function (p) { return p.role === ROLES.SURV; });
  var slayer = world.players.find(function (p) { return p.role === ROLES.SLAYER; });

  var cx = W * 0.35 + rnd() * (W * 0.3);
  var cy = H * 0.35 + rnd() * (H * 0.3);
  for (var i = 0; i < survs.length; i++) {
    var ang = (i / Math.max(1, survs.length)) * Math.PI * 2 + rnd() * 0.4;
    var rad = 90 + rnd() * 60;
    survs[i].x = clamp(cx + Math.cos(ang) * rad, T + 40, W - T - 40);
    survs[i].y = clamp(cy + Math.sin(ang) * rad, T + 40, H - T - 40);
  }
  if (slayer) {
    var sx = cx < W * 0.5 ? W - T - 180 : T + 180;
    var sy = cy < H * 0.5 ? H - T - 180 : T + 180;
    slayer.x = sx; slayer.y = sy;
  }
}

function prepare(world) {
  if (!world.rndAi || world.rndAiTick !== world.tick) {
    world.rndAi = C.simRng(world.seed, world.tick, 2);
    world.rndAiTick = world.tick;
  }
  return world.rndAi;
}

function beginMatch(world) {
  world.phase = PHASE.PLAY;
  world.time = K.MATCH_TIME;
  spawnPositions(world);
  for (var i = 0; i < world.players.length; i++) {
    var p = world.players[i];
    p.state = STATE.ALIVE;
    p.hp = p.maxHp;
    p.stamina = K.STAM_MAX;
    p.invuln = 1.0;
  }
  ev(world, { t: 'matchStart', x: K.WORLD.w / 2, y: K.WORLD.h / 2 });
  return world;
}

/* ============================ SIMULATION STEP ============================ */

function step(world, inputs) {
  inputs = inputs || {};
  world.events.length = 0;
  var dt = K.FIXED;

  if (world.phase === PHASE.OVER) {
    world.tick++;
    return world.events;
  }

  var rndSkill = C.simRng(world.seed, world.tick, 1);
  prepare(world);

  if (world.phase === PHASE.PLAY) {
    world.time -= dt;
    if (world.time <= 0) {
      world.time = 0;
      endMatch(world, 'slayer', 'clock');
      return world.events;
    }
  }

  var slayer = world.players.find(function (p) { return p.role === ROLES.SLAYER; });

  /* Update all players */
  for (var pi = 0; pi < world.players.length; pi++) {
    var p = world.players[pi];
    var inp = inputs[p.id] || makeInput();
    p.sprintingNow = false;
    stepPlayer(world, p, inp, dt, rndSkill, slayer);
  }

  /* Update Stasis Traps */
  for (var ti = (world.traps || []).length - 1; ti >= 0; ti--) {
    var tr = world.traps[ti];
    if (tr.arm < 1) {
      tr.arm = Math.min(1, tr.arm + dt / 1.2);
    } else {
      for (var pj = 0; pj < world.players.length; pj++) {
        var pl = world.players[pj];
        if (pl.role === ROLES.SURV && alive(pl) && pl.state === STATE.ALIVE && pl.iframes <= 0 && pl.invuln <= 0) {
          if (C.dist2(pl.x, pl.y, tr.x, tr.y) < 34 * 34) {
            pl.slow = 2.5;
            damage(world, null, pl, 12, 80, 'trap');
            alert(world, tr.x, tr.y, 1.0, 'trap');
            ev(world, { t: 'trapTrigger', by: pl.id, x: tr.x, y: tr.y });
            world.traps.splice(ti, 1);
            break;
          }
        }
      }
    }
  }

  /* Update Anchors & Gates */
  updateAnchors(world, dt, rndSkill);
  updateGates(world, dt);

  /* Echoes & Alerts decay */
  for (var ei = world.echoes.length - 1; ei >= 0; ei--) {
    world.echoes[ei].t -= dt;
    if (world.echoes[ei].t <= 0) world.echoes.splice(ei, 1);
  }
  for (var ai = world.alerts.length - 1; ai >= 0; ai--) {
    world.alerts[ai].t -= dt;
    if (world.alerts[ai].t <= 0) world.alerts.splice(ai, 1);
  }

  /* Check End Condition */
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
  p.boostT = Math.max(0, (p.boostT || 0) - dt);
  p.vaultCd = Math.max(0, (p.vaultCd || 0) - dt);
  p.ultCd = Math.max(0, p.ultCd - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.blindT = Math.max(0, (p.blindT || 0) - dt);
  p.riposteT = Math.max(0, (p.riposteT || 0) - dt);
  p.rewindCd = Math.max(0, (p.rewindCd || 0) - dt);
  p.rageT = Math.max(0, (p.rageT || 0) - dt);
  p.echoT -= dt;
  p.chaseT = Math.max(0, p.chaseT - dt);

  /* Track position history for Chrono Rewind (every 5 ticks) */
  if (!world.history) world.history = new Map();
  var hist = world.history.get(p.id);
  if (!hist) { hist = []; world.history.set(p.id, hist); }
  if (world.tick % 5 === 0 && p.state === STATE.ALIVE) {
    hist.push({ x: p.x, y: p.y, facing: p.facing });
    if (hist.length > 20) hist.shift();
  }

  /* Downed / Hooked / Carried states */
  if (p.state === STATE.DOWNED) return stepDowned(world, p, inp, dt, slayer);
  if (p.state === STATE.HOOKED) return stepHooked(world, p, dt);
  if (p.state === STATE.CARRIED) return stepCarried(world, p, dt);
  if (p.state === STATE.DEAD || p.state === STATE.ESCAPED) return;

  var isSlayer = p.role === ROLES.SLAYER;

  /* Hiding in Phase Pod / Locker */
  if (p.inLocker >= 0) {
    if (inp.interact || inp.x !== 0 || inp.y !== 0 || inp.dash || inp.attack) {
      /* Exit locker */
      var lk = world.lockers.find(function (l) { return l.id === p.inLocker; });
      if (lk) lk.occupant = -1;
      p.inLocker = -1;
      p.invuln = 0.4;
      ev(world, { t: 'lockerExit', by: p.id, x: p.x, y: p.y });
    }
    return;
  }

  /* Facing tracks aim */
  if (typeof inp.aim === 'number') {
    p.aim = inp.aim;
    p.facing = C.angLerp(p.facing, inp.aim, 0.35);
  }

  /* ---------------- Stamina ---------------- */
  var wantSprint = !!inp.sprint && (inp.x !== 0 || inp.y !== 0) && p.stamina > 1 && p.stun <= 0;
  if (wantSprint) {
    p.stamina = clamp(p.stamina - K.STAM_SPRINT_DRAIN * dt, 0, K.STAM_MAX);
    p.stamDelay = K.STAM_REGEN_DELAY;
    p.sprintingNow = true;
  } else {
    p.stamDelay -= dt;
    if (p.stamDelay <= 0) p.stamina = clamp(p.stamina + K.STAM_REGEN * dt, 0, K.STAM_MAX);
  }

  /* ---------------- Dash / Vault ---------------- */
  var dashCd = p.classId === SURV_CLASSES.SCOUT ? K.DASH_CD * 0.77 : K.DASH_CD;
  if (inp.dash && p.dashCd <= 0 && p.dashT <= 0 && p.stamina >= K.STAM_DASH && p.stun <= 0 && !isSlayer) {
    p.dashT = K.DASH_TIME;
    p.dashCd = dashCd;
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

  /* ---------------- Movement Speeds ---------------- */
  var base = isSlayer ? K.SLAYER_WALK : K.SURV_WALK;
  if (isSlayer && wantSprint) {
    base = K.SLAYER_SPRINT;
    if (p.classId === SLAYER_ARCHETYPES.REAPER) {
      var woundedCount = 0;
      for (var wi = 0; wi < world.players.length; wi++) {
        var wp = world.players[wi];
        if (wp.role === ROLES.SURV && alive(wp) && wp.hp < K.SURV_HP) woundedCount++;
      }
      base *= (1 + woundedCount * 0.035);
    }
  } else if (!isSlayer && wantSprint) {
    base = p.classId === SURV_CLASSES.SCOUT ? K.SURV_SPRINT * 1.08 : K.SURV_SPRINT;
  }
  if (isSlayer && p.rageT > 0) base *= 1.18; /* Awakening Speed Boost */
  if (!isSlayer && inp.crouch) base = K.SURV_CROUCH;
  if (!isSlayer && p.hp <= K.SURV_HP * 0.5) base *= K.SURV_INJURED_MUL;
  if (p.boostT > 0) base *= 1.4;
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

  /* ---------------- Echo Trail ---------------- */
  var echoRate = p.classId === SURV_CLASSES.SCOUT ? K.ECHO_EVERY * 2 : K.ECHO_EVERY;
  if (!isSlayer && (p.sprintingNow || p.dashT > 0) && p.echoT <= 0) {
    p.echoT = echoRate;
    world.echoes.push({ x: p.x, y: p.y, t: K.ECHO_TIME, by: p.id });
    if (world.echoes.length > 90) world.echoes.shift();
  }

  /* ---------------- Tactical Ping ---------------- */
  if (inp.emote) {
    alert(world, p.x, p.y, 1.0, 'ping');
    ev(world, { t: 'ping', by: p.id, role: p.role, x: p.x, y: p.y });
  }

  /* ---------------- Item Usage ---------------- */
  if ((inp.cancel || inp.item) && p.item && !isSlayer) {
    useItem(world, p);
  }

  /* ---------------- Chrono-Rewind ---------------- */
  if ((inp.rewind || (inp.ult && !isSlayer)) && p.rewindCd <= 0 && !isSlayer && p.stun <= 0) {
    triggerChronoRewind(world, p);
  }

  /* ---------------- Chase Tracking & Slayer Rage ---------------- */
  updateChase(world, p, slayer, dt);

  /* ---------------- Attack / Combat ---------------- */
  if (p.atkPhase) {
    p.atkT -= dt;
    if (p.atkT <= 0) {
      if (p.atkPhase === 'windup') {
        p.atkPhase = 'active';
        p.atkT = isSlayer ? K.SLAYER_ATK_ACTIVE : K.SURV_ATK_ACTIVE;
      } else if (p.atkPhase === 'active') {
        if (!p.atkHitDone) { resolveAttackHit(world, p); p.atkHitDone = true; }
        p.atkPhase = 'recover';
        var recTime = isSlayer ? (p.rageT > 0 ? K.SLAYER_ATK_RECOVER * 0.65 : K.SLAYER_ATK_RECOVER) : (p.classId === SURV_CLASSES.DUELIST ? K.SURV_ATK_RECOVER * 0.8 : K.SURV_ATK_RECOVER);
        p.atkT = recTime;
      } else {
        p.atkPhase = null;
        if (isSlayer) {
          p.atkCd = p.classId === SLAYER_ARCHETYPES.REAPER ? 0.65 : K.SLAYER_ATK_CD;
        } else {
          p.atkCd = p.classId === SURV_CLASSES.DUELIST ? 0.38 : K.SURV_ATK_CD;
        }
      }
    }
  } else if (inp.attack && p.atkCd <= 0 && p.blindT <= 0) {
    startAttack(world, p);
  } else {
    p.atkCd = Math.max(0, p.atkCd - dt);
  }

  /* ---------------- Slayer Ultimate / Awakening ---------------- */
  if (isSlayer) {
    if (p.ultT > 0) {
      p.ultT -= dt;
      var dashSp = p.classId === SLAYER_ARCHETYPES.SOVEREIGN ? 820 : K.SLAYER_ULT_DASH;
      p.vx = Math.cos(p.ultAng) * dashSp;
      p.vy = Math.sin(p.ultAng) * dashSp;
      moveAndCollide(world, p, dt);
      if (!p.atkHitDone) { resolveUltHit(world, p); p.atkHitDone = true; }
      if (p.ultT <= 0) { p.ultT = 0; p.atkHitDone = false; }
    } else if (inp.ult && p.ult >= K.ULT_CHARGE_MAX) {
      startUlt(world, p);
    }
  }

  /* ---------------- Interactions ---------------- */
  stepInteract(world, p, inp, dt, rndSkill, isSlayer);
}

function triggerChronoRewind(world, p) {
  var hist = world.history ? world.history.get(p.id) : null;
  var oldPos = (hist && hist.length > 0) ? hist[0] : { x: p.x, y: p.y, facing: p.facing };
  var fromX = p.x, fromY = p.y;
  p.x = oldPos.x; p.y = oldPos.y; p.facing = oldPos.facing;
  p.iframes = K.REWIND_IFRAMES;
  p.boostT = 1.2;
  p.rewindCd = p.classId === SURV_CLASSES.DUELIST || p.classId === SURV_CLASSES.SCOUT ? K.REWIND_COOLDOWN * 0.8 : K.REWIND_COOLDOWN;
  world.echoes.push({ x: fromX, y: fromY, t: 2.5, by: p.id });
  ev(world, { t: 'chronoRewind', by: p.id, fromX: fromX, fromY: fromY, toX: p.x, toY: p.y });
  p.score.chase += 150;
}

function useItem(world, p) {
  var item = p.item;
  if (!item) return;

  if (item === 'flare') {
    /* Flash flare: blinds slayer */
    var slayer = world.players.find(function (pl) { return pl.role === ROLES.SLAYER; });
    if (slayer && C.dist(p.x, p.y, slayer.x, slayer.y) < 260) {
      slayer.blindT = 2.4;
      slayer.stun = Math.max(slayer.stun, 0.8);
      if (slayer.carrying >= 0) dropCarried(world, slayer, 'flare');
      ev(world, { t: 'flashBlind', by: p.id, target: slayer.id, x: slayer.x, y: slayer.y });
    }
    ev(world, { t: 'flashBang', x: p.x, y: p.y, by: p.id });
  } else if (item === 'serum') {
    /* Adrenaline serum */
    p.hp = Math.min(p.maxHp, p.hp + 50);
    p.boostT = 3.5;
    ev(world, { t: 'serumUsed', x: p.x, y: p.y, by: p.id });
  } else if (item === 'tool') {
    /* Nanite tool: instant anchor progress */
    var a = nearestAnchor(world, p);
    if (a && !a.done && C.dist(p.x, p.y, a.x, a.y) < K.INTERACT_R + 20) {
      a.progress = Math.min(1, a.progress + 0.18);
      ev(world, { t: 'toolUsed', x: a.x, y: a.y, by: p.id });
    }
  } else if (item === 'decoy') {
    /* Chrono Decoy */
    alert(world, p.x + Math.cos(p.facing) * 120, p.y + Math.sin(p.facing) * 120, 2.0, 'decoy');
    ev(world, { t: 'decoySpawned', x: p.x, y: p.y, by: p.id });
  }

  p.item = null;
  p.itemUses = 0;
}

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
  if (p.inChase) {
    p.score.chase += dt * 9;
    slayer.rage = Math.min(K.RAGE_MAX, slayer.rage + dt * 6);
  }
}

function stepInteract(world, p, inp, dt, rndSkill, isSlayer) {
  /* Slayer carried victim handling */
  if (isSlayer) {
    if (p.carrying >= 0) return stepCarry(world, p, inp, dt);

    /* Break Pallet */
    if (inp.interact || inp.attack) {
      for (var pi = 0; pi < world.pallets.length; pi++) {
        var pal = world.pallets[pi];
        if (pal.palletState === 'down' && C.dist(p.x, p.y, pal.x, pal.y) < K.INTERACT_R + 15) {
          pal.palletState = 'broken';
          p.stun = 0.8;
          ev(world, { t: 'palletBreak', x: pal.x, y: pal.y, by: p.id });
          return;
        }
      }
    }

    /* Search Phase Pod / Locker */
    if (inp.interact) {
      for (var li = 0; li < world.lockers.length; li++) {
        var lk = world.lockers[li];
        if (C.dist(p.x, p.y, lk.x, lk.y) < K.LOCKER_R) {
          if (lk.occupant >= 0) {
            var vict = world.byId.get(lk.occupant);
            if (vict) {
              vict.inLocker = -1;
              lk.occupant = -1;
              vict.state = STATE.CARRIED;
              vict.carrier = p.id;
              vict.carryT = 0;
              p.carrying = vict.id;
              ev(world, { t: 'lockerGrab', x: lk.x, y: lk.y, by: p.id, to: vict.id });
              return;
            }
          } else {
            p.stun = K.LOCKER_SEARCH_TIME;
            ev(world, { t: 'lockerSearchEmpty', x: lk.x, y: lk.y, by: p.id });
            return;
          }
        }
      }
    }

    /* Pick up a downed survivor */
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

    /* Smash an anchor */
    var a = nearestAnchor(world, p);
    if (a && inp.interact && !a.done) {
      a.smashing = 1;
      var smashTime = p.classId === SLAYER_ARCHETYPES.SOVEREIGN ? 0.9 : K.ANCHOR_SMASH_TIME;
      a.smash += dt / smashTime;
      if (a.smash >= 1) {
        a.smash = 0; a.progress = clamp(a.progress - K.ANCHOR_REGRESS, 0, 1);
        a.marked = 5;
        p.score.obj += 60;
        p.ult = clamp(p.ult + 14, 0, K.ULT_CHARGE_MAX);
        ev(world, { t: 'anchorSmash', by: p.id, id: a.id, x: a.x, y: a.y });
      }
      return;
    }
    return;
  }

  /* ---------------- Survivor Interactions ---------------- */

  /* Drop Pallet */
  if (inp.interact) {
    for (var pj = 0; pj < world.pallets.length; pj++) {
      var plt = world.pallets[pj];
      if (plt.palletState === 'up' && C.dist(p.x, p.y, plt.x, plt.y) < K.PALLET_DROP_R) {
        plt.palletState = 'down';
        var slayerP = world.players.find(function (pl) { return pl.role === ROLES.SLAYER; });
        var stunnedSlayer = false;
        if (slayerP && C.dist(slayerP.x, slayerP.y, plt.x, plt.y) < K.PALLET_STUN_R) {
          slayerP.stun = K.PALLET_STUN_TIME;
          slayerP.hp = Math.max(1, slayerP.hp - 15);
          if (slayerP.carrying >= 0) dropCarried(world, slayerP, 'palletStun');
          stunnedSlayer = true;
          p.score.stun += 250;
          ev(world, { t: 'palletStun', x: plt.x, y: plt.y, by: p.id, slayerId: slayerP.id });
        }
        ev(world, { t: 'palletDrop', x: plt.x, y: plt.y, by: p.id, stunned: stunnedSlayer });
        return;
      }
    }
  }

  /* Search Supply Chest */
  if (inp.interact && !p.item) {
    for (var cj = 0; cj < world.chests.length; cj++) {
      var ch = world.chests[cj];
      if (!ch.searched && C.dist(p.x, p.y, ch.x, ch.y) < K.CHEST_R) {
        p.interactKind = 'chest';
        ch.searchT += dt;
        if (ch.searchT >= K.CHEST_SEARCH_TIME) {
          ch.searched = true;
          ch.searchT = 0;
          var itemTypes = ['flare', 'serum', 'tool', 'decoy'];
          var itemIdx = Math.floor(rndSkill() * itemTypes.length);
          p.item = itemTypes[itemIdx];
          p.itemUses = 1;
          p.score.obj += 100;
          ev(world, { t: 'chestOpened', x: ch.x, y: ch.y, by: p.id, item: p.item });
        }
        return;
      }
    }
  }

  /* Enter Phase Pod / Locker */
  if (inp.interact && p.inLocker < 0) {
    for (var lj = 0; lj < world.lockers.length; lj++) {
      var lkr = world.lockers[lj];
      if (lkr.occupant < 0 && C.dist(p.x, p.y, lkr.x, lkr.y) < K.LOCKER_R) {
        lkr.occupant = p.id;
        p.inLocker = lkr.id;
        ev(world, { t: 'lockerEnter', x: lkr.x, y: lkr.y, by: p.id });
        return;
      }
    }
  }

  /* Fast Vault over window / prop */
  if (inp.dash && p.vaultCd <= 0) {
    for (var vi = 0; vi < world.props.length; vi++) {
      var vp = world.props[vi];
      if (vp.type !== 'vault') continue;
      if (C.circleBox(p.x, p.y, K.PLAYER_R + 10, vp.x, vp.y, vp.w, vp.h)) {
        var vcd = p.classId === SURV_CLASSES.SCOUT ? 1.4 : 2.0;
        p.vaultCd = vcd;
        var va = p.facing;
        p.x += Math.cos(va) * (vp.w + 40);
        p.y += Math.sin(va) * (vp.h + 40);
        p.boostT = 0.5;
        ev(world, { t: 'vault', by: p.id, x: p.x, y: p.y });
        return;
      }
    }
  }

  /* Unhook teammate */
  var hooked = world.players.find(function (q) {
    return q.role === ROLES.SURV && q.state === STATE.HOOKED && C.dist(p.x, p.y, q.x, q.y) <= K.INTERACT_R;
  });
  if (hooked && inp.interact) {
    p.interactKind = 'rescue';
    p.interactT += dt;
    var rescueSpeed = p.classId === SURV_CLASSES.MEDIC ? 0.75 : K.RESCUE_TIME;
    if (p.interactT >= rescueSpeed) {
      p.interactT = 0;
      var hk = world.hooks.find(function (h) { return h.id === hooked.hookId; });
      if (hk) hk.occupant = -1;
      hooked.state = STATE.ALIVE;
      hooked.hookId = -1;
      hooked.hp = Math.max(hooked.hp, 50);
      hooked.invuln = 2.0;
      p.score.heal += 200;
      p.ult = clamp(p.ult + 25, 0, K.ULT_CHARGE_MAX);
      ev(world, { t: 'rescue', by: p.id, to: hooked.id, x: hooked.x, y: hooked.y });
    }
    return;
  }

  /* Heal downed / injured teammate */
  var injured = world.players.find(function (q) {
    return q !== p && q.role === ROLES.SURV && (q.state === STATE.DOWNED || (q.state === STATE.ALIVE && q.hp < K.SURV_HP)) && C.dist(p.x, p.y, q.x, q.y) <= K.INTERACT_R;
  });
  if (injured && inp.interact) {
    p.interactKind = 'heal';
    p.interactT += dt;
    var healReq = p.classId === SURV_CLASSES.MEDIC ? 3.5 : 5.0;
    if (p.interactT >= healReq) {
      p.interactT = 0;
      if (injured.state === STATE.DOWNED) {
        injured.state = STATE.ALIVE;
        injured.hp = 50;
      } else {
        injured.hp = Math.min(K.SURV_HP, injured.hp + 50);
      }
      p.score.heal += 150;
      ev(world, { t: 'heal', by: p.id, to: injured.id, x: injured.x, y: injured.y });
    }
    return;
  }

  /* Channel Gate */
  for (var gi = 0; gi < world.gates.length; gi++) {
    var g = world.gates[gi];
    if (g.powered && !g.open && C.dist(p.x, p.y, g.x, g.y) <= K.GATE_R && inp.interact) {
      p.interactKind = 'gate';
      g.progress = clamp(g.progress + dt / K.GATE_CHANNEL, 0, 1);
      if (g.progress >= 1) {
        g.open = true;
        p.score.obj += 250;
        ev(world, { t: 'gateDone', id: g.id, by: p.id, x: g.x, y: g.y });
      }
      return;
    }
  }

  /* Work Anchor */
  var anc = nearestAnchor(world, p);
  if (anc && !anc.done && inp.interact) {
    p.interactKind = 'repair';
    p.interactId = anc.id;
    anc.workers.push(p.id);

    /* Overclock toggle */
    p.overclock = inp.sprint ? 1 : 0;

    var n = Math.min(3, anc.workers.length);
    var baseRate = n === 1 ? K.ANCHOR_RATE_1 : (n === 2 ? K.ANCHOR_RATE_2 : K.ANCHOR_RATE_3);
    if (p.classId === SURV_CLASSES.ENGINEER) baseRate *= 1.25;
    if (p.overclock) baseRate *= K.OVERCLOCK_SPEED_MUL;

    anc.progress = clamp(anc.progress + baseRate * dt, 0, 1);
    p.score.obj += dt * (p.overclock ? 14 : 7);

    /* Dynamic Skill Check Trigger */
    var checkChance = p.overclock ? K.SKILL_CHECK_CHANCE * 1.8 : K.SKILL_CHECK_CHANCE;
    if (!p.skill && world.time - (anc.lastSkill || 0) > (p.overclock ? 1.8 : K.SKILL_CHECK_EVERY) && rndSkill() < checkChance * dt) {
      anc.lastSkill = world.time;
      p.skill = { t: 0, ttl: 1.0, frac: 0, inGreat: false };
      ev(world, { t: 'skillcheck', by: p.id, x: anc.x, y: anc.y });
    }

    if (p.skill) {
      p.skill.t += dt;
      p.skill.frac = p.skill.t / p.skill.ttl;
      var greatWin = p.classId === SURV_CLASSES.ENGINEER ? 0.08 : K.SKILL_GREAT;
      p.skill.inGreat = p.skill.frac >= 0.70 && p.skill.frac <= (0.70 + greatWin);

      if (inp.dash || inp.attack) {
        /* Skill check hit attempt */
        if (p.skill.inGreat) {
          var bonusChunk = p.overclock ? 0.06 : 0.025;
          anc.progress = clamp(anc.progress + bonusChunk, 0, 1);
          p.score.obj += p.overclock ? 120 : 60;
          p.ult = clamp(p.ult + 8, 0, K.ULT_CHARGE_MAX);
          ev(world, { t: 'great', by: p.id, x: anc.x, y: anc.y });
        } else if (p.skill.frac >= 0.60 && p.skill.frac <= 0.88) {
          p.score.obj += 25;
          ev(world, { t: 'good', by: p.id, x: anc.x, y: anc.y });
        } else {
          /* Missed skill check */
          var missPen = p.overclock ? 0.12 : K.SKILL_MISS_REGRESS;
          anc.progress = clamp(anc.progress - missPen, 0, 1);
          alert(world, anc.x, anc.y, 2.0, 'fail');
          if (p.overclock) {
            p.hp = Math.max(1, p.hp - 12);
            p.stun = 0.7;
            ev(world, { t: 'overclockShock', by: p.id, x: anc.x, y: anc.y });
          } else {
            ev(world, { t: 'fail', by: p.id, x: anc.x, y: anc.y });
          }
        }
        p.skill = null;
      } else if (p.skill.t >= p.skill.ttl) {
        anc.progress = clamp(anc.progress - K.SKILL_MISS_REGRESS, 0, 1);
        alert(world, anc.x, anc.y, 2.0, 'fail');
        ev(world, { t: 'fail', by: p.id, x: anc.x, y: anc.y });
        p.skill = null;
      }
    }

    if (anc.progress >= 1 && !anc.done) {
      anc.done = true;
      anc.progress = 1;
      world.stats.anchorsDone++;
      var sl = world.players.find(function (pl) { return pl.role === ROLES.SLAYER; });
      if (sl) sl.rage = Math.min(K.RAGE_MAX, sl.rage + 25);
      ev(world, { t: 'anchorDone', id: anc.id, by: p.id, x: anc.x, y: anc.y });
      if (anchorsDone(world) >= K.ANCHORS_NEEDED) {
        powerGates(world);
      }
    }
    return;
  }

  p.interactKind = null;
  p.interactT = 0;
  p.skill = null;
}

function powerGates(world) {
  for (var i = 0; i < world.gates.length; i++) world.gates[i].powered = true;
  ev(world, { t: 'gatesPowered' });
}

function nearestAnchor(world, p) {
  var best = null, bd = Infinity, reach = K.ANCHOR_R + K.INTERACT_R;
  for (var i = 0; i < world.anchors.length; i++) {
    var a = world.anchors[i];
    if (a.done) continue;
    var d = C.dist(p.x, p.y, a.x, a.y);
    if (d <= reach && d < bd) { bd = d; best = a; }
  }
  return best;
}

function anchorsDone(world) {
  var c = 0;
  for (var i = 0; i < world.anchors.length; i++) if (world.anchors[i].done) c++;
  return c;
}

/* ============================ COMBAT RESOLUTION ============================ */

function startAttack(world, p) {
  p.atkPhase = 'windup';
  var isSlayer = p.role === ROLES.SLAYER;
  var windup = isSlayer ? K.SLAYER_ATK_WINDUP : (p.classId === SURV_CLASSES.DUELIST ? K.SURV_ATK_WINDUP * 0.75 : K.SURV_ATK_WINDUP);
  p.atkT = windup;
  p.atkHitDone = false;
  ev(world, { t: 'swing', by: p.id, role: p.role, x: p.x, y: p.y, ang: p.facing });
}

function resolveAttackHit(world, p) {
  var isSlayer = p.role === ROLES.SLAYER;
  var range = isSlayer ? (p.rageT > 0 ? K.SLAYER_ATK_RANGE * 1.25 : K.SLAYER_ATK_RANGE) : (p.classId === SURV_CLASSES.DUELIST ? K.SURV_ATK_RANGE * 1.15 : K.SURV_ATK_RANGE);
  var arc = isSlayer ? K.SLAYER_ATK_ARC : K.SURV_ATK_ARC;
  var baseDmg = isSlayer ? (p.rageT > 0 ? K.SLAYER_ATK_DMG * 1.2 : K.SLAYER_ATK_DMG) : (p.classId === SURV_CLASSES.DUELIST ? K.SURV_ATK_DMG + 10 : K.SURV_ATK_DMG);
  var stunTime = isSlayer ? 0 : (p.classId === SURV_CLASSES.DUELIST ? K.SURV_ATK_STUN * 1.2 : K.SURV_ATK_STUN);

  var hitAny = false;
  for (var i = 0; i < world.players.length; i++) {
    var q = world.players[i];
    if (q === p || q.role === p.role) continue;
    if (q.state === STATE.DEAD || q.state === STATE.ESCAPED || q.state === STATE.CARRIED || q.state === STATE.HOOKED) continue;
    if (q.inLocker >= 0) continue;
    if (q.invuln > 0 || q.iframes > 0) continue;

    var d = C.dist(p.x, p.y, q.x, q.y);
    if (d > range + K.PLAYER_R) continue;

    var angTo = Math.atan2(q.y - p.y, q.x - p.x);
    if (Math.abs(C.angDiff(p.aim, angTo)) > arc * 0.5) continue;

    /* Check for Parry / Clash */
    if (isSlayer && q.atkPhase && (q.atkPhase === 'windup' || q.atkPhase === 'active')) {
      var survFacingAngle = Math.abs(C.angDiff(q.aim, Math.atan2(p.y - q.y, p.x - q.x)));
      if (survFacingAngle < 1.8) {
        /* Clash Parry successful! */
        p.stun = 0.75;
        p.rage = Math.min(K.RAGE_MAX, p.rage + 22);
        q.riposteT = 0.85;
        q.score.stun += 180;
        ev(world, { t: 'parry', by: q.id, slayerId: p.id, x: (p.x + q.x) * 0.5, y: (p.y + q.y) * 0.5 });
        hitAny = true;
        continue;
      }
    }

    /* Check for Riposte Counter-Attack by Survivor */
    if (!isSlayer && p.riposteT > 0) {
      baseDmg += 20;
      stunTime += 0.4;
      p.riposteT = 0;
      ev(world, { t: 'riposte', by: p.id, to: q.id, x: q.x, y: q.y });
    }

    /* Normal damage application */
    damage(world, p, q, baseDmg, stunTime, 'slash');
    hitAny = true;
  }

  if (hitAny) {
    ev(world, { t: 'slash', by: p.id, x: p.x, y: p.y, ang: p.facing });
  } else {
    ev(world, { t: 'whiff', by: p.id });
  }
}

function startUlt(world, p) {
  var isSlayer = p.role === ROLES.SLAYER;
  p.ult = 0;
  p.ultT = isSlayer ? K.SLAYER_ULT_TIME : K.SURV_ULT_TIME;
  p.ultAng = p.aim;

  if (isSlayer) {
    /* Trigger Awakening Berserk */
    p.rageT = K.AWAKENING_TIME;
    ev(world, { t: 'awakening', slayerId: p.id, x: p.x, y: p.y });
  }

  ev(world, { t: isSlayer ? 'ultSlayer' : 'ultSurv', by: p.id, x: p.x, y: p.y, ang: p.ultAng });
}

function resolveUltHit(world, p) {
  var isSlayer = p.role === ROLES.SLAYER;
  var r = isSlayer ? K.SLAYER_ULT_R : K.SURV_ULT_R;
  var dmg = isSlayer ? K.SLAYER_ULT_DMG : K.SURV_ULT_DMG;

  for (var i = 0; i < world.players.length; i++) {
    var q = world.players[i];
    if (q === p || q.role === p.role || !alive(q)) continue;
    if (q.inLocker >= 0) continue;
    if (C.dist(p.x, p.y, q.x, q.y) <= r + K.PLAYER_R) {
      damage(world, p, q, dmg, 1.4, 'ult');
    }
  }
}

function damage(world, attacker, target, amount, stunTime, kind) {
  if (target.invuln > 0 || target.iframes > 0) return;
  target.hp -= amount;
  target.hitFlash = 0.25;
  if (stunTime > 0) target.stun = Math.max(target.stun, stunTime);

  if (attacker) {
    attacker.score.dmg += amount;
    attacker.ult = clamp(attacker.ult + (amount * 0.4), 0, K.ULT_CHARGE_MAX);
  }

  ev(world, { t: 'hit', from: attacker ? attacker.id : -1, to: target.id, dmg: amount, kind: kind, x: target.x, y: target.y });

  if (target.hp <= 0) {
    if (target.role === ROLES.SURV) {
      target.state = STATE.DOWNED;
      target.hp = 0;
      target.bleed = K.BLEEDOUT;
      ev(world, { t: 'down', by: attacker ? attacker.id : -1, to: target.id, x: target.x, y: target.y });
    } else if (target.role === ROLES.SLAYER) {
      endMatch(world, 'survivors', 'regicide');
    }
  }
}

function eliminate(world, p, cause) {
  if (p.state === STATE.DEAD) return;
  p.state = STATE.DEAD;
  p.hp = 0;
  world.stats.eliminations++;
  if (p.hookId >= 0) {
    var hk = world.hooks.find(function (h) { return h.id === p.hookId; });
    if (hk) hk.occupant = -1;
    p.hookId = -1;
  }
  ev(world, { t: 'eliminate', to: p.id, x: p.x, y: p.y, cause: cause });
  checkEnd(world);
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

function stepCarried(world, p, dt) {
  var carrier = world.byId.get(p.carrier);
  if (carrier) {
    p.x = carrier.x;
    p.y = carrier.y;
  }
}

function stepCarry(world, slayer, inp, dt) {
  var victim = world.byId.get(slayer.carrying);
  if (!victim || victim.state !== STATE.CARRIED) {
    slayer.carrying = -1;
    return;
  }
  victim.carryT += dt;
  if (victim.carryT >= 12.0) {
    /* Wiggled free */
    dropCarried(world, slayer, 'wiggle');
    return;
  }

  /* Hook victim if near hook */
  for (var i = 0; i < world.hooks.length; i++) {
    var hk = world.hooks[i];
    if (hk.occupant < 0 && C.dist(slayer.x, slayer.y, hk.x, hk.y) <= K.INTERACT_R) {
      if (inp.interact) {
        hk.occupant = victim.id;
        victim.state = STATE.HOOKED;
        victim.hookId = hk.id;
        victim.hookT = K.HOOK_TIME;
        victim.carrier = -1;
        slayer.carrying = -1;
        slayer.score.obj += 200;
        ev(world, { t: 'hook', by: slayer.id, to: victim.id, hookId: hk.id, x: hk.x, y: hk.y });
        return;
      }
    }
  }
}

function dropCarried(world, slayer, reason) {
  var victim = world.byId.get(slayer.carrying);
  if (victim) {
    victim.state = STATE.ALIVE;
    victim.hp = 50;
    victim.invuln = 1.5;
    victim.carrier = -1;
    ev(world, { t: 'dropVictim', by: slayer.id, to: victim.id, reason: reason, x: victim.x, y: victim.y });
  }
  slayer.carrying = -1;
  slayer.stun = 1.2;
}

function updateAnchors(world, dt, rndSkill) {
  for (var i = 0; i < world.anchors.length; i++) {
    var a = world.anchors[i];
    a.marked = Math.max(0, a.marked - dt);
    a.workers.length = 0;
  }
}

function updateGates(world, dt) {
  for (var i = 0; i < world.gates.length; i++) {
    var g = world.gates[i];
    if (g.open) {
      for (var j = 0; j < world.players.length; j++) {
        var p = world.players[j];
        if (p.role === ROLES.SURV && p.state === STATE.ALIVE && C.dist(p.x, p.y, g.x, g.y) <= K.GATE_R) {
          p.state = STATE.ESCAPED;
          p.score.escape += 500;
          world.stats.escapes++;
          ev(world, { t: 'escape', by: p.id, x: g.x, y: g.y });
        }
      }
    }
  }
}

function moveAndCollide(world, p, dt) {
  var nx = p.x + p.vx * dt;
  var ny = p.y + p.vy * dt;

  var r = K.PLAYER_R;
  var W = K.WORLD.w, H = K.WORLD.h, T = 60;
  nx = clamp(nx, T + r, W - T - r);
  ny = clamp(ny, T + r, H - T - r);

  for (var i = 0; i < world.props.length; i++) {
    var pr = world.props[i];
    if (pr.type === 'vault') continue;
    var resolved = C.resolveCircleBox(nx, ny, r, pr.x, pr.y, pr.w, pr.h);
    if (resolved) { nx = resolved.x; ny = resolved.y; }
  }

  for (var j = 0; j < (world.pallets || []).length; j++) {
    var pal = world.pallets[j];
    if (pal.palletState === 'down') {
      var resP = C.resolveCircleBox(nx, ny, r, pal.x - pal.w * 0.5, pal.y - pal.h * 0.5, pal.w, pal.h);
      if (resP) { nx = resP.x; ny = resP.y; }
    }
  }

  p.x = nx; p.y = ny;
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
  if (aliveSurv === 0 && surv > 0) {
    endMatch(world, 'slayer', escaped > 0 ? 'partial' : 'wipe');
    return;
  }
  if (escaped >= Math.max(1, Math.ceil(surv * 0.5))) {
    endMatch(world, 'survivors', 'escape');
  }
}

function endMatch(world, winner, reason) {
  if (world.phase === PHASE.OVER) return;
  world.phase = PHASE.OVER;
  world.winner = winner;
  world.winReason = reason;
  ev(world, { t: 'matchEnd', winner: winner, reason: reason });
}

function alert(world, x, y, dur, kind) {
  world.alerts.push({ x: x, y: y, t: dur || 1.5, kind: kind || 'noise' });
  if (world.alerts.length > 20) world.alerts.shift();
}

function ev(world, e) {
  world.events.push(e);
}

function alive(p) {
  return p.state === STATE.ALIVE || p.state === STATE.DOWNED;
}

function acting(p) {
  return p.state === STATE.ALIVE;
}

function getPlayer(world, id) {
  return world.byId.get(id) || null;
}

function teamOf(world, role) {
  return world.players.filter(function (p) { return p.role === role; });
}

function distanceToSlayer(world, p) {
  var sl = world.players.find(function (q) { return q.role === ROLES.SLAYER; });
  return sl ? C.dist(p.x, p.y, sl.x, sl.y) : Infinity;
}

function grade(scoreOrPlayer) {
  var s = scoreOrPlayer && scoreOrPlayer.score ? scoreOrPlayer.score : (scoreOrPlayer || {});
  var total = (s.obj || 0) + (s.chase || 0) + (s.stun || 0) + (s.heal || 0) + (s.dmg || 0) + (s.escape || 0);
  var g = 'D';
  if (total > 1600) g = 'S';
  else if (total > 1100) g = 'A';
  else if (total > 650) g = 'B';
  else if (total > 300) g = 'C';
  return { grade: g, total: Math.round(total) };
}

function prepareExport(world) {
  return prepare(world);
}

/* ============================ STATE ROLLBACK / CAPTURE ============================ */

function clonePlayer(p) {
  var copy = {};
  for (var i = 0; i < PLAYER_FIELDS.length; i++) {
    var k = PLAYER_FIELDS[i];
    if (k === 'score') {
      copy.score = Object.assign({}, p.score);
    } else if (k === 'skill') {
      copy.skill = p.skill ? Object.assign({}, p.skill) : null;
    } else {
      copy[k] = p[k];
    }
  }
  return copy;
}

function cloneList(arr) {
  return (arr || []).map(function (item) { return Object.assign({}, item); });
}

function captureState(world) {
  return {
    seed: world.seed, tick: world.tick, time: world.time, phase: world.phase,
    stats: Object.assign({}, world.stats),
    winner: world.winner, winReason: world.winReason,
    players: world.players.map(clonePlayer),
    anchors: cloneList(world.anchors),
    gates: cloneList(world.gates),
    hooks: cloneList(world.hooks),
    traps: cloneList(world.traps),
    pallets: cloneList(world.pallets),
    chests: cloneList(world.chests),
    lockers: cloneList(world.lockers),
    echoes: cloneList(world.echoes),
    alerts: cloneList(world.alerts),
    events: cloneList(world.events),
    nextId: world.nextId,
    rndAiTick: world.rndAiTick
  };
}

function restoreState(world, cap) {
  world.seed = cap.seed; world.tick = cap.tick; world.time = cap.time; world.phase = cap.phase;
  world.stats = Object.assign({}, cap.stats);
  world.winner = cap.winner; world.winReason = cap.winReason;
  world.nextId = cap.nextId; world.rndAiTick = cap.rndAiTick;
  world.byId.clear();
  world.players = cap.players.map(function (cp) {
    var p = clonePlayer(cp);
    world.byId.set(p.id, p);
    return p;
  });
  world.anchors = cloneList(cap.anchors);
  world.gates = cloneList(cap.gates);
  world.hooks = cloneList(cap.hooks);
  world.traps = cloneList(cap.traps || []);
  world.pallets = cloneList(cap.pallets || []);
  world.chests = cloneList(cap.chests || []);
  world.lockers = cloneList(cap.lockers || []);
  world.echoes = cloneList(cap.echoes);
  world.alerts = cloneList(cap.alerts);
  world.events = cloneList(cap.events);
  world.rndAi = null;
  return world;
}

function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }

function snapshot(world) {
  var ps = [];
  for (var i = 0; i < world.players.length; i++) {
    var p = world.players[i];
    ps.push({
      id: p.id, role: p.role, name: p.name, bot: p.bot ? 1 : 0,
      classId: p.classId || (p.role === ROLES.SLAYER ? 'sovereign' : 'duelist'),
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
      hitFlash: round2(p.hitFlash), boostT: round2(p.boostT || 0),
      item: p.item || '', itemUses: p.itemUses || 0, blindT: round2(p.blindT || 0),
      riposteT: round2(p.riposteT || 0), rewindCd: round2(p.rewindCd || 0),
      rage: round1(p.rage || 0), rageT: round2(p.rageT || 0),
      inLocker: p.inLocker !== undefined ? p.inLocker : -1,
      overclock: p.overclock || 0
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
  var ts = [];
  for (var t = 0; t < (world.traps || []).length; t++) {
    var tr = world.traps[t];
    ts.push({ id: tr.id, x: round1(tr.x), y: round1(tr.y), arm: round2(tr.arm), by: tr.by });
  }
  var pls = [];
  for (var pl = 0; pl < (world.pallets || []).length; pl++) {
    var pItem = world.pallets[pl];
    pls.push({ id: pItem.id, x: round1(pItem.x), y: round1(pItem.y), palletState: pItem.palletState });
  }
  var chs = [];
  for (var ch = 0; ch < (world.chests || []).length; ch++) {
    var cItem = world.chests[ch];
    chs.push({ id: cItem.id, x: round1(cItem.x), y: round1(cItem.y), searched: cItem.searched ? 1 : 0 });
  }
  var lks = [];
  for (var lk = 0; lk < (world.lockers || []).length; lk++) {
    var lItem = world.lockers[lk];
    lks.push({ id: lItem.id, x: round1(lItem.x), y: round1(lItem.y), occupant: lItem.occupant });
  }

  return {
    v: 1, seed: world.seed, tick: world.tick, phase: world.phase,
    time: round2(world.time), players: ps, anchors: as, gates: gs, hooks: hs,
    traps: ts, pallets: pls, chests: chs, lockers: lks,
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
      classId: sp.classId || (sp.role === ROLES.SLAYER ? 'sovereign' : 'duelist'),
      x: sp.x, y: sp.y, z: sp.z || 0, vx: 0, vy: 0, facing: sp.facing,
      hp: sp.hp, maxHp: sp.role === ROLES.SLAYER ? K.SLAYER_HP : K.SURV_HP,
      state: sp.state, stamina: sp.stamina, stamDelay: 0, healDelay: 0,
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
      aim: sp.facing, flash: 0, hitFlash: sp.hitFlash, sprintingNow: false,
      boostT: sp.boostT || 0, vaultCd: 0,
      item: sp.item || null, itemUses: sp.itemUses || 0,
      blindT: sp.blindT || 0, riposteT: sp.riposteT || 0, rewindCd: sp.rewindCd || 0,
      rage: sp.rage || 0, rageT: sp.rageT || 0, inLocker: sp.inLocker !== undefined ? sp.inLocker : -1,
      heavyCharge: 0, overclock: sp.overclock || 0
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
  world.traps = (s.traps || []).map(function (tr) {
    return { id: tr.id, x: tr.x, y: tr.y, arm: tr.arm, by: tr.by };
  });
  world.pallets = (s.pallets || []).map(function (pal) {
    return { id: pal.id, x: pal.x, y: pal.y, w: 52, h: 16, ang: 0, palletState: pal.palletState, hp: 100 };
  });
  world.chests = (s.chests || []).map(function (ch) {
    return { id: ch.id, x: ch.x, y: ch.y, searched: !!ch.searched, searchT: 0, opener: -1 };
  });
  world.lockers = (s.lockers || []).map(function (lk) {
    return { id: lk.id, x: lk.x, y: lk.y, occupant: lk.occupant };
  });
  world.echoes = (s.echoes || []).map(function (e) { return { x: e.x, y: e.y, t: e.t, by: -1 }; });
  world.alerts = (s.alerts || []).map(function (e) { return { x: e.x, y: e.y, kind: e.kind, t: e.t }; });
  return world;
}

function hashValue(h, val) {
  if (val === null || val === undefined) return C.fnvByte(h, 0);
  if (typeof val === 'number') return C.fnvNum(h, val);
  if (typeof val === 'string') {
    for (var i = 0; i < val.length; i++) h = C.fnvByte(h, val.charCodeAt(i));
    return h;
  }
  if (typeof val === 'boolean') return C.fnvByte(h, val ? 1 : 2);
  if (Array.isArray(val)) {
    h = C.fnvByte(h, 91);
    for (var a = 0; a < val.length; a++) h = hashValue(h, val[a]);
    return C.fnvByte(h, 93);
  }
  if (typeof val === 'object') {
    h = C.fnvByte(h, 123);
    var keys = Object.keys(val).sort();
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      for (var ki = 0; ki < key.length; ki++) h = C.fnvByte(h, key.charCodeAt(ki));
      h = C.fnvByte(h, 58);
      h = hashValue(h, val[key]);
    }
    return C.fnvByte(h, 125);
  }
  return h;
}

function worldHash(world) {
  return hashValue(C.fnv(), snapshot(world));
}

return {
  K: K,
  ROLES: ROLES,
  SURV_CLASSES: SURV_CLASSES,
  SLAYER_ARCHETYPES: SLAYER_ARCHETYPES,
  STATE: STATE,
  PHASE: PHASE,
  F: F,
  makeInput: makeInput,
  inputFlags: inputFlags,
  inputFromFlags: inputFromFlags,
  makeWorld: makeWorld,
  buildArena: buildArena,
  addPlayer: addPlayer,
  prepare: prepare,
  beginMatch: beginMatch,
  step: step,
  snapshot: snapshot,
  applySnapshot: applySnapshot,
  worldHash: worldHash,
  captureState: captureState,
  restoreState: restoreState,
  PLAYER_FIELDS: PLAYER_FIELDS,
  getPlayer: getPlayer,
  teamOf: teamOf,
  alive: alive,
  acting: acting,
  anchorsDone: anchorsDone,
  distanceToSlayer: distanceToSlayer,
  grade: grade,
  endMatch: endMatch,
  blocked: blocked
};
});
