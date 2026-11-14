# tools/lsl — the scripts

Seven scripts. Two of them run on all 24 arcade cabinets; the rest run once each. They are written to be **placed by a bot from a name convention alone** — no configuration notecard, no menus, no owner-only setup step.

| File | Runs on | What it does |
|---|---|---|
| `P33_cab_core.lsl` | every cabinet, root prim | pads → input, marquee, credit, high score, the House's hand |
| `P33_game_adder.lsl` | any cabinet, one child | THE ADDER — snake |
| `P33_game_wall.lsl` | any cabinet, one child | THE WALL — breakout |
| `P33_game_planchette.lsl` | any cabinet, one child | THE PLANCHETTE — letter catcher |
| `P33_scoreboard.lsl` | the board in Cabinet Row, root | the House's book: hourly Toll, records, initials |
| `P33_ledger.lsl` | the Hive, B1, root | the degrees: per-avatar persistence in linkset data |
| `P33_station.lsl` | the 33 plaques | a stamp, a degree, a whisper, the Hare |

---

## 1. The link-name contract

A cabinet is one linkset. **Names are the API** — a script finds its own parts by name, so a bot can build the linkset in any order and copy it anywhere.

```
P33_ARC_07_ROOT      link 1   the bezel; the screen faces local +X
P33_ARC_07_BODY      any      cabinet carcass, sides, back
P33_ARC_07_PLINTH    any      the foot; also the collider
P33_ARC_07_MARQ      any      the marquee above the screen (gets PRIM_TEXT)
P33_ARC_07_SPR01     … SPR16  the sprites: 0.05 m cubes, alpha 0.0, no physics
P33_ARC_07_PAD_UP    any      invisible click pad, 0.10 m
P33_ARC_07_PAD_DOWN  any
P33_ARC_07_PAD_LEFT  any
P33_ARC_07_PAD_RIGHT any
P33_ARC_07_PAD_FIRE  any
```

Parsing rules the scripts rely on (do not change them):

- a sprite is any link whose name **contains `SPR`** and ends with **two digits**;
- a pad is any link whose name **contains `PAD_`** and ends with `UP`, `DOWN`, `LEFT`, `RIGHT` or `FIRE`;
- the marquee is any link whose name **ends with `MARQ`**; if none exists the core falls back to floating text on link 1.

Sprites are numbered **01…16** and are ordered by that number, not by link order.

---

## 2. Geometry contract (metres, local to link 1)

```
screen plane      x = 0, normal +X, 0.72 × 0.72 m visible
sprite layer      x = +0.021
grid              12 columns × 12 rows, cell 0.060
sprite size       0.050 × 0.050 × 0.050
column c →  y = ( 5.5 − c ) * 0.060      // c=0 is the player's left
row r    →  z = ( r − 5.5 ) * 0.060      // r=0 is the bottom
stick centre      <0.06, 0.00, −0.46>
fire button       <0.06, −0.30, −0.46>
```

Column 0 on the **player's left** means `y` decreases as the column increases — because the player stands at +X looking toward −X. The scripts already do this; a builder only has to put the root at the screen's centre and keep +X facing the player.

---

## 3. Message protocol (`llMessageLinked(LINK_SET, num, str, id)`)

| num | Direction | Meaning |
|---|---|---|
| 1–6 | core → game | `UP DOWN LEFT RIGHT FIRE START` |
| 100 | core → game | start a run (`str` = player key) |
| 101 | game → core | run over, `str` = score |
| 102 | game → core | live score, `str` = score (marquee update) |
| 103 | core → game | stop / go to attract |
| 104 | game → core | module ready (`str` = game title) |
| 105 | game → core | the player beat the House's hand |
| 200 | core → linkset | the Toll: re-strike the board |

**One rule:** the core never writes a sprite, and a game never reads a pad. That is what lets the Mechanic swap a module into any cabinet in the house without touching anything else.

---

## 4. The House's hand — the one piece of arithmetic that is the whole personality

```lsl
// at the end of every run
integer hand = (integer)llLinksetDataRead("BEST") + 1;   // what the House posted
if (score > hand) { beat_the_house(); }                   // the Bell, the initials
if (score > (integer)llLinksetDataRead("BEST")) {
    llLinksetDataWrite("BEST", (string)score);
}
// the House re-posts: BEST + 1. There is always exactly one point between you.
```

The board therefore always shows a number **one above the best human score**, and it moves the instant you move. Players work this out in about forty seconds, and the moment they do, the arcade stops being furniture.

---

## 5. Channels — derived, never fixed

A sandbox is already full of other people's scripts on every negative channel, so **no script uses a hard-coded channel.** All four that talk to each other derive the same number from the owner:

```lsl
integer chan(integer base)
{
    return -(base + (integer)("0x" + llGetSubString((string)llGetOwner(), 0, 5)));
}
// 3302 the House's book · 3303 stations -> ledger · 3304 ledger -> avatar
```

Two copies owned by two residents can never collide; the seven linksets of one build always agree. **If you sell or give the build away, the channels move with the owner automatically** — which is exactly what you want in a sandbox.

## 6. Performance rules these scripts obey

- **No `llSensor`, no `llCastRay`, no physics, no bullets** in any arcade script.
- **One timer per cabinet**, `llSetTimerEvent(0.0)` when idle.
- `llSetLinkPrimitiveParamsFast` only — never `llSetPrimitiveParams` in a loop.
- Listeners: **none** on cabinets. State lives in linkset data, not in chat.
- Scoreboard uses `llRegionSay(-3302, …)` once per completed run, and nothing else, ever.
- Estimates: **0.6 ms per cabinet at idle, 0.05 ms per active game**, × 24 = well inside the `06` §6 ceiling.
