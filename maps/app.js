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

  var PANELS = ['place', 'route', 'measure', 'nearby', 'info'];

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
    nearby: [],
    place: null,
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
  var lastRoutePoints = null;

  // ------------------------------------------------------------------ utils

  function $(id) { return doc.getElementById(id); }

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
      fromField: $('mm-route-from'), toField: $('mm-route-to'), radius: $('mm-radius'),
      nearbyChips: $('mm-nearby-chips'),
      styleSelect: $('mm-style'), unitsSelect: $('mm-units'), themeButton: $('mm-theme-toggle'),
      measureToggle: $('mm-measure-toggle'), clearButton: $('mm-clear'), shareButton: $('mm-share'),
      locateButton: $('mm-locate'), railToggle: $('mm-rail-toggle'),
    };

    applyUrlState();
    buildMap();
    buildStatusChips();
    buildNearbyChips();
    buildStaticCopy();
    bindTabs();
    bindTopbar();
    bindRoute();
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
      if (!value) { closeSuggest(); return; }
      searchTimer = setTimeout(function () { runSearch(value, false); }, 180);
    });
    els.search.addEventListener('keydown', function (event) {
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
      els.themeButton.textContent = state.theme === 'dark' ? '🌙' : '☀️';
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
    if (state.route && lastRoutePoints) {
      params.push('from=' + lastRoutePoints.from.lat.toFixed(5) + ',' + lastRoutePoints.from.lon.toFixed(5));
      params.push('to=' + lastRoutePoints.to.lat.toFixed(5) + ',' + lastRoutePoints.to.lon.toFixed(5));
      params.push('mode=' + state.route.mode);
    }
    return base + '?' + params.join('&');
  }

  function syncUrl() {
    if (!root.history || !root.history.replaceState) return;
    clearTimeout(syncUrl._timer);
    syncUrl._timer = setTimeout(function () {
      var params = '?lat=' + state.center.lat.toFixed(5) + '&lon=' + state.center.lon.toFixed(5) +
        '&z=' + state.zoom.toFixed(2);
      root.history.replaceState(null, '', params);
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
    var panel = params.get('panel');
    if (panel && PANELS.indexOf(panel) >= 0) state.panel = panel;
    state.pendingQuery = params.get('q') || null;
    var from = params.get('from'), to = params.get('to');
    if (from && to) state.pendingRoute = { from: from, to: to, mode: params.get('mode') || 'car' };
  }

  /** Offline matches first (instant), live geocoder results when they arrive. */
  function runSearch(query, jump) {
    var text = query.trim();
    if (!text) return;
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
      local = gaz.search(text, { limit: 6, near: state.center });
      suggestions = local.map(function (row) {
        return { name: row.name, detail: row.country, lat: row.lat, lon: row.lon, kind: 'place', pop: row.pop, offline: true };
      });
      renderSuggest();
      if (jump && local.length) { selectPlace(suggestions[0]); return; }
    }).catch(function () {});

    if (state.offline) return;
    MM.providers.geocode(text, { near: state.center }).then(function (result) {
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
    if (!suggestions.length) { els.suggest.hidden = true; return; }
    els.suggest.hidden = false;
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
  }

  // ------------------------------------------------------------- place card

  function selectPlace(row) {
    closeSuggest();
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
      body.appendChild(make('p', 'mm-muted', 'Search for a town, postcode, Plus Code, OS grid reference or coordinate pair — or click anywhere on the map.'));
      return;
    }
    body.appendChild(make('h3', null, row.name));
    if (row.detail) body.appendChild(make('p', 'tight', row.detail));

    var km = MM.geodesy.distanceKm(state.center, row);
    var dl = make('dl', 'mm-kv');
    kvRow(dl, 'Coordinates', MM.geodesy.formatLatLon(row.lat, row.lon, 5), 'Coordinates');
    kvRow(dl, 'Plus Code', MM.olc.encode(row.lat, row.lon), 'Plus Code');
    var grid = MM.gridref.coveredBy(row.lat, row.lon) ? MM.gridref.fromWgs84(row.lat, row.lon, 5) : null;
    if (grid) kvRow(dl, 'OS grid ref', grid, 'OS grid reference');
    body.appendChild(dl);

    var stats = make('div', 'mm-grid3');
    stats.appendChild(statCard('Straight line', fmtKm(km), 'from map centre'));
    stats.appendChild(statCard('Bearing', Math.round(MM.geodesy.bearing(state.center, row)) + '°', MM.geodesy.compassPoint(MM.geodesy.bearing(state.center, row))));
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
      return MM.providers.route(from, to, state.routeMode).then(function (route) {
        state.route = route;
        renderRoute(route, from, to);
      });
    }).catch(function (error) {
      clear(body);
      body.appendChild(make('p', 'mm-note bad', 'Something went wrong: ' + error.message));
    });
  }

  function renderRoute(route, from, to) {
    var body = els.route;
    clear(body);
    var straight = MM.geodesy.measure(from || lastRoutePoints.from, to || lastRoutePoints.to);

    if (route.straightLine) {
      body.appendChild(make('p', 'mm-note warn', 'The open routing service could not be reached, so this is the straight-line (great-circle) distance — not a road route. Everything else on this panel still works offline.'));
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

    if (route.geometry) {
      map.setPath(route.geometry);
      if (live && live.map && live.map.getSource) {
        try {
          var data = { type: 'Feature', geometry: { type: 'LineString', coordinates: route.geometry }, properties: {} };
          if (live.map.getSource('mm-route')) live.map.getSource('mm-route').setData(data);
          else {
            live.map.addSource('mm-route', { type: 'geojson', data: data });
            live.map.addLayer({ id: 'mm-route-line', type: 'line', source: 'mm-route', paint: { 'line-color': '#2dd4ff', 'line-width': 5, 'line-opacity': 0.9 } });
          }
        } catch (error) { /* style reload in progress */ }
      }
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
      var exportButton = make('button', 'mm-btn', 'Copy route as GeoJSON');
      exportButton.type = 'button';
      exportButton.addEventListener('click', function () {
        copyText(JSON.stringify({ type: 'LineString', coordinates: route.geometry }), 'Route GeoJSON');
      });
      var openButton = make('a', 'mm-btn', 'Open this route as a link');
      openButton.href = shareUrl();
      actions.appendChild(exportButton);
      actions.appendChild(openButton);
      body.appendChild(actions);
    }
  }

  function iconFor(step) {
    var type = (step.instruction || '').toLowerCase();
    if (type.indexOf('roundabout') >= 0) return '🔄';
    if (type.indexOf('arrive') >= 0) return '🏁';
    if (type.indexOf('depart') >= 0) return '🚩';
    if (type.indexOf('merge') >= 0) return '⤵️';
    if (step.modifier === 'left') return '⬅️';
    if (step.modifier === 'right') return '➡️';
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
      map.setMarkers([]);
      map.setPath([]);
      map.setPolygon([]);
      if (live && live.map && live.map.getSource && live.map.getSource('mm-route')) {
        try { live.map.getSource('mm-route').setData({ type: 'FeatureCollection', features: [] }); } catch (error) {}
      }
      renderMeasure();
      renderNearby();
      els.placeBodyCleared = true;
      var body = els.place; clear(body);
      body.appendChild(make('p', 'mm-muted', 'Cleared. Search or click the map to start again.'));
      toast('Cleared');
    });
  }

  function onMapClick(payload) {
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
    state.picked = payload;
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
    box.appendChild(make('p', null, 'Your location is never sent anywhere. When you search online, the words you typed go to Photon or Nominatim (OpenStreetMap) to find the place. When you ask for a route, the two endpoints go to an open routing service. Nearby places send a radius and a point to Overpass. Elevations send the sampled points to OpenTopoData. Nothing else is transmitted, there is no account, and nothing is stored in cookies — your units, theme and style live only in this browser tab.'));
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

  function bindTabs() {
    var buttons = els.tabs.querySelectorAll('[role="tab"]');
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener('click', function () { showPanel(button.getAttribute('data-mm-panel')); });
      button.addEventListener('keydown', function (event) {
        var list = Array.prototype.slice.call(buttons);
        var index = list.indexOf(button);
        if (event.key === 'ArrowRight') list[(index + 1) % list.length].focus();
        if (event.key === 'ArrowLeft') list[(index - 1 + list.length) % list.length].focus();
      });
    });
  }

  function showPanel(name) {
    if (PANELS.indexOf(name) < 0) return;
    state.panel = name;
    Array.prototype.forEach.call(els.tabs.querySelectorAll('[role="tab"]'), function (button) {
      var active = button.getAttribute('data-mm-panel') === name;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    Array.prototype.forEach.call(doc.querySelectorAll('.mm-pane'), function (pane) {
      pane.setAttribute('data-active', String(pane.id === 'mm-pane-' + name));
    });
    if (name === 'nearby' && !state.nearby.length) renderNearby();
    if (name === 'measure') renderMeasure();
  }

  // ------------------------------------------------------------------ hud

  function updateHud() {
    var center = state.center;
    var grid = MM.gridref.coveredBy(center.lat, center.lon) ? MM.gridref.fromWgs84(center.lat, center.lon, 5) : null;
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
    var grid = MM.gridref.coveredBy(hover.lat, hover.lon) ? MM.gridref.fromWgs84(hover.lat, hover.lon, 5) : null;
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
    liveChip.setAttribute('data-state', state.live ? 'ok' : (state.liveStatus === 'failed' ? 'warn' : 'fail'));
    liveChip.appendChild(make('span', 'mm-dot'));
    liveChip.appendChild(make('span', null, state.live ? 'Live map' : state.liveStatus === 'offline' ? 'Offline map' : state.liveStatus === 'failed' ? 'Offline map (tiles unavailable)' : state.liveStatus === 'no-webgl' ? 'Offline map (no WebGL)' : 'Loading live map…'));
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
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === '/') { event.preventDefault(); els.search.focus(); return; }
      if (event.key === 'm' || event.key === 'M') { els.measureToggle.click(); return; }
      if (event.key === 'l' || event.key === 'L') { locate(); return; }
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
      showPanel('route');
      runRoute();
    }
    if (els.unitsSelect) els.unitsSelect.value = state.units;
    if (els.styleSelect) els.styleSelect.value = state.styleId;
    updateAttribution();
    renderMeasure();
    renderNearby();
    renderPlace();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { boot(); finishBoot(); });
  else { boot(); finishBoot(); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
