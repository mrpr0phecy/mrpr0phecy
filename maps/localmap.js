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

  /** 85.0511…° — the Mercator limit MM.geodesy clamps to. */
  var MERCATOR_MAX_LAT = 85.0511287798066;
  /** Zoom at which the detailed boundary set (if loaded) earns its keep. */
  var DETAIL_FROM_ZOOM = 4.5;
  /** Bumped whenever the projected-geometry layout changes. */
  var PROJECTION_VERSION = 1;
  /** Vertices closer together than this, in CSS pixels, are not worth a lineTo. */
  var MIN_VERTEX_PX = 0.75;
  /** Projected datasets, keyed by the dataset object: shared by every map. */
  var GEOMETRY = new WeakMap();

  /**
   * A path or polygon row, in either of the shapes callers actually pass:
   * GeoJSON's [lon, lat] or this engine's {lat, lon}. Reading only one of
   * them is how a measurement quietly draws itself at (null, null) and
   * vanishes — the canvas ignores a NaN coordinate without complaining.
   */
  function rowLon(row) { return Array.isArray(row) ? row[0] : row ? row.lon : NaN; }
  function rowLat(row) { return Array.isArray(row) ? row[1] : row ? row.lat : NaN; }

  function createCanvas(parent) {
    var canvas = document.createElement('canvas');
    canvas.className = 'mm-localmap-canvas';
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'Interactive world map. Use arrow keys to pan, plus and minus to zoom, and Enter or Space to inspect a point.');
    canvas.tabIndex = 0;
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
    // The canvas is painted edge to edge every frame (the sea covers all of
    // it), so there is nothing behind it to blend with: telling the browser
    // that saves a compositing pass on every pan frame.
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.geodesy = MM.geodesy;
    this.geo = MM.geo;
    this.interactive = opts.interactive !== false;

    var start = this.geodesy.point(opts.center) || { lat: 20, lon: 0 };
    this.center = { lat: start.lat, lon: start.lon };
    this.zoom = typeof opts.zoom === 'number' ? opts.zoom : 2;
    this.minZoom = opts.minZoom == null ? MIN_ZOOM : opts.minZoom;
    this.maxZoom = opts.maxZoom == null ? MAX_ZOOM : opts.maxZoom;

    this.countries = opts.countries || null;      // GeoJSON FeatureCollection
    // An optional higher-resolution copy of the same boundaries. Real tile
    // engines carry several generalisations of the world and pick one per
    // zoom level; so does this, which is what keeps a zoomed-out pan cheap
    // after the visitor has zoomed in and loaded the detail set.
    this.countriesDetail = opts.countriesDetail || null;
    this.detailFromZoom = opts.detailFromZoom == null ? DETAIL_FROM_ZOOM : opts.detailFromZoom;
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
    // Per-frame projection state and the densified-path cache. Both are
    // rebuilt by the methods below; nothing outside this file touches them.
    this._frame = null;
    this._densified = null;
    this._hoverRaf = null;

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
  //
  // Drawing a pan frame used to re-project every boundary vertex through the
  // full Mercator formula — and `canvasPoint()` re-projected the *centre* as
  // well, so each vertex cost two `Math.tan`/`Math.log` pairs. With the 50 m
  // coastline on screen that was ~30 ms a frame: a map that pans at 3 fps.
  //
  // Tile engines do not do that. They project the geometry once, then move a
  // transform. So: every dataset is projected once into world pixels at zoom
  // 0 (a 256 px world, exactly what MM.geodesy.project uses), cached on the
  // dataset object, and a frame is then two multiplies and two adds per
  // vertex with the centre offset folded into the canvas origin.

  /** Web Mercator x in a 256 px world (zoom 0). Matches geodesy.project(). */
  function baseX(lon) {
    return (lon + 180) / 360 * 256;
  }

  /** Web Mercator y in a 256 px world (zoom 0). Matches geodesy.project(). */
  function baseY(lat) {
    var l = lat < -MERCATOR_MAX_LAT ? -MERCATOR_MAX_LAT : lat > MERCATOR_MAX_LAT ? MERCATOR_MAX_LAT : lat;
    var sin = Math.sin(l * Math.PI / 180);
    return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 256;
  }

  /**
   * The projected form of a GeoJSON FeatureCollection: one flat Float64Array
   * of zoom-0 world pixels per feature, its ring offsets, and its bbox in the
   * same units. Built once per dataset and hung off it, so a redraw — and the
   * second and third map on the page, if a card mounts one — pays nothing.
   *
   * Float64 rather than Float32 on purpose: at zoom 18 the world is 67
   * million pixels wide, where Float32 would drift by several pixels.
   */
  LocalMap.prototype._projected = function (dataset) {
    if (!dataset) return null;
    var cached = GEOMETRY.get(dataset);
    if (cached && cached.version === PROJECTION_VERSION) return cached;
    var features = dataset.features || [];
    var items = [];
    var vertexTotal = 0;
    for (var i = 0; i < features.length; i += 1) {
      var geometry = features[i] && features[i].geometry;
      if (!geometry) continue;
      var polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon' ? geometry.coordinates : null;
      if (!polygons) continue;
      var ringCount = 0;
      var vertexCount = 0;
      for (var p = 0; p < polygons.length; p += 1) {
        ringCount += polygons[p].length;
        for (var r = 0; r < polygons[p].length; r += 1) vertexCount += polygons[p][r].length;
      }
      if (!vertexCount) continue;
      var coords = new Float64Array(vertexCount * 2);
      var rings = new Int32Array(ringCount + 1);
      // Mercator y grows southwards, so "north" is the smaller y. Both
      // accumulators start at the value that loses every comparison: a min
      // starts high and a max starts low, or nothing is ever recorded.
      var west = Infinity, east = -Infinity, north = Infinity, south = -Infinity;
      var v = 0;
      var ring = 0;
      for (var pp = 0; pp < polygons.length; pp += 1) {
        for (var rr = 0; rr < polygons[pp].length; rr += 1) {
          var src = polygons[pp][rr];
          rings[ring] = v;
          ring += 1;
          for (var k = 0; k < src.length; k += 1) {
            var x = baseX(src[k][0]);
            var y = baseY(src[k][1]);
            coords[v * 2] = x;
            coords[v * 2 + 1] = y;
            v += 1;
            if (x < west) west = x;
            if (x > east) east = x;
            if (y < north) north = y;   // y grows southwards in Mercator
            if (y > south) south = y;
          }
        }
      }
      rings[ringCount] = v;
      items.push({ coords: coords, rings: rings, west: west, east: east, north: north, south: south });
      vertexTotal += v;
    }
    var projected = { version: PROJECTION_VERSION, items: items, vertices: vertexTotal };
    // Keyed by the dataset object in a WeakMap, so the page's data is never
    // mutated and a dataset nobody holds any more is collected with its cache.
    GEOMETRY.set(dataset, projected);
    return projected;
  };

  /** Which boundary set this zoom should draw: detail when it is worth it. */
  LocalMap.prototype._activeCountries = function () {
    if (this.countriesDetail && this.zoom >= this.detailFromZoom) return this.countriesDetail;
    return this.countries;
  };

  /**
   * Per-frame transform, in zoom-0 world pixels: `screen = base * k + offset`.
   * Computed once per draw rather than once per vertex.
   */
  LocalMap.prototype._beginFrame = function () {
    var k = Math.pow(2, this.zoom);
    var cx = baseX(this.center.lon);
    var cy = baseY(this.center.lat);
    this._frame = {
      k: k,
      ox: this.width / 2 - cx * k,
      oy: this.height / 2 - cy * k,
      // The visible rectangle in the same units, for culling.
      minX: -this.width / 2 / k + cx, maxX: this.width / 2 / k + cx,
      minY: -this.height / 2 / k + cy, maxY: this.height / 2 / k + cy,
    };
    return this._frame;
  };

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

    // One projection for the whole frame: every drawing call below reads it
    // instead of re-deriving the Mercator maths per point.
    this._beginFrame();

    if (this.showGraticule) this._drawGraticule(ctx);
    if (this.countries || this.countriesDetail) this._drawCountries(ctx);
    if (this.showCities && this.cities) this._drawCities(ctx);
    if (this.polygon && this.polygon.length > 2) this._drawPolygon(ctx);
    if (this.path && this.path.length > 1) this._drawPath(ctx);
    this._drawMarkers(ctx);
    if (this.showScaleBar && this.geo) this._drawScaleBar(ctx);
  };

  /** A geographic point in CSS pixels, using the frame's transform. */
  LocalMap.prototype._screenPoint = function (lat, lon) {
    var frame = this._frame || this._beginFrame();
    return { x: baseX(lon) * frame.k + frame.ox, y: baseY(lat) * frame.k + frame.oy };
  };

  LocalMap.prototype._viewportBbox = function () {
    var nw = this.unprojectCanvas(0, 0);
    var se = this.unprojectCanvas(this.width, this.height);
    return {
      west: Math.min(nw.lon, se.lon) - 0.5, east: Math.max(nw.lon, se.lon) + 0.5,
      south: Math.min(nw.lat, se.lat) - 0.5, north: Math.max(nw.lat, se.lat) + 0.5,
    };
  };

  /**
   * The boundaries, drawn from the projected cache.
   *
   * Three things make this cheap enough to redraw 60 times a second:
   *   1. the geometry is already in world pixels, so a vertex is a multiply
   *      and an add rather than a projection;
   *   2. a feature whose bbox is off screen is skipped without looking at its
   *      vertices at all;
   *   3. vertices closer together than three quarters of a pixel are not
   *      emitted — a coastline has far more detail at world zoom than the
   *      screen has pixels, and drawing the surplus is pure waste.
   */
  LocalMap.prototype._drawCountries = function (ctx) {
    var projected = this._projected(this._activeCountries());
    if (!projected || !projected.items.length) return;
    var frame = this._frame || this._beginFrame();
    var k = frame.k;
    var ox = frame.ox;
    var oy = frame.oy;
    var slack = MIN_VERTEX_PX / k;
    var items = projected.items;

    ctx.fillStyle = this.theme.land;
    var stroke = this.zoom > 2.5;
    if (stroke) {
      ctx.strokeStyle = this.theme.country;
      ctx.lineWidth = this.zoom > 7 ? 0.7 : 0.5;
    }

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      if (item.east < frame.minX || item.west > frame.maxX ||
        item.south < frame.minY || item.north > frame.maxY) continue;
      var coords = item.coords;
      var rings = item.rings;
      ctx.beginPath();
      for (var r = 0; r < rings.length - 1; r += 1) {
        var from = rings[r];
        var to = rings[r + 1];
        if (to - from < 2) continue;
        var lastX = coords[from * 2] * k + ox;
        var lastY = coords[from * 2 + 1] * k + oy;
        ctx.moveTo(lastX, lastY);
        for (var v = from + 1; v < to; v += 1) {
          var x = coords[v * 2] * k + ox;
          var y = coords[v * 2 + 1] * k + oy;
          // The closing vertex is always emitted, so a ring never loses the
          // corner it ends on however far the others were thinned.
          if (v < to - 1) {
            var dx = x - lastX;
            var dy = y - lastY;
            if (dx < slack && dx > -slack && dy < slack && dy > -slack) continue;
          }
          ctx.lineTo(x, y);
          lastX = x;
          lastY = y;
        }
      }
      ctx.fill('evenodd');
      if (stroke) ctx.stroke();
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

  /**
   * The city rows ordered biggest first, built once per dataset.
   *
   * Drawing stops at a population threshold and at 260 labels, so a sorted
   * order does two jobs at once: the scan ends as soon as the places get too
   * small to show at this zoom instead of walking all 19,686 rows every frame,
   * and when a dense region does hit the 260-label cap it is the largest
   * places that get drawn rather than whichever came first in the file.
   */
  LocalMap.prototype._cityOrder = function () {
    var cities = this.cities;
    if (this._citiesSorted && this._citiesSorted.source === cities) return this._citiesSorted.order;
    var order = [];
    for (var i = 0; i < cities.length; i += 1) order.push(i);
    order.sort(function (a, b) { return (cities[b][4] || 0) - (cities[a][4] || 0); });
    this._citiesSorted = { source: cities, order: order };
    return order;
  };

  LocalMap.prototype._drawCities = function (ctx) {
    var view = this._viewportBbox();
    var frame = this._frame || this._beginFrame();
    var k = frame.k;
    var ox = frame.ox;
    var oy = frame.oy;
    var minPop = this.zoom < 3 ? 3000000 : this.zoom < 4 ? 1000000 : this.zoom < 5 ? 300000 : this.zoom < 6 ? 100000 : 20000;
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    var order = this._cityOrder();
    var drawn = 0;
    for (var o = 0; o < order.length && drawn < 260; o += 1) {
      var row = this.cities[order[o]];
      if (row[4] < minPop) break;
      if (row[2] < view.west || row[2] > view.east || row[1] < view.south || row[1] > view.north) continue;
      var x = baseX(row[2]) * k + ox;
      var y = baseY(row[1]) * k + oy;
      var big = row[4] > 1000000;
      ctx.beginPath();
      ctx.arc(x, y, big ? 3 : 2, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.cityDot;
      ctx.fill();
      if (this.zoom >= 4 || big) {
        ctx.fillStyle = this.theme.cityText;
        ctx.fillText(row[0], x + 5, y - 1);
      }
      drawn += 1;
    }
  };

  /**
   * The geodesic-densified form of the current path. Densifying a route means
   * interpolating great-circle points along every leg, which is real maths —
   * doing it once when the path is set rather than once per frame is what
   * keeps a drawn route from making every pan stutter.
   */
  LocalMap.prototype._densifiedPath = function () {
    var path = this.path || [];
    // Identity *and* length: the measuring tool pushes onto the same array
    // between clicks, and a stale densified copy would drop the new leg.
    if (this._densified && this._densified.source === path && this._densified.count === path.length) {
      return this._densified.points;
    }
    var points = this.geo ? this.geo.densify(path, 30) : path.slice();
    this._densified = { source: path, count: path.length, points: points };
    return points;
  };

  LocalMap.prototype._drawPath = function (ctx) {
    var points = this._densifiedPath();
    var frame = this._frame || this._beginFrame();
    var k = frame.k;
    var ox = frame.ox;
    var oy = frame.oy;
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < points.length; i += 1) {
      var lon = rowLon(points[i]);
      var lat = rowLat(points[i]);
      if (!isFinite(lon) || !isFinite(lat)) continue;
      var x = baseX(lon) * k + ox;
      var y = baseY(lat) * k + oy;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    if (!started) return;
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
    var frame = this._frame || this._beginFrame();
    var k = frame.k;
    var ox = frame.ox;
    var oy = frame.oy;
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < this.polygon.length; i += 1) {
      var lon = rowLon(this.polygon[i]);
      var lat = rowLat(this.polygon[i]);
      if (!isFinite(lon) || !isFinite(lat)) continue;
      var x = baseX(lon) * k + ox;
      var y = baseY(lat) * k + oy;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    if (!started) return;
    ctx.closePath();
    ctx.fillStyle = this.theme.polygonFill;
    ctx.fill();
    ctx.strokeStyle = this.theme.polygonStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  LocalMap.prototype._drawMarkers = function (ctx) {
    var frame = this._frame || this._beginFrame();
    var k = frame.k;
    var ox = frame.ox;
    var oy = frame.oy;
    for (var i = 0; i < this.markers.length; i += 1) {
      var marker = this.markers[i];
      var point = this.geodesy.point(marker);
      if (!point) continue;
      var px = baseX(point.lon) * k + ox;
      var py = baseY(point.lat) * k + oy;
      var r = marker.size || 6;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = marker.colour || this.theme.marker;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.theme.shadow;
      ctx.stroke();
      if (marker.label) {
        ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.textBaseline = 'middle';
        var textWidth = ctx.measureText(marker.label).width;
        var x = px + r + 5;
        var y = py;
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
      // Two things this deliberately does *not* do. It does not redraw the
      // map — nothing is painted from the hover position, so re-tracing the
      // coastline for a mouse move was pure waste. And it does not answer
      // every event: a high-rate mouse fires hundreds of pointermove events a
      // second, so the readout is coalesced into one per frame instead, and
      // the bounding-rect read (which can force a layout) happens once there
      // rather than once per event.
      self._hoverAt = { x: event.clientX, y: event.clientY };
      self._queueHover();
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
        case 'Enter': case ' ': self.picked = { lat: self.center.lat, lon: self.center.lon }; self._emit('click', { point: self.picked, country: null }); break;
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

  /**
   * One hover readout per frame, however fast the pointer events arrive. The
   * maths and the layout read both happen here rather than in the listener.
   */
  LocalMap.prototype._queueHover = function () {
    if (this._hoverRaf) return;
    var self = this;
    this._hoverRaf = (root.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); })(function () {
      self._hoverRaf = null;
      if (!self._hoverAt || !self.ctx) return;
      var rect = self.canvas.getBoundingClientRect();
      var local = { x: self._hoverAt.x - rect.left, y: self._hoverAt.y - rect.top };
      var point = self.unprojectCanvas(local.x, local.y);
      self.hover = { point: point, x: local.x, y: local.y };
      self._emit('move', { center: self.center, zoom: self.zoom, hover: point });
    });
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
    if (data.countriesDetail) { this.countriesDetail = data.countriesDetail; this._prepared = null; }
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
    // Not just identity: the page measures by pushing onto one array and
    // handing the same array back, so the densified copy has to be dropped
    // whenever the path is set, whatever its identity did.
    this._densified = null;
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
    // A hover readout queued for the next frame must not land on a dead map.
    if (this._hoverRaf && root.cancelAnimationFrame) root.cancelAnimationFrame(this._hoverRaf);
    this._hoverRaf = null;
    this._hoverAt = null;
    if (this._raf && root.cancelAnimationFrame) root.cancelAnimationFrame(this._raf);
    this._raf = null;
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
