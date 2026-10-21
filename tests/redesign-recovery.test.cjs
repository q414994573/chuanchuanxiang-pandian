const {test}=require('node:test'),assert=require('node:assert/strict');
const Core=require('../count-core.js'),R=require('../redesign-preview/recovery.cjs');
const source=require('../current-order.json');
test('restore preserves blank, zero, text stock and quantities under a new independent id',()=>{
 const d=Core.create(source,'2026-10-21','count-original');d.stockText={'kr:3':'半箱'};d.items['kr:4'].stock='0';d.items['kr:4'].stockStatus='counted';d.items['cn:9'].quantity='3.5';d.items['cn:9'].decision='order';
 const before=JSON.stringify(d),r=R.restore(JSON.stringify({draft:d}),source,'count-recovered');
 assert.equal(r.id,'count-recovered');assert.equal(r.items['kr:3'].stock,'');assert.equal(r.stockText['kr:3'],'半箱');assert.equal(r.items['kr:4'].stock,'0');assert.equal(r.items['cn:9'].quantity,'3.5');assert.equal(r.status,'draft');assert.deepEqual(r.seen,{});assert.equal(JSON.stringify(d),before);
});
test('cloud backup uses latest order quantities, not original submission quantities',()=>{
 const d=Core.create(source,'2026-10-21','count-original'),q=Object.fromEntries(d.catalog.map(p=>[p.id,0])),units=Object.fromEntries(d.catalog.map(p=>[p.id,p.unit]));q['cn:9']=3500;
 const backup=R.fromOrder({id:'test-count-original',snapshot:JSON.stringify(d),quantities:q,units,revision:7,orderStage:'finalized'},source);
 assert.equal(backup.draft.items['cn:9'].quantity,'3.5');assert.equal(backup.origin.revision,7);assert.equal(backup.draft.items['kr:3'].quantity,'');
 const restored=R.restore(JSON.stringify(backup),source,'count-new');assert.equal(restored.id,'count-new');assert.equal(restored.items['cn:9'].quantity,'3.5');
});
test('restore rejects damaged files, changed catalog and invented units',()=>{
 assert.throws(()=>R.restore('{',source,'count-new'));
 const d=Core.create(source,'2026-10-21','count-original');d.catalog[0].name='假的';assert.throws(()=>R.restore(JSON.stringify(d),source,'count-new'),/目录/);
 const other=Core.create(source,'2026-10-21','count-original');other.items['cn:45'].unit='袋';assert.throws(()=>R.restore(JSON.stringify(other),source,'count-new'),/单位/);
});

test('backup restores selected template units while keeping stock unit independent',()=>{
 const d=Core.create(source,'2026-10-21','count-original');d.items['cn:45'].unit='박스';d.items['cn:45'].stockUnit='봉';d.items['other:11'].unit='몸통만';
 const r=R.restore(JSON.stringify(d),source,'count-new');assert.equal(r.items['cn:45'].unit,'박스');assert.equal(r.items['cn:45'].stockUnit,'봉');assert.equal(r.items['other:11'].unit,'몸통만');
});
