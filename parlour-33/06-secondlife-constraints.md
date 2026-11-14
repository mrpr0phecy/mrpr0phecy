# 06 — Second Life constraints, budget, and policy

This is the file that keeps the build from becoming a beautiful thing that nobody can walk through. Every number here is a limit that has already been decided for you by the platform; the job is to spend inside them.

---

## 1. Land impact

**Assumption: one full private region, 30 000 LI, 256 × 256 m.** (Homestead and mainland full regions differ; if you are on 20 000 or 5 000, see §1.3.)

### 1.1 The committed budget — 28 400 LI

| # | Zone | LI | % |
|---|---|---:|---:|
| 1 | Envelope & façade (block walls, glazing, roof, parapet) | 2 600 | 9.2 |
| 2 | Structure — the right-angled grid, slabs, deck finishes | 1 800 | 6.3 |
| 3 | Circulation — the Zigzag (4 stairs), 2 lifts, the gallery rails | 1 330 | 4.7 |
| 4 | The Threshold + the Shoebox (street) | 450 | 1.6 |
| 5 | The Sump + the Hive (B1) | 350 | 1.2 |
| 6 | **The Undercroft** — laser quest (B1) | 1 500 | 5.3 |
| 7 | **The Flood** — pool, grotto, bar | 1 150 | 4.0 |
| 8 | Chrysalis — changing | 380 | 1.3 |
| 9 | The Drowned Parlour | 680 | 2.4 |
| 10 | The Penny Parlour — 8 machines | 620 | 2.2 |
| 11 | **The Mirror** — ice rink, glass, boards, hire | 950 | 3.3 |
| 12 | **The Lane** — bowling ×10 | 2 050 | 7.2 |
| 13 | The Salon | 680 | 2.4 |
| 14 | **Cabinet Row** — arcade ×24 | 1 750 | 6.2 |
| 15 | **The Lodge** — casino ×12 | 1 450 | 5.1 |
| 16 | The Sanctum | 380 | 1.3 |
| 17 | **The Warren** + the Nest | 1 400 | 4.9 |
| 18 | **The Water Chute** — 3 slides | 560 | 2.0 |
| 19 | **The Ribbon** — mini golf ×18 | 1 600 | 5.6 |
| 20 | **The Thread** — rollercoaster | 1 800 | 6.3 |
| 21 | **The Spiral** — karting ×6 | 1 850 | 6.5 |
| 22 | The Crown | 700 | 2.5 |
| 23 | The Belvedere + roof | 380 | 1.3 |
| 24 | Signage, plaques, wayfinding | 560 | 2.0 |
| 25 | Lighting fixtures | 680 | 2.4 |
| 26 | Dressing, automata, props | 750 | 2.6 |
| | **Committed** | **28 400** | **94.7** |
| | **Contingency** | **1 600** | 5.3 |

**Rules of the budget:**
- No zone may exceed its target by more than **15 %** without a re-plan.
- Contingency is spent **last**, and only on the galleries, the Salon or the Lane — the three places a visitor forms an opinion.
- A zone that comes in under budget returns the surplus to contingency, and it is not immediately spent.

### 1.2 Where the savings actually come from

| Technique | Typical saving |
|---|---|
| Physics shape **none** on all decoration | 40–60 % of those objects |
| Physics **convex hull** rather than prim on structural mesh | 30–50 % |
| One mesh linkset per wall rather than 40 panels | 60–80 % |
| Reusing one chair mesh 40 times (same object, not copies) | 40 prims → 40 prims but **4 draw calls** |
| Single-face signage with an atlas rather than modelled letters | 10× |
| Pins, balls, nets, dressing with no scripts in the linkset | script budget, not LI |
| LOD models authored deliberately (see §2) | prevents LI inflation at upload |

### 1.3 The 20 000 LI trim

If the region gives you 20 000, cut in this order — every cut is designed to cost you *breadth*, never the galleries:

| Cut | Saves |
|---|---:|
| Arcade 24 → 14 cabinets | 700 |
| Mini golf 18 → 9 holes (keep 1, 6, 12, 18) | 750 |
| Bowling 10 → 6 lanes | 600 |
| Casino 12 → 8 tables | 480 |
| Laser quest: 2 decks → 1, drop the catwalks | 450 |
| Cut the Warren's upper deck (L5 west) | 300 |
| Karts 6 → 3, halve the circuit | 600 |
| Coaster: cut the roof loop, keep the interior thread | 650 |
| Dressing 750 → 400 | 350 |
| Facade detail → flat band with emissive windows | 500 |
| **Total** | **5 180** |

Result ≈ **19 200 LI** and the building still reads exactly as designed, because the galleries, the Lane and the Mirror are untouched.

---

## 2. Textures, materials and LOD

