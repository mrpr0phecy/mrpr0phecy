#!/usr/bin/env node
'use strict';
// Run: node --test scripts/tests/label-for-fixer.test.js
//
// scripts/fix-label-for.js rewrites card source, so what it does NOT touch
// matters as much as what it does. Each case below is a shape that exists in
// the catalogue and would be a bug if the rule guessed:
//
//   * a label already carrying `for=` is left alone (rewriting it would point
//     the label at a second control, or at nothing)
//   * a label with no `id=` on its control cannot be associated without
//     inventing an id, and inventing one is how duplicate ids happen
//   * a control named by aria-label/title does not need the label, and adding
//     `for=` would give it two names
//   * an id that appears twice cannot be pointed at — getElementById resolves
//     to the first, so the label would name the wrong field
//   * everything else in the file is byte-identical
//
// The last case is the one that makes the tool safe to run over 1,250 cards:
// the CLI runs the mounted-card harness before and after a rewrite and reverts
// unless the count of nameless fields goes DOWN.

const assert = require('assert');
const { associate } = require('../fix-label-for.js');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('a label sitting beside its field gets for=', () => {
  const src = `<div><label style="font-size:0.7rem;">Due date</label><input id="due" type="date"></div>`;
  const { html, fixes } = associate(src);
  assert.strictEqual(html, `<div><label style="font-size:0.7rem;" for="due">Due date</label><input id="due" type="date"></div>`);
  assert.deepStrictEqual(fixes, [{ id: 'due', text: 'Due date' }]);
});

test('the whitespace between the two is preserved', () => {
  const src = `<label>Weight</label>\n          <input id="w" type="number">`;
  const { html } = associate(src);
  assert.strictEqual(html, `<label for="w">Weight</label>\n          <input id="w" type="number">`);
});

test('a label that already has for= is untouched', () => {
  const src = `<label for="due">Due date</label><input id="due" type="date">`;
  const { html, fixes } = associate(src);
  assert.strictEqual(html, src);
  assert.strictEqual(fixes.length, 0);
});

test('a control already named another way is left to it', () => {
  for (const attrs of ['aria-label="Due date"', 'aria-labelledby="h1"', 'title="Due date"']) {
    const src = `<label>Due date</label><input id="due" type="date" ${attrs}>`;
    const { html, fixes } = associate(src);
    assert.strictEqual(html, src, attrs);
    assert.strictEqual(fixes.length, 0, attrs);
  }
});

test('a control with no id is skipped, not given one', () => {
  const src = `<label>Due date</label><input type="date">`;
  const { html, fixes } = associate(src);
  assert.strictEqual(html, src);
  assert.strictEqual(fixes.length, 0);
});

test('an id that appears twice is refused', () => {
  // getElementById would resolve the label to the first one: the second field
  // would still be nameless, and now one label looks associated.
  const src = `<label>Due date</label><input id="dup" type="date">` +
              `<label>Start date</label><input id="dup" type="date">`;
  const { html, fixes } = associate(src);
  assert.strictEqual(html, src);
  assert.strictEqual(fixes.length, 0);
});

test('an empty label is not an association', () => {
  const src = `<label> </label><input id="due" type="date">`;
  const { html } = associate(src);
  assert.strictEqual(html, src);
});

test('a quoted > inside an attribute does not end the tag', () => {
  const src = `<label title="a > b">Due date</label><input id="due" type="date">`;
  const { html, fixes } = associate(src);
  assert.strictEqual(html, `<label title="a > b" for="due">Due date</label><input id="due" type="date">`);
  assert.strictEqual(fixes.length, 1);
});

test('selects and textareas are associated like inputs', () => {
  const src = `<label>Vibe</label><select id="v"><option>a</option></select>` +
              `<label>Notes</label><textarea id="n"></textarea>`;
  const { html, fixes } = associate(src);
  assert.match(html, /<label for="v">Vibe<\/label><select id="v">/);
  assert.match(html, /<label for="n">Notes<\/label><textarea id="n">/);
  assert.strictEqual(fixes.length, 2);
});

test('a label separated from the field by other markup is not touched', () => {
  // Only whitespace may sit between them: anything else and the label may
  // belong to the next thing on the line, not this control.
  const src = `<label>Due date</label><span>*</span><input id="due" type="date">`;
  const { html, fixes } = associate(src);
  assert.strictEqual(html, src);
  assert.strictEqual(fixes.length, 0);
});

test('everything except the label tag is byte-identical', () => {
  const src = `<!doctype html>\n<!-- header -->\n<div class="row">\n` +
              `  <label data-k="x">Amount (£)</label><input id="amt" type="number" value="0.00">\n</div>\n` +
              `<script>\n  const s = '<label>Not markup</label><input id="x">';\n</script>\n`;
  const { html } = associate(src);
  const strip = s => s.replace(/ for="[^"]+"/g, '');
  assert.strictEqual(strip(html), strip(src), 'no other byte moved');
  assert.match(html, /<label data-k="x" for="amt">Amount \(£\)<\/label>/);
  // The string inside the script is text, not markup, and looks exactly like a
  // pair: a regex cannot tell, which is why the CLI verifies with the harness.
  assert.match(html, /const s = '<label for="x">Not markup<\/label>/);
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      fn();
      console.log(`  ok   ${name}`);
    } catch (e) {
      console.error(`  FAIL ${name}`);
      console.error(`       ${e.message.split('\n').join('\n       ')}`);
      process.exitCode = 1;
    }
  }
  console.log('');
})();
