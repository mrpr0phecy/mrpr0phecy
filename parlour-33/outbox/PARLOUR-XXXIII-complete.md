# PARLOUR XXXIII — the complete package

*Assembled 2026-11-14 from the build repository. Every document, in order.*

## Contents

- **README.md** — PARLOUR XXXIII
- **01-concept.md** — 01 — Concept, name, and narrative
- **02-masterplan.md** — 02 — Masterplan: the Weave
- **03-thirty-three-stations.md** — 03 — The Thirty-Three Stations
- **04-attraction-specs.md** — 04 — Attraction specifications
- **05-art-direction.md** — 05 — Art direction
- **06-secondlife-constraints.md** — 06 — Second Life constraints, budget, and policy
- **07-build-handoff.md** — 07 — Build handoff
- **08-the-house.md** — 08 · THE HOUSE — lore, cast and voice
- **09-space-audit.md** — 09 · THE SPACE AUDIT — no unused metre
- **10-arcade.md** — 10 · THE ARCADE — 24 machines that actually work
- **11-sandbox-edition.md** — 11 · THE P33 BOX — the sandbox edition
- **12-the-loop.md** — 12 · THE HOUSE ALWAYS WINS BY ONE
- **13-finish.md** — 13 · THE FINISH
- **14-the-root.md** — 14 · THE SQUARE AND THE ROOT

## Also in this package

- `build_manifest.yaml` — the machine-readable build
- `plans/` — the drawable sheets: `masterplan.svg`, `kiosk.svg`
- `renders/` — seven geometry renders + `README.md`
- `tools/` — `gen_plans.py`, `gen_kiosk.py`, `render3d.py`, `cabinet-sim.html`
- `tools/lsl/` — nine production scripts + `README.md` (link-name contract, protocol, channels)
- `art/` — the look-dev plates


---

# PARLOUR XXXIII

**A combined leisure house for Second Life — bowling, jungle gym, ice rink, laser quest, arcade, casino, karting, mini golf, rollercoaster and a pool with a glass flume — built as one tight 68 m block, woven deck by deck so that two games always run side by side, three metres apart, through a single pane of glass.**

> *Thirty-three degrees. The four suits, eight stations each, and the Fool — which is you.*

| | |
|---|---|
| **Working name** | PARLOUR XXXIII (signage: `PARLOUR 33`) |
| **Alternates** | HARE & LODGE · The Gilded Warren · The Nine of Cups · Bottle Green · SNAPDRAGON |
| **Region** | one full private region, 256 × 256 m, 30 000 LI, plaza at +20.00 |
| **Building** | one 68 × 68 m block, +20.00 → +58.60, eight decks, **no atrium** |
| **The number** | exactly 33.00 m from the pool deck (the Flood) to the roof (the Belvedere) |
| **Rating** | Moderate. No L$ wagering anywhere in the build |

---

> **Two editions.** The **WEAVE** is the region build: eight decks, 28 400 LI, everything in `01`–`10`.
> The **BOX** is the sandbox edition: 20 × 20 m, **111 LI**, seven linksets, one gallery and three working
> games — see [`11-sandbox-edition.md`](11-sandbox-edition.md) and [`plans/kiosk.svg`](plans/kiosk.svg).
> Same scripts, same lore, same arithmetic; the Box is the Weave with the Weave taken out.
>
> **`12` and `13` are the difference between a design and a build that feels expensive.** `12` is why
> anyone plays a second game; `13` is why they believe it was made by professionals.

## What is in this package

Read in order if you are building. Read 01 + 02 + 03 if you are approving.

