# PARLOUR XXXIII

**A combined leisure house for Second Life — bowling, jungle gym, ice rink, laser quest, arcade, casino, karting, mini golf, rollercoaster and a pool with slides — woven into one neo-Tokyo parlour, built as a single 72 m drum around a 28 m open shaft.**

> *Thirty-three degrees. The four suits, eight stations each, and the Fool — which is you.*

| | |
|---|---|
| **Working name** | PARLOUR XXXIII (signage: `PARLOUR 33`) |
| **Alternates** | HARE & LODGE · The Gilded Warren · The Nine of Cups · Bottle Green · SNAPDRAGON |
| **Region** | one full private region, 256 × 256 m, 30 000 LI, plaza at +20.00 |
| **Building** | 72 m diameter drum, 14.00 → 60.50, eight decks, one open shaft |
| **The number** | exactly 33.00 m from the pool deck (the Flood) to the roof (the Crown) |
| **Rating** | Moderate. No L$ wagering anywhere in the build |

---

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
| [`build_manifest.yaml`](build_manifest.yaml) | the same data, machine-readable, for the build bots |
| [`plans/`](plans/) | generated SVG plans: one per deck, a long section, the stack |
| [`art/`](art/) | two concept images: `concept-the-well.png` (the interior, looking down the shaft) and `concept-the-drum.png` (the building from the plaza at 3 am) |
| [`tools/gen_plans.py`](tools/gen_plans.py) | the coordinate model. Every dimension in the docs comes from here |

Regenerate the drawings any time with:

```bash
python3 parlour-33/tools/gen_plans.py
```

The plans are **schematics**: metres, zones, circulation and sightlines. They are not prim plans. They are drawn to a single coordinate model so a bot can trust the numbers.

---

## The idea in five lines

1. **One building, not ten rooms.** A drum with a hole in the middle. All ten activities hang off that hole, so from any one of them you can see at least four of the others.
2. **The shaft is the show.** 28 m wide, open from the water to the roof. Swimmers look up 33 m and see the rollercoaster cross the void; bowlers look down 11 m and see the pool.
3. **You enter under a shabby shopfront** and drop six metres into the dark. Then you climb the degrees — every deck is a degree, and the building is the ladder.
4. **Every modern attraction is a Victorian parlour game, supersized.** Bowling is skittles. Mini golf is croquet. Laser quest is blind man's buff. The kart track is hoop-trundling. The house knows this and says so on the wall.
5. **The occult furniture is the house's joke.** Square and compasses redrawn as a cocktail glass and a joypad. The letter G replaced with a glowing 33. The lodge thinks it has the degrees; the house has thirty-four.

---

## What the build must feel like

Dark, close, cheap-lacquered, hot with neon — and then it opens into a 33 m well of water and light. It should feel like a Victorian gentlemen's club that was rebuilt inside a Tokyo parking structure and then infected by an arcade. Velvet and mahogany next to brushed steel and cable. Brass fittings that are also joysticks.

Every turn should give a framed view of another game in progress. You are never in a corridor; you are always on a balcony over something.

---

## Honest constraints up front

This programme — ten attractions plus arcade cabinets plus a coaster — wants about **31 000 LI**. One full region gives you 30 000. The budget in `06-secondlife-constraints.md` commits **28 400** and holds the rest as contingency, which means the build only works if the discipline holds:

- the drum is **mesh, low-LOD, atlased**, and shared across all decks
- nothing is physical that does not need to be
- the arcade is **24 machines, not 60**
- mini golf is **18 holes on a 5 m ledge**, not a landscaped course
- **no L$ wagering.** The casino is a design language, not a business. This is both a policy requirement and the thing that keeps the sim out of trouble

If you are on a 20 000 LI region, see the trim plan in `06`. It loses two of the three slides, half the arcade, half the golf, two bowling lanes and one laser deck — and it still works, because the shaft is free.

---

*Design package, November 2026. Numbers are in metres and Lindens-of-land-impact. Everything is schematic until a builder measures it in-world.*
