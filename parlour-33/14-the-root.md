# 14 · THE SQUARE AND THE ROOT

> *The House is a square. Zion is a knot. The square was built to hold the knot, and the knot has been holding the square open ever since.*

---

## 1 · The premise

**PARLOUR XXXIII is not a ruin. That is the point.** The lodge is intact, lit, staffed, and doing business. What is happening to it is worse than decay: **something is living in it, and the House has decided to exhibit it.**

Two forces, one building:

| | **THE HOUSE** | **ZION** (the House calls it *the Root*) |
|---|---|---|
| what it is | a hermetic order that has been running a house of games since 1833 | the people who moved into the service spaces and never left |
| believes | everything can be measured, numbered and filed | nothing that can be filed is worth keeping |
| geometry | plumb, level, square, symmetric, tessellated | knotted, patched, asymmetrical, hand-drawn |
| materials | brass, lacquer, black glass, felt, bone | cable, tape, copper, wet concrete, plastic sheet, sharpie |
| voice | capitals, complete sentences, no first person | lowercase, unfinished, jokes, first person always |
| weapon | **canonisation** — it plaques what it cannot remove | **occupation** — it grows where the House will not look |

The House's response to an infestation is not extermination. It is a **brass plaque**, a catalogue number, and a new exhibit in the itinerary. That is the satire: *the lodge's greatest power is not ritual, it is administration.* Zion's response is to keep growing anyway, and to write on the plaque.

The guest walks in on the argument, and — this is the twist's real function — **the guest becomes the argument.** Every score you post is filed by the House. Every sigil you draw is a Root mark that the House will catalogue tomorrow. You are, whichever side you think you are on, working for both.

**Nobody ever says the word "Matrix" in-universe.** The reference is structural, not quoted: a warm human resistance living inside the machine's architecture, using the machine's own conduits, speaking in a register the machine cannot parse.

---

## 2 · Two grammars

Every masonic and parlour symbol in `03` and `05` now has a **second, redrawn version** — drawn badly on purpose, in the wrong material, by an unknown hand. The pairs are the build's visual engine. Put them near each other and they argue without a word.

| the House's symbol | Zion's redraw | where |
|---|---|---|
| **the square** (plumb, exact) | a freehand square, 4° out, in sharpie on the back of a brass plate | every deck, once |
| **the compasses** | a pair of pliers, taped open at exactly 33° | the Tool Crib, L0 |
| **the letter G** | a lowercase **g**, and under it, in pencil: *gravity* | the Sanctum, L3 |
| **the eye** | a webcam on a bent coathanger, lens covered with tape, still recording | above the 34th door |
| **the beehive** | a server rack, fan-taped, LEDs blinking in a rhythm that is not a rhythm | the Hive, B1 |
| **the hourglass** | a cracked phone at 1 %, no charger, no signal, still lit | the Cold Bench, L1 |
| **the anchor** | a padlock with no key, holding a door that is not locked | the Blind Door, L1 |
| **the tessellation** | one tile pulled up, and beneath it: a hand-written *hello* | the Salon floor, L2 |
| **the 33 degrees** | 33 tally marks on a girder in paint pen, and a 34th, crossed out | service shaft, all decks |
| **the Bell** | the Bell's cable, cut, and re-run down the shaft to a car battery | the roof |
| **the Ledger** | a page torn out and pinned up with someone else's name on it | the Hive |

**The rule that keeps this from being set dressing:** *every Root mark must be within two metres of the House's original.* The two systems are never allowed to occupy separate rooms. The whole building is a disagreement at close range.

---

## 3 · The contested number

This is the twist's best mechanic, and it costs nothing.

Until now the gap only ever moved one way: **the Toll** raised the House's hand on the hour (§`12` 3.7). Now there is a second force.

| Event | Who | Effect on the House's hand |
|---|---|---|
| **the Toll**, on the hour | the House | **+1** |
| **the Pull**, on a cabinet's own **33rd run** since its last Pull | Zion | **−1** |
| a guest beats the hand | the guest | the hand resets to `best + 1 + raised` |

So the number on every marquee is **a tug-of-war between an institution and a crowd**, and every player is contributing to one side without being told which:

```
HOUSE 14        ← the House has taken three Tolls today
HOUSE 14  ·  PULL 3      ← the Root has taken back three
```

Three consequences, all good:

1. **The gap is never simply "harder tomorrow."** Each cabinet pulls on its own count, so a busy evening drags the whole row's hands down together — and everyone in the room knows why: *the room did that.*
2. **The Toll stops being punishment and becomes a grudge match.** Regulars arrive on the hour to watch the House move and to take it back.
3. **It gives strangers a shared goal without a team system, a group, or a HUD.** The Pull is announced by the cabinets themselves — `THE ROOT PULLED · HOUSE 13` — in the Root's lowercase voice, on the House's brass marquee. That single line is the twist in nine words.

---

## 4 · The Infestation — the house changes while you are away

Retention's oldest engine is *the place is different now*. It normally costs prims. Here it costs none.

