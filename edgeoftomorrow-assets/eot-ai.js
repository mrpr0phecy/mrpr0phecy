/* EOT AI — deterministic bot brains.
 *
 * Bots are not a fallback, they are part of the sim: a lobby of one human and
 * four bots plays exactly like a full match, and the same code fills empty
 * slots in an online room. Because they run *inside* the tick and draw only
 * from the seeded stream on `world.rndAi`, they cannot desync a peer.
 *
 * Brain shape: pick a goal, steer around obstacles, act when in range. The
 * steering is a cheap fan-of-candidates sampler rather than A* — it is good
 * enough for open arenas with scattered cover, costs nothing, and never needs
 * a navmesh rebuild when the map regenerates.
 *
 * Tactical Bot Behaviors:
 *   - Survivors: loop pallets, drop pallets on chasing Slayer, counter-parry / riposte,
 *     use Chrono-Rewind when cornered, search supply crates, use Flash Flares & Serums,
 *     unhook and heal teammates, calibrate anchors with great skill checks.
 *   - Slayers: hunt scratch echoes, smash blocking pallets, search lockers, unleash
 *     Rift Rage Awakening, and carry/hook downed victims.
 */
(function (root, factory) {
  var C = typeof globalThis !== 'undefined' && globalThis.EOTCore ? globalThis.EOTCore : require('./eot-core.js');
  var S = typeof globalThis !== 'undefined' && globalThis.EOTSim ? globalThis.EOTSim : require('./eot-sim.js');
  var api = factory(C, S);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EOTAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, S) {
'use strict';

var K = S.K, STATE = S.STATE, ROLES = S.ROLES;
var clamp = C.clamp;

var NAMES_SURV = ['Rin', 'Kaito', 'Yuki', 'Sora', 'Akira', 'Mio', 'Ren', 'Hana'];
var NAMES_SLAYER = ['VOIDREIGN', 'HOLLOW KING', 'NIGHTFANG', 'CRIMSON ZERO'];

function nameFor(role, i) {
  return role === ROLES.SLAYER ? NAMES_SLAYER[i % NAMES_SLAYER.length] : NAMES_SURV[i % NAMES_SURV.length];
}

/* ---------------- Obstacle-aware steering ---------------- */
function steer(world, p, gx, gy) {
  var dx = gx - p.x, dy = gy - p.y;
  var d = Math.sqrt(dx * dx + dy * dy) || 1;
  var wantA = Math.atan2(dy, dx);
  var bestA = wantA, bestScore = -Infinity;
  var probes = 9, spread = Math.PI * 0.85;
  for (var i = 0; i < probes; i++) {
    var a = wantA + (i / (probes - 1) - 0.5) * 2 * spread;
    var clear = lookahead(world, p.x, p.y, a, 58);
    var align = Math.cos(C.angDiff(wantA, a));
    var score = align * 1.0 + clear * 1.6;
    if (score > bestScore) { bestScore = score; bestA = a; }
  }
  return { x: Math.cos(bestA), y: Math.sin(bestA), ang: bestA, clear: bestScore };
}

function lookahead(world, x, y, ang, dist) {
  var steps = 4;
  for (var s = 1; s <= steps; s++) {
    var t = (s / steps) * dist;
    var px = x + Math.cos(ang) * t, py = y + Math.sin(ang) * t;
    for (var i = 0; i < world.props.length; i++) {
      var pr = world.props[i];
      if (pr.type === 'vault') continue;
      if (C.circleBox(px, py, K.PLAYER_R + 4, pr.x, pr.y, pr.w, pr.h)) return 1 - s / steps;
    }
    for (var j = 0; j < (world.pallets || []).length; j++) {
      var pal = world.pallets[j];
      if (pal.palletState === 'down') {
        if (C.circleBox(px, py, K.PLAYER_R + 4, pal.x - pal.w * 0.5, pal.y - pal.h * 0.5, pal.w, pal.h)) return 1 - s / steps;
      }
    }
  }
  return 1;
}

function lineOfSight(world, ax, ay, bx, by) {
  var steps = Math.min(14, Math.max(3, Math.floor(C.dist(ax, ay, bx, by) / 60)));
  for (var i = 1; i < steps; i++) {
    var t = i / steps;
    var x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    for (var j = 0; j < world.props.length; j++) {
      var pr = world.props[j];
      if (pr.type === 'vault') continue;
      if (x > pr.x && x < pr.x + pr.w && y > pr.y && y < pr.y + pr.h) return false;
    }
  }
  return true;
}

/* ============================ SURVIVOR AI ============================ */
function survivorInput(world, p, out) {
  reset(out);
  var slayer = findSlayer(world);
  var dSlayer = slayer ? C.dist(p.x, p.y, slayer.x, slayer.y) : Infinity;
  /* Fear is earned: a heartbeat through the wall is not a reason to abandon
   * the anchor. Run when the Slayer can actually see you, or is close. */
  var slayerLos = slayer ? lineOfSight(world, p.x, p.y, slayer.x, slayer.y) : false;
  var threatened = dSlayer < 150 || (dSlayer < 260 && slayerLos);
  var rnd = world.rndAi;

  /* Use consumable items when helpful */
  if (p.item === 'serum' && p.hp <= 50) {
    out.item = true;
    out.cancel = true;
  } else if (p.item === 'flare' && slayer && slayer.carrying >= 0 && dSlayer < 220) {
    out.item = true;
    out.cancel = true;
  }

  /* --- 1. Self-preservation & combat maneuvers --- */
  if (threatened && slayer) {
    var los = lineOfSight(world, p.x, p.y, slayer.x, slayer.y);

    /* Riposte opportunity */
    if (p.riposteT > 0 && dSlayer < K.SURV_ATK_RANGE + 25) {
      out.aim = Math.atan2(slayer.y - p.y, slayer.x - p.x);
      out.attack = true;
      return out;
    }

    /* Chrono-Rewind when cornered with low HP */
    if (p.rewindCd <= 0 && p.hp <= 50 && (dSlayer < 100 || slayer.atkPhase === 'windup')) {
      out.rewind = true;
      out.ult = true;
      return out;
    }

    /* Duelist counter-parry */
    if (slayer.atkPhase === 'windup' && dSlayer < K.SLAYER_ATK_RANGE + 35) {
      if ((p.classId === S.SURV_CLASSES.DUELIST || rnd() < 0.45) && p.atkCd <= 0 && !p.atkPhase) {
        out.aim = Math.atan2(slayer.y - p.y, slayer.x - p.x);
        out.attack = true;
        return out;
      }
      if (p.dashCd <= 0 && p.stamina > K.STAM_DASH + 6) {
        var perp = Math.atan2(p.y - slayer.y, p.x - slayer.x) + (rnd() < 0.5 ? 1 : -1) * Math.PI / 2;
        var ds = steer(world, p, p.x + Math.cos(perp) * 120, p.y + Math.sin(perp) * 120);
        out.x = ds.x; out.y = ds.y; out.dash = true;
        out.aim = Math.atan2(slayer.y - p.y, slayer.x - p.x);
        return out;
      }
    }

    /* Drop nearby pallet to stun Slayer */
    for (var pi = 0; pi < (world.pallets || []).length; pi++) {
      var plt = world.pallets[pi];
      if (plt.palletState === 'up' && C.dist(p.x, p.y, plt.x, plt.y) < 46 && dSlayer < 150) {
        out.interact = true;
        out.aim = Math.atan2(slayer.y - p.y, slayer.x - p.x);
        return out;
      }
    }

    /* Fight back when close */
    if (dSlayer < K.SURV_ATK_RANGE + 15) {
      out.aim = Math.atan2(slayer.y - p.y, slayer.x - p.x);
      if (p.atkCd <= 0 && !p.atkPhase) out.attack = true;
      if (p.ult >= K.ULT_CHARGE_MAX) out.ult = true;
      if (p.hp < K.SURV_HP * 0.55 || p.atkPhase === 'recover') {
        var away2 = Math.atan2(p.y - slayer.y, p.x - slayer.x);
        var s2 = steer(world, p, p.x + Math.cos(away2) * 180, p.y + Math.sin(away2) * 180);
        out.x = s2.x; out.y = s2.y; out.sprint = p.stamina > 15;
      }
      return out;
    }

    /* Vault looping */
    for (var vi = 0; vi < world.props.length; vi++) {
      var vpr = world.props[vi];
      if (vpr.type === 'vault') {
        var vcx = vpr.x + vpr.w * 0.5, vcy = vpr.y + vpr.h * 0.5;
        var vd = C.dist(p.x, p.y, vcx, vcy);
        if (vd < 160 && p.stamina > 15) {
          var vs = steer(world, p, vcx + (p.x < vcx ? 80 : -80), vcy + (p.y < vcy ? 80 : -80));
          out.x = vs.x; out.y = vs.y;
          out.aim = Math.atan2(slayer.y - p.y, slayer.x - p.x);
          out.sprint = true;
          return out;
        }
      }
    }

    /* Break line of sight */
    var awayA = Math.atan2(p.y - slayer.y, p.x - slayer.x);
    var bestA = awayA, bestScore = -Infinity;
    for (var c = 0; c < 7; c++) {
      var cand = awayA + (c / 6 - 0.5) * Math.PI * 1.4;
      var tx = p.x + Math.cos(cand) * 240, ty = p.y + Math.sin(cand) * 240;
      var clear = lookahead(world, p.x, p.y, cand, 130);
      var blind = lineOfSight(world, tx, ty, slayer.x, slayer.y) ? 0 : 1.4;
      var score = clear * 1.2 + blind + Math.cos(cand - awayA) * 0.5;
      if (score > bestScore) { bestScore = score; bestA = cand; }
    }
    var s = steer(world, p, p.x + Math.cos(bestA) * 200, p.y + Math.sin(bestA) * 200);
    out.x = s.x; out.y = s.y;
    out.aim = Math.atan2(slayer.y - p.y, slayer.x - p.x);
    out.sprint = p.stamina > 18;
    if (dSlayer < 140 && p.dashCd <= 0 && p.stamina > K.STAM_DASH + 10) out.dash = true;
    if (p.ult >= K.ULT_CHARGE_MAX && dSlayer < K.SURV_ULT_R) out.ult = true;
    return out;
  }

  /* Is the Slayer occupied with someone else? Then the team can move. */
  var slayerBusy = false;
  if (slayer) {
    for (var sb = 0; sb < world.players.length; sb++) {
      var o = world.players[sb];
      if (o !== p && o.role !== ROLES.SLAYER && o.state === STATE.ALIVE && o.inChase &&
          C.dist(slayer.x, slayer.y, o.x, o.y) < 320) { slayerBusy = true; break; }
    }
  }

  /* --- 2. Rescue a downed teammate if safe --- */
  var downed = null, bd = Infinity;
  for (var i = 0; i < world.players.length; i++) {
    var q = world.players[i];
    if (q === p || q.role === ROLES.SLAYER || q.state !== STATE.DOWNED) continue;
    var d = C.dist(p.x, p.y, q.x, q.y);
    if (d < bd) { bd = d; downed = q; }
  }
  if (downed && (dSlayer > 220 || !slayer || (slayerBusy && dSlayer > 160))) {
    var sd = steer(world, p, downed.x, downed.y);
    out.x = sd.x; out.y = sd.y; out.aim = Math.atan2(downed.y - p.y, downed.x - p.x);
    out.sprint = bd > 80;
    if (bd < K.PLAYER_R + 24) { out.interact = true; out.sprint = false; out.x = 0; out.y = 0; }
    return out;
  }

  /* --- 3. Unhook a hooked teammate. Saves under pressure are the whole
   *     drama of the role: go when the coast is clear, or risk it when the
   *     hook is about to drag them a stage deeper. --- */
  for (var h = 0; h < world.players.length; h++) {
    var m = world.players[h];
    if (m === p || m.role === ROLES.SLAYER || m.state !== STATE.HOOKED) continue;
    var desperate = m.hookT < 6 && dSlayer > 140;
    var canSave = dSlayer > 150 || desperate || (slayerBusy && dSlayer > 110);
    if (!canSave) continue;
    var hd = C.dist(p.x, p.y, m.x, m.y);
    var hs = steer(world, p, m.x, m.y);
    out.x = hs.x; out.y = hs.y; out.aim = Math.atan2(m.y - p.y, m.x - p.x);
    out.sprint = hd > 90;
    if (hd < K.INTERACT_R - 8) { out.interact = true; out.sprint = false; out.x = 0; out.y = 0; }
    return out;
  }

  /* --- 3b. Patch up an injured teammate when the Slayer is elsewhere.
   *     One caregiver per patient — a team of four must not spend the whole
   *     match playing ambulance while the anchors go unsealed. --- */
  if (dSlayer > 320 || !slayer) {
    var hurt = null, hbd = Infinity;
    for (var hi = 0; hi < world.players.length; hi++) {
      var q2 = world.players[hi];
      if (q2 === p || q2.role === ROLES.SLAYER) continue;
      if (q2.state !== STATE.ALIVE || q2.hp >= S.K.SURV_HP * 0.85) continue;
      var claimed = false;
      for (var hc = 0; hc < world.players.length; hc++) {
        var helper = world.players[hc];
        if (helper === p || helper.role !== ROLES.SURV || helper.state !== STATE.ALIVE) continue;
        if (helper.interactKind === 'heal' && C.dist(helper.x, helper.y, q2.x, q2.y) < 60) { claimed = true; break; }
      }
      if (claimed) continue;
      var hdist = C.dist(p.x, p.y, q2.x, q2.y);
      if (hdist < hbd) { hbd = hdist; hurt = q2; }
    }
    if (hurt && ((hbd < 90 && hurt.hp < 70) || (hbd < 220 && hurt.hp < 35))) {
      if (hbd < K.INTERACT_R - 8) {
        out.interact = true; out.x = 0; out.y = 0;
        out.aim = Math.atan2(hurt.y - p.y, hurt.x - p.x);
      } else {
        var hst = steer(world, p, hurt.x, hurt.y);
        out.x = hst.x; out.y = hst.y;
        out.aim = Math.atan2(hurt.y - p.y, hurt.x - p.x);
        out.sprint = true;
      }
      return out;
    }
  }

  /* --- 4. Escape if a gate is open --- */
  for (var g = 0; g < world.gates.length; g++) {
    var gate = world.gates[g];
    if (!gate.open) continue;
    var gs = steer(world, p, gate.x, gate.y);
    out.x = gs.x; out.y = gs.y; out.aim = Math.atan2(gate.y - p.y, gate.x - p.x);
    out.sprint = true;
    if (C.dist(p.x, p.y, gate.x, gate.y) < gate.r) { out.sprint = false; }
    return out;
  }

  /* --- 4b. Gates are powered: go open one --- */
  var poweredGate = null, pgd = Infinity;
  for (var pgi = 0; pgi < world.gates.length; pgi++) {
    var pg2 = world.gates[pgi];
    if (!pg2.powered || pg2.open) continue;
    var pgdd = C.dist(p.x, p.y, pg2.x, pg2.y);
    if (pgdd < pgd) { pgd = pgdd; poweredGate = pg2; }
  }
  if (poweredGate && shouldOpenGate(world, p, poweredGate)) {
    var og = steer(world, p, poweredGate.x, poweredGate.y);
    out.x = og.x; out.y = og.y; out.aim = Math.atan2(poweredGate.y - p.y, poweredGate.x - p.x);
    out.sprint = pgd > 100;
    if (pgd < K.GATE_R - 8) { out.interact = true; out.sprint = false; out.x = 0; out.y = 0; }
    return out;
  }

  /* --- 5. Grab a supply crate only if it is genuinely on the way ---
   *     (this used to roll every tick, so every bot detoured to crates
   *     constantly and the anchors never got sealed) */
  if (!p.item && rnd() < 0.015) {
    for (var ci = 0; ci < (world.chests || []).length; ci++) {
      var ch = world.chests[ci];
      if (!ch.searched && C.dist(p.x, p.y, ch.x, ch.y) < 110) {
        var cs = steer(world, p, ch.x, ch.y);
        out.x = cs.x; out.y = cs.y;
        if (C.dist(p.x, p.y, ch.x, ch.y) < K.CHEST_R - 8) {
          out.interact = true; out.x = 0; out.y = 0;
        }
        return out;
      }
    }
  }

  /* --- 6. Default: work the nearest unfinished anchor --- */
  var target = null, tbd = Infinity;
  for (var a = 0; a < world.anchors.length; a++) {
    var an = world.anchors[a];
    if (an.done) continue;
    var ad = C.dist(p.x, p.y, an.x, an.y) - an.progress * (p.classId === S.SURV_CLASSES.ENGINEER ? 240 : 180);
    /* Spread the team: an anchor a mate is already working is someone else's. */
    for (var wj = 0; wj < world.players.length; wj++) {
      var mate = world.players[wj];
      if (mate === p || mate.role !== ROLES.SURV || mate.state !== STATE.ALIVE) continue;
      if (C.dist(mate.x, mate.y, an.x, an.y) < 110) { ad += 320; break; }
    }
    if (ad < tbd) { tbd = ad; target = an; }
  }
  if (!target) {
    var pg = world.gates[0], pbd = Infinity;
    for (var gg = 0; gg < world.gates.length; gg++) {
      var g2 = world.gates[gg];
      var gd = C.dist(p.x, p.y, g2.x, g2.y);
      if (gd < pbd) { pbd = gd; pg = g2; }
    }
    var ps = steer(world, p, pg.x, pg.y);
    out.x = ps.x; out.y = ps.y; out.aim = ps.ang;
    out.sprint = true;
    if (C.dist(p.x, p.y, pg.x, pg.y) < K.GATE_R - 8 && pg.powered) { out.interact = true; out.sprint = false; out.x = 0; out.y = 0; }
    return out;
  }

  var ts = steer(world, p, target.x, target.y);
  out.x = ts.x; out.y = ts.y;
  out.aim = Math.atan2(target.y - p.y, target.x - p.x);
  var td = C.dist(p.x, p.y, target.x, target.y);
  out.sprint = td > 120 && p.stamina > 25;
  if (td < K.ANCHOR_R + K.INTERACT_R - 14) {
    out.interact = true; out.sprint = false; out.x = 0; out.y = 0;
    /* Hit the skill check: great if they can see it, good as the fallback —
     * never press after the window closes (that used to be a forced miss). */
    if (p.skill && (p.skill.inGreat || p.skill.frac >= 0.84)) {
      out.attack = true;
    }
  }
  if (out.interact && rnd() < 0.02) { out.x = rnd() - 0.5; out.y = rnd() - 0.5; }
  return out;
}

/* ============================ SLAYER AI ============================ */
function slayerInput(world, p, out) {
  reset(out);
  var rnd = world.rndAi;

  /* Rift Rage Awakening when ready */
  if (p.rage >= K.RAGE_MAX && !p.rageT) {
    out.ult = true;
  }

  /* --- Carrying: go hook victim --- */
  if (p.carrying >= 0) {
    var hook = null, hd = Infinity;
    for (var i = 0; i < world.hooks.length; i++) {
      var h = world.hooks[i];
      if (h.occupant >= 0) continue;
      var d = C.dist(p.x, p.y, h.x, h.y);
      if (d < hd) { hd = d; hook = h; }
    }
    /* Nothing free? Carry them toward the least-loaded hook anyway — a
     * wiggle-free drop at 12s is a timer the Slayer can read. */
    if (hook) {
      var hs = steer(world, p, hook.x, hook.y);
      out.x = hs.x; out.y = hs.y; out.aim = Math.atan2(hook.y - p.y, hook.x - p.x);
      out.sprint = true;
      if (hd < K.INTERACT_R - 6) { out.interact = true; out.x = 0; out.y = 0; }
      return out;
    }
  }

  /* --- Break dropped pallets blocking path --- */
  for (var pi = 0; pi < (world.pallets || []).length; pi++) {
    var plt = world.pallets[pi];
    if (plt.palletState === 'down' && C.dist(p.x, p.y, plt.x, plt.y) < K.INTERACT_R + 15) {
      out.interact = true;
      out.attack = true;
      return out;
    }
  }

  /* --- Rift Weaver: seed stasis snares on the objectives and chokes --- */
  if (p.classId === S.SLAYER_ARCHETYPES.WEAVER && p.trapCd <= 0 &&
      (world.traps || []).length < S.K.TRAP_MAX && rnd() < 0.10) {
    var atObjective = false;
    for (var ta = 0; ta < world.anchors.length; ta++) {
      if (!world.anchors[ta].done && C.dist(p.x, p.y, world.anchors[ta].x, world.anchors[ta].y) < 120) { atObjective = true; break; }
    }
    for (var tp = 0; tp < (world.pallets || []).length; tp++) {
      if (C.dist(p.x, p.y, world.pallets[tp].x, world.pallets[tp].y) < 90) { atObjective = true; break; }
    }
    if (atObjective) {
      out.item = true;
      return out;
    }
  }

  /* --- Downed survivor nearby: pick up --- */
  var downed = null, dd = Infinity;
  for (var j = 0; j < world.players.length; j++) {
    var q = world.players[j];
    if (q.role === ROLES.SURV && q.state === STATE.DOWNED) {
      var dist = C.dist(p.x, p.y, q.x, q.y);
      if (dist < dd) { dd = dist; downed = q; }
    }
  }
  if (downed && dd < 140) {
    var ds = steer(world, p, downed.x, downed.y);
    out.x = ds.x; out.y = ds.y; out.aim = Math.atan2(downed.y - p.y, downed.x - p.x);
    if (dd < K.PLAYER_R + 24) { out.interact = true; out.x = 0; out.y = 0; }
    return out;
  }

  /* --- Chase nearest standing survivor --- */
  var target = null, td = Infinity;
  for (var k = 0; k < world.players.length; k++) {
    var s = world.players[k];
    if (s.role !== ROLES.SURV || s.state !== STATE.ALIVE || s.inLocker >= 0) continue;
    var d2 = C.dist(p.x, p.y, s.x, s.y);
    if (d2 < td) { td = d2; target = s; }
  }

  if (target) {
    var ts = steer(world, p, target.x, target.y);
    out.x = ts.x; out.y = ts.y;
    out.aim = Math.atan2(target.y - p.y, target.x - p.x);
    out.sprint = true;

    /* Lunge attack */
    var attackRange = (p.rageT > 0 ? K.SLAYER_ATK_RANGE * 1.25 : K.SLAYER_ATK_RANGE) + 20;
    if (td < attackRange && p.atkCd <= 0 && !p.atkPhase) {
      out.attack = true;
    }

    if (p.ult >= K.ULT_CHARGE_MAX && td < 200) {
      out.ult = true;
    }
    return out;
  }

  /* --- Hunt scratch echoes --- */
  if (world.echoes && world.echoes.length > 0) {
    var echo = world.echoes[world.echoes.length - 1];
    var es = steer(world, p, echo.x, echo.y);
    out.x = es.x; out.y = es.y; out.aim = es.ang;
    out.sprint = true;
    return out;
  }

  /* --- Patrol anchors --- */
  var patrol = null, maxProg = -1;
  for (var a = 0; a < world.anchors.length; a++) {
    var an = world.anchors[a];
    if (an.done) continue;
    if (an.progress > maxProg) { maxProg = an.progress; patrol = an; }
  }
  if (patrol) {
    var as = steer(world, p, patrol.x, patrol.y);
    out.x = as.x; out.y = as.y; out.aim = as.ang;
    out.sprint = true;
    if (C.dist(p.x, p.y, patrol.x, patrol.y) < K.ANCHOR_R + K.INTERACT_R - 14 && patrol.progress > 0.05) {
      out.interact = true;
    }
    return out;
  }

  return out;
}

function shouldOpenGate(world, p, gate) {
  return gate && gate.powered && !gate.open;
}

function findSlayer(world) {
  for (var i = 0; i < world.players.length; i++) {
    if (world.players[i].role === ROLES.SLAYER) return world.players[i];
  }
  return null;
}

function reset(out) {
  out.x = 0; out.y = 0; out.aim = 0;
  out.sprint = false; out.crouch = false;
  out.attack = false; out.dash = false;
  out.ult = false; out.interact = false;
  out.cancel = false; out.emote = false;
  out.item = false; out.rewind = false;
  out.overclock = false; out.heavy = false;
}

function think(world) {
  var inputs = {};
  for (var i = 0; i < world.players.length; i++) {
    var p = world.players[i];
    if (!p.bot) continue;
    var out = S.makeInput();
    if (p.role === ROLES.SLAYER) slayerInput(world, p, out);
    else survivorInput(world, p, out);
    inputs[p.id] = out;
  }
  return inputs;
}

return {
  nameFor: nameFor,
  steer: steer,
  lookahead: lookahead,
  lineOfSight: lineOfSight,
  think: think
};
});
