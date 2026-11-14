# 02 — Masterplan: the spatial system

Every number here is generated from `tools/gen_plans.py`. If a drawing and this document disagree, the drawing is right and this document is out of date — regenerate both.

---

## 1. The coordinate contract

| Thing | Value |
|---|---|
| Region | 256 × 256 m, ground / plaza at **+20.00** |
| Building centre | **128.00, 128.00** (region-relative metres) |
| Drum outer wall | **radius 36.00 m** — 72 m diameter |
| The Oculus (open shaft) | **radius 14.00 m** — 28 m diameter |
| Floor to floor | **5.50 m** (clear 4.90, slab 0.60) |
| The stack | U1 +14.00 → Roof +57.00 |
| The number | L0 (+24.00) to Roof (+57.00) = **33.00 m** |
| Kart helix | radius **38–46 m**, outside the drum, 1.4 laps |
| Plaza apron | radius 46 → 70 m, all round |
| Height above plaza | 37 m of blank façade + 3.5 m of parapet |

Nothing crosses a region boundary. **One region, one building.** This is not an aesthetic choice: rides, karts and coasters break at a sim crossing, and a build that stutters every 40 seconds is not "unproblematic".

---

## 2. Why a drum with a hole in it

The brief asked for two things that normally fight: **everything visible from everywhere**, and **everything packed into a small space**.

A ring-plan around a shared void solves both at once, and it is the oldest trick in entertainment architecture (the panopticon, the circus, the mall atrium). Put the games on the ring. Put the **hole** in the middle. Now:

- the longest possible sightline in the building is 72 m — under the crowd-draw distance, so every zone is visible from every other zone without any LOD trickery
- the void does the work of a **courtyard, a stage, a lift shaft and a light well**, for zero land impact
- vertical stacking means ten attractions share **one roof, one floor system, one set of walls, one lighting rig**
- you can build the whole thing out of one repeating structural bay, which is how you make 28 400 LI behave like 40 000

The single most important line in this document:

> **The shaft is not circulation. The shaft is the show.**

### 2.1 The one rule that makes the plan work

> **The dark game goes in the core. The views go on the ring.**

Laser quest is the only attraction that *needs* to be windowless and *gives nothing back* in return for a view. Every other activity is improved by being seen. So laser quest goes underground (the Undercroft) and every metre of perimeter glass, every balcony, every ledge goes to the things people want to watch.

This is why the plan is efficient: **each activity is in the position that suits it**, rather than every activity getting an equal share of the good space.

---

## 3. The stack

| Deck | Elevation | Clear | Name | The one thing on this deck |
|---|---|---|---|---|
| **Roof** | +57.00 | open | **The Belvedere** | 360° views, the Oculus mouth, the coaster lift hill |
| **L5** | +51.50 | 4.90 | **The Crown** | coaster station, kart pit lane, terrace bar, the 34th Door |
| **L4** | +46.00 | 4.90 | **The Warren** | nets and tubes in the void, the Nest, the Water Chute launch |
| **L3** | +40.50 | 3.20 + soffit | **The Lodge** | casino ring, the Croupier's Pit, the Sanctum |
| **L2** | +35.00 | 4.90 | **The Lane** | the bowling bridge, Cabinet Row arcade, the Salon |
| **L1** | +29.50 | 4.90 | **The Mirror** | the ice rink on glass, over the pool |
| **L0** | +24.00 | 4.90 | **The Flood** | the pool, the grotto, the Drowned Parlour, the Penny Parlour |
| *(plenum)* | +20.00–+24.00 | 3.40 | service | pool plant, ducts, the service stair. Not public |
| **U2** | +16.40 | 3.00 | **The Undercroft** | laser quest, the Eye |
| **U1** | +14.00 | 3.20 | **The Sump** | arrival, the Hive, cloakroom, the Hoodwink |
| *(plaza)* | +20.00 | — | | the street, the shopfront, the kart finish |

The deck naming is the degree ladder: **Sump → Flood → Mirror → Lane → Lodge → Warren → Crown → Belvedere.** You are climbing a house that thinks it is a lodge.

