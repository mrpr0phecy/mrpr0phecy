# 13 · THE FINISH

> *Professionalism in Second Life is not more prims. It is the absence of the four things a visitor reads as cheap: things that don't work when touched, things that look the same up close as far away, things that sound like nothing, and things that never say anything in particular.*

This is the document a builder checks against when they think they are finished. It is deliberately unforgiving and entirely mechanical: every item below is either a number, a test, or a rule with a reason attached.

---

## 1. Prim and LOD discipline

| Rule | Number | Why |
|---|---|---|
| no visible surface thinner than | **0.02 m** | below this the alpha and shadow sorting flickers from 10 m out |
| no prim smaller than | **0.05 m** on any axis | invisible at LOD 2, and the viewer will collapse it |
| link set soft limit | **≤ 64 prims** per cabinet / fixture | beyond this, edit lag and copy times become noticeable |
| faces per prim | **≤ 6** for anything repeated 20+ times | each face is a draw call; every cabinet face is multiplied by 24 |
| textures | **one 512² per material**, max 3 materials per cabinet | 24 cabinets × 3 = 72 textures; a 1024² each would be 300 MB of VRAM on a laptop at a sandbox |
| alpha | **one alpha layer per view** | two overlapping alpha-blended surfaces is the entire reason glass looks cheap in SL |
| **LOD**: any mesh | Medium ≥ 50 % of High, Low ≥ 20 %, Lowest = a solid box | a 200-LI mesh that vanishes at 20 m is worse than 20 prims |
| prim cost | the makers' rule: **if it can be two prims instead of three, it is two** | 109 LI × 24 is a region budget |

**"Text on a prim" is not a texture.** All signage in this build uses `PRIM_TEXT` (hovertext) or prim-sculpted letters. Baked text textures are the single most common sign of an amateur build: they are unreadable at distance, they alias, and they cannot be authored in-world.

---

## 2. Materials

Pick one look per material family and **use it everywhere**. Variation between cabinets reads as inconsistency, not richness.

| Surface | Type | Roughness | Metallic | Note |
|---|---|---|---|---|
| brass trim | PBR metallic | 0.32 | 1.00 | fallback: colour `#C9A24A`, specular 0.45, shininess 0.55 |
| lacquered cabinet | PBR | 0.18 | 0.00 | the gloss is the neo-Tokyo read; keep the colour deep |
| blackened steel | PBR | 0.62 | 1.00 | structure, rails, pinsetters |
| lane timber | PBR | 0.55 | 0.00 | 8 px/mm grain, no gloss — gloss on a lane looks like plastic |
| bowling pins | PBR | 0.35 | 0.00 | bone white `#E8E1D0`, never pure white |
| pool water | PBR + alpha | 0.06 | 0.00 | alpha 0.55, glow 0.08, no transparency above 0.6 or the caustics vanish |
| glass (cabinets, gallery) | PBR + alpha | 0.04 | 0.00 | **alpha 0.22**, tinted cyan 4 %; two sheets max in any line of sight |
| felt (casino, mini-golf) | PBR | 0.92 | 0.00 | the only matte surface in the build — it is the visual rest |
| ice | PBR | 0.10 | 0.00 | `#9FE6F2` at 0.92 alpha, glow 0.05 |
| safety net | alpha | 0.70 | 0.00 | **never** full-alpha: a net at alpha 1.0 is a wall |

**Emissive is the budget.** Glow does the work of lighting in a sandbox with no environment control: every sign, marquee and lane marking is a `PRIM_GLOW` between 0.25 and 0.55. Nothing in the build exceeds **0.60 glow** — above that, glow blooms into a white smear on every viewer with basic shaders.

---

## 3. Light

| Rule | Number |
|---|---|
| real local lights per 10 m of room | **≤ 2** |
| local lights visible at once (viewer limit) | **8** — assume the nearest 8 win and everything else is emissive |
| point-light radius | 4–6 m; anything larger washes the room flat |
| falloff | 0.75 (SL default reads as "no falloff" and is the tell of a hobby build) |
| contrast target | **4:1** between a lit surface and the wall behind it |
| darkness | the build's base value is `#07070A`; the *floor* should never be lit above 18 % luminance outside a game zone |

The rule that makes the house read as designed rather than decorated: **every light in the build is a source you can see.** A pool of light with no fixture above it looks like a mistake. If a zone needs more light, add a fixture and bill it — do not raise the ambient.

