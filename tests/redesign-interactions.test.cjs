const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Core=require('../count-core.js');
const source=JSON.parse(fs.readFileSync(require.resolve('../current-order.json'),'utf8'));
function harness(production=false){
 const handlers={},saved=new Map(),find={blur(){document.activeElement=null;}};
 const document={documentElement:{dataset:{orderMode:production?'production':''}},body:{addEventListener(n,fn){handlers[n]=fn;},classList:{toggle(){},remove(){}}},
  activeElement:find,getElementById(id){return id==='find'?find:{};},
  querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}};
 const viewportHandlers={};
 const window={history:{replaceState(){}},visualViewport:{offsetTop:0,height:400,addEventListener(n,fn){viewportHandlers[n]=fn;}},CountCore:Core,scrollY:80,scrollTo(x,y){this.scrollY=y;},addEventListener(){}};
 const ctx=vm.createContext({document,window,localStorage:{setItem(k,v){saved.set(k,v);},getItem(k){return saved.get(k)??null;}},
  setTimeout(){return 1;},clearTimeout(){},requestAnimationFrame(fn){fn();},URL,URLSearchParams,Date,Intl,console,
  Shared:require('../redesign-preview/shared-draft.cjs'),Auto:require('../redesign-preview/order-autosave.cjs'),C:require('../cloud/core.cjs'),A:require('../cloud/account.cjs'),S:require('../redesign-preview/search.cjs'),Flow:require('../redesign-preview/count-flow.cjs'),Backup:require('../redesign-preview/draft-backup.cjs'),Recovery:require('../redesign-preview/recovery.cjs'),Entry:require('../redesign-preview/entry-mode.cjs'),
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
 h.run(`member={role:'owner'}`);await assert.rejects(h.run(`changeOrderStage('finalized')`),/授权账号/);
 h.run(`member={role:'editor'};api={finalize:async()=>({...order,orderStage:'finalized',revision:3}),history:async()=>[]};`);
 await h.run(`changeOrderStage('finalized')`);
 assert.equal(h.run('order.orderStage'),'finalized');assert.match(h.run('dockHtml()'),/解除定稿/);
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
test('boss can correct inventory with confirmation without changing the submitted snapshot',()=>{
 const h=harness();h.run(`buildSample('boss');screen='count';query='감자';`);const before=h.run('order.snapshot');
 assert.match(h.run('searchHits()'),/data-field="stock"/);
 h.ctx.confirm=()=>false;h.run(`openOrderKey('kr:7','stock')`);assert.equal(h.run('editId'),null);
 h.ctx.confirm=()=>true;h.run(`openOrderKey('kr:7','stock');typeOrderKey('0');closePad()`);assert.equal(h.run(`stocks['kr:7']`),'0');
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
 h.ctx.confirm=()=>true;h.run(`selectUnit('cn:45','stock','박스')`);assert.equal(h.run(`order.stockUnits['cn:45']`),'박스');
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
    assert.match(h.run('moreHtml()'),/保存这份盘货备份/);
    h.run(`Core().edit(draft,'cn:9','quantity','13');persistLocal()`);
    assert.equal(JSON.parse(h.saved.get(h.run('KEY'))).draft.items['cn:9'].quantity,'13');
   }
  }
 });
}

