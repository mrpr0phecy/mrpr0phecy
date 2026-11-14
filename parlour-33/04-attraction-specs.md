# 04 — Attraction specifications

Eleven attractions. Each entry is written to be executed without further questions: footprint, land impact, mechanic, LSL approach, the thing that will go wrong, and the test that proves it works.

Land impact figures are **targets** and they sum with the shared costs to 28 400 LI (see `06` §1). If a bot blows a target by more than 15 %, stop and re-plan; do not borrow from another zone silently.

---

## 0. Shared systems (build these first, everything else depends on them)

### 0.1 The Experience
Register one Experience, e.g. **`PARLOUR XXXIII`**. Everything that needs to touch an avatar (HUD give, slide sit, camera override, animation override, teleport) runs inside the Experience so there are **no permission dialogs**. A build that asks for permissions eleven times is not "unproblematic".

### 0.2 The HUD (one attachment, one script set)
| Part | Function |
|---|---|
| `P33_HUD_core` | 33 pip slots, 4 suit rows, 1 key row, season state (30-day expiry), talks to the sigil controller over a private channel |
| `P33_HUD_card` | renders the 34th-degree card (name + first-entry date) as a texture |
| `P33_HUD_meter` | optional: kart speed, laser health, bowling frame — swapped by a link message |

HUD is **1 attachment, 3 scripts, `llGetMemoryLimit` well under 64 KB**. Never give a player more than one attachment.

### 0.3 Tokens
Tokens are **free, non-transferable, no L$ value, no purchase path.** The Hive gives 20. Arcade cabinets take 1 and return nothing of value. The Penny Parlour is free. This is not just good manners — see `06` §6.

### 0.4 Scoreboards
One mesh board per competitive attraction (bowling, laser, golf, karts, coaster lap time, arcade high scores). Each is a single face with a dynamically-generated texture. **One shared board brain script**, six instances, all on a single `llSetText`-free render path.

### 0.5 The Stewards
Two NPC host bots, 1 mesh each, dressed as ushers, not as butlers. Lines are short, deadpan, and never explain the building. One at the Threshold, one in the Salon.

---

## 1. BOWLING — "The Lane" · L2 (+35.00) · **2 050 LI**

**What it is.** Eight tenpin lanes forming the bridge across the Oculus. 25 m long overall: 14 m approach/console on the north floor, 15 m of lane over the void, pin deck cantilevered on the south lip.

**Footprint.** 14 m wide × 25 m long (x 121–135, z 114–144). Lanes run north–south. Lane width 1.55 m + 0.35 gutter, 8 lanes + 7 shared ball returns = 14 m.

**How it works.**
- Ball: a single mesh sphere per lane, **non-physical**, moved with `llSetKeyframedMotion` along a straight spline with a small lateral offset derived from the player's aim.
- Pins: 10 per lane, **physics shape = none**, standing where they stand. Each pin has one scripted state: standing → falling (rotate 80°, 0.4 s) → settled → swept.
- Hit detection: the ball `llCastRay` forward every 0.08 s while it travels. First pin contact → the pin falls and, with a probability falling off by distance from the contact, so do its neighbours. This is deliberately *not* a physics simulation, and it is why the build will still run at 60 avatars.
- Scoring: standard tenpin, 10 frames, strike/spare/spilt, on the console and the shared board.
- Two consoles per pair of lanes (`llDetectedTouchST` on one face — 8 faces, 8 hit zones, **1 script**).

**The thing that will go wrong.** Balls left in the lane. Every ball needs a 12 s timeout that returns it to the rack, and a `CHANGED_LINK` check so a re-rez does not leave a ghost.

**Build notes.** Lane surface: one 1024 atlas, 8 faces off it. Gutters and returns can be a single mesh linkset per lane pair. Do not model the pinsetter machinery in detail — silhouette only, behind smoked glass (see the Pin station, L2 south).

**Views.** Down: the pool and the rink through the Oculus, 11 m below. Up: the Lodge's soffit and, through the shaft, the coaster. Across: casino and arcade.

**Acceptance test.** Bowl 20 balls from 4 avatars simultaneously. No ball crosses a lane boundary by more than 0.2 m, no pin is left floating, score on the board matches the console, and the sim's script time does not exceed 4 ms.