---

## 4. Sound

Four beds, twelve one-shots, one bell. Sound in SL is spatial by default; treat every cue as a physical object with a radius.

| Cue | Type | Length | Radius (m) | Trigger |
|---|---|---|---|---|
| `P33_room_low` | loop | 30 s | 12 | room tone, one per deck, phase-offset |
| `P33_room_gallery` | loop | 24 s | 10 | gallery only, quieter, airier |
| `P33_water` | loop | 20 s | 8 | the Flood and its grotto |
| `P33_ice` | loop | 18 s | 8 | the rink, very quiet, high |
| `P33_bell` | one-shot | 4.2 s | 40 | **the only sound that carries across the build** |
| `P33_cab_start` | one-shot | 0.4 s | 3 | credit accepted |
| `P33_cab_tick` | one-shot | 0.08 s | 2 | every 4th tick, not every tick |
| `P33_cab_score` | one-shot | 0.3 s | 3 | each point, pitch rising in fifths |
| `P33_cab_die` | one-shot | 0.6 s | 3 | run over, falling minor third |
| `P33_cab_house` | one-shot | 0.5 s | 3 | the House takes the lead back |
| `P33_pin` | one-shot | 0.25 s | 6 | 10 randomised variants |
| `P33_toll` | one-shot | 2.0 s | 60 | the hour (§`12` 3.7) |

**Rules.** `llTriggerSound` for anything that can overlap (pins, ticks, score); `llPlaySound` only for loops and the bell. **No sound over 0.5 volume except the bell and the Toll.** Kill all cabinet sounds when the run ends — a cabinet that keeps ticking after a player leaves is the single most disliked bug in SL arcades. One `llSetSoundQueueing(FALSE)` per cabinet, and silence on `CHANGED_REGION`.

---

## 5. Type and signage

Four tiers, four sizes, no exceptions. A visitor should be able to tell what something is at 20 m, what it does at 5 m, and what to do at 1 m.

| Tier | Content | Size | Colour | Placement |
|---|---|---|---|---|
| **wayfinding** | deck name, gallery name, the 34th door | 1.2 m cap height, extruded | bone on ink | perpendicular to the approach, above head height |
| **zone** | zone name + one clause | 0.5 m | brass | over the zone's threshold |
| **object** | what this is | 0.18 m, hovertext ≤ 3 lines | brass | 1.6 m above the prim |
| **whisper** | *one line, in the Croupier's voice* | 0.10 m, engraved or hovertext | bone at 60 % | where the hand naturally rests |

**Hovertext rules** (because every SL build gets this wrong): **≤ 3 lines, ≤ 32 characters per line, one per prim, never on a moving prim, and always a sentence with a full stop.** Hovertext is a whisper, not a manual. Anything longer belongs on a card in the Ledger.

---

## 6. The cabinet state machine

The face of the house. Every cabinet in the build runs this exact machine, and any deviation is a bug.

| State | Marquee | Sprites | Exit |
|---|---|---|---|
| `ATTRACT` | `TITLE · BEST n · HOUSE n+1` (4 s) | ghost replay | touch → `ARM` |
| `ATTRACT_WHISPER` | one Croupier line (2 s) | ghost replay continues | timer → `ATTRACT` |
| `ARM` | `PLAY · <name>` | cleared | first input → `RUN`, 10 s idle → `ATTRACT` |
| `RUN` | `YOU n · HOUSE m` | live | game over → `OVER`; player leaves → `ABANDON` |
| `OVER` | `THE HOUSE NOTICES · n` or `YOU n · HOUSE m` | death animation | 4 s → `COOLDOWN` |
| `COOLDOWN` | `NEXT · <name>` or blank | idle flicker | 5 s → `ATTRACT` |
| `ABANDON` | — | cleared | immediate → `ATTRACT` |

**`ABANDON` is mandatory.** If the player teleports out or crashes mid-run, the cabinet must notice within 3 s (`llGetAgentSize` on the stored key, checked on the existing timer) and reset. A cabinet stuck in `RUN` with nobody at it is dead until a region restart — in a sandbox, that is forever.

---

## 7. Permissions and copy policy

