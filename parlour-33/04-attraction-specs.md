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

**What it is.** Ten tenpin lanes running east–west across the south hall of L2, with the Salon bar filling the east end of the same hall. The lanes are 20 m of the hall's 58 m; the bar is 26 m. You bowl with the bar on your right, the gallery behind you, and a hole in the floor in front of you.

**Footprint.** Ten lanes occupy x 104–124, z 103–120 (20 × 17 m): 10 lanes at 1.55 m + 0.35 gutter, plus approach (x 99–104) and pin deck (x 124–130). The Salon is x 131–157, the same hall.

**How it works.**
- Ball: a single mesh sphere per lane, **non-physical**, moved with `llSetKeyframedMotion` along a straight spline with a small lateral offset derived from the player's aim.
- Pins: 10 per lane, **physics shape = none**, standing where they stand. Each pin has one scripted state: standing → falling (rotate 80°, 0.4 s) → settled → swept.
- Hit detection: the ball `llCastRay` forward every 0.08 s while it travels. First pin contact → the pin falls and, with a probability falling off by distance from the contact, so do its neighbours. This is deliberately *not* a physics simulation, and it is why the build will still run at 60 avatars.
- Scoring: standard tenpin, 10 frames, strike/spare/spilt, on the console and the shared board.
- Two consoles per pair of lanes (`llDetectedTouchST` on one face — 8 faces, 8 hit zones, **1 script**).

**The thing that will go wrong.** Balls left in the lane. Every ball needs a 12 s timeout that returns it to the rack, and a `CHANGED_LINK` check so a re-rez does not leave a ghost.

**Build notes.** Lane surface: one 1024 atlas, 8 faces off it. Gutters and returns can be a single mesh linkset per lane pair. Do not model the pinsetter machinery in detail — silhouette only, behind smoked glass (see the Pin station, L2 south).

**Views.** Down: two openings in the floor drop your eye onto the ice rink one deck below. Up: the Lodge's soffit through the ceiling slot. Across: the gallery, and the arcade through it. Behind: the Salon.

**Acceptance test.** Bowl 20 balls from 4 avatars simultaneously. No ball crosses a lane boundary by more than 0.2 m, no pin is left floating, score on the board matches the console, and the sim's script time does not exceed 4 ms.

---

## 2. ICE RINK — "The Mirror" · L1 (+29.50) · **950 LI**

**What it is.** A 14 × 28 m rink on a **structural glass deck directly above the pool**, in the west hall of L1. This is the build's single best idea; do not economise it away.

**Footprint.** x 107–121, z 114–142. Glass deck: two alpha-masked planes and a frame, ice surface at +30.50, boards 1.1 m. Rinkside bar at x 121–125.

