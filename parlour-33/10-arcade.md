# 10 · THE ARCADE — 24 machines that actually work

> *Every cabinet in this house is honest. The House is one point ahead of every cabinet. These are not the same claim.*

The brief said "an arcade with working games". This is the spec for it: what each machine is, how it plays, what it costs in land impact, and how the scripts are structured so that **the same core runs all 24 and a bot can swap the games around**.

Working arcade games in Second Life means one thing: **no physics, no bullets, no HUD, no textures you have to generate at runtime.** Everything here is coordinate maths on a 12 × 12 grid rendered by a handful of micro-prims, driven by clicks on the cabinet. It is cheap, it is lag-proof, and it is genuinely playable.

---

## 1. How a cabinet works

### 1.1 The build

One cabinet = **one linkset**, root at the screen's centre. Screen faces **local +X**; the cabinet body extends to −X; the player stands at +X and looks toward −X.

```
        z ↑
          │   ┌──────────────┐   screen plane: x = 0, faces +X
          │   │ 12 × 12 grid │   0.72 × 0.72 m visible
          │   │  cell 0.06   │
          │   └──────────────┘
          │        (o)  ← the stick   0.24 m disc, z = −0.46
          │       [FIRE]              0.12 m disc, y = −0.30
          └────────────────────────→ y
```

| Part | Link name | Size | Alpha | Physics | LI |
|---|---|---|---|---|---|
| bezel + screen (root) | `P33_ARC_01_ROOT` | 0.90 × 0.82 × 0.90 | opaque | none | 3 (mesh) |
| body, plinth, marquee | children `..._BODY`, `_PLINTH`, `_MARQ` | — | opaque | none | 4 |
| sprite × 16 | `..._SPR01` … `..._SPR16` | 0.05 cube | **0.0** | none | 8 (@0.5) |
| pad × 5 | `..._PAD_UP` `_DOWN` `_LEFT` `_RIGHT` `_FIRE` | 0.10 cube | **0.0** | none | 2.5 |

**17–23 prims, 8–18 LI per cabinet.** Twenty-four cabinets = **276 LI**, inside the 1 750 LI Cabinet Row budget in `06`.

Three rules that make it work:

1. **Sprites are invisible, not phantom.** Alpha 0.0 but still present — `llSetLinkPrimitiveParamsFast` on an alpha-0 prim is instant and costs nothing. Never unlink, never rez.
2. **One plane, one direction.** All sprites sit at `x = +0.021`, so they never z-fight with the glass. Positions are `PRIM_POS_LOCAL`, so the whole cabinet can be rotated by a bot and the game keeps working.
3. **The pads are the controller.** Five invisible prims over the glass. `llDetectedLinkNumber` → `llGetLinkName` → direction. No HUD, no attachment, no permissions, no keyboard.

### 1.2 The input contract

```lsl
integer INPUT_UP    = 1;
integer INPUT_DOWN  = 2;
integer INPUT_LEFT  = 3;
integer INPUT_RIGHT = 4;
integer INPUT_FIRE  = 5;
integer INPUT_START = 6;
```

### 1.3 The scripts

Two scripts per cabinet, and only two — so the scripts count in `06` §6 holds:

| Script | Lives in | Job | Size |
|---|---|---|---|
| `P33_cab_core.lsl` | root | pads → input events, credit, marquee, high score, the Toll, the House's +1 | 1 |
| `P33_game_*.lsl` | any child | the rules of one game, and the sprites | 1 |

They talk over `llMessageLinked` only. **The game module never touches the pads and the core never touches a sprite**, which is why the Mechanic can swap a game into any cabinet in the house — and why a broken cabinet is a *story* and not a bug.

Full source: [`tools/lsl/`](tools/lsl/) — `P33_cab_core.lsl`, `P33_game_adder.lsl`, `P33_game_wall.lsl`, `P33_game_planchette.lsl`, plus `P33_scoreboard.lsl`, `P33_ledger.lsl`, `P33_station.lsl`.

---

## 2. The 24

Eight game types, twenty-four machines, no two cabinets dressed alike. "Sprite" is how many moving objects the game needs; the rest of the grid is drawn by tint.

