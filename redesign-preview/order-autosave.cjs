'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const entries=o=>Object.entries(o||{}).sort(([a],[b])=>a.localeCompare(b));
const values=o=>JSON.stringify([o.quantities,o.units,o.stockEdits,o.stockUnits].map(entries));
const inventoryValues=o=>JSON.stringify([o.stockEdits,o.stockUnits].map(entries));
function record(base,working,editor){return {schema:'ccx-order-edit-1',base:copy(base),working:copy(working),editor:editor?copy(editor):null};}
function validate(r,remote,core){
 if(r?.schema!=='ccx-order-edit-1'||r.base?.id!==remote.id||r.working?.id!==remote.id||r.base.revision!==r.working.revision||r.base.snapshot!==r.working.snapshot||!Number.isSafeInteger(r.base.revision))throw Error('本机待保存记录格式不正确，已保留，请下载备份核对');
 core.checkQuantities(r.working.quantities,r.working.units,Object.keys(remote.quantities));
 core.units.checkChange(r.base.units,r.working.units);core.inventorySnapshot(r.working);
 if(r.editor&&(!Object.hasOwn(remote.quantities,r.editor.id)||!['stock','qty'].includes(r.editor.field)||typeof r.editor.raw!=='string'||r.editor.raw.length>40))throw Error('本机输入记录格式不正确');
 return r;
}
function choice(r,remote){
 if(values(r.working)===values(remote)&&!r.editor)return 'saved';
 if(remote.orderStage==='finalized'||r.base.revision!==remote.revision||r.base.snapshot!==remote.snapshot)return 'conflict';
 return 'restore';
}
module.exports={values,inventoryValues,record,validate,choice};
