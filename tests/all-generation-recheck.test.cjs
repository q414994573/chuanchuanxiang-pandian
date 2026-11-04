'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const Core=require('../count-core.js');
const latest=require('../current-order.json');
for(const source of [require('../catalog-legacy.json'),require('../catalog-v137.json'),require('../catalog-v138.json'),latest]){
 const base=Core.create(source,'2026-11-04','count-recheck');
 for(const [i,p] of base.catalog.entries()){
  for(const kind of ['duplicate-id','missing-item','swap-position'])test(`all-generation corruption ${source.products.length} ${p.id} ${kind}`,()=>{
   const d=Core.clone(base),j=(i+1)%d.catalog.length;
   if(kind==='duplicate-id')d.catalog[i].id=d.catalog[j].id;
   if(kind==='missing-item')delete d.items[p.id];
   if(kind==='swap-position')[d.catalog[i],d.catalog[j]]=[d.catalog[j],d.catalog[i]];
   const before=JSON.stringify(d);
   assert.equal(Core.validate(d,latest),false);
   assert.equal(JSON.stringify(d),before,'validation must never rewrite damaged snapshots');
  });
  test(`all-generation restore and clear ${source.products.length} ${p.id}`,()=>{
   const d=Core.clone(base);
   if(p.id==='cn:45')Core.edit(d,p.id,'unit','봉');
   if(p.id==='other:11')Core.edit(d,p.id,'unit','세트');
   Core.edit(d,p.id,'quantity','0.125');Core.finish(d,p.id);
   assert.equal(Core.complete(d,d.catalog[i]),true);
   const restored=JSON.parse(JSON.stringify(d));
   assert.equal(Core.validate(restored,latest),true);
   Core.edit(restored,p.id,'quantity','');
   assert.equal(Core.complete(restored,restored.catalog[i]),false);
   assert.equal(restored.items[p.id].decision,'pending');
   assert.equal(restored.items[p.id].processed,false);
   assert.equal(restored.items[p.id].quantity,'');
   for(const other of restored.catalog)if(other.id!==p.id)assert.deepEqual(restored.items[other.id],base.items[other.id]);
  });
 }
}
