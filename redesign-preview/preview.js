import {initializeApp} from 'firebase/app';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,EmailAuthProvider,reauthenticateWithCredential,updatePassword} from 'firebase/auth';
import {getFirestore,doc,getDocFromServer} from 'firebase/firestore';
import {store} from '../cloud/store.js';
import C from '../cloud/core.cjs';
import A from '../cloud/account.cjs';

const Core=()=>window.CountCore;
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATS=[['kr','韩国食品'],['cn','中国食品'],['other','其他商品']];
const PREFIX='ccx-redesign-session:';
const ACTIVE='ccx-redesign-active';
const app=document.getElementById('app');
let source,draft,pos=0,field='qty',screen='count',user=null,member=null,auth,db,api=null;
let order=null,stocks={},history=[],query='',status='正在准备预览…',sample=false,busy=false,sheet=null,archives=[];

function toast(text){const t=document.getElementById('toast');t.textContent=text;t.style.display='block';clearTimeout(toast._t);toast._t=setTimeout(()=>{t.style.display='none';},2400);}
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());}
function uid(){return 'count-'+(crypto.randomUUID?crypto.randomUUID():Date.now());}
function norm(s){return String(s??'').normalize('NFKC').toLowerCase().replace(/\s/g,'');}
function doneCount(){return draft?draft.catalog.filter(p=>Core().complete(draft,p)).length:0;}
function orderedCount(d=draft){return d?d.catalog.filter(p=>d.items[p.id].decision==='order').length:0;}

function persist(){
  if(!draft)return;
  draft.seq=(draft.seq||0)+1;
  draft.savedAt=new Date().toISOString();
  localStorage.setItem(PREFIX+draft.id,JSON.stringify(draft));
  localStorage.setItem(ACTIVE,draft.id);
  sessionStorage.setItem('ccx-redesign-pos',String(pos));
}
function loadDraft(){
  try{
    const id=localStorage.getItem(ACTIVE);
    const raw=id&&localStorage.getItem(PREFIX+id);
    if(!raw)return;
    const d=JSON.parse(raw);
    if(Core().validate(d,source)){draft=d;pos=Math.min(Number(sessionStorage.getItem('ccx-redesign-pos'))||0,d.catalog.length-1);}
  }catch(e){}
}
function guardTest(id){
  C.assertCloudOrderId(id,true);
  if(!String(id).startsWith('test-'))throw Error('预览不能打开正式订单');
}

function startCount(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('请选日期');return;}
  draft=Core().create(source,date,uid());
  draft.log=[];
  pos=0;field='qty';screen='count';
  persist();
  render();
}
function current(){return draft.catalog[pos];}
function rec(){return draft.items[current().id];}
function typeKey(key){
  if(!draft||draft.status==='reviewed'){toast('数量已锁定。要改先点重新修改');return;}
  const p=current(),r=rec();
  if(field==='stock'&&!p.hasStock){toast('这项没有库存栏');return;}
  const cur=field==='stock'?r.stock:r.quantity;
  let next=cur;
  if(key==='del')next=cur.slice(0,-1);
  else if(key==='clear')next='';
  else if(key==='.'){if(cur.includes('.'))return;next=cur===''?'0.':cur+'.';}
  else next=cur+key;
  if(next.length>12)return;
  try{
    Core().edit(draft,p.id,field==='stock'?'stock':'quantity',next);
    persist();
    paintCount();
  }catch(e){toast(e.message);}
}
function skip(){
  if(draft.status==='reviewed'){toast('已锁定');return;}
  try{Core().finish(draft,current().id,true);persist();advance();}
  catch(e){toast(e.message);}
}
function nextItem(){
  if(draft.status==='reviewed'){advance();return;}
  const p=current(),r=rec();
  try{
    if(!Core().complete(draft,p)){
      if(r.decision==='pending'&&!String(r.quantity).trim()){toast('填订货数量，或点本次不订');return;}
      Core().finish(draft,p.id,false);
      persist();
    }
    advance();
  }catch(e){toast(e.message);}
}
function advance(){
  if(pos<draft.catalog.length-1){pos++;field='qty';persist();render();return;}
  screen='review';render();
}
function jump(i){pos=i;field='qty';screen='count';render();}
function firstGap(){return draft.catalog.findIndex(p=>!Core().complete(draft,p));}
function finalize(){
  const i=firstGap();
  if(i>=0){toast('还有没处理的商品');jump(i);return;}
  draft.status='reviewed';
  draft.reviewedAt=new Date().toISOString();
  persist();
  screen='review';
  render();
  toast('129项已锁定，可以提交测试订单');
}
function unlock(){draft.status='draft';persist();screen='count';render();}