---

## 4. Deck by deck

Plans: [`plans/plan-u1.svg`](plans/plan-u1.svg) … `plan-roof.svg`. Numbers below match the plan legends.

### U1 — THE SUMP (+14.00) · arrival
Sump lobby, the Hive (token booth), cloakroom, the Hoodwink airlock to laser quest, coach yard / back-of-house, and the foot of the Thread.
The **Shoebox** — the street entrance pavilion — sits on the plaza at (124–144, 160–176) and drops into this deck by lift.

### U2 — THE UNDERCROFT (+16.40) · laser quest
One 1 400 m² field on a single flat deck with three raised catwalks, briefing room, and **the Eye** — a one-way viewing mezzanine for people who would rather watch. No windows. Ever.

### L0 — THE FLOOD (+24.00) · water
The pool (26 × 15 m, water at +23.30, 2.1 m deep) occupies the south of the deck and **its north lip is the bottom of the Oculus** — the well ends in water. Grotto swim-up bar under the pool's west end. The Drowned Parlour lounge wraps the north of the shaft; the Penny Parlour (8 free-play machines) is the east; Chrysalis (changing) is the west.
First reveal of the building: you come up the ramp in the dark and the room turns into a 28 m cylinder of water and air.

### L1 — THE MIRROR (+29.50) · ice
A 30 × 18 m rink laid on a **structural glass deck, directly over the pool**. Rinkside is a rail bar at the north lip where the rink meets the shaft — drinkers look across the void, skaters look down through their own ice.
Cold Room (skate hire, sharpening) west. The Blind Door (a bookcase that swings) in the west wall. The Ribbon starts here.

### L2 — THE LANE (+35.00) · the hub
**The bowling lanes are the bridge.** Eight lanes, 25 m, spanning the full width of the Oculus, with the approach deck on the north floor and the pin deck cantilevered over the south lip. Standing at the foul line, your ball is 11 m above the water and the casino is 5.5 m above your pinsetters.
The Salon — the house's social hub and bar — sits at the bridge head, at the exact centre of the gradient. **Every route passes through or past the Salon.** If a player only ever finds one room, it should be this one.
Cabinet Row (the arcade) fills the east; the Fortune and the Claw are its two set-piece machines.

### L3 — THE LODGE (+40.50) · the casino ring
The only deck with a **ceiling**: a 3.2 m lacquer soffit at +43.70, so the casino feels like a private room inside a public building. Twelve tables on the ring, the Sanctum (a closed inner room for events and high-table play, no wagering) to the north, the Beehive champagne bar to the east, and **the Croupier's Pit** at the lip of the shaft — a single round table at the edge of a 16 m drop. That is the shot.

### L4 — THE WARREN (+46.00) · jungle gym
The jungle gym is not a room. It is a **net-and-tube sculpture hung across the east half of the void**, so climbers are visible from every deck above and below. The Nest (ball pit) sits on the south-west plate, the Water Chute launch tower to the west, the Eye of the House (camera obscura) north.

### L5 — THE CROWN (+51.50) · launch
The Thread's station (3 trains, zoetrope pre-show), the Pit Lane and kart garage, the Crown Bar terrace over the shaft, the Ribbon's last three holes, and the sealed **34th Door**.

### Roof — THE BELVEDERE (+57.00) · the number
An open ring, 16 m wide, around the mouth of the Oculus. 360° across the region. Coaster lift hill and inversion outside the ring. This is the build's postcard and its event space.

---

## 5. The sightline matrix

Read across: *what can I see from here?* Every cell is a real line of sight in the model, not a claim.

