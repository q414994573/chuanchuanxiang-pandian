'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Core=require('../count-core.js'),Cloud=require('../cloud/core.cjs'),Search=require('../redesign-preview/search.cjs');
const source=require('../current-order.json'),v137=require('../catalog-v137.json'),v129=require('../catalog-legacy.json');
const base=Core.create(source,'2026-10-30','count-matrix');
for(const p of base.catalog){if(p.id==='cn:45')Core.edit(base,p.id,'unit','봉');if(p.id==='other:11')Core.edit(base,p.id,'unit','세트');Core.finish(base,p.id,true);}
// 138 products x 8 distinct quantity/stock states = 1104 payload/restore/lock cases.
const cases=[['0.001',''],['0.125','0'],['1','1.5'],['2.5','999999'],['999999.999','0.001'],['1000000','1000000'],['10',''],['100.01','2']];
for(const p of source.products)for(const [quantity,stock] of cases)test(`v55 roundtrip ${p.id} quantity=${quantity} stock=${stock||'blank'}`,()=>{
 const d=Core.clone(base),item=d.items[p.id],old=Core.clone(item);
 Core.edit(d,p.id,'quantity',quantity);if(p.hasStock)Core.edit(d,p.id,'stock',stock);
 assert.equal(Core.complete(d,d.catalog.find(x=>x.id===p.id)),false,'editing requires confirmation');Core.finish(d,p.id);d.status='reviewed';
 const before=JSON.stringify(d),payload=Cloud.submission(d,Core,source),restored=JSON.parse(payload.snapshot);
 assert.equal(payload.quantities[p.id],Math.round(Number(quantity)*1000));assert.equal(payload.units[p.id],old.unit);
 assert.equal(restored.items[p.id].stock,p.hasStock?stock:'');assert.equal(restored.items[p.id].quantity,quantity);
 assert.equal(Core.validate(restored,source),true);assert.equal(JSON.stringify(d),before);
 assert.throws(()=>Core.edit(restored,p.id,'quantity','3'));assert.equal(restored.items[p.id].quantity,quantity);
 for(const other of d.catalog)if(other.id!==p.id)assert.deepEqual(restored.items[other.id],base.items[other.id]);
});
// 138 x 7 distinct corruptions = 966 rejection/non-mutation cases.
const corruptions={missingItem:(d,id)=>delete d.items[id],wrongName:(d,id)=>d.catalog.find(p=>p.id===id).name+='-INVALID',wrongCategory:(d,id)=>d.catalog.find(p=>p.id===id).cat='invalid',wrongStockFlag:(d,id)=>{const p=d.catalog.find(p=>p.id===id);p.hasStock=!p.hasStock;},badDecision:(d,id)=>d.items[id].decision='invalid',badProcessed:(d,id)=>d.items[id].processed='true',tooLongUnit:(d,id)=>d.items[id].unit='x'.repeat(41)};
for(const p of source.products)for(const [name,corrupt] of Object.entries(corruptions))test(`v55 reject ${p.id} ${name}`,()=>{const d=Core.clone(base);corrupt(d,p.id);const before=JSON.stringify(d);assert.equal(Core.validate(d,source),false);assert.equal(JSON.stringify(d),before);});
for(const old of [v129,v137,source])for(const status of ['draft','reviewed'])test(`v55 exact ${old.products.length} ${status} backward compatibility`,()=>{const d=Core.create(old,'2026-10-30','count-compat');if(status==='reviewed'){for(const p of d.catalog)Core.finish(d,p.id,true);d.status=status;}const before=JSON.stringify(d);assert(Core.validate(d,source));assert.equal(JSON.stringify(d),before);assert.equal(d.catalog.length,old.products.length);});
test('v55 new product exact fields and previous 137 records unchanged',()=>{assert.deepEqual(source.products.filter(p=>p.id!=='kr:63'),v137.products);assert.deepEqual(source.products.find(p=>p.id==='kr:63'),{id:'kr:63',cat:'kr',category:'韩国食品',row:63,name:'칼국수면',stock:null,order:null,unit:'봉',hasStock:true,alias:'刀切面'});});
for(const q of ['칼국수면','칼 국수 면','ㅋㄱㅅㅁ','刀切面'])test(`v55 noodle search ${q}`,()=>assert(Search.createIndex(source.products).find(q).has('kr:63')));
for(const q of ['칼국수면大葱腐竹粉丝','刀切面，大葱、腐竹 粉丝','大葱腐竹粉丝칼국수면'])test(`v55 regression combined search ${q}`,()=>{const ids=Search.createIndex(source.products).find(q);for(const id of ['kr:63','kr:7','cn:33','cn:75'])assert(ids.has(id),id);});
