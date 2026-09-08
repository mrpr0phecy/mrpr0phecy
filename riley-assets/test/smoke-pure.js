/* Node smoke tests for riley-core / riley-world / riley-ai / riley-net.
 * Run: node riley-assets/test/smoke-pure.js
 */
'use strict';
var C = require('../riley-core.js');
var W = require('../riley-world.js');
var A = require('../riley-ai.js');
var N = require('../riley-net.js');

var fails = 0, checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { fails++; console.error('FAIL:', msg); }
}

/* ---------------- core ---------------- */
(function () {
  var r1 = C.mulberry32(12345), r2 = C.mulberry32(12345), r3 = C.mulberry32(12346);
  var s1 = [], s2 = [], s3 = [];
  for (var i = 0; i < 1000; i++) { s1.push(r1()); s2.push(r2()); s3.push(r3()); }
  var same = s1.every(function (v, i2) { return v === s2[i2]; });
  var diff = s1.some(function (v, i2) { return v !== s3[i2]; });
  ok(same, 'mulberry32 deterministic for same seed');
  ok(diff, 'mulberry32 differs for different seeds');

  var n = C.makeNoise2D(C.mulberry32(99));
  var a = n.fbm(3.7, -1.2, 4), b = n.fbm(3.7, -1.2, 4);
  ok(a === b, 'noise deterministic');
  ok(Math.abs(n.fbm(3.7, -1.2, 4)) <= 1.001, 'fbm bounded');
  ok(C.hashStr('ABC') !== C.hashStr('ABC '), 'hashStr sensitive');
  ok(C.hashStr('ABC') === C.hashStr('ABC'), 'hashStr stable');

  /* matrix roundtrip: limb with no piv/geo offsets is a pure T*R — its
     translation column must be the position, and M * M^-1 must be identity */
  var m = new Float32Array(16);
  C.limb2(m, 2, 3, 4, 0.7, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1);
  var inv = new Float32Array(16);
  ok(C.m4inv(inv, m) !== null, 'm4inv works');
  ok(Math.abs(m[12] - 2) < 1e-6 && Math.abs(m[13] - 3) < 1e-6 && Math.abs(m[14] - 4) < 1e-6, 'limb translation stored');
  var ident = new Float32Array(16);
  C.m4mul(ident, m, inv);
  var isIdent = Math.abs(ident[0] - 1) < 1e-5 && Math.abs(ident[5] - 1) < 1e-5 && Math.abs(ident[10] - 1) < 1e-5 &&
    Math.abs(ident[12]) < 1e-5 && Math.abs(ident[13]) < 1e-5 && Math.abs(ident[14]) < 1e-5;
  ok(isIdent, 'M * M^-1 = identity');

  /* hash grid */
  var g = new C.HashGrid(2);
  g.insert(1.1, 1.1, 'a'); g.insert(1.9, 1.9, 'b'); g.insert(9, 9, 'c');
  var q = g.query(1.5, 1.5, []);
  ok(q.length === 2, 'hash grid query finds neighbours, got ' + q.length);
  q = g.query(8.9, 8.9, []);
  ok(q.length === 1, 'hash grid query isolated');
})();

/* ---------------- world ---------------- */
var world = null;
(function () {
  world = W.generate('TESTSEED');
  var w2 = W.generate('TESTSEED');
  ok(world.seed === 'TESTSEED', 'seed string kept');
  ok(world.terrain.grass.length === w2.terrain.grass.length, 'deterministic terrain size');
  ok(world.terrain.grass.length > 6000 * 11, 'terrain has vertices: ' + world.terrain.grass.length);
  ok(world.terrain.grass.length % 11 === 0, 'terrain vertex stride');
  var h0 = world.heightAt(0, 0), h0b = w2.heightAt(0, 0);
  ok(h0 === 0, 'arena centre flat at 0, got ' + h0);
  ok(h0 === h0b, 'heightAt deterministic');
  ok(world.heightAt(40, 40) !== 0, 'terrain varies away from arena');
  ok(world.heightAt(-88, 0) > -3, 'edge bowl holds terrain above deep void');
  ok(world.crystals.length >= 4, 'crystals placed: ' + world.crystals.length);
  ok(world.spawns.length >= 8, 'spawn points: ' + world.spawns.length);
  var spawnOk = true;
  for (var i = 0; i < world.spawns.length; i++) {
    var s = world.spawns[i];
    if (Math.abs(world.heightAt(s.x, s.z) - s.y) > 0.15) spawnOk = false;
    if (world.slopeAt(s.x, s.z) > 0.85) spawnOk = false;
  }
  ok(spawnOk, 'spawns sit on walkable ground');
  ok(world.realm.n.length > 3, 'realm chosen: ' + world.realm.n);
  var p = world.props.bark;
  ok(p.length % 19 === 0, 'prop instance stride');
  ok(world.propCounts.bark >= 30, 'trees baked: ' + world.propCounts.bark);
  /* different seed -> different terrain */
  var w3 = W.generate('OTHERSEED');
  var sameAsFirst = true;
  for (var k = 0; k < 200; k++) if (w3.terrain.grass[k] !== world.terrain.grass[k]) { sameAsFirst = false; break; }
  ok(!sameAsFirst, 'different seeds give different terrain');
  console.log('  world: realm=' + world.realm.n + ' grassVerts=' + (world.terrain.grass.length / 11) +
    ' dirtVerts=' + (world.terrain.dirt.length / 11) + ' rockVerts=' + (world.terrain.rock.length / 11) +
    ' trees=' + world.propCounts.bark + ' crystals=' + world.crystals.length);
})();

