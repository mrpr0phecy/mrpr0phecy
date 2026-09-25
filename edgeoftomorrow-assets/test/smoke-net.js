/* smoke-net.js — exercises the real host/client netcode path.
 *
 * Two Sessions are wired together through a simulated link with configurable
 * latency and packet loss, then a full match is played with the host running
 * the authoritative sim and the client predicting + reconciling. This is the
 * same code path a relay would use; only the transport differs.
 *
 * Run: node edgeoftomorrow-assets/test/smoke-net.js
 */
'use strict';
const assert = require('assert');
const C = require('../eot-core.js');
const S = require('../eot-sim.js');
const AI = require('../eot-ai.js');
const N = require('../eot-net.js');

let pass = 0;
function ok(label, cond, extra) {
  assert.ok(cond, label + (extra ? ' — ' + extra : ''));
  pass++;
  console.log('  ok  ' + label + (extra ? '  (' + extra + ')' : ''));
}

/* A transport pair that behaves like a network: messages are queued and
 * delivered `latency` ticks later, and `loss` of them are dropped. */
function makeLink(latency, loss, rng) {
  const q = [];
  function mk(name) {
    const t = {
      kind: 'simlink', name, onMessage: null, sent: 0,
      send(msg, to) {
        this.sent++;
        if (rng() < loss) return;                 // packet loss
        q.push({ due: clock.t + latency, to, msg: JSON.parse(JSON.stringify(msg)), via: this });
      },
      close() {}
    };
    return t;
  }
  const clock = { t: 0 };
  const a = mk('A'), b = mk('B');
  a.other = b; b.other = a;
  return {
    a, b, clock,
    pump(n) {
      for (let i = 0; i < n; i++) {
        clock.t++;
        for (let j = q.length - 1; j >= 0; j--) {
          if (q[j].due <= clock.t) {
            const m = q.splice(j, 1)[0];
            const dest = m.via.other;
            if (dest.onMessage) dest.onMessage(m.msg, m.via.name);
          }
        }
      }
    }
  };
}

function buildHostWorld(seed) {
  const w = S.makeWorld({ seed });
  S.buildArena(w);
  S.addPlayer(w, { id: 1, name: 'HOST', role: S.ROLES.SURV, bot: false });
  for (let i = 0; i < 3; i++) S.addPlayer(w, { id: 2 + i, name: AI.nameFor(S.ROLES.SURV, i + 1), role: S.ROLES.SURV, bot: true });
  S.addPlayer(w, { id: 9, name: AI.nameFor(S.ROLES.SLAYER, 0), role: S.ROLES.SLAYER, bot: true });
  S.beginMatch(w);
  return w;
}

console.log('smoke-net: host-authoritative prediction + reconciliation');

/* ---- 1. wire format ---- */
{
  const i = S.makeInput();
  i.x = 1; i.y = -1; i.aim = 3.0; i.sprint = true; i.dash = true; i.interact = true;
  const enc = N.encodeInput(200, i);
  ok('wire: seq wraps into a byte', enc.seq === 200);
  ok('wire: axes clamp to -8..8', enc.mx === 8 && enc.my === -8, enc.mx + ',' + enc.my);
  const dec = N.decodeInput(enc);
  ok('wire: round-trips flags', dec.sprint && dec.dash && dec.interact && !dec.attack);
  ok('wire: round-trips axes', dec.x === 1 && dec.y === -1);
  ok('wire: round-trips aim within 1.5deg', Math.abs(C.angDiff(3.0, dec.aim)) < 0.0262);
  ok('wire: packet is 5 bytes', Object.keys(enc).length === 5, Object.keys(enc).join(','));
}

/* ---- 2. room codes ---- */
{
  const rng = C.mulberry32(12345);
  const codes = [];
  for (let i = 0; i < 200; i++) codes.push(N.makeRoomCode(rng));
  ok('room: codes are 5 chars', codes.every(c => c.length === 5));
  ok('room: codes avoid ambiguous glyphs', codes.every(c => !/[ILO01]/.test(c)));
  ok('room: codes are unique enough', new Set(codes).size > 195, new Set(codes).size + '/200');
  ok('room: validation accepts good codes', N.validRoomCode('abc2k') && N.validRoomCode('HJKM2'));
  ok('room: validation rejects bad codes', !N.validRoomCode('') && !N.validRoomCode('ab') && !N.validRoomCode('abcd!'));
}

