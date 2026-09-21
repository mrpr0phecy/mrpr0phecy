# MostUsefulMaps

`maps.html` at the domain root. A world map built on open data and open-source
code, in the same spirit as the rest of Product A: no account, no ads, no API
keys, no per-request costs, and every calculation it can do locally, it does
locally.

This document is for whoever maintains it next. It covers what runs where, what
is vendored, what each third party is used for and under what licence, how a
catalogue card embeds a map, and what has and has not been actually tested.

---

## 1. The shape of it

```
maps.html                     the product page (no analytics, no third-party tags)
maps/mostusefulmaps.css       design system, all class names prefixed .mm-
maps/app.js                   page logic: search, route, measure, nearby, sun, deep links

maps/core/geodesy.js          WGS84 geodesics, bearings, rhumb lines, area, bbox,
                              formatting, coordinate parsing, Mercator projection
maps/core/olc.js              Open Location Code (Plus Codes) encode/decode/shorten/recover
maps/core/gridref.js          OS National Grid ↔ WGS84 (Helmert + Airy transverse Mercator)
maps/core/solar.js            NOAA solar position, sunrise/sunset/twilight/golden hour, moon phase
maps/core/geo.js              point-in-polygon, country lookup, graticule, drawing helpers
maps/core/gazetteer.js        offline place search and the "what did you type?" classifier

maps/localmap.js              the offline canvas renderer (pan/zoom/pick, no library)
maps/livemap.js               MapLibre GL + OpenFreeMap vector tiles, layered on top
maps/providers.js             every live service: styles, geocoders, routers, Overpass,
                              elevation, Wikipedia and place enrichment — with licences,
                              timeouts, caching and rate limits
maps/embed.js                 window.MostUsefulMaps: the API cards use

maps/vendor/                  MapLibre GL JS 5.24.0 (BSD-3), topojson-client (ISC),
                              tz-lookup (CC0) + their licence files
maps/data/                    countries-110m/50m.json (Natural Earth, public domain),
                              gazetteer.json + countries.json (generated), SOURCES.json
scripts/build-maps-data.js    the only writer of maps/data/*.json (has a --check mode)
scripts/tests/maps-core.test.js  the offline test suite (engine + reference vectors)
```

## 2. Why two renderers

MostUsefulMaps paints twice, deliberately:

1. **The offline renderer** (`maps/localmap.js`) draws Natural Earth boundaries
   on a `<canvas>` with no library and no network. It is the first thing on
   screen, it is what cards use, and it is what keeps working when the visitor
   is offline, on a train, or behind a firewall that blocks tile servers.
2. **The live renderer** (`maps/livemap.js`) adds MapLibre GL with OpenFreeMap's
   OpenStreetMap vector tiles on top — hidden until it has actually rendered,
   and thrown away on error or after a 12-second timeout, so a failure costs
   the visitor nothing.

The offline layer is never removed, which is why the page has no "something
went wrong" state.

## 3. Data and services

| Purpose | Service | Data / licence | When it is contacted |
|---|---|---|---|
| Basemap tiles | OpenFreeMap (`tiles.openfreemap.org`) | OpenStreetMap, ODbL | when the live map loads |
| Place search | Photon (`photon.komoot.io`), then Nominatim | OpenStreetMap, ODbL | when you search, if online |
| Road, cycle and walking routing (Route tab) | FOSSGIS (`routing.openstreetmap.de`), then the OSRM demo server | OpenStreetMap, ODbL | when you ask for a route |
| Driving routes (Drive tab) | FOSSGIS Valhalla (`valhalla1.openstreetmap.de`), then the above | OpenStreetMap, ODbL | when you plan a drive or replan |
| Speed limits along a route | Overpass API (`overpass-api.de`) | OpenStreetMap, ODbL | when you plan a drive (a query per ~80 km, ≤40 sampled points each, 40 m corridor) |
| Live traffic | TfL Unified API (`api.tfl.gov.uk`), road disruptions | TfL Open Data | when a drive touches Greater London |
| Weather at arrival time | Open-Meteo (`api.open-meteo.com`) | CC BY 4.0 | when you plan a drive (≤40 sampled points, one call) |
| Nearby places | Overpass API (`overpass-api.de`, then `overpass.kumi.systems`) | OpenStreetMap, ODbL | when you press Find nearby |
| Elevation | OpenTopoData `srtm90m` | SRTM, public domain (NASA/USGS) | when a route is drawn |
| Nearby articles | Wikipedia GeoSearch | CC BY-SA 4.0 | when a place is selected |
| Air quality | Open-Meteo Air Quality / CAMS | CC BY 4.0 | when a place is selected; modelled current estimate, not a monitor reading |
| Flood warnings | Environment Agency flood-monitoring API | Open Government Licence | when a place is selected; England-focused coverage, and no warning is not proof of safety |
| Nearby cultural imagery | Wikimedia Commons GeoSearch | each file's licence and credit page | when a place is selected; each thumbnail links to its individual credit/licence page |
| Nearby street imagery | KartaView | CC BY-SA 4.0 imagery | when a place is selected; historical/user-contributed and coverage is uneven |
| Offline places | GeoNames via `all-the-cities` | CC BY 4.0 | never — shipped in `maps/data/` |
| Offline outlines | Natural Earth via `world-atlas` | public domain | never — shipped in `maps/data/` |
| Time zones | `tz-lookup` | CC0 | never — shipped in `maps/vendor/` |