/* ---------------- ai ---------------- */
(function () {
  var rand = C.mulberry32(42);
  var best = A.newBestiary();
  var g = A.spawnGenome(best, 'grunt', rand, 1);
  ok(g.w1.length === A.IN * A.HID + A.HID, 'genome size w1');
  var brain = A.makeBrain('grunt', g);
  var sen = { dist: 5, sinA: 0, cosA: 1, pSpeed: 4, dy: 0, hpFrac: 1, dmgTaken: 0, threat: 0, time: 2, side: 1, atkRange: 1.9, rangeNear: 7, rangeFar: 16 };
  var act = brain.tick(sen);
  ok(act.act === 'attack' || act.act === 'move', 'grunt acts sensibly close up: ' + act.act);
  /* learning: punishing should raise flee bias over time */
  for (var i = 0; i < 8; i++) brain.reward('hurt');
  ok(brain.fleeBias > 0.5, 'flee bias grows when hurt: ' + brain.fleeBias.toFixed(2));
  /* evolution: feed it kills until the champion improves */
  var rand2 = C.mulberry32(7);
  var champ0 = best.species.grunt.champ;
  for (var e = 0; e < 50; e++) {
    var g2 = A.spawnGenome(best, 'grunt', rand2, 1 + e);
    var fit = 5 + e * 3 + rand2() * 40;
    A.onDeath(best, 'grunt', g2, fit, rand2);
  }
  ok(best.species.grunt.fit > 0, 'champion fitness improved: ' + best.species.grunt.fit.toFixed(0));
  ok(best.species.grunt.hall.length <= 4, 'hall capped at 4');
  ok(best.gen > 1, 'generation counter advanced');
  /* determinism of the net given the same genome+inputs */
  var x = [0.3, 0.1, 0.9, 0.2, 0, 0.8, 0, 0, 0.1, 0.4];
  var o1 = new Float32Array(A.OUT), o2 = new Float32Array(A.OUT);
  A.forward(g, x, o1, new Float32Array(A.HID));
  A.forward(g, x, o2, new Float32Array(A.HID));
  var eq = true;
  for (var j = 0; j < A.OUT; j++) if (o1[j] !== o2[j]) eq = false;
  ok(eq, 'net forward deterministic');
  /* serialize roundtrip */
  var ser = A.serialize(best);
  var best2 = A.deserialize(ser, C.mulberry32(1));
  ok(best2.species.grunt.champ !== null, 'bestiary persists');
  ok(best2.species.grunt.fit === best.species.grunt.fit, 'bestiary fit persists');
  var serArr = ser.species.grunt.champ;
  ok(serArr.length === A.IN * A.HID + A.HID + A.OUT * A.HID + A.OUT, 'serialized genome size');
  ok(A.iqAvg(best) >= 0, 'iq readout works: ' + A.iqAvg(best));
  console.log('  ai: IQ(avg)=' + A.iqAvg(best) + ' gen=' + best.gen + ' hall=' + best.species.grunt.hall.length);
})();

/* ---------------- net ---------------- */
(function () {
  var inp = N.makeInput();
  inp.x = -3; inp.y = 5; inp.fire = true; inp.dash = true;
  var buf = N.encodeInput(inp);
  var back = N.decodeInput(buf);
  ok(N.inputEquals(inp, back), 'input encode/decode roundtrip');
  var tick = 12345;
  var inputs = [inp, N.makeInput(), N.makeInput()];
  var pkt = N.encodeTick(tick, inputs);
  var dec = N.decodeTick(pkt);
  ok(dec.tick === tick, 'tick roundtrip');
  ok(dec.checksumOk, 'checksum valid');
  ok(N.inputEquals(dec.inputs[0], inp), 'tick input roundtrip');
  pkt[5] ^= 0xFF;
  ok(!N.decodeTick(pkt).checksumOk, 'corruption detected');
  /* world hash stable for same state, sensitive to changes */
  var ents = [[1.23, 4, 9.87, 5], [-2, 0.5, 3, 1]];
  ok(N.worldHash(ents) === N.worldHash(ents), 'worldHash stable');
  var ents2 = [[1.35, 4, 9.87, 5], [-2, 0.5, 3, 1]];
  ok(N.worldHash(ents) !== N.worldHash(ents2), 'worldHash sensitive (12cm drift)');
  ok(N.worldHash(ents) === N.worldHash(ents.map(function (e) { return [e[0] + 1e-4, e[1], e[2], e[3]]; })), 'worldHash quantised (1e-4 ignored)');
  /* session solo flow */
  var s = new N.Session({ seed: 'RILEY', players: 1 });
  var li = N.makeInput(); li.x = 2;
  s.queueInput(0, li);
  var got = s.inputsFor(0);
  ok(got.length === 1 && got[0].x === 2, 'session solo input path');
  s.tick++; s.queueInput(0, N.makeInput());
  ok(s.inputsFor(1)[0].x === 0, 'session next tick empty');
  s.replayFrom(1);
  ok(s.inputsFor(0)[0].x === 2, 'rollback keeps pre-rollback inputs, drops later');
  ok(s.inputsFor(1)[0].x === 0, 'post-rollback tick is empty');
  var h1 = N.simRng(999, 5), h2 = N.simRng(999, 5);
  ok(h1() === h2(), 'sim rng streams deterministic');
  console.log('  net: packet=' + pkt.length + 'B session=' + s.room);
})();

console.log(fails === 0 ? 'ALL ' + checks + ' CHECKS PASSED' : fails + '/' + checks + ' CHECKS FAILED');
process.exit(fails === 0 ? 0 : 1);
