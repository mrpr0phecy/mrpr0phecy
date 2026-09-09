# SupaViewer

**Open-source, standalone, in-browser virtual world viewer.**

SupaViewer is a from-scratch WebGL viewer inspired by classic Second Life / OpenSimulator viewers (Firestorm, Cool VL, Alchemy). Version 0.2 can walk the **public Second Life (Agni) grid map** with no account, or a local sandbox region. No install, no plugin, no password.

Live page (this repo): [`/supaviewer.html`](../supaviewer.html)

> **Not affiliated with Linden Lab.** Second Life® is a trademark of Linden Research, Inc. SupaViewer is an independent, unofficial project. It does not send your password anywhere.

## What works in v0.2

- **Second Life (Agni) public map** — walk the real mainland as a ghost. Region search, edge crossings, SLURLs, official map tiles. No account.
- 256 m × 256 m sandbox region (**Supa Sandbox**) with terrain, water, sky and a seeded welcome area
- Walk, run, jump, fly, sit, third-person camera, mouselook
- Nearby residents (sandbox agents), local chat, `/` commands (`/region`, `/slurl`)
- Inventory, appearance, radar / mini-map, people list
- Build: rez / select / move / tint / delete classic prims (box, cylinder, sphere, torus, prism, ring)
- Touch and sit scripts on seeded objects
- Protocol notes and login XML-RPC *shapes* for a future grid gateway

## What does not work yet (and why)

Browsers cannot speak **LLUDP**. A *logged-in* session (live avatars, IMs, inventory, mesh) needs a local or hosted **WebSocket ↔ UDP/caps gateway**. This page will never take a Second Life password. The public-map mode uses only Linden Lab's documented map tiles and region-name caps. See [PROTOCOL.md](PROTOCOL.md) and [ROADMAP.md](ROADMAP.md).

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | Move |
| Shift | Run |
| Space | Jump / unsit |
| F | Toggle fly |
| E / C or Page Up / Down | Fly up / down |
| Mouse drag | Orbit camera |
| Scroll | Zoom |
| M | Mouselook (pointer lock) |
| Double-click ground | Teleport |
| Click prim | Select (build mode) |
| B | Build panel |
| I | Inventory |
| Enter | Focus chat |
| Esc | Close panels / mouselook |
| H | Help |

On a phone: left stick moves, drag on the world to look, buttons for fly and jump.

## Run locally

This is static HTML. From the repository root:

```bash
python3 -m http.server 8891
# http://127.0.0.1:8891/supaviewer.html
```

Three.js is loaded from cdnjs (same pattern as other standalone experiments in this repo). Serve over HTTP so that works.

## Layout

```
supaviewer.html          Entry page (HUD + login chrome)
supaviewer/
  README.md
  PROTOCOL.md            Login, caps, LLUDP, browser limits
  ROADMAP.md             Honest v0 → v1 plan
  js/protocol.js         UUIDs, login XML, message names, local bus
  js/viewer.js           Region, avatars, prims, camera, UI
```

## Licence

Site code is MIT — see the repository [`LICENSE`](../LICENSE). Third-party marks remain with their owners. Three.js is MIT (mrdoob / three.js authors).
