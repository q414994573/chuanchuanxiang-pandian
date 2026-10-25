'use strict';
// Focused native select/mobile-width regression against the actual application source. No Firebase
// boot, production credentials, or outgoing requests are allowed in this runner.
// Usage: CCX_PLAYWRIGHT_MODULE=/path/to/playwright node tests/mobile-layout.browser.cjs
// Optional: CCX_LAYOUT_CSS=/path/to/v43.css --baseline (records the original CSS defect).
// Tested with Playwright 1.56.1, Chromium 141 and WebKit 26. Set
// CCX_BROWSER_ENGINE=webkit for the second engine. Widths default to 430/375/320;
// override CCX_BROWSER_WIDTHS for targeted reproduction. This CSS suite uses one
// role because account rules are covered separately by the functional suite.
// Native iOS keyboards and
// the OS share/clipboard UI still require a real device; outgoing payloads are
// captured locally here instead of opening apps or sending anything.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),sourceDir=process.env.CCX_BROWSER_SOURCE||repo;
const baseline=process.argv.includes('--baseline');
const playwright=require(process.env.CCX_PLAYWRIGHT_MODULE||'playwright');
const esbuild=require(path.join(repo,'node_modules/esbuild'));
const outputDir=process.env.CCX_BROWSER_OUTPUT||'/tmp/ccx-mobile-layout';
fs.mkdirSync(outputDir,{recursive:true});
const modules={Feedback:'redesign-preview/interaction-feedback.cjs',C:'cloud/core.cjs',A:'cloud/account.cjs',S:'redesign-preview/search.cjs',Flow:'redesign-preview/count-flow.cjs',Backup:'redesign-preview/draft-backup.cjs',Recovery:'redesign-preview/recovery.cjs',Entry:'redesign-preview/entry-mode.cjs',Auto:'redesign-preview/order-autosave.cjs',Shared:'redesign-preview/shared-draft.cjs'};
if(fs.existsSync(path.join(sourceDir,'redesign-preview/interaction-feedback.cjs')))modules.Feedback='redesign-preview/interaction-feedback.cjs';
const raw=fs.readFileSync(path.join(sourceDir,'redesign-preview/preview.js'),'utf8');
const core=`window.CountCore=require(${JSON.stringify(path.join(sourceDir,'count-core.js'))});\n`;
const imports=Object.entries(modules).map(([name,file])=>`const ${name}=require(${JSON.stringify(path.join(sourceDir,file))});`).join('\n');
const stripped=raw.replace(/^import .*;\n/gm,'').replace(/boot\(\)\.catch\([\s\S]*$/,'');
const fixture=JSON.parse(fs.readFileSync(path.join(sourceDir,'current-order.json'),'utf8'));
const aliases=JSON.parse(fs.readFileSync(path.join(sourceDir,'redesign-preview/aliases.json'),'utf8'));
const expose=`
window.__ccx={copied:[],shared:[],reads:0,
 setup(role='owner',mode='finalized'){
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
 state(){return {draftValues:draft&&C.clone(draft.items),screen,orderCat,viewCat,query,searchScroll,searchCat,preparedExport:preparedExport&&{cat:preparedExport.cat,text:preparedExport.text},order:order&&{revision:order.revision,quantities:order.quantities,units:order.units,snapshot:order.snapshot},stockUnits:['kr:31','cn:21'].map(id=>stockUnitOf(product(id))),reads:this.reads};},
 block(cat){return blockText(cat);},
 counts(){return Object.fromEntries(CATS.map(([cat])=>[cat,catalog().filter(p=>(Flow.catOf?Flow.catOf(p):p.cat)===cat).length]));},
 hideAll(cat){for(const p of catalog())if((Flow.catOf?Flow.catOf(p):p.cat)===cat)order.quantities[p.id]=0;orderBase=C.clone(order);baseQty={...order.quantities};render();},
};window.__ccx.setup();
`;
const js=esbuild.buildSync({stdin:{contents:core+imports+stripped+expose,resolveDir:sourceDir,sourcefile:'isolated-mobile-fixture.js'},bundle:true,format:'iife',write:false}).outputFiles[0].text;
const css=fs.readFileSync(process.env.CCX_LAYOUT_CSS||path.join(sourceDir,'redesign-preview/preview.css'),'utf8');
const html=`<!doctype html><html lang="zh-CN" data-order-mode="production"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body><div class="banner">川川香 · 订货总控台<small>共同盘货、实时同步、双方定稿</small></div><div id="app"></div><nav class="tabs"><button data-act="tab" data-tab="count">盘货</button><button data-act="tab" data-tab="order">订单</button><button data-act="tab" data-tab="more">更多</button></nav><div id="toast" role="status"></div><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;

const report={baseline,source:sourceDir,engine:process.env.CCX_BROWSER_ENGINE||'chromium',cases:[],errors:[]};
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function runCase(name,fn){try{const detail=await fn();report.cases.push({name,pass:true,...(detail||{})});}catch(e){report.cases.push({name,pass:false,error:e.message});if(!baseline)console.error('FAIL',name,e.message);}}
async function bounds(page){return page.evaluate(()=>{
 const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,center:(r.left+r.right)/2};};
 return {viewport:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,scrollX,scale:visualViewport?.scale,app:rect(document.getElementById('app')),banner:rect(document.querySelector('.banner')),tabs:rect(document.querySelector('.tabs')),
  columns:[...document.querySelectorAll('.count-columns span')].map(rect),
  rows:[...document.querySelectorAll('#rows .line')].map(el=>({id:el.dataset.id||el.dataset.row,rect:rect(el),quantity:rect(el.lastElementChild),name:el.querySelector('.who').textContent})),
  pickers:[...document.querySelectorAll('select[data-unit]')].map(el=>({id:el.dataset.unit,field:el.dataset.field,disabled:el.disabled,value:el.value,rect:rect(el),options:[...el.options].map(o=>({value:o.value,text:o.textContent}))}))};
});}
function assertWidth(g,width){
 assert.ok(g.scrollWidth<=width+1,`document ${g.scrollWidth}px exceeds ${width}px viewport`);
 assert.equal(g.viewport,width);assert.ok(Math.abs(g.app.width-width)<=1,'full-width app');assert.ok(Math.abs(g.banner.width-width)<=1,'full-width banner');
 assert.equal(g.scrollX,0,'no horizontal scroll');
 for(const row of g.rows){assert.ok(row.rect.left>=-1&&row.rect.right<=width+1,`row outside viewport: ${row.name}`);assert.ok(Math.abs(row.quantity.center-g.columns[2].center)<=1,`quantity/header alignment: ${row.name}`);}
 for(const picker of g.pickers){assert.ok(picker.rect.left>=0&&picker.rect.right<=width+1,'unit picker inside viewport');assert.ok(picker.rect.height>=44,'native unit picker retains 44px touch target');}
}
(async()=>{
 const browser=await playwright[process.env.CCX_BROWSER_ENGINE||'chromium'].launch({headless:true});report.browserVersion=browser.version();
 try{
  for(const width of (process.env.CCX_BROWSER_WIDTHS?process.env.CCX_BROWSER_WIDTHS.split(',').map(Number):[430,375,320]))for(const mode of ['finalized','draft']){
   const context=await browser.newContext({viewport:{width,height:932},isMobile:true,hasTouch:true,deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(5000);
   page.on('pageerror',e=>report.errors.push(e.message));
   await page.route('**/*',async route=>{if(route.request().url()==='https://ccx.invalid/ordering/')await route.fulfill({status:200,contentType:'text/html',body:html});else{report.errors.push('Blocked network '+route.request().url());await route.abort();}});
   try{
    await page.goto('https://ccx.invalid/ordering/');await page.evaluate(mode=>window.__ccx.setup('owner',mode),mode);await settle(page);
    await runCase(`${width}px ${mode} count all four categories fit and align`,async()=>{
     await page.locator('[data-tab="count"]').click();await settle(page);const categories={};
     for(const cat of ['kr','cn','other','drinks']){
      await page.locator(`[data-act="jumpcat"][data-cat="${cat}"]`).click();await settle(page);
      const g=await bounds(page);categories[cat]=g;
      if(cat==='other')await page.screenshot({path:path.join(outputDir,`${baseline?'baseline':'fixed'}-${width}-${mode}-other.png`)});
      assertWidth(g,width);assert.equal(g.rows.length,{kr:45,cn:66,other:13,drinks:5}[cat]);
     }
     return {categories};
    });
    // This separately inspects the same unit control inside the order layout.
    await runCase(`${width}px ${mode} order all four categories fit`,async()=>{
     await page.locator('[data-tab="order"]').click();await settle(page);const categories={};
     for(const cat of ['kr','cn','other','drinks']){
      await page.locator(`[data-act="ordercat"][data-cat="${cat}"]`).click();await settle(page);const g=await bounds(page);categories[cat]=g;assertWidth(g,width);
     }
     return {categories};
    });
    await runCase(`${width}px ${mode} native bowl unit choices stay usable`,async()=>{
     await page.locator('[data-tab="count"]').click();await page.locator('[data-act="jumpcat"][data-cat="other"]').click();await settle(page);
     let picker=page.locator('select[data-unit="other:11"][data-field="qty"]');
     assert.deepEqual(await picker.locator('option').evaluateAll(els=>els.map(el=>el.value)),['','세트','몸통만']);
     assert.match(await picker.textContent(),/盒身和盖子一套/);assert.match(await picker.textContent(),/只要盒身，不要盖子/);
     assert.equal(await picker.isDisabled(),mode==='finalized');
     if(mode==='draft'){
      const before=await page.evaluate(()=>window.__ccx.state().draftValues['other:11'].quantity);
      for(const value of ['몸통만','세트']){
       await picker.selectOption(value);await settle(page);picker=page.locator('select[data-unit="other:11"][data-field="qty"]');
       assert.equal(await picker.inputValue(),value);assert.equal(await page.evaluate(()=>window.__ccx.state().draftValues['other:11'].quantity),before);assertWidth(await bounds(page),width);
      }
      // A DOM-injected unsupported value must still be rejected by the normal
      // application handler; styling the picker cannot widen allowed units.
      await picker.evaluate(el=>{el.add(new Option('不允许的单位','invalid-unit'));el.value='invalid-unit';el.dispatchEvent(new Event('change',{bubbles:true}));});await settle(page);
      assert.equal(await page.locator('select[data-unit="other:11"][data-field="qty"]').inputValue(),'세트');
      assert.equal(await page.evaluate(()=>window.__ccx.state().draftValues['other:11'].quantity),before);
      assert.match(await page.locator('#toast').textContent(),/请选择模板规定的单位/);
     }
     const g=await bounds(page);assertWidth(g,width);return {locked:mode==='finalized',picker:g.pickers.find(p=>p.id==='other:11'),networkReads:await page.evaluate(()=>window.__ccx.reads)};
    });
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.length-report.passed;
 fs.writeFileSync(path.join(outputDir,baseline?'baseline-layout-report.json':'layout-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({engine:report.engine,browserVersion:report.browserVersion,baseline,passed:report.passed,failed:report.failed,errors:report.errors,cases:report.cases.map(({name,pass,error})=>({name,pass,error}))},null,2));
 if(!baseline&&(report.failed||report.errors.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
