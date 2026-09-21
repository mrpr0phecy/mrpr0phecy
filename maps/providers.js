/**
 * maps/providers.js — every live data source, in one place, named.
 *
 * MostUsefulMaps is built so that the *engine* needs no server: geodesy,
 * Plus Codes, sun times, grid references, offline search and the offline map
 * all run on the device. What still needs a network is live streets, live
 * places, road routing, elevation and nearby POIs — and those come from
 * volunteer-run open-data services, never from a paid API with a key.
 *
 * That comes with responsibilities, so they are enforced here rather than
 * hoped for:
 *
 *   - Every provider is declared with its name, licence and attribution, so
 *     the interface can tell the visitor exactly who served the answer.
 *   - The public instances are shared infrastructure. Each one gets a
 *     minimum interval between requests (below), requests are cached, and
 *     nothing fires without a user action. If you fork this and put real
 *     traffic through it, self-host — docs/MAPS.md says how.
 *   - Every call has a timeout and every chain has a fallback, so one dead
 *     service degrades the feature instead of breaking the page.
 *   - Nothing is sent anywhere until the visitor asks for something.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});

  var STYLES = [
    { id: 'fiord', name: 'Fiord (dark)', url: 'https://tiles.openfreemap.org/styles/fiord', theme: 'dark', note: 'Default: matches the site, no glare at night' },
    { id: 'dark', name: 'Dark Matter', url: 'https://tiles.openfreemap.org/styles/dark', theme: 'dark' },
    { id: 'liberty', name: 'Streets', url: 'https://tiles.openfreemap.org/styles/liberty', theme: 'light' },
    { id: 'bright', name: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright', theme: 'light' },
    { id: 'positron', name: 'Minimal', url: 'https://tiles.openfreemap.org/styles/positron', theme: 'light' },
  ];

  var GEOCODERS = [
    {
      id: 'photon', name: 'Photon', home: 'photon.komoot.io', licence: 'ODbL (OpenStreetMap data)',
      minIntervalMs: 900, timeoutMs: 9000,
      search: function (query, near) {
        var url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(query) + '&limit=8&lang=en';
        if (near) url += '&lat=' + near.lat.toFixed(5) + '&lon=' + near.lon.toFixed(5);
        return url;
      },
      reverse: function (point) {
        return 'https://photon.komoot.io/reverse?lat=' + point.lat.toFixed(6) + '&lon=' + point.lon.toFixed(6) + '&limit=1';
      },
      parse: function (data) {
        var features = (data && data.features) || [];
        return features.map(function (f) {
          var p = f.properties || {};
          var name = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.city || p.county || 'Unnamed place';
          return {
            name: name,
            detail: [p.city, p.state, p.country].filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i && v !== name; }).join(', '),
            lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
            kind: p.osm_value || p.type || 'place', country: p.countrycode ? p.countrycode.toUpperCase() : null,
          };
        });
      },
    },
    {
      id: 'nominatim', name: 'Nominatim', home: 'nominatim.openstreetmap.org', licence: 'ODbL (OpenStreetMap data)',
      minIntervalMs: 1100, timeoutMs: 9000,
      search: function (query) {
        return 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&q=' + encodeURIComponent(query);
      },
      reverse: function (point) {
        return 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=' + point.lat.toFixed(6) + '&lon=' + point.lon.toFixed(6);
      },
      parse: function (data) {
        var list = Array.isArray(data) ? data : [data];
        return list.filter(function (row) { return row && row.lat; }).map(function (row) {
          var a = row.address || {};
          var name = row.name || a.amenity || a.shop || a.road || row.display_name.split(',')[0];
          return {
            name: name,
            detail: row.display_name,
            lat: parseFloat(row.lat), lon: parseFloat(row.lon),
            kind: row.type || row.class || 'place',
            country: a.country_code ? a.country_code.toUpperCase() : null,
          };
        });
      },
    },
  ];

  var ROUTERS = {
    car: [
      { id: 'fossgis-car', name: 'FOSSGIS (OSM Germany)', base: 'https://routing.openstreetmap.de/routed-car/route/v1/driving', licence: 'ODbL', minIntervalMs: 1200, timeoutMs: 20000 },
      { id: 'osrm-demo', name: 'OSRM demo server', base: 'https://router.project-osrm.org/route/v1/driving', licence: 'ODbL', minIntervalMs: 1500, timeoutMs: 20000, note: 'Demo server — fine for a few requests, not for volume' },
    ],
    bike: [
      { id: 'fossgis-bike', name: 'FOSSGIS (OSM Germany)', base: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike', licence: 'ODbL', minIntervalMs: 1200, timeoutMs: 20000 },
    ],
    foot: [
      { id: 'fossgis-foot', name: 'FOSSGIS (OSM Germany)', base: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot', licence: 'ODbL', minIntervalMs: 1200, timeoutMs: 20000 },
    ],
  };

  var POIS = {
    id: 'overpass', name: 'Overpass API', licence: 'ODbL (OpenStreetMap data)', minIntervalMs: 1500, timeoutMs: 25000,
    endpoints: [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ],
  };

  var ELEVATION = {
    id: 'opentopodata', name: 'OpenTopoData (SRTM 90m)', home: 'api.opentopodata.org',
    licence: 'SRTM: public domain (NASA/USGS)', minIntervalMs: 1100, timeoutMs: 15000,
    url: 'https://api.opentopodata.org/v1/srtm90m?locations=',
  };

  var WIKI = {
    id: 'wikipedia', name: 'Wikipedia (GeoSearch)', home: 'en.wikipedia.org', licence: 'CC BY-SA 4.0',
    minIntervalMs: 500, timeoutMs: 9000,
  };

  /**
   * Valhalla is the driving router: unlike a plain OSRM profile it takes a
   * vehicle, its size and its preferences, so a caravan avoids width limits
   * and an HGV avoids low bridges and lorry bans. FOSSGIS run the public
   * instance with a full planet graph under the same fair-use policy as the
   * OSRM and Nominatim demos. GET-with-json is used on purpose: it is a
   * "simple" CORS request, so no preflight can fail.
   */
  var VALHALLA = {
    id: 'fossgis-valhalla', name: 'FOSSGIS Valhalla', home: 'valhalla1.openstreetmap.de',
    licence: 'ODbL (OpenStreetMap data)', minIntervalMs: 1200, timeoutMs: 25000,
    url: 'https://valhalla1.openstreetmap.de/route',
    note: 'Public demo server on a full planet graph; fair-use policy. Self-host Valhalla for volume.',
  };

  /** TfL publishes live road disruption for London with no key. */
  var TRAFFIC = {
    tfl: {
      id: 'tfl', name: 'TfL Road Disruptions', home: 'api.tfl.gov.uk',
      licence: 'TfL Open Data (attribution required)', minIntervalMs: 1500, timeoutMs: 12000,
      coverage: 'Greater London road network only',
      url: 'https://api.tfl.gov.uk/Road/all/Disruption',
    },
  };

  /** Open-Meteo: no key, CC BY 4.0 data, hourly forecasts, multi-point. */
  var WEATHER = {
    id: 'open-meteo', name: 'Open-Meteo', home: 'api.open-meteo.com',
    licence: 'CC BY 4.0 (data), free for non-commercial use',
    minIntervalMs: 600, timeoutMs: 12000,
    url: 'https://api.open-meteo.com/v1/forecast',
  };

  var POI_CATEGORIES = [
    { id: 'drinking-water', label: 'Drinking water', icon: '🚰', filter: 'nwr["amenity"="drinking_water"]' },
    { id: 'toilets', label: 'Public toilets', icon: '🚻', filter: 'nwr["amenity"="toilets"]' },
    { id: 'fuel', label: 'Fuel', icon: '⛽', filter: 'nwr["amenity"="fuel"]' },
    { id: 'charging', label: 'EV charging', icon: '🔌', filter: 'nwr["amenity"="charging_station"]' },
    { id: 'pharmacy', label: 'Pharmacy', icon: '💊', filter: 'nwr["amenity"="pharmacy"]' },
    { id: 'defibrillator', label: 'Defibrillator', icon: '❤️', filter: 'nwr["emergency"="defibrillator"]' },
    { id: 'food', label: 'Food & drink', icon: '🍽️', filter: 'nwr["amenity"~"^(restaurant|cafe|fast_food|pub)$"]' },
    { id: 'supermarket', label: 'Supermarket', icon: '🛒', filter: 'nwr["shop"="supermarket"]' },
    { id: 'atm', label: 'Cash machine', icon: '🏧', filter: 'nwr["amenity"="atm"]' },
    { id: 'viewpoint', label: 'Viewpoint', icon: '🔭', filter: 'nwr["tourism"="viewpoint"]' },
    { id: 'playground', label: 'Playground', icon: '🛝', filter: 'nwr["leisure"="playground"]' },
    { id: 'bench', label: 'Bench', icon: '🪑', filter: 'nwr["amenity"="bench"]' },
  ];

  // ------------------------------------------------------------------ health

  var health = {};

  function record(id, state, detail) {
    var entry = health[id] || (health[id] = { id: id, calls: 0, failures: 0, lastLatencyMs: null, lastError: null, lastOkAt: null });
    entry.calls += 1;
    if (state === 'ok') {
      entry.lastOkAt = Date.now();
      entry.lastError = null;
      if (detail && typeof detail.latencyMs === 'number') entry.lastLatencyMs = Math.round(detail.latencyMs);
    } else {
      entry.failures += 1;
      entry.lastError = detail && detail.error ? String(detail.error).slice(0, 200) : 'failed';
    }
    return entry;
  }

  // ------------------------------------------------------------------- fetch

  var cache = new Map();

  function cacheKey(url) { return url; }

  function getCached(url, ttlMs) {
    var hit = cache.get(cacheKey(url));
    if (!hit) return null;
    if (ttlMs && Date.now() - hit.at > ttlMs) { cache.delete(cacheKey(url)); return null; }
    return hit.data;
  }

  function putCached(url, data) {
    cache.set(cacheKey(url), { at: Date.now(), data: data });
    // Keep the cache tiny: this is a page, not a proxy.
    if (cache.size > 200) {
      var oldest = null;
      cache.forEach(function (v, k) { if (!oldest || v.at < oldest.at) oldest = { k: k, at: v.at }; });
      if (oldest) cache.delete(oldest.k);
    }
  }

  /** Polite spacing per provider: the public instances are shared. */
  var lastCall = {};
  function waitTurn(id, minIntervalMs) {
    var now = Date.now();
    var previous = lastCall[id] || 0;
    var wait = Math.max(0, (previous + (minIntervalMs || 0)) - now);
    lastCall[id] = now + wait;
    if (!wait) return Promise.resolve();
    return new Promise(function (resolve) { setTimeout(resolve, wait); });
  }

  function fetchJson(url, options) {
    var opts = options || {};
    var id = opts.id || 'http';
    var timeout = opts.timeoutMs || 12000;
    return waitTurn(id, opts.minIntervalMs).then(function () {
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, timeout);
      var started = Date.now();
      return fetch(url, {
        signal: controller ? controller.signal : undefined,
        headers: { Accept: 'application/json' },
        mode: 'cors',
        credentials: 'omit',
        cache: opts.cacheMode || 'default',
      }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + id);
        return response.json();
      }).then(function (data) {
        clearTimeout(timer);
        record(id, 'ok', { latencyMs: Date.now() - started });
        return data;
      }).catch(function (error) {
        clearTimeout(timer);
        record(id, 'fail', { error: error && error.message ? error.message : 'network error' });
        throw error;
      });
    });
  }

  /** Try each candidate in order; the first success wins and is remembered. */
  function chain(candidates, attempt) {
    var list = candidates.slice();
    function next(lastError) {
      if (!list.length) return Promise.reject(lastError || new Error('no provider available'));
      var candidate = list.shift();
      return attempt(candidate).catch(function (error) {
        if (list.length) return next(error);
        throw error;
      });
    }
    return next(null);
  }

  // ------------------------------------------------------------- operations

  function styleUrl(candidate) {
    return fetchJson(candidate.url, {
      id: 'style:' + candidate.id, timeoutMs: 9000, minIntervalMs: 0, cacheMode: 'force-cache',
    }).then(function (style) {
      if (!style || !style.layers || !style.sources) throw new Error('style payload incomplete');
      return { url: candidate.url, style: style, candidate: candidate };
    });
  }

  /** Load a basemap style, trying the preferred one then the rest of the chain. */
  function loadStyle(preferredId) {
    var ordered = STYLES.slice().sort(function (a, b) {
      if (a.id === preferredId) return -1;
      if (b.id === preferredId) return 1;
      return 0;
    });
    return chain(ordered, function (candidate) {
      return styleUrl(candidate).then(function (result) {
        return { id: candidate.id, name: candidate.name, url: result.url, style: result.style, theme: candidate.theme };
      });
    });
  }

  function geocode(query, options) {
    var opts = options || {};
    var near = opts.near && MM.geodesy ? MM.geodesy.point(opts.near) : null;
    return chain(GEOCODERS, function (provider) {
      var url = provider.search(query, near);
      var cached = getCached(url, 5 * 60 * 1000);
      if (cached) return Promise.resolve({ results: cached, provider: provider });
      return fetchJson(url, { id: provider.id, timeoutMs: provider.timeoutMs, minIntervalMs: provider.minIntervalMs })
        .then(function (data) {
          var results = provider.parse(data).filter(function (r) {
            return MM.geodesy && MM.geodesy.validLat(r.lat) && MM.geodesy.validLon(r.lon);
          });
          if (!results.length) throw new Error('no results from ' + provider.name);
          putCached(url, results);
          return { results: results, provider: provider };
        });
    }).catch(function (error) {
      return { results: [], provider: null, error: error.message, offline: true };
    });
  }

  function reverse(point, options) {
    var opts = options || {};
    var pt = MM.geodesy.point(point);
    if (!pt) return Promise.resolve({ result: null, error: 'bad-point' });
    return chain(GEOCODERS, function (provider) {
      var url = provider.reverse(pt);
      var cached = getCached(url, 10 * 60 * 1000);
      if (cached) return Promise.resolve({ result: cached, provider: provider });
      return fetchJson(url, { id: provider.id, timeoutMs: provider.timeoutMs, minIntervalMs: provider.minIntervalMs })
        .then(function (data) {
          var parsed = provider.parse(data);
          var first = parsed && parsed[0];
          if (!first) throw new Error('no address from ' + provider.name);
          putCached(url, first);
          return { result: first, provider: provider };
        });
    }).catch(function (error) {
      return { result: null, provider: null, error: error.message, offline: true };
    });
  }

  function modeKey(mode) {
    if (mode === 'bike' || mode === 'cycling') return 'bike';
    if (mode === 'foot' || mode === 'walking' || mode === 'walk') return 'foot';
    return 'car';
  }

  /** Road routing through open routers; the caller falls back to a straight line. */
  function route(from, to, mode, options) {
    var opts = options || {};
    var a = MM.geodesy.point(from), b = MM.geodesy.point(to);
    if (!a || !b) return Promise.resolve({ error: 'bad-endpoints' });
    var profile = modeKey(mode);
    var coordinates = a.lon.toFixed(6) + ',' + a.lat.toFixed(6) + ';' + b.lon.toFixed(6) + ',' + b.lat.toFixed(6);
    var suffix = '?overview=full&geometries=geojson&steps=true&alternatives=false';
    return chain(ROUTERS[profile], function (provider) {
      var url = provider.base + '/' + coordinates + suffix;
      return fetchJson(url, { id: provider.id, timeoutMs: provider.timeoutMs, minIntervalMs: provider.minIntervalMs })
        .then(function (data) {
          if (!data || !data.routes || !data.routes.length) throw new Error('no route from ' + provider.name);
          var r = data.routes[0];
          return {
            provider: provider,
            mode: profile,
            distanceKm: r.distance / 1000,
            durationMinutes: r.duration / 60,
            geometry: r.geometry.coordinates,
            steps: (r.legs && r.legs[0] && r.legs[0].steps ? r.legs[0].steps : []).map(function (step) {
              return {
                instruction: step.maneuver && step.maneuver.type ? step.maneuver.type.replace(/-/g, ' ') : 'continue',
                modifier: step.maneuver && step.maneuver.modifier ? step.maneuver.modifier : null,
                name: step.name || '',
                distanceKm: step.distance / 1000,
                durationMin: step.duration / 60,
                lat: step.maneuver && step.maneuver.location ? step.maneuver.location[1] : null,
                lon: step.maneuver && step.maneuver.location ? step.maneuver.location[0] : null,
              };
            }),
            raw: r,
          };
        });
    }).catch(function (error) {
      // The honest fallback: a straight line, labelled as one by the caller.
      var straight = MM.geodesy.measure(a, b);
      return {
        error: error.message,
        offline: true,
        mode: profile,
        distanceKm: straight.km,
        durationMinutes: null,
        geometry: [[a.lon, a.lat], [b.lon, b.lat]],
        steps: [],
        straightLine: true,
      };
    });
  }

  function pois(point, radiusMetres, categoryId, options) {
    var opts = options || {};
    var pt = MM.geodesy.point(point);
    if (!pt) return Promise.resolve({ error: 'bad-point', elements: [] });
    var category = POI_CATEGORIES.filter(function (c) { return c.id === categoryId; })[0] || POI_CATEGORIES[0];
    var radius = Math.max(50, Math.min(30000, radiusMetres || 1500));
    var limit = opts.limit || 40;
    var query = '[out:json][timeout:20];(' + category.filter +
      '(around:' + Math.round(radius) + ',' + pt.lat.toFixed(5) + ',' + pt.lon.toFixed(5) + '););' +
      'out center ' + limit + ';';
    return chain(POIS.endpoints, function (endpoint) {
      return fetchJson(endpoint + '?data=' + encodeURIComponent(query), {
        id: 'overpass', timeoutMs: POIS.timeoutMs, minIntervalMs: POIS.minIntervalMs,
      }).then(function (data) {
        var elements = (data && data.elements) || [];
        return {
          category: category,
          provider: { id: POIS.id, name: POIS.name, licence: POIS.licence },
          elements: elements.map(function (el) {
            var lat = el.lat != null ? el.lat : el.center && el.center.lat;
            var lon = el.lon != null ? el.lon : el.center && el.center.lon;
            var tags = el.tags || {};
            return {
              id: el.type + '/' + el.id,
              name: tags.name || tags.operator || category.label,
              lat: lat, lon: lon,
              tags: tags,
              kind: tags.amenity || tags.shop || tags.tourism || tags.emergency || category.label,
            };
          }).filter(function (el) {
            return latOk(el.lat) && lonOk(el.lon);
          }),
        };
      });
    }).catch(function (error) {
      return { error: error.message, offline: true, elements: [], category: category };
    });
  }

  // ------------------------------------------------------------ driving

  /** Google's encoded polyline (Valhalla uses precision 6). */
  function decodePolyline(encoded, precision) {
    var factor = Math.pow(10, precision == null ? 6 : precision);
    var coordinates = [];
    var index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      var result = 0, shift = 0, byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      result = 0; shift = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      coordinates.push([lng / factor, lat / factor]);
    }
    return coordinates;
  }

  /** Valhalla's costing for a vehicle, plus the driver's avoid preferences. */
  function valhallaCosting(vehicle, options) {
    var opts = options || {};
    var map = { car: 'auto', caravan: 'auto', van: 'auto', motorhome: 'auto', hgv: 'truck', bike: 'bicycle', foot: 'pedestrian' };
    var costing = map[vehicle] || 'auto';
    var costingOptions = {};
    if (costing === 'auto' || costing === 'truck') {
      costingOptions[costing] = {
        use_highways: opts.avoidMotorways ? 0.1 : 1,
        use_tolls: opts.avoidTolls ? 0 : 1,
        use_ferry: opts.avoidFerries ? 0 : 1,
        use_tracks: opts.avoidUnpaved ? 0 : 0.5,
      };
      if (opts.avoidMotorways) costingOptions[costing].use_tolls = opts.avoidTolls ? 0 : 1;
    }
    if (costing === 'truck') {
      costingOptions.truck = Object.assign(costingOptions.truck || {}, {
        height: opts.heightMetres || 4.11,
        width: opts.widthMetres || 2.55,
        length: opts.lengthMetres || 12.19,
        weight: opts.weightTonnes || 30,
        axle_load: opts.axleLoadTonnes || 9.07,
        axle_count: opts.axleCount || 5,
        hazmat: !!opts.hazmat,
      });
    }
    if (costing === 'auto' && (opts.heightMetres || opts.widthMetres || opts.weightTonnes)) {
      // Cars, caravans and motorhomes have real dimensions too, and Valhalla's
      // auto costing accepts them — a 3.2 m caravan should not be sent under a
      // 2.9 m bridge just because the vehicle is not a lorry.
      costingOptions.auto = Object.assign(costingOptions.auto || {}, {
        height: opts.heightMetres || undefined,
        width: opts.widthMetres || undefined,
        length: opts.lengthMetres || undefined,
        weight: opts.weightTonnes || undefined,
        use_highways: opts.avoidMotorways ? 0.1 : (opts.preferHighways ? 1 : 0.9),
      });
      Object.keys(costingOptions.auto).forEach(function (key) {
        if (costingOptions.auto[key] === undefined) delete costingOptions.auto[key];
      });
    }
    if (costing === 'bicycle' || costing === 'pedestrian') {
      costingOptions[costing] = { use_ferry: opts.avoidFerries ? 0 : 0.5 };
    }
    return { costing: costing, costingOptions: costingOptions };
  }

  /**
   * A driving route with turn-by-turn, alternatives and vehicle awareness.
   * Falls back to the OSRM chain, then to a labelled straight line.
   */
  function driveRoute(from, to, options) {
    var opts = options || {};
    var a = MM.geodesy.point(from);
    var b = MM.geodesy.point(to);
    if (!a || !b) return Promise.resolve({ error: 'bad-endpoints' });
    var via = (opts.via || []).map(function (p) { return MM.geodesy.point(p); }).filter(Boolean);
    var locations = [a].concat(via).concat([b]).map(function (p) {
      return { lat: Number(p.lat.toFixed(6)), lon: Number(p.lon.toFixed(6)), type: 'break' };
    });
    var vehicle = opts.vehicle || 'car';
    var costing = valhallaCosting(vehicle, opts);

    var body = {
      locations: locations,
      costing: costing.costing,
      costing_options: costing.costingOptions,
      directions_options: { units: 'kilometers', language: 'en-GB' },
      shape_format: 'geojson',
      alternates: opts.alternates || 0,
      id: 'mostusefulmaps',
    };
    var url = VALHALLA.url + '?json=' + encodeURIComponent(JSON.stringify(body));

    var started = Date.now();
    return fetchJson(url, {
      id: VALHALLA.id, timeoutMs: VALHALLA.timeoutMs, minIntervalMs: VALHALLA.minIntervalMs,
      cacheMode: 'no-store',
    }).then(function (data) {
      var trip = data && data.trip;
      if (!trip || !trip.legs || !trip.legs.length) throw new Error('no route from Valhalla');
      var parsed = parseValhallaTrip(trip, vehicle);
      parsed.provider = { id: VALHALLA.id, name: VALHALLA.name, licence: VALHALLA.licence, home: VALHALLA.home };
      parsed.simple = parseAlternates(data.alternates, vehicle);
      parsed.requestMs = Date.now() - started;
      return parsed;
    }).catch(function (error) {
      // Try the classic OSRM chain before giving up on a road route.
      return route(a, b, vehicle === 'bike' ? 'bike' : vehicle === 'foot' ? 'foot' : 'car').then(function (fallback) {
        if (fallback && !fallback.error) {
          fallback.provider = fallback.provider || { id: 'osrm', name: 'OSRM', licence: 'ODbL' };
          fallback.degraded = true;
          fallback.reason = error.message;
          fallback.vehicleNote = 'The Valhalla driving router was unreachable, so this is a standard car route without vehicle-size awareness.';
          return fallback;
        }
        var straight = MM.geodesy.measure(a, b);
        return {
          error: error.message, offline: true, straightLine: true,
          distanceKm: straight.km, durationMinutes: null,
          geometry: [[a.lon, a.lat], [b.lon, b.lat]], steps: [], legs: [],
          mode: vehicle,
        };
      });
    });
  }

  function parseValhallaTrip(trip, vehicle) {
    var legs = trip.legs || [];
    var geometry = [];
    var steps = [];
    var legIndexes = [];
    for (var i = 0; i < legs.length; i += 1) {
      var leg = legs[i];
      legIndexes.push({ leg: i, offset: geometry.length });
      var shape = leg.shape;
      var coordinates = null;
      if (shape && typeof shape === 'object' && shape.coordinates) coordinates = shape.coordinates;
      else if (typeof shape === 'string') coordinates = decodePolyline(shape, 6);
      if (coordinates && coordinates.length) {
        // Avoid duplicating the join point between legs.
        geometry = geometry.concat(i > 0 ? coordinates.slice(1) : coordinates);
      }
      var maneuvers = leg.maneuvers || [];
      for (var m = 0; m < maneuvers.length; m += 1) {
        var maneuver = maneuvers[m];
        steps.push({
          index: steps.length,
          // Valhalla lengths are in kilometres because we asked for kilometres.
          distanceKm: maneuver.length != null ? maneuver.length : 0,
          durationMin: maneuver.time != null ? maneuver.time / 60 : null,
          instruction: maneuver.instruction || maneuver.verbal_post_transition_instruction || 'continue',
          verbal: maneuver.verbal_pre_transition_instruction || maneuver.verbal_transition_alert_instruction || null,
          modifier: modifierName(maneuver.type),
          type: maneuver.type,
          name: (maneuver.street_names && maneuver.street_names[0]) || maneuver.instruction || '',
          lat: null, lon: null,
          beginShapeIndex: maneuver.begin_shape_index,
          exitNumber: maneuver.exit_number != null ? maneuver.exit_number : null,
          roundaboutExit: maneuver.roundabout_exit_count != null ? maneuver.roundabout_exit_count : null,
          toll: !!maneuver.toll,
          highway: !!maneuver.highway,
        });
      }
    }
    // Point each manoeuvre at the route vertex where it happens, so the map and
    // the list agree about where "turn left" is.
    for (var s = 0; s < steps.length; s += 1) {
      var idx = steps[s].beginShapeIndex;
      if (idx != null && geometry[idx]) {
        steps[s].lon = geometry[idx][0];
        steps[s].lat = geometry[idx][1];
      }
    }
    var summary = trip.summary || {};
    return {
      mode: vehicle,
      geometry: geometry,
      distanceKm: summary.length != null ? summary.length : 0,
      durationMinutes: summary.time != null ? summary.time / 60 : null,
      tolls: !!summary.has_toll,
      motorways: !!summary.has_highway,
      hasTimeRestrictions: !!summary.has_time_restrictions,
      steps: steps,
      legs: legs.map(function (leg, index) {
        return {
          distanceKm: leg.summary ? leg.summary.length : null,
          durationMinutes: leg.summary ? leg.summary.time / 60 : null,
          index: index,
        };
      }),
      raw: trip,
    };
  }

  function parseAlternates(alternates, vehicle) {
    if (!alternates || !alternates.length) return [];
    return alternates.map(function (entry) {
      var trip = entry.trip || entry;
      if (!trip || !trip.summary) return null;
      return {
        distanceKm: trip.summary.length,
        durationMinutes: trip.summary.time / 60,
        tolls: !!trip.summary.has_toll,
        motorways: !!trip.summary.has_highway,
        geometry: (trip.legs && trip.legs[0] && trip.legs[0].shape && trip.legs[0].shape.coordinates) || null,
        vehicle: vehicle,
      };
    }).filter(Boolean);
  }

  function modifierName(type) {
    var table = {
      4: 'arrive', 5: 'arrive', 6: 'arrive', 9: 'slight right', 10: 'right', 11: 'sharp right',
      12: 'u-turn right', 13: 'u-turn left', 14: 'sharp left', 15: 'left', 16: 'slight left',
      17: 'straight', 18: 'right', 19: 'left', 20: 'exit right', 21: 'exit left', 22: 'straight',
      23: 'keep right', 24: 'keep left', 25: 'merge', 26: 'roundabout', 27: 'roundabout',
      28: 'ferry', 29: 'ferry', 37: 'merge right', 38: 'merge left',
    };
    return table[type] || null;
  }

  /** Samples along a geometry, for corridor queries. */
  function samplePolyline(geometry, spacingKm, maxPoints) {
    if (!geometry || geometry.length < 2) return [];
    var spacing = spacingKm || 0.5;
    var out = [geometry[0]];
    var accumulated = 0;
    for (var i = 1; i < geometry.length; i += 1) {
      accumulated += MM.geodesy.distanceKm(
        { lat: geometry[i - 1][1], lon: geometry[i - 1][0] },
        { lat: geometry[i][1], lon: geometry[i][0] }
      );
      if (accumulated >= spacing) {
        accumulated = 0;
        out.push(geometry[i]);
        if (maxPoints && out.length >= maxPoints) break;
      }
    }
    var last = geometry[geometry.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  }

  function aroundClause(points, radiusMetres) {
    return points.map(function (p) { return p[1].toFixed(5) + ',' + p[0].toFixed(5); }).join(',');
  }

  /**
   * Signed speed limits along a route: the OSM ways you are actually driving on.
   * Chunked so each Overpass query stays small, and spacing is deliberately
   * coarse (60 km per query, 30 m corridor) to stay a good citizen.
   */
  function speedLimitWays(geometry, options) {
    var opts = options || {};
    var totalKm = MM.geodesy.pathLengthKm(geometry.map(function (c) { return { lat: c[1], lon: c[0] }; }));
    // Sample every 2.5 km or so (capped at 240 points, about one query per
    // 80 km) with a 40 m corridor: dense enough that a limit change is not
    // jumped over, and still a handful of small queries rather than one huge
    // one — Overpass is run by volunteers.
    var spacingKm = Math.min(10, Math.max(2.5, totalKm / 240));
    var samples = samplePolyline(geometry, spacingKm, 240);
    var chunks = Math.max(1, Math.ceil(totalKm / (opts.chunkKm || 80)));
    var perChunk = Math.max(6, Math.ceil(samples.length / chunks));
    var groups = [];
    for (var i = 0; i < samples.length; i += perChunk) groups.push(samples.slice(i, i + perChunk));

    var ways = [];
    var seen = {};
    var failures = [];

    return groups.reduce(function (chain, group, index) {
      return chain.then(function () {
        if (opts.onProgress) opts.onProgress({ done: index, total: groups.length });
        var query = '[out:json][timeout:25];(way(around:' + (opts.radiusMetres || 40) + ','
          + aroundClause(group, opts.radiusMetres || 40) + ')[highway][maxspeed];);out geom;';
        return fetchJson(POIS.endpoints[0] + '?data=' + encodeURIComponent(query), {
          id: 'overpass', timeoutMs: POIS.timeoutMs, minIntervalMs: POIS.minIntervalMs,
        }).then(function (data) {
          var elements = (data && data.elements) || [];
          for (var e = 0; e < elements.length; e += 1) {
            var element = elements[e];
            if (element.type !== 'way' || seen[element.id]) continue;
            if (!element.geometry || element.geometry.length < 2) continue;
            seen[element.id] = true;
            ways.push({
              id: element.id,
              tags: element.tags || {},
              segments: element.geometry.map(function (n) { return [n.lat, n.lon]; }),
            });
          }
        }).catch(function (error) {
          failures.push(error.message);
        });
      });
    }, Promise.resolve()).then(function () {
      return {
        ways: ways,
        failures: failures,
        provider: { id: 'overpass', name: 'Overpass API (OpenStreetMap)', licence: POIS.licence },
        totalKm: totalKm,
      };
    });
  }

  /** Service areas, fuel, chargers and loos within reach of the route. */
  function stopsAlong(geometry, options) {
    var opts = options || {};
    var samples = samplePolyline(geometry, Math.max(2, (MM.geodesy.pathLengthKm(geometry.map(function (c) { return { lat: c[1], lon: c[0] }; }))) / 120), 120);
    var radius = opts.radiusMetres || 1200;
    var query = '[out:json][timeout:25];('
      + 'nwr(around:' + radius + ',' + aroundClause(samples, radius) + ')["highway"="services"];'
      + 'nwr(around:' + radius + ',' + aroundClause(samples, radius) + ')["highway"="rest_area"];'
      + 'nwr(around:' + radius + ',' + aroundClause(samples, radius) + ')["amenity"="fuel"];'
      + 'nwr(around:' + radius + ',' + aroundClause(samples, radius) + ')["amenity"="charging_station"];'
      + 'nwr(around:' + radius + ',' + aroundClause(samples, radius) + ')["amenity"="toilets"]["highway"];'
      + ');out center tags 200;';
    return fetchJson(POIS.endpoints[0] + '?data=' + encodeURIComponent(query), {
      id: 'overpass', timeoutMs: POIS.timeoutMs, minIntervalMs: POIS.minIntervalMs,
    }).then(function (data) {
      var elements = (data && data.elements) || [];
      return {
        provider: { id: 'overpass', name: 'Overpass API (OpenStreetMap)', licence: POIS.licence },
        stops: elements.map(function (element) {
          var tags = element.tags || {};
          var lat = element.lat != null ? element.lat : element.center && element.center.lat;
          var lon = element.lon != null ? element.lon : element.center && element.center.lon;
          if (lat == null || lon == null) return null;
          var kind = tags.highway === 'services' ? 'services'
            : tags.highway === 'rest_area' ? 'rest area'
              : tags.amenity === 'charging_station' ? 'EV charging'
                : tags.amenity === 'toilets' ? 'toilets' : 'fuel';
          var facilities = [];
          if (tags.toilets === 'yes') facilities.push('toilets');
          if (tags.fuel_diesel === 'yes') facilities.push('diesel');
          if (tags['socket:type2_combo'] === 'yes' || tags['socket:type2'] === 'yes') facilities.push('CCS');
          if (tags.socket_chademo === 'yes') facilities.push('CHAdeMO');
          if (tags.maxpower) facilities.push(tags.maxpower + ' kW');
          if (tags.hgv === 'yes' || tags.truck === 'yes') facilities.push('lorries');
          if (tags.opening_hours === '24/7') facilities.push('24/7');
          return {
            id: element.type + '/' + element.id,
            name: tags.name || tags.brand || tags.operator || (kind.charAt(0).toUpperCase() + kind.slice(1)),
            kind: kind, lat: lat, lon: lon, facilities: facilities,
            brand: tags.brand || null,
            raw: tags,
          };
        }).filter(Boolean),
      };
    }).catch(function (error) {
      return { error: error.message, stops: [] };
    });
  }

  /**
   * Fixed speed cameras. Only returned for countries where publishing them is
   * lawful (GB and IE here) — elsewhere the caller hides the layer entirely.
   */
  function camerasAlong(geometry, options) {
    var opts = options || {};
    var samples = samplePolyline(geometry, 2, 200);
    var query = '[out:json][timeout:25];(node(around:45,' + aroundClause(samples, 45) + ')["highway"="speed_camera"];'
      + 'node(around:45,' + aroundClause(samples, 45) + ')["enforcement"="average_speed"];);out center tags 200;';
    return fetchJson(POIS.endpoints[opts.endpoint || 0] + '?data=' + encodeURIComponent(query), {
      id: 'overpass', timeoutMs: POIS.timeoutMs, minIntervalMs: POIS.minIntervalMs,
    }).then(function (data) {
      var elements = (data && data.elements) || [];
      return {
        provider: { id: 'overpass', name: 'Overpass API (OpenStreetMap)', licence: POIS.licence },
        cameras: elements.map(function (element) {
          return {
            id: 'node/' + element.id,
            lat: element.lat, lon: element.lon,
            type: (element.tags && (element.tags.maxspeed || element.tags.enforcement || element.tags['camera:type'])) || 'speed camera',
            direction: element.tags && element.tags.direction ? element.tags.direction : null,
            tags: element.tags || {},
          };
        }).filter(function (c) { return c.lat != null && c.lon != null; }),
      };
    }).catch(function (error) {
      return { error: error.message, cameras: [] };
    });
  }

  /** Live road disruption near a route. London only: TfL publish it, key-free. */
  function trafficAlong(geometry, options) {
    var opts = options || {};
    if (opts.disabled) return Promise.resolve({ events: [], provider: null, note: 'live traffic disabled' });
    var bbox = MM.geodesy.bbox(geometry.map(function (c) { return { lat: c[1], lon: c[0] }; }));
    if (!bbox) return Promise.resolve({ events: [], provider: null });
    // Greater London, roughly: only ask TfL when the route actually goes there.
    var inLondon = bbox.east > -0.55 && bbox.west < 0.35 && bbox.north > 51.25 && bbox.south < 51.75;
    if (!inLondon) {
      return Promise.resolve({
        events: [], provider: null, coverage: 'none',
        note: 'No key-free live traffic feed covers this route. Times are free-flow, not traffic-adjusted.',
      });
    }
    return fetchJson(TRAFFIC.tfl.url, { id: 'tfl', timeoutMs: 12000, minIntervalMs: TRAFFIC.tfl.minIntervalMs })
      .then(function (data) {
        var items = Array.isArray(data) ? data : [];
        var events = [];
        for (var i = 0; i < items.length; i += 1) {
          var item = items[i];
          var location = pointFromTfl(item, geometry);
          if (!location) continue;
          events.push({
            id: item.id || ('tfl-' + i),
            title: (item.comments && item.comments[0] && item.comments[0].note) || item.location || item.currentUpdate || 'Road disruption',
            severity: item.severity || null,
            severityLabel: severityLabel(item.severity),
            category: item.category || null,
            lat: location.lat, lon: location.lon,
            alongKm: location.alongKm,
            offsetKm: location.offsetKm,
            from: item.fromDate || null, to: item.toDate || null,
            source: 'TfL',
            url: item.url || null,
          });
        }
        events.sort(function (a, b) { return (a.alongKm || 0) - (b.alongKm || 0); });
        return {
          provider: { id: 'tfl', name: TRAFFIC.tfl.name, licence: TRAFFIC.tfl.licence, home: TRAFFIC.tfl.home },
          coverage: 'Greater London',
          events: events,
          note: events.length ? null : 'TfL reports no road disruption affecting this route right now.',
          fetchedAt: new Date(),
        };
      })
      .catch(function (error) {
        return { events: [], provider: null, error: error.message, coverage: 'unknown',
          note: 'TfL could not be reached, so no live traffic is shown for London.' };
      });
  }

  function severityLabel(severity) {
    var table = { 0: 'special', 1: 'closed', 2: 'severe', 3: 'moderate', 4: 'slight', 5: 'queueing', 6: 'slow', 7: 'clear', 8: 'unknown' };
    return table[severity] || null;
  }

  /** Where a TfL disruption sits relative to our route. */
  function pointFromTfl(item, geometry) {
    var lat = null, lon = null;
    if (item.point) { lat = Number(item.point); lon = null; }
    if (Array.isArray(item.geometry) && item.geometry.coordinates) {
      var coords = item.geometry.coordinates;
      if (typeof coords[0] === 'number') { lon = coords[0]; lat = coords[1]; }
      else if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') { lon = coords[0][0]; lat = coords[0][1]; }
      else if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) { lon = coords[0][0][0]; lat = coords[0][0][1]; }
    }
    if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) return null;
    var routePoints = geometry.map(function (c) { return { lat: c[1], lon: c[0] }; });
    var nearest = MM.geodesy.nearestOnPath({ lat: lat, lon: lon }, routePoints);
    if (!nearest) return null;
    if (nearest.km > 1.5) return null; // not our road
    return { lat: lat, lon: lon, offsetKm: nearest.km, alongKm: null };
  }

  /**
   * Weather where you will be, when you will be there.
   * samples: [{ lat, lon, etaMinutes }] — Open-Meteo takes many points in one
   * call, so a whole route costs one request.
   */
  function weatherAlong(samples, options) {
    var opts = options || {};
    if (!samples || !samples.length) return Promise.resolve({ points: [] });
    var use = samples.slice(0, 40);
    var lat = use.map(function (s) { return Number(s.lat.toFixed(4)); }).join(',');
    var lon = use.map(function (s) { return Number(s.lon.toFixed(4)); }).join(',');
    var variables = 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,visibility';
    var url = WEATHER.url + '?latitude=' + lat + '&longitude=' + lon
      + '&hourly=' + variables + '&timezone=UTC&forecast_days=2&wind_speed_unit=kmh';
    return fetchJson(url, { id: WEATHER.id, timeoutMs: WEATHER.timeoutMs, minIntervalMs: WEATHER.minIntervalMs })
      .then(function (data) {
        var responses = Array.isArray(data) ? data : [data];
        var points = [];
        for (var i = 0; i < use.length && i < responses.length; i += 1) {
          var entry = responses[i];
          var hourly = entry && entry.hourly;
          if (!hourly || !hourly.time || !hourly.time.length) continue;
          var targetMinutes = use[i].etaMinutes != null ? use[i].etaMinutes : 0;
          var target = new Date((opts.startAt ? new Date(opts.startAt).getTime() : Date.now()) + targetMinutes * 60000);
          var bestIndex = 0;
          var bestDelta = Infinity;
          for (var h = 0; h < hourly.time.length; h += 1) {
            var delta = Math.abs(new Date(hourly.time[h] + 'Z').getTime() - target.getTime());
            if (delta < bestDelta) { bestDelta = delta; bestIndex = h; }
          }
          points.push({
            lat: use[i].lat, lon: use[i].lon,
            alongKm: use[i].alongKm, etaMinutes: targetMinutes,
            at: hourly.time[bestIndex] + 'Z',
            temperatureC: pick(hourly.temperature_2m, bestIndex),
            precipitationMm: pick(hourly.precipitation, bestIndex),
            precipitationChance: pick(hourly.precipitation_probability, bestIndex),
            weatherCode: pick(hourly.weather_code, bestIndex),
            windKph: pick(hourly.wind_speed_10m, bestIndex),
            gustKph: pick(hourly.wind_gusts_10m, bestIndex),
            visibilityM: pick(hourly.visibility, bestIndex),
          });
        }
        return {
          provider: { id: WEATHER.id, name: WEATHER.name, licence: WEATHER.licence, home: WEATHER.home },
          points: points,
          fetchedAt: new Date(),
        };
      })
      .catch(function (error) {
        return { points: [], error: error.message, provider: null };
      });
  }

  function pick(array, index) {
    if (!array || index == null) return null;
    var value = array[index];
    return value == null ? null : value;
  }

  /**
   * Optional static road alerts: if the owner runs a workflow that exports
   * National Highways DATEX II closures (their API needs a subscription key,
   * which must never reach the browser), the export lands in this file and the
   * page shows it with its timestamp. Absent file: no alerts, no error.
   */
  function staticRoadAlerts() {
    return fetchJson('maps/data/road-alerts.json', { id: 'road-alerts', timeoutMs: 6000, minIntervalMs: 0 })
      .then(function (data) {
        if (!data || !Array.isArray(data.alerts)) return { alerts: [], source: null };
        return {
          alerts: data.alerts,
          source: data.source || 'National Highways (exported)',
          generatedAt: data.generated || null,
          note: data.note || null,
        };
      })
      .catch(function () {
        return { alerts: [], source: null, absent: true };
      });
  }

  function latOk(lat) { return MM.geodesy ? MM.geodesy.validLat(lat) : isFinite(lat); }
  function lonOk(lon) { return MM.geodesy ? MM.geodesy.validLon(lon) : isFinite(lon); }

  /** Elevation for up to 100 points per request (the service's own limit). */
  function elevation(points, options) {
    var opts = options || {};
    var list = (points || []).map(function (p) { return MM.geodesy.point(p); }).filter(Boolean);
    if (!list.length) return Promise.resolve({ error: 'no-points', values: [] });
    var batch = list.slice(0, opts.max || 100);
    var locations = batch.map(function (p) { return p.lat.toFixed(5) + ',' + p.lon.toFixed(5); }).join('|');
    return fetchJson(ELEVATION.url + encodeURIComponent(locations), {
      id: ELEVATION.id, timeoutMs: ELEVATION.timeoutMs, minIntervalMs: ELEVATION.minIntervalMs,
    }).then(function (data) {
      var results = (data && data.results) || [];
      return {
        provider: { id: ELEVATION.id, name: ELEVATION.name, licence: ELEVATION.licence },
        values: results.map(function (r) {
          return { elevation: r.elevation, lat: r.location && r.location.lat, lon: r.location && r.location.lng };
        }),
      };
    }).catch(function (error) {
      return { error: error.message, offline: true, values: [] };
    });
  }

  /** An elevation profile along a path, sampled every `stepKm`. */
  function elevationProfile(path, stepKm, options) {
    var opts = options || {};
    if (!path || path.length < 2) return Promise.resolve({ error: 'no-path', samples: [] });
    var step = stepKm || 2;
    var total = MM.geodesy.pathLengthKm(path);
    var count = Math.max(2, Math.min(100, Math.ceil(total / step)));
    var samples = [];
    for (var i = 0; i < count; i += 1) {
      var t = i / (count - 1);
      var point = MM.solar ? MM.solar.interpolateAlong(path, t) : MM.geodesy.interpolate(path[0], path[path.length - 1], t);
      samples.push({ t: t, point: point, km: total * t });
    }
    return elevation(samples.map(function (s) { return s.point; }), opts).then(function (result) {
      if (result.values) {
        result.values.forEach(function (v, i) { if (samples[i]) samples[i].elevation = v.elevation; });
      }
      result.samples = samples;
      result.totalKm = total;
      if (result.values && result.values.length > 1) {
        var ascent = 0, descent = 0, previous = result.values[0].elevation;
        for (var k = 1; k < result.values.length; k += 1) {
          var e = result.values[k].elevation;
          if (e == null || previous == null) { previous = e; continue; }
          var diff = e - previous;
          if (diff > 0) ascent += diff; else descent -= diff;
          previous = e;
        }
        result.ascentMetres = Math.round(ascent);
        result.descentMetres = Math.round(descent);
        result.minMetres = Math.round(Math.min.apply(null, result.values.map(function (v) { return v.elevation; }).filter(function (v) { return v != null; })));
        result.maxMetres = Math.round(Math.max.apply(null, result.values.map(function (v) { return v.elevation; }).filter(function (v) { return v != null; })));
      }
      return result;
    });
  }

  /** Wikipedia articles near a point — the "what is this place?" answer. */
  function wiki(point, options) {
    var opts = options || {};
    var pt = MM.geodesy.point(point);
    if (!pt) return Promise.resolve({ error: 'bad-point', articles: [] });
    var radius = Math.min(10000, opts.radiusMetres || 5000);
    var url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*' +
      '&generator=geosearch&ggscoord=' + pt.lat.toFixed(5) + '%7C' + pt.lon.toFixed(5) +
      '&ggsradius=' + radius + '&ggslimit=5&prop=extracts|info&exintro=1&explaintext=1&inprop=url';
    return fetchJson(url, { id: WIKI.id, timeoutMs: WIKI.timeoutMs, minIntervalMs: WIKI.minIntervalMs })
      .then(function (data) {
        var pages = (data && data.query && data.query.pages) || {};
        var articles = Object.keys(pages).map(function (key) {
          var page = pages[key];
          return {
            title: page.title,
            extract: (page.extract || '').replace(/\s+/g, ' ').trim().slice(0, 600),
            url: page.fullurl,
            lat: page.coordinates && page.coordinates[0] ? page.coordinates[0].lat : null,
            lon: page.coordinates && page.coordinates[0] ? page.coordinates[0].lon : null,
            distanceMetres: page.dist == null ? null : page.dist,
          };
        });
        return { provider: WIKI, articles: articles };
      })
      .catch(function (error) {
        return { error: error.message, offline: true, articles: [] };
      });
  }

  /** What the UI prints when it says where an answer came from. */
  function describe() {
    return {
      styles: STYLES.map(function (s) { return { id: s.id, name: s.name, home: 'tiles.openfreemap.org', licence: 'ODbL / ODC-BY (OpenStreetMap)' }; }),
      geocoders: GEOCODERS.map(function (g) { return { id: g.id, name: g.name, home: g.home, licence: g.licence }; }),
      routers: Object.keys(ROUTERS).map(function (mode) {
        return { mode: mode, providers: ROUTERS[mode].map(function (r) { return { id: r.id, name: r.name, licence: r.licence }; }) };
      }),
      pois: { id: POIS.id, name: POIS.name, endpoints: POIS.endpoints, licence: POIS.licence },
      elevation: { id: ELEVATION.id, name: ELEVATION.name, licence: ELEVATION.licence },
      wiki: { id: WIKI.id, name: WIKI.name, licence: WIKI.licence },
      driving: { id: VALHALLA.id, name: VALHALLA.name, home: VALHALLA.home, licence: VALHALLA.licence, note: VALHALLA.note },
      traffic: { id: TRAFFIC.tfl.id, name: TRAFFIC.tfl.name, home: TRAFFIC.tfl.home, licence: TRAFFIC.tfl.licence, coverage: TRAFFIC.tfl.coverage },
      weather: { id: WEATHER.id, name: WEATHER.name, home: WEATHER.home, licence: WEATHER.licence },
    };
  }

  MM.providers = {
    VALHALLA: VALHALLA,
    TRAFFIC: TRAFFIC,
    WEATHER: WEATHER,
    STYLES: STYLES,
    GEOCODERS: GEOCODERS,
    ROUTERS: ROUTERS,
    POIS: POIS,
    POI_CATEGORIES: POI_CATEGORIES,
    ELEVATION: ELEVATION,
    WIKI: WIKI,
    fetchJson: fetchJson,
    loadStyle: loadStyle,
    geocode: geocode,
    reverse: reverse,
    route: route,
    driveRoute: driveRoute,
    decodePolyline: decodePolyline,
    valhallaCosting: valhallaCosting,
    speedLimitWays: speedLimitWays,
    stopsAlong: stopsAlong,
    camerasAlong: camerasAlong,
    trafficAlong: trafficAlong,
    weatherAlong: weatherAlong,
    staticRoadAlerts: staticRoadAlerts,
    samplePolyline: samplePolyline,
    modeKey: modeKey,
    pois: pois,
    elevation: elevation,
    elevationProfile: elevationProfile,
    wiki: wiki,
    describe: describe,
    health: function () { return health; },
    clearCache: function () { cache.clear(); },
  };

  if (typeof module === 'object' && module.exports) module.exports = MM.providers;
})(typeof globalThis !== 'undefined' ? globalThis : this);
