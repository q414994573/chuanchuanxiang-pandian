const {test}=require('node:test'),assert=require('node:assert/strict');
const Flow=require('../redesign-preview/count-flow.cjs');
const Core=require('../count-core.js');
const products=require('../current-order.json').products;

test('other products have an order cell and no stock cell',()=>{
 assert.deepEqual(Flow.countFields({hasStock:true}),['stock','qty']);
 assert.deepEqual(Flow.countFields({hasStock:false}),['qty']);
 assert.equal(products.filter(p=>p.cat==='other'&&p.hasStock).length,0);
 assert.equal(products.filter(p=>p.cat==='other').length,18);
});

test('zebra stripe follows the rows on screen and starts over at each block',()=>{
 assert.deepEqual([0,1,2,3].map(Flow.stripe),['','band','','band']);
 const visible=[0,2,5];
 assert.deepEqual(visible.map((_,i)=>Flow.stripe(i)),['','band','']);
});

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

test('count search jumps to another block only when this block has no hit',()=>{
 const S=require('../redesign-preview/search.cjs');
 const aliases=require('../redesign-preview/aliases.json');
 const byId=new Map(aliases.items.map(item=>[item.id,item.aliases]));
 const catalog=products.map(p=>({id:p.id,cat:p.cat,name:p.name,alias:p.alias||''}));
 const countsFor=q=>Flow.searchHitCounts(catalog,p=>S.matches(p,q,byId.get(p.id)||[]));
 const chicken=countsFor('鸡精');
 assert.equal(chicken.kr,0);
 assert.equal(chicken.cn,1);
 assert.equal(chicken.other,0);
 assert.equal(Flow.searchCatChoice(chicken,'kr'),'cn');
 assert.equal(catalog.find(p=>p.id==='cn:9').name,'鸡精');
 const both=countsFor('豆腐');
 assert.equal(both.kr,2);
 assert.equal(both.cn,3);
 assert.equal(Flow.searchCatChoice(both,'kr'),'kr');
 const tie={kr:0,cn:2,other:2};
 assert.equal(Flow.searchCatChoice(tie,'kr'),'cn');
 assert.equal(Flow.searchCatChoice({kr:0,cn:1,other:4},'kr'),'other');
 assert.equal(Flow.searchCatChoice({kr:3,cn:3,other:0},'other'),'kr');
 assert.equal(Flow.searchCatChoice({kr:0,cn:0,other:0},'cn'),'cn');
});

test('a filtered count row is edited by product id, not by its row number on screen',()=>{
 const catalog=products.map(p=>({id:p.id,cat:p.cat,name:p.name,alias:p.alias||''}));
 const matches=p=>String(p.name).includes('鸡精')||String(p.alias).includes('鸡精');
 const visible=Flow.visibleCountIndexes(catalog,'cn',matches,-1);
 assert.equal(catalog[visible[0]].id,'cn:9');
 assert.equal(catalog[visible[0]].name,'鸡精');
 assert.notEqual(visible[0],0);
 assert.equal(Flow.indexById(catalog,'cn:9'),visible[0]);
 assert.equal(Flow.indexById(catalog,'missing'),-1);
 const kept=Flow.visibleCountIndexes(catalog,'cn',()=>false,visible[0]);
 assert.deepEqual(kept,[visible[0]]);
 const draft=Core.create({date:'2026-10-18',products},'2026-10-20','count-search-id');
 Core.edit(draft,'cn:9','stock','12');
 assert.equal(draft.items['cn:9'].stock,'12');
 assert.equal(draft.items[catalog[0].id].stock,'');
 assert.equal(draft.items[catalog[visible[0]].id].stock,'12');
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