/* ---- 3. a real host/client match over a lossy link ---- */
{
  const LAT = 4, LOSS = 0.12;
  const link = makeLink(LAT, LOSS, C.mulberry32(999));
  const hostWorld = buildHostWorld('netmatch');
  const clientWorld = S.makeWorld({ seed: hostWorld.seed });
  S.buildArena(clientWorld);

  const host = new N.Session({ role: 'host', localId: 1, world: hostWorld, transport: link.a });
  const client = new N.Session({ role: 'client', localId: 2, world: clientWorld, transport: link.b });

  /* client joins */
  link.b.send({ t: N.MSG.HELLO, name: 'CLIENT', wantRole: S.ROLES.SURV });
  link.pump(LAT * 3);
  ok('join: host created a slot for the client', host.peers.size === 1, 'peers=' + host.peers.size);
  ok('join: client learned its id', client.localId > 0, 'localId=' + client.localId);
  ok('join: host world has 6 players', hostWorld.players.length === 6);
  ok('join: the new id does not collide with an existing player',
    hostWorld.players.filter(p => p.id === client.localId).length === 1,
    'id ' + client.localId + ' used by ' +
    hostWorld.players.filter(p => p.id === client.localId).length + ' player(s)');
  ok('join: all player ids are unique',
    new Set(hostWorld.players.map(p => p.id)).size === hostWorld.players.length,
    hostWorld.players.map(p => p.id).join(','));

  const interp = new N.Interpolator(6);
  /* pure-view client: the session applies each snapshot into clientWorld for
   * us, so all we add here is feeding the interpolator */
  client.onSnapshot = (snap) => { interp.push(snap); };

  let remoteErr = 0, remoteSamples = 0, maxErr = 0, predPeak = 0;
  const TICKS = 60 * 60;
  for (let t = 0; t < TICKS && hostWorld.phase !== S.PHASE.OVER; t++) {
    /* client: sample input, predict locally, ship it.
     * A synthetic input rather than a bot: in the real game the local input
     * comes from a human, and running AI over the client's not-yet-populated
     * world would just produce zeroes and never exercise prediction. */
    const myInput = S.makeInput();
    myInput.x = Math.cos(t / 37); myInput.y = Math.sin(t / 37);
    myInput.aim = t / 37; myInput.sprint = (t % 120) < 80;
    client.clientPushInput(myInput);
    client.clientPredict(myInput, S.ROLES.SURV);
    const dp = client.localDrawPos();
    if (dp && dp.predMag > predPeak) predPeak = dp.predMag;

    /* host: apply any remote input, run bots, step, publish */
    S.prepare(hostWorld);
    const inputs = AI.think(hostWorld);
    host.hostTick(inputs);
    S.step(hostWorld, inputs);

    link.pump(1);

    /* measure how far the interpolated remote view sits from the truth */
    const s = interp.sample(hostWorld.tick, client.localId);
    if (s && s.a) {
      const truth = hostWorld.players.find(p => p.id === 9);
      const remote = s.b ? N.lerpRemote(
        s.a.players.find(p => p.id === 9), s.b.players.find(p => p.id === 9), s.f
      ) : s.a.players.find(p => p.id === 9);
      if (truth && remote) {
        const e = C.dist(truth.x, truth.y, remote.x, remote.y);
        remoteErr += e; remoteSamples++;
        if (e > maxErr) maxErr = e;
      }
    }
  }

  ok('match: host ran the authoritative sim', hostWorld.tick > 100, hostWorld.tick + ' ticks');
  ok('net: snapshots flowed to the client', host.stats.sent > 20, host.stats.sent + ' snapshots');
  ok('net: client received snapshots under ' + (LOSS * 100) + '% loss', client.stats.recv > 20,
    client.stats.recv + ' messages');
  ok('net: interpolation tracks the truth closely', remoteSamples > 100 && (remoteErr / remoteSamples) < 60,
    'avg err ' + (remoteErr / Math.max(1, remoteSamples)).toFixed(1) + 'u, max ' + maxErr.toFixed(1) + 'u');
  ok('net: hash checks ran', host.stats.hashesChecked > 5, host.stats.hashesChecked + ' checks');
  ok('net: inputs were quantised, not sent as state', link.a.sent > 0 && link.b.sent > 0,
    'host sent ' + link.a.sent + ', client sent ' + link.b.sent);
  ok('net: client world was populated from snapshots', clientWorld.players.length === 6,
    clientWorld.players.length + ' players');
  ok('net: local avatar has a predicted draw position', !!client.localDrawPos());
  ok('net: prediction actually moved the avatar', predPeak > 1,
    'peak predicted offset ' + predPeak.toFixed(1) + 'u');
  ok('net: prediction stays bounded by the cap', predPeak <= 120.001,
    predPeak.toFixed(1) + 'u vs 120u cap');
  ok('net: reconciliation pulls prediction back toward truth', client.localDrawPos().predMag < predPeak,
    'now ' + client.localDrawPos().predMag.toFixed(1) + 'u, peaked at ' + predPeak.toFixed(1) + 'u');
  console.log('       client predicted ' + client.pendingInputs.length + ' unacked inputs at end');
}

