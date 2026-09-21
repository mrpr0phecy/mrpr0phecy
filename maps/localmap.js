/**
 * maps/localmap.js — the map that draws itself, offline, on a canvas.
 *
 * MostUsefulMaps has two renderers, on purpose:
 *
 *   1. MapLibre GL (vendored, ~1 MB) for live vector tiles — sharp at every
 *      zoom, street level, world-class.
 *   2. This one: a ~20 KB canvas renderer that draws the vendored Natural
 *      Earth boundaries, a graticule, city dots, markers, routes and polygon
 *      measurements with no network, no library and no build step.
 *
 * This is what paints the instant world map before MapLibre has finished
 * loading, what keeps working when the visitor is offline (or the tile server
 * is not), and what the tool cards use so a mini-map costs them ~20 KB
 * instead of a megabyte in the shared DOM.
 *
 * It is a real map, not a picture: pan, zoom (wheel, pinch, double-tap),
 * click-to-pick with coordinates, hit-testing, scale bar, geodesic paths.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});

  var THEMES = {
    dark: {
      sea: '#070d14', land: '#16222f', landStroke: '#2b3d50', country: '#2b3d50',
      graticule: 'rgba(120,170,220,0.12)', cityDot: '#7fd4ff', cityText: 'rgba(230,250,255,0.72)',
      marker: '#ffd400', markerText: '#0a0f14', path: '#2dd4ff', polygonFill: 'rgba(45,212,255,0.16)',
      polygonStroke: '#2dd4ff', label: 'rgba(230,250,255,0.86)', scale: 'rgba(230,250,255,0.75)',
      shadow: 'rgba(0,0,0,0.5)',
    },
    light: {
      sea: '#dceaf5', land: '#f4f7f2', landStroke: '#b9c7cf', country: '#b9c7cf',
      graticule: 'rgba(40,80,110,0.12)', cityDot: '#2f6f95', cityText: 'rgba(20,40,60,0.72)',
      marker: '#c8890b', markerText: '#fffdf5', path: '#116a91', polygonFill: 'rgba(17,106,145,0.14)',
      polygonStroke: '#116a91', label: 'rgba(20,40,60,0.86)', scale: 'rgba(20,40,60,0.75)',
      shadow: 'rgba(255,255,255,0.6)',
    },
  };

  var MIN_ZOOM = 0;
  var MAX_ZOOM = 18;

  function createCanvas(parent) {
    var canvas = document.createElement('canvas');
    canvas.className = 'mm-localmap-canvas';
    canvas.setAttribute('role', 'img');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    parent.appendChild(canvas);
    return canvas;
  }

  /**
   * LocalMap(container, options)
   *   container : element to fill (it should have a size already)
   *   options   : { center, zoom, theme, countries, land, cities, interactive,
   *                 graticule, markers, path, polygon, units, scaleBar, onPick }
   */
  function LocalMap(container, options) {
    if (!container) throw new Error('LocalMap needs a container element');
    var opts = options || {};
    this.container = container;
    this.themeName = opts.theme === 'light' ? 'light' : 'dark';
    this.theme = THEMES[this.themeName];
    this.canvas = createCanvas(container);
    this.ctx = this.canvas.getContext('2d');
    this.geodesy = MM.geodesy;
    this.geo = MM.geo;
    this.interactive = opts.interactive !== false;

    var start = this.geodesy.point(opts.center) || { lat: 20, lon: 0 };
    this.center = { lat: start.lat, lon: start.lon };
    this.zoom = typeof opts.zoom === 'number' ? opts.zoom : 2;
    this.minZoom = opts.minZoom == null ? MIN_ZOOM : opts.minZoom;
    this.maxZoom = opts.maxZoom == null ? MAX_ZOOM : opts.maxZoom;

    this.countries = opts.countries || null;      // GeoJSON FeatureCollection
    this.land = opts.land || null;
    this.cities = opts.cities || null;            // gazetteer rows [name, lat, lon, cc, pop]
    this.markers = opts.markers || [];
    this.path = opts.path || [];
    this.polygon = opts.polygon || [];
    this.showGraticule = opts.graticule !== false;
    this.showCities = opts.showCities !== false;
    this.showScaleBar = opts.scaleBar !== false;
    this.units = opts.units || 'metric';
    this.hover = null;
    this.picked = null;
    this.handlers = { click: [], move: [], moveend: [], zoom: [] };
    this._raf = null;
    this._drag = null;
    this._pointers = new Map();
    this._pinch = null;
    this._labelCache = null;

    this._bindInteraction();
    this.resize();
    var self = this;
    if (typeof ResizeObserver === 'function') {
      this._resizeObserver = new ResizeObserver(function () { self.resize(); });
      this._resizeObserver.observe(container);
    } else if (root.addEventListener) {
      this._onWindowResize = function () { self.resize(); };
      root.addEventListener('resize', this._onWindowResize);
    }
  }

  LocalMap.prototype.themes = THEMES;

  // ------------------------------------------------------------- projection

  LocalMap.prototype.worldPixel = function (point, zoom) {
    return this.geodesy.project(point, zoom == null ? this.zoom : zoom);
  };

  LocalMap.prototype.canvasPoint = function (point) {
    var p = this.worldPixel(point);
    var c = this.worldPixel(this.center);
    return { x: p.x - c.x + this.width / 2, y: p.y - c.y + this.height / 2 };
  };

  LocalMap.prototype.unprojectCanvas = function (x, y) {
    var c = this.worldPixel(this.center);
    return this.geodesy.unproject(c.x + x - this.width / 2, c.y + y - this.height / 2, this.zoom);
  };

  LocalMap.prototype.resize = function () {
    var rect = this.container.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width || this.container.clientWidth || 300));
    var h = Math.max(1, Math.round(rect.height || this.container.clientHeight || 200));
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.dpr = dpr;
    this.requestDraw();
  };

  LocalMap.prototype.requestDraw = function () {
    if (this._raf) return;
    var self = this;
    this._raf = (root.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); })(function () {
      self._raf = null;
      self.draw();
    });
  };

  // ---------------------------------------------------------------- drawing

  LocalMap.prototype.draw = function () {
    var ctx = this.ctx;
    if (!ctx) return;
    var dpr = this.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.theme.sea;
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.showGraticule) this._drawGraticule(ctx);
    if (this.countries) this._drawCountries(ctx);
    if (this.showCities && this.cities) this._drawCities(ctx);
    if (this.polygon && this.polygon.length > 2) this._drawPolygon(ctx);
    if (this.path && this.path.length > 1) this._drawPath(ctx);
    this._drawMarkers(ctx);
    if (this.showScaleBar && this.geo) this._drawScaleBar(ctx);
  };

  LocalMap.prototype._viewportBbox = function () {
    var nw = this.unprojectCanvas(0, 0);
    var se = this.unprojectCanvas(this.width, this.height);
    return {
      west: Math.min(nw.lon, se.lon) - 0.5, east: Math.max(nw.lon, se.lon) + 0.5,
      south: Math.min(nw.lat, se.lat) - 0.5, north: Math.max(nw.lat, se.lat) + 0.5,
    };
  };

  LocalMap.prototype._traceRing = function (ctx, ring) {
    var move = true;
    for (var i = 0; i < ring.length; i += 1) {
      var p = this.canvasPoint({ lat: ring[i][1], lon: ring[i][0] });
      if (move) { ctx.moveTo(p.x, p.y); move = false; } else ctx.lineTo(p.x, p.y);
    }
  };

  LocalMap.prototype._drawCountries = function (ctx) {
    var view = this._viewportBbox();
    var features = this.countries.features || [];
    for (var i = 0; i < features.length; i += 1) {
      var f = features[i];
      var bbox = f.bbox || (f.bbox = this.geo.geometryBbox(f.geometry));
      if (bbox && (bbox.east < view.west || bbox.west > view.east ||
        bbox.north < view.south || bbox.south > view.north)) continue;
      ctx.beginPath();
      var polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (var p = 0; p < polygons.length; p += 1) {
        for (var r = 0; r < polygons[p].length; r += 1) this._traceRing(ctx, polygons[p][r]);
      }
      ctx.fillStyle = this.theme.land;
      ctx.fill('evenodd');
      if (this.zoom > 2.5) {
        ctx.strokeStyle = this.theme.country;
        ctx.lineWidth = this.zoom > 7 ? 0.7 : 0.5;
        ctx.stroke();
      }
    }
  };

  LocalMap.prototype._drawGraticule = function (ctx) {
    var step = this.zoom < 3 ? 30 : this.zoom < 5 ? 10 : this.zoom < 7 ? 5 : 1;
    var view = this._viewportBbox();
    ctx.strokeStyle = this.theme.graticule;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (var lon = Math.floor(view.west / step) * step; lon <= view.east; lon += step) {
      var a = this.canvasPoint({ lat: Math.max(-85, view.south), lon: lon });
      var b = this.canvasPoint({ lat: Math.min(85, view.north), lon: lon });
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    for (var lat = Math.floor(view.south / step) * step; lat <= view.north; lat += step) {
      var c = this.canvasPoint({ lat: lat, lon: view.west });
      var d = this.canvasPoint({ lat: lat, lon: view.east });
      ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    }
    ctx.stroke();
    // Latitude/longitude labels on the frame.
    ctx.fillStyle = this.theme.cityText;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'top';
    for (var meridian = Math.floor(view.west / step) * step; meridian <= view.east; meridian += step) {
      var top = this.canvasPoint({ lat: Math.min(85, view.north), lon: meridian });
      ctx.fillText(Math.abs(meridian) + '°' + (meridian === 0 ? '' : meridian > 0 ? 'E' : 'W'), top.x + 3, 4);
    }
  };

  LocalMap.prototype._drawCities = function (ctx) {
    var view = this._viewportBbox();
    var minPop = this.zoom < 3 ? 3000000 : this.zoom < 4 ? 1000000 : this.zoom < 5 ? 300000 : this.zoom < 6 ? 100000 : 20000;
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    var drawn = 0;
    for (var i = 0; i < this.cities.length && drawn < 260; i += 1) {
      var row = this.cities[i];
      if (row[4] < minPop) continue;
      if (row[2] < view.west || row[2] > view.east || row[1] < view.south || row[1] > view.north) continue;
      var p = this.canvasPoint({ lat: row[1], lon: row[2] });
      var big = row[4] > 1000000;
      ctx.beginPath();
      ctx.arc(p.x, p.y, big ? 3 : 2, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.cityDot;
      ctx.fill();
      if (this.zoom >= 4 || big) {
        ctx.fillStyle = this.theme.cityText;
        ctx.fillText(row[0], p.x + 5, p.y - 1);
      }
      drawn += 1;
    }
  };

  LocalMap.prototype._drawPath = function (ctx) {
    var points = this.path;
    if (this.geo) points = this.geo.densify(points, 30);
    ctx.beginPath();
    for (var i = 0; i < points.length; i += 1) {
      var p = this.canvasPoint({ lat: points[i][1], lon: points[i][0] });
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = this.theme.path;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  LocalMap.prototype._drawPolygon = function (ctx) {
    ctx.beginPath();
    for (var i = 0; i < this.polygon.length; i += 1) {
      var p = this.canvasPoint({ lat: this.polygon[i][1], lon: this.polygon[i][0] });
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = this.theme.polygonFill;
    ctx.fill();
    ctx.strokeStyle = this.theme.polygonStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  LocalMap.prototype._drawMarkers = function (ctx) {
    for (var i = 0; i < this.markers.length; i += 1) {
      var marker = this.markers[i];
      var point = this.geodesy.point(marker);
      if (!point) continue;
      var p = this.canvasPoint(point);
      var r = marker.size || 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = marker.colour || this.theme.marker;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.theme.shadow;
      ctx.stroke();
      if (marker.label) {
        ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.textBaseline = 'middle';
        var textWidth = ctx.measureText(marker.label).width;
        var x = p.x + r + 5;
        var y = p.y;
        ctx.fillStyle = this.theme.shadow;
        ctx.globalAlpha = 0.65;
        ctx.fillRect(x - 3, y - 9, textWidth + 6, 18);
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.theme.label;
        ctx.fillText(marker.label, x, y);
      }
    }
  };

  LocalMap.prototype._drawScaleBar = function (ctx) {
    var bar = this.geo.scaleBar(this.center.lat, this.zoom, Math.min(140, this.width * 0.35), this.units);
    var x = 12;
    var y = this.height - 16;
    ctx.strokeStyle = this.theme.scale;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + bar.px, y);
    ctx.lineTo(x + bar.px, y - 4);
    ctx.stroke();
    ctx.fillStyle = this.theme.scale;
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(bar.label, x + bar.px + 6, y);
    this._lastScaleBar = bar;
  };

  // ------------------------------------------------------------ interaction

  LocalMap.prototype._bindInteraction = function () {
    var self = this;
    var canvas = this.canvas;
    this._listeners = [];
    function on(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      self._listeners.push([target, type, handler, options]);
    }

    on(canvas, 'pointerdown', function (event) {
      if (!self.interactive) return;
      canvas.setPointerCapture(event.pointerId);
      self._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (self._pointers.size === 2) {
        var pts = Array.from(self._pointers.values());
        self._pinch = {
          distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          zoom: self.zoom,
          center: self.center,
        };
        self._drag = null;
      } else {
        self._drag = { x: event.clientX, y: event.clientY, center: { lat: self.center.lat, lon: self.center.lon }, moved: false };
      }
      event.preventDefault();
    });

    on(canvas, 'pointermove', function (event) {
      if (!self.interactive) return;
      if (self._pointers.has(event.pointerId)) self._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (self._pinch && self._pointers.size >= 2) {
        var pts = Array.from(self._pointers.values());
        var distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        var scale = distance / Math.max(1, self._pinch.distance);
        self.setView(self._pinch.center, Math.max(self.minZoom, Math.min(self.maxZoom, self._pinch.zoom + Math.log2(scale))));
        event.preventDefault();
        return;
      }
      if (self._drag) {
        var dx = event.clientX - self._drag.x;
        var dy = event.clientY - self._drag.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) self._drag.moved = true;
        var start = self.worldPixel(self._drag.center);
        var moved = self.geodesy.unproject(start.x - dx, start.y - dy, self.zoom);
        self.center = { lat: Math.max(-85, Math.min(85, moved.lat)), lon: moved.lon };
        self.requestDraw();
        self._emit('move', { center: self.center, zoom: self.zoom });
        event.preventDefault();
        return;
      }
      // Hover readout: who wants a map where you cannot see coordinates?
      var rect = canvas.getBoundingClientRect();
      var local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      var point = self.unprojectCanvas(local.x, local.y);
      self.hover = { point: point, x: local.x, y: local.y };
      self.requestDraw();
      self._emit('move', { center: self.center, zoom: self.zoom, hover: point });
    });

    function endPointer(event) {
      self._pointers.delete(event.pointerId);
      if (self._pointers.size < 2) self._pinch = null;
      var drag = self._drag;
      self._drag = null;
      var wasClick = drag && !drag.moved;
      // A tap picks a point; a drag ends a move.
      var rect = canvas.getBoundingClientRect();
      var point = self.unprojectCanvas(event.clientX - rect.left, event.clientY - rect.top);
      if (wasClick) {
        self.picked = point;
        var country = null;
        if (self.countries) {
          var prepared = self._prepared || (self._prepared = self.geo.prepare(self.countries));
          var feature = self.geo.countryForPoint(prepared, point);
          country = feature ? { name: feature.properties.name, id: feature.id } : null;
        }
        self._emit('click', { point: point, country: country });
        self.requestDraw();
      } else {
        self._emit('moveend', { center: self.center, zoom: self.zoom });
      }
    }
    on(canvas, 'pointerup', endPointer);
    on(canvas, 'pointercancel', function (event) {
      self._pointers.delete(event.pointerId);
      self._pinch = null;
      self._drag = null;
    });

    on(canvas, 'wheel', function (event) {
      if (!self.interactive) return;
      var delta = event.deltaY > 0 ? -0.4 : 0.4;
      if (event.ctrlKey || event.metaKey) delta *= 2;
      var rect = canvas.getBoundingClientRect();
      var anchor = self.unprojectCanvas(event.clientX - rect.left, event.clientY - rect.top);
      var nextZoom = Math.max(self.minZoom, Math.min(self.maxZoom, self.zoom + delta));
      // Keep the point under the cursor where it is.
      if (nextZoom !== self.zoom) {
        var before = self.canvasPoint(anchor);
        self.zoom = nextZoom;
        var after = self.canvasPoint(anchor);
        var shifted = self.geodesy.unproject(
          self.worldPixel(self.center).x + (after.x - before.x),
          self.worldPixel(self.center).y + (after.y - before.y),
          self.zoom
        );
        self.center = { lat: Math.max(-85, Math.min(85, shifted.lat)), lon: shifted.lon };
      }
      self.requestDraw();
      self._emit('zoom', { center: self.center, zoom: self.zoom });
      event.preventDefault();
    }, { passive: false });

    on(canvas, 'dblclick', function (event) {
      if (!self.interactive) return;
      self.setView(self.center, self.zoom + 1);
      event.preventDefault();
    });

    on(canvas, 'keydown', function (event) {
      if (!self.interactive) return;
      var step = 0.25 * Math.pow(2, 4 - Math.min(8, self.zoom));
      var moved = true;
      switch (event.key) {
        case 'ArrowUp': self.center.lat = Math.min(85, self.center.lat + step); break;
        case 'ArrowDown': self.center.lat = Math.max(-85, self.center.lat - step); break;
        case 'ArrowLeft': self.center.lon = self.geodesy.normalizeLon(self.center.lon - step); break;
        case 'ArrowRight': self.center.lon = self.geodesy.normalizeLon(self.center.lon + step); break;
        case '+': case '=': self.setView(self.center, self.zoom + 1); break;
        case '-': case '_': self.setView(self.center, self.zoom - 1); break;
        case 'Home': self.setView({ lat: 20, lon: 0 }, 2); break;
        default: moved = false;
      }
      if (moved) {
        self.requestDraw();
        self._emit('moveend', { center: self.center, zoom: self.zoom });
        event.preventDefault();
      }
    });
  };

  LocalMap.prototype.on = function (event, handler) {
    if (this.handlers[event]) this.handlers[event].push(handler);
    return this;
  };

  LocalMap.prototype._emit = function (event, payload) {
    var list = this.handlers[event] || [];
    for (var i = 0; i < list.length; i += 1) {
      try { list[i](payload); } catch (err) { /* a bad listener must not break the map */ }
    }
  };

  // ------------------------------------------------------------------- API

  LocalMap.prototype.setView = function (center, zoom, options) {
    var point = this.geodesy.point(center);
    if (point) this.center = { lat: Math.max(-85, Math.min(85, point.lat)), lon: point.lon };
    if (typeof zoom === 'number') this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    this.requestDraw();
    if (!options || options.silent !== true) this._emit('moveend', { center: this.center, zoom: this.zoom });
    return this;
  };

  LocalMap.prototype.panTo = function (center) { return this.setView(center, this.zoom); };

  /** Move to a point, zoom to a bbox, or fit a set of points. */
  LocalMap.prototype.fitBounds = function (points, options) {
    var bbox = this.geodesy.bbox(points);
    if (!bbox) return this;
    var center = this.geodesy.bboxCenter(bbox);
    var zoom = this.geodesy.fitZoom(bbox, this.width, this.height, (options && options.padding) || 40);
    return this.setView(center, Math.min(this.maxZoom, zoom));
  };

  LocalMap.prototype.setTheme = function (name) {
    this.themeName = name === 'light' ? 'light' : 'dark';
    this.theme = THEMES[this.themeName];
    this.requestDraw();
    return this;
  };

  LocalMap.prototype.setData = function (data) {
    if (data.countries) { this.countries = data.countries; this._prepared = null; }
    if (data.land) this.land = data.land;
    if (data.cities) this.cities = data.cities;
    this.requestDraw();
    return this;
  };

  LocalMap.prototype.setMarkers = function (markers) {
    this.markers = markers || [];
    this.requestDraw();
    return this;
  };

  LocalMap.prototype.setPath = function (path) {
    this.path = path || [];
    this.requestDraw();
    return this;
  };

  LocalMap.prototype.setPolygon = function (polygon) {
    this.polygon = polygon || [];
    this.requestDraw();
    return this;
  };

  LocalMap.prototype.setUnits = function (units) {
    this.units = units === 'imperial' ? 'imperial' : 'metric';
    this.requestDraw();
    return this;
  };

  LocalMap.prototype.getView = function () {
    return { center: { lat: this.center.lat, lon: this.center.lon }, zoom: this.zoom, theme: this.themeName };
  };

  LocalMap.prototype.attribution = function () {
    return 'Offline world map · Natural Earth (public domain) · places © GeoNames (CC BY 4.0)';
  };

  LocalMap.prototype.destroy = function () {
    var i;
    for (i = 0; i < (this._listeners || []).length; i += 1) {
      var entry = this._listeners[i];
      entry[0].removeEventListener(entry[1], entry[2], entry[3]);
    }
    this._listeners = [];
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._onWindowResize && root.removeEventListener) root.removeEventListener('resize', this._onWindowResize);
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.ctx = null;
    this.handlers = { click: [], move: [], moveend: [], zoom: [] };
  };

  MM.LocalMap = LocalMap;
  MM.localmapThemes = THEMES;

  if (typeof module === 'object' && module.exports) module.exports = LocalMap;
})(typeof globalThis !== 'undefined' ? globalThis : this);
