/**
 * maps/core/geo.js — geometry helpers for a map that has to work offline.
 *
 * Part of the MostUsefulMaps engine. Everything here runs on plain objects
 * (GeoJSON-shaped), needs no dependencies and no network. It exists so the
 * offline map can answer "what country am I in?", "what is under my cursor?"
 * and "draw a 10° graticule" from the vendored Natural Earth boundaries.
 *
 * TopoJSON decoding is delegated to topojson-client, which the page loads
 * from maps/vendor/ and injects as MM.topojson — this file never fetches.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});

  function point(p) {
    return MM.geodesy ? MM.geodesy.point(p) : null;
  }

  function ringBbox(ring) {
    var w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (var i = 0; i < ring.length; i += 1) {
      var x = ring[i][0], y = ring[i][1];
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
    return { west: w, south: s, east: e, north: n };
  }

  function bboxContainsBbox(outer, inner) {
    return inner.west >= outer.west && inner.east <= outer.east &&
      inner.south >= outer.south && inner.north <= outer.north;
  }

  /**
   * Ray casting. The ring is [[lon, lat], …] and must not cross the
   * antimeridian (Natural Earth country rings do not, except Russia's far
   * east, which Pacific-facing tests tolerate: a lookup near the Bering
   * Strait may answer with the neighbouring country rather than nothing —
   * documented in docs/MAPS.md rather than pretended away).
   */
  function pointInRing(ring, pt) {
    var x = pt.lon, y = pt.lat;
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      var xi = ring[i][0], yi = ring[i][1];
      var xj = ring[j][0], yj = ring[j][1];
      var intersects = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  /** Polygon with holes — [outerRing, hole1, …]. */
  function pointInPolygon(coordinates, pt) {
    if (!coordinates || !coordinates.length) return false;
    if (!pointInRing(coordinates[0], pt)) return false;
    for (var h = 1; h < coordinates.length; h += 1) {
      if (pointInRing(coordinates[h], pt)) return false;
    }
    return true;
  }

  function contains(geometry, pt) {
    if (!geometry || !pt) return false;
    if (geometry.type === 'Polygon') return pointInPolygon(geometry.coordinates, pt);
    if (geometry.type === 'MultiPolygon') {
      for (var i = 0; i < geometry.coordinates.length; i += 1) {
        if (pointInPolygon(geometry.coordinates[i], pt)) return true;
      }
      return false;
    }
    return false;
  }

  function geometryBbox(geometry) {
    var list = [];
    if (!geometry) return null;
    if (geometry.type === 'Polygon') list = geometry.coordinates;
    else if (geometry.type === 'MultiPolygon') {
      for (var i = 0; i < geometry.coordinates.length; i += 1) {
        for (var j = 0; j < geometry.coordinates[i].length; j += 1) list.push(geometry.coordinates[i][j]);
      }
    } else if (geometry.type === 'LineString') list = [geometry.coordinates];
    else if (geometry.type === 'Point') return { west: geometry.coordinates[0], east: geometry.coordinates[0], south: geometry.coordinates[1], north: geometry.coordinates[1] };
    if (!list.length) return null;
    var boxes = list.map(ringBbox);
    return boxes.reduce(function (acc, b) {
      return {
        west: Math.min(acc.west, b.west), south: Math.min(acc.south, b.south),
        east: Math.max(acc.east, b.east), north: Math.max(acc.north, b.north),
      };
    });
  }

  /**
   * Which country is this point in? `features` is a GeoJSON FeatureCollection
   * (from the vendored topojson) whose features carry a `bbox` — compute it
   * once with prepare() so lookups stay fast.
   */
  function prepare(featureCollection) {
    var features = (featureCollection && featureCollection.features) || [];
    var prepared = features.map(function (f) {
      return { feature: f, bbox: f.bbox || geometryBbox(f.geometry) };
    });
    return { type: 'PreparedFeatures', items: prepared, source: featureCollection };
  }

  function countryForPoint(prepared, input) {
    var pt = point(input);
    if (!pt || !prepared || !prepared.items) return null;
    for (var i = 0; i < prepared.items.length; i += 1) {
      var item = prepared.items[i];
      if (item.bbox && (pt.lon < item.bbox.west || pt.lon > item.bbox.east ||
        pt.lat < item.bbox.south || pt.lat > item.bbox.north)) continue;
      if (contains(item.feature.geometry, pt)) return item.feature;
    }
    return null;
  }

  /** Decode a TopoJSON topology into GeoJSON using the injected topojson-client. */
  function fromTopology(topology, objectName) {
    var client = MM.topojson;
    if (!client) throw new Error('geo.fromTopology needs MM.topojson (maps/vendor/topojson-client.min.js)');
    var name = objectName || 'countries';
    var object = topology.objects[name];
    if (!object) throw new Error('no such topology object: ' + name);
    return client.feature(topology, object);
  }

  /** Graticule lines every `step` degrees — the offline map's only decoration. */
  function graticule(step, latLimit) {
    var lines = [];
    var limit = latLimit == null ? 80 : latLimit;
    var s = step || 10;
    for (var lon = -180; lon <= 180; lon += s) {
      var meridian = [];
      for (var lat = -limit; lat <= limit; lat += s / 2) meridian.push([lon, lat]);
      lines.push({ type: 'Feature', properties: { kind: 'meridian', value: lon }, geometry: { type: 'LineString', coordinates: meridian } });
    }
    for (var parallel = -limit; parallel <= limit; parallel += s) {
      var ring = [];
      for (var x = -180; x <= 180; x += s / 2) ring.push([x, parallel]);
      lines.push({ type: 'Feature', properties: { kind: 'parallel', value: parallel }, geometry: { type: 'LineString', coordinates: ring } });
    }
    return { type: 'FeatureCollection', features: lines };
  }

  /** Ramer–Douglas–Peucker on lon/lat degrees (for drawing, never for length). */
  function simplify(points, toleranceDeg) {
    if (!Array.isArray(points) || points.length < 3) return (points || []).slice();
    var tol = toleranceDeg || 0.01;
    function distanceSq(p, a, b) {
      var x = p[0], y = p[1];
      var dx = b[0] - a[0], dy = b[1] - a[1];
      if (dx === 0 && dy === 0) return (x - a[0]) * (x - a[0]) + (y - a[1]) * (y - a[1]);
      var t = ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy);
      t = Math.max(0, Math.min(1, t));
      var px = a[0] + t * dx, py = a[1] + t * dy;
      return (x - px) * (x - px) + (y - py) * (y - py);
    }
    function rdp(pts) {
      if (pts.length < 3) return pts;
      var first = pts[0], last = pts[pts.length - 1];
      var maxDist = 0, index = 0;
      for (var i = 1; i < pts.length - 1; i += 1) {
        var d = distanceSq(pts[i], first, last);
        if (d > maxDist) { maxDist = d; index = i; }
      }
      if (maxDist > tol * tol) {
        var left = rdp(pts.slice(0, index + 1));
        var right = rdp(pts.slice(index));
        return left.slice(0, -1).concat(right);
      }
      return [first, last];
    }
    return rdp(points);
  }

  /** Great-circle densification so drawn geodesics curve like the real thing. */
  function densify(points, maxSegmentKm) {
    var geodesy = MM.geodesy;
    if (!geodesy || !Array.isArray(points) || points.length < 2) return (points || []).slice();
    var maxKm = maxSegmentKm || 50;
    var out = [points[0]];
    for (var i = 1; i < points.length; i += 1) {
      var a = points[i - 1], b = points[i];
      var km = geodesy.distanceKm(a, b);
      var steps = Math.min(128, Math.max(1, Math.ceil(km / maxKm)));
      for (var s = 1; s <= steps; s += 1) {
        if (s === steps) out.push(b);
        else {
          var q = geodesy.interpolate(a, b, s / steps);
          out.push(Array.isArray(b) ? [q.lon, q.lat] : { lon: q.lon, lat: q.lat });
        }
      }
    }
    return out;
  }

  /**
   * How many kilometres does one pixel cover at this zoom and latitude?
   * Drives the scale bar; uses the Web Mercator ground resolution formula.
   */
  function metresPerPixel(lat, zoom) {
    return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
  }

  /** A human scale-bar length: the largest "nice" distance under 120 px. */
  function scaleBar(lat, zoom, maxPx, units) {
    var mpp = metresPerPixel(lat, zoom);
    var candidatesKm = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    var chosen = candidatesKm[0];
    for (var i = 0; i < candidatesKm.length; i += 1) {
      var px = candidatesKm[i] * 1000 / mpp;
      if (px <= maxPx) chosen = candidatesKm[i];
    }
    var px = chosen * 1000 / mpp;
    var label;
    if (units === 'imperial') {
      var miles = chosen * 0.621371;
      label = miles < 0.1 ? Math.round(miles * 5280) + ' ft' : (miles < 10 ? miles.toFixed(miles < 1 ? 2 : 1) : Math.round(miles)) + ' mi';
    } else if (chosen < 1) {
      label = Math.round(chosen * 1000) + ' m';
    } else {
      label = (chosen < 10 ? String(chosen) : chosen.toLocaleString('en-GB')) + ' km';
    }
    return { km: chosen, px: Math.round(px), label: label, metresPerPixel: mpp };
  }

  MM.geo = {
    pointInRing: pointInRing,
    pointInPolygon: pointInPolygon,
    contains: contains,
    geometryBbox: geometryBbox,
    bboxContainsBbox: bboxContainsBbox,
    prepare: prepare,
    countryForPoint: countryForPoint,
    fromTopology: fromTopology,
    graticule: graticule,
    simplify: simplify,
    densify: densify,
    metresPerPixel: metresPerPixel,
    scaleBar: scaleBar,
  };

  if (typeof module === 'object' && module.exports) module.exports = MM.geo;
})(typeof globalThis !== 'undefined' ? globalThis : this);
