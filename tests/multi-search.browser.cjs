'use strict';
// Multi-product search rehearsal against the actual application source and CSS.
// Firebase boot is removed; every external request is blocked. The fixture owns
// fictional local orders and captures clipboard/share without sending anything.
// Run with CCX_PLAYWRIGHT_MODULE and CCX_BROWSER_ENGINE=chromium|webkit.
// Widths 430/375/320, owner/editor and draft/finalized are checked by default.
// This verifies DOM events and layout, not a physical iOS keyboard or its IME.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),sourceDir=process.env.CCX_BROWSER_SOURCE||repo;
const playwright=require(process.env.CCX_PLAYWRIGHT_MODULE||'playwright');
const esbuild=require(path.join(repo,'node_modules/esbuild'));
const outputDir=process.env.CCX_BROWSER_OUTPUT||'/tmp/ccx-multi-search';
fs.mkdirSync(outputDir,{recursive:true});
const modules={C:'cloud/core.cjs',A:'cloud/account.cjs',S:'redesign-preview/search.cjs',Flow:'redesign-preview/count-flow.cjs',Backup:'redesign-preview/draft-backup.cjs',Recovery:'redesign-preview/recovery.cjs',Entry:'redesign-preview/entry-mode.cjs',Auto:'redesign-preview/order-autosave.cjs',Shared:'redesign-preview/shared-draft.cjs'};
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
  busy=false;skipActUntil=0;
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
 state(){return {screen,orderCat,viewCat,query,searchScroll,searchCat,keypad,textMode,editId,editField,pos,field,activeId:screen==='count'&&!sharedCount()?draft.catalog[pos]?.id:editId,draftValues:C.clone(draft.items),order:order&&{revision:order.revision,quantities:order.quantities,units:order.units,snapshot:order.snapshot},reads:this.reads};},
 values(){return {catalog:C.clone(catalog()),items:C.clone(draft.items),order:order&&{id:order.id,revision:order.revision,quantities:C.clone(order.quantities),units:C.clone(order.units),snapshot:order.snapshot}};},
 cells(){return screen==='count'&&!sharedCount()?countNavigationCells():orderNavigationCells();},
 block(cat){return blockText(cat);},
 counts(){return Object.fromEntries(CATS.map(([cat])=>[cat,catalog().filter(p=>(Flow.catOf?Flow.catOf(p):p.cat)===cat).length]));},
 hideAll(cat){for(const p of catalog())if((Flow.catOf?Flow.catOf(p):p.cat)===cat)order.quantities[p.id]=0;orderBase=C.clone(order);baseQty={...order.quantities};render();},
};window.__ccx.setup();
`;
const js=esbuild.buildSync({stdin:{contents:core+imports+stripped+expose,resolveDir:sourceDir,sourcefile:'isolated-mobile-fixture.js'},bundle:true,format:'iife',write:false}).outputFiles[0].text;
const css=fs.readFileSync(path.join(sourceDir,'redesign-preview/preview.css'),'utf8');
const html=`<!doctype html><html lang="zh-CN" data-order-mode="production"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body><div class="banner">川川香 · 订货总控台<small>共同盘货、实时同步、双方定稿</small></div><div id="app"></div><nav class="tabs"><button data-act="tab" data-tab="count">盘货</button><button data-act="tab" data-tab="order">订单</button><button data-act="tab" data-tab="more">更多</button></nav><div id="toast" role="status"></div><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;

