'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function failure(message,fields=[]){const e=Error(message);e.code='shared/conflict';e.fields=fields;return e;}
// Merge logical cells, not whole rows: stock and quantity on one product are independent.
function merge(base,local,remote){
 if(!base||!local||!remote||base.id!==local.id||base.id!==remote.id)throw failure('当前盘货已更换，本机内容已保留，请核对当前盘货');
 if(!eq(base.catalog,local.catalog)||!eq(base.catalog,remote.catalog))throw failure('商品目录已改变，已停止自动合并');
 const next=copy(remote),conflicts=[];
 const choose=(path,a,b,c)=>{if(eq(b,a))return copyValue(c);if(eq(c,a)||eq(b,c))return copyValue(b);conflicts.push(path);return copyValue(c);};
 next.date=choose('日期',base.date,local.date,remote.date);
 for(const p of base.catalog){
  const id=p.id;
  for(const keys of [['stock','stockUnit','stockStatus'],['quantity','unit','decision'],['physical','acknowledged','processed']]){
   const pick=d=>keys.map(k=>d.items[id][k]??null);
   const values=choose(id+':'+keys[0],pick(base),pick(local),pick(remote));
   keys.forEach((k,i)=>{if(values[i]===null)delete next.items[id][k];else next.items[id][k]=values[i];});
  }
  for(const key of ['seen','stockText','ackWrong','deferred']){
   const value=choose(id+':'+key,base[key]?.[id],local[key]?.[id],remote[key]?.[id]);
   next[key]=next[key]||{};if(value===undefined)delete next[key][id];else next[key][id]=value;
  }
 }
 if(conflicts.length)throw failure('同一格被双方修改，自动保存已暂停；本机输入仍保留',conflicts);
 next.seq=Math.max(local.seq,remote.seq);next.contentVersion=Math.max(local.contentVersion,remote.contentVersion);
 next.log=[...new Map([...remote.log,...local.log].map(x=>[JSON.stringify(x),x])).values()].slice(-1000);
 next.savedAt=local.savedAt;return next;
}
function copyValue(x){return x===undefined?undefined:copy(x);}
function signature(d){if(!d)return '';return JSON.stringify([d.id,d.date,d.status,d.items,d.seen||{},d.stockText||{},d.ackWrong||{},d.deferred||{}]);}
module.exports={merge,signature,failure};
