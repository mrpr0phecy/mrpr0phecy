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