| From ↓ | Flood | Mirror | Lane | Lodge | Warren | Crown | Belvedere | Coaster | Karts | Arcade | Golf |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Flood** (pool) | — | ● up through ice | ● up 11 m | ◐ | ● up 22 m | ○ | ● up 33 m | ● | ○ | ◐ | ● |
| **Mirror** (rink) | ● down through ice | — | ● | ● | ● | ○ | ● | ● | ○ | ◐ | ● |
| **Lane** (bowling) | ● down 11 m | ● down | — | ● up | ● up | ○ | ● | ● | ◐ | ● | ● |
| **Lodge** (casino) | ● down the shaft | ● down | ● down | — | ● | ○ | ◐ | ● | ◐ | ○ | ● |
| **Warren** (nets) | ● | ● | ● | ● | — | ● | ● | ● | ● | ● | ● |
| **Crown** | ● | ● | ● | ● | ● | — | ● | ● | ● | ● | ● |
| **Belvedere** | ● 33 m | ● | ● | ◐ | ● | ● | — | ● | ● | ◐ | ● |
| **Arcade** (Cabinet Row) | ◐ | ◐ | ● | ○ | ● | ○ | ◐ | ● | ● | — | ● |
| **Golf** (Ribbon) | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — |

● clear · ◐ oblique or partial · ○ glimpses only

**The design test:** if any row has more than two ○, that zone has been walled in and the plan has been broken. Only two rows are allowed to be poor — the arcade (it is a lined hall, deliberately) and the Lodge (it has a ceiling, deliberately).

**The Warren and the Ribbon are the two most connected places in the building.** That is by design: one of them is play equipment hung in the void, the other is a ledge that spirals the entire façade. They are how a player *sees the whole house* without doing anything structured.

---

## 6. Circulation

### 6.1 The Thread — the promenade
A 3 m wide helical ramp at radius 14.5–17.5, climbing **43 m** from the Sump (+14.00) to the Belvedere (+57.00). One turn per deck, 1:12 slope, 3 m clear headroom minimum, 1.2 m parapet with a neon handrail.

- 1 turn per deck means you **circle the void** between every pair of decks — you always see the well from a new height, and you always pass the Ribbon.
- The ramp is **the only way up** that never stops. It is also the fire escape *de facto*.

### 6.2 The Needles — four lifts
Four glass lifts at radius 30, at the four diagonals (45°, 135°, 225°, 315°). Three are classical columns (Doric, Ionic, Corinthian). The fourth, the north-east, is **the impossible one**: a twisted/inverted order that defies its own entablature, because the house is bettering the lodge. Cars are 2.6 m glass cylinders, slow, and stop at every deck. Their whole job is to be a mobile viewpoint.

### 6.3 Down-only shortcuts — the drama
| Shortcut | From → to | Why |
|---|---|---|
| the Water Chute | L4 → Flood | 3 flumes, 23 m fall, into the pool |
| the Thread coaster | Crown → Crown | 420 m, threads every deck |
| the Spiral | Crown → plaza | 1.4 laps of kart helix outside the drum |
| the Fall (lift) | street → Sump | 6 m, once, on arrival |

**Only the coaster and the karts go up.** Everything else is a controlled fall. That asymmetry is the building's personality: the house lifts you, and then you choose how to come down.

### 6.4 Service
One service stair in the west wall (Blind Door at L1) down to the plenum and the Sump; the Vestry (staff) on L3; the coach yard on U1. The service route never crosses a public zone. Two dumbwaiters: Salon ↔ Crown Bar, and Lodge ↔ Drowned Parlour.

---

## 7. Capacity and dwell

| | |
|---|---|
| Comfortable population | **40–50 avatars** |
| Design maximum | 80 (with FX budget cut, see `06` §7) |
| Average dwell | 50–75 min |
| Target first-screenshot | within **90 seconds** of arrival |
| Bowling | 8 lanes, 4 per lane, 10 min → 190/hr theoretical |
| Ice rink | 30 skaters concurrent |
| Pool | 25 concurrent |
| Laser quest | 2 teams of 12 per 15 min → 96/hr |
| Arcade | 24 machines, 1–3 min each |
| Casino | 12 tables × 5 seats |
| Karts | 6 karts, 2.5 min laps → ~140/hr |
| Coaster | 3 trains × 8 seats, 2:10 circuit → ~330/hr |
| Mini golf | 18 holes, 2 per hole → 36 concurrent, ~40 min round |