---

## 2. ICE RINK — "The Mirror" · L1 (+29.50) · **950 LI**

**What it is.** A 30 × 18 m rink on a **structural glass deck directly above the pool**. This is the build's single best idea; do not economise it away.

**Footprint.** x 113–143, z 97–115. Glass deck 283 mm of "glass" (two 4 mm alpha-masked planes + a frame), ice surface at +29.50, boards 1.1 m.

**How it works.**
- Ice is cosmetic: a low-roughness PBR sheet with a subtle normal map and a slowly drifting sheen. **Do not** try to reduce avatar friction; SL does not expose it.
- Skate prop: an attachment with skates + a `llSetAnimationOverride` set (WALK, RUN, TURNLEFT, TURNRIGHT) — the single trick that makes an SL rink feel like a rink. Applied inside the Experience, cleared on leaving the rink volume.
- Two curling houses painted at the ends (see `01` — curling is the rink's parlour ancestor).

**The thing that will go wrong.** Glass. Two alpha-blended planes over a lit pool is exactly where SL's draw order breaks. Fix at build time, not after: **the deck is alpha-masked (not blended) on the top plane**, and the pool is only visible through a limited number of *cut* portholes near the boards. Skaters see swimmers through the portholes and along a 1.2 m perimeter band; they do not see them through the entire floor. That is both cheaper and more dramatic.

**Build notes.** Boards: 3 m mesh sections, 12 per side, 1 LI each. Freeboards (the transparent bit) = alpha-masked. See `06` §3.

**Views.** Down through the ice/portholes into the pool. North across the shaft to the Lane. Up to the Warren.

**Acceptance test.** Stand at centre ice: the pool is visible through the portholes, the Lane is visible across the shaft, and no alpha sorting flicker occurs at any camera angle while walking a full circuit.

---

## 3. SWIMMING POOL + SLIDES — "The Flood" and "The Water Chute" · L0 (+24.00) · **1 150 + 560 LI**

**What it is.** A 26 × 15 m pool whose north lip is the bottom of the Oculus, a grotto swim-up bar under the west end of the rink, and three flumes from L4 (+46.00) that fall 23 m into the water.

**Footprint.** Pool x 115–141, z 100–115. Water surface +23.30, floor +21.20, depth 2.1 m. Grotto x 115–122, z 100–107.

**How it works — swimming.**
Avatars do not swim in SL, so we fake it properly:
- A **swim volume** (an invisible box, `llVolumeDetect`) covering the pool.
- On entry, the Experience attaches a `P33_SWIM` HUD which uses **`llSetAnimationOverride`** for `FALL_DOWN`, `WALK`, `RUN` → swim/idle-tread, and applies a gentle upward `llSetForce` while submerged so you float at the surface.
- On exit, override cleared. Never leave an override on: it is the SL equivalent of leaving a fork in the toaster.

**How it works — slides.**
Per flume: a `sit target` at the top, an Experience `llTeleportAgent` to the seat, `llSetKeyframedMotion` down the spline (≈11 s), `llSetLinkCamera` giving a POV camera, then a splashdown trigger that stands the avatar up in the water and plays a splash. **Three flumes, three speeds**: left is slow and open, middle is fast with a dark 6 m section, right is a full helix. All three drop in the west slot of the shaft, between the lane bridge and the wall, and splash into the open water of the Sunbeam — so a rider falls 23 m through the middle of the building with the lanes overhead.

**The thing that will go wrong.** Riders who stand up mid-slide. Detect `changed(CHANGED_LINK)` and eject to the nearest deck, not into the void.

**Build notes.** Water: one alpha-masked plane at +23.30 with a caustic map, plus a second plane 0.05 m below at a different scroll speed. Two planes, not a volume. No physical water. The Lodestone's reflection is faked with a dark mirror plane under the shaft mouth.

**Views.** Up the 33 m well: rink above, lanes above that, the Warren, the coaster crossing, the Belvedere. This is photo spot 1.

**Acceptance test.** Ride all three flumes end-to-end: no stuck avatars, splashdown inside the Sunbeam, camera returns to normal within 2 s. Swim from the grotto to the Sunbeam without leaving the volume.

---

## 4. JUNGLE GYM — "The Warren" · L4 (+46.00) · **1 400 LI**

**What it is.** Not a room. A net-and-tube structure hanging across the **east half of the void** between +43.00 and +51.00, four levels of rope, mesh tube and platform, with the Nest (a ball pit) on the west plate.

**Footprint.** Half-disc of the shaft: radius 13.6 m, angles −72° to +72°. Plus the Nest: a 9 m disc on the west plate.

**How it works.**
- Walkable netting = **alpha-masked mesh with an invisible convex-hull collider slab** under each net panel. Nets look like nets; the collider is a smooth plane. This is the only way to make netting walkable without 400 physics hulls.
- Avatars cannot climb. So the Warren has a **scripted rope ladder** (the Jacob's ladder, 9 m, at the shaft lip) which is a `sit`-and-ascend prop, plus one hidden spiral stair inside the tube stack.
- The Nest is **not** 400 physical balls. It is: one sculpted ball-pit mesh with a churning normal map, plus 12 interactive "loose" balls that bounce (physics off, keyframed on touch). Nobody has ever counted.

**The thing that will go wrong.** Falling out. The Warren's outer edge must have an invisible 1.1 m fence at its perimeter and a **catch net at +40.5** (a single alpha-masked plane with a "you fell" trigger that returns you to L4). A fall of 5 m into the Lodge is funny once.

**Build notes.** Tubes: 6 curved alpha-masked segments, 1 LI each. Rope: 3 m sections, repeating. Colour: bottle green and safety orange. It should look like a Victorian conservatory frame got pregnant.

**Views.** Everything. This is photo spot 5 and it is the single most "everyone can see everyone" object in the build.

**Acceptance test.** Walk the full net circuit at 30 fps with 20 avatars in the region. Fall from the outer edge: caught and returned.

---

## 5. LASER QUEST — "The Undercroft" · U2 (+16.40) · **1 500 LI**

**What it is.** 1 400 m² of dark maze under the plaza, one flat deck with three raised catwalks, two-team, 12 a side.

**Footprint.** A 30 m radius disc minus service, angles 18°–172°. Briefing room, airlock (the Hoodwink), the Eye (viewing mezzanine, one-way glass).

**How it works.**
- Taggers: `llCastRay` from the muzzle on click, 22 m range, 0.25 s cooldown. **No physical projectiles.** A raycast costs a fraction of a bullet and never misses the sim.
- Vests: a 1 LI mesh with a colour-state face. Hit → flash red, 2 s respawn lock, score to the vest `llSetObjectDesc` and to the shared board.
- Teams: red / green, assigned at the airlock by the Hoodwink script.
- Round: 12 min, scoreboard, then a "the house wins" tie-break (a random team gets 10 points because the house is a bad winner — this is the only joke in the room and it lands every time).

**The thing that will go wrong.** Raycast hits on the maze walls if the maze is one link. Build the maze as **separate convex mesh panels** so a raycast can identify what it hit, and put the maze on a different collision channel from the vests.

**Build notes.** No lights except the taggers and 6 floor strips. Heavy local fog (a particle system at 20 % density, one emitter per team zone). Sound is all footsteps and breath.

**Views.** None — this is the point. **No window, ever.** The only view is *into* it, from the Eye.

**Acceptance test.** 24 avatars in the field for 12 minutes; hit detection registers ≥ 95 % of clean shots; no raycast crosses into adjacent zones; the Eye's glass is one-way at every angle.

---

## 6. ARCADE — "Cabinet Row" · L2 (+35.00) · **1 750 LI** *(+ the Penny Parlour 620 LI on L0)*

**What it is.** 24 working machines in a neon-lined hall on the east of L2, plus 8 mechanical free-play machines in the Penny Parlour below.

**Working means:** a real, playable, 60–180 second interaction with a score. Not a texture of a game. Not a video.

### The 24 cabinets

| # | Machine | Mechanic | LSL approach |
|---|---|---|---|
| 1 | **Skee-Ball** (×2) | drag to aim, ball rolls up the ramp, rings score | KFM ball + `llDetectedTouchST` on the ramp face |
| 2 | **Whack-a-Mole** (×2) | 9 holes, 30 s, ascending speed | 9 face swaps on one mesh, one timer |
| 3 | **The Claw** | 2-axis crane, timed grab, real prize | KFM gantry + collision on the prize |
| 4 | **Rhythm pad** (×2) | 4 panels, charted to parcel audio | timestamp check against `llGetTime` |
| 5 | **Pinball** (×3) | real bumpers, real flippers, real tilt | physics ball, 12 collision prims, 1 script |
| 6 | **Light-gun gallery** | 8 targets, pop-up, 40 s | raycast + animation |
| 7 | **Air hockey** (×2) | 2-player, puck on a real surface | physics puck, 2 mallets on sit |
| 8 | **Basketball** (×2) | arc shot, 60 s | KFM arc + collision ring |
| 9 | **Punch bag** | one hit, measure | 3 random bands + a sound |
| 10 | **Dance floor 4-panel** | follow the pattern, 90 s | face swap + score |
| 11 | **The Fortune** | ask yes/no, it answers in 1 of 34 lines | not a game; a parlour oracle. **The best 40 LI in the build** |
| 12 | **Grab-a-hare** (×2) | the small brass hare | as the Claw, different odds |
| 13 | **Slot simulator** (×2) | **free spins only, no stake, no payout** | see `06` §6 |
| 14 | **Racing sim** (×2) | 60 s time trial, feeds the kart leaderboard | static course + animated texture + timer |
| 15 | **Shooting gallery / duck** (×2) | 10 ducks, 30 s | face swap |

Two of these (the Fortune, the Claw) are set pieces with their own alcoves; the rest line the east wall in two rows of twelve with a 2.4 m aisle.

**The thing that will go wrong.** 24 cabinets × 3 scripts = 72 scripts all listening. Fix: **one script per cabinet, one shared channel with per-cabinet integer IDs**, and no `llListen` on channels that do not concern you.

**Build notes.** Cabinet is 1.6 m cube-ish mesh, ~45 LI each with moving parts. Row lighting is a single emissive strip, not 24 projectors.

**Views.** Across the shaft to the Lodge and the Lane; out through the façade windows to the kart helix.

**Acceptance test.** Play all 24. Each must be startable in one touch, finishable in under 3 minutes, and produce a number.

---

## 7. CASINO — "The Lodge" · L3 (+40.50) · **1 450 LI** *(+ the Sanctum 380 LI)*

**What it is.** A ring of twelve tables under a 3.2 m lacquer soffit, the Croupier's Pit at the lip of the shaft, a champagne bar, and a closed inner room.

**Read `06` §6 before building a single chip.** There is **no L$ wagering** in this build, at all, and no mechanism by which a player can win or lose anything of value. Chips are cosmetic tokens. Machines are free-play. The word "casino" does not appear in search tags.

**What the twelve tables are:**

| Count | Table | What actually happens |
|---|---|---|
| 3 | **Blackjack** | deal, hit/stand, dealer draws, chips are yours to look at |
| 2 | **Roulette** | spinning wheel, ball lands, colour announced |
| 2 | **Faro** | the Georgian game — *this is the lodge's own game and the house's dig at it* |
| 2 | **Pai Gow / domino** | mahjong tiles, very neo-Tokyo |
| 1 | **Baccarat** | the table the Sanctum watches |
| 1 | **The Croupier** | an automaton that deals one card to anyone who sits, and never speaks |
| 1 | **Chess / draughts** | a real board, real pieces, no timer |

**How it works.** Card decks are `list`s of integers, shuffled with `llFrand`, dealt on touch. Table state is one script; the visual is faces on a single mesh. Roulette is KFM on the wheel; the ball is a keyframed object released at a computed angle so it *looks* random and lands where the script already decided.

**The thing that will go wrong.** A player asking "can I bet Lindens?" — because the room is *styled* as a casino. Put the answer in-world: a brass plate by the door, eight words: **"THE HOUSE DOES NOT PLAY FOR MONEY. ONLY DEGREES."**

**Build notes.** Ceiling is the point: 3.2 m, oxblood lacquer with a tessellated brass border. Light only from lamps at 1.9 m. Smoke: one low-density particle volume per room. Twelve tables at 4 × 2.5 m + 1.5 m clearance = ~20 m² each = 240 m² of the 700 m² ring; the rest is carpet, chairs, and a 1.2 m parapet at the shaft (a real one, not invisible — this is a 16 m drop).

**Views.** Down the shaft to the lanes, the rink, the pool. Across to the Warren. This deck has the best *down* view in the building.

**Acceptance test.** Sit at every table. Every game completes and returns to idle. Nobody can acquire anything of value. The parapet blocks a run at the pit.

---

## 8. GO-KARTING — "The Spiral" · L5 → plaza · **1 850 LI**

**What it is.** A 370 m banked helix outside the drum, 1.4 laps, from the Crown's pit lane (+51.50) down to the plaza (+20.00). Six karts.

**Footprint.** Track radius 38–46 m (centre 42 m), running width 3 m, barrier 1.1 m, clearance 6 m from the façade. Pit lane and garage on L5 west.

**How it works.**
- **Karts are not vehicles.** They are 6-seat KFM spline riders: `llSetKeyframedMotion` on a ~90-keyframe loop, ~2:30 per lap, with two speed presets ("cruise" and one "boost" segment on the main straight). Physics vehicles are more fun for exactly four minutes and then someone is in the void.
- Steering *feel* without steering: a HUD gives you the brake (pauses the KFM) and the boost (restarts at the fast preset for 6 s). Good enough, and it never breaks.
- Each kart is one script, one `llSitOnLink`, and a camera override.
- Lap timer on the shared board; the Racing Sim cabinets feed the same leaderboard, so the arcade and the track are one competition.

**The thing that will go wrong.** Six karts and a rider who stands up at 20 km/h. Detect and park the kart at the nearest service bay (two of them, one at each side), fade it, respawn empty at the pit lane.

**Build notes.** Track surface must be **one continuous mesh ribbon** — do not build 90 separate pieces. Barriers are alpha-masked mesh with a neon top edge. The whole helix should read from outside as a glowing helical seam around a black drum: it is the building's signature from the plaza.

**Views.** You are on the outside of the building looking in through the façade band, and the plaza is looking at you. Two places where the track passes a full-height window: at the L2 and L4 bands — riders see bowlers and net-climbers for about 3 seconds each, and both look up.

**Acceptance test.** A full lap at both speeds with 6 riders: no clipping into the façade, no falls, camera stable, and the lap time on the board matches the kart's own timer.

---

## 9. MINI GOLF — "The Ribbon" · L1 → L5 · **1 600 LI**

**What it is.** 18 holes on a **4–5 m ledge that spirals the inside of the façade** from +29.50 to +51.50. It is the only route in the building that touches every deck without a lift, a ramp or a ride — it is the house's promenade, and its putting surface.

**Footprint.** An annulus at radius 31–36 m, in five terraces of 3–4 holes. Hole spacing 6 m, each hole 1.2 m wide, 4–7 m long, with one invented obstacle.

**How it works.**
- Ball: physical sphere, mass 1, `llApplyImpulse` on putt. Direction from the avatar's facing, power from a click-and-hold meter on the club prop.
- 18 balls, one per hole, auto-return after 20 s or when holed. Physics objects are the one place this build spends physics budget (`06` §4).
- The Cup is a `llVolumeDetect` cylinder. No sensors.

**Holes (sketch — the bots should build these and be told the joke):**

| Terrace | Holes | Obstacle |
|---|---|---|
| L1 | 1–4 | a slot machine that pays out a free ball; a bank of brass letterboxes; a spiral of cable; the bookcase (the Blind Door is behind hole 3) |
| L2 | 5–8 | a bowling pin rack; a working candlepin; a mahjong tile wall; a mechanical card-shuffler |
| L3 | 9–12 | a roulette wheel you must go *round*; a chip stack; a lacquer screen; a smoke vent |
| L4 | 13–15 | a net you must go *over*; a suspended pachinko field; a knotted rope climb (the ball is carried) |
| L5 | 16–18 | a kart tyre; a zoetrope; **the 18th is the Oculus itself** — a single putt along the shaft lip, and if you miss, the ball falls 33 m into the pool and the house keeps it |

**The thing that will go wrong.** Balls off the edge. The ledge has a 0.45 m kerb that is not a wall: a hard putt can leave it. Falling balls are the feature (hole 18 depends on it); a `collision_start` on the pool water returns any ball that lands there.

**Build notes.** The ledge edge is the **tessellated border** from the masonic pavement — that is the visual payoff of the whole symbol programme. Surface: bottle green felt with a brass inlay.

**Views.** The best *lateral* views in the building: out through the façade to the karts, in across the void to everything. Photo spot 8 is hole 12.

**Acceptance test.** Play all 18 in one round. Every hole is completable, every obstacle is passable, and no ball is lost permanently.

---

## 10. ROLLERCOASTER — "The Thread" · Crown → all decks → Crown · **1 800 LI**

**What it is.** A 420 m circuit, 2:10 long, 3 trains of 8. It launches from the Crown, loops above the roof, dives into the Oculus, threads the Lane, climbs the Ribbon, crosses the Lodge, hangs over the Warren, and returns.

**Route (schematic, in order):**
1. **Station**, L5 north-east, +51.50
2. **Lift hill** up the outside of the drum to **+62.00**, a 14 m climb on a chain — the slow part, deliberately
3. **The Crown Loop**, a 9 m inversion above the Belvedere ring, so the queue below can watch heads go upside down
4. **Drop and dive** through a roof aperture into the Oculus, down to +37.00
5. **The Lane pass** — through a 3.6 m aperture in the Lane deck at x 140, passing **beside** lane 8, not over it
6. **The Ribbon climb** — up the west ledge and out through the façade at +43.00, briefly outside, then back in
7. **The Lodge cross** — over the casino at +43.50, 2.8 m of clearance, in a lacquer tunnel with 6 lanterns
8. **The Warren hang** — a slow banked turn over the nets, 2.4 m up, so riders and climbers make eye contact
9. **Brake run** back to the station

**How it works.** KFM, 3 trains, ~140 keyframes each, running in `LOOP` with a station dwell implemented by a `KFM_CMD_STOP` at the same keyframe index for all three (offset in time). Riders sit on 8 sit targets; a camera override per seat gives 3 different views (front, side, "look down"). Total ride scripts: 3 (one per train) + 1 station.

**The thing that will go wrong.** KFM trains do not collide, so a slow rider never blocks anyone — but they *do* desync if the sim is paused. Re-sync on `CHANGED_REGION` and on a 5-minute timer.

**Build notes.** Track is **one mesh ribbon**, 0.9 m gauge, with a 0.35 m spine and one rail. The supports are the same structural bay as the drum — reuse the mesh. Colour: pink/black. Signage at the station: `THE THREAD`.

**Views.** It is the only object in the build that sees every deck from inside the ride envelope.

**Acceptance test.** 3 trains × 8 riders, 3 circuits, no clipping, no desync, ride time within ±4 s of 2:10, camera returns on exit.

---

## 11. THE REST (already specified in the plans)

| Space | LI | Note |
|---|---|---|
| **The Salon** L2 | 680 | the hub. Bar, 30 seats, the best sightline in the building. If only one room is ever finished, finish this |
| **The Drowned Parlour** L0 | 680 | velvet, mirrored ceiling, 33 lamps, no windows |
| **The Penny Parlour** L0 | 620 | 8 mechanical free-play machines, no scripts beyond a coin click |
| **Chrysalis** L0 | 380 | changing warren — a corridor of brass doors and hooks that go nowhere |
| **The Sanctum** L3 | 380 | one table, one chair, one door that only opens from inside |
| **The Be/Tea Room** L3/L4 | — | 1 tea service, 4 tables, a view |
| **The Crown Bar** L5 | — | terrace over the shaft |
| **The Belvedere** Roof | 380 | 20 brass telescopes, 1 bell, 33 m of drop |
| **The 34th Door** L5 | — | 2 LI + 1 script |

---

## 12. What "working" means, in one sentence

> Every one of the 33 stations must be completable by a player who has never read this document, using only what is in front of them.

That is the acceptance test for the whole build.
