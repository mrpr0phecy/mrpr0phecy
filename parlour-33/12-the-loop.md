# 12 · THE HOUSE ALWAYS WINS BY ONE

> *A casino is a machine for making you stay one more minute. Ours is a parlour, so it makes you stay one more game — and then lets you go.*

The house in this build does not need to be big, loud or full. It needs to be **one point ahead, every time you look.** Everything below is engineering for that single feeling, plus the machinery that turns a first visit into a habit without turning it into a slot machine.

The rule the whole file obeys: **the compulsion comes from skill, memory and other people — never from money, scarcity or punishment for leaving.** That is not squeamishness. In Second Life a build that respects its players gets re-visited; one that grinds them gets a group notice and a bad review.

---

## 1. The spine: the gap

Every surface in the house reports **one number, and it is a gap, not a score.**

Not `SCORE 12`. Instead:

```
YOU 12   ·   HOUSE 13
```

A score is a fact. A gap is a **task**. Humans close gaps — this is the goal-gradient effect, and it is why a progress bar that is 80 % full feels different from one that is 20 % full even when neither does anything. The gap is always **small, always visible, and always one better than you.**

Three design consequences, applied everywhere:

1. **The House's number is never hidden**, never abstract, never "ranked". It is `your best + 1`, on the marquee, before you put a single touch on it.
2. **Every object that can report a number reports the gap.** The Ledger reports degrees-in-the-negative ("THE HOUSE HAS 2 OF YOUR 33"). The Board reports rank *and* gap. The Bell only rings when the gap closes.
3. **The gap is not allowed to widen while you watch.** If the House is ahead, the difference stays one. That is a promise, and keeping it is what makes the next game voluntary.

---

## 2. The four loops

A build only becomes addictive when it has loops at four different speeds, each of which is satisfying on its own. Most SL builds have one (walk around and look at it) or none.

### Loop 1 · two seconds — *the marquee*

The cabinet's face is the fastest loop in the house and the one that decides whether anyone plays.

**Attract mode** cycles in a fixed rhythm: `title + best + house` (4 s) → `the ghost` (a replayed run, §3.1) → `the whisper` (2 s, one line of the Croupier's dialogue) → repeat. It never stops. A cabinet that goes silent and dark is a cabinet that is off; a cabinet that is *always doing something* is a cabinet someone is about to touch.

**The 100 ms rule.** A touch must produce visible change within 100 ms or the cabinet is broken, whatever the prim count says. In LSL that means: input is a `llMessageLinked` to a local prim, never a `llSleep`, never a round trip through another object, never a `llSetTimerEvent` for a keypress. The Adder ticks at 0.30 s; input is consumed on the same frame as the tick.

| Loop | Length | Satisfied by | Failure mode if missing |
|---|---|---|---|
| 1 | 2 s | marquee alive, input instant | "it's not working" |
| 2 | 2 min | one run, one gap, one bell | "what do I do" |
| 3 | 2 hr | other people, the room, the board | "I've seen it" |
| 4 | 2 wk | the Ledger, the streak, the door | nothing to come back for |

### Loop 2 · two minutes — *the run*

Target run length **60–110 seconds**: long enough to feel like a game, short enough that losing costs nothing and the queue moves.

The Adder is tuned so that:

- a first-timer scores **4–9** (they will die, and dying is funny),
- a competent player scores **18–24**,
- the House sits at **best + 1**,
- and **≈ two runs in three** end within three points of the House.

That last number is the whole game. **Near-miss engineering** — the studied reason a near miss feels better than a win — is normally used to fleece people. Here it is used to make the next run feel *already earned*. Achieve it by tuning the apple's placement (`rand_free_cell()`'s `dx + dy >= 2` rule in `P33_game_adder.lsl`) so the food is never adjacent, never free, and never more than a snake-length away: the run ends when greed beats geometry, not when the dice say so.

**The ratchet.** When you beat the House, the House does not sulk and it does not congratulate you for long. Within the same second:

```
THE HOUSE NOTICES · 19      (magenta, 3 s — you won)
HOUSE 20                    (brass, immediate — it is already ahead)
```

You get the bell, you get the line, and then the number is one better than you again. **The win is real and the gap is immediately restored.** This is the single most important behaviour in the build: it makes the machine honest and it makes it inexhaustible.

