const {test}=require('node:test'),assert=require('node:assert/strict');
const Core=require('../count-core.js'),Shared=require('../redesign-preview/shared-draft.cjs'),source=require('../current-order.json');
const clone=structuredClone,make=()=>Core.create(source,'2026-10-23','count-matrix');
const fields=[
 ['stock','0','2',(d,v)=>Core.edit(d,'kr:43','stock',v),d=>d.items['kr:43'].stock],
 ['quantity','1','3',(d,v)=>Core.edit(d,'kr:43','quantity',v),d=>d.items['kr:43'].quantity],
 ['order unit','봉','박스',(d,v)=>Core.edit(d,'cn:45','unit',v),d=>d.items['cn:45'].unit],
 ['stock unit','봉','박스',(d,v)=>Core.edit(d,'cn:45','stockUnit',v),d=>d.items['cn:45'].stockUnit],
 ['date','2026-10-25','2026-10-26',(d,v)=>{d.date=v;},d=>d.date],
 ...['seen','deferred','ackWrong'].map(key=>[key,true,false,(d,v)=>{d[key]={...d[key],'kr:43':v};},d=>d[key]?.['kr:43']]),
 ['stock note','半包','再看冰箱',(d,v)=>{d.stockText={'kr:43':v};},d=>d.stockText?.['kr:43']]
];
for(const [name,a,b,set,get] of fields)for(const mode of ['local-only','remote-only','same-value','independent-product','conflict'])test(`shared merge ${name}: ${mode}`,()=>{
 const base=make(),local=clone(base),remote=clone(base);
 if(mode!=='remote-only')set(local,a);
 if(mode==='remote-only'||mode==='same-value')set(remote,a);
 if(mode==='conflict')set(remote,b);
 if(mode==='independent-product')Core.edit(remote,'kr:8','quantity','7');
 const before=JSON.stringify([base,local,remote]);
 if(mode==='conflict')assert.throws(()=>Shared.merge(base,local,remote),e=>e.code==='shared/conflict'&&e.fields.length>0);
 else{
  const result=Shared.merge(base,local,remote);assert.equal(get(result),a);
  assert.ok(Core.validate(result,source));
  if(mode==='independent-product')assert.equal(result.items['kr:8'].quantity,'7');
  const reverse=Shared.merge(base,remote,local);assert.equal(get(reverse),a);
  assert.deepEqual(result.items,reverse.items);
  result.items['kr:8'].quantity='999';
 }
 assert.equal(JSON.stringify([base,local,remote]),before,'merge must not mutate any input');
});
