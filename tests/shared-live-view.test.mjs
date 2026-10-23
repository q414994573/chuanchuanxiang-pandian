import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {doc,setDoc} from 'firebase/firestore';
import assert from 'node:assert/strict';
import {sharedCountStore} from '../cloud/shared-count.js';
import Core from '../count-core.js';
const require=createRequire(import.meta.url),source=JSON.parse(readFileSync('current-order.json'));
const existing=readFileSync('tests/redesign-interactions.test.cjs','utf8');
const harnessSource=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${harnessSource};return harness;`)(require,Core,source);
const env=await initializeTestEnvironment({projectId:'demo-ccx-live-view',firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});
try{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'members','a'),{role:'owner',name:'大伟',active:true}));
 const api=sharedCountStore(env.authenticatedContext('a').firestore(),'a','大伟',Core,source);
 const head=await api.start(Core.create(source,'2026-10-23','count-live-view'));
 const h=harness(true);h.ctx.head=head;
 h.ctx.testApi=api;
 h.run(`peerEnabled=true;member={role:'owner'};peerApi=testApi;screen='count';peerReceive(head,true);globalThis.expectations={};globalThis.failures=[];globalThis.frames=0;
 render=paintRows=()=>{frames++;for(const [id,qty] of Object.entries(expectations)){if(draft.items[id].quantity!==qty||!seen(id))failures.push({id,qty:draft.items[id].quantity,seen:seen(id),revision:peerBase?.revision,conflict:peerConflict,stack:new Error().stack});}};`);
 const stop=api.watch(record=>{h.ctx.incoming=record;h.run('peerReceive(incoming)');},e=>{throw e;});
 try{
  for(let round=0;round<source.products.length;round++){
   h.run(`viewCat=draft.catalog[${round}].cat;openCount(${round},'qty');typeKey('1');expectations[draft.catalog[pos].id]='1';nextCell();`);
   if(round%2===0)await new Promise(r=>setTimeout(r,25));
  }
  for(let round=0;round<8&&h.run('peerDirty()||!!peerFlight');round++)await h.run('peerSave()');
  await new Promise(r=>setTimeout(r,100));
  assert.equal(h.run('cloudConflict'),false,h.run('peerConflict'));
  assert.equal(h.run('failures.length'),0,h.run('JSON.stringify(failures.slice(0,8))'));
  const saved=await api.read();for(const p of source.products){assert.equal(saved.draft.items[p.id].quantity,'1');assert.equal(saved.draft.seen[p.id],true);}
  console.log('PASS all '+source.products.length+' products: rapid entry, next cell, live watch, save returns and persisted count progress');
 }finally{stop();}
}finally{await env.cleanup();}
