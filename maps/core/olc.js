/**
 * maps/core/olc.js — Open Location Code ("Plus Codes"), implemented locally.
 *
 * Why a map needs this: it turns any point on Earth into a short, spoken
 * address ("8FVC9G8F+6W") using nothing but arithmetic. No server, no
 * database, no API key, no account — which is exactly the shape MostUsefulMaps
 * needs, because it must keep working with no network at all.
 *
 * Implemented from the published Open Location Code specification
 * (google/open-location-code, Apache-2.0; the algorithms are explicitly
 * published for unrestricted use). Behaviour deliberately matches the
 * reference implementation, because interoperating with codes people paste
 * from elsewhere matters more than any personal preference:
 *
 *   - full codes put '+' after eight digits, and 0 is padding *before* it
 *   - codes shorter than 8 digits before the '+' are padded with 0 to 8
 *   - trailing grid characters refine past 10 digits (4 columns x 5 rows)
 *   - recovering/shortening uses the reference implementation's 0.3 safety
 *     factor, so we produce the same short codes other tools produce
 *
 * Verified in scripts/tests/maps-core.test.js against the specification's own
 * worked example and its short-code table.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});

  var SEPARATOR = '+';
  var SEPARATOR_POSITION = 8;
  var PADDING = '0';
  var ALPHABET = '23456789CFGHJMPQRVWX';
  var BASE = 20;
  var LATITUDE_MAX = 90;
  var LONGITUDE_MAX = 180;
  var MIN_DIGITS = 2;
  var MAX_DIGITS = 15;
  var PAIR_DIGITS = 10;                 // digits before grid refinement
  var GRID_ROWS = 5;
  var GRID_COLUMNS = 4;
  var PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125];
  var PAIR_PRECISION = Math.pow(BASE, 3);
  var GRID_CODE_DIGITS = MAX_DIGITS - PAIR_DIGITS;
  var FINAL_LAT_PRECISION = PAIR_PRECISION * Math.pow(GRID_ROWS, GRID_CODE_DIGITS);
  var FINAL_LNG_PRECISION = PAIR_PRECISION * Math.pow(GRID_COLUMNS, GRID_CODE_DIGITS);
  var MIN_TRIMMABLE_DIGITS = 6;
  var SHORTEN_SAFETY = 0.3;

  function clipLat(lat) { return Math.min(LATITUDE_MAX, Math.max(-LATITUDE_MAX, lat)); }

  function normalizeLon(lon) {
    var l = lon;
    while (l < -LONGITUDE_MAX) l += 2 * LONGITUDE_MAX;
    while (l >= LONGITUDE_MAX) l -= 2 * LONGITUDE_MAX;
    return l;
  }

  function clean(code) { return String(code).replace(/\s+/g, '').toUpperCase(); }

  // -------------------------------------------------------------- validation

  function isValid(code) {
    if (typeof code !== 'string' || !code.length) return false;
    code = clean(code);
    var sep = code.indexOf(SEPARATOR);
    if (sep === -1 || sep !== code.lastIndexOf(SEPARATOR)) return false;
    if (code.length === 1) return false;
    if (sep > SEPARATOR_POSITION || sep % 2 === 1) return false;
    if (code.indexOf(PADDING) > -1) {
      if (sep < SEPARATOR_POSITION) return false;          // short codes cannot be padded
      if (code.indexOf(PADDING) === 0) return false;       // leading zeros are not padding
      var runs = code.match(/0+/g) || [];
      if (runs.length > 1 || runs[0].length % 2 === 1 || runs[0].length > SEPARATOR_POSITION - 2) {
        return false;
      }
      if (code.charAt(code.length - 1) !== SEPARATOR) return false; // padded codes end at the '+'
    }
    if (code.length - sep - 1 === 1) return false;         // one character after '+' is not a code
    var stripped = code.replace(/\+/g, '').replace(/0+/g, '');
    for (var i = 0; i < stripped.length; i += 1) {
      if (ALPHABET.indexOf(stripped.charAt(i)) === -1) return false;
    }
    return true;
  }

  /** A short code is one with digits missing from the front — it needs a place. */
  function isShort(code) {
    if (!isValid(code)) return false;
    var sep = clean(code).indexOf(SEPARATOR);
    return sep >= 0 && sep < SEPARATOR_POSITION;
  }

  /** A padded code (produced by encode() with a short length) is not "full". */
  function isPadded(code) {
    if (!isValid(code)) return false;
    return clean(code).indexOf(PADDING) > -1;
  }

  /** A full code decodes to a definite place with no reference point needed. */
  function isFull(code) {
    if (!isValid(code)) return false;
    var c = clean(code);
    if (isShort(c)) return false;
    var firstLat = ALPHABET.indexOf(c.charAt(0)) * BASE;
    if (firstLat >= LATITUDE_MAX * 2) return false;
    if (c.length > 1) {
      var firstLng = ALPHABET.indexOf(c.charAt(1)) * BASE;
      if (firstLng >= LONGITUDE_MAX * 2) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ encode

  /**
   * A decimal degree typed by a person means that decimal, not the binary
   * fraction nearest to it. 76.1 * 2.5e7 is 1902499999.99999976 in IEEE754,
   * and a plain Math.floor would drop the visitor into the neighbouring
   * 14-metre cell — the reference project's own test data expects the cell
   * for exactly 76.1. So snap to the integer when the product is within a
   * double's rounding noise of one (one unit here is 4e-8 degrees) and floor
   * everything else.
   */
  var SNAP = 1e-6;
  function scaledFloor(value, scale) {
    var product = value * scale;
    var nearest = Math.round(product);
    if (Math.abs(product - nearest) < SNAP) return nearest;
    return Math.floor(product);
  }

  function toIntegers(lat, lon) {
    var latVal = scaledFloor(lat, FINAL_LAT_PRECISION) + LATITUDE_MAX * FINAL_LAT_PRECISION;
    if (latVal < 0) latVal = 0;
    else if (latVal >= 2 * LATITUDE_MAX * FINAL_LAT_PRECISION) latVal = 2 * LATITUDE_MAX * FINAL_LAT_PRECISION - 1;
    var lngVal = scaledFloor(lon, FINAL_LNG_PRECISION) + LONGITUDE_MAX * FINAL_LNG_PRECISION;
    var lngWrap = 2 * LONGITUDE_MAX * FINAL_LNG_PRECISION;
    if (lngVal < 0) lngVal = (lngVal % lngWrap) + lngWrap;
    else if (lngVal >= lngWrap) lngVal = lngVal % lngWrap;
    return [latVal, lngVal];
  }

  /**
   * encode(lat, lon, digits) — default 10.
   * 2–10 digits gives a padded code like "8FVC9G00+" when shorter than 8.
   * 11–15 adds grid refinement characters, e.g. "8FVC9G8F+6WX".
   */
  function encode(lat, lon, digits) {
    var want = digits == null ? PAIR_DIGITS : Math.min(MAX_DIGITS, Number(digits));
    if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon)) {
      throw new Error('Open Location Code needs finite numbers');
    }
    if (!isFinite(want) || want < MIN_DIGITS || (want < PAIR_DIGITS && want % 2 === 1)) {
      throw new Error('Open Location Code length must be 2–15 digits, even below 10');
    }
    var iv = toIntegers(clipLat(lat), normalizeLon(lon));
    var latInt = iv[0], lngInt = iv[1];
    var chars = new Array(MAX_DIGITS + 1);
    chars[SEPARATOR_POSITION] = SEPARATOR;

    if (want > PAIR_DIGITS) {
      for (var g = GRID_CODE_DIGITS; g >= 1; g -= 1) {
        var row = latInt % GRID_ROWS;
        var col = lngInt % GRID_COLUMNS;
        chars[SEPARATOR_POSITION + 2 + g] = ALPHABET.charAt(row * GRID_COLUMNS + col);
        latInt = Math.floor(latInt / GRID_ROWS);
        lngInt = Math.floor(lngInt / GRID_COLUMNS);
      }
    } else {
      latInt = Math.floor(latInt / Math.pow(GRID_ROWS, GRID_CODE_DIGITS));
      lngInt = Math.floor(lngInt / Math.pow(GRID_COLUMNS, GRID_CODE_DIGITS));
    }

    chars[SEPARATOR_POSITION + 1] = ALPHABET.charAt(latInt % BASE);
    chars[SEPARATOR_POSITION + 2] = ALPHABET.charAt(lngInt % BASE);
    latInt = Math.floor(latInt / BASE);
    lngInt = Math.floor(lngInt / BASE);

    for (var i = PAIR_DIGITS / 2 + 1; i >= 0; i -= 2) {
      chars[i] = ALPHABET.charAt(latInt % BASE);
      chars[i + 1] = ALPHABET.charAt(lngInt % BASE);
      latInt = Math.floor(latInt / BASE);
      lngInt = Math.floor(lngInt / BASE);
    }

    if (want >= SEPARATOR_POSITION) {
      return chars.slice(0, want + 1).join('');
    }
    return chars.slice(0, want).join('') + new Array(SEPARATOR_POSITION - want + 1).join(PADDING) + SEPARATOR;
  }

  // ------------------------------------------------------------------ decode

  /**
   * decode("8FVC9G8F+6W") → { lat, lon, latLo, lonLo, latHi, lonHi, digits }
   * lat/lon is the centre of the area; the corners are that area. Padded
   * zeros are ignored, so a padded code decodes to the larger area its
   * written digits describe. Invalid input returns { error: '…' }.
   */
  function decode(code) {
    if (!isFull(code)) return { error: 'not-a-valid-full-code' };
    var body = clean(code).replace('+', '').replace(/0/g, '');
    var normalLat = -LATITUDE_MAX * PAIR_PRECISION;
    var normalLng = -LONGITUDE_MAX * PAIR_PRECISION;
    var gridLat = 0, gridLng = 0;
    var digits = Math.min(body.length, PAIR_DIGITS);
    var pv = Math.pow(BASE, PAIR_DIGITS / 2 - 1);
    for (var i = 0; i < digits; i += 2) {
      normalLat += ALPHABET.indexOf(body.charAt(i)) * pv;
      normalLng += ALPHABET.indexOf(body.charAt(i + 1)) * pv;
      if (i < digits - 2) pv /= BASE;
    }
    var latPrecision = pv / PAIR_PRECISION;
    var lonPrecision = pv / PAIR_PRECISION;
    if (body.length > PAIR_DIGITS) {
      var rowPv = Math.pow(GRID_ROWS, GRID_CODE_DIGITS - 1);
      var colPv = Math.pow(GRID_COLUMNS, GRID_CODE_DIGITS - 1);
      var gridDigits = Math.min(body.length, MAX_DIGITS);
      for (var g = PAIR_DIGITS; g < gridDigits; g += 1) {
        var digitVal = ALPHABET.indexOf(body.charAt(g));
        gridLat += Math.floor(digitVal / GRID_COLUMNS) * rowPv;
        gridLng += (digitVal % GRID_COLUMNS) * colPv;
        if (g < gridDigits - 1) {
          rowPv /= GRID_ROWS;
          colPv /= GRID_COLUMNS;
        }
      }
      latPrecision = rowPv / FINAL_LAT_PRECISION;
      lonPrecision = colPv / FINAL_LNG_PRECISION;
    }
    var lat = normalLat / PAIR_PRECISION + gridLat / FINAL_LAT_PRECISION;
    var lon = normalLng / PAIR_PRECISION + gridLng / FINAL_LNG_PRECISION;
    var latHi = lat + latPrecision;
    var lonHi = lon + lonPrecision;
    return {
      lat: Math.min(lat + (latHi - lat) / 2, LATITUDE_MAX),
      lon: Math.min(lon + (lonHi - lon) / 2, LONGITUDE_MAX),
      latLo: lat, lonLo: lon, latHi: latHi, lonHi: lonHi,
      latSpan: latPrecision, lonSpan: lonPrecision,
      digits: Math.min(body.length, MAX_DIGITS),
      code: clean(code),
    };
  }

  /** Decode anything a person might paste: full, short (with a reference) or padded. */
  function decodeAny(code, reference) {
    var c = clean(code);
    if (!isValid(c)) return { error: 'invalid-code' };
    if (isShort(c)) {
      var ref = MM.geodesy ? MM.geodesy.point(reference) : null;
      if (!ref) return { error: 'short-code-needs-a-reference-place' };
      var full = expand(c, ref.lat, ref.lon);
      if (!full || typeof full !== 'string') return { error: 'recovery-failed' };
      var area = decode(full);
      area.short = c;
      area.recovered = full;
      return area;
    }
    return decode(c);
  }

  // ------------------------------------------------------- shorten / recover

  /**
   * Remove as many leading digits as is safe for this reference location,
   * using the reference implementation's rules (0.3 safety factor).
   * Returns the original full code when it cannot be shortened.
   */
  function shrink(code, lat, lon) {
    if (!isFull(code)) return null;
    var c = clean(code);
    if (isPadded(c)) return null;                 // padded codes must not be shortened
    var area = decode(c);
    if (area.digits < MIN_TRIMMABLE_DIGITS) return null;
    var refLat = clipLat(Number(lat)), refLon = normalizeLon(Number(lon));
    if (!isFinite(refLat) || !isFinite(refLon)) return null;
    var range = Math.max(Math.abs(area.lat - refLat), Math.abs(area.lon - refLon));
    for (var i = PAIR_RESOLUTIONS.length - 2; i >= 1; i -= 1) {
      if (range < PAIR_RESOLUTIONS[i] * SHORTEN_SAFETY) return c.substring((i + 1) * 2);
    }
    return c;
  }

  /**
   * Rebuild a full code from a short one plus a nearby reference point.
   * This is the step that makes "8F+6W" usable in a conversation.
   */
  function expand(shortCode, lat, lon) {
    var c = clean(shortCode);
    if (isFull(c)) return c;
    if (!isShort(c)) return null;
    var refLat = clipLat(Number(lat)), refLon = normalizeLon(Number(lon));
    if (!isFinite(refLat) || !isFinite(refLon)) return null;
    var paddingLength = SEPARATOR_POSITION - c.indexOf(SEPARATOR);
    var resolution = Math.pow(20, 2 - paddingLength / 2);
    var half = resolution / 2;
    var area = decode(encode(refLat, refLon).substr(0, paddingLength) + c);
    if (area.error) return null;
    var latCentre = area.lat, lonCentre = area.lon;
    if (refLat + half < latCentre && latCentre - resolution >= -LATITUDE_MAX) latCentre -= resolution;
    else if (refLat - half > latCentre && latCentre + resolution <= LATITUDE_MAX) latCentre += resolution;
    if (refLon + half < lonCentre) lonCentre -= resolution;
    else if (refLon - half > lonCentre) lonCentre += resolution;
    return encode(latCentre, lonCentre, area.digits);
  }

  /** Convenience: the code to quote for a point, optionally grid-refined. */
  function forPoint(lat, lon, gridChars) {
    return encode(lat, lon, gridChars ? PAIR_DIGITS + Math.min(GRID_CODE_DIGITS, gridChars) : PAIR_DIGITS);
  }

  /** Pretty-print: "8FVC9G8F+6W" → "8FVC 9G8F+6W" style grouping is left to the UI. */
  function format(code) {
    return typeof code === 'string' ? clean(code) : '';
  }

  /** How big is one digit's worth of code, in metres, at this latitude? */
  function precisionMetres(digits, lat) {
    var span = digits <= PAIR_DIGITS
      ? PAIR_RESOLUTIONS[Math.max(0, Math.floor(digits / 2) - 1)]
      : PAIR_RESOLUTIONS[4] / Math.pow(GRID_ROWS, digits - PAIR_DIGITS);
    var latM = span * 110574;
    var lonM = span * 111320 * Math.cos((lat || 0) * Math.PI / 180);
    return { latM: latM, lonM: Math.abs(lonM) };
  }

  MM.olc = {
    ALPHABET: ALPHABET,
    SEPARATOR_POSITION: SEPARATOR_POSITION,
    PAIR_RESOLUTIONS: PAIR_RESOLUTIONS,
    encode: encode,
    decode: decode,
    decodeAny: decodeAny,
    isValid: isValid,
    isShort: isShort,
    isFull: isFull,
    isPadded: isPadded,
    shrink: shrink,
    shorten: shrink,
    expand: expand,
    recoverNearest: expand,
    forPoint: forPoint,
    format: format,
    precisionMetres: precisionMetres,
  };

  if (typeof module === 'object' && module.exports) module.exports = MM.olc;
})(typeof globalThis !== 'undefined' ? globalThis : this);
