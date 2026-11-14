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
> The **BOX** is the sandbox edition: 20 × 20 m, **109 LI**, seven linksets, one gallery and three working
> games — see [`11-sandbox-edition.md`](11-sandbox-edition.md) and [`plans/kiosk.svg`](plans/kiosk.svg).
> Same scripts, same lore, same arithmetic; the Box is the Weave with the Weave taken out.

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
