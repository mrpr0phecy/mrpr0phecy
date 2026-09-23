/**
 * maps/livemap.js — the live vector-tile map, done so that failure is boring.
 *
 * MapLibre GL JS (vendored in maps/vendor/) renders OpenFreeMap's vector
 * tiles: OpenStreetMap data, no API key, no tracking, no account, and a
 * licence that actually allows this (ODbL for the data, BSD-3 for the library).
 *
 * The important design decision is what happens when it *doesn't* work — no
 * connection, a blocked CDN, a tile server having a bad day, an old browser
 * without the WebGL features MapLibre needs. So: the offline canvas map is
 * painted first and stays underneath; MapLibre is created on top at zero
 * opacity and only fades in after it has actually rendered frames. If it
 * errors first, it is thrown away and the visitor keeps a working map with
 * no error dialog and no blank screen.
 *
 * The vendored MapLibre is 1 MB, so it is only ever requested by a page or a
 * card that asks for a live map — never by the catalogue grid.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});

  var BASE = (function () {
    var script = root.document && root.document.currentScript;
    var src = script && script.src;
    if (src) return src.replace(/[^/]*$/, '');
    return 'maps/';
  })();

  var loadPromise = null;

  function loadScript(url, attributes) {
    return new Promise(function (resolve, reject) {
      var script = root.document.createElement('script');
      script.src = url;
      script.async = true;
      if (attributes) Object.keys(attributes).forEach(function (k) { script.setAttribute(k, attributes[k]); });
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('could not load ' + url)); };
      root.document.head.appendChild(script);
    });
  }

  function loadStyleSheet(url) {
    if (root.document.querySelector('link[data-mostusefulmaps="' + url + '"]')) return Promise.resolve();
    return new Promise(function (resolve) {
      var link = root.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.setAttribute('data-mostusefulmaps', url);
      link.onload = function () { resolve(); };
      link.onerror = function () { resolve(); }; // CSS is cosmetic; carry on
      root.document.head.appendChild(link);
    });
  }

  /** Load the vendored MapLibre once per page, whoever asks first. */
  function ensureMapLibre() {
    if (root.maplibregl) return Promise.resolve(root.maplibregl);
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      loadScript(BASE + 'vendor/maplibre-gl.js', { 'data-mostusefulmaps': 'maplibre' }),
      loadStyleSheet(BASE + 'vendor/maplibre-gl.css'),
    ]).then(function () {
      if (!root.maplibregl) throw new Error('MapLibre loaded but did not initialise');
      return root.maplibregl;
    });
    return loadPromise;
  }

  function webglAvailable() {
    try {
      var canvas = root.document.createElement('canvas');
      return !!(root.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
    } catch (error) {
      return false;
    }
  }

  /**
   * create(container, options) → handle
   *   options: { center, zoom, styleUrl, interactive, onReady, onError,
   *              onMove, nav, globe }
   *
   * The handle is *always* returned synchronously; the live map appears when
   * it is ready. handle.status is 'loading' | 'live' | 'failed' | 'unavailable'.
   */
  function create(container, options) {
    var opts = options || {};
    var handle = {
      status: 'loading',
      map: null,
      destroy: function () {
        handle.destroyed = true;
        try { if (handle.map) handle.map.remove(); } catch (error) { /* already gone */ }
        handle.map = null;
      },
      setStyle: function (url) {
        if (!handle.map) { handle.pendingStyle = url; return; }
        try { handle.map.setStyle(url); } catch (error) { /* keep the old style */ }
      },
      getStatus: function () { return handle.status; },
    };

    if (!webglAvailable()) {
      handle.status = 'unavailable';
      handle.reason = 'WebGL is not available in this browser';
      if (opts.onError) opts.onError(handle.reason);
      return handle;
    }

    var holder = root.document.createElement('div');
    holder.className = 'mm-live-layer';
    // Sits above the offline canvas; hidden until it has painted, so the
    // visitor never sees an empty grey rectangle.
    holder.style.opacity = '0';
    holder.style.transition = 'opacity 260ms ease';
    container.appendChild(holder);

    ensureMapLibre().then(function (maplibregl) {
      if (handle.destroyed) return;
      var center = opts.center
        ? [MM.geodesy.point(opts.center).lon, MM.geodesy.point(opts.center).lat]
        : [0, 20];
      var map = new maplibregl.Map({
        container: holder,
        style: opts.styleUrl || 'https://tiles.openfreemap.org/styles/fiord',
        center: center,
        zoom: opts.zoom == null ? 2 : opts.zoom,
        attributionControl: opts.attribution === false ? false : { compact: true, customAttribution: opts.customAttribution },
        interactive: opts.interactive !== false,
        minZoom: opts.minZoom == null ? 0 : opts.minZoom,
        maxZoom: opts.maxZoom == null ? 20 : opts.maxZoom,
        dragRotate: !!opts.rotate,
        pitchWithRotate: !!opts.rotate,
        // Globe projection is a MapLibre 5 feature; asking for it on an older
        // build is harmless, which is why it is a plain option.
        projection: opts.globe ? 'globe' : 'mercator',
      });
      handle.map = map;
      if (opts.nav !== false && opts.controls !== false && maplibregl.NavigationControl) {
        try { map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right'); } catch (e) {}
      }
      if (opts.scale !== false && maplibregl.ScaleControl) {
        try { map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: opts.units === 'imperial' ? 'imperial' : 'metric' }), 'bottom-left'); } catch (e) {}
      }
      if (opts.globe && maplibregl.GlobeControl) {
        try { map.addControl(new maplibregl.GlobeControl(), 'top-right'); } catch (e) {}
      }

      var settled = false;
      map.on('error', function (event) {
        var message = event && event.error ? event.error.message : 'map error';
        if (!settled) {
          settled = true;
          handle.status = 'failed';
          handle.reason = message;
          handle.destroy();
          if (opts.onError) opts.onError(message);
        }
      });
      map.on('load', function () {
        settled = true;
        handle.status = 'live';
        holder.style.opacity = '1';
        if (opts.onReady) opts.onReady(handle, map);
      });
      if (opts.onMove) {
        map.on('moveend', function () {
          var c = map.getCenter();
          opts.onMove({ lat: c.lat, lon: c.lng, zoom: map.getZoom() });
        });
      }
      if (opts.onClick) {
        map.on('click', function (event) {
          opts.onClick({ lat: event.lngLat.lat, lon: event.lngLat.lng });
        });
      }
      // If tiles never arrive (very slow network), give up after 12 s and let
      // the offline map stay in charge.
      setTimeout(function () {
        if (!settled && handle.status === 'loading') {
          settled = true;
          handle.status = 'failed';
          handle.reason = 'timed out waiting for map tiles';
          handle.destroy();
          if (opts.onError) opts.onError(handle.reason);
        }
      }, opts.timeoutMs || 12000);
    }).catch(function (error) {
      handle.status = 'failed';
      handle.reason = error.message;
      if (opts.onError) opts.onError(error.message);
    });

    return handle;
  }

  MM.livemap = {
    create: create,
    ensureMapLibre: ensureMapLibre,
    webglAvailable: webglAvailable,
    base: BASE,
  };

  if (typeof module === 'object' && module.exports) module.exports = MM.livemap;
})(typeof globalThis !== 'undefined' ? globalThis : this);
