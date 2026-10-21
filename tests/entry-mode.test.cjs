const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../redesign-preview/entry-mode.cjs'),C=require('../cloud/core.cjs'),Core=require('../count-core.js'),R=require('../redesign-preview/recovery.cjs'),source=require('../current-order.json');
test('production and preview isolate IDs and both local and cloud draft locations',()=>{
 const live=E.settings(true),preview=E.settings(false);
 assert.notEqual(live.key,preview.key);assert.notEqual(live.draftCollection,preview.draftCollection);
 assert.equal(C.cloudOrderId('count-one',live.test),'count-one');assert.equal(C.cloudOrderId('count-one',preview.test),'test-count-one');
 const records=[{id:'count-one'},{id:'test-count-two'},{id:'bad-id'}];
 assert.deepEqual(E.orders(records,live.test),[records[0]]);assert.deepEqual(E.orders(records,preview.test),[records[1]]);
 assert.throws(()=>C.assertCloudOrderId(records[1].id,live.test));assert.throws(()=>C.assertCloudOrderId(records[0].id,preview.test));
});
test('legacy discovery reads only original production records without changing them',()=>{
 const d=Core.create(source,'2026-10-21','count-old');d.items['cn:9'].quantity='2';d.items['cn:9'].decision='order';
 const entries=[['ccx-count-session:count-old',JSON.stringify(d)],['ccx-count-session:count-old:previous',JSON.stringify(d)],['ccx-cloud-test-session:count-test',JSON.stringify(d)],['ccx-count-session:broken','{']];
 const store={length:entries.length,key:i=>entries[i][0],getItem:k=>entries.find(e=>e[0]===k)?.[1],setItem(){throw Error('must not write');}};
 const records=E.legacyDrafts(store,source);assert.equal(records.length,1);assert.equal(records[0].draft.id,'count-old');
 const recovered=R.restore(records[0].raw,source,'count-new');assert.equal(recovered.id,'count-new');assert.equal(recovered.items['cn:9'].quantity,'2');assert.equal(JSON.parse(store.getItem(entries[0][0])).id,'count-old');
});
test('prepared production entry remains disabled, uses shared code, and does not replace old entry',()=>{
 const read=p=>fs.readFileSync(p,'utf8');
 assert.equal(JSON.parse(read('ordering/firebase-config.json')).enabled,false);
 assert.match(read('ordering/index.html'),/data-order-mode="production"/);
 assert.match(read('ordering/index.html'),/\.\.\/redesign-preview\/preview.bundle.js/);
 assert.doesNotMatch(read('redesign-preview/index.html'),/data-order-mode="production"/);
 assert.match(read('index.html'),/cloud-app.bundle.js/);
 assert.match(read('redesign-preview/preview.js'),/if\(PRODUCTION&&!cfg.enabled\)/);
});
