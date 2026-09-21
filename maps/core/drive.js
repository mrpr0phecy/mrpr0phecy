/**
 * maps/core/drive.js — the driving companion itself.
 *
 * Everything here runs on the device, from a route you already have. That is
 * the whole point: once the route and its speed limits are loaded, navigation
 * keeps working through tunnels, dead spots and border crossings — no tile
 * server, no routing server, no signal. What a live service adds (traffic,
 * weather) is additive and labelled; losing it never stops the guidance.
 *
 * It provides:
 *   - progress along the route, off-route detection and remaining distance,
 *   - the next manoeuvre, its distance and what to say about it,
 *   - the speed limit under the wheels, with the basis it came from,
 *   - an arrival time built from the route's own timings,
 *   - sun-glare windows worked out from the route's heading and the sun,
 *   - break reminders, a trip recorder and GPX export.
 *
 * It never invents a speed, a delay or a position. If it does not know, the
 * field is null and the interface says so.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});

  // In the browser these are plain <script> tags loaded in order. Under
  // CommonJS (the test suite, build tooling) pull the siblings in here so the
  // module is usable on its own.
  if (typeof module === 'object' && module.exports && typeof require === 'function') {
    try { require('./geodesy.js'); require('./speed.js'); } catch (error) { /* not a Node context */ }
  }

  function point(p) {
    if (!p) return null;
    if (Array.isArray(p) && p.length >= 2) return { lat: Number(p[1]), lon: Number(p[0]) };
    if (typeof p === 'object') {
      var lat = p.lat != null ? p.lat : p.latitude;
      var lon = p.lon != null ? p.lon : p.lng != null ? p.lng : p.longitude;
      if (lat != null && lon != null) return { lat: Number(lat), lon: Number(lon) };
    }
    return null;
  }

  function metresBetween(a, b) {
    return MM.geodesy.distanceKm(point(a), point(b)) * 1000;
  }

  /** Bearing from one route point to another, in degrees from true north. */
  function bearingAt(geometry, index, span) {
    var width = span || 3;
    var from = Math.max(0, index - width);
    var to = Math.min(geometry.length - 1, index + width);
    if (from === to) return null;
    return MM.geodesy.bearing(point(geometry[from]), point(geometry[to]));
  }

  /** Cumulative distance along a GeoJSON-order geometry, in km. */
  function cumulative(geometry) {
    var out = [0];
    var total = 0;
    for (var i = 1; i < geometry.length; i += 1) {
      total += MM.geodesy.distanceKm(point(geometry[i - 1]), point(geometry[i]));
      out.push(total);
    }
    return { km: out, total: total };
  }

  /**
   * Position on the route, fast enough to run every second.
   *
   * `state.hint` carries the segment index from the last fix, so the search is
   * a window around it; the first fix (or a big jump) falls back to a coarse
   * scan of the whole geometry.
   */
  function project(geometry, cum, position, hint) {
    var target = point(position);
    if (!target || geometry.length < 2) return null;
    var start = 0;
    var end = geometry.length - 2;
    if (hint != null && hint >= 0) {
      start = Math.max(0, hint - 60);
      end = Math.min(geometry.length - 2, hint + 60);
    }
    var best = null;
    for (var pass = 0; pass < (hint == null ? 1 : 2); pass += 1) {
      for (var i = start; i <= end; i += 1) {
        var a = point(geometry[i]);
        var b = point(geometry[i + 1]);
        var segmentKm = cum.km[i + 1] - cum.km[i];
        if (segmentKm <= 0) continue;
        // Local flat projection is plenty at segment scale, and it is ~100×
        // faster than geodesics inside a per-second loop.
        var latScale = 111.32 * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
        var ax = a.lon * latScale, ay = a.lat * 111.32;
        var bx = b.lon * latScale, by = b.lat * 111.32;
        var px = target.lon * latScale, py = target.lat * 111.32;
        var dx = bx - ax, dy = by - ay;
        var lengthSq = dx * dx + dy * dy;
        var t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        var qx = ax + t * dx, qy = ay + t * dy;
        var offsetKm = Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
        if (!best || offsetKm < best.offsetKm) {
          best = {
            index: i, t: t, offsetKm: offsetKm,
            progressKm: cum.km[i] + segmentKm * t,
            point: { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t },
            bearing: MM.geodesy.bearing(a, b),
          };
          if (offsetKm < 0.002) break; // 2 m: good enough, stop looking
        }
      }
      if (best && best.offsetKm < 0.05) break;
      // Nothing close in the window: widen to the whole route once.
      if (pass === 0) { start = 0; end = geometry.length - 2; }
    }
    return best;
  }

  /** Which stretch of the speed-limit list are we on? Binary search. */
  function limitAt(segments, progressKm) {
    if (!segments || !segments.length) return null;
    var low = 0;
    var high = segments.length - 1;
    while (low <= high) {
      var mid = (low + high) >> 1;
      var segment = segments[mid];
      if (progressKm < segment.fromKm) high = mid - 1;
      else if (progressKm >= segment.toKm) low = mid + 1;
      else return segment;
    }
    // Past the end, or in a gap: hold the last known limit but say it is stale.
    var last = segments[Math.min(low, segments.length - 1)];
    return last ? Object.assign({}, last, { stale: true }) : null;
  }

  function confidenceOf(limit) {
    if (!limit) return 'none';
    switch (limit.source) {
      case 'signed': return 'high';
      case 'national': case 'national-urban': return 'medium';
      case 'national-assumed-single': return 'low';
      default: return limit.source === 'unknown' ? 'none' : 'low';
    }
  }

  // ------------------------------------------------------------- the session

  /**
   * createSession(route, options)
   *
   * route: { geometry: [[lon, lat], …], distanceKm, durationMinutes,
   *          steps: [{ distanceKm, durationMin, instruction, verbal, modifier,
   *                    name, type, lat, lon }],
   *          speedLimits: [{ fromKm, toKm, kph, mph, source, basis }],
   *          alerts: [{ … }] }
   * options: { vehicle, units, tolerance, breakEveryMinutes, startedAt }
   */
  function createSession(route, options) {
    var opts = options || {};
    var geometry = (route && route.geometry) || [];
    if (geometry.length > 1) {
      // Route geometries arrive as [lon, lat]; the maths here is happier with
      // the object form, so normalise once.
      var normalised = new Array(geometry.length);
      for (var i = 0; i < geometry.length; i += 1) normalised[i] = [point(geometry[i]).lon, point(geometry[i]).lat];
      geometry = normalised;
    }
    var cum = cumulative(geometry);
    var steps = buildStepIndex(route && route.steps, cum.total, route && route.distanceKm);

    var session = {
      geometry: geometry,
      cum: cum,
      steps: steps,
      limits: normaliseLimits(route && route.speedLimits, cum.total),
      distanceKm: (route && route.distanceKm) || cum.total,
      durationMinutes: route && route.durationMinutes != null ? route.durationMinutes : null,
      vehicle: opts.vehicle || 'car',
      units: opts.units || 'metric',
      tolerance: opts.tolerance || 'normal',
      breakEveryMinutes: opts.breakEveryMinutes === 0 ? Infinity : (opts.breakEveryMinutes || 120),
      startedAt: opts.startedAt || new Date(),
      state: null,
      trip: {
        startedAt: opts.startedAt || new Date(),
        points: [],
        distanceKm: 0,
        movingSeconds: 0,
        stoppedSeconds: 0,
        maxSpeedKph: 0,
        lastAt: null,
        lastMoving: null,
        stops: [],
        offRouteCount: 0,
      },
      _hint: null,
      _spoken: {},
      _offRouteSince: null,
      _stoppedSince: null,
      _lastMovingAt: null,
    };

    /**
     * Take a fix. Returns the full navigation state.
     * fix: { lat, lon, speedKph?, heading?, accuracyMetres?, at? }
     */
    session.update = function (fix) {
      var now = fix.at ? new Date(fix.at) : new Date();
      var position = point(fix);
      if (!position) return session.state;
      var projection = project(session.geometry, session.cum, position, session._hint);
      if (!projection) return session.state;
      session._hint = projection.index;

      var progressKm = Math.min(session.distanceKm, Math.max(0, projection.progressKm));
      var remainingKm = Math.max(0, session.distanceKm - progressKm);
      var offsetMetres = projection.offsetKm * 1000;
      var speedKph = fix.speedKph != null ? fix.speedKph : null;
      var moving = speedKph != null ? speedKph > 2 : null;

      // Off-route: needing a real offset, not GPS noise. 45 m at speed, 90 m
      // when crawling (urban canyons and car parks are noisy).
      var offRouteThreshold = speedKph != null && speedKph > 8 ? 45 : 90;
      var offRoute = offsetMetres > offRouteThreshold;
      if (offRoute) {
        if (session._offRouteSince == null) session._offRouteSince = now.getTime();
      } else {
        session._offRouteSince = null;
      }
      var offRouteSeconds = session._offRouteSince == null ? 0 : (now.getTime() - session._offRouteSince) / 1000;

      var remainingMinutes = remainingTime(steps, progressKm, session.durationMinutes, session.distanceKm);
      var limit = limitAt(session.limits, progressKm);
      var speedKphRounded = speedKph == null ? null : Math.max(0, speedKph);
      var over = limit && limit.kph != null && speedKphRounded != null
        ? MM.speed.isOver(speedKphRounded, limit.kph, session.tolerance)
        : false;

      var next = nextManoeuvre(steps, progressKm);
      var state = {
        at: now,
        position: position,
        progressKm: progressKm,
        remainingKm: remainingKm,
        remainingMinutes: remainingMinutes,
        eta: remainingMinutes == null ? null : new Date(now.getTime() + remainingMinutes * 60000),
        speedKph: speedKphRounded,
        speedMph: speedKphRounded == null ? null : speedKphRounded * MM.speed.KPH_TO_MPH,
        heading: fix.heading != null ? fix.heading : projection.bearing,
        offsetMetres: offsetMetres,
        onRoute: !offRoute,
        offRoute: offRoute,
        offRouteSeconds: offRouteSeconds,
        needsReplan: offRouteSeconds > 12,
        limit: limit,
        limitConfidence: confidenceOf(limit),
        overLimit: over,
        overByKph: over ? speedKphRounded - limit.kph : null,
        next: next,
        metresToNext: next ? Math.max(0, (next.atKm - progressKm) * 1000) : null,
        arrived: remainingKm < 0.03,
        progress: session.distanceKm ? progressKm / session.distanceKm : 0,
        breakDue: false,
        drivingMinutesSinceBreak: null,
      };

      // Trip recording. The trip starts at the first fix unless the caller
      // told us when it began — a fix carries its own clock, and replaying a
      // recorded drive must not produce a negative duration.
      var trip = session.trip;
      if (!trip.points.length && !opts.startedAt) {
        trip.startedAt = now;
        session.startedAt = now;
      }
      if (trip.lastAt) {
        var elapsed = (now.getTime() - trip.lastAt) / 1000;
        var moved = metresBetween(trip.lastPoint, position);
        // A gap that implies 250 km/h or more is a dropped fix or a teleport,
        // not driving: count the distance only when it is physically possible.
        if (elapsed > 0 && moved / elapsed < 70) trip.distanceKm += moved / 1000;
        if (moving === true) {
          trip.movingSeconds += elapsed;
          session._lastMovingAt = now;
        } else if (moving === false) {
          trip.stoppedSeconds += elapsed;
          if (session._stoppedSince == null) session._stoppedSince = now.getTime();
        }
      }
      if (speedKphRounded != null && speedKphRounded > trip.maxSpeedKph) trip.maxSpeedKph = speedKphRounded;
      var lastRecorded = trip.points[trip.points.length - 1];
      if (!lastRecorded || metresBetween(lastRecorded, position) > 15 || (now.getTime() - (trip.lastAt || 0)) > 30000) {
        trip.points.push({ lat: position.lat, lon: position.lon, at: now.toISOString(), speedKph: speedKphRounded });
        if (trip.points.length > 20000) trip.points.shift();
      }
      trip.lastPoint = position;
      trip.lastAt = now.getTime();

      // A break resets when the vehicle has stood still for a while.
      if (session._stoppedSince != null && (now.getTime() - session._stoppedSince) > 10 * 60000) {
        trip.stops.push({ at: new Date(session._stoppedSince).toISOString(), endedAt: now.toISOString() });
        session._lastMovingAt = now;
        session._stoppedSince = null;
      }
      if (moving === true && session._stoppedSince != null) session._stoppedSince = null;

      var sinceBreakMinutes = session._lastMovingAt ? (now.getTime() - session._lastMovingAt.getTime()) / 60000 : 0;
      // "Driving minutes since break" here means continuous driving, which is
      // what the break advice is actually about.
      var continuous = session._continuousSince == null ? 0 : (now.getTime() - session._continuousSince) / 60000;
      if (moving === true) {
        if (session._continuousSince == null) session._continuousSince = now.getTime();
        continuous = (now.getTime() - session._continuousSince) / 60000;
      } else if (moving === false && session._stoppedSince != null && (now.getTime() - session._stoppedSince) > 10 * 60000) {
        session._continuousSince = null;
        continuous = 0;
      }
      state.continuousDrivingMinutes = continuous;
      state.breakDue = continuous >= session.breakEveryMinutes;

      trip.offRouteCount += offRoute ? 1 : 0;
      session.state = state;
      return state;
    };

    /** What (if anything) to say right now. Deduplicated per manoeuvre. */
    session.speak = function (state) {
      if (!state || !state.next) return null;
      var step = state.next;
      var metres = state.metresToNext;
      var thresholds = session.units === 'imperial'
        ? [{ m: 1609, label: '1 mile' }, { m: 804, label: 'half a mile' }, { m: 366, label: '400 yards' }, { m: 91, label: '100 yards' }]
        : [{ m: 1600, label: '1.6 kilometres' }, { m: 800, label: '800 metres' }, { m: 400, label: '400 metres' }, { m: 100, label: '100 metres' }];
      var key = step.key;
      for (var i = 0; i < thresholds.length; i += 1) {
        var mark = 'speak:' + key + ':' + thresholds[i].m;
        if (metres != null && metres <= thresholds[i].m && !session._spoken[mark]) {
          // Mark this threshold and every closer one: they are moot now, and
          // without this the next tick would re-announce the same turn.
          for (var k = i; k < thresholds.length; k += 1) {
            session._spoken['speak:' + key + ':' + thresholds[k].m] = true;
          }
          var phrase = step.verbal
            ? 'In ' + thresholds[i].label + ', ' + lowerFirst(step.verbal)
            : 'In ' + thresholds[i].label + ', ' + lowerFirst(step.instruction || 'continue');
          return phrase;
        }
      }
      return null;
    };

    /** Sun-in-your-eyes windows along the route, from its heading and the sun. */
    session.glareWindows = function (startAt) {
      var out = [];
      if (!MM.solar || session.geometry.length < 2) return out;
      var started = startAt || session.startedAt;
      var samples = Math.max(2, Math.min(120, Math.ceil(session.distanceKm / 5)));
      var open = null;
      for (var i = 0; i < samples; i += 1) {
        var t = i / (samples - 1);
        var km = session.distanceKm * t;
        var along = point(positionAt(session, km));
        if (!along) continue;
        var index = Math.min(session.geometry.length - 2, Math.max(0, Math.round(t * (session.geometry.length - 1))));
        var heading = bearingAt(session.geometry, index);
        var when = new Date(started.getTime() + (session.durationMinutes || 0) * 60000 * t);
        var sun = MM.solar.solarPosition(when, along.lat, along.lon);
        if (sun.altitude < -1 || sun.altitude > 16 || heading == null) {
          if (open) { open.toKm = km; out.push(open); open = null; }
          continue;
        }
        var difference = Math.abs(((sun.azimuth - heading + 540) % 360) - 180);
        if (difference < 30) {
          if (!open) open = { fromKm: km, toKm: km, fromTime: new Date(when), toTime: new Date(when), heading: heading, altitude: sun.altitude };
          else { open.toKm = km; open.toTime = new Date(when); }
        } else if (open) {
          open.toKm = km;
          out.push(open);
          open = null;
        }
      }
      if (open) out.push(open);
      return out;
    };

    /** Where you are at a given distance along the route. */
    session.atKm = function (km) { return positionAt(session, km); };

    /** A finished trip: totals, plus GPX you can keep. */
    session.finish = function (endedAt) {
      var trip = session.trip;
      var end = endedAt ? new Date(endedAt) : new Date();
      if (isNaN(end.getTime())) end = new Date();
      if (isNaN(trip.startedAt.getTime())) trip.startedAt = new Date();
      var movingHours = trip.movingSeconds / 3600;
      return {
        startedAt: trip.startedAt,
        endedAt: end,
        durationMinutes: (end.getTime() - trip.startedAt.getTime()) / 60000,
        distanceKm: trip.distanceKm,
        movingSeconds: trip.movingSeconds,
        stoppedSeconds: trip.stoppedSeconds,
        maxSpeedKph: trip.maxSpeedKph,
        averageMovingKph: movingHours > 0 ? trip.distanceKm / movingHours : null,
        averageOverallKph: null,
        stops: trip.stops.length,
        offRouteCount: trip.offRouteCount,
        points: trip.points.length,
        route: {
          distanceKm: session.distanceKm,
          durationMinutes: session.durationMinutes,
          progressKm: session.state ? session.state.progressKm : 0,
          completed: session.state ? session.state.arrived : false,
        },
      };
    };

    session.toGpx = function (name) {
      var trip = session.trip;
      var lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="MostUsefulMaps (themostusefulsiteintheworld.com)" xmlns="http://www.topografix.com/GPX/1/1">',
        '  <metadata><name>' + escapeXml(name || 'Drive') + '</name><time>' + trip.startedAt.toISOString() + '</time></metadata>',
        '  <trk><name>' + escapeXml(name || 'Drive') + '</name><trkseg>',
      ];
      for (var i = 0; i < trip.points.length; i += 1) {
        var p = trip.points[i];
        lines.push('    <trkpt lat="' + p.lat.toFixed(6) + '" lon="' + p.lon.toFixed(6) + '"><time>' + p.at + '</time>'
          + (p.speedKph != null ? '<extensions><speed>' + p.speedKph.toFixed(1) + '</speed></extensions>' : '')
          + '</trkpt>');
      }
      lines.push('  </trkseg></trk>', '</gpx>');
      return lines.join('\n');
    };

    session.snapshot = function () {
      return {
        distanceKm: session.distanceKm,
        durationMinutes: session.durationMinutes,
        steps: session.steps.length,
        limits: session.limits.length,
        vehicle: session.vehicle,
      };
    };

    return session;
  }

  function escapeXml(text) {
    return String(text).replace(/[<>&'"]/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c];
    });
  }

  function lowerFirst(text) {
    if (!text) return '';
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  function normaliseLimits(list, totalKm) {
    if (!list || !list.length) return [];
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      var entry = list[i];
      if (!entry || entry.fromKm == null || entry.toKm == null || entry.toKm <= entry.fromKm) continue;
      var copy = Object.assign({}, entry);
      if (copy.kph == null && copy.mph != null) copy.kph = MM.speed.mphToKph(copy.mph);
      if (copy.mph == null && copy.kph != null) copy.mph = Math.round(MM.speed.kphToMph(copy.kph));
      out.push(copy);
    }
    out.sort(function (a, b) { return a.fromKm - b.fromKm; });
    if (out.length && totalKm) out[out.length - 1].toKm = Math.min(out[out.length - 1].toKm, totalKm + 0.001);
    return out;
  }

  /** Cumulative step distances so "which manoeuvre is next?" is a lookup. */
  function buildStepIndex(steps, totalKm, declaredKm) {
    var out = [];
    if (!steps || !steps.length) return out;
    var sum = 0;
    for (var i = 0; i < steps.length; i += 1) {
      var step = steps[i] || {};
      var stepKm = step.distanceKm;
      if (stepKm == null && step.distanceMetres != null) stepKm = step.distanceMetres / 1000;
      if (stepKm == null) stepKm = 0;
      out.push({
        index: i,
        distanceKm: stepKm,
        atKm: sum,
        endsAtKm: sum + stepKm,
        durationMin: step.durationMin != null ? step.durationMin : null,
        instruction: step.instruction || step.name || 'continue',
        verbal: step.verbal || step.verbalInstruction || null,
        modifier: step.modifier || null,
        name: step.name || null,
        type: step.type != null ? step.type : null,
        lat: step.lat != null ? step.lat : null,
        lon: step.lon != null ? step.lon : null,
        key: i + ':' + (step.instruction || '').slice(0, 24),
      });
      sum += stepKm;
    }
    // If the router's steps do not add up to the route length, scale them, so
    // progress along the steps stays aligned with progress along the road.
    if (sum > 0 && declaredKm && Math.abs(sum - declaredKm) / declaredKm > 0.05) {
      var scale = declaredKm / sum;
      var acc = 0;
      for (var j = 0; j < out.length; j += 1) {
        out[j].distanceKm *= scale;
        out[j].atKm = acc;
        acc += out[j].distanceKm;
        out[j].endsAtKm = acc;
      }
    }
    return out;
  }

  function nextManoeuvre(steps, progressKm) {
    if (!steps.length) return null;
    for (var i = 0; i < steps.length; i += 1) {
      // The manoeuvre itself happens at the *end* of the step, so the first
      // step that still has road left ahead of us is the one to announce.
      if (steps[i].endsAtKm > progressKm + 0.005) {
        if (i === 0 && progressKm < 0.02) return steps[i];
        return steps[i];
      }
    }
    return steps[steps.length - 1];
  }

  /** Remaining time from the router's own per-step timings, when it has them. */
  function remainingTime(steps, progressKm, totalMinutes, totalKm) {
    var partial = 0;
    var sum = 0;
    for (var i = 0; i < steps.length; i += 1) {
      var step = steps[i];
      if (step.endsAtKm <= progressKm) continue;
      if (step.atKm < progressKm && step.distanceKm > 0) {
        var fraction = Math.max(0, Math.min(1, (progressKm - step.atKm) / step.distanceKm));
        if (step.durationMin != null) partial += step.durationMin * (1 - fraction);
        sum += step.distanceKm * (1 - fraction);
      } else {
        if (step.durationMin != null) partial += step.durationMin;
        sum += step.distanceKm;
      }
    }
    if (partial > 0) return partial;
    if (totalMinutes != null && totalKm) return totalMinutes * (Math.max(0, totalKm - progressKm) / totalKm);
    return null;
  }

  function positionAt(session, km) {
    var target = Math.max(0, Math.min(session.cum.total, km));
    var low = 0;
    var high = session.cum.km.length - 1;
    while (low < high - 1) {
      var mid = (low + high) >> 1;
      if (session.cum.km[mid] <= target) low = mid; else high = mid;
    }
    var span = session.cum.km[high] - session.cum.km[low];
    var t = span === 0 ? 0 : (target - session.cum.km[low]) / span;
    var a = point(session.geometry[low]);
    var b = point(session.geometry[high]);
    return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
  }

  // ------------------------------------------- speed limits from OSM ways
  //
  // The route comes from a router; the speed limits come from OpenStreetMap.
  // This is the join between them: walk the route, find the OSM way you are
  // actually on, take its limit (with the vehicle's own rules applied), and
  // merge the result into stretches you can draw and talk about.
  //
  // It is deliberately honest about failure. Where no way matched, the stretch
  // is emitted as `unknown` and the caller decides whether a country default is
  // a better answer than "follow the signs".

  var CELL_DEGREES = 0.002; // ~220 m north-south, ~140 m east-west in the UK

  function cellKey(lat, lon) {
    return Math.floor(lat / CELL_DEGREES) + ':' + Math.floor(lon / CELL_DEGREES);
  }

  function indexWays(ways) {
    var grid = new Map();
    var count = 0;
    for (var i = 0; i < ways.length; i += 1) {
      var way = ways[i];
      if (!way || !way.segments || way.segments.length < 2) continue;
      for (var s = 1; s < way.segments.length; s += 1) {
        var a = way.segments[s - 1];
        var b = way.segments[s];
        var segment = { way: way, a: { lat: a[0], lon: a[1] }, b: { lat: b[0], lon: b[1] } };
        var minLat = Math.min(a[0], b[0]);
        var maxLat = Math.max(a[0], b[0]);
        var minLon = Math.min(a[1], b[1]);
        var maxLon = Math.max(a[1], b[1]);
        // Register the segment in every cell it touches.
        for (var la = minLat; la <= maxLat + CELL_DEGREES; la += CELL_DEGREES) {
          for (var lo = minLon; lo <= maxLon + CELL_DEGREES; lo += CELL_DEGREES) {
            var key = cellKey(la, lo);
            var bucket = grid.get(key);
            if (!bucket) grid.set(key, (bucket = []));
            // Avoid registering the same segment in the same bucket twice when
            // the segment spans a corner.
            if (bucket[bucket.length - 1] !== segment) bucket.push(segment);
          }
        }
        count += 1;
      }
    }
    return { grid: grid, segments: count };
  }

  function metresToSegmentFlat(pointLat, pointLon, segment) {
    var latScale = 111320 * Math.cos(pointLat * Math.PI / 180);
    var ax = segment.a.lon * latScale, ay = segment.a.lat * 110540;
    var bx = segment.b.lon * latScale, by = segment.b.lat * 110540;
    var px = pointLon * latScale, py = pointLat * 110540;
    var dx = bx - ax, dy = by - ay;
    var lengthSq = dx * dx + dy * dy;
    var t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    var qx = ax + t * dx, qy = ay + t * dy;
    return { metres: Math.hypot(px - qx, py - qy), t: t };
  }

  function nearestWaySegment(index, lat, lon, maxMetres) {
    var baseLat = Math.floor(lat / CELL_DEGREES);
    var baseLon = Math.floor(lon / CELL_DEGREES);
    var best = null;
    for (var dLat = -1; dLat <= 1; dLat += 1) {
      for (var dLon = -1; dLon <= 1; dLon += 1) {
        var bucket = index.grid.get((baseLat + dLat) + ':' + (baseLon + dLon));
        if (!bucket) continue;
        for (var i = 0; i < bucket.length; i += 1) {
          var distance = metresToSegmentFlat(lat, lon, bucket[i]);
          if (distance.metres > maxMetres) continue;
          // Prefer the closest road, but break ties towards the bigger road:
          // a parallel service road 5 m further away should not win over the
          // motorway you are actually on.
          var rank = distance.metres - classBonus(bucket[i].way.tags);
          if (!best || rank < best.rank) best = { rank: rank, metres: distance.metres, way: bucket[i].way };
        }
      }
    }
    return best;
  }

  function classBonus(tags) {
    var cls = MM.speed.roadClassFromTags(tags);
    var bonus = { motorway: 12, trunk: 9, primary: 6, secondary: 4, tertiary: 2 }[cls];
    return bonus || 0;
  }

  /**
   * Build the speed-limit profile for a route.
   *
   * options:
   *   ways          [{ id, tags, segments: [[lat, lon], …] }] from OSM
   *   countryAt     function (lat, lon) → ISO country code
   *   urbanAt       function (lat, lon) → true when the point is in a built-up
   *                 area (the app derives this from the offline gazetteer)
   *   vehicle       'car' | 'caravan' | 'van' | 'motorhome' | 'hgv'
   *   wales / scotlandOrNI   booleans for the devolved GB limits
   *   spacingKm     how finely to sample the route (default 0.2)
   *   matchRadiusMetres         (default 40)
   *   date          for time-conditional limits
   */
  function limitsFromWays(sessionOrGeometry, options) {
    var opts = options || {};
    var geometry = sessionOrGeometry && sessionOrGeometry.geometry ? sessionOrGeometry.geometry : sessionOrGeometry;
    if (!geometry || geometry.length < 2) return { segments: [], coverage: 0, matchedKm: 0, totalKm: 0, ways: 0 };
    var cum = sessionOrGeometry && sessionOrGeometry.cum ? sessionOrGeometry.cum : cumulative(geometry);
    var index = indexWays(opts.ways || []);
    var spacing = opts.spacingKm || 0.2;
    var matchRadius = opts.matchRadiusMetres || 40;
    var samples = Math.max(2, Math.min(6000, Math.ceil(cum.total / spacing)));

    var runs = [];
    var matchedKm = 0;
    var unmatchedKm = 0;
    var lastLimitKey = null;

    for (var i = 0; i <= samples; i += 1) {
      var km = (cum.total * i) / samples;
      var along = positionAt({ geometry: geometry, cum: cum }, km);
      var match = nearestWaySegment(index, along.lat, along.lon, matchRadius);
      var limit = null;
      if (match) {
        var tags = match.way.tags || {};
        var country = opts.countryAt ? opts.countryAt(along.lat, along.lon) : opts.country;
        var urban = opts.urbanAt ? opts.urbanAt(along.lat, along.lon) : opts.urban;
        limit = MM.speed.fromTags(tags, {
          country: country,
          urban: urban,
          vehicle: opts.vehicle,
          wales: opts.wales || (country === 'GB' && isWales(along.lat, along.lon)),
          scotlandOrNI: opts.scotlandOrNI,
          date: opts.date,
        });
        limit.osmWayId = match.way.id;
        limit.matchMetres = Math.round(match.metres);
        matchedKm += spacing;
      } else {
        limit = { kph: null, mph: null, source: 'unknown', basis: opts.urbanAt && opts.urbanAt(along.lat, along.lon) ? 'no OSM way matched' : 'no OSM way matched' };
        unmatchedKm += spacing;
      }
      var key = (limit.kph == null ? 'x' : Math.round(limit.kph)) + '|' + limit.source;
      if (key !== lastLimitKey) {
        runs.push({ fromKm: km, toKm: km, limit: limit, urban: limit.source === 'national-urban' });
        lastLimitKey = key;
      }
      runs[runs.length - 1].toKm = Math.min(cum.total, km + spacing / 2);
      runs[runs.length - 1].limit = limit;
    }

    var segments = runs.filter(function (run) { return run.toKm > run.fromKm; }).map(function (run) {
      return {
        fromKm: Math.round(run.fromKm * 1000) / 1000,
        toKm: Math.round(run.toKm * 1000) / 1000,
        kph: run.limit.kph,
        mph: run.limit.kph == null ? null : Math.round(MM.speed.kphToMph(run.limit.kph)),
        source: run.limit.source,
        basis: run.limit.basis,
        roadClass: run.limit.roadClass || null,
        osmWayId: run.limit.osmWayId || null,
        matchMetres: run.limit.matchMetres != null ? run.limit.matchMetres : null,
        note: run.limit.note || null,
        urban: !!run.urban,
      };
    });

    var coverage = cum.total > 0 ? Math.min(1, matchedKm / (matchedKm + unmatchedKm)) : 0;
    return {
      segments: segments,
      coverage: coverage,
      matchedKm: Math.min(cum.total, matchedKm),
      totalKm: cum.total,
      ways: index.segments,
      wayCount: (opts.ways || []).length,
    };
  }

  /** Rough Wales bounding box — Cymru, for the 20 mph restricted-road default. */
  function isWales(lat, lon) {
    return lat > 51.3 && lat < 53.5 && lon > -5.6 && lon < -2.6;
  }

  // ---------------------------------------------------------- pre-drive maths

  /** Total distance at each limit: "18 km at 70 mph, 4 km at 30 mph". */
  function limitSummary(limits) {
    if (!limits || !limits.length) return [];
    var byLimit = {};
    for (var i = 0; i < limits.length; i += 1) {
      var segment = limits[i];
      var key = segment.kph == null ? 'unknown' : Math.round(segment.kph);
      var entry = byLimit[key] || (byLimit[key] = { kph: segment.kph, mph: segment.mph, km: 0, signedKm: 0, assumedKm: 0, labels: {} });
      var span = Math.max(0, segment.toKm - segment.fromKm);
      entry.km += span;
      if (segment.source === 'signed') entry.signedKm += span; else entry.assumedKm += span;
      entry.labels[MM.speed.basisLabel(segment)] = true;
    }
    return Object.keys(byLimit).map(function (key) { return byLimit[key]; })
      .sort(function (a, b) { return (b.kph || 999) - (a.kph || 999); });
  }

  /** Fuel or energy cost for a distance, from the driver's own figures. */
  function costEstimate(distanceKm, options) {
    var opts = options || {};
    var out = { distanceKm: distanceKm, currency: opts.currency || 'GBP' };
    if (opts.electric) {
      var kwhPer100 = opts.kwhPer100Km || 18;
      out.kwh = (distanceKm / 100) * kwhPer100;
      out.pricePerUnit = opts.pricePerKwh != null ? opts.pricePerKwh : 0.24;
      out.cost = out.kwh * out.pricePerUnit;
      out.unit = 'kWh';
      out.basis = kwhPer100 + ' kWh/100 km at £' + out.pricePerUnit.toFixed(2) + '/kWh';
      return out;
    }
    if (opts.units === 'imperial' || opts.mpg) {
      var mpg = opts.mpg || 40;
      var gallons = (distanceKm * 0.621371) / mpg;
      out.gallons = gallons;
      out.litres = gallons * 4.54609;
      out.pricePerUnit = opts.pricePerLitre != null ? opts.pricePerLitre : 1.51;
      out.cost = out.litres * out.pricePerUnit;
      out.unit = 'litres';
      out.basis = mpg + ' mpg at £' + out.pricePerUnit.toFixed(2) + '/litre';
      return out;
    }
    var litresPer100 = opts.litresPer100Km || 7;
    out.litres = (distanceKm / 100) * litresPer100;
    out.pricePerUnit = opts.pricePerLitre != null ? opts.pricePerLitre : 1.51;
    out.cost = out.litres * out.pricePerUnit;
    out.unit = 'litres';
    out.basis = litresPer100 + ' L/100 km at £' + out.pricePerUnit.toFixed(2) + '/litre';
    return out;
  }

  /** Pick out the stops along a route, ordered by how far along they are. */
  function orderStopsAlong(stops, session) {
    if (!stops || !stops.length) return [];
    var out = [];
    for (var i = 0; i < stops.length; i += 1) {
      var stop = stops[i];
      var projection = project(session.geometry, session.cum, stop, null);
      if (!projection) continue;
      if (projection.offsetKm * 1000 > (stop.offsetLimitMetres || 2500)) continue;
      out.push(Object.assign({}, stop, {
        alongKm: projection.progressKm,
        detourKm: projection.offsetKm,
      }));
    }
    out.sort(function (a, b) { return a.alongKm - b.alongKm; });
    return out;
  }

  /** Speed limits for the stretches of a route with no OSM data, from country. */
  function fillGaps(segments, options) {
    var opts = options || {};
    var out = [];
    for (var i = 0; i < segments.length; i += 1) {
      var segment = segments[i];
      if (segment.kph != null && segment.source !== 'unknown') { out.push(segment); continue; }
      var fallback = MM.speed.nationalDefault(opts.country, segment.roadClass || opts.roadClass || 'unclassified', {
        vehicle: opts.vehicle, urban: segment.urban, wales: opts.wales, scotlandOrNI: opts.scotlandOrNI,
      });
      if (fallback && fallback.kph != null) {
        out.push(Object.assign({}, segment, {
          kph: fallback.kph,
          mph: Math.round(MM.speed.kphToMph(fallback.kph)),
          source: segment.urban ? 'national-urban' : 'national-assumed-single',
          basis: segment.urban ? 'built-up area default' : 'national default, single carriageway assumed',
        }));
      } else {
        out.push(Object.assign({}, segment, { kph: null, mph: null, source: 'unknown', basis: fallback ? fallback.reason : 'no data' }));
      }
    }
    return out;
  }

  MM.drive = {
    createSession: createSession,
    normaliseLimits: normaliseLimits,
    limitsFromWays: limitsFromWays,
    isWales: isWales,
    indexWays: indexWays,
    cumulative: cumulative,
    limitAt: limitAt,
    limitSummary: limitSummary,
    costEstimate: costEstimate,
    orderStopsAlong: orderStopsAlong,
    fillGaps: fillGaps,
    confidenceOf: confidenceOf,
    positionAt: positionAt,
    project: project,
  };

  if (typeof module === 'object' && module.exports) module.exports = MM.drive;
})(typeof globalThis !== 'undefined' ? globalThis : this);
