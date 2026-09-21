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
    };
  }

  MM.providers = {
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
