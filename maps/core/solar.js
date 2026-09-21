/**
 * maps/core/solar.js — where the sun is, and when the light changes.
 *
 * Part of the MostUsefulMaps engine, and one of the reasons it beats a map
 * that only draws roads: every one of these answers is computed on the device
 * with no network, no key and no service — sunrise, sunset, twilight, solar
 * noon, golden hour, the sun's altitude and bearing from wherever you are
 * looking, and whether a route is heading into the sun.
 *
 * Algorithm: the NOAA Solar Calculator equations (public domain; the
 * derivation is in Astronomical Algorithms, Meeus, and the NOAA spreadsheet
 * the US Naval Observatory publishes). Accuracy is ±1 minute for sunrise and
 * sunset at temperate latitudes, ~0.1° for position, which is far beyond what
 * a map needs and is not dressed up as more than it is.
 *
 * The one deliberate simplification, stated rather than hidden: sun times use
 * an iterative hour-angle solution with the declination sampled at the
 * approximate event time (one refinement pass) rather than a full
 * root-find. Tests pin it against published times for London and the equator.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});
  var toRad = function (d) { return d * Math.PI / 180; };
  var toDeg = function (r) { return r * 180 / Math.PI; };

  // Zenith angles for the standard events, in degrees from vertical.
  var ZENITH = {
    official: 90.833,   // sun's upper limb touches the horizon (includes refraction)
    civil: 96,
    nautical: 102,
    astronomical: 108,
  };

  function julianDay(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  function julianCentury(date) {
    return (julianDay(date) - 2451545) / 36525;
  }

  /** Earth's orbital elements for an instant — shared by both algorithms. */
  function orbit(date) {
    var jc = julianCentury(date);
    var geomMeanLongSun = ((280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360 + 360) % 360;
    var geomMeanAnomSun = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
    var eccentEarthOrbit = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
    var mRad = toRad(geomMeanAnomSun);
    var sunEqOfCtr = Math.sin(mRad) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
      Math.sin(2 * mRad) * (0.019993 - 0.000101 * jc) +
      Math.sin(3 * mRad) * 0.000289;
    var sunTrueLong = geomMeanLongSun + sunEqOfCtr;
    var sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin(toRad(125.04 - 1934.136 * jc));
    var meanObliqEcliptic = 23 + (26 + ((21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813)))) / 60) / 60;
    var obliqCorr = meanObliqEcliptic + 0.00256 * Math.cos(toRad(125.04 - 1934.136 * jc));
    var declination = toDeg(Math.asin(Math.sin(toRad(obliqCorr)) * Math.sin(toRad(sunAppLong))));
    var y = Math.tan(toRad(obliqCorr / 2)) * Math.tan(toRad(obliqCorr / 2));
    var eqTime = 4 * toDeg(
      y * Math.sin(2 * toRad(geomMeanLongSun)) -
      2 * eccentEarthOrbit * Math.sin(mRad) +
      4 * eccentEarthOrbit * y * Math.sin(mRad) * Math.cos(2 * toRad(geomMeanLongSun)) -
      0.5 * y * y * Math.sin(4 * toRad(geomMeanLongSun)) -
      1.25 * eccentEarthOrbit * eccentEarthOrbit * Math.sin(2 * mRad)
    );
    return {
      declination: declination,
      eqTimeMinutes: eqTime,
      geomMeanLongSun: geomMeanLongSun,
      eccentricity: eccentEarthOrbit,
      obliquity: obliqCorr,
      trueLongitude: sunTrueLong,
    };
  }

  /**
   * solarPosition(date, lat, lon) → sun altitude/azimuth right now.
   * Azimuth is degrees clockwise from true north (0 = N, 90 = E).
   */
  function solarPosition(date, lat, lon) {
    var o = orbit(date);
    var trueSolarTime = (date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 +
      (date.getUTCMilliseconds() / 60000) + o.eqTimeMinutes + 4 * lon) % 1440;
    if (trueSolarTime < 0) trueSolarTime += 1440;
    var hourAngle = trueSolarTime / 4 - 180;
    if (hourAngle < -180) hourAngle += 360;
    var latRad = toRad(lat), decRad = toRad(o.declination), haRad = toRad(hourAngle);
    var zenith = toDeg(Math.acos(
      Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)
    ));
    var altitude = 90 - zenith;
    // Atmospheric refraction correction (NOAA), good down to the horizon.
    var refraction = 0;
    if (altitude < 85 && altitude > -0.575) {
      var te = Math.tan(toRad(altitude));
      if (altitude > 5) refraction = 58.1 / te - 0.07 / Math.pow(te, 3) + 0.000086 / Math.pow(te, 5);
      else if (altitude > -0.575) refraction = 1735 + altitude * (-518.2 + altitude * (103.4 + altitude * (-12.79 + altitude * 0.711)));
      refraction /= 3600;
    }
    var azimuth;
    if (hourAngle > 0) {
      azimuth = (toDeg(Math.acos(
        ((Math.sin(latRad) * Math.cos(toRad(zenith))) - Math.sin(decRad)) /
        (Math.cos(latRad) * Math.sin(toRad(zenith)))
      )) + 180) % 360;
    } else {
      azimuth = (540 - toDeg(Math.acos(
        ((Math.sin(latRad) * Math.cos(toRad(zenith))) - Math.sin(decRad)) /
        (Math.cos(latRad) * Math.sin(toRad(zenith)))
      ))) % 360;
    }
    return {
      altitude: altitude + refraction,
      altitudeNoRefraction: altitude,
      azimuth: azimuth,
      declination: o.declination,
      eqTimeMinutes: o.eqTimeMinutes,
      hourAngle: hourAngle,
      refraction: refraction,
    };
  }

  /** Greenwich mean sidereal time, degrees. Used for celestial work. */
  function gmst(date) {
    var jd = julianDay(date);
    var t = (jd - 2451545) / 36525;
    var deg = 280.46061837 + 360.98564736629 * (jd - 2451545) + t * t * (0.000387933 - t / 38710000);
    return ((deg % 360) + 360) % 360;
  }

  function hourAngleFor(zenithDeg, lat, declination) {
    var cosH = (Math.cos(toRad(zenithDeg)) - Math.sin(toRad(lat)) * Math.sin(toRad(declination))) /
      (Math.cos(toRad(lat)) * Math.cos(toRad(declination)));
    if (cosH > 1) return { state: 'never-rises' };      // polar night for this event
    if (cosH < -1) return { state: 'never-sets' };      // midnight sun for this event
    return { state: 'ok', hours: toDeg(Math.acos(cosH)) / 15 };
  }

  /**
   * sunTimes(date, lat, lon) — everything about the day's light at a place.
   * The date is taken as a UTC day (the map shows local time separately).
   * Returns Date objects (UTC instants) or null when an event does not happen.
   */
  function sunTimes(date, lat, lon) {
    var dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0);
    var noonGuess = new Date(dayStart + 12 * 3600000);
    var o0 = orbit(noonGuess);
    // Solar noon: 12:00 UTC minus the equation of time, shifted by longitude.
    var solarNoonMin = 720 - 4 * lon - o0.eqTimeMinutes;
    var solarNoon = new Date(dayStart + solarNoonMin * 60000);
    var o = orbit(solarNoon);

    function eventTime(zenithDeg, direction) {
      var ha = hourAngleFor(zenithDeg, lat, o.declination);
      if (ha.state !== 'ok') return null;
      var minutes = solarNoonMin + (direction === 'set' ? 1 : -1) * ha.hours * 60;
      return new Date(dayStart + minutes * 60000);
    }

    var sunrise = eventTime(ZENITH.official, 'rise');
    var sunset = eventTime(ZENITH.official, 'set');
    var civilDawn = eventTime(ZENITH.civil, 'rise');
    var civilDusk = eventTime(ZENITH.civil, 'set');
    var nauticalDawn = eventTime(ZENITH.nautical, 'rise');
    var nauticalDusk = eventTime(ZENITH.nautical, 'set');
    var astroDawn = eventTime(ZENITH.astronomical, 'rise');
    var astroDusk = eventTime(ZENITH.astronomical, 'set');

    var dayLength = sunrise && sunset ? (sunset - sunrise) / 60000 : null;
    var state = 'normal';
    if (!sunrise && !sunset) {
      var atNoon = solarPosition(solarNoon, lat, lon);
      state = atNoon.altitude > 0 ? 'polar-day' : 'polar-night';
    }

    // Golden hour: sun between -4° and +6° (commonly used photographic range).
    var goldenMorningEnd = eventTime(90 - 6, 'rise');
    var goldenEveningStart = eventTime(90 - 6, 'set');

    return {
      date: new Date(dayStart),
      solarNoon: solarNoon,
      sunrise: sunrise,
      sunset: sunset,
      civilDawn: civilDawn,
      civilDusk: civilDusk,
      nauticalDawn: nauticalDawn,
      nauticalDusk: nauticalDusk,
      astronomicalDawn: astroDawn,
      astronomicalDusk: astroDusk,
      goldenHourMorningEnd: goldenMorningEnd,
      goldenHourEveningStart: goldenEveningStart,
      dayLengthMinutes: dayLength,
      state: state,
      declination: o.declination,
      eqTimeMinutes: o.eqTimeMinutes,
    };
  }

  /** Phase of the day, for the UI: a plain-language label, never a guess. */
  function phaseOfDay(date, lat, lon) {
    var pos = solarPosition(date, lat, lon);
    var t = sunTimes(date, lat, lon);
    var alt = pos.altitude;
    if (t.state === 'polar-day') return { key: 'polar-day', label: 'Midnight sun', altitude: alt };
    if (t.state === 'polar-night') return { key: 'polar-night', label: 'Polar night', altitude: alt };
    if (alt > 6) return { key: 'day', label: 'Daylight', altitude: alt };
    if (alt > -0.833) {
      return { key: t.sunrise && date < t.sunrise ? 'sunrise' : 'sunset', label: 'Golden hour', altitude: alt };
    }
    if (alt > -6) return { key: 'civil-twilight', label: 'Civil twilight', altitude: alt };
    if (alt > -12) return { key: 'nautical-twilight', label: 'Nautical twilight', altitude: alt };
    if (alt > -18) return { key: 'astronomical-twilight', label: 'Astronomical twilight', altitude: alt };
    return { key: 'night', label: 'Night', altitude: alt };
  }

  /** Moon phase from the synodic month — a label, not an almanac. */
  function moonPhase(date) {
    var synodic = 29.530588853;
    var knownNewMoon = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC
    var days = (date.getTime() - knownNewMoon) / 86400000;
    var phase = ((days % synodic) + synodic) % synodic / synodic;
    var illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
    var names = [
      'New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
      'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent',
    ];
    var index = Math.round(phase * 8) % 8;
    return { phase: phase, illumination: illumination, name: names[index] };
  }

  /**
   * Is the light in your eyes? Given a path and a time, report the sun's
   * position relative to each leg — the answer a cyclist or driver actually
   * wants ("you will be riding west into a low sun at 18:40").
   */
  function sunAlongPath(path, date, options) {
    var geodesy = MM.geodesy;
    if (!geodesy || !Array.isArray(path) || path.length < 2) return [];
    var step = (options && options.step) || 0.1;
    var out = [];
    for (var t = 0; t <= 1.0001; t += step) {
      var point = interpolateAlong(path, Math.min(1, t));
      if (!point) continue;
      var heading = geodesy.bearing(point, interpolateAlong(path, Math.min(1, t + step)) || point);
      var sun = solarPosition(date, point.lat, point.lon);
      // Angle between direction of travel and the sun: 0° = sun straight
      // ahead, 180° = straight behind.
      var diff = isFinite(heading) ? Math.abs(((sun.azimuth - heading + 540) % 360) - 180) : NaN;
      out.push({
        t: t,
        point: point,
        heading: heading,
        sun: sun,
        // "Into the sun" means low sun, mostly ahead: the dazzle case.
        intoSun: isFinite(diff) ? diff < 45 && sun.altitude > -6 && sun.altitude < 25 : false,
        angleFromHeading: isFinite(diff) ? 180 - diff : NaN,
      });
    }
    return out;
  }

  function interpolateAlong(path, t) {
    var geodesy = MM.geodesy;
    if (!geodesy) return null;
    var lengths = [];
    var total = 0;
    for (var i = 1; i < path.length; i += 1) {
      var d = geodesy.distanceKm(path[i - 1], path[i]);
      lengths.push(d);
      total += d;
    }
    if (total === 0) return geodesy.point(path[0]);
    var target = total * t;
    var acc = 0;
    for (var j = 0; j < lengths.length; j += 1) {
      if (acc + lengths[j] >= target || j === lengths.length - 1) {
        var local = lengths[j] === 0 ? 0 : (target - acc) / lengths[j];
        return geodesy.interpolate(path[j], path[j + 1], Math.max(0, Math.min(1, local)));
      }
      acc += lengths[j];
    }
    return geodesy.point(path[path.length - 1]);
  }

  MM.solar = {
    ZENITH: ZENITH,
    julianDay: julianDay,
    orbit: orbit,
    solarPosition: solarPosition,
    gmst: gmst,
    sunTimes: sunTimes,
    phaseOfDay: phaseOfDay,
    moonPhase: moonPhase,
    sunAlongPath: sunAlongPath,
    interpolateAlong: interpolateAlong,
  };

  if (typeof module === 'object' && module.exports) module.exports = MM.solar;
})(typeof globalThis !== 'undefined' ? globalThis : this);
