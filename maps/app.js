/**
 * maps/app.js — MostUsefulMaps, the page.
 *
 * The engine (maps/core/*) is offline by construction; this file is the
 * product around it: search, place details, routing, measurement, nearby
 * places, sun and time, deep links, and the honest reporting of where each
 * answer came from.
 *
 * Rules this file follows on purpose:
 *   - Nothing is fetched until the visitor does something that needs it.
 *   - Every third-party answer is labelled with the service that supplied it.
 *   - Every failure degrades to the offline answer and says so, rather than
 *     showing a spinner forever or an empty panel.
 *   - Fetched text is never interpolated into innerHTML; it goes through
 *     textContent (see CONSTRAINTS.md: no untrusted input into innerHTML).
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var MM = null;

  var PANELS = ['place', 'route', 'drive', 'measure', 'nearby', 'info'];

  var state = {
    center: { lat: 51.8797, lon: -0.4175 },
    zoom: 3,
    units: 'metric',
    theme: 'dark',
    styleId: 'fiord',
    live: false,
    liveStatus: 'waiting',
    picked: null,
    markers: [],
    measure: [],
    measuring: false,
    route: null,
    routePreference: 'fastest',
    routeAvoid: { motorways: false, tolls: false, ferries: false, unpaved: false },
    nearby: [],
    place: null,
    placeOrigin: null,
    offline: !root.navigator || root.navigator.onLine === false,
  };

  var els = {};
  var map = null;
  var live = null;
  var gazetteer = null;
  var worldDetailLoaded = false;
  var searchTimer = null;
  var suggestIndex = -1;
  var suggestions = [];
  var searchRequestId = 0;
  var lastRoutePoints = null;

  /**
   * The driving companion's own state. Kept apart from `state` because most of
   * it is about one drive in progress: the vehicle, the speed-limit profile, the
   * live layers that have answered, and the guidance session when it is running.
   */
  var drive = {
    prefs: null,
    route: null,
    from: null,
    to: null,
    limits: null,
    layers: { traffic: null, weather: null, stops: null, cameras: null },
    session: null,
    watchId: null,
    tapToMove: false,
    navigationMode: null,
    markers: [],
    overlays: { traffic: true, weather: true, stops: true, cameras: true, limits: true },
    replanning: false,
    // Panel nodes this module creates itself. They are kept here rather than
    // looked up by id, so a re-render can never pick up a stale copy.
    nodes: { cost: null, sections: null, bodies: {} },
    stopsOrdered: null,
    consumeFix: null,
  };

  var DRIVE_PREFS_KEY = 'mum-drive-prefs';

  // ------------------------------------------------------------------ utils

  function $(id) { return doc.getElementById(id); }

  /**
   * The OS grid reference as text, or null outside the National Grid.
   * MM.gridref.fromWgs84() answers with the whole working — easting, northing,
   * the OSGB36 point, the datum shift — and the grid reference is the
   * `gridRef` field of that. Reading it through one helper is what keeps
   * "[object Object]" out of the interface.
   */
  function gridRefText(lat, lon) {
    if (!MM.gridref.coveredBy(lat, lon)) return null;
    return MM.gridref.fromWgs84(lat, lon, 5).gridRef;
  }

  function make(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function fmtKm(km) {
    if (km == null || !isFinite(km)) return '—';
    if (state.units === 'imperial') {
      var miles = km * 0.621371;
      return miles < 10 ? miles.toFixed(2) + ' mi' : Math.round(miles).toLocaleString('en-GB') + ' mi';
    }
    return km < 10 ? km.toFixed(2) + ' km' : Math.round(km).toLocaleString('en-GB') + ' km';
  }

  function fmtMetres(metres) {
    if (state.units === 'imperial') return Math.round(metres * 3.28084).toLocaleString('en-GB') + ' ft';
    return Math.round(metres).toLocaleString('en-GB') + ' m';
  }

  function fmtDuration(minutes) {
    if (minutes == null || !isFinite(minutes)) return '—';
    var total = Math.round(minutes);
    var hours = Math.floor(total / 60);
    var mins = total % 60;
    if (!hours) return mins + ' min';
    return hours + ' h ' + (mins < 10 ? '0' + mins : mins) + ' min';
  }

  function fmtTime(date) {
    if (!date) return '—';
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function toast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { els.toast.classList.remove('show'); }, 3200);
  }

  function copyText(text, label) {
    var done = function () { toast((label || 'Copied') + ' to the clipboard'); };
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(text).then(done, function () { toast('Copy failed — select and copy manually'); });
      return;
    }
    var input = doc.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', 'readonly');
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    doc.body.appendChild(input);
    input.select();
    try { doc.execCommand('copy'); done(); } catch (error) { toast('Copy failed'); }
    doc.body.removeChild(input);
  }

  function addCopyButton(parent, text, label) {
    var button = make('button', 'mm-copy', 'copy');
    button.type = 'button';
    button.setAttribute('aria-label', 'Copy ' + (label || 'value'));
    button.addEventListener('click', function () { copyText(text, label); });
    parent.appendChild(button);
    return button;
  }

  function kvRow(dl, term, value, copyLabel) {
    dl.appendChild(make('dt', null, term));
    var dd = make('dd', null, value);
    if (copyLabel) addCopyButton(dd, value, copyLabel);
    dl.appendChild(dd);
    return dd;
  }

  function statCard(label, value, sub) {
    var box = make('div', 'mm-stat');
    box.appendChild(make('div', 'mm-stat-label', label));
    box.appendChild(make('div', 'mm-stat-value', value));
    if (sub) box.appendChild(make('div', 'mm-stat-sub', sub));
    return box;
  }

  // ------------------------------------------------------------------- boot

  var booted = false;

  function boot() {
    // Deferred scripts run once, but a page (or a card) can load this file
    // more than once: booting twice would double every listener and make
    // every toggle a no-op.
    if (booted) return;
    booted = true;
    MM = root.MM;
    if (!MM || !MM.geodesy || !MM.LocalMap) { booted = false; return; }

    els = {
      wrap: $('mm-map-wrap'), map: $('mm-map'), status: $('mm-status'), coord: $('mm-coord'),
      attrib: $('mm-attrib'), toast: $('mm-toast'), rail: $('mm-rail'), tabs: $('mm-tabs'),
      search: $('mm-search'), suggest: $('mm-suggest'), form: $('mm-search-form'),
      place: $('mm-place-body'), route: $('mm-route-body'), measure: $('mm-measure-body'),
      nearby: $('mm-nearby-body'), info: $('mm-info-body'), sun: $('mm-sun'),
      fromField: $('mm-route-from'), toField: $('mm-route-to'), routeHint: $('mm-route-hint'), radius: $('mm-radius'),
      nearbyChips: $('mm-nearby-chips'),
      styleSelect: $('mm-style'), unitsSelect: $('mm-units'), themeButton: $('mm-theme-toggle'),
      measureToggle: $('mm-measure-toggle'), clearButton: $('mm-clear'), shareButton: $('mm-share'),
      locateButton: $('mm-locate'), zoomIn: $('mm-zoom-in'), zoomOut: $('mm-zoom-out'), railToggle: $('mm-rail-toggle'),
      driveBody: $('mm-drive-body'), driveForm: $('mm-drive-form'), driveFrom: $('mm-drive-from'), driveTo: $('mm-drive-to'),
      driveVehicle: $('mm-drive-vehicle'), driveVehicleNote: $('mm-drive-vehicle-note'), driveDims: $('mm-drive-dims'),
      driveHeight: $('mm-drive-height'), driveWidth: $('mm-drive-width'), driveLength: $('mm-drive-length'), driveWeight: $('mm-drive-weight'),
      driveConsumption: $('mm-drive-consumption'), drivePrice: $('mm-drive-price'), driveBreak: $('mm-drive-break'),
      driveSources: $('mm-drive-sources'), driveLocate: $('mm-drive-locate'), driveSwap: $('mm-drive-swap'), driveForget: $('mm-drive-forget'),
      nav: $('mm-nav'), navMode: $('mm-nav-mode'), navDistance: $('mm-nav-distance'), navInstruction: $('mm-nav-instruction'), navIcon: $('mm-nav-icon'),
      navLimitValue: $('mm-nav-limit-value'), navLimitUnit: $('mm-nav-limit-unit'),
      navCurrentValue: $('mm-nav-current-value'), navCurrentUnit: $('mm-nav-current-unit'), navCurrentBox: $('mm-nav-current-box'),
      navProgress: $('mm-nav-progress'), navRemaining: $('mm-nav-remaining'), navEta: $('mm-nav-eta'),
      navReplan: $('mm-nav-replan'), navStop: $('mm-nav-stop'), navAlert: $('mm-nav-alert'),
    };

    if (root.topojson) MM.topojson = root.topojson;
    applyUrlState();
    buildMap();
    buildStatusChips();
    buildNearbyChips();
    buildStaticCopy();
    bindTabs();
    bindTopbar();
    bindRoute();
    bindDrive();
    bindMeasure();
    bindNearby();
    bindInfo();
    bindKeyboard();
    bindConnectivity();

    // The gazetteer is 800 KB and only matters the moment someone searches or
    // zooms into a country, so it loads after the map has painted.
    var idle = root.requestIdleCallback || function (fn) { return setTimeout(fn, 1200); };
    idle(function () { ensureGazetteer().catch(function () {}); });

    updateHud();
  }

  function buildMap() {
    var loaded = loadJson('data/countries-110m.json');
    map = new MM.LocalMap(els.map, {
      center: state.center,
      zoom: state.zoom,
      theme: state.theme,
      countries: loaded,
      interactive: true,
      units: state.units,
    });
    map.setTheme(state.theme);
    map.on('click', onMapClick);
    map.on('move', function (view) {
      if (view.hover) updateCoordReadout(view);
    });
    map.on('moveend', function (view) {
      state.center = view.center;
      state.zoom = view.zoom;
      updateHud();
      syncUrl();
      maybeLoadDetail();
    });
    map.on('zoom', function (view) {
      state.zoom = view.zoom;
      updateHud();
      maybeLoadDetail();
    });

    els.railToggle.addEventListener('click', function () {
      doc.body.classList.toggle('rail-hidden');
      els.railToggle.setAttribute('aria-expanded', String(!doc.body.classList.contains('rail-hidden')));
    });

    // Keep the map controls useful even when the live renderer is still
    // loading. The offline canvas is the source of truth, so these controls
    // work on a train, behind a firewall, and on older phones too.
    function setZoom(delta) {
      var view = map.getView();
      map.setView(view.center, view.zoom + delta);
      if (live && live.map) {
        try { live.map.easeTo({ center: [view.center.lon, view.center.lat], zoom: view.zoom + delta, duration: 220 }); } catch (error) {}
      }
    }
    if (els.zoomIn) els.zoomIn.addEventListener('click', function () { setZoom(1); });
    if (els.zoomOut) els.zoomOut.addEventListener('click', function () { setZoom(-1); });

    startLive();
  }

  /** The live vector-tile map, layered on top of the offline one. */
  function startLive() {
    if (state.offline || !root.MM.livemap) {
      state.liveStatus = 'offline';
      updateStatusChips();
      return;
    }
    if (!root.MM.livemap.webglAvailable()) {
      state.liveStatus = 'no-webgl';
      updateStatusChips();
      return;
    }
    MM.providers.loadStyle(state.styleId).then(function (style) {
      state.styleId = style.id;
      if (els.styleSelect) els.styleSelect.value = style.id;
      live = MM.livemap.create(els.wrap, {
        center: state.center,
        zoom: state.zoom,
        styleUrl: style.url,
        units: state.units,
        globe: false,
        onReady: function () {
          state.live = true;
          state.liveStatus = 'live';
          updateStatusChips();
          updateAttribution();
        },
        onError: function () {
          state.liveStatus = 'failed';
          state.live = false;
          updateStatusChips();
        },
        onMove: function () {
          if (!live || !live.map) return;
          var c = live.map.getCenter();
          map.setView({ lat: c.lat, lon: c.lng }, live.map.getZoom(), { silent: true });
          state.center = { lat: c.lat, lon: c.lng };
          state.zoom = live.map.getZoom();
          updateHud();
          syncUrl();
        },
        onClick: function (point) { onMapClick({ point: point, country: null }); },
      });
    }).catch(function () {
      state.liveStatus = 'failed';
      updateStatusChips();
    });
  }

  function loadJson(relativePath) {
    var xhr = new XMLHttpRequest();
    var url = 'maps/' + relativePath;
    xhr.open('GET', url, false); // synchronous on purpose: one 108 KB file that
    // must exist before the first frame; the alternative is a blank map.
    try {
      xhr.send(null);
      if (xhr.status === 200 || xhr.status === 0) return JSON.parse(xhr.responseText);
    } catch (error) { /* fall through to the empty world */ }
    return { type: 'FeatureCollection', features: [] };
  }

  function maybeLoadDetail() {
    if (worldDetailLoaded || state.zoom < 4.5) return;
    worldDetailLoaded = true;
    try {
      var detail = loadJson('data/countries-50m.json');
      if (detail && detail.objects) {
        var collection = MM.geo.fromTopology(detail, 'countries');
        if (collection && collection.features && collection.features.length) {
          map.setData({ countries: collection });
        }
      }
    } catch (error) { worldDetailLoaded = false; }
  }

  // ------------------------------------------------------------------ data

  function ensureGazetteer() {
    if (gazetteer) return Promise.resolve(gazetteer);
    if (ensureGazetteer._promise) return ensureGazetteer._promise;
    ensureGazetteer._promise = Promise.all([
      fetchJson('maps/data/gazetteer.json'),
      fetchJson('maps/data/countries.json'),
    ]).then(function (results) {
      gazetteer = MM.gazetteer.create(results[0]).setCountries(results[1].countries);
      if (map) map.setData({ cities: gazetteer.cities });
      return gazetteer;
    }).catch(function (error) {
      ensureGazetteer._promise = null;
      throw error;
    });
    return ensureGazetteer._promise;
  }

  function fetchJson(url) {
    return fetch(url, { credentials: 'omit' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
  }

  function countryFacts(cc) {
    if (!gazetteer || !gazetteer.countries || !gazetteer.countries[cc]) return null;
    return gazetteer.countries[cc];
  }

  function timezoneAt(point) {
    if (typeof root.tzlookup !== 'function') return null;
    try { return root.tzlookup(point.lat, point.lon); } catch (error) { return null; }
  }

  function localTimeAt(point) {
    var zone = timezoneAt(point);
    if (!zone) return null;
    try {
      return {
        zone: zone,
        time: new Date().toLocaleTimeString('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }),
        offset: new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'short' }).format(new Date()),
      };
    } catch (error) { return { zone: zone }; }
  }

  // ---------------------------------------------------------------- search

  function bindTopbar() {
    els.form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (suggestions.length) selectPlace(suggestions[Math.max(0, suggestIndex)]);
      else runSearch(els.search.value, true);
    });
    els.search.addEventListener('input', function () {
      clearTimeout(searchTimer);
      var value = els.search.value.trim();
      if (!value) { searchRequestId += 1; closeSuggest(); return; }
      searchTimer = setTimeout(function () { runSearch(value, false); }, 180);
    });
    els.search.addEventListener('focus', function () {
      if (els.search.value.trim() && suggestions.length) renderSuggest();
    });
    els.search.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && suggestions.length) {
        event.preventDefault();
        selectPlace(suggestions[Math.max(0, suggestIndex)]);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        suggestIndex += event.key === 'ArrowDown' ? 1 : -1;
        suggestIndex = Math.max(0, Math.min(suggestions.length - 1, suggestIndex));
        renderSuggest();
      } else if (event.key === 'Escape') {
        closeSuggest();
      }
    });
    doc.addEventListener('click', function (event) {
      if (!els.suggest.contains(event.target) && event.target !== els.search) closeSuggest();
    });
    var clearButton = $('mm-search-clear');
    if (clearButton) {
      clearButton.addEventListener('click', function () {
        els.search.value = '';
        closeSuggest();
        els.search.focus();
      });
    }
    els.styleSelect.addEventListener('change', function () {
      state.styleId = els.styleSelect.value;
      if (live) {
        MM.providers.loadStyle(state.styleId).then(function (style) {
          var wanted = style.url;
          if (live.setStyle) live.setStyle(wanted);
          setTimeout(function () {
            if (live && live.map) live.map.setStyle(wanted);
            updateAttribution();
          }, 60);
        });
      }
      toast('Style: ' + els.styleSelect.options[els.styleSelect.selectedIndex].text);
    });
    els.unitsSelect.addEventListener('change', function () {
      state.units = els.unitsSelect.value;
      map.setUnits(state.units);
      renderMeasure();
      if (state.route) renderRoute(state.route);
      updateHud();
    });
    els.themeButton.addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      doc.body.classList.toggle('light', state.theme === 'light');
      map.setTheme(state.theme);
      var themeIcon = els.themeButton.querySelector('span');
      if (themeIcon) themeIcon.textContent = state.theme === 'dark' ? '◐' : '☼';
      els.themeButton.setAttribute('aria-label', state.theme === 'dark' ? 'Switch to light map' : 'Switch to dark map');
    });
    els.shareButton.addEventListener('click', function () {
      copyText(shareUrl(), 'Map link');
    });
    els.locateButton.addEventListener('click', locate);
  }

  function shareUrl() {
    var base = root.location.origin + root.location.pathname;
    var params = ['lat=' + state.center.lat.toFixed(5), 'lon=' + state.center.lon.toFixed(5), 'z=' + state.zoom.toFixed(2)];
    if (state.panel) params.push('panel=' + encodeURIComponent(state.panel));
    if (state.units !== 'metric') params.push('units=' + encodeURIComponent(state.units));
    if (state.styleId !== 'fiord') params.push('style=' + encodeURIComponent(state.styleId));
    if (state.route && lastRoutePoints) {
      params.push('from=' + lastRoutePoints.from.lat.toFixed(5) + ',' + lastRoutePoints.from.lon.toFixed(5));
      params.push('to=' + lastRoutePoints.to.lat.toFixed(5) + ',' + lastRoutePoints.to.lon.toFixed(5));
      params.push('mode=' + (state.route.mode || state.routeMode || 'car'));
      params.push('pref=' + encodeURIComponent(state.routePreference || drive.prefs.routePreference || 'fastest'));
      var sharedAvoids = drive.route && drive.route === state.route
        ? ['motorways', 'tolls', 'ferries', 'unpaved'].filter(function (key) { return !!drive.prefs['avoid' + key.charAt(0).toUpperCase() + key.slice(1)]; })
        : selectedRouteAvoids();
      if (sharedAvoids.length) params.push('avoid=' + encodeURIComponent(sharedAvoids.join(',')));
      if (drive.prefs && drive.prefs.vehicle && drive.prefs.vehicle !== 'car') params.push('v=' + drive.prefs.vehicle);
    }
    return base + '?' + params.join('&');
  }

  function syncUrl() {
    if (!root.history || !root.history.replaceState) return;
    clearTimeout(syncUrl._timer);
    syncUrl._timer = setTimeout(function () {
      root.history.replaceState(null, '', shareUrl());
    }, 500);
  }

  function applyUrlState() {
    var params = new URLSearchParams(root.location.search);
    var lat = parseFloat(params.get('lat'));
    var lon = parseFloat(params.get('lon'));
    if (isFinite(lat) && isFinite(lon) && MM.geodesy.validLat(lat) && MM.geodesy.validLon(lon)) {
      state.center = { lat: lat, lon: lon };
    }
    var zoom = parseFloat(params.get('z'));
    if (isFinite(zoom)) state.zoom = Math.max(0, Math.min(18, zoom));
    var units = params.get('units');
    if (units === 'imperial' || units === 'metric') state.units = units;
    var style = params.get('style');
    if (style) state.styleId = style;
    var preference = params.get('pref');
    if (preference === 'fastest' || preference === 'shortest' || preference === 'quiet') state.routePreference = preference;
    var sharedAvoid = params.get('avoid');
    if (sharedAvoid) sharedAvoid.split(',').forEach(function (key) { if (Object.prototype.hasOwnProperty.call(state.routeAvoid, key)) state.routeAvoid[key] = true; });
    var panel = params.get('panel');
    if (panel && PANELS.indexOf(panel) >= 0) state.panel = panel;
    state.pendingQuery = params.get('q') || null;
    var from = params.get('from'), to = params.get('to');
    if (from && to) state.pendingRoute = { from: from, to: to, mode: params.get('mode') || 'car' };
    var vehicle = params.get('v');
    if ((vehicle || preference) && MM.speed) {
      loadDrivePrefs();
      if (vehicle) {
        var known = MM.speed.VEHICLES.some(function (entry) { return entry.id === vehicle; });
        if (known) drive.prefs.vehicle = vehicle;
      }
      if (preference === 'fastest' || preference === 'shortest' || preference === 'quiet') drive.prefs.routePreference = preference;
      saveDrivePrefs();
    }
  }

  /** Offline matches first (instant), live geocoder results when they arrive. */
  function runSearch(query, jump) {
    var text = query.trim();
    if (!text) return;
    var requestId = ++searchRequestId;
    suggestIndex = -1;
    var local = [];
    var interpretation = null;
    try { interpretation = MM.gazetteer.interpret(text, { gazetteer: null }); } catch (error) { interpretation = null; }

    if (interpretation && interpretation.kind !== 'place' && interpretation.kind !== 'unknown') {
      selectPlace({
        name: interpretation.label, detail: 'Read from what you typed', kind: interpretation.kind,
        lat: interpretation.point.lat, lon: interpretation.point.lon, offline: true,
      });
      return;
    }

    ensureGazetteer().then(function (gaz) {
      if (requestId !== searchRequestId) return;
      local = gaz.search(text, { limit: 6, near: state.center });
      suggestions = local.map(function (row) {
        return { name: row.name, detail: row.country, lat: row.lat, lon: row.lon, kind: 'place', pop: row.pop, offline: true };
      });
      renderSuggest();
      if (jump && local.length) { selectPlace(suggestions[0]); return; }
    }).catch(function () {});

    if (state.offline) return;
    MM.providers.geocode(text, { near: state.center }).then(function (result) {
      if (requestId !== searchRequestId) return;
      if (!result.results || !result.results.length) {
        if (!suggestions.length) toast('No match for “' + text + '”');
        return;
      }
      var online = result.results.map(function (row) {
        return { name: row.name, detail: row.detail, lat: row.lat, lon: row.lon, kind: row.kind, source: result.provider.name };
      });
      suggestions = online.concat(suggestions.filter(function (local_) {
        return !online.some(function (o) {
          return MM.geodesy.distanceKm(o, local_) < 1;
        });
      })).slice(0, 9);
      renderSuggest();
    });
  }

  function renderSuggest() {
    clear(els.suggest);
    if (!suggestions.length) {
      els.suggest.hidden = true;
      els.search.setAttribute('aria-expanded', 'false');
      return;
    }
    els.suggest.hidden = false;
    els.search.setAttribute('aria-expanded', 'true');
    suggestions.forEach(function (row, index) {
      var li = make('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(index === suggestIndex));
      li.appendChild(make('span', 'mm-suggest-kind', row.kind === 'plus-code' ? '🔢' : row.kind === 'coordinates' ? '📍' : row.kind === 'grid-reference' ? '🗺️' : '🏙️'));
      var body = make('span');
      body.appendChild(make('span', 'mm-suggest-name', row.name));
      if (row.detail) body.appendChild(make('span', 'mm-suggest-detail', row.detail));
      li.appendChild(body);
      li.appendChild(make('span', 'mm-suggest-where', row.source ? row.source : (row.pop ? Math.round(row.pop / 1000) + 'k people' : '')));
      li.addEventListener('click', function () { selectPlace(row); });
      els.suggest.appendChild(li);
    });
  }

  function closeSuggest() {
    suggestions = [];
    suggestIndex = -1;
    els.suggest.hidden = true;
    if (els.search) els.search.setAttribute('aria-expanded', 'false');
  }

  // ------------------------------------------------------------- place card

  var RECENT_PLACES_KEY = 'mum-recent-places';

  function readRecentPlaces() {
    try {
      var stored = root.localStorage && root.localStorage.getItem(RECENT_PLACES_KEY);
      var parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter(function (place) {
        return place && place.name && isFinite(place.lat) && isFinite(place.lon);
      }).slice(0, 6) : [];
    } catch (error) { return []; }
  }

  function rememberPlace(row) {
    if (!row || !row.name || !isFinite(row.lat) || !isFinite(row.lon)) return;
    var next = [{ name: row.name, detail: row.detail || '', lat: row.lat, lon: row.lon, country: row.country || null }];
    readRecentPlaces().forEach(function (place) {
      if (MM.geodesy.distanceKm(place, row) > 0.5) next.push(place);
    });
    try {
      if (root.localStorage) root.localStorage.setItem(RECENT_PLACES_KEY, JSON.stringify(next.slice(0, 6)));
    } catch (error) { /* private mode or a full store is still a fine map */ }
  }

  function clearRecentPlaces() {
    try {
      if (root.localStorage) root.localStorage.removeItem(RECENT_PLACES_KEY);
    } catch (error) { /* a blocked store is already effectively clear */ }
    renderPlace();
    toast('Recent places cleared');
  }

  function selectPlace(row) {
    closeSuggest();
    doc.body.classList.add('mm-has-map-interaction');
    rememberPlace(row);
    state.placeOrigin = { lat: state.center.lat, lon: state.center.lon };
    state.place = row;
    els.search.value = row.name;
    focusPoint({ lat: row.lat, lon: row.lon }, row.zoom || Math.max(state.zoom, 12));
    state.markers = [{ lat: row.lat, lon: row.lon, label: row.name, colour: '#ffd400' }];
    map.setMarkers(state.markers);
    if (live && live.map) {
      if (live.map.getSource && live.map.getSource('mm-picked')) {
        live.map.getSource('mm-picked').setData(pointFeature(row.lat, row.lon));
      } else if (MM.providers && root.maplibregl) {
        try {
          live.map.addSource('mm-picked', { type: 'geojson', data: pointFeature(row.lat, row.lon) });
          live.map.addLayer({ id: 'mm-picked-layer', type: 'circle', source: 'mm-picked', paint: { 'circle-radius': 7, 'circle-color': '#ffd400', 'circle-stroke-color': '#0a0f14', 'circle-stroke-width': 2 } });
        } catch (error) { /* style may be mid-reload */ }
      }
    }
    showPanel('place');
    renderPlace();
  }

  function pointFeature(lat, lon) {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} };
  }

  function focusPoint(point, zoom) {
    state.center = point;
    map.setView(point, zoom);
    if (live && live.map) live.map.jumpTo({ center: [point.lon, point.lat], zoom: zoom });
    updateHud();
  }

  function renderPlace() {
    var body = els.place;
    clear(body);
    var row = state.place;
    if (!row) {
      var welcome = make('div', 'mm-welcome');
      welcome.appendChild(make('span', 'mm-eyebrow', 'A calmer way to navigate'));
      welcome.appendChild(make('h3', null, 'Where are you going?'));
      welcome.appendChild(make('p', 'mm-welcome-copy', 'Search for a place, tap the map, or start with a shortcut. No account, no ads, and the useful maths works offline.'));

      var quick = make('div', 'mm-quick-actions');
      var quickItems = [
        ['route', '↗', 'Directions', 'Plan a journey'],
        ['nearby', '⌖', 'Find nearby', 'Places around here'],
        ['measure', '⌁', 'Measure', 'Distance or area'],
        ['locate', '⌾', 'Use my location', 'Stay on this device'],
      ];
      quickItems.forEach(function (item) {
        var button = make('button', 'mm-quick-action');
        button.type = 'button';
        button.setAttribute('data-mm-quick-action', item[0]);
        button.appendChild(make('span', 'mm-quick-icon', item[1]));
        var copy = make('span', 'mm-quick-copy');
        copy.appendChild(make('b', null, item[2]));
        copy.appendChild(make('small', null, item[3]));
        button.appendChild(copy);
        button.addEventListener('click', function () {
          if (item[0] === 'locate') locate();
          else if (item[0] === 'measure') els.measureToggle.click();
          else showPanel(item[0]);
        });
        quick.appendChild(button);
      });
      welcome.appendChild(quick);

      var tip = make('div', 'mm-welcome-tip');
      tip.appendChild(make('span', 'mm-tip-mark', '⌘'));
      var tipText = make('span');
      tipText.appendChild(doc.createTextNode('Press '));
      tipText.appendChild(make('b', null, '/'));
      tipText.appendChild(doc.createTextNode(' or '));
      tipText.appendChild(make('b', null, '⌘ K'));
      tipText.appendChild(doc.createTextNode(' to search anywhere'));
      tip.appendChild(tipText);
      welcome.appendChild(tip);
      body.appendChild(welcome);

      var recent = readRecentPlaces();
      if (recent.length) {
        var recentBox = make('div', 'mm-recent');
        var recentHeading = make('div', 'mm-recent-heading');
        recentHeading.appendChild(make('h2', null, 'Recent places'));
        var clearRecent = make('button', 'mm-recent-clear', 'Clear');
        clearRecent.type = 'button';
        clearRecent.addEventListener('click', clearRecentPlaces);
        recentHeading.appendChild(clearRecent);
        recentBox.appendChild(recentHeading);
        var list = make('div', 'mm-recent-list');
        recent.slice(0, 3).forEach(function (place) {
          var button = make('button', 'mm-recent-item');
          button.type = 'button';
          button.appendChild(make('span', 'mm-recent-pin', '•'));
          button.appendChild(make('span', null, place.name));
          button.addEventListener('click', function () { selectPlace(place); });
          list.appendChild(button);
        });
        recentBox.appendChild(list);
        body.appendChild(recentBox);
      }
      return;
    }
    body.appendChild(make('h3', null, row.name));
    if (row.detail) body.appendChild(make('p', 'tight', row.detail));

    var origin = state.placeOrigin || state.center;
    var km = MM.geodesy.distanceKm(origin, row);
    var dl = make('dl', 'mm-kv');
    kvRow(dl, 'Coordinates', MM.geodesy.formatLatLon(row.lat, row.lon, 5), 'Coordinates');
    kvRow(dl, 'Plus Code', MM.olc.encode(row.lat, row.lon), 'Plus Code');
    var grid = gridRefText(row.lat, row.lon);
    if (grid) kvRow(dl, 'OS grid ref', grid, 'OS grid reference');
    body.appendChild(dl);

    var stats = make('div', 'mm-grid3');
    stats.appendChild(statCard('Straight line', fmtKm(km), km < 0.01 ? 'at map centre' : 'from previous centre'));
    var bearing = MM.geodesy.bearing(origin, row);
    stats.appendChild(statCard('Bearing', Math.round(bearing) + '°', MM.geodesy.compassPoint(bearing)));
    var facts = countryFacts(row.country ? countryCodeOf(row) : null);
    if (facts) stats.appendChild(statCard('Country', facts.name, facts.region));
    body.appendChild(stats);

    if (facts) {
      var factsDl = make('dl', 'mm-kv');
      if (facts.capital) kvRow(factsDl, 'Capital', facts.capital);
      if (facts.languages && facts.languages.length) kvRow(factsDl, 'Languages', facts.languages.slice(0, 3).join(', '));
      if (facts.currencies && facts.currencies.length) kvRow(factsDl, 'Currency', facts.currencies.slice(0, 2).join(', '));
      if (facts.calling) kvRow(factsDl, 'Calling code', facts.calling);
      if (facts.area) kvRow(factsDl, 'Area', facts.area.toLocaleString('en-GB') + ' km²');
      body.appendChild(factsDl);
    }

    var time = localTimeAt(row);
    if (time) {
      var timeDl = make('dl', 'mm-kv');
      kvRow(timeDl, 'Time zone', time.zone);
      if (time.time) kvRow(timeDl, 'Local time', time.time + ' · ' + time.date + (time.offset ? ' (' + time.offset + ')' : ''));
      body.appendChild(timeDl);
    }

    var sunBox = make('div');
    sunBox.id = 'mm-place-sun';
    body.appendChild(sunBox);
    renderSun(sunBox, row.lat, row.lon);

    var actions = make('div', 'mm-btn-row');
    var routeTo = make('button', 'mm-btn', 'Route here');
    routeTo.type = 'button';
    routeTo.addEventListener('click', function () {
      els.toField.value = row.lat.toFixed(5) + ', ' + row.lon.toFixed(5);
      showPanel('route');
    });
    var from = make('button', 'mm-btn', 'Route from here');
    from.type = 'button';
    from.addEventListener('click', function () {
      els.fromField.value = row.lat.toFixed(5) + ', ' + row.lon.toFixed(5);
      showPanel('route');
    });
    var near = make('button', 'mm-btn', 'What is nearby?');
    near.type = 'button';
    near.addEventListener('click', function () { showPanel('nearby'); });
    actions.appendChild(routeTo);
    actions.appendChild(from);
    actions.appendChild(near);
    body.appendChild(actions);

    if (!state.offline) {
      var reverseNote = make('p', 'mm-muted', 'Address lookup…');
      body.appendChild(reverseNote);
      MM.providers.reverse(row).then(function (result) {
        if (result.result && result.result.detail) {
          reverseNote.textContent = 'Address: ' + result.result.detail + ' — ' + result.provider.name + ' (OpenStreetMap data)';
        } else {
          reverseNote.textContent = 'No address available (offline, or the geocoder is unavailable). The coordinates above are always exact.';
        }
      });

      var wikiNote = make('div');
      body.appendChild(wikiNote);
      MM.providers.wiki(row, { radiusMetres: 5000 }).then(function (result) {
        if (!result.articles || !result.articles.length) return;
        wikiNote.appendChild(make('h2', null, 'Nearby knowledge'));
        result.articles.slice(0, 3).forEach(function (article) {
          var para = make('p', 'tight');
          var link = make('a', null, article.title);
          link.href = article.url;
          link.rel = 'noopener';
          link.target = '_blank';
          para.appendChild(link);
          var extract = (article.extract || '').split('. ').slice(0, 2).join('. ');
          para.appendChild(doc.createTextNode(extract ? ' — ' + extract : ''));
          wikiNote.appendChild(para);
          if (article.distanceMetres != null) {
            wikiNote.appendChild(make('p', 'mm-muted', fmtMetres(article.distanceMetres) + ' away · Wikipedia (CC BY-SA 4.0)'));
          }
        });
      });
    } else {
      body.appendChild(make('p', 'mm-muted', 'Offline: showing coordinates, Plus Code, grid reference and country facts from the data shipped with this page.'));
    }

    var nearest = lastNearest;
    if (nearest) body.appendChild(make('p', 'mm-muted', 'Nearest place: ' + nearest.name + ', ' + fmtKm(nearest.km) + ' away.'));
  }

  function countryCodeOf(row) {
    if (row.country && row.country.length === 2) return row.country;
    if (gazetteer) {
      var near = gazetteer.nearest(row, 1)[0];
      if (near) return near.cc;
    }
    return null;
  }

  // ------------------------------------------------------------------ sun

  function renderSun(container, lat, lon) {
    clear(container);
    var times = MM.solar.sunTimes(new Date(), lat, lon);
    var position = MM.solar.solarPosition(new Date(), lat, lon);
    var dl = make('dl', 'mm-kv');
    kvRow(dl, 'Sun', Math.round(position.altitude) + '° above horizon · ' + Math.round(position.azimuth) + '° ' + MM.geodesy.compassPoint(position.azimuth));
    if (times.state === 'polar-day') kvRow(dl, 'Daylight', 'Sun stays up all day at this latitude');
    else if (times.state === 'polar-night') kvRow(dl, 'Daylight', 'Sun stays down all day at this latitude');
    else {
      kvRow(dl, 'Sunrise', fmtTime(times.sunrise) + (times.sunrise && times.sunrise.getDate() !== new Date().getDate() ? ' (next day)' : ''));
      kvRow(dl, 'Sunset', fmtTime(times.sunset));
      kvRow(dl, 'Daylight', fmtDuration(times.dayLengthMinutes));
      kvRow(dl, 'Golden hour', fmtTime(times.goldenHourEveningStart) + ' – ' + fmtTime(times.sunset));
    }
    kvRow(dl, 'Moon', Math.round(MM.solar.moonPhase(new Date()) * 100) + '% lit');
    container.appendChild(dl);
    container.appendChild(make('p', 'mm-muted', 'Computed on this device from the NOAA solar algorithm — no network needed.'));
  }

  // ---------------------------------------------------------------- routing

  function bindRoute() {
    var form = $('mm-route-form');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      runRoute();
    });
    var swap = $('mm-route-swap');
    if (swap) {
      swap.addEventListener('click', function () {
        var from = els.fromField.value;
        els.fromField.value = els.toField.value;
        els.toField.value = from;
      });
    }
    Array.prototype.forEach.call(doc.querySelectorAll('[data-mm-mode]'), function (button) {
      button.addEventListener('click', function () {
        Array.prototype.forEach.call(doc.querySelectorAll('[data-mm-mode]'), function (other) {
          other.setAttribute('aria-pressed', String(other === button));
        });
        state.routeMode = button.getAttribute('data-mm-mode');
      });
    });
    state.routeMode = 'car';
    state.routePreference = state.routePreference || 'fastest';
    Array.prototype.forEach.call(doc.querySelectorAll('[data-mm-route-preference]'), function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-mm-route-preference') === state.routePreference));
      button.addEventListener('click', function () {
        Array.prototype.forEach.call(doc.querySelectorAll('[data-mm-route-preference]'), function (other) {
          other.setAttribute('aria-pressed', String(other === button));
        });
        state.routePreference = button.getAttribute('data-mm-route-preference') || 'fastest';
        updateRouteHint();
        if (els.fromField.value.trim() && els.toField.value.trim()) runRoute();
      });
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-mm-route-avoid]'), function (button) {
      var key = button.getAttribute('data-mm-route-avoid');
      button.setAttribute('aria-pressed', String(!!state.routeAvoid[key]));
      button.addEventListener('click', function () {
        state.routeAvoid[key] = !state.routeAvoid[key];
        button.setAttribute('aria-pressed', String(state.routeAvoid[key]));
        updateRouteHint();
        if (els.fromField.value.trim() && els.toField.value.trim()) runRoute();
      });
    });
    updateRouteHint();
    ['mm-route-from', 'mm-route-to'].forEach(function (id) {
      var field = $(id);
      if (!field) return;
      field.addEventListener('input', function () {
        ensureGazetteer().then(function (gaz) {
          var match = gaz.search(field.value, { limit: 1, near: state.center })[0];
          if (match && field.value.trim().length > 2) {
            field.title = match.name + ', ' + match.country;
          }
        }).catch(function () {});
      });
    });
    var pickFrom = $('mm-pick-from'), pickTo = $('mm-pick-to');
    if (pickFrom) pickFrom.addEventListener('click', function () { pickInto(els.fromField); });
    if (pickTo) pickTo.addEventListener('click', function () { pickInto(els.toField); });
  }

  function pickInto(field) {
    field.value = state.center.lat.toFixed(5) + ', ' + state.center.lon.toFixed(5);
    field.title = 'Map centre';
    toast('Filled with the map centre');
  }

  function routePreferenceLabel(preference) {
    return preference === 'shortest' ? 'Shortest' : preference === 'quiet' ? 'Quieter' : 'Fastest';
  }

  function selectedRouteAvoids() {
    var labels = [];
    Object.keys(state.routeAvoid).forEach(function (key) {
      if (state.routeAvoid[key]) labels.push(key === 'motorways' ? 'motorways' : key);
    });
    return labels;
  }

  function updateRouteHint() {
    if (!els.routeHint) return;
    var avoids = selectedRouteAvoids();
    var message = routePreferenceLabel(state.routePreference) + ' is selected';
    if (avoids.length) message += ' · avoiding ' + avoids.join(', ');
    els.routeHint.textContent = message + '. Preferences are passed to the open router where it supports them; the result says what was honoured.';
  }

  function routeRequestOptions() {
    var exclude = selectedRouteAvoids();
    // A quiet walking/cycling route should not quietly send someone onto a
    // trunk road. This is a preference, not a promise: the provider may still
    // need a main road to connect two places.
    if (state.routePreference === 'quiet') {
      if (state.routeMode === 'car' && exclude.indexOf('motorways') < 0) exclude.push('motorways');
      if (state.routeMode !== 'car') {
        ['motorways', 'trunk', 'primary'].forEach(function (road) {
          if (exclude.indexOf(road) < 0) exclude.push(road);
        });
      }
    }
    return {
      alternatives: true,
      preference: state.routePreference,
      exclude: exclude,
    };
  }

  function resolveEndpoint(text) {
    var value = String(text || '').trim();
    if (!value) return Promise.resolve(null);
    // Coordinates first — they are unambiguous.
    var parsed = MM.geodesy.parseLatLon(value);
    if (parsed) return Promise.resolve(parsed);
    try {
      var interpreted = MM.gazetteer.interpret(value, { gazetteer: null });
      if (interpreted && interpreted.point) return Promise.resolve(interpreted.point);
    } catch (error) { /* fall through */ }
    return ensureGazetteer().then(function (gaz) {
      var offline = gaz.search(value, { limit: 1, near: state.center })[0];
      if (state.offline) return offline || null;
      return MM.providers.geocode(value, { near: state.center }).then(function (result) {
        if (result.results && result.results.length) {
          var first = result.results[0];
          return { lat: first.lat, lon: first.lon, name: first.name };
        }
        return offline || null;
      });
    });
  }

  function runRoute() {
    var body = els.route;
    clear(body);
    body.appendChild(make('p', 'mm-muted', 'Calculating…'));
    Promise.all([resolveEndpoint(els.fromField.value), resolveEndpoint(els.toField.value)]).then(function (points) {
      var from = points[0], to = points[1];
      if (!from || !to) {
        clear(body);
        body.appendChild(make('p', 'mm-note warn', 'I could not work out one of those places. Try a town name, a postcode, “51.5074, -0.1278”, a Plus Code or an OS grid reference.'));
        return;
      }
      lastRoutePoints = { from: from, to: to };
      state.markers = [
        { lat: from.lat, lon: from.lon, label: 'From: ' + (from.name || MM.geodesy.formatLatLon(from, null, 3)), colour: '#2dd4ff' },
        { lat: to.lat, lon: to.lon, label: 'To: ' + (to.name || MM.geodesy.formatLatLon(to, null, 3)), colour: '#ffd400' },
      ];
      map.setMarkers(state.markers);
      map.fitBounds([from, to], { padding: 80 });
      if (live && live.map) {
        live.map.fitBounds([[from.lon, from.lat], [to.lon, to.lat]], { padding: 80, duration: 600 });
      }
      return MM.providers.route(from, to, state.routeMode, routeRequestOptions()).then(function (route) {
        state.route = route;
        renderRoute(route, from, to);
      });
    }).catch(function (error) {
      clear(body);
      body.appendChild(make('p', 'mm-note bad', 'Something went wrong: ' + error.message));
    });
  }

  function renderRouteAlternatives(route, body, from, to) {
    if (!route.simple || !route.simple.length || route.straightLine) return;
    body.appendChild(make('h2', null, 'Other routes'));
    var list = make('div', 'mm-route-alternatives');
    route.simple.slice(0, 3).forEach(function (alternative, index) {
      var button = make('button', 'mm-route-alternative');
      button.type = 'button';
      var copy = make('span', 'mm-route-alternative-copy');
      copy.appendChild(make('b', null, 'Option ' + (index + 2)));
      copy.appendChild(make('small', null, fmtKm(alternative.distanceKm) + ' · ' + fmtDuration(alternative.durationMinutes)));
      button.appendChild(copy);
      button.appendChild(make('span', 'mm-route-alternative-arrow', '→'));
      button.addEventListener('click', function () {
        alternative.simple = [];
        state.route = alternative;
        map.setPath(alternative.geometry || []);
        drawLiveRoute(alternative.geometry);
        renderRoute(alternative, from || lastRoutePoints.from, to || lastRoutePoints.to);
        toast('Showing option ' + (index + 2));
      });
      list.appendChild(button);
    });
    body.appendChild(list);
  }

  function renderRoute(route, from, to) {
    var body = els.route;
    clear(body);
    var straight = MM.geodesy.measure(from || lastRoutePoints.from, to || lastRoutePoints.to);

    if (route.straightLine) {
      body.appendChild(make('p', 'mm-note warn', 'The open routing service could not be reached, so this is the straight-line (great-circle) distance — not a road route. Everything else on this panel still works offline.'));
    } else {
      var preferenceNote = routePreferenceLabel(route.preference || state.routePreference);
      if (route.preferenceHonoured === false) preferenceNote += ' requested';
      if (route.exclude && route.exclude.length) preferenceNote += ' · avoiding ' + route.exclude.join(', ');
      body.appendChild(make('p', 'mm-route-summary', preferenceNote + ' route · ' + (route.provider ? route.provider.name : 'open router')));
      if (route.routeWarning) body.appendChild(make('p', 'mm-note warn', route.routeWarning));
    }
    var stats = make('div', 'mm-grid3');
    stats.appendChild(statCard(route.straightLine ? 'Straight line' : 'Distance', fmtKm(route.distanceKm), route.straightLine ? 'as the crow flies' : 'by road'));
    if (route.durationMinutes) stats.appendChild(statCard('Time', fmtDuration(route.durationMinutes), state.routeMode === 'foot' ? 'walking pace' : state.routeMode === 'bike' ? 'cycling pace' : 'with typical traffic'));
    stats.appendChild(statCard('Bearing', Math.round(straight.initialBearing) + '°', MM.geodesy.compassPoint(straight.initialBearing)));
    body.appendChild(stats);

    var dl = make('dl', 'mm-kv');
    kvRow(dl, 'From', (lastRoutePoints.from.name || '') + ' ' + MM.geodesy.formatLatLon(lastRoutePoints.from, null, 4));
    kvRow(dl, 'To', (lastRoutePoints.to.name || '') + ' ' + MM.geodesy.formatLatLon(lastRoutePoints.to, null, 4));
    kvRow(dl, 'Great-circle', fmtKm(straight.km));
    if (route.provider) kvRow(dl, 'Routing', route.provider.name + ' (OpenStreetMap data)');
    else if (route.offline) kvRow(dl, 'Routing', 'unavailable — offline');
    body.appendChild(dl);
    renderRouteAlternatives(route, body, from, to);

    if (route.geometry) {
      map.setPath(route.geometry);
      drawLiveRoute(route.geometry);
    }

    if (route.steps && route.steps.length) {
      body.appendChild(make('h2', null, 'Turn by turn'));
      var list = make('ol', 'mm-steps');
      route.steps.slice(0, 40).forEach(function (step) {
        if (!step.distanceKm) return;
        var li = make('li');
        li.appendChild(make('span', 'mm-step-icon', iconFor(step)));
        var text = make('span', 'mm-step-text', capitalise(step.instruction) + (step.modifier ? ' ' + step.modifier : '') + (step.name ? ' onto ' + step.name : ''));
        li.appendChild(text);
        li.appendChild(make('span', 'mm-step-meta', fmtKm(step.distanceKm)));
        list.appendChild(li);
      });
      body.appendChild(list);
    }

    // Elevation and fuel only make sense once we have a real path.
    if (route.geometry && route.geometry.length > 1) {
      var elevationBox = make('div');
      elevationBox.id = 'mm-elevation';
      body.appendChild(elevationBox);
      loadElevation(route.geometry, elevationBox);

      if (state.routeMode === 'car' && !route.straightLine) {
        var fuel = make('div');
        fuel.id = 'mm-fuel';
        body.appendChild(fuel);
        renderFuel(fuel, route.distanceKm);
      }
    }

    if (route.geometry) {
      var actions = make('div', 'mm-btn-row');
      if (!route.straightLine) {
        var navigateButton = make('button', 'mm-btn primary', state.routeMode === 'bike' ? 'Start cycle navigation' : state.routeMode === 'foot' ? 'Start walking navigation' : 'Start navigation');
        navigateButton.type = 'button';
        navigateButton.addEventListener('click', function () { startRouteNavigation(route); });
        actions.appendChild(navigateButton);
      }
      var exportButton = make('button', 'mm-btn', 'Copy route as GeoJSON');
      exportButton.type = 'button';
      exportButton.addEventListener('click', function () {
        copyText(JSON.stringify({ type: 'LineString', coordinates: route.geometry }), 'Route GeoJSON');
      });
      var openButton = make('a', 'mm-btn', 'Open this route as a link');
      openButton.href = shareUrl();
      actions.appendChild(exportButton);
      actions.appendChild(openButton);
      if (state.routeMode === 'car' && !route.straightLine) {
        var driveButton = make('button', 'mm-btn primary', 'Open driving mode');
        driveButton.type = 'button';
        driveButton.addEventListener('click', function () {
          els.driveFrom.value = lastRoutePoints.from.name || MM.geodesy.formatLatLon(lastRoutePoints.from, null, 5);
          els.driveTo.value = lastRoutePoints.to.name || MM.geodesy.formatLatLon(lastRoutePoints.to, null, 5);
          showPanel('drive');
          planDrive();
        });
        actions.appendChild(driveButton);
      }
      body.appendChild(actions);
    }
  }

  function startRouteNavigation(route) {
    if (!route || route.straightLine || !lastRoutePoints) {
      toast('A real road or path route is needed before navigation can start.');
      return;
    }
    if (drive.watchId != null) stopGuidance(false);
    drive.route = route;
    drive.from = lastRoutePoints.from;
    drive.to = lastRoutePoints.to;
    drive.limits = null;
    drive.navigationMode = state.routeMode;
    drive.layers = { traffic: null, weather: null, stops: null, cameras: null };
    drive.stopsOrdered = null;
    buildDriveSession(route, state.routeMode);
    startGuidance();
    toast(state.routeMode === 'bike' ? 'Cycle navigation started' : state.routeMode === 'foot' ? 'Walking navigation started' : 'Navigation started');
  }

  /** The route, on the live basemap as well as the offline one. */
  function drawLiveRoute(geometry) {
    if (!geometry || !live || !live.map || !live.map.getSource) return;
    try {
      var data = { type: 'Feature', geometry: { type: 'LineString', coordinates: geometry }, properties: {} };
      if (live.map.getSource('mm-route')) live.map.getSource('mm-route').setData(data);
      else {
        live.map.addSource('mm-route', { type: 'geojson', data: data });
        live.map.addLayer({ id: 'mm-route-line', type: 'line', source: 'mm-route', paint: { 'line-color': '#2dd4ff', 'line-width': 5, 'line-opacity': 0.9 } });
      }
    } catch (error) { /* a style reload is in progress; the canvas renderer still has it */ }
  }

  function iconFor(step) {
    var type = (step.instruction || '').toLowerCase();
    var modifier = String(step.modifier || '').toLowerCase();
    if (modifier === 'arrive') return '🏁';
    if (modifier.indexOf('roundabout') >= 0) return '🔄';
    if (modifier.indexOf('sharp right') >= 0 || modifier.indexOf('u-turn right') >= 0) return '↪️';
    if (modifier.indexOf('sharp left') >= 0 || modifier.indexOf('u-turn left') >= 0) return '↩️';
    if (modifier.indexOf('slight right') >= 0 || modifier === 'keep right' || modifier === 'exit right') return '↗️';
    if (modifier.indexOf('slight left') >= 0 || modifier === 'keep left' || modifier === 'exit left') return '↖️';
    if (type.indexOf('roundabout') >= 0) return '🔄';
    if (type.indexOf('arrive') >= 0) return '🏁';
    if (type.indexOf('depart') >= 0) return '🚩';
    if (type.indexOf('merge') >= 0) return '⤵️';
    if (modifier.indexOf('left') >= 0) return '⬅️';
    if (modifier.indexOf('right') >= 0) return '➡️';
    return '⬆️';
  }

  function capitalise(text) {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function loadElevation(line, container) {
    container.appendChild(make('p', 'mm-muted', 'Loading elevations…'));
    var points = sampleLine(line, 24);
    MM.providers.elevation(points).then(function (result) {
      clear(container);
      if (!result.values || !result.values.length) {
        container.appendChild(make('p', 'mm-muted', 'Elevation data unavailable right now (OpenTopoData). Everything else on this page still works.'));
        return;
      }
      container.appendChild(make('h2', null, 'Elevation'));
      var stats = make('div', 'mm-grid3');
      stats.appendChild(statCard('Highest', Math.round(result.maxMetres) + ' m', null));
      stats.appendChild(statCard('Lowest', Math.round(result.minMetres) + ' m', null));
      stats.appendChild(statCard('Climbing', Math.round(result.ascentMetres) + ' m', 'total ascent'));
      container.appendChild(stats);
      var canvas = doc.createElement('canvas');
      canvas.className = 'mm-chart';
      canvas.setAttribute('aria-label', 'Elevation profile along the route');
      container.appendChild(canvas);
      drawProfile(canvas, result.values.map(function (v) { return v.elevation; }));
      container.appendChild(make('p', 'mm-muted', 'Elevations: OpenTopoData, SRTM 90 m (public domain). Sampled every few kilometres, so it is a profile, not a survey.'));
    });
  }

  function drawProfile(canvas, values) {
    var usable = values.filter(function (v) { return v != null; });
    if (usable.length < 2) return;
    var min = Math.min.apply(null, usable);
    var max = Math.max.apply(null, usable);
    var span = Math.max(1, max - min);
    var ratio = root.devicePixelRatio || 1;
    var width = canvas.clientWidth || 320;
    var height = 74;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    values.forEach(function (value, index) {
      if (value == null) return;
      var x = (index / (values.length - 1)) * width;
      var y = height - ((value - min) / span) * (height - 12) - 6;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#2dd4ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(45,212,255,0.14)';
    ctx.fill();
    ctx.fillStyle = 'rgba(230,250,255,0.72)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(Math.round(max) + ' m', 6, 12);
    ctx.fillText(Math.round(min) + ' m', 6, height - 4);
  }

  function sampleLine(line, maxPoints) {
    if (!line.length) return [];
    if (line.length <= maxPoints) return line.map(function (pair) { return { lat: pair[1], lon: pair[0] }; });
    var out = [];
    for (var i = 0; i < maxPoints; i += 1) {
      var t = i / (maxPoints - 1);
      var index = Math.min(line.length - 1, Math.round(t * (line.length - 1)));
      out.push({ lat: line[index][1], lon: line[index][0] });
    }
    return out;
  }

  function renderFuel(container, km) {
    clear(container);
    container.appendChild(make('h2', null, 'Fuel estimate'));
    if (state.units === 'imperial') {
      // miles and gallons for imperial-minded readers
      var miles = km * 0.621371;
      var gallons = miles / 40;
      var cost = gallons * 6.9;
      container.appendChild(make('p', 'tight', miles.toFixed(0) + ' mi at 40 mpg ≈ ' + gallons.toFixed(1) + ' gal ≈ £' + cost.toFixed(2) + ' (at £6.90/gal)'));
    } else {
      var litres = (km / 100) * 7;
      var costLitres = litres * 1.51;
      container.appendChild(make('p', 'tight', km.toFixed(0) + ' km at 7 L/100 km ≈ ' + litres.toFixed(1) + ' L ≈ £' + costLitres.toFixed(2) + ' (at £1.51/L)'));
    }
    var link = make('a', null, 'Fuel Cost Calculator');
    link.href = 'tool.html?card=fuelcost';
    container.appendChild(make('p', 'mm-muted', 'A rough estimate at UK averages — ')).appendChild(link);
    container.lastChild.appendChild(doc.createTextNode(' does the real thing with your own figures.'));
  }

  // -------------------------------------------------------------- measure

  function bindMeasure() {
    els.measureToggle.addEventListener('click', function () {
      state.measuring = !state.measuring;
      els.measureToggle.setAttribute('aria-pressed', String(state.measuring));
      if (state.measuring) {
        showPanel('measure');
        toast('Tap the map to add points — tap the first point again to close an area');
        state.measure = [];
        state.markers = [];
        map.setMarkers([]);
        map.setPolygon([]);
        renderMeasure();
      }
    });
    els.clearButton.addEventListener('click', function () {
      state.measure = [];
      state.markers = [];
      state.route = null;
      lastRoutePoints = null;
      state.nearby = [];
      state.place = null;
      state.placeOrigin = null;
      map.setMarkers([]);
      map.setPath([]);
      map.setPolygon([]);
      if (live && live.map && live.map.getSource && live.map.getSource('mm-route')) {
        try { live.map.getSource('mm-route').setData({ type: 'FeatureCollection', features: [] }); } catch (error) {}
      }
      renderMeasure();
      renderNearby();
      renderPlace();
      toast('Cleared');
    });
  }

  function onMapClick(payload) {
    if (driveTapToMove(payload.point)) return;
    var point = payload.point;
    if (state.measuring) {
      var first = state.measure[0];
      if (first && state.measure.length > 2 && MM.geodesy.distanceKm(first, point) * 1000 < 12) {
        state.measure.push(first);
        state.markers = state.measure.map(function (p, index) {
          return { lat: p.lat, lon: p.lon, label: String(index + 1), colour: index === 0 ? '#ffd400' : '#2dd4ff' };
        });
        map.setMarkers(state.markers);
        map.setPolygon(state.measure);
        state.measuring = false;
        els.measureToggle.setAttribute('aria-pressed', 'false');
        renderMeasure();
        return;
      }
      state.measure.push(point);
      state.markers = state.measure.map(function (p, index) {
        return { lat: p.lat, lon: p.lon, label: String(index + 1), colour: index === 0 ? '#ffd400' : '#2dd4ff' };
      });
      map.setMarkers(state.markers);
      map.setPath(state.measure);
      renderMeasure();
      return;
    }
    // Ordinary click: report the point and what is under it.
    doc.body.classList.add('mm-has-map-interaction');
    state.picked = payload;
    state.placeOrigin = { lat: state.center.lat, lon: state.center.lon };
    if (payload.country) {
      state.place = { name: payload.country.name, detail: 'Picked on the map', lat: point.lat, lon: point.lon, country: null };
    } else {
      state.place = { name: MM.geodesy.formatLatLon(point, null, 5), detail: 'Picked on the map', lat: point.lat, lon: point.lon };
    }
    map.setMarkers([{ lat: point.lat, lon: point.lon, colour: '#ffd400' }]);
    showPanel('place');
    updateNearest(point);
    renderPlace();
  }

  function updateNearest(point) {
    ensureGazetteer().then(function (gaz) {
      var near = gaz.nearest(point, 1)[0];
      lastNearest = near || null;
      if (near) {
        var name = near.name + ', ' + near.country;
        if (state.place) state.place.nearest = name;
      }
      renderPlace();
    }).catch(function () {});
  }

  function renderMeasure() {
    var body = els.measure;
    clear(body);
    if (!state.measure.length) {
      body.appendChild(make('p', 'mm-muted', 'Press the 📏 button, then tap the map to measure. Distances are geodesic (WGS84) and every calculation happens on this device — measuring works with the network switched off.'));
      var actions = make('div', 'mm-btn-row');
      var start = make('button', 'mm-btn primary', 'Start measuring');
      start.type = 'button';
      start.addEventListener('click', function () { els.measureToggle.click(); });
      actions.appendChild(start);
      body.appendChild(actions);
      return;
    }
    var totalKm = MM.geodesy.pathLengthKm(state.measure);
    var closed = state.measure.length > 2 && MM.geodesy.distanceKm(state.measure[0], state.measure[state.measure.length - 1]) < 0.02;
    var stats = make('div', 'mm-grid3');
    stats.appendChild(statCard('Points', String(state.measure.length - (closed ? 1 : 0)), null));
    stats.appendChild(statCard('Length', fmtKm(totalKm), closed ? 'perimeter' : 'along the path'));
    if (closed) {
      var areaM2 = Math.abs(MM.geodesy.polygonAreaM2(state.measure));
      stats.appendChild(statCard('Area', MM.geodesy.formatArea(areaM2, state.units), null));
    } else {
      stats.appendChild(statCard('Bearing', Math.round(MM.geodesy.bearing(state.measure[0], state.measure[state.measure.length - 1])) + '°', 'first to last'));
    }
    body.appendChild(stats);

    var list = make('ol', 'mm-steps');
    for (var i = 1; i < state.measure.length; i += 1) {
      var a = state.measure[i - 1], b = state.measure[i];
      var li = make('li');
      li.appendChild(make('span', 'mm-step-icon', String(i)));
      li.appendChild(make('span', 'mm-step-text', MM.geodesy.formatLatLon(b.lat, b.lon, 4)));
      li.appendChild(make('span', 'mm-step-meta', fmtKm(MM.geodesy.distanceKm(a, b)) + ' · ' + Math.round(MM.geodesy.bearing(a, b)) + '°'));
      list.appendChild(li);
    }
    body.appendChild(list);

    var actions = make('div', 'mm-btn-row');
    var more = make('button', 'mm-btn', state.measuring ? 'Add points on the map…' : 'Continue measuring');
    more.type = 'button';
    more.addEventListener('click', function () {
      state.measuring = true;
      els.measureToggle.setAttribute('aria-pressed', 'true');
      showPanel('measure');
    });
    var copyGeo = make('button', 'mm-btn', 'Copy as GeoJSON');
    copyGeo.type = 'button';
    copyGeo.addEventListener('click', function () {
      var geometry = state.measure.length > 2
        ? { type: 'Polygon', coordinates: [state.measure.map(function (p) { return [p.lon, p.lat]; })] }
        : { type: 'LineString', coordinates: state.measure.map(function (p) { return [p.lon, p.lat]; }) };
      copyText(JSON.stringify(geometry), 'Geometry');
    });
    actions.appendChild(more);
    actions.appendChild(copyGeo);
    body.appendChild(actions);

    if (closed) {
      body.appendChild(make('p', 'mm-muted', 'Area is computed on the ellipsoid and is suitable for land parcels, but it is not a legal survey — '));
      var link = make('a', null, 'Geodesic Area Calculator');
      link.href = 'tool.html?card=geodesic-area-parcel-calculator';
      body.lastChild.appendChild(link);
      body.lastChild.appendChild(doc.createTextNode(' adds proper parcel notes.'));
    }
  }

  // --------------------------------------------------------------- nearby

  function buildNearbyChips() {
    if (!els.nearbyChips) return;
    MM.providers.POI_CATEGORIES.forEach(function (category, index) {
      var button = make('button', 'mm-tag', category.icon + ' ' + category.label);
      button.type = 'button';
      button.setAttribute('data-mm-poi', category.id);
      button.setAttribute('aria-pressed', String(index === 0));
      button.addEventListener('click', function () {
        Array.prototype.forEach.call(els.nearbyChips.querySelectorAll('button'), function (other) {
          other.setAttribute('aria-pressed', String(other === button));
        });
        state.poiCategory = category.id;
        runNearby();
      });
      els.nearbyChips.appendChild(button);
    });
    state.poiCategory = MM.providers.POI_CATEGORIES[0].id;
  }

  function bindNearby() {
    var button = $('mm-nearby-go');
    if (button) button.addEventListener('click', runNearby);
  }

  function runNearby() {
    var body = els.nearby;
    clear(body);
    var radius = parseInt(els.radius.value, 10) || 1500;
    if (state.offline) {
      renderOfflineNearby(body, radius);
      return;
    }
    body.appendChild(make('p', 'mm-muted', 'Asking Overpass for OpenStreetMap data within ' + fmtMetres(radius) + '…'));
    MM.providers.pois(state.center, radius, state.poiCategory).then(function (result) {
      state.nearby = result.elements || [];
      clear(body);
      if (result.offline) {
        body.appendChild(make('p', 'mm-note warn', 'The Overpass API could not be reached. Falling back to what this page knows offline.'));
        renderOfflineNearby(body, radius);
        return;
      }
      if (!state.nearby.length) {
        body.appendChild(make('p', 'mm-muted', 'Nothing mapped in that category within ' + fmtMetres(radius) + '. Try a wider radius — OpenStreetMap coverage for ' + result.category.label.toLowerCase() + ' varies by country.'));
        return;
      }
      body.appendChild(make('p', 'tight', state.nearby.length + ' × ' + result.category.label + ' within ' + fmtMetres(radius)));
      var list = make('ul', 'mm-list');
      state.nearby.forEach(function (element) {
        var li = make('li');
        var row = make('button', 'mm-row');
        row.type = 'button';
        var left = make('span');
        left.appendChild(make('span', 'mm-row-name', element.name));
        var km = MM.geodesy.distanceKm(state.center, element);
        left.appendChild(make('span', 'mm-row-detail', element.kind + (element.tags && element.tags.opening_hours ? ' · ' + element.tags.opening_hours : '')));
        row.appendChild(left);
        row.appendChild(make('span', 'mm-row-right', fmtKm(km)));
        row.addEventListener('click', function () {
          focusPoint({ lat: element.lat, lon: element.lon }, Math.max(state.zoom, 16));
          map.setMarkers([{ lat: element.lat, lon: element.lon, label: element.name, colour: '#ffd400' }]);
        });
        li.appendChild(row);
        list.appendChild(li);
      });
      body.appendChild(list);
      body.appendChild(make('p', 'mm-muted', 'Data: OpenStreetMap contributors via the Overpass API (ODbL). Availability and completeness vary by place.'));
      if (state.nearby.length) {
        var points = state.nearby.map(function (element) { return { lat: element.lat, lon: element.lon }; });
        map.setMarkers(points.slice(0, 60).map(function (point) { return { lat: point.lat, lon: point.lon, colour: '#39ff14' }; }));
      }
    });
  }

  function renderOfflineNearby(body, radius) {
    ensureGazetteer().then(function (gaz) {
      var near = gaz.nearest(state.center, 8, { minPop: 20000 });
      body.appendChild(make('h3', null, 'Places the offline map knows'));
      var list = make('ul', 'mm-list');
      near.forEach(function (place) {
        var li = make('li');
        var row = make('button', 'mm-row');
        row.type = 'button';
        var left = make('span');
        left.appendChild(make('span', 'mm-row-name', place.name));
        left.appendChild(make('span', 'mm-row-detail', place.country + ' · ' + Math.round(place.pop / 1000) + 'k people'));
        row.appendChild(left);
        row.appendChild(make('span', 'mm-row-right', fmtKm(place.km)));
        row.addEventListener('click', function () { focusPoint(place, Math.max(state.zoom, 10)); });
        li.appendChild(row);
        list.appendChild(li);
      });
      body.appendChild(list);
      body.appendChild(make('p', 'mm-muted', 'Shops, water taps and viewpoints need OpenStreetMap, which needs a connection. Nearest towns work offline.'));
    }).catch(function () {
      body.appendChild(make('p', 'mm-muted', 'Offline place list unavailable.'));
    });
  }

  function renderNearby() {
    if (els.nearby) {
      clear(els.nearby);
      els.nearby.appendChild(make('p', 'mm-muted', 'Pick a category and a radius, then press Find. Results come from OpenStreetMap volunteers — please be gentle with the public Overpass servers.'));
    }
  }

  // ------------------------------------------------------------------ info

  function buildStaticCopy() {
    var sun = els.sun;
    if (sun) renderSun(sun, state.center.lat, state.center.lon);
    if (state.panel) showPanel(state.panel);
  }

  function bindInfo() {
    var box = $('mm-info-body');
    if (!box) return;
    clear(box);
    box.appendChild(make('p', null, 'MostUsefulMaps is part of The Most Useful Site in the World. It is free, needs no account, and shows no ads. The maths — distances, bearings, area, Plus Codes, OS grid references, sun times, time zones — runs on your device and works with the network off.'));

    box.appendChild(make('h2', null, 'Where the data comes from'));
    var providers = MM.providers.describe();
    var list = make('ul', 'mm-sources');
    providers.styles.slice(0, 1).forEach(function (style) {
      var li = make('li');
      li.appendChild(make('span', 'mm-src-name', 'Basemap: OpenFreeMap'));
      li.appendChild(make('span', 'mm-src-meta', 'OpenStreetMap data · ODbL'));
      list.appendChild(li);
    });
    providers.geocoders.forEach(function (geocoder) {
      var li = make('li');
      li.appendChild(make('span', 'mm-src-name', 'Search: ' + geocoder.name));
      li.appendChild(make('span', 'mm-src-meta', geocoder.home + ' · ' + geocoder.licence));
      list.appendChild(li);
    });
    providers.routers.forEach(function (entry) {
      entry.providers.forEach(function (router) {
        var li = make('li');
        li.appendChild(make('span', 'mm-src-name', 'Routing (' + entry.mode + '): ' + router.name));
        li.appendChild(make('span', 'mm-src-meta', router.licence));
        list.appendChild(li);
      });
    });
    var overpass = make('li');
    overpass.appendChild(make('span', 'mm-src-name', 'Nearby places: Overpass API'));
    overpass.appendChild(make('span', 'mm-src-meta', 'OpenStreetMap · ODbL'));
    list.appendChild(overpass);
    if (providers.driving) {
      var driving = make('li');
      driving.appendChild(make('span', 'mm-src-name', 'Driving routes: ' + providers.driving.name));
      driving.appendChild(make('span', 'mm-src-meta', 'OpenStreetMap · ODbL · vehicle sizes and limits'));
      list.appendChild(driving);
    }
    if (providers.traffic) {
      var traffic = make('li');
      traffic.appendChild(make('span', 'mm-src-name', 'Live traffic: ' + providers.traffic.name));
      traffic.appendChild(make('span', 'mm-src-meta', providers.traffic.coverage + ' · ' + providers.traffic.licence));
      list.appendChild(traffic);
    }
    if (providers.weather) {
      var weather = make('li');
      weather.appendChild(make('span', 'mm-src-name', 'Weather: ' + providers.weather.name));
      weather.appendChild(make('span', 'mm-src-meta', providers.weather.licence));
      list.appendChild(weather);
    }
    var elevation = make('li');
    elevation.appendChild(make('span', 'mm-src-name', 'Elevation: OpenTopoData'));
    elevation.appendChild(make('span', 'mm-src-meta', 'SRTM 90 m · public domain'));
    list.appendChild(elevation);
    var wiki = make('li');
    wiki.appendChild(make('span', 'mm-src-name', 'Nearby knowledge: Wikipedia GeoSearch'));
    wiki.appendChild(make('span', 'mm-src-meta', 'CC BY-SA 4.0'));
    list.appendChild(wiki);
    var places = make('li');
    places.appendChild(make('span', 'mm-src-name', 'Offline places: GeoNames'));
    places.appendChild(make('span', 'mm-src-meta', 'CC BY 4.0'));
    list.appendChild(places);
    var earth = make('li');
    earth.appendChild(make('span', 'mm-src-name', 'Offline map: Natural Earth'));
    earth.appendChild(make('span', 'mm-src-meta', 'public domain'));
    list.appendChild(earth);
    box.appendChild(list);

    box.appendChild(make('h2', null, 'What leaves your device'));
    box.appendChild(make('p', null, 'Driving is the one place where more than a pair of points can leave the device, and only when you ask for it: the route’s shape goes to OpenStreetMap’s Overpass API to fetch the speed limits along it, five sampled points go to Open-Meteo for the forecast, and a bounding box goes to TfL for live disruption in London. Your speed, your position and your trip never leave: guidance runs entirely on this device, from data already loaded.'));
    box.appendChild(make('p', null, 'Your location is never sent anywhere. When you search online, the words you typed go to Photon or Nominatim (OpenStreetMap) to find the place. When you ask for a route, the two endpoints go to an open routing service. Nearby places send a radius and a point to Overpass. Elevations send the sampled points to OpenTopoData. Nothing else is transmitted and there is no account. Vehicle preferences and up to six recent places stay only in this browser; there are no cookies or advertising trackers.'));
    box.appendChild(make('p', null, 'The basemap tiles are fetched from OpenFreeMap, which is what makes the streets appear. Turn the live map off and the page still works, offline, at world and country level.'));
    box.appendChild(make('p', null, 'These are volunteer-run public services with fair-use policies. If this page ever gets busy, the right move is to self-host them — docs/MAPS.md explains how.'));

    box.appendChild(make('h2', null, 'What this page can do with the network off'));
    var offlineList = make('ul', 'mm-sources');
    [
      ['Pan and zoom the world', 'Natural Earth boundaries, shipped with the page'],
      ['Find towns and cities', '19,686 places from GeoNames, offline'],
      ['Distance, bearing, area, length', 'WGS84 geodesics on your device'],
      ['Plus Codes and OS grid references', 'full encoder and decoder, on your device'],
      ['Sunrise, sunset, twilight, moon', 'NOAA solar algorithm, on your device'],
      ['Time zone and local time', 'tz-lookup data, on your device'],
      ['Speed limits while driving', 'every limit loaded along the route, kept on the device'],
      ['Navigation, ETA and trip log', 'position, route and clock only — no service is consulted'],
      ['Sun in your eyes and break reminders', 'solar maths and your own driving time, on the device'],
    ].forEach(function (pair) {
      var li = make('li');
      li.appendChild(make('span', 'mm-src-name', pair[0]));
      li.appendChild(make('span', 'mm-src-meta', pair[1]));
      offlineList.appendChild(li);
    });
    box.appendChild(offlineList);

    box.appendChild(make('h2', null, 'Useful next-door tools on this site'));
    var tools = make('ul', 'mm-sources');
    [
      ['sunrise-sunset-calculator', 'Sunrise & Sunset Calculator'],
      ['coordinate-format-translator', 'Coordinate Format Translator'],
      ['uk-postcode-formatter', 'UK Postcode Formatter'],
      ['geodesic-area-parcel-calculator', 'Geodesic Area Calculator'],
      ['great-circle-route-planner', 'Great Circle Route Planner'],
      ['horizon-line-of-sight-calculator', 'Horizon & Line of Sight'],
      ['world-map-geography-trainer', 'World Map Geography Trainer'],
      ['map-projection-distortion-lab', 'Map Projection Distortion Lab'],
    ].forEach(function (pair) {
      var li = make('li');
      var link = make('a', 'mm-src-name', pair[1]);
      link.href = 'tool.html?card=' + pair[0];
      li.appendChild(link);
      tools.appendChild(li);
    });
    box.appendChild(tools);

    box.appendChild(make('p', 'mm-muted', 'MostUsefulMaps is built on open data and open source: OpenStreetMap contributors, OpenFreeMap, MapLibre GL, Natural Earth, GeoNames, tz-lookup and the NOAA solar algorithms. Full provenance is in maps/data/SOURCES.json and docs/MAPS.md in the project repository.'));
  }

  // --------------------------------------------------------------- panels

  // ------------------------------------------------------------------ drive

  /**
   * Everything the driving companion needs to know about you, remembered on
   * this device only (localStorage, no server, no analytics).
   */
  function defaultPrefs() {
    return {
      vehicle: 'car',
      avoidMotorways: false,
      avoidTolls: false,
      avoidFerries: false,
      avoidUnpaved: false,
      heightMetres: null,
      widthMetres: null,
      lengthMetres: null,
      weightTonnes: null,
      consumptionPer100: 7,
      pricePerLitre: 1.51,
      breakEveryMinutes: 120,
      routePreference: 'fastest',
    };
  }

  function loadDrivePrefs() {
    var prefs = defaultPrefs();
    try {
      var stored = root.localStorage && root.localStorage.getItem(DRIVE_PREFS_KEY);
      if (stored) {
        var parsed = JSON.parse(stored);
        Object.keys(prefs).forEach(function (key) {
          if (parsed[key] != null) prefs[key] = parsed[key];
        });
      }
    } catch (error) { /* a blocked store must never stop the map */ }
    drive.prefs = prefs;
    return prefs;
  }

  function saveDrivePrefs() {
    try {
      if (root.localStorage) root.localStorage.setItem(DRIVE_PREFS_KEY, JSON.stringify(drive.prefs));
    } catch (error) { /* private mode, quota, whatever: not worth a message */ }
  }

  /** Valhalla's options for the chosen vehicle, from the panel's own controls. */
  function driveOptions() {
    var prefs = drive.prefs;
    var vehicle = prefs.vehicle;
    var heavy = vehicle === 'hgv' || vehicle === 'motorhome' || vehicle === 'caravan';
    return {
      vehicle: vehicle,
      avoidMotorways: !!prefs.avoidMotorways,
      avoidTolls: !!prefs.avoidTolls,
      avoidFerries: !!prefs.avoidFerries,
      avoidUnpaved: !!prefs.avoidUnpaved,
      preference: prefs.routePreference || 'fastest',
      preferQuiet: prefs.routePreference === 'quiet',
      heightMetres: heavy && prefs.heightMetres ? prefs.heightMetres : null,
      widthMetres: heavy && prefs.widthMetres ? prefs.widthMetres : null,
      lengthMetres: heavy && prefs.lengthMetres ? prefs.lengthMetres : null,
      weightTonnes: heavy && prefs.weightTonnes ? prefs.weightTonnes : null,
      alternates: 2,
    };
  }

  function bindDrive() {
    if (!els.driveBody) return;
    loadDrivePrefs();

    if (els.driveVehicle) {
      els.driveVehicle.value = drive.prefs.vehicle;
      els.driveVehicle.addEventListener('change', function () {
        drive.prefs.vehicle = els.driveVehicle.value;
        saveDrivePrefs();
        updateVehicleNote();
        if (drive.route) planDrive();
      });
    }
    updateVehicleNote();

    Array.prototype.forEach.call(doc.querySelectorAll('[data-mm-drive-preference]'), function (button) {
      var preference = button.getAttribute('data-mm-drive-preference');
      button.setAttribute('aria-pressed', String(drive.prefs.routePreference === preference));
      button.addEventListener('click', function () {
        Array.prototype.forEach.call(doc.querySelectorAll('[data-mm-drive-preference]'), function (other) {
          other.setAttribute('aria-pressed', String(other === button));
        });
        drive.prefs.routePreference = preference;
        saveDrivePrefs();
        if (drive.route) planDrive();
      });
    });

    Array.prototype.forEach.call(doc.querySelectorAll('[data-mm-avoid]'), function (button) {
      var key = button.getAttribute('data-mm-avoid');
      var map = { motorways: 'avoidMotorways', tolls: 'avoidTolls', ferries: 'avoidFerries', unpaved: 'avoidUnpaved' };
      button.setAttribute('aria-pressed', String(!!drive.prefs[map[key]]));
      button.addEventListener('click', function () {
        drive.prefs[map[key]] = !drive.prefs[map[key]];
        button.setAttribute('aria-pressed', String(drive.prefs[map[key]]));
        saveDrivePrefs();
        if (drive.route) planDrive();
      });
    });

    Array.prototype.forEach.call(doc.querySelectorAll('[data-mm-layer]'), function (button) {
      var key = button.getAttribute('data-mm-layer');
      button.setAttribute('aria-pressed', String(drive.overlays[key] !== false));
      button.addEventListener('click', function () {
        drive.overlays[key] = !drive.overlays[key];
        button.setAttribute('aria-pressed', String(drive.overlays[key]));
        paintDriveMarkers();
      });
    });

    ['heightMetres', 'widthMetres', 'lengthMetres', 'weightTonnes'].forEach(function (key, index) {
      var field = [els.driveHeight, els.driveWidth, els.driveLength, els.driveWeight][index];
      if (!field) return;
      if (drive.prefs[key]) field.value = drive.prefs[key];
      field.addEventListener('change', function () {
        var value = parseFloat(field.value);
        drive.prefs[key] = isFinite(value) && value > 0 ? value : null;
        saveDrivePrefs();
      });
    });

    if (els.driveConsumption) {
      els.driveConsumption.value = drive.prefs.consumptionPer100;
      els.driveConsumption.addEventListener('change', function () {
        var value = parseFloat(els.driveConsumption.value);
        drive.prefs.consumptionPer100 = isFinite(value) && value > 0 ? value : 7;
        saveDrivePrefs();
        if (drive.route) renderDriveCost(drive.route.distanceKm, drive.route.durationMinutes);
      });
    }
    if (els.drivePrice) {
      els.drivePrice.value = drive.prefs.pricePerLitre;
      els.drivePrice.addEventListener('change', function () {
        var value = parseFloat(els.drivePrice.value);
        drive.prefs.pricePerLitre = isFinite(value) && value > 0 ? value : 1.51;
        saveDrivePrefs();
        if (drive.route) renderDriveCost(drive.route.distanceKm, drive.route.durationMinutes);
      });
    }
    if (els.driveBreak) {
      els.driveBreak.value = String(drive.prefs.breakEveryMinutes);
      els.driveBreak.addEventListener('change', function () {
        drive.prefs.breakEveryMinutes = parseInt(els.driveBreak.value, 10) || 0;
        saveDrivePrefs();
        if (drive.session) drive.session.breakEveryMinutes = drive.prefs.breakEveryMinutes || Infinity;
      });
    }

    if (els.driveForm) {
      els.driveForm.addEventListener('submit', function (event) {
        event.preventDefault();
        planDrive();
      });
    }
    if (els.driveLocate) {
      els.driveLocate.addEventListener('click', function () {
        useMyLocationAsStart(els.driveFrom);
      });
    }
    if (els.driveSwap) {
      els.driveSwap.addEventListener('click', function () {
        var from = els.driveFrom.value;
        els.driveFrom.value = els.driveTo.value;
        els.driveTo.value = from;
        if (drive.route) planDrive();
      });
    }
    if (els.driveForget) {
      els.driveForget.addEventListener('click', function () {
        try {
          if (root.localStorage) root.localStorage.removeItem(DRIVE_PREFS_KEY);
        } catch (error) { /* nothing to do */ }
        loadDrivePrefs();
        drive.prefs = defaultPrefs();
        if (els.driveVehicle) els.driveVehicle.value = drive.prefs.vehicle;
        [els.driveHeight, els.driveWidth, els.driveLength, els.driveWeight].forEach(function (field) { if (field) field.value = ''; });
        if (els.driveConsumption) els.driveConsumption.value = drive.prefs.consumptionPer100;
        if (els.drivePrice) els.drivePrice.value = drive.prefs.pricePerLitre;
        if (els.driveBreak) els.driveBreak.value = String(drive.prefs.breakEveryMinutes);
        Array.prototype.forEach.call(doc.querySelectorAll('[data-mm-avoid]'), function (button) { button.setAttribute('aria-pressed', 'false'); });
        Array.prototype.forEach.call(doc.querySelectorAll('[data-mm-drive-preference]'), function (button) { button.setAttribute('aria-pressed', String(button.getAttribute('data-mm-drive-preference') === 'fastest')); });
        updateVehicleNote();
        toast('Vehicle settings forgotten — this browser no longer has them.');
      });
    }
    if (els.navStop) els.navStop.addEventListener('click', function () { stopGuidance(true); });
    if (els.navReplan) {
      els.navReplan.addEventListener('click', function () {
        replanFromHere();
      });
    }

    renderDriveSources();
    fillDriveInputs();
  }

  function updateVehicleNote() {
    if (!els.driveVehicleNote) return;
    var info = MM.speed.vehicleInfo(drive.prefs.vehicle);
    els.driveVehicleNote.textContent = info.note;
    var heavy = drive.prefs.vehicle === 'hgv' || drive.prefs.vehicle === 'caravan' || drive.prefs.vehicle === 'motorhome';
    if (els.driveDims) els.driveDims.hidden = !heavy;
  }

  function fillDriveInputs() {
    if (els.driveFrom && !els.driveFrom.value && els.fromField && els.fromField.value) els.driveFrom.value = els.fromField.value;
    if (els.driveTo && !els.driveTo.value) {
      if (els.toField && els.toField.value) els.driveTo.value = els.toField.value;
    }
  }

  function useMyLocationAsStart(field) {
    if (!field) return;
    if (!root.navigator || !root.navigator.geolocation) {
      field.focus();
      toast('This browser will not share a location — type a starting point instead.');
      return;
    }
    toast('Finding you…');
    root.navigator.geolocation.getCurrentPosition(function (fix) {
      field.value = fix.coords.latitude.toFixed(5) + ', ' + fix.coords.longitude.toFixed(5);
      if (drive.prefs && drive.prefs.vehicle) saveDrivePrefs();
    }, function () {
      toast('Location was refused. Type a starting point instead.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  /** Resolve a drive endpoint, falling back to the route pane's own resolver. */
  function resolveDriveEndpoint(text) {
    if (!text || !String(text).trim()) return Promise.resolve(null);
    return resolveEndpoint(String(text));
  }

  /**
   * Plan a drive: vehicle-aware route, then the speed limits, then the live
   * layers. Each stage paints as soon as it has something, so a slow or dead
   * feed never holds up the route itself.
   */
  function planDrive() {
    var body = els.driveBody;
    if (!body) return;
    var fromText = els.driveFrom ? els.driveFrom.value : '';
    var toText = els.driveTo ? els.driveTo.value : '';
    clear(body);
    body.appendChild(make('p', 'mm-muted', 'Planning the drive…'));
    Promise.all([resolveDriveEndpoint(fromText), resolveDriveEndpoint(toText)]).then(function (points) {
      var from = points[0];
      var to = points[1];
      if (!from || !to) {
        clear(body);
        body.appendChild(make('p', 'mm-note warn', 'I could not work out one of those places. Try a town name, a postcode, “51.5074, -0.1278”, a Plus Code or an OS grid reference.'));
        return;
      }
      drive.from = from;
      drive.to = to;
      lastRoutePoints = { from: from, to: to };
      // Keep the Route pane in step: two panels, one journey.
      if (els.fromField) els.fromField.value = fromText;
      if (els.toField) els.toField.value = toText;
      state.routeMode = 'car';

      map.setMarkers([
        { lat: from.lat, lon: from.lon, label: 'Start: ' + (from.name || MM.geodesy.formatLatLon(from, null, 3)), colour: '#2dd4ff' },
        { lat: to.lat, lon: to.lon, label: 'End: ' + (to.name || MM.geodesy.formatLatLon(to, null, 3)), colour: '#ffd400' },
      ]);
      map.fitBounds([from, to], { padding: 80 });
      if (live && live.map) live.map.fitBounds([[from.lon, from.lat], [to.lon, to.lat]], { padding: 80, duration: 600 });

      var started = Date.now();
      return MM.providers.driveRoute(from, to, driveOptions()).then(function (route) {
        route.requestMs = route.requestMs || (Date.now() - started);
        drive.route = route;
        state.route = route;
        drive.navigationMode = 'car';
        if (route.geometry) {
          map.setPath(route.geometry);
          drawLiveRoute(route.geometry);
        }
        renderDriveRoute(route);
        if (!route.straightLine && route.geometry && route.geometry.length > 1) enrichDrive(route);
        return route;
      });
    }).catch(function (error) {
      clear(body);
      body.appendChild(make('p', 'mm-note bad', 'Planning failed: ' + error.message));
    });
  }

  function renderDriveRoute(route) {
    var body = els.driveBody;
    clear(body);
    var from = drive.from;
    var to = drive.to;

    if (route.straightLine) {
      body.appendChild(make('p', 'mm-note bad', 'No driving router could be reached just now, so nothing here would be honest: this is the straight-line distance, not a road route. The map, the maths and the offline tools below still work.'));
    } else {
      var shape = routePreferenceLabel(route.preference || drive.prefs.routePreference);
      if (route.preferenceHonoured === false) shape += ' requested';
      body.appendChild(make('p', 'mm-route-summary', shape + ' driving route · ' + (route.provider ? route.provider.name : 'open router')));
      if (route.routeWarning) body.appendChild(make('p', 'mm-note warn', route.routeWarning));
    }

    var stats = make('div', 'mm-grid3');
    stats.appendChild(statCard('Distance', fmtKm(route.distanceKm), route.straightLine ? 'as the crow flies' : 'by road'));
    if (route.durationMinutes) {
      stats.appendChild(statCard('Free-flow time', fmtDuration(route.durationMinutes), 'no traffic delay added'));
    } else {
      stats.appendChild(statCard('Time', '—', 'router gave no time'));
    }
    var arrival = route.durationMinutes ? new Date(Date.now() + route.durationMinutes * 60000) : null;
    stats.appendChild(statCard('If you left now', arrival ? fmtTime(arrival) : '—', 'free-flow estimate'));
    body.appendChild(stats);

    if (route.degraded) {
      body.appendChild(make('p', 'mm-note warn', (route.vehicleNote || 'The vehicle-aware router was unreachable, so this is a standard car route.') + ' (Valhalla said: ' + route.reason + ')'));
    }
    if (route.motorways === false && !route.straightLine) body.appendChild(make('p', 'mm-note', 'This route uses no motorways.'));
    if (route.tolls) body.appendChild(make('p', 'mm-note', 'This route includes a toll road.'));

    var dl = make('dl', 'mm-kv');
    kvRow(dl, 'From', (from.name ? from.name + ' — ' : '') + MM.geodesy.formatLatLon(from, null, 4));
    kvRow(dl, 'To', (to.name ? to.name + ' — ' : '') + MM.geodesy.formatLatLon(to, null, 4));
    kvRow(dl, 'Vehicle', MM.speed.vehicleInfo(drive.prefs.vehicle).label);
    if (route.provider) kvRow(dl, 'Routing', route.provider.name + ' · ' + route.provider.licence);
    if (route.requestMs) kvRow(dl, 'Answered in', route.requestMs + ' ms');
    if (route.motorways) kvRow(dl, 'Motorways', 'yes');
    body.appendChild(dl);

    // Alternatives: a real choice is the point of a routing engine.
    if (route.simple && route.simple.length) {
      var box = make('div', 'mm-drive-alt');
      box.appendChild(make('h3', null, 'Other ways to go'));
      route.simple.forEach(function (alternative, index) {
        var row = make('button', 'mm-alt-row');
        row.type = 'button';
        var title = make('b', null, fmtKm(alternative.distanceKm));
        var detail = make('span', 'mm-muted', fmtDuration(alternative.durationMinutes) + (alternative.tolls ? ' · tolls' : '') + (alternative.motorways === false ? ' · no motorways' : ''));
        row.appendChild(title);
        row.appendChild(detail);
        row.addEventListener('click', function () {
          // Alternates are a valid answer in their own right: show one, and say
          // that the detailed layers belong to the route you originally asked
          // for, so nothing gets mislabelled.
          if (alternative.geometry) {
            map.setPath(alternative.geometry);
            drawLiveRoute(alternative.geometry);
          }
          toast('Showing alternative ' + (index + 1) + ' — ' + fmtKm(alternative.distanceKm) + ', ' + fmtDuration(alternative.durationMinutes) + '. The speed limits and live layers below describe the first route.');
        });
        box.appendChild(row);
      });
      body.appendChild(box);
    }

    var cost = make('div', null);
    cost.id = 'mm-drive-cost';
    body.appendChild(cost);
    drive.nodes.cost = cost;
    drive.nodes.bodies = {};
    renderDriveCost(route.distanceKm, route.durationMinutes);

    // Placeholders that fill in as the live layers answer.
    var sections = make('div', null);
    sections.id = 'mm-drive-sections';
    body.appendChild(sections);
    drive.nodes.sections = sections;
    addDriveSection('limits', 'Speed limits', 'Checking the signed limits along the route…');
    addDriveSection('traffic', 'Live traffic', 'Checking for live disruption…');
    addDriveSection('weather', 'Weather when you get there', 'Checking the forecast along the route…');
    addDriveSection('stops', 'Stops on the way', 'Looking for services and chargers…');
    addDriveSection('cameras', 'Cameras', 'Checking for fixed cameras…');
    addDriveSection('glare', 'Sun in your eyes', '');

    var actions = make('div', 'mm-btn-row');
    actions.style.marginTop = '10px';
    var navigate = make('button', 'mm-btn primary', '🧭 Navigate');
    navigate.type = 'button';
    navigate.addEventListener('click', function () { startGuidance(); });
    actions.appendChild(navigate);
    var share = make('button', 'mm-btn ghost', 'Share this drive');
    share.type = 'button';
    share.addEventListener('click', function () { copyText(shareUrl(), 'Drive link copied'); });
    actions.appendChild(share);
    body.appendChild(actions);
    body.appendChild(make('p', 'mm-muted', 'Routes: OpenStreetMap data via Valhalla (ODbL). Speed limits: OpenStreetMap via Overpass (ODbL). Weather: Open-Meteo (CC BY 4.0). Traffic: TfL Open Data. Nothing here is a substitute for the signs, signals or the road itself.'));

    // Sun glare is computed offline, from the route's own heading and the sun.
    if (drive.session) drive.session = null;
    buildDriveSession(route, drive.navigationMode || 'car');
    renderGlare();
  }

  function addDriveSection(id, title, placeholder) {
    var sections = drive.nodes.sections;
    if (!sections) return null;
    var box = make('section', 'mm-drive-section');
    box.id = 'mm-drive-' + id;
    box.appendChild(make('h3', null, title));
    var bodyBox = make('div', 'mm-drive-section-body');
    bodyBox.id = 'mm-drive-' + id + '-body';
    if (placeholder) bodyBox.appendChild(make('p', 'mm-muted', placeholder));
    box.appendChild(bodyBox);
    sections.appendChild(box);
    drive.nodes.bodies[id] = bodyBox;
    return bodyBox;
  }

  function driveSectionBody(id) { return drive.nodes.bodies[id] || null; }

  function renderDriveCost(distanceKm, durationMinutes) {
    var host = drive.nodes.cost;
    if (!host || distanceKm == null) return;
    clear(host);
    var cost = MM.drive.costEstimate(distanceKm, {
      units: state.units,
      litresPer100Km: drive.prefs.consumptionPer100,
      pricePerLitre: drive.prefs.pricePerLitre,
      currency: 'GBP',
    });
    var dl = make('dl', 'mm-kv');
    kvRow(dl, 'Fuel for this drive', '≈ £' + cost.cost.toFixed(2) + ' (' + cost.litres.toFixed(1) + ' litres)');
    kvRow(dl, 'Your figures', cost.basis);
    if (durationMinutes) kvRow(dl, 'Arrive with', Math.round(durationMinutes) + ' minutes of driving done');
    host.appendChild(dl);
    host.appendChild(make('p', 'mm-muted', 'Your own consumption and price, never a market average dressed up as one.'));
  }

  /** The offline session: progress, manoeuvres, limits, breaks and glare. */
  function buildDriveSession(route, modeOverride) {
    if (!route || !route.geometry || route.geometry.length < 2) return null;
    var vehicle = modeOverride || drive.prefs.vehicle;
    drive.session = MM.drive.createSession({
      geometry: route.geometry,
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      steps: route.steps,
      speedLimits: drive.limits ? drive.limits.segments : null,
    }, {
      vehicle: vehicle,
      units: state.units,
      breakEveryMinutes: vehicle === 'car' || vehicle === 'caravan' || vehicle === 'van' || vehicle === 'motorhome' || vehicle === 'hgv' ? drive.prefs.breakEveryMinutes : 0,
    });
    return drive.session;
  }

  /** Kick off every live layer: independent, labelled, and allowed to fail. */
  function enrichDrive(route) {
    var geometry = route.geometry;
    var wants = drive.overlays;

    if (wants.limits !== false) {
      var current = driveSectionBody('limits');
      var progress = make('p', 'mm-muted', 'Checking the signed limits along the route…');
      if (current) { clear(current); current.appendChild(progress); }
      MM.providers.speedLimitWays(geometry, {
        onProgress: function (step) {
          progress.textContent = 'Checking the signed limits along the route… (' + (step.done + 1) + ' of ' + step.total + ' stretches)';
        },
      }).then(function (result) {
        if (!result.ways.length) {
          if (current) {
            clear(current);
            current.appendChild(make('p', 'mm-note warn', 'OpenStreetMap had no speed-limit data along this route just now'
              + (result.failures.length ? ' (Overpass reported: ' + result.failures[0] + ')' : '') + '. The limits below are country defaults for your vehicle, and say so.'));
            renderCountryDefaults(route, result, current, true);
          }
          return null;
        }
        var limits = MM.drive.limitsFromWays(geometry, {
          ways: result.ways,
          spacingKm: 0.2,
          matchRadiusMetres: 40,
          vehicle: drive.prefs.vehicle,
          countryAt: countryGuessAt,
          urbanAt: urbanGuessAt,
          scotlandOrNI: scotlandOrNIAt,
        });
        drive.limits = limits;
        if (drive.session) drive.session.limits = MM.drive.normaliseLimits(limits.segments, limits.totalKm);
        renderLimits(limits, result);
        paintDriveMarkers();
        return limits;
      }).catch(function (error) {
        if (!current) return;
        clear(current);
        current.appendChild(make('p', 'mm-note warn', 'The speed-limit check failed: ' + error.message + '. The route, the guidance and the maths below are unaffected — and no limit is invented to fill the gap.'));
      });
    }

    if (wants.traffic !== false) {
      MM.providers.trafficAlong(geometry).then(function (traffic) {
        drive.layers.traffic = traffic;
        renderTraffic(traffic);
        paintDriveMarkers();
      }).catch(function (error) {
        renderTraffic({ events: [], error: error.message });
      });
    } else {
      renderTraffic(null);
    }

    if (wants.weather !== false) {
      var samples = weatherSamples(route);
      MM.providers.weatherAlong(samples, { startAt: new Date() }).then(function (weather) {
        drive.layers.weather = weather;
        renderWeather(weather, route);
      }).catch(function (error) {
        renderWeather({ points: [], error: error.message }, route);
      });
    } else {
      renderWeather(null, route);
    }

    if (wants.stops !== false) {
      MM.providers.stopsAlong(geometry, {}).then(function (stops) {
        drive.layers.stops = stops;
        renderStops(stops);
        paintDriveMarkers();
      }).catch(function (error) {
        renderStops({ stops: [], error: error.message });
      });
    } else {
      renderStops(null);
    }

    if (wants.cameras !== false && camerasArePublishable(route)) {
      MM.providers.camerasAlong(geometry, {}).then(function (cameras) {
        drive.layers.cameras = cameras;
        renderCameras(cameras);
        paintDriveMarkers();
      }).catch(function (error) {
        renderCameras({ cameras: [], error: error.message });
      });
    } else if (wants.cameras !== false) {
      renderCameras(null, true);
    } else {
      renderCameras(null);
    }
  }

  /**
   * Fixed-camera locations are only published here for the countries where
   * that is lawful and the community maps them deliberately: Great Britain and
   * Ireland. Anywhere else the layer stays off and the panel says why.
   */
  function camerasArePublishable(route) {
    var start = route.geometry && route.geometry[0];
    if (!start) return false;
    var cc = countryGuessAt(start[1], start[0]);
    if (cc) return cc === 'GB' || cc === 'IE';
    // The gazetteer and the country polygons both arrive later than the route
    // does, so fall back to rough bounding boxes for the two countries this
    // layer is allowed in. A route that is not in them simply keeps the layer
    // off, which is the safe direction to be wrong in.
    var lat = start[1];
    var lon = start[0];
    var greatBritain = lat > 49.8 && lat < 61.1 && lon > -8.3 && lon < 2.1 && lat < 61.1;
    var ireland = lat > 51.3 && lat < 55.5 && lon > -10.7 && lon < -5.8;
    return greatBritain || ireland;
  }

  /** Country at a point, from the offline gazetteer's nearest town. */
  function countryGuessAt(lat, lon) {
    var near = nearestTown(lat, lon, 0);
    if (!near || near.km > 120) return null;
    return near.cc || null;
  }

  /**
   * Built-up area, without shipping a building-footprint dataset: within 6 km
   * of a town of 5,000+ people. It is a proxy, and the panel says so wherever
   * it is used to justify a 20 or 30 mph default.
   */
  function urbanGuessAt(lat, lon) {
    var near = nearestTown(lat, lon, 5000);
    return !!(near && near.km < 6);
  }

  /**
   * The nearest town the offline gazetteer knows about, or null when it has
   * not loaded. `nearest` is a method on the loaded Gazetteer instance, which
   * is why every caller goes through here rather than the namespace.
   */
  function nearestTown(lat, lon, minPopulation) {
    if (!gazetteer || typeof gazetteer.nearest !== 'function' || !gazetteer.cities.length) return null;
    var rows = gazetteer.nearest({ lat: lat, lon: lon }, 1, minPopulation ? { minPop: minPopulation } : null);
    return rows && rows.length ? rows[0] : null;
  }

  function scotlandOrNIAt(lat, lon) {
    var cc = countryGuessAt(lat, lon);
    if (cc !== 'GB') return false;
    if (lat > 54.6) return true; // Scotland, roughly
    if (lon < -5.4 && lat > 54.0) return true; // Northern Ireland
    return false;
  }

  function weatherSamples(route) {
    var out = [];
    var fractions = [0, 0.25, 0.5, 0.75, 1];
    var total = route.distanceKm || 1;
    var durationMinutes = route.durationMinutes || 0;
    for (var i = 0; i < fractions.length; i += 1) {
      var point = drive.session ? drive.session.atKm(total * fractions[i]) : null;
      if (!point) continue;
      out.push({ lat: point.lat, lon: point.lon, alongKm: total * fractions[i], etaMinutes: durationMinutes * fractions[i] });
    }
    return out;
  }

  // -------------------------------------------------------- speed limits UI

  function limitColour(kph) {
    if (kph == null) return '#7b8794';
    if (kph >= 110) return '#3b82f6';
    if (kph >= 90) return '#0ea5b7';
    if (kph >= 60) return '#22c55e';
    if (kph >= 45) return '#f59e0b';
    return '#ef4757';
  }

  function renderLimits(limits, source) {
    var host = driveSectionBody('limits');
    if (!host) return;
    clear(host);

    var summary = MM.drive.limitSummary(limits.segments);
    var dl = make('dl', 'mm-kv');
    kvRow(dl, 'Limits matched from OSM', Math.round(limits.coverage * 100) + '% of the route');
    kvRow(dl, 'Stretches', limits.segments.length + ' limit changes over ' + fmtKm(limits.totalKm));
    kvRow(dl, 'Source', (source.provider ? source.provider.name : 'Overpass API') + ' · ' + (source.provider ? source.provider.licence : 'ODbL'));
    host.appendChild(dl);

    if (limits.coverage < 0.85) {
      host.appendChild(make('p', 'mm-note warn', 'Only ' + Math.round(limits.coverage * 100) + '% of this route is covered by OSM speed-limit data. The gaps below are country defaults for your vehicle and are labelled as assumed — the signs on the road are the ones that count.'));
    }

    var list = make('ul', 'mm-limit-list');
    summary.forEach(function (row) {
      var item = make('li', 'mm-limit-row');
      var sign = make('span', 'mm-limit-sign');
      sign.style.borderColor = limitColour(row.kph);
      sign.textContent = row.kph == null ? '?' : (state.units === 'imperial' || drive.prefs.vehicle ? Math.round(row.mph || MM.speed.kphToMph(row.kph)) : Math.round(row.kph));
      item.appendChild(sign);
      var text = make('span');
      text.appendChild(make('b', null, fmtKm(row.km)));
      text.appendChild(doc.createTextNode(' · ' + (row.signedKm > 0 ? fmtKm(row.signedKm) + ' signed' : '') + (row.assumedKm > 0 ? (row.signedKm > 0 ? ', ' : '') + fmtKm(row.assumedKm) + ' assumed' : '')));
      item.appendChild(text);
      list.appendChild(item);
    });
    host.appendChild(list);
    host.appendChild(make('p', 'mm-muted', 'A “signed” stretch is one OpenStreetMap records a limit for. An “assumed” stretch uses the national default for that road type and your vehicle — which is why a car towing a caravan sees 50 mph where a car sees 60.'));

    var profile = make('div', 'mm-limit-profile');
    limits.segments.forEach(function (segment) {
      var bar = make('span', 'mm-limit-seg');
      bar.style.width = Math.max(0.4, ((segment.toKm - segment.fromKm) / limits.totalKm) * 100) + '%';
      bar.style.background = limitColour(segment.kph);
      bar.title = Math.round(segment.fromKm) + '–' + Math.round(segment.toKm) + ' km: ' + (segment.kph == null ? 'unknown' : MM.speed.formatLimit({ kph: segment.kph, unlimited: false }, state.units)) + ' (' + (segment.source === 'signed' ? 'signed' : segment.basis || 'assumed') + ')';
      profile.appendChild(bar);
    });
    host.appendChild(profile);
  }

  function renderCountryDefaults(route, source, host, warn) {
    // No OSM limits at all: still give the driver the country's own defaults,
    // clearly marked, rather than an empty panel.
    var samples = [];
    var step = Math.max(1, Math.floor((route.geometry || []).length / 8));
    for (var i = 0; i < (route.geometry || []).length; i += step) {
      var coordinate = route.geometry[i];
      samples.push({ lat: coordinate[1], lon: coordinate[0], km: (route.distanceKm || 0) * (i / Math.max(1, route.geometry.length - 1)) });
    }
    var list = make('ul', 'mm-limit-list');
    samples.forEach(function (sample) {
      var cc = countryGuessAt(sample.lat, sample.lon);
      var urban = urbanGuessAt(sample.lat, sample.lon);
      var limit = MM.speed.fromTags({ highway: urban ? 'residential' : 'secondary' }, {
        country: cc, urban: urban, vehicle: drive.prefs.vehicle,
        wales: cc === 'GB' && MM.drive.isWales(sample.lat, sample.lon),
        scotlandOrNI: scotlandOrNIAt(sample.lat, sample.lon),
      });
      var item = make('li', 'mm-limit-row');
      var sign = make('span', 'mm-limit-sign');
      sign.style.borderColor = limitColour(limit.kph);
      sign.textContent = limit.kph == null ? '?' : Math.round(MM.speed.kphToMph(limit.kph));
      item.appendChild(sign);
      item.appendChild(make('span', null, 'Around ' + Math.round(sample.km) + ' km: ' + MM.speed.formatLimit(limit, state.units) + ' · ' + MM.speed.basisLabel(limit) + (urban ? ' (built-up)' : '')));
      list.appendChild(item);
    });
    host.appendChild(list);
    host.appendChild(make('p', 'mm-muted', 'Country defaults for what you are driving. Built-up areas are inferred from the nearest town of 5,000+ people — a proxy, not a survey.'));
  }

  // ------------------------------------------------------------ live layers

  function renderTraffic(traffic) {
    var host = driveSectionBody('traffic');
    if (!host) return;
    clear(host);
    if (!traffic) {
      host.appendChild(make('p', 'mm-muted', 'Traffic layer switched off. Times shown are free-flow estimates from the router, not live traffic.'));
      return;
    }
    if (traffic.error) {
      host.appendChild(make('p', 'mm-note warn', 'TfL could not be reached, so no live traffic is shown. Nothing is being invented to fill the gap — the times here are the router’s free-flow estimate.'));
      return;
    }
    if (traffic.coverage === 'none') {
      host.appendChild(make('p', 'mm-note warn', traffic.note || 'No key-free live traffic feed covers this route.'));
      host.appendChild(make('p', 'mm-muted', 'Free live traffic that needs no key is scarce: Transport for London publishes it for the capital, National Highways does not (their DATEX II feed needs a subscription key, and a key cannot be shipped to a browser). Speed limits, weather and guidance below are unaffected.'));
      return;
    }
    var provider = traffic.provider ? traffic.provider.name + ' · ' + traffic.provider.licence + ' · ' + traffic.provider.home : 'TfL';
    if (!traffic.events.length) {
      host.appendChild(make('p', 'mm-note good', traffic.note || 'No disruption reported on this route right now.'));
      host.appendChild(make('p', 'mm-muted', 'Coverage: ' + (traffic.coverage || 'unknown') + '. Source: ' + provider + '.'));
      return;
    }
    host.appendChild(make('p', 'mm-note warn', traffic.events.length + ' live ' + (traffic.events.length === 1 ? 'disruption' : 'disruptions') + ' on or beside this route.'));
    var list = make('ul', 'mm-event-list');
    traffic.events.slice(0, 8).forEach(function (event) {
      var item = make('li', 'mm-event-row');
      item.appendChild(make('b', null, event.severityLabel ? event.severityLabel + ': ' : ''));
      item.appendChild(doc.createTextNode(event.title));
      if (event.alongKm != null) item.appendChild(make('span', 'mm-muted', ' · ' + Math.round(event.alongKm) + ' km along'));
      list.appendChild(item);
    });
    host.appendChild(list);
    host.appendChild(make('p', 'mm-muted', 'Coverage: ' + (traffic.coverage || 'unknown') + '. Source: ' + provider + '. Free-flow times elsewhere on this page do not include traffic delay.'));
  }

  function renderWeather(weather, route) {
    var host = driveSectionBody('weather');
    if (!host) return;
    clear(host);
    if (!weather) {
      host.appendChild(make('p', 'mm-muted', 'Weather layer switched off.'));
      return;
    }
    if (weather.error || !weather.points.length) {
      host.appendChild(make('p', 'mm-note warn', 'The forecast could not be reached, so no weather is shown. The drive planning below does not depend on it.'));
      return;
    }
    var warnings = [];
    var windWarnings = [];
    var seenWarnings = {};
    function addWarning(bucket, text) {
      if (seenWarnings[text]) return;
      seenWarnings[text] = true;
      bucket.push(text);
    }
    var list = make('ul', 'mm-weather-list');
    weather.points.forEach(function (point) {
      var description = weatherDescription(point.weatherCode);
      var item = make('li', 'mm-weather-row');
      var when = point.etaMinutes ? (point.etaMinutes < 60 ? Math.round(point.etaMinutes) + ' min in' : (point.etaMinutes / 60).toFixed(1) + ' h in') : 'now';
      item.appendChild(make('b', null, 'At ' + Math.round(point.alongKm || 0) + ' km (' + when + ')'));
      var details = [];
      if (point.temperatureC != null) details.push(Math.round(point.temperatureC) + '°C');
      if (description) details.push(description);
      if (point.precipitationChance != null && point.precipitationChance >= 20) details.push(point.precipitationChance + '% chance of rain');
      if (point.windKph != null) details.push('wind ' + Math.round(point.windKph) + ' km/h' + (point.gustKph != null ? ' gusting ' + Math.round(point.gustKph) : ''));
      if (point.visibilityM != null && point.visibilityM < 2000) details.push('visibility ' + Math.round(point.visibilityM) + ' m');
      item.appendChild(make('span', 'mm-muted', details.join(' · ')));
      list.appendChild(item);
      if (point.precipitationChance != null && point.precipitationChance >= 50) {
        addWarning(warnings, 'rain likely ' + (point.etaMinutes > 60 ? (point.etaMinutes / 60).toFixed(1) + ' hours in' : 'within the hour') + ' around ' + Math.round(point.alongKm || 0) + ' km');
      }
      if (point.weatherCode != null && (point.weatherCode === 45 || point.weatherCode === 48)) addWarning(warnings, 'fog on the route');
      if (point.weatherCode != null && (point.weatherCode === 71 || point.weatherCode === 73 || point.weatherCode === 75 || point.weatherCode === 85 || point.weatherCode === 86)) addWarning(warnings, 'snow on the route');
      if (point.weatherCode != null && point.weatherCode >= 95) addWarning(warnings, 'thunderstorms on the route');
      if (point.gustKph != null && point.gustKph >= 55) addWarning(windWarnings, 'strong gusts (' + Math.round(point.gustKph) + ' km/h)');
      if (point.visibilityM != null && point.visibilityM < 1000) addWarning(warnings, 'low visibility');
    });
    host.appendChild(list);
    var allWarnings = warnings.concat(windWarnings);
    if (allWarnings.length) host.appendChild(make('p', 'mm-note warn', 'Worth knowing: ' + allWarnings.slice(0, 3).join('; ') + '.'));
    host.appendChild(make('p', 'mm-muted', 'Open-Meteo (CC BY 4.0), sampled at five points along the route at the hour you would reach each one. Forecasts are forecasts.'));
  }

  function weatherDescription(code) {
    if (code == null) return null;
    var table = {
      0: 'clear', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog',
      51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
      61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
      71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'light showers', 81: 'showers',
      82: 'heavy showers', 85: 'snow showers', 86: 'heavy snow showers', 95: 'thunderstorm', 96: 'thunderstorm with hail',
      99: 'thunderstorm with heavy hail',
    };
    return table[code] || null;
  }

  function renderStops(stops) {
    var host = driveSectionBody('stops');
    if (!host) return;
    clear(host);
    if (!stops || stops.error || !stops.stops.length) {
      host.appendChild(make('p', 'mm-muted', stops && stops.error ? 'OpenStreetMap’s Overpass API could not be reached, so no stops are listed.' : 'No services, fuel, chargers or loos are mapped within 1.5 km of this route.'));
      return;
    }
    var session = drive.session;
    var ordered = session ? MM.drive.orderStopsAlong(stops.stops, session) : stops.stops;
    drive.stopsOrdered = ordered.slice(0, 40);
    if (!ordered.length) {
      host.appendChild(make('p', 'mm-muted', stops.stops.length + ' places are mapped within 1.5 km of the corridor, but none is within 2.5 km of the road itself — nothing worth a detour, so nothing is listed.'));
      return;
    }
    var shown = ordered.slice(0, 8);
    var list = make('ul', 'mm-event-list');
    shown.forEach(function (stop) {
      var item = make('li', 'mm-event-row');
      item.appendChild(make('b', null, stop.name));
      var detail = [stop.kind];
      if (stop.facilities && stop.facilities.length) detail.push(stop.facilities.slice(0, 4).join(', '));
      if (stop.alongKm != null) detail.push(Math.round(stop.alongKm) + ' km along, ' + (stop.detourKm * 1000 < 100 ? 'on the road' : Math.round(stop.detourKm * 1000) + ' m off it'));
      item.appendChild(make('span', 'mm-muted', ' · ' + detail.join(' · ')));
      item.addEventListener('click', function () {
        focusPoint({ lat: stop.lat, lon: stop.lon }, 14);
      });
      item.style.cursor = 'pointer';
      list.appendChild(item);
    });
    host.appendChild(list);
    host.appendChild(make('p', 'mm-muted', ordered.length + ' stops mapped within 1.5 km of the route, ' + stops.provider.name + ' · ' + stops.provider.licence + '. Tap one to look at it.'));
  }

  function renderCameras(cameras, skipped) {
    var host = driveSectionBody('cameras');
    if (!host) return;
    clear(host);
    if (skipped) {
      host.appendChild(make('p', 'mm-muted', 'Fixed camera locations are only shown for Great Britain and Ireland, where they are mapped for this purpose. Publishing them is restricted or ambiguous in other countries, so this layer stays off rather than guess.'));
      return;
    }
    if (!cameras) {
      host.appendChild(make('p', 'mm-muted', 'Camera layer switched off.'));
      return;
    }
    if (cameras.error) {
      host.appendChild(make('p', 'mm-muted', 'The camera check could not be reached.'));
      return;
    }
    if (!cameras.cameras.length) {
      host.appendChild(make('p', 'mm-note good', 'No fixed cameras mapped within 45 m of this route.'));
      host.appendChild(make('p', 'mm-muted', 'OpenStreetMap community mapping, so absence is not proof of absence — and mobile, average-speed and red-light cameras are not all in the data.'));
      return;
    }
    host.appendChild(make('p', 'mm-note warn', cameras.cameras.length + ' fixed ' + (cameras.cameras.length === 1 ? 'camera' : 'cameras') + ' mapped on or beside this route.'));
    var list = make('ul', 'mm-event-list');
    cameras.cameras.slice(0, 6).forEach(function (camera) {
      var item = make('li', 'mm-event-row');
      item.appendChild(make('b', null, '📷 ' + camera.type));
      item.appendChild(make('span', 'mm-muted', ' · ' + MM.geodesy.formatLatLon({ lat: camera.lat, lon: camera.lon }, null, 4)));
      list.appendChild(item);
    });
    host.appendChild(list);
    host.appendChild(make('p', 'mm-muted', 'An information layer, not a warning system, and not advice about speed. ' + cameras.provider.name + ', ' + cameras.provider.licence + '.'));
  }

  function renderGlare() {
    var host = driveSectionBody('glare');
    if (!host || !drive.session) return;
    clear(host);
    var windows = drive.session.glareWindows(new Date());
    if (!windows.length) {
      host.appendChild(make('p', 'mm-muted', 'No stretch of this drive has the sun low and directly ahead in the next two hours — at least not from this route\'s heading and the sun\'s position, which is all that can honestly be predicted.'));
      return;
    }
    var list = make('ul', 'mm-event-list');
    windows.slice(0, 4).forEach(function (window) {
      var item = make('li', 'mm-event-row');
      item.appendChild(make('b', null, '☀️ Around ' + Math.round(window.fromKm) + '–' + Math.round(window.toKm) + ' km'));
      item.appendChild(make('span', 'mm-muted', ' · sun ' + Math.round(window.altitude) + '° up, ' + Math.abs(Math.round(window.heading)) + '° off your heading · leaves at ' + fmtTime(window.fromTime)));
      list.appendChild(item);
    });
    host.appendChild(list);
    host.appendChild(make('p', 'mm-muted', 'Worked out on this device from the route’s own heading and the sun’s position — no glare dataset exists, and none is invented. A low sun also means a dirty windscreen and low-level dazzle, so a 1.5 second gap becomes a 4 second one.'));
  }

  function renderDriveSources() {
    if (!els.driveSources) return;
    els.driveSources.textContent = 'Routing: Valhalla on OpenStreetMap data (ODbL), FOSSGIS public instance · Speed limits and stops: OpenStreetMap via Overpass (ODbL) · Weather: Open-Meteo (CC BY 4.0) · Traffic: TfL Open Data (London only). Your vehicle settings stay in this browser.';
  }

  // ------------------------------------------------------------- map layers

  function paintDriveMarkers() {
    if (!drive.route || !drive.route.geometry) return;
    var markers = [];
    if (drive.from) markers.push({ lat: drive.from.lat, lon: drive.from.lon, label: 'Start', colour: '#2dd4ff' });
    if (drive.to) markers.push({ lat: drive.to.lat, lon: drive.to.lon, label: 'End', colour: '#ffd400' });

    if (drive.overlays.limits !== false && drive.limits && drive.limits.segments.length) {
      var last = null;
      drive.limits.segments.forEach(function (segment) {
        var key = segment.kph == null ? 'x' : Math.round(segment.kph);
        if (key === last) return;
        last = key;
        var point = drive.session ? drive.session.atKm(segment.fromKm) : null;
        if (!point) return;
        markers.push({
          lat: point.lat, lon: point.lon,
          label: segment.kph == null ? '?' : String(Math.round(MM.speed.kphToMph(segment.kph))) + (segment.source === 'signed' ? '' : '≈'),
          colour: limitColour(segment.kph),
        });
      });
    }
    if (drive.overlays.traffic !== false && drive.layers.traffic && drive.layers.traffic.events) {
      drive.layers.traffic.events.slice(0, 12).forEach(function (event) {
        markers.push({ lat: event.lat, lon: event.lon, label: '⚠ ' + (event.severityLabel || 'disruption'), colour: '#ef4757' });
      });
    }
    if (drive.overlays.stops !== false && drive.stopsOrdered) {
      drive.stopsOrdered.slice(0, 6).forEach(function (stop) {
        markers.push({ lat: stop.lat, lon: stop.lon, label: stop.kind === 'EV charging' ? '🔌' : stop.kind === 'services' ? '🛣' : '⛽', colour: '#a3e635' });
      });
    }
    if (drive.overlays.cameras !== false && drive.layers.cameras && drive.layers.cameras.cameras) {
      drive.layers.cameras.cameras.slice(0, 12).forEach(function (camera) {
        markers.push({ lat: camera.lat, lon: camera.lon, label: '📷', colour: '#f59e0b' });
      });
    }
    drive.markers = markers;
    map.setMarkers(markers);
  }

  // ------------------------------------------------------------- guidance

  /**
   * Start navigating. Guidance is a completely local loop: a position, the
   * route you already have, and the limits already fetched. Losing the network
   * changes nothing here, which is exactly when you need it most.
   */
  function startGuidance() {
    if (!drive.route || drive.route.straightLine) {
      toast('Plan a driving route first — there is nothing honest to navigate yet.');
      return;
    }
    if (!drive.session) buildDriveSession(drive.route);
    if (!drive.session) return;
    if (els.nav) els.nav.hidden = false;
    drive.following = true;

    var started = false;
    function consume(fix) {
      var state = drive.session.update(fix);
      if (!state) return;
      if (!started) {
        started = true;
        if (drive.route.geometry && drive.route.geometry.length) {
          map.fitBounds([{ lat: drive.route.geometry[0][1], lon: drive.route.geometry[0][0] }, { lat: drive.route.geometry[drive.route.geometry.length - 1][1], lon: drive.route.geometry[drive.route.geometry.length - 1][0] }], { padding: 60 });
        }
      }
      renderGuidance(state);
    }
    drive.consumeFix = consume;

    if (root.navigator && root.navigator.geolocation && root.navigator.geolocation.watchPosition) {
      drive.watchId = root.navigator.geolocation.watchPosition(function (position) {
        consume({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          speedKph: position.coords.speed != null && position.coords.speed >= 0 ? position.coords.speed * 3.6 : null,
          heading: position.coords.heading != null && !isNaN(position.coords.heading) ? position.coords.heading : null,
          accuracyMetres: position.coords.accuracy,
        });
      }, function (error) {
        enableTapToMove(error);
      }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
      toast('Navigating. Keep this tab open — guidance stays on this device, even if the connection drops.');
    } else {
      enableTapToMove({ message: 'this browser has no location service' });
    }
  }

  function enableTapToMove(error) {
    drive.tapToMove = true;
    drive.tapHintShown = true;
    if (els.navAlert) {
      els.navAlert.hidden = false;
      clear(els.navAlert);
      els.navAlert.appendChild(make('span', null, 'No location from this device' + (error && error.message ? ' (' + error.message + ')' : '') + ': tap the map to move along the route, or stop at any time.'));
    }
    toast('No location service: tap the map to move along the route.');
  }

  function stopGuidance(showSummary) {
    if (drive.watchId != null && root.navigator && root.navigator.geolocation) {
      root.navigator.geolocation.clearWatch(drive.watchId);
      drive.watchId = null;
    }
    drive.tapToMove = false;
    drive.following = false;
    if (els.nav) els.nav.hidden = true;
    if (!showSummary || !drive.session) return;
    var summary = drive.session.finish();
    var host = driveSectionBody('limits');
    if (!host) return;
    var box = make('section', 'mm-drive-section');
    box.appendChild(make('h3', null, 'Trip so far'));
    var dl = make('dl', 'mm-kv');
    kvRow(dl, 'Driven', fmtKm(summary.distanceKm));
    kvRow(dl, 'Time', fmtDuration(summary.durationMinutes));
    kvRow(dl, 'Moving / stopped', fmtDuration(summary.movingSeconds / 60) + ' / ' + fmtDuration(summary.stoppedSeconds / 60));
    if (summary.maxSpeedKph) kvRow(dl, 'Fastest', state.units === 'imperial' ? Math.round(MM.speed.kphToMph(summary.maxSpeedKph)) + ' mph' : Math.round(summary.maxSpeedKph) + ' km/h');
    kvRow(dl, 'Stops', String(summary.stops));
    kvRow(dl, 'Off-route fixes', String(summary.offRouteCount));
    box.appendChild(dl);
    var button = make('button', 'mm-btn ghost', '⬇ Save this drive as GPX');
    button.type = 'button';
    button.addEventListener('click', function () { downloadFile('mostusefulmaps-drive.gpx', drive.session.toGpx('Drive'), 'application/gpx+xml'); });
    box.appendChild(button);
    box.appendChild(make('p', 'mm-muted', 'Recorded in this browser only: it is never uploaded. Save it now if you want to keep it.'));
    host.parentNode.insertBefore(box, host);
  }

  function downloadFile(name, text, type) {
    try {
      var blob = new Blob([text], { type: type || 'text/plain' });
      var url = URL.createObjectURL(blob);
      var link = doc.createElement('a');
      link.href = url;
      link.download = name;
      doc.body.appendChild(link);
      link.click();
      doc.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (error) {
      toast('This browser would not let me save the file.');
    }
  }

  /** The overlay: next manoeuvre, the limit, your speed, and how far is left. */
  function renderGuidance(nav) {
    if (!els.nav) return;
    if (els.navMode) els.navMode.textContent = drive.navigationMode === 'bike' ? 'Cycle navigation' : drive.navigationMode === 'foot' ? 'Walking navigation' : 'Driving navigation';
    if (els.navDistance) els.navDistance.textContent = nav.metresToNext == null ? '—' : fmtMetres(nav.metresToNext);
    if (els.navInstruction) {
      els.navInstruction.textContent = nav.next
        ? (nav.next.name && nav.next.instruction.indexOf(nav.next.name) < 0 ? nav.next.instruction + ' (' + nav.next.name + ')' : nav.next.instruction)
        : 'Continue on the route';
    }
    if (els.navIcon) els.navIcon.textContent = iconFor(nav.next || {});

    var imperial = state.units === 'imperial';
    var minimum = nav.limit && nav.limit.kph != null ? nav.limit.kph : null;
    if (els.navLimitValue) {
      els.navLimitValue.textContent = minimum == null
        ? '–'
        : (imperial ? String(Math.round(MM.speed.kphToMph(minimum))) : String(Math.round(minimum)));
    }
    if (els.navLimitUnit) {
      els.navLimitUnit.textContent = minimum == null
        ? (nav.limit && nav.limit.basis ? nav.limit.basis : 'limit unknown')
        : (imperial ? 'mph' : 'km/h') + (nav.limit.source === 'signed' ? '' : ' ≈');
    }
    if (els.navCurrentValue) {
      els.navCurrentValue.textContent = nav.speedMph == null
        ? '–'
        : String(Math.round(state.units === 'imperial' ? nav.speedMph : nav.speedKph));
    }
    if (els.navCurrentUnit) els.navCurrentUnit.textContent = state.units === 'imperial' ? 'mph' : 'km/h';
    if (els.navCurrentBox) {
      els.navCurrentBox.setAttribute('data-over', String(!!nav.overLimit));
      els.navCurrentBox.title = nav.overLimit
        ? 'Over the limit by about ' + Math.round(nav.overByKph) + ' km/h (the 10% + 2 mph enforcement threshold is already allowed for)'
        : 'Your speed';
    }
    if (els.navProgress) els.navProgress.style.width = Math.round(Math.max(0, Math.min(1, nav.progress)) * 100) + '%';
    if (els.navRemaining) els.navRemaining.textContent = fmtKm(nav.remainingKm) + ' · ' + (nav.remainingMinutes == null ? '—' : fmtDuration(nav.remainingMinutes));
    if (els.navEta) els.navEta.textContent = nav.eta ? 'ETA ' + fmtTime(nav.eta) : 'ETA —';
    if (els.navReplan) els.navReplan.hidden = !nav.needsReplan;
    if (els.navAlert) {
      var message = null;
      if (nav.offRoute) message = 'Off the route. ' + (nav.needsReplan ? 'Replan from here?' : 'Keep going and I will rejoin when I can.');
      else if (nav.breakDue) message = 'You have been driving for ' + Math.round(nav.continuousDrivingMinutes) + ' minutes. A break is worth more than a shortcut.';
      else if (nav.arrived) message = 'You have arrived.';
      else if (drive.tapToMove && !drive.tapHintShown) {
        message = 'No location from this device: tap the map to move along the route, or stop at any time.';
        drive.tapHintShown = true;
      }
      if (message) {
        els.navAlert.hidden = false;
        clear(els.navAlert);
        els.navAlert.appendChild(make('span', null, message));
      } else {
        els.navAlert.hidden = true;
      }
    }
    var phrase = drive.session.speak(nav);
    if (phrase && root.speechSynthesis && root.speechSynthesis.speak) {
      try {
        var utterance = new root.SpeechSynthesisUtterance(phrase);
        utterance.rate = 1.02;
        root.speechSynthesis.speak(utterance);
      } catch (error) { /* silent is fine */ }
    }
    if (drive.following) {
      map.panTo({ lat: nav.position.lat, lon: nav.position.lon });
      if (live && live.map) {
        try { live.map.easeTo({ center: [nav.position.lon, nav.position.lat], duration: 260 }); } catch (error) {}
      }
    }
  }

  /** A fresh route from where you actually are. */
  function replanFromHere() {
    if (!drive.session || !drive.session.state || !drive.to) return;
    var here = drive.session.state.position;
    if (drive.replanning) return;
    drive.replanning = true;
    toast('Replanning from where you are…');
    var replanPromise = drive.navigationMode && drive.navigationMode !== 'car'
      ? MM.providers.route({ lat: here.lat, lon: here.lon, name: 'Here' }, drive.to, drive.navigationMode, routeRequestOptions())
      : MM.providers.driveRoute({ lat: here.lat, lon: here.lon, name: 'Here' }, drive.to, driveOptions());
    replanPromise.then(function (route) {
      drive.replanning = false;
      if (route.straightLine) {
        toast('The router is unreachable, so I cannot honestly replan right now.');
        return;
      }
      drive.route = route;
      state.route = route;
      drive.limits = null;
      drive.layers = { traffic: null, weather: null, stops: null, cameras: null };
      drive.stopsOrdered = null;
      if (drive.watchId != null && root.navigator && root.navigator.geolocation) {
        root.navigator.geolocation.clearWatch(drive.watchId);
        drive.watchId = null;
      }
      drive.tapToMove = false;
      drive.consumeFix = null;
      if (route.geometry) {
        map.setPath(route.geometry);
        drawLiveRoute(route.geometry);
      }
      drive.from = { lat: here.lat, lon: here.lon, name: 'Here' };
      lastRoutePoints = { from: drive.from, to: drive.to };
      buildDriveSession(route, drive.navigationMode || 'car');
      if (drive.navigationMode && drive.navigationMode !== 'car') {
        state.routeMode = drive.navigationMode;
        renderRoute(route, drive.from, drive.to);
      } else {
        renderDriveRoute(route);
        if (route.geometry && route.geometry.length > 1) enrichDrive(route);
      }
      startGuidance();
      toast('Replanned: ' + fmtKm(route.distanceKm) + ', ' + fmtDuration(route.durationMinutes) + ' free-flow.');
    });
  }

  /**
   * In tap-to-move mode a map click stands in for a position fix. It goes
   * through exactly the same session code as a GPS fix, so what you see is
   * what the navigator will do.
   */
  function driveTapToMove(point) {
    if (!drive.tapToMove || !drive.session || !drive.consumeFix) return false;
    drive.consumeFix({ lat: point.lat, lon: point.lon, speedKph: null, heading: null });
    return true;
  }

  function bindTabs() {
    var buttons = els.tabs.querySelectorAll('[role="tab"]');
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener('click', function () { showPanel(button.getAttribute('data-mm-panel')); });
      button.addEventListener('keydown', function (event) {
        var list = Array.prototype.slice.call(buttons);
        var index = list.indexOf(button);
        var next = null;
        if (event.key === 'ArrowRight') next = list[(index + 1) % list.length];
        if (event.key === 'ArrowLeft') next = list[(index - 1 + list.length) % list.length];
        if (next) {
          event.preventDefault();
          next.focus();
          showPanel(next.getAttribute('data-mm-panel'));
        }
      });
    });
  }

  function showPanel(name) {
    if (PANELS.indexOf(name) < 0) return;
    state.panel = name;
    if (doc.body.classList.contains('rail-hidden')) {
      doc.body.classList.remove('rail-hidden');
      if (els.railToggle) els.railToggle.setAttribute('aria-expanded', 'true');
    }
    Array.prototype.forEach.call(els.tabs.querySelectorAll('[role="tab"]'), function (button) {
      var active = button.getAttribute('data-mm-panel') === name;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    Array.prototype.forEach.call(doc.querySelectorAll('.mm-pane'), function (pane) {
      pane.setAttribute('data-active', String(pane.id === 'mm-pane-' + name));
    });
    if (name === 'drive') fillDriveInputs();
    if (name === 'nearby' && !state.nearby.length) renderNearby();
    if (name === 'measure') renderMeasure();
  }

  // ------------------------------------------------------------------ hud

  function updateHud() {
    var center = state.center;
    var grid = gridRefText(center.lat, center.lon);
    var time = localTimeAt(center);
    clear(els.coord);
    var row1 = make('div', 'mm-coord-row');
    row1.appendChild(make('b', null, MM.geodesy.formatLatLon(center, null, 5)));
    row1.appendChild(doc.createTextNode('  ·  z' + state.zoom.toFixed(1)));
    els.coord.appendChild(row1);
    var row2 = make('div', 'mm-coord-row', MM.olc.encode(center.lat, center.lon) + (grid ? '  ·  ' + grid : '') + (time ? '  ·  ' + time.time + ' ' + time.zone : ''));
    els.coord.appendChild(row2);
  }

  function updateCoordReadout(view) {
    clear(els.coord);
    var hover = view.hover;
    var row1 = make('div', 'mm-coord-row');
    row1.appendChild(make('b', null, MM.geodesy.formatLatLon(hover, null, 5)));
    els.coord.appendChild(row1);
    var grid = gridRefText(hover.lat, hover.lon);
    els.coord.appendChild(make('div', 'mm-coord-row', MM.olc.encode(hover.lat, hover.lon) + (grid ? '  ·  ' + grid : '')));
  }

  function buildStatusChips() {
    updateStatusChips();
  }

  function updateStatusChips() {
    var box = els.status;
    if (!box) return;
    clear(box);
    var liveChip = make('span', 'mm-chip');
    var loadingLive = state.liveStatus === 'waiting';
    liveChip.setAttribute('data-state', state.live ? 'ok' : (loadingLive || state.liveStatus === 'failed' ? 'warn' : 'fail'));
    liveChip.appendChild(make('span', 'mm-dot'));
    liveChip.appendChild(make('span', null, state.live ? 'Live map' : state.liveStatus === 'offline' ? 'Offline map' : state.liveStatus === 'failed' ? 'Offline map (tiles unavailable)' : state.liveStatus === 'no-webgl' ? 'Offline map (no WebGL)' : 'Getting live map…'));
    box.appendChild(liveChip);

    var netChip = make('span', 'mm-chip');
    netChip.setAttribute('data-state', state.offline ? 'fail' : 'ok');
    netChip.appendChild(make('span', 'mm-dot'));
    netChip.appendChild(make('span', null, state.offline ? 'No connection' : 'Connected'));
    box.appendChild(netChip);

    var health = MM.providers.health();
    Object.keys(health).forEach(function (id) {
      var entry = health[id];
      if (!entry.calls) return;
      var chip = make('span', 'mm-chip');
      chip.setAttribute('data-state', entry.failures && !entry.lastOkAt ? 'fail' : entry.failures ? 'warn' : 'ok');
      chip.appendChild(make('span', 'mm-dot'));
      chip.appendChild(make('span', null, id + (entry.lastLatencyMs ? ' ' + entry.lastLatencyMs + ' ms' : '')));
      box.appendChild(chip);
    });
  }

  function updateAttribution() {
    clear(els.attrib);
    els.attrib.appendChild(doc.createTextNode(state.live
      ? '© OpenFreeMap · © OpenMapTiles · Data © OpenStreetMap contributors (ODbL)'
      : 'Offline map: Natural Earth (public domain) · places © GeoNames (CC BY 4.0)'));
    var link = make('a', null, ' details');
    link.href = '#mm-pane-info';
    link.addEventListener('click', function (event) { event.preventDefault(); showPanel('info'); });
    els.attrib.appendChild(link);
  }

  // ------------------------------------------------------------ geolocate

  function locate() {
    if (!root.navigator || !root.navigator.geolocation) {
      toast('This browser cannot share a location');
      return;
    }
    els.locateButton.disabled = true;
    toast('Asking the browser for your location…');
    root.navigator.geolocation.getCurrentPosition(function (position) {
      els.locateButton.disabled = false;
      var point = { lat: position.coords.latitude, lon: position.coords.longitude };
      state.markers = [{ lat: point.lat, lon: point.lon, label: 'You are here', colour: '#39ff14' }];
      map.setMarkers(state.markers);
      focusPoint(point, Math.max(14, state.zoom));
      var body = els.place;
      clear(body);
      body.appendChild(make('h3', null, 'Your location'));
      body.appendChild(make('p', 'tight', MM.geodesy.formatLatLon(point, null, 5)));
      body.appendChild(make('p', 'mm-muted', 'Read from your browser and kept on this device — it is never sent to a server by this page. Accuracy: about ' + Math.round(position.coords.accuracy || 0) + ' m.'));
      showPanel('place');
      updateNearest(point);
      var sun = make('div');
      body.appendChild(sun);
      renderSun(sun, point.lat, point.lon);
      var dl = make('dl', 'mm-kv');
      var time = localTimeAt(point);
      if (time) {
        kvRow(dl, 'Time zone', time.zone);
        kvRow(dl, 'Local time', time.time || '—');
      }
      body.appendChild(dl);
    }, function () {
      els.locateButton.disabled = false;
      toast('Location permission was declined — type a place instead');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  // -------------------------------------------------------------- keyboard

  function bindKeyboard() {
    doc.addEventListener('keydown', function (event) {
      var tag = event.target && event.target.tagName;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        els.search.focus();
        els.search.select();
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === '/') { event.preventDefault(); els.search.focus(); return; }
      if (event.key === 'm' || event.key === 'M') { els.measureToggle.click(); return; }
      if (event.key === 'l' || event.key === 'L') { locate(); return; }
      if (event.key === 'd' || event.key === 'D') { showPanel('drive'); return; }
      if (event.key === '?') { showPanel('info'); }
    });
  }

  function bindConnectivity() {
    root.addEventListener('online', function () {
      state.offline = false;
      updateStatusChips();
      toast('Back online — the live map will load again');
      if (!live) startLive();
    });
    root.addEventListener('offline', function () {
      state.offline = true;
      updateStatusChips();
      toast('Offline — the local map, search, measuring and sun times still work');
    });
  }

  // -------------------------------------------------------------- finishing

  var lastNearest = null;

  var finished = false;
  function finishBoot() {
    if (finished) return;
    finished = true;
    if (state.pendingQuery) {
      els.search.value = state.pendingQuery;
      runSearch(state.pendingQuery, true);
    }
    if (state.pendingRoute) {
      els.fromField.value = state.pendingRoute.from;
      els.toField.value = state.pendingRoute.to;
      Array.prototype.forEach.call(doc.querySelectorAll('[data-mm-mode]'), function (button) {
        button.setAttribute('aria-pressed', String(button.getAttribute('data-mm-mode') === state.pendingRoute.mode));
      });
      state.routeMode = state.pendingRoute.mode;
      if (state.panel === 'drive') {
        // A shared drive link reopens as a drive, with the same vehicle.
        if (els.driveFrom) els.driveFrom.value = state.pendingRoute.from;
        if (els.driveTo) els.driveTo.value = state.pendingRoute.to;
        showPanel('drive');
        planDrive();
      } else {
        showPanel('route');
        runRoute();
      }
    }
    if (els.unitsSelect) els.unitsSelect.value = state.units;
    if (els.styleSelect) els.styleSelect.value = state.styleId;
    updateAttribution();
    renderMeasure();
    renderNearby();
    renderPlace();
  }

  /**
   * A deliberately small surface for the test harness and for other tools on
   * this site that want to drive the page. Everything it exposes goes through
   * exactly the same code the buttons use — there is no second path.
   */
  (root.MM = root.MM || {}).app = {
    panel: function (name) { return showPanel(name); },
    planDrive: function () { return planDrive(); },
    startGuidance: function () { return startGuidance(); },
    stopGuidance: function (summary) { return stopGuidance(summary !== false); },
    /** Feed a position in, as the location service would (optionally timed). */
    moveTo: function (lat, lon, speedKph, at) {
      if (!drive.consumeFix) return null;
      drive.consumeFix({ lat: lat, lon: lon, speedKph: speedKph == null ? null : speedKph, at: at || undefined });
      return drive.session ? drive.session.state : null;
    },
    driveState: function () {
      if (!drive.route) return null;
      return {
        vehicle: drive.navigationMode || drive.prefs.vehicle,
        provider: drive.route.provider ? drive.route.provider.id : null,
        degraded: !!drive.route.degraded,
        distanceKm: drive.route.distanceKm,
        durationMinutes: drive.route.durationMinutes,
        limits: drive.limits ? { segments: drive.limits.segments.length, coverage: drive.limits.coverage } : null,
        traffic: drive.layers.traffic ? { events: (drive.layers.traffic.events || []).length, coverage: drive.layers.traffic.coverage || null } : null,
        weather: drive.layers.weather ? { points: (drive.layers.weather.points || []).length } : null,
        stops: drive.layers.stops ? { stops: (drive.layers.stops.stops || []).length } : null,
        cameras: drive.layers.cameras ? { cameras: (drive.layers.cameras.cameras || []).length } : null,
        markers: drive.markers.length,
        state: drive.session ? drive.session.state : null,
        gpx: drive.session ? drive.session.toGpx('Test') : null,
      };
    },
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { boot(); finishBoot(); });
  else { boot(); finishBoot(); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
