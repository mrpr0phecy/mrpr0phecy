/**
 * maps/core/locators.js — the other ways people write a location, on the device.
 *
 * MostUsefulMaps already reads and writes Plus Codes and OS National Grid
 * references. This module adds the three grid systems the rest of the world
 * actually uses, all of them pure arithmetic with no table to ship and no
 * service to call:
 *
 *   - **Geohash** (Niemeyer, 2008, public domain): the base-32 z-order code
 *     under geocaching, database indexes and "geo:" links. Arbitrary precision
 *     — 9 characters is about 5 m, a prefix is a bigger cell.
 *   - **Maidenhead locators** (1980, the amateur radio grid): AA00aa, the code
 *     a licensed radio operator reads out. Six characters is about 9 × 5 km at
 *     British latitudes.
 *   - **UTM** (Universal Transverse Mercator): metres east and north inside a
 *     6° zone — what a handheld GPS, a survey note or a search-and-rescue
 *     brief gives you, including the Norway and Svalbard zone exceptions that
 *     every conformant implementation owes the user.
 *
 * Why these three and not every system ever invented: they are the ones where
 * a person with no data connection, no key and no account can be handed a code
 * and land on the right spot. What is deliberately *not* here is any grid
 * whose published algorithm we could not verify against a reference value
 * (see the tests), and MGRS/USNG, because its 100 km square lettering needs a
 * table of exceptions we would have to invent rather than check.
 *
 * Honesty about accuracy, which matters more than a long feature list:
 *   - Geohash and Maidenhead are *areas*, not points. decode*() returns the
 *     centre of the cell and also the cell's bounds, and the interface says so.
 *   - UTM here is the standard Snyder series on the WGS84 ellipsoid: good to
 *     well under a metre inside the zone the point belongs to, degrading
 *     outside it. That is stated, and the module reports how far outside the
 *     point is rather than pretending eastings travel.
 *
 * Everything is exported on MM.locators and used by maps/app.js for the place
 * panel, by maps/core/gazetteer.js so the search box accepts these codes, and
 * by maps/embed.js so any of the 1,300 cards can have them too.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});

  var toRad = function (d) { return d * Math.PI / 180; };
  var toDeg = function (r) { return r * 180 / Math.PI; };

  function validLat(lat) { return typeof lat === 'number' && isFinite(lat) && lat >= -90 && lat <= 90; }
  function validLon(lon) { return typeof lon === 'number' && isFinite(lon) && lon >= -180 && lon <= 180; }

  /** Longitude into [-180, 180): 180° is the same meridian as −180°. */
  function wrapLon(lon) {
    var v = lon;
    while (v < -180) v += 360;
    while (v >= 180) v -= 360;
    return v;
  }

  /** Degrees of longitude/latitude to kilometres — the honest, labelled version. */
  function kmPerDegree(lat) {
    var cos = Math.cos(toRad(lat));
    return { lat: 110.574, lon: 111.320 * Math.abs(cos) };
  }

  // ------------------------------------------------------------------ geohash

  // The base-32 alphabet, minus a, i, l and o.
  var GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
  var GEOHASH_MAX_PRECISION = 12;

  /**
   * geohash(lat, lon, precision) → 'u4pruydqqvj'.
   *
   * Interleaved bisection of longitude (even bits) and latitude (odd bits),
   * five bits to a character. Longitude is normalised first, so 180° and
   * −180° produce the same cell rather than two cells either side of a seam
   * that does not exist.
   */
  function geohash(lat, lon, precision) {
    if (!validLat(lat) || !validLon(lon)) return null;
    var p = precision == null ? 9 : Math.round(precision);
    if (p < 1 || p > GEOHASH_MAX_PRECISION) return null;
    var lonValue = wrapLon(lon);
    var latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
    var out = '';
    var chunk = 0, bitsUsed = 0, even = true;
    while (out.length < p) {
      if (even) {
        var lonMid = (lonMin + lonMax) / 2;
        if (lonValue >= lonMid) { chunk = chunk * 2 + 1; lonMin = lonMid; } else { chunk = chunk * 2; lonMax = lonMid; }
      } else {
        var latMid = (latMin + latMax) / 2;
        if (lat >= latMid) { chunk = chunk * 2 + 1; latMin = latMid; } else { chunk = chunk * 2; latMax = latMid; }
      }
      even = !even;
      bitsUsed += 1;
      if (bitsUsed === 5) {
        out += GEOHASH_ALPHABET.charAt(chunk);
        chunk = 0;
        bitsUsed = 0;
      }
    }
    return out;
  }

  /** Is this text exactly a geohash? Letters a, i, l and o never appear in one. */
  function isGeohash(text, options) {
    if (typeof text !== 'string') return false;
    var opts = options || {};
    var min = opts.min == null ? 1 : opts.min;
    var max = opts.max == null ? GEOHASH_MAX_PRECISION : opts.max;
    var s = text.trim().toLowerCase();
    if (s.length < min || s.length > max) return false;
    return /^[0-9bcdefghjkmnpqrstuvwxyz]+$/.test(s);
  }

  /**
   * decodeGeohash('ezs42') → the cell, not just a point.
   * `lat`/`lon` are the centre (the convention every library shares); `bbox` is
   * the truth, and `sizeKm` says roughly how big that truth is.
   */
  function decodeGeohash(text) {
    if (!isGeohash(text)) return { error: 'not a geohash' };
    var s = String(text).trim().toLowerCase();
    var latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
    var even = true;
    for (var i = 0; i < s.length; i += 1) {
      var value = GEOHASH_ALPHABET.indexOf(s.charAt(i));
      for (var bit = 4; bit >= 0; bit -= 1) {
        var one = (value >> bit) & 1;
        if (even) {
          var lonMid = (lonMin + lonMax) / 2;
          if (one) lonMin = lonMid; else lonMax = lonMid;
        } else {
          var latMid = (latMin + latMax) / 2;
          if (one) latMin = latMid; else latMax = latMid;
        }
        even = !even;
      }
    }
    var lat = (latMin + latMax) / 2;
    var lon = (lonMin + lonMax) / 2;
    var bbox = { west: lonMin, south: latMin, east: lonMax, north: latMax };
    return {
      lat: lat, lon: lon,
      precision: s.length,
      cell: s,
      bbox: bbox,
      sizeKm: { lat: (latMax - latMin) * 110.574, lon: (lonMax - lonMin) * kmPerDegree(lat).lon },
    };
  }

  /**
   * The eight cells around this one, named by compass point.
   *
   * Moving one cell width from the centre of a cell lands on the centre of the
   * neighbour — exactly, because both are dyadic fractions of the world — so
   * this needs no border lookup table and cannot drift. Returns null where a
   * neighbour does not exist (off the end of the world at the poles).
   */
  function geohashNeighbours(text) {
    var cell = decodeGeohash(text);
    if (cell.error) return null;
    var dLat = cell.bbox.north - cell.bbox.south;
    var dLon = cell.bbox.east - cell.bbox.west;
    var out = {};
    var names = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    var offsets = {
      n: [1, 0], ne: [1, 1], e: [0, 1], se: [-1, 1],
      s: [-1, 0], sw: [-1, -1], w: [0, -1], nw: [1, -1],
    };
    for (var i = 0; i < names.length; i += 1) {
      var name = names[i];
      var lat = cell.lat + offsets[name][0] * dLat;
      var lon = cell.lon + offsets[name][1] * dLon;
      if (lat > 90 || lat < -90) { out[name] = null; continue; }
      out[name] = geohash(lat, wrapLon(lon), cell.precision);
    }
    return out;
  }

  /** Roughly how wide a geohash of this length is, in metres. */
  function geohashPrecisionMetres(precision) {
    var cells = Math.pow(32, precision);
    // Five bits split between the two axes; longitude gets the extra bit.
    var lonBits = Math.ceil(precision * 5 / 2);
    var latBits = Math.floor(precision * 5 / 2);
    if (cells <= 0) return null;
    return {
      lat: 180 / Math.pow(2, latBits) * 110574,
      lon: 360 / Math.pow(2, lonBits) * 111320,
    };
  }

  // --------------------------------------------------------------- maidenhead

  var MAIDENHEAD_MAX_PAIRS = 5;
  var FIELD_LETTERS = 18; // A–R
  var SUBSQUARE_LETTERS = 24; // A–X, i included here (unlike geohash)

  function letterAt(index) { return String.fromCharCode('A'.charCodeAt(0) + index); }

  /**
   * maidenhead(lat, lon, pairs) → 'IO91WM'.
   * pairs = 1 is the 20°×10° field, 2 adds the 2°×1° square, 3 the 5'×2.5'
   * subsquare (what a radio operator reads out), 4 and 5 the extensions.
   */
  function maidenhead(lat, lon, pairs) {
    if (!validLat(lat) || !validLon(lon)) return null;
    var p = pairs == null ? 3 : Math.round(pairs);
    if (p < 1 || p > MAIDENHEAD_MAX_PAIRS) return null;
    var lonValue = wrapLon(lon) + 180; // 0–360
    var latValue = lat + 90; // 0–180

    // Field: 20° of longitude, 10° of latitude, letters A–R.
    // A point exactly at the north pole or on the 180° meridian sits on the
    // top-right corner of the last field rather than outside all of them, so
    // the index is clamped there instead of running off the alphabet.
    var lonIndex = Math.min(FIELD_LETTERS - 1, Math.floor(lonValue / 20));
    var latIndex = Math.min(FIELD_LETTERS - 1, Math.floor(latValue / 10));
    var out = letterAt(lonIndex) + letterAt(latIndex);
    // Both remainders stay inside the field: the cell a boundary point is
    // named by is the one whose north and east edges it sits on.
    var lonRem = Math.min(lonValue - lonIndex * 20, 19.999999999);
    var latRem = Math.min(latValue - latIndex * 10, 9.999999999);
    if (p === 1) return out;

    // Square: 2° × 1°, digits.
    out += Math.floor(lonRem / 2) + '' + Math.floor(latRem / 1);
    lonRem = lonRem % 2;
    latRem = latRem % 1;
    if (p === 2) return out;

    // Subsquare: 24 × 24, letters A–X.
    out += letterAt(Math.floor(lonRem * 12)) + letterAt(Math.floor(latRem * 24));
    lonRem = lonRem * 12 % 1;
    latRem = latRem * 24 % 1;
    if (p === 3) return out;

    // Extended subsquare: digits again, then letters once more.
    out += Math.floor(lonRem * 10) + '' + Math.floor(latRem * 10);
    lonRem = lonRem * 10 % 1;
    latRem = latRem * 10 % 1;
    if (p === 4) return out;

    out += letterAt(Math.floor(lonRem * 24)) + letterAt(Math.floor(latRem * 24));
    return out;
  }

  /** Is this a Maidenhead locator? Accepts AA, AA00, AA00aa … up to five pairs. */
  function isMaidenhead(text) {
    if (typeof text !== 'string') return false;
    var s = text.trim().replace(/\s+/g, '').toUpperCase();
    return /^[A-R]{2}(\d{2}([A-X]{2}(\d{2}([A-X]{2})?)?)?)?$/.test(s);
  }

  /** Cell size in degrees for a Maidenhead locator at `pairs` pairs. */
  function maidenheadCellDegrees(pairs) {
    var lon = 20, lat = 10;
    var out = { lon: lon, lat: lat };
    for (var i = 2; i <= pairs; i += 1) {
      var divisor = (i % 2 === 0) ? 10 : 24;
      out.lon /= divisor;
      out.lat /= divisor;
    }
    return out;
  }

  /** decodeMaidenhead('IO91WM') → centre, bounds and how big that is. */
  function decodeMaidenhead(text) {
    if (!isMaidenhead(text)) return { error: 'not a Maidenhead locator' };
    var s = String(text).trim().replace(/\s+/g, '').toUpperCase();
    var pairs = Math.ceil(s.length / 2);

    // Southwest corner of the field, then walk in.
    var lon = (s.charCodeAt(0) - 65) * 20 - 180;
    var lat = (s.charCodeAt(1) - 65) * 10 - 90;

    var cell = { lon: 20, lat: 10 };
    for (var pair = 2; pair <= pairs; pair += 1) {
      var a = s.charAt((pair - 1) * 2);
      var b = s.charAt((pair - 1) * 2 + 1);
      if (pair % 2 === 0) {
        // Square / extended subsquare: digits 0–9.
        cell = { lon: cell.lon / 10, lat: cell.lat / 10 };
        lon += parseInt(a, 10) * cell.lon;
        lat += parseInt(b, 10) * cell.lat;
      } else {
        // Subsquare / second extension: letters A–X, 24 divisions.
        cell = { lon: cell.lon / 24, lat: cell.lat / 24 };
        lon += (a.charCodeAt(0) - 65) * cell.lon;
        lat += (b.charCodeAt(0) - 65) * cell.lat;
      }
    }

    var centreLat = lat + cell.lat / 2;
    var centreLon = lon + cell.lon / 2;
    return {
      lat: centreLat, lon: centreLon,
      pairs: pairs,
      locator: s,
      bbox: { west: lon, south: lat, east: lon + cell.lon, north: lat + cell.lat },
      sizeKm: { lat: cell.lat * 110.574, lon: cell.lon * kmPerDegree(centreLat).lon },
    };
  }

  /** "about 4.8 m" / "about 1.2 km" — the span of a cell, in units a person reads. */
  function describeSpan(metres) {
    if (!isFinite(metres) || metres <= 0) return 'an unknown distance';
    if (metres < 1000) return Math.round(metres) + ' m';
    if (metres < 10000) return (metres / 1000).toFixed(1) + ' km';
    return Math.round(metres / 1000) + ' km';
  }

  /** normalise('io91 wm') → 'IO91WM' — one obvious spelling for display. */
  function normaliseMaidenhead(text) {
    if (!isMaidenhead(text)) return null;
    return String(text).trim().replace(/\s+/g, '').toUpperCase();
  }

  // --------------------------------------------------------------------- UTM

  var WGS84_A = 6378137.0;
  var WGS84_F = 1 / 298.257223563;
  var WGS84_E2 = WGS84_F * (2 - WGS84_F);
  var WGS84_EP2 = WGS84_E2 / (1 - WGS84_E2);
  var UTM_K0 = 0.9996;
  var UTM_FALSE_EASTING = 500000;
  var UTM_FALSE_NORTHING = 10000000;
  var BAND_LETTERS = 'CDEFGHJKLMNPQRSTUVWX'; // C–X, no I and no O
  var BAND_HEIGHT = 8;

  /**
   * The latitude band letter for a latitude.
   * C–M is the southern hemisphere, N–X the northern one; band X is 12° tall
   * (72–84°N) to top out at the UTM limit.
   */
  function bandLetter(lat) {
    if (!isFinite(lat) || lat < -80 || lat > 84) return null;
    var index = Math.floor((lat + 80) / BAND_HEIGHT);
    if (index > 19) index = 19;
    if (index < 0) index = 0;
    return BAND_LETTERS.charAt(index);
  }

  /**
   * The UTM zone for a point, including the exceptions that are part of the
   * standard rather than a quirk of it: zone 32V is widened west to 3°E
   * between 56°N and 64°N so that south-west Norway sits in one zone, and
   * north of 72°N zones 32X, 34X and 36X do not exist — 31X, 33X, 35X and 37X
   * cover Svalbard instead. Ignoring them produces a wrong zone in those two
   * places, which is why they are here and in the tests.
   */
  function utmZone(lat, lon) {
    // 180°E is the same meridian as 180°W, but it belongs to zone 60 (174–180
    // E) rather than to zone 1 wrapping round — so it is answered before the
    // wrap, not after it.
    var lonValue = lon === 180 ? 180 : wrapLon(lon);
    var zone = lonValue === 180 ? 60 : Math.floor((lonValue + 180) / 6) + 1;
    if (zone < 1) zone = 1;
    if (zone > 60) zone = 60;
    if (lat >= 56 && lat < 64 && lonValue >= 3 && lonValue < 12) zone = 32;
    if (lat >= 72 && lat < 84) {
      if (lonValue >= 0 && lonValue < 9) zone = 31;
      else if (lonValue >= 9 && lonValue < 21) zone = 33;
      else if (lonValue >= 21 && lonValue < 33) zone = 35;
      else if (lonValue >= 33 && lonValue < 42) zone = 37;
    }
    return zone;
  }

  /** The central meridian of a zone: 177°W for zone 1, 3°W for zone 30. */
  function zoneCentralMeridian(zone) {
    return zone * 6 - 183;
  }

  /**
   * Signed difference lon − lon0, wrapped into (−180, 180].
   * A point at 180°E is 3° east of zone 60's meridian, not 357° west of it.
   */
  function deltaLon(lon, lon0) {
    var d = lon - lon0;
    while (d <= -180) d += 360;
    while (d > 180) d -= 360;
    return d;
  }

  /** Meridional arc (Snyder 3-21) — the distance from the equator along the meridian. */
  function meridionalArc(phi) {
    var e2 = WGS84_E2, e4 = e2 * e2, e6 = e4 * e2;
    return WGS84_A * (
      (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
      - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
      - (35 * e6 / 3072) * Math.sin(6 * phi)
    );
  }

  /**
   * utm(lat, lon) → { zone, band, hemisphere, easting, northing, … }.
   * Metres, on WGS84, using the standard transverse Mercator series.
   */
  function utm(lat, lon) {
    if (!validLat(lat) || !validLon(lon)) return null;
    var zone = utmZone(lat, lon);
    var lon0 = zoneCentralMeridian(zone);
    var delta = deltaLon(lon, lon0);
    var phi = toRad(lat);
    var sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), tanPhi = Math.tan(phi);

    var N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
    var T = tanPhi * tanPhi;
    var C = WGS84_EP2 * cosPhi * cosPhi;
    var A = toRad(delta) * cosPhi;
    var M = meridionalArc(phi);

    var A2 = A * A, A3 = A2 * A, A4 = A3 * A, A5 = A4 * A, A6 = A5 * A;
    var easting = UTM_K0 * N * (
      A + (1 - T + C) * A3 / 6
      + (5 - 18 * T + T * T + 72 * C - 58 * WGS84_EP2) * A5 / 120
    ) + UTM_FALSE_EASTING;
    var northing = UTM_K0 * (
      M + N * tanPhi * (
        A2 / 2
        + (5 - T + 9 * C + 4 * C * C) * A4 / 24
        + (61 - 58 * T + T * T + 600 * C - 330 * WGS84_EP2) * A6 / 720
      )
    );
    var hemisphere = lat >= 0 ? 'N' : 'S';
    if (hemisphere === 'S') northing += UTM_FALSE_NORTHING;

    // Grid convergence: how far grid north is from true north here. The
    // spherical form, which is what a map margin prints.
    var convergence = toDeg(Math.atan(Math.tan(toRad(delta)) * Math.sin(phi)));

    return {
      zone: zone,
      band: bandLetter(lat),
      hemisphere: hemisphere,
      easting: easting,
      northing: northing,
      centralMeridian: lon0,
      convergenceDegrees: convergence,
      zoneOffsetDegrees: Math.abs(delta),
    };
  }

  /** "17T 630084 4833438" — the way a handheld GPS or a SAR brief writes it. */
  function utmString(lat, lon, options) {
    var result = utm(lat, lon);
    if (!result) return null;
    var opts = options || {};
    var digits = opts.eastingDigits == null ? 6 : opts.eastingDigits;
    var northDigits = opts.northingDigits == null ? 7 : opts.northingDigits;
    var pad = function (value, width) {
      var s = String(Math.round(value));
      while (s.length < width) s = '0' + s;
      return s;
    };
    var band = result.band || (result.hemisphere === 'N' ? 'N' : 'M');
    return result.zone + band + ' ' + pad(result.easting, digits) + ' ' + pad(result.northing, northDigits);
  }

  /** UTM → WGS84 (Snyder's inverse series). */
  function fromUtm(input) {
    var spec = input || {};
    var zone = Math.round(Number(spec.zone));
    if (!isFinite(zone) || zone < 1 || zone > 60) return null;
    var easting = Number(spec.easting);
    var northing = Number(spec.northing);
    if (!isFinite(easting) || !isFinite(northing)) return null;
    var hemisphere = spec.hemisphere === 'S' ? 'S' : 'N';

    var x = easting - UTM_FALSE_EASTING;
    var y = hemisphere === 'S' ? northing - UTM_FALSE_NORTHING : northing;
    var lon0 = zoneCentralMeridian(zone);

    var M = y / UTM_K0;
    var e1 = (1 - Math.sqrt(1 - WGS84_E2)) / (1 + Math.sqrt(1 - WGS84_E2));
    var mu = M / (WGS84_A * (1 - WGS84_E2 / 4 - 3 * WGS84_E2 * WGS84_E2 / 64 - 5 * WGS84_E2 * WGS84_E2 * WGS84_E2 / 256));

    var phi1 = mu
      + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
      + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
      + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);

    var sinPhi1 = Math.sin(phi1), cosPhi1 = Math.cos(phi1), tanPhi1 = Math.tan(phi1);
    var C1 = WGS84_EP2 * cosPhi1 * cosPhi1;
    var T1 = tanPhi1 * tanPhi1;
    var N1 = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi1 * sinPhi1);
    var R1 = WGS84_A * (1 - WGS84_E2) / Math.pow(1 - WGS84_E2 * sinPhi1 * sinPhi1, 1.5);
    var D = x / (N1 * UTM_K0);
    var D2 = D * D, D3 = D2 * D, D4 = D3 * D, D5 = D4 * D, D6 = D5 * D;

    var lat = phi1 - (N1 * tanPhi1 / R1) * (
      D2 / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * WGS84_EP2) * D4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * WGS84_EP2 - 3 * C1 * C1) * D6 / 720
    );
    var lon = (D - (1 + 2 * T1 + C1) * D3 / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * WGS84_EP2 + 24 * T1 * T1) * D5 / 120) / cosPhi1;

    var outLat = toDeg(lat);
    var outLon = wrapLon(lon0 + toDeg(lon));
    return {
      lat: outLat,
      lon: outLon,
      zone: zone,
      hemisphere: hemisphere,
      band: bandLetter(outLat),
    };
  }

  function bandHemisphere(letter) {
    if (!letter) return null;
    var index = BAND_LETTERS.indexOf(letter);
    if (index < 0) return null;
    return index < 10 ? 'S' : 'N';
  }

  /**
   * parseUtm('17T 630084 4833438') → { zone, band, hemisphere, easting,
   * northing, lat, lon, warnings }.
   *
   * Accepts the spellings people and machines actually use: an optional
   * "UTM"/"zone" prefix, an optional E/N suffix on either number, a band
   * letter or a bare hemisphere letter. The band letter wins over a bare N/S
   * because C–X are the standard band letters and only X, N and S are ever
   * ambiguous with a hemisphere — and where they are, the band is what the
   * coordinate was written with.
   */
  function parseUtm(text) {
    if (typeof text !== 'string') return null;
    var cleaned = text.toUpperCase()
      .replace(/[,\u00b0]/g, ' ')
      .replace(/\bUTM\b|\bZONE\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return null;
    var tokens = cleaned.split(' ').filter(Boolean);
    if (tokens.length < 3 || tokens.length > 4) return null;

    // Three parts, in whatever order they were written: a zone (1–60, with an
    // optional band or hemisphere letter, alone or joined to the digits), and
    // two metre values that may carry an E or an N.
    var zone = null, letter = null;
    var numbers = [];
    for (var i = 0; i < tokens.length; i += 1) {
      var token = tokens[i];
      var zoned = token.match(/^(\d{1,2})([A-Z])?$/);
      if (zoned && zone === null) {
        zone = parseInt(zoned[1], 10);
        letter = zoned[2] || null;
        continue;
      }
      if (/^[A-Z]$/.test(token) && letter === null && zone !== null) { letter = token; continue; }
      var number = token.match(/^(\d{3,8}(?:\.\d+)?)([EN])?$/);
      if (number) { numbers.push(number); continue; }
      return null;
    }
    if (zone === null || zone < 1 || zone > 60) return null;
    if (numbers.length !== 2) return null;

    var first = parseFloat(numbers[0][1]);
    var second = parseFloat(numbers[1][1]);

    // E/N suffixes settle the order; without them, easting comes first, which
    // is the convention everywhere UTM is written.
    var easting = first, northing = second;
    if (numbers[0][2] === 'N' || numbers[1][2] === 'E') { easting = second; northing = first; }
    if (!isFinite(easting) || !isFinite(northing)) return null;
    if (easting < 0 || easting > 1000000) return null;
    if (northing < 0 || northing > 10000000) return null;

    var warnings = [];
    var hemisphere = bandHemisphere(letter);
    if (!hemisphere) {
      // No band and no usable letter: the northern hemisphere is the default
      // people write, so take it — and say so.
      hemisphere = 'N';
      warnings.push('no latitude band given — read as the northern hemisphere');
    }

    var point = fromUtm({ zone: zone, hemisphere: hemisphere, easting: easting, northing: northing });
    if (!point) return null;

    var zoneOffset = Math.abs(deltaLon(point.lon, zoneCentralMeridian(zone)));
    if (zoneOffset > 3.5) {
      warnings.push('this point is ' + zoneOffset.toFixed(1) + '° from zone ' + zone
        + "'s central meridian — it is outside the zone it was written for, so its eastings are stretched");
    }

    return {
      zone: zone,
      band: letter,
      hemisphere: hemisphere,
      easting: easting,
      northing: northing,
      lat: point.lat,
      lon: point.lon,
      warnings: warnings,
      label: zone + (letter || hemisphere) + ' ' + Math.round(easting) + ' ' + Math.round(northing),
    };
  }

  /** Would parseUtm() find a coordinate in this text? Cheap shape check. */
  function isUtm(text) {
    return !!parseUtm(text);
  }

  // ------------------------------------------------------------- one front door

  /**
   * Read the locator codes this module knows, in the order that is least
   * surprising: UTM (needs digits and letters), then Maidenhead, then — only
   * when the caller allows it — geohash, which is the one that can collide
   * with a word. Callers that can also try a place search pass
   * { geohash: true } *after* the search comes up empty.
   *
   * `maidenheadMin` is the number of pairs a caller will accept as an answer,
   * 2 by default. There is a second collision besides words: a two-pair
   * locator ("IO91") has the same shape as a UK postcode district ("CF10",
   * "HP12", "AB10"), and reading one as the other drops a pin in the ocean.
   * A caller with a place index therefore asks for three pairs first and
   * offers a two-pair locator as a suggestion — the same treatment geohash
   * gets, and for the same reason.
   */
  function interpret(text, options) {
    var opts = options || {};
    if (typeof text !== 'string') return null;
    var trimmed = text.trim();
    if (!trimmed) return null;

    var utmRead = parseUtm(trimmed);
    if (utmRead) {
      return {
        kind: 'utm',
        point: { lat: utmRead.lat, lon: utmRead.lon },
        label: utmRead.label,
        note: 'Read as a UTM coordinate in zone ' + utmRead.zone + (utmRead.band || utmRead.hemisphere)
          + ' — metres east and north on WGS84.'
          + (utmRead.warnings.length ? ' ' + utmRead.warnings.join('; ') + '.' : ''),
        warnings: utmRead.warnings,
        results: [],
      };
    }

    var maiden = decodeMaidenhead(trimmed);
    var maidenheadMin = opts.maidenheadMin == null ? 2 : opts.maidenheadMin;
    if (!maiden.error && maiden.pairs >= maidenheadMin) {
      return {
        kind: 'maidenhead',
        point: { lat: maiden.lat, lon: maiden.lon },
        label: maiden.locator,
        note: 'Read as a Maidenhead locator (' + maiden.pairs + ' pairs, about '
          + Math.round(maiden.sizeKm.lon) + ' × ' + Math.round(maiden.sizeKm.lat) + ' km).',
        bbox: maiden.bbox,
        results: [],
      };
    }

    // Geohash is on by default here — this function's job is to read codes —
    // and the callers that also have a place index turn it off for the first
    // pass, so that a word is never beaten to the answer by a code.
    if (opts.geohash !== false && isGeohash(trimmed, { min: opts.geohashMin == null ? 4 : opts.geohashMin })) {
      var cell = decodeGeohash(trimmed);
      if (!cell.error) {
        return {
          kind: 'geohash',
          point: { lat: cell.lat, lon: cell.lon },
          label: cell.cell,
          note: 'Read as a geohash — ' + cell.precision + ' characters, a cell about '
            + describeSpan(cell.sizeKm.lon * 1000) + ' across.',
          bbox: cell.bbox,
          results: [],
        };
      }
    }

    return null;
  }

  /**
   * formats(lat, lon, options) → the rows the interface shows.
   * One list, so the page, the embed API and the tests all describe a point
   * the same way. Rows are { id, label, value, note? }.
   */
  function formats(lat, lon, options) {
    if (!validLat(lat) || !validLon(lon)) return [];
    var opts = options || {};
    var rows = [];
    var G = MM.geodesy;

    if (G) {
      rows.push({ id: 'decimal', label: 'Decimal degrees', value: G.formatLatLon({ lat: lat, lon: lon }, null, 5) });
      rows.push({ id: 'dms', label: 'Degrees, minutes, seconds', value: G.formatLatLon({ lat: lat, lon: lon }, 'dms') });
    }

    if (MM.olc) {
      var code = MM.olc.encode(lat, lon);
      rows.push({
        id: 'plus-code',
        label: 'Plus Code',
        value: code,
        note: 'Full code — 14 m across at full precision',
      });
      var reference = opts.plusCodeReference;
      if (reference && isFinite(reference.lat) && isFinite(reference.lon) && MM.olc.shorten) {
        // A short Plus Code is only meaningful near the place it was shortened
        // against, so the caller has to say which place that was.
        var shortened = MM.olc.shorten(code, reference.lat, reference.lon);
        // Below four characters a shortened code cannot be read back without
        // the place it came from, which is a footnote rather than a code.
        if (shortened && shortened !== code && shortened.length >= 4) {
          rows.push({
            id: 'plus-code-short',
            label: 'Plus Code (nearby)',
            value: shortened,
            note: 'Short form: the leading digits repeat the map centre’s, so they are dropped',
          });
        }
      }
    }

    var hashPrecision = opts.geohashPrecision == null ? 9 : opts.geohashPrecision;
    var hash = geohash(lat, lon, hashPrecision);
    if (hash) {
      var metres = geohashPrecisionMetres(hashPrecision);
      rows.push({
        id: 'geohash',
        label: 'Geohash',
        value: hash,
        note: hashPrecision + ' characters — a cell about ' + describeSpan(metres.lon) + ' across',
      });
      if (hashPrecision > 6) {
        var shorter = geohashPrecisionMetres(6);
        rows.push({
          id: 'geohash-6',
          label: 'Geohash (6)',
          value: hash.slice(0, 6),
          note: 'Shorter prefix — a cell about ' + describeSpan(shorter.lon) + ' across',
        });
      }
    }

    var pairs = opts.maidenheadPairs == null ? 3 : opts.maidenheadPairs;
    var locator = maidenhead(lat, lon, pairs);
    if (locator) {
      var maidenCell = maidenheadCellDegrees(pairs);
      rows.push({
        id: 'maidenhead',
        label: 'Maidenhead',
        value: locator,
        note: pairs + ' pairs — about '
          + Math.round(maidenCell.lon * kmPerDegree(lat).lon) + ' × '
          + Math.round(maidenCell.lat * 110.574) + ' km at this latitude',
      });
      var wide = maidenhead(lat, lon, 2);
      if (wide && wide !== locator) {
        rows.push({ id: 'maidenhead-4', label: 'Maidenhead (4)', value: wide, note: 'Grid square — what a radio contact logs' });
      }
    }

    var projected = utm(lat, lon);
    if (projected) {
      rows.push({
        id: 'utm',
        label: 'UTM',
        value: utmString(lat, lon),
        note: 'Zone ' + projected.zone + projected.band + ', '
          + (projected.hemisphere === 'N' ? 'northern' : 'southern') + ' hemisphere · grid north '
          + (projected.convergenceDegrees >= 0 ? '+' : '')
          + projected.convergenceDegrees.toFixed(1) + '° from true north',
      });
    }

    if (MM.gridref && MM.gridref.coveredBy && MM.gridref.coveredBy(lat, lon)) {
      var grid = MM.gridref.fromWgs84(lat, lon, 5);
      if (grid && grid.gridRef) {
        rows.push({
          id: 'os-grid',
          label: 'OS National Grid',
          value: grid.gridRef,
          note: MM.gridref.accuracyNote || 'Great Britain only',
        });
      }
    }

    return rows;
  }

  /** The same rows as one block of text — for a clipboard, an email or a note. */
  function describe(lat, lon, options) {
    var rows = formats(lat, lon, options);
    if (!rows.length) return '';
    return rows.map(function (row) { return row.label + ': ' + row.value; }).join('\n');
  }

  MM.locators = {
    GEOHASH_ALPHABET: GEOHASH_ALPHABET,
    geohash: geohash,
    decodeGeohash: decodeGeohash,
    isGeohash: isGeohash,
    geohashNeighbours: geohashNeighbours,
    geohashPrecisionMetres: geohashPrecisionMetres,

    maidenhead: maidenhead,
    decodeMaidenhead: decodeMaidenhead,
    isMaidenhead: isMaidenhead,
    normaliseMaidenhead: normaliseMaidenhead,
    maidenheadCellDegrees: maidenheadCellDegrees,

    utm: utm,
    utmString: utmString,
    fromUtm: fromUtm,
    parseUtm: parseUtm,
    isUtm: isUtm,
    utmZone: utmZone,
    bandLetter: bandLetter,
    zoneCentralMeridian: zoneCentralMeridian,

    interpret: interpret,
    parse: interpret,
    formats: formats,
    describe: describe,

    accuracyNote: 'UTM: WGS84 transverse Mercator, sub-metre inside the zone it belongs to',
  };

  if (typeof module === 'object' && module.exports) module.exports = MM.locators;
})(typeof globalThis !== 'undefined' ? globalThis : this);
