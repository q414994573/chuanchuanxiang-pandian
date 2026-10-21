import {initializeApp} from 'firebase/app';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,EmailAuthProvider,reauthenticateWithCredential,updatePassword} from 'firebase/auth';
import {getFirestore,doc,getDocFromServer,runTransaction,serverTimestamp} from 'firebase/firestore';
import {store} from '../cloud/store.js';
import C from '../cloud/core.cjs';
import A from '../cloud/account.cjs';
import S from './search.cjs';
import Flow from './count-flow.cjs';
import Backup from './draft-backup.cjs';
import Recovery from './recovery.cjs';
import Entry from './entry-mode.cjs';

const Core=()=>window.CountCore;
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATS=[['kr','韩国','韩国食品'],['cn','中国','中国食品'],['other','其他','其他商品']];
const PRODUCTION=document.documentElement?.dataset.orderMode==='production';
const MODE=Entry.settings(PRODUCTION),KEY=MODE.key;
let releaseLocked=PRODUCTION,configFailed=false;
const app=document.getElementById('app');
let source,aliasById=new Map(),draft,pos=0,field='stock',screen='count',keypad=false,textMode=false,viewCat='kr',orderCat='kr',moduleEnd=false,entered=null;
let catScroll={kr:0,cn:0,other:0},orderScroll={kr:0,cn:0,other:0};
let user=null,member=null,auth,db,api=null,order=null,baseQty={},baseUnits={},stocks={},stockBase={},history=[];
let query='',status='正在准备…',sample=false,demoRole=null,busy=false,orderDirty=false,editId=null,editSnap=null,editRaw=null;
let undo=null,heldPrev={},ack={},yellowOn=true,yellowOnly=false,archives=[],cloudTimer=null,cloudPending=false,morePane='';
let searchScroll=null,searchCat=null,wantFind=false,skipActUntil=0;
let rowTap=null;
let editField='qty';
let localSaveFailed=false;
let lastLocalRaw=null,localSerial=0,localBlocked=false,localConflict=false;
let backupUid=null,cloudBase,cloudReady=false,cloudReading=false,cloudWriting=false,cloudConflict=false;
let cloudPhase='waiting',cloudAt=null,retryDelay=5000,sessionEpoch=0;
let latestOrder=null,latestMessage='',latestRequest=0,directoryRecords=[],directoryCursor=null,directoryMore=false,directoryDate='',directoryMessage='',directoryRequest=0;
let preparedExport=null;
let orderSaveNotice=null;
const moreSections={};
function helpHtml(label,text){return `<details class="action-help"><summary aria-label="${E(label)}的说明">ⓘ</summary><p>${E(text)}</p></details>`;}
function toolButton(label,act,help,attrs=""){return `<div class="latest-action"><button class="ghost" type="button" data-act="${act}" ${attrs}>${E(label)}</button>${help?helpHtml(label,help):""}</div>`;}
function toolSection(id,title,content){return `<details class="card" data-more-section="${id}" ${moreSections[id]?"open":""}><summary>${title}</summary>${content}</details>`;}

const testOrders=records=>Entry.orders(records,MODE.test);
function fixedEntryUrl(){const url=new URL(location.href);url.searchParams.delete('order');url.searchParams.delete('sample');return url.href;}
function latestText(){return latestOrder?`云端最新：${latestOrder.date} 已提交 · ${latestOrder.orderStage==='finalized'?'已定稿':'待老板娘审核'}${order&&order.id!==latestOrder.id?' · 有另一份最新订单':''}`:'尚未检查最新订单';}
function entryHtml(){
 if(!member||sample)return '';
 return `<div class="card" data-order-entry><strong data-latest-title>${E(latestText())}</strong><p class="muted" data-latest-note>${E(latestMessage)}</p><details><summary>最新订单、日期查找与固定入口</summary><div class="latest-action"><button class="ghost" data-act="latest-order">查看最新订单</button><details class="action-help"><summary aria-label="查看最新订单的说明">ⓘ</summary><p>打开最近提交的订单，并进入“订单”页面。若当前有未保存的修改，会先提醒保存。</p></details></div><button class="ghost" data-act="fixed-link">复制固定入口</button><label>订单日期<input id="orderDate" type="date" value="${E(directoryDate)}"></label><div class="pair"><button class="ghost" data-act="find-date">查找</button><button class="ghost" data-act="all-orders">查看全部日期</button></div><div data-order-list>${directoryHtml()}</div></details></div>`;
}
function directoryHtml(){return `<p class="muted">${E(directoryMessage)}</p>`+directoryRecords.map(d=>`<button class="ghost" style="width:100%;margin-top:8px" data-act="open-cloud" data-id="${E(d.id)}">${E(d.date)} · ${d.orderStage==='finalized'?'已定稿':'待老板娘审核'} · ${E(d.id.slice(-6))}</button>`).join('')+(directoryMore?'<button class="ghost" data-act="older-orders">加载更早订单</button>':'');}
function paintEntry(){document.querySelectorAll('[data-latest-title]').forEach(el=>{el.textContent=latestText();});document.querySelectorAll('[data-latest-note]').forEach(el=>{el.textContent=latestMessage;});}
function paintDirectory(){document.querySelectorAll('[data-order-list]').forEach(el=>{el.innerHTML=directoryHtml();});}
async function checkLatest(){
 if(!api||sample)return null;const request=++latestRequest,epoch=sessionEpoch,client=api;
 latestMessage='正在检查…';paintEntry();
 try{let cursor=null,found=null;do{const page=await client.listPage(cursor);if(request!==latestRequest||epoch!==sessionEpoch)return null;found=testOrders(page.records)[0]||null;if(found||!page.hasMore)break;cursor=page.cursor;}while(cursor);
  if(request!==latestRequest||epoch!==sessionEpoch)return null;
  latestOrder=found;latestMessage=found?'按提交时间排列；点击“查看最新订单”即可打开。':`还没有提交的${MODE.test?'测试':''}订单。`;paintEntry();return found;
 }catch(e){if(request===latestRequest&&epoch===sessionEpoch){latestMessage='检查失败：'+(e.message||'请重试');paintEntry();}return null;}
}
async function findOrders(date='',append=false){
 if(!api||sample)return;const request=++directoryRequest,epoch=sessionEpoch,client=api;
 if(!append){directoryDate=date;directoryRecords=[];directoryCursor=null;directoryMore=false;}
 directoryMessage='正在读取…';paintDirectory();
 try{const result=date?{records:await client.onDate(date),cursor:null,hasMore:false}:await client.listPage(append?directoryCursor:null);
  if(request!==directoryRequest||epoch!==sessionEpoch)return;
  directoryRecords=[...new Map([...directoryRecords,...testOrders(result.records)].map(d=>[d.id,d])).values()];directoryCursor=result.cursor;directoryMore=result.hasMore;
  directoryMessage=directoryRecords.length?`${date||'全部日期'} · 已列出 ${directoryRecords.length} 份`:(directoryMore?'本页没有本入口的订单，可继续加载更早订单。':'这个日期范围没有已提交订单。');paintDirectory();
 }catch(e){if(request===directoryRequest&&epoch===sessionEpoch){directoryMessage='读取失败：'+(e.message||'请重试');paintDirectory();}}
}

function toast(text){const t=document.getElementById('toast');t.textContent=text;t.style.display='block';clearTimeout(toast._t);toast._t=setTimeout(()=>{t.style.display='none';},2200);}
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());}
function uid(){return 'count-'+(crypto.randomUUID?crypto.randomUUID():Date.now());}
function isOwner(){if(demoRole)return demoRole==='owner';if(member)return member.role==='owner';return true;}
function canCount(){return isOwner();}
function aliasesOf(p){return aliasById.get(p.id)||[];}
function catalog(){if(order)return JSON.parse(order.snapshot).catalog;if(draft)return draft.catalog;return source.products.map(p=>({id:p.id,name:p.name,alias:p.alias||'',cat:p.cat,category:p.category,hasStock:!!p.hasStock,unit:p.unit||'',referenceStock:p.stock,referenceOrder:p.order}));}
function product(id){return catalog().find(p=>p.id===id);}
function seen(id){return !!(draft&&draft.seen&&draft.seen[id]);}
function markSeen(id){if(draft){draft.seen=draft.seen||{};draft.seen[id]=true;}}
function seenIn(cat){return (draft?draft.catalog:[]).filter(p=>p.cat===cat&&seen(p.id)).length;}
function totalIn(cat){return (draft?draft.catalog:source.products).filter(p=>p.cat===cat).length;}
function allSeen(){return !!draft&&draft.catalog.every(p=>seen(p.id));}
function firstGap(){return draft?draft.catalog.findIndex(p=>!seen(p.id)):-1;}

