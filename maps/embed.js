/**
 * maps/embed.js — how the other 1,310 tools use the map.
 *
 * Drop one line in a card and you get a real, interactive map:
 *
 *   <script src="maps/embed.js"></script>
 *   <div id="mycard-map" style="height:240px"></div>
 *   <script>
 *     MostUsefulMaps.mount('#mycard-map', { center: [51.8797, -0.4175], zoom: 11 });
 *   </script>
 *
 * …and the maths, with no map at all:
 *
 *   MostUsefulMaps.distance([51.5, -0.12], [48.85, 2.35])   → 343.5 km (WGS84)
 *   MostUsefulMaps.parse('TL 09 21')                        → { lat, lon, kind }
 *   MostUsefulMaps.plusCode(51.8797, -0.4175)               → '9C3XVCH8+…'
 *   MostUsefulMaps.geohash(51.8797, -0.4175, 9)             → 'gcpxnkrvp'
 *   MostUsefulMaps.maidenhead(51.5074, -0.1278)             → 'IO91WM'
 *   MostUsefulMaps.utm(43.6425667, -79.387139)              → '17T 630084 4833439'
 *   MostUsefulMaps.locationCodes(51.8797, -0.4175)          → every code, as rows
 *   MostUsefulMaps.sunTimes(new Date(), 51.5, -0.12)        → sunrise/sunset/twilight
 *
 * Why it is built this way: a card is mounted only when a visitor opens it,
 * and nothing loads until a card asks. The core engine is about
 * 40 KB of plain scripts, the offline map renderer another 20 KB, and the
 * 1 MB MapLibre bundle only if the card explicitly asks for live tiles with
 * `{ live: true }` — and then only when the card is actually on screen.
 *
 * Every instance is self-contained and destroyable, because a card can be
 * swapped out under it at any time.
 */
