import {initializeApp} from 'firebase/app';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,EmailAuthProvider,reauthenticateWithCredential,updatePassword} from 'firebase/auth';
import {getFirestore,doc,getDocFromServer,setDoc,serverTimestamp} from 'firebase/firestore';
import {store} from '../cloud/store.js';
import C from '../cloud/core.cjs';
import A from '../cloud/account.cjs';
import S from './search.cjs';

const Core=()=>window.CountCore;
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATS=[['kr','韩国','韩国食品'],['cn','中国','中国食品'],['other','其他','其他商品']];
const KEY='ccx-redesign-draft-v2';
const app=document.getElementById('app');
let source,aliasById=new Map(),draft,pos=0,field='stock',screen='count',keypad=false,entered=null;
let user=null,member=null,auth,db,api=null,order=null,baseQty={},stocks={},stockBase={},history=[];
let query='',status='正在准备…',sample=false,demoRole=null,busy=false,orderDirty=false,editId=null,editSnap=null,editRaw=null;
let undo=null,heldPrev={},ack={},yellowOn=true,yellowOnly=false,archives=[],cloudTimer=null,cloudPending=false,morePane='';

function toast(text){const t=document.getElementById('toast');t.textContent=text;t.style.display='block';clearTimeout(toast._t);toast._t=setTimeout(()=>{t.style.display='none';},2200);}
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());}
function uid(){return 'count-'+(crypto.randomUUID?crypto.randomUUID():Date.now());}
function isOwner(){if(demoRole)return demoRole==='owner';if(member)return member.role==='owner';return true;}
function canCount(){return isOwner();}
function showName(p){return p.alias&&p.alias!==p.name?p.alias:p.name;}
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
 draft.savedAt=Date.now();
 localStorage.setItem(KEY,JSON.stringify({draft,pos,field,savedAt:draft.savedAt}));
 scheduleCloud();
}
function loadLocal(){
 try{
  const raw=localStorage.getItem(KEY);
  if(!raw)return;
  const data=JSON.parse(raw);
  if(!Core().validate(data.draft,source))return;
  draft=data.draft;draft.seen=draft.seen||{};draft.ackWrong=draft.ackWrong||{};
  pos=Math.max(0,Math.min(data.pos||0,draft.catalog.length-1));
  field=data.field==='qty'?'qty':'stock';
 }catch(e){}
}
function scheduleCloud(){clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>flushCloud(),1500);}
async function flushCloud(){
 clearTimeout(cloudTimer);
 if(sample||!draft||!user||member?.role!=='owner'||!db)return;
 if(typeof navigator!=='undefined'&&navigator.onLine===false){cloudPending=true;return;}
 try{
  await setDoc(doc(db,'countDrafts',user.uid),{schema:'ccx-draft-1',date:draft.date,localId:draft.id,pos,field,body:JSON.stringify({draft,savedAt:draft.savedAt||Date.now()}),updatedAt:serverTimestamp()});
  cloudPending=false;
 }catch(e){cloudPending=true;}
}
async function pullDraft(){
 if(!user||member?.role!=='owner'||!db||sample)return;
 try{
  const snap=await getDocFromServer(doc(db,'countDrafts',user.uid));
  if(!snap.exists()){if(cloudPending)flushCloud();return;}
  const remote=JSON.parse(snap.data().body);
  if(!remote?.draft||!Core().validate(remote.draft,source)){toast('云端草稿对不上，仍用本机这份');return;}
  if(!draft||(remote.savedAt||0)>(draft.savedAt||0)){
   draft=remote.draft;draft.seen=draft.seen||{};draft.ackWrong=draft.ackWrong||{};
   pos=Math.max(0,Math.min(snap.data().pos||0,draft.catalog.length-1));
   field=snap.data().field==='qty'?'qty':'stock';
   localStorage.setItem(KEY,JSON.stringify({draft,pos,field,savedAt:draft.savedAt||remote.savedAt||0}));
   toast('已从云端恢复上次盘到的地方');
  }
 }catch(e){status='云端草稿没读到，本机这份还在';}
}
function ensureDraft(){
 if(draft||!canCount())return;
 draft=Core().create(source,today(),uid());
 draft.seen={};draft.ackWrong={};draft.savedAt=Date.now();
 pos=0;field='stock';persistLocal();
}
function guardTest(id){C.assertCloudOrderId(id,true);if(!String(id).startsWith('test-'))throw Error('预览不能打开正式订单');}