| # | Cabinet | Game | The twist (this is why you play it twice) | Sprites | Tick | LI |
|---|---|---|---|---|---|---|
| 01 | **THE ADDER** | snake, 12 × 12 | the apple is always placed **one cell further away than fair** — the House's edge, made visible | 17 | 0.30 s | 16 |
| 02 | THE ADDER | snake | mirrored controls: left is right, and the marquee says so after 20 s | 17 | 0.30 s | 16 |
| 03 | THE ADDER | snake | the walls are open; the board wraps, and so does the body | 17 | 0.28 s | 16 |
| 04 | THE ADDER | snake | two-player on one cabinet: one grid, two snakes, take turns | 17 | 0.32 s | 17 |
| 05 | THE ADDER | snake | reverse: you steer the *tail* | 17 | 0.34 s | 16 |
| 06 | **THE WALL** | breakout | 18 bricks, 3 lives, paddle is 3 cells; a brick you break comes back as a *hole* | 20 | 0.08 s | 18 |
| 07 | THE WALL | breakout | the ball speeds up every hit, and never slows down | 20 | 0.07 s | 18 |
| 08 | THE WALL | breakout | inverted: your paddle is on the ceiling | 20 | 0.08 s | 18 |
| 09 | THE WALL | breakout | one brick, ninety seconds, no floor | 20 | 0.06 s | 18 |
| 10 | **THE LADDER** | crossing (Frogger) | four lanes of traffic; each lane is a **deck of the house**, in order | 12 | 0.22 s | 13 |
| 11 | THE LADDER | crossing | the lanes run backwards on every third crossing | 12 | 0.22 s | 13 |
| 12 | THE LADDER | crossing | no timer: the traffic speeds up until you die | 12 | 0.20 s | 13 |
| 13 | **THE PLANCHETTE** | letter catcher | you do not catch letters, the House *offers* them; one is a trap | 8 | 0.14 s | 10 |
| 14 | THE PLANCHETTE | letter catcher | spells a word of **your** choosing — chat a 6-letter word to the cabinet first | 8 | 0.14 s | 10 |
| 15 | THE PLANCHETTE | letter catcher | the trap word is the Croupier's name, and it is 33 letters | 8 | 0.12 s | 10 |
| 16 | **THE HAND** | stop the reel | three reels, one button, the payline is worth exactly what you risked | 9 | 0.05 s | 9 |
| 17 | THE HAND | stop the reel | the reels stop when *you* click, and the House knows your click timing | 9 | 0.05 s | 9 |
| 18 | **THE GLASS** | reflex | do not blink: a light sweeps, you must click on the gap | 6 | 0.03 s | 8 |
| 19 | THE GLASS | reflex | two players, one cabinet, whoever moves first loses | 6 | 0.03 s | 8 |
| 20 | **THE COUNT** | mental arithmetic | the House counts at you; keep the running total | 4 | — | 7 |
| 21 | **THE 34TH** | sealed | not on the floor plan. Behind the Deep End's dead cabinets. Opens at 33 degrees | 24 | — | 20 |
| 22–24 | **spare** | any module | three empty housings with no game, cables hanging out. The Mechanic's problem, and the Steward's story | — | — | 12 |

**The one that matters most is 21.** It is the only cabinet in the house with a game nobody has documented, it is hidden behind four dead machines, and it is the reason people finish the degrees.

### 2.1 THE ADDER — how it plays

The board is 12 × 12. Snake grows one cell per apple, capped at 16 (the sprite count): when you fill the board the House says `"ENOUGH"` and pays you double. Speed ramps from 0.30 s to 0.18 s over 12 apples. The apple is placed with a bias **away from the head** by one cell — you can feel the extra step but you cannot prove it.

Death: wall or self. On death every sprite flashes magenta for 0.6 s, the marquee prints your score and the House's hand (`score + 1`), and the cabinet returns to attract mode with your initials in the corner.

### 2.2 THE WALL — how it plays

Paddle is 3 cells and moves one cell per click (with a 0.12 s repeat if held — implemented as a click-and-hold timer, no keys). Ball moves at one cell per tick with an exact bounce; bricks are 18 (3 rows × 6), each worth 10. Speed increases 4 % per brick. The board is rebuilt in the sprite layer, not the texture, so a broken brick is a *hole* in the wall, which is the whole point.

### 2.3 THE PLANCHETTE — how it plays

Three spirit tokens fall. One is the letter you need (cyan), one is a decoy (white, harmless, worth 5), one is a trap (magenta, costs a strike). You move the planchette left and right along the bottom. The marquee shows the word you are spelling:

```
P A R _ _ _ _     STRIKES ○ ● ●
```

Complete it and the House prints the word in full, then adds one point and calls it its own. It is the only game in the arcade with a narrative, and it is the one people screenshot.

---

## 3. THE PENNY PARLOUR — 8 machines, L0

The arcade's grandparent: 1930s penny machines, restored, each with a working mechanism and a line of lore. 620 LI total (see `06`).

| Machine | What it does | LI |
|---|---|---|
| **The Fortune Teller** | 40 printed cards, a brass hand, a ticket drops. Reads one of 8 fortunes, chosen by the time of day | 90 |
| **The Love Tester** | two brass grips; it returns a number 1–99 and a comment. It is a random number with a very good face | 60 |
| **The Strength Tester** | a bell you hit with a mallet; the bell rings if you hit it in the 0.15 s window | 70 |
| **The Mutoscope** | you turn a crank, 24 frames move, a 4-second film plays. Film: the lodge dealing, 1937 | 80 |
| **The Bagatelle** | 9 brass pins, one marble, one shot, a score. Physical marble, non-physical scoring | 70 |
| **The Crane** | the claw, deterministic; you win a token, never a prize | 90 |
| **The Photo Booth** | 4 shots, 1 strip, auto-posted to the House's board. The only place in the sim you can photograph yourself | 60 |
| **The Man Who Won** | out of order. A coat, a hat, a high score from 1998. Touching it prints his initials | 100 |

They are louder than the video cabinets, slower, and **they are where the older players sit.**

---

## 4. The House's edge, in one integer

```lsl
// at the end of every run, on every cabinet
integer hand = best + 1;          // what the House has posted
if (score > hand) { beat_the_house(); }   // the Bell, the initials, the mirror
if (score > best) { best = score; }       // then the House re-posts: best + 1
```

The board always reads **one point above the best human score**, and it moves the instant you move. Beat it by two and the House notices. That is the build's entire personality in four lines: it costs nothing, and it is the difference between an arcade and a place with opinions about you.

---

## 5. The Toll — a reason to come back on the hour

At :00 the Bell strikes and the scoreboard re-strikes: each cabinet publishes a **dealer's hand** (a target score, re-rolled each hour, scaled to the cabinet's own distribution). Scores set before the Toll are archived to the "before" board. Scores after it are "this hour". The board is 2 columns and it reads like a ledger, because it is one.

Implementation is the scoreboard script and nothing else: see `P33_scoreboard.lsl`.

---

## 6. Dressing the row

Cabinet Row is 58 × 29 m and it must not read as a showroom. The audit (`09` §3.3) gives it four alcoves of six, the Deep End, the Change Booth and the Crane Pit. On top of that:

- **The carpet**: 33 repeating motifs, drawn once, 2 m scale. It is the only pattern in the building that is not symmetric.
- **The lights**: no ceiling light over the cabinets. Each cabinet lights its own player from the marquee — that is why people look good in the photographs.
- **The noise**: 24 attract loops is a mess, so **only the six nearest cabinets play their attract sound**, mixed by distance and throttled to 4 loops at once. See `06` §6.
- **The stools**: 9 fixed, 15 loose. You can carry a loose stool anywhere in the house, and people do.
- **The token tray**: one per cabinet, brass, always slightly full. Tokens are free at the Change Booth, which is the joke.

---

## 7. Acceptance tests

1. **Every cabinet starts on one click within 110 ms** and returns to attract within 1 s of the game ending.
2. **24 cabinets, one avatar, 6 loops:** script time ≤ 0.6 ms per cabinet at idle; ≤ 0.05 ms per active game.
3. **No game uses physics, sensors, or bullets.** (`llCastRay` is allowed only in laser quest.)
4. **One avatar can play all 24 in a row** and the scoreboard records 24 rows.
5. **The House's +1 is visible on every cabinet** in the end-of-game marquee.
6. **Swapping a module**: unlink the game prim, drop a different one in, and the cabinet plays the new game with no other change. **This is the test that proves the architecture.**
7. **A 33-degree visitor can open the 34th**, and its game exists (`P33_game_34.lsl`, to be written by whoever takes the Steward's job — deliberately).

---

*Next:* [`tools/lsl/README.md`](tools/lsl/README.md) — the build protocol for the scripts, then the scripts themselves.