`maps/data/SOURCES.json` records the exact package versions and SHA-256 hashes of
the inputs, the bytes/rows/hashes of the generated outputs, and every live
service with its licence and whether it needs a key (`live_services`). It is
written by `scripts/build-maps-data.js` — `--provenance` refreshes it from the
committed files alone, which is how the live-service list is kept honest
without the upstream packages to hand. Attribution is
shown in the map corner, in the Info panel, and on the card.

**Public instances are shared infrastructure.** `maps/providers.js` enforces a
minimum interval between calls per service, caches responses, times out every
request, and never fires anything without a user action. Selecting a place is
one such user action: the local-context cards send only that point and their
small radius to the named sources, and they never poll in the background. If
this page ever gets real traffic, self-host (Photon, OSRM, Overpass and
OpenFreeMap are all self-hostable) rather than leaning harder on the
volunteers.

**Route choices and active guidance.** The Route tab supports driving, cycling
and walking profiles, with fastest, shortest and quieter choices, explicit avoid
chips for motorways, tolls, ferries and unpaved ways, and any alternatives the
router returns. A real route can start the same on-device guidance overlay for
all three modes; it follows the user's position, announces manoeuvres, gives an
ETA and continues through a dead spot. The UI never calls a straight line a
road or path route, and every provider limitation is labelled.

## 4. Driving

The Drive tab is the part aimed at a specific job: the drive itself. It is
built so that the things a driver actually needs are correct, labelled, and
available when the signal is not.

**Restricted roads and variable limits.** Speed limits are not one number per
road. In the UK the national limits depend on the vehicle as well as the road:
a car may do 60 mph on a single carriageway, the same car towing a caravan may
do 50, and a lorry over 7.5 t is limited to 40 in Scotland and Northern Ireland.
Wales has defaulted restricted roads to 20 mph since September 2023; England,
Scotland and Northern Ireland are still 30. `maps/core/speed.js` encodes those
tables, and every limit it returns carries its **basis** — `signed` when a
mapper recorded it, `national` or `built-up default` when it comes from the
country's own rules, `assumed single carriageway` when the geometry is unknown,
and `unknown` when we genuinely do not know. Countries whose limits vary by
state or province (the US, Canada, Australia…) return no number at all rather
than an invented one.

**Routes that know what you are driving.** `MM.providers.driveRoute` asks
Valhalla, which takes a costing and real dimensions: a caravan can be routed
around a low bridge, an HGV gets `use_tolls`, `hazmat` and weight options, and
"avoid motorways, tolls, ferries or unpaved" are honoured through
`costing_options`. The request also asks for turn-lane data. When the router
returns it, the on-device guidance overlay shows lanes left-to-right with
highlighted recommended/usable lanes and a plain-language instruction. Missing
lane data stays hidden rather than being invented. If Valhalla is unreachable
the OSRM chain answers instead and the panel says the route is no longer
vehicle-aware; if everything is unreachable, the panel shows the straight-line
distance, explicitly labelled as not a road route.

**Traffic, honestly.** There is no key-free live traffic feed for the whole of
the UK. National Highways publishes DATEX II closures behind a subscription key
(and without CORS headers), so a static page cannot use it; most 511 APIs need
free registration. What is genuinely free is TfL's road disruption feed for
Greater London, so that is what the page uses, only when the route actually
goes there, and everything else is labelled **free-flow** rather than dressed up
as live. If the owner ever exports National Highways data with their own key,
the page will read `maps/data/road-alerts.json` and show it with its timestamp.

**Speed cameras.** Shown only for Great Britain and Ireland, where publishing
fixed-camera locations is lawful and they are mapped for the purpose. Everywhere
else the layer stays off and says why. The panel calls it what it is: an
information layer, not a warning system.

**Weather at the time you will be there.** Up to five points along the route are
sampled and matched to the forecast hour you would reach each one. Rain, fog,
snow, thunderstorms and strong gusts become plain-language warnings; the rows
show temperature, chance of rain, wind and visibility.