async function submitOrder(){
  if(sample){toast('样例不会写入云端');return;}
  if(!member||member.role!=='owner'){toast('请用大伟的账号登录');screen='me';render();return;}
  if(!draft||draft.status!=='reviewed'){toast('请先锁定129项');return;}
  const payload=C.submission(draft,Core(),source);
  const cloudId=C.cloudOrderId(draft.id,true);
  guardTest(cloudId);
  status='正在提交测试订单…';render();
  const result=await api.create(cloudId,payload,'submit-'+cloudId);
  await openOrder(result.id);
  toast('已提交。这是 test- 测试订单，可以分享。');
}
async function openOrder(id){
  guardTest(id);
  sample=false;
  const data=await api.read(id);
  order=data;
  rememberStocks();
  history=[];
  screen='order';
  const url=new URL(location.href);
  url.searchParams.set('order',id);
  url.searchParams.delete('sample');
  historyReplace(url);
  render();
  try{history=await api.history(id);}catch(e){toast('修改记录没读到');}
  render();
}
function historyReplace(url){history.replaceState(null,'',url.pathname+url.search+'#order');}
function shareUrl(){
  const url=new URL(location.href);
  url.hash='order';
  if(sample){url.searchParams.set('sample','1');url.searchParams.delete('order');}
  else{url.searchParams.set('order',order.id);url.searchParams.delete('sample');guardTest(order.id);}
  return url.href;
}
async function saveOrder(){
  if(sample){toast('样例只在这台手机上改了看，没有写入云端');return;}
  if(!api||!order){toast('请先登录');return;}
  document.querySelectorAll('[data-qty]').forEach(el=>{
    const text=el.value.trim();
    if(text==='.'||/^\d+\.$/.test(text))throw Error('订货数量还没写完');
    setQty(el.dataset.qty,text);
  });
  const q={};
  for(const [id,v] of Object.entries(order.quantities))q[id]=v;
  C.checkQuantities(q,order.units,Object.keys(order.units));
  let patch;
  if(member?.role==='owner'&&C.stockChanged(order.snapshot,stocks))patch={snapshot:C.applyStock(order.snapshot,stocks)};
  const data=await api.save(order.id,order,q,crypto.randomUUID(),patch);
  order=data;
  rememberStocks();
  history=await api.history(order.id);
  toast('已保存。另一部手机刷新后能看到');
  render();
}
function setQty(id,text){
  const unit=order.units[id]||'';
  if(text==='' ){order.quantities[id]=0;return;}
  if(text==='.'||/^\d+\.$/.test(text))return;
  if(!unit.trim())throw Error('这项单位还是空的，不能补订');
  order.quantities[id]=C.quantity(text);
}
function catalog(){return JSON.parse(order.snapshot).catalog;}
function rememberStocks(){
  const d=JSON.parse(order.snapshot);
  stocks=Object.fromEntries(d.catalog.map(p=>[p.id,String(d.items[p.id]?.stock??'')]));
}
function stockLabel(p){
  if(!p.hasStock)return '这项没有库存栏';
  const text=stocks[p.id]??'';
  if(text==='')return '库存未记录';
  const unit=JSON.parse(order.snapshot).items[p.id]?.stockUnit||'';
  return '库存 '+text+(unit?' '+unit:'');
}

