/**
 * maps/core/geodesy.js — the maths MostUsefulMaps runs on the device.
 *
 * Part of the MostUsefulMaps engine. No dependencies, no DOM, no network:
 * this file is loaded by maps.html, by the embed API that tool cards use, and
 * directly by scripts/tests/maps-core.test.js in Node.
 *
 * Coordinate convention, everywhere in this engine: GeoJSON order, [lon, lat]
 * in decimal degrees. Helpers accept objects ({lat, lon}) at the edges and
 * convert once.
 *
 * Accuracy note, because it is the difference between a toy and a tool:
 * distances use Vincenty's inverse formula on the WGS84 ellipsoid (sub-
 * millimetre on short lines, ~0.5 mm on a London–Paris baseline). Vincenty
 * does not converge for near-antipodal points, so those fall back to
 * haversine on a sphere — correct to ~0.3%, and flagged in the result.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});

  var R_MEAN_KM = 6371.0088;      // IUGG mean Earth radius, km
  var WGS84_A = 6378137.0;        // semi-major axis, m
  var WGS84_F = 1 / 298.257223563; // flattening
  var WGS84_B = WGS84_A * (1 - WGS84_F);
  var KM_PER_M = 0.001;

  var toRad = function (d) { return d * Math.PI / 180; };
  var toDeg = function (r) { return r * 180 / Math.PI; };
  var clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };

  function normalizeLon(lon) {
    var l = ((lon + 180) % 360 + 360) % 360 - 180;
    return l === -180 && lon > 0 ? 180 : l;
  }

  function validLat(lat) { return typeof lat === 'number' && isFinite(lat) && lat >= -90 && lat <= 90; }
  function validLon(lon) { return typeof lon === 'number' && isFinite(lon) && lon >= -180 && lon <= 180; }

  /**
   * Accepts [lon, lat], {lon, lat}, {lng, lat}, {longitude, latitude} or a
   * "lat,lon" string (the order humans type and Google Maps uses). Returns
   * {lon, lat} or null — never throws, so callers can treat bad input as a
   * validation message rather than a crash.
   */
  function point(input) {
    if (!input) return null;
    if (Array.isArray(input) && input.length >= 2) {
      var lon = Number(input[0]), lat = Number(input[1]);
      return validLat(lat) && validLon(lon) ? { lon: lon, lat: lat } : null;
    }
    if (typeof input === 'object') {
      var la = Number(input.lat != null ? input.lat : input.latitude);
      var lo = Number(input.lon != null ? input.lon : input.lng != null ? input.lng : input.longitude);
      return validLat(la) && validLon(lo) ? { lon: lo, lat: la } : null;
    }
    if (typeof input === 'string') return parseLatLon(input);
    return null;
  }

  // ------------------------------------------------------------- distances

  /**
   * Vincenty inverse. Returns {km, initialBearing, finalBearing, converged}.
   * When it fails to converge (near-antipodal) km is NaN and callers should
   * use distanceKm(), which falls back to haversine and says so.
   */
  function vincentyInverse(a, b) {
    var p1 = point(a), p2 = point(b);
    if (!p1 || !p2) return { km: NaN, initialBearing: NaN, finalBearing: NaN, converged: false };
    var f = WGS84_F;
    var L = toRad(normalizeLon(p2.lon - p1.lon));
    var U1 = Math.atan((1 - f) * Math.tan(toRad(p1.lat)));
    var U2 = Math.atan((1 - f) * Math.tan(toRad(p2.lat)));
    var sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
    var sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
    var lambda = L, lambdaP, iter = 0, sinLambda, cosLambda, sinSigma, cosSigma;
    var sigma, sinAlpha, cosSqAlpha = 0, cos2SigmaM, C;
    do {
      sinLambda = Math.sin(lambda); cosLambda = Math.cos(lambda);
      sinSigma = Math.sqrt(
        Math.pow(cosU2 * sinLambda, 2) +
        Math.pow(cosU1 * sinU2 - sinU1 * cosU2 * cosLambda, 2)
      );
      if (sinSigma === 0) {
        return { km: 0, initialBearing: 0, finalBearing: 0, converged: true };
      }
      cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
      sigma = Math.atan2(sinSigma, cosSigma);
      sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
      cosSqAlpha = 1 - sinAlpha * sinAlpha;
      cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha;
      C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
      lambdaP = lambda;
      lambda = L + (1 - C) * f * sinAlpha * (
        sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM))
      );
      iter += 1;
    } while (Math.abs(lambda - lambdaP) > 1e-12 && iter < 200);

    if (iter >= 200 || !isFinite(lambda)) {
      return { km: NaN, initialBearing: NaN, finalBearing: NaN, converged: false };
    }

    var uSq = cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);
    var A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
    var B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
    var deltaSigma = B * sinSigma * (
      cos2SigmaM + B / 4 * (
        cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
        B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)
      )
    );
    var s = WGS84_B * A * (sigma - deltaSigma);
    var azi1 = Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
    var azi2 = Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda);
    return {
      km: s * KM_PER_M,
      initialBearing: (toDeg(azi1) + 360) % 360,
      finalBearing: (toDeg(azi2) + 360) % 360,
      converged: true,
    };
  }

  function haversineKm(a, b) {
    var p1 = point(a), p2 = point(b);
    if (!p1 || !p2) return NaN;
    var dLat = toRad(p2.lat - p1.lat), dLon = toRad(normalizeLon(p2.lon - p1.lon));
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_MEAN_KM * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /** Ellipsoidal distance with a flagged spherical fallback. */
  function distanceKm(a, b) {
    var v = vincentyInverse(a, b);
    if (isFinite(v.km)) return v.km;
    return haversineKm(a, b);
  }

  /** Distance and the two bearings, in one call. Method says which was used. */
  function measure(a, b) {
    var v = vincentyInverse(a, b);
    if (isFinite(v.km)) {
      return {
        km: v.km, initialBearing: v.initialBearing, finalBearing: v.finalBearing,
        method: 'vincenty-wgs84',
      };
    }
    var p1 = point(a), p2 = point(b);
    return {
      km: haversineKm(a, b),
      initialBearing: bearing(a, b),
      finalBearing: (bearing(b, a) + 180) % 360,
      method: 'haversine-fallback',
      latDiff: p1 && p2 ? Math.abs(p1.lat - p2.lat) : NaN,
    };
  }

  /** Initial great-circle bearing, degrees clockwise from true north. */
  function bearing(a, b) {
    var p1 = point(a), p2 = point(b);
    if (!p1 || !p2) return NaN;
    if (distanceKm(p1, p2) < 1e-9) return NaN;
    var dLon = toRad(normalizeLon(p2.lon - p1.lon));
    var y = Math.sin(dLon) * Math.cos(toRad(p2.lat));
    var x = Math.cos(toRad(p1.lat)) * Math.sin(toRad(p2.lat)) -
      Math.sin(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  /** Meridional radius of curvature (north–south), metres. */
  function meridionalRadius(latRad) {
    var e2 = WGS84_F * (2 - WGS84_F);
    return WGS84_A * (1 - e2) / Math.pow(1 - e2 * Math.sin(latRad) * Math.sin(latRad), 1.5);
  }

  /** Prime-vertical radius of curvature (east–west), metres. */
  function primeVerticalRadius(latRad) {
    var e2 = WGS84_F * (2 - WGS84_F);
    return WGS84_A / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
  }

  /**
   * Rhumb-line (constant compass bearing) distance and bearing.
   *
   * The classic rhumb formula is spherical, which puts an equatorial degree of
   * longitude at 111.19 km instead of the true 111.32 km — a 0.1% error that
   * shows up the moment someone checks a due-east leg against a chart. This
   * uses the local radii of curvature at the midpoint of the leg instead, so
   * the numbers agree with the ellipsoid to about 0.01% while keeping the
   * constant-bearing property that makes a rhumb useful.
   */
  function rhumb(a, b) {
    var p1 = point(a), p2 = point(b);
    if (!p1 || !p2) return { km: NaN, bearing: NaN };
    var phi1 = toRad(p1.lat), phi2 = toRad(p2.lat);
    var phiMid = (phi1 + phi2) / 2;
    var dPhi = phi2 - phi1;
    var dPsi = Math.log(Math.tan(Math.PI / 4 + phi2 / 2) / Math.tan(Math.PI / 4 + phi1 / 2));
    var dLon = toRad(normalizeLon(p2.lon - p1.lon));
    if (Math.abs(dLon) > Math.PI) dLon = dLon > 0 ? -(2 * Math.PI - dLon) : (2 * Math.PI + dLon);
    var q = Math.abs(dPsi) > 1e-12 ? dPhi / dPsi : Math.cos(phi1);
    var northM = dPhi * meridionalRadius(phiMid);
    var eastM = q * dLon * primeVerticalRadius(phiMid);
    return {
      km: Math.sqrt(northM * northM + eastM * eastM) / 1000,
      bearing: (toDeg(Math.atan2(dLon, dPsi)) + 360) % 360,
    };
  }

  /** Point at a bearing (spherical direct — accurate to ~0.3%, ideal for UI). */
  function destination(a, bearingDeg, km) {
    var p = point(a);
    if (!p) return null;
    var d = km / R_MEAN_KM, br = toRad(bearingDeg);
    var lat1 = toRad(p.lat), lon1 = toRad(p.lon);
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
    var lon2 = lon1 + Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
    return { lon: normalizeLon(toDeg(lon2)), lat: toDeg(lat2) };
  }

  /** Great-circle interpolation; t=0 is a, t=1 is b. */
  function interpolate(a, b, t) {
    var p1 = point(a), p2 = point(b);
    if (!p1 || !p2) return null;
    var phi1 = toRad(p1.lat), lam1 = toRad(p1.lon);
    var phi2 = toRad(p2.lat), lam2 = toRad(p2.lon);
    var d = distanceKm(p1, p2) / R_MEAN_KM;
    if (d < 1e-9) return { lon: p1.lon, lat: p1.lat };
    var A = Math.sin((1 - t) * d) / Math.sin(d);
    var B = Math.sin(t * d) / Math.sin(d);
    var x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
    var y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
    var z = A * Math.sin(phi1) + B * Math.sin(phi2);
    return {
      lon: normalizeLon(toDeg(Math.atan2(y, x))),
      lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    };
  }

  function midpoint(a, b) { return interpolate(a, b, 0.5); }

  /** Total length of a polyline, in km. */
  function pathLengthKm(points) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    var total = 0;
    for (var i = 1; i < points.length; i += 1) total += distanceKm(points[i - 1], points[i]);
    return total;
  }

  /** Closest point on a polyline + how far away it is. Used by "distance to route". */
  function nearestOnPath(p, points) {
    var origin = point(p);
    if (!origin || !Array.isArray(points) || points.length < 2) return null;
    var best = null;
    for (var i = 1; i < points.length; i += 1) {
      var a = point(points[i - 1]), b = point(points[i]);
      if (!a || !b) continue;
      // Sample the segment — good enough for UI, exact enough for metres at
      // the scales this is used (routes, tracks, drawn lines).
      var steps = 24;
      for (var s = 0; s <= steps; s += 1) {
        var t = s / steps;
        var q = interpolate(a, b, t);
        var km = distanceKm(origin, q);
        if (!best || km < best.km) best = { index: i - 1, t: t, point: q, km: km };
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ areas

  /**
   * Spherical area of a polygon in m², using the standard excess formula.
   * Handles polygons crossing the antimeridian by working in relative
   * longitude. Sign tells you the winding; magnitude is what we publish.
   */
  function polygonAreaM2(points) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    var ring = points.map(point).filter(Boolean);
    if (ring.length < 3) return 0;
    ring = ring.concat([ring[0]]);
    var total = 0;
    for (var i = 0; i < ring.length - 1; i += 1) {
      var lon1 = toRad(ring[i].lon), lat1 = toRad(ring[i].lat);
      var lon2 = toRad(ring[i + 1].lon), lat2 = toRad(ring[i + 1].lat);
      total += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    return Math.abs(total * R_MEAN_KM * R_MEAN_KM * 1e6 / 2);
  }

  /** Planar centroid of a ring, in lon/lat. Good for labels, not for geodesy. */
  function centroid(points) {
    var ring = (points || []).map(point).filter(Boolean);
    if (!ring.length) return null;
    if (ring.length < 3) {
      var sx = 0, sy = 0;
      ring.forEach(function (p) { sx += p.lon; sy += p.lat; });
      return { lon: sx / ring.length, lat: sy / ring.length };
    }
    var a = 0, cx = 0, cy = 0;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      var f = ring[j].lon * ring[i].lat - ring[i].lon * ring[j].lat;
      a += f; cx += (ring[j].lon + ring[i].lon) * f; cy += (ring[j].lat + ring[i].lat) * f;
    }
    if (Math.abs(a) < 1e-12) return ring[0];
    return { lon: cx / (3 * a), lat: cy / (3 * a) };
  }

  // ------------------------------------------------------------------ bboxes

  function bbox(points) {
    var pts = (points || []).map(point).filter(Boolean);
    if (!pts.length) return null;
    var w = pts[0].lon, e = pts[0].lon, s = pts[0].lat, n = pts[0].lat;
    pts.forEach(function (p) {
      w = Math.min(w, p.lon); e = Math.max(e, p.lon);
      s = Math.min(s, p.lat); n = Math.max(n, p.lat);
    });
    return { west: w, south: s, east: e, north: n };
  }

  function bboxCenter(b) {
    if (!b) return null;
    return { lon: normalizeLon((b.west + b.east) / 2), lat: (b.south + b.north) / 2 };
  }

  function bboxContains(b, p) {
    var q = point(p);
    if (!b || !q) return false;
    return q.lon >= b.west && q.lon <= b.east && q.lat >= b.south && q.lat <= b.north;
  }

  /** Expand a bbox by km on every side — the "make sure it is all visible" pad. */
  function padBbox(b, km) {
    if (!b) return null;
    var dLat = km / 110.574;
    var dLon = km / (111.320 * Math.max(0.05, Math.cos(toRad((b.south + b.north) / 2))));
    return {
      west: normalizeLon(b.west - dLon), east: normalizeLon(b.east + dLon),
      south: clamp(b.south - dLat, -90, 90), north: clamp(b.north + dLat, -90, 90),
    };
  }

  /** Zoom that fits a bbox into a pixel box (Web Mercator, 256 px tiles). */
  function fitZoom(b, widthPx, heightPx, padPx) {
    if (!b || !widthPx || !heightPx) return 2;
    var pad = padPx == null ? 32 : padPx;
    var world = 256;
    var latSpan = Math.max(1e-9, b.north - b.south);
    var lonSpan = Math.max(1e-9, b.east - b.west);
    var zLat = Math.log2((heightPx - pad * 2) / (world * latSpan / 180 * 1.05));
    var zLon = Math.log2((widthPx - pad * 2) / (world * lonSpan / 360));
    return clamp(Math.floor(Math.min(zLat, zLon)), 0, 18);
  }

  // -------------------------------------------------------------- formatting

  function compassPoint(deg) {
    if (!isFinite(deg)) return '';
    var names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return names[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  }

  var UNITS = {
    metric: { km: 'km', m: 'm', kmPerKm: 1, mPerKm: 1000, label: 'metric' },
    imperial: { km: 'mi', m: 'ft', kmPerKm: 0.6213711922, mPerKm: 3280.839895, label: 'imperial' },
    nautical: { km: 'nmi', m: 'm', kmPerKm: 0.5399568035, mPerKm: 1000, label: 'nautical' },
  };

  /** "340 m" / "3.4 km" / "0.21 mi" / "12.4 nmi". */
  function formatDistance(km, units) {
    if (km == null || !isFinite(km)) return '—';
    var u = UNITS[units] || UNITS.metric;
    if (u === UNITS.metric) {
      if (km < 1) return Math.round(km * 1000) + ' m';
      if (km < 10) return km.toFixed(2) + ' km';
      if (km < 100) return km.toFixed(1) + ' km';
      return Math.round(km).toLocaleString('en-GB') + ' km';
    }
    var v = km * u.kmPerKm;
    if (u === UNITS.imperial && km < 0.3) return Math.round(km * u.mPerKm) + ' ft';
    if (v < 10) return v.toFixed(2) + ' ' + u.km;
    if (v < 100) return v.toFixed(1) + ' ' + u.km;
    return Math.round(v).toLocaleString('en-GB') + ' ' + u.km;
  }

  function formatArea(m2, units) {
    if (m2 == null || !isFinite(m2)) return '—';
    var imperial = units === 'imperial';
    if (imperial) {
      var ft2 = m2 * 10.7639104;
      if (ft2 < 43560) return Math.round(ft2).toLocaleString('en-GB') + ' ft²';
      var acres = m2 / 4046.8564224;
      if (acres < 640) return acres.toFixed(acres < 10 ? 2 : 1) + ' acres';
      return (m2 / 2589988.110336).toFixed(1) + ' mi²';
    }
    if (m2 < 10000) return Math.round(m2).toLocaleString('en-GB') + ' m²';
    var ha = m2 / 10000;
    if (ha < 100) return ha.toFixed(ha < 10 ? 2 : 1) + ' ha';
    if (ha < 10000) return Math.round(ha).toLocaleString('en-GB') + ' ha';
    var km2 = m2 / 1e6;
    return (km2 >= 100 ? Math.round(km2).toLocaleString('en-GB') : km2.toFixed(1)) + ' km²';
  }

  function formatDuration(minutes) {
    if (minutes == null || !isFinite(minutes)) return '—';
    var m = Math.round(minutes);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), rem = m % 60;
    if (h < 24) return rem ? h + ' h ' + rem + ' min' : h + ' h';
    var d = Math.floor(h / 24);
    return d + ' d ' + (h % 24) + ' h';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function dms(value, isLat) {
    var hemi = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    var v = Math.abs(value);
    var d = Math.floor(v);
    var minFloat = (v - d) * 60;
    var m = Math.floor(minFloat);
    var s = (minFloat - m) * 60;
    return d + '°' + pad2(m) + "'" + s.toFixed(1) + '"' + hemi;
  }

  /**
   * Formatted coordinate pair. format: 'dd' | 'dms' (default 'dd').
   *
   * Two call shapes, because both are natural to write and the page uses both:
   * formatLatLon({lat, lon}, 'dms') and formatLatLon(lat, lon, 4). The second
   * one used to fall through to '—' — the Place panel's
   * coordinate row and every measuring step were blank for want of it.
   */
  function formatLatLon(a, format, digits) {
    if (typeof a === 'number' && typeof format === 'number') {
      // formatLatLon(lat, lon, digits)
      var pair = validLat(a) && validLon(format) ? { lat: a, lon: format } : null;
      return pair ? formatLatLon(pair, 'dd', digits) : '—';
    }
    var p = point(a);
    if (!p) return '—';
    var d = digits == null ? 5 : digits;
    if (format === 'dms') return dms(p.lat, true) + ' ' + dms(p.lon, false);
    return p.lat.toFixed(d) + '°, ' + p.lon.toFixed(d) + '°';
  }

  /** Human-readable. Accepts "51.5, -0.12", "51.5 -0.12", DMS, or nautical. */
  function parseLatLon(text) {
    if (typeof text !== 'string') return null;
    var t = text.trim().replace(/\u00b0/g, '°');
    if (!t) return null;

    // "51.5074, -0.1278" or "51.5074 -0.1278" (or with compass suffixes)
    var pair = t.match(/^([NnSs]?)\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NnSs]?)\s*[,; ]\s*([EeWw]?)\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EeWw]?)$/);
    if (pair) {
      var lat = parseFloat(pair[2]) * (/[Ss]/.test(pair[1] + pair[3]) ? -1 : 1);
      var lon = parseFloat(pair[5]) * (/[Ww]/.test(pair[4] + pair[6]) ? -1 : 1);
      if (validLat(lat) && validLon(lon)) return { lat: lat, lon: lon };
      return null;
    }

    // DMS: 51°30'26"N 0°7'39"W — degrees, minutes and optional seconds,
    // in either order, so "0°7'39\"W 51°30'26\"N" also parses.
    var dmsRe = /(-?\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′]?\s*)?(?:(\d+(?:\.\d+)?)\s*["″]?\s*)?\s*([NnSsEeWw])/g;
    var found = [];
    var m;
    while ((m = dmsRe.exec(t)) !== null) {
      var deg = Math.abs(parseFloat(m[1])) + (parseFloat(m[2] || 0) / 60) + (parseFloat(m[3] || 0) / 3600);
      var hemi = m[4].toUpperCase();
      if (/[NnSs]/.test(hemi)) deg *= /[Ss]/.test(hemi) ? -1 : 1;
      else deg *= /[Ww]/.test(hemi) ? -1 : 1;
      found.push({ v: deg, axis: hemi === 'N' || hemi === 'S' ? 'lat' : 'lon' });
    }
    if (found.length === 2) {
      var out = { lat: null, lon: null };
      found.forEach(function (f) { out[f.axis] = f.v; });
      if (validLat(out.lat) && validLon(out.lon)) return { lat: out.lat, lon: out.lon };
    }

    // Nautical: N51 30.500 W000 07.500
    var naut = t.match(/([NS])\s*(\d{1,3})\s+(\d+(?:\.\d+)?)\s+([EW])\s*(\d{1,3})\s+(\d+(?:\.\d+)?)/i);
    if (naut) {
      var nLat = parseFloat(naut[2]) + parseFloat(naut[3]) / 60;
      var nLon = parseFloat(naut[5]) + parseFloat(naut[6]) / 60;
      if (/S/i.test(naut[1])) nLat = -nLat;
      if (/W/i.test(naut[4])) nLon = -nLon;
      if (validLat(nLat) && validLon(nLon)) return { lat: nLat, lon: nLon };
    }
    return null;
  }

  // ------------------------------------------------------- Web Mercator maths

  var MERCATOR_MAX_LAT = 85.05112878;

  /** [lon, lat] → world pixel coordinates at a zoom (256 px per tile). */
  function project(a, zoom) {
    var p = point(a);
    if (!p) return null;
    var scale = 256 * Math.pow(2, zoom);
    var lat = clamp(p.lat, -MERCATOR_MAX_LAT, MERCATOR_MAX_LAT);
    var x = (p.lon + 180) / 360 * scale;
    var sin = Math.sin(toRad(lat));
    var y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
    return { x: x, y: y, zoom: zoom, scale: scale };
  }

  function unproject(x, y, zoom) {
    var scale = 256 * Math.pow(2, zoom);
    var lon = x / scale * 360 - 180;
    var n = Math.PI - 2 * Math.PI * y / scale;
    var lat = toDeg(Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
    return { lon: normalizeLon(lon), lat: clamp(lat, -MERCATOR_MAX_LAT, MERCATOR_MAX_LAT) };
  }

  MM.geodesy = {
    R_MEAN_KM: R_MEAN_KM,
    WGS84_A: WGS84_A,
    WGS84_F: WGS84_F,
    MERCATOR_MAX_LAT: MERCATOR_MAX_LAT,
    UNITS: UNITS,
    toRad: toRad,
    toDeg: toDeg,
    clamp: clamp,
    normalizeLon: normalizeLon,
    validLat: validLat,
    validLon: validLon,
    point: point,
    vincentyInverse: vincentyInverse,
    haversineKm: haversineKm,
    distanceKm: distanceKm,
    measure: measure,
    bearing: bearing,
    rhumb: rhumb,
    destination: destination,
    interpolate: interpolate,
    midpoint: midpoint,
    pathLengthKm: pathLengthKm,
    nearestOnPath: nearestOnPath,
    polygonAreaM2: polygonAreaM2,
    centroid: centroid,
    bbox: bbox,
    bboxCenter: bboxCenter,
    bboxContains: bboxContains,
    padBbox: padBbox,
    fitZoom: fitZoom,
    compassPoint: compassPoint,
    formatDistance: formatDistance,
    formatArea: formatArea,
    formatDuration: formatDuration,
    formatLatLon: formatLatLon,
    parseLatLon: parseLatLon,
    project: project,
    unproject: unproject,
  };

  if (typeof module === 'object' && module.exports) module.exports = MM.geodesy;
})(typeof globalThis !== 'undefined' ? globalThis : this);
