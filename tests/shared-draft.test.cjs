const {test}=require('node:test'),assert=require('node:assert/strict');
const Shared=require('../redesign-preview/shared-draft.cjs'),Core=require('../count-core.js'),source=require('../current-order.json');
const make=()=>Core.create(source,'2026-10-22','count-merge-check');
test('shared merge combines stock and order quantity on the same product, including zero',()=>{
 const base=make(),a=structuredClone(base),b=structuredClone(base);
 Core.edit(a,'kr:43','stock','0');Core.edit(b,'kr:43','quantity','2');
 const m=Shared.merge(base,a,b);assert.equal(m.items['kr:43'].stock,'0');assert.equal(m.items['kr:43'].quantity,'2');assert.ok(Core.validate(m,source));
});
test('same shared edit is idempotent and blank differs from explicit zero',()=>{
 const base=make(),a=structuredClone(base),b=structuredClone(base);
 Core.edit(a,'kr:43','stock','0');Core.edit(b,'kr:43','stock','0');
 assert.equal(Shared.merge(base,a,b).items['kr:43'].stock,'0');
 const next=structuredClone(a),remote=structuredClone(a);Core.edit(next,'kr:43','stock','');Core.edit(remote,'kr:43','stock','5');
 assert.throws(()=>Shared.merge(a,next,remote),e=>e.code==='shared/conflict');
});
test('shared merge rejects competing units, date changes, and catalog or draft replacement',()=>{
 const base=make(),a=structuredClone(base),b=structuredClone(base);
 Core.edit(a,'cn:45','unit','봉');Core.edit(b,'cn:45','unit','박스');assert.throws(()=>Shared.merge(base,a,b),/同一格/);
 a.date='2026-10-23';b.date='2026-10-24';assert.throws(()=>Shared.merge(base,a,b),/同一格/);
 b.catalog.pop();assert.throws(()=>Shared.merge(base,base,b),/目录/);b.id='count-new';assert.throws(()=>Shared.merge(base,base,b),/更换/);
});
