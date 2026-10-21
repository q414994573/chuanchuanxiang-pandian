const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Core=require('../count-core.js');
const source=JSON.parse(fs.readFileSync(require.resolve('../current-order.json'),'utf8'));
function harness(production=false){
 const handlers={},saved=new Map(),find={blur(){document.activeElement=null;}};
 const document={documentElement:{dataset:{orderMode:production?'production':''}},body:{addEventListener(n,fn){handlers[n]=fn;},classList:{toggle(){},remove(){}}},
  activeElement:find,getElementById(id){return id==='find'?find:{};},
  querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}};
 const viewportHandlers={};
 const window={visualViewport:{offsetTop:0,height:400,addEventListener(n,fn){viewportHandlers[n]=fn;}},CountCore:Core,scrollY:80,scrollTo(x,y){this.scrollY=y;},addEventListener(){}};
 const ctx=vm.createContext({document,window,localStorage:{setItem(k,v){saved.set(k,v);},getItem(k){return saved.get(k)||null;}},
  setTimeout(){return 1;},clearTimeout(){},requestAnimationFrame(fn){fn();},URL,URLSearchParams,Date,Intl,console,
  C:require('../cloud/core.cjs'),A:require('../cloud/account.cjs'),S:require('../redesign-preview/search.cjs'),Flow:require('../redesign-preview/count-flow.cjs'),Backup:require('../redesign-preview/draft-backup.cjs'),Recovery:require('../redesign-preview/recovery.cjs'),Entry:require('../redesign-preview/entry-mode.cjs'),
  fixture:structuredClone(source),location:{search:'',href:'https://example.test/redesign-preview/'}});
 let js=fs.readFileSync(require.resolve('../redesign-preview/preview.js'),'utf8');
 js=js.replace(/^import .*;\n/gm,'').replace(/boot\(\)\.catch\([\s\S]*$/,'');vm.runInContext(js,ctx);
 const run=s=>vm.runInContext(s,ctx);
 run(`source=fixture;draft=Core().create(source,'2026-10-20','count-test-interactions');draft.seen={};draft.ackWrong={};screen='order';render=()=>{};scrollActive=()=>{};toast=t=>globalThis.lastToast=t;`);
 return {handlers,viewportHandlers,ctx,run,saved,find,document,window};
}
test('production mode guards IDs and ignores clicks while entry is locked',async()=>{
 const h=harness(true);assert.equal(h.run('KEY'),'ccx-ordering-draft-v1');assert.equal(h.run('MODE.draftCollection'),'liveCountDrafts');
 assert.doesNotThrow(()=>h.run(`guardTest('count-existing')`));assert.throws(()=>h.run(`guardTest('test-count-existing')`));
 h.run(`copyOnly=async()=>{globalThis.copied=true}`);const button={dataset:{act:'fixed-link'}};
 await h.handlers.click({target:{closest:s=>s==='[data-act]'?button:null}});assert.equal(h.run('globalThis.copied'),undefined);
});
test('supplier export keeps category order, current quantities and units, excluding cancelled items despite filters',()=>{
 const h=harness();h.run(`buildSample('boss');order.quantities['cn:9']=3500;order.quantities['cn:5']=0;query='不存在';yellowOnly=true;`);
 const text=h.run(`blockText('cn')`);
 assert.match(text,/鸡精 3.5箱/);assert.doesNotMatch(text,/辣椒段|대파|탕용기/);
 const expected=h.run(`catalog().filter(p=>p.cat==='cn'&&order.quantities[p.id]>0).map(p=>p.name+' '+C.textQuantity(order.quantities[p.id])+order.units[p.id])`).join('\n');
 assert.equal(text.split('\n').slice(1).join('\n'),expected);
});
test('supplier export requires saved finalized current cloud order and never marks it sent',async()=>{
 const h=harness();let copied='';h.ctx.navigator={clipboard:{writeText:async t=>{copied=t;}}};
 h.run(`buildSample('boss');sample=false;member={role:'editor'};baseQty={...order.quantities};api={read:async()=>({...order})};`);
 await assert.rejects(h.run(`supplierExport('kr')`),/定稿/);
 h.run(`order.orderStage='finalized';order.quantities['kr:7']+=1000`);
 await assert.rejects(h.run(`supplierExport('kr')`),/先保存/);
 h.run(`baseQty={...order.quantities};api.read=async()=>({...order,revision:99})`);
 await assert.rejects(h.run(`supplierExport('kr')`),/云端订单已更新/);assert.equal(copied,'');
 h.run(`api.read=async()=>{throw Error('断网')}`);await assert.rejects(h.run(`supplierExport('kr')`),/断网/);assert.equal(copied,'');
 h.run(`api.read=async()=>({...order})`);await h.run(`supplierExport('kr')`);
 assert.equal(copied,'');assert.equal(h.run('preparedExport.text'),h.run(`blockText('kr')`));
 await h.run('deliverPrepared(false)');assert.equal(copied,h.run(`blockText('kr')`));assert.equal(h.run('order.orderStage'),'finalized');assert.match(h.run('lastToast'),/已复制/);assert.doesNotMatch(h.run('lastToast'),/已发送/);
 h.run(`order.orderStage='pending'`);await assert.rejects(h.run('deliverPrepared(false)'),/订单已变化/);
});
test('supplier export rejects account changes during cloud check',async()=>{
 const h=harness();h.ctx.navigator={clipboard:{writeText:async()=>{throw Error('should not copy');}}};
 h.run(`buildSample('boss');sample=false;baseQty={...order.quantities};order.orderStage='finalized';api={read:()=>new Promise(resolve=>globalThis.finishRead=resolve)};`);
 const pending=h.run(`supplierExport('kr')`);h.run(`sessionEpoch++;finishRead({...order})`);
 await assert.rejects(pending,/页面内容已改变/);
});
test('clipboard fallback failure never reports success and removes temporary field',async()=>{
 const h=harness();let removed=0;h.ctx.navigator={clipboard:{writeText:async()=>{throw Error('denied');}}};
 h.document.createElement=()=>({select(){},remove(){removed++;}});h.document.body.appendChild=()=>{};h.document.execCommand=()=>false;
 await assert.rejects(h.run(`copyOnly('test')`),/复制失败/);assert.equal(h.run('globalThis.lastToast'),undefined);assert.equal(removed,1);
 h.document.execCommand=()=>true;await h.run(`copyOnly('test')`);assert.match(h.run('lastToast'),/已复制/);assert.equal(removed,2);
});
test('cancelling system share neither copies nor claims delivery',async()=>{
 const h=harness();h.ctx.navigator={share:async()=>{const e=Error('cancel');e.name='AbortError';throw e;},clipboard:{writeText:async()=>{throw Error('should not copy');}}};
 await h.run(`shareOrCopy('test')`);assert.equal(h.run('globalThis.lastToast'),undefined);
});
test('save success survives audit read failure and preserves input made during save',async()=>{
 const h=harness();h.ctx.crypto={randomUUID:()=> 'save-test-id'};
 h.run(`buildSample('boss');sample=false;member={role:'editor'};baseQty={...order.quantities};order.quantities['cn:9']=2000;api={save:(id,base,q)=>new Promise(resolve=>globalThis.finishSave=()=>resolve({...base,quantities:{...q},revision:2})),history:async()=>{throw Error('audit offline')}};`);
 const saving=h.run('saveOrder()');h.run(`order.quantities['cn:9']=3000;finishSave()`);await saving;
 assert.equal(h.run(`order.quantities['cn:9']`),3000);assert.equal(h.run(`baseQty['cn:9']`),2000);assert.equal(h.run('dirtyCount()'),1);
 assert.match(h.run('lastToast'),/前一批修改已保存.*还需保存.*修改记录暂未读到/);
});
test('late save response does not restore a signed-out order',async()=>{
 const h=harness();h.ctx.crypto={randomUUID:()=> 'save-test-id'};
 h.run(`buildSample('boss');sample=false;member={role:'editor'};baseQty={...order.quantities};order.quantities['cn:9']=2000;api={save:(id,base,q)=>new Promise(resolve=>globalThis.finishSave=()=>resolve({...base,quantities:{...q},revision:2})),history:async()=>[]};`);
 const saving=h.run('saveOrder()');h.run(`sessionEpoch++;order=null;member=null;finishSave()`);await saving;assert.equal(h.run('order'),null);
});
test('restore file keeps current draft on storage failure, and creates independent draft on success',async()=>{
 const h=harness();h.ctx.confirm=()=>true;h.ctx.crypto={randomUUID:()=> 'restored-test'};h.window.history={replaceState(){}};
 h.run(`member={role:'owner'};globalThis.backupRaw=JSON.stringify({draft});globalThis.oldDraft=draft;globalThis.originalSet=localStorage.setItem;localStorage.setItem=()=>{throw Error('quota')};`);
 h.ctx.testFile={size:100,text:async()=>h.run('backupRaw')};
 await assert.rejects(h.run('restoreBackupFile(testFile)'),/quota/);assert.equal(h.run('draft===oldDraft'),true);
 h.run('localStorage.setItem=originalSet');await h.run('restoreBackupFile(testFile)');
 assert.equal(h.run('draft.id'),'count-restored-test');assert.equal(h.run('draft.status'),'draft');assert.equal(h.run('order'),null);assert.equal(h.run('allSeen()'),false);
 assert.equal([...h.saved.keys()].some(k=>k.includes(':recovery:')),true);
});
test('cloud order URL uses browser history even when audit history is an array',()=>{
 const h=harness();let path;
 h.window.history={replaceState(a,b,p){path=p;}};
 h.run(`history=[];historyReplace(new URL('https://example.test/redesign-preview/?order=test-count-one'))`);
 assert.equal(path,'/redesign-preview/?order=test-count-one');
});
test('fixed entry scans beyond a production-only page and checks without replacing edits',async()=>{
 const h=harness();h.run(`member={role:'editor'};order={id:'test-count-old',quantities:{x:2000}};orderDirty=true;let calls=0;api={listPage:async cursor=>{calls++;return cursor?{records:[{id:'test-count-new',date:'2026-10-21'}],hasMore:false}:{records:[{id:'count-live'}],cursor:'next',hasMore:true}}};`);
 await h.run('checkLatest()');assert.equal(h.run('latestOrder.id'),'test-count-new');assert.equal(h.run('order.id'),'test-count-old');assert.equal(h.run('order.quantities.x'),2000);
 assert.equal(h.run('calls'),2);assert.match(h.run('latestText()'),/另一份/);
 h.ctx.location.href='https://example.test/redesign-preview/?order=test-count-old&sample=boss';
 assert.equal(h.run('fixedEntryUrl()'),'https://example.test/redesign-preview/');
 h.run(`api.listPage=async()=>{throw Error('断网')}`);await h.run('checkLatest()');assert.match(h.run('latestMessage'),/检查失败/);assert.equal(h.run('order.id'),'test-count-old');
});
test('date results preserve multiple same-day orders and ignore late responses',async()=>{
 const h=harness();h.run(`member={role:'editor'};api={onDate:date=>new Promise(resolve=>{globalThis.pendingDates=globalThis.pendingDates||{};pendingDates[date]=resolve})};`);
 const first=h.run(`findOrders('2026-10-20')`),second=h.run(`findOrders('2026-10-21')`);
 h.run(`pendingDates['2026-10-21']([{id:'test-count-a',date:'2026-10-21'},{id:'test-count-b',date:'2026-10-21'},{id:'count-live',date:'2026-10-21'}])`);await second;
 h.run(`pendingDates['2026-10-20']([{id:'test-count-stale'}])`);await first;
 assert.equal(h.run('directoryRecords.length'),2);assert.equal(h.run('directoryDate'),'2026-10-21');assert.doesNotMatch(h.run('directoryHtml()'),/stale|count-live/);
});
test('latest-order action does not discard input started while checking the server',async()=>{
 const h=harness();h.run(`member={role:'editor'};dirtyCount=()=>0;checkLatest=()=>new Promise(resolve=>globalThis.resolveLatest=resolve);openOrder=async()=>{globalThis.opened=true};`);
 const button={dataset:{act:'latest-order'}};
 const click=h.handlers.click({target:{closest:s=>s==='[data-act]'?button:null}});
 h.run(`editId='cn:9';editRaw='12';resolveLatest({id:'test-count-new'})`);await click;
 assert.equal(h.run('globalThis.opened'),undefined);assert.match(h.run('lastToast'),/保留/);
});
test('opening a fixed entry preserves its URL and rejects edits made while reading',async()=>{
 const h=harness();let path;h.window.history={replaceState(a,b,p){path=p;}};
 h.run(`globalThis.fixtureOrder={id:'test-count-one',snapshot:JSON.stringify(draft),quantities:{},units:{},revision:1};api={read:()=>new Promise(resolve=>globalThis.resolveRead=resolve),history:async()=>[]};`);
 const reading=h.run(`openOrder('test-count-one',true)`);h.run(`editRaw='12';resolveRead(fixtureOrder)`);
 await assert.rejects(reading,/保留当前输入/);assert.equal(h.run('order'),null);
 h.run(`editRaw=null;api.read=async()=>fixtureOrder`);await h.run(`openOrder('test-count-one',true)`);assert.equal(path,'/redesign-preview/');
 await h.run(`openOrder('test-count-one')`);assert.equal(path,'/redesign-preview/?order=test-count-one');
});
test('finalization requires saved edits, boss role and a successful server response',async()=>{
 const h=harness();h.ctx.confirm=()=>true;h.ctx.crypto={randomUUID:()=> 'workflow-test-mutation'};
 h.run(`member={role:'editor'};order={id:'test-count-one',revision:2,quantities:{},units:{}};dirtyCount=()=>1;api={finalize:async()=>{throw Error('断网')}};`);
 await assert.rejects(h.run(`changeOrderStage('finalized')`),/先保存/);
 h.run('dirtyCount=()=>0');await assert.rejects(h.run(`changeOrderStage('finalized')`),/断网/);
 assert.equal(h.run('order.orderStage'),undefined);
 h.run(`member={role:'owner'}`);await assert.rejects(h.run(`changeOrderStage('finalized')`),/老板娘/);
 h.run(`member={role:'editor'};api={finalize:async()=>({...order,orderStage:'finalized',revision:3}),history:async()=>[]};`);
 await h.run(`changeOrderStage('finalized')`);
 assert.equal(h.run('order.orderStage'),'finalized');assert.match(h.run('dockHtml()'),/重新修改/);
 assert.throws(()=>h.run(`applyQty('cn:9','3')`),/已定稿/);
 h.run(`openOrderKey('cn:9')`);assert.equal(h.run('keypad'),false);
});
test('search gestures: drag/cancel never edit; tap opens once; ordinary click works',async()=>{
 const h=harness();h.run('globalThis.opens=0;openFromRow=()=>{opens++};');
 const row={dataset:{act:'edit',id:'cn:9',search:'true',field:'qty'}};
 const target={closest(s){return s.includes('data-act="open"')||s==='[data-act]'?row:null;}};
 let prevented=0;
 const e=(x,y)=>({target,clientX:x,clientY:y,pointerId:1,isPrimary:true,button:0,preventDefault(){prevented++;}});
 h.handlers.pointerdown(e(30,100));assert.equal(h.run('opens'),0);assert.equal(prevented,0);
 h.handlers.pointermove(e(30,160));h.handlers.pointerup(e(30,160));await h.handlers.click(e(30,160));assert.equal(h.run('opens'),0);
 h.handlers.pointerdown(e(30,100));h.handlers.pointercancel(e(30,100));await h.handlers.click(e(30,100));assert.equal(h.run('opens'),0);
 h.handlers.pointerdown(e(30,100));h.handlers.pointerup(e(32,103));await h.handlers.click(e(32,103));assert.equal(h.run('opens'),1);
 h.document.activeElement=null;h.handlers.pointerdown(e(30,100));h.handlers.pointerup(e(30,100));await h.handlers.click(e(30,100));assert.equal(h.run('opens'),2);
});
test('search cells reuse original keypad, selected caret, text switch and stock/quantity sequence',async()=>{
 const h=harness();h.run(`query='鸡精';openFromRow({dataset:{act:'edit',search:'true',id:'cn:9',field:'stock'}})`);
 assert.equal(h.run('screen'),'order');assert.equal(h.run('query'),'鸡精');
 assert.equal(h.run('keypad'),true);assert.equal(h.run('textMode'),false);
 assert.match(h.run('searchHits()'),/class="caret"/);assert.doesNotMatch(h.run('searchHits()'),/<input/);
 assert.match(h.run('orderPad()'),/data-act="mode" data-mode="text"/);
 assert.doesNotMatch(h.run('orderPad()'),/data-act="zero"/);
 h.run(`typeOrderKey('0');advanceOrder()`);assert.equal(h.run(`draft.items['cn:9'].stock`),'0');assert.equal(h.run('editField'),'qty');
 assert.match(h.run('orderPad()'),/data-act="zero"/);
 h.run(`typeOrderKey('3')`);assert.equal(h.run(`qtyOf('cn:9')`),'3');
 h.run('advanceOrder()');assert.equal(h.run('keypad'),false);
 assert.equal(JSON.parse(h.saved.get('ccx-redesign-draft-v2')).draft.items['cn:9'].quantity,'3');
 h.run(`openOrderKey('cn:9','stock');textMode=true;`);assert.match(h.run('searchHits()'),/<input class="plain"/);
 const plain={value:'半箱'};h.document.querySelector=s=>s==='input.plain'?plain:null;
 h.run('readPlain()');assert.equal(h.run(`stockShown(product('cn:9'))`),'半箱');
 const mode={dataset:{act:'mode',mode:'num'}};
 await h.handlers.click({target:{closest(s){return s==='[data-act]'?mode:null;}}});
 assert.equal(h.run('textMode'),false);assert.equal(h.run('editRaw'),'半箱');
});
test('next field follows visible search results and Other only offers quantity',()=>{
 const h=harness();h.run(`query='豆腐';globalThis.hits=catalog().filter(p=>S.matches(p,query,aliasesOf(p)));openOrderKey(hits[0].id,'qty');advanceOrder();`);
 assert.equal(h.run('editId'),h.run('hits[1].id'));assert.equal(h.run('editField'),'stock');
 h.run(`query='탕용기';commitOrderEdit();`);assert.doesNotMatch(h.run('searchHits()'),/data-field="stock"/);
 h.run(`openOrderKey('other:11','qty')`);assert.throws(()=>h.run(`typeOrderKey('2')`),/单位/);
 assert.equal(h.run(`qtyOf('other:11')`),'');
});
test('cancel order and undo preserve stock and restore original quantity in search',()=>{
 const h=harness();h.run(`query='鸡精';applyQty('cn:9','5');openOrderKey('cn:9');cancelLine('cn:9');`);
 assert.equal(h.run(`qtyOf('cn:9')`),'');assert.equal(h.run('keypad'),true);
 assert.match(h.run('orderPad()'),/data-act="undo"/);
 h.run('doUndo()');assert.equal(h.run(`qtyOf('cn:9')`),'5');assert.equal(h.run('query'),'鸡精');
 assert.equal(h.run(`stockShown(product('cn:9'))`),'');
 h.run(`openOrderKey('cn:9','stock');typeOrderKey('2');advanceOrder();doUndo();`);
 assert.equal(h.run('editField'),'stock');assert.equal(h.run(`stockShown(product('cn:9'))`),'');
});
test('cancel search restores original category/scroll; incomplete input cannot silently disappear',()=>{
 const h=harness();h.run(`orderCat='cn';rememberSearchOrigin();query='鸡精';openOrderKey('cn:9');typeOrderKey('2');typeOrderKey('.');cancelFind();`);
 assert.equal(h.run('query'),'鸡精');assert.equal(h.run('keypad'),true);
 h.run(`typeOrderKey('5');cancelFind()`);assert.equal(h.run('query'),'');assert.equal(h.run('orderCat'),'cn');assert.equal(h.window.scrollY,80);
 assert.equal(h.run(`qtyOf('cn:9')`),'2.5');
});
test('boss uses same order controls while submitted inventory stays immutable',()=>{
 const h=harness();h.run(`buildSample('boss');query='감자';`);const before=h.run('order.snapshot');
 assert.match(h.run('searchHits()'),/aria-disabled="true"/);
 h.run(`openOrderKey('kr:7','stock')`);assert.equal(h.run('editId'),null);
 h.run(`openOrderKey('kr:7');stepQty(1)`);assert.equal(h.run(`qtyOf('kr:7')`),'11');
 h.run(`stepQty(-1)`);assert.equal(h.run(`qtyOf('kr:7')`),'10');
 h.run(`cancelLine('kr:7');doUndo()`);assert.equal(h.run(`qtyOf('kr:7')`),'10');
 assert.equal(h.run('order.snapshot'),before);
});
test('text stock 0 is inventory zero, cloud text quantity blocks close/save and local failure is explicit',async()=>{
 const h=harness();h.run(`query='鸡精';openOrderKey('cn:9','stock');textMode=true;`);
 const plain={value:'0'};h.document.querySelector=s=>s==='input.plain'?plain:null;
 h.run('readPlain()');assert.equal(h.run(`stockShown(product('cn:9'))`),'0');
 h.document.querySelector=()=>null;h.run(`textMode=false;commitOrderEdit();buildSample('boss');openOrderKey('cn:9');textMode=true;`);
 plain.value='两箱';h.document.querySelector=s=>s==='input.plain'?plain:null;
 assert.equal(h.run('closePad()'),false);assert.equal(h.run('textMode'),true);
 assert.match(h.run('lastToast'),/只能存数字/);
 const local=harness();local.run(`openOrderKey('cn:9');globalThis.realSave=localStorage.setItem;localStorage.setItem=()=>{throw Error('quota')}`);
 assert.throws(()=>local.run(`typeOrderKey('5')`),/本机保存失败/);
 assert.equal(local.run('localSaveFailed'),true);
 local.run('localStorage.setItem=realSave;commitOrderEdit()');assert.equal(local.run('localSaveFailed'),false);
});