### Loop 3 · two hours — *the room*

Single-player cabinets in SL die of loneliness. The room is the retention layer, and it costs almost nothing:

- **The queue.** One line on the marquee — `NEXT: Ariadne` — turned on when a second avatar touches a cabinet mid-run. The first player sees they are being watched; the watcher sees they are next. A queue converts a machine into a social object, which is the only thing that survives in a sandbox.
- **The ghost.** Attract mode replays a *person's* run, not a scripted demo (§3.1). An empty cabinet still looks like someone was just here — and someone always was.
- **The Board of the House.** Ten names, two columns: **degrees** and **gap**. The gap column is the interesting one, because it is winnable this evening.
- **The Tell.** When a run is within two points of the House, the cabinet's frame pulses magenta at 0.5 Hz. Strangers can tell from across the gallery that something is *close*. Spectacle is free advertising.

### Loop 4 · two weeks — *the Ledger*

Memory is the only reason to come back to a specific build in a world of ten thousand places.

- **The card.** Touch the Ledger and it reads you back: degrees held, gap to the House, and **how long you have been away** — in the Croupier's voice, never in a UI's.
- **The streak.** Consecutive visits are recorded, not rewarded with power. `THE HOUSE KNOWS YOUR KNOCK` appears on your card at 3, 7 and 30.
- **The degrees.** 33 of them, one bit each, in one string, on one prim. They are the long game: a number that only ever goes up, which is the kindest progression there is.
- **The door.** The 34th door does not open for money, for time, or for grinding. It opens for an *event*, once a day (§3.8).

---

## 3. Eight innovations, costed

Every one of these is buildable from what is already in `tools/lsl/`. None of them needs a sim setting, an Experience, a HUD or an attachment.

### 3.1 · The Ghost — attract mode replays a real run · **0 LI**

**What.** The Adder records a run as a **tape**: the RNG seed plus every direction change with its tick — `S4471|0,1|7,2|12,3|…`, capped at 200 entries in linkset data (`TAPE`). Because the food sequence is derived from the seed, the tape replays **exactly**: same board, same apple, same death. On attract, the cabinet loads the best tape and plays it at 1.25× speed with the marquee reading `SOMEONE · 19`.