function lastStockText(p){if(!p.hasStock)return '无此项';if(p.referenceStock==null||p.referenceStock==='')return '没填';return String(p.referenceStock);}
function lastQtyText(p){return typeof p.referenceOrder==='number'&&p.referenceOrder>0?String(p.referenceOrder):'没订';}
function cellText(p,which){
 const r=draft.items[p.id];
 if(which==='stock'){if(!p.hasStock)return '无';return r.stock===''?'空':r.stock;}
 return r.quantity===''?'空':r.quantity;
}
function labelFor(p,which,now){
 const name=showName(p);
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
 if(draft.status==='reviewed'){toast('已经提交。要改数量，去今日订单');screen='order';keypad=false;render();return;}
 const prev=pos;
 if(!(keypad&&pos===i&&field===which))leaveCountCell();
 pos=i;
 const p=draft.catalog[i];
 field=which||(p.hasStock?'stock':'qty');
 if(field==='stock'&&!p.hasStock)field='qty';
 keypad=true;screen='count';captureEntered();persistLocal();
 if(prev!==pos)flushCloud();
 render();scrollActive();
}
function typeKey(key){
 if(!draft||draft.status==='reviewed')return;
 const p=draft.catalog[pos],r=draft.items[p.id];
 if(field==='stock'&&!p.hasStock){field='qty';captureEntered();render();return;}
 const cur=field==='stock'?r.stock:r.quantity;
 let next=cur;
 if(key==='del')next=cur.slice(0,-1);
 else if(key==='.'){if(cur.includes('.'))return;next=cur===''?'0.':cur+'.';}
 else next=cur+key;
 if(next.length>12)return;
 const parts=next.split('.');if(parts[1]&&parts[1].length>3)return;
 try{Core().edit(draft,p.id,field==='stock'?'stock':'quantity',next);}catch(e){toast(e.message);return;}
 if(next&&!next.endsWith('.'))markSeen(p.id);
 persistLocal();render();scrollActive();
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
 if(!finishTyping())return;
 if(field==='stock'){leaveCountCell();field='qty';captureEntered();persistLocal();render();scrollActive();return;}
 leaveCountCell();
 const prev=pos;markSeen(draft.catalog[pos].id);
 if(pos<draft.catalog.length-1){pos++;field=draft.catalog[pos].hasStock?'stock':'qty';}
 else toast('已经是最后一项');
 captureEntered();persistLocal();if(prev!==pos)flushCloud();render();scrollActive();
}
function sameAsLast(){
 const p=draft.catalog[pos];
 if(field!=='qty'){field='qty';captureEntered();}
 if(typeof p.referenceOrder==='number'&&p.referenceOrder>0){
  if(!String(p.unit||'').trim()){toast('这项单位还是空的，不能订');return;}
  Core().edit(draft,p.id,'quantity',String(p.referenceOrder));
 }else Core().edit(draft,p.id,'quantity','');
 markSeen(p.id);leaveCountCell();
 const prev=pos;
 if(pos<draft.catalog.length-1){pos++;field=draft.catalog[pos].hasStock?'stock':'qty';}
 captureEntered();persistLocal();if(prev!==pos)flushCloud();render();scrollActive();
}
function fillLast(i,which){
 if(draft?.status==='reviewed'){openCount(i,which);return;}
 openCount(i,which);
 const p=draft.catalog[i];
  if(which==='stock'){
  if(!p.hasStock){toast('这项不用填库存');return;}
  const v=p.referenceStock;
  if(typeof v==='number'||(typeof v==='string'&&/^\d+(?:\.\d{1,3})?$/.test(v.trim())))Core().edit(draft,p.id,'stock',String(v).trim());
  else{toast(v?'上次库存不是纯数字，请手填':'上次没填库存');return;}
 }else if(typeof p.referenceOrder==='number'&&p.referenceOrder>0){
  if(!String(p.unit||'').trim()){toast('这项单位还是空的，不能订');return;}
  Core().edit(draft,p.id,'quantity',String(p.referenceOrder));
 }else Core().edit(draft,p.id,'quantity','');
 markSeen(p.id);persistLocal();render();scrollActive();
}
function doUndo(){
 if(!undo)return;
 const info=undo;undo=null;
 if(info.where==='count'&&draft){
  try{Core().edit(draft,info.id,info.field==='stock'?'stock':'quantity',info.value);}catch(e){toast(e.message);return;}
  const i=draft.catalog.findIndex(p=>p.id===info.id);
  pos=i;field=info.field;keypad=true;screen='count';captureEntered();persistLocal();
 }else if(info.where==='order'){
  applyQty(info.id,info.value);
  editId=info.id;editSnap=info.value;editRaw=info.value;keypad=true;screen='order';
 }
 render();scrollActive();
}

