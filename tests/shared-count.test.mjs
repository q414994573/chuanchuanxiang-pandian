import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {readFileSync} from 'node:fs';
import {doc,setDoc,updateDoc,deleteDoc,writeBatch,getDoc,serverTimestamp} from 'firebase/firestore';
import assert from 'node:assert/strict';
import {sharedCountStore} from '../cloud/shared-count.js';
import {store} from '../cloud/store.js';
import Core from '../count-core.js';
const source=JSON.parse(readFileSync('current-order.json'));
const env=await initializeTestEnvironment({projectId:'demo-ccx-shared',firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});
try{
 await env.withSecurityRulesDisabled(async c=>{for(const [uid,role,name] of [['a','owner','大伟'],['b','editor','老板娘'],['off','editor','停用']])await setDoc(doc(c.firestore(),'members',uid),{role,name,active:uid!=='off'});});
 const dbA=env.authenticatedContext('a').firestore(),dbB=env.authenticatedContext('b').firestore();
 const a=sharedCountStore(dbA,'a','大伟',Core,source),b=sharedCountStore(dbB,'b','老板娘',Core,source);
 const candidate=Core.create(source,'2026-10-22','count-shared-first');candidate.seen={};candidate.ackWrong={};
 const other=Core.create(source,'2026-10-22','count-shared-second');
 const started=await Promise.all([a.start(candidate),b.start(other)]);
 assert.equal(started[0].localId,started[1].localId);
 let base=await a.read(),one=structuredClone(base.draft),two=structuredClone(base.draft);
 Core.edit(one,'kr:43','stock','0');one.deferred={'kr:43':true};Core.edit(two,'cn:9','quantity','2');
 await Promise.all([a.save(base,one),b.save(base,two)]);
 let latest=await b.read();assert.equal(latest.draft.items['kr:43'].stock,'0');assert.equal(latest.draft.items['cn:9'].quantity,'2');assert.equal(latest.draft.deferred['kr:43'],true);
 one=structuredClone(latest.draft);two=structuredClone(latest.draft);Core.edit(one,'kr:43','stock','3');Core.edit(two,'kr:43','stock','4');
 await a.save(latest,one);await assert.rejects(b.save(latest,two),e=>e.code==='shared/conflict');
 base=await b.read();const reviewed=structuredClone(base.draft);delete reviewed.deferred;
 for(const p of reviewed.catalog){reviewed.seen=reviewed.seen||{};reviewed.seen[p.id]=true;if(p.hasStock)Core.edit(reviewed,p.id,'stock','0');if(p.id==='cn:45')Core.edit(reviewed,p.id,'unit','봉');if(p.id==='other:11')Core.edit(reviewed,p.id,'unit','세트');Core.finish(reviewed,p.id,true);}
 reviewed.status='reviewed';reviewed.reviewedAt=new Date().toISOString();
 // Save complete draft first; finalize must match latest revision.
 const filled=structuredClone(reviewed);filled.status='draft';filled.reviewedAt=null;
 await a.save(base,filled);let ready=await a.read();await assert.rejects(b.finalize(base,reviewed),e=>e.code==='shared/conflict');
 await assert.rejects(b.finalize(ready,{...reviewed,deferred:{'kr:43':true}}),/格式/);
 const final=await b.finalize(ready,reviewed);assert.equal(final.stage,'finalized');
 const oa=store(dbA,'a','orders','大伟');const ob=store(dbB,'b','orders','老板娘');const order=await oa.read(final.orderId);assert.equal(order.orderStage,'finalized');
 await assert.rejects(a.save(ready,filled),e=>e.code==='shared/conflict');
 await assert.rejects(oa.finalize(order.id,order,'forged-unpaired-reopen','pending'),e=>e.code==='permission-denied');
 const reopened=await a.reopen(final);assert.equal(reopened.stage,'draft');
 const pending=await ob.read(order.id);assert.equal(pending.orderStage,'pending');
 await assert.rejects(ob.save(pending.id,pending,pending.quantities,'bypass-shared-save'),e=>e.code==='permission-denied');
 await assert.rejects(b.reopen(final),e=>e.code==='shared/conflict');
 const finalAgain=await a.finalize(reopened,reviewed);const newCandidates=await Promise.all([a.start(Core.create(source,'2026-10-23','count-third'),finalAgain.localId),b.start(Core.create(source,'2026-10-23','count-fourth'),finalAgain.localId)]);
 assert.equal(newCandidates[0].localId,newCandidates[1].localId);assert.notEqual(newCandidates[0].localId,finalAgain.localId);assert.equal((await oa.read(finalAgain.orderId)).orderStage,'finalized');
 const current=await a.read();
 const observed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{stop();reject(Error('共享监听超时'));},10000);const stop=b.watch(r=>{if(r&&r.revision>current.revision){clearTimeout(timer);stop();resolve(r);}},e=>{clearTimeout(timer);stop();reject(e);});});
 const watched=structuredClone(current.draft);Core.edit(watched,'kr:43','stock','7');await a.save(current,watched);
 const delivered=await observed;assert.equal(delivered.draft.items['kr:43'].stock,'7');
 const preview=sharedCountStore(dbB,'b','老板娘',Core,source,true);const previewHead=await preview.start(Core.create(source,'2026-10-23','count-preview'));assert.equal(previewHead.orderId,'test-'+previewHead.localId);assert.equal((await a.read()).localId,current.localId);
 const ref=doc(dbB,'sharedCounts','current');await assertFails(updateDoc(ref,{stage:'finalized',revision:delivered.revision+1,updatedBy:'b',updatedByName:'老板娘',updatedAt:serverTimestamp(),mutationId:'forged-final-no-order'}));
 await assertFails(updateDoc(ref,{localId:'count-hijack',orderId:'count-hijack',revision:delivered.revision+1,updatedBy:'b',updatedByName:'老板娘',updatedAt:serverTimestamp(),mutationId:'forged-new-draft'}));
 await assertFails(updateDoc(ref,{revision:delivered.revision+1,updatedBy:'a',updatedByName:'大伟',updatedAt:serverTimestamp(),mutationId:'forged-actor-name'}));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'sharedCounts','current')));
 await assertFails(getDoc(doc(env.authenticatedContext('off').firestore(),'sharedCounts','current')));
 await assertFails(updateDoc(ref,{revision:999,body:'destroyed',updatedBy:'b',updatedByName:'老板娘',updatedAt:serverTimestamp()}));
 // New blank from an unfinished draft preserves exact server content atomically.
 const beforeBlank=await a.read(),blank=Core.create(source,'2026-10-24','count-blank-new');
 const next=await b.newBlank(blank,beforeBlank);assert.equal(next.localId,blank.id);assert.equal(next.draft.items['kr:43'].stock,'');
 const archived=await a.archive(beforeBlank.orderId);assert.deepEqual(archived.draft,beforeBlank.draft);assert.equal(archived.stage,'draft');
 assert.equal((await b.archives()).records[0].orderId,beforeBlank.orderId);assert.equal((await preview.archives()).records.length,0);
 await assert.rejects(a.save(beforeBlank,watched),e=>e.code==='shared/conflict');
 await assert.rejects(a.newBlank(Core.create(source,'2026-10-24','count-stale-new'),beforeBlank),e=>e.code==='shared/conflict');
 const ar=doc(dbA,'sharedCounts','current','archives',beforeBlank.orderId);
 await assertFails(updateDoc(ar,{body:'changed'}));await assertFails(deleteDoc(ar));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'sharedCounts','current','archives',beforeBlank.orderId)));
 await assertFails(setDoc(doc(dbA,'sharedCounts','current','archives',next.orderId),(await getDoc(doc(dbA,'sharedCounts','current'))).data()));
 // Tampered archive and replacement head in one batch must both be rejected.
 const bad=writeBatch(dbA),raw=(await getDoc(doc(dbA,'sharedCounts','current'))).data();
 bad.set(doc(dbA,'sharedCounts','current','archives',next.orderId),{...raw,body:JSON.stringify(beforeBlank.draft)});
 bad.set(doc(dbA,'sharedCounts','current'),{...raw,localId:'count-tamper-new',orderId:'count-tamper-new',revision:raw.revision+1,updatedBy:'a',updatedByName:'大伟',updatedAt:serverTimestamp(),mutationId:'tampered-archive-new'});
 await assertFails(bad.commit());assert.equal((await a.read()).localId,next.localId);
 // Both roles can create; simultaneous attempts preserve one old draft, not each other's new one.
 const races=await Promise.allSettled([a.newBlank(Core.create(source,'2026-10-25','count-race-a'),next),b.newBlank(Core.create(source,'2026-10-25','count-race-b'),next)]);
 assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected'&&r.reason.code==='shared/conflict').length,1);
 assert.equal((await a.archives()).records.length,2);assert.deepEqual((await b.archive(next.orderId)).draft,next.draft);
 const raceHead=await a.read(),editedRace=structuredClone(raceHead.draft);Core.edit(editedRace,'kr:43','stock','11');await b.save(raceHead,editedRace);
 await assert.rejects(a.newBlank(Core.create(source,'2026-10-25','count-after-stale'),raceHead),e=>e.code==='shared/conflict');assert.equal((await a.read()).draft.items['kr:43'].stock,'11');
 const lastHead=await a.read(),complete={...structuredClone(reviewed),id:lastHead.localId,date:lastHead.date,status:'draft',reviewedAt:null};
 await a.save(lastHead,complete);const toFinalize=await a.read();complete.status='reviewed';complete.reviewedAt=new Date().toISOString();const done=await b.finalize(toFinalize,complete);
 const archiveCount=(await a.archives()).records.length;const finalBlank=await a.newBlank(Core.create(source,'2026-10-26','count-final-blank'),done);
 assert.equal(finalBlank.draft.items['kr:43'].stock,'');assert.equal((await oa.read(done.orderId)).orderStage,'finalized');assert.equal((await a.archives()).records.length,archiveCount);
 console.log('PASS equal roles, singleton race, independent-cell merge, same-cell conflict, stale finalization, atomic finalize/reopen, legacy bypass denied, anonymous/disabled denied, history preserved, new blank atomic archives, archive tamper denied, stale and concurrent new blank protected');
}finally{await env.cleanup();}