function persistLocal(){
 if(!draft||sample)return;
 if(screen==='order'&&!order&&editId){const i=draft.catalog.findIndex(p=>p.id===editId);if(i>=0){pos=i;field=editField==='stock'?'stock':'qty';}}
 draft.savedAt=Date.now();
 localSerial++;cloudPending=true;
 if(!cloudWriting&&!cloudConflict)cloudPhase='waiting';
 saveLocalEnvelope();
 scheduleCloud();
}
function saveLocalEnvelope(){
 if(sample)return;
 try{
  if(localBlocked)throw Error('原草稿读取失败，已停止覆盖');
  if(localStorage.getItem(KEY)!==lastLocalRaw){localConflict=true;throw Error('另一页面已修改本机草稿，已停止覆盖');}
  const raw=JSON.stringify({draft,pos,field,savedAt:draft?.savedAt,backupUid,cloudBase,cloudAt});
  localStorage.setItem(KEY,raw);lastLocalRaw=raw;localSaveFailed=false;
 }catch(e){localSaveFailed=true;paintBackupStatus();throw Error(localConflict?'另一页面已修改草稿，请先下载当前内容':'本机保存失败，请保留页面、下载备份并重试');}
 paintBackupStatus();
}
function loadLocal(){
 try{
  const raw=localStorage.getItem(KEY);
  lastLocalRaw=raw;
  if(!raw)return;
  const data=JSON.parse(raw);
  if(!Core().validate(data.draft,source))throw Error('草稿格式不匹配');
  draft=data.draft;if(draft.status==='reviewed')screen='order';draft.seen=draft.seen||{};draft.ackWrong=draft.ackWrong||{};
  pos=Math.max(0,Math.min(data.pos||0,draft.catalog.length-1));
  field=data.field==='qty'?'qty':'stock';
  if(draft.catalog[pos]&&!draft.catalog[pos].hasStock)field='qty';
  viewCat=draft.catalog[pos]?.cat||'kr';
  backupUid=data.backupUid||null;cloudBase=data.cloudBase;cloudAt=data.cloudAt||null;cloudPending=true;
 }catch(e){localBlocked=true;localSaveFailed=true;}
}
function scheduleCloud(){clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>flushCloud(),1500);}
function draftRecord(){return draft?{schema:'ccx-draft-1',date:draft.date,localId:draft.id,pos,field,body:JSON.stringify({draft,savedAt:draft.savedAt})}:null;}
function backupMessage(){
 if(localBlocked)return '原草稿读取失败，已保留原内容，请先下载备份';
 if(localConflict)return '另一页面修改了草稿，已暂停覆盖，请先下载当前备份';
 if(localSaveFailed)return '本机保存失败！请保留页面、下载备份并重试';
 if(cloudConflict)return '本机已保存 · 两份草稿不同，云端备份已暂停';
 if(configFailed)return '本机已保存 · 云端配置加载失败，暂未备份云端；可继续盘货或下载备份';
 if(!user||member?.role!=='owner')return '本机已保存 · 登录大伟账号后备份云端';
 if(typeof navigator!=='undefined'&&navigator.onLine===false)return '本机已保存 · 当前离线，联网后重试';
 if(cloudPhase==='reading')return '本机已保存 · 正在核对云端草稿';
 if(cloudPhase==='saving')return '本机已保存 · 正在备份云端';
 if(cloudPhase==='failed')return '本机已保存 · 云端备份失败，将重试';
 if(cloudPending||!cloudReady)return '本机已保存 · 等待备份云端';
 return '本机已保存 · 云端已备份'+(cloudAt?' '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(cloudAt)):'');
}
function backupStatusHtml(){
 if(sample||order||!canCount())return '';
 const trouble=localSaveFailed||cloudConflict||cloudPhase==='failed';
 return `<div class="backup-status" data-backup-status role="status"><span>${E(backupMessage())}</span>${trouble?'<button type="button" data-act="backup-retry">重试</button><button type="button" data-act="backup-export">下载本机备份</button>':''}${cloudConflict?'<button type="button" data-act="backup-local">用本机这份备份</button><button type="button" data-act="backup-remote">读取云端草稿</button>':''}</div>`;
}
function paintBackupStatus(){document.querySelectorAll('[data-backup-status]').forEach(el=>{el.outerHTML=backupStatusHtml();});}
function backupRecovery(){
 const value=localBlocked?lastLocalRaw:JSON.stringify({draft,pos,field,savedAt:draft?.savedAt});
 const blob=new Blob([value||''],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='川川香-本机草稿备份-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function downloadOrderBackup(){
 if(!order||sample)throw Error('请先打开云端订单');
 if(textMode&&readPlain()===false)return;
 if(editId&&commitOrderEdit()===false)return;
 const value=Recovery.fromOrder(order,source);
 value.origin.unsaved=dirtyCount()>0;
 const blob=new Blob([JSON.stringify(value)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`川川香-订单备份-${order.date}-v${order.revision}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 toast('已生成备份，请保存文件；恢复时会创建独立盘货');
}
function legacyImportHtml(){
 try{const rows=Entry.legacyDrafts(localStorage,source);return `<div class="card"><h2>旧版记录</h2><p>旧入口和原记录继续保留。选择后恢复为独立盘货，需重新检查；已经提交的订单可直接按日期查询。</p><a href="../">打开旧版入口</a>${rows.length?`<select id="legacyDraft" aria-label="旧版本机盘货">${rows.map(r=>`<option value="${E(r.key)}">${E(r.draft.date)} · ${E(r.draft.id.slice(-8))}</option>`).join('')}</select><button class="ghost" data-act="legacy-import">载入所选旧版盘货</button>`:'<p>这个浏览器没有找到旧版本机记录。其他手机的记录请先在旧版导出备份，再到这里恢复。</p>'}</div>`;}catch(e){return '<p>旧版本机记录暂时读不到，请在旧版导出备份后恢复。</p>';}
}
async function importLegacy(){
 if(!PRODUCTION||member?.role!=='owner')throw Error('请在正式入口由大伟登录后操作');
 const key=document.getElementById('legacyDraft')?.value;
 const selected=Entry.legacyDrafts(localStorage,source).find(r=>r.key===key);if(!selected)throw Error('旧记录已改变，请重新打开列表');
 await restoreBackupFile({size:selected.raw.length,text:async()=>selected.raw});
}
async function restoreBackupFile(file){
 if(member?.role!=='owner'||sample)throw Error('请大伟登录后恢复备份');
 if(localBlocked||localConflict||cloudWriting||cloudReading||cloudConflict)throw Error('请先解决当前草稿的备份或冲突，再恢复文件');
 if(!file||file.size>2000000)throw Error('请选择小于2MB的JSON备份');
 const epoch=sessionEpoch,serial=localSerial,current=order,orderRaw=JSON.stringify(order),raw=lastLocalRaw;
 const restored=Recovery.restore(await file.text(),source,uid());
 if(epoch!==sessionEpoch||serial!==localSerial||order!==current||JSON.stringify(order)!==orderRaw||lastLocalRaw!==raw||cloudWriting||cloudReading||cloudConflict)throw Error('读取文件期间页面发生变化，请重新选择备份');
 if(!confirm('将先保留当前本机草稿和订单副本，再恢复成独立盘货；原云端订单不变，恢复后需要重新检查并提交。继续吗？'))return;
 localStorage.setItem(KEY+':recovery:'+Date.now(),JSON.stringify({draft,pos,field,order}));
 const previous={draft,pos,field};draft=restored;pos=0;field='stock';
 try{saveLocalEnvelope();}catch(e){draft=previous.draft;pos=previous.pos;field=previous.field;throw e;}
 order=null;preparedExport=null;sample=false;editId=null;editRaw=null;keypad=false;textMode=false;query='';screen='count';viewCat='kr';
 const url=new URL(location.href);url.searchParams.delete('order');url.searchParams.delete('sample');historyReplace(url);
 persistLocal();render();toast('已恢复独立盘货，请逐项检查后提交；原云端订单未改');
}
function exportPanel(){
 const p=preparedExport;if(!p||!order||p.id!==order.id||p.revision!==order.revision||p.epoch!==sessionEpoch)return '';
 return `<div class="card" role="region" aria-label="已核对的分类文字"><strong>${E(order.date)} · 第 ${p.revision} 版 · ${p.kind==='link'?'已提交，链接已准备好':'已核对'}</strong><p>请检查下方文字，再复制或分享；网站不会自动发送。${p.kind==='link'?'把订单链接发给老板娘。':'若订单随后重新修改，请重新核对；复制按钮在一分钟后需重新核对。'}</p><textarea readonly aria-label="待发送订货文字" style="width:100%;min-height:160px;box-sizing:border-box">${E(p.text)}</textarea><div class="pair"><button data-act="export-copy">复制这份文字</button><button data-act="export-share">分享这份文字</button></div><button class="ghost" data-act="export-close">收起</button></div>`;
}
async function deliverPrepared(sharing){
 const p=preparedExport;
 if(!p||!order||p.id!==order.id||p.revision!==order.revision||p.epoch!==sessionEpoch||dirtyCount()||(p.kind!=='link'&&(order.orderStage!=='finalized'||Date.now()-p.checkedAt>60000)))throw Error('订单已变化或核对已过期，请重新核对后复制');
 if(sharing)await shareOrCopy(p.text);else await copyOnly(p.text);
}
function retryCloud(){
 cloudPending=true;cloudPhase='failed';paintBackupStatus();
 clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>flushCloud(),retryDelay);retryDelay=Math.min(retryDelay*2,60000);
}
async function flushCloud(){
 clearTimeout(cloudTimer);
 if(sample||!draft||!user||member?.role!=='owner'||!db||localSaveFailed||localConflict||localBlocked||cloudConflict)return;
 if(typeof navigator!=='undefined'&&navigator.onLine===false){cloudPending=true;paintBackupStatus();return;}
 if(cloudWriting||cloudReading)return;
 if(!cloudReady){await pullDraft();return;}
 const record=draftRecord(),nextToken=Backup.token(record),expected=cloudBase,epoch=sessionEpoch;
 if(nextToken===cloudBase){cloudPending=false;cloudPhase='saved';paintBackupStatus();return;}
 const ref=doc(db,MODE.draftCollection,user.uid);
 cloudWriting=true;cloudPhase='saving';paintBackupStatus();
 try{
  await runTransaction(db,tx=>Backup.compareAndSave(tx,ref,expected,{...record,updatedAt:serverTimestamp()}));
  if(epoch!==sessionEpoch)return;
  cloudBase=nextToken;cloudAt=Date.now();retryDelay=5000;
  cloudPending=Backup.token(draftRecord())!==nextToken;cloudPhase=cloudPending?'waiting':'saved';
  saveLocalEnvelope();
 }catch(e){
  if(epoch!==sessionEpoch)return;
  if(e.code==='draft/conflict'){cloudConflict=true;cloudReady=false;cloudPending=true;}
  else retryCloud();
 }finally{cloudWriting=false;paintBackupStatus();if(epoch!==sessionEpoch||cloudPending&&cloudPhase==='waiting')scheduleCloud();}
}
async function pullDraft(forceRemote=false,preferLocal=false){
 if(!user||member?.role!=='owner'||!db||sample||cloudReading||cloudWriting||localBlocked||localConflict)return;
 const epoch=sessionEpoch,serial=localSerial;
 cloudReading=true;cloudPhase='reading';paintBackupStatus();
 try{
  const snap=await getDocFromServer(doc(db,MODE.draftCollection,user.uid));
  if(epoch!==sessionEpoch)return;
  const record=snap.exists()?snap.data():null,remote=Backup.body(record);
  if(record&&(!remote?.draft||!Core().validate(remote.draft,source)))throw Error('云端草稿格式不匹配');
  let choice=Backup.choose(draftRecord(),record,cloudBase);
  if(forceRemote&&record)choice='remote';
  if(preferLocal&&serial===localSerial){if(record)localStorage.setItem(KEY+':recovery-cloud:'+Date.now(),JSON.stringify(record));choice='local';}
  if(choice==='remote'&&serial!==localSerial)choice='conflict';
  if(choice==='conflict'){cloudConflict=true;cloudReady=false;cloudPending=true;return;}
  if(choice==='remote'){
   // Preserve the old local copy before any replacement; quota failure aborts recovery.
   if(localStorage.getItem(KEY)!==lastLocalRaw){localConflict=true;throw Error('另一页面已修改草稿');}
   if(draft)localStorage.setItem(KEY+':recovery:'+Date.now(),JSON.stringify({draft,pos,field}));
   const nextDraft=remote.draft,nextPos=Math.max(0,Math.min(record.pos||0,nextDraft.catalog.length-1));
   const nextField=nextDraft.catalog[nextPos]?.hasStock&&record.field==='stock'?'stock':'qty';
   const raw=JSON.stringify({draft:nextDraft,pos:nextPos,field:nextField,savedAt:nextDraft.savedAt,backupUid:user.uid,cloudBase:Backup.token(record),cloudAt:null});
   localStorage.setItem(KEY,raw);lastLocalRaw=raw;
   draft=nextDraft;draft.seen=draft.seen||{};draft.ackWrong=draft.ackWrong||{};pos=nextPos;field=nextField;viewCat=draft.catalog[pos]?.cat||'kr';cloudAt=null;
   editId=null;entered=null;keypad=false;textMode=false;query='';
   toast('已从云端恢复上次盘到的地方');
   render();
  }
  cloudBase=Backup.token(record);backupUid=user.uid;cloudReady=true;cloudConflict=false;
  if(record?.updatedAt?.toMillis)cloudAt=record.updatedAt.toMillis();
  cloudPending=Backup.token(draftRecord())!==cloudBase;cloudPhase=cloudPending?'waiting':'saved';
  if(draft)saveLocalEnvelope();
 }catch(e){if(epoch===sessionEpoch)retryCloud();}
 finally{cloudReading=false;paintBackupStatus();if(epoch!==sessionEpoch||cloudReady&&cloudPending&&!cloudConflict)scheduleCloud();}
}
function ensureDraft(){
 if(draft||!canCount()||localBlocked)return;
 draft=Core().create(source,today(),uid());
 draft.seen={};draft.ackWrong={};draft.savedAt=Date.now();
 pos=0;field='stock';persistLocal();
}
function guardTest(id){C.assertCloudOrderId(id,MODE.test);}

function stockShown(p){
 if(order)return String(stocks[p.id]??'');
 if(!draft)return '';
 const cur=draft.items[p.id]?.stock??'';
 if(String(cur).trim())return cur;
 return draft.stockText?.[p.id]||'';
}
function cellRaw(p,which){
 if(which==='stock')return p.hasStock?stockShown(p):'';
 return draft.items[p.id].quantity||'';
}
function cellText(p,which){
 if(which==='stock')return p.hasStock?stockShown(p):'';
 return draft.items[p.id].quantity||'';
}
function cellLabel(p,which){
 const v=cellText(p,which);
 if(which==='stock')return p.hasStock?(v?`库存 ${v}`:'库存，还没填'):'这项不用填库存';
 return v?`订货 ${v}`:'订货，还没填';
}
function reviveStock(p){
 if(!draft?.stockText?.[p.id])return;
 if(String(draft.items[p.id].stock||'').trim())return;
 try{Core().edit(draft,p.id,'stock',draft.stockText[p.id]);delete draft.stockText[p.id];}catch(e){}
}
function labelFor(p,which,now){
 const name=Flow.largeName(p);
 if(which==='stock')return `${name} 库存 ${now===''?'空':now}`;
 return `${name} 订 ${now===''?'不订':now}`;
}
function showUndo(info){
 undo=info;clearTimeout(showUndo._t);
 showUndo._t=setTimeout(()=>{undo=null;const n=document.querySelector('.undo');if(n)n.remove();},4500);
}
function leaveCountCell(){
 if(!entered||!draft)return;
 const p=draft.catalog.find(x=>x.id===entered.id);if(!p){entered=null;return;}
 const r=draft.items[p.id];
 const now=entered.field==='stock'?r.stock:r.quantity;
 if(now!==entered.value)showUndo({where:'count',id:p.id,field:entered.field,value:entered.value,label:labelFor(p,entered.field,now)});
 entered=null;
}
function captureEntered(){
 const p=draft.catalog[pos],r=draft.items[p.id];
 entered={id:p.id,field,value:field==='stock'?r.stock:r.quantity};
}
function openCount(i,which){
 if(!draft)return;
 if(draft.status==='reviewed'){toast('已经提交。要改数量，去订单');screen='order';keypad=false;textMode=false;render();return;}
 blurFind();
 const prev=pos;
 if(!(keypad&&pos===i&&field===which))leaveCountCell();
 pos=i;
 const p=draft.catalog[i];
 viewCat=p.cat||viewCat;
 field=which||(p.hasStock?'stock':'qty');
 if(field==='stock'&&!p.hasStock)field='qty';
 if(field==='stock')reviveStock(p);
 moduleEnd=false;keypad=true;textMode=false;screen='count';captureEntered();persistLocal();
 if(prev!==pos)flushCloud();
 render();scrollActive();
}
function typeKey(key){
 if(!draft||draft.status==='reviewed')return;
 const p=draft.catalog[pos],r=draft.items[p.id];
 if(field==='stock'&&!p.hasStock){field='qty';captureEntered();render();return;}
 const cur=field==='stock'?r.stock:r.quantity;
 let next=cur;
 if(!Flow.numericFragment(cur)&&key!=='del')next=key==='.'?'0.':key;
 else if(key==='del')next=cur.slice(0,-1);
 else if(key==='.'){if(cur.includes('.'))return;next=cur===''?'0.':cur+'.';}
 else next=cur+key;
 if(next.length>12)return;
 const parts=next.split('.');if(parts[1]&&parts[1].length>3)return;
 try{Core().edit(draft,p.id,field==='stock'?'stock':'quantity',next);}catch(e){toast(e.message);return;}
 if(next&&!next.endsWith('.'))markSeen(p.id);
 persistLocal();render();scrollActive();
}
function writeCell(value){
 if(!draft||draft.status==='reviewed')return;
 const p=draft.catalog[pos];
 const next=String(value??'').slice(0,40);
 const cur=field==='stock'?draft.items[p.id].stock:draft.items[p.id].quantity;
 if(cur===next)return;
 if(field==='stock'&&!p.hasStock){toast('这项不用填库存');return;}
 try{Core().edit(draft,p.id,field==='stock'?'stock':'quantity',next);}catch(e){toast(e.message);return;}
 if(next.trim())markSeen(p.id);
 persistLocal();
}
function finishTyping(){
 const p=draft.catalog[pos],r=draft.items[p.id];
 const cur=field==='stock'?r.stock:r.quantity;
 if(cur==='.'||/^\d+\.$/.test(cur)){toast('数量还没写完');return false;}
 if(field==='qty'&&cur==='0'){Core().edit(draft,p.id,'quantity','');toast('订货写 0 不算订，留空就是不订');}
 return true;
}
function nextCell(){
 if(!draft)return;
 if(!finishTyping()){textMode=false;keypad=true;render();scrollActive();return;}
 if(field==='stock'){leaveCountCell();field='qty';moduleEnd=false;captureEntered();persistLocal();render();scrollActive();return;}
 leaveCountCell();
 const prev=pos;markSeen(draft.catalog[pos].id);
 const step=Flow.advance(draft.catalog,pos);
 if(step.stay){moduleEnd=true;captureEntered();persistLocal();render();scrollActive();return;}
 pos=step.index;field=draft.catalog[pos].hasStock?'stock':'qty';moduleEnd=false;
 captureEntered();persistLocal();if(prev!==pos)flushCloud();render();scrollActive();
}
function showCat(cat){
 if(!draft||!cat)return;
 readPlain();
 leaveCountCell();
 keypad=false;textMode=false;
 if(!query){searchScroll=null;searchCat=null;}
 if(cat===viewCat){moduleEnd=false;render();return;}
 if(!query) catScroll[viewCat]=window.scrollY;
 viewCat=cat;moduleEnd=false;
 render();
 const y=query?0:(catScroll[cat]||0);
 requestAnimationFrame(()=>window.scrollTo(0,y));
}
function doUndo(){
 if(!undo)return;
 const info=undo;undo=null;
 if(info.where==='count'&&draft){
  try{Core().edit(draft,info.id,info.field==='stock'?'stock':'quantity',info.value);}catch(e){toast(e.message);return;}
  const i=draft.catalog.findIndex(p=>p.id===info.id);
  pos=i;viewCat=draft.catalog[i]?.cat||viewCat;field=info.field;keypad=true;textMode=false;screen='count';captureEntered();persistLocal();
 }else if(info.where==='order'){
  applyOrderValue(info.id,info.field||'qty',info.value);
  editId=info.id;editField=info.field||'qty';editSnap=info.value;editRaw=info.value;keypad=true;textMode=false;screen='order';
 }
 render();scrollActive();
}

function unitPicker(p,which){
 const options=C.units.choices[p.id];if(!options)return '';
 const stock=which==='stock',value=stock?(order?JSON.parse(order.snapshot).items[p.id]?.stockUnit:draft?.items[p.id]?.stockUnit):(order?order.units[p.id]:draft?.items[p.id]?.unit);
 const locked=order?.orderStage==='finalized'||(stock?!!order||!canEditStock(p):!order&&!canCount());
 const label=stock?'库存单位':'订货单位';
 return `<label class="unit-picker">${label}<select data-unit="${E(p.id)}" data-field="${which}" aria-label="${E(p.name+' '+label)}" ${locked?'disabled':''}><option value="">请选择</option>${options.map(([u,n])=>`<option value="${E(u)}" ${value===u?'selected':''}>${E(u+' · '+n)}</option>`).join('')}</select></label>`;
}
function selectUnit(id,which,value){
 const p=product(id),stock=which==='stock';
 if(!p||!C.units.choices[id]||!C.units.valid(id,value))throw Error('请选择模板规定的单位');
 if(order?.orderStage==='finalized'||(stock?!canEditStock(p):!order&&!canCount()))throw Error('这项目前只能查看');
 if(order&&!sample&&!member)throw Error('请先登录');
 if((stock?stockShown(p):qtyOf(id))&&!value)throw Error('已有数量，请选择单位；不订请清空订货数量');
 // Do not convert quantities or change inventory when choosing an order unit.
 if(order){order.units[id]=value;orderDirty=true;}
 else{Core().edit(draft,id,stock?'stockUnit':'unit',value);persistLocal();}
 preparedExport=null;render();
}
document.body.addEventListener('change',e=>{
 if(!e.target.dataset?.unit||releaseLocked)return;
 try{if(busy)throw Error('正在保存，请稍后再选择');selectUnit(e.target.dataset.unit,e.target.dataset.field,e.target.value);}
 catch(err){toast(err.message);render();}
});

function qtyOf(id){
 if(order)return C.textQuantity(order.quantities[id]||0);
 const r=draft?.items[id];
 return r&&r.decision==='order'?r.quantity:'';
}
function applyQty(id,text){
 if(!order&&draft?.status==='reviewed')throw Error('请先打开这次盘货对应的云端订单，再修改数量');
 if(order?.orderStage==='finalized')throw Error('订单已定稿，请老板娘先点重新修改');
 const prev=qtyOf(id);
 if(!String(text||'').trim()){if(prev)heldPrev[id]=prev;}
 else delete heldPrev[id];
 if(order){
  if(!String(text||'').trim())order.quantities[id]=0;
  else{
   if(!Flow.isNumericQty(String(text).trim()))throw Error('云端订货只能存数字。文字写在盘货的库存格，或把这里改成数字。');
   if(!String(order.units[id]||'').trim())throw Error('这项单位还是空的，不能订');
   order.quantities[id]=C.quantity(String(text).trim());
  }
  if(!sample)orderDirty=true;
 }else if(draft){
  if(!String(text||'').trim())Core().edit(draft,id,'quantity','');
  else{const p=product(id);if(!String(draft.items[id].unit||'').trim())throw Error('请先选择这项的订货单位');Core().edit(draft,id,'quantity',text);}
  markSeen(id);persistLocal();
 }
}
function canEditStock(p){return !!p?.hasStock&&!order&&canCount()&&draft?.status==='draft';}
function orderValue(id,which){return which==='stock'?stockShown(product(id)):qtyOf(id);}
function applyOrderValue(id,which,value){
 if(which!=='stock'){applyQty(id,value);return;}
 const p=product(id);
 if(!canEditStock(p))throw Error('这格库存只能查看');
 reviveStock(p);
 Core().edit(draft,id,'stock',value);
 if(draft.stockText)delete draft.stockText[id];
 if(value.trim())markSeen(id);
 persistLocal();
}
function openOrderKey(id,which='qty'){
 if(!order&&draft?.status==='reviewed'){toast('请先打开这次盘货对应的云端订单');screen='order';keypad=false;textMode=false;render();return;}
 if(order?.orderStage==='finalized'){toast('订单已定稿，只能查看');return;}
 if(which==='stock'&&!canEditStock(product(id))){toast('这格库存只能查看');return;}
 if(textMode&&readPlain()===false)return;
 if(editId&&commitOrderEdit()===false)return;
 blurFind();
 editId=id;editField=which;editSnap=orderValue(id,which);editRaw=editSnap;keypad=true;textMode=false;screen='order';render();scrollActive();
}
function commitOrderEdit(){
 if(!editId)return;
 if(localSaveFailed)persistLocal();
 if(editRaw==='.'||/^\d+\.$/.test(editRaw||'')){toast('数量还没写完');return false;}
 const now=orderValue(editId,editField);
 if(now!==editSnap){const p=product(editId);showUndo({where:'order',id:editId,field:editField,value:editSnap,label:labelFor(p,editField,now)});}
 editId=null;editSnap=null;editRaw=null;return true;
}
function stepQty(delta){
 if(editField!=='qty')return;
 const cur=editRaw&&!/[.]$/.test(editRaw)?editRaw:qtyOf(editId);
 if(cur&&!Flow.numericFragment(cur)){toast('这格是文字。要加减请先改成数字，或点本次不订。');return;}
 const n=cur===''?0:Number(cur);
 const next=Math.round((n+delta)*1000)/1000;
 if(next<=0){cancelLine(editId);return;}
 editRaw=String(next);applyQty(editId,editRaw);render();scrollActive();
}
function typeOrderKey(key){
 let next=editRaw||'';
 if(!Flow.numericFragment(next)&&key!=='del')next=key==='.'?'0.':key;
 else if(key==='del')next=next.slice(0,-1);
 else if(key==='.'){if(next.includes('.'))return;next=next===''?'0.':next+'.';}
 else next=next+key;
 if(next.length>12)return;
 const parts=next.split('.');if(parts[1]&&parts[1].length>3)return;
 if(next==='0'&&editField==='qty'){applyQty(editId,'');editRaw='';toast('订货写 0 不算订，留空就是不订');render();return;}
 if(!order||next===''||(next!=='.'&&!/^\d+\.$/.test(next)))applyOrderValue(editId,editField,next);
 editRaw=next;
 render();scrollActive();
}
function cancelLine(id){
 const cur=qtyOf(id);
 if(cur)heldPrev[id]=cur;
 applyQty(id,'');
 showUndo({where:'order',id,value:cur,label:`${Flow.largeName(product(id))} 改为不订`});
 // Keep the original order keypad visible so its Undo remains reachable.
 editId=id;editField='qty';editRaw='';editSnap='';keypad=true;textMode=false;render();
}
function restoreLine(id){applyQty(id,heldPrev[id]||'1');delete heldPrev[id];render();}
function warnings(){
 return catalog().filter(p=>{
  const qty=qtyOf(p.id);if(!qty)return false;
  if(!S.typoRisk(qty,p.referenceOrder))return false;
  const bag=order?ack:draft?.ackWrong||{};
  return bag[p.id]!==qty;
 });
}
function bossChanges(){
 if(!yellowOn||!order||!isOwner())return [];
 if(!history.length)return [];
 const latest=history[0];
 if(latest.updatedByName!=='老板娘'||!history[1])return [];
 const key=`ccx-redesign-yellow:${order.id}:${latest.revision}`;
 if(localStorage.getItem(key))return [];
 return C.changes(catalog(),history[1].quantities,latest.quantities,latest.units||order.units,history[1].units||order.units);
}
function changeNote(c){
 if(!c.before&&!c.after)return `老板娘：订货单位 ${c.beforeUnit||'未选'} → ${c.unit||'未选'}`;
 if(!c.before&&c.after)return '老板娘：新加';
 if(c.before&&!c.after)return '老板娘：取消';
 return `老板娘：${C.textQuantity(c.before)||'不订'}${c.beforeUnit||''} → ${C.textQuantity(c.after)||'不订'}${c.unit||''}`;
}
function stockLine(p){
 if(!p.hasStock)return '';
 const text=order?String(stocks[p.id]??''):stockShown(p);
 const unit=order?JSON.parse(order.snapshot).items[p.id]?.stockUnit:draft?.items[p.id]?.stockUnit;
 return String(text).trim()?`库存 ${text}${unit||''}`:'库存没填';
}
function detailLine(p,note){
 const parts=[];
 const small=Flow.smallName(p);
 if(small)parts.push(small);
 const stock=stockLine(p);
 if(stock)parts.push(stock);
 if(note)parts.push(note);
 return parts.join(' · ');
}
function orderedCount(cat){return catalog().filter(p=>p.cat===cat&&Flow.showsOnOrder(qtyOf(p.id))&&Flow.isNumericQty(String(qtyOf(p.id)))).length;}
function shareUrl(){
 const url=new URL(location.href);url.hash='';url.search='';
 if(sample){url.searchParams.set('sample','order');}
 else if(order){url.searchParams.set('order',order.id);guardTest(order.id);}
 return url.href;
}
async function shareOrCopy(text){
 if(navigator.share){try{await navigator.share({text});return;}catch(e){if(e.name==='AbortError')return;}}
 await copyOnly(text);
}
function rowsOf(cat){
 const changes=new Map(bossChanges().map(c=>[c.id,c]));
 const list=catalog().filter(p=>p.cat===cat);
 const active=[],gray=[];
 for(const p of list){
  const qty=qtyOf(p.id);const changed=changes.get(p.id);
  const typing=editId===p.id;
  if(yellowOnly&&!changed&&!typing)continue;
  if(Flow.showsOnOrder(qty)||typing)active.push(p);
  else if(heldPrev[p.id]||(changed&&!changed.after))gray.push(p);
 }
 return {active,gray,changes};
}

function keysHtml(){
 const row=a=>a.map(k=>`<button type="button" data-act="key" data-key="${k}">${k==='del'?'删':k}</button>`).join('');
 return `<div class="keys">${row(['1','2','3'])}${row(['4','5','6'])}${row(['7','8','9'])}${row(['.','0','del'])}</div>`;
}
function undoHtml(){return undo?`<div class="undo"><span>${E(undo.label)} ·</span><button type="button" data-act="undo">撤销</button></div>`:'';}
function padBar(){return `<div class="padbar"><button type="button" data-act="mode" data-mode="text">文字</button><button class="fold" type="button" data-act="close">⌄ 收起</button></div>`;}
function textBar(){return textMode?`<div class="textbar"><button type="button" data-act="mode" data-mode="num">123</button><span>点完成保存并到下一格</span><button class="fold" type="button" data-act="close">⌄ 收起</button></div>`:'';}
function endNote(where){
 if(!moduleEnd||!draft)return '';
 if(where==='pad'&&(!keypad||textMode))return '';
 if(where==='list'&&keypad&&!textMode)return '';
 const cat=draft.catalog[pos]?.cat||viewCat;
 return `<button class="endgo" type="button" data-act="endgo">${E(Flow.endLabel(cat))}</button>`;
}
function countPad(){
 return `<div class="pad">${padBar()}${undoHtml()}${endNote('pad')}${keysHtml()}<button class="go" type="button" data-act="next">下一格</button></div>`;
}
function orderPad(){
 const step=editField==='qty'?'<div class="step"><button type="button" data-act="minus">−1</button><button type="button" data-act="plus">+1</button><button type="button" data-act="zero">本次不订</button></div>':'';
 return `<div class="pad">${padBar()}${undoHtml()}${step}${keysHtml()}<button class="go" type="button" data-act="order-next">下一格</button></div>`;
}
function scrollActive(){
 const row=document.querySelector('.line.on, .order.on');if(!row)return;
 const anchor=document.querySelector('.bar')||document.querySelector('.textbar')||document.querySelector('.banner');
 const topLimit=anchor.getBoundingClientRect().bottom+6;
 if(textMode){
  const vv=window.visualViewport;
  const visibleBottom=(vv?vv.offsetTop+vv.height:innerHeight)-12;
  const r=row.getBoundingClientRect();
  if(r.top>topLimit+2)window.scrollBy(0,r.top-topLimit);
  const r2=row.getBoundingClientRect();
  if(r2.bottom>visibleBottom)window.scrollBy(0,r2.bottom-visibleBottom);
  const r3=row.getBoundingClientRect();
  if(r3.top<topLimit)window.scrollBy(0,r3.top-topLimit);
  return;
 }
 const pad=document.querySelector('.pad');
 const bottomLimit=pad?pad.getBoundingClientRect().top-8:innerHeight-70;
 const r=row.getBoundingClientRect();
 if(r.bottom>bottomLimit)window.scrollBy(0,r.bottom-bottomLimit);
 const r2=row.getBoundingClientRect();
 if(r2.top<topLimit)window.scrollBy(0,r2.top-topLimit);
}

// Native search keyboard uses the visual viewport; never replace/focus the input
// here, so Chinese/Korean composition and the caret survive result updates.
function scrollSearch(){
 requestAnimationFrame(()=>{
  const find=document.getElementById('find');
  if(!find||document.activeElement!==find)return;
  const search=document.querySelector('.search');if(!search)return;
  const vv=window.visualViewport;
  const visibleTop=vv?vv.offsetTop:0;
  const visibleBottom=visibleTop+(vv?vv.height:innerHeight);
  const anchor=document.querySelector('.bar')||document.querySelector('.banner');
  const anchorBottom=anchor?anchor.getBoundingClientRect().bottom:visibleTop;
  const target=Math.max(visibleTop,Math.min(anchorBottom,visibleBottom-160))+8;
  const delta=search.getBoundingClientRect().top-target;
  if(Math.abs(delta)>2)window.scrollBy(0,delta);
 });
}

function blurFind(){
 const find=document.getElementById('find');
 if(find&&document.activeElement===find)find.blur();
}
function skipAct(){skipActUntil=Date.now()+450;}
function actSkipped(){return Date.now()<skipActUntil;}
function searchBar(placeholder){
 return `<div class="search${query?' hasq':''}"><div class="findwrap"><input class="find" id="find" placeholder="${placeholder}" value="${E(query)}" enterkeyhint="search" autocomplete="off" autocapitalize="off" autocorrect="off"><button class="clear" type="button" data-act="clear-find" aria-label="清空" tabindex="-1">✕</button></div><button class="cancel" type="button" data-act="cancel-find">${screen==='order'?'返回订单':'取消'}</button></div>`;
}
function rememberSearchOrigin(){
 if(searchCat==null)searchCat=screen==='order'?orderCat:viewCat;
 if(searchScroll==null)searchScroll=window.scrollY;
}
function followSearchCat(){
 if(screen!=='count'||!draft||!query)return;
 const next=Flow.searchCatChoice(Flow.searchHitCounts(draft.catalog,p=>S.matches(p,query,aliasesOf(p))),viewCat);
 if(next===viewCat)return;
 if(keypad||textMode){
  if(textMode)readPlain();
  leaveCountCell();
  keypad=false;textMode=false;
  document.body.classList.remove('key-open','text-mode');
  document.querySelector('.pad')?.remove();
 }
 viewCat=next;moduleEnd=false;
}
function syncCatButtons(){
 const box=document.querySelector('.bar .cats');
 if(box&&screen==='count')box.innerHTML=catButtonsHtml();
}
function paintRows(){
 if(screen==='count')followSearchCat();
 const box=document.getElementById('rows');
 if(box)box.innerHTML=screen==='count'?countRows():(query?searchHits():orderPane());
 if(screen==='count')syncCatButtons();
 const wrap=document.querySelector('.search');
 if(wrap)wrap.classList.toggle('hasq',!!query);
 scrollSearch();
}
function clearFind(){
 if(textMode&&readPlain()===false)return;
 if(screen==='order'&&commitOrderEdit()===false)return;
 if(screen==='count')leaveCountCell();
 keypad=false;textMode=false;
 query='';
 render();
 const find=document.getElementById('find');
 wantFind=true;
 if(find)find.focus({preventScroll:true});
}
function cancelFind(){
 const y=searchScroll;
 const cat=searchCat;
 if(textMode&&readPlain()===false)return;
 if(screen==='order'&&commitOrderEdit()===false)return;
 searchScroll=null;searchCat=null;query='';wantFind=false;
 if(screen==='count')leaveCountCell();
 keypad=false;textMode=false;editId=null;editSnap=null;editRaw=null;
 if(cat){if(screen==='order')orderCat=cat;else viewCat=cat;}
 blurFind();
 render();
 if(y!=null)requestAnimationFrame(()=>window.scrollTo(0,y));
}
function openFromRow(b){
 if(b.dataset.act==='open'){
  const id=b.dataset.id;
  const i=id&&draft?Flow.indexById(draft.catalog,id):Number(b.dataset.i);
  if(!(i>=0))return;
  openCount(i,b.dataset.field);
  return;
 }
 const id=b.dataset.id;
 if(b.dataset.search==='true'){openOrderKey(id,b.dataset.field||'qty');return;}
 const p=product(id);if(p)orderCat=p.cat;
 query='';searchScroll=null;searchCat=null;
 if(draft&&!order&&!Flow.showsOnOrder(qtyOf(id)))draft.added={...draft.added,[id]:true};
 openOrderKey(id);
}
function render(){
 document.body.classList.toggle('key-open',keypad&&!textMode);
 document.body.classList.toggle('text-mode',!!textMode);
 document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===screen));
 if(screen==='count')app.innerHTML=countHtml();
 else if(screen==='order')app.innerHTML=orderHtml();
 else app.innerHTML=moreHtml();
 if(textMode){
  const input=document.querySelector('input.plain');
  if(input){input.focus({preventScroll:true});const n=input.value.length;try{input.setSelectionRange(n,n);}catch(e){}}
 }
 if(keypad||textMode)scrollActive();
}
function countHtml(){
 if(!canCount())return `<div class="card"><h1>盘货由大伟来做</h1><p>你打开他发来的链接，直接改订单。库存可以看，不能改。</p><button class="primary" type="button" data-act="goto-order">去订单</button></div>`;
 try{ensureDraft();}catch(e){toast(e.message);}
 if(!draft)return `<div class="card">${backupStatusHtml()}<p>原内容仍保留。请下载备份后再处理，不要清除网站数据。</p></div>`;
 return `<div class="bar">${backupStatusHtml()}<div class="cats">${catButtonsHtml()}</div>${textBar()}<button class="gap ${allSeen()?'primary':''}" type="button" data-act="next-gap">${allSeen()?'看订单':'下一个没盘的'}</button></div>${searchBar('搜中文、韩文，或开头辅音')}<div id="rows">${countRows()}</div>${keypad&&!textMode?countPad():''}`;
}
function catButtonsHtml(){
 const counts=query&&draft?Flow.searchHitCounts(draft.catalog,p=>S.matches(p,query,aliasesOf(p))):null;
 return CATS.map(([cat,short])=>{
  const n=counts&&cat!==viewCat?(counts[cat]||0):0;
  return `<button type="button" data-act="jumpcat" data-cat="${cat}" class="${viewCat===cat?'on':''}">${short} ${seenIn(cat)}/${totalIn(cat)}${n?`<small class="found">搜到${n}</small>`:''}</button>`;
 }).join('');
}
function countCell(p,i,which){
 const on=keypad&&pos===i&&field===which;
 const caret=on&&!textMode?'<i class="caret" aria-hidden="true"></i>':'';
 const inner=on&&textMode?`<input class="plain" value="${E(cellRaw(p,which))}" enterkeyhint="done" maxlength="40" autocomplete="off" autocapitalize="off">`:`<b>${E(cellText(p,which))}${caret}</b>`;
 const cell=`<div class="cell ${on?'on':''}" data-act="open" data-id="${E(p.id)}" data-i="${i}" data-field="${which}" role="button" aria-label="${E(cellLabel(p,which))}">${inner}</div>`;
 return C.units.choices[p.id]?`<div class="search-cell">${cell}${unitPicker(p,which)}</div>`:cell;
}
function countRows(){
 let html='',n=0;
 const shown=Flow.visibleCountIndexes(draft.catalog,viewCat,p=>S.matches(p,query,aliasesOf(p)),keypad?pos:-1);
 for(const i of shown){
  const p=draft.catalog[i];
  n++;
  const on=keypad&&pos===i;
  const hint=p.name==='고수'?'<p class="warn">香菜：再看一次冰箱。</p>':String(p.name).startsWith('감자수제비')?'<p class="warn">土豆面片按大包记，1大包＝2小包。</p>':'';
  const fields=Flow.countFields(p);
  html+=`<div class="line ${fields.includes('stock')?'':'nostock'} ${Flow.stripe(n-1)} ${on?'on':''} ${seen(p.id)?'seen':''}" data-row="${i}"><button class="who" type="button" data-act="open" data-id="${E(p.id)}" data-i="${i}">${Flow.countTitleHtml({...p,unit:draft.items[p.id].unit||(C.units.choices[p.id]?'请选择订货单位':p.unit)},E)}</button>${fields.includes('stock')?countCell(p,i,'stock'):''}${countCell(p,i,'qty')}</div>${hint}`;
 }
 if(!n) html='<p class="muted">没有匹配的商品。</p>';
 return html+endNote('list');
}
function orderHtml(){
 return exportPanel()+orderContentHtml();
}
function orderContentHtml(){
 const link=new URLSearchParams(location.search).get('order');
 if(link&&!order&&!sample)return `<div class="card"><h1>登录后看这份订单</h1><p>${E(status)}</p><button class="primary" type="button" data-act="tab" data-tab="more">去登录</button></div>`;
 if(member?.role==='editor'&&!order&&!sample)return '<div class="card"><h1>还没有打开已提交订单</h1><p>请到“更多 → 查订单”查看最新订单，或按日期查找。</p></div>';
 if(!order&&!draft)return `<div class="card"><h1>还没有打开订单</h1><p>${canCount()?'先在盘货里过一遍。':'请用大伟发来的链接打开。'}</p></div>`;
 if(!order&&draft)return draftOrderHtml();
 const head=sample?'样例 · 不会写入云端':`${E(order.date)} · ${order.orderStage==='finalized'?'已定稿 · 由老板娘自行发送':'待老板娘审核'} · ${E(order.updatedByName||'')} · 第 ${order.revision} 版`;
 return orderShell(head,dockHtml());
}
function draftOrderHtml(){
 if(draft.status==='reviewed')return `<div class="card"><h2>${E(draft.date)} · 云端订单尚未打开</h2><p>这份盘货已完成本机复核，当前尚未读到对应的云端订单。请打开云端订单后修改数量；本机记录仍保留。</p><p>${E(status)}</p><button class="primary" data-act="resume-order">打开这次盘货的云端订单</button><p>如果上次提交失败，可重试提交同一份盘货，不会用本机旧数量覆盖已有云端订单。</p><button class="ghost" data-act="confirm">重试提交</button></div>`;
 const head=`${E(draft.date)} · 盘货中 · 提交后老板娘才能查看`;
 const dock=canCount()?'<div class="dock"><button class="primary" type="button" data-act="confirm">确认并分享给老板娘</button></div>':'';
 return orderShell(head,dock);
}
function yellowBanner(){
 const changes=bossChanges();if(!changes.length)return '';
 return `<div class="alert"><strong>老板娘改了 ${changes.length} 样</strong><div class="pair"><button class="ghost" type="button" data-act="yellow-only">${yellowOnly?'看全部':'只看她改的'}</button><button class="ghost" type="button" data-act="yellow-ok">知道了</button></div></div>`;
}
function orderCats(){
 const warn=warnings(),changes=bossChanges();
 return `<div class="cats">${CATS.map(([cat,short])=>{
  const n=catalog().filter(p=>p.cat===cat&&Flow.showsOnOrder(qtyOf(p.id))).length;
  const red=warn.some(p=>p.cat===cat);
  const yellow=changes.some(c=>product(c.id)?.cat===cat);
  return `<button type="button" data-act="ordercat" data-cat="${cat}" class="${orderCat===cat?'on':''}">${short} ${n}样${red?'<i class="mark red"></i>':''}${yellow?'<i class="mark yellow"></i>':''}</button>`;
 }).join('')}</div>`;
}
function orderShell(head,dock){
 return `${textBar()}<div class="bar">${backupStatusHtml()}${yellowBanner()}${orderCats()}</div><p class="muted">${head}</p>${searchBar('搜全部129种，用来补订或看库存')}<div id="rows">${query?searchHits():orderPane()}</div>${keypad&&editId&&!textMode?orderPad():''}${dock}`;
}
function orderPane(){
 const mine=warnings().filter(p=>p.cat===orderCat);
 return `${warnHtml(mine)}${blockHtml(orderCat)}`;
}
function showOrderCat(cat){
 if(!cat)return;
 if(textMode&&readPlain()===false)return;
 if(commitOrderEdit()===false)return;
 keypad=false;textMode=false;query='';searchScroll=null;
 if(cat===orderCat){render();return;}
 orderScroll[orderCat]=window.scrollY;
 orderCat=cat;
 render();
 const y=orderScroll[cat]||0;
 requestAnimationFrame(()=>window.scrollTo(0,y));
}
function warnHtml(list){
 if(!list.length)return '';
  const rows=list.slice(0,8).map((p,i)=>`<div class="warnrow ${Flow.stripe(i)}"><button class="ghost" type="button" data-act="warn" data-id="${E(p.id)}">${E(p.name)}：订 ${E(qtyOf(p.id))}，上次订 ${E(p.referenceOrder)}</button><button class="ghost" type="button" data-act="ack" data-id="${E(p.id)}">没问题</button></div>`).join('');
  return `<div class="card"><strong>请核对数量</strong><p class="muted">跟上次差了大约十倍，或是多写了一个 0。这只是提醒按错。</p>${rows}</div>`;
}
function blockHtml(cat){
 const {active,gray,changes}=rowsOf(cat);
 const row=(p,i)=>{
  const c=changes.get(p.id);const dead=!Flow.showsOnOrder(qtyOf(p.id))&&editId!==p.id;
  const tags=[!dead&&order&&!(baseQty[p.id]>0)?'<span class="tag">新加</span>':'',!dead&&!order&&draft?.added?.[p.id]?'<span class="tag">新加</span>':''].join('');
  const shown=editId===p.id&&editRaw!=null?editRaw:qtyOf(p.id);
  const picking=editId===p.id&&!dead;
  const caret=picking&&!textMode?'<i class="caret" aria-hidden="true"></i>':'';
  const unit=E((order?order.units[p.id]:draft?.items[p.id]?.unit||p.unit)||'');
  const editor=order?.orderStage==='finalized'?`<span class="num">${E(shown)}${unit}</span>`:dead?`<button class="ghost" type="button" data-act="restore" data-id="${E(p.id)}">恢复</button>`:(picking&&textMode?`<input class="plain on" value="${E(shown)}" enterkeyhint="done" maxlength="40" autocomplete="off" autocapitalize="off">`:`<button class="num${picking?' on':''}" type="button" data-act="edit" data-id="${E(p.id)}">${picking?`<b>${E(shown)}${caret}</b>${unit}`:`${E(shown)}${unit}`}</button>`);
  return `<div class="order ${Flow.stripe(i)} ${c?'yellow':''} ${dead?'dead':''} ${editId===p.id?'on':''}" data-id="${E(p.id)}"><div>${Flow.boldName(p,E)} ${tags}<div class="muted">${E(detailLine(p,c?changeNote(c):''))}</div></div><div>${editor}${unitPicker(p,'qty')}</div></div>`;
 };
 const body=[...active,...gray].map(row).join('');
 const empty=yellowOnly?'这一块没有她改的。':'本分类暂无订货商品。';
 const exportDisabled=!!order&&!sample&&order.orderStage!=='finalized';
 const exportLabel=order&&!sample?'本类订货文字':'';
 const exportNote=sample?'样例内容，不是正式订单':order?(order.orderStage==='finalized'?'复制或分享前会核对云端版本；请自行在 KakaoTalk 发送。':'老板娘定稿后可复制订货文字。'):'盘货草稿预览，尚未提交或定稿。';
 return `<div class="card"><p class="muted">${exportNote}</p><div class="pair"><button class="ghost" type="button" data-act="copy" data-cat="${cat}" ${exportDisabled?'disabled':''}>复制${exportLabel}</button><button class="ghost" type="button" data-act="share" data-cat="${cat}" ${exportDisabled?'disabled':''}>分享${exportLabel}</button></div>${body||`<p class="muted">${empty}</p>`}</div>`;
}
function searchHits(){
 return catalog().filter(p=>S.matches(p,query,aliasesOf(p))).map((p,i)=>{
  const cat=CATS.find(c=>c[0]===p.cat);
  const stock=p.hasStock?searchInput(p,'stock'):'';
  const change=bossChanges().find(c=>c.id===p.id);
  const hint=p.name==='고수'?'香菜：再看一次冰箱。':String(p.name).startsWith('감자수제비')?'土豆面片按大包记，1大包＝2小包。':'';
  return `<div class="line search-hit ${p.hasStock?'':'nostock'} ${Flow.stripe(i)} ${change?'yellow':''} ${keypad&&editId===p.id?'on':''}" data-id="${E(p.id)}"><div class="who">${Flow.boldName(p,E)}<small>${E(cat?cat[2]:'')}${Flow.smallName(p)?' · '+E(Flow.smallName(p)):''}</small>${change?`<small>${E(changeNote(change))}</small>`:''}</div>${stock}${searchInput(p,'qty')}</div>${hint?`<p class="warn">${E(hint)}</p>`:''}`;
 }).join('')||'<p>没有匹配的商品。</p>';
}
function searchInput(p,which){
 const stock=which==='stock',label=stock?'库存':'订货';
 // Keep submitted inventory read-only, including for the owner in this preview.
 const readonly=order?.orderStage==='finalized'||stock&&!canEditStock(p);
 const on=keypad&&editId===p.id&&editField===which&&!readonly;
 const value=on?editRaw:(stock?stockShown(p):qtyOf(p.id));
 const unit=stock?((order?JSON.parse(order.snapshot).items[p.id]?.stockUnit:draft?.items[p.id]?.stockUnit)||''):((order?order.units[p.id]:draft?.items[p.id]?.unit||p.unit)||'');
 const inner=on&&textMode?`<input class="plain" aria-label="${E(p.name+' '+label)}" value="${E(value)}" enterkeyhint="done" maxlength="40" autocomplete="off" autocapitalize="off">`:`<b>${E(value)}${on?'<i class="caret" aria-hidden="true"></i>':''}</b>`;
 const attrs=readonly?'aria-disabled="true"':`data-act="edit" data-search="true" data-id="${E(p.id)}" data-field="${which}"`;
 return `<div class="search-cell"><small>${label}${readonly?' · 只读':''}</small><div class="cell ${on?'on':''}" ${attrs} role="button" ${readonly?'':'tabindex="0"'} aria-label="${E(p.name+' '+label)}">${inner}${unit?`<small>${E(unit)}</small>`:''}</div>${unitPicker(p,which)}</div>`;
}
function orderSaveMessage(){
 const n=orderSaveNotice;
 if(!n||!order||sample||n.id!==order.id||n.epoch!==sessionEpoch)return '';
 if(n.phase==='saved'&&dirtyCount())return '前一批修改已保存到云端；当前还有修改未保存。';
 return n.message;
}
function orderSaveHtml(){const message=orderSaveMessage();return message?`<p class="order-save-status" role="status" aria-live="polite">${E(message)}</p>`:'';}
function dockHtml(){
 if(!order)return '';
 if(order.orderStage==='finalized')return `<div class="dock"><p>已定稿，可按分类复制发送。</p>${member?.role==='editor'?'<button class="ghost" type="button" data-act="reopen">重新修改</button>':''}</div>`;
 const n=dirtyCount();
 const text=n?`有 ${n} 处改动，点这里保存`:'保存';
 return `<div class="dock">${orderSaveHtml()}${sample?'<p class="muted">样例不会写入云端</p>':''}<button class="primary" type="button" data-act="save" ${orderSaveNotice?.phase==='saving'&&orderSaveNotice.id===order.id&&orderSaveNotice.epoch===sessionEpoch?'disabled':''}>${text}</button>${!sample&&member?.role==='editor'?'<button class="ghost" type="button" data-act="finalize">确认定稿</button>':''}</div>`;
}
function dirtyCount(){
 if(!order||sample)return 0;
 return catalog().filter(p=>(order.quantities[p.id]||0)!==(baseQty[p.id]||0)||(order.units[p.id]||'')!==(baseUnits[p.id]??order.units[p.id]??'')||(isOwner()&&String(stocks[p.id]??'')!==String(stockBase[p.id]??''))).length;
}
function moreHtml(){
 const who=member?`<div class="card"><h1>账号 · ${E(member.name)}</h1><p class="muted">${member.role==='owner'?'盘货负责人':'订单编辑者'}</p></div>`:`<div class="card"><h1>登录</h1><p class="muted">填账号。大伟用 dawei，老板娘用 laobanniang。</p><form id="login"><label>账号<input name="account" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">登录</button></form></div>`;
 const accountTools=member?`<div class="card"><h2>修改密码</h2><form id="pass"><label>当前密码<input name="current" type="password" required></label><label>新密码<input name="next" type="password" required></label><label>再输入一次<input name="confirm" type="password" required></label><button class="ghost" type="submit">保存新密码</button></form><button class="ghost" type="button" data-act="logout">退出登录</button></div>`:'';
 const date=draft&&canCount()?`<div class="card"><h2>盘货日期</h2><label>日期<input id="countDate" type="date" value="${E(draft.date)}"></label><button class="ghost" type="button" data-act="set-date">用这个日期</button></div>`:'';
 const completed=draft?.status==='reviewed';
 const restart=draft&&canCount()&&!sample?toolButton(completed?'开始下一次盘货':'作废当前盘货','fresh',completed?'保留这份盘货的本机副本，开始一份空白盘货。不会删除已提交的云端订单。':'放弃当前未提交的盘货，重新填写。操作前会确认并保留本机副本；这不是删除云端订单。'):'';
 const legacy=PRODUCTION&&member?.role==='owner'?toolSection('legacy','旧版资料与入口',legacyImportHtml()):'';
 const backupDraft=canCount()&&draft?`<p>这部手机上的盘货：${E(draft.date)}${completed?'（已复核的本机记录）':'（尚未提交）'}</p>${toolButton('保存这份盘货备份','backup-export','下载这部手机上的盘货记录，包括库存和订货数量。请将文件保存到手机；它不一定等于老板娘修改后的云端订单。')}`:'';
 const backupOrder=order?`<p>当前打开的订单：${E(order.date)} · 第 ${order.revision} 版</p>${toolButton('保存这份订单备份','order-backup','下载当前打开的订单，包括尚未保存的修改。下载备份不会把修改上传云端。')}`:'';
 const restore=member?.role==='owner'?`<label>选择之前保存的备份文件<input type="file" id="restoreFile" accept=".json,application/json"></label>${toolButton('从备份文件恢复','restore-file','将文件恢复成一份单独的盘货，需重新核对后提交。先保留当前盘货副本，不覆盖已有云端订单。')}`:'';
 const backups=!sample?toolSection('backup','数据备份与恢复',backupDraft+backupOrder+restore+(!draft&&!order?'<p>打开盘货或订单后，可以保存备份。</p>':'')):'';
 const historyTools=toolSection('history','历史资料',`<p>这里只查看以前确认的记录，不代表当前库存。新版云端订单请用上方“查订单”。</p>${toolButton('查看基准存档','pane','查看最初确认的历史订单快照，仅供查证，不会替换当前盘货。','data-pane="archive"')}${toolButton('查看旧历史档案','pane','查看原来保留的历史记录，不会改变当前订单。','data-pane="history"')}${['archive','history'].includes(morePane)?morePaneHtml():''}${legacy}`);
 const account=member?toolSection('account','账号设置',accountTools):'';
 const home=toolSection('home','添加到手机桌面','<p>iPhone：用 Safari 打开，选择分享 → 添加到主屏幕。安卓：在浏览器菜单中选择添加到主屏幕或安装应用。名称是“천천향 盘货”。如果在聊天软件里打开，请先转到手机浏览器。</p>');
 return `${who}${date}${completed&&restart?'<div class="card">'+restart+'</div>':''}<div class="card"><h2>查订单</h2><div id="cloudList">${api&&!sample?entryHtml():'<p class="muted">'+(sample?'样例不查询云端订单。':'登录后可按日期查看已提交订单。')+'</p>'}</div><p class="muted">${E(status)}</p></div><div class="card">${toolButton('修改记录','pane','查看当前打开的订单由谁修改、改了哪些内容。','data-pane="log"')}</div>${morePane==='log'?morePaneHtml():''}${backups}${account}${historyTools}${!completed&&restart?toolSection('restart','作废与重新填写',restart):''}${home}${!PRODUCTION?toolSection('demo','测试样例','<button class="ghost" data-act="sample">看一张样例订单（不写入云端）</button>'):''}`;
}
document.body.addEventListener('toggle',e=>{if(e.target.dataset?.moreSection)moreSections[e.target.dataset.moreSection]=e.target.open;},true);

function morePaneHtml(){
 if(morePane==='archive')return `<div class="card"><h2>${E(source.date)} 存档</h2><p class="muted">只看已经确认的旧单。空白不是 0。</p><div class="hero" style="background-image:linear-gradient(#0008,#0004),url('../assets/storefront.jpg')"><img src="../redesign-preview/logo.jpg" alt="川川香门头LOGO"></div>${source.products.filter(p=>p.order).map(p=>`<p>${Flow.boldName(p,E)}${Flow.smallName(p)?` <small>${E(Flow.smallName(p))}</small>`:''} ${E(p.order)}${E(p.unit||'')}</p>`).join('')}</div>`;
 if(morePane==='history')return archives.length?archives.map(block=>`<div class="card"><h2>${E(block.date)}</h2>${block.products.filter(p=>p.order).map(p=>`<p>${Flow.boldName(p,E)}${Flow.smallName(p)?` <small>${E(Flow.smallName(p))}</small>`:''} ${E(p.order)}${E(p.unit||'')}</p>`).join('')||'<p>这一天没有订货数字。</p>'}</div>`).join(''):'<p>历史还在读取。</p>';
 if(morePane==='log')return `<div class="card"><h2>修改记录</h2>${order?C.historyHtml(catalog(),history.map((v,i)=>({...v,updatedByName:(v.updatedByName||'授权用户')+((v.orderStage||'pending')!==(history[i+1]?.orderStage||'pending')?(v.orderStage==='finalized'?' · 确认定稿':' · 重新修改'): '')})),isOwner()&&!sample&&order.orderStage!=='finalized').replaceAll('data-cloud="restore"','data-act="restore-rev"'):'<p>先打开一份订单。</p>'}</div>`;
 return '';
}
function rememberStocks(){
 const d=JSON.parse(order.snapshot);
 const notes=d.stockText||{};
 stocks=Object.fromEntries(d.catalog.map(p=>[p.id,String(notes[p.id]??d.items[p.id]?.stock??'')]));
 stockBase={...stocks};
}
function buildSample(kind){
 sample=true;demoRole=kind==='boss'?'editor':'owner';yellowOn=true;yellowOnly=false;heldPrev={};ack={};
 const d=Core().create(source,source.date,'count-sample-preview');
 d.seen={};d.ackWrong={};
 const pepper=d.catalog.find(p=>p.id==='cn:5');pepper.referenceOrder=3;
 const put=(id,qty)=>{Core().edit(d,id,'quantity',String(qty));Core().finish(d,id,false);d.seen[id]=true;};
 put('kr:7',10);put('cn:5',30);put('kr:54',1);put('cn:7',1);put('other:18',2);put('kr:9',3);
 for(const p of d.catalog)if(d.items[p.id].decision==='pending')Core().finish(d,p.id,true);
 d.status='reviewed';
 const units=Object.fromEntries(d.catalog.map(p=>[p.id,d.items[p.id].unit||'']));
 const now=Object.fromEntries(d.catalog.map(p=>[p.id,d.items[p.id].decision==='order'?Math.round(Number(d.items[p.id].quantity)*1000):0]));
 const prev={...now};
 if(kind==='yellow'){prev['kr:7']=1000;prev['kr:9']=3000;now['kr:9']=0;prev['cn:9']=0;now['cn:9']=1000;units['cn:9']=units['cn:9']||'箱';}
 order={id:'test-count-sample',date:source.date,revision:kind==='yellow'?2:1,quantities:now,units,snapshot:JSON.stringify(d),updatedByName:kind==='yellow'?'老板娘':'大伟',schema:'ccx-cloud-1'};
 baseQty={...now};baseUnits={...units};
 if(kind!=='yellow'){baseQty['kr:26']=1000;heldPrev['kr:26']='1';}
 history=kind==='yellow'?[{revision:2,updatedByName:'老板娘',updatedAt:new Date().toISOString(),quantities:now,units},{revision:1,updatedByName:'大伟',updatedAt:new Date(Date.now()-3600000).toISOString(),quantities:prev,units}]:[{revision:1,updatedByName:'大伟',updatedAt:new Date().toISOString(),quantities:now,units}];
 rememberStocks();orderDirty=false;editId=null;keypad=false;textMode=false;orderCat='kr';screen='order';query='';
}

function blockText(cat){
 const rows=catalog().filter(p=>p.cat===cat&&Flow.showsOnOrder(qtyOf(p.id))).map(p=>({name:p.name,qty:String(qtyOf(p.id)),unit:(order?order.units[p.id]:draft?.items[p.id]?.unit||p.unit)||''}));
 const date=order?order.date:draft.date;
 return S.supplierText(date,rows)+(rows.length?'':'\n这次不订');
}
async function copyOnly(text,successMessage='已复制，可以贴到 KakaoTalk'){
 try{await navigator.clipboard.writeText(text);}catch(e){
  const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);
  try{ta.select();if(!document.execCommand('copy'))throw Error('复制失败，请重试；没有发送给供货商。');}
  finally{ta.remove();}
 }
 toast(successMessage);
}
async function supplierExport(cat,sharing=false){
 preparedExport=null;
 if(!CATS.some(([id])=>id===cat))throw Error('请选择商品分类');
 if(textMode&&readPlain()===false)return;
 if(editId&&commitOrderEdit()===false)return;
 if(order&&!sample){
  if(dirtyCount())throw Error('请先保存修改，再由老板娘确认定稿');
  if(order.orderStage!=='finalized')throw Error('请老板娘确认定稿后，再复制或分享给供货商');
  const current=order,epoch=sessionEpoch,quantities=JSON.stringify(order.quantities),units=JSON.stringify(order.units);
  const fresh=await api.read(current.id);
  if(epoch!==sessionEpoch||order!==current||JSON.stringify(order.quantities)!==quantities||JSON.stringify(order.units)!==units||editId)throw Error('页面内容已改变，请重新核对后再复制');
  if(fresh.revision!==current.revision||fresh.orderStage!=='finalized'||JSON.stringify(fresh.quantities)!==quantities||JSON.stringify(fresh.units)!==units)throw Error('云端订单已更新或重新修改，请刷新后核对并定稿；本次没有复制或分享');
  preparedExport={id:order.id,revision:order.revision,epoch:sessionEpoch,checkedAt:Date.now(),text:blockText(cat)};
  screen='order';render();window.scrollTo(0,0);toast('云端核对完成，请检查文字后再点复制或分享');return;
 }
 const text=blockText(cat);
 if(sharing)await shareOrCopy(text);else await copyOnly(text);
}
async function confirmShare(){
 if(textMode&&readPlain()===false)return;
 if(editId&&commitOrderEdit()===false)return;
 if(!canCount()){toast('请用大伟的账号');screen='more';render();return;}
 if(!member||member.role!=='owner'){toast('登录 dawei 后再发给老板娘');screen='more';render();return;}
 const gap=firstGap();
 if(gap>=0){toast('还有没盘的');screen='count';query='';viewCat=draft.catalog[gap].cat;openCount(gap,'stock');return;}
 const bad=Flow.textOrderIds(draft,Core().number);
 if(bad.length){
  const i=draft.catalog.findIndex(p=>p.id===bad[0]);
  const p=draft.catalog[i];
  toast(`${p.name} 的订货是文字。云端只能存数字，请改成数字，或留空表示不订。`);
  screen='count';viewCat=p.cat;openCount(i,'qty');return;
 }
 if(draft.status!=='reviewed'){
  Flow.parkTextStocks(draft,Core());
  for(const p of draft.catalog){
   const r=draft.items[p.id];
   if(r.decision==='order'){if(!String(r.unit||'').trim())throw Error(p.name+' 请先选择订货单位');Core().finish(draft,p.id,false);}
   else Core().finish(draft,p.id,true);
  }
  draft.status='reviewed';draft.reviewedAt=new Date().toISOString();persistLocal();
 }
 const payload=C.submission(draft,Core(),source);
 const cloudId=C.cloudOrderId(draft.id,MODE.test);guardTest(cloudId);
 const result=await api.create(cloudId,payload,'submit-'+cloudId);
 try{await openOrder(result.id);}catch(e){throw Error('订单已提交，但详情暂未打开：'+e.message+'。请从日期查询重新打开。');}
 if(!order||order.id!==result.id)return;
 const counts={kr:orderedCount('kr'),cn:orderedCount('cn'),other:orderedCount('other')};
 preparedExport={kind:'link',id:order.id,revision:order.revision,epoch:sessionEpoch,text:S.bossShareText(order.date,counts,shareUrl())};
 render();window.scrollTo(0,0);toast('订单已提交，请复制或分享上方链接给老板娘');
}
async function saveOrder(){
 if(textMode&&readPlain()===false)return;
 if(editId&&commitOrderEdit()===false)return;
 if(sample){toast('样例不会写入云端');return;}
 if(!api||!order){toast('请先登录');return;}
 if(!dirtyCount()){toast('没有要保存的改动');return;}
 const q={};for(const [id,v] of Object.entries(order.quantities))q[id]=v;
 C.checkQuantities(q,order.units,Object.keys(order.units));
 let patch;if(isOwner()&&C.stockChanged(order.snapshot,stocks))patch={snapshot:C.applyStock(order.snapshot,stocks)};
 const sentUnits={...order.units};patch={...patch,units:sentUnits};
 const current=order,epoch=sessionEpoch,client=api;
 orderSaveNotice={id:current.id,epoch,phase:'saving',message:'正在保存到云端…'};render();
 let data;
 try{data=await client.save(current.id,current,q,crypto.randomUUID(),patch);}
 catch(e){
  if(epoch===sessionEpoch&&order===current){
   const message=e.code==='ccx/conflict'?'云端订单已被修改，本次未保存，请先备份并核对。':'未能确认云端保存成功，请保留当前修改，联网后核对并重试。';
   orderSaveNotice={id:current.id,epoch,phase:'failed',message};render();
  }
  throw e;
 }
 if(epoch!==sessionEpoch||order!==current)return;
 const further=Object.keys(q).some(id=>current.quantities[id]!==q[id]||current.units[id]!==sentUnits[id]);
 if(further&&Object.keys(q).some(id=>data.quantities[id]!==q[id]||data.units[id]!==sentUnits[id])){
  const message='本次保存已完成，但云端随后又有更新；已保留你的后续输入，请核对云端版本';
  orderSaveNotice={id:current.id,epoch,phase:'changed',message};render();throw Error(message);
 }
 order=further?{...data,quantities:{...current.quantities},units:{...current.units}}:data;
 rememberStocks();baseQty={...data.quantities};baseUnits={...data.units};if(!further)heldPrev={};orderDirty=further;
 const at=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
 orderSaveNotice={id:data.id,epoch,phase:'saved',message:'已保存到云端 · '+at};
 const message=further?'前一批修改已保存；刚输入的内容还需保存':'已保存到云端';
 toast(message);render();
 try{const versions=await client.history(data.id);if(epoch!==sessionEpoch||order?.id!==data.id)return;history=versions;render();}
 catch(e){if(epoch===sessionEpoch&&order?.id===data.id)toast(message+'；修改记录暂未读到');}
}
async function resumeReviewedOrder(){
 if(sample||order||draft?.status!=='reviewed')return;
 screen='order';keypad=false;textMode=false;editId=null;editRaw=null;
 if(!api){status='请先登录并联网，再读取云端订单';render();return;}
 try{await openOrder(C.cloudOrderId(draft.id,MODE.test));}
 catch(e){status='云端订单暂未打开：'+(e.message||'读取失败');render();}
}
async function openOrder(id,fixed=false){
 guardTest(id);sample=false;demoRole=null;
 const epoch=sessionEpoch,previous=order,previousQty=JSON.stringify([order?.quantities,order?.units]),previousRaw=editRaw;
 const data=await api.read(id);if(epoch!==sessionEpoch)return;
 if(order!==previous||JSON.stringify([order?.quantities,order?.units])!==previousQty||editRaw!==previousRaw)throw Error('读取期间你又修改了内容，已保留当前输入。请保存后再打开。');
 orderSaveNotice=null;
 order=data;rememberStocks();baseQty={...data.quantities};baseUnits={...data.units};heldPrev={};ack={};orderDirty=false;history=[];screen='order';keypad=false;textMode=false;editId=null;editRaw=null;query='';
 const url=new URL(location.href);if(fixed)url.searchParams.delete('order');else url.searchParams.set('order',id);url.searchParams.delete('sample');historyReplace(url);
 render();
 try{const versions=await api.history(id);if(epoch!==sessionEpoch||order?.id!==id)return;history=versions;}catch(e){toast('修改记录没读到');}
 render();
}
function historyReplace(url){window.history.replaceState(null,'',url.pathname+url.search);}
async function changeOrderStage(stage){
 if(sample||!api||!order||member?.role!=='editor')throw Error('请由老板娘确认订单');
 if(textMode&&readPlain()===false)return;
 if(editId&&commitOrderEdit()===false)return;
 if(dirtyCount())throw Error('请先保存修改，再确认定稿');
 if(!confirm(stage==='finalized'?'确认这份订单已经检查完毕？定稿后可按分类复制，发送给供货商。':'重新修改后需要再次定稿；如果已发给供货商，请另行通知对方变更。继续吗？'))return;
 const current=order,epoch=sessionEpoch,client=api;
 const data=await client.finalize(current.id,current,crypto.randomUUID(),stage);
 if(epoch!==sessionEpoch||order!==current)return;
 order=data;keypad=false;textMode=false;editId=null;render();
 toast(stage==='finalized'?'已定稿，尚未代你发送给供货商':'已恢复为待审核');
 try{const versions=await client.history(data.id);if(epoch!==sessionEpoch||order?.id!==data.id)return;history=versions;render();}catch(e){if(epoch===sessionEpoch&&order?.id===data.id)toast('状态已保存，修改记录暂未读到');}
}
function readPlain(){
 const input=document.querySelector('input.plain');if(!input)return true;
 const value=input.value.slice(0,40).trim();
 if(screen==='order'&&editId){
  try{
   if(value==='.'||/^\d+\.$/.test(value))throw Error('数量还没写完');
   if(value==='0'&&editField==='qty'){applyQty(editId,'');editRaw='';toast('订货写 0 不算订，留空就是不订');}
   else{applyOrderValue(editId,editField,value);editRaw=value;}
  }catch(e){toast(e.message);return false;}
  return true;
 }
 if(draft&&keypad){
  if(field==='qty'&&value==='0'){writeCell('');toast('订货写 0 不算订，留空就是不订');}
  else writeCell(value);
 }
 return true;
}
function closePad(){
 if(readPlain()===false)return false;
 if(screen==='count')leaveCountCell();
 else if(commitOrderEdit()===false)return false;
 keypad=false;textMode=false;render();
 return true;
}
function advanceOrder(){
 if(textMode&&readPlain()===false)return;
 if(query){
  const id=editId,which=editField;
  const list=catalog().filter(p=>S.matches(p,query,aliasesOf(p)));
  const at=list.findIndex(p=>p.id===id);
  if(commitOrderEdit()===false)return;
  textMode=false;
  if(which==='stock'){openOrderKey(id,'qty');return;}
  const next=list[at+1];
  if(next)openOrderKey(next.id,canEditStock(next)?'stock':'qty');
  else{keypad=false;render();}
  return;
 }
 const ids=[...document.querySelectorAll('.order')].filter(row=>row.querySelector('.num, input.plain')).map(row=>row.dataset.id);
 const at=ids.indexOf(editId);
 if(commitOrderEdit()===false){textMode=false;keypad=true;render();return;}
 textMode=false;
 if(ids[at+1])openOrderKey(ids[at+1]);
 else{keypad=false;render();}
}
function startFreshCount(){
 if(!canCount()||sample)throw Error('请由大伟操作正式盘货');
 if(dirtyCount())throw Error('请先保存当前订单的修改，再开始盘货');
 if(!confirm(draft?.status==='reviewed'?'保留当前盘货副本，并开始下一次空白盘货？已有云端订单不会删除。':'确认作废当前未提交的盘货并重新填写？会先保留本机副本。'))return;
 if(localBlocked||localConflict)throw Error('请先下载备份并重新打开页面');
 if(localStorage.getItem(KEY)!==lastLocalRaw)throw Error('另一页面已修改盘货，请先备份并核对');
 if(draft)localStorage.setItem(KEY+':recovery:'+Date.now(),JSON.stringify({draft,pos,field}));
 const previous={draft,pos,field};
 try{draft=null;pos=0;field='stock';ensureDraft();}
 catch(e){draft=previous.draft;pos=previous.pos;field=previous.field;throw e;}
 order=null;preparedExport=null;orderSaveNotice=null;history=[];baseQty={};baseUnits={};heldPrev={};orderDirty=false;
 editId=null;editRaw=null;query='';viewCat='kr';moduleEnd=false;keypad=false;textMode=false;catScroll={kr:0,cn:0,other:0};
 flushCloud();screen='count';render();
}
function tryLeave(next){
 if(orderDirty&&next!=='order'&&!confirm('还有改动没保存，离开吗？'))return;
 if(readPlain()===false)return;
 if(screen==='count')leaveCountCell();
 else if(commitOrderEdit()===false)return;
 keypad=false;textMode=false;
 if(next!=='order')editId=null;
 screen=next;searchScroll=null;searchCat=null;if(next!=='count')query='';render();
 if(next==='more'&&api)loadList();
}

document.body.addEventListener('click',async e=>{
 if(releaseLocked)return;
 if(!e.target.closest('.action-help'))document.querySelectorAll('.action-help[open]').forEach(el=>{el.open=false;});
 if(e.target.closest('input.plain,select[data-unit]'))return;
 const b=e.target.closest('[data-act]');
 if(!b){if((keypad||textMode)&&!e.target.closest('.pad')&&!e.target.closest('input,button,a,label'))closePad();return;}
 if(busy||b.disabled)return;
 const act=b.dataset.act;
 try{
  if(act==='backup-export'){backupRecovery();return;}
  if(act==='legacy-import'){busy=true;await importLegacy();return;}
  if(act==='order-backup'){downloadOrderBackup();return;}
  if(act==='restore-file'){busy=true;await restoreBackupFile(document.getElementById('restoreFile')?.files?.[0]);return;}
  if(act==='export-close'){preparedExport=null;render();return;}
  if(act==='export-copy'||act==='export-share'){await deliverPrepared(act==='export-share');return;}
  if(act==='fixed-link'){await copyOnly(fixedEntryUrl(),'已复制');return;}
  if(act==='find-date'){const date=document.getElementById('orderDate')?.value;if(!date){toast('请先选择日期');return;}await findOrders(date);return;}
  if(act==='all-orders'){const input=document.getElementById('orderDate');if(input)input.value='';await findOrders();return;}
  if(act==='older-orders'){await findOrders(directoryDate,true);return;}
  if(act==='latest-order'){if(dirtyCount()||editId){toast('请先保存当前修改并收起键盘，再打开最新订单');return;}busy=true;const latest=await checkLatest();if(dirtyCount()||editId){toast('已保留刚才的输入，请保存后再打开');return;}if(latest)await openOrder(latest.id,true);return;}
  if(act==='backup-retry'){if(localBlocked||localConflict){toast('请先下载备份，再重新打开页面读取已保存版本');return;}saveLocalEnvelope();cloudReady=false;await pullDraft();return;}
  if(act==='backup-remote'){if(!confirm('将先保留一份本机恢复副本，再读取云端草稿。继续吗？'))return;await pullDraft(true);return;}
  if(act==='backup-local'){if(!confirm('将先在这部手机保留云端草稿副本，再用本机这份内容备份。继续吗？'))return;await pullDraft(false,true);await flushCloud();return;}
  if(act==='tab'){tryLeave(b.dataset.tab);if(screen==='order'){busy=true;await resumeReviewedOrder();}return;}
  if(actSkipped()&&(act==='open'||act==='edit'||act==='clear-find'||act==='cancel-find'))return;
  if(act==='open'||act==='edit'){openFromRow(b);return;}
  if(act==='clear-find'){clearFind();return;}
  if(act==='cancel-find'){cancelFind();return;}
  if(act==='key'){if(screen==='order'&&editId){typeOrderKey(b.dataset.key);return;}typeKey(b.dataset.key);return;}
  if(act==='next'){nextCell();return;}
  if(act==='close'){closePad();return;}
  if(act==='mode'){
   if(b.dataset.mode==='num'){if(readPlain()===false)return;textMode=false;keypad=true;render();scrollActive();}
   else{textMode=true;keypad=true;render();}
   return;
  }
  if(act==='endgo'){
   const step=Flow.advance(draft.catalog,pos);
   moduleEnd=false;keypad=false;textMode=false;
   if(step.nextCat)showCat(step.nextCat);else tryLeave('order');
   return;
  }
  if(act==='undo'){doUndo();return;}
  if(act==='jumpcat'){showCat(b.dataset.cat);return;}
  if(act==='ordercat'){showOrderCat(b.dataset.cat);return;}
  if(act==='next-gap'){if(allSeen()){tryLeave('order');return;}const i=firstGap();if(i<0)return;query='';const cat=draft.catalog[i].cat;if(cat!==viewCat){catScroll[viewCat]=window.scrollY;viewCat=cat;}moduleEnd=false;openCount(i,'stock');return;}
  if(act==='goto-order'){tryLeave('order');if(screen==='order'){busy=true;await resumeReviewedOrder();}return;}
  if(act==='minus'){stepQty(-1);return;}
  if(act==='plus'){stepQty(1);return;}
  if(act==='zero'){cancelLine(editId);return;}
  if(act==='order-next'){advanceOrder();return;}
  if(act==='restore'){restoreLine(b.dataset.id);return;}
  if(act==='warn'){query='';const p=product(b.dataset.id);if(p)orderCat=p.cat;openOrderKey(b.dataset.id);return;}
  if(act==='ack'){const id=b.dataset.id;const qty=qtyOf(id);if(order)ack[id]=qty;else{draft.ackWrong[id]=qty;persistLocal();}render();return;}
  if(act==='yellow-only'){yellowOnly=!yellowOnly;query='';render();return;}
  if(act==='yellow-ok'){yellowOn=false;yellowOnly=false;if(order)localStorage.setItem(`ccx-redesign-yellow:${order.id}:${history[0]?.revision||0}`,'1');render();return;}
  if(act==='copy'||act==='share'){busy=true;await supplierExport(b.dataset.cat,act==='share');return;}
  if(act==='finalize'||act==='reopen'){busy=true;await changeOrderStage(act==='finalize'?'finalized':'pending');return;}
  if(act==='resume-order'){busy=true;await resumeReviewedOrder();return;}
  if(act==='confirm'){busy=true;await confirmShare();return;}
  if(act==='save'){busy=true;await saveOrder();return;}
  if(act==='sample'){if(PRODUCTION)return;buildSample('order');render();return;}
  if(act==='pane'){morePane=morePane===b.dataset.pane?'':b.dataset.pane;render();return;}
  if(act==='fresh'){startFreshCount();return;}
  if(act==='set-date'){const v=document.getElementById('countDate').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)){toast('请选日期');return;}if(draft.status==='reviewed'){toast('已经提交，日期不能改');return;}draft.date=v;persistLocal();toast('日期已改');return;}
  if(act==='logout'){await signOut(auth);order=null;return;}
  if(act==='open-cloud'){if(textMode&&readPlain()===false)return;if(commitOrderEdit()===false)return;if(dirtyCount()&&!confirm('还有修改没保存，确定切换订单吗？'))return;busy=true;await openOrder(b.dataset.id);return;}
  if(act==='restore-rev'){if(order?.orderStage==='finalized')throw Error('订单已定稿，请老板娘先点重新修改');const v=history.find(x=>x.revision===Number(b.dataset.revision));if(!v)return;C.units.checkChange(order.units,v.units);order.quantities=C.clone(v.quantities);order.units=C.clone(v.units);orderDirty=true;morePane='';screen='order';render();toast('旧数量和订货单位已放回，还没保存');return;}
 }catch(err){toast(err.message||'没做成');}
 finally{busy=false;}
});
document.body.addEventListener('input',e=>{
 if(e.target.classList.contains('plain')){
  const value=e.target.value.slice(0,40);
  if(screen==='order'&&editId){
   editRaw=value;
   try{
    if(!order&&draft)applyOrderValue(editId,editField,editField==='qty'&&value.trim()==='0'?'':value);
    else if(order&&(!value.trim()||Flow.isNumericQty(value.trim())))applyOrderValue(editId,editField,value.trim());
   }catch(err){toast(err.message||'没有保存，请检查输入');}
   return;
  }
  writeCell(value);
  return;
 }
 if(e.target.id==='find'){rememberSearchOrigin();query=e.target.value;paintRows();}
});
document.body.addEventListener('keydown',e=>{
 if(e.key==='Escape'){document.querySelectorAll('.action-help[open]').forEach(el=>{el.open=false;});}
 if(!e.target.classList.contains('plain')&&(e.key==='Enter'||e.key===' ')){
  const cell=e.target.closest('[data-search="true"]');
  if(cell){e.preventDefault();openFromRow(cell);return;}
 }
 if(!e.target.classList.contains('plain')||e.key!=='Enter')return;
 e.preventDefault();
 if(readPlain()===false)return;
 textMode=false;
 if(screen==='count')nextCell();
 else advanceOrder();
});
document.body.addEventListener('pointerdown',e=>{
 rowTap=null;
 if(e.isPrimary===false||e.button>0)return;
 skipActUntil=0;
 if(e.target.closest('#find')){wantFind=true;rememberSearchOrigin();return;}
 wantFind=false;
 if(e.target.closest('[data-act="clear-find"]')){e.preventDefault();clearFind();skipAct();return;}
 if(e.target.closest('[data-act="cancel-find"]')){e.preventDefault();cancelFind();skipAct();return;}
 const find=document.getElementById('find');
 const row=e.target.closest('[data-act="open"],[data-act="edit"]');
 if(!row)return;
 rowTap={row,id:e.pointerId,x:e.clientX,y:e.clientY,moved:false,findFocused:!!find&&document.activeElement===find};
});
document.body.addEventListener('pointermove',e=>{
 if(!rowTap||rowTap.id!==e.pointerId)return;
 if(Math.hypot(e.clientX-rowTap.x,e.clientY-rowTap.y)>10)rowTap.moved=true;
},{passive:true});
document.body.addEventListener('pointercancel',()=>{if(rowTap)skipAct();rowTap=null;});
document.body.addEventListener('pointerup',e=>{
 const tap=rowTap;if(!tap||tap.id!==e.pointerId)return;rowTap=null;
 const moved=tap.moved||Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>10;
 if(moved||e.target.closest('[data-act="open"],[data-act="edit"]')!==tap.row){skipAct();return;}
 if(!tap.findFocused)return; // Normal click/keyboard activation remains native.
 e.preventDefault();skipAct();try{openFromRow(tap.row);}catch(err){toast(err.message||'没做成');}
});
document.body.addEventListener('focusin',e=>{
 if(e.target.id!=='find')return;
 rememberSearchOrigin();
 if(!(keypad||textMode)){wantFind=false;scrollSearch();return;}
 if(!wantFind){e.target.blur();return;}
 wantFind=false;
 const y=searchScroll;
 const cat=searchCat;
 setTimeout(()=>{try{if(closePad()===false){blurFind();render();return;}searchScroll=y;searchCat=cat;const f=document.getElementById('find');if(f)f.focus({preventScroll:true});}catch(err){blurFind();toast(err.message||'没有保存');}},0);
});
if(window.visualViewport)window.visualViewport.addEventListener('resize',()=>{if(textMode)scrollActive();else scrollSearch();});
document.body.addEventListener('submit',async e=>{
 if(e.target.id==='login'){e.preventDefault();const form=e.target;try{if(!auth)throw Error('云端尚未连接，请联网后刷新重试。本机草稿仍保留。');await signInWithEmailAndPassword(auth,A.accountEmail(form.elements.account.value),form.elements.password.value);}catch(err){toast(A.authErrorText(err.code,err.message)||err.message||'登录失败');}finally{form.elements.password.value='';}}
 if(e.target.id==='pass'){e.preventDefault();const form=e.target;const problem=A.passwordChangeError(form.elements.current.value,form.elements.next.value,form.elements.confirm.value);if(problem){toast(problem);return;}try{await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,form.elements.current.value));await updatePassword(user,form.elements.next.value);toast('密码已改');}catch(err){toast(A.authErrorText(err.code,err.message,'password')||err.message);}finally{form.reset();}}
});
window.addEventListener('beforeunload',e=>{if(localSaveFailed||orderDirty||editId&&editRaw!==orderValue(editId,editField)){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushCloud();});
window.addEventListener('pagehide',()=>flushCloud());
window.addEventListener('online',()=>{if(cloudPending)flushCloud();paintBackupStatus();});
window.addEventListener('offline',()=>{cloudPending=true;paintBackupStatus();});
window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue!==lastLocalRaw){localConflict=true;clearTimeout(cloudTimer);paintBackupStatus();}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&cloudPending)flushCloud();});

