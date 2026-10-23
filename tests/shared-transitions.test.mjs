import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {readFileSync} from 'node:fs';
import {doc,setDoc} from 'firebase/firestore';
import assert from 'node:assert/strict';
import {sharedCountStore} from '../cloud/shared-count.js';
import Core from '../count-core.js';
const source=JSON.parse(readFileSync('current-order.json'));
const env=await initializeTestEnvironment({projectId:'demo-ccx-transitions',firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});
try{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'members','a'),{role:'owner',name:'大伟',active:true}));
 const api=sharedCountStore(env.authenticatedContext('a').firestore(),'a','大伟',Core,source);
 let watchError=null;const stop=api.watch(()=>{},e=>{watchError=e;});
 try{
  let head=await api.start(Core.create(source,'2026-10-23','count-transition-0'));
  assert.equal(head?.localId,'count-transition-0');
  for(let round=0;round<5;round++){
   const reviewed=structuredClone(head.draft);reviewed.seen={};
   for(const p of reviewed.catalog){reviewed.seen[p.id]=true;if(p.id==='cn:45')Core.edit(reviewed,p.id,'unit','봉');if(p.id==='other:11')Core.edit(reviewed,p.id,'unit','세트');Core.finish(reviewed,p.id,true);}
   head=await api.save(head,reviewed);
   reviewed.status='reviewed';reviewed.reviewedAt=new Date().toISOString();
   const final=await api.finalize(head,reviewed);
   assert.equal(final.stage,'finalized','finalize must acknowledge finalized state');assert.equal(final.revision,head.revision+1);
   const reopened=await api.reopen(final);
   assert.equal(reopened.stage,'draft','reopen must acknowledge editable state');assert.equal(reopened.revision,final.revision+1);
   const candidate=Core.create(source,'2026-10-23','count-transition-'+(round+1));
   head=await api.newBlank(candidate,reopened);
   assert.equal(head.localId,candidate.id,'newBlank must acknowledge new draft');assert.equal(head.revision,reopened.revision+1);
   assert.equal((await api.archive(reopened.orderId)).localId,reopened.localId);
  }
  assert.equal(watchError,null);console.log('PASS 5 live-watch finalize/reopen/new-blank cycles with immediate result assertions and archives');
 }finally{stop();}
}finally{await env.cleanup();}
