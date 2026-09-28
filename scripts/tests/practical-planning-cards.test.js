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
test('leave time wraps into the previous day',()=>{const c=mount('leave-on-time-planner');try{c.set('arrival','00:30');c.run();assert.match(c.out(),/Leave: 23:30 \(1 day before arrival\)/);c.set('travel',-1);c.run();assert.equal(c.out(),'');}finally{c.dom.window.close();}});
test('curtain panels include total allowances',()=>{const c=mount('curtain-width-drop-calculator');try{assert.match(c.out(),/188.0 cm wide × 245.0 cm long/);c.set('panels',0);c.run();assert.equal(c.out(),'');}finally{c.dom.window.close();}});
test('scale converter works both ways and calculates resize percentage',()=>{const c=mount('scale-drawing-converter');try{assert.match(c.out(),/2.5 m/);assert.match(c.out(),/50%/);c.set('direction','drawing');c.set('value',2.5);c.set('unit','m');c.run();assert.match(c.out(),/5 cm/);}finally{c.dom.window.close();}});
test('filename preview preserves suffixes and detects overlaps',()=>{const c=mount('bulk-filename-preview');try{assert.match(c.out(),/holiday-001.jpg/);c.set('names','holiday-001.jpg');c.run();assert.match(c.out(),/temporary-name pass/);c.set('prefix','../');c.run();assert.equal(c.out(),'');}finally{c.dom.window.close();}});
test('return date supports leap year, inclusive counting and invalid dates',()=>{const c=mount('return-window-deadline-calculator');try{c.set('start','2028-02-28');c.set('asof','2028-02-28');c.set('days',2);c.run();assert.match(c.out(),/deadline: 2028-03-01/);c.set('count','inclusive');c.run();assert.match(c.out(),/deadline: 2028-02-29/);c.set('start','');c.run();assert.match(c.error(),/valid dates/);}finally{c.dom.window.close();}});
