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
                              elevation, Wikipedia — with licences, timeouts and rate limits
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
| Road routing | FOSSGIS (`routing.openstreetmap.de`), then the OSRM demo server | OpenStreetMap, ODbL | when you ask for a route |
| Nearby places | Overpass API (`overpass-api.de`, then `overpass.kumi.systems`) | OpenStreetMap, ODbL | when you press Find nearby |
| Elevation | OpenTopoData `srtm90m` | SRTM, public domain (NASA/USGS) | when a route is drawn |
| Nearby articles | Wikipedia GeoSearch | CC BY-SA 4.0 | when a place is selected |
| Offline places | GeoNames via `all-the-cities` | CC BY 4.0 | never — shipped in `maps/data/` |
| Offline outlines | Natural Earth via `world-atlas` | public domain | never — shipped in `maps/data/` |
| Time zones | `tz-lookup` | CC0 | never — shipped in `maps/vendor/` |

`maps/data/SOURCES.json` records the exact package versions and SHA-256 hashes of
the inputs, and the bytes/rows/hashes of the generated outputs. Attribution is
shown in the map corner, in the Info panel, and on the card.

**Public instances are shared infrastructure.** `maps/providers.js` enforces a
minimum interval between calls per service, caches responses, times out every
request, and never fires anything without a user action. If this page ever gets
real traffic, self-host (Photon, OSRM, Overpass and OpenFreeMap are all
self-hostable) rather than leaning harder on the volunteers.

## 4. Privacy

- No accounts, no cookies, no local storage, no analytics property on
  `maps.html` (the site's analytics footprint is frozen — see CONSTRAINTS.md).
- Nothing is transmitted until the visitor asks for something that needs a
  service, and the Info panel lists exactly which service gets what: search
  words go to a geocoder, two endpoints go to a router, a radius and a point go
  to Overpass, sampled points go to OpenTopoData.
- Geolocation is browser-only: the coordinates are used on the device and are
  never sent anywhere by this page.
- `check-egress.py` does not scan `maps/`, so the providers are classified here
  instead: the live services are class **C** (fetching open data is the
  feature), and the vendored libraries are class **B** shipped locally, not
  fetched from a CDN.

## 5. What works offline

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
| Live streets, addresses, POIs, elevation, Wikipedia | unavailable, and the panel says so |

## 6. Embedding it in a card

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

Everything is loaded lazily and relative to the site root, so a card that never
touches a map pays nothing for it. Cards reach it with a relative path
(`maps/embed.js`) — never an absolute URL, which is what `check-links.py` and
`check-egress.py` both expect.

The catalogue entry (`cards/mostusefulmaps.html`) is the worked example: an
offline mini-map, two-point geodesic measurement, Plus Code output, geolocation,
and a deep link into the full page.

## 7. Testing

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
- and a set of page-contract tests: every `maps/*.js` parses, every file
  `maps.html` loads exists, every element `maps/app.js` looks up is defined,
  and `maps.html` carries no analytics or tracker.

What is **not** covered by CI, because the sandbox and CI have no general
network access: the live tile servers, the geocoders, the routers, Overpass and
OpenTopoData. Those paths were written against their documented APIs and are
exercised in the browser; if a service changes shape, `maps/providers.js` is the
single place to fix it, and every one of them degrades to an offline answer.

## 8. Deliberate omissions

- **Satellite imagery.** The good open option (Sentinel-2 cloudless by EOX) is
  licensed non-commercially, which does not fit a site with donations and
  sponsors; commercial imagery contradicts the open-data premise. The relief
  shading in the Fiord style is the compromise.
- **Geocoding by postcode.** Free-form geocoders handle UK postcodes well
  enough, and a full postcode dataset is licensed, not open. `uk-postcode-formatter`
  covers the formatting side.
- **A service worker.** `sw.js` is still unregistered site-wide; adding offline
  caching is a separate decision (see the open questions in CONSTRAINTS.md).

## 9. Regenerating the data

```bash
node scripts/build-maps-data.js --check      # CI-safe: verifies hashes and shapes
node scripts/build-maps-data.js \
  --cities /path/to/all-the-cities/cities.pbf \
  --countries /path/to/world-countries/countries.json \
  --node-path /path/to/pbf/node_modules
```

`pbf@3` is required to read the GeoNames extract; install it outside the
repository (see AGENTS.md §2 — never put `node_modules` in the repo).