| Limit | Value |
|---|---|
| Unique textures | **≤ 96** |
| Texture families (atlases) | **≤ 8**, each 1024 × 1024 |
| Total texture memory | **< 40 MB** on region |
| Max texture size | 1024, except 3 designated hero decals at 2048 |
| Materials | PBR, one per family, with a **flat fallback** set |

**LOD discipline — this is where SL builds die.**
- Author all four LOD models at upload time. **Never** use auto-generated LOD on anything larger than 2 m.
- Test every hero asset at `RenderVolumeLODFactor = 1.0` (the low default) — if it collapses into a blob at 30 m, it is wrong.
- The block, the walls and the rides must all hold silhouette at **60 m at LOD factor 1.0**, because from the plaza that is the distance at which people judge the build.
- The parapet, the coaster track, the kart barrier and the gallery glazing are the four assets that must never disintegrate.

---

## 3. Alpha and draw order

The build has more glass than a normal SL build and will be punished for it if this is done casually.

| Rule | Why |
|---|---|
| **Alpha-masked everywhere possible; alpha-blended only where unavoidable** | masking sorts correctly and is cheaper |
| **Glass is one plane, never two** | two blended planes = guaranteed flicker |
| Maximum **2 blended layers** in any single sightline | the rink over the pool is the hard case; see below |
| The gallery glazing is the one big alpha surface on the build | it is looked *through* from every hall, on every deck |
| Nets and foliage are masked, with a **solid proxy collider** beneath | walkable, cheap, no sorting |

**The two hard cases.**

**One — the gallery glazing.** 58 m of glass on every deck, with a hall on each side. It is the build's whole idea and it is also the single biggest alpha risk. Rules: **one plane**, alpha-masked, split into four 14.5 m panels with 0.3 m mullions, and **no second sheet anywhere behind it**. Where a kart ribbon or a coaster passes on the other side, add a solid 1.1 m kerb so the eye has something opaque to anchor on.

**Two — the rink-over-pool case:**
- the rink deck top plane = **alpha-masked**, with cut portholes near the boards
- the pool is seen through those cuts and through the 1.2 m perimeter band
- the ice material is opaque-with-portholes, not transparent
- result: **one** blended plane in that sightline (the water surface), which is stable

If a builder proposes "just make the whole floor glass", the answer is no, and the reason is this paragraph.

---

## 4. Physics

Physics is the second biggest cause of lag after scripts, and the biggest cause of things looking broken.

| Category | Physics shape |
|---|---|
| Structural mesh, walls, decks | **Convex hull** |
| Decoration, signage, lamps, props | **None** |
| Walkable nets, track ribbons, ramps | **None** + separate invisible convex-hull collider prims |
| Bowling pins | **None** |
| Bowling ball | **None** (KFM) |
| Golf ball | **Prim** — the only physical object class in quantity (18 max) |
| Air hockey pucks | **Prim** (2) |
| Pinball balls | **Prim** (3) |
| Avatars, karts, trains, slides | **Non-physical**, KFM + sit |

**Total physical objects at rest: ≤ 24.** If a build element needs physics to work, it needs a re-think first.

**Triggers:** use `llVolumeDetect` volumes for zones (water, rink, pool, pits) rather than sensors. `llSensorRepeat` is the single most common lag source in SL leisure builds and there is almost no reason to use it here.

---

## 5. Scripts

| Limit | Value |
|---|---|
| Total scripts on region | **≤ 220** |
| Memory per script | 64 KB (Mono) |
| `llListen` calls | **≤ 12** total, on private channels |
| Timers running at once | **≤ 20** |
| `llSensorRepeat` | **0** |
| Region script time (idle) | **< 2.0 ms/frame** |
| Region script time (40 avatars, all attractions live) | **< 6.0 ms/frame** |

**Architecture:**
- **One controller, many dumb children.** A single `P33_house_controller` holds season state, scores, leaderboards and the 33 plaques' state. Plaques are dumb: one face, one link message.
- **Listen and forget.** Every `llListen` is opened with a specific integer name, used, and closed. No permanent listeners on a public channel.
- **Stagger.** Every timer in the build gets a random initial offset of 0–0.5 s. Twenty timers firing on the same frame is a stutter you can feel.
- **Generate textures, do not poll.** Scoreboards render on change, not on a timer.

**One script per ride, per cabinet, per table.** Not one per pin, per ball, per chair.

---

## 6. Policy — read this before building the casino

This is the section that keeps the build online.

### 6.1 No wagering

Second Life prohibits wagering Linden dollars outside of approved Skill Gaming regions and approved operators. **This build does not wager, in any form, anywhere.** Concretely:

