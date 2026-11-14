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
