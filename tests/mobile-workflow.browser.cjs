'use strict';
// Isolated DOM/layout rehearsal of the actual application source. No Firebase
// boot, production credentials, or outgoing requests are allowed in this runner.
// Usage: CCX_PLAYWRIGHT_MODULE=/path/to/playwright node tests/mobile-workflow.browser.cjs
// Optional: CCX_BROWSER_SOURCE=/path/to/v42 --baseline (records known failures).
// Tested with Playwright 1.56.1, Chromium 141 and WebKit 26. Set
// CCX_BROWSER_ENGINE=webkit for the second engine. Widths default to 430/375;
// override CCX_BROWSER_WIDTHS and CCX_BROWSER_ROLES for targeted reproduction.
// A 530px viewport rehearses reduced keyboard space. Native iOS keyboards and
// the OS share/clipboard UI still require a real device; outgoing payloads are
// captured locally here instead of opening apps or sending anything.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),sourceDir=process.env.CCX_BROWSER_SOURCE||repo;
const baseline=process.argv.includes('--baseline');
const playwright=require(process.env.CCX_PLAYWRIGHT_MODULE||'playwright');
const esbuild=require(path.join(repo,'node_modules/esbuild'));
const outputDir=process.env.CCX_BROWSER_OUTPUT||'/tmp/ccx-mobile-regression';
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
 setup(role='owner',mode='finalized'){
  if(typeof orderSearchOpen!=='undefined')orderSearchOpen=false;
  if(typeof searchActivity!=='undefined')searchActivity.clear();
  clearTimeout(cloudTimer);clearTimeout(orderTimer);localStorage.clear();lastLocalRaw=null;
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
 state(){return {screen,orderCat,viewCat,query,searchScroll,searchCat,preparedExport:preparedExport&&{cat:preparedExport.cat,text:preparedExport.text},order:order&&{revision:order.revision,quantities:order.quantities,units:order.units,snapshot:order.snapshot},stockUnits:['kr:31','cn:21'].map(id=>stockUnitOf(product(id))),reads:this.reads};},
 block(cat){return blockText(cat);},
 counts(){return Object.fromEntries(CATS.map(([cat])=>[cat,catalog().filter(p=>(Flow.catOf?Flow.catOf(p):p.cat)===cat).length]));},
 hideAll(cat){for(const p of catalog())if((Flow.catOf?Flow.catOf(p):p.cat)===cat)order.quantities[p.id]=0;orderBase=C.clone(order);baseQty={...order.quantities};render();},
};window.__ccx.setup();
`;
const js=esbuild.buildSync({stdin:{contents:core+imports+stripped+expose,resolveDir:sourceDir,sourcefile:'isolated-mobile-fixture.js'},bundle:true,format:'iife',write:false}).outputFiles[0].text;
const css=fs.readFileSync(path.join(sourceDir,'redesign-preview/preview.css'),'utf8');
const html=`<!doctype html><html lang="zh-CN" data-order-mode="production"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body><div class="banner">川川香 · 订货总控台<small>共同盘货、实时同步、双方定稿</small></div><div id="app"></div><nav class="tabs"><button data-act="tab" data-tab="count">盘货</button><button data-act="tab" data-tab="order">订单</button><button data-act="tab" data-tab="more">更多</button></nav><div id="toast" role="status"></div><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
const report={baseline,source:sourceDir,engine:process.env.CCX_BROWSER_ENGINE||'chromium',sourceHashes:{preview:hash(raw),search:hash(fs.readFileSync(path.join(sourceDir,'redesign-preview/search.cjs'))),...(fs.existsSync(path.join(sourceDir,'redesign-preview/search-activity.cjs'))?{activity:hash(fs.readFileSync(path.join(sourceDir,'redesign-preview/search-activity.cjs')))}:{}),css:hash(css),runner:hash(fs.readFileSync(__filename))},cases:[],errors:[]};
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function geometry(page){return page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,height:r.height}:null;},r=rect('#rows'),b=rect('.bar'),f=rect('#rows .search-hit');return {scrollY,rowsTop:r?.top,barBottom:b?.bottom,firstTop:f?.top,firstBottom:f?.bottom,height:innerHeight,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,activeElement:document.activeElement?.id,visualViewport:window.visualViewport?{offsetTop:visualViewport.offsetTop,height:visualViewport.height,scale:visualViewport.scale}:null,banner:rect('.banner'),bar:b,rows:r,first:f,input:rect('#find'),app:rect('#app'),appPadding:getComputedStyle(document.querySelector('#app')).padding,bodyHeight:document.body.scrollHeight,documentHeight:document.documentElement.scrollHeight};});}
async function openSearch(page){const entry=page.locator('[data-act="open-order-search"]');if(await entry.count()){await entry.click();await settle(page);}}
async function runCase(name,fn){try{const detail=await fn();report.cases.push({name,pass:true,...(detail||{})});}catch(e){report.cases.push({name,pass:false,error:e.message});if(!baseline)console.error('FAIL',name,e.message);}}
(async()=>{
 const browser=await playwright[process.env.CCX_BROWSER_ENGINE||'chromium'].launch({headless:true});
 report.browserVersion=browser.version();
 try{
  for(const width of (process.env.CCX_BROWSER_WIDTHS?process.env.CCX_BROWSER_WIDTHS.split(',').map(Number):baseline?[430]:[430,375]))for(const role of (process.env.CCX_BROWSER_ROLES?process.env.CCX_BROWSER_ROLES.split(','):baseline?['owner']:['owner','editor'])){
   const context=await browser.newContext({viewport:{width,height:932},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   const page=await context.newPage();page.setDefaultTimeout(5000);
   page.on('pageerror',e=>report.errors.push(e.message));
   await page.route('**/*',async route=>{if(route.request().url()==='https://ccx.invalid/ordering/')await route.fulfill({status:200,contentType:'text/html',body:html});else{report.errors.push('Blocked network '+route.request().url());await route.abort();}});
   await page.goto('https://ccx.invalid/ordering/');await page.evaluate(role=>window.__ccx.setup(role),role);await settle(page);
   const prefix=`${width}px ${role}`;
   await runCase(prefix+' search from deep order scroll',async()=>{
    await page.locator('[data-act="ordercat"][data-cat="cn"]').click();await settle(page);
    await page.evaluate(()=>window.scrollTo(0,1200));await settle(page);
    const origin=await page.evaluate(()=>scrollY);
    const before=await geometry(page);await openSearch(page);await page.locator('#find').fill('腐竹');await settle(page);
    const g=await geometry(page);fs.writeFileSync(path.join(outputDir,`${baseline?'baseline':'fixed'}-${width}-${role}-search-geometry.json`),JSON.stringify({before,after:g},null,2));await page.screenshot({path:path.join(outputDir,`${baseline?'baseline':'fixed'}-${width}-${role}-search.png`)});
    assert.ok(g.firstTop>=g.barBottom-2&&g.firstBottom<=g.height-5,JSON.stringify(g));
    assert.equal(await page.evaluate(()=>window.__ccx.state().searchScroll),origin);
    await page.locator('[data-act="cancel-find"]').click();await settle(page);
    assert.ok(Math.abs(await page.evaluate(()=>scrollY)-origin)<=3,'return to original list position');
    return {origin,geometry:g};
   });
   // Reset after the baseline failure so the second defect is independently observable.
   await page.evaluate(role=>window.__ccx.setup(role),role);await settle(page);
   await runCase(prefix+' preview follows supplier switch and copy/share',async()=>{
    await page.locator('[data-act="ordercat"][data-cat="cn"]').click();await page.locator('[data-act="preview"]').click();await settle(page);
    const before=await page.locator('textarea[readonly]').inputValue();
    await page.locator('[data-act="ordercat"][data-cat="kr"]').click();await settle(page);
    const after=await page.locator('textarea[readonly]').inputValue(),expected=await page.evaluate(()=>window.__ccx.block('kr'));
    await page.screenshot({path:path.join(outputDir,`${baseline?'baseline':'fixed'}-${width}-${role}-preview.png`)});
    assert.notEqual(after,before,'Chinese text must not remain under Korean category');assert.equal(after,expected);
    await page.locator('[data-act="export-copy"]').click();await page.locator('[data-act="export-share"]').click();
    assert.deepEqual(await page.evaluate(()=>[window.__ccx.copied.at(-1),window.__ccx.shared.at(-1)]),[expected,expected]);
    assert.equal(await page.evaluate(()=>window.__ccx.reads),0);return {changed:true,networkReads:0};
   });
   if(!baseline){
    await page.evaluate(role=>window.__ccx.setup(role),role);await settle(page);
    await runCase(prefix+' four supplier tabs partition all 137 goods',async()=>{
     assert.deepEqual(await page.evaluate(()=>window.__ccx.counts()),{kr:49,cn:70,other:13,drinks:5});
     const before=await page.evaluate(()=>window.__ccx.state().order);
     for(const cat of ['cn','other','drinks','kr','drinks']){
      await page.locator(`[data-act="ordercat"][data-cat="${cat}"]`).click();await settle(page);
      await page.locator('[data-act="preview"]').click();await settle(page);
      const expected=await page.evaluate(cat=>window.__ccx.block(cat),cat);
      assert.equal(await page.locator('textarea[readonly]').inputValue(),expected);
      await page.locator('[data-act="export-copy"]').click();await page.locator('[data-act="export-share"]').click();
      assert.deepEqual(await page.evaluate(()=>[window.__ccx.copied.at(-1),window.__ccx.shared.at(-1)]),[expected,expected]);
      assert.equal(await page.evaluate(()=>window.__ccx.state().preparedExport.cat),cat);
     }
     assert.deepEqual(await page.evaluate(()=>window.__ccx.state().order),before);
     const other=await page.evaluate(()=>window.__ccx.block('other')),drinks=await page.evaluate(()=>window.__ccx.block('drinks'));
     assert.doesNotMatch(other,/칠성사이다|코카콜라|환타/);for(const name of ['칠성사이다','(zero)칠성사이다','코카콜라','(zero)코카콜라','환타'])assert.ok(drinks.includes(name));
     assert.equal(await page.evaluate(()=>window.__ccx.reads),0);return {counts:{kr:49,cn:70,other:13,drinks:5},noQuantityChanges:true};
    });
    await runCase(prefix+' search with preview above sticky header and small viewport',async()=>{
     await page.locator('[data-act="ordercat"][data-cat="cn"]').click();await settle(page);
     await page.evaluate(()=>window.scrollTo(0,1400));await settle(page);
     await page.setViewportSize({width,height:530});await settle(page);
     await openSearch(page);await page.locator('#find').fill('腐竹');await settle(page);
     const g=await geometry(page);assert.ok(g.firstTop>=g.barBottom-2&&g.firstBottom<=g.height-4,JSON.stringify(g));
     assert.ok(g.scrollWidth<=width+1,'no horizontal overflow');
     const sameInput=await page.locator('#find').evaluate(el=>{el.dataset.testIdentity='same';return el.dataset.testIdentity;});
     await page.locator('#find').fill('鸡精');await settle(page);assert.equal(await page.locator('#find').getAttribute('data-test-identity'),sameInput);
     const g2=await geometry(page);assert.ok(g2.firstTop>=g2.barBottom-2&&g2.firstBottom<=g2.height-4,JSON.stringify(g2));
     await page.setViewportSize({width,height:932});await settle(page);await page.locator('[data-act="cancel-find"]').click();await settle(page);
     return {geometry:g,inputIdentityPreserved:true};
    });
    await page.evaluate(role=>window.__ccx.setup(role),role);await settle(page);
    await runCase(prefix+' empty supplier preview replaces previous text',async()=>{
     await page.evaluate(()=>window.__ccx.hideAll('drinks'));
     await page.locator('[data-act="ordercat"][data-cat="cn"]').click();await page.locator('[data-act="preview"]').click();await settle(page);
     await page.locator('[data-act="ordercat"][data-cat="drinks"]').click();await settle(page);
     assert.match(await page.locator('textarea[readonly]').inputValue(),/这次不订/);
     assert.doesNotMatch(await page.locator('textarea[readonly]').inputValue(),/鸡精|腐竹/);
    });
    await page.evaluate(role=>window.__ccx.setup(role,'draft'),role);await settle(page);
    await runCase(prefix+' draft count has new stock units and beverage tab',async()=>{
     assert.deepEqual(await page.evaluate(()=>window.__ccx.state().stockUnits),['개','包']);
     await page.locator('[data-tab="count"]').click();await settle(page);
     await page.locator('[data-act="jumpcat"][data-cat="drinks"]').click();await settle(page);
     assert.equal(await page.locator('#rows .line').count(),5);
     for(const name of ['칠성사이다','코카콜라','환타'])assert.match(await page.locator('#rows').innerText(),new RegExp(name));
     assert.equal(await page.locator('#rows .cell[data-field="stock"]').count(),0);
     const g=await geometry(page);assert.ok(g.scrollWidth<=width+1,'no horizontal overflow');
     return {stockUnits:['개','包'],drinkRows:5};
    });
   }
   await context.close();
  }
 }finally{await browser.close();}
 report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.length-report.passed;
 fs.writeFileSync(path.join(outputDir,baseline?'baseline-report.json':'browser-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 if(!baseline&&(report.failed||report.errors.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
