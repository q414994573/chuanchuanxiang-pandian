'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Cleanup=require('../redesign-preview/storage-cleanup.cjs'),Core=require('../count-core.js'),source=require('../current-order.json');
const KEY='ccx-ordering-draft-v1',oldKey=KEY+':before-shared:100';
function make(id='count-old',src=source){return Core.create(src,'2026-11-10',id);}
const raw=d=>JSON.stringify({draft:d,pos:0,field:'stock'});
function storage(entries=[]){const map=new Map(entries);return {map,get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
const scan=s=>Cleanup.inspect(s,{key:KEY,source,legacy:true});
test('inspection is read only and exact active duplicates free space without any write',()=>{
 const d=make('count-current'),s=storage([[KEY,raw(d)],[oldKey,raw(d)]]),before=[...s.map];
 const p=scan(s);assert.deepEqual([...s.map],before);assert.equal(Cleanup.summary(p).removable,1);
 s.setItem=()=>{throw Error('quota')};const r=Cleanup.execute(s,p);assert.equal(r.removed,1);assert.equal(s.getItem(KEY),before[0][1]);assert.equal(s.getItem(oldKey),null);assert.ok(r.bytes>0);
});
test('a group of duplicates keeps one complete independent copy',()=>{
 const d=make(),s=storage([[oldKey,raw(d)],[KEY+':recovery:101',raw(d)],[KEY+':restored:102',raw(d)]]);
 const p=scan(s);assert.equal(p.candidates.length,2);assert.equal(Cleanup.execute(s,p).removed,2);assert.equal(s.length,1);assert.equal(JSON.parse([...s.map.values()][0]).draft.id,d.id);
});
for(const suffix of [':feedback',':product-speech',':search-activity',':before-shared:wrong',':recovery-cloud:123',':order-edit:uid:count-old',':order-edit:uid:count-old:recovery:123',':unknown:123'])test('never removes unrelated or unsupported storage '+suffix,()=>{
 const d=make(),k=KEY+suffix,s=storage([[KEY,raw(d)],[k,raw(d)]]);Cleanup.execute(s,scan(s));assert.equal(s.getItem(k),raw(d));
});
for(const k of ['firebase:authUser:project','another-site-key','ccx-redesign-draft-v2:before-shared:100','ccx-count-session:test-count-123'])test('namespace isolation '+k,()=>{
 const s=storage([[k,raw(make())]]);Cleanup.execute(s,scan(s));assert.equal(s.length,1);
});
for(const value of ['broken','null','{}',JSON.stringify({draft:make(),order:{id:'unsaved'}}),JSON.stringify({draft:make(),unknown:'unuploaded'}),JSON.stringify({draft:{id:'count-invalid'}})])test('invalid or additional payload is retained '+value.slice(0,30),async()=>{
 const s=storage([[oldKey,value]]);let reads=0;const p=await Cleanup.verifyArchives(scan(s),source,async()=>{reads++;return null;});Cleanup.execute(s,p);assert.equal(s.getItem(oldKey),value);assert.equal(reads,0);
});
for(const src of [require('../catalog-legacy.json'),require('../catalog-v137.json'),require('../catalog-v138.json'),require('../catalog-v142.json'),source])test('complete immutable cloud archive permits cleanup for catalog '+src.products.length,async()=>{
 const d=make('count-old',src),s=storage([[oldKey,raw(d)]]);let reads=0;const p=await Cleanup.verifyArchives(scan(s),source,async id=>{reads++;assert.equal(id,d.id);return {localId:id,draft:Core.clone(d)};});
 assert.equal(reads,1);assert.equal(Cleanup.summary(p).archived,1);assert.equal(Cleanup.execute(s,p).removed,1);
});
for(const change of [d=>{d.items['kr:7'].stock='0';},d=>{d.items['kr:7'].quantity='8';},d=>{d.deferred={'kr:7':true};},d=>{d.stockText={'kr:7':'半包'};},d=>{d.log.push({time:'old',text:'different'});},d=>{d.catalog[0].name='wrong';},d=>{d.id='count-different';}])test('any different cloud content leaves local record intact '+change.toString(),async()=>{
 const d=make(),remote=Core.clone(d);change(remote);const s=storage([[oldKey,raw(d)]]);
 const p=await Cleanup.verifyArchives(scan(s),source,async()=>({localId:d.id,draft:remote}));assert.equal(Cleanup.execute(s,p).removed,0);assert.equal(s.getItem(oldKey),raw(d));
});
test('cloud read failure preserves unique data but still permits proven local duplicates',async()=>{
 const d=make(),other=make('count-unique'),s=storage([[KEY,raw(d)],[oldKey,raw(d)],[KEY+':recovery:101',raw(other)]]);
 const p=await Cleanup.verifyArchives(scan(s),source,async()=>{throw Error('offline')});assert.equal(p.cloudUnavailable,1);assert.equal(Cleanup.execute(s,p).removed,1);assert.equal(s.getItem(KEY+':recovery:101'),raw(other));
});
test('current draft IDs are never removed on cloud proof alone',async()=>{
 const d=make(),s=storage([[oldKey,raw(d)]]);const p=Cleanup.inspect(s,{key:KEY,source,activeIds:[d.id]});let called=false;
 await Cleanup.verifyArchives(p,source,async()=>{called=true;return {localId:d.id,draft:d};});assert.equal(called,false);assert.equal(Cleanup.execute(s,p).removed,0);
});
test('legacy active and its different previous revision are protected',async()=>{
 const d=make(),previous=Core.clone(d);previous.items['kr:7'].stock='3';const key='ccx-count-session:'+d.id,s=storage([['ccx-count-active',d.id],[key,JSON.stringify(d)],[key+':previous',JSON.stringify(previous)]]);
 const before=[...s.map];const p=await Cleanup.verifyArchives(scan(s),source,async()=>({localId:d.id,draft:previous}));assert.equal(Cleanup.execute(s,p).removed,0);assert.deepEqual([...s.map],before);
});
test('historical legacy session needs exact archive proof',async()=>{
 const d=make(),k='ccx-count-session:'+d.id,s=storage([[k,JSON.stringify(d)]]);const p=await Cleanup.verifyArchives(scan(s),source,async()=>({localId:d.id,draft:d}));assert.equal(Cleanup.execute(s,p).removed,1);
});
test('duplicate anchors are never also scheduled for cloud deletion',async()=>{
 const d=make(),s=storage([[oldKey,raw(d)],[KEY+':recovery:101',raw(d)]]);const p=await Cleanup.verifyArchives(scan(s),source,async()=>({localId:d.id,draft:d}));assert.equal(p.candidates.length,1);Cleanup.execute(s,p);assert.equal(s.length,1);
});
for(const guard of [KEY,'ccx-count-active','ccx-count-session:count-current'])test('another tab changes protected guard '+guard,()=>{
 const d=make('count-current'),s=storage([[KEY,raw(d)],['ccx-count-active',d.id],['ccx-count-session:'+d.id,JSON.stringify(d)],[oldKey,raw(d)]]),p=scan(s);s.setItem(guard,'changed');
 assert.throws(()=>Cleanup.execute(s,p),/已变化/);assert.equal(s.getItem(oldKey),raw(d));
});
test('changed candidate is skipped and never overwritten',()=>{
 const d=make(),s=storage([[KEY,raw(d)],[oldKey,raw(d)]]),p=scan(s);s.setItem(oldKey,'new input');const r=Cleanup.execute(s,p);assert.equal(r.changed,1);assert.equal(r.removed,0);assert.equal(s.getItem(oldKey),'new input');
});
test('changed duplicate anchor preserves remaining copy',()=>{
 const d=make(),k=KEY+':recovery:101',s=storage([[oldKey,raw(d)],[k,raw(d)]]),p=scan(s);s.setItem(p.candidates[0].proof.key,'new input');assert.equal(Cleanup.execute(s,p).removed,0);assert.equal(s.getItem(p.candidates[0].key),raw(d));
});
for(const fail of ['throw','noop'])test('delete '+fail+' cannot announce freed bytes',()=>{
 const d=make(),s=storage([[KEY,raw(d)],[oldKey,raw(d)]]),p=scan(s);s.removeItem=()=>{if(fail==='throw')throw Error('blocked');};const r=Cleanup.execute(s,p);assert.equal(r.removed,0);assert.equal(r.bytes,0);assert.equal(r.failed,1);
});
test('zero, unfinished numbers and unique unsynced rows survive duplicate cleanup',()=>{
 const d=make();d.items['kr:7'].stock='0';d.items['kr:8'].quantity='2.';d.stockText={'kr:9':'半包'};d.deferred={'kr:8':true};const unique=Core.clone(d);unique.items['kr:7'].stock='1';
 const s=storage([[oldKey,raw(d)],[KEY+':recovery:101',raw(unique)]]),before=[...s.map];assert.equal(Cleanup.execute(s,scan(s)).removed,0);assert.deepEqual([...s.map],before);
});

const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const harnessSource=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${harnessSource};return harness;`)(require,Core,source);
function app(){const h=harness(true),s=h.ctx.localStorage;Object.defineProperty(s,'length',{get:()=>h.saved.size});s.key=i=>[...h.saved.keys()][i]??null;s.removeItem=k=>h.saved.delete(k);h.ctx.confirm=()=>true;h.run(`peerEnabled=true;member={role:'editor'};screen='more';saveLocalEnvelope();globalThis.initial=localStorage.getItem(KEY);localStorage.setItem(KEY+':before-shared:100',JSON.stringify({draft}));`);return h;}
test('both roles can use the same safe cleanup action',async()=>{
 for(const role of ['owner','editor']){const h=app();h.run(`member.role='${role}'`);await h.run('inspectStorage()');h.run('cleanStorage()');assert.equal(h.saved.has(KEY+':before-shared:100'),false);assert.equal(h.run('localStorage.getItem(KEY)'),h.run('initial'));assert.match(h.run('storageNotice'),/已清理 1/);}
});
test('cancelled cleanup deletes nothing',async()=>{const h=app();await h.run('inspectStorage()');h.ctx.confirm=()=>false;h.run('cleanStorage()');assert.equal(h.saved.has(oldKey),true);});
test('session change after inspection invalidates cleanup',async()=>{const h=app();await h.run('inspectStorage()');h.run('sessionEpoch++');assert.throws(()=>h.run('cleanStorage()'),/已变化/);assert.equal(h.saved.has(oldKey),true);});
test('unsaved input after inspection invalidates cleanup',async()=>{const h=app();await h.run('inspectStorage()');h.run("draft.items['kr:7'].quantity='9'");assert.throws(()=>h.run('cleanStorage()'),/已变化/);assert.equal(h.saved.has(oldKey),true);});
test('input arriving during cloud inspection aborts without deleting anything',async()=>{
 const h=app();h.run(`globalThis.older=C.clone(draft);older.id='count-older';localStorage.setItem(KEY+':before-shared:101',JSON.stringify({draft:older}));peerApi={archive:async()=>{draft.items['kr:7'].quantity='8';return {localId:older.id,draft:older}}};`);
 await assert.rejects(h.run('inspectStorage()'),/检查期间/);assert.equal(h.saved.has(oldKey),true);assert.equal(h.saved.has(KEY+':before-shared:101'),true);assert.equal(h.run('storagePlan'),null);
});
test('another tab writing while confirmation is open prevents every deletion',async()=>{
 const h=app();await h.run('inspectStorage()');h.ctx.confirm=()=>{h.saved.set(KEY,'other-tab-input');return true;};assert.throws(()=>h.run('cleanStorage()'),/已变化/);assert.equal(h.saved.has(oldKey),true);assert.equal(h.saved.get(KEY),'other-tab-input');
});
test('clearing recovery space can retry failed local save without claiming cloud success',async()=>{
 const h=app();h.run("draft.items['kr:7'].quantity='9';localSaveFailed=true;cloudPending=true;cloudPhase='failed'");await h.run('inspectStorage()');h.run('cleanStorage()');assert.equal(h.run('localSaveFailed'),false);assert.equal(JSON.parse(h.saved.get(KEY)).draft.items['kr:7'].quantity,'9');assert.equal(h.run('cloudPhase'),'failed');
});
for(const flag of ['peerFlight','peerRestoreFlight','cloudWriting','cloudReading','orderFlight','orderStageWriting','keypad','textMode','editId'])test('inspection waits for pending interaction '+flag,async()=>{
 const h=app();h.run(`${flag}=true`);await assert.rejects(h.run('inspectStorage()'),/请先收起键盘/);assert.equal(h.saved.has(oldKey),true);
});
