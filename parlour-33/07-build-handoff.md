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
P33_U2_LASR_vest_red_11
P33_L1_MIRR_ice_surface
P33_ALL_SIGN_plaque_sigil_23
P33_ALL_SHRD_lamp_brass_058
```

| Field | Values |
|---|---|
| `P33` | always |
| deck | `U1 U2 L0 L1 L2 L3 L4 L5 RF` |
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
- a **datum grid**: 4 survey markers at the drum's cardinal points at +20.00, named `P33_RF_SITE_datum_N/E/S/W`
- a 1 LI "metre cube" reference object, linked, to verify scale
- **Gate:** the four datums are within 20 mm of the plan coordinates.

### Phase 1 — Envelope (the drum)
- drum wall, roof, Oculus ring, parapet, façade band windows, plaza apron
- **no interior anything**
- **Gate:** LOD test at 60 m and 120 m; the drum must read as a drum. LI ≤ 2 600.

### Phase 2 — Structure (decks, ramps, lifts)
- 8 decks with the Oculus opening, the Thread ramp, 4 Needle shafts and cars
- colliders for everything walkable
- **Gate:** walk from U1 to the roof using only the Thread, never falling through, at LOD factor 1.0. LI ≤ 3 130 cumulative (structure + circulation).

### Phase 3 — The shaft (the show)
- water planes, the Lodestone, the shaft haze, the light column, the 8 hero shadow spots
- **Gate:** the vertical sightline test — from the pool floor, from the Belvedere, and from the Lane's foul line, each of the other decks is visible with no unintended obstruction. **This gate is the project.** If it fails, stop everything.

### Phase 4 — The three anchors
Build in this order, because they are what people judge:
1. **The Lane** (bowling bridge) — the structural centrepiece
2. **The Mirror** (rink over pool) — the hard alpha case
3. **The Salon** — the social hub
- **Gate:** bowl a full frame, skate a lap, sit at the bar; all three at once with 20 avatars. LI ≤ 8 000 cumulative.

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
- **Gate:** a fresh alt collects all 33 using only in-world information, and opens the door. LI ≤ 26 500 cumulative.

### Phase 9 — Dressing, light, sound, and the lie
- the Threshold's shabby frontage (the last thing built, the first thing seen)
- lamps, rugs, evidence, taxidermy, flyers, the wrong clocks
- **Gate:** the five images in `05` §10 exist and are good. LI ≤ 28 400.

---

## 3. QA gates (run at every phase)

| Test | Method | Pass |
|---|---|---|
| **Land impact** | `llGetObjectDetails` sum, or the parcel's object count | at or under the phase figure |
| **LOD** | walk to 60 m at `RenderVolumeLODFactor 1.0` | silhouette holds |
| **Sightline** | stand at the 10 photo spots | matrix in `02` §5 is true |
| **Physics** | walk every walkable surface; run at every parapet | nothing falls through, nothing is climbable that should not be |
| **Alpha** | orbit the camera 360° at the rink, the pool and the shaft | no flicker, no sort errors |
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
| Coaster clips the Lane deck | medium \(|\)| high | the aperture is specified at 3.6 m for a 2.4 m envelope |
| Someone asks about L$ betting | certain \(|\)| critical | the brass plate, the parcel description, and `06` §6.1 |
| 24 cabinets = 24 listeners | high \(|\)| medium | one script per cabinet, integer IDs, no public channel |
| The shaft reads as an empty hole | medium \(|\)| high | the Lodestone, the haze, the light column, the crossing rides — all of them exist for this |
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