(function (root) {
  'use strict';

  var BASE = (function () {
    var script = root.document && root.document.currentScript;
    var src = script && script.src;
    if (src) return src.replace(/[^/]*$/, '');
    return 'maps/';
  })();

  var loaded = {};
  function loadScript(url) {
    if (loaded[url]) return loaded[url];
    loaded[url] = new Promise(function (resolve, reject) {
      var script = root.document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { loaded[url] = null; reject(new Error('could not load ' + url)); };
      root.document.head.appendChild(script);
    });
    return loaded[url];
  }

  var CORE = ['core/geodesy.js', 'core/geo.js', 'core/olc.js', 'core/solar.js', 'core/gridref.js', 'core/locators.js', 'core/gazetteer.js'];

  var corePromise = null;
  function ensureCore() {
    if (MMversion()) return Promise.resolve();
    if (corePromise) return corePromise;
    corePromise = loadScript(BASE + 'vendor/topojson-client.min.js').then(function () {
      return Promise.all(CORE.map(function (file) { return loadScript(BASE + file); }));
    }).then(function () {
      if (!root.MM || !root.MM.geodesy) throw new Error('MostUsefulMaps engine failed to initialise');
      // MM exists now: hand it the topology decoder for the offline world map.
      if (root.topojson) root.MM.topojson = root.topojson;
    });
    return corePromise;
  }
  function MMversion() {
    return root.MM && root.MM.geodesy && root.MM.olc && root.MM.gazetteer;
  }

  var mapPromise = null;
  function ensureMapEngine() {
    if (root.MM && root.MM.LocalMap) return ensureCore();
    if (mapPromise) return mapPromise;
    mapPromise = ensureCore()
      .then(function () { return loadScript(BASE + 'localmap.js'); })
      .then(function () { return loadScript(BASE + 'providers.js'); })
      .then(function () {
        if (!root.MM.LocalMap) throw new Error('MostUsefulMaps map renderer failed to load');
      });
    return mapPromise;
  }

  // ------------------------------------------------------------------- data

  var dataCache = {};
  function fetchJson(url) {
    if (dataCache[url]) return dataCache[url];
    dataCache[url] = (root.fetch
      ? root.fetch(url, { credentials: 'omit' }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
        return response.json();
      })
      : Promise.reject(new Error('fetch is unavailable')))
      .catch(function (error) {
        dataCache[url] = null;
        throw error;
      });
    return dataCache[url];
  }

  /** The offline world: country boundaries as GeoJSON (cached after first use). */
  function loadWorld(quality) {
    var file = quality === 'detail' ? 'countries-50m.json' : 'countries-110m.json';
    return ensureCore().then(function () { return fetchJson(BASE + 'data/' + file); })
      .then(function (topology) {
        return root.MM.geo.fromTopology(topology, 'countries');
      });
  }

  function loadCountryFacts() {
    return ensureCore().then(function () { return fetchJson(BASE + 'data/countries.json'); })
      .then(function (data) { return (data && data.countries) || {}; });
  }

  var gazetteerPromise = null;
  function loadGazetteer() {
    if (gazetteerPromise) return gazetteerPromise;
    gazetteerPromise = ensureCore()
      .then(function () {
        return Promise.all([fetchJson(BASE + 'data/gazetteer.json'), loadCountryFacts()]);
      })
      .then(function (results) {
        return root.MM.gazetteer.create(results[0]).setCountries(results[1]);
      })
      .catch(function (error) {
        gazetteerPromise = null;
        throw error;
      });
    return gazetteerPromise;
  }

  // -------------------------------------------------------------- instances

  var instances = [];

  function matches(el, selectorOrElement) {
    if (!selectorOrElement) return null;
    if (typeof selectorOrElement === 'string') return root.document.querySelector(selectorOrElement);
    return selectorOrElement;
  }

  /**
   * mount(target, options) → Promise<instance>
   *
   * options:
   *   center, zoom        where to look (accepts [lat, lon] or {lat, lon})
   *   height, className   styling shortcuts
   *   markers             [{lat, lon, label, colour}]
   *   path                [[lat, lon], …] drawn as a geodesic (curved) line
   *   polygon             [[lat, lon], …] measured area
   *   live                true → also load MapLibre + OpenFreeMap tiles
   *   theme               'dark' | 'light'
   *   cities              show city dots from the offline gazetteer
   *   onPick(point, country)
   *   gmKey               ignored — there are no keys in this engine
   */
  function mount(target, options) {
    var el = matches(root.document, target);
    var opts = options || {};
    if (!el) return Promise.reject(new Error('MostUsefulMaps.mount: no such element'));
    if (el.getAttribute('data-mm-mounted') === 'true' && el.__mostUsefulMaps) {
      return Promise.resolve(el.__mostUsefulMaps);
    }
    // The card owns its own box. `.mm-map` in the product stylesheet means
    // "fill the parent" (absolute inset:0), which is right for the full page
    // and wrong inside a card, where the map is one block of many in a
    // document it does not control.
    if (!el.style.position || el.style.position === 'static') el.style.position = 'relative';
    el.style.overflow = 'hidden';
    if (opts.height && !el.style.height) el.style.height = (typeof opts.height === 'number' ? opts.height + 'px' : opts.height);
    if (!el.style.height) el.style.height = '220px';
    if (opts.className) el.classList.add(opts.className);

    var centre = normaliseCentre(opts.center) || { lat: 20, lon: 0 };
    var instance = {
      element: el,
      ready: false,
      mode: 'local',
      state: { center: centre, zoom: typeof opts.zoom === 'number' ? opts.zoom : 2 },
      map: null,
      destroy: function () {
        if (instance.map && instance.map.destroy) instance.map.destroy();
        if (instance.live && instance.live.destroy) instance.live.destroy();
        el.removeAttribute('data-mm-mounted');
        el.__mostUsefulMaps = null;
        var at = instances.indexOf(instance);
        if (at >= 0) instances.splice(at, 1);
      },
      setCenter: function (center, zoom) {
        var point = normaliseCentre(center);
        if (!point) return instance;
        instance.state.center = point;
        if (typeof zoom === 'number') instance.state.zoom = zoom;
        if (instance.map) instance.map.setView(point, instance.state.zoom, { silent: true });
        if (instance.live && instance.live.map) instance.live.map.jumpTo({ center: [point.lon, point.lat], zoom: instance.state.zoom });
        return instance;
      },
      setMarkers: function (markers) {
        instance.state.markers = markers || [];
        if (instance.map) instance.map.setMarkers(instance.state.markers.map(function (m) {
          var p = normaliseCentre(m);
          return p ? { lat: p.lat, lon: p.lon, label: m.label || m.name, colour: m.colour } : null;
        }).filter(Boolean));
        return instance;
      },
      setPath: function (path) {
        instance.state.path = (path || []).map(function (p) {
          var point = normaliseCentre(p);
          return point ? [point.lon, point.lat] : null;
        }).filter(Boolean);
        if (instance.map) instance.map.setPath(instance.state.path);
        return instance;
      },
      on: function (event, handler) {
        instance.handlers = instance.handlers || {};
        (instance.handlers[event] = instance.handlers[event] || []).push(handler);
        return instance;
      },
      openInFullMap: function (extra) { return openInFullMap(Object.assign({}, instance.state, extra || {})); },
    };

    el.setAttribute('data-mm-mounted', 'true');
    el.__mostUsefulMaps = instance;
    instances.push(instance);

    var wantCities = opts.cities !== false;
    return ensureMapEngine().then(function () {
      return Promise.all([loadWorld(opts.quality), wantCities ? loadGazetteer() : Promise.resolve(null)]);
    }).then(function (results) {
      var countries = results[0];
      var gazetteer = results[1];
      instance.map = new root.MM.LocalMap(el, {
        center: instance.state.center,
        zoom: instance.state.zoom,
        theme: opts.theme === 'light' ? 'light' : 'dark',
        countries: countries,
        cities: gazetteer ? gazetteer.cities : null,
        markers: (opts.markers || []).map(function (m) {
          var p = normaliseCentre(m);
          return p ? { lat: p.lat, lon: p.lon, label: m.label || m.name, colour: m.colour } : null;
        }).filter(Boolean),
        path: (opts.path || []).map(function (p) {
          var point = normaliseCentre(p);
          return point ? [point.lon, point.lat] : null;
        }).filter(Boolean),
        interactive: opts.interactive !== false,
        scaleBar: opts.scaleBar !== false,
        units: opts.units,
        graticule: opts.graticule !== false,
      });
      instance.map.on('click', function (payload) {
        instance.state.lastPick = payload;
        if (opts.onPick) opts.onPick(payload.point, payload.country, instance);
      });
      instance.map.on('moveend', function (view) {
        instance.state.center = view.center;
        instance.state.zoom = view.zoom;
      });
      instance.ready = true;
      if (opts.onReady) opts.onReady(instance);
      if (opts.live) upgradeToLive(instance, opts);
      return instance;
    });
  }

  /** Swap in real vector tiles on top of the offline renderer, if we can. */
  function upgradeToLive(instance, opts) {
    var run = function () {
      if (instance.destroyed) return;
      ensureCore()
        .then(function () { return loadScript(BASE + 'livemap.js'); })
        .then(function () {
          var preferences = opts.styleOrder || root.MM.providers.STYLES.map(function (s) { return s.id; });
          var preferred = opts.style || preferences[0];
          return root.MM.providers.loadStyle(preferred).then(function (style) {
            return root.MM.livemap.create(instance.element, {
              center: instance.state.center,
              zoom: instance.state.zoom,
              styleUrl: style.url,
              interactive: opts.interactive !== false,
              units: opts.units,
              globe: false,
              onReady: function (handle) { instance.mode = 'live'; instance.live = handle; if (opts.onLive) opts.onLive(handle); },
              onError: function (reason) { instance.liveError = reason; if (opts.onLiveError) opts.onLiveError(reason); },
              onClick: opts.onPick ? function (point) { opts.onPick(point, null, instance); } : null,
            });
          });
        })
        .catch(function (error) {
          instance.liveError = error.message;
          if (opts.onLiveError) opts.onLiveError(error.message);
        });
    };
    if (opts.liveWhenVisible === false || typeof root.IntersectionObserver !== 'function') {
      run();
      return;
    }
    // Only pay for MapLibre when the card is on screen.
    var observer = new root.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i += 1) {
        if (entries[i].isIntersecting) {
          observer.disconnect();
          run();
          return;
        }
      }
    }, { rootMargin: '200px' });
    observer.observe(instance.element);
  }

  function normaliseCentre(value) {
    if (!value) return null;
    if (Array.isArray(value) && value.length >= 2) {
      // Accepts [lat, lon] (what people write) and [lon, lat] (GeoJSON).
      // Anything outside ±90 in the first slot must be GeoJSON order.
      var a = Number(value[0]), b = Number(value[1]);
      if (!isFinite(a) || !isFinite(b)) return null;
      if (Math.abs(a) > 90 && Math.abs(b) <= 90) return { lat: b, lon: a };
      return { lat: a, lon: b };
    }
    if (typeof value === 'object') {
      var lat = Number(value.lat != null ? value.lat : value.latitude);
      var lon = Number(value.lon != null ? value.lon : value.lng != null ? value.lng : value.longitude);
      if (isFinite(lat) && isFinite(lon)) return { lat: lat, lon: lon };
    }
    return null;
  }

  /** A shareable MostUsefulMaps URL for a place, a route or a measurement. */
  function openInFullMap(state) {
    var s = state || {};
    var params = [];
    var centre = normaliseCentre(s.center);
    if (centre) {
      params.push('lat=' + centre.lat.toFixed(5), 'lon=' + centre.lon.toFixed(5));
    }
    if (typeof s.zoom === 'number') params.push('z=' + s.zoom.toFixed(2));
    if (s.q) params.push('q=' + encodeURIComponent(s.q));
    if (s.from && s.to) {
      var from = normaliseCentre(s.from), to = normaliseCentre(s.to);
      if (from && to) {
        params.push('from=' + from.lat.toFixed(5) + ',' + from.lon.toFixed(5));
        params.push('to=' + to.lat.toFixed(5) + ',' + to.lon.toFixed(5));
        if (s.mode) params.push('mode=' + encodeURIComponent(s.mode));
      }
    }
    if (s.open) params.push('panel=' + encodeURIComponent(s.open));
    return 'maps.html' + (params.length ? '?' + params.join('&') : '');
  }

  // ----------------------------------------------------------- public API

  var api = {
    version: '1.0.0',
    base: BASE,
    mount: mount,
    ready: function () { return ensureMapEngine(); },
    loadWorld: loadWorld,
    loadGazetteer: loadGazetteer,
    loadCountryFacts: loadCountryFacts,
    openInFullMap: openInFullMap,
    instances: instances,
    destroyAll: function () { instances.slice().forEach(function (i) { i.destroy(); }); },

    /** Maths, for cards that want the engine without a map. */
    distance: function (a, b) {
      return ensureCore().then(function () { return root.MM.geodesy.distanceKm(a, b); });
    },
    measure: function (a, b) {
      return ensureCore().then(function () { return root.MM.geodesy.measure(a, b); });
    },
    pathLength: function (points) {
      return ensureCore().then(function () { return root.MM.geodesy.pathLengthKm(points); });
    },
    area: function (ring) {
      return ensureCore().then(function () { return root.MM.geodesy.polygonAreaM2(ring); });
    },
    plusCode: function (lat, lon) {
      return ensureCore().then(function () { return root.MM.olc.encode(lat, lon); });
    },
    /** The OS grid reference as text (like plusCode), or null elsewhere. */
    gridReference: function (lat, lon) {
      return ensureCore().then(function () {
        if (!root.MM.gridref.coveredBy(lat, lon)) return null;
        return root.MM.gridref.fromWgs84(lat, lon, 5).gridRef;
      });
    },
    /** The geohash as text, to whatever depth the caller wants (1–12). */
    geohash: function (lat, lon, precision) {
      return ensureCore().then(function () { return root.MM.locators.geohash(lat, lon, precision); });
    },
    /** The Maidenhead locator as text — 2 to 5 pairs, three by default. */
    maidenhead: function (lat, lon, pairs) {
      return ensureCore().then(function () { return root.MM.locators.maidenhead(lat, lon, pairs); });
    },
    /** The UTM string as text: '17T 630084 4833438'. */
    utm: function (lat, lon) {
      return ensureCore().then(function () { return root.MM.locators.utmString(lat, lon); });
    },
    /** Every code at once, as rows a card can render: { id, label, value, note }. */
    locationCodes: function (lat, lon, options) {
      return ensureCore().then(function () { return root.MM.locators.formats(lat, lon, options); });
    },
    /** The same set as one block of text, ready for a clipboard. */
    describeLocation: function (lat, lon, options) {
      return ensureCore().then(function () { return root.MM.locators.describe(lat, lon, options); });
    },
    sunTimes: function (date, lat, lon) {
      return ensureCore().then(function () { return root.MM.solar.sunTimes(date, lat, lon); });
    },
    /** One call that recognises coordinates, Plus Codes, grid refs and names. */
    parse: function (text, options) {
      var opts = options || {};
      return ensureCore().then(function () {
        if (!opts.gazetteer) return root.MM.gazetteer.interpret(text, opts);
        return loadGazetteer().then(function (gazetteer) {
          return root.MM.gazetteer.interpret(text, Object.assign({}, opts, { gazetteer: gazetteer }));
        });
      });
    },
    searchPlaces: function (query, options) {
      return loadGazetteer().then(function (gazetteer) {
        return gazetteer.search(query, options);
      });
    },
  };

  if (root.MostUsefulMaps && root.MostUsefulMaps.version) {
    // Already present (two cards, one page): keep the first one.
    return;
  }
  root.MostUsefulMaps = api;

  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
