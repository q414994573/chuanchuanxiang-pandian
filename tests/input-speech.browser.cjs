'use strict';
// Real browser events/layout against the actual application source. Speech and
// click-audio engines are deterministic instrumentation, not audible iPhone
// validation. Firebase boot is removed and all non-fixture requests are blocked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const repo=path.resolve(__dirname,'..'),sourceDir=process.env.CCX_BROWSER_SOURCE||repo;
const playwright=require(process.env.CCX_PLAYWRIGHT_MODULE||'playwright');
const esbuild=require(path.join(repo,'node_modules/esbuild'));
const output=process.env.CCX_BROWSER_OUTPUT||'/tmp/ccx-input-speech';fs.mkdirSync(output,{recursive:true});
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
  draft=Core().create(source,'2026-10-26','count-browser-input-speech');draft.seen={};draft.ackWrong={};
  for(const p of draft.catalog){const r=draft.items[p.id];r.stock=p.hasStock?'12':'';r.stockStatus=p.hasStock?'counted':'exempt';r.quantity='12';r.decision='order';r.processed=true;r.acknowledged=true;draft.seen[p.id]=true;}
  draft.items['cn:45'].unit='봉';draft.items['other:11'].unit='세트';draft.status=mode==='draft'?'draft':'reviewed';
  order=mode==='draft'?null:{id:draft.id,schema:'ccx-cloud-1',date:draft.date,revision:3,orderStage:'finalized',updatedByName:member.name,snapshot:JSON.stringify(draft),quantities:Object.fromEntries(draft.catalog.map(p=>[p.id,12000])),units:Object.fromEntries(draft.catalog.map(p=>[p.id,draft.items[p.id].unit]))};
  orderDirty=false;orderFlight=null;orderStageWriting=false;orderAutoBlocked=false;orderLocalFailed=false;orderSaveNotice=null;
  peerBase={localId:draft.id,orderId:draft.id,stage:mode==='draft'?'draft':'finalized',revision:3,draft:C.clone(draft)};peerLatest=peerBase;peerSavedBase=null;peerFlight=null;peerRestoreFlight=null;peerConflict='';
  peerApi={read:async()=>{window.__ccx.reads++;throw Error('Backend reads are forbidden');},save:async(base,next)=>{window.__ccx.saves++;return {...base,revision:base.revision+1,draft:C.clone(next)};}};
  api={read:async()=>{window.__ccx.reads++;throw Error('Backend reads are forbidden');},history:async()=>[]};
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
 state(){return {screen,query,viewCat,orderCat,keypad,textMode,editId,editField,pos,field,orderSearchOpen,dirty:peerDirty(),cloudConflict,reads:this.reads,saves:this.saves,speech:productSpeech.settings(),speaking:productSpeech.active(),feedback:interactionFeedback.settings()};},
 values(){return {items:C.clone(draft.items),catalog:C.clone(draft.catalog),stockText:C.clone(draft.stockText||{}),order:order&&C.clone(order)};},
 row(id){return {name:Flow.largeName(product(id)),stock:stockShown(product(id)),stockUnit:stockUnitOf(product(id)),quantity:qtyOf(id),unit:order?order.units[id]:draft.items[id].unit};},
 repaint(){render();},
 async flush(){await peerSave();},
 background(){if(order){render();return;}const record=C.clone(peerBase);record.revision++;record.draft.items['kr:8'].quantity='13';peerReceive(record);},
 legacy(id,blank){const row=draft.items[id];row.stockUnit=id==='kr:31'?'박스':'箱';row.stock=blank?'':'12';row.stockStatus=blank?'pending':'counted';const record={...peerBase,revision:peerBase.revision+1,draft:C.clone(draft)};peerReceive(record,true);},
 block(cat){return blockText(cat);},
};window.__ccx.setup('owner','draft',false);
`;
const build=esbuild.buildSync({metafile:true,stdin:{contents:core+imports+stripped+expose,resolveDir:sourceDir,sourcefile:'input-speech-browser-fixture.js'},bundle:true,format:'iife',write:false});
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
async function runCase(name,fn){try{report.cases.push({name,pass:true,...(await fn()||{})});}catch(e){report.cases.push({name,pass:false,error:e.stack||e.message});console.error('FAIL',name,e.message);}}
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
 document.addEventListener('input',event=>{if(event.target.classList.contains('plain'))audio.inputs.push({value:event.target.value,trusted:event.isTrusted});},true);
});}
async function route(page){page.setDefaultTimeout(5000);page.on('pageerror',e=>report.errors.push(e.message));await page.route('**/*',async request=>{if(request.request().url()==='https://ccx.invalid/ordering/')await request.fulfill({status:200,contentType:'text/html',body:html});else{report.errors.push('Unexpected network '+request.request().url());await request.abort();}});}

(async()=>{
 const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();
 try{
 for(const width of (process.env.CCX_BROWSER_WIDTHS||'430,375,320').split(',').map(Number))for(const role of (process.env.CCX_BROWSER_ROLES||'owner,editor').split(','))for(const mode of (process.env.CCX_BROWSER_MODES||'draft,finalized').split(',')){
  const context=await browser.newContext({viewport:{width,height:932},isMobile:true,hasTouch:true,deviceScaleFactor:1});await instrument(context);const page=await context.newPage();await route(page);await page.goto('https://ccx.invalid/ordering/');const prefix=`${width}px ${role} ${mode}`;
  try{
   await runCase(prefix+' optional speech starts only on a trusted product tap and preserves primary language',async()=>{
    await setup(page,role,mode);const before=await values(page);await settings(page,false,false);assert.match(await page.locator('[data-act="speech-toggle"]').innerText(),/关/);assert.deepEqual((await metrics(page)).speech.texts,[]);
    await tab(page,'order');await tap(page.locator('.order[data-id="kr:7"] .num'));assert.deepEqual((await metrics(page)).speech.texts,[]);await close(page);await settings(page,true,false);assert.deepEqual((await metrics(page)).speech.texts,[],'enabling speech does not narrate');await tap(page.locator('[data-act="feedback-test"]'));assert.deepEqual((await metrics(page)).speech.texts,['川川香']);await finishSpeech(page);await page.evaluate(()=>window.__speech.reset());
    await tab(page,'order');await tap(name(page,'kr:7'));let m=await metrics(page);assert.deepEqual(m.speech.texts,[(await row(page,'kr:7')).name]);assert.equal(m.speech.langs[0],'ko-KR');assert.equal(m.speech.voices[0],'ko-KR');
    await tap(page.locator('[data-act="ordercat"][data-cat="cn"]'));await tap(name(page,'cn:33'));m=await metrics(page);assert.equal(m.speech.texts.at(-1),'腐竹');assert.equal(m.speech.langs.at(-1),'zh-CN');assert.equal(m.speech.voices.at(-1),'zh-CN');assert.deepEqual(await values(page),before);assert.ok(m.audio.clicks.every(e=>e.trusted));return {speech:m.speech};
   });
   await runCase(prefix+' rapid product taps cancel prior speech and never queue stale names',async()=>{
    await setup(page,role,mode);await settings(page,true,true);await tab(page,'order');
    for(const id of ['kr:7','kr:8','kr:9'])await tap(name(page,id));
    const m=await metrics(page),expected=await Promise.all(['kr:7','kr:8','kr:9'].map(async id=>(await row(page,id)).name));assert.deepEqual(m.speech.texts,expected);assert.equal(m.speech.current,expected.at(-1));assert.ok(m.speech.cancels>=2);assert.equal(m.state.speaking,true);await finishSpeech(page);assert.equal((await state(page)).speaking,false);return {speech:m.speech};
   });
   await runCase(prefix+' focused search touch narrates once and background repaint never narrates',async()=>{
    await setup(page,role,mode);await settings(page,true,false);await search(page,'大葱腐竹虾丸');const before=await values(page);
    await page.locator('#find').focus();const target=mode==='draft'?searchCell(page,'cn:33','qty'):name(page,'cn:33');await tap(target);await settle(page);
    let m=await metrics(page);assert.deepEqual(m.speech.texts,['腐竹'],'pointer-up and synthesized click are deduplicated');
    await page.evaluate(()=>window.__ccx.repaint());await page.evaluate(()=>window.__ccx.background());await settle(page);m=await metrics(page);assert.deepEqual(m.speech.texts,['腐竹']);
    if(mode==='finalized'){assert.equal(m.state.keypad,false);assert.deepEqual(await values(page),before);}else assert.equal(m.state.editId,'cn:33');
    return {speech:m.speech,activeId:m.state.editId};
   });
   await runCase(prefix+' scrolling over product names and cells never starts speech',async()=>{
    await setup(page,role,mode);await settings(page,true,false);await search(page,'大葱腐竹虾丸');const target=name(page,'cn:33');const box=await target.boundingBox();assert.ok(box);
    await page.mouse.move(box.x+Math.min(20,box.width/2),box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+30,box.y+box.height/2-90,{steps:6});await page.mouse.up();await settle(page);
    const cell=page.locator('.search-hit[data-id="cn:33"] .cell').last();await cell.scrollIntoViewIfNeeded();const cellBox=await cell.boundingBox();assert.ok(cellBox);await page.mouse.move(cellBox.x+cellBox.width/2,cellBox.y+cellBox.height/2);await page.mouse.down();await page.mouse.move(cellBox.x+cellBox.width/2,cellBox.y+cellBox.height/2-90,{steps:6});await page.mouse.up();await settle(page);
    assert.deepEqual((await metrics(page)).speech.texts,[]);assert.equal((await state(page)).keypad,false);return {dragDistance:90};
   });
   await runCase(prefix+' disabling or hiding speech stops narration without altering either stored toggle unexpectedly',async()=>{
    await setup(page,role,mode);await settings(page,true,true);await tab(page,'order');await tap(name(page,'kr:7'));assert.equal((await state(page)).speaking,true);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));assert.equal((await state(page)).speaking,false);assert.equal((await state(page)).feedback.sound,true);
    await tab(page,'more');await tap(page.locator('[data-act="speech-toggle"]'));assert.equal((await state(page)).speech.enabled,false);await tab(page,'order');const count=(await metrics(page)).speech.texts.length;await tap(page.locator('.order[data-id="kr:8"] .num'));assert.equal((await metrics(page)).speech.texts.length,count);await close(page);
    await settings(page,true,true);await tab(page,'order');await tap(name(page,'kr:7'));await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});assert.equal((await state(page)).speaking,false);assert.equal((await state(page)).speech.enabled,true);assert.equal((await state(page)).feedback.sound,true);
    await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});assert.equal((await state(page)).speaking,false);return {stops:(await metrics(page)).speech.cancels};
   });
   await runCase(prefix+' speech preference survives reload with no autoplay or account-specific behavior',async()=>{
    await setup(page,role,mode);await settings(page,true,true);await page.reload();await page.evaluate(({role,mode})=>window.__ccx.setup(role,mode,false),{role,mode});await settle(page);
    let m=await metrics(page);assert.equal(m.state.speech.enabled,true);assert.equal(m.state.feedback.sound,true);assert.equal(m.audio.created,0);assert.deepEqual(m.speech.texts,[]);
    await tab(page,'more');assert.match(await page.locator('[data-act="speech-toggle"]').innerText(),/开/);await tab(page,'order');await tap(name(page,'kr:7'));m=await metrics(page);assert.equal(m.speech.texts.length,1);return {retained:m.state.speech};
   });
   if(mode==='finalized'){
    await runCase(prefix+' readonly names speak while quantities stay locked and supplier text stays unchanged',async()=>{
     await setup(page,role,mode);await settings(page,true,true);await search(page,'娃娃菜水饺');const before=await values(page);await tap(name(page,'kr:31'));await tap(name(page,'cn:21'));assert.equal((await state(page)).keypad,false);
     assert.equal(await page.locator('[data-act="edit"]').count(),0);await tap(page.locator('[data-act="cancel-find"]'));await tap(page.locator('[data-act="copy"]'));assert.deepEqual(await values(page),before);assert.equal(await page.evaluate(()=>window.__ccx.copied[0]),await page.evaluate(()=>window.__ccx.block('kr')));assert.equal((await state(page)).reads,0);return {locked:true};
    });
   }else{
    await runCase(prefix+' count opens untouched and closes with exact original quantity retained',async()=>{
     await setup(page,role,mode);await settings(page,true,true);await tab(page,'count');const before=(await values(page)).items['kr:7'];await tap(countCell(page,'kr:7','qty'));assert.equal((await row(page,'kr:7')).quantity,'12');assert.equal(await page.locator('.key-selection').count(),1);await close(page);assert.deepEqual((await values(page)).items['kr:7'],before);return {quantity:'12'};
    });
    await runCase(prefix+' first count digit replaces, later digits append and same-cell tap does not rearm',async()=>{
     await setup(page,role,mode);await settings(page,true,true);await tab(page,'count');await tap(countCell(page,'kr:7','qty'));const said=(await metrics(page)).speech.texts.length,audio=(await metrics(page)).audio.started;
     await key(page,'1');assert.equal((await row(page,'kr:7')).quantity,'1');await tap(countCell(page,'kr:7','qty'));await key(page,'8');assert.equal((await row(page,'kr:7')).quantity,'18');assert.equal((await metrics(page)).audio.started,audio,'click sounds are muted while speaking');assert.ok((await metrics(page)).speech.texts.length<=said+1,'numeric keys do not narrate');
     await finishSpeech(page);await page.waitForTimeout(50);await key(page,'0');assert.equal((await row(page,'kr:7')).quantity,'180');assert.ok((await metrics(page)).audio.started>audio,'click tones resume after speech');await close(page);await tap(countCell(page,'kr:7','qty'));await tap(page.locator('[data-act="undo"]'));assert.equal((await row(page,'kr:7')).quantity,'12');return {replacement:'12 → 1 → 18 → 180',undo:'12'};
    });
    await runCase(prefix+' deletion, decimal replacement, stock zero and order zero keep existing meanings',async()=>{
     await setup(page,role,mode);await tab(page,'count');await tap(countCell(page,'kr:7','qty'));await key(page,'del');await key(page,'8');assert.equal((await row(page,'kr:7')).quantity,'18');await close(page);
     await tap(countCell(page,'kr:7','stock'));await key(page,'.');await key(page,'5');assert.equal((await row(page,'kr:7')).stock,'0.5');await close(page);
     await tap(countCell(page,'kr:7','stock'));await key(page,'0');await close(page);assert.equal((await row(page,'kr:7')).stock,'0');await tap(countCell(page,'kr:7','qty'));await key(page,'0');await close(page);assert.equal((await row(page,'kr:7')).quantity,'');assert.notEqual((await values(page)).items['kr:7'].decision,'order');return {backspace:'18',decimal:'0.5',stockZero:'0',quantityZero:'no-order'};
    });
    await runCase(prefix+' order and search replacement stay immediate during active narration and autosave',async()=>{
     await setup(page,role,mode);await settings(page,true,true);await tab(page,'order');await tap(orderCell(page,'kr:7'));const said=(await metrics(page)).speech.texts.length;await key(page,'2');await key(page,'0');assert.equal((await row(page,'kr:7')).quantity,'20');assert.equal((await metrics(page)).speech.texts.length,said);assert.equal((await state(page)).speaking,true);await page.evaluate(()=>window.__ccx.flush());assert.equal((await state(page)).dirty,false);await close(page);
     await search(page,'腐竹');await tap(searchCell(page,'cn:33','qty'));await key(page,'8');assert.equal((await row(page,'cn:33')).quantity,'8');await close(page);assert.equal((await state(page)).orderSearchOpen,true);await tap(searchCell(page,'cn:33','qty'));await tap(page.locator('[data-act="undo"]'));assert.equal((await row(page,'cn:33')).quantity,'12');return {orderQuantity:'20',searchQuantity:'8 → undo12',mockCloudSaves:(await state(page)).saves};
    });
    await runCase(prefix+' plus and minus consume replacement selection and keep their arithmetic',async()=>{
     await setup(page,role,mode);await tab(page,'order');await tap(orderCell(page,'kr:7'));await tap(page.locator('[data-act="plus"]'));assert.equal((await row(page,'kr:7')).quantity,'13');await key(page,'8');assert.equal((await row(page,'kr:7')).quantity,'138');await close(page);
     await tap(orderCell(page,'kr:8'));await tap(page.locator('[data-act="minus"]'));assert.equal((await row(page,'kr:8')).quantity,'11');await close(page);return {plusThenDigit:'138',minus:'11'};
    });
    await runCase(prefix+' speech controls add zero keypad height or list obstruction',async()=>{
     await setup(page,role,mode);await tab(page,'count');await tap(countCell(page,'kr:7','qty'));const off=await geometry(page);await close(page);await settings(page,true,true);await tab(page,'count');await tap(countCell(page,'kr:7','qty'));const on=await geometry(page);
     assert.equal(on.pad.height,off.pad.height);assert.equal(on.pad.top,off.pad.top);assert.equal(on.scrollWidth,off.scrollWidth);assert.ok(on.scrollWidth<=width+1);assert.ok(on.pad.height<innerLimit(on.height));await page.screenshot({path:path.join(output,`${width}-${role}-speech-keypad.png`)});return {off,on};
    });
    await runCase(prefix+' legacy blank stock corrects while populated stock changes unit only on explicit replacement and undo restores both',async()=>{
     await setup(page,role,mode);await page.evaluate(()=>window.__ccx.legacy('kr:31',true));assert.equal((await row(page,'kr:31')).stockUnit,'개');assert.equal((await row(page,'kr:31')).stock,'');
     await page.evaluate(()=>window.__ccx.legacy('cn:21',false));await tab(page,'count');await tap(page.locator('[data-act="jumpcat"][data-cat="cn"]'));const old=await row(page,'cn:21');assert.equal(old.stock,'12');assert.equal(old.stockUnit,'箱');await tap(countCell(page,'cn:21','stock'));await close(page);assert.deepEqual(await row(page,'cn:21'),old);
     await tap(countCell(page,'cn:21','stock'));await key(page,'8');let changed=await row(page,'cn:21');assert.equal(changed.stock,'8');assert.equal(changed.stockUnit,'包');assert.equal(changed.unit,'箱');await close(page);await tap(countCell(page,'cn:21','stock'));await tap(page.locator('[data-act="undo"]'));changed=await row(page,'cn:21');assert.equal(changed.stock,'12');assert.equal(changed.stockUnit,'箱');assert.equal(changed.quantity,old.quantity);return {before:old,afterUndo:changed};
    });
    await runCase(prefix+' native input preserves untouched legacy stock and adopts its unit on explicit same-value entry with coupled undo',async()=>{
     const outcomes=[];
     for(const [where,id,wanted] of [['count','kr:31','개'],['search','cn:21','包']]){
      await setup(page,role,mode);await page.evaluate(id=>window.__ccx.legacy(id,false),id);await settings(page,true,true);
      if(where==='count')await tab(page,'count');else await search(page,'水饺');
      const cell=()=>where==='count'?countCell(page,id,'stock'):searchCell(page,id,'stock');const before=await row(page,id);
      await tap(cell());await tap(page.locator('[data-act="mode"][data-mode="text"]'));assert.equal(await page.locator('input.plain').inputValue(),'12');await close(page);assert.deepEqual(await row(page,id),before,'opening and closing native text mode is not a fresh measurement');
      await tap(cell());await tap(page.locator('[data-act="mode"][data-mode="text"]'));const said=(await metrics(page)).speech.texts.length;await page.locator('input.plain').fill('12');
      const entered=await row(page,id),m=await metrics(page);assert.equal(entered.stock,'12');assert.equal(entered.stockUnit,wanted);assert.equal(entered.unit,before.unit);assert.equal(entered.quantity,before.quantity);assert.equal(m.speech.texts.length,said);assert.deepEqual(m.audio.inputs,[{value:'12',trusted:true}],'same-value replacement comes from one trusted native input event');
      await close(page);await tap(cell());await tap(page.locator('[data-act="undo"]'));assert.deepEqual(await row(page,id),before,'undo restores the old number and old unit together');outcomes.push({where,id,before,entered,undone:await row(page,id)});
     }
     return {outcomes};
    });
    await runCase(prefix+' speech failure restores click feedback and never prevents quantity entry',async()=>{
     await setup(page,role,mode);await settings(page,true,true);await page.evaluate(()=>window.__speech.mode='throw');await tab(page,'order');await tap(orderCell(page,'kr:7'));assert.equal((await state(page)).speaking,false);await key(page,'8');assert.equal((await row(page,'kr:7')).quantity,'8');assert.ok((await metrics(page)).audio.started>0);return {quantity:'8',failureDidNotBlock:true};
    });
   }
  }finally{await context.close();}
 }
 }finally{await browser.close();}
 report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.filter(c=>!c.pass).length;fs.writeFileSync(path.join(output,'input-speech-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({engine:report.engine,browserVersion:report.browserVersion,passed:report.passed,failed:report.failed,pageErrors:report.errors,report:path.join(output,'input-speech-report.json')}));if(report.failed||report.errors.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
function innerLimit(height){return height*0.65;}
