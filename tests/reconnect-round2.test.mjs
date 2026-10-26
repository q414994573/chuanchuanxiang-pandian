import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {doc,setDoc,updateDoc,disableNetwork,enableNetwork,setLogLevel} from 'firebase/firestore';
import assert from 'node:assert/strict';
import {sharedCountStore} from '../cloud/shared-count.js';
import Core from '../count-core.js';
setLogLevel('silent');
const source=JSON.parse(readFileSync('current-order.json'));
const projectId='demo-ccx-reconnect-round2';
const env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});
const cases=[];
async function check(name,fn){await fn();cases.push({name,pass:true});console.log('PASS '+name);}
const clone=structuredClone;
try{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{for(const [uid,role,name]of [['a','owner','大伟'],['b','editor','老板娘']])await setDoc(doc(c.firestore(),'members',uid),{role,name,active:true});});
 const dbA=env.authenticatedContext('a').firestore(),dbB=env.authenticatedContext('b').firestore();
 const a=sharedCountStore(dbA,'a','大伟',Core,source),b=sharedCountStore(dbB,'b','老板娘',Core,source);
 let base=await a.start(Core.create(source,'2026-10-26','count-reconnect-round2')),local=clone(base.draft);
 await check('SDK network disabled: server read rejects instead of reporting cached data saved',async()=>{
  await disableNetwork(dbA);await assert.rejects(a.read(),e=>e.code==='unavailable');
 });
 await check('SDK stream suspended: local draft remains intact while the other member saves',async()=>{
  Core.edit(local,'cn:9','quantity','0.001');local.seen={'cn:9':true};const before=JSON.stringify(local);
  const remote=clone(base.draft);Core.edit(remote,'kr:43','stock','0');remote.seen={'kr:43':true};const saved=await b.save(base,remote);
  assert.equal(JSON.stringify(local),before);assert.equal(saved.revision,base.revision+1);await assert.rejects(a.read(),e=>e.code==='unavailable');
 });
 await check('SDK reconnect: merge independent offline quantity with remote stock and progress',async()=>{
  await enableNetwork(dbA);const merged=await a.save(base,local);assert.equal(merged.draft.items['cn:9'].quantity,'0.001');assert.equal(merged.draft.items['kr:43'].stock,'0');
  assert.equal(merged.draft.seen['cn:9'],true);assert.equal(merged.draft.seen['kr:43'],true);assert.deepEqual((await b.read()).draft,merged.draft);base=merged;
 });
 await check('SDK reconnect: divergent edits to one cell reject without overwriting either draft',async()=>{
  await disableNetwork(dbA);local=clone(base.draft);Core.edit(local,'cn:9','quantity','8');const signature=JSON.stringify(local);
  const remote=clone(base.draft);Core.edit(remote,'cn:9','quantity','9');const saved=await b.save(base,remote);
  await enableNetwork(dbA);await assert.rejects(a.save(base,local),e=>e.code==='shared/conflict');
  assert.equal(JSON.stringify(local),signature);assert.equal((await b.read()).revision,saved.revision);assert.equal((await b.read()).draft.items['cn:9'].quantity,'9');base=saved;
 });
 await check('membership revoked after opening: reads and writes denied while unsent local value survives',async()=>{
  local=clone(base.draft);Core.edit(local,'kr:7','quantity','17');const before=JSON.stringify(local);
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'members','a'),{active:false}));
  await assert.rejects(a.read(),e=>e.code==='permission-denied');await assert.rejects(a.save(base,local),e=>e.code==='permission-denied');
  assert.equal(JSON.stringify(local),before);assert.equal((await b.read()).revision,base.revision);
 });
 await check('membership restored: retained local edit saves once without changing other values',async()=>{
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'members','a'),{active:true}));
  const saved=await a.save(base,local);assert.equal(saved.revision,base.revision+1);assert.equal(saved.draft.items['kr:7'].quantity,'17');assert.equal(saved.draft.items['cn:9'].quantity,'9');
  const repeated=await a.save(base,local);assert.equal(repeated.revision,saved.revision);base=saved;
 });
 await check('25 archived drafts paginate without gaps, duplicates or changed snapshot contents',async()=>{
  const expected=new Map();
  for(let i=0;i<25;i++){
   const next=clone(base.draft);Core.edit(next,'kr:43','stock',String(i));base=await b.save(base,next);expected.set(base.orderId,clone(base.draft));
   base=await a.newBlank(Core.create(source,'2026-10-26','count-reconnect-page-'+i),base);
  }
  let cursor=null,more=true;const ids=[],revisions=[];let pages=0;
  while(more){assert.ok(++pages<5);const page=await b.archives(cursor);ids.push(...page.records.map(r=>r.orderId));revisions.push(...page.records.map(r=>r.revision));cursor=page.cursor;more=page.more;}
  assert.equal(pages,2);assert.equal(ids.length,25);assert.equal(new Set(ids).size,25);assert.deepEqual(new Set(ids),new Set(expected.keys()));
  assert.deepEqual(revisions,[...revisions].sort((x,y)=>y-x));
  for(const id of ids)assert.deepEqual((await a.archive(id)).draft,expected.get(id));
 });
}finally{
 await env.cleanup();mkdirSync('test-output/rerun',{recursive:true});
 writeFileSync('test-output/rerun/reconnect-round2.json',JSON.stringify({projectId,cases,passed:cases.length,scope:'Local Firestore emulator with SDK disableNetwork/enableNetwork; no production service contacted'},null,2)+'\n');
}