function buildSample(){
  const d=Core().create(source,source.date,'count-sample-preview');
  for(const p of d.catalog){
    const src=source.products.find(x=>x.id===p.id);
    const qty=src&&typeof src.order==='number'&&src.order>0&&p.unit?String(src.order):'';
    if(qty){Core().edit(d,p.id,'quantity',qty);Core().finish(d,p.id,false);}
    else Core().finish(d,p.id,true);
  }
  const units=Object.fromEntries(d.catalog.map(p=>[p.id,d.items[p.id].unit||'']));
  const now=Object.fromEntries(d.catalog.map(p=>[p.id,d.items[p.id].decision==='order'?Math.round(Number(d.items[p.id].quantity)*1000):0]));
  const prev={...now};
  prev['cn:5']=2000;now['cn:5']=5000;units['cn:5']=units['cn:5']||'봉';
  order={id:'test-count-sample',date:source.date,revision:2,quantities:now,units,snapshot:JSON.stringify(d),updatedByName:'老板娘',schema:'ccx-cloud-1'};
  history=[
    {revision:2,updatedByName:'老板娘',updatedAt:new Date().toISOString(),quantities:now,units},
    {revision:1,updatedByName:'大伟',updatedAt:new Date(Date.now()-3600000).toISOString(),quantities:prev,units}
  ];
  sample=true;screen='order';query='';
  rememberStocks();
}

function dock(html){return `<div class="dock">${html}</div>`;}
function keys(){
  const row=a=>a.map(k=>`<button type="button" data-act="key" data-key="${k}">${k==='del'?'删':k}</button>`).join('');
  return `<div class="keys">${row(['1','2','3'])}${row(['4','5','6'])}${row(['7','8','9'])}${row(['.','0','del'])}<button class="span" type="button" data-act="key" data-key="clear">清空</button></div>`;
}
function special(p){
  if(p.name==='고수')return '<p class="warn">香菜：再看一次冰箱。</p>';
  if(String(p.name).startsWith('감자수제비'))return '<p class="warn">土豆面片按大包记，1大包＝2小包，不要翻倍。</p>';
  return '';
}

