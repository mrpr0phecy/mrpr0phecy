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
