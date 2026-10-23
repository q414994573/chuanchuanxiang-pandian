const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Core=require('../count-core.js'),Shared=require('../redesign-preview/shared-draft.cjs'),C=require('../cloud/core.cjs');
const source=JSON.parse(fs.readFileSync(require.resolve('../current-order.json'),'utf8'));
function fixture(){
 const draft=Core.create(source,'2026-10-23','count-save-result');draft.seen={};
 const raw={schema:'ccx-shared-1',localId:draft.id,orderId:draft.id,stage:'draft',date:draft.date,revision:1,body:JSON.stringify(draft)};
 let reads=0,writes=0,fail=false;
 const snap={exists:()=>true,data:()=>raw};
 const ctx=vm.createContext({Core,source,Shared,C,crypto:{randomUUID:()=> 'test-save'},doc:()=>({}),collection:()=>({}),serverTimestamp:()=>({sentinel:true}),
  getDocFromServer:async()=>{reads++;return snap;}});
 // Execute the production store with a stale immediate read and an acknowledged transaction.
 ctx.runTransaction=async(db,action)=>{const result=await action({get:async()=>snap,update(){writes++;}});if(fail)throw Error('write rejected');return result;};
 vm.runInContext(fs.readFileSync(require.resolve('../cloud/shared-count.js'),'utf8').replace(/^import .*;\n/gm,'').replace('export function sharedCountStore','function sharedCountStore'),ctx);
 const api=vm.runInContext(`sharedCountStore({},'a','大伟',Core,source)`,ctx);
 return {api,base:{...raw,draft},reads:()=>reads,writes:()=>writes,reject:()=>{fail=true;}};
}
test('shared save returns its committed revision and input even if an immediate read would be stale',async()=>{
 const f=fixture(),local=structuredClone(f.base.draft);Core.edit(local,'kr:7','quantity','1');local.seen['kr:7']=true;
 const saved=await f.api.save(f.base,local);
 assert.equal(saved.revision,2);assert.equal(saved.draft.items['kr:7'].quantity,'1');assert.equal(saved.draft.seen['kr:7'],true);
 assert.equal(JSON.parse(saved.body).items['kr:7'].quantity,'1');assert.equal(f.reads(),0);assert.equal(f.writes(),1);
});
test('shared no-op returns the transaction version, and failed commits cannot report success',async()=>{
 const f=fixture();assert.equal((await f.api.save(f.base,f.base.draft)).revision,1);assert.equal(f.writes(),0);
 const local=structuredClone(f.base.draft);Core.edit(local,'kr:7','quantity','1');f.reject();await assert.rejects(f.api.save(f.base,local),/write rejected/);
});
