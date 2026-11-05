'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); }
catch (_) { ({ JSDOM } = require('jsdom')); }
function mount(slug) {
  const html = fs.readFileSync(path.join(__dirname, '../../cards', slug + '.html'), 'utf8');
  return new JSDOM('<!doctype html><body>' + html + '</body>', {runScripts: 'dangerously'});
}
const set = (d,id,v) => { d.getElementById(id).value = v; };
const click = (d,id) => d.getElementById(id).click();
const text = (d,id) => d.getElementById(id).textContent;

test('dog walk planner subtracts the walk and buffer and rejects invalid inputs', () => {
  const dom = mount('fireworks-dog-walk-time-planner'), d = dom.window.document;
  click(d,'fwdogwalk-run'); assert.match(text(d,'fwdogwalk-result'), /15:30.*16:00/s);
  set(d,'fwdogwalk-buffer','0'); click(d,'fwdogwalk-run'); assert.match(text(d,'fwdogwalk-result'), /16:00.*16:30/s);
  set(d,'fwdogwalk-sunset','00:15'); click(d,'fwdogwalk-run'); assert.match(text(d,'fwdogwalk-result'), /before midnight/);
  set(d,'fwdogwalk-duration','-2'); click(d,'fwdogwalk-run'); assert.match(text(d,'fwdogwalk-result'), /valid sunset/);
  dom.window.close();
});
test('food calculator rounds separately and handles empty groups', () => {
  const dom = mount('bonfire-night-sausage-rolls-calculator'), d = dom.window.document;
  click(d,'fwfood-run'); assert.match(text(d,'fwfood-result'), /Meat sausages: 18/); assert.match(text(d,'fwfood-result'), /Plant-based sausages: 9/);
  set(d,'fwfood-meat','25'); set(d,'fwfood-plant','0'); set(d,'fwfood-each','1'); set(d,'fwfood-extra','8'); click(d,'fwfood-run');
  assert.match(text(d,'fwfood-result'), /Meat sausages: 27/); assert.match(text(d,'fwfood-result'), /Plant-based sausages: 0/);
  set(d,'fwfood-meat','0'); click(d,'fwfood-run'); assert.match(text(d,'fwfood-result'), /at least one guest/); dom.window.close();
});
test('storage calculator displays remaining and shortfall with validation', () => {
  const dom = mount('fireworks-video-storage-calculator'), d = dom.window.document;
  click(d,'fwstorage-run'); assert.match(text(d,'fwstorage-result'), /4\.80 GB/); assert.match(text(d,'fwstorage-result'), /left: 5\.20 GB/);
  set(d,'fwstorage-free','1'); click(d,'fwstorage-run'); assert.match(text(d,'fwstorage-result'), /shortfall: 3\.80 GB/);
  set(d,'fwstorage-rate','0'); click(d,'fwstorage-run'); assert.match(text(d,'fwstorage-result'), /valid values/); dom.window.close();
});
test('drafts are text-only, require fields, and do not save', () => {
  for (const [slug,prefix,input] of [['fireworks-neighbour-notice-maker','fwnotice','location'],['fireworks-group-meeting-plan','fwmeet','place']]) {
    const dom = mount(slug), d = dom.window.document;
    set(d,prefix+'-'+input,'<img src=x onerror=alert(1)>'); click(d,prefix+'-run');
    assert.match(text(d,prefix+'-result'), /<img/); assert.equal(d.querySelector('#'+prefix+'-result img'), null);
    set(d,prefix+'-'+input,''); click(d,prefix+'-run'); assert.match(text(d,prefix+'-result'), /Please/); dom.window.close();
  }
});
test('incident note uses required factual fields, supports optional fields and treats input as text', () => {
  const dom = mount('fireworks-noise-incident-diary'), d = dom.window.document;
  click(d,'fwdiary-run'); assert.match(text(d,'fwdiary-result'), /Enter the date/);
  set(d,'fwdiary-date','2026-11-05'); set(d,'fwdiary-time','20:30'); set(d,'fwdiary-place','High Street'); set(d,'fwdiary-what','<script>test</script>');
  click(d,'fwdiary-run'); assert.match(text(d,'fwdiary-result'), /<script>test<\/script>/); assert.equal(d.querySelector('#fwdiary-result script'), null);
  assert.match(text(d,'fwdiary-result'), /Not recorded/); dom.window.close();
});
test('accessibility questions, after-display checklist and choices respond', () => {
  const access = mount('fireworks-display-accessibility-questions'), d = access.window.document;
  click(d,'fwaccess-run'); assert.match(text(d,'fwaccess-result'), /Select at least/); d.querySelector('input').click(); click(d,'fwaccess-run'); assert.match(text(d,'fwaccess-result'), /step-free/); access.window.close();
  const after = mount('after-fireworks-safety-checklist'), a = after.window.document;
  a.querySelector('input').click(); assert.match(text(a,'fwafter-progress'), /1 of 7/); click(a,'fwafter-reset'); assert.match(text(a,'fwafter-progress'), /0 of 7/); after.window.close();
  for (const [slug,prefix,field,value,expected] of [['firework-shapes-and-effects-guide','fwshape','shape','willow',/Willow/],['fireworks-night-craft-ideas','fwcraft','material','paint',/washable paint/i]]) {
    const dom = mount(slug), doc = dom.window.document; set(doc,prefix+'-'+field,value); click(doc,prefix+'-run'); assert.match(text(doc,prefix+'-result'),expected); dom.window.close();
  }
});
