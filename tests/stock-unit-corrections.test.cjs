'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('../count-core.js');
const Cloud=require('../cloud/core.cjs');
const Shared=require('../redesign-preview/shared-draft.cjs');
const Recovery=require('../redesign-preview/recovery.cjs');
const Units=require('../redesign-preview/stock-unit-corrections.cjs');
const source=JSON.parse(fs.readFileSync(require.resolve('../current-order.json'),'utf8'));
const pairs=[['kr:31','박스','개'],['cn:21','箱','包']];
function oldDraft(){
 const draft=Core.create(source,'2026-10-26','count-unit-correction');
 for(const [id,from] of pairs)draft.items[id].stockUnit=from;
 return draft;
}
function withoutCorrections(draft){
 const copy=structuredClone(draft);delete copy.contentVersion;
 for(const [id] of pairs)delete copy.items[id].stockUnit;
 return copy;
}
test('empty editable legacy inventory cells receive the two approved stock units without changing other data',()=>{
 const draft=oldDraft(),before=structuredClone(draft);
 draft.items['cn:21'].quantity='4';draft.items['cn:21'].decision='order';
 before.items['cn:21'].quantity='4';before.items['cn:21'].decision='order';
 const changes=Units.applyBlank(draft);
 assert.deepEqual(changes,pairs.map(([id,from,to])=>({id,from,to})));
 assert.deepEqual(withoutCorrections(draft),withoutCorrections(before));
 assert.equal(draft.contentVersion,before.contentVersion+2);
 assert.equal(draft.items['kr:31'].unit,'박스');assert.equal(draft.items['cn:21'].unit,'箱');
 assert.equal(Core.validate(draft,source),true);
 const saved=JSON.stringify(draft);assert.deepEqual(Units.applyBlank(draft),[]);assert.equal(JSON.stringify(draft),saved);
});
for(const [id,from,to] of pairs){
 for(const raw of ['0','12','1.25','0.','一包半']){
  test(`${id}: opening an old populated inventory ${JSON.stringify(raw)} does not relabel its ${from}`,()=>{
   const draft=oldDraft();draft.items[id].stock=raw;draft.items[id].stockStatus='counted';
   const before=structuredClone(draft.items[id]);Units.applyBlank(draft);
   assert.deepEqual(draft.items[id],before);
  });
 }
 for(const parked of ['0','两包',' ']){
  test(`${id}: parked inventory ${JSON.stringify(parked)} keeps its recorded unit`,()=>{
   const draft=oldDraft();draft.stockText={[id]:parked};const before=structuredClone(draft.items[id]);
   Units.applyBlank(draft);assert.deepEqual(draft.items[id],before);assert.equal(draft.stockText[id],parked);
  });
 }
 for(const raw of ['0','8','18','20','0.','1.25','1000000']){
  test(`${id}: explicit stock entry ${raw} adopts ${to} atomically before persistence`,()=>{
   const draft=oldDraft();draft.items[id].stock='12';draft.items[id].stockStatus='counted';
   const original=structuredClone(draft),qty=draft.items[id].quantity,unit=draft.items[id].unit;
   Core.edit(draft,id,'stock',raw);const version=draft.contentVersion;
   assert.deepEqual(Units.adoptEntered(draft,id,raw),{id,from,to});
   assert.equal(draft.items[id].stock,raw);assert.equal(draft.items[id].stockUnit,to);
   assert.equal(draft.items[id].quantity,qty);assert.equal(draft.items[id].unit,unit);
   assert.equal(draft.contentVersion,version+1);assert.equal(Core.validate(draft,source),true);
   const roundtrip=JSON.parse(JSON.stringify(draft));assert.equal(roundtrip.items[id].stock,raw);assert.equal(roundtrip.items[id].stockUnit,to);
   assert.deepEqual(Units.adoptEntered(draft,id,raw),null);
   // Undo must restore the number and its recorded unit together; this helper
   // deliberately does not run when an undo restores the original inventory.
   Core.edit(draft,id,'stock',original.items[id].stock);Core.edit(draft,id,'stockUnit',original.items[id].stockUnit);
   assert.equal(draft.items[id].stock,'12');assert.equal(draft.items[id].stockUnit,from);
  });
 }
 for(const raw of ['', '.', '两包', '-1', '1e2', 'Infinity', '1.2345', '1000001', '0000000000000']){
  test(`${id}: ${JSON.stringify(raw)} is not a qualifying numeric stock replacement`,()=>{
   const draft=oldDraft();draft.items[id].stock=raw;draft.items[id].stockStatus=raw===''?'pending':'counted';
   const before=JSON.stringify(draft);assert.equal(Units.adoptEntered(draft,id,raw),null);assert.equal(JSON.stringify(draft),before);
  });
 }
 test(`${id}: refused stock write and quantity-only edits cannot correct a populated inventory unit`,()=>{
  const draft=oldDraft();Core.edit(draft,id,'stock','12');Core.edit(draft,id,'quantity','8');const before=JSON.stringify(draft);
  assert.equal(Units.adoptEntered(draft,id,'8'),null);assert.equal(JSON.stringify(draft),before);
 });
 test(`${id}: an unknown manually recorded unit is never overwritten`,()=>{
  const draft=oldDraft();draft.items[id].stockUnit='原记录单位';Units.applyBlank(draft);
  Core.edit(draft,id,'stock','8');const before=JSON.stringify(draft);
  assert.equal(Units.adoptEntered(draft,id,'8'),null);assert.equal(JSON.stringify(draft),before);
 });
 test(`${id}: shared save treats corrected stock value and unit as one logical cell`,()=>{
  const base=oldDraft();Core.edit(base,id,'stock','12');const local=structuredClone(base),remote=structuredClone(base);
  Core.edit(local,id,'stock','8');Units.adoptEntered(local,id,'8');
  Core.edit(remote,id,'quantity','3');const merged=Shared.merge(base,local,remote);
  assert.equal(merged.items[id].stock,'8');assert.equal(merged.items[id].stockUnit,to);assert.equal(merged.items[id].quantity,'3');
  const conflict=structuredClone(base);Core.edit(conflict,id,'stock','10');
  assert.throws(()=>Shared.merge(base,local,conflict),/同一格/);
 });
}
test('reviewed history remains byte-identical even with empty stock or a new numeric candidate',()=>{
 const draft=oldDraft();draft.status='reviewed';const before=JSON.stringify(draft);
 assert.deepEqual(Units.applyBlank(draft),[]);
 for(const [id] of pairs)assert.equal(Units.adoptEntered(draft,id,'8'),null);
 assert.equal(JSON.stringify(draft),before);
});
test('submitted snapshots and order text preserve original values and order units',()=>{
 const draft=oldDraft();draft.items['cn:45'].unit='봉';draft.items['other:11'].unit='세트';
 for(const p of draft.catalog)Core.finish(draft,p.id,true);
 for(const [id] of pairs){Core.edit(draft,id,'stock','12');Core.edit(draft,id,'quantity','2');Core.finish(draft,id);}
 draft.status='reviewed';const payload=Cloud.submission(draft,Core,source);
 const order={...payload,id:draft.id,revision:1,orderStage:'finalized'},before=JSON.stringify(order);
 const reopened=Recovery.fromOrder(order,source).draft;
 assert.deepEqual(Units.applyBlank(reopened),[]);
 for(const [id,from] of pairs){assert.equal(reopened.items[id].stock,'12');assert.equal(reopened.items[id].stockUnit,from);}
 Core.edit(reopened,'kr:31','stock','8');Units.adoptEntered(reopened,'kr:31','8');
 assert.equal(JSON.stringify(order),before);
 assert.match(Cloud.orderText(order,draft.catalog,'kr'),/2박스/);assert.match(Cloud.orderText(order,draft.catalog,'cn'),/2箱/);
});
test('only the two known stocked IDs qualify; malformed and stock-exempt drafts stay unchanged',()=>{
 for(const draft of [null,{}, {status:'draft'}, {status:'draft',catalog:[],items:{},contentVersion:0}])assert.deepEqual(Units.applyBlank(draft),[]);
 const draft=oldDraft();draft.catalog.find(p=>p.id==='kr:31').hasStock=false;draft.catalog.find(p=>p.id==='cn:21').hasStock=false;
 const before=JSON.stringify(draft);assert.deepEqual(Units.applyBlank(draft),[]);assert.equal(Units.adoptEntered(draft,'cn:33','8'),null);assert.equal(Units.adoptEntered(draft,'__proto__','8'),null);assert.equal(JSON.stringify(draft),before);
});
test('version overflow refuses the entire blank correction batch instead of partially changing data',()=>{
 const draft=oldDraft();draft.contentVersion=Number.MAX_SAFE_INTEGER-1;const before=JSON.stringify(draft);
 assert.deepEqual(Units.applyBlank(draft),[]);assert.equal(JSON.stringify(draft),before);
});