function render(){
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===screen||(screen==='review'&&b.dataset.tab==='count')));
  if(screen==='archive')app.innerHTML=archiveHtml();
  else if(screen==='history')app.innerHTML=historyPage();
  else if(screen==='me')app.innerHTML=meHtml();
  else if(screen==='order')app.innerHTML=orderHtml();
  else if(screen==='review')app.innerHTML=reviewHtml();
  else app.innerHTML=draft?countHtml():introHtml();
  const active=app.querySelector('.field.on b');
  if(active)active.scrollIntoView({block:'nearest'});
}
function introHtml(){
  return `<div class="card"><h1>开始盘货</h1><p class="muted">按原来的顺序，一项一项填。先存在这台手机里，没登录也能盘。</p><label>日期<input id="countDate" type="date" value="${today()}"></label></div>${dock('<button class="primary" type="button" data-act="start">开始一份新盘货</button>')}`;
}
function countHtml(){
  const p=current(),r=rec(),n=doneCount(),catItems=draft.catalog.filter(x=>x.cat===p.cat),catPos=catItems.findIndex(x=>x.id===p.id)+1;
  const stockShown=p.hasStock?(r.stock===''?'空':r.stock):'无此栏';
  const qtyShown=r.decision==='skip'?'不订':(r.quantity===''?'空':r.quantity);
  return `<div class="toprow"><button class="linkish" type="button" data-act="prev">上一项</button><span class="muted">${catPos}/${catItems.length}</span><button class="linkish" type="button" data-act="review">检查</button></div>
  <div class="cats">${CATS.map(([cat,name])=>`<button type="button" data-act="cat" data-cat="${cat}" class="${p.cat===cat?'on':''}">${name}</button>`).join('')}</div>
  <div class="progress"><i style="width:${Math.round(n/129*100)}%"></i></div>
  <p class="muted" data-meta>已处理 ${n}/129 · 订货 ${orderedCount()} 种 · 已存在这台手机</p>
  <h2 class="name">${E(p.alias&&p.alias!==p.name?p.alias:p.name)}</h2>
  <p class="alias">${E(p.name)}${p.alias&&p.alias!==p.name?'':''} · ${E(p.unit||'单位未定')}</p>
  ${special(p)}
  <div class="fields">
    <button type="button" class="field ${field==='stock'?'on':''}" data-act="field" data-field="stock"><small>库存${p.hasStock?'':'（这项没有）'}</small><b>${E(stockShown)}</b><em>${E(r.stockUnit||'')}</em></button>
    <button type="button" class="field ${field==='qty'?'on':''}" data-act="field" data-field="qty"><small>订货</small><b>${E(qtyShown)}</b><em>${E(p.unit||'单位未定')}</em></button>
  </div>
  ${keys()}
  <p class="muted">上期参考：库存 ${p.referenceStock??'未填'} · 订货 ${p.referenceOrder??'未填'}</p>
  ${dock('<button class="ghost" type="button" data-act="skip">本次不订</button><button class="primary" type="button" data-act="next">下一项</button>')}`;
}
function paintCount(){
  if(screen!=='count'||!draft){render();return;}
  const p=current(),r=rec(),fields=app.querySelectorAll('.field b');
  if(fields.length<2){render();return;}
  fields[0].textContent=p.hasStock?(r.stock===''?'空':r.stock):'无此栏';
  fields[1].textContent=r.decision==='skip'?'不订':(r.quantity===''?'空':r.quantity);
  const n=doneCount();
  const bar=app.querySelector('.progress i');
  if(bar)bar.style.width=Math.round(n/129*100)+'%';
  const meta=app.querySelector('[data-meta]');
  if(meta)meta.textContent=`已处理 ${n}/129 · 订货 ${orderedCount()} 种 · 已存在这台手机`;
}
function reviewHtml(){
  const gap=draft.catalog.filter(p=>!Core().complete(draft,p));
  const locked=draft.status==='reviewed';
  const lines=draft.catalog.filter(p=>draft.items[p.id].decision==='order').slice(0,12).map(p=>`<p>${E(p.alias||p.name)} ${E(draft.items[p.id].quantity)}${E(draft.items[p.id].unit)}</p>`).join('');
  return `<h1>最后检查</h1><p class="muted">已处理 ${doneCount()}/129 · 订货 ${orderedCount()} 种。${locked?'数量已锁定。':'锁定后才能提交。'}</p>
  ${gap.length?`<div class="card"><strong>还有 ${gap.length} 项没处理</strong>${gap.slice(0,8).map(p=>`<button class="ghost" style="width:100%;margin-top:8px" type="button" data-act="jump" data-i="${draft.catalog.indexOf(p)}">${E(p.alias||p.name)}</button>`).join('')}</div>`:''}
  <div class="card">${lines||'<p>目前没有订货。</p>'}${orderedCount()>12?'<p class="muted">还有更多，复制时会带上全部。</p>':''}</div>
  ${CATS.map(([cat,name])=>`<button class="ghost" style="width:100%;margin-bottom:8px" type="button" data-act="copy" data-cat="${cat}">复制${name}</button>`).join('')}
  ${locked?'<button class="ghost" style="width:100%;margin-bottom:8px" type="button" data-act="unlock">重新修改</button>':''}
  ${dock(gap.length?'<button class="primary" type="button" data-act="gap">去填下一项</button>':(locked&&member?.role==='owner'?'<button class="primary" type="button" data-act="submit">提交给老板娘</button>':locked?'<button class="primary" type="button" data-act="need-login">登录后提交</button>':'<button class="primary" type="button" data-act="lock">锁定这129项</button>'))}`;
}
function archiveRows(){
  const q=norm(query);
  return source.products.filter(p=>!q||norm(p.name+' '+(p.alias||'')).includes(q)).map(p=>`<div class="row"><span><b>${E(p.alias&&p.alias!==p.name?p.alias:p.name)}</b><small>${E(p.name)}</small></span><span>${typeof p.order==='number'?E(p.order)+E(p.unit||''):'未订'}</span></div>`).join('');
}
function archiveHtml(){
  const ordered=source.products.filter(p=>typeof p.order==='number'&&p.order>0);
  return `<div class="hero" style="background-image:linear-gradient(#0008,#0004),url('../assets/storefront.jpg')"><div class="who"><img class="logo" src="./logo.jpg" alt="川川香门头LOGO"><div><strong>川川香</strong><span>这是 ${E(source.date)} 的旧存档</span></div></div></div>
  <div class="stats"><div class="stat"><b>129</b><span>商品</span></div><div class="stat"><b>${ordered.length}</b><span>这一单订了</span></div></div>
  <p class="note">空白不是 0。这里只看已经确认的旧单，不是今天的实时库存。</p>
  <input class="find" id="find" placeholder="搜商品" value="${E(query)}">
  <div class="list" id="rows">${archiveRows()}</div>`;
}
function historyPage(){
  if(!archives.length)return '<p>历史还在读取。</p>';
  return archives.map(block=>`<div class="card"><h2>${E(block.date)}</h2><p class="muted">${block.products.filter(p=>p.order).length} 种订过货。</p>${block.products.filter(p=>p.order).map(p=>`<p>${E(p.alias||p.name)} ${E(p.order)}${E(p.unit||'')}</p>`).join('')||'<p>这一天没有订货数字。</p>'}</div>`).join('');
}
function meHtml(){
  const who=member?`<div class="card"><h1>${E(member.name)}</h1><p class="muted">${member.role==='owner'?'盘货负责人':'订单编辑者'}</p><button class="ghost" type="button" data-act="logout">退出登录</button></div>`:`<div class="card"><h1>登录</h1><p class="muted">填账号，不是邮箱。大伟用 dawei，老板娘用 laobanniang。</p><form id="login"><label>账号<input name="account" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">登录</button></form></div>`;
  const pass=member?`<div class="card"><h2>修改密码</h2><form id="pass"><label>当前密码<input name="current" type="password" required></label><label>新密码<input name="next" type="password" required></label><label>再输入一次<input name="confirm" type="password" required></label><button class="ghost" type="submit">保存新密码</button></form></div>`:'';
  const fresh=draft?'<button class="ghost" style="width:100%;margin-top:8px" type="button" data-act="fresh">放弃本机这份，重新开始</button>':'';
  return `${who}${pass}<button class="ghost" style="width:100%" type="button" data-act="sample">看一张样例订单（不写入云端）</button>${fresh}<div id="cloudList"></div><p class="muted">${E(status)}</p>`;
}
function orderHtml(){
  const rows=visibleOrderRows();
  const who=sample?'样例 · 老板娘改过':`${E(order.updatedByName||'')} · 第 ${order.revision} 版`;
  return `<div class="toprow"><h1 style="margin:0">共享订单</h1><button class="linkish" type="button" data-act="more">更多</button></div>
  <p class="muted">${E(order.date)} · ${who}${sample?' · 不会写入云端':''}</p>
  <input class="find" id="find" placeholder="搜全部129种，用来补订" value="${E(query)}">
  <div class="list" id="rows">${rows.map(rowHtml).join('')||'<p>没有匹配的商品。</p>'}</div>
  ${sheetHtml()}
  ${dock('<button class="ghost" type="button" data-act="history">修改记录</button><button class="primary" type="button" data-act="save">保存</button>')}`;
}
function visibleOrderRows(){
  const list=catalog();
  const q=norm(query);
  return list.filter(p=>{
    if(q)return norm(p.name+' '+(p.alias||'')).includes(q);
    return order.quantities[p.id]>0;
  });
}
function rowHtml(p){
  const qty=order.quantities[p.id];
  const text=qty?C.textQuantity(qty):'';
  const alias=p.alias&&p.alias!==p.name?`<small>${E(p.alias)}</small>`:'';
  const stock=member?.role==='owner'&&!sample?`<label>盘货库存<input data-stock="${E(p.id)}" inputmode="decimal" maxlength="40" value="${E(stocks[p.id]??'')}" placeholder="可留空，不等于0"></label>`:`<p class="muted">${E(stockLabel(p))}。库存只看，不在这里改。</p>`;
  return `<div class="card"><strong style="font-size:20px">${E(p.name)}</strong>${alias}<p class="muted">订货单位 ${E(order.units[p.id]||'单位未定')}</p>${stock}<label>订货数量<input data-qty="${E(p.id)}" inputmode="decimal" value="${E(text)}" placeholder="空着就是本次不订"></label><button class="ghost" type="button" data-act="cancel" data-id="${E(p.id)}">本次不订</button></div>`;
}
function sheetHtml(){
  if(!order)return '';
  if(sheet==='history'){
    const html=C.historyHtml(catalog(),history,member?.role==='owner'&&!sample).replaceAll('data-cloud="restore"','data-act="restore"');
    return `<div class="sheet"><div class="toprow"><h2>修改记录</h2><button class="linkish" type="button" data-act="close">关闭</button></div>${html}</div>`;
  }
  if(sheet==='more')return `<div class="sheet"><button class="primary" type="button" data-act="share">分享链接</button><button class="ghost" style="width:100%;margin-top:8px" type="button" data-act="link">复制链接</button><button class="ghost" style="width:100%;margin-top:8px" type="button" data-act="reload">载入最新版</button><button class="linkish" type="button" data-act="close">关闭</button></div>`;
  return '';
}

