'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MODULE = path.resolve(__dirname, '..', '..', 'maps', 'livemap.js');

function fakeEnvironment(options = {}) {
  const previous = {
    document: global.document,
    WebGLRenderingContext: global.WebGLRenderingContext,
    maplibregl: global.maplibregl,
    cached: require.cache[MODULE],
  };
  const maps = [];
  let scriptRequests = 0;

  global.document = {
    currentScript: { src: 'https://example.test/maps/livemap.js' },
    querySelector() { return null; },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        style: {},
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        getContext() { return {}; },
      };
    },
    head: {
      appendChild(node) {
        setImmediate(() => {
          if (node.tagName === 'SCRIPT') {
            scriptRequests += 1;
            if (options.onScriptAppend) options.onScriptAppend(node, scriptRequests, FakeMap);
            else if (node.onerror) node.onerror();
          } else if (node.onerror) node.onerror();
        });
      },
    },
  };
  global.WebGLRenderingContext = function WebGLRenderingContext() {};

  class FakeMap {
    constructor(options) {
      this.options = options;
      this.listeners = {};
      this.removed = false;
      maps.push(this);
    }
    on(name, callback) { this.listeners[name] = callback; }
    addControl() {}
    remove() { this.removed = true; }
  }
  if (options.maplibregl === false) delete global.maplibregl;
  else global.maplibregl = { Map: FakeMap };

  delete require.cache[MODULE];
  const livemap = require(MODULE);

  return {
    livemap,
    maps,
    get scriptRequests() { return scriptRequests; },
    restore() {
      delete require.cache[MODULE];
      if (previous.cached) require.cache[MODULE] = previous.cached;
      if (previous.document === undefined) delete global.document;
      else global.document = previous.document;
      if (previous.WebGLRenderingContext === undefined) delete global.WebGLRenderingContext;
      else global.WebGLRenderingContext = previous.WebGLRenderingContext;
      if (previous.maplibregl === undefined) delete global.maplibregl;
      else global.maplibregl = previous.maplibregl;
    },
  };
}

function fakeContainer() {
  return {
    children: [],
    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
      return node;
    },
    removeChild(node) {
      const index = this.children.indexOf(node);
      if (index !== -1) this.children.splice(index, 1);
      node.parentNode = null;
      return node;
    },
  };
}

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test('a missing MapLibre bundle also removes the wrapper and leaves the offline map unobstructed', async () => {
  const env = fakeEnvironment({ maplibregl: false });
  try {
    const host = fakeContainer();
    const errors = [];
    const handle = env.livemap.create(host, {
      onError: (message) => errors.push(message),
    });
    await nextTurn();
    await nextTurn();

    assert.equal(handle.status, 'failed');
    assert.equal(host.children.length, 0);
    assert.match(errors[0], /could not load .*maplibre-gl\.js/);
  } finally {
    env.restore();
  }
});

test('Retry can load MapLibre after a transient bundle request failure', async () => {
  const env = fakeEnvironment({
    maplibregl: false,
    onScriptAppend(node, attempt, FakeMap) {
      if (attempt === 1) {
        node.onerror();
        return;
      }
      global.maplibregl = { Map: FakeMap };
      node.onload();
    },
  });
  try {
    const host = fakeContainer();
    const errors = [];
    const first = env.livemap.create(host, {
      timeoutMs: 40,
      nav: false,
      scale: false,
      onError: message => errors.push(message),
    });
    await nextTurn();
    await nextTurn();

    assert.equal(first.status, 'failed');
    assert.equal(host.children.length, 0);
    assert.equal(env.scriptRequests, 1);
    assert.equal(errors.length, 1);

    const retry = env.livemap.create(host, { timeoutMs: 40, nav: false, scale: false });
    await nextTurn();

    assert.equal(env.scriptRequests, 2, 'Retry issues a fresh bundle request instead of reusing the rejected Promise');
    assert.equal(retry.status, 'loading');
    assert.equal(env.maps.length, 1);
    env.maps[0].listeners.load();
    assert.equal(retry.status, 'live');
    assert.equal(host.children.length, 1);
  } finally {
    env.restore();
  }
});

test('live-map failure removes its overlay so the complete offline map remains interactive', async () => {
  const env = fakeEnvironment();
  try {
    const host = fakeContainer();
    const errors = [];
    const handle = env.livemap.create(host, {
      timeoutMs: 40,
      nav: false,
      scale: false,
      onError: (message) => errors.push(message),
    });
    await nextTurn();

    assert.equal(host.children.length, 1, 'the live layer is present while it is loading');
    assert.equal(host.children[0].className, 'mm-live-layer');
    assert.equal(host.children[0].style.opacity, '0');
    const map = env.maps[0];
    assert.ok(map, 'MapLibre was constructed');

    map.listeners.error({ error: new Error('tile service unavailable'), sourceId: 'openmaptiles' });

    assert.equal(handle.status, 'failed');
    assert.equal(map.removed, true);
    assert.equal(host.children.length, 0, 'an empty full-size overlay must not intercept offline-map gestures');
    assert.deepEqual(errors, ['tile service unavailable']);
  } finally {
    env.restore();
  }
});

test('destroy removes the live overlay after a successful first frame too', async () => {
  const env = fakeEnvironment();
  try {
    const host = fakeContainer();
    let ready = false;
    const style = { version: 8, sources: {}, layers: [] };
    const handle = env.livemap.create(host, {
      timeoutMs: 40,
      nav: false,
      scale: false,
      style,
      styleUrl: 'https://tiles.openfreemap.org/styles/fiord',
      onReady: () => { ready = true; },
    });
    await nextTurn();

    const map = env.maps[0];
    assert.equal(map.options.style, style, 'a prefetched style object avoids a second style fetch');
    map.listeners.load();
    assert.equal(handle.status, 'live');
    assert.equal(ready, true);
    assert.equal(host.children.length, 1);
    assert.equal(host.children[0].style.opacity, '1');

    handle.destroy();
    assert.equal(map.removed, true);
    assert.equal(host.children.length, 0);
  } finally {
    env.restore();
  }
});
