const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Core=require('../count-core.js'),C=require('../cloud/core.cjs'),source=require('../current-order.json');
const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const body=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${body};return harness;`)(require,Core,source);
// Each catalog entry must independently survive review, payload serialization,
// opening the confirmed order and one-tap copy without any extra server read.
for(const [index,p] of source.products.entries())test(`supplier delivery preserves ${p.id} ${p.name} and excludes all other goods`,async()=>{
 const d=Core.create(source,'2026-10-25','count-supplier-'+index);
 for(const row of d.catalog){if(row.id==='cn:45')Core.edit(d,row.id,'unit','봉');if(row.id==='other:11')Core.edit(d,row.id,'unit','세트');Core.finish(d,row.id,true);}
 const quantity=(index+1)+'.125',unit=p.id==='cn:45'?'봉':p.id==='other:11'?'세트':p.unit;
 Core.edit(d,p.id,'quantity',quantity);
 if(p.hasStock)Core.edit(d,p.id,'stock','0');
 Core.finish(d,p.id);d.status='reviewed';d.reviewedAt=new Date().toISOString();
 const payload=JSON.parse(JSON.stringify(C.submission(d,Core,source)));
 assert.equal(Object.keys(payload.quantities).length,129);assert.equal(payload.quantities[p.id],(index+1)*1000+125);assert.equal(payload.units[p.id],unit);
 assert.equal(Object.values(payload.quantities).filter(n=>n>0).length,1);
 const h=harness(true);h.ctx.record={...payload,id:d.id,revision:1,orderStage:'finalized'};
 const delivered=[];h.ctx.navigator={clipboard:{writeText:async text=>delivered.push(text)}};
 h.run(`peerEnabled=true;member={role:'${index%2?'editor':'owner'}'};sample=false;acceptOrder(record);api={read:async()=>{throw Error('per-tap read is forbidden')}};query='完全无匹配';yellowOnly=true;`);
 const expected='10/25 천천향 주문\n'+p.name+' '+quantity+unit;
 assert.equal(h.run(`blockText('${p.cat}')`),expected,'search must not truncate supplier order');
 for(const cat of ['kr','cn','other'].filter(c=>c!==p.cat))assert.equal(h.run(`blockText('${cat}')`),'10/25 천천향 주문\n这次不订');
 await h.run(`supplierExport('${p.cat}')`);assert.deepEqual(delivered,[expected],'the first tap must copy the latest confirmed text');
 assert.equal(h.run('order.orderStage'),'finalized');assert.equal(JSON.parse(payload.snapshot).items[p.id].quantity,quantity);
});