async function copyText(text){
  try{await navigator.clipboard.writeText(text);toast('已复制');}
  catch(e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('已复制');}
}
async function onCopy(cat){
  if(draft.status!=='reviewed'){toast('请先锁定129项');return;}
  await copyText(Core().orderText(draft,cat));
}

document.body.addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]');
  if(!b||busy)return;
  const act=b.dataset.act;
  try{
    if(act==='tab'){screen=b.dataset.tab;sheet=null;render();if(screen==='me'&&api)loadList();return;}
    if(act==='start'){startCount(document.getElementById('countDate')?.value||today());return;}
    if(act==='key'){typeKey(b.dataset.key);return;}
    if(act==='field'){field=b.dataset.field;render();return;}
    if(act==='skip'){skip();return;}
    if(act==='next'){nextItem();return;}
    if(act==='prev'){if(pos>0){pos--;persist();render();}return;}
    if(act==='cat'){const i=draft?.catalog.findIndex(p=>p.cat===b.dataset.cat);if(i>=0)jump(i);return;}
    if(act==='fresh'){localStorage.removeItem(ACTIVE);draft=null;pos=0;screen='count';render();return;}
    if(act==='review'||act==='lock'){if(act==='lock')finalize();else{screen='review';render();}return;}
    if(act==='jump'){jump(Number(b.dataset.i));return;}
    if(act==='gap'){const i=firstGap();if(i>=0)jump(i);return;}
    if(act==='unlock'){unlock();return;}
    if(act==='copy'){await onCopy(b.dataset.cat);return;}
    if(act==='need-login'){screen='me';render();toast('登录 dawei 后再提交');return;}
    if(act==='submit'){busy=true;await submitOrder();return;}
    if(act==='sample'){buildSample();render();return;}
    if(act==='logout'){await signOut(auth);order=null;sample=false;return;}
    if(act==='history'){if(!order){toast('先打开一份订单');return;}sheet='history';render();return;}
    if(act==='more'){sheet='more';render();return;}
    if(act==='close'){sheet=null;render();return;}
    if(act==='save'){busy=true;await saveOrder();return;}
    if(act==='cancel'){order.quantities[b.dataset.id]=0;render();return;}
    if(act==='share'||act==='link'){
      const url=shareUrl();
      if(act==='share'&&navigator.share){await navigator.share({title:'川川香测试订单',url});}
      else await copyText(url);
      sheet=null;render();return;
    }
    if(act==='reload'){if(sample){toast('样例没有云端新版');return;}await openOrder(order.id);return;}
    if(act==='restore'){
      const v=history.find(x=>x.revision===Number(b.dataset.revision));
      if(!v)return;
      order.quantities=C.clone(v.quantities);
      sheet=null;render();toast('旧数量已放回页面，还没保存');return;
    }
    if(act==='open'){busy=true;await openOrder(b.dataset.id);return;}
  }catch(err){toast(err.message||'没做成');}
  finally{busy=false;}
});
document.body.addEventListener('input',e=>{
  if(e.target.id==='find'){query=e.target.value;const box=document.getElementById('rows');if(!box)return;if(screen==='archive')box.innerHTML=archiveRows();if(screen==='order')box.innerHTML=visibleOrderRows().map(rowHtml).join('')||'<p>没有匹配的商品。</p>';}
  if(e.target.dataset.stock){if(!sample&&member?.role==='owner')stocks[e.target.dataset.stock]=e.target.value;}
  if(e.target.dataset.qty){
    try{setQty(e.target.dataset.qty,e.target.value.trim());}
    catch(err){toast(err.message);}
  }
});
document.body.addEventListener('submit',async e=>{
  if(e.target.id==='login'){
    e.preventDefault();
    const form=e.target;
    try{await signInWithEmailAndPassword(auth,A.accountEmail(form.elements.account.value),form.elements.password.value);}
    catch(err){toast(A.authErrorText(err.code,err.message)||err.message||'登录失败');}
    finally{form.elements.password.value='';}
  }
  if(e.target.id==='pass'){
    e.preventDefault();
    const form=e.target;
    const problem=A.passwordChangeError(form.elements.current.value,form.elements.next.value,form.elements.confirm.value);
    if(problem){toast(problem);return;}
    try{
      await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,form.elements.current.value));
      await updatePassword(user,form.elements.next.value);
      toast('密码已改');
    }catch(err){toast(A.authErrorText(err.code,err.message,'password')||err.message);}
    finally{form.reset();}
  }
});

