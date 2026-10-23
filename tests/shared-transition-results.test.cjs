const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Core=require('../count-core.js'),Shared=require('../redesign-preview/shared-draft.cjs'),C=require('../cloud/core.cjs');
const source=JSON.parse(fs.readFileSync(require.resolve('../current-order.json'),'utf8'));
function fixture(stage='draft'){
 const draft=Core.create(source,'2026-10-23','count-transition-result');draft.seen={};
 for(const p of draft.catalog){draft.seen[p.id]=true;if(p.id==='cn:45')Core.edit(draft,p.id,'unit','봉');if(p.id==='other:11')Core.edit(draft,p.id,'unit','세트');Core.finish(draft,p.id,true);}
 if(stage==='finalized'){draft.status='reviewed';draft.reviewedAt=new Date().toISOString();}
 const raw={schema:'ccx-shared-1',localId:draft.id,orderId:C.cloudOrderId(draft.id,false),stage,date:draft.date,revision:3,body:JSON.stringify(draft)};
 let fail=false,reads=0,writes=0,absent=false;
 const snap=data=>({exists:()=>!!data,data:()=>data});
 const ctx=vm.createContext({Core,source,Shared,C,crypto:{randomUUID:()=> 'transition-test'},doc:(...args)=>args.filter(a=>typeof a==='string').join('/'),collection:(...args)=>args.join('/'),serverTimestamp:()=>({sentinel:true}),
  getDocFromServer:async()=>{reads++;return snap(raw);},
  runTransaction:async(db,action)=>{const value=await action({get:async ref=>snap(ref==='sharedCounts/current'?(absent?null:raw):ref==='orders/'+raw.orderId?{revision:1}:null),set(){writes++;},update(){writes++;}});if(fail)throw Error('commit rejected');return value;}});
 vm.runInContext(fs.readFileSync(require.resolve('../cloud/shared-count.js'),'utf8').replace(/^import .*;\n/gm,'').replace('export function sharedCountStore','function sharedCountStore'),ctx);
 return {api:vm.runInContext(`sharedCountStore({},'a','大伟',Core,source)`,ctx),base:{...raw,draft},reads:()=>reads,writes:()=>writes,reject:()=>{fail=true;},empty:()=>{absent=true;}};
}
for(const operation of ['start','newBlank','finalize','reopen'])test(operation+' returns committed state without stale read; failed commit rejects',async()=>{
 for(const reject of [false,true]){
  const f=fixture(operation==='reopen'?'finalized':'draft');
  const candidate=Core.create(source,'2026-10-23','count-next-transition');
  const reviewed=structuredClone(f.base.draft);reviewed.status='reviewed';reviewed.reviewedAt=new Date().toISOString();
  if(operation==='start')f.empty();if(reject)f.reject();
  const pending=operation==='start'?f.api.start(candidate):operation==='newBlank'?f.api.newBlank(candidate,f.base):operation==='finalize'?f.api.finalize(f.base,reviewed):f.api.reopen(f.base);
  if(reject)await assert.rejects(pending,/commit rejected/);
  else{const result=await pending;assert.equal(result.revision,operation==='start'?1:4);assert.equal(result.stage,operation==='finalize'?'finalized':'draft');assert.equal(result.localId,['start','newBlank'].includes(operation)?candidate.id:f.base.localId);assert.equal(JSON.stringify(result.draft),result.body);assert.equal(result.updatedAt,null);}
  assert.equal(f.reads(),0);assert.ok(f.writes()>0);
 }
});
test('start joins the transaction current draft without creating or reading a second version',async()=>{
 const f=fixture(),result=await f.api.start(Core.create(source,'2026-10-23','count-unused'));
 assert.equal(result.localId,f.base.localId);assert.equal(result.revision,3);assert.equal(f.writes(),0);assert.equal(f.reads(),0);
});