**The house never grows. It rearranges.** Every zone is built **three times into the same prim count** — three arrangements of one set of objects, only one of which is visible at a time (`llSetLinkAlpha` on link targets, no rezzes, no rebuilds, no extra LI).

| Stage | Name | What the room does | Trigger |
|---|---|---|---|
| **0** | *CLEAN* | the House as built: brass, symmetry, the music box | start |
| **1** | *SPROUTING* | cable appears at floor level; one pane taped; a sharpie square on a column; the music box has a hum under it | 33 distinct guests, or 100 runs |
| **2** | *CHOKING* | cable up the columns and across the ceiling; a ceiling panel missing, showing the shaft; sheeting over the east gallery; **one sodium worklight on** — the only warm light in the building | 200 runs **and** 20 degrees stamped |
| **3** | *THE HOUSE HAS A SQUATTER* | the dead end is furnished: hammock, battery, server, kettle; the marquee flickers between voices; **the 34th door opens nightly instead of hourly** | 500 runs, 100 degrees, and 33 distinct guests since stage 2 |

**Why this works:** a guest who visits twice, a month apart, sees a *different building* and correctly infers it changed because of people — not because of an update. That is the strongest retention signal a build can send, and it is unreproducible by buying prims.

**Why builders will forgive it:** the stage state is three integers in linkset data and one broadcast. The expensive part is modelling, not scripting.

---

## 5 · The marquee war

One prim, two voices. The cabinets' marquees are the build's face, so they are also the front line.

- **7 showings in 8**, the House speaks: capitals, arithmetic, the hand.
- **1 in 8**, the Root has the marquee: lowercase, no number, sometimes a joke, sometimes a warning, always *shorter* than the House would allow.

| the House | the Root |
|---|---|
| `BEST 19 · HOUSE 20` | `it's 20. it's always 20.` |
| `THE HOUSE NOTICES · 19` | `oh. oh you did it.` |
| `THE HOUSE HAS RAISED ITS HAND · 21` | `they're counting again` |
| `PLAY · ARIADNE` | `go on then` |
| `BEST 0 · HOUSE 1` | `have you eaten` |

The Root's lines are **three to six words**, never more. The House never acknowledges them. That asymmetry — an institution that refuses to argue — is funnier and colder than any dialogue tree, and it is free.

---

## 6 · THE SCRIBE — the twelfth cabinet, and the twist made playable

**One stroke. Sixteen cells. Twenty seconds. Make it mean something.**

A new game module, and the only one where the player *leaves something behind*. The 12 × 12 grid and the 17 sprites are already there; the Scribe uses the same hardware as the Adder.

- **Cursor** moves with the four pads; **FIRE** inks the cell under it. You may only ink a cell adjacent to the last one — **one continuous stroke**, up to 16 cells.
- At 20 s the stroke is scored by **the House's judgement** (§`14` is the joke: the House judges art by symmetry):

| criterion | points |
|---|---|
| **axial symmetry** (mirrored about the vertical centre line) | 3 |
| **rotational symmetry** (90°) | 3 |
| **closure** (last cell touches the first — the ouroboros) | 2 |
| **coverage** (distinct cells inked) | 1 each, max 12 |
| **the Heretic's bonus** — *deliberately* asymmetric and closed | 4 |

That last line is the whole thesis in one rule: **the House pays more for a contradiction it can file.**

- The hand you are beating is, as always, `best + 1` — but the Scribe's best is *the best sigil the House has judged*, and the winning stroke is **saved to linkset data and redrawn in attract mode, cell by cell, forever.** Your mark stays in the cabinet after you leave. The House catalogues it. Zion claims it.
- Cabinet 12 is a dressed cabinet in Cabinet Row, so the build's bill does not move (`11` §3).

**Why it is the most addictive thing in the house:** it is the only cabinet where the score is an *opinion*, the only one where the output is *visible to strangers*, and the only one where a guest can be bad at it in a way that is interesting. Drawing badly, on purpose, for money, is the most human action available in the building — and it is the one the House cannot stop.

---

## 7 · Atmosphere: the second palette

The House's palette (`05`) does not change. A **second layer** is added over it, and the two never mix on the same surface without a seam — tape, a cable tie, a bolt, a printed label. Everything Zion touches is *attached*, never integrated. That is how you can tell it is alive.

| | colour | where |
|---|---|---|
| **verdigris** | `#2E6B57` | copper that has been wet for years: the shaft, the roof cable |
| **rust** | `#7A3B1E` | brackets, cut ends, the battery tray |
| **wet concrete** | `#22252A` | the service shaft, the dead end |
| **sodium** | `#FFB85C` | **the only warm light in the building** — one worklight on an extension reel |
| **sharpie** | `#0B0B0C` | every drawn symbol; never a texture, always thin geometry |
| **indicator** | `#3CE07A` | stolen LEDs, blinking in a rhythm that is *almost* regular |
| **sheeting** | `#B9B2A4` at alpha 0.35 | the east gallery at stage 2 |

**Four rules that make the layer read as alive rather than decorated:**

