const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Core=require('../count-core.js');
const source=JSON.parse(fs.readFileSync(require.resolve('../current-order.json'),'utf8'));
function harness(){
 const handlers={},saved=new Map(),find={blur(){document.activeElement=null;}};
 const document={body:{addEventListener(n,fn){handlers[n]=fn;},classList:{toggle(){},remove(){}}},
  activeElement:find,getElementById(id){return id==='find'?find:{};},
  querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}};
 const window={CountCore:Core,scrollY:80,scrollTo(x,y){this.scrollY=y;},addEventListener(){}};
 const ctx=vm.createContext({document,window,localStorage:{setItem(k,v){saved.set(k,v);},getItem(k){return saved.get(k)||null;}},
  setTimeout(){return 1;},clearTimeout(){},requestAnimationFrame(fn){fn();},URL,URLSearchParams,Date,Intl,console,
  C:require('../cloud/core.cjs'),A:require('../cloud/account.cjs'),S:require('../redesign-preview/search.cjs'),Flow:require('../redesign-preview/count-flow.cjs'),Backup:require('../redesign-preview/draft-backup.cjs'),
  fixture:structuredClone(source),location:{search:'',href:'https://example.test/redesign-preview/'}});
 let js=fs.readFileSync(require.resolve('../redesign-preview/preview.js'),'utf8');
 js=js.replace(/^import .*;\n/gm,'').replace(/boot\(\)\.catch\([\s\S]*$/,'');vm.runInContext(js,ctx);
 const run=s=>vm.runInContext(s,ctx);
 run(`source=fixture;draft=Core().create(source,'2026-10-20','count-test-interactions');draft.seen={};draft.ackWrong={};screen='order';render=()=>{};scrollActive=()=>{};toast=t=>globalThis.lastToast=t;`);
 return {handlers,ctx,run,saved,find,document,window};
}
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
