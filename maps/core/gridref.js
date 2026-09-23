/**
 * maps/core/gridref.js — OS National Grid references, on the device.
 *
 * Why: "TL 09 21" is how a British person gives a location, and no open map
 * offers it without a server. This module converts both ways — WGS84
 * coordinates to an OS grid reference and back — with no table of any kind.
 *
 * Pipeline, exactly as Ordnance Survey documents it in "A guide to coordinate
 * systems in Great Britain":
 *
 *   WGS84 lat/lon
 *     → Helmert 7-parameter transform (tx -446.448, ty 125.157, tz -542.060,
 *       s 20.4894 ppm, rx -0.1502", ry -0.2470", rz -0.8421")
 *     → OSGB36 lat/lon on the Airy 1830 ellipsoid
 *     → Transverse Mercator projection (true origin 49°N 2°W, scale
 *       0.9996012717, false origin E 400 000, N -100 000)
 *     → easting/northing → 100 km letters + digits
 *
 * Honesty about accuracy: the Helmert transform is the simple one. It is good
 * to about 5 m across Great Britain; the OSTN15 national grid transformation
 * used by OS gives ~0.1 m but ships as a licensed grid of numbers we are not
 * going to vendor for a map tool. Grid references here are labelled
 * "±5 m (Helmert)" in the interface rather than implied to be survey grade.
 *
 * Verified against Ordnance Survey's own published worked example in
 * scripts/tests/maps-core.test.js: 52°39'27.2531"N 1°43'4.5177"E (OSGB36) is
 * easting 651 409.903, northing 313 177.270, grid reference TG 51409 13177.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});
  var toRad = function (d) { return d * Math.PI / 180; };
  var toDeg = function (r) { return r * 180 / Math.PI; };

  // Ellipsoids
  var AIRY_1830 = { a: 6377563.396, b: 6356256.909 };
  var WGS84 = { a: 6378137.0, f: 1 / 298.257223563 };

  // Helmert WGS84 → OSGB36 (OS published parameters)
  var HELMERT = {
    tx: -446.448, ty: 125.157, tz: -542.060,
    s: 20.4894e-6,
    rx: -0.1502 / 3600 * Math.PI / 180 * 180 / Math.PI, // arc-seconds → radians, done below
    ry: -0.2470 / 3600 * Math.PI / 180 * 180 / Math.PI,
    rz: -0.8421 / 3600 * Math.PI / 180 * 180 / Math.PI,
  };
  var AS_TO_RAD = Math.PI / (180 * 3600);
  HELMERT.rx = -0.1502 * AS_TO_RAD;
  HELMERT.ry = -0.2470 * AS_TO_RAD;
  HELMERT.rz = -0.8421 * AS_TO_RAD;

  // National Grid projection constants
  var F0 = 0.9996012717;
  var LAT0 = toRad(49);
  var LON0 = toRad(-2);
  var N0 = -100000;
  var E0 = 400000;

  function airyParams() {
    var a = AIRY_1830.a, b = AIRY_1830.b;
    var e2 = (a * a - b * b) / (a * a);
    return { a: a, b: b, e2: e2, n: (a - b) / (a + b) };
  }

  function wgs84Params() {
    var a = WGS84.a, f = WGS84.f, b = a * (1 - f);
    return { a: a, b: b, e2: (a * a - b * b) / (a * a) };
  }

  function geodeticToCartesian(lat, lon, height, ellipsoid) {
    var phi = toRad(lat), lam = toRad(lon);
    var e2 = ellipsoid.e2;
    var nu = ellipsoid.a / Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi));
    return {
      x: (nu + height) * Math.cos(phi) * Math.cos(lam),
      y: (nu + height) * Math.cos(phi) * Math.sin(lam),
      z: ((1 - e2) * nu + height) * Math.sin(phi),
    };
  }

  function cartesianToGeodetic(x, y, z, ellipsoid) {
    var a = ellipsoid.a, b = ellipsoid.b, e2 = ellipsoid.e2;
    var p = Math.sqrt(x * x + y * y);
    var phi = Math.atan2(z, p * (1 - e2));
    var phiPrev = 0, nu = a;
    for (var i = 0; i < 8 && Math.abs(phi - phiPrev) > 1e-12; i += 1) {
      phiPrev = phi;
      nu = a / Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi));
      phi = Math.atan2(z + e2 * nu * Math.sin(phi), p);
    }
    var lam = Math.atan2(y, x);
    var height = p / Math.cos(phi) - nu;
    return { lat: toDeg(phi), lon: toDeg(lam), height: height };
  }

  /** WGS84 lat/lon → OSGB36 lat/lon (the simple 7-parameter transform). */
  function wgs84ToOsgb36(lat, lon, height) {
    var from = geodeticToCartesian(lat, lon, height || 0, wgs84Params());
    var s = 1 + HELMERT.s;
    var x = HELMERT.tx + s * (from.x - HELMERT.rz * from.y + HELMERT.ry * from.z);
    var y = HELMERT.ty + s * (HELMERT.rz * from.x + from.y - HELMERT.rx * from.z);
    var z = HELMERT.tz + s * (-HELMERT.ry * from.x + HELMERT.rx * from.y + from.z);
    return cartesianToGeodetic(x, y, z, airyParams());
  }

  /** OSGB36 lat/lon → WGS84 lat/lon (inverse Helmert). */
  function osgb36ToWgs84(lat, lon, height) {
    var from = geodeticToCartesian(lat, lon, height || 0, airyParams());
    var s = 1 + HELMERT.s;
    // Inverse rotation: negate the small angles.
    var x = from.x - HELMERT.tx;
    var y = from.y - HELMERT.ty;
    var z = from.z - HELMERT.tz;
    var xr = x + HELMERT.rz * y - HELMERT.ry * z;
    var yr = -HELMERT.rz * x + y + HELMERT.rx * z;
    var zr = HELMERT.ry * x - HELMERT.rx * y + z;
    return cartesianToGeodetic(xr / s, yr / s, zr / s, wgs84Params());
  }

  /** OSGB36 lat/lon → easting/northing (Transverse Mercator, Airy 1830). */
  function osgb36ToGrid(lat, lon) {
    var el = airyParams();
    var a = el.a, b = el.b, n = el.n, e2 = el.e2;
    var phi = toRad(lat), lam = toRad(lon);
    var sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), tanPhi = Math.tan(phi);
    var nu = a * F0 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    var rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
    var eta2 = nu / rho - 1;

    var M = b * F0 * (
      (1 + n + (5 / 4) * n * n + (5 / 4) * n * n * n) * (phi - LAT0) -
      (3 * n + 3 * n * n + (21 / 8) * n * n * n) * Math.sin(phi - LAT0) * Math.cos(phi + LAT0) +
      ((15 / 8) * (n * n + n * n * n)) * Math.sin(2 * (phi - LAT0)) * Math.cos(2 * (phi + LAT0)) -
      (35 / 24) * n * n * n * Math.sin(3 * (phi - LAT0)) * Math.cos(3 * (phi + LAT0))
    );

    var I = M + N0;
    var II = (nu / 2) * sinPhi * cosPhi;
    var III = (nu / 24) * sinPhi * Math.pow(cosPhi, 3) * (5 - tanPhi * tanPhi + 9 * eta2);
    var IIIA = (nu / 720) * sinPhi * Math.pow(cosPhi, 5) * (61 - 58 * tanPhi * tanPhi + Math.pow(tanPhi, 4));
    var IV = nu * cosPhi;
    var V = (nu / 6) * Math.pow(cosPhi, 3) * (nu / rho - tanPhi * tanPhi);
    var VI = (nu / 120) * Math.pow(cosPhi, 5) * (5 - 18 * tanPhi * tanPhi + Math.pow(tanPhi, 4) + 14 * eta2 - 58 * tanPhi * tanPhi * eta2);
    var dLam = lam - LON0;

    return {
      easting: E0 + IV * dLam + V * Math.pow(dLam, 3) + VI * Math.pow(dLam, 5),
      northing: I + II * dLam * dLam + III * Math.pow(dLam, 4) + IIIA * Math.pow(dLam, 6),
    };
  }

  /** easting/northing → OSGB36 lat/lon (iterative footpoint latitude). */
  function gridToOsgb36(easting, northing) {
    var el = airyParams();
    var a = el.a, b = el.b, n = el.n, e2 = el.e2;
    var phi = LAT0;
    var M = 0;
    for (var i = 0; i < 12; i += 1) {
      phi = (northing - N0 - M) / (a * F0) + phi;
      M = b * F0 * (
        (1 + n + (5 / 4) * n * n + (5 / 4) * n * n * n) * (phi - LAT0) -
        (3 * n + 3 * n * n + (21 / 8) * n * n * n) * Math.sin(phi - LAT0) * Math.cos(phi + LAT0) +
        ((15 / 8) * (n * n + n * n * n)) * Math.sin(2 * (phi - LAT0)) * Math.cos(2 * (phi + LAT0)) -
        (35 / 24) * n * n * n * Math.sin(3 * (phi - LAT0)) * Math.cos(3 * (phi + LAT0))
      );
      if (Math.abs(northing - N0 - M) < 1e-6) break;
    }
    var sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), tanPhi = Math.tan(phi);
    var nu = a * F0 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    var rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
    var eta2 = nu / rho - 1;
    var VII = tanPhi / (2 * rho * nu);
    var VIII = tanPhi / (24 * rho * Math.pow(nu, 3)) * (5 + 3 * tanPhi * tanPhi + eta2 - 9 * tanPhi * tanPhi * eta2);
    var IX = tanPhi / (720 * rho * Math.pow(nu, 5)) * (61 + 90 * tanPhi * tanPhi + 45 * Math.pow(tanPhi, 4));
    var X = 1 / (cosPhi * nu);
    var XI = 1 / (cosPhi * 6 * Math.pow(nu, 3)) * (nu / rho + 2 * tanPhi * tanPhi);
    var XII = 1 / (cosPhi * 120 * Math.pow(nu, 5)) * (5 + 28 * tanPhi * tanPhi + 24 * Math.pow(tanPhi, 4));
    var XIIA = 1 / (cosPhi * 5040 * Math.pow(nu, 7)) * (61 + 662 * tanPhi * tanPhi + 1320 * Math.pow(tanPhi, 4) + 720 * Math.pow(tanPhi, 6));
    var dE = easting - E0;
    var lat = phi - VII * Math.pow(dE, 2) + VIII * Math.pow(dE, 4) - IX * Math.pow(dE, 6);
    var lon = LON0 + X * dE - XI * Math.pow(dE, 3) + XII * Math.pow(dE, 5) - XIIA * Math.pow(dE, 7);
    return { lat: toDeg(lat), lon: toDeg(lon) };
  }

  // Letters: three rows of two 500 km squares, then A–Z (no I) inside each.
  var FIRST_LETTERS = [['S', 'T'], ['N', 'O'], ['H', 'J']];
  var SECOND_LETTERS = [
    ['A', 'B', 'C', 'D', 'E'],
    ['F', 'G', 'H', 'J', 'K'],
    ['L', 'M', 'N', 'O', 'P'],
    ['Q', 'R', 'S', 'T', 'U'],
    ['V', 'W', 'X', 'Y', 'Z'],
  ];

  function lettersFor(easting, northing) {
    var row = Math.floor(northing / 500000);
    var col = Math.floor(easting / 500000);
    if (row < 0 || row > 2 || col < 0 || col > 1) return null;
    var first = FIRST_LETTERS[row][col];
    var e100 = Math.floor((easting % 500000) / 100000);
    var n100 = Math.floor((northing % 500000) / 100000);
    var second = SECOND_LETTERS[4 - n100][e100];
    return { letters: first + second, e100: e100, n100: n100 };
  }

  /**
   * gridRef(easting, northing, figures) → "TG 51409 13177".
   * figures = digits per axis (1, 2, 3, 4 or 5 — 5 is a metre).
   */
  function gridRef(easting, northing, figures) {
    var digits = figures == null ? 5 : figures;
    if (digits < 1 || digits > 5) return null;
    if (easting < 0 || easting >= 1000000 || northing < 0 || northing >= 1500000) return null;
    var letters = lettersFor(easting, northing);
    if (!letters) return null;
    var remE = easting - Math.floor(easting / 100000) * 100000;
    var remN = northing - Math.floor(northing / 100000) * 100000;
    var divisor = Math.pow(10, 5 - digits);
    var e = Math.floor(remE / divisor);
    var n = Math.floor(remN / divisor);
    var pad = function (v) {
      var s = String(v);
      while (s.length < digits) s = '0' + s;
      return s;
    };
    return letters.letters + ' ' + pad(e) + ' ' + pad(n);
  }

  /** Grid reference → WGS84. Accepts any spacing, lower case, 1–5 figure pairs. */
  function parseGridRef(text) {
    if (typeof text !== 'string') return null;
    var cleaned = text.toUpperCase().replace(/\s+/g, '');
    var m = cleaned.match(/^([STNOHJ])([A-HJ-Z])(\d+)$/);
    if (!m) return null;
    var digits = m[3];
    if (digits.length % 2 !== 0 || digits.length < 2 || digits.length > 10) return null;
    var half = digits.length / 2;
    var first = m[1], second = m[2];
    var row = -1, col = -1;
    for (var r = 0; r < FIRST_LETTERS.length; r += 1) {
      var c = FIRST_LETTERS[r].indexOf(first);
      if (c >= 0) { row = r; col = c; }
    }
    if (row === -1) return null;
    var secondRow = -1, secondCol = -1;
    for (var sr = 0; sr < SECOND_LETTERS.length; sr += 1) {
      var sc = SECOND_LETTERS[sr].indexOf(second);
      if (sc >= 0) { secondRow = sr; secondCol = sc; }
    }
    if (secondRow === -1) return null;
    var e100k = col * 5 + secondCol;
    var n100k = row * 5 + (4 - secondRow);
    var scale = Math.pow(10, 5 - half);
    var easting = e100k * 100000 + parseInt(digits.slice(0, half), 10) * scale + scale / 2;
    var northing = n100k * 100000 + parseInt(digits.slice(half), 10) * scale + scale / 2;
    var osgb = gridToOsgb36(easting, northing);
    var wgs = osgb36ToWgs84(osgb.lat, osgb.lon);
    return {
      easting: easting, northing: northing,
      osgb36: osgb,
      lat: wgs.lat, lon: wgs.lon,
      figures: half,
      precisionMetres: scale,
    };
  }

  /** WGS84 lat/lon → the full answer the interface shows. */
  function fromWgs84(lat, lon, figures) {
    var osgb = wgs84ToOsgb36(lat, lon);
    var grid = osgb36ToGrid(osgb.lat, osgb.lon);
    return {
      easting: grid.easting,
      northing: grid.northing,
      gridRef: gridRef(grid.easting, grid.northing, figures == null ? 5 : figures),
      osgb36: osgb,
      // How far the datum shift moved the point — shown so the ±5 m claim
      // is visibly about the transform, not about the projection.
      datumShiftMetres: MM.geodesy
        ? MM.geodesy.distanceKm({ lat: lat, lon: lon }, { lat: osgb.lat, lon: osgb.lon }) * 1000
        : null,
    };
  }

  /** Is this point inside the area the National Grid is defined over? */
  function inNationalGrid(lat, lon) {
    return lat > 49.5 && lat < 61.5 && lon > -8.5 && lon < 2.5;
  }

  /**
   * Will a National Grid reference mean anything here?
   *
   * The OS National Grid covers Great Britain (and the Isle of Man). Ireland —
   * north and south — uses the Irish Grid, where the same letter pair means a
   * completely different place, so producing a "GB" reference for Belfast
   * would be worse than producing nothing.
   *
   * This is a deliberate geographic approximation rather than a coastline
   * test: two boxes cover the island of Ireland and everything inside them is
   * refused. The cost is a false negative at the Mull of Kintyre, where a grid
   * reference is valid but we stay quiet. A false positive — inventing a
   * reference for Belfast — would be far worse, so the boxes are drawn wide.
   */
  function coveredBy(lat, lon) {
    if (!inNationalGrid(lat, lon)) return false;
    var republicOfIreland = lat > 51.3 && lat < 54.6 && lon > -10.8 && lon < -5.85;
    var northernIreland = lat > 53.9 && lat < 55.4 && lon > -8.4 && lon < -5.3;
    return !(republicOfIreland || northernIreland);
  }

  MM.gridref = {
    wgs84ToOsgb36: wgs84ToOsgb36,
    osgb36ToWgs84: osgb36ToWgs84,
    osgb36ToGrid: osgb36ToGrid,
    gridToOsgb36: gridToOsgb36,
    gridRef: gridRef,
    parseGridRef: parseGridRef,
    fromWgs84: fromWgs84,
    lettersFor: lettersFor,
    inNationalGrid: inNationalGrid,
    coveredBy: coveredBy,
    accuracyNote: 'Helmert transform: ±5 m typical across Great Britain',
  };

  if (typeof module === 'object' && module.exports) module.exports = MM.gridref;
})(typeof globalThis !== 'undefined' ? globalThis : this);
