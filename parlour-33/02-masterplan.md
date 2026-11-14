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
