'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let JSDOM;try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require('/tmp/tenv/node_modules/jsdom'));}
function mount(slug){
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../../cards',slug+'.html'),'utf8'),{runScripts:'dangerously'});
 dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
 const d=dom.window.document;
 return {dom,d,set:(key,v)=>{d.getElementById(slug+'-'+key).value=v;},run:()=>d.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true})),out:()=>d.querySelector('[data-result]').textContent,error:()=>d.querySelector('[data-status]').textContent};
}
test('rota rotates each job and rejects duplicate people',()=>{const c=mount('household-chore-rota');try{assert.match(c.out(),/Kitchen — Alex/);assert.match(c.out(),/Kitchen — Sam/);c.set('people','Alex\nalex');c.run();assert.match(c.error(),/unique/);assert.equal(c.out(),'');}finally{c.dom.window.close();}});
test('agenda handles midnight and breaks',()=>{const c=mount('meeting-agenda-timebox-planner');try{c.set('start','23:50');c.set('topics','One | 10\nTwo | 20');c.set('break',5);c.run();assert.match(c.out(),/00:25 \(\+1 day\)/);assert.match(c.out(),/Total: 35 min/);c.set('topics','Missing duration');c.run();assert.match(c.error(),/Line 1/);}finally{c.dom.window.close();}});
test('parcel uses longest side and rejects zero divisor',()=>{const c=mount('parcel-volumetric-weight-checker');try{assert.match(c.out(),/Volumetric weight: 4.80 kg/);assert.match(c.out(),/Length \+ girth: 140 cm/);c.set('divisor',0);c.run();assert.match(c.error(),/above zero/);}finally{c.dom.window.close();}});
test('lists compare case rules and safely render markup',()=>{const c=mount('compare-two-lists');try{assert.match(c.out(),/In both \(2\)/);c.set('case','exact');c.run();assert.match(c.out(),/In both \(1\)/);c.set('a','<img src=x onerror=alert(1)>');c.run();assert.equal(c.d.querySelector('img'),null);assert.match(c.out(),/<img/);}finally{c.dom.window.close();}});
test('presentation budget includes reserved time',()=>{const c=mount('presentation-word-budget-planner');try{assert.match(c.out(),/Word budget: 1040/);c.set('draft','hello '.repeat(130));c.run();assert.match(c.out(),/slot used: 3.0 min/);c.set('questions',10);c.run();assert.match(c.error(),/reserve less/);}finally{c.dom.window.close();}});