1. **Nothing Zion makes is straight.** A drawn line is 3–5° out. Cables sag. Tape is applied by hand and is not parallel to anything.
2. **Nothing Zion makes is clean-edged.** Where cable meets brass, there is a scuff. Where a plaque is bolted on, the brass is dented under it.
3. **Zion lights nothing evenly.** One worklight, one LED, one screen. Every Root light casts a hard shadow and there is never enough of it.
4. **Zion labels everything, badly.** Masking tape with biro: `DO NOT SWITCH OFF`, `THIS ONE`, `BELL`, `ours`. The House labels everything beautifully; that is the joke.

**Sound.** Under the House's music box (`05` §6), a second bed at stage 2+: a 40 Hz hum, a slow water drip, and — once every 33 seconds — a single keystroke. Nothing else. The Root is not loud. It is *present*.

---

## 8 · Detail inventory (the part that makes it feel lived in)

Thirty things, all cheap, all permanent. A builder who installs twenty of these has a building that people photograph.

1. Cable enters the gallery through the **hole where the Bell's cable used to be** — and the cable is gone, re-run down the shaft.
2. A brass plaque bolted onto a root: `EXHIBIT 7 · UNKNOWN GROWTH · DONATED 2026`.
3. Written under that plaque in pen: `we didn't donate it`.
4. Lift 2 has a sign: `OUT OF ORDER SINCE THE HOUSE WAS BUILT` — and beneath it, `it works, they just don't want you up there`.
5. The east gallery has a mattress and a kettle behind sheeting. Nobody mentions it. A mug is warm.
6. The pin deck has a cable tie round the sweep arm holding it *up*, not down.
7. One lane has been re-oiled with something that is not lane oil and smells of it.
8. The Skaters' Lounge clock is 33 minutes slow and has been for years; someone has written `it's always been 33` under it.
9. Two of the 33 plaques have been turned to face the wall.
10. The 34th door's brass has fingerprints — hundreds, all at the same height.
11. A ladder, permanently, going up to nothing.
12. The Hive's server rack has a sticker: `THIS MACHINE RUNS THE HOUSE. PLEASE DO NOT`.
13. A takeaway menu on the Ledger's plinth, from a restaurant that closed in 2019.
14. The Toll's schedule is printed and taped to the wall. Someone has drawn a small face next to 21:00.
15. The gallery's cracked pane is taped in a lattice on *both* sides.
16. A copper wire runs along the floor and up the wall, and it is warm.
17. Chalk tally marks on the escalator side panel, in rows of 33.
18. The one working payphone in the build has a handwritten number taped inside the door.
19. The Sound Booth has a hand-drawn sign: `RECORDING. be nice.`
20. A single chair facing the 34th door, worn shiny.
21. The Bees' room has real bees. Nobody will say how. (They are meshes. Nobody will say that either.)
22. A fire exit sign, unlit, with `it's fine` written on it.
23. The staff apron on a hook in the Change Booth has a name on it that is not a staff name.
24. Electrical tape in a cross over a mirror's crack, and the mirror still reflects.
25. One masonic floor tile is loose and can be lifted. Under it: `hello` (§`2`).
26. The kart pit has a jerrycan labelled `NOT PETROL`.
27. The Ribbon's hole 11 flag is a sock.
28. A shoebox of unclaimed keys, labelled `THE HOUSE OWES THESE`.
29. The Bell's clapper is wrapped in tape to soften it. It is not softer.
30. On the inside of the 34th door, at knee height, in pencil: **`we were here first`**.

---

## 9 · What it does to the numbers

| | before | after |
|---|---|---|
| reason to come back | the Ledger remembers you | **the building has changed, and your mark is in it** |
| reason to stay an extra hour | the Toll | the Toll **and** the Pull |
| reason to bring a friend | the queue | the queue, plus **something to show them that they can't get anywhere else** |
| the House's voice | one voice, consistent | two voices, in conflict, **neither explained** |
| prims | 111 | **111** (the Scribe re-uses a dressed cabinet; the stages rearrange) |
| scripts | 9 | **10** (the Scribe module runs in an existing cabinet) |

---

## 10 · Build order for the twist

Do it in this order, or the layer looks painted on instead of grown:

1. **Stage geometry first.** Cut the three arrangements for one zone (the gallery) and test them against the real camera height before doing any decoration. If the stages do not read from the gallery floor, the twist does not exist.
2. **Then the conduits.** One continuous path for cable from roof → shaft → every deck. If the cable teleports between rooms, so does the story.
3. **Then the labels.** Masking tape and biro, 0.02 m proud of the surface, never a texture.
4. **Then the five near-miss pairs** (§`2`) — the House symbol and its redraw within two metres.
5. **Last, the warm light.** One. If you add a second sodium fixture, the whole thing turns into a mood board.

**Definition of done, for the twist:** a visitor can stand in the gallery and correctly guess that **someone lives here and the management has decided to charge for it** — without reading a single sign.

---

*See also:* `08-the-house.md` (the Croupier), `12-the-loop.md` (the contested number), `13-finish.md` (the standards this has to meet), `11-sandbox-edition.md` (the Box).
