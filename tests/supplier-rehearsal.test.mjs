import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc} from 'firebase/firestore';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {sharedCountStore} from '../cloud/shared-count.js';
import {store} from '../cloud/store.js';
import Core from '../count-core.js';
import Flow from '../redesign-preview/count-flow.cjs';
const require=createRequire(import.meta.url),source=JSON.parse(readFileSync('current-order.json'));
const existing=readFileSync('tests/redesign-interactions.test.cjs','utf8');
const body=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${body};return harness;`)(require,Core,source);
const env=await initializeTestEnvironment({projectId:'demo-ccx-supplier-rehearsal',firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});
const reviewed=d=>{const r=structuredClone(d);r.status='reviewed';r.reviewedAt=new Date().toISOString();return r;};
try{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{for(const [uid,role] of [['a','owner'],['b','editor']])await setDoc(doc(c.firestore(),'members',uid),{role,name:uid,active:true});});
 const dbA=env.authenticatedContext('a').firestore(),dbB=env.authenticatedContext('b').firestore();
 const a=sharedCountStore(dbA,'a','a',Core,source),b=sharedCountStore(dbB,'b','b',Core,source),orders=store(dbB,'b','orders','b');
 const initial=Core.create(source,'2026-10-25','count-sunday-rehearsal');initial.seen={};
 for(const p of initial.catalog){if(p.id==='cn:45')Core.edit(initial,p.id,'unit','봉');if(p.id==='other:11')Core.edit(initial,p.id,'unit','세트');Core.finish(initial,p.id,true);initial.seen[p.id]=true;}
 let head=await a.start(initial);const left=structuredClone(head.draft),right=structuredClone(head.draft),expected=new Map();
 for(const [i,p] of source.products.entries()){
  const d=i%2?right:left,q=(i+1)+'.125';Core.edit(d,p.id,'quantity',q);if(p.hasStock)Core.edit(d,p.id,'stock',i%3?'2.5':'0');Core.finish(d,p.id);expected.set(p.id,{qty:q,unit:p.id==='cn:45'?'봉':p.id==='other:11'?'세트':p.unit});
 }
 await Promise.all([a.save(head,left),b.save(head,right)]);head=await a.read();
 for(const [id,v] of expected)assert.equal(head.draft.items[id].quantity,v.qty,'concurrent input '+id);
 head=await b.finalize(head,reviewed(head.draft));
 const h=harness(true),copied=[];h.ctx.navigator={clipboard:{writeText:async text=>copied.push(text)}};h.ctx.orderApi=orders;
 async function checkExport(){
  h.ctx.loaded=await orders.read(head.orderId);h.run(`peerEnabled=true;member={role:'editor'};sample=false;acceptOrder(loaded);api=orderApi;query='不匹配任何商品';yellowOnly=true;`);
  assert.equal(Object.keys(h.ctx.loaded.quantities).length,138);
  for(const [cat] of Flow.CATS){
   const lines=source.products.filter(p=>Flow.catOf(p)===cat&&expected.has(p.id)).map(p=>{const v=expected.get(p.id);return p.name+' '+v.qty+v.unit;});
   await h.run(`supplierExport('${cat}')`);
   assert.equal(copied.at(-1),'10/25 천천향 주문\n'+(lines.length?lines.join('\n'):'这次不订'));
  }
 }
 await checkExport();
 for(const [id,unit] of [['kr:31','개'],['cn:21','包']])assert.equal(JSON.parse(h.ctx.loaded.snapshot).items[id].stockUnit,unit);
 console.log('PASS both accounts jointly fill all 138; server-confirmed order copies four separate supplier texts on first tap, including five drinks; new stock units survive persistence');
 // A preview must not survive once the new cloud state is loaded after a reopen.
 h.run(`supplierPreview('kr')`);const copiesBefore=copied.length;head=await a.reopen(head);
 h.ctx.reopened=await orders.read(head.orderId);h.run('acceptOrder(reopened)');
 await assert.rejects(h.run('deliverPrepared(false)'),/切换/);assert.equal(copied.length,copiesBefore);
 const changed=structuredClone(head.draft);
 for(const [i,p] of source.products.entries()){
  if(i%3===0){Core.finish(changed,p.id,true);expected.delete(p.id);}
  else{const q=i%2?'0.001':'12.5';Core.edit(changed,p.id,'quantity',q);if(p.id==='cn:45')Core.edit(changed,p.id,'unit','박스');if(p.id==='other:11')Core.edit(changed,p.id,'unit','몸통만');Core.finish(changed,p.id);expected.set(p.id,{qty:q,unit:p.id==='cn:45'?'박스':p.id==='other:11'?'몸통만':p.unit});}
 }
 head=await a.save(head,changed);head=await a.finalize(head,reviewed(head.draft));await checkExport();
 for(const p of source.products)assert.equal(h.ctx.loaded.quantities[p.id],expected.has(p.id)?Math.round(Number(expected.get(p.id).qty)*1000):0);
 const oldId=head.orderId;head=await b.newBlank(Core.create(source,'2026-10-26','count-next-rehearsal'),head);
 assert.ok(Object.values(head.draft.items).every(r=>r.quantity===''));assert.equal((await orders.read(oldId)).orderStage,'finalized');
 console.log('PASS refreshed remote reopen invalidates preview; cancellations, smallest decimals and alternate units survive re-finalize/export; new blank preserves finalized history');
}finally{await env.cleanup();}