const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
const report={source:sourceDir,engine:process.env.CCX_BROWSER_ENGINE||'chromium',sourceHashes:{preview:hash(raw),search:hash(fs.readFileSync(path.join(sourceDir,'redesign-preview/search.cjs'))),...(fs.existsSync(path.join(sourceDir,'redesign-preview/search-activity.cjs'))?{activity:hash(fs.readFileSync(path.join(sourceDir,'redesign-preview/search-activity.cjs')))}:{}),css:hash(css),runner:hash(fs.readFileSync(__filename))},cases:[],errors:[]};
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const three=['kr:7','cn:33','cn:64'],five=[...three,'other:8','other:22'];
const grouped={kr:['kr:7'],cn:['cn:33','cn:64'],other:['other:8'],drinks:['other:22']};
const queries=[
 ['大葱腐竹虾丸',three],
 ['大葱，腐竹、虾丸',three],
 ['大葱 / 腐竹；虾丸',three],
 ['대파푸주새우완자',three],
 ['大葱푸주虾丸',three],
 ['大葱腐竹虾丸竹签芬达',five],
 ['芬达、虾丸、腐竹、大葱、竹签、腐竹',five],
 ['大葱、这不是商品、腐竹',['kr:7','cn:33']],
 ['莲藕粉耗子腐竹',['cn:33','cn:45']],
 ['莲藕、粉耗子',['kr:32','cn:44','cn:45','cn:56']],
 ['土豆淀粉大葱',['kr:7','cn:16']],
 ['土豆',['kr:38','kr:43','cn:16']],
 ['분사腐竹',['cn:33','cn:75']],
 ['매운 고춧가루、腐竹',['cn:7','cn:33']],
 ['(zero)코카콜라、腐竹',['cn:33','other:21']],
 ['대 파，푸 주',['kr:7','cn:33']],
 ['土 豆 淀 粉',['cn:16']],
 ['연 근 분 모 자',['cn:45']],
 ['莲 藕 粉 耗 子',['cn:45']],
];
async function runCase(name,fn){try{report.cases.push({name,pass:true,...(await fn()||{})});}catch(e){report.cases.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message);}}
async function ids(page){return page.locator('#rows .line').evaluateAll(rows=>rows.map(row=>row.dataset.id||row.querySelector('.who[data-id]')?.dataset.id));}
async function geometry(page){return page.evaluate(()=>{
 const rect=selector=>{const r=document.querySelector(selector)?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,height:r.height}:null;};
 return {scrollY,width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,active:document.activeElement?.id,bar:rect('.bar'),first:rect('#rows .line'),viewportHeight:innerHeight};
});}
async function reset(page,role,mode,screen='order',cat='cn'){
 await page.evaluate(({role,mode})=>window.__ccx.setup(role,mode),{role,mode});await settle(page);
 if(screen==='count'){await page.locator('[data-tab="count"]').click();await settle(page);}
 await page.locator(`[data-act="${screen==='count'?'jumpcat':'ordercat'}"][data-cat="${cat}"]`).click();await settle(page);
}
async function openSearch(page){const entry=page.locator('[data-act="open-order-search"]');if(await entry.count()){await entry.click();await settle(page);}}
async function fill(page,q){await openSearch(page);await page.locator('#find').fill(q);await settle(page);}
async function key(page,k){await page.locator(`[data-act="key"][data-key="${k}"]`).click();await settle(page);}
async function next(page,shared=true){await page.locator(`[data-act="${shared?'order-next':'next'}"]`).click();await settle(page);}
(async()=>{
 const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();
 try{
  const widths=(process.env.CCX_BROWSER_WIDTHS||'430,375,320').split(',').map(Number),roles=(process.env.CCX_BROWSER_ROLES||'owner,editor').split(','),modes=(process.env.CCX_BROWSER_MODES||'draft,finalized').split(',');
  for(const width of widths)for(const role of roles)for(const mode of modes){
   const context=await browser.newContext({viewport:{width,height:932},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>report.errors.push(e.message));
   await page.route('**/*',async route=>{if(route.request().url()==='https://ccx.invalid/ordering/')await route.fulfill({status:200,contentType:'text/html',body:html});else{report.errors.push('Blocked network '+route.request().url());await route.abort();}});
   try{
    await page.goto('https://ccx.invalid/ordering/');const prefix=`${width}px ${role} ${mode}`;
    await runCase(prefix+' order multi-name query variants, stable input and original scroll',async()=>{
     await reset(page,role,mode);const before=await page.evaluate(()=>window.__ccx.values());
     await page.evaluate(()=>scrollTo(0,1200));await settle(page);const origin=await page.evaluate(()=>scrollY);
     await openSearch(page);
     await page.locator('#find').evaluate(el=>{el.dataset.testIdentity='search-kept';});
     const durations=[];
     for(const [q,expected] of queries){
      const started=Date.now();await fill(page,q);durations.push(Date.now()-started);
      assert.deepEqual(await ids(page),expected,'query '+q);
      assert.equal(await page.locator('#find').getAttribute('data-test-identity'),'search-kept','input is not replaced');
      assert.equal(await page.locator('#find').inputValue(),q,'typed query is retained verbatim');
      const g=await geometry(page);assert.equal(g.active,'find');assert.ok(g.scrollWidth<=width+1,'long multi query must not expand page');
      assert.ok(g.first.top>=g.bar.bottom-2&&g.first.bottom<=g.viewportHeight-4,'first match remains visible below search bar');
     }
     // Synthetic composition dispatch verifies input identity/caret through
     // DOM updates. It does not assert a real operating-system IME behavior.
     await page.locator('#find').evaluate(el=>{
      el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
      el.value='大葱腐竹虾丸';el.setSelectionRange(el.value.length,el.value.length);
      el.dispatchEvent(new InputEvent('input',{bubbles:true,data:'虾丸',inputType:'insertCompositionText',isComposing:true}));
      el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:el.value}));
     });await settle(page);
     assert.deepEqual(await ids(page),three);assert.equal(await page.locator('#find').getAttribute('data-test-identity'),'search-kept');
     assert.equal(await page.locator('#find').evaluate(el=>el.selectionStart),6);
     await fill(page,'大葱腐竹虾丸竹签芬达');await page.screenshot({path:path.join(outputDir,`${width}-${role}-${mode}-multi-order.png`)});
     assert.deepEqual(await page.evaluate(()=>window.__ccx.values()),before,'search does not mutate catalog, quantities or order revision');
     assert.equal(await page.evaluate(()=>window.__ccx.reads),0);
     await page.locator('[data-act="cancel-find"]').click();await settle(page);
     assert.equal(await page.evaluate(()=>window.__ccx.state().query),'');assert.equal(await page.evaluate(()=>window.__ccx.state().orderCat),'cn');
     assert.ok(Math.abs(await page.evaluate(()=>scrollY)-origin)<=3,'return restores deep original list position');
     return {variants:queries.length,inputIdentityPreserved:true,compositionDispatchRetained:true,maxInputRoundTripMs:Math.max(...durations),networkReads:0};
    });
    await runCase(prefix+' count categories and keyboard navigation share the multi-query result set',async()=>{
     await reset(page,role,mode,'count');const before=await page.evaluate(()=>window.__ccx.values());
     const q='大葱腐竹虾丸竹签芬达';await fill(page,q);
     assert.equal(await page.evaluate(()=>window.__ccx.state().viewCat),'cn','existing category retained when it has matches');
     const measured={};
     for(const cat of ['cn','kr','other','drinks']){
      if(cat!=='cn'){await page.locator(`[data-act="jumpcat"][data-cat="${cat}"]`).click();await settle(page);}
      assert.deepEqual(await ids(page),grouped[cat]);assert.equal(await page.locator('#find').inputValue(),q);
      const badges=await page.locator('[data-act="jumpcat"]').evaluateAll(els=>Object.fromEntries(els.map(el=>[el.dataset.cat,el.querySelector('.found')?.textContent||''])));
      for(const other of Object.keys(grouped))assert.equal(badges[other],other===cat?'':`搜到${grouped[other].length}`,'category hit count agrees with visible matches');
      const cells=await page.evaluate(()=>window.__ccx.cells());
      if(mode==='finalized')assert.deepEqual(cells,[],'finalized search stays read-only');
      else assert.deepEqual([...new Set(cells.map(c=>c.id))],grouped[cat],'next/previous cannot navigate to a filtered-out product');
      measured[cat]={ids:await ids(page),badges,navigationCells:cells.length};
      assert.ok((await geometry(page)).scrollWidth<=width+1);
     }
     await page.locator(`[data-act="jumpcat"][data-cat="cn"]`).click();await settle(page);
     await page.screenshot({path:path.join(outputDir,`${width}-${role}-${mode}-multi-count.png`)});
     assert.deepEqual(await page.evaluate(()=>window.__ccx.values()),before);assert.equal(await page.evaluate(()=>window.__ccx.reads),0);
     return {categories:measured,networkReads:0};
    });
    if(mode==='draft'){
     await runCase(prefix+' order quantity edits keep multi-search and move only through matching cells',async()=>{
      await reset(page,role,mode);const q='大葱腐竹虾丸';await fill(page,q);
      const before=await page.evaluate(()=>window.__ccx.values());
      await page.locator('[data-search="true"][data-id="kr:7"][data-field="qty"]').click();await settle(page);
      assert.equal(await page.evaluate(()=>window.__ccx.state().editId),'kr:7');
      await key(page,'del');await key(page,'1');await key(page,'2');
      assert.equal(await page.evaluate(()=>window.__ccx.state().draftValues['kr:7'].quantity),'12');
      const cells=await page.evaluate(()=>window.__ccx.cells()),index=cells.findIndex(c=>c.id==='kr:7'&&c.which==='qty');
      await next(page);let state=await page.evaluate(()=>window.__ccx.state());assert.equal(state.editId,cells[index+1].id);assert.equal(state.editField,cells[index+1].which);
      assert.equal(state.query,q);assert.deepEqual(await ids(page),three);
      await page.locator('[data-act="order-prev"]').click();await settle(page);state=await page.evaluate(()=>window.__ccx.state());assert.equal(state.editId,'kr:7');assert.equal(state.editField,'qty');
      await page.locator('[data-act="close"]').click();await settle(page);
      assert.deepEqual(await ids(page),three);assert.equal(await page.locator('#find').inputValue(),q);
      const after=await page.evaluate(()=>window.__ccx.values());
      for(const [id,value] of Object.entries(before.items)){assert.equal(after.items[id].stock,value.stock,'quantity editing must not change any inventory');assert.equal(after.items[id].unit,value.unit,'quantity editing must not change units');if(id!=='kr:7')assert.equal(after.items[id].quantity,value.quantity,'only chosen quantity changes');}
      assert.equal(after.items['kr:7'].quantity,'12');assert.equal(await page.evaluate(()=>window.__ccx.reads),0);
      return {editedId:'kr:7',quantity:'12',queryPreserved:true,networkReads:0};
     });
     await runCase(prefix+' count inventory edits retain two matching products and skip other goods',async()=>{
      await reset(page,role,mode,'count');const q='腐竹虾丸';await fill(page,q);assert.deepEqual(await ids(page),['cn:33','cn:64']);
      await page.locator('[data-act="open"][data-id="cn:33"][data-field="stock"]').click();await settle(page);
      await key(page,'del');await key(page,'7');
      assert.equal(await page.evaluate(()=>window.__ccx.state().draftValues['cn:33'].stock),'7');
      await next(page,false);let state=await page.evaluate(()=>window.__ccx.state());assert.equal(state.activeId,'cn:33');assert.equal(state.field,'qty');
      await next(page,false);state=await page.evaluate(()=>window.__ccx.state());assert.equal(state.activeId,'cn:64');assert.equal(state.field,'stock');
      assert.equal(state.query,q);assert.equal(state.draftValues['cn:33'].quantity,'1');assert.equal(state.draftValues['cn:64'].stock,'2');
      await page.locator('[data-act="close"]').click();await settle(page);assert.deepEqual(await ids(page),['cn:33','cn:64']);assert.equal(await page.locator('#find').inputValue(),q);
      assert.equal(await page.evaluate(()=>window.__ccx.reads),0);return {editedId:'cn:33',stock:'7',nextId:'cn:64',queryPreserved:true,networkReads:0};
     });
    }else{
     await runCase(prefix+' finalized multi-search cannot unlock stock or order quantities',async()=>{
      for(const screen of ['order','count']){
       await reset(page,role,mode,screen);const before=await page.evaluate(()=>window.__ccx.values());await fill(page,'腐竹虾丸');
       assert.deepEqual(await ids(page),['cn:33','cn:64']);assert.equal(await page.locator('#rows [data-act="edit"],#rows [data-act="open"]').count(),0);
       const cells=page.locator('#rows .cell');assert.ok(await cells.count()>0);
       assert.ok((await cells.evaluateAll(els=>els.map(el=>el.getAttribute('aria-disabled')))).every(x=>x==='true'));
       // Playwright treats aria-disabled as an actionability block. Force the
       // physical click to verify that the application's own handler also
       // leaves this displayed cell read-only, instead of timing out in the runner.
       await cells.first().click({force:true});await settle(page);assert.equal(await page.locator('.pad').count(),0);assert.equal(await page.evaluate(()=>window.__ccx.state().keypad),false);
       assert.deepEqual(await page.evaluate(()=>window.__ccx.values()),before);assert.equal(await page.evaluate(()=>window.__ccx.reads),0);
      }
      return {screens:['order','count'],readOnly:true,networkReads:0};
     });
    }
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.length-report.passed;
 fs.writeFileSync(path.join(outputDir,'multi-search-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({engine:report.engine,browserVersion:report.browserVersion,passed:report.passed,failed:report.failed,errors:report.errors,cases:report.cases.map(({name,pass,error})=>({name,pass,error}))},null,2));
 if(report.failed||report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