test('template unit choices persist independently, export correctly and lock submitted inventory',()=>{
 const h=harness();h.run(`member={role:'owner'};selectUnit('cn:45','stock','봉');selectUnit('cn:45','qty','박스');applyQty('cn:45','2');`);
 assert.equal(h.run(`draft.items['cn:45'].stockUnit`),'봉');assert.equal(h.run(`draft.items['cn:45'].unit`),'박스');
 assert.match(h.run(`blockText('cn')`),/연근분모자 2박스/);
 assert.match(h.run(`countRows()`),/data-row/);
 assert.equal(JSON.parse(h.saved.get(h.run('KEY'))).draft.items['cn:45'].unit,'박스');
 assert.throws(()=>h.run(`selectUnit('cn:45','qty','袋')`),/模板/);
 h.run(`buildSample('boss');sample=false;baseQty={...order.quantities};member={role:'editor'};globalThis.originalStock=order.snapshot;selectUnit('other:11','qty','몸통만');applyQty('other:11','3');`);
 assert.equal(h.run('dirtyCount()'),1);assert.match(h.run(`blockText('other')`),/탕용기\(소\) 3몸통만/);
 assert.equal(h.run('order.snapshot===originalStock'),true);
 assert.throws(()=>h.run(`selectUnit('cn:45','stock','박스')`),/只能查看/);
 h.run(`order.orderStage='finalized'`);assert.throws(()=>h.run(`selectUnit('other:11','qty','세트')`),/只能查看/);
});
test('unit-only edits save, remain dirty on failure and record old and new units',async()=>{
 const h=harness();h.ctx.crypto={randomUUID:()=> 'unit-only-save'};
 h.run(`buildSample('boss');sample=false;baseQty={...order.quantities};member={role:'editor'};selectUnit('cn:45','qty','봉');api={save:async()=>{throw Error('断网')}};`);
 await assert.rejects(h.run('saveOrder()'),/断网/);assert.equal(h.run('dirtyCount()'),1);
 h.run(`api={save:async(id,base,q,mid,patch)=>({...base,quantities:{...q},units:{...patch.units},revision:2}),history:async()=>[]};`);
 await h.run('saveOrder()');assert.equal(h.run('dirtyCount()'),0);assert.equal(h.run(`baseUnits['cn:45']`),'봉');
 const html=h.run(`C.historyHtml(catalog(),[{revision:2,quantities:{'cn:45':2000},units:{'cn:45':'봉'}},{revision:1,quantities:{'cn:45':2000},units:{'cn:45':'박스'}}],false)`);
 assert.match(html,/2박스 → 2봉/);
});

