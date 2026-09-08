# RILEY — netcode foundation

This documents the deterministic lockstep layer under the game (`riley-net.js`,
wired in by `riley-engine.js`). It is intentionally **small and boring**: the
goal is a rock-solid foundation that can grow into a serious online game, not
a finished multiplayer feature.

## Design rules

1. **One simulation, everywhere.** The engine steps physics on a fixed
   60 Hz tick (`FIXED = 1/60`). Rendering interpolates on `requestAnimationFrame`.
   Nothing in the sim path uses `Math.random()` — all simulated randomness
   comes from `N.simRng(worldSeedNum, tick)`, a mulberry32 stream re-seeded
   from the shared world seed + tick number. `Math.random()` is only allowed
   for purely visual effects (particle spawns, camera shake) and for choosing
   the *random world seed* on the host before the session starts.

2. **Inputs are tiny.** One 3-byte packet per player per tick:
   - byte 0: move X quantised to −8…8
   - byte 1: move Y quantised to −8…8
   - byte 2: flags — fire, jump, dash, nova, melee, lock, aimX, aimY

3. **Every packet is checksummed.** Tick packets carry an FNV-1a checksum of
   their input bytes (`encodeTick` / `decodeTick`).

4. **World state is hashable.** `N.worldHash(entities)` folds quantised
   positions + hp of every entity (stable id order) into a 32-bit hash. The
   engine records it every 8 ticks (`session.recordWorldHash`). Equal hashes
   at equal ticks ⇒ in sync; a mismatch ⇒ rollback from `replayFrom(tick)`.

## What runs today

- **Solo via `LoopbackTransport`.** `Session` already speaks the host/client
  protocol surface (`queueInput`, `inputsFor(tick)`, `tickPacket()`,
  `replayFrom(tick)`), it just has no remote peer. The engine builds
  `raw controls → input → session → sim` on *every* tick, so switching a
  player to a remote feed is a data-source change, not an engine rewrite.
- **Determinism is tested.** `test/smoke-engine.js` boots the real engine
  headlessly (fake DOM + fake WebGL) and asserts two full runs of the same
  seed produce identical world hashes. Keep it green when you touch the sim.

## Roadmap (in order)

1. **Relay** — a tiny stateless WebSocket relay rooms (join, sync handshake
   JSON, forward tick packets). `WebSocketTransport` already implements the
   wire framing: `[type(1)][len(2 BE)][payload]`, types 1 tick / 2 hash /
   3 handshake / 4 ack. The relay never simulates; it cannot break
   determinism.
2. **Host-authoritative lockstep** — one peer is host: it drives ticks,
   broadcasts `tickPacket`, and compares `worldHash` every 8 ticks. Clients
   run the same sim and send their 3-byte inputs. Divergence ⇒ host
   re-sends the last good state snapshot + input replay via
   `Session.replayFrom`.
3. **Server-authoritative** — move the sim into the host process (same JS,
   one `stepSim` per tick), clients become input senders + state
   interpolators. The `Session`/`worldHash` surface is unchanged; only the
   transport endpoint moves.

## Invariants (do not break)

- The sim must stay a pure function of `(worldSeed, tick, inputs[0..tick])`.
  If you add an effect the sim depends on, it must be seeded by `simRng`.
- Entity lists used for `worldHash` must be in **stable id order**
  (spawn index), and every hashed entity needs the same 4 fields
  `[x, y, z, hp]`.
- Menus that freeze the tick must not consume it: the between-wave boon pick
  sets `state = 'pick'`, the loop renders but never steps, and the chosen boon
  is applied as a multiplier on existing tick constants (`buffMul()` is the one
  door for damage/speed/regen). A run with the same seed and the same picks in
  the same order hashes identically — do not move boon state into wall time.
- Keep inputs ≤ 3 bytes. If a future action doesn't fit, add a second
  packet type — don't widen the 60 Hz path.
- `test/smoke-pure.js` (module unit checks) and `test/smoke-engine.js`
  (headless engine + determinism) must both pass.