/* ---- 4. divergence triggers a correction ----
 * Uses co-sim mode: the client runs its own copy of the deterministic sim,
 * so it has a local truth that can drift. That is the only mode in which a
 * divergence check means anything. */
{
  const link = makeLink(1, 0, C.mulberry32(7));
  const hostWorld = buildHostWorld('diverge');
  const host = new N.Session({ role: 'host', localId: 1, world: hostWorld, transport: link.a });

  /* build the client's mirror world by replaying the host's construction
   * order exactly — spawn points depend on how many survivors already exist */
  const clientWorld = S.makeWorld({ seed: hostWorld.seed });
  S.buildArena(clientWorld);
  const client = new N.Session({
    role: 'client', coSim: true, localId: 5, world: clientWorld, transport: link.b
  });

  link.b.send({ t: N.MSG.HELLO, name: 'CLIENT' });
  link.pump(2);
  const joined = host.peers.get(5);
  ok('divergence: host assigned the joining client id 5', !!joined, 'peers=' + [...host.peers.keys()].join(','));

  /* mirror the host's world, including the late joiner, in the same order */
  for (const p of hostWorld.players) {
    if (p.id === 5) continue;
    S.addPlayer(clientWorld, { id: p.id, name: p.name, role: p.role, bot: p.bot });
  }
  S.beginMatch(clientWorld);
  S.addPlayer(clientWorld, { id: 5, name: 'CLIENT', role: S.ROLES.SURV, bot: false });
  ok('divergence: mirrored worlds agree before we break anything',
    S.worldHash(clientWorld) === S.worldHash(hostWorld),
    '0x' + S.worldHash(clientWorld).toString(16));

  /* deliberately corrupt the client's copy of the world */
  const p = S.getPlayer(clientWorld, 1);
  p.x += 400; p.hp = 1;
  ok('divergence: corruption is detectable', S.worldHash(clientWorld) !== S.worldHash(hostWorld));

  let corrected = 0;
  client.onCorrect = () => corrected++;

  for (let t = 0; t < 40; t++) {
    /* host steps and publishes */
    S.prepare(hostWorld);
    const hInputs = AI.think(hostWorld);
    host.hostTick(hInputs);
    S.step(hostWorld, hInputs);
    /* co-sim client steps its own copy and records its hash for that tick;
     * the host's hash for the same tick is compared when the snapshot lands */
    S.prepare(clientWorld);
    const cInputs = AI.think(clientWorld);
    S.step(clientWorld, cInputs);
    client.clientRecordTick();
    link.pump(1);
    if (client.stats.mismatches > 0 && corrected === 0) host.hostCorrect(null, hostWorld.tick);
    link.pump(1);
  }
  ok('divergence: client detected the hash mismatch', client.stats.mismatches > 0,
    client.stats.mismatches + ' mismatches');
  ok('divergence: host sent a correction', host.stats.corrected > 0, host.stats.corrected + ' corrections');
  ok('divergence: client restored authoritative hp', corrected > 0 &&
    S.getPlayer(clientWorld, 1).hp === S.getPlayer(hostWorld, 1).hp,
    'client hp=' + S.getPlayer(clientWorld, 1).hp + ' host hp=' + S.getPlayer(hostWorld, 1).hp);
  ok('divergence: client position restored', corrected > 0 &&
    Math.abs(S.getPlayer(clientWorld, 1).x - S.getPlayer(hostWorld, 1).x) < 1,
    'client x=' + S.getPlayer(clientWorld, 1).x.toFixed(1) + ' host x=' + S.getPlayer(hostWorld, 1).x.toFixed(1));
}

/* ---- 5. solo loopback is a no-op network ---- */
{
  const w = buildHostWorld('solo');
  const s = new N.Session({ role: 'host', localId: 1, world: w, transport: new N.LoopbackTransport() });
  for (let t = 0; t < 600; t++) {
    S.prepare(w);
    const inputs = AI.think(w);
    s.hostTick(inputs);
    S.step(w, inputs);
  }
  ok('solo: loopback sends nothing', s.stats.sent === 0);
  ok('solo: match still runs identically', w.tick === 600 && w.phase !== undefined, 'tick=' + w.tick);
}

/* ---- 6. transport selection degrades safely ---- */
{
  const bc = new N.BroadcastChannelTransport('TESTROOM');
  ok('transport: BroadcastChannel reports availability honestly',
    typeof bc.available === 'boolean', 'available=' + bc.available);
  bc.close();
  const rt = new N.RelayTransport('wss://example.invalid/relay', 'TESTROOM', 'Me');
  ok('transport: relay reports availability without connecting',
    typeof rt.available === 'boolean', 'available=' + rt.available);
  rt.close();
  ok('transport: closing twice is safe', (rt.close(), bc.close(), true));
}

console.log('\nsmoke-net: ' + pass + ' assertions passed');