**How it works.**
- Ice is cosmetic: a low-roughness PBR sheet with a subtle normal map and a slowly drifting sheen. **Do not** try to reduce avatar friction; SL does not expose it.
- Skate prop: an attachment with skates + a `llSetAnimationOverride` set (WALK, RUN, TURNLEFT, TURNRIGHT) — the single trick that makes an SL rink feel like a rink. Applied inside the Experience, cleared on leaving the rink volume.
- Two curling houses painted at the ends (see `01` — curling is the rink's parlour ancestor).

**The thing that will go wrong.** Glass. Two alpha-blended planes over a lit pool is exactly where SL's draw order breaks. Fix at build time, not after: **the deck is alpha-masked (not blended) on the top plane**, and the pool is only visible through a limited number of *cut* portholes near the boards. Skaters see swimmers through the portholes and along a 1.2 m perimeter band; they do not see them through the entire floor. That is both cheaper and more dramatic.

**Build notes.** Boards: 3 m mesh sections, 12 per side, 1 LI each. Freeboards (the transparent bit) = alpha-masked. See `06` §3.

**Views.** Down through the ice and its portholes into the pool. East through the boards into the glass gallery, and through that into the Warm Room. Up through two openings in the L2 floor, where the bowlers are looking down at you.

**Acceptance test.** Stand at centre ice: the pool is visible through the portholes, the gallery is visible through the boards, and no alpha sorting flicker occurs at any camera angle on a full circuit.

---

## 3. SWIMMING POOL + SLIDES — "The Flood" and "The Water Chute" · L0 (+24.00) · **1 150 + 560 LI**

**What it is.** An 18 × 24 m pool in the west hall of L0, a grotto swim-up bar under its north end, and **one glass flume** that starts at the Crown (+52.50) and falls 27 m through the entire building into the water.

**Footprint.** Pool x 104–122, z 116–140. Water surface +25.60, floor +23.50, depth 2.1 m. Grotto x 104–112, z 116–126. The Sunbeam mirror-well lands at x 104–107, z 122–125.

**How it works — swimming.**
Avatars do not swim in SL, so we fake it properly:
- A **swim volume** (an invisible box, `llVolumeDetect`) covering the pool.
- On entry, the Experience attaches a `P33_SWIM` HUD which uses **`llSetAnimationOverride`** for `FALL_DOWN`, `WALK`, `RUN` → swim/idle-tread, and applies a gentle upward `llSetForce` while submerged so you float at the surface.
- On exit, override cleared. Never leave an override on: it is the SL equivalent of leaving a fork in the toaster.

**How it works — slides.**
**One flume, 33 m.** A `sit target` at the top (L5, x 150 z 150), an Experience `llTeleportAgent` to the seat, `llSetKeyframedMotion` down the spline (≈14 s), `llSetLinkCamera` giving a POV camera, then a splashdown trigger at (118, 126) that stands the avatar up in the water and plays a splash.

The tube is **glass for its whole length**, 1.70 m internal diameter, and it cuts diagonally down through the building — through the kart hall, through the casino, through the arcade, through the rink hall — so for about a second on each deck, a rider at 40 km/h is level with the players' faces and they can see each other. That single second, four times, is the best thing in the build.

**The thing that will go wrong.** Riders who stand up mid-slide. Detect `changed(CHANGED_LINK)` and eject to the nearest gallery, never into the water or the pool deck two metres below.

**Build notes.** Water: one alpha-masked plane at +25.60 with a caustic map, plus a second plane 0.05 m below at a different scroll speed. Two planes, not a volume. No physical water. The pool's ceiling is the rink's glass deck; the 1.5 m band of that deck which is **not** under the rink is open, so daylight from the Sunbeam lands on the water.

**Views.** Up the Sunbeam: five stacked openings, a blade of daylight coming down 33 m through all of them, and the rink's glass deck glowing at the top of the line. Along the deck: the whole 58 m of water, the gallery glass, the Penny Parlour's neon through it. This is photo spot 2.

**Acceptance test.** Ride all three flumes end-to-end: no stuck avatars, splashdown inside the Sunbeam, camera returns to normal within 2 s. Swim from the grotto to the Sunbeam without leaving the volume.

---

## 4. JUNGLE GYM — "The Warren" · L4 (+46.00) · **1 400 LI**

**What it is.** A **two-deck-tall net hall** — 26 × 58 m, 11 m high — filled with nets, mesh tubes, rope bridges and platforms at four levels, with the Nest (a ball pit) at its south end and a 9 m Jacob's ladder at the north. It is the west half of L4 and L5, and it shares a 58 m glazed wall with the kart circuit.

**Footprint.** x 99–125, z 99–157, from +47.00 to +52.50 with **no slab at L5** over it. The Nest: x 100–114, z 100–116.

**How it works.**
- Walkable netting = **alpha-masked mesh with an invisible convex-hull collider slab** under each net panel. Nets look like nets; the collider is a smooth plane. This is the only way to make netting walkable without 400 physics hulls.
- Avatars cannot climb. So the Warren has a **scripted rope ladder** (the Jacob's ladder, 9 m, at the north end) which is a `sit`-and-ascend prop, plus one hidden spiral stair inside the tube stack at the gallery end.
- The Nest is **not** 400 physical balls. It is: one sculpted ball-pit mesh with a churning normal map, plus 12 interactive "loose" balls that bounce (physics off, keyframed on touch). Nobody has ever counted.

**The thing that will go wrong.** Falling out. The Warren's outer edge must have an invisible 1.1 m fence at its perimeter and a **catch net at +40.5** (a single alpha-masked plane with a "you fell" trigger that returns you to L4). A fall of 5 m into the Lodge is funny once.

**Build notes.** Tubes: 6 curved alpha-masked segments, 1 LI each. Rope: 3 m sections, repeating. Colour: bottle green and safety orange. It should look like a Victorian conservatory frame got pregnant.

**Views.** Everything. This is photo spot 5 and it is the single most "everyone can see everyone" object in the build.

**Acceptance test.** Walk the full net circuit at 30 fps with 20 avatars in the region. Fall from the outer edge: caught and returned.

---

## 5. LASER QUEST — "The Undercroft" · B1 (+20.00) · **1 500 LI**

**What it is.** 1 740 m² of dark maze under the plaza, one flat deck with three raised catwalks, two-team, 12 a side.

**Footprint.** x 99–157, z 99–129 — 58 × 30 m, one flat deck, ceiling at +24.60, three raised catwalks at +22.00. Service strip x 99–103. Briefing (the Hoodwink) x 136–152, z 136–152; the Eye x 140–154, z 116–126, a viewing mezzanine with one-way glass into the field. **No window to the outside, ever** — B1 is a blind plinth and this is the one attraction that must stay sealed.

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

**Views.** Across the gallery to the bowling lanes, and down through two openings in the floor onto the ice rink. Out through the Ribbon's windows to the street.

**Acceptance test.** Play all 24. Each must be startable in one touch, finishable in under 3 minutes, and produce a number.

---

## 7. CASINO — "The Lodge" · L3 (+40.50) · **1 450 LI** *(+ the Sanctum 380 LI)*

**What it is.** Twelve tables on one long floor under a 3.2 m lacquer soffit, the Croupier's Pit as a sunken round table with a glass floor, a tea room, a champagne bar, and a closed inner room — all in the south hall of L3, with the Beehive and the Sanctum in the north hall.

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

**Build notes.** Ceiling is the point: 3.2 m, oxblood lacquer with a tessellated brass border. Light only from lamps at 1.9 m. Smoke: one low-density particle volume. Twelve tables at 4 × 2.5 m + 1.5 m clearance = ~20 m² each = 240 m² of the 1,500 m² hall; the rest is carpet, chairs, and the pit. **The Croupier's Pit has a 1.10 m rail all round** — under it is a glass panel and then a 21 m drop to the bowling.

**Views.** Down through the floor opening to the lanes, 5.5 m below, and through the pit's glass panel 21 m to the pins. Across the gallery to the tea room and the Beehive. This deck has the best *down* view in the building.

**Acceptance test.** Sit at every table. Every game completes and returns to idle. Nobody can acquire anything of value. The parapet blocks a run at the pit.

---

## 8. GO-KARTING — "The Spiral" · L5 → plaza · **1 850 LI**

**What it is.** A 250 m circuit folded into the east hall of L4: a banked figure-of-eight four lanes wide, with the pit lane and garage at its north end and a **58 m glazed wall shared with the Warren**. Six karts, 2:30 laps.

**Footprint.** x 131–157, z 99–157. Track: a 22 × 28 m loop at x 133–155, z 112–140, crossed at x 144 to make the eight. 3 m running width, 1.1 m barrier. Pit lane x 133–155, z 99–110.

**How it works.**
- **Karts are not vehicles.** They are 6-seat KFM spline riders: `llSetKeyframedMotion` on a ~90-keyframe loop, ~2:30 per lap, with two speed presets ("cruise" and one "boost" segment on the main straight). Physics vehicles are more fun for exactly four minutes and then someone is in the void.
- Steering *feel* without steering: a HUD gives you the brake (pauses the KFM) and the boost (restarts at the fast preset for 6 s). Good enough, and it never breaks.
- Each kart is one script, one `llSitOnLink`, and a camera override.
- Lap timer on the shared board; the Racing Sim cabinets feed the same leaderboard, so the arcade and the track are one competition.

**The thing that will go wrong.** Six karts and a rider who stands up at 20 km/h. Detect and park the kart at the nearest service bay (two of them, one at each side), fade it, respawn empty at the pit lane.

**Build notes.** Track surface must be **one continuous mesh ribbon** — not 90 separate pieces. Barriers are alpha-masked mesh with a neon top edge. The shared wall with the Warren is the single most important surface in the building: 58 m of glass with a 1.1 m solid kerb, so karts and climbers are eye to eye the whole length. Give it a **4 m band of window openings every 12 m**, not a continuous sheet of glass (see `06` §3).

**Views.** You are on the outside of the building looking in through the façade band, and the plaza is looking at you. Two places where the track passes a full-height window: at the L2 and L4 bands — riders see bowlers and net-climbers for about 3 seconds each, and both look up.

**Acceptance test.** A full lap at both speeds with 6 riders: no clipping into the façade, no falls, camera stable, and the lap time on the board matches the kart's own timer.

---

## 9. MINI GOLF — "The Ribbon" · L1 → ROOF · **1 600 LI**

**What it is.** 18 holes on a **5 m ledge that runs the inside face of the shell** from L1 (+30.50) to the Belvedere (+58.00), stepping up one deck at each stair tower. It is the only route in the building that touches every deck without a lift, a ramp or a ride — it is the house's promenade, and its putting surface.

**Footprint.** A continuous 5 m band running the inside face of the shell, all the way round every deck from L1 to the Belvedere — a 272 m lap, 18 holes, 3 per deck, hole centres 15 m apart on a 5 m wide surface with a 0.45 m kerb on the outer edge and a 1.10 m rail on the inner. One hole per deck is a **feature hole** which plays through a glazed slot in the gallery wall so you putt *at* the game next door.

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
| L5 | 16–18 | a kart tyre; a zoetrope; **the 18th is the roof slot** — a single putt along a 3 m brass gutter, and if you miss, the ball falls through the slot and lands 33 m below in the pool, and the house keeps it |

**The thing that will go wrong.** Balls off the edge. The ledge has a 0.45 m kerb that is not a wall: a hard putt can leave it. Falling balls are the feature (hole 18 depends on it); a `collision_start` on the pool water returns any ball that lands there.

**Build notes.** The ledge edge is the **tessellated border** from the masonic pavement — that is the visual payoff of the whole symbol programme. Surface: bottle green felt with a brass inlay.

**Views.** The best *lateral* views in the building: out through the façade to the karts, in across the void to everything. Photo spot 8 is hole 12.

**Acceptance test.** Play all 18 in one round. Every hole is completable, every obstacle is passable, and no ball is lost permanently.

---

## 10. ROLLERCOASTER — "The Thread" · Crown → the roof → the Warren → Crown · **1 800 LI**

**What it is.** A 380 m circuit, 2:10 long, 3 trains of 8. It launches out of the Crown, climbs onto the roof, runs the parapet twice, inverts over the Belvedere, dives through the Warren's glass into the double-height net hall, banks over the climbers' heads, and climbs back to the station.

**The rule that makes it work.** The Thread **never crosses an occupied hall.** An interior crossing needs 2.80 m under it and 2.40 m over it, which no 4.90 m deck can give; the first draft of this route tried it in four places and was unbuildable. So the ride stays on the roof and the parapet for 300 m — where it is the best advertisement the house has, visible from the whole region — and goes inside **exactly once**, into the one space tall enough to take it: the Warren, 11 m of clear height across two decks.

**Route (in order):**
1. **Station**, L5 north-east, x 131–152, z 138–157, deck +52.50. Load, lap bar, camera.
2. **Chain lift**, a 3.6 m circular aperture in the L5 ceiling at x 150, z 146, up to **+60.00** — 12 s on the chain, deliberately slow, so you look down the whole Warren through its glass roof on the way up.
3. **The north leg** — x 150 from z 146 to z 104, at +60.00, 1.4 m above the parapet, skimming the roof. From here you can see the whole 256 m region and every ride in the house at once.
4. **The Crown Loop** — a 9 m inversion at the north-west corner, over the Belvedere terrace at x 105, z 106, so the people at the Bell can watch heads go upside down.
5. **Lap two** of the roof loop, faster and lower (the ride's one good joke: the second lap is the same view and the passengers scream anyway).
6. **The dive** — 3.6 m glass aperture in the Warren's roof at x 119, z 137, down through the nets' airspace to **+50.00**, a 38° drop beside the rope bridges.
7. **The Warren hang** — a slow banked 180° at +50.00, 2.4 m over the Nest's upper ropes, where riders and climbers make eye contact for a full two seconds. **This is the moment the ride exists for.**
8. **The climb out** — through the Warren's north wall aperture at x 110, z 99, up the outside of the north face to +56.00, along the east face past the flume's launch window, and into the station.

**Length budget:** roof loop ≈ 143 m × 2 = 286 m, dive + Warren hang + climb-out ≈ 94 m. Total 380 m. Ride time at an average 2.9 m/s ≈ 130 s.

**How it works.** KFM, 3 trains, ~140 keyframes each, running in `LOOP` with a station dwell implemented by a `KFM_CMD_STOP` at the same keyframe index for all three (offset in time). Riders sit on 8 sit targets; a camera override per seat gives 3 different views (front, side, "look down"). Total ride scripts: 3 (one per train) + 1 station.

**The thing that will go wrong.** KFM trains do not collide, so a slow rider never blocks anyone — but they *do* desync if the sim is paused. Re-sync on `CHANGED_REGION` and on a 5-minute timer.

**Build notes.** Track is **one mesh ribbon**, 0.9 m gauge, with a 0.35 m spine and one rail. The supports are the same structural bay as the building — reuse the mesh. Colour: pink/black. Signage at the station: `THE THREAD`.

**Views.** It is the only object in the build that sees the whole region from inside the ride envelope, and the only one that looks down into the Warren from above it.

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
| **The Crown Bar** L5 | — | glazed corner over the gallery, trains passing the window |
| **The Belvedere** Roof | 380 | 20 brass telescopes, 1 bell, 33 m of drop |
| **The 34th Door** L5 | — | 2 LI + 1 script |

---

## 12. What "working" means, in one sentence

> Every one of the 33 stations must be completable by a player who has never read this document, using only what is in front of them.

That is the acceptance test for the whole build.