| Thing | Setting | Why |
|---|---|---|
| the build | **copy, no mod, no transfer** in the public folder | sandbox users must be able to re-rez after autoreturn |
| the master | copy/mod, owner only, kept off-parcel | you will need to fix a number |
| scripts | `no mod` | prevents a curious visitor editing the channel derivation |
| linkset data | **never** store anything but a score, a mask and a count | no names as keys, no free text from a visitor |
| sounds/textures | full perm in the folder, no transfer in the build | protects the artist, not the build |

**Nothing in the build may take permissions.** No `llRequestPermissions` anywhere, no attach, no animation request without an explicit touch-driven grant, no camera control. A build that pops a permissions dialogue on touch is a build people close.

---

## 8. Acceptance checklist

Twenty-five tests. A linkset is not finished until all of them pass, and the last ten are the ones hobby builds fail.

**Rez and survive**
1. Rezzes at 0,0,0 on a bare parcel with no rotation — nothing intersects the ground.
2. Rezzes inside a 512 m² parcel without crossing the boundary.
3. Survives a region restart: `CHANGED_REGION_START` → attract mode, scores intact from linkset data.
4. Survives autoreturn and re-rez: comes back with its best scores (linkset data travels with the object).
5. Two copies owned by two residents, side by side: neither hears the other (derived channels).

**Works**
6. Touch produces visible feedback in < 100 ms (§`12` loop 1).
7. Every pad, plate and button does exactly one thing, and it is the thing the label says.
8. A player who leaves mid-run: cabinet returns to attract within 3 s.
9. A player who stands still in `ARM` for 10 s: returns to attract.
10. Ten rapid touches do not double-start a run or double-post a score.

**Looks**
11. Every glow is ≤ 0.60, every light has a visible fixture.
12. Nothing is a single-sided plane facing away from its approach.
13. No surface is thinner than 0.02 m or smaller than 0.05 m.
14. Text is legible at 20 m / 5 m / 1 m at the three tiers in §5.
15. At night the build reads as a silhouette with lit windows, not a lit box.

**Sounds**
16. Nothing keeps ticking after its run ends.
17. The bell is the loudest thing in the build and the only thing audible from the parcel edge.
18. No sound is queued on rez; the build is silent until touched (sandboxes have neighbours).

**Loads**
19. 20 avatars in the box at once: no script-time warnings, no dropped touches.
20. 24 cabinets running: one timer each, no listeners, no sensors — check the object's script count and event stats.
21. A griefer clicking every object for a minute: no errors in the debug channel, no object moving, no permission request.
22. Loads on the **oldest supported viewer** without PBR: materials fall back to colour + specular and nothing turns white or invisible.

**Sells itself**
23. Someone who has never seen it can explain it after 90 seconds (`11` §5).
24. Someone who has seen it once comes back to a machine they remember (the Ledger's card proves it).
25. A builder who inspects it finds **one script per cabinet, no listeners, no permissions, no notecards** — and immediately understands why that is the professional answer.

---

## 9. Failure modes, and what the object does about them

| What happens in a sandbox | What the build does |
|---|---|
| region restarts mid-run | `CHANGED_REGION_START` → attract; scores are in linkset data, not memory |
| autoreturn, re-rez | nothing to do — all state is on the object, nothing is external |
| player teleports out mid-run | `ABANDON` within 3 s; hand and best unchanged |
| 40 avatars at once | cabinets are local-only; the bell is the only region-wide message, and it is once an hour |
| a neighbour's script on channel -3302 | impossible — channels are derived from the owner's key |
| someone clicks everything | no permissions, no listeners, no physics, nothing to break |
| sim lag (timer drift) | the Adder's tick is 0.30 s nominal; input is buffered one move ahead, so drift reads as "slightly slow", never as "unresponsive" |
| viewer with no PBR | fallback colour + specular on every material (§2) |
| the owner loses the folder | that is what the folder is for; the build cannot delete itself and never will |
| the sandbox closes | the build is copy/no-transfer in the visitor's inventory; it comes back somewhere else |

---

## 10. Definition of done

A linkset is done when **all four** are true:

1. It passes §8.
2. A stranger can use it without being told anything.
3. It says something in the Croupier's voice that is worth reading twice.
4. Removing it would be a loss.

Everything else — prim count, texture size, script length — is a means to those four. The build's whole aesthetic argument is that a house of games can be made carefully. **Care is the style.**

---

*See also:* `05-art-direction.md` (the look), `06-secondlife-constraints.md` (the platform), `12-the-loop.md` (the behaviour), `11-sandbox-edition.md` (the Box).
