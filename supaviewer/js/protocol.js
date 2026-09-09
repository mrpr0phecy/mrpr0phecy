/* SupaViewer protocol helpers — local circuit + documented login shape.
   Nothing in this file talks to a grid. */
(function (global) {
  'use strict';
  var SV = global.SV = global.SV || {};

  function uuid() {
    var b = new Uint8Array(16);
    (global.crypto || { getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = Math.random() * 256 | 0; } }).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  SV.coords = {
    toThree: function (x, y, z) { return { x: x, y: z, z: y }; },
    toSL: function (x, y, z) { return { x: x, y: z, z: y }; }
  };

  SV.GRID = {
    sandbox: {
      id: 'sandbox',
      name: 'Supa Sandbox',
      kind: 'local',
      enabled: true,
      blurb: 'A 256 m region that lives in this tab. No account.'
    },
    osgrid: {
      id: 'osgrid',
      name: 'OSGrid',
      kind: 'opensim',
      enabled: false,
      login: 'http://login.osgrid.org/',
      blurb: 'Needs a local WebSocket gateway (not in v0).'
    },
    agni: {
      id: 'agni',
      name: 'Second Life (Agni) — public map',
      kind: 'public-map',
      enabled: true,
      login: 'https://login.agni.lindenlab.com/cgi-bin/login.cgi',
      blurb: 'Walk the real Second Life mainland using Linden Lab public map tiles. You are a ghost on the grid — not logged in. Live avatars, chat and inventory need a local gateway. This page will not take a password.'
    },
    aditi: {
      id: 'aditi',
      name: 'Second Life Beta (Aditi)',
      kind: 'lludp',
      enabled: false,
      login: 'https://login.aditi.lindenlab.com/cgi-bin/login.cgi',
      blurb: 'Same limits as Agni.'
    }
  };

  /* A few well-known packet names. IDs are the 32-bit packed form
     viewers use on the wire (high word = frequency class). */
  SV.protocol = {
    MSG: {
      PacketAck: 0xFFFFFFFB,
      OpenCircuit: 0xFFFFFFFC,
      CloseCircuit: 0xFFFFFFFD,
      UseCircuitCode: 4294901763,
      CompleteAgentMovement: 4294901777,
      AgentUpdate: 4,
      RegionHandshake: 4294901891,
      RegionHandshakeReply: 4294901892,
      ObjectUpdate: 12,
      ImprovedTerseObjectUpdate: 15,
      KillObject: 241,
      ChatFromViewer: 4294901840,
      ChatFromSimulator: 4294901841,
      ViewerEffect: 17,
      AgentAnimation: 20,
      AvatarAnimation: 20,
      CoarseLocationUpdate: 6,
      RequestImage: 8,
      ImageData: 9
    },

    CHAT: { whisper: 0, say: 1, shout: 2, startTyping: 4, stopTyping: 5, debug: 6, ownerSay: 8 },

    uuid: uuid,

    /* XML-RPC login_to_simulator body. Built for a future gateway —
       never submitted by the page. Password is already hashed. */
    buildLoginXML: function (opts) {
      opts = opts || {};
      function mem(name, type, value) {
        return '<member><name>' + name + '</name><value><' + type + '>' + value + '</' + type + '></value></member>';
      }
      var options = (opts.options || [
        'inventory-root', 'inventory-skeleton', 'inventory-lib-root',
        'initial-outfit', 'login-flags', 'signup-transfer-credit',
        'seed_capability', 'buddy-list', 'ui-config', 'adult_compliant'
      ]).map(function (o) { return '<value><string>' + o + '</string></value>'; }).join('');
      return '<?xml version="1.0"?><methodCall><methodName>login_to_simulator</methodName><params><param><value><struct>' +
        mem('first', 'string', opts.first || 'Resident') +
        mem('last', 'string', opts.last || 'Resident') +
        mem('passwd', 'string', opts.passwdHash || '') +
        mem('start', 'string', opts.start || 'last') +
        mem('channel', 'string', 'SupaViewer') +
        mem('version', 'string', opts.version || '0.1.0') +
        mem('platform', 'string', 'Web') +
        mem('mac', 'string', opts.mac || '00:00:00:00:00:00') +
        mem('id0', 'string', opts.id0 || '00000000-0000-0000-0000-000000000000') +
        mem('agree_to_tos', 'boolean', '1') +
        mem('read_critical', 'boolean', '1') +
        '<member><name>options</name><value><array><data>' + options + '</data></array></value></member>' +
        '</struct></value></param></params></methodCall>';
    },

    LocalCircuit: function (handlers) {
      this.handlers = handlers || {};
      this.agentId = uuid();
      this.sessionId = uuid();
      this.circuitCode = (Math.random() * 0x7fffffff) | 1;
      this.region = {
        name: 'Supa Sandbox',
        handle: [256000, 256000],
        size: 256,
        water: 20
      };
    }
  };

  SV.protocol.LocalCircuit.prototype.emit = function (name, payload) {
    var fn = this.handlers[name];
    if (fn) fn(payload);
  };

  SV.protocol.LocalCircuit.prototype.chatFromViewer = function (text, chatType) {
    var t = String(text || '').slice(0, 1023);
    this.emit('ChatFromSimulator', {
      fromName: this.agentName || 'You',
      sourceType: 1,
      chatType: chatType == null ? 1 : chatType,
      text: t,
      ownerId: this.agentId,
      audible: 1
    });
  };

  SV.protocol.LocalCircuit.prototype.system = function (text) {
    this.emit('ChatFromSimulator', {
      fromName: 'Second Life',
      sourceType: 2,
      chatType: 1,
      text: String(text),
      ownerId: '00000000-0000-0000-0000-000000000000',
      audible: 1
    });
  };
})(window);