function qtyOf(id){
 if(order)return C.textQuantity(order.quantities[id]||0);
 const r=draft?.items[id];
 return r&&r.decision==='order'?r.quantity:'';
}
function applyQty(id,text){
 const prev=qtyOf(id);
 if(!String(text||'').trim()){if(prev)heldPrev[id]=prev;}
 else delete heldPrev[id];
 if(order){
  if(!String(text||'').trim())order.quantities[id]=0;
  else{if(!String(order.units[id]||'').trim())throw Error('这项单位还是空的，不能订');order.quantities[id]=C.quantity(text);}
  if(!sample)orderDirty=true;
 }else if(draft){
  if(!String(text||'').trim())Core().edit(draft,id,'quantity','');
  else{const p=product(id);if(!String(p.unit||'').trim())throw Error('这项单位还是空的，不能订');Core().edit(draft,id,'quantity',text);}
  markSeen(id);persistLocal();
 }
}
function openOrderKey(id){
 if(editId&&editId!==id)commitOrderEdit();
 editId=id;editSnap=qtyOf(id);editRaw=editSnap;keypad=true;screen='order';render();scrollActive();
}
function commitOrderEdit(){
 if(!editId)return;
 if(editRaw==='.'||/^\d+\.$/.test(editRaw||'')){toast('数量还没写完');return false;}
 const now=qtyOf(editId);
 if(now!==editSnap){const p=product(editId);showUndo({where:'order',id:editId,value:editSnap,label:labelFor(p,'qty',now)});}
 editId=null;editSnap=null;editRaw=null;return true;
}
function stepQty(delta){
 const cur=editRaw&&!/[.]$/.test(editRaw)?editRaw:qtyOf(editId);
 const n=cur===''?0:Number(cur);
 const next=Math.round((n+delta)*1000)/1000;
 if(next<=0){cancelLine(editId);return;}
 editRaw=String(next);applyQty(editId,editRaw);render();scrollActive();
}
function typeOrderKey(key){
 let next=editRaw||'';
 if(key==='del')next=next.slice(0,-1);
 else if(key==='.'){if(next.includes('.'))return;next=next===''?'0.':next+'.';}
 else next=next+key;
 if(next.length>12)return;
 const parts=next.split('.');if(parts[1]&&parts[1].length>3)return;
 if(next==='0'){editRaw='';applyQty(editId,'');toast('订货写 0 不算订，留空就是不订');render();return;}
 editRaw=next;
 if(next==='')applyQty(editId,'');
 else if(next!=='.'&&!/^\d+\.$/.test(next))applyQty(editId,next);
 render();scrollActive();
}
function cancelLine(id){
 const cur=qtyOf(id);
 if(cur)heldPrev[id]=cur;
 applyQty(id,'');
 showUndo({where:'order',id,value:cur,label:`${showName(product(id))} 改为不订`});
 editId=null;editRaw=null;editSnap=null;keypad=false;render();
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
 return C.changes(catalog(),history[1].quantities,latest.quantities,latest.units||order.units);
}
function changeNote(c){
 if(!c.before&&c.after)return '老板娘：新加';
 if(c.before&&!c.after)return '老板娘：取消';
 return `老板娘：${C.textQuantity(c.before)||'不订'} → ${C.textQuantity(c.after)||'不订'}`;
}
function stockLine(p){
 if(!p.hasStock)return '这项没有库存';
 let text='';
 if(order){text=stocks[p.id]??'';}
 else if(draft)text=draft.items[p.id].stock;
 return String(text).trim()?`库存 ${text}`:'库存没填';
}
function orderedCount(cat){return catalog().filter(p=>p.cat===cat&&Number(qtyOf(p.id))>0).length;}
function shareUrl(){
 const url=new URL(location.href);url.hash='';url.search='';
 if(sample){url.searchParams.set('sample','order');}
 else if(order){url.searchParams.set('order',order.id);guardTest(order.id);}
 return url.href;
}
async function shareOrCopy(text){
 if(navigator.share){try{await navigator.share({text});return;}catch(e){if(e.name==='AbortError')return;}}
 try{await navigator.clipboard.writeText(text);}catch(e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}
 toast('已复制，可以贴到 KakaoTalk');
}
function rowsOf(cat){
 const changes=new Map(bossChanges().map(c=>[c.id,c]));
 const list=catalog().filter(p=>p.cat===cat&&S.matches(p,yellowOnly?'':query,aliasesOf(p)));
 const active=[],gray=[];
 for(const p of list){
  const qty=qtyOf(p.id);const changed=changes.get(p.id);
  if(yellowOnly&&!changed)continue;
  if(Number(qty)>0)active.push(p);
  else if(heldPrev[p.id]||(changed&&!changed.after))gray.push(p);
 }
 return {active,gray,changes};
}

function keysHtml(){
 const row=a=>a.map(k=>`<button type="button" data-act="key" data-key="${k}">${k==='del'?'删':k}</button>`).join('');
 return `<div class="keys">${row(['1','2','3'])}${row(['4','5','6'])}${row(['7','8','9'])}${row(['.','0','del'])}</div>`;
}
function undoHtml(){return undo?`<div class="undo"><span>${E(undo.label)} ·</span><button type="button" data-act="undo">撤销</button></div>`:'';}
function countPad(){
 const p=draft.catalog[pos];
 const same=field==='qty'?(typeof p.referenceOrder==='number'&&p.referenceOrder>0?`<button class="same" type="button" data-act="same">同上次 ${E(p.referenceOrder)}</button>`:`<button class="same" type="button" data-act="same">上次没订</button>`):'';
 return `<div class="pad">${undoHtml()}${same}${keysHtml()}<button class="go" type="button" data-act="next">下一格</button></div>`;
}
function orderPad(){
 return `<div class="pad">${undoHtml()}<div class="step"><button type="button" data-act="minus">−1</button><button type="button" data-act="plus">+1</button><button type="button" data-act="zero">本次不订</button></div>${keysHtml()}<button class="go" type="button" data-act="order-next">下一格</button></div>`;
}
function scrollActive(){
 const row=document.querySelector('.line.on, .order.on');
 const pad=document.querySelector('.pad');if(!row)return;
 const topLimit=(document.querySelector('.bar')||document.querySelector('.banner')).getBoundingClientRect().bottom+4;
 const bottomLimit=pad?pad.getBoundingClientRect().top-8:innerHeight-70;
 const r=row.getBoundingClientRect();
 if(r.bottom>bottomLimit)window.scrollBy(0,r.bottom-bottomLimit);
 const r2=row.getBoundingClientRect();
 if(r2.top<topLimit)window.scrollBy(0,r2.top-topLimit);
}

