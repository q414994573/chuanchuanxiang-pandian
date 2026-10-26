'use strict';
// Current-record progress indicators in actual Chromium/WebKit DOM and CSS.
// Firebase boot is removed; fixtures use fictional records, stub storage APIs,
// and block every request except this one isolated page. Native iPhone keyboard
// behavior and physical speech output are not claimed by this runner.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'..'),sourceDir=process.env.CCX_BROWSER_SOURCE||repo;
const playwright=require(process.env.CCX_PLAYWRIGHT_MODULE||'playwright');
const esbuild=require(path.join(repo,'node_modules/esbuild'));
const output=process.env.CCX_BROWSER_OUTPUT||'/tmp/ccx-search-progress';fs.mkdirSync(output,{recursive:true});
const raw=fs.readFileSync(path.join(sourceDir,'redesign-preview/preview.js'),'utf8');
const imports=[...raw.matchAll(/^import (\w+) from '([^']+)';$/gm)].map(([,name,file])=>`const ${name}=require(${JSON.stringify(path.resolve(sourceDir,'redesign-preview',file))});`).join('\n');
const stripped=raw.replace(/^import .*;\n/gm,'').replace(/boot\(\)\.catch\([\s\S]*$/,'');
const fixture=JSON.parse(fs.readFileSync(path.join(sourceDir,'current-order.json'),'utf8'));
const aliases=JSON.parse(fs.readFileSync(path.join(sourceDir,'redesign-preview/aliases.json'),'utf8'));
const picks=['kr:7','kr:31','cn:21','cn:33','cn:44','cn:64','other:18','other:22'];
const expected={'kr:7':true,'kr:31':false,'cn:21':false,'cn:33':true,'cn:44':false,'cn:64':false,'other:18':true,'other:22':false};
const expose=`
window.__ccx={reads:0,saves:0,
 setup(role='owner',mode='draft'){
  productSpeech.stop();interactionFeedback.stop();busy=false;skipActUntil=0;resetOrderSearch();clearKeySelection();
  clearTimeout(cloudTimer);clearTimeout(orderTimer);clearTimeout(showUndo._t);localStorage.clear();searchActivity.clear();productSpeech.set(false);interactionFeedback.set('sound',false);interactionFeedback.set('vibration',false);lastLocalRaw=localStorage.getItem(KEY);
  source=${JSON.stringify(fixture)};aliasById=new Map(${JSON.stringify(aliases.items)}.map(x=>[x.id,x.aliases]));
  releaseLocked=false;configFailed=false;sample=false;demoRole=null;peerEnabled=true;peerViewing=true;
  member={role,name:role==='owner'?'测试甲':'测试乙'};user={uid:'test-'+role};
  draft=Core().create(source,'2026-10-26','count-browser-progress');draft.seen={};draft.ackWrong={};draft.deferred={};
  for(const p of draft.catalog){const r=draft.items[p.id];r.stock=p.hasStock?'2':'';r.stockStatus=p.hasStock?'counted':'exempt';r.quantity='12';r.decision='order';r.processed=true;r.acknowledged=true;draft.seen[p.id]=false;}
  draft.items['cn:45'].unit='봉';draft.items['other:11'].unit='세트';
  Object.assign(draft.seen,${JSON.stringify(expected)});draft.seen['cn:21']=true;draft.deferred['cn:21']=true;
  draft.items['cn:33'].stock='0';draft.items['cn:33'].quantity='';draft.items['cn:33'].decision='skip';
  draft.status=mode==='draft'?'draft':'reviewed';
  order=mode==='draft'?null:{id:draft.id,schema:'ccx-cloud-1',date:draft.date,revision:3,orderStage:'finalized',updatedByName:member.name,snapshot:JSON.stringify(draft),quantities:Object.fromEntries(draft.catalog.map(p=>[p.id,p.id==='cn:33'?0:12000])),units:Object.fromEntries(draft.catalog.map(p=>[p.id,draft.items[p.id].unit]))};
  orderDirty=false;orderFlight=null;orderStageWriting=false;orderAutoBlocked=false;orderLocalFailed=false;orderSaveNotice=null;
  peerBase={localId:draft.id,orderId:draft.id,stage:mode==='draft'?'draft':'finalized',revision:3,draft:C.clone(draft)};peerLatest=peerBase;peerSavedBase=null;peerFlight=null;peerRestoreFlight=null;peerConflict='';
  peerApi={read:async()=>{this.reads++;throw Error('Backend reads forbidden');},save:async(base,next)=>{this.saves++;return {...base,revision:base.revision+1,draft:C.clone(next)};}};
  api={read:async()=>{this.reads++;throw Error('Backend reads forbidden');},history:async()=>[]};
  if(order){rememberStocks();baseQty={...order.quantities};baseUnits={...order.units};beginOrderSession(order);draft.id='count-unrelated-local';draft.date='2026-10-27';draft.seen=Object.fromEntries(draft.catalog.map(p=>[p.id,!${JSON.stringify(expected)}[p.id]]));draft.deferred={};}
  else{stocks={};stockBase={};stockBaseUnits={};baseQty={};baseUnits={};orderBase=null;}
  localBlocked=false;localConflict=false;localSaveFailed=false;cloudConflict=false;cloudPending=false;cloudReady=true;cloudPhase='saved';
  pos=0;field='stock';screen='order';keypad=false;textMode=false;query='';viewCat='kr';orderCat='kr';moduleEnd=false;
  searchScroll=null;searchCat=null;wantFind=false;editId=null;editRaw=null;editSnap=null;editStockUnit=null;entered=null;undo=null;rowTap=null;preparedExport=null;history=[];heldPrev={};ack={};yellowOn=true;yellowOnly=false;
  catScroll={kr:0,cn:0,other:0,drinks:0};orderScroll={kr:0,cn:0,other:0,drinks:0};this.reads=0;this.saves=0;
  searchActivity.record('测试热搜',${JSON.stringify(picks)});render();scrollTo(0,0);
 },
 values(){return {items:C.clone(draft.items),seen:C.clone(draft.seen||{}),deferred:C.clone(draft.deferred||{}),catalog:C.clone(draft.catalog),order:order&&C.clone(order)};},
 state(){return {screen,keypad,textMode,editId,editField,query,orderSearchOpen,searchComposing,cloudConflict,reads:this.reads,saves:this.saves};},
 row(id){return {stock:stockShown(product(id)),quantity:qtyOf(id),stockUnit:stockUnitOf(product(id)),unit:order?order.units[id]:draft.items[id].unit};},
 // Compare stable rank/order/activity fields; heat scores naturally decay with time.
 activity(){return {history:searchActivity.history(),ranked:searchActivity.ranked(catalog().map(p=>p.id),129).map(({score,...stable})=>stable)};},
 remote(id,seenValue,deferredValue=false){const record=C.clone(peerBase);record.revision++;record.draft.seen[id]=seenValue;if(deferredValue)record.draft.deferred[id]=true;else delete record.draft.deferred[id];record.draft.contentVersion++;peerReceive(record);},
 mutateSnapshot(id,seenValue,deferredValue=false){const saved=JSON.parse(order.snapshot);saved.seen=saved.seen||{};saved.seen[id]=seenValue;saved.deferred=saved.deferred||{};if(deferredValue)saved.deferred[id]=true;else delete saved.deferred[id];order.snapshot=JSON.stringify(saved);render();},
 forgetSnapshotSeen(){const saved=JSON.parse(order.snapshot);delete saved.seen;delete saved.deferred;order.snapshot=JSON.stringify(saved);render();},
 historical(suffix,seenValue){const saved=JSON.parse(order.snapshot);saved.id='count-history-'+suffix;saved.date='2026-10-25';saved.seen=Object.fromEntries(saved.catalog.map(p=>[p.id,seenValue]));saved.deferred={};acceptOrder({...C.clone(order),id:saved.id,date:saved.date,revision:1,snapshot:JSON.stringify(saved)});render();},
 repaint(){render();},
};window.__ccx.setup();
`;
const build=esbuild.buildSync({metafile:true,stdin:{contents:`window.CountCore=require(${JSON.stringify(path.join(sourceDir,'count-core.js'))});\n`+imports+stripped+expose,resolveDir:sourceDir,sourcefile:'search-progress-fixture.js'},bundle:true,format:'iife',write:false});
const js=build.outputFiles[0].text,css=fs.readFileSync(path.join(sourceDir,'redesign-preview/preview.css'),'utf8');
const html=`<!doctype html><html lang="zh-CN" data-order-mode="production"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body><div class="banner">川川香 · 订货总控台<small>共同盘货、实时同步、双方定稿</small></div><div id="app"></div><nav class="tabs"><button data-act="tab" data-tab="count">盘货</button><button data-act="tab" data-tab="order">订单</button><button data-act="tab" data-tab="more">更多</button></nav><div id="toast" role="status"></div><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const sourceInputs=Object.fromEntries(Object.keys(build.metafile.inputs).map(file=>path.resolve(repo,file)).filter(file=>fs.existsSync(file)).map(file=>[path.relative(sourceDir,file),hash(fs.readFileSync(file))]));
for(const file of ['redesign-preview/preview.js','redesign-preview/preview.css','current-order.json','redesign-preview/aliases.json'])sourceInputs[file]=hash(fs.readFileSync(path.join(sourceDir,file)));
const report={engine:process.env.CCX_BROWSER_ENGINE||'chromium',source:sourceDir,sourceInputs,runner:hash(fs.readFileSync(__filename)),cases:[],errors:[],limitations:['Uses real mobile browser DOM, trusted tap/input events and actual application CSS.','Native iPhone keyboard, audible speech and real cloud delivery timing are not measured.','Synthetic peer records exercise the application receive/merge path with all external requests blocked.']};
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const tap=async target=>{await target.tap();};
async function setup(page,role,mode='draft'){await page.evaluate(({role,mode})=>window.__ccx.setup(role,mode),{role,mode});await settle(page);}
async function tab(page,which){await tap(page.locator(`[data-act="tab"][data-tab="${which}"]`));await settle(page);}
async function open(page){await tap(page.locator('[data-act="open-order-search"]'));await settle(page);}
async function search(page,text,submit=false){await page.locator('#find').fill(text);if(submit)await tap(page.locator('[data-act="submit-search"]'));await settle(page);}
async function close(page){if(await page.locator('[data-act="close"]').count())await tap(page.locator('[data-act="close"]'));await settle(page);}
async function clear(page){await tap(page.locator('[data-act="clear-find"]'));await settle(page);}
const row=(page,id)=>page.locator(`.search-hit[data-id="${id}"]`);
const hot=(page,id)=>page.locator(`[data-act="hot-find"][data-id="${id}"]`);
const edit=(page,id,field)=>page.locator(`[data-act="edit"][data-id="${id}"][data-field="${field}"]`);
const values=page=>page.evaluate(()=>window.__ccx.values());
const activity=page=>page.evaluate(()=>window.__ccx.activity());
const state=page=>page.evaluate(()=>window.__ccx.state());
async function assertDot(container,seenValue){
 const dots=container.locator('.dot');assert.equal(await dots.count(),1,'one progress dot per product');
 const actual=await dots.evaluate(el=>{const r=el.getBoundingClientRect(),css=getComputedStyle(el);return {progress:el.dataset.progress,label:el.getAttribute('aria-label'),role:el.getAttribute('role'),color:css.backgroundColor,width:r.width,height:r.height,tabIndex:el.getAttribute('tabindex'),action:el.dataset.act||null,first:el.parentElement.firstElementChild===el};});
 assert.equal(actual.progress,seenValue?'seen':'unseen');assert.equal(actual.label,seenValue?'已盘':'未盘');assert.equal(actual.role,'img');assert.equal(actual.color,seenValue?'rgb(187, 24, 39)':'rgb(183, 174, 166)');assert.equal(actual.width,8);assert.equal(actual.height,8);assert.equal(actual.action,null);assert.equal(actual.tabIndex,null);assert.equal(actual.first,true,'indicator precedes product name');return actual;
}
async function layout(page,width){const m=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,height:innerHeight,pads:document.querySelectorAll('.pad').length}));assert.ok(m.scrollWidth<=width+1,JSON.stringify(m));return m;}
async function assertInlineHeight(container){const m=await container.evaluate(el=>{const dot=el.querySelector('.dot'),before=el.getBoundingClientRect().height;const prev=dot.style.display;dot.style.display='none';const without=el.getBoundingClientRect().height;dot.style.display=prev;return {withDot:before,withoutDot:without};});assert.equal(m.withDot,m.withoutDot,'inline progress does not add a row');return m;}
async function runCase(name,fn){try{const details=await fn();report.cases.push({...details,name,pass:true});}catch(e){report.cases.push({name,pass:false,error:e.stack||e.message});console.error('FAIL',name,e.message);}}
async function route(page){page.setDefaultTimeout(5000);page.on('pageerror',e=>report.errors.push(e.message));await page.route('**/*',async r=>{if(r.request().url()==='https://ccx.invalid/ordering/')await r.fulfill({status:200,contentType:'text/html',body:html});else{report.errors.push('Unexpected network '+r.request().url());await r.abort();}});}
(async()=>{
 const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();
 try{
  for(const width of (process.env.CCX_BROWSER_WIDTHS||'430,375,320').split(',').map(Number))for(const role of (process.env.CCX_BROWSER_ROLES||'owner,editor').split(',')){
   const context=await browser.newContext({viewport:{width,height:932},isMobile:true,hasTouch:true,deviceScaleFactor:1}),page=await context.newPage();await route(page);await page.goto('https://ccx.invalid/ordering/');const prefix=`${width}px ${role}`;
   try{
    for(const mode of ['draft','finalized'])await runCase(prefix+' '+mode+' current record agrees across hot cards, search and count',async()=>{
     await setup(page,role,mode);const before=await values(page);await open(page);const beforeHot=await hot(page,'cn:33').innerText();
     for(const id of picks)await assertDot(hot(page,id),expected[id]);const hotHeight=await assertInlineHeight(hot(page,'cn:33'));await layout(page,width);if(role==='owner'&&mode==='draft')await page.screenshot({path:path.join(output,`${width}-hot-progress.png`)});
     await search(page,'大葱娃娃菜水饺腐竹虾丸');for(const id of ['kr:7','kr:31','cn:21','cn:33','cn:64'])await assertDot(row(page,id),expected[id]);const rowHeight=await assertInlineHeight(row(page,'cn:33'));if(role==='owner'&&mode==='draft')await page.screenshot({path:path.join(output,`${width}-search-progress.png`)});
     await tap(page.locator('[data-act="cancel-find"]'));await settle(page);await tab(page,'count');await search(page,'腐竹');
     const countRow=page.locator(mode==='draft'?'#rows .line:has([data-act="open"][data-id="cn:33"])':'#rows .line[data-id="cn:33"]');await assertDot(countRow,true);
     await search(page,'虾丸');const uncounted=page.locator(mode==='draft'?'#rows .line:has([data-act="open"][data-id="cn:64"])':'#rows .line[data-id="cn:64"]');await assertDot(uncounted,false);await layout(page,width);
     assert.deepEqual(await values(page),before,'displaying progress does not mutate records');assert.equal((await state(page)).reads,0);return {hotHeight,rowHeight,zeroInventoryAndNoOrderStaySeen:beforeHot.includes('0')};
    });
    await runCase(prefix+' opening and closing an unhandled product does not mark it handled',async()=>{
     await setup(page,role);await open(page);await search(page,'虾丸');const before=await values(page);await assertDot(row(page,'cn:64'),false);await tap(edit(page,'cn:64','qty'));await settle(page);await assertDot(row(page,'cn:64'),false);await close(page);await assertDot(row(page,'cn:64'),false);assert.deepEqual(await values(page),before);return {noOpPreserved:true};
    });
    await runCase(prefix+' accepted quantity changes repaint search immediately and preserve heat ranking',async()=>{
     await setup(page,role);await open(page);await search(page,'虾丸',true);const before=await activity(page);await tap(edit(page,'cn:64','qty'));await tap(page.locator('[data-act="key"][data-key="8"]'));await settle(page);await assertDot(row(page,'cn:64'),true);assert.equal((await page.evaluate(()=>window.__ccx.row('cn:64'))).quantity,'8');await close(page);await clear(page);await assertDot(hot(page,'cn:64'),true);assert.deepEqual(await activity(page),before);assert.match(await hot(page,'cn:64').innerText(),/订货：8/);return {immediateLocal:true,rankUnchanged:true};
    });
    await runCase(prefix+' zero inventory is handled and zero-order undo keeps existing progress semantics',async()=>{
     await setup(page,role);await open(page);await search(page,'娃娃菜虾丸');await tap(edit(page,'kr:31','stock'));await tap(page.locator('[data-act="key"][data-key="0"]'));await settle(page);await assertDot(row(page,'kr:31'),true);assert.equal((await page.evaluate(()=>window.__ccx.row('kr:31'))).stock,'0');await close(page);
     await tap(edit(page,'cn:64','qty'));await tap(page.locator('[data-act="zero"]'));await settle(page);await assertDot(row(page,'cn:64'),true);assert.equal((await page.evaluate(()=>window.__ccx.row('cn:64'))).quantity,'');await tap(page.locator('[data-act="undo"]'));await settle(page);await assertDot(row(page,'cn:64'),true);assert.equal((await page.evaluate(()=>window.__ccx.row('cn:64'))).quantity,'12');await close(page);await clear(page);await assertDot(hot(page,'kr:31'),true);await assertDot(hot(page,'cn:64'),true);return {stockZeroSeen:true,undoRestoresValueNotWorkflowReset:true};
    });
    await runCase(prefix+' deferred state stays gray while editing and resolves through existing Next action',async()=>{
     await setup(page,role);await open(page);await search(page,'腐竹虾丸');await tap(edit(page,'cn:33','qty'));await tap(page.locator('[data-act="defer"]'));await settle(page);await assertDot(row(page,'cn:33'),false);assert.equal(await row(page,'cn:33').locator('.deferred-tag').count(),1);
     await tap(edit(page,'cn:33','qty'));await tap(page.locator('[data-act="key"][data-key="8"]'));await settle(page);await assertDot(row(page,'cn:33'),false);await tap(page.locator('[data-act="order-next"]'));await settle(page);await assertDot(row(page,'cn:33'),true);assert.equal(await row(page,'cn:33').locator('.deferred-tag').count(),0);await close(page);await clear(page);await assertDot(hot(page,'cn:33'),true);return {deferredOverridesSeen:true,nextResolves:true};
    });
    await runCase(prefix+' peer status changes update hot cards while retaining search input and ranking',async()=>{
     await setup(page,role);await open(page);const before=await activity(page),hotIds=await page.locator('[data-act="hot-find"]').evaluateAll(els=>els.map(el=>el.dataset.id));await page.locator('#find').evaluate(el=>{window.__keptFind=el;el.setSelectionRange(0,0);});
     await page.evaluate(()=>window.__ccx.remote('cn:64',true));await settle(page);await assertDot(hot(page,'cn:64'),true);assert.equal(await page.locator('#find').evaluate(el=>el===window.__keptFind&&document.activeElement===el&&el.selectionStart===0),true);assert.deepEqual(await activity(page),before);assert.deepEqual(await page.locator('[data-act="hot-find"]').evaluateAll(els=>els.map(el=>el.dataset.id)),hotIds);
     await page.evaluate(()=>window.__ccx.remote('cn:64',true,true));await settle(page);await assertDot(hot(page,'cn:64'),false);assert.deepEqual(await activity(page),before);assert.equal((await state(page)).reads,0);return {receivedRemoteRepaints:true,focusPreserved:true,rankUnchanged:true};
    });
    await runCase(prefix+' peer result repaint preserves composition, caret, scroll and result order',async()=>{
     await setup(page,role);await open(page);await search(page,'粉');await page.setViewportSize({width,height:530});await settle(page);
     await page.locator('#find').evaluate(el=>{window.__keptFind=el;el.setSelectionRange(1,1);el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'粉'}));});await page.evaluate(()=>scrollTo(0,180));await settle(page);const beforeY=await page.evaluate(()=>scrollY),ids=await page.locator('.search-hit').evaluateAll(els=>els.map(el=>el.dataset.id)),before=await activity(page);assert.ok(ids.includes('cn:44'));
     await page.evaluate(()=>window.__ccx.remote('cn:44',true));await settle(page);await assertDot(row(page,'cn:44'),true);assert.equal(await page.locator('#find').evaluate(el=>el===window.__keptFind&&document.activeElement===el&&el.selectionStart===1),true);assert.equal((await state(page)).searchComposing,true);assert.equal(await page.locator('#find').inputValue(),'粉');assert.ok(Math.abs(await page.evaluate(()=>scrollY)-beforeY)<=2,'remote render retains scroll');assert.deepEqual(await page.locator('.search-hit').evaluateAll(els=>els.map(el=>el.dataset.id)),ids);assert.deepEqual(await activity(page),before);
     await page.locator('#find').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'粉'})));await page.setViewportSize({width,height:932});await settle(page);return {scrollBefore:beforeY,compositionPreserved:true,rankUnchanged:true};
    });
    await runCase(prefix+' peer update during local keypad edit preserves active value and updates other status',async()=>{
     await setup(page,role);await open(page);await search(page,'腐竹虾丸');await tap(edit(page,'cn:64','qty'));await tap(page.locator('[data-act="key"][data-key="8"]'));await settle(page);await page.evaluate(()=>window.__ccx.remote('cn:33',false));await settle(page);await assertDot(row(page,'cn:33'),false);await assertDot(row(page,'cn:64'),true);assert.equal((await state(page)).editId,'cn:64');assert.equal((await state(page)).keypad,true);assert.equal((await state(page)).cloudConflict,false);assert.equal((await page.evaluate(()=>window.__ccx.row('cn:64'))).quantity,'8');await layout(page,width);return {localEditPreserved:true,remoteDifferentProductMerged:true};
    });
    await runCase(prefix+' native text input updates dots without replacing its caret during local and peer changes',async()=>{
     await setup(page,role);await open(page);await search(page,'腐竹虾丸');await tap(edit(page,'cn:64','qty'));await tap(page.locator('[data-act="mode"][data-mode="text"]'));await settle(page);
     const native=page.locator('input.plain');await native.evaluate(el=>window.__keptPlain=el);await native.fill('8');await settle(page);await assertDot(row(page,'cn:64'),true);assert.equal(await native.evaluate(el=>el===window.__keptPlain&&document.activeElement===el&&el.selectionStart===1),true,'accepted local input retains its native element and caret');
     await native.evaluate(el=>{el.setSelectionRange(0,1);el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'8'}));});const beforeY=await page.evaluate(()=>scrollY);await page.evaluate(()=>window.__ccx.remote('cn:33',false));await settle(page);
     await assertDot(row(page,'cn:33'),false);await assertDot(row(page,'cn:64'),true);assert.equal(await native.evaluate(el=>el===window.__keptPlain&&document.activeElement===el&&el.selectionStart===0&&el.selectionEnd===1),true,'remote progress repaint retains active native selection');assert.equal(await native.inputValue(),'8');assert.equal((await state(page)).textMode,true);assert.equal((await state(page)).cloudConflict,false);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-beforeY)<=2);await native.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'8'})));return {nativeInputRetained:true,localImmediate:true,peerRepaintWithoutEditorReplacement:true};
    });
    await runCase(prefix+' missing historical progress remains gray despite unrelated local data and positive values',async()=>{
     await setup(page,role,'finalized');await page.evaluate(()=>window.__ccx.forgetSnapshotSeen());const before=await values(page);await open(page);for(const id of picks)await assertDot(hot(page,id),false);await search(page,'大葱腐竹虾丸');for(const id of ['kr:7','cn:33','cn:64'])await assertDot(row(page,id),false);assert.equal(await page.locator('#rows [data-act="edit"]').count(),0);assert.deepEqual(await values(page),before);return {noInventedCompletion:true,finalizedReadOnly:true};
    });
    await runCase(prefix+' switching historical orders never carries status from the other record',async()=>{
     await setup(page,role,'finalized');await page.evaluate(()=>window.__ccx.historical('first',true));await open(page);await assertDot(hot(page,'cn:33'),true);await search(page,'腐竹');await assertDot(row(page,'cn:33'),true);
     await page.evaluate(()=>window.__ccx.historical('second',false));await settle(page);assert.equal((await state(page)).orderSearchOpen,false);await open(page);await assertDot(hot(page,'cn:33'),false);await search(page,'腐竹');await assertDot(row(page,'cn:33'),false);
     await page.evaluate(()=>window.__ccx.historical('first',true));await settle(page);await open(page);await assertDot(hot(page,'cn:33'),true);return {recordScoped:true};
    });
    await runCase(prefix+' replacing same order snapshot refreshes status without new reads or input replacement',async()=>{
     await setup(page,role,'finalized');await open(page);const activityBefore=await activity(page);await page.locator('#find').evaluate(el=>window.__keptFind=el);await page.evaluate(()=>window.__ccx.mutateSnapshot('cn:64',true));await settle(page);await assertDot(hot(page,'cn:64'),true);assert.equal(await page.locator('#find').evaluate(el=>el===window.__keptFind),true);
     await search(page,'虾丸');await page.evaluate(()=>window.__ccx.mutateSnapshot('cn:64',false));await settle(page);await assertDot(row(page,'cn:64'),false);assert.equal(await page.locator('#find').inputValue(),'虾丸');assert.deepEqual(await activity(page),activityBefore);assert.equal((await state(page)).reads,0);return {sameIdentityRefresh:true,noExtraReads:true};
    });
    await page.screenshot({path:path.join(output,`${width}-${role}-progress.png`)});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 report.passed=report.cases.filter(x=>x.pass).length;report.failed=report.cases.length-report.passed;assert.equal(new Set(report.cases.map(x=>x.name)).size,report.cases.length,'case names are unique');fs.writeFileSync(path.join(output,'search-progress-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({engine:report.engine,browserVersion:report.browserVersion,passed:report.passed,failed:report.failed,errors:report.errors,report:path.join(output,'search-progress-report.json')},null,2));if(report.failed||report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
