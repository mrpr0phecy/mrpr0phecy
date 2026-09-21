/**
 * maps/core/gazetteer.js — search 19,686 places with no network at all.
 *
 * The vendored gazetteer (maps/data/gazetteer.json, generated from GeoNames
 * by scripts/build-maps-data.js) holds every city over 20,000 people plus
 * every capital. This module turns that into search that feels instant and
 * behaves the way a map should: "lut" finds Luton before Lutterworth,
 * "san francisco" ranks the Californian city above the Peruvian one, and
 * "Springfield, US" filters by country when you ask it to.
 *
 * Design notes, because they are the difference between search that works and
 * search that looks like it works:
 *
 *  - Ranking is explicit, not accidental: exact name > prefix > word-start >
 *    substring, then a population tiebreak on a log scale, then an optional
 *    proximity boost when the caller says where the user is.
 *  - Diacritics are folded (Sao Paulo finds São Paulo, Munchen finds München
 *    via ASCII folding) but the original name is what we display.
 *  - A 19,686-row scan takes ~1 ms, so there is no index to fall out of sync
 *    with the data. Searches are capped and sorted after scoring.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});

  /** Case- and accent-insensitive folding for search keys. */
  function fold(text) {
    if (!text) return '';
    var s = String(text).toLowerCase();
    // Fold the Latin characters people type with a plain keyboard.
    s = s.replace(/ø/g, 'o').replace(/ß/g, 'ss').replace(/æ/g, 'ae')
      .replace(/œ/g, 'oe').replace(/ł/g, 'l').replace(/đ/g, 'd')
      .replace(/þ/g, 'th').replace(/ð/g, 'd');
    if (typeof s.normalize === 'function') {
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return s;
  }

  function scoreName(name, query) {
    var n = fold(name);
    var q = query;
    if (!q) return 0;
    if (n === q) return 100;
    if (n.startsWith(q)) return 82 - Math.min(20, (n.length - q.length));
    var wordIndex = n.indexOf(' ' + q);
    if (wordIndex >= 0) return 66 - Math.min(16, wordIndex);
    var at = n.indexOf(q);
    if (at >= 0) return 48 - Math.min(20, at);
    // Every query word appears somewhere, in any order: "york new" style.
    var words = q.split(/\s+/).filter(Boolean);
    if (words.length > 1 && words.every(function (w) { return n.indexOf(w) >= 0; })) return 34;
    return 0;
  }

  function populationScore(pop) {
    // 0–25 bonus for bigger places, on a log scale: 100k ≈ 16, 1M ≈ 21, 10M ≈ 25.
    if (!pop || pop <= 0) return 0;
    return Math.min(25, Math.log10(pop) * 3.2);
  }

  function Gazetteer(data) {
    this.cities = (data && data.cities) || [];
    this.index = new Map();
    for (var i = 0; i < this.cities.length; i += 1) {
      var row = this.cities[i];
      this.index.set(i, { name: row[0], lat: row[1], lon: row[2], cc: row[3], pop: row[4], folded: fold(row[0]) });
    }
    this.countries = null; // set by setCountries()
    this.version = (data && data.v) || 0;
    this.source = (data && data.source) || null;
  }

  Gazetteer.prototype.setCountries = function (countryData) {
    this.countries = (countryData && countryData.countries) || null;
    return this;
  };

  Gazetteer.prototype.countryName = function (cc) {
    if (!this.countries || !this.countries[cc]) return cc || '';
    return this.countries[cc].name;
  };

  /**
   * search(query, options) → [{name, lat, lon, cc, country, pop, km?, score}]
   * options: { limit = 8, near = {lat, lon}, cc = 'GB', minPop = 0, maxKm }
   */
  Gazetteer.prototype.search = function (query, options) {
    var opts = options || {};
    var limit = opts.limit || 8;
    var q = fold(String(query || '').trim());
    var results = [];
    if (!q) return results;
    var near = opts.near && MM.geodesy ? MM.geodesy.point(opts.near) : null;
    var cc = opts.cc ? String(opts.cc).toUpperCase() : null;
    var minPop = opts.minPop || 0;

    for (var i = 0; i < this.cities.length; i += 1) {
      var row = this.index.get(i);
      if (cc && row.cc !== cc) continue;
      if (row.pop < minPop) continue;
      var s = scoreName(row.name, q);
      if (!s) continue;
      s += populationScore(row.pop);
      var distanceKm = null;
      if (near) {
        distanceKm = MM.geodesy.distanceKm(near, row);
        // Proximity boost: full weight within 50 km, fading to nothing at
        // 2,000 km. This is what makes "Cambridge" behave when you are in
        // England rather than Massachusetts.
        var boost = Math.max(0, 30 * (1 - distanceKm / 2000));
        s += boost;
        if (opts.maxKm && distanceKm > opts.maxKm) continue;
      }
      results.push({
        name: row.name, lat: row.lat, lon: row.lon, cc: row.cc, pop: row.pop,
        country: this.countryName(row.cc), km: distanceKm, score: s,
      });
    }
    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return b.pop - a.pop;
    });
    return results.slice(0, limit);
  };

  /** Places around a point, nearest first. */
  Gazetteer.prototype.nearest = function (input, limit, options) {
    var opts = options || {};
    var pt = MM.geodesy ? MM.geodesy.point(input) : null;
    if (!pt) return [];
    var out = [];
    for (var i = 0; i < this.cities.length; i += 1) {
      var row = this.index.get(i);
      if (row.pop < (opts.minPop || 0)) continue;
      out.push({
        name: row.name, lat: row.lat, lon: row.lon, cc: row.cc, pop: row.pop,
        country: this.countryName(row.cc),
        km: MM.geodesy.distanceKm(pt, row),
      });
    }
    out.sort(function (a, b) { return a.km - b.km; });
    return out.slice(0, limit || 5);
  };

  /** Cities inside a box — the "what can I see here?" layer. */
  Gazetteer.prototype.inBBox = function (bbox, limit, minPop) {
    var out = [];
    var threshold = minPop || 0;
    for (var i = 0; i < this.cities.length; i += 1) {
      var row = this.index.get(i);
      if (row.pop < threshold) continue;
      if (row.lon < bbox.west || row.lon > bbox.east) continue;
      if (row.lat < bbox.south || row.lat > bbox.north) continue;
      out.push({ name: row.name, lat: row.lat, lon: row.lon, cc: row.cc, pop: row.pop, country: this.countryName(row.cc) });
    }
    out.sort(function (a, b) { return b.pop - a.pop; });
    return out.slice(0, limit || 60);
  };

  /** Typeahead: same ranking, smaller payload, prefix-weighted. */
  Gazetteer.prototype.suggest = function (prefix, limit) {
    return this.search(prefix, { limit: limit || 6 }).map(function (r) {
      return { name: r.name, cc: r.cc, country: r.country, lat: r.lat, lon: r.lon };
    });
  };

  Gazetteer.prototype.stats = function () {
    return { cities: this.cities.length, countries: this.countries ? Object.keys(this.countries).length : 0, source: this.source };
  };

  /**
   * Everything a search box should accept, in the order a person expects:
   * a place name, a coordinate pair, a Plus Code, a UK grid reference, a UTM
   * coordinate, a Maidenhead locator, a geohash.
   *
   * The order is deliberate and it is the whole design. Plus Codes, grid
   * references, UTM and Maidenhead are shapes no place name has, so they are
   * safe to check first — but a geohash is just letters and digits, and
   * "thunder", "exeter" and "9c3x" are all valid geohashes. A geohash is
   * therefore only considered when the caller passes `geohash: true`, which
   * maps/app.js does on the pass *after* the place index has come up empty,
   * so a place can never be beaten to the answer by a code.
   *
   * Returns { kind, …, results } so the UI can explain what it matched.
   */
  function interpret(query, options) {
    var opts = options || {};
    var text = String(query || '').trim();
    if (!text) return { kind: 'empty', results: [] };

    if (MM.olc) {
      var code = text.toUpperCase().replace(/\s+/g, '');
      if (MM.olc.isValid(code)) {
        var area = MM.olc.isFull(code) ? MM.olc.decode(code) : null;
        if (area && !area.error) {
          return { kind: 'plus-code', point: { lat: area.lat, lon: area.lon }, label: code, results: [] };
        }
      }
    }

    if (MM.gridref && MM.geodesy) {
      var grid = MM.gridref.parseGridRef(text);
      if (grid && MM.geodesy.validLat(grid.lat) && MM.geodesy.validLon(grid.lon)) {
        return {
          kind: 'grid-reference', point: { lat: grid.lat, lon: grid.lon },
          label: text.toUpperCase().replace(/\s+/g, ' '), results: [],
        };
      }
    }

    // UTM, Maidenhead and (only when asked) geohash, before plain coordinate
    // pairs: "30U 512345 5690123" and "IO91WM" cannot be a latitude and a
    // longitude, and reading them as one would land in the wrong hemisphere.
    if (MM.locators) {
      var located = MM.locators.interpret(text, { geohash: opts.geohash === true });
      if (located) return located;
    }

    if (MM.geodesy) {
      var coords = MM.geodesy.parseLatLon(text);
      if (coords) {
        return { kind: 'coordinates', point: coords, label: MM.geodesy.formatLatLon(coords), results: [] };
      }
    }

    var gaz = opts.gazetteer;
    if (!gaz) return { kind: 'unknown', results: [] };
    var results = gaz.search(text, opts);
    return { kind: results.length ? 'place' : 'unknown', results: results, query: text };
  }

  MM.gazetteer = {
    Gazetteer: Gazetteer,
    fold: fold,
    scoreName: scoreName,
    populationScore: populationScore,
    create: function (data) { return new Gazetteer(data); },
    interpret: interpret,
  };

  if (typeof module === 'object' && module.exports) module.exports = MM.gazetteer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