function render(){
 document.body.classList.toggle('key-open',keypad);
 document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===screen));
 if(screen==='count')app.innerHTML=countHtml();
 else if(screen==='order')app.innerHTML=orderHtml();
 else app.innerHTML=moreHtml();
 if(keypad)scrollActive();
}
function countHtml(){
 if(!canCount())return `<div class="card"><h1>盘货由大伟来做</h1><p>你打开他发来的链接，直接改今日订单。库存可以看，不能改。</p><button class="primary" type="button" data-act="goto-order">去今日订单</button></div>`;
 ensureDraft();
 const onCat=draft.catalog[pos]?.cat;
 return `<div class="bar"><div class="cats">${CATS.map(([cat,short])=>`<button type="button" data-act="jumpcat" data-cat="${cat}" class="${onCat===cat?'on':''}">${short} ${seenIn(cat)}/${totalIn(cat)}</button>`).join('')}</div><button class="gap ${allSeen()?'primary':''}" type="button" data-act="next-gap">${allSeen()?'看今日订单':'下一个没盘的'}</button></div><input class="find" id="find" placeholder="搜中文、韩文，或韩文开头辅音" value="${E(query)}"><div id="rows">${countRows()}</div>${keypad?countPad():''}`;
}
function countRows(){
 let html='',last='';
 draft.catalog.forEach((p,i)=>{
  if(!S.matches(p,query,aliasesOf(p)))return;
  if(p.cat!==last){html+=`<h2 id="cat-${p.cat}">${E(CATS.find(c=>c[0]===p.cat)[2])}</h2>`;last=p.cat;}
  const on=keypad&&pos===i;
  const other=p.alias&&p.alias!==p.name?p.name:'';
  const hint=p.name==='고수'?'<p class="warn">香菜：再看一次冰箱。</p>':String(p.name).startsWith('감자수제비')?'<p class="warn">土豆面片按大包记，1大包＝2小包。</p>':'';
  html+=`<div class="line ${on?'on':''} ${seen(p.id)?'seen':''}" data-row="${i}"><button class="who" type="button" data-act="open" data-i="${i}"><b><i class="dot"></i>${E(showName(p))}</b><small>${E(other?other+' · ':'')}${E(p.unit||'单位未定')}</small></button><div class="cell ${on&&field==='stock'?'on':''}" data-act="open" data-i="${i}" data-field="stock" role="button"><b>${E(cellText(p,'stock'))}</b><span class="last" data-act="last" data-i="${i}" data-field="stock">上次${E(lastStockText(p))}</span></div><div class="cell ${on&&field==='qty'?'on':''}" data-act="open" data-i="${i}" data-field="qty" role="button"><b>${E(cellText(p,'qty'))}</b><span class="last" data-act="last" data-i="${i}" data-field="qty">上次${E(lastQtyText(p))}</span></div></div>${hint}`;
 });
 return html||'<p class="muted">没有匹配的商品。</p>';
}
function orderHtml(){
 const link=new URLSearchParams(location.search).get('order');
 if(link&&!order&&!sample)return `<div class="card"><h1>登录后看这份订单</h1><p>${E(status)}</p><button class="primary" type="button" data-act="tab" data-tab="more">去登录</button></div>`;
 if(!order&&!draft)return `<div class="card"><h1>今日还没有订单</h1><p>${canCount()?'先在盘货里过一遍。':'请用大伟发来的链接打开。'}</p></div>`;
 if(!order&&draft)return draftOrderHtml();
 const warn=warnings();const changes=bossChanges();
 const head=sample?'样例 · 不会写入云端':`${E(order.date)} · ${E(order.updatedByName||'')} · 第 ${order.revision} 版`;
 return `${changes.length?`<div class="alert"><strong>老板娘改了 ${changes.length} 样</strong><div class="pair"><button class="ghost" type="button" data-act="yellow-only">${yellowOnly?'看全部':'只看她改的'}</button><button class="ghost" type="button" data-act="yellow-ok">知道了</button></div></div>`:''}${warn.length?warnHtml(warn):''}<p class="muted">${head}</p><input class="find" id="find" placeholder="搜全部129种，用来补订或看库存" value="${E(query)}"><div id="rows">${query?searchHits():CATS.map(([cat])=>blockHtml(cat)).join('')}</div>${keypad&&editId?orderPad():''}${dockHtml()}`;
}
function draftOrderHtml(){
 const warn=warnings();
 return `${warn.length?warnHtml(warn):''}<p class="muted">${E(draft.date)} · 还在本机，确认后才发给老板娘</p><input class="find" id="find" placeholder="搜全部129种，用来补订或看库存" value="${E(query)}"><div id="rows">${query?searchHits():CATS.map(([cat])=>blockHtml(cat)).join('')}</div>${keypad&&editId?orderPad():''}${canCount()?`<div class="dock"><button class="primary" type="button" data-act="confirm">确认并分享给老板娘</button></div>`:''}`;
}
function warnHtml(list){
 return `<div class="card"><strong>请核对数量</strong><p class="muted">跟上次差了大约十倍，或是多写了一个 0。这只是提醒按错。</p>${list.slice(0,6).map(p=>`<button class="ghost" style="width:100%;margin-top:6px" type="button" data-act="warn" data-id="${E(p.id)}">${E(p.name)}：订 ${E(qtyOf(p.id))}，上次订 ${E(p.referenceOrder)}</button><button class="ghost" type="button" data-act="ack" data-id="${E(p.id)}">没问题</button>`).join('')}</div>`;
}
function blockHtml(cat){
 const name=CATS.find(c=>c[0]===cat)[2];
 const {active,gray,changes}=rowsOf(cat);
 const row=p=>{
  const c=changes.get(p.id);const dead=!Number(qtyOf(p.id));
  const tags=[!dead&&order&&!(baseQty[p.id]>0)?'<span class="tag">新加</span>':'',!dead&&!order&&draft?.added?.[p.id]?'<span class="tag">新加</span>':''].join('');
  const shown=editId===p.id&&editRaw!=null?editRaw:qtyOf(p.id);
  return `<div class="order ${c?'yellow':''} ${dead?'dead':''} ${editId===p.id?'on':''}" data-id="${E(p.id)}"><div><b>${E(p.name)}</b> ${tags}<div class="muted">${E(p.alias&&p.alias!==p.name?p.alias+' · ':'')}${E(stockLine(p))}${c?` · ${E(changeNote(c))}`:''}</div></div><div>${dead?`<button class="ghost" type="button" data-act="restore" data-id="${E(p.id)}">恢复</button>`:`<button class="num" type="button" data-act="edit" data-id="${E(p.id)}">${E(shown)}${E((order?order.units[p.id]:p.unit)||'')}</button>`}</div></div>`;
 };
 const body=active.map(row).join('')+gray.map(row).join('');
 return `<div class="card"><h2>${name}</h2>${body||'<p class="muted">这一家这次不订。</p>'}<div class="pair"><button class="ghost" type="button" data-act="copy" data-cat="${cat}">复制</button><button class="ghost" type="button" data-act="share" data-cat="${cat}">分享</button></div></div>`;
}
function searchHits(){
 return catalog().filter(p=>S.matches(p,query,aliasesOf(p))).map(p=>`<button class="hit" type="button" data-act="edit" data-id="${E(p.id)}"><b>${E(p.name)}</b> ${p.alias&&p.alias!==p.name?`<small>${E(p.alias)}</small>`:''}<div class="muted">${E(stockLine(p))}${Number(qtyOf(p.id))>0?' · 已订 '+E(qtyOf(p.id)):' · 未订'}</div></button>`).join('')||'<p>没有匹配的商品。</p>';
}
function dockHtml(){
 if(!order)return '';
 const n=dirtyCount();
 const text=n?`有 ${n} 处改动，点这里保存`:'保存';
 return `<div class="dock">${sample?'<p class="muted">样例不会写入云端</p>':''}<button class="primary" type="button" data-act="save">${text}</button></div>`;
}
function dirtyCount(){
 if(!order||sample)return 0;
 return catalog().filter(p=>(order.quantities[p.id]||0)!==(baseQty[p.id]||0)||(isOwner()&&String(stocks[p.id]??'')!==String(stockBase[p.id]??''))).length;
}
function moreHtml(){
 const who=member?`<div class="card"><h1>${E(member.name)}</h1><p class="muted">${member.role==='owner'?'盘货负责人':'订单编辑者'}</p><button class="ghost" type="button" data-act="logout">退出登录</button></div><div class="card"><h2>修改密码</h2><form id="pass"><label>当前密码<input name="current" type="password" required></label><label>新密码<input name="next" type="password" required></label><label>再输入一次<input name="confirm" type="password" required></label><button class="ghost" type="submit">保存新密码</button></form></div>`:`<div class="card"><h1>登录</h1><p class="muted">填账号。大伟用 dawei，老板娘用 laobanniang。</p><form id="login"><label>账号<input name="account" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">登录</button></form></div>`;
 const date=draft&&canCount()?`<div class="card"><h2>盘货日期</h2><label>日期<input id="countDate" type="date" value="${E(draft.date)}"></label><button class="ghost" type="button" data-act="set-date">用这个日期</button><button class="ghost" style="width:100%;margin-top:8px" type="button" data-act="fresh">放弃这份盘货，重新开始</button></div>`:'';
 return `${who}${date}<div class="card"><button class="ghost" style="width:100%" type="button" data-act="pane" data-pane="archive">10月18日存档</button><button class="ghost" style="width:100%;margin-top:8px" type="button" data-act="pane" data-pane="history">历史订单</button><button class="ghost" style="width:100%;margin-top:8px" type="button" data-act="pane" data-pane="log">修改记录</button><button class="ghost" style="width:100%;margin-top:8px" type="button" data-act="sample">看一张样例订单（不写入云端）</button><div id="cloudList"></div><p class="muted">${E(status)}</p></div><div class="card"><h2>放到主屏幕</h2><p>用 Safari 打开这个预览，点底部或顶部的分享，再点「添加到主屏幕」。名字是「천천향 盘货」。若现在在 KakaoTalk 里，先在浏览器里打开，再添加。</p></div>${morePaneHtml()}`;
}
function morePaneHtml(){
 if(morePane==='archive')return `<div class="card"><h2>${E(source.date)} 存档</h2><p class="muted">只看已经确认的旧单。空白不是 0。</p><div class="hero" style="background-image:linear-gradient(#0008,#0004),url('../assets/storefront.jpg')"><img src="./logo.jpg" alt="川川香门头LOGO"></div>${source.products.filter(p=>p.order).map(p=>`<p>${E(p.alias||p.name)} ${E(p.order)}${E(p.unit||'')}</p>`).join('')}</div>`;
 if(morePane==='history')return archives.length?archives.map(block=>`<div class="card"><h2>${E(block.date)}</h2>${block.products.filter(p=>p.order).map(p=>`<p>${E(p.alias||p.name)} ${E(p.order)}${E(p.unit||'')}</p>`).join('')||'<p>这一天没有订货数字。</p>'}</div>`).join(''):'<p>历史还在读取。</p>';
 if(morePane==='log')return `<div class="card"><h2>修改记录</h2>${order?C.historyHtml(catalog(),history,isOwner()&&!sample).replaceAll('data-cloud="restore"','data-act="restore-rev"'):'<p>先打开一份订单。</p>'}</div>`;
 return '';
}
function rememberStocks(){
 const d=JSON.parse(order.snapshot);
 stocks=Object.fromEntries(d.catalog.map(p=>[p.id,String(d.items[p.id]?.stock??'')]));
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
 baseQty={...now};
 if(kind!=='yellow'){baseQty['kr:26']=1000;heldPrev['kr:26']='1';}
 history=kind==='yellow'?[{revision:2,updatedByName:'老板娘',updatedAt:new Date().toISOString(),quantities:now,units},{revision:1,updatedByName:'大伟',updatedAt:new Date(Date.now()-3600000).toISOString(),quantities:prev,units}]:[{revision:1,updatedByName:'大伟',updatedAt:new Date().toISOString(),quantities:now,units}];
 rememberStocks();orderDirty=false;editId=null;keypad=false;screen='order';query='';
}