async function loadList(){
 const box=document.getElementById('cloudList');if(!box||!api)return;
 box.innerHTML=entryHtml();await findOrders(directoryDate);await checkLatest();
}
async function loadArchives(){
 try{const index=await (await fetch('../order-archives/index.json',{cache:'no-store'})).json();archives=[];for(const entry of index.entries||[]){const data=await (await fetch('../order-archives/'+entry.file,{cache:'no-store'})).json();archives.push({date:entry.date,products:(data.products||[]).map(p=>({name:p.name,alias:p.alias,order:p.order,unit:p.unit}))});}if(screen==='more'&&morePane==='history')render();}catch(e){archives=[];}
}
async function boot(){
 let cfg={enabled:false};
 try{
  const response=await fetch('./firebase-config.json',{cache:'no-store'});
  if(!response.ok)throw Error('云端配置请求失败');
  const parsed=await response.json();
  if(!parsed||typeof parsed!=='object'||typeof parsed.enabled!=='boolean')throw Error('云端配置格式错误');
  cfg=parsed;
 }catch(e){configFailed=true;}

 if(PRODUCTION&&!cfg.enabled){app.innerHTML='<div class="card"><h1>新版正式入口准备中</h1><p>尚未启用，不会读取或改写你的盘货数据。</p><a href="../">继续使用原入口</a></div>';document.querySelector('.tabs')?.setAttribute('hidden','');return;}
 releaseLocked=false;
 const [orderRes,aliasRes]=await Promise.all([fetch('../current-order.json',{cache:'no-store'}),fetch('../redesign-preview/aliases.json',{cache:'no-store'})]);
 source=await orderRes.json();
 const aliasFile=await aliasRes.json();
 aliasById=new Map(aliasFile.items.map(item=>[item.id,item.aliases]));
 if(!source.products||source.products.length!==129)throw Error('商品不是129种');
 loadLocal();loadArchives();
 const params=new URLSearchParams(location.search);
 const sampleKind=params.get('sample');
 if(sampleKind)buildSample(sampleKind==='boss'||sampleKind==='yellow'?sampleKind:'order');
 try{
  if(!cfg.enabled){status=configFailed?'云端配置加载失败，尚未连接云端。本机草稿仍可继续盘货或下载备份；联网后刷新重试。':'云端没打开。本机照样能盘货。';render();return;}
  const firebaseApp=initializeApp(cfg.firebase);auth=getAuth(firebaseApp);db=getFirestore(firebaseApp);
  onAuthStateChanged(auth,async u=>{
   sessionEpoch++;cloudReady=false;cloudConflict=false;clearTimeout(cloudTimer);
   latestRequest++;directoryRequest++;latestOrder=null;latestMessage='';directoryRecords=[];directoryCursor=null;directoryMore=false;directoryMessage='';
   if(u&&backupUid!==u.uid){cloudBase=undefined;cloudAt=null;backupUid=u.uid;}
   user=u;member=null;api=null;
   if(!u){status='还没登录。本机盘货可以用，云端备份要等大伟登录。';if(!sample)order=null;if(params.get('order')&&!sample){screen='order';status='登录后才能看这份订单。';}render();return;}
   try{
    const snap=await getDocFromServer(doc(db,'members',u.uid));
    const data=snap.exists()?snap.data():null;
    if(data&&data.active===true&&['owner','editor'].includes(data.role)&&data.name){
     member=data;api=store(db,u.uid,'orders',data.name);status=data.name+' 已登录';
     if(data.role==='owner')await pullDraft();
     const id=new URLSearchParams(location.search).get('order');
     if(id&&!sample)await openOrder(id);
     else if(data.role==='owner'&&!sample&&draft?.status==='reviewed'){await resumeReviewedOrder();}
     else if(data.role==='editor'&&!sample){
      screen='order';
      const latest=await checkLatest();
      if(latest)await openOrder(latest.id,true);
      else status=latestMessage;
     }
    }else status='登录了，但还不能看订单';
   }catch(err){status=err.message||'登录后没读到权限';}
   render();if(screen==='more')loadList();
  });
 }catch(e){status='云端没连上。本机照样能盘货。';}
 render();
}
boot().catch(e=>{app.textContent=e.message||'预览没打开';});
