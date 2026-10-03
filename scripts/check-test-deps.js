#!/usr/bin/env node
'use strict';

// The browser-harness suites use jsdom, kept outside the repository so the
// production site remains dependency-free. Fail once, before the test runner
// starts, rather than letting individual suites turn a missing prerequisite
// into confusing failures or silently skipped coverage.
const path = require('path');

const candidates = [
  'jsdom',
  path.join('/tmp/tenv', 'node_modules', 'jsdom'),
];

for (const candidate of candidates) {
  try {
    require.resolve(candidate);
    process.exit(0);
  } catch (_) {
    // Try the next supported location.
  }
}

console.error([
  'Cannot run the product test suite: the test-only dependency "jsdom" is missing.',
  'Install it outside the repository, then retry:',
  '  mkdir -p /tmp/tenv && (cd /tmp/tenv && npm install jsdom)',
  'See AGENTS.md §2. No project or production dependency is added.',
].join('\n'));
process.exit(1);