function blockText(cat){
 const rows=catalog().filter(p=>p.cat===cat&&Number(qtyOf(p.id))>0).map(p=>({name:p.name,qty:qtyOf(p.id),unit:(order?order.units[p.id]:p.unit)||''}));
 const date=order?order.date:draft.date;
 return S.supplierText(date,rows)+(rows.length?'':'\n这次不订');
}
async function copyOnly(text){
 try{await navigator.clipboard.writeText(text);}catch(e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}
 toast('已复制，可以贴到 KakaoTalk');
}
async function confirmShare(){
 if(!canCount()){toast('请用大伟的账号');screen='more';render();return;}
 if(!member||member.role!=='owner'){toast('登录 dawei 后再发给老板娘');screen='more';render();return;}
 const gap=firstGap();
 if(gap>=0){toast('还有没盘的');screen='count';openCount(gap,'stock');return;}
 if(draft.status!=='reviewed'){
  for(const p of draft.catalog){
   const r=draft.items[p.id];
   if(r.decision==='order'){if(!String(p.unit||'').trim())throw Error(p.name+' 单位还是空的，不能订');Core().finish(draft,p.id,false);}
   else Core().finish(draft,p.id,true);
  }
  draft.status='reviewed';draft.reviewedAt=new Date().toISOString();persistLocal();
 }
 const payload=C.submission(draft,Core(),source);
 const cloudId=C.cloudOrderId(draft.id,true);guardTest(cloudId);
 const result=await api.create(cloudId,payload,'submit-'+cloudId);
 await openOrder(result.id);
 const counts={kr:orderedCount('kr'),cn:orderedCount('cn'),other:orderedCount('other')};
 await shareOrCopy(S.bossShareText(order.date,counts,shareUrl()));
}
async function saveOrder(){
 if(sample){toast('样例不会写入云端');return;}
 if(!api||!order){toast('请先登录');return;}
 if(!dirtyCount()){toast('没有要保存的改动');return;}
 const q={};for(const [id,v] of Object.entries(order.quantities))q[id]=v;
 C.checkQuantities(q,order.units,Object.keys(order.units));
 let patch;if(isOwner()&&C.stockChanged(order.snapshot,stocks))patch={snapshot:C.applyStock(order.snapshot,stocks)};
 const data=await api.save(order.id,order,q,crypto.randomUUID(),patch);
 order=data;rememberStocks();baseQty={...data.quantities};heldPrev={};orderDirty=false;
 history=await api.history(order.id);toast('已保存');render();
}
async function openOrder(id){
 guardTest(id);sample=false;demoRole=null;
 const data=await api.read(id);order=data;rememberStocks();baseQty={...data.quantities};heldPrev={};ack={};orderDirty=false;history=[];screen='order';keypad=false;
 const url=new URL(location.href);url.searchParams.set('order',id);url.searchParams.delete('sample');historyReplace(url);
 render();
 try{history=await api.history(id);}catch(e){toast('修改记录没读到');}
 render();
}
function historyReplace(url){history.replaceState(null,'',url.pathname+url.search);}
function tryLeave(next){
 if(orderDirty&&next!=='order'&&!confirm('还有改动没保存，离开吗？'))return;
 if(next!=='order'){commitOrderEdit();keypad=false;editId=null;}
 screen=next;if(next!=='count')query='';render();
 if(next==='more'&&api)loadList();
}