for(const failure of ['network','json','http','shape']){
 test(`preview config ${failure} failure preserves local recovery while production stays locked`,async()=>{
  for(const production of [false,true]){
   const h=harness(production),requests=[];
   h.run(`draft.items['cn:9'].quantity='12';draft.items['cn:9'].decision='order';draft.items['kr:3'].stock='0';globalThis.envelope=JSON.stringify({draft,pos:2,field:'qty'});localStorage.setItem(KEY,envelope);draft=null;loadArchives=()=>{};`);
   h.ctx.fetch=async url=>{requests.push(url);if(url.includes('firebase-config')){
    if(failure==='network')throw Error('offline');
    return {ok:failure!=='http',json:async()=>{if(failure==='json')throw SyntaxError('bad JSON');return failure==='shape'?null:{enabled:true};}};
   }return {ok:true,json:async()=>url.includes('aliases')?{items:[]}:structuredClone(source)};};
   await h.run('boot()');
   assert.equal(h.run('releaseLocked'),production);
   assert.equal(h.saved.get(h.run('KEY')),h.run('envelope'));
   if(production){assert.equal(h.run('draft'),null);assert.equal(requests.length,1);assert.match(h.run('app.innerHTML'),/正式入口准备中/);}
   else{
    assert.equal(h.run(`draft.items['cn:9'].quantity`),'12');assert.equal(h.run(`draft.items['kr:3'].stock`),'0');
    assert.match(h.run('backupMessage()'),/配置加载失败.*暂未备份/);
    assert.match(h.run('moreHtml()'),/下载本机草稿备份/);
    h.run(`Core().edit(draft,'cn:9','quantity','13');persistLocal()`);
    assert.equal(JSON.parse(h.saved.get(h.run('KEY'))).draft.items['cn:9'].quantity,'13');
   }
  }
 });
}

