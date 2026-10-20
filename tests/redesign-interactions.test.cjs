const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Core=require('../count-core.js');
const source=JSON.parse(fs.readFileSync(require.resolve('../current-order.json'),'utf8'));

// Execute the actual preview handlers, with no network, login, or real storage.
function harness(){
 const handlers={},saved=new Map(),find={blur(){document.activeElement=null;}};
 const document={
  body:{addEventListener(name,fn){handlers[name]=fn;},classList:{toggle(){},remove(){}}},
  activeElement:find,getElementById(id){return id==='find'?find:{};},
  querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}
 };
 const ctx=vm.createContext({document,window:{CountCore:Core,addEventListener(){}},
  localStorage:{setItem(k,v){saved.set(k,v);},getItem(k){return saved.get(k)||null;}},
  setTimeout(){return 1;},clearTimeout(){},URL,URLSearchParams,Date,Intl,console,
  C:require('../cloud/core.cjs'),A:require('../cloud/account.cjs'),
  S:require('../redesign-preview/search.cjs'),Flow:require('../redesign-preview/count-flow.cjs'),
  fixture:structuredClone(source),location:{search:'',href:'https://example.test/redesign-preview/'}});
 let js=fs.readFileSync(require.resolve('../redesign-preview/preview.js'),'utf8');
 js=js.replace(/^import .*;\n/gm,'').replace(/boot\(\)\.catch\([\s\S]*$/,'');
 vm.runInContext(js,ctx);
 const run=s=>vm.runInContext(s,ctx);
 run(`source=fixture;draft=Core().create(source,'2026-10-20','count-test-interactions');draft.seen={};draft.ackWrong={};screen='order';render=()=>{};scrollActive=()=>{};toast=t=>globalThis.lastToast=t;`);
 return {handlers,ctx,run,saved,find,document};
}
function input(id,field,value){return {dataset:{id,field},value,attrs:{},
 classList:{contains(c){return c==='search-value';}},
 setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};}
function edit(h,id,field,value){const el=input(id,field,value);h.handlers.input({target:el});return el;}

test('touch search: pointerdown never edits; drag and cancel never open; tap opens once',async()=>{
 const h=harness();h.run('globalThis.opens=0;openFromRow=()=>{opens++};');
 const row={dataset:{act:'open',id:'cn:9'}};
 const target={closest(s){return s.includes('data-act="open"')||s==='[data-act]'?row:null;}};
 let prevented=0;
 const e=(x,y)=>({target,clientX:x,clientY:y,pointerId:1,isPrimary:true,button:0,preventDefault(){prevented++;}});
 h.handlers.pointerdown(e(30,100));assert.equal(h.run('opens'),0);assert.equal(prevented,0);
 h.handlers.pointermove(e(30,160));h.handlers.pointerup(e(30,160));
 await h.handlers.click(e(30,160));assert.equal(h.run('opens'),0);
 h.handlers.pointerdown(e(30,100));h.handlers.pointercancel(e(30,100));
 await h.handlers.click(e(30,100));assert.equal(h.run('opens'),0);
 h.handlers.pointerdown(e(30,100));h.handlers.pointerup(e(32,103));
 await h.handlers.click(e(32,103));assert.equal(h.run('opens'),1);assert.equal(prevented,1);
 // Once the search field is blurred, ordinary keyboard/mouse click still works.
 h.document.activeElement=null;h.handlers.pointerdown(e(30,100));h.handlers.pointerup(e(30,100));
 await h.handlers.click(e(30,100));assert.equal(h.run('opens'),2);
});

