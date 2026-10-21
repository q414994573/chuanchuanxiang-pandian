import {doc,collection,getDocFromServer,getDocsFromServer,query,orderBy,limit,runTransaction,serverTimestamp} from 'firebase/firestore';
import Core from './core.cjs';
// Canonical ID-sorted thousandths sequence keeps rules validation bounded for 129 products.
const encode=q=>Object.keys(q).sort().map(k=>String(q[k])).join(',');
const decode=d=>{const ids=Object.keys(d.units).sort(),v=d.quantities.split(',');if(v.length!==ids.length)throw Error('云端数量记录不完整');return {...d,quantities:Object.fromEntries(ids.map((id,i)=>[id,Number(v[i])]))};};
export function store(db,uid,group='orders',actorName=''){
 if(!['orders','sandboxOrders'].includes(group))throw Error('Invalid collection');
 if(typeof actorName!=='string'||!actorName.trim())throw Error('成员配置缺少显示名');
 const ref=id=>doc(db,group,id);
 const online=()=>{if(typeof navigator!=='undefined'&&navigator.onLine===false)throw Error('当前断网，未保存到云端。请保留页面或导出备份。');};
 async function create(id,payload,mutationId){online();await runTransaction(db,async tx=>{const r=ref(id),existing=await tx.get(r);if(existing.exists()){const d=existing.data();if(d.createdBy===uid&&d.snapshot===payload.snapshot)return;throw Error('该盘货已经提交，不能以本机版本覆盖。请打开云端订单。');}const data={...payload,quantities:encode(payload.quantities),createdBy:uid,createdAt:serverTimestamp(),updatedBy:uid,updatedAt:serverTimestamp(),updatedByName:actorName,revision:1,mutationId};tx.set(r,data);tx.set(doc(r,'revisions',mutationId),data);});return read(id);}
 async function save(id,base,quantities,mutationId,patch){online();if(patch&&Object.keys(patch).some(k=>k!=='snapshot'))throw Error('只能修改订货数量或库存快照');await runTransaction(db,async tx=>{const r=ref(id),s=await tx.get(r);if(!s.exists())throw Error('订单不存在');const current=decode(s.data());if(current.mutationId===mutationId&&current.updatedBy===uid)return;Core.assertRevision(current.revision,base.revision);Core.checkQuantities(quantities,current.units,Object.keys(current.quantities));const next={...current,quantities:encode(quantities),revision:current.revision+1,updatedBy:uid,updatedAt:serverTimestamp(),updatedByName:actorName,mutationId};if(patch&&typeof patch.snapshot==='string')next.snapshot=patch.snapshot;tx.update(r,next);tx.set(doc(r,'revisions',mutationId),next);});return read(id);}
 async function read(id){online();const s=await getDocFromServer(ref(id));if(!s.exists())throw Error('找不到这份云端订单');return {id:s.id,...decode(s.data())};}
 async function list(){online();return (await getDocsFromServer(query(collection(db,group),orderBy('updatedAt','desc'),limit(30)))).docs.map(s=>({id:s.id,...decode(s.data())}));}
 async function history(id){online();return (await getDocsFromServer(query(collection(ref(id),'revisions'),orderBy('revision','desc'),limit(50)))).docs.map(s=>decode(s.data()));}
 async function finalize(id,base,mutationId,stage='finalized'){
  if(!['pending','finalized'].includes(stage))throw Error('订单状态不正确');
  online();
  await runTransaction(db,async tx=>{
   const r=ref(id),s=await tx.get(r);if(!s.exists())throw Error('订单不存在');
   const current=s.data();
   if(current.mutationId===mutationId&&current.updatedBy===uid)return;
   Core.assertRevision(current.revision,base.revision);
   if((current.orderStage||'pending')===stage)throw Error('订单已经处于这个状态，请刷新查看');
   const next={...current,orderStage:stage,revision:current.revision+1,updatedBy:uid,updatedAt:serverTimestamp(),updatedByName:actorName,mutationId};
   tx.update(r,next);tx.set(doc(r,'revisions',mutationId),next);
  });return read(id);
 }
 return {create,save,read,list,history,finalize};
}