test('More separates backup, account and history without losing tools or changing permissions',()=>{
 const h=harness(true);h.run(`releaseLocked=false;member={role:'owner',name:'大伟'};api={};`);
 let html=h.run('moreHtml()');
 for(const title of ['账号 · 大伟','盘货日期','查订单','修改记录','数据备份与恢复','账号设置','历史资料','作废当前盘货'])assert.ok(html.includes(title),title);
 for(const act of ['backup-export','restore-file','fresh','logout'])assert.ok(html.includes('data-act="'+act+'"'),act);
 assert.doesNotMatch(html,/data-act="sample"|备用工具|moreTools/);
 for(const id of ['backup','account','history','legacy','restart','home'])assert.ok(html.includes('data-more-section="'+id+'"'),id);
 assert.match(html,/data-act="find-date"/);assert.match(html,/data-act="fixed-link"/);
 h.handlers.toggle({target:{dataset:{moreSection:'history'},open:true}});h.run(`morePane='archive'`);html=h.run('moreHtml()');assert.match(html,/data-more-section="history" open/);assert.match(html,/只看已经确认的旧单/);
 h.run(`buildSample('boss');sample=false;member={role:'editor',name:'老板娘'};api={};`);html=h.run('moreHtml()');
 for(const act of ['restore-file','fresh','backup-export','legacy-import'])assert.ok(!html.includes('data-act="'+act+'"'),act);
 assert.match(html,/data-act="order-backup"/);assert.match(html,/id="pass"/);
 assert.match(html,/当前打开的订单/);assert.match(html,/下载备份不会把修改上传云端/);
 const preview=harness();assert.match(preview.run('moreHtml()'),/data-act="sample"/);
});
test('reviewed count has next-count entry, unfinished count has explicit discard and help',()=>{
 const h=harness(true);h.run(`member={role:'owner'};draft.status='reviewed'`);
 assert.match(h.run('moreHtml()'),/开始下一次盘货/);assert.doesNotMatch(h.run('moreHtml()'),/>作废当前盘货</);
 h.run(`draft.status='draft'`);assert.match(h.run('moreHtml()'),/作废当前盘货的说明/);
 assert.match(h.run('moreHtml()'),/这不是删除云端订单/);
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

test('reviewed local record resumes its exact cloud order after fixed-entry reload, then quantities save and reload',async()=>{
 const h=harness();h.window.history={replaceState(){}};h.ctx.crypto={randomUUID:()=> 'test-save-order-state'};
 h.run(`member={role:'owner',name:'大伟'};user={uid:'test-owner'};Core().edit(draft,'kr:7','quantity','1');
 for(const p of draft.catalog){draft.seen[p.id]=true;Core().finish(draft,p.id,p.id!=='kr:7');}
 api={create:async(id,payload)=>{globalThis.remote={id,...payload,revision:1,orderStage:'pending'};return C.clone(remote)},read:async id=>{if(id!==remote.id)throw Error('wrong order');return C.clone(remote)},history:async()=>[],save:async(id,base,q,mutation,patch)=>{C.assertRevision(remote.revision,base.revision);remote={...remote,quantities:{...q},units:patch.units,revision:remote.revision+1};return C.clone(remote)}};`);
 await h.run('confirmShare()');assert.equal(h.run('order.id'),h.run('C.cloudOrderId(draft.id,MODE.test)'));
 assert.equal(h.run('draft.status'),'reviewed');
 h.run(`order=null;screen='count';loadLocal()`);assert.equal(h.run('screen'),'order');
 assert.doesNotMatch(h.run('draftOrderHtml()'),/盘货中|盘货草稿预览/);
 await h.run('resumeReviewedOrder()');h.run(`openOrderKey('kr:7');applyQty('kr:7','3');editRaw='3';`);
 await h.run('saveOrder()');assert.equal(h.run("remote.quantities['kr:7']"),3000);
 h.run('order=null');await h.run('resumeReviewedOrder()');assert.equal(h.run("order.quantities['kr:7']"),3000);
 assert.equal(h.run('draft.items["kr:7"].quantity'),'1');
});
test('reviewed local record cannot open editable keypad when cloud read fails; draft and other cloud order preserved',async()=>{
 const h=harness();h.run(`draft.status='reviewed';member={role:'owner'};api={read:async()=>{throw Error('断网')}};globalThis.originalDraft=JSON.stringify(draft)`);
 h.run(`openOrderKey('kr:7')`);assert.equal(h.run('keypad'),false);assert.equal(h.run('editId'),null);
 assert.throws(()=>h.run(`applyQty('kr:7','2')`),/云端订单/);
 await h.run('resumeReviewedOrder()');assert.equal(h.run('order'),null);assert.match(h.run('status'),/断网/);
 assert.equal(h.run('JSON.stringify(draft)===originalDraft'),true);
 h.run(`draft.status='draft';globalThis.reads=0;api.read=async()=>{reads++}`);await h.run('resumeReviewedOrder()');assert.equal(h.run('reads'),0);
 h.run(`draft.status='reviewed';order={id:'other-open-order'}`);await h.run('resumeReviewedOrder()');assert.equal(h.run('order.id'),'other-open-order');assert.equal(h.run('reads'),0);
});
test('finalized cloud order never opens keypad, pending cloud order does',()=>{
 const h=harness();h.run(`buildSample('boss');order.orderStage='finalized';keypad=false;openOrderKey('kr:7')`);assert.equal(h.run('keypad'),false);
 h.run(`order.orderStage='pending';openOrderKey('kr:7')`);assert.equal(h.run('keypad'),true);
});

test('order screen keeps only current order; More owns lookup and accessible help',()=>{
 const h=harness();h.run(`buildSample('boss');sample=false;member={role:'editor'};api={};`);
 assert.doesNotMatch(h.run('orderHtml()'),/data-order-entry|data-act="latest-order"|data-act="find-date"/);
 const more=h.run('moreHtml()');assert.match(more,/data-act="latest-order">查看最新订单/);
 assert.doesNotMatch(more,/data-act="check-latest"/);
 assert.match(more,/aria-label="查看最新订单的说明"/);assert.match(more,/若当前有未保存的修改/);
 assert.match(h.run('orderContentHtml()'),new RegExp(h.run('order.date')));
 h.run(`order=null`);assert.match(h.run('orderContentHtml()'),/更多 → 查订单/);
 for(const file of ['ordering/index.html','redesign-preview/index.html']){
  const html=fs.readFileSync(require.resolve('../'+file),'utf8');assert.match(html,/data-tab="order">订单</);assert.doesNotMatch(html,/今日订单/);
 }
});
test('latest button protects edits, then opens latest submitted order in order tab',async()=>{
 const h=harness();h.window.history={replaceState(){}};
 h.run(`buildSample('boss');sample=false;member={role:'editor'};baseQty={...order.quantities};baseUnits={...order.units};screen='more';globalThis.latestFixture=C.clone(order);latestFixture.id='test-count-new';latestFixture.date='2026-10-19';globalThis.reads=0;api={listPage:async()=>({records:[latestFixture],hasMore:false}),read:async()=>{reads++;return C.clone(latestFixture)},history:async()=>[]};order.quantities['cn:9']+=1000;`);
 const b={dataset:{act:'latest-order'}},event={target:{closest:s=>s==='[data-act]'?b:null}};
 await h.handlers.click(event);assert.equal(h.run('reads'),0);assert.equal(h.run('screen'),'more');assert.match(h.run('lastToast'),/先保存/);
 h.run('baseQty={...order.quantities}');await h.handlers.click(event);
 assert.equal(h.run('order.id'),'test-count-new');assert.equal(h.run('order.date'),'2026-10-19');assert.equal(h.run('screen'),'order');
});
test('search return label does not change close-keypad or retained quantity behavior',()=>{
 const h=harness();h.run(`buildSample('boss');query='柠檬';openOrderKey('kr:7');typeOrderKey('2');`);
 assert.match(h.run(`searchBar('search')`),/>返回订单<\/button>/);
 h.run('closePad()');assert.equal(h.run('query'),'柠檬');const before=h.run(`JSON.stringify(order.quantities)`);
 h.run('cancelFind()');assert.equal(h.run('query'),'');assert.equal(h.run('screen'),'order');assert.equal(h.run(`JSON.stringify(order.quantities)`),before);
 h.run(`screen='count'`);assert.match(h.run(`searchBar('search')`),/>取消<\/button>/);
});
test('pending supplier buttons are disabled; finalized and draft exports retain distinct behavior',()=>{
 const h=harness();h.run(`buildSample('boss');sample=false;member={role:'editor'};`);
 let html=h.run(`blockHtml('kr')`);assert.match(html,/定稿后可复制订货文字/);
 for(const act of ['copy','share'])assert.match(html,new RegExp('data-act="'+act+'"[^>]*disabled'));
 h.run(`order.orderStage='finalized'`);html=h.run(`blockHtml('kr')`);
 assert.doesNotMatch(html,/data-act="(?:copy|share)"[^>]*disabled/);assert.match(html,/复制本类订货文字/);assert.match(html,/分享本类订货文字/);
 h.run('order=null;history=[];heldPrev={}');html=h.run(`blockHtml('kr')`);assert.match(html,/本分类暂无订货商品/);assert.match(html,/data-act="(?:copy|share)"[^>]*disabled/);
});
test('fixed entry copy reports only copied; help dismisses without switching orders',async()=>{
 const h=harness();h.ctx.navigator={clipboard:{writeText:async()=>{}}};
 const b={dataset:{act:'fixed-link'}},help={open:true};h.document.querySelectorAll=s=>s==='.action-help[open]'?[help]:[];
 await h.handlers.click({target:{closest:s=>s==='[data-act]'?b:null}});
 assert.equal(h.run('lastToast'),'已复制');assert.equal(help.open,false);assert.equal(h.run('screen'),'order');
});
test('save status stays pending until confirmed, persists after audit failure, and never hides unsaved edits',async()=>{
 const h=harness();h.ctx.crypto={randomUUID:()=> 'save-test-id'};
 h.run(`buildSample('boss');sample=false;member={role:'editor'};baseQty={...order.quantities};order.quantities['cn:9']=2000;api={save:(id,base,q)=>new Promise(resolve=>globalThis.finishSave=()=>resolve({...base,quantities:{...q},revision:2})),history:async()=>{throw Error('audit offline')}};`);
 const saving=h.run('saveOrder()');assert.equal(h.run('orderSaveMessage()'),'正在保存到云端…');assert.match(h.run('dockHtml()'),/data-act="save" disabled/);
 h.run('finishSave()');await saving;assert.match(h.run('orderSaveMessage()'),/^已保存到云端 · \d\d:\d\d$/);
 assert.match(h.run('dockHtml()'),/已保存到云端/);
 h.run(`order.quantities['cn:9']=3000`);assert.match(h.run('dockHtml()'),/有 1 处改动/);assert.match(h.run('orderSaveMessage()'),/当前还有修改未保存/);
 h.run('sessionEpoch++');assert.equal(h.run('orderSaveMessage()'),'');
});
for(const code of ['unavailable','ccx/conflict'])test('failed save preserves edits and visible status: '+code,async()=>{
 const h=harness();h.ctx.crypto={randomUUID:()=> 'save-test-id'};h.ctx.failureCode=code;
 h.run(`buildSample('boss');sample=false;member={role:'editor'};baseQty={...order.quantities};order.quantities['cn:9']=2000;api={save:async()=>{const e=Error('failure');e.code=failureCode;throw e;}};`);
 await assert.rejects(h.run('saveOrder()'),/failure/);
 assert.equal(h.run(`order.quantities['cn:9']`),2000);assert.equal(h.run('dirtyCount()'),1);
 assert.match(h.run('orderSaveMessage()'),code==='ccx/conflict'?/本次未保存/:/未能确认云端保存成功/);
 assert.doesNotMatch(h.run('dockHtml()'),/data-act="save" disabled/);
});

test('starting next count preserves recovery copy and cannot discard unsaved order edits',()=>{
 const h=harness(true);h.ctx.confirm=()=>true;h.ctx.crypto={randomUUID:()=> 'new-count'};
 h.run(`member={role:'owner'};draft.status='reviewed';globalThis.oldDraft=draft;flushCloud=()=>{};`);
 h.run('startFreshCount()');assert.notEqual(h.run('draft.id'),h.run('oldDraft.id'));assert.equal(h.run('screen'),'count');assert.equal(h.run('order'),null);
 assert.ok([...h.saved.keys()].some(k=>k.includes(':recovery:')));
 h.run('dirtyCount=()=>1');assert.throws(()=>h.run('startFreshCount()'),/先保存/);
});
test('failed new-count local write keeps original draft and current order',()=>{
 const h=harness(true);h.ctx.confirm=()=>true;h.ctx.crypto={randomUUID:()=> 'new-count'};
 h.run(`member={role:'owner'};globalThis.oldDraft=draft;globalThis.write=localStorage.setItem;localStorage.setItem=(k,v)=>{if(k===KEY)throw Error('quota');write(k,v)};`);
 assert.throws(()=>h.run('startFreshCount()'),/本机保存失败/);assert.equal(h.run('draft===oldDraft'),true);
});

test('submitted count list and search show linked order quantities without rewriting original count',()=>{
 const h=harness(true);h.run(`member={role:'owner'};draft.status='reviewed';screen='count';const p=draft.catalog.find(p=>p.name==='감자수제비');globalThis.testId=p.id;globalThis.original=JSON.stringify(draft);order={id:C.cloudOrderId(draft.id,MODE.test),snapshot:JSON.stringify(draft),quantities:{[testId]:2000},units:Object.fromEntries(draft.catalog.map(p=>[p.id,p.unit])),orderStage:'pending'};baseQty={...order.quantities};baseUnits={...order.units};`);
 assert.equal(h.run('countLinkedOrder()'),true);assert.equal(h.run(`cellText(draft.catalog.find(p=>p.id===testId),'qty')`),'2');
 assert.match(h.run('countRows()'),/<b>2<\/b>/);h.run(`query='土豆面片'`);assert.match(h.run('countRows()'),/<b>2<\/b>/);
 assert.equal(h.run('JSON.stringify(draft)'),h.run('original'));
 h.run(`order.quantities[testId]=3500`);assert.match(h.run('countNotice()'),/有修改未保存/);assert.match(h.run('countRows()'),/<b>3.5<\/b>/);
 h.run(`order.quantities[testId]=0`);assert.equal(h.run(`cellText(draft.catalog.find(p=>p.id===testId),'qty')`),'');
 assert.equal(h.run(`cellText(draft.catalog.find(p=>p.id===testId),'stock')`),'');
});
test('owner opens historical order while local draft differs: both tabs show opened order, draft remains separate',async()=>{
 const h=harness(true);h.ctx.crypto={randomUUID:()=> 'context-save-01'};
 h.run(`member={role:'owner'};globalThis.localDraft=JSON.stringify(draft);const d=Core().create(source,'2026-10-18','count-history');order={id:'count-history',date:d.date,revision:2,snapshot:JSON.stringify(d),quantities:Object.fromEntries(d.catalog.map(p=>[p.id,p.id==='kr:38'?2000:0])),units:Object.fromEntries(d.catalog.map(p=>[p.id,p.unit||''])),orderStage:'pending'};rememberStocks();baseQty={...order.quantities};baseUnits={...order.units};screen='count';query='土豆面片';`);
 assert.equal(h.run('countLinkedOrder()'),false);assert.equal(h.run('sharedCount()'),true);
 assert.match(h.run('countHtml()'),/2026-10-18/);assert.match(h.run('countRows()'),/<b>2<\/b>/);
 h.run(`applyQty('kr:38','5');tryLeave('order')`);assert.match(h.run(`blockHtml('kr')`),/5봉/);
 h.run(`tryLeave('count');query='土豆面片'`);assert.match(h.run('countRows()'),/<b>5<\/b>/);
 assert.equal(h.run('JSON.stringify(draft)'),h.run('localDraft'));
 assert.throws(()=>h.run('returnToDraft()'),/先保存/);
 h.run(`api={save:async(id,base,q,mid,patch)=>({...C.clone(base),...patch,quantities:q,revision:base.revision+1}),history:async()=>[]};historyReplace=()=>{};`);
 await h.run('saveOrder()');assert.equal(h.run('dirtyCount()'),0);
 h.run(`order=C.clone(order);rememberStocks();query='土豆面片'`);assert.match(h.run('countRows()'),/<b>5<\/b>/);
 h.run('returnToDraft()');assert.equal(h.run('order'),null);assert.equal(h.run('JSON.stringify(draft)'),h.run('localDraft'));
});
test('owner on another device with no local draft still sees same opened order in count',()=>{
 const h=harness();h.run(`buildSample('boss');sample=false;member={role:'owner'};draft=null;screen='count';query='柠檬'`);
 assert.equal(h.run('sharedCount()'),true);assert.match(h.run('countRows()'),/<b>3<\/b>/);
});
test('order list and search display inventory text without inventory editing controls',()=>{
 const h=harness();h.run(`buildSample('boss');sample=false;member={role:'editor'};stocks['kr:9']='0';screen='order';query='柠檬'`);
 assert.match(h.run(`blockHtml('kr')`),/库存 0개/);assert.doesNotMatch(h.run(`blockHtml('kr')`),/data-field="stock"|search-cell/);
 assert.doesNotMatch(h.run('searchHits()'),/data-field="stock"|data-unit="cn:45" data-field="stock"/);
 h.run(`openOrderKey('kr:9','stock')`);assert.equal(h.run('editId'),null);assert.match(h.run('lastToast'),/盘货页/);
});
test('linked reviewed count shows selected order unit read-only, keeping stock unit and original unit',()=>{
 const h=harness(true);h.run(`screen='count';draft.status='reviewed';draft.items['cn:45'].unit='박스';draft.items['cn:45'].stockUnit='봉';order={id:C.cloudOrderId(draft.id,MODE.test),quantities:{'cn:45':2000},units:{'cn:45':'봉'}};`);
 assert.equal(h.run(`countUnit(draft.catalog.find(p=>p.id==='cn:45'))`),'봉');
 const cell=h.run(`countCell(draft.catalog.find(p=>p.id==='cn:45'),0,'qty')`);
 assert.match(cell,/<b>2<\/b>/);assert.match(cell,/<span class="cell-unit">봉<\/span>/);assert.doesNotMatch(cell,/data-act|<select/);
 assert.equal(h.run(`draft.items['cn:45'].unit`),'박스');
});

test('both members edit the same pending inventory and quantities across count/list/search, with save feedback',async()=>{
 for(const role of ['owner','editor']){
  const h=harness();h.ctx.confirm=()=>true;h.ctx.crypto={randomUUID:()=> 'inventory-save-001'};
  h.run(`buildSample('boss');sample=false;member={role:'${role}'};draft=JSON.parse(order.snapshot);order.id=C.cloudOrderId(draft.id,MODE.test);baseQty={...order.quantities};baseUnits={...order.units};rememberStocks();screen='count';query='土豆面片';globalThis.beforeSnapshot=order.snapshot;globalThis.beforeQty=JSON.stringify(order.quantities);`);
  h.run(`openOrderKey('kr:38','stock');typeOrderKey('0');closePad()`);
  assert.equal(h.run('screen'),'count');assert.equal(h.run(`stockShown(product('kr:38'))`),'0');assert.equal(h.run('JSON.stringify(order.quantities)'),h.run('beforeQty'));
  assert.match(h.run('countHtml()'),/有 1 处改动 · 立即保存/);
  h.run(`tryLeave('order')`);assert.match(h.run('searchHits()'),/<b>0<\/b>/);
  h.run(`applyQty('kr:38','2');tryLeave('count')`);assert.match(h.run('countRows()'),/<b>2<\/b>/);
  h.run(`api={save:async(id,base,q,mutation,patch)=>({...C.clone(base),...patch,quantities:{...q},revision:base.revision+1}),history:async()=>[]}`);
  await h.run('saveOrder()');assert.equal(h.run('dirtyCount()'),0);assert.match(h.run('countHtml()'),/已保存到云端/);
  assert.equal(h.run('order.snapshot'),h.run('beforeSnapshot'));assert.equal(h.run(`C.inventorySnapshot(order).items['kr:38'].stock`),'0');
  h.run(`order=C.clone(order);rememberStocks()`);assert.equal(h.run(`stocks['kr:38']`),'0');
  assert.equal(h.run(`Recovery.fromOrder(order,source).draft.items['kr:38'].stock`),'0');
  h.run(`order.orderStage='finalized'`);assert.match(h.run('countRows()'),/aria-disabled="true"/);assert.throws(()=>h.run(`applyOrderValue('kr:38','stock','3')`),/只能查看/);
 }
});
test('inventory save failures, conflicts, in-flight edits and blank vs zero remain visible in count',async()=>{
 const h=harness();h.ctx.crypto={randomUUID:()=> 'inventory-failure'};
 h.run(`buildSample('boss');sample=false;member={role:'editor'};baseQty={...order.quantities};rememberStocks();screen='count';applyOrderValue('kr:38','stock','0');api={save:async()=>{throw Object.assign(Error('冲突'),{code:'ccx/conflict'})}}`);
 await assert.rejects(h.run('saveOrder()'));assert.match(h.run('countHtml()'),/本次未保存/);assert.equal(h.run('dirtyCount()'),1);
 h.run(`orderAutoBlocked=false;api.save=(id,base,q,mid,patch)=>new Promise(resolve=>{globalThis.finishSave=()=>resolve({...C.clone(base),...patch,quantities:{...q},revision:base.revision+1})});api.history=async()=>[];`);
 const saving=h.run('saveOrder()');assert.match(h.run('countHtml()'),/正在保存到云端/);
 h.run(`applyOrderValue('kr:38','stock','');finishSave()`);await saving;
 assert.equal(h.run(`stocks['kr:38']`),'');assert.equal(h.run('dirtyCount()'),1);assert.match(h.run('countHtml()'),/当前还有修改未保存/);
 const log=h.run(`C.historyHtml(catalog(),[{...order,stockEdits:{'kr:38':''},revision:3},{...order,stockEdits:{'kr:38':'0'},revision:2}],false)`);assert.match(log,/库存 0봉 → 未填写/);
});

test('new count units use the confirmed 13 stock units without changing catalog/order units or historical source',()=>{
 const before=JSON.stringify(source),d=Core.create(source,'2026-10-22','count-units');
 const expected={'kr:43':'개','cn:9':'包','cn:12':'包','cn:13':'包','cn:14':'包','cn:25':'통','cn:33':'包','cn:37':'包','cn:39':'瓶','cn:44':'包','cn:45':'包','cn:46':'包','cn:47':'包'};
 assert.equal(Object.keys(expected).length,13);
 for(const p of source.products){assert.equal(d.items[p.id].stockUnit,expected[p.id]??p.unit??'');assert.equal(d.items[p.id].unit,p.unit||'');assert.equal(d.items[p.id].stock,'');}
 assert.equal(JSON.stringify(source),before);assert.equal(d.catalog.length,129);assert.equal(d.items['cn:56'].stockUnit,'봉');
});
function autosaveHarness(role='owner'){
 const h=harness();h.ctx.crypto={randomUUID:()=> 'autosave-test-id'};h.ctx.navigator={onLine:true};h.window.history={replaceState(){}};
 h.run(`buildSample('boss');sample=false;member={role:'${role}',name:'tester'};user={uid:'${role}'};baseQty={...order.quantities};baseUnits={...order.units};rememberStocks();api={history:async()=>[]};beginOrderSession(order);globalThis.saves=[];api.save=async(id,base,q,mid,patch)=>{saves.push({q:C.clone(q),mid,patch:C.clone(patch)});return {...C.clone(base),...patch,quantities:{...q},revision:base.revision+1};};`);
 return h;
}
test('both roles debounce shared edits and retain the keypad; no save of an incomplete decimal',async()=>{
 for(const role of ['owner','editor']){
  const h=autosaveHarness(role);const timers=new Map();let seq=0;h.ctx.setTimeout=(f,ms)=>{timers.set(++seq,{f,ms});return seq;};h.ctx.clearTimeout=i=>timers.delete(i);
  h.run(`editId='kr:7';editField='qty';editRaw='1';applyQty(editId,'1');orderEdited()`);
  assert.equal([...timers.values()].filter(t=>t.ms===1500).length,1);
  h.run(`editRaw='12';applyQty(editId,'12');orderEdited()`);
  assert.equal([...timers.values()].filter(t=>t.ms===1500).length,1);assert.equal(h.run('saves.length'),0);
  h.run(`editRaw='12.';orderEdited()`);await h.run('flushOrder()');assert.equal(h.run('saves.length'),0);
  assert.match([...h.saved.values()].find(x=>x.includes('ccx-order-edit-1')),/12\./);
  h.run(`editRaw='12.5';applyQty(editId,editRaw);orderEdited()`);await h.run('flushOrder()');
  assert.equal(h.run('saves.length'),1);assert.equal(h.run(`saves[0].q['kr:7']`),12500);assert.equal(h.run('editId'),'kr:7');assert.equal(h.run('dirtyCount()'),0);assert.match(h.run('orderSaveMessage()'),/已保存到云端/);
 }
});
test('shared autosave offline, single in-flight request, later input, and retry use no silent overwrites',async()=>{
 const h=autosaveHarness();h.run(`applyQty('kr:7','2');orderEdited();navigator.onLine=false`);await h.run('flushOrder()');assert.equal(h.run('saves.length'),0);assert.match(h.run('orderSaveMessage()'),/断网/);
 h.run(`navigator.onLine=true;api.save=(id,base,q,mid,patch)=>new Promise(resolve=>{saves.push({mid});globalThis.finish=()=>resolve({...C.clone(base),...patch,quantities:{...q},revision:base.revision+1})});`);
 const a=h.run('flushOrder()'),b=h.run('saveOrder()');assert.equal(h.run('saves.length'),1);
 h.run(`applyQty('kr:7','3');orderEdited();finish()`);await Promise.all([a,b]);assert.equal(h.run(`order.quantities['kr:7']`),3000);assert.equal(h.run(`baseQty['kr:7']`),2000);assert.equal(h.run('dirtyCount()'),1);
 const stored=JSON.parse([...h.saved.values()].find(x=>x.includes('ccx-order-edit-1')));assert.equal(stored.base.revision,2);assert.equal(stored.working.quantities['kr:7'],3000);
 h.run(`api.save=async()=>{throw Object.assign(Error('conflict'),{code:'ccx/conflict'})}`);await h.run('flushOrder()');assert.equal(h.run('orderAutoBlocked'),true);const n=h.run('saves.length');await h.run('flushOrder()');assert.equal(h.run('saves.length'),n);
});
test('reload restores unsent edits only against the same revision, including stock zero and unfinished input',async()=>{
 const h=autosaveHarness('editor');h.run(`globalThis.remote=C.clone(order);applyOrderValue('kr:38','stock','0');applyQty('kr:7','2');editId='kr:7';editField='qty';editRaw='2.';orderEdited();order=C.clone(remote);rememberStocks();baseQty={...order.quantities};editId=null;beginOrderSession(order);`);
 assert.equal(h.run(`stocks['kr:38']`),'0');assert.equal(h.run(`order.quantities['kr:7']`),2000);assert.equal(h.run('editRaw'),'2.');assert.equal(h.run('orderAutoBlocked'),false);
 h.run(`order={...remote,revision:8,orderStage:'finalized'};editId=null;beginOrderSession(order)`);assert.equal(h.run('orderAutoBlocked'),true);await h.run('flushOrder()');assert.equal(h.run('saves.length'),0);assert.match(h.run('orderSaveMessage()'),/云端已更新或定稿/);
});
test('another local tab or storage failure pauses automatic writes without false success',async()=>{
 const h=autosaveHarness();h.run(`localStorage.setItem(orderLocalKey,'external edit');applyQty('kr:7','2');orderEdited()`);assert.equal(h.run('orderAutoBlocked'),true);await h.run('flushOrder()');assert.equal(h.run('saves.length'),0);assert.equal(h.saved.get(h.run('orderLocalKey')),'external edit');assert.match(h.run('orderSaveMessage()'),/本机备份失败/);
});
test('subsequent edits after a successful autosave retain a usable journal and save again',async()=>{
 const h=autosaveHarness();h.run(`applyQty('kr:7','2');orderEdited()`);await h.run('flushOrder()');
 h.run(`applyQty('kr:7','3');orderEdited()`);assert.equal(h.run('orderAutoBlocked'),false);await h.run('flushOrder()');assert.equal(h.run('saves.length'),2);assert.equal(h.run('order.revision'),3);assert.equal(h.run('dirtyCount()'),0);
});
test('lost acknowledgement retries the same mutation ID; changing account never uploads old edits',async()=>{
 const h=autosaveHarness();h.run(`applyQty('kr:7','2');orderEdited();let attempts=0;const ok=api.save;api.save=async(...args)=>{if(!attempts++){saves.push({mid:args[3]});throw Error('network');}return ok(...args);}`);
 await h.run('flushOrder()');await h.run('flushOrder()');assert.equal(h.run('saves[0].mid'),h.run('saves[1].mid'));assert.equal(h.run('dirtyCount()'),0);
 h.run(`applyQty('kr:7','3');orderEdited();sessionEpoch++;member=null;api=null;user={uid:'different'}`);await h.run('flushOrder()');assert.equal(h.run('saves.length'),2);
});
test('finalization waits for the last save and blocks further editing during the final transaction',async()=>{
 const h=autosaveHarness('editor');h.ctx.confirm=()=>true;
 h.run(`applyQty('kr:7','2');orderEdited();api.save=(id,base,q,mid,patch)=>new Promise(resolve=>globalThis.saved=()=>resolve({...C.clone(base),...patch,quantities:{...q},revision:2}));api.finalize=(id,base)=>new Promise(resolve=>{globalThis.finalBase=base.revision;globalThis.finalized=()=>resolve({...base,orderStage:'finalized',revision:3});});`);
 const saving=h.run('flushOrder()'),final=h.run(`changeOrderStage('finalized')`);assert.equal(h.run('globalThis.finalBase'),undefined);
 h.run('saved()');await saving;await new Promise(resolve=>setImmediate(resolve));assert.equal(h.run('finalBase'),2);
 assert.throws(()=>h.run(`applyQty('kr:7','4')`),/确认订单状态/);assert.throws(()=>h.run(`applyOrderValue('kr:38','stock','4')`),/确认订单状态/);
 h.run('finalized()');await final;assert.equal(h.run('order.orderStage'),'finalized');await h.run('flushOrder()');assert.throws(()=>h.run(`applyQty('kr:7','4')`),/定稿/);
});

test('autosave accepts complete decimal spellings without closing the keypad for either role',async()=>{
 for(const role of ['owner','editor'])for(const raw of ['1.0','01','1.250']){
  const h=autosaveHarness(role);h.run(`editId='kr:7';editField='qty';editRaw='${raw}';keypad=true;applyQty(editId,editRaw);orderEdited()`);
  assert.equal(h.run('unfinishedOrderInput()'),false);await h.run('flushOrder()');
  assert.equal(h.run('saves.length'),1);assert.equal(h.run('dirtyCount()'),0);assert.equal(h.run('editRaw'),raw);assert.equal(h.run('keypad'),true);
 }
});
test('a manual save cannot bypass a failed local journal write',async()=>{
 const h=autosaveHarness();h.run(`applyQty('kr:7','2');localStorage.setItem=()=>{throw Error('quota')}`);
 await assert.rejects(h.run('saveOrder()'),/本机备份失败/);assert.equal(h.run('saves.length'),0);assert.equal(h.run('orderAutoBlocked'),true);
});
test('conflict resolution preserves partial input and does not replace edits made while reading',async()=>{
 const h=autosaveHarness('editor');h.ctx.confirm=()=>true;
 h.run(`globalThis.remote=C.clone(order);applyQty('kr:7','2');editId='kr:7';editField='qty';editRaw='2.';orderEdited();orderAutoBlocked=true;api.read=()=>new Promise(resolve=>globalThis.finishRead=resolve);`);
 const reading=h.run('useCloudOrder()');h.run(`editRaw='2.5';applyQty(editId,editRaw);finishRead({...remote,revision:2})`);
 await assert.rejects(reading,/读取期间/);assert.equal(h.run(`order.quantities['kr:7']`),2500);
 h.run(`editRaw='2.';api.read=async()=>({...remote,revision:2,orderStage:'finalized'})`);await h.run('useCloudOrder()');
 assert.equal(h.run('order.revision'),2);assert.equal(h.run('order.orderStage'),'finalized');assert.equal(h.run('orderAutoBlocked'),false);
 const recovery=[...h.saved.entries()].filter(([k])=>k.includes(':recovery:')).map(([,v])=>JSON.parse(v));
 assert.equal(recovery.length,1);assert.equal(recovery[0].editor.raw,'2.');assert.equal(recovery[0].working.quantities['kr:7'],2500);
});
test('next count clears an old order URL and refuses an unfinished shared edit',()=>{
 const h=harness(true);h.ctx.confirm=()=>true;h.ctx.crypto={randomUUID:()=> 'next-clean'};let path;
 h.window.history.replaceState=(a,b,p)=>{path=p;};h.ctx.location.href='https://example.test/ordering/?order=count-previous&v=26';
 h.run(`member={role:'owner'};flushCloud=()=>{};startFreshCount()`);
 assert.equal(path,'/ordering/?v=26');assert.equal(h.run('draft.id'),'count-next-clean');assert.equal(h.run('order'),null);
 h.run(`editId='kr:7';editField='qty';editRaw='2.'`);assert.throws(()=>h.run('startFreshCount()'),/完成当前数字/);
});
test('both account screens show the same 13 stock units after submit and reread; historical units remain intact',()=>{
 for(const role of ['owner','editor']){
  const h=autosaveHarness(role);h.run(`screen='count';`);
  for(const [id,unit] of Object.entries(Core.stockDefaults)){
   assert.equal(h.run(`stockUnitOf(product('${id}'))`),unit);
   h.run(`query=product('${id}').name`);assert.match(h.run('searchHits()'),new RegExp(unit));
   assert.equal(h.run(`order.units['${id}']`),source.products.find(p=>p.id===id).unit||'');
  }
  h.run(`globalThis.old=JSON.parse(order.snapshot);old.items['cn:9'].stock='2';old.items['cn:9'].stockUnit='箱';order.snapshot=JSON.stringify(old);rememberStocks();`);
  assert.equal(h.run(`stockUnitOf(product('cn:9'))`),'箱');assert.equal(h.run(`stocks['cn:9']`),'2');
 }
});

test('server key ordering is not a conflict and later inventory input survives',async()=>{
 const h=autosaveHarness('editor');h.run(`applyOrderValue('kr:38','stock','2');applyOrderValue('cn:9','stock','3');orderEdited();api.save=(id,base,q,mid,patch)=>new Promise(resolve=>globalThis.finish=()=>resolve({...C.clone(base),...patch,stockEdits:Object.fromEntries(Object.entries(patch.stockEdits).sort()),quantities:{...q},revision:2}));`);
 const pending=h.run('flushOrder()');h.run(`applyOrderValue('kr:38','stock','4');orderEdited();finish()`);await pending;
 assert.equal(h.run('orderAutoBlocked'),false);assert.equal(h.run(`stocks['kr:38']`),'4');assert.equal(h.run('dirtyCount()'),1);
 const Auto=require('../redesign-preview/order-autosave.cjs');
 const a={quantities:{a:1000,b:0},units:{a:'箱',b:'包'},stockEdits:{b:'0',a:'2'}};
 const b={quantities:{b:0,a:1000},units:{b:'包',a:'箱'},stockEdits:{a:'2',b:'0'}};
 assert.equal(Auto.values(a),Auto.values(b));assert.equal(Auto.choice({working:a},b),'saved');
});

test('count cells show separate saved units without changing blank, zero or historical values',()=>{
 const h=harness();h.run(`screen='count';member={role:'owner'};globalThis.p=product('kr:43');globalThis.i=draft.catalog.findIndex(x=>x.id===p.id);`);
 assert.match(h.run(`countCell(p,i,'stock')`),/<b><\/b><span class="cell-unit">개<\/span>/);
 assert.match(h.run(`countCell(p,i,'qty')`),/<b><\/b><span class="cell-unit">봉<\/span>/);
 h.run(`Core().edit(draft,p.id,'stock','0');Core().edit(draft,p.id,'quantity','1');`);
 assert.match(h.run(`countCell(p,i,'stock')`),/<b>0<\/b>/);
 assert.match(h.run(`countCell(p,i,'qty')`),/<b>1<\/b>/);
 h.run(`draft.items[p.id].stockUnit='봉';globalThis.before=JSON.stringify(draft);`);
 assert.match(h.run(`countCell(p,i,'stock')`),/cell-unit">봉/);
 assert.equal(h.run('JSON.stringify(draft)'),h.run('before'));
 assert.doesNotMatch(h.run('countRows()'),/土豆 · 봉/);
 assert.match(h.run('countHtml()'),/count-columns/);
 h.run(`draft.status='reviewed'`);
 assert.match(h.run(`countCell(p,i,'stock')`),/aria-disabled="true".*cell-unit">봉/);
});

test('draft supplier exports are disabled and blocked for both copy and share',async()=>{
 const h=harness();h.run(`member={role:'owner'};copyOnly=async()=>{throw Error('clipboard touched')};shareOrCopy=async()=>{throw Error('share touched')};`);
 assert.match(h.run(`blockHtml('kr')`),/data-act="copy"[^>]*disabled/);
 assert.match(h.run(`blockHtml('kr')`),/data-act="share"[^>]*disabled/);
 await assert.rejects(h.run(`supplierExport('kr')`),/先完成盘货/);
 await assert.rejects(h.run(`supplierExport('kr',true)`),/先完成盘货/);
});
test('sticky search does not scroll toward its own parent and keeps a single input in each screen',()=>{
 const h=harness();let scrolled=false;const search={};h.window.scrollBy=()=>{scrolled=true;};
 h.document.querySelector=s=>s==='.search'?search:s==='.bar'?{contains:el=>el===search}:null;
 h.run('scrollSearch()');assert.equal(scrolled,false);
 h.run(`screen='count';member={role:'owner'}`);
 for(const html of [h.run('countHtml()'),h.run(`orderShell('test','')`)]){
  assert.equal((html.match(/id="find"/g)||[]).length,1);
  assert.ok(html.indexOf('class="bar"')<html.indexOf('id="find"'));
  assert.ok(html.indexOf('id="find"')<html.indexOf('id="rows"'));
 }
});

test('draft previous and next stay in filtered cells and preserve zero and blanks',()=>{
 const h=harness();h.run(`screen='count';member={role:'owner'};viewCat='kr';query='豆腐';globalThis.cells=countNavigationCells();pos=cells[0].i;field=cells[0].which;keypad=true;captureEntered();`);
 assert.ok(h.run('cells.length')>1);
 const first=h.run('pos');h.run(`writeCell('0');nextCell();nextCell(-1)`);
 assert.equal(h.run('pos'),first);assert.equal(h.run('field'),'stock');assert.equal(h.run('draft.items[draft.catalog[pos].id].stock'),'0');
 assert.match(h.run('countPad()'),/data-act="prev" disabled/);
 h.run(`nextCell(-1)`);assert.equal(h.run('pos'),first);
 h.run(`writeCell('1.');nextCell()`);assert.equal(h.run('pos'),first);assert.equal(h.run('field'),'stock');
 h.run(`writeCell('');nextCell();nextCell(-1)`);assert.equal(h.run('draft.items[draft.catalog[pos].id].stock'),'');
});
test('order search moves backward through editable cells and skips shared read-only stock',()=>{
 const h=harness();h.run(`query='鸡精';openOrderKey('cn:9','qty');advanceOrder(-1)`);
 assert.equal(h.run('editField'),'stock');assert.equal(h.run('editId'),'cn:9');
 h.run(`advanceOrder();`);assert.equal(h.run('editField'),'qty');
 h.run(`buildSample('boss');query='鸡精';screen='order';`);
 assert.equal(h.run(`orderNavigationCells().every(c=>c.which==='qty')`),true);
 h.run(`order.orderStage='finalized'`);assert.equal(h.run('orderNavigationCells().length'),0);
});

test('peer roles share count rights and current draft status, keeping history open on updates',()=>{
 const h=harness();h.run(`peerEnabled=true;member={role:'owner'};peerApi={};peerBase={localId:draft.id,revision:1,stage:'draft',draft:C.clone(draft)};`);
 assert.equal(h.run('canCount()'),true);h.run(`member={role:'editor'}`);assert.equal(h.run('canCount()'),true);
 assert.match(h.run('currentStageText()'),/双方实时同步/);
 h.run(`peerViewing=false;globalThis.before=C.clone(draft);globalThis.remote={...peerBase,revision:2,draft:C.clone(draft)};remote.draft.items['kr:43'].stock='8';peerReceive(remote)`);
 assert.equal(h.run(`draft.items['kr:43'].stock`),'');assert.equal(h.run('peerLatest.revision'),2);
});
test('peer remote cell conflict preserves local input and does not falsely report saved',()=>{
 const h=harness();h.run(`peerEnabled=true;member={role:'owner'};peerApi={};peerBase={localId:draft.id,revision:1,stage:'draft',draft:C.clone(draft)};draft.items['kr:43'].stock='3';globalThis.remote={...peerBase,revision:2,draft:C.clone(peerBase.draft)};remote.draft.items['kr:43'].stock='4';peerReceive(remote)`);
 assert.equal(h.run(`draft.items['kr:43'].stock`),'3');assert.equal(h.run('cloudConflict'),true);assert.equal(h.run('peerBase.revision'),1);
});
test('peer autosave preserves input typed while request is in flight',async()=>{
 const h=harness();h.run(`peerEnabled=true;member={role:'editor'};peerBase={localId:draft.id,revision:1,stage:'draft',draft:C.clone(draft)};draft.items['kr:43'].stock='3';peerApi={save:()=>new Promise(resolve=>globalThis.saveDone=resolve)};`);
 const saving=h.run('peerSave()');h.run(`globalThis.remote={...peerBase,revision:2,draft:C.clone(draft)};draft.items['cn:9'].quantity='2';draft.items['cn:9'].decision='order';saveDone(remote)`);await saving;
 assert.equal(h.run(`draft.items['cn:9'].quantity`),'2');assert.equal(h.run('cloudPending'),true);assert.equal(h.run('peerBase.revision'),2);
});
test('shared startup keeps conflicting legacy local draft and still subscribes',async()=>{
 const h=harness();h.run(`peerEnabled=true;member={role:'owner'};paintBackupStatus=()=>{};Core().edit(draft,'kr:43','stock','3');globalThis.remoteDraft=Core().create(source,'2026-10-22','count-remote');peerApi={read:async()=>({localId:remoteDraft.id,revision:1,stage:'draft',draft:remoteDraft}),watch:()=>{globalThis.watched=true;return ()=>{}}};`);
 await h.run('peerStart()');assert.equal(h.run('watched'),true);assert.equal(h.run('cloudConflict'),true);assert.equal(h.run(`draft.items['kr:43'].stock`),'3');
});
test('shared save from an old login cannot clear the new login flight',async()=>{
 const h=harness();h.run(`peerEnabled=true;paintBackupStatus=()=>{};peerBase={localId:draft.id,revision:1,stage:'draft',draft:C.clone(draft)};Core().edit(draft,'kr:43','stock','3');peerApi={save:()=>new Promise(resolve=>globalThis.resolvePeer=resolve)};`);
 const saving=h.run('peerSave()');h.run(`sessionEpoch++;peerFlight='new-login-flight';resolvePeer({...peerBase,revision:2})`);await saving;assert.equal(h.run('peerFlight'),'new-login-flight');
});
test('shared current read after logout cannot restore the previous session',async()=>{
 const h=harness();h.ctx.confirm=()=>true;h.run(`peerEnabled=true;backupRecovery=()=>{};peerApi={read:()=>new Promise(resolve=>globalThis.resolvePeerRead=resolve)};globalThis.oldDraft=C.clone(draft);`);
 const opening=h.run('peerUseRemote()');h.run(`sessionEpoch++;draft=null;resolvePeerRead({localId:oldDraft.id,revision:2,stage:'draft',draft:oldDraft})`);await opening;assert.equal(h.run('draft'),null);
});