test('inline search: original IDs, stocks including blank/0/text, quantity and persistence',()=>{
 const h=harness();h.run("query='鸡精'");
 const html=h.run('searchHits()');
 assert.match(html,/data-id="cn:9" data-field="stock"/);
 assert.match(html,/data-id="cn:9" data-field="qty"/);
 assert.doesNotMatch(html,/data-act="edit"/);
 edit(h,'cn:9','stock','0');assert.equal(h.run("draft.items['cn:9'].stock"),'0');
 edit(h,'cn:9','qty','3');assert.equal(h.run("qtyOf('cn:9')"),'3');
 edit(h,'cn:9','stock','半箱');assert.equal(h.run("draft.items['cn:9'].stock"),'半箱');
 edit(h,'cn:9','stock','');assert.equal(h.run("draft.items['cn:9'].stock"),'');
 assert.equal(h.run("draft.items[draft.catalog[0].id].quantity"),'');
 assert.equal(h.run('query'),'鸡精');
 const saved=JSON.parse(h.saved.get('ccx-redesign-draft-v2'));
 assert.equal(saved.draft.items['cn:9'].quantity,'3');
 edit(h,'cn:9','qty','0');assert.equal(h.run("qtyOf('cn:9')"),'');
 assert.equal(h.run('catalog().length'),129);
});

test('other products have no stock field; blank units reject positive order',()=>{
 const h=harness();h.run("query='탕용기'");
 const html=h.run('searchHits()');assert.doesNotMatch(html,/data-field="stock"/);
 const bad=edit(h,'other:11','qty','2');assert.equal(bad.attrs['aria-invalid'],'true');
 assert.equal(h.run('finishSearchInputs()'),false);
 assert.equal(h.run("qtyOf('other:11')"),'');
 edit(h,'other:11','qty','');assert.equal(h.run('finishSearchInputs()'),true);
});

test('cloud quantities can change without changing inventory; editor stock stays read-only',()=>{
 const h=harness();h.run(`buildSample('boss');query='감자';`);
 assert.match(h.run('searchHits()'),/readonly/);
 const before=h.run('order.snapshot');
 edit(h,'kr:7','qty','2.5');assert.equal(h.run('order.quantities["kr:7"]'),2500);
 assert.equal(h.run('order.snapshot'),before);
 const bad=edit(h,'kr:7','stock','9');assert.equal(bad.attrs['aria-invalid'],'true');
 assert.equal(h.run('order.snapshot'),before);
 h.run('searchErrors.clear()');
 const partial=edit(h,'kr:7','qty','2.');assert.equal(partial.attrs['aria-invalid'],'true');
 assert.equal(h.run('finishSearchInputs()'),false);
 assert.equal(h.run('order.quantities["kr:7"]'),2500);
 edit(h,'kr:7','qty','2.75');assert.equal(h.run('finishSearchInputs()'),true);
 assert.equal(h.run('order.quantities["kr:7"]'),2750);
 edit(h,'kr:7','qty','');assert.equal(h.run('order.quantities["kr:7"]'),0);
 assert.equal(h.run('order.snapshot'),before);
});

test('invalid search input prevents save/action and survives search results repaint',async()=>{
 const h=harness();h.run("buildSample('boss');query='鸡精';globalThis.saves=0;saveOrder=async()=>{saves++}");
 edit(h,'cn:9','qty','-1');
 assert.match(h.run('searchHits()'),/value="-1"[^>]*aria-invalid="true"/);
 const button={dataset:{act:'save'}};
 await h.handlers.click({target:{closest(selector){return selector==='[data-act]'?button:null;}}});
 assert.equal(h.run('saves'),0);assert.equal(h.run('searchErrors.size'),1);
 edit(h,'cn:9','qty','4');assert.equal(h.run('finishSearchInputs()'),true);
 await h.handlers.click({target:{closest(selector){return selector==='[data-act]'?button:null;}}});
 assert.equal(h.run('saves'),1);
});

test('local storage failure is flagged, blocks actions, and can be retried',()=>{
 const h=harness();h.run("globalThis.realSave=localStorage.setItem;localStorage.setItem=()=>{throw Error('本机存储失败')}");
 const el=edit(h,'cn:9','qty','5');assert.equal(el.attrs['aria-invalid'],'true');
 assert.equal(h.run('finishSearchInputs()'),false);
 assert.match(h.run('lastToast'),/本机存储失败/);
 h.run('localStorage.setItem=realSave');
 edit(h,'cn:9','qty','5');assert.equal(h.run('finishSearchInputs()'),true);
 assert.equal(JSON.parse(h.saved.get('ccx-redesign-draft-v2')).draft.items['cn:9'].quantity,'5');
});
