'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('../count-core.js');
const Flow=require('../redesign-preview/count-flow.cjs');
const source=require('../current-order.json');

// Exercise the real application in its existing isolated VM fixture. Reuse only
// the fixture definition, so importing this file never registers old tests twice.
const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const body=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"))
 .replace("screen='order';render=()=>{};","screen='order';globalThis.originalRender=render;render=()=>{};")
 .replace('CountCore:Core,scrollY:80','CountCore:Core,localStorage:{setItem(k,v){saved.set(k,v);},getItem(k){return saved.get(k)??null;}},scrollY:80');
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${body};return harness;`)(require,Core,source);
const q=JSON.stringify;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function setup(role='owner',mode='draft'){
 const h=harness(true);
 const nodes={app:h.run('app'),rows:{innerHTML:'',getBoundingClientRect:()=>({top:200,bottom:500})}};
 h.find.id='find';h.find.value='';h.find.classList={contains:()=>false};h.find.focus=()=>{h.document.activeElement=h.find;};
 h.document.getElementById=id=>id==='find'?h.find:(nodes[id]||null);
 h.window.scrollBy=(x,y)=>{h.window.scrollY+=y;};h.ctx.navigator={onLine:true};h.ctx.confirm=()=>true;
 h.run(`member={role:${q(role)},name:'测试账号'};user={uid:${q('test-'+role)}};releaseLocked=false;sample=false;peerEnabled=true;peerViewing=true;
  draft.seen={};draft.deferred={};draft.ackWrong={};draft.status='draft';
  peerBase={localId:draft.id,orderId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerLatest=peerBase;
  peerApi={save:async(base,next)=>({...base,revision:base.revision+1,draft:C.clone(next)})};
  cloudReady=true;cloudPending=false;cloudPhase='saved';globalThis.serverReads=0;
  api={read:()=>{serverReads++;throw Error('progress rendering must stay local')},history:async()=>[]};`);
 if(mode!=='draft')h.run(`buildSample('boss');sample=false;order.orderStage=${q(mode)};orderBase=C.clone(order);
  baseQty={...order.quantities};baseUnits={...order.units};orderDirty=false;`);
 return {...h,nodes};
}
function markers(html){
 return [...html.matchAll(/<i\b([^>]*)>/g)].flatMap(match=>{
  const attrs=Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
  return String(attrs.class||'').split(/\s+/).includes('dot')?[attrs]:[];
 });
}
function assertMarker(html,id,done,context=''){
 const found=markers(html).filter(x=>x['data-progress-id']===id);
 assert.equal(found.length,1,`${context}: expected exactly one progress marker for ${id}`);
 assert.equal(found[0]['data-progress'],done?'seen':'unseen',`${context}: ${id} progress`);
 assert.equal(found[0].role,'img');assert.equal(found[0]['aria-label'],done?'已盘':'未盘');
 assert.equal(found[0]['data-act'],undefined,'indicator must not introduce a new action');
}
function surfaces(h,id){
 return {
  count:h.run(`countRows()`),
  search:h.run(`searchHits()`),
  hot:h.run(`searchHotCard(product(${q(id)}),0,false)`)
 };
}
function assertSurfaces(h,id,done){for(const [name,html]of Object.entries(surfaces(h,id)))assertMarker(html,id,done,name);}
function model(h){return h.run('JSON.stringify([draft,order,stocks,stockBase,stockBaseUnits,baseQty,baseUnits,orderDirty,cloudPending])');}
function visibleMarker(h,id,done=false){
 const attrs={'data-progress-id':id,'data-progress':done?'seen':'unseen','aria-label':done?'已盘':'未盘',role:'img'};
 const dataset={progressId:id,progress:attrs['data-progress']};
 const classes=new Set(['dot']);
 const lineClasses=new Set();
 const marker={dataset,classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k);}},
  getAttribute:key=>key==='data-progress'?dataset.progress:attrs[key],
  setAttribute(key,value){attrs[key]=String(value);if(key==='data-progress')dataset.progress=String(value);},
  closest:selector=>selector==='.line'?{classList:{toggle(k,on){if(on)lineClasses.add(k);else lineClasses.delete(k);}}}:null};
 const old=h.document.querySelectorAll;
 h.document.querySelectorAll=selector=>String(selector).includes('progress-id')?[marker]:old(selector);
 return marker;
}
function assertVisibleMarker(marker,done){
 assert.equal(marker.dataset.progress,done?'seen':'unseen');
 assert.equal(marker.getAttribute('aria-label'),done?'已盘':'未盘');
}

// Every real catalog entry must expose its own state on all three surfaces,
// including names in both languages and products without an inventory cell.
for(const role of ['owner','editor'])for(const p of source.products){
 test(`progress agrees across count, order search and hot card for ${p.id} ${p.name} (${role})`,()=>{
  const h=setup(role);h.run(`viewCat=Flow.catOf(product(${q(p.id)}));query=''`);
  const values=h.run('JSON.stringify([draft.catalog,draft.items])');
  for(const state of ['unseen','seen','deferred']){
   h.run(`draft.seen[${q(p.id)}]=${state!=='unseen'};draft.deferred[${q(p.id)}]=${state==='deferred'}`);
   const before=model(h);assertSurfaces(h,p.id,state==='seen');assert.equal(model(h),before,'display must be read-only');
  }
  assert.equal(h.run('JSON.stringify([draft.catalog,draft.items])'),values);
  assert.equal(h.run('serverReads'),0);assert.equal(h.run('searchActivity.history().length'),0);
 });
}

for(const role of ['owner','editor']){
 test(`opening a product without typing keeps every progress surface gray (${role})`,()=>{
  const h=setup(role);h.run(`screen='count';openCount(draft.catalog.findIndex(p=>p.id==='kr:31'),'stock');closePad()`);
  assertSurfaces(h,'kr:31',false);assert.equal(h.run(`draft.items['kr:31'].stock`),'');
 });
 test(`a counted zero inventory is red without inventing an order (${role})`,()=>{
  const h=setup(role);h.run(`screen='count';openCount(draft.catalog.findIndex(p=>p.id==='kr:31'),'stock');typeKey('0')`);
  assertSurfaces(h,'kr:31',true);assert.equal(h.run(`draft.items['kr:31'].stock`),'0');
  assert.equal(h.run(`draft.items['kr:31'].quantity`),'');assert.equal(h.run(`draft.items['kr:31'].decision`),'pending');
 });
 test(`quantity-only handling is red even with an empty inventory (${role})`,()=>{
  const h=setup(role);h.run(`viewCat='cn';query='腐竹';openOrderKey('cn:33','qty');typeOrderKey('2')`);
  assertSurfaces(h,'cn:33',true);assert.equal(h.run(`draft.items['cn:33'].stock`),'');
  assert.equal(h.run(`draft.items['cn:33'].quantity`),'2');
 });
 test(`explicit Next past an empty quantity counts handling without making up a quantity (${role})`,()=>{
  const h=setup(role);h.run(`viewCat='cn';query='腐竹';openOrderKey('cn:33','qty');advanceOrder()`);
  assertSurfaces(h,'cn:33',true);assert.equal(h.run(`draft.items['cn:33'].quantity`),'');
 });
 test(`defer becomes gray and only the existing resolution flow returns it to red (${role})`,()=>{
  const h=setup(role);h.run(`viewCat='cn';query='腐竹';openOrderKey('cn:33','qty');typeOrderKey('2');deferActive()`);
  assertSurfaces(h,'cn:33',false);assert.match(h.run(`searchHotCard(product('cn:33'),0,false)`),/订货：2/);
  h.run(`openOrderKey('cn:33','qty');closePad()`);assertSurfaces(h,'cn:33',false);
  h.run(`openOrderKey('cn:33','qty');advanceOrder()`);assertSurfaces(h,'cn:33',true);
  assert.equal(h.run(`draft.deferred['cn:33']`),undefined);
 });
 test(`clearing and undo preserve the current handled-state rule (${role})`,()=>{
  const h=setup(role);h.run(`viewCat='cn';query='腐竹';openOrderKey('cn:33','qty');typeOrderKey('2');cancelLine('cn:33')`);
  assertSurfaces(h,'cn:33',true);assert.equal(h.run(`qtyOf('cn:33')`),'');
  h.run('doUndo()');assertSurfaces(h,'cn:33',true);assert.equal(h.run(`qtyOf('cn:33')`),'2');
 });
 for(const mode of ['pending','finalized'])test(`opened ${mode} snapshot wins over an unrelated opposite draft (${role})`,()=>{
  const h=setup(role,mode);
  h.run(`globalThis.opened=JSON.parse(order.snapshot);opened.seen={'cn:33':true,'cn:44':false,'cn:45':true};opened.deferred={'cn:45':true};order.snapshot=JSON.stringify(opened);
   draft.seen={'cn:33':false,'cn:44':true,'cn:45':true};draft.deferred={};draft.id='count-unrelated-day';draft.date='2026-10-25';viewCat='cn'`);
  const before=model(h);
  for(const [id,done]of [['cn:33',true],['cn:44',false],['cn:45',false]])assertSurfaces(h,id,done);
  assert.equal(model(h),before);assert.equal(h.run('serverReads'),0);
 });
 test(`legacy snapshots without a seen map stay gray regardless of values or unrelated current progress (${role})`,()=>{
  const h=setup(role,'finalized');h.run(`globalThis.opened=JSON.parse(order.snapshot);delete opened.seen;delete opened.deferred;order.snapshot=JSON.stringify(opened);
   draft.seen=Object.fromEntries(draft.catalog.map(p=>[p.id,true]));viewCat='cn'`);
  assertSurfaces(h,'cn:33',false);
  assert.equal(h.run(`JSON.parse(order.snapshot).items['cn:33'].processed`),true);
 });
 test(`changing snapshot data under the same order id and revision immediately changes the marker (${role})`,()=>{
  const h=setup(role,'pending');h.run(`viewCat='cn';globalThis.opened=JSON.parse(order.snapshot);opened.seen={};opened.deferred={};order.snapshot=JSON.stringify(opened)`);
  const identity=h.run('JSON.stringify([order.id,order.revision])');assertSurfaces(h,'cn:33',false);
  h.run(`opened.seen['cn:33']=true;order.snapshot=JSON.stringify(opened)`);assertSurfaces(h,'cn:33',true);
  h.run(`opened.deferred['cn:33']=true;order.snapshot=JSON.stringify(opened)`);assertSurfaces(h,'cn:33',false);
  assert.equal(h.run('JSON.stringify([order.id,order.revision])'),identity);
 });
 test(`returning from historical snapshot to mutable draft reads the live draft on every render (${role})`,()=>{
  const h=setup(role,'pending');h.run(`viewCat='cn';globalThis.opened=JSON.parse(order.snapshot);opened.seen={'cn:33':true};order.snapshot=JSON.stringify(opened);draft.seen={};draft.deferred={}`);
  assertSurfaces(h,'cn:33',true);h.run('order=null');assertSurfaces(h,'cn:33',false);
  h.run(`draft.seen['cn:33']=true`);assertSurfaces(h,'cn:33',true);
  h.run(`draft.deferred['cn:33']=true`);assertSurfaces(h,'cn:33',false);
 });
 test(`progress-only changes leave heat, history, card order, values and search result order alone (${role})`,()=>{
  const h=setup(role);h.run(`viewCat='cn';searchActivity.record('腐竹',['cn:33']);searchActivity.record('粉条',['cn:14']);searchActivity.record('腐竹',['cn:33'])`);
  // Scores naturally decay with wall time. Compare recorded activity and order,
  // not two slightly different floating-point evaluations of that same heat.
  const activity=()=>h.run('JSON.stringify([searchActivity.history(),searchActivity.ranked(catalog().map(p=>p.id)).map(({id,count,lastAt})=>({id,count,lastAt}))])');
  const activityBefore=activity();
  const hotIds=()=>[...h.run('orderSearchHome()').matchAll(/data-act="hot-find" data-id="([^"]+)"/g)].map(x=>x[1]);
  const orderBefore=hotIds(),values=h.run('JSON.stringify(draft.items)');
  const resultIds=()=>[...h.run('searchHits()').matchAll(/class="line search-hit [^"]*" data-id="([^"]+)"/g)].map(x=>x[1]);
  const resultsBefore=resultIds();
  h.run(`draft.seen['cn:33']=true;draft.seen['cn:14']=true;draft.deferred['cn:14']=true`);
  assert.deepEqual(hotIds(),orderBefore);assert.deepEqual(resultIds(),resultsBefore);
  assert.equal(activity(),activityBefore);
  assert.equal(h.run('JSON.stringify(draft.items)'),values);
  assertMarker(h.run('orderSearchHome()'),'cn:33',true);assertMarker(h.run('orderSearchHome()'),'cn:14',false);
 });
 test(`accepted remote progress refreshes hot and result markup without starting another search (${role})`,()=>{
  const h=setup(role);h.run(`searchActivity.record('腐竹',['cn:33']);openOrderSearch();globalThis.remote=C.clone(peerBase);remote.revision++;remote.draft.seen['cn:33']=true;peerReceive(remote)`);
  assertMarker(h.run('orderSearchHome()'),'cn:33',true);assertMarker(h.run('searchHits()'),'cn:33',true);
  assert.equal(h.run('query'),'');assert.equal(h.run('searchActivity.history().length'),1);
  assert.equal(h.run('searchActivity.ranked(["cn:33"])[0].count'),1);assert.equal(h.run('serverReads'),0);
 });
 test(`native text entry repaints the marker without replacing its editor or changing focus (${role})`,()=>{
  const h=setup(role);h.run(`screen='count';openCount(draft.catalog.findIndex(p=>p.id==='kr:31'),'stock');textMode=true`);
  const marker=visibleMarker(h,'kr:31');
  const input={value:'0',selectionStart:1,selectionEnd:1,classList:{contains:n=>n==='plain'}};
  h.document.activeElement=input;h.document.querySelector=selector=>selector==='input.plain'?input:null;
  h.handlers.input({target:input});
  assertVisibleMarker(marker,true);assert.equal(h.document.activeElement,input);
  assert.equal(input.value,'0');assert.equal(input.selectionStart,1);assert.equal(h.run('textMode'),true);
 });
 test(`remote progress during native editing patches only indicators and preserves local editor state (${role})`,()=>{
  const h=setup(role);h.run(`screen='count';openCount(draft.catalog.findIndex(p=>p.id==='kr:31'),'stock');textMode=true`);
  const marker=visibleMarker(h,'cn:33');const input={value:'2.5',selectionStart:1,selectionEnd:1};h.document.activeElement=input;
  h.window.scrollY=512;h.nodes.rows.innerHTML='native editor identity sentinel';
  h.run(`globalThis.remote=C.clone(peerBase);remote.revision++;remote.draft.seen['cn:33']=true;peerReceive(remote)`);
  assertVisibleMarker(marker,true);assert.equal(h.document.activeElement,input);assert.equal(input.value,'2.5');assert.equal(input.selectionStart,1);
  assert.equal(h.nodes.rows.innerHTML,'native editor identity sentinel');assert.equal(h.window.scrollY,512);assert.equal(h.run('textMode'),true);
 });
 test(`merged save response updates indicators while native editor stays intact (${role})`,async()=>{
  const h=setup(role);h.run(`screen='count';openCount(draft.catalog.findIndex(p=>p.id==='kr:31'),'stock');writeCell('2');textMode=true;
   peerApi.save=async(base,sent)=>{const remote={...base,revision:base.revision+1,draft:C.clone(sent)};remote.draft.seen['cn:33']=true;return remote;}`);
  const marker=visibleMarker(h,'cn:33');const input={value:'2',selectionStart:0,selectionEnd:1};h.document.activeElement=input;
  h.nodes.rows.innerHTML='editor survives save';await h.run('peerSave()');
  assertVisibleMarker(marker,true);assert.equal(h.document.activeElement,input);assert.equal(input.selectionStart,0);
  assert.equal(h.nodes.rows.innerHTML,'editor survives save');assert.equal(h.run('textMode'),true);
 });
}

test('indicator helpers preserve original display names, escape untrusted attributes, and add no action',()=>{
 const p={id:'bad\" data-act=\"delete',name:'<img src=x onerror=evil()>',alias:'翻译',unit:'包'};
 const html=Flow.progressNameHtml(p,true,esc);
 assert.match(html,/&lt;img src=x onerror=evil\(\)&gt;/);assert.doesNotMatch(html,/<img|\sdata-act="delete"/);
 assert.ok(html.includes('data-progress-id="bad&quot; data-act=&quot;delete"'));
 assert.equal(markers(html).length,1);assert.equal(markers(html)[0]['data-act'],undefined);
});
test('the shared progress rule preserves existing truthiness and the deferred override without mutating its record',()=>{
 for(const value of [undefined,null,false,true,0,1,'', 'done'])for(const deferred of [undefined,false,true]){
  const record={seen:{x:value},deferred:{x:deferred}},before=JSON.stringify(record);
  assert.equal(Flow.progressSeen(record,'x'),!!value&&!deferred);assert.equal(JSON.stringify(record),before);
 }
 assert.equal(Flow.progressSeen(null,'x'),false);assert.equal(Flow.progressSeen({},'x'),false);
});
