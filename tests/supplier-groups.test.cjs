const {test}=require('node:test');
const assert=require('node:assert/strict');
const Flow=require('../redesign-preview/count-flow.cjs');
const Search=require('../redesign-preview/search.cjs');
const Core=require('../count-core.js');
const Cloud=require('../cloud/core.cjs');
const Recovery=require('../redesign-preview/recovery.cjs');
const Shared=require('../redesign-preview/shared-draft.cjs');
const source=require('../current-order.json');

const drinkIds=['other:18','other:19','other:20','other:21','other:22'];

test('supplier split covers all 129 original IDs exactly once without rewriting their catalog',()=>{
 const before=JSON.stringify(source);
 const groups=Object.fromEntries(Flow.CATS.map(([id])=>[id,source.products.filter(p=>Flow.catOf(p)===id)]));
 assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([id,rows])=>[id,rows.length])),{kr:45,cn:66,other:13,drinks:5});
 const combined=Object.values(groups).flat();
 assert.equal(combined.length,129);assert.equal(new Set(combined.map(p=>p.id)).size,129);
 assert.deepEqual(combined.map(p=>p.id),source.products.map(p=>p.id));
 assert.deepEqual(groups.drinks.map(p=>p.id),drinkIds);
 assert.ok(groups.drinks.every(p=>p.cat==='other'&&p.category==='其他商品'));
 assert.equal(JSON.stringify(source),before);
});

test('only the final five soft drinks move, retaining each original Korean primary name',()=>{
 const drinks=source.products.filter(p=>Flow.catOf(p)==='drinks');
 assert.deepEqual(drinks.map(p=>[p.id,p.name]),[
  ['other:18','칠성사이다'],['other:19','(zero)칠성사이다'],['other:20','코카콜라'],['other:21','(zero)코카콜라'],['other:22','환타']
 ]);
 assert.equal(Flow.catOf(source.products.find(p=>p.id==='other:4')),'other','orange concentrate remains with its original supplier');
 assert.equal(Flow.catOf(source.products.find(p=>p.id==='other:16')),'other','rice bowls are not drinks');
 assert.ok(source.products.filter(p=>p.cat==='cn').every(p=>Flow.catOf(p)==='cn'),'Chinese-supplier drinks must stay in Chinese foods');
 assert.equal(Flow.catOf(null),undefined);
});

test('drink counting exposes only quantity cells and retains stable source indexes',()=>{
 const indices=Flow.visibleCountIndexes(source.products,'drinks',()=>true,-1);
 assert.deepEqual(indices,[124,125,126,127,128]);
 assert.deepEqual(indices.map(i=>source.products[i].id),drinkIds);
 assert.ok(indices.every(i=>!source.products[i].hasStock));
 assert.ok(indices.every(i=>JSON.stringify(Flow.countFields(source.products[i]))==='["qty"]'));
 assert.deepEqual(Flow.visibleCountIndexes(source.products,'drinks',()=>false,126),[126]);
 assert.deepEqual(Flow.visibleCountIndexes(source.products,'other',()=>false,126),[],'active drink cannot leak into other goods');
});

test('supplier count navigation stops before drinks and ends after the final drink',()=>{
 assert.equal(source.products[123].id,'other:16');
 assert.deepEqual(Flow.advance(source.products,123),{stay:true,cat:'other',nextCat:'drinks'});
 assert.deepEqual(Flow.advance(source.products,124),{stay:false,index:125,cat:'drinks',nextCat:null});
 assert.deepEqual(Flow.advance(source.products,127),{stay:false,index:128,cat:'drinks',nextCat:null});
 assert.deepEqual(Flow.advance(source.products,128),{stay:true,cat:'drinks',nextCat:null});
 assert.equal(Flow.endLabel('other'),'其他商品盘完了 · 去饮料');
 assert.equal(Flow.endLabel('drinks'),'饮料盘完了 · 看今日订单');
});

test('search counts and automatic supplier selection send soft-drink results to drinks only',()=>{
 const counts=Flow.searchHitCounts(source.products,p=>Search.matches(p,'可乐',[]));
 assert.deepEqual(counts,{kr:0,cn:0,other:0,drinks:2});
 assert.equal(Flow.searchCatChoice(counts,'other'),'drinks');
 assert.equal(Flow.searchCatChoice(counts,'drinks'),'drinks');
 assert.deepEqual(Flow.searchHitCounts(source.products,()=>true),{kr:45,cn:66,other:13,drinks:5});
 assert.equal(Flow.searchCatChoice({kr:0,cn:0,other:0,drinks:0},'drinks'),'drinks');
 assert.equal(Flow.searchCatChoice({kr:0,cn:0,other:2,drinks:2},'kr'),'other','ties preserve supplier order');
});

