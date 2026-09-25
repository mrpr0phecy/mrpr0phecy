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
 * Browser: window.EOTAI   Node: module.exports
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

/* ---------------- obstacle-aware steering ----------------
 * Score a fan of candidate headings by (progress toward goal) minus
 * (blocked-ness). Returns a unit vector. Deterministic: no randomness, only
 * the current geometry — so two peers steering the same bot agree. */
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
    /* hugging a wall you are about to hit is worse than a wide turn */
    var score = align * 1.0 + clear * 1.6;
    if (score > bestScore) { bestScore = score; bestA = a; }
  }
  return { x: Math.cos(bestA), y: Math.sin(bestA), ang: bestA, clear: bestScore };
}

/* How far can we travel in this direction before hitting geometry? 1 = clear. */
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

/* ============================ SURVIVOR ============================ */
function survivorInput(world, p, out) {
  reset(out);
  var slayer = findSlayer(world);
  var dSlayer = slayer ? C.dist(p.x, p.y, slayer.x, slayer.y) : Infinity;
  var threatened = dSlayer < 230;
  var rnd = world.rndAi;

  /* --- 1. self-preservation, but not panic ---
   * Bailing at 300 units meant the bots abandoned every objective the moment
   * the slayer walked into the neighbourhood, and matches stalled. They now
   * only break off when the slayer is genuinely on them, and they dodge
   * committed attacks instead of running in a straight line. */
  if (threatened && slayer) {
    var los = lineOfSight(world, p.x, p.y, slayer.x, slayer.y);

    /* The slayer's swing has a 0.28s windup. Dashing through it with i-frames
     * is the single highest-skill move a survivor has, so the bots do it too —
     * perpendicular, never straight back. */
    if (slayer.atkPhase === 'windup' && dSlayer < K.SLAYER_ATK_RANGE + 40 &&
        p.dashCd <= 0 && p.stamina > K.STAM_DASH + 6) {
      var perp = Math.atan2(p.y - slayer.y, p.x - slayer.x) + (rnd() < 0.5 ? 1 : -1) * Math.PI / 2;
      var ds = steer(world, p, p.x + Math.cos(perp) * 120, p.y + Math.sin(perp) * 120);
      out.x = ds.x; out.y = ds.y; out.dash = true;
      out.aim = Math.atan2(slayer.y - p.y, slayer.x - p.x);
      return out;
    }

    /* Fight back when they are on top of us: a stunned slayer is a free few
     * seconds for the whole team, and this is the anime-brawler fantasy. */
    if (dSlayer < K.SURV_ATK_RANGE + 20) {
      out.aim = Math.atan2(slayer.y - p.y, slayer.x - p.x);
      if (p.atkCd <= 0 && !p.atkPhase) out.attack = true;
      if (p.ult >= K.ULT_CHARGE_MAX) out.ult = true;
      /* trade a little, then create distance */
      if (p.hp < K.SURV_HP * 0.55 || p.atkPhase === 'recover') {
        var away2 = Math.atan2(p.y - slayer.y, p.x - slayer.x);
        var s2 = steer(world, p, p.x + Math.cos(away2) * 180, p.y + Math.sin(away2) * 180);
        out.x = s2.x; out.y = s2.y; out.sprint = p.stamina > 15;
      }
      return out;
    }

    /* Break line of sight rather than just running: a straight line away is
     * the easiest chase in the game to win. */
    var awayA = Math.atan2(p.y - slayer.y, p.x - slayer.x);
    var bestA = awayA, bestScore = -Infinity;
    for (var c = 0; c < 7; c++) {
      var cand = awayA + (c / 6 - 0.5) * Math.PI * 1.4;
      var tx = p.x + Math.cos(cand) * 240, ty = p.y + Math.sin(cand) * 240;
      var clear = lookahead(world, p.x, p.y, cand, 130);
      /* reward ending up somewhere the slayer cannot see */
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

  /* --- 2. rescue a downed teammate if it is reasonably safe --- */
  var downed = null, bd = Infinity;
  for (var i = 0; i < world.players.length; i++) {
    var q = world.players[i];
    if (q === p || q.role === ROLES.SLAYER || q.state !== STATE.DOWNED) continue;
    var d = C.dist(p.x, p.y, q.x, q.y);
    if (d < bd) { bd = d; downed = q; }
  }
  if (downed && bd < 620 && dSlayer > 280) {
    var r = steer(world, p, downed.x, downed.y);
    out.x = r.x; out.y = r.y; out.aim = Math.atan2(downed.y - p.y, downed.x - p.x);
    out.sprint = bd > 90;
    if (bd < K.PLAYER_R + 34) { out.interact = true; out.sprint = false; }
    return out;
  }

  /* --- 3. unhook a hooked teammate --- */
  for (var h = 0; h < world.players.length; h++) {
    var m = world.players[h];
    if (m === p || m.role === ROLES.SLAYER || m.state !== STATE.HOOKED) continue;
    if (dSlayer < 240) break;
    var hd = C.dist(p.x, p.y, m.x, m.y);
    var hs = steer(world, p, m.x, m.y);
    out.x = hs.x; out.y = hs.y; out.aim = Math.atan2(m.y - p.y, m.x - p.x);
    out.sprint = hd > 90;
    if (hd < K.PLAYER_R + 40) { out.interact = true; out.sprint = false; }
    return out;
  }

  /* --- 4. escape if a gate is open --- */
  for (var g = 0; g < world.gates.length; g++) {
    var gate = world.gates[g];
    if (!gate.open) continue;
    var gs = steer(world, p, gate.x, gate.y);
    out.x = gs.x; out.y = gs.y; out.aim = Math.atan2(gate.y - p.y, gate.x - p.x);
    out.sprint = true;
    if (C.dist(p.x, p.y, gate.x, gate.y) < gate.r) { out.sprint = false; }
    return out;
  }

  /* --- 4b. gates are powered: go open one ---
   * Without this step the bots kept repairing forever and never converted
   * their objective work into an escape — every match then expired on the
   * clock. Splitting the team (closest survivor goes, the rest keep working)
   * is what makes the end of a match a real decision. */
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
    if (pgd < K.GATE_R + 20) { out.interact = true; out.sprint = false; out.x = 0; out.y = 0; }
    return out;
  }

  /* --- 5. default: work the nearest unfinished anchor --- */
  var target = null, tbd = Infinity;
  for (var a = 0; a < world.anchors.length; a++) {
    var an = world.anchors[a];
    if (an.done) continue;
    var ad = C.dist(p.x, p.y, an.x, an.y) - an.progress * 180;   // prefer near-finished
    if (ad < tbd) { tbd = ad; target = an; }
  }
  if (!target) {
    /* everything done: go power a gate */
    var pg = world.gates[0], pbd = Infinity;
    for (var gg = 0; gg < world.gates.length; gg++) {
      var g2 = world.gates[gg];
      var gd = C.dist(p.x, p.y, g2.x, g2.y);
      if (gd < pbd) { pbd = gd; pg = g2; }
    }
    var ps = steer(world, p, pg.x, pg.y);
    out.x = ps.x; out.y = ps.y; out.aim = ps.ang;
    out.sprint = true;
    if (C.dist(p.x, p.y, pg.x, pg.y) < K.GATE_R + 20 && pg.powered) { out.interact = true; out.sprint = false; }
    return out;
  }
  var ts = steer(world, p, target.x, target.y);
  out.x = ts.x; out.y = ts.y;
  out.aim = Math.atan2(target.y - p.y, target.x - p.x);
  var td = C.dist(p.x, p.y, target.x, target.y);
  out.sprint = td > 120 && p.stamina > 25;
  if (td < K.ANCHOR_R + K.INTERACT_R - 6) {
    out.interact = true; out.sprint = false; out.x = 0; out.y = 0;
    /* hit the skill check: aim for the great window */
    if (p.skill && p.skill.inGreat) out.attack = true;
    else if (p.skill && p.skill.frac > 0.9) out.attack = true;
  }
  /* wander a touch while repairing so bots do not stand perfectly still */
  if (out.interact && rnd() < 0.02) { out.x = rnd() - 0.5; out.y = rnd() - 0.5; }
  return out;
}

/* ============================ SLAYER ============================ */
function slayerInput(world, p, out) {
  reset(out);
  var rnd = world.rndAi;

  /* --- carrying: go hook them --- */
  if (p.carrying >= 0) {
    var hook = null, hd = Infinity;
    for (var i = 0; i < world.hooks.length; i++) {
      var h = world.hooks[i];
      if (h.occupant >= 0) continue;
      var d = C.dist(p.x, p.y, h.x, h.y);
      if (d < hd) { hd = d; hook = h; }
    }
    if (!hook) { out.cancel = true; return out; }
    var hs = steer(world, p, hook.x, hook.y);
    out.x = hs.x; out.y = hs.y; out.aim = hs.ang; out.sprint = true;
    if (hd < hook.r + 26) { out.interact = true; out.sprint = false; }
    return out;
  }

  /* --- pick a target: downed > injured > nearest --- */
  var target = null, best = -Infinity;
  for (var j = 0; j < world.players.length; j++) {
    var q = world.players[j];
    if (q.role === ROLES.SLAYER || !S.alive(q)) continue;
    var dd = C.dist(p.x, p.y, q.x, q.y);
    var score = 1000 - dd;
    if (q.state === STATE.DOWNED) score += 900;
    if (q.hp <= K.SURV_HP * 0.5) score += 400;
    if (q.inChase) score += 150;
    if (q.interactKind === 'repair') score += 220;   // interrupted repairs are free pressure
    if (score > best) { best = score; target = q; }
  }

  /* --- no target: pressure the map by smashing the most-built anchor --- */
  if (!target) {
    var an = null, ap = -1;
    for (var a = 0; a < world.anchors.length; a++) {
      if (world.anchors[a].done) continue;
      if (world.anchors[a].progress > ap) { ap = world.anchors[a].progress; an = world.anchors[a]; }
    }
    if (an) {
      var as = steer(world, p, an.x, an.y);
      out.x = as.x; out.y = as.y; out.aim = as.ang; out.sprint = true;
      if (C.dist(p.x, p.y, an.x, an.y) < K.ANCHOR_R + 20) { out.interact = true; out.sprint = false; }
    } else {
      var rs = steer(world, p, K.WORLD.w * (0.3 + rnd() * 0.4), K.WORLD.h * (0.3 + rnd() * 0.4));
      out.x = rs.x; out.y = rs.y; out.aim = rs.ang; out.sprint = true;
    }
    return out;
  }

  /* --- hunt --- */
  var dist = C.dist(p.x, p.y, target.x, target.y);
  var los = lineOfSight(world, p.x, p.y, target.x, target.y);
  var aimAt = Math.atan2(target.y - p.y, target.x - p.x);

  /* lead the target a little so we do not trail forever */
  var lead = 0.35;
  var px = target.x + target.vx * lead * 60 * K.FIXED;
  var py = target.y + target.vy * lead * 60 * K.FIXED;
  var s = steer(world, p, px, py);
  out.x = s.x; out.y = s.y;
  out.aim = los ? aimAt : s.ang;
  out.sprint = dist > K.SLAYER_ATK_RANGE + 10;

  if (dist < K.SLAYER_ATK_RANGE + 18 && los && p.atkCd <= 0 && !p.atkPhase) out.attack = true;
  if (p.ult >= K.ULT_CHARGE_MAX && dist < K.SLAYER_ULT_R + 40 && los) out.ult = true;

  /* a downed survivor within reach gets picked up */
  if (target.state === STATE.DOWNED && dist < K.PLAYER_R + 30) { out.interact = true; out.attack = false; }
  return out;
}

/* Which survivors commit to opening a gate. Exactly the two closest go —
 * one to channel, one to cover — while the rest keep working. Sending all
 * four hands the slayer the whole team in one place. */
function shouldOpenGate(world, p, gate) {
  var ranks = [];
  for (var i = 0; i < world.players.length; i++) {
    var q = world.players[i];
    if (q.role === ROLES.SLAYER || q.state !== STATE.ALIVE) continue;
    ranks.push({ id: q.id, d: C.dist(q.x, q.y, gate.x, gate.y) });
  }
  ranks.sort(function (a, b) { return a.d - b.d; });
  for (var r = 0; r < Math.min(2, ranks.length); r++) if (ranks[r].id === p.id) return true;
  return false;
}

function findSlayer(world) {
  for (var i = 0; i < world.players.length; i++) if (world.players[i].role === ROLES.SLAYER) return world.players[i];
  return null;
}

function reset(out) {
  out.x = 0; out.y = 0; out.aim = out.aim || 0;
  out.sprint = false; out.crouch = false; out.attack = false;
  out.dash = false; out.ult = false; out.interact = false;
  out.cancel = false; out.emote = false;
  return out;
}

/* One tick of every bot on the field. Called by the engine before step(). */
function think(world) {
  var out = {};
  for (var i = 0; i < world.players.length; i++) {
    var p = world.players[i];
    if (!p.bot) continue;
    var inp = S.makeInput();
    inp.aim = p.aim;
    if (p.state === STATE.DOWNED) {
      /* crawl away from the slayer */
      var sl = findSlayer(world);
      if (sl) { var a = Math.atan2(p.y - sl.y, p.x - sl.x); inp.x = Math.cos(a); inp.y = Math.sin(a); }
    } else if (p.state === STATE.ALIVE) {
      if (p.role === ROLES.SLAYER) slayerInput(world, p, inp);
      else survivorInput(world, p, inp);
    }
    out[p.id] = inp;
  }
  return out;
}

return { think: think, nameFor: nameFor, steer: steer, lineOfSight: lineOfSight, lookahead: lookahead, NAMES_SURV: NAMES_SURV, NAMES_SLAYER: NAMES_SLAYER };
});