The **Salon is the buffer**: it is the only room sized for 30 people standing, and it is the room with the best view of the most things. Everything queues *through* it.

---

## 8. Ten photo spots

Give these to the Stewards. Put a discreet brass floor-plate at each one.

| # | Where | What you are shooting |
|---|---|---|
| 1 | The Flood, waterline, looking up the shaft | 33 m of building, people on the lane bridge, the coaster crossing |
| 2 | The Mirror, centre ice | skaters' reflections with the pool glowing underneath |
| 3 | The Lane, foul line, lane 1 | pins, the casino soffit above, water 11 m below |
| 4 | The Croupier's Pit, L3 | one table, one wheel, a 16 m drop behind it |
| 5 | The Warren, inside the net | the whole stack from inside a game |
| 6 | The Crown Bar terrace | the coaster launching past your glass |
| 7 | The Belvedere, north edge | the Oculus mouth, 33 m down, the pool a coin |
| 8 | The Ribbon, hole 12 (L3 ledge) | the kart helix outside and the Lodge inside, one frame |
| 9 | The Drowned Parlour booth | velvet, brass, a mirrored ceiling, no exits |
| 10 | The 34th Door, open | a chair, a mirror, and you |

---

## 9. Ten non-negotiables

If a builder bot has to break one of these, it must ask.

1. **The Oculus is never obstructed.** Nothing crosses it below +35.00 except the lane bridge, the slides, the nets, the Lodestone and the two coaster crossings.
2. **Floor to floor stays 5.50 m.** Every clearance, every ride envelope and every slide depends on it.
3. **The bowling lanes stay 25 m and stay over the void.** They are the structural and visual centrepiece.
4. **The rink stays over the pool and stays glass.** It is the build's best idea.
5. **Laser quest never gets a window.**
6. **The Lodge keeps its ceiling.** It is the only deck with one.
7. **Nothing is physical that does not need to be.** (see `06` §4)
8. **The Thread is continuous** from +14.00 to +57.00. No gaps, no ladder, no teleport.
9. **One region.** No sim crossings anywhere in the ride envelope.
10. **No L$ wagering.** Anywhere. Ever.

---

## 10. Clearance envelope (for the bots)

| Element | Envelope |
|---|---|
| Coaster track | 2.80 m above any walkable surface, 1.60 m to any wall or fixed object, 2.40 m to any other track |
| Coaster aperture through a slab | 3.60 m diameter, chamfered both faces, edge trimmed in brass |
| Kart track | 3.00 m running width, 1.10 m barrier, 2.20 m headroom, 6.00 m outside radius clearance |
| Water Chute flume | 1.70 m internal diameter, 1.10 m radius min at the bends, 4.00 m floor clearance at the splashdown |
| The Thread ramp | 3.00 m wide, 1:12, 3.00 m headroom, 1.20 m parapet |
| Lantern / signage | bottom edge 2.60 m above the deck |
| Doorway | 2.40 m high, 1.80 m wide (2.20 for the Blind Door and the 34th) |

---

## 11. How the plan stays unproblematic in a small space

The brief's real worry — *"make it as unproblematic as possible within a small space"* — is answered structurally, not by tuning:

| Problem | Structural answer |
|---|---|
| Ten activities need ten footprints | One drum, eight decks, **shared structure, shared roof, shared lighting** |
| Crowds collide | The ring plan separates flows without corridors; the Salon absorbs the crowd |
| Rides need height | The drum is 37 m tall and the Oculus already exists — *height is free* |
| Vehicles break on sim borders | **One region.** |
| Darkness for laser quest fights daylight for views | The dark game goes underground |
| Some games want water, some ice, some fire | **Stack them**: water under ice, smoke over lanes |
| Prims run out | Three shared atlases, one structural bay, one palette, `06` §1 budget |
| Lag at events | FX budget switches in `06` §7 — one command, ~4 000 LI of effects off |
| New content later | Three deliberately *empty* niches: L2 west, L4 north-east, Roof south. Reserved, unbuilt, with power and script hooks already run |
