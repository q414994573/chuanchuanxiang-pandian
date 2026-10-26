'use strict';
// Navigation-specific trusted-browser regressions. Fixture/instrumentation
// reused from input-speech.browser.cjs; none of its test cases are executed.
// Real browser events/layout against the actual application source. Speech and
// click-audio engines are deterministic instrumentation, not audible iPhone
// validation. Firebase boot is removed and all non-fixture requests are blocked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const repo=path.resolve(__dirname,'..'),sourceDir=process.env.CCX_BROWSER_SOURCE||repo;
const playwright=require(process.env.CCX_PLAYWRIGHT_MODULE||'playwright');
const esbuild=require(path.join(repo,'node_modules/esbuild'));
const output=process.env.CCX_BROWSER_OUTPUT||'/tmp/ccx-speech-navigation';fs.mkdirSync(output,{recursive:true});
const files={C:'cloud/core.cjs',A:'cloud/account.cjs',S:'redesign-preview/search.cjs',Flow:'redesign-preview/count-flow.cjs',Backup:'redesign-preview/draft-backup.cjs',Recovery:'redesign-preview/recovery.cjs',Entry:'redesign-preview/entry-mode.cjs',Auto:'redesign-preview/order-autosave.cjs',Shared:'redesign-preview/shared-draft.cjs',Feedback:'redesign-preview/interaction-feedback.cjs',Speech:'redesign-preview/product-speech.cjs',StockRepair:'redesign-preview/stock-unit-corrections.cjs'};
const raw=fs.readFileSync(path.join(sourceDir,'redesign-preview/preview.js'),'utf8');
const core=`window.CountCore=require(${JSON.stringify(path.join(sourceDir,'count-core.js'))});\n`;
const imports=Object.entries(files).map(([name,file])=>`const ${name}=require(${JSON.stringify(path.join(sourceDir,file))});`).join('\n');
const stripped=raw.replace(/^import .*;\n/gm,'').replace(/boot\(\)\.catch\([\s\S]*$/,'');
const fixture=JSON.parse(fs.readFileSync(path.join(sourceDir,'current-order.json'),'utf8'));
const aliases=JSON.parse(fs.readFileSync(path.join(sourceDir,'redesign-preview/aliases.json'),'utf8'));
const expose=`
window.__ccx={reads:0,saves:0,copied:[],shared:[],
 setup(role='owner',mode='draft',fresh=true){
  productSpeech.stop();interactionFeedback.stop();busy=false;skipActUntil=0;
  if(typeof orderSearchOpen!=='undefined')orderSearchOpen=false;
  if(typeof searchComposing!=='undefined')searchComposing=false;
  if(typeof clearKeySelection==='function')clearKeySelection();
  clearTimeout(cloudTimer);clearTimeout(orderTimer);clearTimeout(showUndo._t);
  if(fresh){localStorage.clear();productSpeech.set(false);interactionFeedback.set('sound',false);interactionFeedback.set('vibration',false);searchActivity.clear();}
  lastLocalRaw=localStorage.getItem(KEY);
  source=${JSON.stringify(fixture)};aliasById=new Map(${JSON.stringify(aliases.items)}.map(x=>[x.id,x.aliases]));
  releaseLocked=false;configFailed=false;sample=false;demoRole=null;peerEnabled=true;peerViewing=true;
  member={role,name:role==='owner'?'测试甲':'测试乙'};user={uid:'test-'+role};
  draft=Core().create(source,'2026-10-26','count-browser-speech-navigation');draft.seen={};draft.ackWrong={};
  for(const p of draft.catalog){const r=draft.items[p.id];r.stock=p.hasStock?'12':'';r.stockStatus=p.hasStock?'counted':'exempt';r.quantity='12';r.decision='order';r.processed=true;r.acknowledged=true;draft.seen[p.id]=true;}
  draft.items['cn:45'].unit='봉';draft.items['other:11'].unit='세트';draft.status=mode==='draft'?'draft':'reviewed';
  order=mode==='draft'?null:{id:draft.id,schema:'ccx-cloud-1',date:draft.date,revision:3,orderStage:mode==='finalized'?'finalized':'pending',updatedByName:member.name,snapshot:JSON.stringify(draft),quantities:Object.fromEntries(draft.catalog.map(p=>[p.id,12000])),units:Object.fromEntries(draft.catalog.map(p=>[p.id,draft.items[p.id].unit]))};
  orderDirty=false;orderFlight=null;orderStageWriting=false;orderAutoBlocked=false;orderLocalFailed=false;orderSaveNotice=null;
  peerBase={localId:draft.id,orderId:draft.id,stage:mode==='finalized'?'finalized':'draft',revision:3,draft:C.clone(draft)};peerLatest=peerBase;peerSavedBase=null;peerFlight=null;peerRestoreFlight=null;peerConflict='';
  peerApi={read:async()=>{window.__ccx.reads++;throw Error('Backend reads are forbidden');},save:async(base,next)=>{window.__ccx.saves++;return {...base,revision:base.revision+1,draft:C.clone(next)};}};
  api={read:async()=>{window.__ccx.reads++;throw Error('Backend reads are forbidden');},history:async()=>[],save:async(id,current,quantities,mutation,patch)=>{window.__ccx.saves++;return C.clone({...current,...patch,quantities,revision:current.revision+1});}};
  if(order){rememberStocks();baseQty={...order.quantities};baseUnits={...order.units};beginOrderSession(order);}else{stocks={};stockBase={};stockBaseUnits={};baseQty={};baseUnits={};orderBase=null;}
  localBlocked=false;localConflict=false;localSaveFailed=false;cloudConflict=false;cloudPending=false;cloudReady=true;cloudPhase='saved';
  pos=0;field='stock';screen='order';keypad=false;textMode=false;query='';viewCat='kr';orderCat='kr';moduleEnd=false;
  searchScroll=null;searchCat=null;searchContext=null;wantFind=false;editId=null;editRaw=null;editSnap=null;entered=null;undo=null;rowTap=null;preparedExport=null;history=[];heldPrev={};ack={};yellowOn=true;yellowOnly=false;
  catScroll={kr:0,cn:0,other:0,drinks:0};orderScroll={kr:0,cn:0,other:0,drinks:0};
  this.reads=0;this.saves=0;this.copied=[];this.shared=[];
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__ccx.copied.push(text)}});
  Object.defineProperty(navigator,'share',{configurable:true,value:async value=>window.__ccx.shared.push(value.text)});
  window.__speech.reset();window.__audio.reset();render();scrollTo(0,0);
 },
 state(){return {screen,query,viewCat,orderCat,keypad,textMode,editId,editField,pos,field,orderSearchOpen,moduleEnd,activeId:screen==='count'&&!sharedCount()?draft.catalog[pos]?.id:editId,activeField:screen==='count'&&!sharedCount()?field:editField,dirty:peerDirty(),cloudConflict,reads:this.reads,saves:this.saves,speech:productSpeech.settings(),speaking:productSpeech.active(),feedback:interactionFeedback.settings()};},
 values(){return {items:C.clone(draft.items),catalog:C.clone(draft.catalog),stockText:C.clone(draft.stockText||{}),order:order&&C.clone(order)};},
 row(id){return {name:Flow.largeName(product(id)),stock:stockShown(product(id)),stockUnit:stockUnitOf(product(id)),quantity:qtyOf(id),unit:order?order.units[id]:draft.items[id].unit};},
 repaint(){render();},
 async flush(){await peerSave();},
 background(){if(order){render();return;}const record=C.clone(peerBase);record.revision++;record.draft.items['kr:8'].quantity='13';peerReceive(record);},
 legacy(id,blank){const row=draft.items[id];row.stockUnit=id==='kr:31'?'박스':'箱';row.stock=blank?'':'12';row.stockStatus=blank?'pending':'counted';const record={...peerBase,revision:peerBase.revision+1,draft:C.clone(draft)};peerReceive(record,true);},
 block(cat){return blockText(cat);},
 cells(){return screen==='count'&&!sharedCount()?countNavigationCells():orderNavigationCells();},
 gap(id){draft.seen[id]=false;draft.items[id].processed=false;render();},
 gapDone(){for(const p of draft.catalog)draft.seen[p.id]=true;render();},
 deferred(id){return !!draft.deferred?.[id];},

};window.__ccx.setup('owner','draft',false);
`;
const build=esbuild.buildSync({metafile:true,stdin:{contents:core+imports+stripped+expose,resolveDir:sourceDir,sourcefile:'speech-navigation-browser-fixture.js'},bundle:true,format:'iife',write:false});
const js=build.outputFiles[0].text;
const css=fs.readFileSync(path.join(sourceDir,'redesign-preview/preview.css'),'utf8');
const html=`<!doctype html><html lang="zh-CN" data-order-mode="production"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body><div class="banner">川川香 · 订货总控台<small>共同盘货、实时同步、双方定稿</small></div><div id="app"></div><nav class="tabs"><button data-act="tab" data-tab="count">盘货</button><button data-act="tab" data-tab="order">订单</button><button data-act="tab" data-tab="more">更多</button></nav><div id="toast" role="status"></div><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceInputs=Object.fromEntries(Object.keys(build.metafile.inputs).map(file=>path.resolve(repo,file)).filter(file=>fs.existsSync(file)).map(file=>[path.relative(sourceDir,file),hash(fs.readFileSync(file))]));
for(const file of ['redesign-preview/preview.js','redesign-preview/preview.css','current-order.json','redesign-preview/aliases.json'])sourceInputs[file]=hash(fs.readFileSync(path.join(sourceDir,file)));
const report={sourceInputs,engine:process.env.CCX_BROWSER_ENGINE||'chromium',source:sourceDir,sourceHashes:{preview:hash(raw),css:hash(css),core:hash(fs.readFileSync(path.join(sourceDir,'count-core.js'))),speech:hash(fs.readFileSync(path.join(sourceDir,files.Speech))),feedback:hash(fs.readFileSync(path.join(sourceDir,files.Feedback))),units:hash(fs.readFileSync(path.join(sourceDir,files.StockRepair))),runner:hash(fs.readFileSync(__filename))},cases:[],errors:[],limitations:['SpeechSynthesis and AudioContext are controlled instrumentation; no audible iPhone or native voice quality/latency claim.','Real Chromium/WebKit trusted touch/click/keyboard events and actual CSS at mobile viewport sizes.','No production Firebase requests, order writes, clipboard delivery or message sending.']};
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const tap=async locator=>{await locator.tap();};
const metrics=page=>page.evaluate(()=>({speech:window.__speech.summary(),audio:window.__audio.summary(),state:window.__ccx.state()}));
const row=(page,id)=>page.evaluate(id=>window.__ccx.row(id),id);
const values=page=>page.evaluate(()=>window.__ccx.values());
const state=page=>page.evaluate(()=>window.__ccx.state());
const key=(page,k)=>tap(page.locator(`[data-act="key"][data-key="${k}"]`));
const name=(page,id)=>page.locator(`[data-act="speak-product"][data-id="${id}"]`).first();
const countCell=(page,id,field)=>page.locator(`[data-act="open"][data-id="${id}"][data-field="${field}"]`).first();
const searchCell=(page,id,field)=>page.locator(`[data-act="edit"][data-id="${id}"][data-field="${field}"]`).first();
const orderCell=(page,id)=>page.locator(`[data-act="edit"][data-id="${id}"]`).first();
async function close(page){const fold=page.locator('[data-act="close"]');if(await fold.count())await tap(fold);await settle(page);}
async function tab(page,which){await tap(page.locator(`[data-act="tab"][data-tab="${which}"]`));await settle(page);}
async function setup(page,role,mode){await page.evaluate(({role,mode})=>window.__ccx.setup(role,mode),{role,mode});await settle(page);}
async function settings(page,speech=true,sound=true){await tab(page,'more');if((await state(page)).speech.enabled!==speech){const before=(await metrics(page)).speech.texts.length;await tap(page.locator('[data-act="speech-toggle"]'));assert.equal((await metrics(page)).speech.texts.length,before,'changing a speech preference does not narrate');}if((await state(page)).feedback.sound!==sound)await tap(page.locator('[data-act="feedback-toggle"][data-kind="sound"]'));await settle(page);await finishSpeech(page);await page.evaluate(()=>window.__speech.reset());}
async function search(page,term){await tab(page,'order');await tap(page.locator('[data-act="open-order-search"]'));await page.locator('#find').fill(term);await settle(page);}
async function finishSpeech(page,kind='end'){await page.evaluate(kind=>window.__speech.finish(kind),kind);await settle(page);}
async function geometry(page){return page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,height:r.height,width:r.width}:null;};return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,pad:rect('.pad'),bar:rect('.bar'),rows:rect('#rows'),first:rect('#rows .line, #rows .order')};});}
async function runCase(name,fn){if(process.env.CCX_BROWSER_CASE_PATTERN&&!new RegExp(process.env.CCX_BROWSER_CASE_PATTERN).test(name))return;try{report.cases.push({...(await fn()||{}),name,pass:true});}catch(e){report.cases.push({name,pass:false,error:e.stack||e.message});console.error('FAIL',name,e.message);}}
async function instrument(context){await context.addInitScript(()=>{
 const speech=window.__speech={utterances:[],cancels:0,current:null,mode:'start',
  reset(){this.utterances=[];this.cancels=0;this.current=null;this.mode='start';},
  finish(kind='end'){const u=this.current;this.current=null;if(u){if(kind==='error')u.onerror?.({error:'synthesis-failed'});else u.onend?.({});}},
  summary(){return {texts:this.utterances.map(u=>u.text),langs:this.utterances.map(u=>u.lang),voices:this.utterances.map(u=>u.voice?.lang||null),cancels:this.cancels,current:this.current?.text||null};}
 };
 class Utterance{constructor(text){this.text=text;this.lang='';this.voice=null;}}
 const synth={getVoices:()=>[{name:'Chinese local fixture',lang:'zh-CN',localService:true},{name:'Korean local fixture',lang:'ko-KR',localService:true},{name:'English local fixture',lang:'en-US',localService:true}],
  speak(u){if(speech.mode==='throw')throw Error('isolated speech failure');speech.utterances.push(u);speech.current=u;if(speech.mode==='start')u.onstart?.({});},
  cancel(){speech.cancels++;const u=speech.current;speech.current=null;u?.onerror?.({error:'canceled'});},
 };
 Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:Utterance});
 const audio=window.__audio={created:0,started:0,stopped:0,closed:0,clicks:[],inputs:[],
  reset(){this.created=0;this.started=0;this.stopped=0;this.closed=0;this.clicks=[];this.inputs=[];},summary(){return {created:this.created,started:this.started,stopped:this.stopped,closed:this.closed,clicks:this.clicks.slice(),inputs:this.inputs.slice()};}
 };
 class AudioContext{
  constructor(){this.state='running';this.currentTime=0;this.destination={};audio.created++;}
  resume(){this.state='running';return Promise.resolve();}
  close(){this.state='closed';audio.closed++;return Promise.resolve();}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}
  createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},disconnect(){},start(){audio.started++;},stop(when){audio.stopped++;setTimeout(()=>this.onended?.(),when===undefined?0:30);},onended:null};}
 }
 Object.defineProperty(window,'AudioContext',{configurable:true,value:AudioContext});
 document.addEventListener('click',event=>{const target=event.target.closest?.('[data-act]');if(target)audio.clicks.push({act:target.dataset.act,id:target.dataset.id||null,key:target.dataset.key||null,trusted:event.isTrusted,time:performance.now()});},true);
 document.addEventListener('keydown',event=>{if(event.target.classList.contains('plain'))audio.clicks.push({act:'native-key',key:event.key,trusted:event.isTrusted,time:performance.now()});},true);
 document.addEventListener('input',event=>{if(event.target.classList.contains('plain'))audio.inputs.push({value:event.target.value,trusted:event.isTrusted});},true);
});}
async function route(page){page.setDefaultTimeout(5000);page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',dialog=>dialog.accept());await page.route('**/*',async request=>{if(request.request().url()==='https://ccx.invalid/ordering/')await request.fulfill({status:200,contentType:'text/html',body:html});else{report.errors.push('Unexpected network '+request.request().url());await request.abort();}});}

const action=(page,act)=>page.locator(`[data-act="${act}"]`);
function stockCell(page,mode,id,field='stock'){
 return mode==='draft'?countCell(page,id,field):searchCell(page,id,field);
}
const navigationAct=(mode,where,direction=1)=>where==='count'&&mode==='draft'?(direction>0?'next':'prev'):(direction>0?'order-next':'order-prev');
async function ready(page,role,mode){await setup(page,role,mode);await settings(page,true,true);}
async function resetSpeech(page){await finishSpeech(page);await page.evaluate(()=>window.__speech.reset());}
async function expectNarration(page,fn,id,field,{cold=true}={}){
 if(cold)await finishSpeech(page);
 const before=await metrics(page),expected=(await row(page,id)).name;
 await fn();await settle(page);const after=await metrics(page);
 assert.equal(after.speech.texts.length,before.speech.texts.length+1,'one destination narration per accepted navigation');
 assert.equal(after.speech.texts.at(-1),expected,'narration must name the destination product');
 assert.equal(after.speech.current,expected,'latest destination remains the only current utterance');
 assert.equal(after.audio.started,before.audio.started,'navigation narration takes priority before a click tone can start');
 assert.equal(after.state.activeId,id);assert.equal(after.state.activeField,field);assert.equal(after.state.keypad,true);
 assert.ok(after.audio.clicks.every(e=>e.trusted),'the application receives trusted pointer/keyboard actions');
 return {id,field,name:expected};
}
async function expectSilent(page,fn){
 await finishSpeech(page);const before=await metrics(page);await fn();await settle(page);const after=await metrics(page);
 assert.equal(after.speech.texts.length,before.speech.texts.length,'rejected or no-op navigation must not announce a destination');return after.state;
}
async function nativeCapability(browser){
 const context=await browser.newContext();try{const page=await context.newPage();return await page.evaluate(()=>{
  let available=false,voices=[],error=null;
  try{available=typeof window.SpeechSynthesisUtterance==='function'&&typeof window.speechSynthesis?.speak==='function';voices=Array.from(window.speechSynthesis?.getVoices?.()||[]).map(v=>({lang:v.lang,localService:v.localService}));}catch(e){error=e.message;}
  return {available,voices,error,audibleOutputTested:false,note:'Capability inspection only; no native speech was played or heard.'};
 });}finally{await context.close();}
}

(async()=>{
 const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();report.nativeSpeechCapability=await nativeCapability(browser);
 try{
  for(const width of (process.env.CCX_BROWSER_WIDTHS||'430,375,320').split(',').map(Number))for(const role of (process.env.CCX_BROWSER_ROLES||'owner,editor').split(','))for(const mode of (process.env.CCX_BROWSER_MODES||'draft,saved,finalized').split(',')){
   const context=await browser.newContext({viewport:{width,height:932},isMobile:true,hasTouch:true,deviceScaleFactor:1});await instrument(context);const page=await context.newPage();await route(page);await page.goto('https://ccx.invalid/ordering/');const prefix=`${width}px ${role} ${mode}`;
   try{
    await runCase(prefix+' focused hot-product tap narrates once and searches without opening quantity editing',async()=>{
     await ready(page,role,mode);await tab(page,'order');await tap(action(page,'open-order-search'));await page.locator('#find').focus();await resetSpeech(page);
     const hot=page.locator('[data-act="hot-find"]').first(),id=await hot.getAttribute('data-id');assert.ok(id);const expected=(await row(page,id)).name,beforeValues=await values(page),before=await metrics(page);
     await tap(hot);await settle(page);const after=await metrics(page);assert.deepEqual(after.speech.texts,[expected],'pointerup and click must not double-narrate the chosen hot product');assert.equal(after.speech.current,expected);assert.equal(after.audio.started,before.audio.started);assert.equal(after.state.orderSearchOpen,true);assert.equal(after.state.query,expected);assert.equal(after.state.keypad,false);assert.deepEqual(await values(page),beforeValues);return {id,spokenName:expected};
    });
    if(mode==='finalized'){
     await runCase(prefix+' finalized rows expose no navigation and warning taps cannot narrate an editable destination',async()=>{
      await ready(page,role,mode);await tab(page,'count');await resetSpeech(page);const before=await values(page);
      assert.equal(await page.locator('[data-act="next"],[data-act="prev"],[data-act="order-next"],[data-act="order-prev"]').count(),0);
      const readonlyCell=page.locator('.search-hit[data-id="kr:7"] .cell').last();assert.equal(await readonlyCell.getAttribute('aria-disabled'),'true');await expectSilent(page,()=>readonlyCell.tap({force:true}));assert.equal((await state(page)).keypad,false);
      await tab(page,'order');const warning=page.locator('[data-act="warn"][data-id="kr:7"]');if(await warning.count())await expectSilent(page,()=>tap(warning));
      assert.equal((await state(page)).keypad,false);assert.deepEqual(await values(page),before);assert.equal((await state(page)).reads,0);return {readonly:true};
     });
     continue;
    }
    await runCase(prefix+' counting next and previous narrate each accepted same-product and next-product destination',async()=>{
     await ready(page,role,mode);await tab(page,'count');await tap(stockCell(page,mode,'kr:7'));await resetSpeech(page);const out=[];
     out.push(await expectNarration(page,()=>tap(action(page,navigationAct(mode,'count'))),'kr:7','qty'));
     out.push(await expectNarration(page,()=>tap(action(page,navigationAct(mode,'count'))),'kr:8','stock'));
     out.push(await expectNarration(page,()=>tap(action(page,navigationAct(mode,'count',-1))),'kr:7','qty'));
     out.push(await expectNarration(page,()=>tap(action(page,navigationAct(mode,'count',-1))),'kr:7','stock'));
     return {destinations:out};
    });
    await runCase(prefix+' order next and previous narrate the displayed neighboring quantity rows',async()=>{
     await ready(page,role,mode);await tab(page,'order');await tap(orderCell(page,'kr:7'));await resetSpeech(page);
     const next=await expectNarration(page,()=>tap(action(page,'order-next')),'kr:8','qty');const prev=await expectNarration(page,()=>tap(action(page,'order-prev')),'kr:7','qty');return {next,prev};
    });
    await runCase(prefix+' search navigation follows editable stock and quantity cells without leaving results',async()=>{
     await ready(page,role,mode);await search(page,'大葱腐竹虾丸');const start=mode==='draft'?'stock':'qty';await tap(searchCell(page,'kr:7',start));await resetSpeech(page);const out=[];
     if(mode==='draft')out.push(await expectNarration(page,()=>tap(action(page,'order-next')),'kr:7','qty'));
     out.push(await expectNarration(page,()=>tap(action(page,'order-next')),'cn:33',start));
     out.push(await expectNarration(page,()=>tap(action(page,'order-prev')),'kr:7','qty'));
     assert.equal((await state(page)).orderSearchOpen,true);assert.equal((await state(page)).query,'大葱腐竹虾丸');return {destinations:out};
    });
    await runCase(prefix+' native keyboard Enter narrates accepted counting and search destinations',async()=>{
     await ready(page,role,mode);await tab(page,'count');await tap(stockCell(page,mode,'kr:7'));await tap(page.locator('[data-act="mode"][data-mode="text"]'));await resetSpeech(page);
     const counted=await expectNarration(page,()=>page.locator('input.plain').press('Enter'),'kr:7','qty');await close(page);
     await search(page,'大葱腐竹虾丸');const field=mode==='draft'?'stock':'qty';await tap(searchCell(page,'cn:33',field));await tap(page.locator('[data-act="mode"][data-mode="text"]'));await resetSpeech(page);
     const searched=await expectNarration(page,()=>page.locator('input.plain').press('Enter'),mode==='draft'?'cn:33':'cn:64','qty');return {counted,searched};
    });
    await runCase(prefix+' undo narrates its restored target in counting order and search routes',async()=>{
     const results=[];
     for(const where of ['count','order','search']){
      await ready(page,role,mode);if(where==='search')await search(page,'大葱腐竹虾丸');else await tab(page,where);
      const field=where==='count'?'stock':'qty';const cell=id=>where==='count'?stockCell(page,mode,id,field):where==='search'?searchCell(page,id,field):orderCell(page,id);
      await tap(cell('kr:7'));await key(page,'8');await close(page);await tap(cell(where==='search'?'cn:33':'kr:8'));await resetSpeech(page);
      results.push(await expectNarration(page,()=>tap(action(page,'undo')),'kr:7',field));assert.equal((await row(page,'kr:7'))[field==='stock'?'stock':'quantity'],'12');
     }
     return {destinations:results};
    });
    await runCase(prefix+' unfinished decimals block arrows and native Enter without false narration',async()=>{
     const results=[];
     for(const where of ['count','search']){
      await ready(page,role,mode);if(where==='count')await tab(page,'count');else await search(page,'大葱腐竹虾丸');const field=where==='count'||mode==='draft'?'stock':'qty';
      await tap(where==='count'?stockCell(page,mode,'kr:7',field):searchCell(page,'kr:7',field));await key(page,'.');await resetSpeech(page);
      const after=await expectSilent(page,()=>tap(action(page,navigationAct(mode,where))));assert.equal(after.activeId,'kr:7');assert.equal(after.activeField,field);assert.equal(after.keypad,true);
      await tap(page.locator('[data-act="mode"][data-mode="text"]'));const native=await expectSilent(page,()=>page.locator('input.plain').press('Enter'));assert.equal(native.activeId,'kr:7');assert.equal(native.activeField,field);results.push({where,id:native.activeId,field});
     }
     return {blocked:results};
    });
    await runCase(prefix+' first and last cell boundaries never narrate a nonexistent destination',async()=>{
     await ready(page,role,mode);await tab(page,'count');await tap(stockCell(page,mode,'kr:3'));await resetSpeech(page);const prev=action(page,navigationAct(mode,'count',-1));assert.equal(await prev.isDisabled(),true);await expectSilent(page,()=>prev.tap({force:true}));
     await close(page);await tap(stockCell(page,mode,'kr:58','qty'));await resetSpeech(page);await expectSilent(page,()=>tap(action(page,navigationAct(mode,'count'))));
     if(mode==='draft')assert.equal((await state(page)).moduleEnd,true);else assert.equal((await state(page)).keypad,false);
     await ready(page,role,mode);await search(page,'大葱腐竹虾丸');await tap(searchCell(page,'cn:64','qty'));await resetSpeech(page);await expectSilent(page,()=>tap(action(page,'order-next')));assert.equal((await state(page)).keypad,false);return {nonexistentDestinationSuppressed:true};
    });
    await runCase(prefix+' rapid navigation cancels same and different product speech without queued stale destinations',async()=>{
     await ready(page,role,mode);await tab(page,'count');await tap(stockCell(page,mode,'kr:7'));await resetSpeech(page);const out=[];
     for(const [id,field] of [['kr:7','qty'],['kr:8','stock'],['kr:8','qty'],['kr:9','stock']])out.push(await expectNarration(page,()=>tap(action(page,navigationAct(mode,'count'))),id,field,{cold:false}));
     const m=await metrics(page);assert.equal(m.speech.current,(await row(page,'kr:9')).name);assert.ok(m.speech.cancels>=3);assert.equal(m.speech.texts.length,4);return {destinations:out,cancels:m.speech.cancels};
    });
    await runCase(prefix+' disabled narration keeps arrow and Enter navigation functional and silent',async()=>{
     await setup(page,role,mode);await settings(page,false,true);await tab(page,'count');await tap(stockCell(page,mode,'kr:7'));await resetSpeech(page);
     let s=await expectSilent(page,()=>tap(action(page,navigationAct(mode,'count'))));assert.equal(s.activeId,'kr:7');assert.equal(s.activeField,'qty');
     await tap(page.locator('[data-act="mode"][data-mode="text"]'));s=await expectSilent(page,()=>page.locator('input.plain').press('Enter'));assert.equal(s.activeId,'kr:8');assert.equal(s.activeField,'stock');return {speechDisabled:true};
    });
    await runCase(prefix+' quantity-warning shortcut narrates the accepted product once',async()=>{
     await ready(page,role,mode);await tab(page,'order');await resetSpeech(page);const result=await expectNarration(page,()=>tap(page.locator('[data-act="warn"][data-id="kr:7"]')),'kr:7','qty');return {destination:result};
    });
    if(mode==='draft'){
     await runCase(prefix+' defer narrates the next product in counting and search without changing the deferred values',async()=>{
      const results=[];
      for(const where of ['count','search']){
       await ready(page,role,mode);if(where==='count')await tab(page,'count');else await search(page,'大葱腐竹虾丸');await tap(where==='count'?countCell(page,'kr:7','stock'):searchCell(page,'kr:7','qty'));await resetSpeech(page);const before=await row(page,'kr:7');
       results.push(await expectNarration(page,()=>tap(action(page,'defer')),where==='count'?'kr:8':'cn:33','stock'));assert.equal(await page.evaluate(()=>window.__ccx.deferred('kr:7')),true);assert.deepEqual(await row(page,'kr:7'),before);
      }
      return {destinations:results};
     });
     await runCase(prefix+' next-unchecked narrates its target but all-checked order navigation does not',async()=>{
      await ready(page,role,mode);await page.evaluate(()=>window.__ccx.gap('kr:8'));await tab(page,'count');await resetSpeech(page);const result=await expectNarration(page,()=>tap(action(page,'next-gap')),'kr:8','stock');
      await close(page);await page.evaluate(()=>window.__ccx.gapDone());await expectSilent(page,()=>tap(action(page,'next-gap')));assert.equal((await state(page)).screen,'order');assert.equal((await state(page)).keypad,false);return {destination:result};
     });
    }
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.filter(c=>!c.pass).length;fs.writeFileSync(path.join(output,'speech-navigation-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({engine:report.engine,browserVersion:report.browserVersion,passed:report.passed,failed:report.failed,pageErrors:report.errors,report:path.join(output,'speech-navigation-report.json')}));if(report.failed||report.errors.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
