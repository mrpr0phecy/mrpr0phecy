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
 *  - Every keystroke used to fold and scan all 19,686 names — about 20 ms,
 *    which is a dropped frame per character typed, on a phone much worse. The
 *    scan is now indexed: each name is folded once at load and registered
 *    under the one- and two-character fragments it contains, and a query is
 *    matched only against the names that could possibly contain it. The index
 *    is built from the names themselves, so it cannot disagree with the data,
 *    and the ranking is unchanged — same scores, same order.
 */
(function (root) {
  'use strict';

  var MM = (root.MM = root.MM || {});

  /** What a fragment bucket looks like when no name contains it. */
  var EMPTY = typeof Int32Array === 'function' ? new Int32Array(0) : [];

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

  function scoreFolded(foldedName, q) {
    var n = foldedName;
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

  function scoreName(name, query) {
    return scoreFolded(fold(name), query);
  }

  function populationScore(pop) {
    // 0–25 bonus for bigger places, on a log scale: 100k ≈ 16, 1M ≈ 21, 10M ≈ 25.
    if (!pop || pop <= 0) return 0;
    return Math.min(25, Math.log10(pop) * 3.2);
  }

  /**
   * Proximity boost from a planar approximation: full weight within 50 km,
   * fading to nothing at 2,000 km. This is what makes "Cambridge" behave when
   * you are in England rather than Massachusetts.
   *
   * The approximation is deliberate. Ranking every candidate with a Vincenty
   * solution costs more than the whole indexed search around it, and the
   * boost is a 30-point gradient over 2,000 km — a fraction of a percent of
   * distance error moves it by less than a hundredth of a point. The exact
   * geodesic distance is still what callers get back in `km`.
   */
  var KM_PER_DEG_LAT = 110.574;
  var KM_PER_DEG_LON = 111.320;

  function approxKm(near, cosLat, lat, lon) {
    var dx = (lon - near.lon) * KM_PER_DEG_LON * cosLat;
    var dy = (lat - near.lat) * KM_PER_DEG_LAT;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Does `a` rank below `b`? Score first, then population, as the old sort did. */
  function ranksBelow(a, b) {
    if (a.score !== b.score) return a.score < b.score;
    return a.pop < b.pop;
  }

  /**
   * A result row as the caller gets it. Rows are copied on the way out rather
   * than shared: a caller that sorts or edits what it was handed must not be
   * able to change what the next caller is handed.
   */
  function copyRow(row) {
    return {
      name: row.name, lat: row.lat, lon: row.lon, cc: row.cc, pop: row.pop,
      country: row.country, km: row.km, score: row.score,
    };
  }

  /** Insert into a sorted, capped top-K — no full sort, no throwaway objects. */
  function insertTop(top, limit, candidate) {
    if (top.length >= limit && ranksBelow(candidate, top[top.length - 1])) return false;
    var i = top.length;
    while (i > 0 && ranksBelow(top[i - 1], candidate)) i -= 1;
    top.splice(i, 0, candidate);
    if (top.length > limit) top.length = limit;
    return true;
  }

  /**
   * Register a name under every one- and two-character fragment it contains.
   * A query can only match a name that contains the query, so the fragment at
   * the start of the query is a key the matching names are guaranteed to be
   * filed under — which is what makes the candidate list exact rather than a
   * guess that quietly drops results.
   */
  function indexFragments(buckets, foldedName, index) {
    var seen = new Set();
    for (var i = 0; i < foldedName.length; i += 1) {
      var one = foldedName.charAt(i);
      if (!seen.has(one)) { seen.add(one); push(buckets, one, index); }
      if (i + 1 < foldedName.length) {
        var two = one + foldedName.charAt(i + 1);
        if (!seen.has(two)) { seen.add(two); push(buckets, two, index); }
      }
    }
  }

  function push(buckets, key, index) {
    var list = buckets.get(key);
    if (!list) buckets.set(key, [index]);
    else list.push(index);
  }

  function Gazetteer(data) {
    this.cities = (data && data.cities) || [];
    this.countries = null; // set by setCountries()
    this.version = (data && data.v) || 0;
    this.source = (data && data.source) || null;

    // The rows stay the public shape — the canvas renderer and the cards read
    // them — while search runs over columnar copies: folded names computed
    // once, and numbers in typed arrays rather than behind property lookups.
    var count = this.cities.length;
    var names = new Array(count);
    var foldedNames = new Array(count);
    var codes = new Array(count);
    var lats = new Float64Array(count);
    var lons = new Float64Array(count);
    var pops = new Float64Array(count);
    var buckets = new Map();
    for (var i = 0; i < count; i += 1) {
      var row = this.cities[i];
      var folded = fold(row[0]);
      names[i] = row[0];
      foldedNames[i] = folded;
      codes[i] = row[3] || '';
      lats[i] = row[1];
      lons[i] = row[2];
      pops[i] = row[4] || 0;
      indexFragments(buckets, folded, i);
    }
    var fragments = new Map();
    buckets.forEach(function (list, key) { fragments.set(key, Int32Array.from(list)); });

    this._names = names;
    this._folded = foldedNames;
    this._codes = codes;
    this._lats = lats;
    this._lons = lons;
    this._pops = pops;
    this._fragments = fragments;
    this._recent = new Map();   // a few recent queries: typing is repetitive
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
    if (!q) return [];

    var near = opts.near && MM.geodesy ? MM.geodesy.point(opts.near) : null;
    var cc = opts.cc ? String(opts.cc).toUpperCase() : null;
    var minPop = opts.minPop || 0;
    var maxKm = opts.maxKm || 0;
    var key = q + '\u0000' + limit + '\u0000' + (cc || '') + '\u0000' + minPop + '\u0000' + maxKm +
      '\u0000' + (near ? near.lat.toFixed(2) + ',' + near.lon.toFixed(2) : '');
    var cached = this._recent.get(key);
    if (cached) {
      // Refresh its place in the recency order and hand back copies, so a
      // caller sorting or editing the results cannot corrupt what is cached.
      this._recent.delete(key);
      this._recent.set(key, cached);
      return cached.map(copyRow);
    }

    var candidates = this._candidates(q);
    var top = [];
    var cosLat = near ? Math.cos(near.lat * Math.PI / 180) : 1;

    for (var c = 0; c < candidates.length; c += 1) {
      var i = candidates[c];
      if (cc && this._codes[i] !== cc) continue;
      var pop = this._pops[i];
      if (pop < minPop) continue;
      var score = scoreFolded(this._folded[i], q);
      if (!score) continue;
      score += populationScore(pop);

      var lat = this._lats[i];
      var lon = this._lons[i];
      var km = null;
      if (near) {
        // Cheap pass first: a candidate that cannot reach the top-K even with
        // the boost is discarded without paying for a geodesic solution.
        var boost = Math.max(0, 30 * (1 - approxKm(near, cosLat, lat, lon) / 2000));
        if (top.length >= limit && score + boost + 1 <= top[top.length - 1].score) continue;
        km = MM.geodesy.distanceKm(near, { lat: lat, lon: lon });
        if (maxKm && km > maxKm) continue;
        score += Math.max(0, 30 * (1 - km / 2000));
      }
      insertTop(top, limit, {
        name: this._names[i], lat: lat, lon: lon, cc: this._codes[i], pop: pop,
        country: this.countryName(this._codes[i]), km: km, score: score,
      });
    }

    var projected = top.map(copyRow);
    this._recent.set(key, top);
    if (this._recent.size > 40) this._recent.delete(this._recent.keys().next().value);
    return projected;
  };

  /**
   * The names that could possibly match, from the fragment index.
   *
   * Every way of scoring requires the query — or, for a multi-word query, its
   * first word — to occur inside the folded name, so filing names by the
   * fragments they contain and looking up the fragment the query starts with
   * returns a candidate list that is guaranteed to include every match. When
   * the first word is a single character there is no two-character fragment to
   * look up, so the one-character bucket is used instead.
   */
  Gazetteer.prototype._candidates = function (q) {
    var firstWord = q.split(/\s+/)[0] || q;
    var key = (q.length > 1 && firstWord.length > 1) ? q.slice(0, 2) : q.charAt(0);
    var bucket = this._fragments.get(key);
    return bucket || EMPTY;
  };

  /** Places around a point, nearest first. */
  Gazetteer.prototype.nearest = function (input, limit, options) {
    var opts = options || {};
    var pt = MM.geodesy ? MM.geodesy.point(input) : null;
    if (!pt) return [];
    var minPop = opts.minPop || 0;
    var count = this.cities.length;
    var cosLat = Math.cos(pt.lat * Math.PI / 180);
    var rows = [];
    for (var i = 0; i < count; i += 1) {
      var pop = this._pops[i];
      if (pop < minPop) continue;
      var lat = this._lats[i];
      var lon = this._lons[i];
      rows.push({
        name: this._names[i], lat: lat, lon: lon, cc: this._codes[i], pop: pop,
        country: this.countryName(this._codes[i]),
        // Ordered on the planar approximation, then the geodesic distance is
        // computed for the survivors only: ranking 19,686 Vincenty solutions
        // to pick eight is the expensive way round.
        km: approxKm(pt, cosLat, lat, lon),
      });
    }
    rows.sort(function (a, b) { return a.km - b.km; });
    var keep = Math.min(rows.length, Math.max(limit || 5, 8) * 6);
    for (var r = 0; r < keep; r += 1) rows[r].km = MM.geodesy.distanceKm(pt, rows[r]);
    rows.length = keep;
    rows.sort(function (a, b) { return a.km - b.km; });
    return rows.slice(0, limit || 5);
  };

  /** Cities inside a box — the "what can I see here?" layer. */
  Gazetteer.prototype.inBBox = function (bbox, limit, minPop) {
    var out = [];
    var threshold = minPop || 0;
    var count = this.cities.length;
    for (var i = 0; i < count; i += 1) {
      var pop = this._pops[i];
      if (pop < threshold) continue;
      var lon = this._lons[i];
      if (lon < bbox.west || lon > bbox.east) continue;
      var lat = this._lats[i];
      if (lat < bbox.south || lat > bbox.north) continue;
      out.push({ name: this._names[i], lat: lat, lon: lon, cc: this._codes[i], pop: pop, country: this.countryName(this._codes[i]) });
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
      var located = MM.locators.interpret(text, {
        geohash: opts.geohash === true,
        geohashMin: opts.geohashMin,
        // Two-pair locators share their shape with UK postcode districts
        // ("CF10"), so a caller with a place index asks for three pairs and
        // takes a two-pair locator as a suggestion instead.
        maidenheadMin: opts.maidenheadMin,
      });
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
    scoreFolded: scoreFolded,
    populationScore: populationScore,
    create: function (data) { return new Gazetteer(data); },
    interpret: interpret,
  };

  if (typeof module === 'object' && module.exports) module.exports = MM.gazetteer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