| Permitted | Prohibited |
|---|---|
| cosmetic chips and tokens with **no L$ value** | chips bought with L$, or sold for L$ |
| free play, unlimited, no stake | any stake of L$ or anything convertible to L$ |
| leaderboards and degrees as rewards | any payout in L$, objects, or transferable items |
| a room *styled* as a casino | the word "casino" implying real play in the parcel name or search tags |
| card games, roulette, faro as **skill/games of chance with no consideration** | raffles, lotteries, "buy a spin" |
| a free claw machine with a cosmetic prize | prizes with resale value |

**Also:**
- Tokens are **non-transferable**, granted free, and cannot be bought.
- No object in the build accepts payment for a chance at anything.
- Put the house rule in-world (§05 §4) and in the parcel description.
- Check the current Skill Gaming Policy and Terms of Service **at launch**, not at design time. Policies change; this document is not legal advice.

### 6.2 Rating and search

| Setting | Value |
|---|---|
| Parcel rating | **Moderate** |
| Parcel name | `PARLOUR XXXIII — house of games` |
| Parcel description | the house rules, in 33 words; explicitly states no wagering, no purchase needed |
| Search tags | `arcade, bowling, laser tag, mini golf, karting, rollercoaster, pool, ice rink, hangout, roleplay-friendly, neo-tokyo, immersive` — **not** `casino, gambling, betting, slots` |
| Landing point | the Threshold, on the plaza, facing the door |
| Damage | **off** |
| Voice | off by default (a busy sim with voice open is chaos) |
| Media | the House stream only |

### 6.3 Content

- No real-world religious, political or fraternal branding. The symbolism is **Victorian fraternal absurdism**, invented, and it must read as invented.
- No real gambling branding, no real logos.
- Ages: the build is designed for adults and older teens but contains nothing that requires Adult rating.

---

## 7. Performance budget and event mode

### 7.1 Idle (0–20 avatars)
Everything on. 9 particle systems, 12 shadow-casting spots, all rides running on demand.

### 7.2 Busy (20–50 avatars)
The controller drops to **mode B** automatically at 40 avatars:
- particles 9 → 4 (keep the gallery haze, the Lodge smoke, the pool caustics, the steam)
- shadow spots 12 → 4
- rides run on demand only (coaster and karts park)
- the arcade's `llSetText` off

### 7.3 Event (50–80 avatars, or any scheduled event)
**Mode C**, triggered by the Steward or a group notice:
- particles → 2
- shadows → 0
- **the coaster is closed**; the karts run 1 train / 2 karts
- the Warren's loose balls despawn
- bowling goes to 4 lanes with a queue

Mode C should cost **~4 000 LI of visual effect and ~28 % of script time**, and the building should still look like itself: the galleries, the water, the neon and the lanes all stay.

### 7.4 What never gets cut
The gallery haze, the water planes, the gallery glazing, the neon textures, the 33 plaques, the Salon, and the view down from the Croupier's Pit. Those are the build.

---

## 8. Region and parcel settings

| Setting | Value | Why |
|---|---|---|
| Object entry | **on** | so people can drop things, and so karts/trains can cross the parcel line |
| Safe (no-push) | on | a coaster and a kart track are push hazards |
| Fly | **on** | never take flight from a leisure build; people will hate you |
| Fixed sun | **on**, at 03:00 | the build is a night interior; a moving sun ruins it |
| Parcel music | the House stream, 96 kbps | |
| Autoreturn | 30 minutes | keeps the sim clean during events |
| Build | group only | |
| Teleport routing | landing point | |
| Agent limit | none set in-region; manage with Mode C | |

**Fixed sun at 03:00 with parcel fog is the single highest-value setting in this list.** It makes every screenshot consistent and it hides the plaza.

---

## 9. Reliability rules for anything that moves

Everything that moves is **KFM (keyframed motion)**, sitting avatars, and no physics.

1. **Never let a rider control a vehicle.** Input = brake, boost, null. That is all.
2. **Every ride has an ejector**: `CHANGED_LINK` on stand-up → teleport to the nearest safe deck, never into the void.
3. **Every ride has a re-sync** on a 5-minute timer and on region change.
4. **Every aperture is 0.4 m wider than the ride envelope**, and chamfered, so a drifted train never clips.
5. **No ride crosses a region boundary.** One region, full stop.
6. **Nothing is rezzed at run time** except bowling balls, golf balls and splash effects. All three have a lifetime and an autoreturn.

---

## 10. Comfort and accessibility

Cheap things that make people stay:

- **Camming is the real camera in SL.** Every zone must be *designed to be cammed*: no invisible walls in a sightline, no blockers between the deck and the view.
- **Sit targets** on every seat, ride, slide and bench, and every one of them returns you upright on stand.
- **No forced animations** outside a ride, and every override is cleared.
- **No permission dialogs** — everything inside the Experience.
- **Readable signage at 12 m** minimum.
- **A way out of every space** in one click (the lifts stop at every deck; the Thread is continuous).
- **A quiet room**: the tea room on L3 is deliberately low-sound with a view. Some people need one.