test('printed catalog contains four supplier blocks with original ordering, names and order units',()=>{
 const before=JSON.stringify(source),rows=Flow.sheetRows(source.products);
 assert.equal(rows.length,129);assert.deepEqual(rows.map(r=>r.n),Array.from({length:129},(_,i)=>i+1));
 assert.deepEqual(rows.map(r=>r.large),source.products.map(p=>p.name));
 assert.deepEqual(rows.map(r=>r.unit),source.products.map(p=>p.unit??''));
 assert.deepEqual(Object.fromEntries(Flow.CATS.map(([, , name])=>[name,rows.filter(r=>r.block===name).length])),{'韩国食品':45,'中国食品':66,'其他商品':13,'饮料':5});
 assert.equal(JSON.stringify(source),before);
});

test('new counts use the confirmed baby-cabbage and dumpling stock units without changing order units or inventing values',()=>{
 const d=Core.create(source,'2026-10-26','count-new-unit-defaults');
 for(const [id,stockUnit,orderUnit] of [['kr:31','개','박스'],['cn:21','包','箱']]){
  const p=source.products.find(p=>p.id===id),row=d.items[id];
  assert.equal(row.stockUnit,stockUnit);assert.equal(row.unit,orderUnit);
  assert.equal(row.stock,'');assert.equal(row.quantity,'');
  assert.equal(d.catalog.find(p=>p.id===id).unit,orderUnit);
  assert.equal(d.catalog.find(p=>p.id===id).name,p.name);
 }
 assert.equal(Core.validate(d,source),true);
});

test('old saved stock units and counts are preserved when viewing, merging and recovering existing snapshots',()=>{
 const d=Core.create(source,'2026-10-25','count-old-unit-snapshot');
 d.items['kr:31'].stockUnit='박스';d.items['kr:31'].stock='2';d.items['kr:31'].stockStatus='counted';
 d.items['cn:21'].stockUnit='箱';d.items['cn:21'].stock='3';d.items['cn:21'].stockStatus='counted';
 d.items['cn:45'].unit='봉';d.items['other:11'].unit='세트';
 const before=JSON.stringify(d);
 assert.equal(Core.validate(d,source),true);
 Flow.sheetRows(d.catalog);Flow.searchHitCounts(d.catalog,()=>true);
 const merged=Shared.merge(d,structuredClone(d),structuredClone(d));
 assert.equal(merged.items['kr:31'].stockUnit,'박스');assert.equal(merged.items['cn:21'].stockUnit,'箱');
 const order={id:d.id,revision:1,orderStage:'finalized',snapshot:JSON.stringify(d),quantities:Object.fromEntries(d.catalog.map(p=>[p.id,0])),units:Object.fromEntries(d.catalog.map(p=>[p.id,d.items[p.id].unit]))};
 const recovered=Recovery.fromOrder(order,source).draft;
 assert.equal(recovered.items['kr:31'].stock,'2');assert.equal(recovered.items['kr:31'].stockUnit,'박스');
 assert.equal(recovered.items['cn:21'].stock,'3');assert.equal(recovered.items['cn:21'].stockUnit,'箱');
 assert.equal(JSON.stringify(d),before,'supplier presentation must not migrate history');
});

test('five drink quantities still submit under original stable IDs and survive cloud payload round trips',()=>{
 const d=Core.create(source,'2026-10-26','count-drinks-payload');
 d.items['cn:45'].unit='봉';d.items['other:11'].unit='세트';
 for(const p of d.catalog)Core.finish(d,p.id,true);
 drinkIds.forEach((id,i)=>{Core.edit(d,id,'quantity',String(i+1));Core.finish(d,id);});
 d.status='reviewed';
 const payload=JSON.parse(JSON.stringify(Cloud.submission(d,Core,source)));
 assert.equal(Object.keys(payload.quantities).length,129);
 assert.deepEqual(drinkIds.map(id=>payload.quantities[id]),[1000,2000,3000,4000,5000]);
 assert.ok(drinkIds.every(id=>payload.units[id]==='박스'));
 const snapshot=JSON.parse(payload.snapshot);
 assert.equal(Core.validate(snapshot,source),true);
 assert.deepEqual(snapshot.catalog,Core.create(source,'2026-10-26','count-other-template').catalog);
 assert.equal(Flow.visibleCountIndexes(snapshot.catalog,'other',()=>true,-1).some(i=>payload.quantities[snapshot.catalog[i].id]>0),false);
 assert.deepEqual(Flow.visibleCountIndexes(snapshot.catalog,'drinks',()=>true,-1).map(i=>snapshot.catalog[i].id),drinkIds);
});