async function loadList(){
  const box=document.getElementById('cloudList');
  if(!box||!api)return;
  try{
    const records=(await api.list()).filter(d=>d.id.startsWith('test-'));
    box.innerHTML=records.length?records.map(d=>`<button class="ghost" style="width:100%;margin-top:8px" type="button" data-act="open" data-id="${E(d.id)}">${E(d.date)} · ${E(d.updatedByName||'')} · ${E(d.id.slice(-6))}</button>`).join(''):'<p class="muted">还没有 test- 测试订单。</p>';
  }catch(e){box.innerHTML=`<p class="muted">${E(e.message||'列表没读到')}</p>`;}
}
async function loadArchives(){
  try{
    const index=await (await fetch('../order-archives/index.json',{cache:'no-store'})).json();
    archives=[];
    for(const entry of index.entries||[]){
      const data=await (await fetch('../order-archives/'+entry.file,{cache:'no-store'})).json();
      archives.push({date:entry.date,products:(data.products||[]).map(p=>({name:p.name,alias:p.alias,order:p.order,unit:p.unit}))});
    }
    if(screen==='history')render();
  }catch(e){archives=[];}
}
async function boot(){
  const res=await fetch('../current-order.json',{cache:'no-store'});
  source=await res.json();
  if(!source.products||source.products.length!==129)throw Error('商品不是129种');
  loadDraft();
  loadArchives();
  const params=new URLSearchParams(location.search);
  if(params.get('sample')==='1')buildSample();
  try{
    const cfg=await (await fetch('./firebase-config.json',{cache:'no-store'})).json();
    if(!cfg.enabled){status='云端没打开。本机照样能盘货。';render();return;}
    const firebaseApp=initializeApp(cfg.firebase);
    auth=getAuth(firebaseApp);
    db=getFirestore(firebaseApp);
    onAuthStateChanged(auth,async u=>{
      user=u;member=null;api=null;
      if(!u){status='还没登录。本机盘货可以用。';if(!sample)order=null;if(new URLSearchParams(location.search).get('order')){screen='me';status='登录后才能看这份测试订单。本机盘货仍可用。';}render();return;}
      try{
        const snap=await getDocFromServer(doc(db,'members',u.uid));
        const data=snap.exists()?snap.data():null;
        if(data&&data.active===true&&['owner','editor'].includes(data.role)&&data.name){
          member=data;
          api=store(db,u.uid,'orders',data.name);
          status=data.name+' 已登录';
          const id=new URLSearchParams(location.search).get('order');
          if(id&&!sample)await openOrder(id);
        }else status='登录了，但还不能看订单';
      }catch(err){status=err.message||'登录后没读到权限';}
      render();
      if(screen==='me')loadList();
    });
  }catch(e){status='云端没连上。本机照样能盘货。';}
  render();
}
boot().catch(e=>{app.textContent=e.message||'预览没打开';});
