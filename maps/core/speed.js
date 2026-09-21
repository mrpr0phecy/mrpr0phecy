/**
 * maps/core/speed.js — what is the speed limit here, for *this* vehicle?
 *
 * This is the module that makes a driving companion honest. Speed limits are
 * not one number per road:
 *
 *   - In the UK the national limits depend on the road type *and on what you
 *     are driving*. A car may do 60 mph on a single carriageway; the same car
 *     towing a caravan may only do 50. A 44-tonne lorry is limited to 40 mph
 *     on single carriageways in Scotland and Northern Ireland, but 50 in
 *     England and Wales.
 *   - In Wales, restricted roads (street-lit, no signed limit) default to
 *     20 mph — 30 everywhere else in the UK.
 *   - OpenStreetMap records some of this as `maxspeed`, and some as
 *     `maxspeed:type` (e.g. `GB:nsl_single`), and sometimes only implicitly.
 *
 * So every limit this module returns carries its **basis**: `signed` when a
 * mapper recorded it, `national` when it comes from a country's default table
 * for that road class and vehicle, `assumed-urban` / `assumed-class` when we
 * had to infer, and `none` when we genuinely do not know. The UI shows the
 * basis, because "70 (signed)" and "60 (assumed)" deserve different trust.
 *
 * Sources: GOV.UK speed limits guidance, the OSM wiki's `maxspeed:type`
 * values for the UK, and the Welsh Government's September 2023 default.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});

  var MPH_TO_KPH = 1.609344;
  var KPH_TO_MPH = 1 / MPH_TO_KPH;
  var MPH_TO_MPS = 0.44704;
  var KPH_TO_MPS = 0.2777778;

  function mphToKph(mph) { return mph * MPH_TO_KPH; }
  function kphToMph(kph) { return kph * KPH_TO_MPH; }

  /** Road classes, in the order a driver thinks about them. */
  var ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'track'];
  var MOTORWAY_CLASSES = { motorway: true, motorway_link: true };
  var DUAL_CAPABLE = { motorway: true, trunk: true, primary: true };

  /**
   * National limits, keyed by country, then vehicle, in km/h.
   * `restricted` is the street-lit/built-up default; `single`/`dual`/`motorway`
   * are the national-speed defaults for those road types.
   */
  var NATIONAL = {
    GB: {
      // Cars and motorcycles (and car-derived vans up to 2 t).
      car: { restricted: 48, restrictedWales: 32, single: 97, dual: 113, motorway: 113 },
      // Cars towing a caravan or trailer, and goods vehicles up to 7.5 t MLW.
      caravan: { restricted: 48, restrictedWales: 32, single: 80, dual: 97, motorway: 97 },
      // Goods vehicles to 7.5 t.
      van: { restricted: 48, restrictedWales: 32, single: 80, dual: 97, motorway: 113 },
      // Motorhomes are treated as cars if under 3.05 t and 2 m wide; heavier
      // ones follow goods-vehicle rules. Slightly conservative by default.
      motorhome: { restricted: 48, restrictedWales: 32, single: 80, dual: 97, motorway: 113 },
      // Over 7.5 t (England and Wales).
      hgv: { restricted: 48, restrictedWales: 32, single: 80, dual: 97, motorway: 97 },
      // Over 7.5 t in Scotland and Northern Ireland — 10 mph lower on singles.
      hgvScotland: { restricted: 48, restrictedWales: 32, single: 64, dual: 80, motorway: 97 },
    },
    IE: {
      car: { restricted: 50, single: 80, dual: 100, motorway: 120 },
      caravan: { restricted: 50, single: 80, dual: 80, motorway: 80 },
      van: { restricted: 50, single: 80, dual: 100, motorway: 120 },
      motorhome: { restricted: 50, single: 80, dual: 100, motorway: 120 },
      hgv: { restricted: 50, single: 80, dual: 80, motorway: 90 },
    },
    FR: {
      car: { restricted: 50, single: 80, dual: 110, motorway: 130 },
      caravan: { restricted: 50, single: 80, dual: 100, motorway: 110 },
      van: { restricted: 50, single: 80, dual: 110, motorway: 130 },
      motorhome: { restricted: 50, single: 80, dual: 110, motorway: 130 },
      hgv: { restricted: 50, single: 80, dual: 90, motorway: 90 },
    },
    DE: {
      car: { restricted: 50, single: 100, dual: 100, motorway: null },
      caravan: { restricted: 50, single: 80, dual: 80, motorway: 80 },
      van: { restricted: 50, single: 80, dual: 80, motorway: 80 },
      motorhome: { restricted: 50, single: 80, dual: 80, motorway: 100 },
      hgv: { restricted: 50, single: 60, dual: 80, motorway: 80 },
    },
    NL: {
      car: { restricted: 50, single: 80, dual: 100, motorway: 100 },
      caravan: { restricted: 50, single: 80, dual: 90, motorway: 90 },
      van: { restricted: 50, single: 80, dual: 100, motorway: 100 },
      motorhome: { restricted: 50, single: 80, dual: 100, motorway: 100 },
      hgv: { restricted: 50, single: 80, dual: 80, motorway: 80 },
    },
    BE: {
      car: { restricted: 50, single: 70, dual: 90, motorway: 120 },
      caravan: { restricted: 50, single: 70, dual: 90, motorway: 120 },
      van: { restricted: 50, single: 70, dual: 90, motorway: 120 },
      motorhome: { restricted: 50, single: 70, dual: 90, motorway: 120 },
      hgv: { restricted: 50, single: 70, dual: 90, motorway: 90 },
    },
    ES: {
      car: { restricted: 30, single: 90, dual: 90, motorway: 120 },
      caravan: { restricted: 30, single: 80, dual: 80, motorway: 90 },
      van: { restricted: 30, single: 90, dual: 90, motorway: 120 },
      motorhome: { restricted: 30, single: 90, dual: 90, motorway: 120 },
      hgv: { restricted: 30, single: 80, dual: 80, motorway: 90 },
    },
    IT: {
      car: { restricted: 50, single: 90, dual: 90, motorway: 130 },
      caravan: { restricted: 50, single: 80, dual: 80, motorway: 100 },
      van: { restricted: 50, single: 90, dual: 90, motorway: 130 },
      motorhome: { restricted: 50, single: 90, dual: 90, motorway: 130 },
      hgv: { restricted: 50, single: 80, dual: 80, motorway: 100 },
    },
    PT: {
      car: { restricted: 50, single: 90, dual: 100, motorway: 120 },
      caravan: { restricted: 50, single: 70, dual: 80, motorway: 100 },
      van: { restricted: 50, single: 90, dual: 100, motorway: 120 },
      motorhome: { restricted: 50, single: 90, dual: 100, motorway: 120 },
      hgv: { restricted: 50, single: 70, dual: 80, motorway: 90 },
    },
    CH: {
      car: { restricted: 50, single: 80, dual: 100, motorway: 120 },
      caravan: { restricted: 50, single: 80, dual: 80, motorway: 80 },
      van: { restricted: 50, single: 80, dual: 100, motorway: 120 },
      motorhome: { restricted: 50, single: 80, dual: 100, motorway: 120 },
      hgv: { restricted: 50, single: 80, dual: 80, motorway: 80 },
    },
    AT: {
      car: { restricted: 50, single: 100, dual: 100, motorway: 130 },
      caravan: { restricted: 50, single: 80, dual: 80, motorway: 100 },
      van: { restricted: 50, single: 100, dual: 100, motorway: 130 },
      motorhome: { restricted: 50, single: 100, dual: 100, motorway: 130 },
      hgv: { restricted: 50, single: 70, dual: 80, motorway: 80 },
    },
    DK: {
      car: { restricted: 50, single: 80, dual: 80, motorway: 130 },
      caravan: { restricted: 50, single: 80, dual: 80, motorway: 80 },
      van: { restricted: 50, single: 80, dual: 80, motorway: 130 },
      motorhome: { restricted: 50, single: 80, dual: 80, motorway: 130 },
      hgv: { restricted: 50, single: 80, dual: 80, motorway: 80 },
    },
    SE: {
      car: { restricted: 50, single: 70, dual: 90, motorway: 110 },
      caravan: { restricted: 50, single: 70, dual: 80, motorway: 80 },
      van: { restricted: 50, single: 70, dual: 90, motorway: 110 },
      motorhome: { restricted: 50, single: 70, dual: 90, motorway: 110 },
      hgv: { restricted: 50, single: 70, dual: 80, motorway: 80 },
    },
    NO: {
      car: { restricted: 50, single: 80, dual: 80, motorway: 110 },
      caravan: { restricted: 50, single: 80, dual: 80, motorway: 80 },
      van: { restricted: 50, single: 80, dual: 80, motorway: 110 },
      motorhome: { restricted: 50, single: 80, dual: 80, motorway: 110 },
      hgv: { restricted: 50, single: 80, dual: 80, motorway: 80 },
    },
    PL: {
      car: { restricted: 50, single: 90, dual: 100, motorway: 140 },
      caravan: { restricted: 50, single: 70, dual: 80, motorway: 80 },
      van: { restricted: 50, single: 90, dual: 100, motorway: 140 },
      motorhome: { restricted: 50, single: 90, dual: 100, motorway: 140 },
      hgv: { restricted: 50, single: 70, dual: 80, motorway: 80 },
    },
  };

  /** Countries whose limits vary by state or province — say so, do not guess. */
  var VARIES_BY_REGION = {
    US: 'varies by state', CA: 'varies by province', AU: 'varies by state',
    NZ: 'varies by region', IN: 'varies by state', BR: 'varies by state',
  };

  var VEHICLES = [
    { id: 'car', label: 'Car or car-derived van', towing: false, heavy: false, note: 'The normal full-speed limits.' },
    { id: 'caravan', label: 'Car towing a caravan or trailer', towing: true, heavy: false, note: 'Lower national limits: 50 mph singles, 60 mph duals and motorways in the UK.' },
    { id: 'van', label: 'Van or goods vehicle up to 7.5 t', towing: false, heavy: false, note: 'Lower on single carriageways; motorway limits are unchanged.' },
    { id: 'motorhome', label: 'Motorhome', towing: false, heavy: true, note: 'Cars-under-3.05 t keep car limits; heavier motorhomes follow goods-vehicle rules. Slightly conservative here.' },
    { id: 'hgv', label: 'HGV over 7.5 t', towing: false, heavy: true, note: 'Also changes routing: low bridges, weight limits and lorry bans are avoided.' },
  ];

  function vehicleInfo(id) {
    for (var i = 0; i < VEHICLES.length; i += 1) if (VEHICLES[i].id === id) return VEHICLES[i];
    return VEHICLES[0];
  }

  // ------------------------------------------------------- parsing OSM tags

  /**
   * Turn an OSM `maxspeed` value into km/h.
   * Handles "30 mph", "50", "50 km/h", "walk", "none", "signals", "variable",
   * "national" and the UK's `maxspeed:type` vocabulary.
   */
  function parseMaxspeed(value) {
    if (value == null) return { ok: false, raw: value, reason: 'empty' };
    var text = String(value).trim().toLowerCase();
    if (!text) return { ok: false, raw: value, reason: 'empty' };
    if (text === 'none') return { ok: true, kph: null, unlimited: true, basis: 'signed', raw: value };
    if (text === 'walk' || text === 'foot') return { ok: true, kph: 8, basis: 'signed', raw: value };
    if (text === 'signals' || text === 'variable') return { ok: true, kph: null, variable: true, basis: 'signed', raw: value };
    if (text === 'national') return { ok: false, raw: value, reason: 'national-needs-road-class' };

    // UK maxspeed:type vocabulary that sometimes appears in maxspeed=.
    var ukTypes = {
      'gb:nsl_restricted': { kph: 48, default: true },
      'gb-wls:nsl_restricted': { kph: 32, default: true },
      'gb:nsl_single': { kph: 97, default: true },
      'gb:nsl_dual': { kph: 113, default: true },
      'gb:motorway': { kph: 113, default: true },
      'gb:zone20': { kph: 32 },
      'gb:zone30': { kph: 48 },
      'gb:zone40': { kph: 64 },
    };
    if (ukTypes[text]) {
      return { ok: true, kph: ukTypes[text].kph, basis: 'signed', nationalType: true, raw: value };
    }

    var mphMatch = text.match(/^([\d.]+)\s*mph$/);
    if (mphMatch) return { ok: true, kph: Math.round(parseFloat(mphMatch[1]) * MPH_TO_KPH * 100) / 100, basis: 'signed', raw: value, unit: 'mph' };

    var kphMatch = text.match(/^([\d.]+)\s*(?:km\/?h|kmh)$/);
    if (kphMatch) return { ok: true, kph: parseFloat(kphMatch[1]), basis: 'signed', raw: value, unit: 'kph' };

    var knots = text.match(/^([\d.]+)\s*knots?$/);
    if (knots) return { ok: true, kph: parseFloat(knots[1]) * 1.852, basis: 'signed', raw: value, unit: 'knots' };

    var plain = text.match(/^([\d.]+)$/);
    if (plain) return { ok: true, kph: parseFloat(plain[1]), basis: 'signed', raw: value, unit: 'kph', implied: 'km/h' };

    return { ok: false, raw: value, reason: 'unrecognised' };
  }

  /** Conditional limits: `maxspeed:conditional=30 @ (22:00-06:00)`. */
  function parseMaxspeedConditional(value, date) {
    if (!value) return null;
    var parts = String(value).split(';');
    var when = date || new Date();
    for (var i = 0; i < parts.length; i += 1) {
      var match = parts[i].match(/^\s*([^@]+)@\s*\(?([^)]*)\)?\s*$/);
      if (!match) continue;
      var parsed = parseMaxspeed(match[1]);
      if (!parsed.ok || parsed.kph == null) continue;
      if (timeConditionMatches(match[2], when)) {
        return { kph: parsed.kph, record: match[0].trim(), raw: value };
      }
    }
    return null;
  }

  /** Just enough of the OSM conditional syntax to be useful and predictable. */
  function timeConditionMatches(condition, when) {
    var text = String(condition).toLowerCase();
    if (/\bmo|tu|we|th|fr|sa|su/.test(text) && /\b(mo|tu|we|th|fr|sa|su)/.test(text)) {
      var days = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
      if (text.indexOf(days[when.getDay()]) < 0 && !/ph|sh/.test(text)) return false;
    }
    var ranges = text.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g);
    if (!ranges) return true;
    var minutes = when.getHours() * 60 + when.getMinutes();
    for (var i = 0; i < ranges.length; i += 1) {
      var parts = ranges[i].match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
      var from = parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
      var to = parseInt(parts[3], 10) * 60 + parseInt(parts[4], 10);
      if (from <= to ? (minutes >= from && minutes <= to) : (minutes >= from || minutes <= to)) return true;
    }
    return false;
  }

  /** Road class from OSM tags, for default limits. */
  function roadClassFromTags(tags) {
    if (!tags) return null;
    var highway = tags.highway;
    if (!highway) return null;
    if (MOTORWAY_CLASSES[highway]) return 'motorway';
    if (highway === 'trunk' || highway === 'trunk_link') return 'trunk';
    if (highway === 'primary' || highway === 'primary_link') return 'primary';
    if (highway === 'secondary' || highway === 'secondary_link') return 'secondary';
    if (highway === 'tertiary' || highway === 'tertiary_link') return 'tertiary';
    if (highway === 'residential') return 'residential';
    if (highway === 'living_street') return 'living_street';
    if (highway === 'service') return 'service';
    if (highway === 'track') return 'track';
    return 'unclassified';
  }

  /** Is this stretch a dual carriageway, as far as the tags admit? */
  function isDual(tags) {
    if (!tags) return false;
    if (tags.dual_carriageway === 'yes') return true;
    if (tags['carriageway:type'] === 'dual') return true;
    // A one-way motorway/trunk with two lanes each side is usually dual, but
    // guessing would be wrong often enough to matter, so only the explicit
    // tags and the UK's own maxspeed:type count.
    var type = String(tags['maxspeed:type'] || tags['source:maxspeed'] || '');
    return /nsl_dual|GB:dual/.test(type);
  }

  /**
   * The national default for this country, road class and vehicle.
   * Returns { kph, key, basis } or { unknown: true, reason }.
   */
  function nationalDefault(country, roadClass, options) {
    var opts = options || {};
    var cc = country ? String(country).toUpperCase() : null;
    if (!cc) return { unknown: true, reason: 'no country' };
    var table = NATIONAL[cc];
    if (!table) {
      if (VARIES_BY_REGION[cc]) return { unknown: true, reason: VARIES_BY_REGION[cc] };
      return { unknown: true, reason: 'no national default in this table' };
    }
    var vehicle = opts.vehicle === 'hgv' && opts.scotlandOrNI ? 'hgvScotland' : (opts.vehicle || 'car');
    var row = table[vehicle] || table.car;
    if (!row) return { unknown: true, reason: 'no entry for ' + vehicle };
    if (row.kph === null || (row.motorway === null && roadClass === 'motorway')) {
      return { unlimited: true, basis: 'national', reason: 'no general limit' };
    }

    var isUrban = opts.urban === true || roadClass === 'residential' || roadClass === 'living_street' || roadClass === 'service';
    if (isUrban) {
      var kph = cc === 'GB' && opts.wales ? (row.restrictedWales != null ? row.restrictedWales : row.restricted) : row.restricted;
      return { kph: kph, key: cc === 'GB' && opts.wales ? 'restricted-wales' : 'restricted', basis: 'national-urban', roadClass: roadClass };
    }
    if (roadClass === 'motorway') return { kph: row.motorway, key: 'motorway', basis: 'national', roadClass: roadClass };
    if (roadClass === 'trunk' || roadClass === 'primary') {
      var dual = opts.dual;
      if (dual === true || (dual == null && opts.assumeDual)) {
        return { kph: row.dual, key: 'dual', basis: 'national', roadClass: roadClass };
      }
      if (dual === false) return { kph: row.single, key: 'single', basis: 'national', roadClass: roadClass };
      // Unknown: the UK's dual carriageway default only applies to roads that
      // are actually dual, so without evidence we take the single-carriageway
      // figure — the lower, safer assumption.
      return { kph: row.single, key: 'single', basis: 'national-assumed-single', roadClass: roadClass };
    }
    if (roadClass === 'track') return { unknown: true, reason: 'track' };
    return { kph: row.single, key: 'single', basis: 'national', roadClass: roadClass };
  }

  /**
   * The best answer available for one OSM way, with its basis spelled out.
   * options: { country, vehicle, urban, wales, scotlandOrNI, date, roadClass,
   *            dual, assumeDual }
   */
  function fromTags(tags, options) {
    var opts = options || {};
    var roadClass = opts.roadClass || roadClassFromTags(tags) || 'unclassified';
    var out = { roadClass: roadClass, tags: tags || {}, country: opts.country || null };

    if (tags) {
      var maxspeed = tags.maxspeed;
      if (maxspeed != null) {
        var parsed = parseMaxspeed(maxspeed);
        if (parsed.ok) {
          out.kph = parsed.kph;
          out.unlimited = !!parsed.unlimited;
          out.variable = !!parsed.variable;
          out.source = 'signed';
          out.raw = parsed.raw;
          out.unit = parsed.unit;
          out.basis = parsed.basis;
          if (out.unlimited) out.note = 'no general limit';
          return finish(out, opts);
        }
      }
      // Vehicle-specific tags beat the generic one.
      var vehicleTag = opts.vehicle === 'hgv' ? tags['maxspeed:hgv']
        : opts.vehicle === 'van' ? tags['maxspeed:goods']
          : opts.vehicle === 'caravan' ? (tags['maxspeed:trailer'] || tags['maxspeed:conditional'])
            : null;
      if (vehicleTag) {
        var vehicleParsed = parseMaxspeed(vehicleTag);
        if (vehicleParsed.ok && vehicleParsed.kph != null) {
          out.kph = vehicleParsed.kph;
          out.source = 'signed';
          out.raw = vehicleTag;
          out.basis = 'signed for this vehicle';
          out.vehicleSpecific = true;
          return finish(out, opts);
        }
      }
      var conditional = parseMaxspeedConditional(tags['maxspeed:conditional'], opts.date);
      if (conditional) {
        out.kph = conditional.kph;
        out.source = 'signed';
        out.raw = conditional.raw;
        out.basis = 'signed, time-conditional now';
        out.conditional = conditional.record;
        return finish(out, opts);
      }
    }

    var fallback = nationalDefault(opts.country, roadClass, {
      vehicle: opts.vehicle,
      urban: opts.urban,
      wales: opts.wales,
      scotlandOrNI: opts.scotlandOrNI,
      dual: opts.dual != null ? opts.dual : (tags && isDual(tags) ? true : undefined),
      assumeDual: opts.assumeDual,
    });
    if (fallback && fallback.unknown) {
      // A country we know varies by state or province: publishing a number
      // would be inventing one. Say what is true instead.
      out.kph = null;
      out.mph = null;
      out.source = 'unknown';
      out.basis = fallback.reason;
      out.note = 'no national table for this country';
      return finish(out, opts);
    }
    if (fallback && fallback.kph != null) {
      out.kph = fallback.kph;
      out.source = fallback.basis;
      out.basis = fallback.basis === 'national-urban' ? 'built-up area default' : 'national default for this road type and vehicle';
      out.note = fallback.key ? fallback.key + ' limit' : null;
      return finish(out, opts);
    }
    if (fallback && fallback.unlimited) {
      out.unlimited = true;
      out.source = 'national';
      out.basis = 'no general limit';
      return finish(out, opts);
    }
    out.source = 'unknown';
    out.basis = fallback && fallback.reason ? fallback.reason : 'no data';
    return finish(out, opts);
  }

  function finish(out, opts) {
    if (out.kph != null) {
      out.mph = Math.round(kphToMph(out.kph));
      out.kphRounded = Math.round(out.kph);
    }
    out.vehicle = opts.vehicle || 'car';
    return out;
  }

  /**
   * Warning threshold. UK guidance is a fixed penalty at 10% + 2 mph over the
   * limit, so that is the default. This is *not* legal advice and not a
   * licence to speed: the sign on the road always wins.
   */
  function overThresholdKph(limitKph, tier) {
    if (limitKph == null) return null;
    var mph = kphToMph(limitKph);
    var toleranceMph = tier === 'strict' ? 0 : Math.max(1, mph * 0.1 + 2);
    return mphToKph(mph + toleranceMph);
  }

  function isOver(speedKph, limitKph, tier) {
    if (speedKph == null || limitKph == null) return false;
    var threshold = overThresholdKph(limitKph, tier);
    return speedKph > threshold;
  }

  /** Display: "30 mph" in the UK and Ireland, "50 km/h" almost everywhere else. */
  function formatLimit(limit, units) {
    if (!limit) return '—';
    if (limit.unlimited) return 'no general limit';
    if (limit.variable) return 'variable (gantry signs)';
    if (limit.kph == null) return 'unknown';
    var imperial = units === 'imperial' || limit.country === 'GB' || limit.country === 'IE' || limit.unit === 'mph';
    if (imperial) return Math.round(kphToMph(limit.kph)) + ' mph';
    return Math.round(limit.kph) + ' km/h';
  }

  function basisLabel(limit) {
    if (!limit) return '';
    switch (limit.source) {
      case 'signed': return limit.vehicleSpecific ? 'signed, for your vehicle' : limit.conditional ? 'signed now (conditional)' : 'signed';
      case 'national': return 'national default';
      case 'national-urban': return 'built-up default';
      case 'national-assumed-single': return 'assumed single carriageway';
      default: return limit.source === 'unknown' ? 'unknown — follow the signs' : String(limit.source);
    }
  }

  MM.speed = {
    MPH_TO_KPH: MPH_TO_KPH,
    KPH_TO_MPH: KPH_TO_MPH,
    MPH_TO_MPS: MPH_TO_MPS,
    KPH_TO_MPS: KPH_TO_MPS,
    mphToKph: mphToKph,
    kphToMph: kphToMph,
    ROAD_CLASSES: ROAD_CLASSES,
    NATIONAL: NATIONAL,
    VARIES_BY_REGION: VARIES_BY_REGION,
    VEHICLES: VEHICLES,
    vehicleInfo: vehicleInfo,
    parseMaxspeed: parseMaxspeed,
    parseMaxspeedConditional: parseMaxspeedConditional,
    roadClassFromTags: roadClassFromTags,
    isDual: isDual,
    nationalDefault: nationalDefault,
    fromTags: fromTags,
    overThresholdKph: overThresholdKph,
    isOver: isOver,
    formatLimit: formatLimit,
    basisLabel: basisLabel,
  };

  if (typeof module === 'object' && module.exports) module.exports = MM.speed;
})(typeof globalThis !== 'undefined' ? globalThis : this);
