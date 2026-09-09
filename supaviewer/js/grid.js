/* SupaViewer — public Second Life (Agni) grid helpers.
   Talks only to Linden Lab's documented public map/caps URLs.
   Never sends a password. Nothing here is a logged-in session. */
(function (global) {
  'use strict';
  var SV = global.SV = global.SV || {};

  var CAP_XY = 'https://cap.secondlife.com/cap/0/d661249b-2b5a-4436-966a-3d3b8d7a574f';
  var CAP_NAME = 'https://cap.secondlife.com/cap/0/b713fe80-283b-4585-af4d-a3b7d9a32492';
  var seq = 0;
  var nameCache = Object.create(null);
  var xyCache = Object.create(null);

  function keyXY(gx, gy) { return gx + ',' + gy; }

  function jsonpAssign(src, id, timeout, cb) {
    var done = false;
    var s = document.createElement('script');
    var t = setTimeout(function () { finish(new Error('timeout'), undefined); }, timeout || 7000);
    function finish(err, val) {
      if (done) return;
      done = true;
      clearTimeout(t);
      try { delete global[id]; } catch (e) { global[id] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
      cb(err, val);
    }
    s.async = true;
    s.onload = function () { finish(null, global[id]); };
    s.onerror = function () { finish(new Error('blocked'), undefined); };
    s.src = src;
    document.head.appendChild(s);
  }

  SV.slgrid = {
    TILE: function (gx, gy) {
      return 'https://map.secondlife.com/map-1-' + (gx | 0) + '-' + (gy | 0) + '-objects.jpg';
    },
    MAPS: function (name, x, y, z) {
      return 'https://maps.secondlife.com/secondlife/' +
        encodeURIComponent(name || 'Da Boom') + '/' +
        Math.round(x || 128) + '/' + Math.round(y || 128) + '/' + Math.round(z || 22);
    },
    SLURL: function (name, x, y, z) {
      return 'secondlife://' + encodeURIComponent(name || 'Da Boom') + '/' +
        Math.round(x || 128) + '/' + Math.round(y || 128) + '/' + Math.round(z || 22);
    },
    /* Confirmed grid cells plus names we resolve via the public cap. */
    DESTINATIONS: [
      { name: 'Da Boom', gx: 1000, gy: 1000, note: 'Oldest region on Agni' },
      { name: 'Ahern', gx: 997, gy: 1002, note: 'Sansara infohub' },
      { name: 'Dore', note: 'Sansara welcome cluster' },
      { name: 'Bay City - Boardwalk', gx: 990, gy: 1002, note: 'Bay City waterfront' },
      { name: 'Calleta', gx: 1005, gy: 1015, note: 'Heterocera atoll' },
      { name: 'Half Hitch', gx: 1140, gy: 1050, note: 'Blake Sea' },
      { name: 'Waterhead', note: 'Linden community hub' },
      { name: 'Mauve', note: 'Classic mainland hub' },
      { name: 'Caledon Oxbridge', note: 'Steampunk Caledon' },
      { name: 'Hippotropolis', note: 'Hippo Hollow / social' }
    ],

    lookupName: function (simName, cb) {
      var n = String(simName || '').replace(/^\s+|\s+$/g, '');
      if (!n) { cb(new Error('empty')); return; }
      var ck = n.toLowerCase();
      if (xyCache[ck]) { cb(null, xyCache[ck]); return; }
      var dest = SV.slgrid.DESTINATIONS;
      var i;
      for (i = 0; i < dest.length; i++) {
        if (dest[i].name.toLowerCase() === ck && dest[i].gx != null) {
          var hit = { x: dest[i].gx, y: dest[i].gy, name: dest[i].name };
          xyCache[ck] = hit;
          nameCache[keyXY(hit.x, hit.y)] = dest[i].name;
          cb(null, hit);
          return;
        }
      }
      var id = 'svCap' + (++seq);
      var src = CAP_XY + '?var=' + id + '&sim_name=' + encodeURIComponent(n);
      jsonpAssign(src, id, 7000, function (err, val) {
        if (!err && val && typeof val.x === 'number' && typeof val.y === 'number') {
          var rec = { x: val.x | 0, y: val.y | 0, name: n };
          xyCache[ck] = rec;
          nameCache[keyXY(rec.x, rec.y)] = n;
          cb(null, rec);
          return;
        }
        if (xyCache[ck]) { cb(null, xyCache[ck]); return; }
        cb(err || new Error('unknown region'));
      });
    },

    lookupXY: function (gx, gy, cb) {
      gx = gx | 0; gy = gy | 0;
      var k = keyXY(gx, gy);
      if (Object.prototype.hasOwnProperty.call(nameCache, k)) {
        cb(null, nameCache[k]);
        return;
      }
      var id = 'svCap' + (++seq);
      var src = CAP_NAME + '?var=' + id + '&grid_x=' + gx + '&grid_y=' + gy;
      jsonpAssign(src, id, 7000, function (err, val) {
        var name = (typeof val === 'string' && val) ? val : '';
        if (name) {
          nameCache[k] = name;
          xyCache[name.toLowerCase()] = { x: gx, y: gy, name: name };
          cb(null, name);
          return;
        }
        /* Cache misses too, so void ocean is not re-queried every step. */
        if (!err) nameCache[k] = '';
        cb(err, name);
      });
    },

    loadImage: function (url, cross, cb) {
      var img = new Image();
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        cb(new Error('timeout'));
      }, 10000);
      if (cross) img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(t);
        cb(null, img);
      };
      img.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(t);
        cb(new Error('img'));
      };
      img.src = url;
    },

    /* WebGL-safe texture. Direct Linden tiles often lack CORS; proxies are a fallback. */
    loadTexture: function (gx, gy, THREE, cb) {
      var official = SV.slgrid.TILE(gx, gy);
      var urls = [
        official,
        'https://corsproxy.io/?' + encodeURIComponent(official),
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(official)
      ];
      var i = 0;
      function next() {
        if (i >= urls.length) { cb(new Error('no tile')); return; }
        var url = urls[i++];
        var loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(url, function (tex) {
          tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
          cb(null, tex);
        }, undefined, function () { next(); });
      }
      next();
    },

    sltClock: function () {
      try {
        return new Date().toLocaleTimeString('en-GB', {
          timeZone: 'America/Los_Angeles',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }) + ' SLT';
      } catch (e) {
        var d = new Date();
        return ((d.getUTCHours() + 24 - 8) % 24).toString().padStart
          ? ('0' + ((d.getUTCHours() + 16) % 24)).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2) + ' SLT'
          : d.toUTCString();
      }
    }
  };
})(window);