**Guidance that needs nothing.** `maps/core/drive.js` keeps the navigation loop
on the device: progress along the route, off-route detection (45 m while moving,
90 m when crawling, so GPS noise does not nag), a replan prompt after 12 seconds
off route, the next manoeuvre, an ETA built from the router's own per-step
timings, break reminders after a configurable period of continuous driving, sun
glare windows from the route's heading and the sun's position, a trip recorder
and a GPX export. Once the route and its limits are loaded, losing the network
changes nothing — which is exactly when a driver needs it. Spoken prompts use
the browser's own speech synthesis if it has one; nothing is downloaded.

**What the driver sees.** The navigation overlay is a single glance: next
manoeuvre, distance to it, the limit as a sign with its basis, the current speed
turning red past the 10% + 2 mph enforcement threshold, progress, remaining time
and ETA. It is not an `aria-live` alert region, because it updates constantly;
the alert slot underneath is reserved for things that matter (off route, a
break, arrival).

**Tap-to-move.** Where a browser will not share a location, clicking the map
moves the guidance along the route through exactly the same session code. It
makes the feature testable in CI and usable on a desktop.

## 5. Privacy

- No accounts, no cookies, no analytics property on `maps.html` (the site's
  analytics footprint is frozen — see CONSTRAINTS.md).
- This browser's local storage keeps the drive preferences (`mum-drive-prefs` —
  your vehicle, any dimensions, fuel figures, break interval and layer
  switches) and up to six recent places. They never leave the device and no
  service ever sees them. The Drive panel's details section has a **Forget my
  settings** button for the drive preferences; recent places can be removed
  with the browser's site-data controls.
- Nothing is transmitted until the visitor asks for something that needs a
  service, and the Info panel lists exactly which service gets what: search
  words go to a geocoder, two endpoints go to a router, a radius and a point go
  to Overpass, sampled points go to OpenTopoData.
- Geolocation is browser-only: the coordinates are used on the device and are
  never sent anywhere by this page.
- A drive sends more than a search does, and only when you ask for one: the
  route's shape goes to Overpass for the speed limits along it, five sampled
  points go to Open-Meteo for the forecast, and a bounding box goes to TfL for
  London disruption. Your position, your speed and your trip never leave the
  device — guidance is computed from what is already loaded.
- Selecting a place while online sends its coordinates and the documented small
  search radii to Open-Meteo Air Quality, the Environment Agency flood feed,
  Wikimedia Commons and KartaView. Those are user-triggered, coordinate-based
  lookups only: there is no location history, route sharing, hidden tracking or
  background polling. KartaView and Commons imagery are linked back to their
  credit/licence pages; flood coverage is England-focused and air quality is a
  modelled forecast, not a monitor reading.
- `check-egress.py` does not scan `maps/`, so the providers are classified here
  instead: the live services are class **C** (fetching open data is the
  feature), and the vendored libraries are class **B** shipped locally, not
  fetched from a CDN.

## 6. What works offline

| Feature | Offline behaviour |
|---|---|
| Pan/zoom world map | Natural Earth 110 m, upgrading to 50 m when zoomed in |
| Place search | 19,686 GeoNames places, ranked locally |
| Distance, bearing, area, path length | WGS84 Vincenty on the device |
| Plus Codes | full encoder/decoder, verified against the reference test vectors |
| OS grid references | WGS84 ↔ OSGB36 ↔ National Grid, on the device |
| Sunrise/sunset/twilight/golden hour/moon | NOAA algorithms on the device |
| Time zone and local time | tz-lookup on the device |
| Route distance | straight-line fallback, labelled as a straight line |
| Speed limits along a route | once loaded, every limit is held in memory and used by guidance |
| Navigation, next manoeuvre, ETA | position + route + clock, all on the device |
| Trip recording and GPX export | written in the browser; nothing uploaded |
| Sun glare, break reminders | solar maths and your own driving time |
| Live traffic, weather, stopping places, cameras | unavailable until asked for, and each panel says so |
| Air quality, flood warnings and open imagery | unavailable until a place is selected online; no request is made offline |
| Live streets, addresses, POIs, elevation, Wikipedia | unavailable, and the panel says so |

## 7. Embedding it in a card

```html
<div id="mycard-map" style="height:240px"></div>
<script src="maps/embed.js"></script>
<script>
  MostUsefulMaps.mount('#mycard-map', {
    center: [51.8797, -0.4175],   // [lat, lon] or {lat, lon}
    zoom: 11,
    markers: [{ lat: 51.88, lon: -0.42, label: 'Luton' }],
    cities: false,                 // skip the 800 KB gazetteer in the shared DOM
    theme: 'dark'
  });
</script>
```

