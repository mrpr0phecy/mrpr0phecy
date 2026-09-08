/* Riley AI — neural-net goblin brains with genetic evolution.
 *
 * Same ideas as aiwalker.html, applied in-game:
 *  - each goblin runs a tiny feed-forward net (senses -> actions)
 *  - genomes spawn as crossover+mutation of the species' CHAMPION genome
 *  - when a goblin dies its fitness is scored; better genomes become the
 *    new champion (elitism) or enter the hall of fame (niche slots)
 *  - champions persist in localStorage: the goblins remember you
 *  - per-instance "experience" biases nudge actions toward rewarded
 *    behaviour (learns mid-fight) and away from punished behaviour
 *  - melee types also imitate nearby surviving allies (social learning)
 *
 * Pure JS (depends on RileyCore). Browser: window.RileyAI, Node: module.exports
 */
(function (root, factory) {
  var api = factory(typeof globalThis !== 'undefined' && globalThis.RileyCore ? globalThis.RileyCore : require('./riley-core.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RileyAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
'use strict';
var TAU = C.TAU, clamp = C.clamp;

var IN = 10, HID = 12, OUT = 6;
/* outputs: 0 forward, 1 back, 2 strafeL, 3 strafeR, 4 attack, 5 panic */

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function tanh(x) { return Math.tanh(x); }
function gauss(rand) { /* Box-Muller */
  var u = Math.max(rand(), 1e-9), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

/* ---------------- genome ---------------- */
function makeGenome(rand) {
  var w1 = new Float32Array(IN * HID + HID);
  var w2 = new Float32Array(OUT * HID + OUT);
  for (var i = 0; i < w1.length; i++) w1[i] = gauss(rand) * 0.5;
  for (i = 0; i < w2.length; i++) w2[i] = gauss(rand) * 0.5;
  return { w1: w1, w2: w2 };
}
function cloneGenome(g) { return { w1: new Float32Array(g.w1), w2: new Float32Array(g.w2) }; }
function addGauss(g, rand, rate, scale) {
  var i;
  for (i = 0; i < g.w1.length; i++) if (rand() < rate) g.w1[i] += gauss(rand) * scale;
  for (i = 0; i < g.w2.length; i++) if (rand() < rate) g.w2[i] += gauss(rand) * scale;
  return g;
}
function crossover(a, b, rand) {
  var g = makeGenome(rand), i;
  for (i = 0; i < g.w1.length; i++) g.w1[i] = rand() < 0.5 ? a.w1[i] : b.w1[i];
  for (i = 0; i < g.w2.length; i++) g.w2[i] = rand() < 0.5 ? a.w2[i] : b.w2[i];
  return g;
}

/* ---------------- net ---------------- */
function forward(g, x, out, hbuf) {
  var i, j, s;
  for (j = 0; j < HID; j++) {
    s = g.w1[IN * HID + j];
    for (i = 0; i < IN; i++) s += g.w1[i * HID + j] * x[i];
    hbuf[j] = tanh(s);
  }
  for (j = 0; j < OUT; j++) {
    s = g.w2[HID * OUT + j];
    for (i = 0; i < HID; i++) s += g.w2[i * OUT + j] * hbuf[i];
    out[j] = sigmoid(s);
  }
  return out;
}

/* ---------------- species archetypes ----------------
 * Hand-tuned bases so wave-1 behaviour is sane, then evolution takes over.
 * Biases are set on the action layer (w2 bias column) + key input weights. */
var SPECIES = {
  grunt:  { hp: 2, spd: 5.0, sc: 10, r: 0.42, h: 1.05, s: 0.85, melee: 1.9, lunge: 13, lungeCd: 2.2 },
  runner: { hp: 1, spd: 7.2, sc: 15, r: 0.34, h: 0.85, s: 0.7,  melee: 1.5, lunge: 17, lungeCd: 1.6 },
  spitter:{ hp: 2, spd: 3.4, sc: 25, r: 0.44, h: 1.1,  s: 0.85, range: [7, 16], spitCd: 2.0 },
  brute:  { hp: 5, spd: 2.9, sc: 50, r: 0.56, h: 1.4,  s: 1.25, melee: 2.4, smash: 10, smashCd: 2.6 },
  boss:   { hp: 42, spd: 3.4, sc: 500, r: 0.75, h: 1.85, s: 1.7, melee: 3.0, lunge: 22, lungeCd: 2.2 }
};
var SPECIES_LIST = ['grunt', 'runner', 'spitter', 'brute', 'boss'];

function setW(g, out, inp, v) { g.w2[inp * OUT + out] = v; }
function addW(g, out, inp, v) { g.w2[inp * OUT + out] += v; }
function bias(g, out, v) { g.w2[HID * OUT + out] += v; }

/* Hidden-layer feature units (fixed wiring, still evolvable):
 *  h0 far      — distance to player (high when far)
 *  h1 ahead    — player roughly in front
 *  h2 flank    — player to the side (signed)
 *  h3 hurt     — recent damage taken
 *  h4 pSpeed   — how fast the player is moving
 *  h5 below    — player below us (signed dy)
 *  h6 threat   — player charging / enraged pressure
 *  h7..h11     — free personality units (random wiring)
 * Action layer weights then read these features per species. */
var FEAT = { FAR: 0, AHEAD: 1, FLANK: 2, HURT: 3, PSPEED: 4, BELOW: 5, THREAT: 6 };

function archetype(species, rand) {
  var g = makeGenome(rand);
  var i, j;
  /* hidden layer: 7 feature units + 5 personality units */
  for (i = 0; i < g.w1.length; i++) g.w1[i] = 0;
  /* feature -> input weights (inputs: 0 dist,1 sinA,2 cosA,3 pSpeed,4 dy,
     5 hp, 6 dmgTaken, 7 threat, 8 mem, 9 time) */
  var wiring = [
    [0, 3.2, 0, 0, 0, 0, 0, 0, 0, 0, -0.7],          // h0 far
    [2, 0, 0, 2.4, 0, 0, 0, 0, 0, 0, 0.3],           // h1 ahead
    [0, 2.6, 0, 0, 0, 0, 0, 0, 0, 0, 0],             // h2 flank
    [0, 0, 0, 0, 0, 0, 2.6, 0, 0, 0, 0],             // h3 hurt
    [0, 0, 0, 1.8, 0, 0, 0, 0, 0, 0, 0],             // h4 pSpeed
    [0, 0, 0, 0, -2.0, 0, 0, 0, 0, 0, 0],            // h5 below
    [0, 0, 0, 0, 0, 0, 0, 2.2, 0, 0, 0]              // h6 threat
  ];
  for (j = 0; j < 7; j++) {
    for (i = 0; i < IN; i++) g.w1[i * HID + j] = wiring[j][i + 1];
    g.w1[IN * HID + j] = wiring[j][0];
  }
  /* personality units: random wiring of all inputs */
  for (j = 7; j < HID; j++) {
    for (i = 0; i < IN; i++) g.w1[i * HID + j] = gauss(rand) * 0.7;
    g.w1[IN * HID + j] = gauss(rand) * 0.4;
  }
  /* action layer: start from clean intent per species */
  for (j = 0; j < OUT; j++) {
    for (i = 0; i < HID; i++) g.w2[i * OUT + j] = 0;
    g.w2[HID * OUT + j] = 0;
  }
  var F = FEAT;
  /* shared instincts: hurt goblins hesitate & panic, threat raises panic */
  addW(g, 0, F.HURT, -0.8);
  addW(g, 5, F.HURT, 1.9);
  addW(g, 5, F.THREAT, 0.9);
  bias(g, 4, 0.55);
  addW(g, 4, F.AHEAD, 1.1);
  if (species === 'grunt') {
    bias(g, 0, 0.75); addW(g, 0, F.FAR, 1.5); addW(g, 0, F.AHEAD, 0.5);
    bias(g, 4, 0.75); addW(g, 4, F.FAR, -1.9);
    bias(g, 2, 0.4); bias(g, 3, 0.4);
    addW(g, 2, F.FLANK, -0.5); addW(g, 3, F.FLANK, 0.5);
  } else if (species === 'runner') {
    bias(g, 0, 0.6); addW(g, 0, F.FAR, 1.2);
    bias(g, 2, 0.95); bias(g, 3, 0.95);          // strong circling
    addW(g, 2, F.FLANK, -0.9); addW(g, 3, F.FLANK, 0.9);
    bias(g, 4, 0.65); addW(g, 4, F.FAR, -2.1);
  } else if (species === 'spitter') {
    bias(g, 0, 0.45); addW(g, 0, F.FAR, 2.2);    // close in only from far
    bias(g, 1, 0.8); addW(g, 1, F.FAR, -1.6);    // retreat once close
    bias(g, 4, 0.9); addW(g, 4, F.AHEAD, 1.5);
    bias(g, 2, 0.55); bias(g, 3, 0.55);
    addW(g, 2, F.FLANK, -0.7); addW(g, 3, F.FLANK, 0.7);
  } else if (species === 'brute') {
    bias(g, 0, 1.0); addW(g, 0, F.FAR, 1.8);
    bias(g, 5, -0.7); addW(g, 5, F.HURT, 0.9);   // tanky: panics less
    bias(g, 2, 0.1); bias(g, 3, 0.1);
    bias(g, 4, 0.8); addW(g, 4, F.FAR, -1.5);
  } else if (species === 'boss') {
    bias(g, 0, 0.9); addW(g, 0, F.FAR, 1.6); addW(g, 0, F.THREAT, -0.4);
    bias(g, 4, 0.8); addW(g, 4, F.FAR, -1.2); addW(g, 4, F.THREAT, 1.5);
    addW(g, 5, F.THREAT, -1.0);                  // enrage -> less panic
    bias(g, 2, 0.45); bias(g, 3, 0.45);
    addW(g, 2, F.FLANK, -0.6); addW(g, 3, F.FLANK, 0.6);
  }
  return g;
}

/* ---------------- bestiary (per-run + persisted champions) ---------------- */
function newBestiary() {
  var b = { species: {}, gen: 1, kills: 0 };
  SPECIES_LIST.forEach(function (s) { b.species[s] = { champ: null, fit: 0, hall: [] }; });
  return b;
}
function ensureArch(b, s, rand) {
  if (!b.species[s].champ) b.species[s].champ = archetype(s, rand);
}
function fitness(e) {
  /* damage output > survival > taking punishment */
  return e.kills * 120 + e.dmgDealt * 30 + e.lifeSec * 1.1 - e.hitsTaken * 8 + e.gemsStolen * 40;
}
function onDeath(best, s, genome, fit, rand) {
  best.kills++;
  var rec = best.species[s];
  ensureArch(best, s, rand);
  if (fit > rec.fit) {
    rec.champ = cloneGenome(genome);
    rec.fit = fit;
    best.gen++;
  }
  var i = rec.hall.length;
  for (var k = 0; k < rec.hall.length; k++) if (fit > rec.hall[k].fit) { i = k; break; }
  if (i < rec.hall.length) rec.hall.splice(i, 0, { g: cloneGenome(genome), fit: fit });
  else if (rec.hall.length < 4) rec.hall.push({ g: cloneGenome(genome), fit: fit });
  else return; /* hall full and not better than its weakest slot */
  if (rec.hall.length > 4) rec.hall.pop();
}
function spawnGenome(best, s, rand, wave) {
  var rec = best.species[s];
  ensureArch(best, s, rand);
  /* evolution is gradual — strong mutations would make wave 1 chaotic */
  var rate = 0.07 + Math.min(wave, 24) * 0.005;
  var scale = 0.14 + Math.min(wave, 24) * 0.010;
  var r = rand(), g;
  if (r < 0.55) g = crossover(rec.champ, rec.champ, rand);
  else if (r < 0.85 && rec.hall.length) g = crossover(rec.champ, rec.hall[Math.floor(rand() * rec.hall.length)].g, rand);
  else g = archetype(s, rand);
  addGauss(g, rand, rate, scale);
  return g;
}
/* IQ readout for the HUD/title: 0..100 from champion fitness history */
function iq(best, s) {
  var rec = best.species[s];
  if (!rec) return 0;
  return clamp(Math.round(rec.fit / 9), 0, 100);
}
function iqAvg(best) {
  var sum = 0, n = 0;
  SPECIES_LIST.forEach(function (s) { if (best.species[s].champ) { sum += iq(best, s); n++; } });
  return n ? Math.round(sum / n) : 0;
}

/* persistence (engine supplies the storage; JSON-safe conversion here) */
function serialize(best) {
  var out = { gen: best.gen, kills: best.kills, species: {} };
  SPECIES_LIST.forEach(function (s) {
    var rec = best.species[s];
    if (!rec.champ) return;
    out.species[s] = {
      fit: rec.fit,
      champ: Array.from(rec.champ.w1).concat(Array.from(rec.champ.w2)),
      hall: rec.hall.map(function (h) { return { fit: h.fit, w: Array.from(h.g.w1).concat(Array.from(h.g.w2)) }; })
    };
  });
  return out;
}
function deserialize(data, rand) {
  var best = newBestiary();
  if (!data || !data.species) return best;
  best.gen = data.gen || 1; best.kills = data.kills || 0;
  SPECIES_LIST.forEach(function (s) {
    var d = data.species[s];
    if (!d || !d.champ) return;
    ensureArch(best, s, rand);
    var full = d.champ, w1 = new Float32Array(full.slice(0, IN * HID + HID)), w2 = new Float32Array(full.slice(IN * HID + HID));
    best.species[s].champ = { w1: w1, w2: w2 };
    best.species[s].fit = d.fit || 0;
    (d.hall || []).forEach(function (h) {
      if (h.w && h.w.length === IN * HID + HID + OUT * HID + OUT) {
        best.species[s].hall.push({ g: { w1: new Float32Array(h.w.slice(0, IN * HID + HID)), w2: new Float32Array(h.w.slice(IN * HID + HID)) }, fit: h.fit || 0 });
      }
    });
  });
  return best;
}

/* ---------------- brain ----------------
 * Engine calls tick() at ~8 Hz per enemy with a plain sensor struct.
 * Returns an action struct the engine turns into movement/attacks. */
function makeBrain(species, genome) {
  return {
    species: species,
    genome: genome,
    atkBias: 0,
    fleeBias: 0,
    mem: 0,          // last action success memory 0..1
    lastSide: 1,
    _h: new Float32Array(HID),
    _o: new Float32Array(OUT),
    tick: function (sen) {
      /* sen: {dist, sinA, cosA, pSpeed, dy, hpFrac, dmgTaken, threat, time, side, atkRange} */
      var o = forward(genome, [
        clamp(sen.dist / 26, 0, 1),
        clamp(sen.sinA, -1, 1),
        clamp(sen.cosA, -1, 1),
        clamp(sen.pSpeed / 12, 0, 1),
        clamp(sen.dy / 4, -1, 1),
        clamp(sen.hpFrac, 0, 1),
        clamp(sen.dmgTaken, 0, 1),
        clamp(sen.threat, 0, 1),
        this.mem,
        clamp(sen.time / 40, 0, 1)
      ], this._o, this._h);
      var fwd = o[0], back = o[1], sl = o[2], sr = o[3];
      var atk = clamp(o[4] + this.atkBias * 0.55 - (sen.dmgTaken > 0.6 ? 0.25 : 0), 0, 1);
      var panic = clamp(o[5] + this.fleeBias * 0.5, 0, 1);
      /* spitters keep their band; melee types charge */
      var mvx = 0, mvz = 0, act = 'idle';
      var inRange = sen.dist <= sen.atkRange;
      /* flee only when there is a reason — keeps mutated nets from
         producing healthy goblins that just run away */
      if (panic > 0.62 && (sen.dmgTaken > 0.3 || sen.hpFrac < 0.55)) {
        mvx = -1; mvz = 0; act = 'flee';
      } else if (atk > 0.52 && inRange) {
        act = 'attack';
        mvx = (fwd - back) * 0.4; mvz = (sr - sl) * 0.6;
      } else {
        mvx = fwd - back;
        mvz = sr - sl;
        if (this.species === 'spitter') {
          /* hold firing band */
          if (sen.dist > sen.rangeFar) mvx += 0.8;
          if (sen.dist < sen.rangeNear) mvx -= 0.9;
          /* face the player to shoot */
          act = 'face';
        }
        var l = Math.hypot(mvx, mvz);
        if (l > 1) { mvx /= l; mvz /= l; }
        act = l > 0.12 ? 'move' : 'idle';
      }
      /* strafe direction slowly flips (individual habit + learned side) */
      if (Math.abs(mvz) > 0.1) {
        var side = mvz > 0 ? 1 : -1;
        if (side !== this.lastSide && Math.random() < 0.002) this.lastSide = side; /* rare spontaneous flip */
      }
      this.mem = clamp(this.mem * 0.9 + (act === 'attack' ? 0.1 : 0), 0, 1);
      return { mvx: mvx, mvz: mvz, act: act, atk: atk, panic: panic, o: o };
    },
    /* experience: reward/punish the action biases (learns during a fight) */
    reward: function (ev) {
      if (ev === 'hit') { this.atkBias = clamp(this.atkBias + 0.16, -0.8, 1); }
      else if (ev === 'shotHit') { this.atkBias = clamp(this.atkBias + 0.14, -0.8, 1); }
      else if (ev === 'shotMiss') { this.atkBias = clamp(this.atkBias - 0.07, -0.8, 1); }
      else if (ev === 'hurt') { this.atkBias = clamp(this.atkBias - 0.1, -0.8, 1); this.fleeBias = clamp(this.fleeBias + 0.12, -0.8, 1); }
      else if (ev === 'kill') { this.atkBias = clamp(this.atkBias + 0.3, -0.8, 1); }
      else if (ev === 'panic') { this.fleeBias = clamp(this.fleeBias - 0.08, -0.8, 1); }
    },
    /* social learning: nudge toward a surviving ally's temperament */
    learnFrom: function (other, amt) {
      this.atkBias = clamp(this.atkBias + (other.atkBias - this.atkBias) * amt, -0.8, 1);
    },
    save: function () {
      return { atk: this.atkBias, flee: this.fleeBias, mem: this.mem, side: this.lastSide };
    },
    load: function (d) {
      if (!d) return;
      this.atkBias = d.atk || 0; this.fleeBias = d.flee || 0; this.mem = d.mem || 0; this.lastSide = d.side || 1;
    }
  };
}

return {
  IN: IN, HID: HID, OUT: OUT,
  SPECIES: SPECIES, SPECIES_LIST: SPECIES_LIST,
  makeGenome: makeGenome, cloneGenome: cloneGenome, addGauss: addGauss, crossover: crossover,
  archetype: archetype, forward: forward,
  newBestiary: newBestiary, spawnGenome: spawnGenome, onDeath: onDeath, fitness: fitness,
  iq: iq, iqAvg: iqAvg, serialize: serialize, deserialize: deserialize, makeBrain: makeBrain
};
});
