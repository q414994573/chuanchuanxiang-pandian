const {test}=require('node:test'),assert=require('node:assert/strict');
const Flow=require('../redesign-preview/count-flow.cjs');
const Core=require('../count-core.js');
const products=require('../current-order.json').products;

test('next item stays inside the current supplier block',()=>{
 const catalog=products.map(p=>({id:p.id,cat:p.cat,name:p.name}));
 assert.equal(catalog.filter(p=>p.cat==='kr').length,45);
 assert.deepEqual(Flow.advance(catalog,0),{stay:false,index:1,cat:'kr',nextCat:null});
 assert.deepEqual(Flow.advance(catalog,44),{stay:true,cat:'kr',nextCat:'cn'});
 assert.deepEqual(Flow.advance(catalog,110),{stay:true,cat:'cn',nextCat:'other'});
 assert.deepEqual(Flow.advance(catalog,128),{stay:true,cat:'other',nextCat:null});
 assert.equal(Flow.endLabel('kr'),'韩国食品盘完了 · 去中国食品');
 assert.equal(Flow.endLabel('cn'),'中国食品盘完了 · 去其他商品');
 assert.equal(Flow.endLabel('other'),'其他商品盘完了 · 看今日订单');
});

test('text stock is kept aside and text orders are blocked before a cloud submit',()=>{
 const source={date:'2026-10-18',products};
 const draft=Core.create(source,'2026-10-20','count-flow-preview');
 Core.edit(draft,'kr:3','stock','半箱');
 Core.edit(draft,'kr:7','quantity','2箱多');
 Core.edit(draft,'cn:5','quantity','5');
 assert.deepEqual(Flow.textOrderIds(draft,Core.number),['kr:7']);
 assert.equal(Flow.showsOnOrder('2箱多'),true);
 assert.equal(Flow.showsOnOrder('半箱'),true);
 assert.equal(Flow.isNumericQty('半箱'),false);
 assert.equal(Flow.isNumericQty('5'),true);
 assert.equal(Flow.showsOnOrder(''),false);
 assert.equal(Flow.showsOnOrder('0'),false);
 Flow.parkTextStocks(draft,Core);
 assert.equal(draft.items['kr:3'].stock,'');
 assert.equal(draft.stockText['kr:3'],'半箱');
 assert.equal(Core.validate(draft,source),true);
 Core.edit(draft,'kr:7','quantity','');
 for(const p of draft.catalog){
  const row=draft.items[p.id];
  if(row.decision==='order') Core.finish(draft,p.id,false);
  else Core.finish(draft,p.id,true);
 }
 draft.status='reviewed';
 assert.equal(Core.validate(draft,source),true);
 assert.equal(draft.stockText['kr:3'],'半箱');
});
