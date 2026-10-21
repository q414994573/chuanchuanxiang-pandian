'use strict';
const Core=require('../count-core.js');
const Cloud=require('../cloud/core.cjs');
function validate(d,source){
 if(!Core.validate(d,source))throw Error('备份内容或129种商品目录不匹配');
 for(let i=0;i<d.catalog.length;i++)if(d.catalog[i].unit!==(source.products[i].unit||'')||(Cloud.units.choices[d.catalog[i].id]?!Cloud.units.valid(d.catalog[i].id,d.items[d.catalog[i].id].unit):d.items[d.catalog[i].id].unit!==(source.products[i].unit||'')))throw Error('备份单位与永久目录不同，请先核对');
 for(const [id,value] of Object.entries(d.stockText||{}))if(!d.items[id]||typeof value!=='string'||value.length>40)throw Error('文字库存备份格式错误');
 return d;
}
function fromOrder(order,source){
 const d=Core.clone(JSON.parse(order.snapshot));
 Cloud.checkQuantities(order.quantities,order.units,d.catalog.map(p=>p.id));
 for(const p of d.catalog){const r=d.items[p.id];r.quantity=Cloud.textQuantity(order.quantities[p.id]);r.decision=order.quantities[p.id]>0?'order':'skip';r.unit=order.units[p.id];r.processed=true;}
 d.status='draft';d.sent={};validate(d,source);
 return {draft:d,origin:{id:order.id,revision:order.revision,stage:order.orderStage||'pending'}};
}
function restore(raw,source,id){
 if(typeof raw!=='string'||raw.length>2000000)throw Error('备份文件过大或格式错误');
 const parsed=JSON.parse(raw),original=parsed.draft||parsed;
 validate(original,source);
 const d=Core.clone(original);d.id=id;d.seq=0;d.status='draft';d.reviewedAt=null;d.sent={};d.savedAt=null;
 d.seen={};d.ackWrong={}; // Re-check the restored order before submitting a new independent order.
 d.log=d.log.slice(-9998);d.log.push({at:new Date().toISOString(),text:'从备份恢复为独立盘货，原云端订单保持不变'});
 validate(d,source);return d;
}
module.exports={fromOrder,restore};
