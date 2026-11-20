const {test}=require('node:test');
const assert=require('node:assert/strict');

test('offline order reads and writes describe the attempted operation',async t=>{
 const {store}=await import('../cloud/store.js');
 t.mock.getter(globalThis,'navigator',()=>({onLine:false}));
 const api=store(null,'fixture','sandboxOrders','测试');
 for(const read of [()=>api.read('example'),()=>api.list(),()=>api.history('example'),()=>api.listPage(),()=>api.onDate('2026-11-20')]){
  await assert.rejects(read(),/无法读取云端订单/);
 }
 for(const write of [()=>api.create('example',{}),()=>api.save('example',{},{}),()=>api.finalize('example',{},'change')]){
  await assert.rejects(write(),/未保存到云端/);
 }
});
