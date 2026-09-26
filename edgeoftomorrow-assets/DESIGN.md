# EDGE OF TOMORROW — design foundation

A fast anime-styled **4v1 asymmetric action-horror** that runs entirely in the
browser. It inherits the *pressure* of Dead by Daylight / Forsaken but the
*pacing* of a fighting game: chases are short and decisive, and survivors are not
helpless — they have a blade, a dash with i-frames, and an ultimate.

## The loop

**Survivors (4):** seal **4 of 7 rift anchors** → the two rift gates power →
open a gate and escape. Repairing is loud and triggers **skill checks**: the
press owns the check (click/Space resolves it and can never accidentally swing
or dash), a great hit feeds the ultimate, a miss regresses the anchor. Survivors
can fight back: attacking *into* the Slayer's telegraphed swing is a **clash
parry** (a generous, reliable window — not a frame trap), and a charged
**Rift Nova** [R] damages and knocks him off. Depleting the Slayer's core
(320 HP) is a real win — *regicide*.

**Slayer (1):** marginally faster, hits twice as hard (two hits = down), can
smash anchors to steal progress, pick up the downed and hook them, and sprint a
**Cataclysm** dash-strike + Awakening when charged. Wins by wiping the team or
letting the clock close.

A hooked survivor passes through **three stages** [18s each] before the rift
takes them: the save is a decision with real time to make it, an early save
leaves stages in the bank, and the hook's pip display tells the team exactly
how urgent it is. The state machine every survivor cycles through is the
source of the fear and the fun: **hide → chase → downed → recovery → hide.**
Interfering with hide/chase/recovery is good teamwork; the downed window is
where the pressure lives.

One verb per key, and every verb is reachable: `Q` rewind, `R` ultimate,
`G` item/drop, `E/F` interact, Space dash-and-vault (a dropped pallet or a
window is always crossed, never dashed past), click attack/skill-check.

## Why it is high-octane (and how we keep it that way)

- **Short, decisive chases.** The slayer is only marginally faster; survivors
  win chases with the burst dash and by breaking line of sight. A missed
  swing costs the slayer real recovery time.
- **Fight-back.** Stuns and ultimates mean a cornered survivor is a threat,
  not a cutscene. That is the anime-brawler fantasy and it keeps chases
  two-sided.
- **Every action gets feedback.** Hitstop, trauma-decayed screen shake, impact
  frames, chromatic split reserved for big moments, speed lines on dashes,
  layered procedural audio. See `eot-render.js` / `eot-audio.js`.

## Balance is data, not vibes

`test/smoke-sim.js` plays dozens of full matches headlessly and prints a
tuning report (win split, swings, hits, downs, ults, anchors, escapes,
endings). Balance changes are made against that report, then re-measured. The
target is a survivor win rate near ~40–45% with a spread of endings (escape,
partial, wipe, regicide, clock) so no outcome dominates. As of this build,
pooled over 48 bot matches: **survivors ≈ 42%**, endings
`wipe ≈ 42% · escape ≈ 21% · regicide ≈ 21% · partial ≈ 8% · clock ≈ 8%`,
average match ≈ 84s.

Key levers, all in `eot-sim.js` `K`:
`ANCHORS_NEEDED`, `ANCHOR_RATE_*`, `SURV/SLAYER_SPRINT`, `DASH_*`,
`SLAYER_HP`, `SURV_ATK_DMG`, `SKILL_CHECK_*`, `HOOK_TIME`, `HOOK_STAGES`,
`BLEEDOUT`, `RESCUE_TIME`, `GATE_CHANNEL`, `MATCH_TIME`.

## The anime look (no assets, all geometry)

Canvas 2D, drawn from geometry so the game is a single self-contained page.
The "anime" is a set of specific choices, not a filter:

- flat colour bands on lit surfaces, never gradients
- shadows **hue-shifted toward violet**, not darkened toward grey
- a bold dark outline on every silhouette
- rim light on the side away from the key light
- halftone dots inside large shadows
- speed lines / impact frames / chromatic split reserved for big moments so
  they still mean something

Horror lighting is a dark wash with light pools punched on an **offscreen**
layer and composited over the scene (doing `destination-out` on the opaque main
canvas would erase the scene — a bug we caught and test against conceptually in
the render harness). The local player always has a light; the fear comes from
what sits at its edge, and the **terror vignette**'s pulse rate is the
proximity alarm.

## Roles for the files

| File | Owns |
|---|---|
| `eot-core.js` | math, seeded RNG, hashing, spatial hash, colour |
| `eot-sim.js` | the authoritative, deterministic simulation + tuning `K` |
| `eot-ai.js` | deterministic bot brains (also the solo fill) |
| `eot-net.js` | session, prediction, interpolation, transports, rollback |
| `eot-audio.js` | fully procedural WebAudio sound + adaptive music |
| `eot-render.js` | the cel-shaded renderer, camera, FX pools |
| `eot-engine.js` | fixed-timestep loop, hitstop, input, HUD, state machine |

The sim is a pure function of `(seed, tick, inputs)` — that single contract is
what makes netcode, replays and headless testing all possible.