test('More groups every existing tool without changing role permissions or losing order lookup on redraw',()=>{
 const h=harness(true);h.run(`releaseLocked=false;member={role:'owner',name:'大伟'};api={};`);
 let html=h.run('moreHtml()'),main=html.split('<details id="moreTools"')[0],tools=html.split('<details id="moreTools"')[1];
 for(const title of ['账号 · 大伟','盘货日期','查订单','修改记录'])assert.ok(main.includes(title),title);
 for(const action of ['backup-export','restore-file','fresh','logout','sample']){assert.ok(tools.includes('data-act="'+action+'"'),action);assert.ok(!main.includes('data-act="'+action+'"'),action);}
 for(const label of ['修改密码','旧版记录','10月18日存档','历史档案（原有存档）','放到主屏幕'])assert.ok(tools.includes(label),label);
 assert.doesNotMatch(html,/<details id="moreTools"[^>]*\bopen\b/);
 assert.match(main,/data-act="find-date"/);assert.match(main,/data-act="fixed-link"/);
 h.handlers.toggle({target:{id:'moreTools',open:true}});h.run(`morePane='archive'`);html=h.run('moreHtml()');assert.match(html,/<details id="moreTools"[^>]*\bopen\b/);assert.match(html,/只看已经确认的旧单/);
 h.run(`buildSample('boss');sample=false;member={role:'editor',name:'老板娘'};api={};moreToolsOpen=false;`);html=h.run('moreHtml()');
 for(const action of ['restore-file','fresh','backup-export','legacy-import'])assert.ok(!html.includes('data-act="'+action+'"'),action);
 assert.match(html,/data-act="order-backup"/);assert.match(html,/id="pass"/);assert.match(html,/data-act="find-date"/);
});