`MostUsefulMaps` also exposes the engine without a map:
`distance`, `measure`, `pathLength`, `area`, `plusCode`, `gridReference`,
`sunTimes`, `parse`, `searchPlaces`, `loadGazetteer`, `loadCountryFacts`,
`openInFullMap(state)`, plus `mount()` → an instance with `setCenter`,
`setMarkers`, `setPath`, `destroy()`.

`plusCode(lat, lon)` and `gridReference(lat, lon)` both answer with **text**
(`gridReference` is null outside the National Grid), so a card can put the
result straight into the page. For the workings behind a grid reference —
easting, northing, the OSGB36 point and the datum shift it moved by — load
`maps/core/gridref.js` and call `MM.gridref.fromWgs84(lat, lon, 5)`, which
returns the object `gridReference` reads `gridRef` from.

Everything is loaded lazily and relative to the site root, so a card that never
touches a map pays nothing for it. Cards reach it with a relative path
(`maps/embed.js`) — never an absolute URL, which is what `check-links.py` and
`check-egress.py` both expect.

The catalogue entry (`cards/mostusefulmaps.html`) is the worked example: an
offline mini-map, two-point geodesic measurement, Plus Code output, geolocation,
and a deep link into the full page.

A card that wants the driving maths rather than the page can load
`maps/core/speed.js` and `maps/core/drive.js` itself: the limit engine and the
session are plain globals on `MM`, with no DOM and no fetching inside them.

## 8. Testing

`scripts/tests/maps-core.test.js` runs in the normal `npm test` /
`npm run verify:deep` suite (no dependencies, plain `node --test`). It covers:

- Vincenty distances against published figures, bearings, rhumb lines, area,
  bbox and formatting;
- **Plus Codes against the reference project's own conformance vectors**
  (`test_data/encoding.csv`, `decoding.csv`) plus the specification's
  shortening table;
- OS grid reference worked examples;
- sun times, phases and moon phase;
- the offline gazetteer's ranking, folding and interpretation;
- country lookup through the vendored TopoJSON;
- the driving engine: OSM `maxspeed` parsing including the UK's `maxspeed:type`
  vocabulary, vehicle-specific national limits (car, caravan, van, motorhome,
  HGV), the Welsh 20 mph default, time-conditional limits, the 10% + 2 mph
  over-limit threshold, session progress and off-route/replan behaviour, sun
  glare against a known sun position, the OSM-way-to-route speed-limit join and
  its coverage figure, trip maths and GPX export;
- the driving providers: Valhalla polyline decoding and costing options,
  weather read at the hour you would arrive (against a stubbed response), and
  traffic that reports a labelled absence outside London rather than inventing
  a delay;
- the place-enrichment provider declarations and their keyless, attributed
  endpoints (air quality, Environment Agency warnings, Commons and KartaView);
- and a set of page-contract tests: every `maps/*.js` parses, every file
  `maps.html` loads exists, every element `maps/app.js` looks up is defined,
  the driving scripts load in dependency order, the navigation overlay exists
  and starts hidden, and `maps.html` carries no analytics or tracker.

What is **not** covered by CI, because the sandbox and CI have no general
network access: the live tile servers, the geocoders, the routers (including
Valhalla), Overpass, OpenTopoData, TfL, Open-Meteo, Open-Meteo Air Quality, the
Environment Agency feed, Wikimedia Commons and KartaView. Those paths were
written against their documented APIs and are exercised in the browser; if a
service changes shape, `maps/providers.js` is the single place to fix it, and
every one of them degrades to an offline answer.

## 9. Deliberate omissions

- **Satellite imagery.** The good open option (Sentinel-2 cloudless by EOX) is
  licensed non-commercially, which does not fit a site with donations and
  sponsors; commercial imagery contradicts the open-data premise. The relief
  shading in the Fiord style is the compromise.
- **Geocoding by postcode.** Free-form geocoders handle UK postcodes well
  enough, and a full postcode dataset is licensed, not open. `uk-postcode-formatter`
  covers the formatting side.
- **A service worker.** `sw.js` is still unregistered site-wide; adding offline
  caching is a separate decision (see the open questions in CONSTRAINTS.md).

## 10. Regenerating the data

```bash
node scripts/build-maps-data.js --check      # CI-safe: verifies hashes and shapes
node scripts/build-maps-data.js \
  --cities /path/to/all-the-cities/cities.pbf \
  --countries /path/to/world-countries/countries.json \
  --node-path /path/to/pbf/node_modules
```

`pbf@3` is required to read the GeoNames extract; install it outside the
repository (see AGENTS.md §2 — never put `node_modules` in the repo).