document.body.addEventListener('click',async e=>{
 const b=e.target.closest('[data-act]');if(!b||busy)return;
 const act=b.dataset.act;
 try{
  if(act==='tab'){tryLeave(b.dataset.tab);return;}
  if(act==='open'){openCount(Number(b.dataset.i),b.dataset.field);return;}
  if(act==='last'){e.stopPropagation();fillLast(Number(b.dataset.i),b.dataset.field);return;}
  if(act==='key'){if(screen==='order'&&editId){typeOrderKey(b.dataset.key);return;}typeKey(b.dataset.key);return;}
  if(act==='next'){nextCell();return;}
  if(act==='same'){sameAsLast();return;}
  if(act==='undo'){doUndo();return;}
  if(act==='jumpcat'){const el=document.getElementById('cat-'+b.dataset.cat);if(el){const bar=document.querySelector('.bar').getBoundingClientRect().bottom;window.scrollBy(0,el.getBoundingClientRect().top-bar-4);}return;}
  if(act==='next-gap'){if(allSeen()){tryLeave('order');return;}const i=firstGap();if(i>=0)openCount(i,'stock');return;}
  if(act==='goto-order'){tryLeave('order');return;}
  if(act==='edit'){if(draft&&!order&&!Number(qtyOf(b.dataset.id)))draft.added={...draft.added,[b.dataset.id]:true};openOrderKey(b.dataset.id);return;}
  if(act==='minus'){stepQty(-1);return;}
  if(act==='plus'){stepQty(1);return;}
  if(act==='zero'){cancelLine(editId);return;}
  if(act==='order-next'){const ids=[...document.querySelectorAll('.order .num')].map(n=>n.dataset.id);const at=ids.indexOf(editId);if(commitOrderEdit()===false)return;if(ids[at+1])openOrderKey(ids[at+1]);else{keypad=false;render();}return;}
  if(act==='restore'){restoreLine(b.dataset.id);return;}
  if(act==='warn'){query='';openOrderKey(b.dataset.id);return;}
  if(act==='ack'){const id=b.dataset.id;const qty=qtyOf(id);if(order)ack[id]=qty;else{draft.ackWrong[id]=qty;persistLocal();}render();return;}
  if(act==='yellow-only'){yellowOnly=!yellowOnly;query='';render();return;}
  if(act==='yellow-ok'){yellowOn=false;yellowOnly=false;if(order)localStorage.setItem(`ccx-redesign-yellow:${order.id}:${history[0]?.revision||0}`,'1');render();return;}
  if(act==='copy'){await copyOnly(blockText(b.dataset.cat));return;}
  if(act==='share'){await shareOrCopy(blockText(b.dataset.cat));return;}
  if(act==='confirm'){busy=true;await confirmShare();return;}
  if(act==='save'){busy=true;await saveOrder();return;}
  if(act==='sample'){buildSample('order');render();return;}
  if(act==='pane'){morePane=morePane===b.dataset.pane?'':b.dataset.pane;render();return;}
  if(act==='fresh'){if(!confirm('放弃这部手机上的这份盘货？'))return;localStorage.removeItem(KEY);draft=null;pos=0;field='stock';keypad=false;ensureDraft();flushCloud();screen='count';render();return;}
  if(act==='set-date'){const v=document.getElementById('countDate').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)){toast('请选日期');return;}if(draft.status==='reviewed'){toast('已经提交，日期不能改');return;}draft.date=v;persistLocal();toast('日期已改');return;}
  if(act==='logout'){await signOut(auth);order=null;return;}
  if(act==='open-cloud'){busy=true;await openOrder(b.dataset.id);return;}
  if(act==='restore-rev'){const v=history.find(x=>x.revision===Number(b.dataset.revision));if(!v)return;order.quantities=C.clone(v.quantities);orderDirty=true;morePane='';screen='order';render();toast('旧数量已放回，还没保存');return;}
 }catch(err){toast(err.message||'没做成');}
 finally{busy=false;}
});
document.body.addEventListener('input',e=>{
 if(e.target.id==='find'){query=e.target.value;const box=document.getElementById('rows');if(box)box.innerHTML=screen==='count'?countRows():(query?searchHits():CATS.map(([cat])=>blockHtml(cat)).join(''));}
});
document.body.addEventListener('submit',async e=>{
 if(e.target.id==='login'){e.preventDefault();const form=e.target;try{await signInWithEmailAndPassword(auth,A.accountEmail(form.elements.account.value),form.elements.password.value);}catch(err){toast(A.authErrorText(err.code,err.message)||err.message||'登录失败');}finally{form.elements.password.value='';}}
 if(e.target.id==='pass'){e.preventDefault();const form=e.target;const problem=A.passwordChangeError(form.elements.current.value,form.elements.next.value,form.elements.confirm.value);if(problem){toast(problem);return;}try{await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,form.elements.current.value));await updatePassword(user,form.elements.next.value);toast('密码已改');}catch(err){toast(A.authErrorText(err.code,err.message,'password')||err.message);}finally{form.reset();}}
});
window.addEventListener('beforeunload',e=>{if(orderDirty){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushCloud();});
window.addEventListener('pagehide',()=>flushCloud());
window.addEventListener('online',()=>{if(cloudPending)flushCloud();});

async function loadList(){
 const box=document.getElementById('cloudList');if(!box||!api)return;
 try{const records=(await api.list()).filter(d=>String(d.id).startsWith('test-'));box.innerHTML=records.length?records.map(d=>`<button class="ghost" style="width:100%;margin-top:8px" type="button" data-act="open-cloud" data-id="${E(d.id)}">${E(d.date)} · ${E(d.updatedByName||'')} · ${E(d.id.slice(-6))}</button>`).join(''):'<p class="muted">还没有 test- 测试订单。</p>';}
 catch(e){box.innerHTML=`<p class="muted">${E(e.message||'列表没读到')}</p>`;}
}
async function loadArchives(){
 try{const index=await (await fetch('../order-archives/index.json',{cache:'no-store'})).json();archives=[];for(const entry of index.entries||[]){const data=await (await fetch('../order-archives/'+entry.file,{cache:'no-store'})).json();archives.push({date:entry.date,products:(data.products||[]).map(p=>({name:p.name,alias:p.alias,order:p.order,unit:p.unit}))});}if(screen==='more'&&morePane==='history')render();}catch(e){archives=[];}
}
async function boot(){
 const [orderRes,aliasRes]=await Promise.all([fetch('../current-order.json',{cache:'no-store'}),fetch('./aliases.json',{cache:'no-store'})]);
 source=await orderRes.json();
 const aliasFile=await aliasRes.json();
 aliasById=new Map(aliasFile.items.map(item=>[item.id,item.aliases]));
 if(!source.products||source.products.length!==129)throw Error('商品不是129种');
 loadLocal();loadArchives();
 const params=new URLSearchParams(location.search);
 const sampleKind=params.get('sample');
 if(sampleKind)buildSample(sampleKind==='boss'||sampleKind==='yellow'?sampleKind:'order');
 try{
  const cfg=await (await fetch('./firebase-config.json',{cache:'no-store'})).json();
  if(!cfg.enabled){status='云端没打开。本机照样能盘货。';render();return;}
  const firebaseApp=initializeApp(cfg.firebase);auth=getAuth(firebaseApp);db=getFirestore(firebaseApp);
  onAuthStateChanged(auth,async u=>{
   user=u;member=null;api=null;
   if(!u){status='还没登录。本机盘货可以用，云端备份要等大伟登录。';if(!sample)order=null;if(params.get('order')&&!sample){screen='order';status='登录后才能看这份测试订单。';}render();return;}
   try{
    const snap=await getDocFromServer(doc(db,'members',u.uid));
    const data=snap.exists()?snap.data():null;
    if(data&&data.active===true&&['owner','editor'].includes(data.role)&&data.name){
     member=data;api=store(db,u.uid,'orders',data.name);status=data.name+' 已登录';
     if(data.role==='owner')await pullDraft();
     const id=params.get('order');
     if(id&&!sample)await openOrder(id);
     else if(data.role==='editor'&&!sample)screen='order';
    }else status='登录了，但还不能看订单';
   }catch(err){status=err.message||'登录后没读到权限';}
   render();if(screen==='more')loadList();
  });
 }catch(e){status='云端没连上。本机照样能盘货。';}
 render();
}
boot().catch(e=>{app.textContent=e.message||'预览没打开';});