**Why it is the best thing in the build.** It is simultaneously: a tutorial (a stranger learns the game by watching it), social proof (an empty room looks inhabited), a trophy (your best run is the house's advertisement), and a reason to beat your own ghost rather than an abstract number. **Zero prims** — it re-uses the sprites that already exist.

**Try it.** [`tools/cabinet-sim.html`](tools/cabinet-sim.html) is the Adder as a browser cabinet running this
exact arithmetic — the hand, the Tell, and the tape replay. It was used to verify determinism before the LSL
was written: **40 of 40 recorded tapes replay to the identical score and the identical death tick.**

**How.** `P33_game_adder.lsl`: `mode = MODE_DEMO`; in demo, input comes from `tape` rather than from the pads, and `end_run` silently restarts instead of posting a score. Determinism requires the food to come from a seeded LCG (`seed = seed * 1103515245 + 12345`) instead of `llFrand` — **do this and nothing else in the module changes.**

### 3.2 · The Ratchet — the House is always best + 1 · **0 LI**

Already in the core (`finish()`); keep it. Never soften it into `best` or `best - 1` "to be nice". The promise that the House is exactly one ahead is what makes the next run feel winnable; a House that is comfortably ahead is scenery.

### 3.3 · The Tell — you can see it is close · **0 LI**

Within 2 of the House, the frame prim pulses magenta at 0.5 Hz (`PRIM_GLOW` 0.0 ↔ 0.35, one `llSetTimerEvent(0.5)` while true). It gives a stranger a reason to stop walking, and it teaches the player the shape of "close" before they can read the number.

### 3.4 · The Queue — `NEXT:` · **0 LI**

A one-entry queue per cabinet, in the core. Second toucher is remembered; when the first player's run ends, the marquee says `YOUR TURN · <name>` and holds for 5 s instead of dropping to attract. Two people playing a machine is a crowd; a crowd is the only reliable retention mechanic in a sandbox.

### 3.5 · The Board of the House · **2 LI**

A single prim on the gallery's end wall, one script, drawing text with `PRIM_TEXT` (no textures, no mesh):

```
THE HOUSE IS AHEAD OF
  ARIADNE      27°   −1
  HOLLOWAY     19°   −2
  …
  YOU           2°   −8
```

Two columns, no scores, sorted by gap ascending. Refreshed by the existing `P33_scoreboard.lsl` channel — it is one more listener on a channel that already exists.

### 3.6 · The Streak — the House knows your knock · **0 LI**

The Ledger already writes one string per guest. Extend it to `mask|visits|last` with `llGetUnixTime()`; on touch, if `now - last > 86400` the card says how many days the House waited. **Never award anything for a streak except a sentence.** Streaks that pay out become obligations; streaks that notice become character.

### 3.7 · The Toll — the House rises on the hour · **0 LI**

At `:00` every hour the Bell rings once, and **every cabinet's hand rises by one** (`HOUSE 13 → 14`), announced on every marquee for 4 s: `THE HOUSE HAS RAISED ITS HAND`.

This is the appointment mechanic: an event that happens whether or not anyone is there, which regulars learn to arrive for, and which makes a returning player's gap *slightly* harder in a way that is legible and fair (it is announced, global and identical for everyone). The Bell script own it — `P33_bell.lsl`, one timer, no listener for input.

### 3.8 · The Door Protocol — one opening a day · **0 LI**

The 34th door opens for **the first guest to reach it within three seconds of the Toll** — a race, once an hour, won maybe once a day. Inside is the only non-game in the build: a room with your own name on the wall, and nothing to do. Never sell access, never make it a reward for spending. A door that opens rarely and for everyone equally is the most durable retention object in the house — it is the reason people keep looking at the door.

---

## 4. Instrumenting without telemetry

The build cannot phone home and should not try. But an owner needs to know whether any of this works, so **the Ledger counts itself**, locally, in its own linkset data:

| Key | Counts |
|---|---|
| `N_VISIT` | distinct guests ever stamped |
| `N_RUN` | runs completed (posted by each core) |
| `N_BEAT` | times the House was beaten |
| `N_TOLL` | Tolls since install |
| `N_DOOR` | times the 34th door has opened |

Owner touches the Ledger for **2 seconds** to read them aloud in the Croupier's voice; everyone else just gets their card. That is the whole analytics stack: five integers, no permissions, no HTTP, no privacy problem.

Target numbers to tune against, after a month on a busy sandbox:

| Metric | Target | Meaning |
|---|---|---|
| runs per visitor | ≥ 3 | loop 2 works |
| beat rate | 25–35 % | the ratchet is not cruel, the game is not free |
| distinct guests / week | ≥ 25 | the room is a room |
| returning guests | ≥ 20 % | loop 4 works |
| median session | 4–9 min | long enough to be a habit, short enough to be a visit |

---

## 5. The four refusals (what keeps this from being a casino)

The lore already refuses L$ wagering, purchasable advantage, newbie punishment and griefing. Three more, specific to this file:

1. **No loss of progress.** Nothing the House does can take a degree, a best or a rank away. It only ever gets *ahead*.
2. **No punishment for absence.** No decay, no "your streak has ended", no content that expires. The House waited; waiting is all it does.
3. **The exit is always open.** No locked doors, no "you must play to leave", no timer that ejects a guest mid-run, no autoplay sound that follows you to the parcel edge. The most professional thing an arcade can do is let someone walk out and feel like coming back.

---

## 6. What this changes in the build

| File | Change | LI |
|---|---|---|
| `tools/lsl/P33_game_adder.lsl` | seeded LCG, tape record/playback, `MODE_DEMO` | 0 |
| `tools/lsl/P33_cab_core.lsl` | queue, Tell pulse, `N_*` counters | 0 |
| `tools/lsl/P33_ledger.lsl` | streak + return greeting + owner stats | 0 |
| `tools/lsl/P33_bell.lsl` | **new** — the Toll, the door protocol, the hour | 0 |
| `tools/lsl/P33_scoreboard.lsl` | Board of the House column layout | 0 |
| the gallery end wall | one prim for the Board | **+2** |

**Box total becomes 111 of 117 LI.** Nothing in this file costs prims, because everything in it is behaviour.

---

*See also:* `08-the-house.md` (the character), `10-arcade.md` (the cabinets), `11-sandbox-edition.md` (the Box this ships in), `13-finish.md` (how it is made to feel expensive).
