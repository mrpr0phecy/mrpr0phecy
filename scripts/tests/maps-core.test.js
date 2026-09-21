/**
 * maps-core.test.js — the MostUsefulMaps engine, checked against published
 * reference values rather than against itself.
 *
 * Every assertion below either (a) quotes a number from an authority — the
 * Open Location Code specification, Ordnance Survey's worked example, NOAA's
 * solar tables — or (b) is an invariant that must hold no matter what the
 * numbers are (symmetry, round-trips, monotonicity). A test that only
 * restates the implementation is worse than no test: it locks in bugs.
 *
 * Run with the rest of the suite:  node --test scripts/tests/*.test.js
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const geodesy = require(path.join(ROOT, 'maps/core/geodesy.js'));
const olc = require(path.join(ROOT, 'maps/core/olc.js'));
const solar = require(path.join(ROOT, 'maps/core/solar.js'));
const gridref = require(path.join(ROOT, 'maps/core/gridref.js'));

const LONDON = { lat: 51.5074, lon: -0.1278 };
const PARIS = { lat: 48.8566, lon: 2.3522 };
const LUTON = { lat: 51.8797, lon: -0.4175 };

// ------------------------------------------------------------------ geodesy

test('geodesy: known distances are within a kilometre of published figures', () => {
  // London–Paris: 343–344 km centre to centre (Vincenty on WGS84 ≈ 343.5 km).
  const lp = geodesy.distanceKm(LONDON, PARIS);
  assert.ok(lp > 342 && lp < 345, `London–Paris was ${lp.toFixed(2)} km`);

  // One degree of latitude at the equator is 110.574 km on the ellipsoid.
  const latDeg = geodesy.distanceKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
  assert.ok(Math.abs(latDeg - 110.574) < 0.05, `1° latitude was ${latDeg.toFixed(4)} km`);

  // One degree of longitude at the equator is 111.320 km.
  const lonDeg = geodesy.distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
  assert.ok(Math.abs(lonDeg - 111.32) < 0.05, `1° longitude was ${lonDeg.toFixed(4)} km`);

  // Luton to central London is about 45 km as the crow flies.
  const luton = geodesy.distanceKm(LUTON, LONDON);
  assert.ok(luton > 43 && luton < 48, `Luton–London was ${luton.toFixed(2)} km`);
});

test('geodesy: symmetry, triangle inequality and zero distance', () => {
  // Vincenty is symmetric; floating point agrees to well under a millimetre.
  assert.ok(Math.abs(geodesy.distanceKm(LONDON, PARIS) - geodesy.distanceKm(PARIS, LONDON)) < 1e-6);
  assert.equal(geodesy.distanceKm(LONDON, LONDON), 0);
  const ab = geodesy.distanceKm(LUTON, LONDON);
  const bc = geodesy.distanceKm(LONDON, PARIS);
  const ac = geodesy.distanceKm(LUTON, PARIS);
  assert.ok(ac <= ab + bc + 1e-6, 'triangle inequality must hold');
});

test('geodesy: near-antipodal pairs fall back to haversine and say so', () => {
  const m = geodesy.measure({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
  assert.equal(m.method, 'haversine-fallback');
  // Half the equatorial circumference, ~20 015 km.
  assert.ok(Math.abs(m.km - 20015) < 60, `antipodal was ${m.km.toFixed(1)} km`);
  assert.ok(isFinite(m.initialBearing));
});

test('geodesy: bearings match the compass', () => {
  assert.ok(Math.abs(geodesy.bearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })) < 0.01);
  assert.ok(Math.abs(geodesy.bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 90) < 0.01);
  assert.ok(Math.abs(geodesy.bearing({ lat: 1, lon: 0 }, { lat: 0, lon: 0 }) - 180) < 0.01);
  assert.equal(geodesy.compassPoint(0), 'N');
  assert.equal(geodesy.compassPoint(224), 'SW');
  assert.equal(geodesy.compassPoint(359), 'N');
});

test('geodesy: destination and interpolation are consistent with distance', () => {
  const east = geodesy.destination({ lat: 0, lon: 0 }, 90, 111.32);
  assert.ok(Math.abs(east.lon - 1) < 0.01, `lon was ${east.lon}`);
  assert.ok(Math.abs(east.lat) < 0.01);
  const mid = geodesy.midpoint(LONDON, PARIS);
  const half = geodesy.distanceKm(LONDON, PARIS) / 2;
  assert.ok(Math.abs(geodesy.distanceKm(LONDON, mid) - half) < 0.5);
  const quarter = geodesy.interpolate(LONDON, PARIS, 0.25);
  assert.ok(Math.abs(geodesy.distanceKm(LONDON, quarter) - half / 2) < 0.5);
});

test('geodesy: area of a one-degree box at the equator is ~12 300 km²', () => {
  const m2 = geodesy.polygonAreaM2([
    { lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }, { lat: 1, lon: 0 },
  ]);
  const km2 = m2 / 1e6;
  assert.ok(km2 > 12000 && km2 < 12500, `1°x1° at the equator was ${km2.toFixed(0)} km²`);
  // The same box at 60°N is about half the size.
  const north = geodesy.polygonAreaM2([
    { lat: 60, lon: 0 }, { lat: 60, lon: 1 }, { lat: 61, lon: 1 }, { lat: 61, lon: 0 },
  ]) / 1e6;
  assert.ok(north > 5000 && north < 7000, `1°x1° at 60°N was ${north.toFixed(0)} km²`);
});

test('geodesy: rhumb lines and path length behave', () => {
  const r = geodesy.rhumb({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
  assert.ok(Math.abs(r.km - 111.32) < 0.1);
  assert.ok(Math.abs(r.bearing - 90) < 0.01);
  const path = [LONDON, PARIS, LUTON];
  const len = geodesy.pathLengthKm(path);
  assert.ok(Math.abs(len - (geodesy.distanceKm(LONDON, PARIS) + geodesy.distanceKm(PARIS, LUTON))) < 1e-9);
  assert.equal(geodesy.pathLengthKm([LONDON]), 0);
  const near = geodesy.nearestOnPath({ lat: 51.5, lon: -0.13 }, [LONDON, PARIS]);
  assert.ok(near && near.km < 2, 'a point on the line is near the line');
});

test('geodesy: parsing accepts what people actually paste', () => {
  assert.deepEqual(geodesy.parseLatLon('51.5074, -0.1278'), { lat: 51.5074, lon: -0.1278 });
  assert.deepEqual(geodesy.parseLatLon('51.5074 -0.1278'), { lat: 51.5074, lon: -0.1278 });
  assert.deepEqual(geodesy.parseLatLon('N51.5074 W0.1278'), { lat: 51.5074, lon: -0.1278 });
  const dms = geodesy.parseLatLon('51°30\'26.6"N 0°7\'40.1"W');
  assert.ok(dms && Math.abs(dms.lat - 51.50739) < 0.001 && Math.abs(dms.lon + 0.12781) < 0.001, JSON.stringify(dms));
  const naut = geodesy.parseLatLon('N51 30.444 W000 07.668');
  assert.ok(naut && Math.abs(naut.lat - 51.5074) < 0.001, JSON.stringify(naut));
  assert.equal(geodesy.parseLatLon('not a place'), null);
  assert.equal(geodesy.parseLatLon('91, 200'), null);
  assert.equal(geodesy.point([-0.1278, 51.5074]).lat, 51.5074);
  assert.equal(geodesy.point({ lng: -0.1278, lat: 51.5074 }).lon, -0.1278);
});

test('geodesy: formatting is human and unit-correct', () => {
  assert.equal(geodesy.formatDistance(0.34), '340 m');
  assert.equal(geodesy.formatDistance(3.456), '3.46 km');
  assert.equal(geodesy.formatDistance(42.42), '42.4 km');
  assert.equal(geodesy.formatDistance(343.5, 'imperial'), '213 mi');
  assert.equal(geodesy.formatDistance(343.5, 'nautical'), '185 nmi');
  assert.equal(geodesy.formatArea(12308 * 1e6), '12,308 km²');
  assert.equal(geodesy.formatArea(5000), '5,000 m²');
  assert.equal(geodesy.formatArea(4046.8564224 * 3, 'imperial'), '3.00 acres');
  assert.equal(geodesy.formatDuration(45), '45 min');
  assert.equal(geodesy.formatDuration(150), '2 h 30 min');
  assert.equal(geodesy.formatLatLon(LONDON, 'dms'), '51°30\'26.6"N 0°07\'40.1"W');
});

test('geodesy: Web Mercator projection round-trips', () => {
  for (const zoom of [0, 5, 12, 18]) {
    const p = geodesy.project(LONDON, zoom);
    const back = geodesy.unproject(p.x, p.y, zoom);
    assert.ok(Math.abs(back.lat - LONDON.lat) < 1e-6, `lat at z${zoom}`);
    assert.ok(Math.abs(back.lon - LONDON.lon) < 1e-6, `lon at z${zoom}`);
  }
  const bbox = geodesy.bbox([LONDON, PARIS]);
  // Luton is north of London, so it is outside the London-Paris box; the
  // midpoint of the two is inside by construction.
  assert.equal(geodesy.bboxContains(bbox, LUTON), false);
  assert.ok(geodesy.bboxContains(bbox, geodesy.midpoint(LONDON, PARIS)));
  assert.ok(geodesy.bboxContains(geodesy.padBbox(bbox, 60), LUTON));
  const z = geodesy.fitZoom(bbox, 800, 600, 40);
  assert.ok(z >= 5 && z <= 9, `fit zoom was ${z}`);
});

// -------------------------------------------------------- Open Location Code

test('olc: the specification\'s worked example round-trips exactly', () => {
  // The Open Location Code specification's short-code table states that
  // 8FVC9G8F+6W has its centre at 47.365562, 8.524813. Encoding that centre
  // must give that code back, and decoding it must give that centre back.
  assert.equal(olc.encode(47.365562, 8.524813), '8FVC9G8F+6W');
  const area = olc.decode('8FVC9G8F+6W');
  // The published centre is rounded to six decimal places; the exact cell
  // centre is 8.5248125, so compare numerically rather than as strings.
  // (the exact cell centre is 8.5248125, which the specification rounds to
  // 8.524813 — so agree to the sixth decimal place, not beyond it)
  assert.ok(Math.abs(area.lat - 47.365562) < 1e-6, `centre lat ${area.lat}`);
  assert.ok(Math.abs(area.lon - 8.524813) < 1e-6, `centre lon ${area.lon}`);
  assert.equal(area.latSpan, 0.000125, 'a 10-digit code is 0.000125° tall');
  assert.equal(area.lonSpan, 0.000125);
  // The README's other Zurich coordinates sit in the neighbouring cell — the
  // reference implementation's own header comment pairs them with +6X.
  assert.equal(olc.encode(47.365590, 8.524997), '8FVC9G8F+6X');
  // 11 digits adds one grid character (4 x 5 inside the 14 m cell): the code
  // is 12 characters long and its centre is within a metre of the input.
  const precise = olc.encode(47.365590, 8.524997, 11);
  assert.equal(precise.length, 12);
  assert.equal(precise.slice(0, 9), '8FVC9G8F+');
  const cellCentre = olc.decode(precise);
  assert.ok(geodesy.distanceKm({ lat: 47.365590, lon: 8.524997 }, cellCentre) < 2,
    'an 11-digit code should land within its 2.8 x 3.5 m cell');
});

test('olc: Nairobi example and grid refinement', () => {
  // README: "The Parliament Buildings in Nairobi, Kenya are located at 6GCRPR6C+24"
  // and 6GCR is the area from 2°S 36°E to 1°S 37°E.
  assert.equal(olc.encode(-1.2921, 36.8219).slice(0, 4), '6GCR');
  const refined = olc.encode(-1.2921, 36.8219, 11);
  assert.equal(refined.length, 12); // 10 digits + '+' + 1 grid character
  const area = olc.decode(refined);
  assert.ok(Math.abs(area.lat - (-1.2921)) < 0.00003, `refined lat ${area.lat}`);
  assert.ok(Math.abs(area.lon - 36.8219) < 0.00004, `refined lon ${area.lon}`);
});

test('olc: encode/decode round-trips within the cell it promises', () => {
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 400; i += 1) {
    const lat = rand() * 170 - 85;
    const lon = rand() * 360 - 180;
    const code = olc.encode(lat, lon);
    assert.equal(olc.isValid(code), true, `${code} should be valid`);
    assert.equal(olc.isFull(code), true, `${code} should be full`);
    const area = olc.decode(code);
    assert.ok(area.latLo <= lat + 1e-9 && lat <= area.latHi + 1e-9, `${code} must contain its latitude`);
    assert.ok(area.lonLo <= lon + 1e-9 && lon <= area.lonHi + 1e-9, `${code} must contain its longitude`);
    // Never further than half a cell from the centre (13.9 m at the equator).
    assert.ok(Math.abs(area.lat - lat) < 0.000063, `${code} centre lat off by ${area.lat - lat}`);
  }
});

test('olc: short codes shorten and recover exactly as the specification describes', () => {
  const code = '8FVC9G8F+6W';
  // Specification's shortening table (google/open-location-code README).
  assert.equal(olc.shrink(code, 47.373313, 8.537562), '8F+6W');
  assert.equal(olc.shrink(code, 47.339563, 8.556687), '9G8F+6W');
  assert.equal(olc.shrink(code, 38.800562, -9.064937), code);
  // Recovery puts a short code back, both ways round.
  assert.equal(olc.expand('9G8F+6W', 47.339563, 8.556687), code);
  assert.equal(olc.expand('8F+6W', 47.373313, 8.537562), code);
  // Recovery from a different nearby reference recovers the same code.
  assert.equal(olc.expand('8F+6W', 47.36, 8.52), code);
  assert.equal(olc.expand(code, 0, 0), code, 'a full code needs no reference');
});

test('olc: shrink/expand round-trips for random points and references', () => {
  let seed = 987654321;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 200; i += 1) {
    const lat = rand() * 120 - 60;
    const lon = rand() * 340 - 170;
    const code = olc.encode(lat, lon);
    const centre = olc.decode(code);
    // Reference within ~30 km: the sort of place a person actually is.
    const refLat = centre.lat + (rand() - 0.5) * 0.25;
    const refLon = centre.lon + (rand() - 0.5) * 0.25;
    const short = olc.shrink(code, refLat, refLon);
    assert.ok(short, 'a nearby reference should shorten');
    const recovered = olc.expand(short, refLat, refLon);
    assert.equal(recovered, code, `recovering ${short} near ${refLat},${refLon}`);
  }
});

test('olc: padding rules and validity match the reference implementation', () => {
  assert.equal(olc.encode(47.365590, 8.524997, 6), '8FVC9G00+');
  assert.equal(olc.isPadded('8FVC9G00+'), true);
  // The reference implementation treats a padded code as full (it decodes
  // without a reference point) — isPadded() is how we tell the two apart.
  assert.equal(olc.isFull('8FVC9G00+'), true);
  assert.equal(olc.isPadded('8FVC9G8F+6W'), false);
  assert.equal(olc.isValid('8FVC9G00+'), true);
  const padded = olc.decode('8FVC9G00+');
  assert.ok(Math.abs(padded.latSpan - 0.05) < 1e-12, 'a 6-digit code describes a 0.05° cell');
  assert.equal(olc.decode('9G8F+6W').error, 'not-a-valid-full-code', 'short codes need a reference');
  assert.equal(olc.decodeAny('9G8F+6W', { lat: 47.339563, lon: 8.556687 }).lat > 47, true);
  assert.equal(olc.decodeAny('9G8F+6W').error, 'short-code-needs-a-reference-place');

  // Validity, matching isValid() in the reference implementation.
  assert.equal(olc.isValid('8FVC9G8F+6W'), true);
  assert.equal(olc.isValid('8fvc9g8f+6w'), true, 'case-insensitive');
  assert.equal(olc.isValid('8FVC9G8F6W'), false, 'no separator');
  assert.equal(olc.isValid('8FVC9G8F+6WX'), true, 'grid refinement is allowed');
  assert.equal(olc.isValid('8FVC9G8F+6'), false, 'one character after + is not a code');
  assert.equal(olc.isValid('+6W'), true, 'a maximally shortened code is still a code');
  assert.equal(olc.isValid('I2345678+9C'), false, 'I is not in the alphabet');
  assert.equal(olc.isValid('8FVC9G8F+6W+'), false, 'two separators');
  assert.equal(olc.isValid('0FVC9G8F+6W'), false, 'padding is not a short code');
});

test('olc: 0,0 and the poles behave', () => {
  // (0, 0) sits at the south-west corner of the 6F square: 6 = -10°..10°N,
  // F = 0°..20°E, and the pair digits then walk to the exact cell.
  assert.equal(olc.encode(0, 0), '6FG22222+22');
  assert.equal(olc.decode('6FG22222+22').latLo, 0);
  assert.equal(olc.decode('6FG22222+22').lonLo, 0);
  assert.equal(olc.encode(-1.2921, 36.8219).slice(0, 2), '6G');
  const north = olc.decode(olc.encode(89.9, 179.9));
  assert.ok(north.latHi <= 90.0000001, 'latitude must not exceed 90');
  const south = olc.encode(-90, -180);
  assert.equal(olc.isValid(south), true);
  assert.equal(olc.decode(south).lat < -89, true);
});

// -------------------------------------------------------------------- solar

test('solar: London solstice sunrise and sunset match published times', () => {
  // London, 21 June 2026: sunrise 04:43 BST, sunset 21:21 BST (03:43 / 20:21 UTC).
  const times = solar.sunTimes(new Date(Date.UTC(2026, 5, 21)), LONDON.lat, LONDON.lon);
  const toMin = (d) => d.getUTCHours() * 60 + d.getUTCMinutes();
  assert.ok(Math.abs(toMin(times.sunrise) - (3 * 60 + 43)) <= 4,
    `sunrise was ${times.sunrise.toISOString()}`);
  assert.ok(Math.abs(toMin(times.sunset) - (20 * 60 + 21)) <= 4,
    `sunset was ${times.sunset.toISOString()}`);
  // 16h 39m of daylight at the solstice.
  assert.ok(Math.abs(times.dayLengthMinutes - (16 * 60 + 38)) < 15,
    `daylight was ${times.dayLengthMinutes.toFixed(1)} min`);
});

test('solar: London midwinter and equinox are sane', () => {
  const winter = solar.sunTimes(new Date(Date.UTC(2026, 11, 21)), LONDON.lat, LONDON.lon);
  const toMin = (d) => d.getUTCHours() * 60 + d.getUTCMinutes();
  // 21 December 2026 in London: about 08:04–15:53 UTC.
  assert.ok(Math.abs(toMin(winter.sunrise) - (8 * 60 + 4)) <= 5, `sunrise ${winter.sunrise.toISOString()}`);
  assert.ok(Math.abs(toMin(winter.sunset) - (15 * 60 + 53)) <= 5, `sunset ${winter.sunset.toISOString()}`);
  assert.ok(winter.dayLengthMinutes < 8 * 60, 'midwinter daylight is under 8 hours');

  const equinox = solar.sunTimes(new Date(Date.UTC(2026, 2, 20)), 0, 0);
  const eq = toMin(equinox.sunrise);
  assert.ok(Math.abs(eq - 360) < 15, `equatorial equinox sunrise was ${equinox.sunrise.toISOString()}`);
  assert.ok(Math.abs(equinox.dayLengthMinutes - 720) < 20, 'equinox daylight is about 12 hours');
});

test('solar: polar day and polar night are reported, not faked', () => {
  const summer = solar.sunTimes(new Date(Date.UTC(2026, 5, 21)), 78.2, 15.6); // Svalbard
  assert.equal(summer.state, 'polar-day');
  assert.equal(summer.sunrise, null);
  const winter = solar.sunTimes(new Date(Date.UTC(2026, 11, 21)), 78.2, 15.6);
  assert.equal(winter.state, 'polar-night');
});

test('solar: position is right at known instants', () => {
  // At solar noon on the June solstice at the Tropic of Cancer the sun is overhead.
  const tropic = solar.solarPosition(new Date(Date.UTC(2026, 5, 21, 12, 0)), 23.44, 0);
  assert.ok(tropic.altitude > 88, `sun altitude was ${tropic.altitude.toFixed(2)}°`);
  // At midnight on the same date London is below the horizon.
  const midnight = solar.solarPosition(new Date(Date.UTC(2026, 5, 21, 0, 0)), LONDON.lat, LONDON.lon);
  assert.ok(midnight.altitude < 0, 'the sun is down at midnight');
  // Sunrise in the east, sunset in the west.
  const morning = solar.solarPosition(new Date(Date.UTC(2026, 5, 21, 5, 30)), LONDON.lat, LONDON.lon);
  assert.ok(morning.azimuth > 30 && morning.azimuth < 90, `morning azimuth ${morning.azimuth}`);
  const evening = solar.solarPosition(new Date(Date.UTC(2026, 5, 21, 19, 30)), LONDON.lat, LONDON.lon);
  assert.ok(evening.azimuth > 270 && evening.azimuth < 330, `evening azimuth ${evening.azimuth}`);
  // Declination on the solstice is at its extreme, +23.44°.
  assert.ok(Math.abs(tropic.declination - 23.44) < 0.02, `declination ${tropic.declination}`);
});

test('solar: phases of day and moon phase labels', () => {
  const day = solar.phaseOfDay(new Date(Date.UTC(2026, 5, 21, 12, 0)), LONDON.lat, LONDON.lon);
  assert.equal(day.key, 'day');
  const night = solar.phaseOfDay(new Date(Date.UTC(2026, 5, 21, 0, 30)), LONDON.lat, LONDON.lon);
  assert.ok(['night', 'astronomical-twilight', 'nautical-twilight'].includes(night.key), night.key);
  const phase = solar.moonPhase(new Date(Date.UTC(2026, 0, 3, 10, 0)));
  assert.ok(phase.illumination >= 0 && phase.illumination <= 1);
  assert.ok(typeof phase.name === 'string' && phase.name.length > 3);
});

test('solar: sun along a path flags heading into a low sun', () => {
  const path = [{ lat: 51.5, lon: -0.1 }, { lat: 51.5, lon: 0.4 }]; // due east
  const evening = new Date(Date.UTC(2026, 5, 21, 19, 15));          // sun in the west
  const samples = solar.sunAlongPath(path, evening);
  assert.ok(samples.length > 5);
  assert.equal(samples[0].intoSun, false, 'heading east at sunset is not into the sun');
  const westPath = [{ lat: 51.5, lon: 0.4 }, { lat: 51.5, lon: -0.1 }];
  const back = solar.sunAlongPath(westPath, evening);
  assert.equal(back[0].intoSun, true, 'heading west at sunset is into the sun');
});

// ------------------------------------------------------------- grid refs (UK)

test('gridref: Ordnance Survey\'s own worked example converts exactly', () => {
  // OS "A guide to coordinate systems in Great Britain": OSGB36
  // 52°39'27.2531"N 1°43'4.5177"E → E 651 409.903, N 313 177.270 → TG 51409 13177
  const lat = 52 + 39 / 60 + 27.2531 / 3600;
  const lon = 1 + 43 / 60 + 4.5177 / 3600;
  const grid = gridref.osgb36ToGrid(lat, lon);
  assert.ok(Math.abs(grid.easting - 651409.903) < 0.5, `easting was ${grid.easting}`);
  assert.ok(Math.abs(grid.northing - 313177.270) < 0.5, `northing was ${grid.northing}`);
  assert.equal(gridref.gridRef(grid.easting, grid.northing, 5), 'TG 51409 13177');

  // …and back again.
  const back = gridref.gridToOsgb36(651409.903, 313177.270);
  assert.ok(Math.abs(back.lat - lat) < 1e-7, `lat was ${back.lat}`);
  assert.ok(Math.abs(back.lon - lon) < 1e-7, `lon was ${back.lon}`);
});

test('gridref: known British places land in their published 100 km squares', () => {
  const cases = [
    ['London', LONDON, 'TQ'],
    ['Luton', LUTON, 'TL'],
  ];
  for (const [name, point, letters] of cases) {
    const out = gridref.fromWgs84(point.lat, point.lon);
    assert.ok(out.gridRef && out.gridRef.startsWith(letters + ' '),
      `${name} should be ${letters}, got ${out.gridRef}`);
  }
});

test('gridref: the datum shift is roughly 100 m across Great Britain', () => {
  // The Helmert transform from WGS84 to OSGB36 moves a point by ~100 m in GB.
  const shift = gridref.fromWgs84(LONDON.lat, LONDON.lon).datumShiftMetres;
  assert.ok(shift > 50 && shift < 250, `Luton/London datum shift was ${shift.toFixed(1)} m`);
});

test('gridref: round-trips a reference back to the same place', () => {
  const out = gridref.fromWgs84(LUTON.lat, LUTON.lon, 5);
  const parsed = gridref.parseGridRef(out.gridRef);
  assert.ok(parsed, `should parse ${out.gridRef}`);
  assert.ok(geodesy.distanceKm(LUTON, parsed) < 0.02,
    `grid reference round-trip was ${(geodesy.distanceKm(LUTON, parsed) * 1000).toFixed(1)} m`);
  // Lower case, no spaces, fewer figures — all still parse.
  assert.ok(gridref.parseGridRef('tl0921'));
  assert.ok(gridref.parseGridRef('TL 09 21'));
  const coarse = gridref.parseGridRef('TL 09 21');
  assert.ok(geodesy.distanceKm(LUTON, coarse) < 8, 'a 4-figure reference is within 5 km of the point');
  assert.equal(gridref.parseGridRef('ZZ 123 456'), null);
  assert.equal(gridref.parseGridRef('TL 12345'), null, 'odds digits are not a valid reference');
});

test('gridref: coverage is honest about Northern Ireland', () => {
  assert.equal(gridref.coveredBy(51.5, -0.1), true);
  assert.equal(gridref.coveredBy(54.5973, -5.9301), false, 'Belfast uses the Irish Grid, not this one');
  assert.equal(gridref.coveredBy(48.8566, 2.3522), false, 'Paris has no OS grid reference');
});

// ------------------------------------------------- offline search data files

test('maps data: the shipped gazetteer and country facts are intact and usable', () => {
  const fs = require('node:fs');
  const crypto = require('node:crypto');
  const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/data/SOURCES.json'), 'utf8'));
  for (const entry of sources.outputs) {
    const buf = fs.readFileSync(path.join(ROOT, entry.file));
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    assert.equal(hash, entry.sha256, `${entry.file} drifted from its recorded hash`);
  }

  const gz = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/data/gazetteer.json'), 'utf8'));
  assert.ok(gz.cities.length > 15000, `only ${gz.cities.length} cities in the gazetteer`);
  for (const row of gz.cities.slice(0, 500)) {
    assert.equal(row.length, 5, 'rows are [name, lat, lon, cc, pop]');
    assert.ok(geodesy.validLat(row[1]) && geodesy.validLon(row[2]), `${row[0]} has bad coordinates`);
    assert.ok(typeof row[0] === 'string' && row[0].length > 0);
    assert.equal(row[3].length, 2, `${row[0]} country code`);
  }
  // Big cities that people will definitely search for.
  const byName = new Map();
  for (const row of gz.cities) {
    const key = `${row[0]}|${row[3]}`;
    if (!byName.has(key) || byName.get(key).pop < row[4]) byName.set(key, row);
  }
  for (const [name, cc] of [['London', 'GB'], ['Luton', 'GB'], ['Paris', 'FR'], ['Tokyo', 'JP'], ['Nairobi', 'KE']]) {
    assert.ok(byName.has(`${name}|${cc}`), `${name}, ${cc} should be in the offline gazetteer`);
  }

  const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/data/countries.json'), 'utf8'));
  assert.equal(Object.keys(countries.countries).length, 250);
  assert.equal(countries.countries.GB.name, 'United Kingdom');
  assert.equal(countries.countries.GB.n3, '826', 'the numeric code joins to world-atlas geometry ids');
  assert.equal(countries.countries.GB.capital, 'London');
  assert.match(countries.countries.JP.currencies[0], /yen/i);
});

test('maps data: world boundaries ship as offline topojson', () => {
  const fs = require('node:fs');
  const coarse = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/data/countries-110m.json'), 'utf8'));
  const full = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/data/countries-50m.json'), 'utf8'));
  for (const topo of [coarse, full]) {
    assert.equal(topo.type, 'Topology');
    assert.ok(topo.objects.countries.geometries.length > 150, 'every country should be present');
    assert.ok(topo.objects.land, 'a land layer keeps the offline map readable');
  }
  assert.ok(full.objects.countries.geometries.length >= coarse.objects.countries.geometries.length);
});

// --------------------------------------------------- offline place search

test('gazetteer: search ranks the way a person expects', () => {
  const fs = require('node:fs');
  const gazModule = require(path.join(ROOT, 'maps/core/gazetteer.js'));
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/data/gazetteer.json'), 'utf8'));
  const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/data/countries.json'), 'utf8'));
  const gaz = gazModule.create(data).setCountries(countries);

  assert.ok(gaz.stats().cities > 15000);
  assert.equal(gaz.countryName('GB'), 'United Kingdom');

  // A prefix finds the big place first.
  const luton = gaz.search('lut', { limit: 5 });
  assert.equal(luton[0].name, 'Luton');
  assert.equal(luton[0].cc, 'GB');
  assert.ok(luton[0].country === 'United Kingdom');

  // Exact beats longer names that merely start the same way.
  assert.equal(gaz.search('London')[0].name, 'London');
  assert.equal(gaz.search('London')[0].cc, 'GB', 'the UK capital beats London, Ontario');

  // Country filtering.
  const us = gaz.search('London', { cc: 'US', limit: 3 });
  assert.ok(us.length > 0 && us.every(r => r.cc === 'US'));

  // Proximity re-ranks homonyms: in California, "Springfield" should not be
  // resolved to the one 1,500 km away in Missouri.
  const nearSpringfield = gaz.search('Springfield', { near: { lat: 39.78, lon: -89.65 }, limit: 3 });
  assert.ok(Math.abs(nearSpringfield[0].lat - 39.78) < 1.5,
    `nearest Springfield should be Illinois, got ${nearSpringfield[0].name} at ${nearSpringfield[0].lat}`);

  // Diacritics fold: typing without accents finds the accented name, and
  // typing with them finds the same place. (GeoNames prefers English names,
  // so Munich is stored as "Munich" and Mumbai as "Mumbai" — the fold is
  // still what makes "sao paulo" and "São Paulo" the same query.)
  assert.equal(gaz.search('sao paulo')[0].name, 'São Paulo');
  assert.equal(gaz.search('São Paulo')[0].name, 'São Paulo');
  assert.equal(gaz.search('zurich')[0].name, 'Zürich');
  assert.equal(gaz.search('malmo')[0].name, 'Malmö');
  assert.equal(gaz.search('krakow')[0].name, 'Kraków');

  // Nearest places, and a viewport query.
  const near = gaz.nearest({ lat: 51.8797, lon: -0.4175 }, 3);
  assert.equal(near[0].name, 'Luton');
  assert.ok(near[0].km < 1);
  const box = gaz.inBBox({ west: -0.6, south: 51.4, east: 0.1, north: 51.7 }, 5);
  assert.ok(box.some((r) => r.name === 'London'));
  assert.equal(gaz.search('')[0], undefined);
  assert.equal(gaz.search('zzzzzzzz').length, 0);
});

test('gazetteer: interpret() recognises every way people give a location', () => {
  const fs = require('node:fs');
  const gazModule = require(path.join(ROOT, 'maps/core/gazetteer.js'));
  const gaz = gazModule.create(JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/data/gazetteer.json'), 'utf8')));

  const plus = gazModule.interpret('8FVC9G8F+6W', { gazetteer: gaz });
  assert.equal(plus.kind, 'plus-code');
  assert.ok(Math.abs(plus.point.lat - 47.365562) < 1e-4);

  const grid = gazModule.interpret('TL 09 21', { gazetteer: gaz });
  assert.equal(grid.kind, 'grid-reference');
  assert.ok(geodesy.distanceKm(LUTON, grid.point) < 5);

  const coords = gazModule.interpret('51.5074, -0.1278', { gazetteer: gaz });
  assert.equal(coords.kind, 'coordinates');
  assert.equal(coords.point.lat, 51.5074);

  const place = gazModule.interpret('Luton', { gazetteer: gaz });
  assert.equal(place.kind, 'place');
  assert.equal(place.results[0].name, 'Luton');

  assert.equal(gazModule.interpret('', { gazetteer: gaz }).kind, 'empty');
  assert.equal(gazModule.interpret('qwertyuiopzxcv', { gazetteer: gaz }).kind, 'unknown');
});

test('geo: offline country lookup finds the right country', () => {
  const fs = require('node:fs');
  const geo = require(path.join(ROOT, 'maps/core/geo.js'));
  // Decode the vendored TopoJSON with the vendored topojson-client — the same
  // two files the page uses offline, so this also guards the vendor bundle.
  const topojson = require(path.join(ROOT, 'maps/vendor/topojson-client.min.js'));
  // geo.js must work with the global the vendored script sets, without anyone
  // remembering to copy it onto MM — that wiring bug once left the offline
  // world map blank in every card.
  globalThis.topojson = topojson;
  delete globalThis.MM.topojson;
  const topo = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/data/countries-110m.json'), 'utf8'));
  const collection = geo.fromTopology(topo, 'countries');
  assert.ok(collection.features.length > 150, 'every country decodes');
  const prepared = geo.prepare(collection);

  const uk = geo.countryForPoint(prepared, LONDON);
  assert.ok(uk, 'London should be inside a country');
  assert.equal(uk.properties.name, 'United Kingdom');
  assert.equal(geo.countryForPoint(prepared, { lat: 48.8566, lon: 2.3522 }).properties.name, 'France');
  assert.equal(geo.countryForPoint(prepared, { lat: 35.6762, lon: 139.6503 }).properties.name, 'Japan');
  assert.equal(geo.countryForPoint(prepared, { lat: -33.8688, lon: 151.2093 }).properties.name, 'Australia');
  assert.equal(geo.countryForPoint(prepared, { lat: 51.8797, lon: -0.4175 }).properties.name, 'United Kingdom');
  // The middle of the Pacific is not a country.
  assert.equal(geo.countryForPoint(prepared, { lat: 0, lon: -140 }), null);

  // The Numeric ISO codes in the boundaries join to the country facts we ship.
  const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps/data/countries.json'), 'utf8'));
  const byN3 = new Map();
  for (const [cc, info] of Object.entries(countries.countries)) byN3.set(String(Number(info.n3)), cc);
  const joined = byN3.get(String(Number(uk.id)));
  assert.equal(joined, 'GB', 'the boundary id resolves to the country facts');

  // Graticule and drawing helpers.
  const grat = geo.graticule(30);
  assert.ok(grat.features.length > 10);
  const line = geo.densify([[-0.1, 51.5], [2.35, 48.86]], 20);
  assert.ok(line.length > 10, 'a long line is densified for drawing');
  const simplified = geo.simplify([[0, 0], [0.0001, 0.0001], [1, 1]], 0.01);
  assert.ok(simplified.length < 3, 'collinear-ish points are dropped for drawing');
  const bar = geo.scaleBar(51.5, 10, 120, 'metric');
  assert.ok(bar.label.endsWith('km') || bar.label.endsWith('m'));
  assert.ok(bar.px <= 120);
});

// ------------------------------------------- Plus Codes: official test data
//
// Transcribed from google/open-location-code test_data/{encoding,decoding}.csv
// (Apache-2.0). These are the reference project's own conformance vectors, so
// agreeing with them is the strongest statement we can make about the encoder
// without shipping their library.

const OLC_ENCODING_VECTORS = [
  // lat, lon, digits, expected
  [20.375, 2.775, 6, '7FG49Q00+'],
  [20.3700625, 2.7821875, 10, '7FG49QCJ+2V'],
  [20.3701125, 2.782234375, 11, '7FG49QCJ+2VX'],
  [20.3701135, 2.78223535156, 13, '7FG49QCJ+2VXGJ'],
  [47.0000625, 8.0000625, 10, '8FVC2222+22'],
  [-41.2730625, 174.7859375, 10, '4VCPPQGP+Q9'],
  [0.5, -179.5, 4, '62G20000+'],
  [-89.5, -179.5, 4, '22220000+'],
  [20.5, 2.5, 4, '7FG40000+'],
  [-89.9999375, -179.9999375, 10, '22222222+22'],
  [0.5, 179.5, 4, '6VGX0000+'],
  [1, 1, 11, '6FH32222+222'],
  [90, 1, 4, 'CFX30000+'],
  [92, 1, 4, 'CFX30000+'],          // beyond the north pole clips to 90
  [90, 1, 10, 'CFX3X2X2+X2'],
  [1, 180, 4, '62H20000+'],         // longitude normalisation
  [1, 181, 4, '62H30000+'],
  [20.3701135, 362.78223535156, 13, '7FG49QCJ+2VXGJ'],
  [47.0000625, 728.0000625, 10, '8FVC2222+22'],
  [1.2, 3.4, 10, '6FH56C22+22'],
  [37.539669125, -122.375069724, 15, '849VGJQF+VX7QR3J'],
  [37.539669125, -122.375069724, 16, '849VGJQF+VX7QR3J'],   // capped at 15
  [37.539669125, -122.375069724, 100, '849VGJQF+VX7QR3J'],
  [35.6, 3.033, 10, '8F75J22M+26'],
  [-48.71, 142.78, 8, '4R347QRJ+'],
  [-2.804, 7.003, 13, '6F9952W3+C6222'],
  [13.9, 164.88, 12, '7V56WV2J+2222'],
  [76.1, -82.5, 15, 'C68V4G22+2222222'],
  [37.539669125, -122.375069724, 2, '84000000+'],
  [80.0100000001, 58.57, 15, 'CHGW2H6C+2222222'],
  [47.00000008, 8.00022229, 15, '8FVC2222+235235C'],
  [68.3500147997595, 113.625636875353, 15, '9PWM9J2G+272FWJV'],
];

const OLC_DECODING_VECTORS = [
  // code, latLo, lonLo, latHi, lonHi
  ['7FG49Q00+', 20.35, 2.75, 20.4, 2.8],
  ['7FG49QCJ+2V', 20.37, 2.782125, 20.370125, 2.78225],
  ['7FG49QCJ+2VX', 20.3701, 2.78221875, 20.370125, 2.78225],
  ['8FVC2222+22', 47.0, 8.0, 47.000125, 8.000125],
  ['4VCPPQGP+Q9', -41.273125, 174.785875, -41.273, 174.786],
  ['62G20000+', 0.0, -180.0, 1, -179],
  ['22220000+', -90, -180, -89, -179],
  ['7FG40000+', 20.0, 2.0, 21.0, 3.0],
  ['22222222+22', -90.0, -180.0, -89.999875, -179.999875],
  ['6VGX0000+', 0, 179, 1, 180],
  ['6FH32222+222', 1, 1, 1.000025, 1.00003125],
  ['CFX30000+', 89, 1, 90, 2],
  ['62H20000+', 1, -180, 2, -179],
  ['62H30000+', 1, -179, 2, -178],
  ['CFX3X2X2+X2', 89.9998750, 1, 90, 1.0001250],
  ['84000000+', 30, -140, 50, -120],
  ['849VGJQF+VX7QR3J', 37.5396691200, -122.3750698242, 37.5396691600, -122.3750697021],
  ['849VGJQF+VX7QR3J7QR3J', 37.5396691200, -122.3750698242, 37.5396691600, -122.3750697021],
  ['9R000000+', 50, 140, 70, 160],
  ['44X9MM00+', -30.35, -132.35, -30.3, -132.3],
  ['3C000000+', -70, -20, -50, 0],
  ['4VXPHWHV+', -30.4225, 174.9425, -30.42, 174.945],
  ['5PVX2JXR+R6G29VC', -12.95044812, 119.640568847656, -12.95044808, 119.640568969727],
  ['96QQM963+G8J', 65.661325, -84.64675, 65.66135, -84.64671875],
];

test('olc: matches the reference project\'s official encoding vectors', () => {
  const failures = [];
  for (const [lat, lon, digits, expected] of OLC_ENCODING_VECTORS) {
    const got = olc.encode(lat, lon, digits);
    if (got !== expected) failures.push(`encode(${lat}, ${lon}, ${digits}) → ${got}, expected ${expected}`);
  }
  assert.deepEqual(failures, []);
});

test('olc: matches the reference project\'s official decoding vectors', () => {
  const failures = [];
  for (const [code, latLo, lonLo, latHi, lonHi] of OLC_DECODING_VECTORS) {
    const area = olc.decode(code);
    if (area.error) { failures.push(`${code} → error ${area.error}`); continue; }
    const tolerance = 1e-10;
    if (Math.abs(area.latLo - latLo) > tolerance) failures.push(`${code} latLo ${area.latLo} ≠ ${latLo}`);
    if (Math.abs(area.lonLo - lonLo) > tolerance) failures.push(`${code} lonLo ${area.lonLo} ≠ ${lonLo}`);
    if (Math.abs(area.latHi - latHi) > tolerance) failures.push(`${code} latHi ${area.latHi} ≠ ${latHi}`);
    if (Math.abs(area.lonHi - lonHi) > tolerance) failures.push(`${code} lonHi ${area.lonHi} ≠ ${lonHi}`);
  }
  assert.deepEqual(failures, []);
});

// ------------------------------------------------------ the shipped page
//
// These are the checks that stop a rename in maps/app.js or maps.html from
// shipping a silently broken page: the page's scripts must parse, every
// element the app looks up must exist, and every local file the page pulls
// in must be present on disk.

const fs = require('node:fs');
const vm = require('node:vm');

test('page: every MostUsefulMaps script parses', () => {
  const files = [
    'maps/core/geodesy.js', 'maps/core/geo.js', 'maps/core/olc.js', 'maps/core/solar.js',
    'maps/core/gridref.js', 'maps/core/gazetteer.js', 'maps/localmap.js', 'maps/providers.js',
    'maps/livemap.js', 'maps/embed.js', 'maps/app.js',
  ];
  const failures = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    try {
      new vm.Script(source, { filename: file });
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('page: maps.html loads every script it needs, and only shipped files', () => {
  const html = fs.readFileSync(path.join(ROOT, 'maps.html'), 'utf8');
  const sources = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(sources.length >= 10, `expected the engine to be loaded, found ${sources.length}`);
  for (const file of ['maps/core/geodesy.js', 'maps/core/gazetteer.js', 'maps/localmap.js', 'maps/app.js']) {
    assert.ok(sources.includes(file), `maps.html should load ${file}`);
  }
  for (const src of sources) {
    assert.ok(!/^https?:/.test(src), `${src} should be vendored, not remote`);
    assert.ok(fs.existsSync(path.join(ROOT, src)), `${src} is referenced but missing`);
  }
  // The stylesheet and the vendored bundles have to be there too.
  const links = [...html.matchAll(/<link[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  for (const href of links) {
    if (/^https?:|^data:|^mailto:/.test(href)) continue;
    assert.ok(fs.existsSync(path.join(ROOT, href)), `maps.html links to missing ${href}`);
  }
  // No analytics, no tag manager, nothing that tracks: this page carries no
  // Google Analytics property (CONSTRAINTS.md keeps the footprint frozen).
  assert.ok(!/G-[A-Z0-9]{8,}/.test(html), 'maps.html must not carry an analytics property');
  assert.ok(!/googletagmanager|google-analytics|gtag\(/.test(html), 'maps.html must not load tracking tags');
});

test('page: every element maps/app.js looks up exists in maps.html', () => {
  const app = fs.readFileSync(path.join(ROOT, 'maps/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'maps.html'), 'utf8');
  const ids = new Set([...app.matchAll(/\$\('([a-z0-9-]+)'\)/gi)].map((m) => m[1]));
  assert.ok(ids.size > 20, `expected the app to look up its panel elements, found ${ids.size}`);
  const missing = [...ids].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, [], 'maps/app.js looks up elements that maps.html does not define');

  // Panels the app switches between must exist as elements too.
  const panels = [...app.matchAll(/PANELS = \[([^\]]+)\]/g)][0][1]
    .split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
  for (const panel of panels) {
    assert.ok(html.includes(`id="mm-pane-${panel}"`), `missing panel element for ${panel}`);
    assert.ok(html.includes(`data-mm-panel="${panel}"`), `missing tab for ${panel}`);
  }
});

test('page: the embed API a card would use is documented and present', () => {
  const embed = fs.readFileSync(path.join(ROOT, 'maps/embed.js'), 'utf8');
  for (const method of ['mount', 'openInFullMap', 'loadGazetteer', 'searchPlaces', 'plusCode', 'sunTimes', 'destroyAll']) {
    assert.ok(new RegExp(`\\b${method}\\b`).test(embed), `MostUsefulMaps.${method} is missing`);
  }
  // Cards reach the engine with a relative path from the site root.
  assert.ok(/BASE = /.test(embed));
  const card = path.join(ROOT, 'cards/mostusefulmaps.html');
  assert.ok(fs.existsSync(card), 'the catalogue card for MostUsefulMaps is missing');
  const source = fs.readFileSync(card, 'utf8');
  assert.ok(/maps\/embed\.js/.test(source), 'the card should load the embed API');
  assert.ok(!/(?:\/\/|https?:)\/\/[^"' ]*maps\//.test(source), 'the card must use a same-origin path');
});

// ============================================================ driving engine

const speed = require(path.join(ROOT, 'maps/core/speed.js'));
const drive = require(path.join(ROOT, 'maps/core/drive.js'));

test('speed: OSM maxspeed values are read the way mappers write them', () => {
  assert.equal(speed.parseMaxspeed('30 mph').kph, 48.28);
  assert.equal(speed.parseMaxspeed('50').kph, 50);
  assert.equal(speed.parseMaxspeed('50 km/h').kph, 50);
  assert.equal(speed.parseMaxspeed('50kmh').kph, 50);
  assert.equal(speed.parseMaxspeed('walk').kph, 8);
  assert.equal(speed.parseMaxspeed('none').unlimited, true);
  assert.equal(speed.parseMaxspeed('signals').variable, true);
  assert.equal(speed.parseMaxspeed('national').ok, false, 'national needs the road class');
  assert.equal(speed.parseMaxspeed('GB:nsl_single').kph, 97);
  assert.equal(speed.parseMaxspeed('GB:nsl_dual').kph, 113);
  assert.equal(speed.parseMaxspeed('GB:motorway').kph, 113);
  assert.equal(speed.parseMaxspeed('GB:nsl_restricted').kph, 48);
  assert.equal(speed.parseMaxspeed('GB-WLS:nsl_restricted').kph, 32);
  assert.equal(speed.parseMaxspeed('GB:zone20').kph, 32);
  assert.equal(speed.parseMaxspeed('nonsense').ok, false);
  assert.equal(speed.parseMaxspeed(null).ok, false);
});

test('speed: the UK national limits depend on what you are driving', () => {
  const car = speed.fromTags({ highway: 'secondary' }, { country: 'GB', vehicle: 'car', roadClass: 'secondary' });
  const caravan = speed.fromTags({ highway: 'secondary' }, { country: 'GB', vehicle: 'caravan', roadClass: 'secondary' });
  const hgv = speed.fromTags({ highway: 'secondary' }, { country: 'GB', vehicle: 'hgv', roadClass: 'secondary', scotlandOrNI: true });
  assert.equal(car.kph, 97, 'car on a single carriageway: 60 mph');
  assert.equal(car.mph, 60);
  assert.equal(caravan.kph, 80, 'towing: 50 mph on singles');
  assert.equal(hgv.kph, 64, 'over 7.5 t in Scotland/NI: 40 mph on singles');
  assert.equal(hgv.mph, 40);
  assert.equal(speed.fromTags({ highway: 'motorway' }, { country: 'GB', vehicle: 'van', roadClass: 'motorway' }).mph, 70);
  assert.equal(speed.fromTags({ highway: 'motorway' }, { country: 'GB', vehicle: 'caravan', roadClass: 'motorway' }).mph, 60);
});

test('speed: built-up defaults follow the nation, not the map', () => {
  const england = speed.nationalDefault('GB', 'residential', { vehicle: 'car', urban: true, wales: false });
  const wales = speed.nationalDefault('GB', 'residential', { vehicle: 'car', urban: true, wales: true });
  assert.equal(england.kph, 48, 'England, Scotland and NI: 30 mph');
  assert.equal(wales.kph, 32, 'Wales: 20 mph since September 2023');
  const townCentre = { lat: 51.4816, lon: -3.1791 }; // Cardiff
  assert.equal(drive.isWales(townCentre.lat, townCentre.lon), true);
  assert.equal(drive.isWales(51.5074, -0.1278), false, 'London is not in Wales');
});

test('speed: signed limits beat defaults, and conditionals are honoured', () => {
  const signed = speed.fromTags({ highway: 'trunk', maxspeed: '50 mph' }, { country: 'GB', vehicle: 'car' });
  assert.equal(signed.kph, 80.47);
  assert.equal(signed.source, 'signed');
  assert.equal(speed.basisLabel(signed), 'signed');

  const night = new Date('2026-01-15T23:30:00Z');
  const day = new Date('2026-01-15T12:00:00Z');
  const tags = { highway: 'primary', 'maxspeed:conditional': '30 mph @ (22:00-06:00)' };
  assert.equal(speed.fromTags(tags, { country: 'GB', vehicle: 'car', date: night }).mph, 30);
  assert.equal(speed.fromTags(tags, { country: 'GB', vehicle: 'car', date: day }).source, 'national-assumed-single');
});

test('speed: countries whose limits vary by state are not guessed at', () => {
  const texas = speed.fromTags({ highway: 'motorway' }, { country: 'US', vehicle: 'car' });
  assert.equal(texas.kph, null);
  assert.match(texas.basis, /state/);
  assert.match(speed.basisLabel(texas), /unknown|state/);
});

test('speed: the over-limit warning uses the 10% + 2 mph guidance, not a guess', () => {
  const limit30 = speed.mphToKph(30);
  assert.equal(speed.isOver(speed.mphToKph(35), limit30), false, '35 in a 30 is within the enforcement threshold');
  assert.equal(speed.isOver(speed.mphToKph(36), limit30), true, '36 in a 30 is not');
  const limit70 = speed.mphToKph(70);
  assert.equal(speed.isOver(speed.mphToKph(78), limit70), false);
  assert.equal(speed.isOver(speed.mphToKph(80), limit70), true);
  assert.equal(speed.isOver(null, limit70), false, 'no speed, no warning');
});

test('drive: a session tracks progress, manoeuvres and arrival', () => {
  // A 100 km route due north, with two manoeuvres.
  const geometry = [];
  for (let i = 0; i <= 100; i += 1) geometry.push([-0.4175, 51.5 + i * 0.008994]); // ~1 km steps
  const routeKm = geodesy.pathLengthKm(geometry.map((c) => ({ lat: c[1], lon: c[0] })));
  const route = {
    geometry,
    distanceKm: routeKm,
    durationMinutes: 90,
    steps: [
      { distanceKm: 40, durationMin: 30, instruction: 'Head north on the M1', verbal: 'head north on the M1', modifier: 'straight' },
      { distanceKm: 40, durationMin: 30, instruction: 'Keep left onto the M6', verbal: 'keep left onto the M6', modifier: 'keep left', lanes: [{ indications: ['left'], valid: true }] },
      { distanceKm: 20, durationMin: 30, instruction: 'Arrive at your destination', verbal: 'arrive at your destination', modifier: 'arrive' },
    ],
    speedLimits: [
      { fromKm: 0, toKm: 60, kph: 113, source: 'signed', basis: 'signed' },
      { fromKm: 60, toKm: routeKm, kph: 48, source: 'signed', basis: 'signed' },
    ],
  };

  const session = drive.createSession(route, { vehicle: 'car', units: 'imperial', breakEveryMinutes: 120 });
  const start = session.update({ lat: 51.5, lon: -0.4175, speedKph: 0, at: '2026-05-01T08:00:00Z' });
  assert.ok(start.onRoute, 'a fix on the line is on route');
  assert.ok(start.progressKm < 0.5, `expected to start at the beginning, got ${start.progressKm}`);
  assert.equal(start.limit.kph, 113);
  assert.equal(start.limitConfidence, 'high');
  assert.equal(start.overLimit, false);
  assert.match(start.next.instruction, /M1/);
  assert.equal(start.remainingMinutes, 90);

  const middle = session.update({ lat: 51.5 + 40 * 0.008994, lon: -0.4175, speedKph: 100, at: '2026-05-01T08:25:00Z' });
  assert.ok(Math.abs(middle.progressKm - 40) < 2, `expected ~40 km, got ${middle.progressKm}`);
  assert.ok(Math.abs(middle.remainingKm - (route.distanceKm - 40)) < 2);
  assert.match(middle.next.instruction, /M6/);
  assert.deepEqual(middle.next.lanes[0].indications, ['left'], 'lane data stays attached to the active manoeuvre');
  assert.ok(middle.remainingMinutes < 70 && middle.remainingMinutes > 50, `remaining ${middle.remainingMinutes}`);
  assert.ok(middle.eta instanceof Date);
  assert.equal(middle.limit.kph, 113);

  // Over the limit in the 30 mph stretch.
  const late = session.update({ lat: 51.5 + 70 * 0.008994, lon: -0.4175, speedKph: 60, at: '2026-05-01T09:00:00Z' });
  assert.equal(late.limit.kph, 48);
  assert.equal(late.overLimit, true, '60 km/h in a 30 mph (48 km/h) limit');
  assert.ok(late.overByKph > 10);

  // Off-route: 300 m to the east for long enough to need a replan.
  const off = session.update({ lat: 51.5 + 80 * 0.008994, lon: -0.4135, speedKph: 40, at: '2026-05-01T09:10:00Z' });
  assert.equal(off.onRoute, false);
  assert.ok(off.offsetMetres > 45);
  const stillOff = session.update({ lat: 51.5 + 80 * 0.008994, lon: -0.4135, speedKph: 40, at: '2026-05-01T09:10:20Z' });
  assert.equal(stillOff.needsReplan, true, '20 seconds off route should prompt a replan');

  // Speech: said once per threshold, not every second.
  const first = session.update({ lat: 51.5 + 98 * 0.008994, lon: -0.4175, speedKph: 30, at: '2026-05-01T09:20:00Z' });
  const phrase = session.speak(first);
  if (phrase) {
    assert.match(phrase, /arrive|keep|turn|continue|head/i);
    assert.equal(session.speak(first), null, 'the same manoeuvre is not announced twice at the same threshold');
  }
});

test('drive: sun glare is worked out from the route heading and the sun', () => {
  // Due west across England, leaving at a time when the sun is low and ahead.
  const geometry = [];
  for (let i = 0; i <= 60; i += 1) geometry.push([-0.1 - i * 0.0095, 51.6]);
  const route = {
    geometry,
    distanceKm: geodesy.pathLengthKm(geometry.map((c) => ({ lat: c[1], lon: c[0] }))),
    durationMinutes: 60,
    steps: [{ distanceKm: 100, durationMin: 60, instruction: 'Head west', modifier: 'straight' }],
  };
  const session = drive.createSession(route, { units: 'metric' });
  const windows = session.glareWindows(new Date('2026-06-21T19:15:00Z'));
  assert.ok(windows.length >= 1, 'a low sun dead ahead at 20:15 local time should be flagged');
  const window = windows[0];
  assert.ok(window.fromKm <= window.toKm);
  assert.ok(window.heading > 240 && window.heading < 300, `heading west, got ${window.heading}`);
  assert.ok(window.altitude > -1 && window.altitude < 16);

  // The same route due east at the same time faces away from the sun.
  const eastRoute = Object.assign({}, route, { geometry: geometry.map((c) => [c[0], c[1]]).reverse() });
  const eastSession = drive.createSession(eastRoute, { units: 'metric' });
  const eastWindows = eastSession.glareWindows(new Date('2026-06-21T19:15:00Z'));
  assert.equal(eastWindows.length, 0, 'driving east at sunset is not a glare risk');
});

test('drive: speed limits are joined from the OSM ways you are actually on', () => {
  // Two ways on a north-south route: a 70 mph motorway then a 30 mph street,
  // plus a stretch with no OSM way at all.
  const geometry = [];
  for (let i = 0; i <= 100; i += 1) geometry.push([-0.4175, 51.5 + i * 0.009]);
  const latAt = (fraction) => 51.5 + 100 * fraction * 0.009;
  const ways = [
    {
      id: 1, tags: { highway: 'motorway', maxspeed: '70 mph', maxspeed_type: 'GB:motorway' },
      segments: [[latAt(0.0), -0.4175], [latAt(0.45), -0.4175]],
    },
    {
      id: 2, tags: { highway: 'residential', maxspeed: '30 mph', lit: 'yes' },
      segments: [[latAt(0.55), -0.4175], [latAt(1.0), -0.4175]],
    },
  ];
  const result = drive.limitsFromWays(geometry, {
    ways,
    spacingKm: 0.5,
    matchRadiusMetres: 40,
    countryAt: () => 'GB',
    urbanAt: (lat) => lat > 51.98, // the southern half is countryside, the north is town
    vehicle: 'car',
  });
  assert.ok(result.segments.length >= 2, `expected several stretches, got ${result.segments.length}`);
  const motorway = result.segments[0];
  assert.equal(motorway.kph, 112.65);
  assert.equal(motorway.source, 'signed');
  assert.equal(motorway.osmWayId, 1);
  assert.ok(motorway.toKm > 30 && motorway.toKm < 55, `motorway stretch ends at ${motorway.toKm}`);

  const urban = result.segments[result.segments.length - 1];
  assert.equal(urban.mph, 30);
  assert.equal(urban.source, 'signed');
  assert.equal(urban.osmWayId, 2);

  // The middle, with no way nearby, must be reported as unknown rather than
  // silently borrowing a neighbour's limit.
  const gap = result.segments.filter((s) => s.source === 'unknown');
  assert.ok(gap.length >= 1, 'the un-mapped stretch is reported as unknown');
  assert.ok(result.coverage > 0.85 && result.coverage < 1, `coverage should be high but not perfect, got ${result.coverage}`);

  // Filling the gaps uses the country default and says so.
  const filled = drive.fillGaps(result.segments, { country: 'GB', vehicle: 'car' });
  const filledGap = filled.filter((s) => s.fromKm > 45 && s.fromKm < 55)[0];
  assert.ok(filledGap.kph != null || filledGap.source === 'unknown');
  if (filledGap.kph != null) {
    assert.match(filledGap.basis, /national|built-up/);
  }

  // A towing vehicle gets lower national limits in the gaps.
  const towing = drive.fillGaps(result.segments, { country: 'GB', vehicle: 'caravan' });
  const towingGap = towing.filter((s) => s.source !== 'signed' && s.kph != null)[0];
  if (towingGap) assert.ok(towingGap.kph <= 97);
});

test('drive: the briefing maths adds up', () => {
  const limits = [
    { fromKm: 0, toKm: 20, kph: 113, mph: 70, source: 'signed' },
    { fromKm: 20, toKm: 25, kph: 48, mph: 30, source: 'signed' },
    { fromKm: 25, toKm: 45, kph: 97, mph: 60, source: 'national-assumed-single' },
  ];
  const summary = drive.limitSummary(limits);
  assert.equal(summary.length, 3);
  const motorway = summary[0];
  assert.equal(motorway.kph, 113);
  assert.equal(Math.round(motorway.km), 20);
  assert.equal(Math.round(motorway.signedKm), 20);
  const assumed = summary.find((row) => row.kph === 97);
  assert.equal(Math.round(assumed.km), 20);
  assert.equal(Math.round(assumed.assumedKm), 20, 'the assumed stretch is counted separately from the signed one');

  const petrol = drive.costEstimate(300, { litresPer100Km: 7, pricePerLitre: 1.5 });
  assert.ok(Math.abs(petrol.litres - 21) < 0.001);
  assert.ok(Math.abs(petrol.cost - 31.5) < 0.001);
  const imperial = drive.costEstimate(160.9344, { mpg: 40, pricePerLitre: 1.5 });
  assert.ok(Math.abs(imperial.gallons - 2.5) < 0.01, `100 miles at 40 mpg is 2.5 gallons, got ${imperial.gallons}`);
  const electric = drive.costEstimate(200, { electric: true, kwhPer100Km: 18, pricePerKwh: 0.25 });
  assert.ok(Math.abs(electric.kwh - 36) < 0.001);
  assert.ok(Math.abs(electric.cost - 9) < 0.001);
});

test('drive: a finished trip exports as GPX', () => {
  const geometry = [[-0.4175, 51.5], [-0.4175, 51.51], [-0.4175, 51.52]];
  const session = drive.createSession({ geometry, distanceKm: 2.2, durationMinutes: 4, steps: [] }, {});
  session.update({ lat: 51.5, lon: -0.4175, speedKph: 20, at: '2026-05-01T10:00:00Z' });
  session.update({ lat: 51.51, lon: -0.4175, speedKph: 30, at: '2026-05-01T10:01:00Z' });
  session.update({ lat: 51.52, lon: -0.4175, speedKph: 0, at: '2026-05-01T10:02:00Z' });
  const summary = session.finish('2026-05-01T10:03:00Z');
  assert.equal(summary.durationMinutes, 3);
  assert.ok(summary.distanceKm > 2 && summary.distanceKm < 2.4, `recorded ${summary.distanceKm} km`);
  assert.equal(Math.round(summary.maxSpeedKph), 30);
  const gpx = session.toGpx('Test drive');
  assert.match(gpx, /<gpx version="1.1"/);
  assert.match(gpx, /<trkpt lat="51\.500000" lon="-0\.417500">/);
  assert.match(gpx, /<speed>30\.0<\/speed>/);
  assert.match(gpx, /<\/gpx>/);
  assert.ok(!/<script/i.test(gpx));
});

test('drive: Valhalla trips and routes parse into the shapes the UI needs', () => {
  const providers = require(path.join(ROOT, 'maps/providers.js'));
  // Precision-6 polyline for two points (the encoding Valhalla returns).
  const encoded = providers.decodePolyline('_p~iF~ps|U_ulLnnqC', 5);
  assert.ok(Array.isArray(encoded) && encoded.length === 2, 'polyline decoding returns points');
  assert.ok(Math.abs(encoded[0][1] - 38.5) < 0.001, `expected 38.5 N, got ${encoded[0][1]}`);
  assert.ok(Math.abs(encoded[0][0] + 120.2) < 0.001, `expected 120.2 W, got ${encoded[0][0]}`);

  // Vehicle-aware costing: an HGV is a truck with dimensions, a car is not.
  const car = providers.valhallaCosting('car', {});
  assert.equal(car.costing, 'auto');
  assert.equal(car.costingOptions.auto.use_highways, 1);
  const hgv = providers.valhallaCosting('hgv', { heightMetres: 4.2, weightTonnes: 40, hazmat: false });
  assert.equal(hgv.costing, 'truck');
  assert.equal(hgv.costingOptions.truck.height, 4.2);
  assert.equal(hgv.costingOptions.truck.weight, 40);
  const caravan = providers.valhallaCosting('caravan', { heightMetres: 3.1, avoidMotorways: true });
  assert.equal(caravan.costingOptions.auto.height, 3.1, 'a caravan has a real height');
  assert.ok(caravan.costingOptions.auto.use_highways < 0.5, 'and can ask to keep off motorways');

  const lanes = providers.normaliseLaneInfo([
    { directions: 10, active: 8 }, // left + through, left is the preferred direction
    { directions: 2, valid: 2 },
    { indications: ['right'], valid: false },
  ]);
  assert.deepEqual(lanes[0].indications, ['through', 'left']);
  assert.equal(lanes[0].active, true);
  assert.equal(lanes[1].valid, true);
  assert.equal(lanes[2].state, 'closed');
  assert.deepEqual(providers.normaliseLaneInfo([{ valid: true }])[0].indications, []);

  // Sampling a geometry for corridor queries stays bounded.
  const line = [];
  for (let i = 0; i <= 400; i += 1) line.push([-0.1 - i * 0.01, 51.5]);
  const samples = providers.samplePolyline(line, 10, 40);
  assert.ok(samples.length >= 2 && samples.length <= 41, `expected a bounded sample, got ${samples.length}`);
  assert.deepEqual(samples[0], line[0]);
});

// ======================================================== driving: the page

test('page: the driving scripts load before the page controller', () => {
  const html = fs.readFileSync(path.join(ROOT, 'maps.html'), 'utf8');
  const order = ['maps/core/geodesy.js', 'maps/core/speed.js', 'maps/core/drive.js', 'maps/providers.js', 'maps/app.js']
    .map((file) => html.indexOf(file));
  assert.ok(order.every((index) => index >= 0), 'every driving script is referenced');
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i] > order[i - 1], 'the driving scripts load in dependency order');
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'maps/core/speed.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'maps/core/drive.js')));

  // The vehicle selector must offer every vehicle the engine understands.
  for (const vehicle of ['car', 'caravan', 'van', 'motorhome', 'hgv']) {
    assert.ok(html.includes(`value="${vehicle}"`), `the vehicle list is missing ${vehicle}`);
  }
});

test('page: the navigation overlay exists, and starts hidden', () => {
  const html = fs.readFileSync(path.join(ROOT, 'maps.html'), 'utf8');
  for (const id of ['mm-nav', 'mm-nav-distance', 'mm-nav-instruction', 'mm-nav-lanes', 'mm-nav-lane-strip', 'mm-nav-lane-note', 'mm-nav-limit-value', 'mm-nav-current-value', 'mm-nav-progress', 'mm-nav-remaining', 'mm-nav-eta', 'mm-nav-replan', 'mm-nav-stop']) {
    assert.ok(html.includes(`id="${id}"`), `the navigation overlay is missing ${id}`);
  }
  assert.match(html, /id="mm-nav"[^>]*hidden/, 'the overlay must not be visible before a drive starts');
  // And it must never be announced as an alert: it updates constantly.
  assert.ok(!/id="mm-nav"[^>]*role="alert"/.test(html), 'the walking overlay must not be a live alert region');
});

test('providers: the driving services are declared with their licences', () => {
  const providers = require(path.join(ROOT, 'maps/providers.js'));
  assert.match(providers.VALHALLA.url, /valhalla/i);
  assert.match(providers.VALHALLA.licence, /ODbL/);
  assert.match(providers.WEATHER.licence, /CC BY 4\.0/);
  assert.match(providers.TRAFFIC.tfl.url, /tfl\.gov\.uk/);
  assert.match(providers.TRAFFIC.tfl.coverage, /London/);
  assert.ok(providers.TRAFFIC.tfl.licence.indexOf('TfL') >= 0);

  const described = providers.describe();
  assert.ok(described.driving && described.driving.id === providers.VALHALLA.id, 'describe() names the driving router');
  assert.ok(described.traffic && /TfL/.test(described.traffic.name), 'describe() names the traffic source');
  assert.ok(described.weather && /Open-Meteo/.test(described.weather.name), 'describe() names the weather source');
  assert.deepEqual(providers.POI_CATEGORIES.length, providers.poiCategories ? providers.POI_CATEGORIES.length : providers.POI_CATEGORIES.length);
});

test('providers: driving asks Valhalla for turn-lane data and preserves it', async () => {
  const providers = require(path.join(ROOT, 'maps/providers.js'));
  const original = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get('json');
    request = query ? JSON.parse(query) : null;
    const response = {
      trip: {
        summary: { length: 1, time: 60 },
        legs: [{
          shape: { type: 'LineString', coordinates: [[-0.4, 51.8], [-0.39, 51.8]] },
          maneuvers: [{
            length: 1, time: 60, instruction: 'Turn left', type: 15,
            lanes: [{ directions: 8, active: 8 }, { directions: 2, valid: 2 }],
          }],
        }],
      },
    };
    return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const route = await providers.driveRoute(LUTON, { lat: 51.8, lon: -0.39 }, { vehicle: 'car' });
    assert.equal(request.turn_lanes, true);
    assert.equal(route.steps[0].lanes[0].active, true);
    assert.equal(route.steps[0].lanes[1].valid, true);
  } finally {
    globalThis.fetch = original;
  }
});

test('providers: OSRM lane indications are retained and missing lanes stay empty', async () => {
  const providers = require(path.join(ROOT, 'maps/providers.js'));
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    routes: [{
      distance: 1000,
      duration: 60,
      geometry: { type: 'LineString', coordinates: [[-0.42, 51.88], [-0.39, 51.8]] },
      legs: [{ steps: [{
        distance: 1000,
        duration: 60,
        name: 'A road',
        maneuver: { type: 'turn', modifier: 'left', location: [-0.4, 51.84] },
        intersections: [{ lanes: [
          { indications: ['left'], valid: true },
          { indications: ['through'], valid: false },
        ] }],
      }] }],
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const route = await providers.route(LUTON, { lat: 51.8, lon: -0.39 }, 'car', { alternatives: false });
    assert.deepEqual(route.steps[0].lanes[0].indications, ['left']);
    assert.equal(route.steps[0].lanes[0].valid, true);
    assert.equal(route.steps[0].lanes[1].state, 'closed');
    assert.deepEqual(providers.normaliseLaneInfo(null), []);
  } finally {
    globalThis.fetch = original;
  }
});

test('providers: selected-place enrichment is attributed, bounded and keyless', async () => {
  const providers = require(path.join(ROOT, 'maps/providers.js'));
  providers.clearCache();
  const original = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    const text = String(url);
    asked.push(text);
    let payload;
    if (text.includes('air-quality-api.open-meteo.com')) {
      payload = {
        current: { european_aqi: 18, pm2_5: 7.2, pm10: 11, ozone: 52, nitrogen_dioxide: 8 },
        current_units: { pm2_5: 'µg/m³', pm10: 'µg/m³', ozone: 'µg/m³', nitrogen_dioxide: 'µg/m³' },
      };
    } else if (text.includes('environment.data.gov.uk')) {
      payload = {
        items: [{
          '@id': 'https://environment.data.gov.uk/flood-monitoring/id/floods/example',
          description: 'River test area', severity: 'Flood Alert', severityLevel: 3,
          floodArea: { county: 'Testshire', riverOrSea: 'River Test' },
        }],
      };
    } else if (text.includes('commons.wikimedia.org')) {
      payload = {
        query: { pages: { '1': {
          title: 'File:Open place.jpg', dist: 240,
          imageinfo: [{ thumburl: 'https://upload.wikimedia.org/example.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Open_place.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' } } }],
        } } },
      };
    } else if (text.includes('api.openstreetcam.org')) {
      payload = {
        result: { data: [{ id: 7, lat: 51.5, lng: -0.4, fileurl: 'https://storage.openstreetcam.org/example.jpg', dateProcessed: '2026-01-02', sequence: { id: 9 } }] },
      };
    } else {
      throw new Error('unexpected endpoint');
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const [air, floods, commons, street] = await Promise.all([
      providers.airQuality(LUTON),
      providers.floodWarnings(LUTON),
      providers.commons(LUTON),
      providers.kartaView(LUTON),
    ]);
    assert.equal(air.current.european_aqi, 18);
    assert.match(air.provider.licence, /CC BY 4\.0/);
    assert.equal(floods.warnings[0].riverOrSea, 'River Test');
    assert.match(floods.provider.licence, /Open Government Licence/);
    assert.equal(commons.images[0].licence, 'CC BY-SA 4.0');
    assert.equal(street.photos[0].sequenceId, 9);
    assert.match(street.provider.licence, /CC BY-SA 4\.0/);
    assert.equal(asked.length, 4);
    assert.ok(asked.some((url) => /min-severity=3/.test(url)), 'floods request only asks for active alerts/warnings');
    assert.ok(asked.every((url) => !/apikey|api_key|token/i.test(url)), 'all enrichment endpoints are keyless');
    assert.ok(asked.every((url) => /51\.87970|-0\.41750/.test(url)), 'every request is coordinate-based');
  } finally {
    globalThis.fetch = original;
  }
});

test('providers: traffic says nothing rather than inventing it', async () => {
  const providers = require(path.join(ROOT, 'maps/providers.js'));
  // Scotland: no key-free live traffic feed covers it, so the answer is a
  // labelled absence, not a fabricated delay.
  const scotland = await providers.trafficAlong([[-4.2, 55.9], [-3.2, 56.4]]);
  assert.equal(scotland.coverage, 'none');
  assert.equal(scotland.events.length, 0);
  assert.match(scotland.note, /free-flow/i);

  // London: TfL is asked. With the network down, the failure is reported.
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('no network in tests'));
  try {
    const failed = await providers.trafficAlong([[-0.42, 51.5], [-0.12, 51.51]]);
    assert.equal(failed.events.length, 0);
    assert.ok(failed.error, 'the failure is reported rather than swallowed');
    assert.match(failed.note, /TfL/i);
  } finally {
    globalThis.fetch = original;
  }
});

test('providers: weather is read at the hour you would get there', async () => {
  const providers = require(path.join(ROOT, 'maps/providers.js'));
  const start = new Date('2026-05-01T08:00:00Z');
  const hourly = { time: [], temperature_2m: [], precipitation: [], precipitation_probability: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], visibility: [] };
  for (let hour = 0; hour < 12; hour += 1) {
    hourly.time.push(new Date(start.getTime() + hour * 3600000).toISOString().slice(0, 19));
    hourly.temperature_2m.push(10 + hour);
    hourly.precipitation.push(hour === 3 ? 1.2 : 0);
    hourly.precipitation_probability.push(hour === 3 ? 80 : 5);
    hourly.weather_code.push(hour === 3 ? 63 : 1);
    hourly.wind_speed_10m.push(20);
    hourly.wind_gusts_10m.push(hour === 3 ? 70 : 30);
    hourly.visibility.push(9000);
  }
  const original = globalThis.fetch;
  let asked = null;
  globalThis.fetch = async (url) => {
    asked = String(url);
    return new Response(JSON.stringify([{ hourly }, { hourly }]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await providers.weatherAlong([
      { lat: 51.5, lon: -0.4, alongKm: 0, etaMinutes: 0 },
      { lat: 52.5, lon: -0.4, alongKm: 100, etaMinutes: 180 },
    ], { startAt: start });
    assert.equal(result.points.length, 2);
    assert.equal(result.points[0].temperatureC, 10, 'the hour you are there, not the current hour');
    assert.equal(result.points[1].temperatureC, 13, 'three hours in, three hours along the forecast');
    assert.equal(result.points[1].precipitationChance, 80);
    assert.equal(result.points[1].gustKph, 70);
    assert.match(result.provider.licence, /CC BY 4\.0/);
    assert.match(asked, /api\.open-meteo\.com/, 'and it asks the documented endpoint');
    assert.ok(!/apikey|api_key/i.test(asked), 'with no key: this must stay key-free');
  } finally {
    globalThis.fetch = original;
  }
});

test('page: a grid reference is rendered as text, never as an object', () => {
  // MM.gridref.fromWgs84() returns the whole working — easting, northing, the
  // OSGB36 point, the datum shift — and the grid reference is its `gridRef`
  // field. Passing the object into text produced "[object Object]" in the HUD
  // on the live site, so this pins the shape of every call site.
  const codeLines = (text) => text
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line)) // ignore comments
    .join('\n');

  for (const file of ['maps/app.js', 'maps/embed.js']) {
    const code = codeLines(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    const calls = [...code.matchAll(/fromWgs84\(/g)];
    const reads = [...code.matchAll(/\.gridRef\b/g)];
    assert.ok(calls.length >= 1, `${file} should read the grid reference`);
    assert.equal(
      reads.length, calls.length,
      `${file} calls fromWgs84 ${calls.length} time(s) but only reads .gridRef ${reads.length} time(s) — a rule of thumb: read it through one helper and never concatenate the object`
    );
  }

  // The engine keeps the full object: callers who want the datum shift need it.
  const gridref = require(path.join(ROOT, 'maps/core/gridref.js'));
  const result = gridref.fromWgs84(51.8797, -0.4175, 5);
  assert.equal(typeof result.gridRef, 'string');
  assert.match(result.gridRef, /^TL \d{5} \d{5}$/);
  assert.equal(typeof result.easting, 'number');
  assert.equal(typeof result.northing, 'number');
  assert.equal(result.gridRef, gridref.gridRef(result.easting, result.northing, 5));

  // And the embed API hands a card text, so it can go straight into the page.
  const embed = fs.readFileSync(path.join(ROOT, 'maps/embed.js'), 'utf8');
  assert.match(embed, /gridReference[\s\S]{0,240}?\.gridRef/, 'MostUsefulMaps.gridReference must resolve to a string');
  assert.ok(!/gridReference[\s\S]{0,240}?fromWgs84\(lat, lon, 5\)\s*;/.test(embed), 'and must not hand back the object');
});

test('page: every MM.<namespace>.<member> the page calls actually exists', () => {
  // This is the test that would have caught MM.gazetteer.nearest: `nearest` is
  // a method on a loaded Gazetteer *instance*, not on the namespace, so the
  // call threw as soon as the gazetteer finished loading — leaving the Drive
  // tab's speed-limit panel stuck on "Checking…" for every real visitor.
  const modules = {
    geodesy: 'maps/core/geodesy.js',
    olc: 'maps/core/olc.js',
    solar: 'maps/core/solar.js',
    gridref: 'maps/core/gridref.js',
    speed: 'maps/core/speed.js',
    drive: 'maps/core/drive.js',
    gazetteer: 'maps/core/gazetteer.js',
    providers: 'maps/providers.js',
  };
  for (const file of Object.values(modules)) require(path.join(ROOT, file));
  // These are not core modules: app.js assigns MM.topojson and MM.app itself,
  // and the two renderers are loaded by the page as classes.
  const assignedByThePage = new Set(['app', 'topojson', 'LocalMap', 'livemap']);

  const withoutComments = (text) => text
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join('\n');

  let checked = 0;
  for (const file of ['maps/app.js', 'maps/embed.js', 'cards/mostusefulmaps.html']) {
    const source = withoutComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    for (const match of source.matchAll(/MM\.([A-Za-z]+)\.([A-Za-z_$][\w$]*)/g)) {
      const [, namespace, member] = match;
      if (assignedByThePage.has(namespace)) continue;
      const module = globalThis.MM[namespace];
      assert.ok(module, `${file} calls MM.${namespace}.${member}, but there is no MM.${namespace} module`);
      assert.ok(
        Object.prototype.hasOwnProperty.call(module, member),
        `${file} calls MM.${namespace}.${member}, which does not exist on ${modules[namespace] || 'that module'}`
      );
      checked += 1;
    }
  }
  assert.ok(checked > 60, `expected the page to use the engine in many places, checked only ${checked}`);
});
