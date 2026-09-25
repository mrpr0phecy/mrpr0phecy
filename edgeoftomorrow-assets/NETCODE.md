# EDGE OF TOMORROW — netcode foundation

This documents the multiplayer layer (`eot-net.js`) and the determinism
contract it stands on (`eot-core.js` / `eot-sim.js`). It is intentionally a
*foundation*, not a finished service: the goal is an architecture that already
plays multiplayer today on a static host and can grow a real relay later
without touching the game.

## The model: host-authoritative + prediction + interpolation

One peer is **host**: it runs the simulation in `eot-sim.js` and is the only
writer of truth. Clients never send state — they send *inputs*. The host steps
the sim at a fixed 60 Hz and publishes quantised snapshots at 20 Hz plus a
divergence hash.

- **Local player — client-side prediction.** A keypress must land on the frame
  it happens, so the client applies its own input as a *predicted offset* on
  top of the last confirmed position (`clientPredict` / `localDrawPos`). The
  offset is capped and decayed by `reconcile`, so it can never run away from
  the truth and a large correction snaps without ever unwinding simulated
  state. Prediction never mutates the authoritative world.
- **Everyone else — snapshot interpolation.** Snapshots arrive at 20 Hz but we
  render 60+. Rendering a remote entity at its newest snapshot stutters, so
  `Interpolator` renders remote players ~100 ms in the past, lerping between
  the two snapshots that bracket that time (`lerpRemote`). Discrete state
  (hp, downed, hooked) is taken from the newer snapshot past the midpoint so
  it reads at the right moment instead of interpolating.

## The wire format

Message types live in `N.MSG` (numeric, stable — this is the contract a relay
implements). The hot path is tiny:

- `INPUT`: `[seq:1][mx:1][my:1][aim:1][flags:1]` = 5 bytes per player per tick.
  At 60 Hz that is 300 B/s per player; 8 players ≈ 2.4 KB/s. Bandwidth is not
  the constraint — snapshot size is, hence the quantised snapshot.
- `SNAPSHOT`: the flat, ordered `S.snapshot(world)` plus the divergence hash
  *for that tick*. The hash rides on the snapshot on purpose: a standalone
  hash on its own cadence would ask a client to verify a tick it holds no
  state for, and the check would silently never fire.

## Divergence & rollback

Two client modes, and the difference matters:

- **Pure view (default).** The client simulates nothing; it renders what the
  host sends. There is no local truth to diverge from, so a hash check would
  be theatre. This is what the shipped game uses.
- **Co-sim (`coSim:true`).** The client runs its own copy of the deterministic
  sim, records its own hash per tick (`clientRecordTick`), and compares the
  host's hash *for the same tick*. A mismatch asks the host for a lossless
  `captureState()` (`MSG.CORRECT`) and the client rolls back with
  `restoreState()`. This is the deterministic-sim roadmap path; it is tested
  end-to-end in `test/smoke-net.js`.

`snapshot()` (interpolation) is deliberately lossy; `captureState()` is the
lossless pair the rollback path uses. `PLAYER_FIELDS` is asserted by the sim
test to cover every simulated field, so adding a field without updating the
capture fails a test instead of silently desyncing peers.

## Transports (pluggable, the game doesn't know which is live)

- **LoopbackTransport** — solo + bots. No network. `hostTick` skips publishing
  when there are no peers, so solo play doesn't serialise snapshots for
  nobody.
- **BroadcastChannelTransport** — real multiplayer between browser tabs and
  windows on one machine. Zero backend, works on a static host today. This is
  genuinely networked code (separate JS heaps, message passing), not a fake,
  and it exercises exactly the host/client path a relay would.
- **RelayTransport** — the production path. A tiny *stateless* WebSocket relay
  that forwards opaque frames (`[type:1][len:2 BE][payload]`). Because the
  relay never simulates, it cannot break determinism or authority. The framing
  is final, so a relay can be added without touching the game.

## What runs today / the roadmap

Today: solo vs bots (always a full 4v1), and same-machine rooms over
BroadcastChannel with bot backfill for empty slots.

Roadmap, in order:

1. **Stateless relay** — host a `RelayTransport` endpoint; everything else is
   already in place.
2. **Delta-compressed snapshots** — the snapshot is flat and ordered so deltas
   layer on without touching the sim.
3. **Server-authoritative** — move `S.step` into a host process (same JS);
   clients become input senders + interpolators. The Session surface is
   unchanged; only the transport endpoint moves.

## Invariants (do not break)

- The sim stays a pure function of `(seed, tick, inputs)`. No `Math.random` on
  the sim path; all simulated randomness comes from `C.simRng`.
- `worldHash` hashes the *snapshot*, never higher precision than the wire.
- Snapshots interpolate; captures roll back. Don't conflate the two.
- Keep the input packet ≤ 5 bytes; add a new packet type rather than widening
  the 60 Hz path.
