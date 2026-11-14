# renders — 3D from the coordinate model

These are **software renders of the actual build model**, not concept art. `tools/render3d.py` imports `gen_plans.py` (the same file that draws the plans and feeds the bots), turns every deck, room, wall, cabinet, lane, table, net, kart loop, coaster and the flume into polygons, and rasterises them with a small numpy renderer — z-buffer, two lights, fog, bloom, grain. No GPU, no external renderer, ~25 seconds for the set.

```bash
python3 parlour-33/tools/render3d.py            # all five
python3 parlour-33/tools/render3d.py section    # one
```

| File | What it shows |
|---|---|
| `render-01-exploded.png` | the eight decks pulled apart, so the weave reads in one image |
| `render-02-section.png` | cutaway from the south: the stack, the pool, the rink, the lanes, the casino, the nets, the karts, the crown, and the coaster on the roof |
| `render-03-exterior.png` | the block from the plaza at night: band windows, brass parapet, the coaster cresting, the shopfront at the base |
| `render-04-gallery.png` | eye level, L2, looking west down the 58 m glazed gallery — arcade on the left, lanes on the right |
| `render-05-pool.png` | the Flood, from the Sunbeam terrace |

## What these are, and what they are not

**They are:** a check that the numbers work. Every dimension is the dimension in `02-masterplan.md` and `build_manifest.yaml`. If a deck looks too shallow, a gallery too wide, or a coaster too close to a parapet, that is a real problem in the model and it should be fixed in `gen_plans.py`, not in the picture.

**They are not:** a look-dev target. The geometry is massing — boxes, cylinders and planes. There is no furniture detail, no texture, no prim budget, no lighting rig, and none of the atmosphere in `05`. For tone, use `art/` — `concept-the-weave.png`, `the-croupier.png` and `cabinet-row.png` are the look; these are the space.

The renderer is deliberately dumb and deliberately honest: it draws what the model says. If a view is ugly, the model is ugly there.
