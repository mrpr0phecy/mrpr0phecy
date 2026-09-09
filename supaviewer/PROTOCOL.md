# SupaViewer protocol notes

This is a map of how a *real* Second Life / OpenSimulator viewer talks to a grid, and what a browser can actually do. It is not a Linden Lab specification. Canonical references:

- [Second Life protocol (historical wiki)](https://wiki.secondlife.com/wiki/Protocol)
- [OpenSimulator notes](http://opensimulator.org/wiki/Viewer)
- LibreMetaverse / libopenmetaverse source (the practical decoder ring)

## Layers

```
┌─────────────────────────────────────────────┐
│  Viewer (this page)                         │
│  WebGL scene + HUD + agent state            │
└──────────────────┬──────────────────────────┘
                   │  WebSocket / HTTPS (future)
┌──────────────────▼──────────────────────────┐
│  Gateway (not shipped in v0)                │
│  Caps proxy + LLUDP circuit                 │
└──────────────────┬──────────────────────────┘
                   │  XML-RPC login, HTTPS caps, UDP
┌──────────────────▼──────────────────────────┐
│  Grid                                       │
│  Login server, user server, simulators      │
└─────────────────────────────────────────────┘
```

v0 short-circuits the whole stack with `SV.protocol.LocalCircuit`: the “simulator” is a JavaScript object in the same page.

v0.2 adds a **public-map** path that never logs in. The page walks Linden Lab's published map tiles and region-name caps (`js/grid.js`). You are a ghost on Agni: the layout is real, live avatars are not.

## Login (XML-RPC)

Classic viewers POST `login_to_simulator` to a grid login URI, for example:

- Second Life (Agni): `https://login.agni.lindenlab.com/cgi-bin/login.cgi`
- OSGrid: typically `http://login.osgrid.org/`

The body is XML-RPC with first/last name, a password hash (`$1$` + MD5 of the password), start location, viewer version, MAC/ID0 placeholders, and a list of requested options (`inventory-root`, `inventory-skeleton`, `initial-outfit`, `login-flags`, `global-textures`, `seed_capability`, …).

On success the login server returns:

- `agent_id`, `session_id`, `secure_session_id`
- `circuit_code`
- `sim_ip`, `sim_port` — the UDP endpoint of the first simulator
- `region_x`, `region_y` (grid coordinates, 256 m units)
- `look_at`, `home`, `start_location`
- `seed_capability` — HTTPS URL for the capability seed
- inventory skeleton, money balance, buddy list, …

**SupaViewer will not POST this from the browser.** Login servers do not send CORS headers, passwords must not be collected by a static page, and the next hop is UDP anyway. `SV.protocol.buildLoginXML()` exists so a *future local gateway* can reuse the same shape.

## Public map (what v0.2 actually talks to)

No password. Three Linden Lab URLs only:

- Region name → grid cell: `https://cap.secondlife.com/cap/0/d661249b-2b5a-4436-966a-3d3b8d7a574f?var=…&sim_name=Da%20Boom`
- Grid cell → name: `https://cap.secondlife.com/cap/0/b713fe80-283b-4585-af4d-a3b7d9a32492?var=…&grid_x=1000&grid_y=1000`
- Map tile: `https://map.secondlife.com/map-1-{x}-{y}-objects.jpg`

Caps are loaded as `<script>` tags (they assign a `var`, which is how the Map API was published). Tiles are drawn on the mini-map as ordinary images; WebGL ground textures try CORS, then a public proxy, then a plain plane. Walking off a region edge looks up the next cell and crosses if it exists.

A SLURL (`secondlife://Region/x/y/z`) and `maps.secondlife.com` link hand you to the official viewer for a real login.

## After login

1. Open an LLUDP circuit to `sim_ip:sim_port`.
2. `UseCircuitCode` with the circuit code + session/agent IDs.
3. `CompleteAgentMovement`.
4. Simulator sends `RegionHandshake`; viewer replies `RegionHandshakeReply`.
5. `AgentUpdate` at ~10 Hz (camera, control flags, body rotation).
6. `ObjectUpdate` / `ImprovedTerseObjectUpdate` / `ObjectUpdateCompressed` stream in the scene.
7. Chat is `ChatFromViewer` / `ChatFromSimulator`.
8. Caps (HTTP) take over inventory, mesh, texture fetch (`GetTexture`), rez, teleport, etc.

Message IDs used by v0’s local bus are in `js/protocol.js` (`SV.protocol.MSG`).

## Why a browser cannot be a drop-in Firestorm

| Need | Browser |
|---|---|
| LLUDP to the sim | No raw UDP. Would need WebSocket, WebTransport, or a native helper. |
| XML-RPC login | No CORS on Linden/OSGrid login URIs. |
| UDP hole punching / circuit acks | Needs a long-lived process next to the network. |
| Asset UDP + HTTP GetTexture | Caps can be proxied; UDP cannot. |
| Voice (Vivox / WebRTC) | Separate stack. |

The honest v1 is: a small **gateway** on localhost (Node, Python, or a LibreMetaverse daemon) that holds the circuit and exposes:

```
ws://127.0.0.1:PORT/circuit     binary LLUDP frames, already acked
https://127.0.0.1:PORT/caps/... HTTPS cap relay
```

The page then becomes “just” the renderer and UI.

## Coordinate system

Second Life: **X east, Y north, Z up**, region 0–256 m on X/Y, Z typically 0–4096.

SupaViewer three.js: **X = SL X, Y = SL Z, Z = SL Y** (Y-up). Conversion helpers live on `SV.coords`.

## Local circuit (v0)

`SV.protocol.LocalCircuit` implements a tiny subset:

- `chat(source, text, chatType)` → HUD
- `rez(primSpec)` → scene
- `kill(localId)` → scene
- `agentUpdate` → movement already applied client-side
- seeded object “scripts”: touch, sit, hover text

No packets leave the tab.