test('search lifts results above native keyboard without changing order or input; resize follows viewport',()=>{
 const h=harness();let top=430;const moves=[];
 h.window.scrollBy=(x,y)=>{moves.push(y);top-=y;};
 h.document.querySelector=s=>s==='.search'?{getBoundingClientRect:()=>({top})}:s==='.banner'?{getBoundingClientRect:()=>({bottom:58})}:null;
 h.run(`buildSample('boss');globalThis.beforeSearch=JSON.stringify(order);query='土豆';`);
 h.handlers.focusin({target:{id:'find'}});
 assert.equal(top,66);assert.equal(h.document.activeElement,h.find);
 assert.equal(h.run('JSON.stringify(order)===beforeSearch'),true);
 h.window.visualViewport.offsetTop=25;h.window.visualViewport.height=300;top=350;
 h.viewportHandlers.resize();assert.equal(top,66);
 h.document.activeElement=null;const count=moves.length;h.viewportHandlers.resize();assert.equal(moves.length,count);
});
test('search viewport respects counting sticky bar and ignores unfocused/keypad mode',()=>{
 const h=harness();let top=500;
 h.window.scrollBy=(x,y)=>{top-=y;};
 h.document.querySelector=s=>s==='.search'?{getBoundingClientRect:()=>({top})}:s==='.bar'?{getBoundingClientRect:()=>({bottom:190})}:null;
 h.run(`screen='count';scrollSearch()`);assert.equal(top,198);
 h.run(`textMode=true;scrollActive=()=>{globalThis.numericScrolled=true}`);
 top=500;h.viewportHandlers.resize();assert.equal(h.run('numericScrolled'),true);assert.equal(top,500);
});
