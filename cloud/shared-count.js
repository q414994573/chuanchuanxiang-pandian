import {doc,collection,query,orderBy,limit,startAfter,getDocsFromServer,getDocFromServer,onSnapshot,runTransaction,serverTimestamp} from 'firebase/firestore';
import Shared from '../redesign-preview/shared-draft.cjs';
import C from './core.cjs';
export function sharedCountStore(db,uid,name,Core,source,test=false){
 const head=doc(db,'sharedCounts',test?'test-current':'current');
 const archiveGroup=collection(head,'archives');
 const valid=d=>{if(!Core.validate(d,source))throw Error('共享盘货格式不正确');return d;};
 const unpack=s=>s.exists()?{...s.data(),draft:valid(JSON.parse(s.data().body))}:null;
 const metadata=(revision,mutationId)=>({revision,mutationId,updatedBy:uid,updatedByName:name,updatedAt:serverTimestamp()});
 // Some rule-checked transactions surface a revision race as permission-denied.
 // Retry only after an authorized server read proves that this document advanced.
 async function transact(action){
  for(let attempt=0;;attempt++){
   let observed=null;
   try{return await runTransaction(db,async tx=>{const snap=await tx.get(head);observed=snap.exists()?snap.data().revision:0;return action(tx,snap);});}
   catch(e){
    if(attempt>=2||e.code!=='permission-denied'||observed===null)throw e;
    const fresh=await getDocFromServer(head),revision=fresh.exists()?fresh.data().revision:0;
    if(revision===observed)throw e;
   }
  }
 }
 async function read(){return unpack(await getDocFromServer(head));}
 function watch(next,error){return onSnapshot(head,{includeMetadataChanges:true},s=>{if(!s.metadata.hasPendingWrites&&!s.metadata.fromCache)try{next(unpack(s));}catch(e){error(e);}},error);}
 async function start(candidate,expectedId=null){
  valid(candidate);if(candidate.status!=='draft')throw Error('新盘货必须是草稿');
  const mutationId=crypto.randomUUID();
  await transact(async (tx,headSnapshot)=>{
   const current=unpack(headSnapshot);
   if(current){
    if(current.stage==='draft'||current.localId!==expectedId)return;
   }
   const localId=candidate.id,orderId=C.cloudOrderId(localId,test);
   // Never reuse an existing history ID.
   const existing=await tx.get(doc(db,'orders',orderId)),archived=await tx.get(doc(archiveGroup,orderId));if(existing.exists()||archived.exists())throw Error('盘货编号已存在，请重新开始');
   tx.set(head,{schema:'ccx-shared-1',localId,orderId,date:candidate.date,stage:'draft',body:JSON.stringify(candidate),...metadata((current?.revision||0)+1,mutationId)});
  });return read();
 }
 async function newBlank(candidate,base){
  valid(candidate);if(candidate.status!=='draft'||candidate.id===base.localId)throw Error('新盘货编号不正确');
  const mutationId=crypto.randomUUID();
  await transact(async (tx,headSnapshot)=>{
   const current=unpack(headSnapshot);
   if(current?.localId===candidate.id)return;
   if(!current||current.localId!==base.localId||current.revision!==base.revision)throw Shared.failure('对方刚刚更新或新建了盘货，请打开当前盘货核对后再新建');
   const orderId=C.cloudOrderId(candidate.id,test),existing=await tx.get(doc(db,'orders',orderId)),archived=await tx.get(doc(archiveGroup,orderId));
   if(existing.exists()||archived.exists())throw Error('盘货编号已存在，请重新开始');
   if(current.stage==='draft')tx.set(doc(archiveGroup,current.orderId),headSnapshot.data());
   tx.set(head,{schema:'ccx-shared-1',localId:candidate.id,orderId,date:candidate.date,stage:'draft',body:JSON.stringify(candidate),...metadata(current.revision+1,mutationId)});
  });return read();
 }
 async function archives(cursor=null){
  const snap=await getDocsFromServer(query(archiveGroup,orderBy('revision','desc'),...(cursor?[startAfter(cursor)]:[]),limit(20)));
  return {records:snap.docs.map(s=>({...s.data(),id:s.id})),cursor:snap.docs.at(-1)||null,more:snap.size===20};
 }
 async function archive(id){const snap=await getDocFromServer(doc(archiveGroup,id));if(!snap.exists())throw Error('未找到保留的盘货');return unpack(snap);}
 async function save(base,local){
  valid(local);const mutationId=crypto.randomUUID();
  await transact(async (tx,headSnapshot)=>{
   const current=unpack(headSnapshot);
   if(!current||current.stage!=='draft'||current.localId!==base.localId)throw Shared.failure('当前盘货已定稿或已更换，本机修改已保留');
   const merged=valid(Shared.merge(base.draft,local,current.draft));
   if(Shared.signature(merged)===Shared.signature(current.draft))return;
   tx.update(head,{body:JSON.stringify(merged),date:merged.date,...metadata(current.revision+1,mutationId)});
  });return read();
 }
 async function finalize(base,reviewed){
  valid(reviewed);const payload=C.submission(reviewed,Core,source),mutationId=crypto.randomUUID();
  await transact(async (tx,headSnapshot)=>{
   const current=unpack(headSnapshot);
   if(current?.mutationId===mutationId)return;
   if(!current||current.stage!=='draft'||current.localId!==base.localId||current.revision!==base.revision)throw Shared.failure('对方已更新盘货，请核对最新内容后重新定稿');
   const ref=doc(db,'orders',current.orderId),snap=await tx.get(ref),previous=snap.exists()?snap.data():null;
   const data={...payload,quantities:Object.keys(payload.quantities).sort().map(k=>payload.quantities[k]).join(','),orderStage:'finalized',stockEdits:'',stockUnits:{},createdBy:previous?.createdBy||uid,createdAt:previous?.createdAt||serverTimestamp(),...metadata((previous?.revision||0)+1,mutationId)};
   tx.set(ref,data);tx.set(doc(ref,'revisions',mutationId),data);
   tx.update(head,{stage:'finalized',body:JSON.stringify(reviewed),...metadata(current.revision+1,mutationId)});
  });return read();
 }
 async function reopen(base){
  const mutationId=crypto.randomUUID();
  await transact(async (tx,headSnapshot)=>{
   const current=unpack(headSnapshot);
   if(!current||current.localId!==base.localId||current.revision!==base.revision||current.stage!=='finalized')throw Shared.failure('盘货状态已变化，请核对后重试');
   const ref=doc(db,'orders',current.orderId),snap=await tx.get(ref);if(!snap.exists())throw Error('定稿订单不存在');
   const draft=C.clone(current.draft);draft.status='draft';draft.reviewedAt=null;
   const data={...snap.data(),orderStage:'pending',...metadata(snap.data().revision+1,mutationId)};
   tx.update(ref,data);tx.set(doc(ref,'revisions',mutationId),data);
   tx.update(head,{stage:'draft',body:JSON.stringify(draft),...metadata(current.revision+1,mutationId)});
  });return read();
 }
 return {read,watch,start,newBlank,archives,archive,save,finalize,reopen};
}
