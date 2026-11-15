'use strict';
const {test}=require('node:test'),a=require('node:assert/strict');
const C=require('../count-core'),S=require('../redesign-preview/search.cjs'),F=require('../redesign-preview/count-flow.cjs'),Cloud=require('../cloud/core.cjs'),s=require('../catalog-v146.json'),old=require('../catalog-v144.json');
const additions=[['cn:94','馄饨','箱','cn',true],['other:23','롤백(17cm×25cm)','박스','other',false]];
test('v61 retains every previous144 value and relative position',()=>{a.equal(s.products.length,146);a.deepEqual(s.products.filter(p=>!additions.some(x=>x[0]===p.id)),old.products);});
for(const [id,name,unit,cat,hasStock] of additions)test('v61 '+id+' exact fields, category end, search, completion and submission',()=>{
 const p=s.products.find(p=>p.id===id);a.deepEqual([p.name,p.unit,p.cat,p.hasStock,p.stock,p.order],[name,unit,cat,hasStock,null,null]);a.equal(s.products.filter(p=>F.catOf(p)===cat).at(-1).id,id);a(S.createIndex(s.products).find(name).has(id));
 const d=C.create(s,'2026-11-15','count-v61');a.equal(d.items[id].quantity,'');a.equal(d.items[id].stock,'');a.equal(C.complete(d,p),false);a.deepEqual(F.countFields(p),hasStock?['stock','qty']:['qty']);
 if(hasStock)C.edit(d,id,'stock','0');C.edit(d,id,'quantity','2');C.finish(d,id);a(C.complete(d,p));
 for(const q of d.catalog)if(q.id!==id){if(q.id==='cn:45')C.edit(d,q.id,'unit','봉');if(q.id==='other:11')C.edit(d,q.id,'unit','세트');C.finish(d,q.id,true);}d.status='reviewed';const payload=Cloud.submission(d,C,s);a.equal(payload.quantities[id],2000);a.equal(payload.units[id],unit);a(C.validate(JSON.parse(payload.snapshot),s));a.throws(()=>C.edit(d,id,'quantity','3'));
});
for(const status of ['draft','reviewed'])test('v61 preserves old144 '+status+' snapshots without adding items',()=>{const d=C.create(old,'2026-11-12','count-old144');if(status==='reviewed')for(const p of d.catalog)C.finish(d,p.id,true);d.status=status;const before=JSON.stringify(d);a(C.validate(d,s));a.equal(JSON.stringify(d),before);a.equal(d.items['cn:94'],undefined);});
test('v61 rejects 145 rows and wrong new-product names or categories',()=>{for(const mutate of [d=>{delete d.items[d.catalog.pop().id];},d=>{d.catalog.find(p=>p.id==='cn:94').name='wrong';},d=>{d.catalog.find(p=>p.id==='other:23').cat='cn';}]){const d=C.create(s,'2026-11-15','count-bad');mutate(d);a.equal(C.validate(d,s),false);}});