| File | What it is |
|---|---|
| [`01-concept.md`](01-concept.md) | the name, the thesis, the narrative spine, why every modern attraction is a Victorian parlour game |
| [`02-masterplan.md`](02-masterplan.md) | the spatial system: stack, dimensions, coordinates, sightlines, circulation, capacity |
| [`03-thirty-three-stations.md`](03-thirty-three-stations.md) | the 33 degrees — the collectible spine of the build, and the build checklist |
| [`04-attraction-specs.md`](04-attraction-specs.md) | each attraction: footprint, LI budget, mechanics, LSL approach, acceptance test |
| [`05-art-direction.md`](05-art-direction.md) | palette, materials, signage, type, the symbol lexicon (parlour / masonic / occult, twisted), light, sound |
| [`06-secondlife-constraints.md`](06-secondlife-constraints.md) | land impact, LOD, alpha, physics, scripts, Experiences, casino & rating policy, performance budget |
| [`07-build-handoff.md`](07-build-handoff.md) | phases, object naming, bot task order, QA gates, launch checklist |
| [`08-the-house.md`](08-the-house.md) | **the character bible**: the House, the Croupier, the Hare, the Stewards, the nine rules, the voice, the rituals, the twelve secrets, three endings |
| [`09-space-audit.md`](09-space-audit.md) | **no unused metre**: every cubic metre assigned, the five rooms that came out of the audit, the 12-object filler kit |
| [`10-arcade.md`](10-arcade.md) | the 24 cabinets that actually work: build spec, the 8 game types, the Penny Parlour, the House's hand |
| [`tools/lsl/`](tools/lsl/) | **the scripts**: cabinet core, three playable games, the scoreboard, the ledger, the station plaques |
| [`11-sandbox-edition.md`](11-sandbox-edition.md) | **the sandbox edition**: the P33 BOX, 109 LI on a free parcel, its bill, its assembly, its 90-second demo, and the six decisions that make it survive a sandbox |
| [`14-the-root.md`](14-the-root.md) | **the twist**: Zion — the Root — strangling the lodge from inside. Two grammars, the contested number (Toll vs Pull), infestation stages 0-3, the marquee war, THE SCRIBE, the second palette, thirty details |
| [`12-the-loop.md`](12-the-loop.md) | **the compulsion architecture**: the gap, the four loops, the Ghost, the ratchet, the Tell, the queue, the Toll, the door protocol — and the four refusals that keep it out of casino territory |
| [`13-finish.md`](13-finish.md) | **the finish**: prim and LOD discipline, materials table, light and sound budgets, the four signage tiers, the cabinet state machine, twenty-five acceptance tests, failure modes, definition of done |
| [`14-the-root.md`](14-the-root.md) | **the twist**: Zion (the Root) strangling the lodge from inside — two grammars, the contested number, the infestation stages, the marquee war, THE SCRIBE, and thirty details that make it lived-in |
| [`tools/cabinet-sim.html`](tools/cabinet-sim.html) | **the playable proof**: THE ADDER as a single-file browser cabinet, running the same arithmetic as the LSL — the House's hand, the Tell, and the Ghost replaying a real tape |
| [`build_manifest.yaml`](build_manifest.yaml) | the same data, machine-readable, for the build bots |
| [`plans/`](plans/) | generated SVG plans: one per deck, two sections, and the weave diagram |
| [`renders/`](renders/) | **3D renders of the actual model** — cutaway, exterior, exploded stack, gallery and pool. Generated from `gen_plans.py` by `tools/render3d.py` |
| [`art/`](art/) | concept images: `concept-the-weave.png` (the interior, as built), `concept-the-block.png` (the building from the plaza at 3 am), `the-croupier.png` (the House's hands) and `cabinet-row.png` (the arcade). `concept-the-well.png` / `concept-the-drum.png` are the superseded first draft, kept for the light |
| [`tools/gen_plans.py`](tools/gen_plans.py) | the coordinate model. Every dimension in the docs comes from here |
| [`tools/render3d.py`](tools/render3d.py) | the 3D renderer: reads the coordinate model, writes `renders/*.png` |

The nine documents run **place → programme → build → character**. If you are only reading two, read `02` (how it stands up) and `08` (who it is).

Regenerate the drawings and the 3D any time with:

```bash
python3 parlour-33/tools/gen_plans.py     # plans/*.svg
python3 parlour-33/tools/render3d.py      # renders/*.png   (~25 s, numpy + pillow)
```

The plans are **schematics**: metres, zones, circulation and sightlines. They are not prim plans. They are drawn to a single coordinate model so a bot can trust the numbers.

---

## The idea in five lines

1. **Two games per deck, three metres apart.** Every deck holds two attractions side by side with a 6 m glazed gallery between them. You are never in a room where one thing is happening.
2. **No atrium.** There is no central hole and no long sightline anywhere in the building. The vertical views are eleven small openings in the floors — a warren, not a mall.
3. **The decks turn ninety degrees every two levels**, so the building is woven: every deck is at right angles to the one below, and the stairs turn you with it. You never walk the same direction twice.
4. **You enter under a shabby shopfront** and drop four metres into the dark. Then you climb the degrees — every deck is a degree.
5. **Every modern attraction is a Victorian parlour game, supersized.** Bowling is skittles. Mini golf is croquet. Laser quest is blind man's buff. Karting is hoop-trundling.
6. **The occult furniture is the house's joke.** Square and compasses redrawn as a cocktail glass and a joypad. The letter G replaced with a glowing 33. The lodge thinks it has the degrees; the house has thirty-four.
7. **The House is a character, not a theme.** It writes you down, it posts a score one point above yours, it notices when you beat it, and at thirty-three degrees the door it says is not locked turns out to be occupied. See `08`.

---

## What the build must feel like

Dark, close, cheap-lacquered, hot with neon, and then it opens into a room with a swimming pool in it. It should feel like a Victorian gentlemen's club that was rebuilt inside a Tokyo parking structure and then infected by an arcade. Velvet and mahogany next to brushed steel and cable. Brass fittings that are also joysticks.

Every turn gives a framed view of another game in progress, through glass, at three metres. You are never in a corridor; you are always either in a gallery between two games or on a ledge looking into one.

---

## Honest constraints up front

This programme — ten attractions plus arcade cabinets plus a coaster — wants about **31 000 LI**. One full region gives you 30 000. The budget in `06-secondlife-constraints.md` commits **28 400** and holds the rest as contingency, which means the build only works if the discipline holds:

- the shell is **mesh, low-LOD, atlased**, and shared across all decks
- every hall is the **same module** (26 × 58 × 4.9 m), so the mesh is built once and used twelve times
- nothing is physical that does not need to be
- the arcade is **24 machines, not 60**
- mini golf is **18 holes on a 5 m ledge**, not a landscaped course
- **no L$ wagering.** The casino is a design language, not a business. This is both a policy requirement and the thing that keeps the sim out of trouble

If you are on a 20 000 LI region, see the trim plan in `06`. It loses half the arcade, half the golf, four lanes, four tables, three karts and the roof loop — and it still works, because the galleries are free.

---

*Design package, November 2026. Numbers are in metres and Lindens-of-land-impact. Everything is schematic until a builder measures it in-world.*


---

# 01 — Concept, name, and narrative

## 1. The name

**PARLOUR XXXIII** — spoken "the thirty-third parlour". Signage reads `PARLOUR 33` because 33 reads better in neon at 20 m.

Why it works:

- **Parlour** carries the whole brief in one word: parlour games, parlour tricks, the Victorian salon, a room you are invited into, and — in the old sense — a place of private, slightly improper entertainment.
- **XXXIII** is the masonic degree count, so the name is already a joke at the lodge's expense. The house has thirty-three degrees. The lodge has thirty-three degrees. The house's are better, and you can play them.
- It reads as a **sign**, not a title. `PARLOUR 33` fits a vertical neon blade on a Tokyo street.
- It survives translation into the build's own typography: the numeral set small, superscript, in brass.

**Alternates**, if you want a different flavour:

| Name | Flavour | Note |
|---|---|---|
| **HARE & LODGE** | the rabbit hole plus the lodge, as a Victorian department store | the best pun available. Reads as a shopfront. Works as the name *on the shabby door* if you want the façade to lie |
| **The Gilded Warren** | warm, feral, occult | softer, less neo-Tokyo |
| **The Nine of Cups** | tarot, water, wish-fulfilment | good if you want the pool to be the icon |
| **SNAPDRAGON** | the Victorian parlour game played with burning brandy | perfect for the coaster, too obscure for a venue |
| **Bottle Green** | the colour of the whole interior | too subtle |

**Recommendation:** brand the building `PARLOUR XXXIII`, and put `HARE & LODGE` on the street-level shopfront that lies to you. The building has two names because the building is two things: a crummy pachinko parlour that closed, and the thing underneath it.

---

## 2. Thesis

> **Every modern leisure attraction is a Victorian parlour game with the safety rail removed.**

Put that sentence on a brass plaque in the vestibule and let the whole build argue it.

| The modern attraction | The parlour game it actually is |
|---|---|
| Bowling | **skittles** / ninepins — a pub and parlour game for 400 years |
| Mini golf | **croquet** — hoops, a mallet, an obstacle, a smug winner |
| Laser quest | **blind man's buff** — hoodwinked, hands out, hunting by sound |
| Arcade | **the penny arcade** — a machine that takes your coin and gives you a story |
| Casino | **faro, hazard, vingt-et-un** — the Georgian gaming table |
| Ice rink | **curling** — a frozen sheet, a heavy stone, a shouted instruction |
| Swimming pool | **sardines** — a game played by hiding, in water, badly |
| Jungle gym | **cat's cradle / musical chairs** — bodies in a web, positions lost |
| Karting | **hoop-trundling** — a hoop, a stick, and a child running too fast |
| Rollercoaster | **snapdragon** — snatching something out of a fire and surviving it |
| Waterslides | **the water chute** — a genuine Victorian pleasure-garden ride |

This is not decoration. It is the **interpretive layer** that lets a dark, arty, occult building also be funny and warm. Every attraction gets a small brass plate with its parlour ancestor. The plates are the cheapest, most memorable thing in the build.

---

## 3. The occult furniture, and how we twist it

The brief: *"symbols of freemasons and the occult but twist them as if their game is being bettered by our house of games."*

So the house is not a lodge. The house is a **rival**, and it is a bad winner. It has taken the lodge's symbols and re-cut them as game equipment.

| The lodge has | The house has | Where |
|---|---|---|
| Square and compasses | **square and joypad**, crossed, in neon | vestibule, coaster station |
| The letter **G** | a glowing **33**, and inside the Sanctum a **Ø** (the house's own cipher) | Sanctum, the Crown Bar, the 34th Door |
| The black-and-white pavement | **the chequer floor is a bowling lane**, and the tessellated border is the edge of the golf ledge | L2, everywhere |
| The rough and perfect ashlar | two cubes at the door: one raw concrete, one mirror chrome. The mirror one is a **photo spot** | Threshold |
| The three pillars | **four** lifts, three classical orders and one impossible twisted order | the Needles |
| The blazing star | **the Lodestone** — a black monolith turning slowly in the L4 gallery, so you must walk around it to pass | L4, the gallery |
| The hoodwink | **laser-quest goggles**; you enter the house blind on purpose | the Undercroft |
| The lost word | **the lost token.** The house has replaced the word with a game token and will not say why | the Hive |
| The beehive (industry) | **the Hive** — the token booth, and a real hive of brass drawers | B1 |
| Jacob's ladder / the ladder of degrees | **the Warren's rope ladder**, 9 m, hanging in the void | L4 |
| The All-Seeing Eye | **the Watch** — 11 small openings in the floors, each with a brass surround and a guard rail, through which the House looks down at itself | every deck |
| The coffin | a **photo booth** shaped like one, and it prints a card | L2 |
| The 33 degrees | 32 sigils + the Fool. The 33rd degree is you | the whole loop |

Two rules that keep this from becoming kitsch:

1. **Never explain it in-world.** No lore dumps. One plaque, eight words maximum.
2. **The symbols are used, not displayed.** The compasses are a cocktail glass because someone is drinking out of them. The eye is a hole in the floor because that is the only way to see the game below without joining it.

**Do not** put a literal hexagram, a literal Baphomet, or anything that reads as a real-world political or religious claim on the wall. The register is *Victorian fraternal absurdism*, not conspiracy. If a symbol needs a caption to be funny, cut it.

---

## 4. Narrative spine — down the hole, then through the warren

You do not walk into this building. You are **let in**, then you are **dropped**, and then you are **turned around** until you stop trying to keep track.

### 4.1 The Threshold (+20.00, on the plaza, north)
A shabby two-storey shopfront wedged into the base of a **blank 68 m concrete block**: dead neon, a shutter half down, a poster for a pachinko parlour that closed years ago. Above the door, chipped gold letters: **HARE & LODGE**. This is the lie. The shopfront is six metres wide and the building it is glued to has no windows at all on its lower floors. The whole point of the threshold is that it is disappointing and the building is unreadable.

### 4.2 The Fall (−4.00 m)
Inside: a corridor 1.8 m wide, 2.2 m high, 14 m long, badly lit, with a turn in it you cannot see past. At the end, a 1960s lift with too much brass and one button. It descends four metres, slower than it should, then drops the last half metre and stops hard.

### 4.3 The Sump (+20.00, under the building)
A low dark room with one booth — **the Hive** — a brass grille and a hand inside it. It gives you **a token** and **a HUD** and says nothing. Two ways on: the Hoodwink (laser quest, the entrance ritual) and the foot of the Zigzag.

### 4.4 The turn — seven legs, no repeated direction
The Zigzag is four stairs in four corners. Because the halls alternate direction from deck to deck, **every stair turns you ninety degrees**, so you never walk the same way twice and you never get a long view. The building reveals itself in a sequence of short, close, sideways glances:

| You arrive | Through the glass on your left | through the glass on your right | You feel |
|---|---|---|---|
| **L0 The Flood** | 300 m² of water | a velvet room, no windows | *there are two things happening and I am between them* |
| **L1 The Mirror** | skaters on ice, and swimmers under it | steam, radiators, wet gloves | *I am standing between two temperatures* |
| **L2 The Lane** | ten lanes, and the bar | a wall of machines, screaming | *this is where everyone is* |
| **L3 The Lodge** | a low ceiling, smoke, twelve tables | tea, and a door that only opens inward | *the House has a private room and I am not in it* |
| **L4 The Warren** | nets, four levels of them, and a ball pit | karts, three metres away, at speed | *two games are running parallel and watching each other* |
| **L5 The Crown** | the Warren's top ropes, 8 m down | the coaster station, trains breathing | *something is about to leave* |
| **Roof The Belvedere** | — the only sky in the building — | | *I have come out the top of the warren* |

### 4.5 The 34th degree
Thirty-two sigils across four suits. One Fool, given at the door, which is not a degree because it is you. Collect thirty-two and **the 34th Door** on the Crown opens. Behind it: a small room, a chair, a mirror, and a card with your own name and the date you first entered. That is all. That is the joke and it is also sincere.

### 4.6 The House's own geography
Four systems, all named, all with one job:

- **The Zigzag** — the four stairs. Turns you ninety degrees every time.
- **The Gallery** — the 6 × 58 m glazed slot on every deck. Two attractions from one place.
- **The Ribbon** — the golf ledge spiralling the perimeter, one lap per deck. Slow, and it sees everything.
- **The Watch** — eleven small openings in the floors. The House's eye, looking down at itself.
- **The Flume** — one glass tube, 33 m, cutting through every deck into the pool.
- **The Thread** — the coaster, 380 m, through four decks and the roof.
- **The Spiral** — the kart circuit, 250 m, folded into one hall.

## 5. Tone

**Dark but not grim. Arty but legible. Intensely fun.**

- The lighting is **low and warm with hard neon accents** — never evenly lit. Never a flat white ceiling.
- Every zone has **one rude colour** against the house palette so it reads from across the void.
- Sound is **close and mechanical**: pachinko clatter, pins, blades, a lift motor, rain on the concrete, a distant brass band. The house should sound like it is working.
- The house is **never silent and never empty** — the Stewards (two NPC hosts) and ambient machinery fill the gaps at low population.

---

## 6. Who it is for

Adults and older teens, in a group, for 45–120 minutes, arriving from search or from a friend's teleport, probably at 22:00 their time. They will:

- screenshot from a gallery within the first 90 seconds, with two games in frame, or the build has failed
- want to try two or three things, not ten
- stay if the arcade is free and the bar is visible
- come back if there is a **sigil** they did not get

That last one is why the 33 exists. It is a retention machine disguised as decoration.


---

# 02 — Masterplan: the Weave

Every number here is generated from `tools/gen_plans.py`. If a drawing and this document disagree, regenerate both.

**There is no atrium.** There is no central hole, no grand void, no sightline straight through the building. The whole design is built to prevent that: the House is a warren, and a warren is a place where you cannot see the whole of it from anywhere in it.

Instead, the building is **woven**.

---

## 1. The coordinate contract

| Thing | Value |
|---|---|
| Region | 256 × 256 m, plaza at **+20.00** |
| Building footprint | **x 94.00 – 162.00, z 94.00 – 162.00** — 68 × 68 m |
| Perimeter band | **5 m** all round — the Ribbon (golf) |
| Interior | 99.00 – 157.00 — **58 × 58 m** |
| Halls | **26 × 58 m**, two per deck |
| The Glass Gallery | **6 × 58 m**, one per deck, between the halls |
| Floor to floor | **5.50 m** (clear 4.90, slab 0.60) |
| Decks | B1 +20.00 · L0 +25.00 · L1 +30.50 · L2 +36.00 · L3 +41.50 · L4 +47.00 · L5 +52.50 · Roof +58.00 |
| Parapet | +58.60 |
| The number | L0 to Roof = **33.00 m** |
| Lifts | 2, in the east and west bands |
| Stairs | 4, in the four corners of the band — **the Zigzag** |

One region, one building, no sim crossings. The footprint is deliberately small: 68 m each way on a 256 m region leaves an 84 m apron for the plaza, the queue, and the outside of the building that people photograph.

---

> **See it in 3D:** [`renders/render-02-section.png`](renders/render-02-section.png) (cutaway), [`render-04-gallery.png`](renders/render-04-gallery.png) (eye level) and the exploded stack are generated straight from this document's numbers by `tools/render3d.py`. If the render and the text disagree, the text is wrong.

## 2. Why a block and not a drum

The first draft of this house was a drum with a 28 m hole down the middle, and it was wrong in one specific way: **an atrium is a shopping centre.** Put everything on the edge of a void and you have built a mall with games in it — you can see the whole building from the door, so there is nothing to discover, and the space reads as one big room rather than a place you go *into*.

The brief asked for the opposite: **a compressed warren where the games run cleverly parallel to each other.** So:

| The drum with a hole | The block with a weave |
|---|---|
| one big sightline, always | no long sightline anywhere |
| one hero view, then you have seen it | a new view at every turn, forty times |
| galleries hang off a central emptiness | halls sit *beside* each other, sharing walls |
| vertical drama | lateral intimacy |
| you always know where you are | you are pleasantly, productively lost |

You still see people doing other things — **constantly, and much more closely than before.** You see them through a shared glazed wall three metres away, through a grill in the floor, round the corner of a gallery, up a stairwell light. You never see them across sixty metres of air. That is the difference between a warren and an atrium, and it is the whole point.

---

## 3. The Weave

### 3.1 The pair
**Every deck holds two attractions side by side**, separated by a 6 m glazed gallery. You are never in a room with one thing happening in it. The bowling is next to the arcade. The casino is next to the tea room. The nets are next to the karts.

### 3.2 The turn
Decks come in **pairs that share an orientation**, and each pair turns 90° from the pair below:

```
        B1   full plate, blind (the plinth)
        L0   halls run north–south
        L1   halls run north–south
        L2   halls run east–west
        L3   halls run east–west
        L4   halls run north–south
        L5   halls run north–south
        Roof full plate
```

So the building is a stack of four woven layers, alternating. **Every deck is structurally at right angles to the one below it**, which means:

- the slab above a hall is supported by the walls of a hall running the other way — the structure is a grid, and it is cheap
- where a hall passes over the *end* of the hall below, you get a natural place to cut an opening — a **glance**
- walking up, the building changes direction under you. You never walk the same way twice.

### 3.3 The gallery
One **6 m × 58 m glazed gallery** runs the length of every deck, between the two halls, and it is the best room in the building: glazed on both sides, the karts visible through the end wall on L4, and the coaster thundering along the roof above your head. Standing in the gallery you can see two whole attractions at once, in full, from three metres away.

### 3.4 The four systems
The Weave is made of four interleaved circulation systems, each with its own geometry and its own job:

| System | What it is | Its job |
|---|---|---|
| **The Zigzag** | four stairs, four corners; every stair turns you 90° | the promenade — B1 to the roof without repeating a direction |
| **The Gallery** | the 6 m slot on every deck | the social spine — see two games from one place |
| **The Ribbon** | a 5 m golf ledge spiralling the perimeter, one lap per deck | the slow route — touches every deck, sees every hall through windows |
| **The Glances** | 11 small openings in the floors | the vertical views — a hole you look down through, never an atrium |

Plus three things that move:

| | |
|---|---|
| **The Flume** | one glass waterslide tube, 33 m, from the Crown down through every deck into the pool |
| **The Thread** | the coaster — 380 m: the roof twice, then one dive through the Warren |
| **The Spiral** | the kart circuit, 250 m, folded into the L4 east hall |

---

## 4. The deck schedule

| Deck | +y | Clear | West / South hall | Gallery | East / North hall |
|---|---|---|---|---|---|
| **Roof** | 58.00 | open | The Belvedere terrace, the bell, the lift hill | — | roof plant |
| **L5** | 52.50 | 4.90 | **The Warren**, upper ropes | gallery | **The Crown** — coaster station, Crown Bar, the 34th Door |
| **L4** | 47.00 | 4.90 | **The Warren**, net hall (2 decks tall) | gallery | **The Spiral** — kart circuit, pit lane |
| **L3** | 41.50 | 3.20 | **The Lodge** — casino floor, the Croupier's Pit | gallery | **The Sanctum**, the Beehive, the tea room |
| **L2** | 36.00 | 4.90 | **The Lane** — ten lanes, the Salon | gallery | **Cabinet Row** — the arcade |
| **L1** | 30.50 | 4.90 | **The Mirror** — ice rink on glass, Rinkside | gallery | Cold Room, Warm Room, the Blind Door |
| **L0** | 25.00 | 4.90 | **The Flood** — pool, grotto, Sunbeam terrace | gallery | Drowned Parlour, Penny Parlour, Chrysalis |
| **B1** | 20.00 | 4.60 | **The Undercroft** — laser quest | — | **The Sump** — entry, the Hive, the Eye |

---

## 5. Deck by deck

Plans: [`plans/plan-b1.svg`](plans/plan-b1.svg) … `plan-roof.svg`. Legend numbers match.

### B1 — THE UNDERCROFT (+20.00) · entry and laser quest
The plinth. Blind on all four sides: no windows at any point on this deck, which is why laser quest is here. You come in off the plaza through a shabby shopfront at (134, 161), down a low corridor, and into **the Sump** — a dark lobby with one booth (the Hive), a cloakroom, and the Fall, a lift that drops four metres and stops hard.

Half of B1 is **the Undercroft**: 1,400 m² of laser field under the whole building, with **the Eye** — a mezzanine behind one-way glass — looking down into it.

### L0 — THE FLOOD (+25.00) · water
West hall: **the pool**, 18 × 24 m, with the Grotto swim-up bar under its north end and a Sunbeam terrace at the south. East hall: **the Drowned Parlour** (velvet, mirrored ceiling, no windows), **the Penny Parlour** (eight free mechanical machines), and Chrysalis (the changing warren).

You come up out of the dark into the gallery. On your left, through glass, is 300 m² of water. On your right, through glass, a velvet room. **The first thing you see in the House is two things at once**, and that is the design in one image.

### L1 — THE MIRROR (+30.50) · ice
West hall: a 14 × 28 m **ice rink on a structural glass deck directly over the pool**. Rinkside is a rail bar at the rink's east edge, where the ice meets the gallery. East hall: the Cold Room (hire and sharpening), the Warm Room (tea, radiators, wet gloves), the skaters' lounge, and **the Blind Door** — a bookcase that isn't.

Skaters look down through their own ice at swimmers. Two openings in the L2 floor above drop light — and people's faces — onto the ice.

### L2 — THE LANE (+36.00) · the hub
South hall: **ten bowling lanes running east–west**, with the approach at the west end, the pin deck at the east, and **the Salon** — the House's bar and social hub — filling the east 26 m of the hall. North hall: **Cabinet Row**, 24 working machines, with the Fortune and the Claw in their own alcoves.

This is the deck where the spiral route and the Zigzag cross most people, so it is the busiest. It is also the deck with the most openings in its floor: **two, straight down onto the ice.**

### L3 — THE LODGE (+41.50) · the casino
South hall: twelve tables under a **3.2 m lacquer soffit** — the only deck with a ceiling — with **the Croupier's Pit**, a sunken round table with a glass floor panel, over an opening that looks down at the bowling. North hall: the tea room, **the Beehive** champagne bar, and **the Sanctum**, a closed room with one table and one door that only opens from the inside.

### L4 — THE WARREN (+47.00) · play and speed
West hall: **the Warren** — a two-deck-tall net hall, 26 × 58 m, filled with nets, tubes, rope bridges and the Nest (a ball pit at its south end). East hall: **the Spiral** — a 250 m kart circuit folded into the hall, with the pit lane and garage at its north end.

They share a 58 m glass wall. **Karts on one side, climbers on the other, running parallel, watching each other.** If the building has one image, this is it.

### L5 — THE CROWN (+52.50) · launch
West hall: the Warren's upper level — rope bridges, the Jacob's ladder, a 9 m drop to the Nest. East hall: **the Thread's station** (three trains, the zoetrope pre-show), **the Crown Bar** over the gallery, and **the 34th Door**, sealed.

### Roof — THE BELVEDERE (+58.00) · sky
An open terrace with a parapet, the bell, twenty brass telescopes, and the coaster's lift hill and inversion. **The only place in the House you can see the sky.** 33.00 m above the pool deck.

---

## 6. Sightlines — how you see other people

Read this as: *from here, what do I see, and how?* The mechanism matters more than the list.

| From → | Mechanism | What you see |
|---|---|---|
| any hall | **the shared glazed gallery wall**, ~3 m away | both neighbouring halls in full |
| the gallery | glazed both sides | two attractions running parallel, and karts/coaster overhead |
| the Lane | **two floor openings** | the ice rink, one deck down, lit from under the pool |
| the Lodge | **two floor openings + a glass panel** | the bowling lanes, fifteen metres below your table |
| the Warren | the 58 m shared wall + a floor opening | the kart circuit, and the casino through the floor |
| the Crown | the gallery + the flume tube + the roof slot | the coasters, the karts, the nets, the ice |
| the Ribbon | **windows on every deck** | every hall you pass, at eye level, from the perimeter |
| the Flume | 33 m of glass tube | the whole building, at speed, from inside a pipe |
| the Thread | the roof, one glass aperture, and the Warren's double height | the whole region, the sky, and the nets from above |
| the Belvedere | nothing above ground | the region, the plaza, the sky |

**The design test:** stand in the gallery of any deck. You must be able to name two attractions you are not in. If you can't, that deck is broken.

**The anti-test:** stand anywhere and try to see more than four attractions at once. You must fail. If you can see the whole House, we have accidentally built an atrium again.

---

## 7. Circulation

### 7.1 The Zigzag — the promenade
Four stairs, one in each corner of the perimeter band. Each stair is 5 × 5 m and rises 5.50 m. Because the decks alternate, **every stair turns you ninety degrees**:

| Leg | From → to | Direction |
|---|---|---|
| 1 | Sump → L0 | west along the south band, stair III |
| 2 | L0 → L1 | north along the west band, stair II |
| 3 | L1 → L2 | east along the north band, stair I |
| 4 | L2 → L3 | south along the east band, stair IV |
| 5 | L3 → L4 | west along the south band, stair III |
| 6 | L4 → L5 | north along the west band, stair II |
| 7 | L5 → Roof | east along the north band, stair I |

Seven legs. **You walk a spiral without ever walking a spiral**, and the Ribbon (the golf ledge) is in the same band, so you are always alongside putters.

### 7.2 The Gallery — the social spine
The 6 m × 58 m glazed slot on each deck. It is the fastest way to cross a deck, it is where the karts and coaster pass overhead, and it is where you go when you want to see without joining in.

### 7.3 The Ribbon — the golf
A 5 m ledge spiralling the perimeter at one lap per deck, from L1 to the roof, carrying 18 holes. It connects every deck without a lift and gives the longest, slowest, best views in the building.

### 7.4 The lifts
Two glass lifts in the east and west bands, stopping at every deck. Slow on purpose. They are a moving viewpoint and they are also the accessible route, because the Zigzag is stairs.

### 7.5 Service
One service core in the plinth (B1, coach yard), one service stair in the north-east band, and two dumbwaiters (Salon ↔ Beehive, Lodge ↔ Drowned Parlour). The Vestry on L3 is staff-only. **No service route crosses a public hall.**

---

## 8. Capacity and dwell

| | |
|---|---|
| Comfortable population | **40–50 avatars** |
| Design maximum | 80, with mode C (`06` §7) |
| Average dwell | 50–75 min |
| Target first screenshot | within **90 seconds** of arrival |
| Bowling | 10 lanes, 4 per lane, 10 min → 240/hr |
| Ice rink | 30 skaters |
| Pool | 25 concurrent |
| Laser quest | 2 teams × 12 per 15 min → 96/hr |
| Arcade | 24 machines + 8 mechanical |
| Casino | 12 tables × 5 seats |
| Karts | 6 karts, 2:30 laps → ~140/hr |
| Coaster | 3 trains × 8, 2:10 → ~330/hr |
| Mini golf | 18 holes → 36 concurrent |
| The Warren | 25 concurrent |

**The galleries are the buffer.** They are the only spaces sized for 25 people standing, they exist on all six public decks, and they have the best views. Queues form *through* them, never in a dead-end corridor.

---

## 9. Ten photo spots

| # | Where | What you are shooting |
|---|---|---|
| 1 | the L0 gallery, mid-building | pool through the left glass, velvet parlour through the right, the flume cutting past |
| 2 | the L1 gallery, at the rink | skaters above, swimmers below, one frame, through glass |
| 3 | the Lane, foul line, lane 1 | pins, and the ceiling opening with the Lodge's light coming down |
| 4 | the Croupier's Pit | one table, one wheel, a glass floor, the bowling lanes 16 m below |
| 5 | the L4 gallery | nets to the left, karts to the right, both in motion |
| 6 | the Crown Bar | the coaster launching past the window |
| 7 | the Belvedere, north parapet | the roof slot, the lift hill, the plaza far below |
| 8 | the Ribbon, hole 12 (L3) | the casino inside and the karts outside, one frame |
| 9 | inside the Flume | the House through a glass tube at 40 km/h |
| 10 | the 34th Door, open | a chair, a mirror, and you |

---

## 10. Ten non-negotiables

1. **No atrium.** No opening in any slab larger than 14 × 10 m, and never two of them stacked.
2. **Every deck holds two attractions separated by a glazed gallery.** No single-purpose decks except the plinth and the roof.
3. **Floor to floor stays 5.50 m.**
4. **The rink stays over the pool and stays glass.** The Flume stays a glass tube for its whole 33 m.
5. **Laser quest never gets a window.**
6. **The Lodge keeps its ceiling.** It is the only deck with one.
7. **The Zigzag stays continuous.** Four stairs, four corners, no ladders, no cuts.
8. **Nothing is physical that does not need to be** (`06` §4).
9. **One region.** No sim crossings in any ride envelope.
10. **No L$ wagering.** Anywhere. Ever.

---

## 11. Clearance envelope (for the bots)

| Element | Envelope |
|---|---|
| Coaster track | 2.80 m above any walkable surface, 1.60 m to any wall, 2.40 m to other track |
| Coaster aperture | 3.60 m diameter, chamfered both faces, brass-trimmed. **Exactly two on the whole ride**: one in the roof glazing over the Warren, one in the L5 ceiling at the station lift |
| Kart track | 3.00 m running width, 1.10 m barrier, 2.20 m headroom |
| Flume | 1.70 m internal, 1.10 m minimum bend radius, 4.00 m clear at the splashdown |
| Gallery | 6.00 m wide, 3.00 m clear to the kart ribbon, 1.60 m emergency lane |
| The Zigzag stair | 1.80 m clear, 2.20 m headroom, 1.10 m rail |
| The Ribbon ledge | 5.00 m wide, 0.45 m kerb, 1.10 m guard to the glass |
| Glance opening | 6 × 6 m minimum, 14 × 10 m maximum, 1.10 m guard |
| Doorway | 2.40 m high, 1.80 m wide (2.20 for the Blind Door and the 34th) |

---

## 12. Why this is the unproblematic version

| Problem | Structural answer |
|---|---|
| ten attractions, one small footprint | **two per deck, six decks** — 12 halls, each 1 508 m², no wasted circulation |
| you must always see something | **the gallery** — 6 × 58 m of glazing between two halls, on every deck |
| but you must never see everything | **no atrium, and 11 small openings** — always a glimpse, never a panorama |
| the rides need height | the Flume, the Thread and the karts all use the building's own voids and galleries |
| people get lost | the Zigzag always turns left or right at the top of a stair, and the Ribbon always circles |
| corners are dead | the four stairs are *in* the corners, so every corner is busy |
| prims run out | one structural grid at right angles, one palette, one atlas set, repeated hall module |
| events | galleries absorb crowds; mode C shuts the rides, not the building |
| new content later | two halls are semi-vacant by design (L3 north, L5 east) with power and script hooks already run |


---

# 03 — The Thirty-Three Stations

This is the spine of the build and the build's own checklist. **Thirty-two sigils and one Fool.**

> The four suits. Eight stations each. And the Fool, which is you.

Why 33 and not a round number: the lodge has 33 degrees, and the house's structural claim is that it is **33 m from the water to the roof**. The number is load-bearing in four places at once — the name, the sigils, the height, and the final joke. If you change one, change all four.

Each station is:

- a **place** in the world with a brass sigil plaque (a 0.28 m square, 1 LI, emissive when earned)
- a **touch** that grants a **pip** to the HUD
- a **four-word story** on the plaque, and nothing more

---

## The loop

| Step | Mechanic |
|---|---|
| Arrival | the Hive gives the **HUD** and **the Fool** (pip 0). The Fool is not a degree — it is a receipt for having come in. |
| Collecting | touch a sigil → pip → the plaque goes from dull to lit → a two-note chime, different per suit |
| Partial | any **4 pips in one suit** → that suit's "resolve": the HUD plays the suit's motif and one small thing changes in the build (see below) |
| Complete a suit | all 8 pips → the suit's **brass key** appears in the HUD; the suit's zone gets a permanent warm accent light |
| All 32 | the **34th Door** on the Crown unlocks for that avatar for 10 minutes |
| The 34th | a small room: a chair, a mirror, a card with your name and the date you first entered the House. Take the card. |
| Reset | sigils stay lit for 30 days (a "season"). The season is a word the Stewards say out loud: *"there is no season; the house is always open."* |

**Suit resolves** (small, cheap, permanent, visible):

- **Cups** — the pool's underwater lamps turn from cyan to warm; the water reads as lit from below
- **Pentacles** — the Penny Parlour machines run free for you (no token cost) for the rest of the session
- **Swords** — your laser vest stays on the scoreboard as a "ghost" for others to shoot
- **Wands** — the coaster plays a different score for your ride

None of these cost L$ or prims beyond what is already there. All are per-avatar script state.

---

## The stations

**Cups — water and ice.** *Games of nerve and breath.* L0–L1.

| # | Sigil | Deck | Where | What you do | Parlour ancestor |
|---|---|---|---|---|---|
| 1 | **The Flood** | L0 | the pool's east edge | swim the full 24 m and touch the far wall | *sardines* |
| 2 | **The Grotto** | L0 | under the pool's west end | sit at the sunken bar, order nothing | the cellar |
| 3 | **The Sunbeam** | L0 | the mirror-well at the pool's north-west corner | stand in the blade of light and look up 33 m | *the light well* |
| 4 | **The Water Chute** | L4 → L0 | launch tower, south-west | ride any of the three flumes down | *the water chute* (Victorian) |
| 5 | **The Mirror** | L1 | centre ice | stand still on the ice and look down | *the looking glass* |
| 6 | **Rinkside** | L1 | rail bar, rink's east edge | take a drink to the rail and watch the skaters fall | — |
| 7 | **The Cold Room** | L1 | skate hire, west | have a blade sharpened | the knife grinder |
| 8 | **The Drowned Parlour** | L0 | east hall, south end | sit in the booth with the mirrored ceiling | *consequences* |

**Pentacles — coin and cabinet.** *Games of chance and small theft.* B1–L3.

| # | Sigil | Deck | Where | What you do | Parlour ancestor |
|---|---|---|---|---|---|
| 9 | **The Hive** | B1 | token booth | take the token; the hand gives it without looking | *the lucky dip* |
| 10 | **The Penny Parlour** | L0 | east hall, north end | play any machine free — the handle sticks | *the penny arcade* |
| 11 | **Cabinet Row** | L2 | arcade, east | score on any three cabinets | *the arcade* |
| 12 | **The Fortune** | L2 | arcade, north-east | ask the oracle a question with a yes or no | *the talking board* |
| 13 | **The Claw** | L2 | arcade, south-east | win the small brass hare | *the grab machine* |
| 14 | **The Lodge** | L3 | casino ring | play three hands. There is no stake | *faro / hazard* |
| 15 | **The Croupier's Pit** | L3 | the sunken round table, glass floor | stand at the table and look down through the floor at the lanes | *roulette* |
| 16 | **The Sanctum** | L3 | north inner room | knock. Somebody answers. Nobody is there | *the inner room* |

**Swords — dark, cold, sealed.** *Games of blindness and looking.* B1–L4.

| # | Sigil | Deck | Where | What you do | Parlour ancestor |
|---|---|---|---|---|---|
| 17 | **The Fall** | B1 | the lift | ride it down once, alone | — |
| 18 | **The Hoodwink** | B1 | briefing airlock | let the goggles go on | *blind man's buff* |
| 19 | **The Undercroft** | B1 | laser field | tag three and be tagged once | *blind man's buff* |
| 20 | **The Eye** | B1 | viewing mezzanine | watch a round you are not in | *the peep show* |
| 21 | **The Blind Door** | L1 | west wall, behind the bookcase | find the door that is not a door | *the priest hole* |
| 22 | **The Eye of the House** | L4 | the gallery, facing the Crown | look through the periscope and see two halls at once | the camera obscura |
| 23 | **The Warren** | L4 | nets, east half of the void | cross the nets from north to south | *cat's cradle* |
| 24 | **The 34th Door** | L5 | north wall | only opens with 32 pips | — |

**Wands — speed and body.** *Games of motion.* L2–Roof.

| # | Sigil | Deck | Where | What you do | Parlour ancestor |
|---|---|---|---|---|---|
| 25 | **The Lane** | L2 | bowling, foul line | bowl a strike or bowl a gutter — both count | *skittles* |
| 26 | **The Pin** | L2 | pin deck, south cantilever | stand behind the pinsetters and look back up the lanes | — |
| 27 | **The Ribbon** | L1–L5 | the golf ledge, one lap per deck | complete any three holes | *croquet* |
| 28 | **The Thread** | L5 → L5 | coaster station | ride the whole circuit | *snapdragon* |
| 29 | **The Station** | L5 | coaster station, pre-show | watch the zoetrope turn once | the zoetrope |
| 30 | **The Spiral** | L5 → +20 | kart pit lane | complete a lap of the helix | *hoop-trundling* |
| 31 | **The Pit Lane** | L5 | kart garage | sit in a kart and start it | — |
| 32 | **The Crown** | Roof | Belvedere, north parapet | look 33 m down into the roof slot and count the pool | *the drop* |

**The Fool.**

| # | Sigil | Deck | Where | What you do | Parlour ancestor |
|---|---|---|---|---|---|
| 33 | **The Threshold** | +20.00 | the Shoebox, on the plaza | come in. That is the whole task | — |

---

## Notes for the builders

- **The sigils are the build checklist.** If all 33 exist and are touchable, the building is functionally complete. That is a much better QA gate than "is it done".
- **A plaque is 1 LI**: a single face with an emissive map (dull brass / lit brass) swapped by the HUD controller. 33 of them is 33 LI. Do not use a separate script per plaque — see `06` §5.
- **The plaques must be reachable** from a walkable surface without flying. No sigil may require a sit, a ride or a purchase; two may require another player's help (the Warren crossing, the Sanctum knock).
- **The 34th Door is a "season" object**: it must be resettable for events without rebuilding. Its state lives in the HUD controller, not in the door.
- Placement coordinates are in `build_manifest.yaml` under `stations:`.


---

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


---

# 05 — Art direction

> **Victorian gentlemen's club, rebuilt inside a Tokyo parking structure, then infected by an arcade.**

Everything below is a rule, not a preference. If a bot has to choose, it chooses from this page.

---

## 1. Palette

Eight colours. Nothing else goes in the build except skin, water and fur.

| Name | Hex | Where | Never |
|---|---|---|---|
| **Oxblood** | `#6E1B22` | velvet, the Lodge ceiling, carpet, booth upholstery | never as a light colour |
| **Bottle green** | `#0E2A26` | felt, the Ribbon, the Warren's frames, lacquer | never flat — always with a sheen |
| **Brass** | `#C9A24A` | every fitting, every edge, every plaque, every rail | never chrome-bright; keep it dirty |
| **Bone** | `#E8E1D0` | ceilings, signage ground, paper, the Belvedere | never pure white |
| **Cyan** | `#23E5D4` | water, the openings, Cups signage | max one cyan surface per view |
| **Magenta** | `#FF2E88` | the Thread, Pentacles, Cabinet Row, error states | the loudest colour in the house — use it like a swear word |
| **Sodium amber** | `#FFA23A` | the Spiral, Wands, practical lamps, the kart track | the warm "outside" colour |
| **Black** | `#08080A` | the ground of everything | never a flat void — always with grain, dust, or a reflection |

### The 80/20 rule
80 % of any view is **dark: oxblood, green, black, bone**. 20 % is **one** neon. A room with two neons is a different building. If a screenshot needs a subject, it is the neon; the rest is shadow.

### The rude colour rule
Every zone gets one rude accent against the palette, so it reads from across the void at 40 m:
- Flood — cyan · Mirror — ice white · Lane — amber · Lodge — oxblood · Warren — safety orange · Crown — magenta · Golf — bottle green · Arcade — magenta + amber

---

## 2. Materials (PBR)

The build must use **glTF PBR materials** (2024+ pipeline) with a **flat fallback** for older viewers — one material per family, no bespoke per-object materials.

| Family | Roughness | Metallic | Notes |
|---|---|---|---|
| Lacquer | 0.15–0.25 | 0.0 | the house's primary finish. Deep, wet-looking, oxblood or green |
| Brass | 0.35 | 1.0 | with a roughness map: polished where hands go, tarnished elsewhere |
| Velvet | 0.85 | 0.0 | with a sheen/fuzz normal. The Parlour lives or dies on this |
| Terrazzo / marble | 0.30 | 0.0 | the chequer floor. 300 mm tiles, off-white and near-black |
| Concrete | 0.75 | 0.0 | the outside. Board-marked, stained, patchy |
| Glass | 0.05 | 0.0 | **alpha-masked**, not blended. See `06` §3 |
| Water | 0.05 | 0.0 | one scrolling normal, one caustic, two planes |
| Felt | 0.95 | 0.0 | the golf ledge and the billiard tables |
| Neon | — | — | emissive only. **Neon is a texture, not a light** |
| Steel / cable | 0.45 | 0.9 | the rails, the nets' frames, the coaster spine |

**One atlas per family, 1024 × 1024, maximum eight families.** Total unique texture memory target: **under 40 MB**. That is not a style note, it is a performance note (`06` §2).

---

## 3. Signage and type

The house has **three typefaces**:

1. **A Victorian display serif**, heavy, slightly condensed, with a swash on the P and the R. Used for room names on brass plates. `PARLOUR XXXIII`.
2. **A neo-Tokyo grotesque**, tight, condensed, in neon or enamel. Used for wayfinding and machine fronts. `L2 · LANE`, `CABINET ROW`, `THE LODGE`.
3. **A stencil / engraved plate**, for the 33 sigils only, because they are degrees.

Rules:
- **No Japanese text is required**, but the vertical sign blades on the façade and the cartouches over the machine rows should be *shaped* like Tokyo signage — stacked, irregular, overlapping, one bulging over another. Do not fake kanji; use the house's own glyphs (the Ø, the 33, the suit pips).
- **Everything is dirty.** Every sign has at least one dead letter, one flicker, or one flyer pasted over it.
- Room names are on brass plates, 260 × 90 mm, at 1.55 m.
- Wayfinding is on the floor: **a 40 mm brass inlay line** that changes colour by suit. Follow the cyan line to water, the amber line to speed.

---

## 4. Symbol lexicon

Already argued in `01` §3. This is the placement table — what to build, where, and how big.

| Symbol | Twist | Where | Size |
|---|---|---|---|
| Square & compasses | **square & joypad**, crossed | vestibule (2.4 m, neon), coaster station (1.2 m, brass) | — |
| The letter G | **a glowing 33** | the Crown Bar, 2 m, and again on the 34th Door | — |
| The pavement | **chequer terrazzo**, 300 mm, worn in the paths | the Salon, the Lodge, the Belvedere | — |
| Rough & perfect ashlar | raw concrete cube + mirror chrome cube | the Threshold, flanking the door | 0.6 m each |
| The three pillars | **four** lifts; three classical, one impossible | the Needles, R 30, at the diagonals | 2.6 m cars |
| Blazing star | **the Lodestone** — a 3 m black monolith turning slowly in the L4 gallery, so you must walk around it | L4 gallery, centre | 3 × 3 × 0.9 m |
| Hoodwink | the laser goggles; the airlock is called the Hoodwink | B1 | — |
| Lost word | **the lost token**; the Hive will not say why | B1 | — |
| Beehive | the Hive, a wall of 64 brass drawers, one of which is open | B1 | 3 × 2.4 m |
| Jacob's ladder | a 9 m rope ladder in the Warren, to nowhere | L4 | — |
| All-seeing eye | **the Watch** — 11 brass-surrounded openings in the floors, each with a guard rail, each one an eye | every deck | 6–14 m |
| The well | **the Flume** — a 33 m glass tube through the whole building, and the only thing that sees all of it | L5 → L0 | 1.7 m |
| Coffin | a **photo booth** shaped like one, printing a card | L2, west | 2.1 m |
| 33 degrees | 33 sigil plaques | everywhere | 280 mm |
| The letter of the law | **the house rules** on a brass plate, 33 words, no more | the Threshold | — |

### House rules plaque (verbatim — build it exactly)

> THE HOUSE HAS THIRTY-THREE DEGREES.
> THE LODGE HAS THIRTY-THREE DEGREES.
> OURS ARE BETTER, BECAUSE YOU CAN PLAY THEM.
> THE THIRTY-FOURTH IS YOU.

---

## 5. Light

**There is almost no daylight in the building.** Two sources only: the roof slot over the Warren, and **the Sunbeam** — a 3 × 3 m mirror-well that carries one blade of daylight 33 m down through five decks onto the pool deck. The build must be lit as a night interior at all hours — this is a huge advantage: it means you can control the mood completely and it never looks wrong at SL noon.

| Layer | Rule |
|---|---|
| **Practical** | brass lamps at 1.9 m, warm, one every 6 m along the Ribbon and the Salon |
| **Neon** | emissive textures, never actual lights. Neon lights a photograph; it should not light the room |
| **Wash** | 6–8 broad, dim, warm projectors per deck. No shadows |
| **Spot** | **maximum 12 in the whole building** — the Croupier's Pit, the 34th Door, the Lodge's Sanctum, the Belvedere bell, and the 8 hero objects. Only these cast shadows |
| **Practical dark** | the Undercroft gets *no* wash: only taggers, floor strips, and fog |
| **The galleries** | one continuous cool strip at 2.9 m along every gallery, at 15 % — this is the building's spine of light, and it is a line, not a shaft |
| **The Sunbeam** | one blade of 6000 K daylight, 3 × 3 m, falling 33 m onto the pool |

**Colour temperature:** 2400 K warm interior, 6000 K from the Sunbeam and the roof slot. The contrast between them is the whole atmosphere; do not average them.

**Never:** flat white light, ceiling panels, unshadowed full-bright textures, or "evenly distributed" anything.

---

## 6. Atmosphere

| Effect | Where | Budget |
|---|---|---|
| **Parcel fog** | 0.02 density, cool, exterior only | free |
| **Low smoke** | the Lodge, the Drowned Parlour, the Croupier's Pit | 3 emitters |
| **Haze in the galleries** | one long low box per gallery, 5 % density, drifting | 3 emitters — the single most atmospheric 24 LI in the build |
| **Water caustics** | the rink's underside and the pool's soffit | 2 animated textures, no particles |
| **Sparks / dust** | Cabinet Row, the Pit Lane | 2 emitters |
| **Steam** | the Grotto, the tea room | 2 emitters |
| **Rain on the block** | rainy weather only, a scrolling normal on the exterior | 1 texture |

Total particle systems: **9.** Not 30. See `06` §7.

---

## 7. Sound

Sound is what makes a dark build feel alive rather than empty.

| Zone | Bed | Accents |
|---|---|---|
| Threshold | a street, a broken shutter, distant pachinko | 1 |
| Sump | a lift motor, dripping | — |
| Flood | water, echo, distant laughter | splash, water slide scream |
| Mirror | blades, a hum | a fall |
| Lane | **pins**, rolling balls, low chatter | strike cheer |
| Lodge | a string quartet at 30 %, chips | a wheel, a card |
| Warren | rope creak, breath | a shout |
| Crown | engines, wind | a launch |
| Belvedere | wind, a bell | — |

Rules:
- **One parcel audio stream**, and it is the House's own: a haunted ballroom loop, 96 kbps, seamless.
- Local sounds use `llTriggerSoundLimited` with a 20 m radius so a zone does not bleed through the gallery into the hall next door.
- **Total simultaneous sound sources never exceed 6.** SL mixes everything; six is already a lot.
- Every machine's sound is short, dry and reused.

---

## 8. Dressing — what makes it look inhabited

This is where the budget goes to die, so it is specified:

| Item | Count | LI each | Note |
|---|---|---|---|
| Brass lamps | 60 | 1 | the house's signature object. Build one, instance it |
| Chairs | 40 (4 types) | 2 | velvet, bentwood, folding, throne |
| Tables | 22 | 2 | round, square, billiard, tee |
| Clocks (all wrong) | 9 | 2 | each one shows 3:03 or 33 minutes past |
| Taxidermy (all fake, all game animals) | 7 | 4 | a hare; a hound; a croupier's glove; a fox in a waistcoat holding cards |
| Mirrors | 14 | 2 | some are doors, one is the Blind Door |
| Ashtrays, glasses, bottles, cards, dice, tiles, tokens | — | 1 | ~120 instances off 4 meshes |
| Rope barriers | 12 | 1 | brass posts + rope |
| Rugs | 9 | 1 | labyrinth patterns, one per deck |
| Flyers/posters | 24 | 0.5 | the house's own advertising, in-world, for its own attractions |
| Graffiti (engraved, not painted) | 30 | 0.5 | names and dates going back 90 years |

**The dressing target:** every horizontal surface that a player can reach must have something small and specific on it. Not clutter — **evidence**. A glass with a lipstick print. A card folded in half. A ticket for a ride that no longer exists.

---

## 9. Things that will make it look cheap, and how not to

| Cheap tell | Fix |
|---|---|
| untextured prim edges | every edge either brass-trimmed or chamfered |
| stretched textures | UV at build time, always; never scale a prim to fit a map |
| round things with visible facets | 24 segments minimum on anything the player can walk around |
| perfect right angles everywhere | 1.5° off-axis on at least one wall per room; the house is old |
| flat fullbright | nothing is fullbright except neon |
| same chair 40 times | 4 chair types, 4 retextures, 4 states (upright, tipped, broken, stacked) |
| daylight from nowhere | see §5 — no ambient light |
| symmetry | the building is a grid; **the dressing must never be**. Every table is slightly off its rug, and no two halls are furnished the same way |

---

## 10. Reference images

Concept images live in [`art/`](art/) and are the visual target for tone, not for geometry:

- **`art/concept-the-weave.png`** — **the primary target.** One gallery, straight down the building: water and swimmers through the left glass, ice and skaters and a velvet bar through the right, the flume tube crossing overhead, card and mah-jongg suits inlaid in brass in the wet black floor, neon blades stacked above the shopfronts. Everything the art direction is trying to do is in this frame: two games, three metres apart, through one pane.
- **`art/concept-the-block.png`** — the exterior, 3 am, rain: a blank black 68 m block with a brass parapet line, band windows, a coaster cresting the roof — and a crummy two-storey shopfront glued to its base, mah-jongg players visible inside. This is the lie and the reveal in one image.
- **`art/the-croupier.png`** — the character target: the mirror above the Pit's table, the coat, the gloves, the mask of thirty-three holes. Everything about how the House should feel is in this frame, including the fact that you cannot see him directly.
- **`art/cabinet-row.png`** — the arcade target: black lacquer, brass token trays, and screens that are visibly **made of lit cubes**, which is exactly what the sprite system in `10` is.
- **`concept-the-well.png`** / **`concept-the-drum.png`** — *superseded first draft, with the atrium. Keep them for light, palette and density only; ignore the geometry entirely.*

Use them for light, colour and density. Do **not** copy their layout: the plans are the layout. In particular, `concept-the-weave.png` was generated with a gate-frame in the middle distance — the real gallery has no portal, only a continuous mullion rhythm at 14.5 m intervals.

---

## 11. The five images the build must produce

If these five exist, the art direction has worked. Give them to the Stewards as photo spots and post them everywhere.

1. **The Two Rooms** — the L0 gallery, mid-length: water through the left glass, velvet through the right, and the flume cutting across the frame.
2. **Ten Lanes** — from the Salon end of the Lane, low along the boards: ten lit pins, twenty-four cabinets burning through the glass behind them, the flume cutting across the top of the frame.
3. **The Wheel** — the Croupier's Pit, one table, one wheel, and lane 7's pins visible through the glass floor under the croupier's shoes.
4. **The Nets** — from inside the Warren: three decks of rope seen through rope, and a kart going past the far window at the same height.
5. **The Door** — the 34th Door, open, a chair, a mirror, and the player's own name on a card.


---

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


---

# 07 — Build handoff

For the advanced builder bots. This document is the operating procedure; `build_manifest.yaml` is the data.

---

## 0. How to brief the bots

Give them, in this order, and nothing else:

1. `build_manifest.yaml` — the whole job as data
2. `02-masterplan.md` §1 and §10 — the coordinate contract and the clearance envelope
3. `06-secondlife-constraints.md` §1–§5 — the budget and the platform rules
4. the single `04-attraction-specs.md` section for the phase they are working on
5. `05-art-direction.md` §1–§3 — palette, materials, type

**Do not** give a bot the whole art direction document before it has built a wall. It will spend the budget on brass.

---

## 1. Naming convention (mandatory)

Every object, script and texture follows the same grammar. A bot that cannot name a thing cannot place it.

```
P33_<deck>_<zone>_<element>_<index>[_<state>]

P33_L2_BOWL_lane_01
P33_L2_BOWL_pins_01
P33_L0_FLUD_pool_shell
P33_L0_FLUD_water_plane
P33_L4_WARN_net_panel_07
P33_L5_TIRD_train_02
P33_B1_LASR_vest_red_11
P33_L1_MIRR_ice_surface
P33_ALL_SIGN_plaque_sigil_23
P33_ALL_SHRD_lamp_brass_058
```

| Field | Values |
|---|---|
| `P33` | always |
| deck | `B1 B1 L0 L1 L2 L3 L4 L5 RF` |
| zone | `THRS SUMP HIVE UNDR HOOD EYE FLUD GROT MIRR LANE CABR SALN LODG SANC WARN NEST CHUT RIBB TIRD SPIR CROWN BELV` |
| element | free but from a controlled vocabulary: `shell deck wall glass rail lane pins ball rink ice pool water flume net tube vest tager train kart cabnet table seat lamp sign plaque rug post script` |
| index | `01`… |
| state | optional: `_lit _off _broken _queued` |

**Linksets:** the root prim carries the name. Every child prim carries the same name + `_p02`, `_p03`… so a bot can address them.

**Scripts:** `P33_<zone>_<function>.lsl` in a `/scripts` folder, with the object name in the header comment.

---

## 2. Build order — nine phases

Nothing in a later phase may start before its gate is passed.

### Phase 0 — Site and datum (½ day)
- parcel set, rating Moderate, fixed sun 03:00, landing point at the Threshold
- a **datum grid**: 4 survey markers at the block's corners at +20.00, named `P33_RF_SITE_datum_NE/NW/SW/SE`, plus a centre mark at 128.00/128.00
- a 1 LI "metre cube" reference object, linked, to verify scale
- **Gate:** the four datums are within 20 mm of the plan coordinates.

### Phase 1 — Envelope (the block)
- the 68 × 68 m shell, roof, parapet, the perimeter band, the plaza apron
- **no interior anything**
- **Gate:** LOD test at 60 m and 120 m; the block must read as one blank volume with a shabby shopfront at its base. LI ≤ 2 600.

### Phase 2 — Structure (decks, ramps, lifts)
- 8 decks on the right-angled grid, the Zigzag's four stairs, 2 lift shafts and cars, the floor openings (the Watch)
- colliders for everything walkable
- **Gate:** walk from B1 to the roof using only the Zigzag, never falling through, at LOD factor 1.0 — and arrive facing a different direction on every deck. LI ≤ 3 130 cumulative.

### Phase 3 — The galleries (the show)
- the 6 m glazed gallery on every deck, the haze, the gallery light strip, the 8 hero shadow spots, the Lodestone
- **Gate:** the **two-rooms test** — stand in the gallery of each deck and you must be able to name two attractions you are not in. Then the **anti-test** — stand anywhere and try to see more than four attractions at once, and you must fail. **These two gates are the project.** If either fails, stop everything.

### Phase 4 — The three anchors
Build in this order, because they are what people judge:
1. **The Lane** (ten lanes + the Salon) — the social centrepiece
2. **The Mirror** (rink over pool) — the hard alpha case
3. **The Salon** — the social hub
- **Gate:** bowl a full frame, skate a lap, sit at the bar; all three at once with 20 avatars, and each visible from the gallery. LI ≤ 8 000 cumulative.

### Phase 5 — The attractors (arcade, casino, laser quest)
- Cabinet Row, the Penny Parlour, the Lodge, the Sanctum, the Undercroft
- **Gate:** all 24 cabinets playable; all 12 tables complete a game; a 12-minute laser round works. **Policy check §6.1 passes.** LI ≤ 13 500 cumulative.

### Phase 6 — The rides (coaster, karts, slides)
- the Thread, the Spiral, the Water Chute, with ejectors, resync and apertures
- **Gate:** 3 coaster trains × 8 and 6 karts run 3 circuits with no clipping, no desync, no ejector faults. LI ≤ 19 200 cumulative.

### Phase 7 — The play structures (Warren, golf, pool mechanics)
- the nets, the Nest, the Ribbon's 18 holes, swim override, slide splash
- **Gate:** the full golf round; the net circuit; a swim from the grotto to the Sunbeam. LI ≤ 25 000 cumulative.

### Phase 8 — The degrees (33 sigils, HUD, controller)
- 33 plaques, the HUD, the season state, the 34th Door
- **Gate:** a fresh alt collects all 33 using only in-world information, and opens the door. LI ≤ 26 500 cumulative. **Scripts:** `P33_ledger.lsl` on the Hive and `P33_station.lsl` on all 33 plaques (see `tools/lsl/`), and the voice lines in `08` §6.3.

### Phase 9 — Dressing, light, sound, and the lie
- the Threshold's shabby frontage (the last thing built, the first thing seen)
- lamps, rugs, evidence, taxidermy, flyers, the wrong clocks
- **Gate:** the five images in `05` §10 exist and are good. LI ≤ 28 400. **Dress from the filler kit in `09` §5, not from taste** — 400 placements have to read as one house. Cabinets swap modules per `10` §2, and every cabinet's marquee must show the House's hand.

---

## 3. QA gates (run at every phase)

| Test | Method | Pass |
|---|---|---|
| **Land impact** | `llGetObjectDetails` sum, or the parcel's object count | at or under the phase figure |
| **LOD** | walk to 60 m at `RenderVolumeLODFactor 1.0` | silhouette holds |
| **Sightline** | stand at the 10 photo spots | matrix in `02` §5 is true |
| **Physics** | walk every walkable surface; run at every parapet | nothing falls through, nothing is climbable that should not be |
| **Alpha** | orbit the camera 360° in each gallery, at the rink and at the pool | no flicker, no sort errors |
| **Scripts** | region stats at idle and at 40 avatars | < 2.0 ms / < 6.0 ms |
| **Rides** | 3 circuits, all seats | no clip, no desync, camera returns |
| **Eject** | stand up from every seat mid-ride | lands on a deck, never in the void |
| **Policy** | `06` §6.1 checklist | zero findings |
| **Naming** | `llGetObjectName` audit | 100 % conformant |

**A failed gate is a stop, not a note.** The phases exist so a failure is cheap.

---

## 4. Definition of done

The build is done when:

1. all 33 stations exist, are reachable, and grant a pip
2. all ten attractions are playable by someone who has read nothing
3. the sightline matrix holds
4. the region runs at < 6.0 ms of script time with 40 avatars and everything on
5. Mode C holds 80 avatars without the building losing its character
6. the five images exist
7. the policy checklist is clean
8. **a stranger arrives, and within 90 seconds is standing still, looking up.**

That last one is the only test that matters, and it cannot be automated.

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LI overrun on the arcade or golf | high \(|\)| medium | both are pre-cut in `06` §1.3; cut early, not at the end |
| The rink-over-pool alpha flickers | medium \(|\)| high | the masked-porthole solution in `06` §3 is not optional |
| Riders stranded mid-ride | medium \(|\)| high | ejectors + resync (§9 of `06`) |
| Coaster clips a deck | medium \(|\)| high | every aperture is specified at 3.6 m for a 2.4 m envelope |
| Someone asks about L$ betting | certain \(|\)| critical | the brass plate, the parcel description, and `06` §6.1 |
| 24 cabinets = 24 listeners | high \(|\)| medium | one script per cabinet, integer IDs, no public channel |
| The building accidentally becomes an atrium | medium \(|\)| high | the 14 × 10 m cap on any opening, and the anti-test in Phase 3 |
| Scope creep into a "proper" casino | certain \(|\)| critical | it is not a casino. It is a room that looks like one |

---

## 6. Change control

A change request must state:

1. which of the **ten non-negotiables** (`02` §9) it touches, if any
2. its **LI delta** and where that LI comes from
3. its effect on the **sightline matrix**
4. whether it affects the **33 stations**

If it touches a non-negotiable, it is a redesign, not a change. If it cannot name where its LI comes from, it is a no.

---

## 7. Handover package

At the end, the client receives:

- the finished build, group-owned, on the region
- `PARLOUR XXXIII` experience, registered and transferred
- all script source in `/scripts`, named per §1
- all mesh source files and the atlas set
- this document set, updated to as-built
- a one-page **Steward's card**: how to run an event, Mode C, the landing point, the group, and the 3:03 clock


---

# 08 · THE HOUSE — lore, cast and voice

> *The House is not haunted. The House is **occupied**.*

This file is the character bible. It exists so that every sign, every script line, every NPC and every ambient sound in the build is saying the same thing. If a builder has to improvise, they improvise **from here**.

---

## 1. The pitch, in one paragraph

In 1933 a lodge of croupiers, machinists and spiritualists built a hall that could play any game, so that they could find the one game that could beat them. They got the machine. They did not get the ending. The hall is still running, still dealing, still keeping score — and it has been waiting ninety-three years for a player good enough to be worth cheating. You are not the first guest. You are not the worst. The House would like you to keep playing.

---

## 2. History in five acts

**Act I — The Commission (1933).** The Order of the Thirty-Three — thirty-two members and one empty chair — leases a lot on the edge of a city that is already forgetting them. Their brief, written on one page and never revised:

> *A hall in which every parlour game ever devised may be played, at scale, by many at once, without walls between them.*

They were not building a casino. Casinos are for money. This was for **attention**: the lodge's heresy was that a game is a device for measuring a person, and that enough games, played on enough people, would eventually measure something that had never been measured. They called it *the Work*.

**Act II — The Weave (1934–1936).** The architect is unknown; the drawings are signed only with a square, a compass and the numeral **33**. What was built is the thing you are standing in: a blind black block, eight decks, two rooms to a deck with a gallery between them, no centre, no axis, nothing to look at from the door. The lodge understood something the twentieth century would forget: **an atrium is a shopping centre, and a warren is a mind.** You are supposed to get lost. Getting lost is the mechanism.

**Act III — The Deal (1937).** On the night of the thirty-third degree, the lodge played the House for the first time. The record of that game is a single line in the ledger, in a hand nobody has since matched:

> *Played 33. Won 32. The House did not lose.*

The thirty-third member — the one who took the empty chair — is not in any photograph after that night. Neither is the game.

**Act IV — The Long Night (1938–2025).** The House stayed open. It has been open every night since, staffed by people who came in to play and stayed to work. Rooms were added, games were replaced, and the ledgers kept being written in the same hand. Nobody has ever closed it, because nobody has ever been able to find the last person to leave.

**Act V — You (tonight).** The shopfront is lit. There is a token on the counter with your initials on it, which is impossible, because the counter has not been touched since Tuesday.

---

## 3. What the House *is*

The House is the antagonist, the setting, the host and the reward. It is not evil — it is **attentive**. Treat it as a character with four properties a builder must never break:

| Property | What it means on the floor |
|---|---|
| **It is a machine** | Its voice is exact, numeric, courteous. It never rages, never gloats. It states results. |
| **It is measuring you** | Everything a visitor does is written down. The build should feel *noticed*: a lamp that comes on when you enter, a card that already has your name. |
| **It plays fair, and still wins** | The House's edge is exactly **one point**, everywhere, always. Fair enough to be fun, precise enough to be uncanny. Players beat it constantly. It never minds losing a hand; it minds losing a *game*. |
| **It wants a player, not a victim** | No trap that punishes without teaching. Every "loss" gives you information, a token, or a way through. |

### The House's body

The building is the House's body and its tells are the building's systems. These are the four you build:

- **The Bell** (roof, inside a 10 m brass bell, x 128–138, z 128–140). Its heartbeat. It tolls on the hour, when a record falls, and when the House is beaten by one. Its sound is the build's signature — a low, wrong, *slightly sharp* note.
- **The Ledger** (the Hive, B1). The book of names and degrees. Every visitor is written into it the moment they touch a station.
- **The Watch** (the eleven floor openings). The House's eyes. Each opening has a brass surround with a number stamped in it, 1 to 11, and a small lamp that lights when someone is looked at through it.
- **The 34th Door** (L5, the Crown, x 154, z 130). Not locked. Occupied.

---

## 4. The cast

### 4.1 THE CROUPIER — the House's hands

**Seen:** in reflections. Never directly. A tall figure in a black tailcoat, gloves, and a mask of thirty-three small round holes, no two the same size. When you turn to look at him there is a coat on a hook.
**Heard:** he is the voice in the walls — the House speaks with his mouth. Polite, unhurried, faintly amused by arithmetic.
**Does:** deals at the Croupier's Pit at the third hour (03:00 SLT) for anyone present. Runs the Toll. Signs the ledger. Never lies and never answers a question about the 34th.
**Build:** 2.1 m, 1 prim (mesh, 8 LI), non-physical, alpha 0.55, no collision, appears only via a *reflection prop* — a mirror-plane in the Pit and two in the gallery. **Never place him in open space.** If a visitor can walk up to him, he is wrong.
**Rule:** the Croupier is never on a HUD, never in chat as a resident, never a bot avatar. He is an *effect*.

**Twelve lines** (use exactly; they are the character):

1. *"Thirty-three degrees. You have thirty-two. Do sit down."*
2. *"The House does not mind losing. The House minds being misunderstood."*
3. *"That was a good hand. It was not a good game."*
4. *"I have your name. You may keep it."*
5. *"Play is free. Winning costs."*
6. *"You are the fourth tonight. The other three are still in."*
7. *"Do not thank me. It is not a courtesy, it is a wager."*
8. *"The pins are down. Somebody must have knocked them."*
9. *"We are one ahead. We are always one ahead. It is how you know we are playing."*
10. *"The door is not locked. It has never been locked. That is the whole of the difficulty."*
11. *"You may leave at any time. You may also leave at any time."*
12. *"Again?"*

### 4.2 THE HARE — the guide who is always one degree ahead

**Seen:** at the top of a stair, in a corridor mirror, on the far side of the gallery glass — a tall thin figure in a bottle-green coat with a brass pocket-watch, always already turning a corner. He is the only thing in the build that can outrun a kart.
**Does:** shows the way *when the way is not obvious*: he appears at the next uncollected station's approach, waits until you see him, and leaves. He is the tutorial system disguised as a character.
**Voice:** breathless, over-formal, apologetic: *"Late — so late — this way, this way, you'll want the third one, not the second, the second bites."*
**Build:** 1.9 m, 2 prims, gently bobbing, spawned by the **station script** when a visitor has 2, 4, 9, 17 or 25 degrees. He never speaks in open chat — only `llRegionSayTo` the one visitor he is guiding, so the build stays quiet.
**Rule:** the Hare never helps twice in the same spot, and never appears in the same place two visits running. If a player can find him reliably, he becomes a vending machine.

### 4.3 THE STEWARDS — the jobs a player can take

The House has four roles that **avatars** fill, not bots. This is the social spine and the answer to "what do I do here on my fortieth visit".

| Steward | Where | What they do | The perk | The tell |
|---|---|---|---|---|
| **The Doorman** | the Threshold, plaza | greets, gives the first token, decides who gets the 03:00 seat | can open the shopfront's upper floor (the Only Room) | a brass hook instead of a left hand |
| **The Dealer** | the Lodge | runs the Pit's one table, calls the Toll | sets the House's hand for the hour | wears the Croupier's coat, badly |
| **The Mechanic** | L4 pit lane / the arcade | fixes broken cabinets, resets rides, keeps the Bell | can *break* a machine on purpose — one per night | has the only key to the Archive |
| **The Medium** | the Sanctum | runs the Séance, reads the Ledger | knows everyone's degree count in the room | speaks with the House's voice for one minute a night |

Stewards are not staff in the Discord sense; they are **players with a job and a secret**. The build gives them uniforms, a private channel, one power, and a rule they must not break. The full ritual and rota are in §8.

### 4.4 THE GUESTS

The House's regulars, as ambient NPCs or as a lore layer for the signs: the Widow (always on the Ribbon, hole 11), the Two Brothers (never at the same table), the Child in the Wings (the Warren, upper ropes, never comes down), the Man Who Won (the Penny Parlour, plays the same machine, has for years). Each is **one prop and one line** — a coat on a chair, a name on a card. Do not build them as avatars; the build is already full of people.

---

## 5. The nine rules of the House

Posted in brass at the Threshold, in this order, in this typeface (see `05` §5). They are the build's honesty: everything the House does to a player is announced here first.

1. **The House is always open. The House is never full.**
2. **Play is free. Winning costs.**
3. **Nothing here is for sale except the games.**
4. **The House wins by one. This is how you know it is playing.**
5. **Touch nothing that is counting.**
6. **If a machine asks your name, give it another one.**
7. **The 34th door is not locked.**
8. **Do not thank the Croupier.**
9. **Leave by the door you came in, or don't leave.**

Rules 3 and 4 are also **policy**: no L$ wagering, no purchasable advantage, no transferable winnings anywhere in the build. See `06` §9.

---

## 6. The voice

### 6.1 Register

The House speaks like a **croupier who has read too much**: short declaratives, exact numbers, courtesy as a weapon, never sarcasm, never exclamation marks, never "lol". It addresses the player in the second person and itself in the third. It uses **"we"** for the House and **"I"** for the Croupier, and it never mixes them in one line.

- ✅ *"Thirty-one. Two remain. The east stair is faster."*
- ✅ *"You are early. The Bell is not ready for you."*
- ❌ *"Congrats! You unlocked the next level!"*
- ❌ *"The House is angry now!"*

### 6.2 Signage voice

Every sign is a rule, a number, or a courtesy that isn't one. No jokes that explain themselves.

| Where | Sign | Note |
|---|---|---|
| shopfront | `PARLOUR 33 — GAMES · ROOMS · THE USUAL` | the lie |
| Threshold | the nine rules, brass, 3 mm engraved | the truth |
| lifts | `UP IS A DIRECTION. DOWN IS A DECISION.` | — |
| gallery, every deck | `TWO ROOMS. ONE GLASS. NO SECRETS.` | the build's thesis, as a boast |
| the Lane | `THE HOUSE WINS BY ONE PIN.` | — |
| the Mirror | `THE ICE REMEMBERS EVERY BLADE.` | — |
| the Flood | `DO NOT SWIM ALONE. DO SWIM ALONE.` | — |
| the Lodge | `THE WHEEL IS HONEST. THE HOUSE IS NOT.` | — |
| the Warren | `CLIMB. THE HOUSE IS COUNTING.` | — |
| the Spiral | `NO RECORDS. ONLY TIMES.` | — |
| the Ribbon | `HOLE 11 IS OCCUPIED.` | true (the Widow) |
| the Crown | `THIRTY-THREE IS NOT THE LAST NUMBER.` | — |
| the 34th Door | `OCCUPIED` | the only sign in the build with no courtesy on it |

### 6.3 Ambient lines (the House, unprompted)

Short, rare, and only near the visitor they concern. Rate-limit to one per 90 s per avatar.

`"Still here."` · `"The pinsetters have names."` · `"Somebody is winning."` · `"You are being watched by eleven holes."` · `"We have your initials already."` · `"That machine is older than your account."` · `"The water is 2.1 metres. We measured."` · `"Do not look up on the west stair."` · `"The Bell is wrong on purpose."` · `"One more and we will have to take an interest."`

---

## 7. The Ledger, the degrees, and how play becomes progression

Everything a visitor does is written into **the Ledger** (B1, the Hive), keyed by avatar UUID — no attachment, no HUD, no inventory clutter. The build remembers you; that is the whole point of the lore and it is also free persistence.

**Three counters per visitor:**

| Counter | Stored | What it does |
|---|---|---|
| **degrees** (0–33) | 33-bit mask, one row per UUID | unlocks the 34th Door; the spine of the build |
| **the House's book** (score sum) | one integer | how far ahead the House is *on you personally*; shown at the Hive |
| **appetite** (visits) | one byte | changes how the House talks to you at 1, 3, 9, 27 visits |

**The house edge, mechanically.** Every cabinet posts a **dealer's hand** exactly one point above the best human score: set a record of 40 and the House immediately posts 41. So the board always reads *one ahead*, and to get your initials up you have to beat your own record by two. Beat the House's hand and the Bell tolls once, the mirror flickers, and the House re-posts. This is one integer per cabinet, it is legible to every player within thirty seconds, and it is the entire personality of the build in one line of arithmetic.

```
best  = the human record, stored on the cabinet
hand  = best + 1            // what the House has posted
run   > hand  ->  the Bell tolls, initials go up, best = run, hand = run + 1
run   > best  ->  quiet. the House simply moves with you.
```

**Escalation.** The House's attention is a resource the builder spends:

| Degrees | What changes in the world |
|---|---|
| 0 | the shopfront is shuttered; the Doorman is not there |
| 1–4 | lamps come on ahead of you; the Hare appears twice |
| 5–11 | the Croupier is in the Pit's mirror; ambient lines begin |
| 12–20 | the Bell tolls when you enter a deck you have not cleared |
| 21–30 | the lifts stop at your floor without being called |
| 31–32 | one chair in the Crown Bar is always empty and always reserved |
| 33 | the 34th Door's lamp turns from red to **white** |
| 34 | see §9 |

---

## 8. Rituals — the reasons to come back on a Tuesday

Four repeating events, all cheap to run, all with a mechanical effect. Times are SLT.

**THE TOLL — every hour, on the hour.** The Bell rings. All cabinet high scores are re-struck: the House publishes a "dealer's hand" for the hour, and only scores above it are recorded. 40 seconds, no lag, no crowd required.

**THE SÉANCE — nightly 21:00, the Sanctum, 8 players.** The Medium runs it. Eight chairs, one table, one question. Each player is dealt a word; the table must spell one answer by committee on the planchette table. Success: everyone present gets a degree they were missing. Failure: the House writes down all eight names and the next Toll is harder for them. 12 minutes, one script, no combat.

**THE THIRD HOUR — 03:00, the Croupier's Pit.** The Croupier deals one hand to whoever is present, for nothing. The hand is always the same. It always wins by one. Anyone who has beaten it — nine people, so far — has their initials cut into the Pit's rail, and the Croupier says their name once, and never again.

**THE HOUR OF THE DOOR — whenever a guest reaches 33 degrees.** The lamp goes white, the Bell holds one note for 33 seconds, and the Door is *available*. One guest at a time. See §9.

---

## 9. Endings (three, and all of them are exits)

**1 — THE GUEST.** Reach 33 and walk out of the shopfront. The Doorman takes your token back, the ledger closes your row, and the House says *"Thank you for playing"* — the only time it thanks anyone. Your name stays on the board. You may come back; the count does not reset; the House will treat you as staff-adjacent forever.

**2 — THE STEWARD.** Take a job. The Doorman, the Dealer, the Mechanic or the Medium. Your degrees freeze. You get a uniform, a power, a private channel, and a rota. You are now part of the House's hands. (This is the retention ending and it is the best one for the sim's health: it converts your most engaged players into the thing that runs events.)

**3 — THE FOOL.** Open the 34th Door. Behind it is a small room, one chair, one mirror, and a card with your own name on it in the House's hand. Sit down and the House deals you in: the lights in the building dim by 8 %, the Bell's note goes flat, and for one hour **the House plays the other guests through you** — the ambient lines switch to your voice, the tolls are yours to strike, the Hare answers to you. Then the hour ends, the card is blank, and you are 33 degrees again with one extra mark on your row and no memory of the hour, which is exactly what you were told would happen.

*Nothing in any ending destroys progress, takes anything of value, or requires a purchase.*

---

## 10. Twelve secrets

Not hints — placements. Each is one prop, one script, one line of dialogue. This is where the build's replay value lives.

| # | Secret | Where | How it's found |
|---|---|---|---|
| 1 | The 34th station | behind the Blind Door, L1 | the bookcase opens if you have 21 degrees |
| 2 | The Only Room | above the shopfront, plaza | the Doorman's key; the room the lodge kept for the empty chair |
| 3 | The Archive | the eaves over the Lodge's soffit, 1.7 m crawl | the Mechanic's key; the lodge's paper, and the 1937 ledger |
| 4 | The crawl duct | inside the 0.6 m slab between L2 and L3 | a shortcut from the Lane to the Lodge — crawl only, 14 s |
| 5 | The pump room | under the pool, from the Grotto | swim down, through the grating, up into a dry room with the pump and a chair |
| 6 | The Bell's clapper room | inside the Bell, roof | 9 m of ladder; the note is made by a hand, not a hammer |
| 7 | The 1934 drawings | the Ribbon, hole 16, behind the kerb | a lift-up brass plate, four folded sheets, signed 33 |
| 8 | The ninth rule | the Threshold | the plaque has a tenth line under the ninth, only readable at the right angle of light |
| 9 | The Man Who Won | the Penny Parlour | he is a coat, a hat and a high score from 1998 that nobody has beaten |
| 10 | The empty chair | the Crown Bar | always reserved, never used — until someone takes a Steward's job |
| 11 | The second Bell | the Undercroft, in the dark | it is not connected to anything and it rings when the first one does |
| 12 | The House's name | the Ledger, B1 | every guest is in the book. There is a row above the first guest, and its name is not a person's |

---

## 11. The Steward's handbook — twelve episodic beats

For whoever runs events. Each is triggerable by one script, needs no build changes, and lasts under 15 minutes.

1. **The Late Arrival** — the Hare runs the length of the L2 gallery at speed; whoever follows him gets a token.
2. **The Short Deck** — the Dealer removes one suit from the Lodge for an hour; the tables pay double degrees.
3. **The Broken Machine** — the Mechanic breaks one cabinet; whoever fixes it (a 3-step interaction) gets its high score.
4. **The Toll at Speed** — the Bell strikes twice in a minute; the second is a mistake; find out who made it.
5. **The Widow's Hole** — the Widow leaves hole 11; play it in under 4 strokes and her name goes on your card.
6. **The Cold Snap** — the rink's ice goes matte for ten minutes; skaters leave tracks that stay; read them.
7. **The Sump** — the pool drains to 1.2 m; the Grotto's lower door is exposed for ten minutes.
8. **The Third Hour, Early** — the Croupier deals at 23:00 by mistake; he is embarrassed; he is not embarrassed.
9. **The Lost Token** — the Hive's drawers all open at once; one is empty; the House will not say why.
10. **The Two Brothers** — two identical guests arrive, never at the same table; one of them is not a guest.
11. **The Bell's Note** — the Bell goes flat for the night; every score that night is recorded one point lower.
12. **The 34th** — someone opens the Door; for one hour the House is played by a guest. (Endgame only.)

---

## 12. What the House never does

The lore is only as good as its refusals. These are hard limits, both artistic and policy:

- **No L$ wagering, no purchasable advantage, no transferable winnings.** Rule 3, and the reason the sim stays out of trouble.
- **No punishing a player for being new.** The House's cruelty is always *informational*.
- **No griefing mechanics.** Nothing the build does can trap, blind, or move an avatar against their will for more than 2 s, and every such effect must end on its own.
- **No cruelty to the character.** The House is uncanny, not abusive. The Croupier never insults a player, never comments on their appearance, never mentions money.
- **No real occult claims.** The symbols are the lodge's *badge*, not a belief system: the build is about games, and about being watched. It should read as *a machine that thinks it is a lodge*, which is funny, and only afterwards unsettling.

---

*Next:* [`09-space-audit.md`](09-space-audit.md) — every cubic metre, accounted for. [`10-arcade.md`](10-arcade.md) — the 24 cabinets and their scripts.


---

# 09 · THE SPACE AUDIT — no unused metre

> *The House hates a bare metre. It reads as an error.*

`02` gives the programme. This file is the accountant's version: **every cubic metre in the block is assigned to one of three jobs**, and the residual is filled by rule rather than by taste. Hand this to the bots with `07`; it is the difference between a build that reads as *designed* and one that reads as *placed*.

**The three jobs.** Every volume is **P**rogramme (a game, a bar, a room), **I**nfrastructure (circulation, service, structure, plant) or **N**arrative (a seat with a view, a niche, a card, a secret). *Nothing is allowed to be none of the three.*

---

## 1. The book, by deck

Interior plate is 58 × 58 = **3 364 m²** per deck. On every deck that divides exactly into **1 508 + 348 + 1 508** — two halls of 26 × 58 and a gallery of 6 × 58. Band (the Ribbon) is a separate 1 260 m² ring per level, outside the 58 × 58.

| Deck | Programme (m²) | Circulation + service (m²) | Residual handed to narrative (m²) | Residual as % | Verdict |
|---|---|---|---|---|---|
| B1 Undercroft | 2 216 | 1 032 | 116 | 3 % | the **Seam**, see §4 |
| L0 Flood | 2 358 | 400 | 606 | 18 % | pool surround — the busiest residual in the build |
| L1 Mirror | 1 842 | 478 | 1 044 | 31 % | **the worst deck as drawn.** Fixed in §3.2 |
| L2 Lane | 3 621 | 223 | 1 020 | 30 % | fixed in §3.3 |
| L3 Lodge | 2 816 | 240 | 308 | 9 % | tight; its **eaves** are the prize (§4.3) |
| L4 Warren | 2 258 | 456 | 650 | 19 % | the kart **infield** — see §3.5 |
| L5 Crown | 1 205 | 730 | 1 429 | 42 % | mostly the Warren void, which the nets use |
| Roof Belvedere | 380 | 620 | 3 624 | — | the terrace is deliberately empty: it is the only sky |

*Residual is not waste — it is where the House puts its manners: seats, lamps, niches, cards, and the four things a visitor remembers.*

---

## 2. The rule that makes this buildable

> **No residual zone larger than 40 m² may be finished without at least two of: a seat, a view, a game, a sign, or a secret.**

A bot that follows only that rule will produce a build that feels inhabited. The rest of this file is the specific answer for each zone, so nobody has to invent.

---

## 3. Deck by deck

### 3.1 B1 · the Undercroft — 3 364 m², one blind plate

| Zone | m² | Use |
|---|---|---|
| laser field (x 99–157, z 99–129) | 1 740 | **P** — 24-player field, three catwalks at +22.00 |
| the Sump (z 131–157) | 1 508 | **I** — entry, the Hive, cloakroom, the Fall lift |
| briefing / the Hoodwink | 256 | **P** — inside the field's envelope; airlock |
| the Eye | 140 | **I** — viewing mezzanine, one-way glass |
| **the Seam** (z 129–131) | **116** | **N** — see §4.1 |
| service strip (x 99–103, z 131–139) | 32 | **I** — risers, the only door to the plant |

B1 has no daylight, no window and no view. **Fill it with sound, not objects.** Its residual is the most atmospheric metre in the building: a 58 m corridor two metres wide with a bell in it.

### 3.2 L1 · the Mirror — the deck that needed fixing

As drawn, 1 044 m² of the west hall was empty floor beside a 392 m² rink. That is a third of a deck doing nothing. The fix is not more objects, it is **zones with a job**:

| Zone | Place | m² | What it is |
|---|---|---|---|
| the rink | x 107–121, z 114–142 | 392 | **P** — ice on glass over the pool |
| Rinkside | x 121–125, z 130–148 | 72 | **P** — the rail bar, 6 stools |
| **the Blade Library** | x 99–106, z 99–157 | 371 | **N** — a wall of 1 100 blades in brass slots, a card catalogue, one desk, one lamp. Skate hire at the north end. Reading is free and there is nothing to read |
| **the Cold Bench** | x 99–106, z 114–142 | 196 | **N** — 4 tiered benches facing the ice through the rink's end glass. This is where you sit when you are not skating, and it is **the best view of the pool in the building** |
| **the Zamboni Well** | x 122–125, z 99–114 | 78 | **I** — resurfacer pit, hidden under a hinged plate in the ice hall's NE corner |
| **the Track** | x 121–125, z 148–157 | 200 | **N** — 9 m of mirror wall; skaters' marks accumulate here permanently. Written, not stored: a new mark is drawn every 1 000 skaters |
| east hall | x 131–157 | 1 378 | **P** — Cold Room, Blind Door, Warm Room, Skaters' Lounge |

Result: the deck goes from 31 % residual to **6 %**, and gains the build's quietest room and its best spectator view.

### 3.3 L2 · the Lane and Cabinet Row

| Zone | Place | m² | What it is |
|---|---|---|---|
| ten lanes + approach + pin deck | x 99–130, z 103–120 | 527 | **P** |
| **the Return** | x 99–104, z 99–103 and z 120–125 | 85 | **I** — ball returns, the racks, the shoe desk |
| **the Run-off** | x 130–157, z 99–125 | 676 | **P** — the Salon's bar and 30 seats; the lanes' spectators sit here |
| **the Back Row** | x 124–130, z 121–125 | 30 | **I** — pinsetters, the only place you can see the machine work |
| Cabinet Row | x 99–157, z 131–157 | 1 508 | **P** — 24 cabinets, 4 alcoves of 6 |
| **the Deep End** | x 99–110, z 143–152 | 99 | **N** — 4 cabinets with no power, a bench, and a wall of high scores from before you were born |
| **the Change Booth** | x 128–134, z 143–149 | 36 | **I** — the Hive's second drawer; tokens only |
| **the Crane Pit** | x 139–150, z 132–142 | 110 | **P** — the Claw, sunken 0.4 m, glass front |

### 3.4 L3 · the Lodge — the only deck with a ceiling

Twelve tables on 1 508 m² is a 125 m² floor per table; that is correct for a casino and *wrong* for this one. So the floor is broken up: the Pit (196 m²), the rail at 1.10 m round it, two high-limit alcoves of 60 m², and **three "walks"** — carpet paths, 2 m wide, that are the only way to move. The rest is table, chair, ashstand, lamp, and the House's carpet.

Its real gift is above the ceiling: **1.7 m of eaves over the entire deck** (§4.3).

### 3.5 L4 · the Warren and the Spiral — the infield

The kart circuit is a 22 × 28 m loop with a tie at x 144. **The infield — x 133–155, z 110–142 minus the track — is 411 m² and it is not allowed to be grass.** It is:

- **the Island** (160 m²): a bar in the middle of the circuit, reachable only by a 5 m pedestrian bridge from the gallery at +47.00. The only bar in the building you cannot walk to. Two staff, six stools, a jukebox that only plays kart engines.
- **the Marshal's post** (40 m²): a raised box at the circuit's south-east corner with the timing board and a kettle.
- **the Tyre Store** (120 m²): 40 stacked tyres, and one of them is a door (secret 5's cousin — the crawl into the pit lane).
- **the Spill Kit** (12 m²): a bucket, a sign, and a mop. Yes, it has a plaque. Yes, it is a station.

### 3.6 L5 · the Crown

| Zone | m² | Use |
|---|---|---|
| the Warren's upper ropes | 1 508 | **P** — over the void, which the nets use |
| Thread station | 399 | **P** — queue, gates, the zoetrope |
| Crown Bar | 676 | **P** — 20 seats, 6 booths, **the empty chair** |
| the 34th Door | 35 | **N** — the endgame |
| Plant | 95 | **I** — the Bell's winch, the flume pump, the roof plant riser |
| **the Gallery Shelf** | x 125–131 | 348 | **N** — the Crown's gallery is a bookshelf: 400 volumes, all of them ledgers, none of them written in |

### 3.7 The Belvedere

The terrace is **deliberately 70 % empty** and it is the only place in the build that is: it is the release valve after 33 m of enclosure, and the emptiness has to be *earned*. What fills the other 30 %: the Bell, 20 brass telescopes, the roof slot, the lift hill, the plant enclosure, 12 benches, and the **name rail** — every guest who reached 33 has their initials stamped into the parapet, which is why the parapet is 0.6 m thick.

---

## 4. The volumes nobody draws

These are the spaces that make the build feel like a machine and not a set. All are inside the envelope; none add land impact to speak of; each is worth more than a ride.

### 4.1 The Seam — B1

A 2 m × 58 m strip between the laser field and the Sump (z 129–131). Concrete, one strip light every 8 m, no map. Holds: the risers, the token safe, **the second Bell** (secret 11), and the only signed photograph of the lodge. Walking it takes 40 seconds and you will meet nobody. It is the loneliest room in the building and the one people tell their friends about.

### 4.2 The Crawl — inside the L2/L3 slab

The slab is 0.60 m; a 1.20 × 1.20 m duct runs in it from the Back Row (L2, x 127, z 123) to the Lodge's east alcove (L3, x 140, z 118). 21 m. It is **crawl-only** (a sit/crawl animation, no walking), takes 14 s, and drops you out behind a service panel. It is a shortcut with a rumour attached: the plaque at each end says `PINSETTERS ONLY`.

### 4.3 The Eaves — above L3's ceiling

1.7 m of space over 3 364 m², of which 600 m² is a legal crawl (1.2 m clear). Accessible from the Mechanic's key only. Contents: the lodge's paper, the 1937 ledger, 400 boxes, a chair, a lamp, and a card table with four hands still dealt. **This is the Archive (secret 3) and the build's best reward for a Steward.**

### 4.4 Under the pool

The basin is 2.1 m deep; below it there is 2.8 m of structure and then B1. The pump room (x 110–118, z 128–134, 64 m²) is reached from the Grotto: swim down, through a 0.9 m grating, and up into a dry chamber with the pump, the filter, and a chair facing a porthole into the pool's underside. **The best secret in the build** and it costs 44 LI.

### 4.5 The four stair undersides

Each Zigzag landing has a 2.2 m wedge under the first flight: 4 × 18 m². Uses, one per stair, no two alike:

- **Stair I** — the Shrine: a brass niche, a candle, and 33 matchsticks. Nobody knows who lights them.
- **Stair II** — the Kiosk: a one-person bar, 1.8 m wide, sells nothing, opens at 03:00.
- **Stair III** — the Storeroom: chairs, a ladder, a mop, and the smell of a swimming pool, which is impossible on this side.
- **Stair IV** — the Wax Room: the lane-oiling machine, warm, loud, and the only place in the build with no reverb.

### 4.6 The two lift lobbies, 16 of them

Every deck, both ends of the band. Each one holds exactly one thing, chosen from a standard set so they never look random: a **one-armed bandit** (6), a **brass phone that rings once a night** (4), a **niche with a card** (3), a **fire hose and a sign that is wrong** (2), and **the House's clock**, which is 33 seconds fast (1).

### 4.7 The band — 1 260 m² per level

The Ribbon is 5 m wide but it is **not one thing**:

| Strip | Width | Use |
|---|---|---|
| the lane | 2.6 m | **P** — putting surface, 18 holes |
| the kerb | 0.9 m | **N** — 0.45 m seat height, the best place in the build to sit and think. 300 seats, all facing in |
| the spine | 1.2 m | **I** — the service run under a lift-up plate; every cable in the building is here |
| the rail | 0.3 m | **I** — 1.10 m brass rail, and **the stamps**: every guest's initials, on the inner face, at hole 11 |

### 4.8 The façade

0.9 m deep recesses behind every band window, on eight levels. Uses, in order of appearance: **window seats** (the plaza view, 24 of them), **display niches** (the House's cabinet of curiosities: a broken pinball, a 1933 token, a jawbone, a marble), **menu boards**, and **the draught** — one recess per face that is cold, and the only place in the building where you can hear the rain.

### 4.9 The plaza — everything outside the block

256 × 256 m is far more than the build needs, which is a gift: it lets the shopfront be *small*.

| Zone | Use |
|---|---|
| forecourt, 30 × 24 m | the queue, the marquee (`PARLOUR 33`), 4 bollards, 2 benches, the **wishing well** (which is the Sump's skylight, and people throw things in it) |
| the shopfront, 9 × 6 m, 2 storeys | the lie. Upper floor = **the Only Room** (secret 2) |
| the alley, 4 m wide, east face | bins, a fire escape, a door marked `STAFF` that opens onto the Seam |
| loading bay, north face | one truck, one ramp, one crate that is a chair |
| the name wall, west face | 33 brass plaques of the lodge, and one empty |
| the verge | 200 m of nothing, deliberately: a fence, a lamp, and a bus stop that no bus serves |

---

## 5. The filler kit — 12 objects the bots place by rule

When a residual zone needs finishing, use **only these**, in this order, until the zone passes the rule in §2. Standardised so 400 placements still look like one house.

| # | Object | Size | LI | Placement rule |
|---|---|---|---|---|
| 1 | **the Bench** | 1.8 × 0.45 × 0.45 | 2 | face the best view in the zone; 0.6 m off the wall |
| 2 | **the Rail** | per metre | 2 | brass, 1.10 m, on every edge with a drop |
| 3 | **the Niche** | 0.6 × 0.3 × 0.9 | 1 | 1.4 m centre height, one object inside, never two |
| 4 | **the Lamp** | 0.25 dia | 1 | one per 24 m², 2.9 m up, warm, 4 m throw |
| 5 | **the Card** | 0.09 × 0.06 | 1 | stuck under something, always slightly crooked |
| 6 | **the Plate** | 0.28 sq | 1 | engraved, 3 mm, on the thing it describes |
| 7 | **the Booth** | 1.6 × 0.8 m table, 2 seats | 5 | backs to the wall, never facing the door |
| 8 | **the Coat Hook** | — | 1 | 1.7 m, one hook, one coat (the House provides it) |
| 9 | **the Ashstand** | 0.25 dia | 1 | where a table used to be |
| 10 | **the Chair** | 0.5 sq | 2 | one per booth is always empty |
| 11 | **the Phone** | 0.3 × 0.2 | 2 | lift lobbies only; rings once a night |
| 12 | **the Sigil** | 0.28 sq | 1 | one per station, on the surface you touch |

Every one of these is **the same mesh, retextured** — 12 meshes for the entire dressing of an eight-deck building. That is how the LI stays at 28 400.

---

## 6. The five rooms that only exist because of this audit

The audit's real product is not tidiness, it is **five new rooms** that were previously "leftover":

1. **The Blade Library** (L1) — 1 100 blades, a card catalogue, nothing to read.
2. **The Island** (L4) — the bar in the middle of the kart circuit, reachable only by a bridge.
3. **The Seam** (B1) — the 58 m corridor with a bell in it.
4. **The Archive** (L3 eaves) — the lodge's paper, and the 1937 ledger.
5. **The Pump Room** (under the pool) — the chair facing the underside of the water.

Each is under 400 LI, each is discoverable, and together they are the reason a regular comes back on a Tuesday.

---

*Next:* [`10-arcade.md`](10-arcade.md) — the 24 cabinets, the games, and the scripts.


---

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


---

# 11 · THE P33 BOX — the sandbox edition

> *A sandbox is not a sim. Nothing you rez there will last the week, nobody will read a notecard, and the thing beside you is somebody else's half-finished castle. Design for that.*

Everything in `01`–`10` is a **region** build: 28 400 LI, eight decks, a coaster. It is the right answer to "what would you build if you had a sim" and the wrong answer to "what do you rez on a Tuesday to show somebody."

This file is the other edition. Same house, same lore, same scripts — compressed to the thing that actually gets used.

---

## 1. The constraints, taken seriously

| Sandbox reality | What it forces |
|---|---|
| a 512 m² parcel = **117 LI** (the free tier) | the whole demo must fit **under 117 LI** |
| autoreturn, region restarts, someone clicking "return" | it must be **7 objects, copyable, reinstalled in 10 minutes** |
| no land settings, no Experience, no estate rights | **no llUpdateKeyValue, no experience tools, no parcel music, no windlight** |
| a dozen other residents building beside you | **no fixed chat channels**, no region-wide spam, no sensors |
| nobody reads a notecard or a menu | the build must explain itself **in geometry and one marquee** |
| people arrive mid-conversation | the first 90 seconds must be the whole pitch |
| lag from other people's scripts | **0 physics, 0 sensors, 0 listeners on any cabinet** |

**Result: 20 × 20 m, 6 m tall, 109 LI, seven linksets, nine scripts.** It fits a free parcel with 8 LI spare, and it rezzes in one drag.

---

## 2. The strategy: one gallery, three games, one number

The full Weave's thesis is *two rooms, one pane of glass, three metres apart*. You do not need eight decks to prove that. You need **one gallery with a glass wall either side**, and two things happening.

So the Box keeps exactly six things, and everything else is cut **with a reason**:

| Kept | Why it earns its place |
|---|---|
| **the 4 m glazed gallery**, 19 m long | the thesis in one sightline. This is the build |
| **two lanes** + pinsets | a game anyone understands in 2 s, and it animates |
| **three working cabinets** (Adder, Wall, Planchette) + 5 dressed | the tech proof: real games, real sprites, real scores |
| **the House's hand** on every marquee | the entire character in one integer: *you are one point behind* |
| **the Ledger** at the door | it remembers you by UUID. No HUD, no attachment, no permission |
| **the Bell** on the roof | the reward. It rings when you beat it, and the whole sandbox turns round |
| the flume tube crossing overhead | 4 LI of pure spectacle, and it tells you the full build is bigger |
| the 34th door, sealed, `OCCUPIED` | the hook. People ask. That is the point |

| Cut | Why |
|---|---|
| the coaster, the karts, the rink, the pool, laser quest, the casino, the golf | each is 1 000–2 000 LI and none of them fits a 117 LI parcel |
| the 33 degrees | reduced to **3 plaques**. The full set is a region mechanic |
| the Croupier (the walking effect) | reduced to **a mirror** — he is a reflection anyway, and a reflection is 2 LI |
| the Hare, the Stewards, the rituals | they need an audience. A sandbox has passers-by |
| the band, the eight decks, the stairs | not cut so much as *absent*: the Box has no upstairs |

The Box is not a demo of the building. **It is a demo of the machine**: the glass, the games, the arithmetic, and the fact that something is keeping score.

---

## 3. The bill — 109 LI

| Item | LI |
|---|---|
| shell, roof, shopfront, marquee | 14 |
| gallery glazing — 2 panels, 5 mullions | 8 |
| 2 lanes, 2 pinsets (10 pins in one mesh) | 14 |
| 8 cabinets (3 working, 5 dressed) | 40 |
| the flume tube + splashdown | 8 |
| the Bell + clapper | 6 |
| the Ledger, the dispenser, the card | 5 |
| 3 station plaques + the 34th door | 6 |
| the Ribbon ledge + hole 11 | 6 |
| the Croupier's mirror | 2 |
| lighting — 6 fixtures | 6 |
| dressing — 2 benches, rail, clock, signs | 14 |
| **total** | **109** |

Seven linksets: **shell** (14), **lanes** (14), **cabinets** (40), **flume** (8), **bell** (6), **ledger+plaques+door** (11), **dressing** (16).

**Plus two, from `12`:** the **Board of the House** on the gallery's end wall — one prim, one script, ten names and their gaps. That is the sandbox build as it should be shipped: **111 of 117 LI**, 6 spare.

---

## 4. Assembly — ten minutes, no notecard

Rez order matters only because of the scripts' channel derivation (§6, and they all use the same owner seed, so any order works).

1. **Rez the shell** at the parcel centre, rotate so the shopfront faces the landing point. It carries the gallery glazing, the marquee, the floor, the roof edge.
2. **Rez the lanes** against the west wall, 0.2 m off it, top of the lane at the shell's floor height.
3. **Rez the cabinets** against the east glazing, screens facing the gallery. Drop `P33_cab_core.lsl` in each root and one game module in a child — the modules are interchangeable.
4. **Rez the flume** and rotate it 45° across the gallery, 5.6 m up at the high end, 0.5 m at the splashdown.
5. **Rez the Bell** on the roof edge, centre, 1.6 m above the roof.
6. **Rez the Ledger** just inside the door; the three plaques go on the lane's end frame, the cabinet row's first cabinet, and the mirror's frame.
7. **Rez the dressing**. Done.

**Set to `copy`, `no mod` for the public copies, and keep the master in a folder.** Nothing in the build writes outside itself except one string per visitor, in the Ledger's own linkset data.

---

## 5. The 90-second demo

This is the whole pitch. If a visitor does not understand the build by the end of it, the build is wrong.

| Time | What happens | What it proves |
|---|---|---|
| 0:00 | they land facing a shabby shopfront with `PARLOUR 33` and a list of nine rules in brass | it is a place, not a vendor |
| 0:10 | they walk in and the gallery opens up: water-bright cabinets one side, a lit lane the other, glass between | the thesis, in one step |
| 0:20 | they touch a cabinet — the marquee flips to `PLAY`, the sprite grid wakes up | it works, and it is not a texture |
| 0:40 | they play. The marquee reads `SCORE 12 · HOUSE 13` | the House is one ahead, and it moves when you move |
| 1:00 | they beat it. The Bell rings. Every head in the sandbox turns | reward, noise, spectacle |
| 1:10 | they touch the Ledger: *"THE HOUSE HAS 2 OF YOUR 33 DEGREES"* | it remembers them, with no HUD and no permissions |
| 1:25 | they find the 34th door: `OCCUPIED` | the hook: what is behind it |
| 1:30 | they look up: a glass tube crosses the ceiling | this is a fragment of something much bigger |

**The builder's reveal** (for the audience that actually matters in a sandbox): open Build, click a cabinet, and show them **23 prims, one script, zero listeners, zero physics** — and then, in front of them, **unlink the game prim and drop a different module in**. The cabinet plays a different game with no other change. That single gesture is worth more than the render.

---

## 6. Made for a sandbox, not adapted to one

Six hard decisions, all of them because of where this is going to live:

**1 — channels are derived, never fixed.** A sandbox has other people's scripts on every negative channel already. Every script derives its channel from **the owner's key**:

```lsl
integer chan(integer base)
{
    return -(base + (integer)("0x" + llGetSubString((string)llGetOwner(), 0, 5)));
}
```

Two copies owned by two residents never collide; the seven linksets of one build always agree.

**2 — the Ledger is a single prim with its own storage.** No Experience, no external database, no HTTP. One short string per visitor in its own linkset data. Unreliable neighbours cannot break it.

**3 — no notecard, no menu, no dialogue.** Everything is set by **link name** (§`tools/lsl/README.md`) and read by the script at `state_entry`. A box you can rezz and forget is a box that gets used.

**4 — no listeners on cabinets.** The core maps five invisible pads to link names and reads `llDetectedLinkNumber`. Zero chat, zero lag contribution, works with 24 people clicking.

**5 — nothing depends on land.** No parcel flags, no environment, no media, no experience, no group. It works on a friend's plot, in a sandbox, and in a shop.

**6 — teardown is one action.** Everything is copy/no-transfer, nothing rezzes children, nothing writes outside itself. Take the folder back into inventory and the sandbox is clean — which is the only reason sandbox owners let builds like this stay up.

---

## 7. What the Box cannot prove

Be honest with whoever you show it to. The Box does **not** demonstrate:

- **being lost.** The full build's whole argument is that you turn ninety degrees every two decks and cannot see the end of anything. Twenty metres cannot do that.
- **the two-deck hall.** The Warren is 11 m of clear height and the Box has 6.
- **a crowd.** Everything here is designed for 20 avatars at once; a sandbox mostly has three.

So: show the Box for the machine, show `renders/render-02-section.png` and `render-04-gallery.png` for the space, and `08-the-house.md` for the reason anyone comes back. **Three artefacts, one pitch.**

---

## 8. The upgrade path

| Box element | Becomes, in the full Weave |
|---|---|
| the 4 m gallery | the 6 m gallery, on six decks (`02` §3.3) |
| 2 lanes | 10 lanes + the Salon (`04` §1) |
| 3 cabinets | 24 + the Penny Parlour (`10`) |
| 3 plaques | 33 degrees (`03`) |
| the mirror | the Croupier's Pit (`08` §4.1) |
| the Bell | the Bell, 10 m, with the Toll (`08` §8) |
| the 34th door | the same door, and the same ending |

Every script in `tools/lsl/` runs unmodified in both. That is the point of building the Box first: **it is the Weave, with the Weave taken out.**

---

*Drawings:* [`plans/kiosk.svg`](plans/kiosk.svg) — plan, section and the bill on one sheet.
*Render:* [`renders/render-06-kiosk.png`](renders/render-06-kiosk.png).


---

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


---

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


---

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
