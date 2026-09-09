# SupaViewer roadmap

A real grid viewer is years of work (Firestorm is ~2 million lines). This file is the cut we are actually aiming at, not a fantasy list.

## v0 — this drop

Standalone browser viewer + **Supa Sandbox** region.

- [x] Login chrome (sandbox only; grid login disabled on purpose)
- [x] 256 m region, terrain, water, day cycle
- [x] Agent: walk / run / jump / fly / sit
- [x] Third-person camera + mouselook
- [x] Local chat + slash commands
- [x] Nearby agents
- [x] Mini-map
- [x] Inventory / appearance (local)
- [x] Prim build (rez, select, move, colour, delete)
- [x] Protocol notes + login XML builder (unused on the wire)
- [x] Touch + sit on seeded objects

## v0.1

- [ ] Save/load the sandbox as JSON (localStorage + file export)
- [ ] Linksets (parent/child prims)
- [ ] More prim params: hollow, path cut, twist, taper, dimple
- [ ] Notecards and a landmark HUD teleport history
- [ ] Better Ruth-style avatar (classic body parts, not a capsule stack)
- [ ] Particle set on the fountain / campfire

## v0.2 — OpenSim via a local gateway

- [ ] Documented Node/Python gateway: XML-RPC login, LLUDP circuit, cap relay
- [ ] WebSocket binary transport into the page
- [ ] ObjectUpdate → prim mesh
- [ ] ChatFromSimulator
- [ ] Texture fetch through GetTexture (JPEG2000 decode is the hard part)

## v1 — useful on a public grid

- [ ] Inventory caps (FetchInventoryDescendents2)
- [ ] Teleport / region crossing
- [ ] Mesh (LL mesh asset → glTF-ish)
- [ ] Friends, IMs, groups (UI already has stubs)
- [ ] Parcel properties, media-on-a-prim
- [ ] Voice as WebRTC (not Vivox-from-the-page)

## Explicit non-goals for now

- Copying Linden Lab art, logos, or the official UI pixel-for-pixel
- Collecting Second Life passwords in this static page
- A marketplace, L$ wallet, or anything that looks like official economy glue
- Claiming compatibility we do not have
