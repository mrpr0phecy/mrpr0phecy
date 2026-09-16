#!/usr/bin/env node
'use strict';
// Run: node scripts/tests/producer-tools.test.js (jsdom installed in /tmp/tenv).
const {JSDOM}=require('/tmp/tenv/node_modules/jsdom');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
function mount(slug){
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../../cards',slug+'.html'),'utf8'),{runScripts:'dangerously'});
 return dom.window;
}
function input(w,id,value){const e=w.document.getElementById(id);e.value=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));}
async function audio(w,p,channels){
 w.AudioContext=class{async decodeAudioData(){return {numberOfChannels:channels.length,length:channels[0].length,duration:channels[0].length/48000,sampleRate:48000,getChannelData:i=>channels[i]};}async close(){}};
 const f=w.document.getElementById(p+'-file');Object.defineProperty(f,'files',{configurable:true,value:[{size:32,arrayBuffer:async()=>new ArrayBuffer(32)}]});
 f.dispatchEvent(new w.Event('change'));await new Promise(r=>setTimeout(r,0));
 return w.document.getElementById(p+'-result').textContent;
}
(async()=>{
 let w=mount('sample-delay-alignment-calculator');
 assert.match(w.document.getElementById('sdac-result').textContent,/48 samples/);
 assert.match(w.document.getElementById('sdac-result').textContent,/500.0 Hz/);
 input(w,'sdac-delay',0);assert.match(w.document.getElementById('sdac-result').textContent,/no delay-induced/);
 input(w,'sdac-rate','');assert.match(w.document.getElementById('sdac-result').textContent,/Enter an offset/);w.close();
 w=mount('lufs-target-headroom-planner');assert.match(w.document.getElementById('lthp-result').textContent,/exceeds ceiling by 2.00 dB/);
 input(w,'lthp-target',-20);assert.match(w.document.getElementById('lthp-result').textContent,/Gain-only recommendation: -2.00 dB/);w.close();
 w=mount('stereo-mono-compatibility-analyzer');
 assert.match(await audio(w,'smca',[[1,-1],[1,-1]]),/correlation: 1.0000/);
 assert.match(await audio(w,'smca',[[1,-1],[-1,1]]),/correlation: -1.0000/);
 assert.match(await audio(w,'smca',[[0,0],[0,0]]),/Silent file/);w.close();
 w=mount('loop-seam-checker');assert.match(await audio(w,'lpsc',[[0,1,0]]),/Boundary jump: 0.000000/);
 assert.match(await audio(w,'lpsc',[[0,0,1]]),/Boundary jump: 1.000000/);w.close();
 w=mount('peak-normalizer-wav-export');let exported;
 w.Blob=class{constructor(parts){exported=parts[0];}};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 await audio(w,'pkne',[[0.5,-0.5],[0.25,-0.25]]);input(w,'pkne-target',0);
 w.document.getElementById('pkne-download').click();
 const v=new DataView(exported);assert.equal(v.getUint32(24,true),48000);assert.equal(v.getUint16(22,true),2);assert.equal(v.getUint16(34,true),24);assert.equal(v.getUint32(40,true),12);assert.equal(v.getUint8(44),255);assert.equal(v.getUint8(46),127);
 await audio(w,'pkne',[[0,0]]);assert.equal(w.document.getElementById('pkne-download').disabled,true);w.close();
 console.log('PASS: five producer tools — formulas, invalid inputs, mono/stereo/silence, seams, WAV header and sample peak.');
})().catch(e=>{console.error(e);process.exitCode=1;});
