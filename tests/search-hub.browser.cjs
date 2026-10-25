'use strict';
// Dedicated order search hub rehearsal against the actual application source and CSS.
// Firebase boot is removed; every external request is blocked. The fixture owns
// fictional local orders and captures clipboard/share without sending anything.
// Run with CCX_PLAYWRIGHT_MODULE and CCX_BROWSER_ENGINE=chromium|webkit.
// Widths 430/375/320, owner/editor and draft/finalized are checked by default.
// This verifies DOM events and layout, not a physical iOS keyboard or its IME.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),sourceDir=process.env.CCX_BROWSER_SOURCE||repo;
const playwright=require(process.env.CCX_PLAYWRIGHT_MODULE||'playwright');
const esbuild=require(path.join(repo,'node_modules/esbuild'));
const outputDir=process.env.CCX_BROWSER_OUTPUT||'/tmp/ccx-search-hub';
fs.mkdirSync(outputDir,{recursive:true});
const modules={C:'cloud/core.cjs',A:'cloud/account.cjs',S:'redesign-preview/search.cjs',Flow:'redesign-preview/count-flow.cjs',Backup:'redesign-preview/draft-backup.cjs',Recovery:'redesign-preview/recovery.cjs',Entry:'redesign-preview/entry-mode.cjs',Auto:'redesign-preview/order-autosave.cjs',Shared:'redesign-preview/shared-draft.cjs'};
if(fs.existsSync(path.join(sourceDir,'redesign-preview/interaction-feedback.cjs')))modules.Feedback='redesign-preview/interaction-feedback.cjs';
modules.Speech='redesign-preview/product-speech.cjs';
modules.StockRepair='redesign-preview/stock-unit-corrections.cjs';
const raw=fs.readFileSync(path.join(sourceDir,'redesign-preview/preview.js'),'utf8');
const core=`window.CountCore=require(${JSON.stringify(path.join(sourceDir,'count-core.js'))});\n`;
const imports=Object.entries(modules).map(([name,file])=>`const ${name}=require(${JSON.stringify(path.join(sourceDir,file))});`).join('\n');
const stripped=raw.replace(/^import .*;\n/gm,'').replace(/boot\(\)\.catch\([\s\S]*$/,'');
const fixture=JSON.parse(fs.readFileSync(path.join(sourceDir,'current-order.json'),'utf8'));
const aliases=JSON.parse(fs.readFileSync(path.join(sourceDir,'redesign-preview/aliases.json'),'utf8'));
const expose=`
window.__ccx={copied:[],shared:[],reads:0,
 setup(role='owner',mode='finalized',fresh=true){
  busy=false;skipActUntil=0;
  if(typeof orderSearchOpen!=='undefined')orderSearchOpen=false;
  if(fresh&&typeof searchActivity!=='undefined')searchActivity.clear();
  clearTimeout(cloudTimer);clearTimeout(orderTimer);if(fresh)localStorage.clear();lastLocalRaw=localStorage.getItem(KEY);
  source=${JSON.stringify(fixture)};aliasById=new Map(${JSON.stringify(aliases.items)}.map(x=>[x.id,x.aliases]));
  releaseLocked=false;configFailed=false;sample=false;demoRole=null;peerEnabled=true;peerViewing=true;
  member={role,name:role==='owner'?'测试甲':'测试乙'};user={uid:'test-'+role};
  draft=Core().create(source,'2026-10-26','count-browser-fixture');
  draft.seen={};draft.ackWrong={};
  for(const p of draft.catalog){const r=draft.items[p.id];r.stock=p.hasStock?'2':'';r.stockStatus=p.hasStock?'counted':'exempt';r.quantity='1';r.decision='order';r.processed=true;r.acknowledged=true;draft.seen[p.id]=true;}
  draft.items['cn:45'].unit='봉';draft.items['other:11'].unit='세트';draft.status=mode==='draft'?'draft':'reviewed';
  order=mode==='draft'?null:{id:'count-browser-fixture',schema:'ccx-cloud-1',date:draft.date,revision:3,orderStage:'finalized',updatedByName:member.name,snapshot:JSON.stringify(draft),quantities:Object.fromEntries(draft.catalog.map(p=>[p.id,1000])),units:Object.fromEntries(draft.catalog.map(p=>[p.id,draft.items[p.id].unit]))};
  orderDirty=false;orderFlight=null;orderStageWriting=false;orderAutoBlocked=false;orderLocalFailed=false;orderSaveNotice=null;
  peerBase={localId:draft.id,orderId:'count-browser-fixture',stage:mode==='draft'?'draft':'finalized',revision:3,draft:C.clone(draft)};peerLatest=peerBase;peerFlight=null;peerRestoreFlight=null;
  peerApi={read:async()=>{window.__ccx.reads++;throw Error('No backend call allowed');},save:async(base,next)=>({...base,revision:base.revision+1,draft:C.clone(next)})};
  api={read:async()=>{window.__ccx.reads++;throw Error('No backend call allowed');},history:async()=>[]};
  if(order){rememberStocks();baseQty={...order.quantities};baseUnits={...order.units};beginOrderSession(order);}else{stocks={};stockBase={};stockBaseUnits={};baseQty={};baseUnits={};orderBase=null;}
  localBlocked=false;localConflict=false;localSaveFailed=false;cloudConflict=false;cloudPending=false;cloudReady=true;cloudPhase='saved';
  pos=0;field='stock';screen='order';keypad=false;textMode=false;query='';viewCat='kr';orderCat='kr';moduleEnd=false;
  searchScroll=null;searchCat=null;wantFind=false;editId=null;editRaw=null;editSnap=null;preparedExport=null;history=[];heldPrev={};ack={};yellowOn=true;yellowOnly=false;
  catScroll={kr:0,cn:0,other:0,drinks:0};orderScroll={kr:0,cn:0,other:0,drinks:0};
  window.__ccx.copied=[];window.__ccx.shared=[];window.__ccx.reads=0;
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__ccx.copied.push(text)}});
  Object.defineProperty(navigator,'share',{configurable:true,value:async value=>window.__ccx.shared.push(value.text)});
  render();window.scrollTo(0,0);
 },
 state(){return {orderSearchOpen,screen,orderCat,viewCat,query,searchScroll,searchCat,keypad,textMode,editId,editField,pos,field,activeId:screen==='count'&&!sharedCount()?draft.catalog[pos]?.id:editId,draftValues:C.clone(draft.items),order:order&&{revision:order.revision,quantities:order.quantities,units:order.units,snapshot:order.snapshot},reads:this.reads};},
 values(){return {catalog:C.clone(catalog()),items:C.clone(draft.items),order:order&&{id:order.id,revision:order.revision,quantities:C.clone(order.quantities),units:C.clone(order.units),snapshot:order.snapshot}};},
 cells(){return screen==='count'&&!sharedCount()?countNavigationCells():orderNavigationCells();},
 block(cat){return blockText(cat);},
 counts(){return Object.fromEntries(CATS.map(([cat])=>[cat,catalog().filter(p=>(Flow.catOf?Flow.catOf(p):p.cat)===cat).length]));},
 activity(){return {history:searchActivity.history(),ranked:searchActivity.ranked(catalog().map(p=>p.id),129),status:searchActivity.status()};},
 repaint(){render();},
 async backgroundRefresh(){await Promise.resolve();if(!order){const remote=C.clone(peerBase);remote.revision++;remote.draft.items['kr:8'].quantity='3';peerReceive(remote);}else render();},
 liveValue(id,stock,qty){if(order){stocks[id]=stock;order.quantities[id]=Number(qty)*1000;}else{draft.items[id].stock=stock;draft.items[id].quantity=qty;draft.items[id].decision=qty?'order':'none';}render();},
 shown(id){const p=product(id);return {name:p.name,hasStock:p.hasStock,stock:stockShown(p),stockUnit:stockUnitOf(p),qty:qtyOf(id),unit:order?order.units[id]:draft.items[id].unit};},
 hideAll(cat){for(const p of catalog())if((Flow.catOf?Flow.catOf(p):p.cat)===cat)order.quantities[p.id]=0;orderBase=C.clone(order);baseQty={...order.quantities};render();},
};window.__ccx.setup('owner','finalized',false);
`;
const js=esbuild.buildSync({stdin:{contents:core+imports+stripped+expose,resolveDir:sourceDir,sourcefile:'isolated-mobile-fixture.js'},bundle:true,format:'iife',write:false}).outputFiles[0].text;
const css=fs.readFileSync(path.join(sourceDir,'redesign-preview/preview.css'),'utf8');
const html=`<!doctype html><html lang="zh-CN" data-order-mode="production"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body><div class="banner">川川香 · 订货总控台<small>共同盘货、实时同步、双方定稿</small></div><div id="app"></div><nav class="tabs"><button data-act="tab" data-tab="count">盘货</button><button data-act="tab" data-tab="order">订单</button><button data-act="tab" data-tab="more">更多</button></nav><div id="toast" role="status"></div><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;

const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
const report={source:sourceDir,engine:process.env.CCX_BROWSER_ENGINE||'chromium',sourceHashes:{preview:hash(raw),search:hash(fs.readFileSync(path.join(sourceDir,'redesign-preview/search.cjs'))),activity:hash(fs.readFileSync(path.join(sourceDir,'redesign-preview/search-activity.cjs'))),css:hash(css),runner:hash(fs.readFileSync(__filename))},cases:[],errors:[]};
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function runCase(name,fn){try{report.cases.push({name,pass:true,...(await fn()||{})});}catch(e){report.cases.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message);}}
async function setup(page,role,mode){await page.evaluate(({role,mode})=>window.__ccx.setup(role,mode),{role,mode});await settle(page);}
async function open(page){await page.locator('[data-act="open-order-search"]').click();await settle(page);}
async function fill(page,q){await page.locator('#find').fill(q);await settle(page);}
async function submit(page,q){await fill(page,q);await page.locator('[data-act="submit-search"]').click();await settle(page);}
async function clear(page){await page.locator('[data-act="clear-find"]').click();await settle(page);}
async function back(page){await page.locator('[data-act="cancel-find"]').click();await settle(page);}
async function ids(page){return page.locator('#rows .search-hit').evaluateAll(els=>els.map(el=>el.dataset.id));}
async function geometry(page){return page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}:null;};return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollY,bar:rect('.bar'),find:rect('#find'),rows:rect('#rows'),first:rect('#rows .search-hit'),focus:document.activeElement?.id};});}
async function assertNoOverflow(page,width){const g=await geometry(page);assert.ok(g.scrollWidth<=width+1,JSON.stringify(g));return g;}
async function routeFixture(page){page.setDefaultTimeout(5000);page.on('pageerror',e=>report.errors.push(e.message));await page.route('**/*',async route=>{if(route.request().url()==='https://ccx.invalid/ordering/')await route.fulfill({status:200,contentType:'text/html',body:html});else{report.errors.push('Blocked network '+route.request().url());await route.abort();}});}
async function assertCardValues(page,id){
 const expected=await page.evaluate(id=>window.__ccx.shown(id),id),card=page.locator(`[data-act="hot-find"][data-id="${id}"]`),text=(await card.innerText()).replace(/\s/g,'');
 assert.ok(text.includes(expected.name.replace(/\s/g,'')),'primary name remains visible');
 if(expected.hasStock&&expected.stock!==''){assert.ok(text.includes(String(expected.stock)+expected.stockUnit),'inventory uses its own current unit: '+text);}
 assert.ok(text.includes(String(expected.qty)+expected.unit),'order uses its own current unit: '+text);
 return {id,text,expected};
}

(async()=>{
 const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();
 try{
  for(const width of (process.env.CCX_BROWSER_WIDTHS||'430,375,320').split(',').map(Number))for(const role of (process.env.CCX_BROWSER_ROLES||'owner,editor').split(','))for(const mode of (process.env.CCX_BROWSER_MODES||'draft,finalized').split(',')){
   const context=await browser.newContext({viewport:{width,height:932},isMobile:true,hasTouch:true,deviceScaleFactor:1}),page=await context.newPage();await routeFixture(page);
   try{
    await page.goto('https://ccx.invalid/ordering/');const prefix=`${width}px ${role} ${mode}`;
    await runCase(prefix+' dedicated entry, honest cold recommendations, current values and back to deep order',async()=>{
     await setup(page,role,mode);await page.locator('[data-act="ordercat"][data-cat="cn"]').click();await settle(page);
     const before=await page.evaluate(()=>window.__ccx.values());await page.evaluate(()=>scrollTo(0,1200));await settle(page);const origin=await page.evaluate(()=>scrollY);
     await open(page);assert.equal(await page.locator('.order-search-page').count(),1);assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('order-search')),true);
     assert.equal(await page.locator('.banner').isVisible(),false);assert.equal(await page.locator('.tabs').isVisible(),false);assert.equal(await page.locator('.dock').count(),0);
     assert.match(await page.locator('.search-hot').innerText(),/川川香热搜榜/);assert.match(await page.locator('.search-hot').innerText(),/推荐/);assert.match(await page.locator('.search-history').innerText(),/搜索历史/);
     assert.equal(await page.locator('[data-act="history-find"]').count(),0);assert.deepEqual(await page.evaluate(()=>window.__ccx.activity().ranked),[],'recommendations do not fabricate popularity');
     const recommended=await page.locator('[data-act="hot-find"]').evaluateAll(els=>els.map(el=>el.dataset.id));assert.ok(recommended.length>0&&recommended.length<=12);
     const cards=[];for(const id of recommended)cards.push(await assertCardValues(page,id));
     const g=await assertNoOverflow(page,width);assert.equal(g.focus,'find');assert.ok(g.find.top>=0&&g.find.bottom<g.height);assert.ok(g.bar.bottom<140,'dedicated header leaves room for search content');
     await page.screenshot({path:path.join(outputDir,`${width}-${role}-${mode}-hub-cold.png`)});
     await back(page);assert.equal(await page.locator('.order-search-page').count(),0);assert.equal(await page.locator('.tabs').isVisible(),true);assert.equal(await page.evaluate(()=>window.__ccx.state().orderCat),'cn');
     assert.ok(Math.abs(await page.evaluate(()=>scrollY)-origin)<=3,'back restores prior scroll');assert.deepEqual(await page.evaluate(()=>window.__ccx.values()),before);assert.equal(await page.evaluate(()=>window.__ccx.reads),0);
     return {origin,geometry:g,recommended:cards,networkReads:0};
    });
    await runCase(prefix+' confirmed multi-search, history recall and heat use current independent units',async()=>{
     await setup(page,role,mode);await open(page);const before=await page.evaluate(()=>window.__ccx.values());
     await fill(page,'大葱腐竹虾丸');assert.deepEqual(await ids(page),['kr:7','cn:33','cn:64']);assert.equal((await page.evaluate(()=>window.__ccx.activity().history)).length,0,'keystrokes are not confirmed searches');
     await page.locator('[data-act="submit-search"]').click();await settle(page);assert.equal((await page.evaluate(()=>window.__ccx.activity().history))[0].query,'大葱腐竹虾丸');
     await clear(page);assert.equal(await page.locator('[data-act="history-find"]').count(),1);assert.deepEqual((await page.evaluate(()=>window.__ccx.activity().ranked)).map(x=>x.id).sort(),['cn:33','cn:64','kr:7']);
     await page.locator('[data-act="history-find"]').first().click();await settle(page);assert.deepEqual(await ids(page),['kr:7','cn:33','cn:64']);assert.equal(await page.locator('#find').inputValue(),'大葱腐竹虾丸');
     await submit(page,'娃娃菜水饺芬达');assert.deepEqual(await ids(page),['kr:31','cn:21','other:22']);await clear(page);
     const cards=[];for(const id of ['kr:31','cn:21','other:22','cn:33'])cards.push(await assertCardValues(page,id));
     assert.equal((await page.evaluate(()=>window.__ccx.shown('kr:31'))).stockUnit,'개');assert.equal((await page.evaluate(()=>window.__ccx.shown('cn:21'))).stockUnit,'包');
     const exempt=await page.locator('[data-act="hot-find"][data-id="other:22"]').innerText();assert.match(exempt,/不用|无需|免盘/,'no-stock drinks are explicitly exempt');assert.doesNotMatch(exempt,/库存\s*0/);
     assert.deepEqual(await page.evaluate(()=>window.__ccx.values()),before,'history/heat cannot alter quantities or finalized state');
     // Fixture simulates fresh current data, without a production read/write.
     await page.evaluate(()=>window.__ccx.liveValue('cn:21','0','7'));await settle(page);const live=await assertCardValues(page,'cn:21');assert.match(live.text,/库存[：:]?0包/);assert.ok(live.text.includes('7'+live.expected.unit));
     await page.evaluate(()=>window.__ccx.liveValue('cn:21','','7'));await settle(page);const blank=await page.locator('[data-act="hot-find"][data-id="cn:21"]').innerText();assert.match(blank,/未填|没填/);assert.doesNotMatch(blank,/库存\s*0/);
     await page.locator('[data-act="hot-find"][data-id="cn:33"]').click();await settle(page);assert.ok((await ids(page)).includes('cn:33'));await assertNoOverflow(page,width);assert.equal(await page.evaluate(()=>window.__ccx.reads),0);
     return {cards,live,blankInventoryDistinctFromZero:true,networkReads:0};
    });
    await runCase(prefix+' input identity, composition and reduced keyboard space survive result updates',async()=>{
     await setup(page,role,mode);await open(page);await page.setViewportSize({width,height:530});await settle(page);
     await fill(page,'腐竹');await page.locator('#find').evaluate(el=>{el.dataset.identity='kept';el.setSelectionRange(1,1);});
     await page.evaluate(()=>window.__ccx.repaint());await settle(page);assert.equal(await page.locator('#find').getAttribute('data-identity'),'kept','background render retains native search input');assert.equal(await page.locator('#find').evaluate(el=>el.selectionStart),1,'background render retains caret');
     await page.locator('#find').evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));el.value='大葱腐竹虾丸';el.setSelectionRange(6,6);el.dispatchEvent(new InputEvent('input',{bubbles:true,data:'虾丸',inputType:'insertCompositionText',isComposing:true}));el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',isComposing:true}));});await settle(page);
     assert.equal((await page.evaluate(()=>window.__ccx.activity().history)).length,0,'IME confirmation must not submit prematurely');assert.equal(await page.locator('#find').getAttribute('data-identity'),'kept');
     await page.evaluate(()=>window.__ccx.backgroundRefresh());await settle(page);assert.equal(await page.locator('#find').getAttribute('data-identity'),'kept','peer/background update keeps composing input');assert.equal(await page.locator('#find').evaluate(el=>el.selectionStart),6);
     await page.locator('#find').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:el.value})));await settle(page);assert.deepEqual(await ids(page),['kr:7','cn:33','cn:64']);
     const g=await assertNoOverflow(page,width);assert.ok(g.first.top>=g.bar.bottom-2&&g.first.bottom<=g.height-4,JSON.stringify(g));
     await page.locator('#find').press('Enter');await settle(page);assert.equal((await page.evaluate(()=>window.__ccx.activity().history))[0].query,'大葱腐竹虾丸');
     await page.screenshot({path:path.join(outputDir,`${width}-${role}-${mode}-hub-results.png`)});
     // Native IMEs can deliver composition completion after clear/back. The
     // cleared query and returned order must not be revived by these events.
     await page.locator('#find').evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='腐';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'腐'}));});await clear(page);
     await page.locator('#find').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'腐'})));await settle(page);assert.equal(await page.locator('#find').inputValue(),'');assert.equal(await page.evaluate(()=>window.__ccx.state().query),'');assert.equal(await page.locator('.search-hot').count(),1);
     await page.locator('#find').evaluate(el=>{window.__oldSearchInput=el;el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='虾';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'虾'}));});await page.setViewportSize({width,height:932});await settle(page);await back(page);
     await page.evaluate(()=>{const el=window.__oldSearchInput;el.value='虾丸';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'丸'}));el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'虾丸'}));});await settle(page);assert.equal(await page.evaluate(()=>window.__ccx.state().query),'');assert.equal(await page.locator('.order-search-page').count(),0);
     return {geometry:g,nativeInputRetained:true,syntheticCompositionChecked:true,compositionClearAndBackSafe:true};
    });
    await runCase(prefix+(mode==='draft'?' quantity edit keeps search then returns to order':' finalized hot/results stay read-only'),async()=>{
     await setup(page,role,mode);await open(page);await submit(page,'腐竹虾丸');const before=await page.evaluate(()=>window.__ccx.values());
     if(mode==='draft'){
      await page.locator('[data-act="edit"][data-search="true"][data-id="cn:33"][data-field="qty"]').click();await settle(page);
      assert.equal(await page.locator('.pad').count(),1);assert.equal(await page.evaluate(()=>window.__ccx.state().orderSearchOpen),true);
      for(const k of ['del','1','2']){await page.locator(`[data-act="key"][data-key="${k}"]`).click();await settle(page);}
      assert.equal(await page.evaluate(()=>window.__ccx.state().draftValues['cn:33'].quantity),'12');
      await page.locator('[data-act="close"]').click();await settle(page);assert.equal(await page.locator('.pad').count(),0);assert.deepEqual(await ids(page),['cn:33','cn:64']);assert.equal(await page.locator('#find').inputValue(),'腐竹虾丸');
      await clear(page);const card=await assertCardValues(page,'cn:33');assert.ok(card.text.includes('12'+card.expected.unit));await back(page);
      assert.equal(await page.locator('[data-act="open-order-search"]').count(),1);const after=await page.evaluate(()=>window.__ccx.values());
      for(const [id,v] of Object.entries(before.items)){assert.equal(after.items[id].stock,v.stock);assert.equal(after.items[id].unit,v.unit);if(id!=='cn:33')assert.equal(after.items[id].quantity,v.quantity);}
      assert.equal(after.items['cn:33'].quantity,'12');
     }else{
      assert.equal(await page.locator('#rows [data-act="edit"],#rows [data-act="open"]').count(),0);const cells=page.locator('#rows .cell');assert.ok(await cells.count()>0);assert.ok((await cells.evaluateAll(els=>els.map(el=>el.getAttribute('aria-disabled')))).every(v=>v==='true'));
      await cells.first().click({force:true});await settle(page);assert.equal(await page.locator('.pad').count(),0);await clear(page);await page.locator('[data-act="hot-find"][data-id="cn:33"]').click();await settle(page);assert.equal(await page.locator('#rows [data-act="edit"]').count(),0);await back(page);assert.deepEqual(await page.evaluate(()=>window.__ccx.values()),before);
     }
     assert.equal(await page.evaluate(()=>window.__ccx.reads),0);return {queryPreserved:true,networkReads:0};
    });
   }finally{await context.close();}
  }
  await runCase('local search history survives reload and the same rules apply after account handoff',async()=>{
   const context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true}),page=await context.newPage();await routeFixture(page);
   try{await page.goto('https://ccx.invalid/ordering/');await setup(page,'owner','finalized');await open(page);await submit(page,'大葱腐竹虾丸');await back(page);const before=await page.evaluate(()=>window.__ccx.activity());await page.reload();await settle(page);await open(page);assert.deepEqual(await page.evaluate(()=>window.__ccx.activity().history),before.history);assert.equal(await page.locator('[data-act="history-find"]').count(),1);
    await back(page);await page.evaluate(()=>window.__ccx.setup('editor','finalized',false));await settle(page);await open(page);assert.equal(await page.locator('[data-act="history-find"]').count(),1);await page.locator('[data-act="history-find"]').click();await settle(page);assert.deepEqual(await ids(page),['kr:7','cn:33','cn:64']);assert.equal(await page.locator('#rows [data-act="edit"]').count(),0);return {persists:true,sameDeviceAccountHandoff:true};
   }finally{await context.close();}
  });
  await runCase('clear history honors cancel and confirm, safely renders unmatched text and never mutates order',async()=>{
   const context=await browser.newContext({viewport:{width:320,height:932},isMobile:true,hasTouch:true}),page=await context.newPage();await routeFixture(page);
   try{await page.goto('https://ccx.invalid/ordering/');await setup(page,'owner','finalized');const before=await page.evaluate(()=>window.__ccx.values());await open(page);await submit(page,'腐竹');await submit(page,'<img src=x onerror=alert(1)>不存在商品');await clear(page);
    assert.ok(await page.locator('[data-act="history-find"]').count()>=1);assert.equal(await page.locator('#rows img').count(),0,'history is escaped text');
    const activity=await page.evaluate(()=>window.__ccx.activity());page.once('dialog',d=>d.dismiss());await page.locator('[data-act="clear-history"]').click();await settle(page);assert.deepEqual(await page.evaluate(()=>window.__ccx.activity().history),activity.history);
    page.once('dialog',d=>d.accept());await page.locator('[data-act="clear-history"]').click();await settle(page);assert.deepEqual(await page.evaluate(()=>window.__ccx.activity().history),[]);assert.deepEqual(await page.evaluate(()=>window.__ccx.activity().ranked),[]);assert.equal(await page.locator('[data-act="history-find"]').count(),0);assert.match(await page.locator('.search-hot').innerText(),/推荐/);
    await fill(page,'不存在商品');assert.equal(await page.locator('#rows .search-hit').count(),0);assert.match(await page.locator('#rows').innerText(),/没有匹配|未找到|没有找到/);await fill(page,'虾'.repeat(5000));assert.equal(await page.locator('#rows .search-hit').count(),0);await assertNoOverflow(page,320);await back(page);assert.deepEqual(await page.evaluate(()=>window.__ccx.values()),before);return {cancelRespected:true,historyAndHeatCleared:true,escapedText:true,longQuerySafe:true};
   }finally{await context.close();}
  });
  await runCase('denied search storage keeps searching and session history usable',async()=>{
   const context=await browser.newContext({viewport:{width:375,height:932},isMobile:true,hasTouch:true});await context.addInitScript(()=>{for(const method of ['getItem','setItem','removeItem']){const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){if(String(key).includes('search'))throw new DOMException('Fixture denies search storage','SecurityError');return original.call(this,key,...args);};}});const page=await context.newPage();await routeFixture(page);
   try{await page.goto('https://ccx.invalid/ordering/');await setup(page,'editor','finalized');await open(page);await submit(page,'腐竹');assert.deepEqual(await ids(page),['cn:33']);await clear(page);assert.equal(await page.locator('[data-act="history-find"]').count(),1);assert.equal(await page.evaluate(()=>window.__ccx.activity().status.persistent),false);await page.locator('[data-act="history-find"]').click();await settle(page);assert.deepEqual(await ids(page),['cn:33']);await assertNoOverflow(page,375);return {blockedStorageHandled:true,sessionHistoryUsable:true};
   }finally{await context.close();}
  });
 }finally{await browser.close();}
 report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.length-report.passed;fs.writeFileSync(path.join(outputDir,'search-hub-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({engine:report.engine,browserVersion:report.browserVersion,passed:report.passed,failed:report.failed,errors:report.errors,cases:report.cases.map(({name,pass,error})=>({name,pass,error}))},null,2));if(report.failed||report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
