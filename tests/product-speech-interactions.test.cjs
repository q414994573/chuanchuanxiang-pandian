'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('../count-core.js');
const Speech=require('../redesign-preview/product-speech.cjs');
const source=require('../current-order.json');
const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const body=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',"const fs=require('node:fs'),vm=require('node:vm');"+body+';return harness;')(require,Core,source);
const q=JSON.stringify;
const tap=(target)=>({isTrusted:true,target,preventDefault(){this.prevented=true;}});
function button(dataset){
 const b={dataset,disabled:false};
 b.closest=s=>{
  if(s==='[data-act]')return b;
  if(s==='[data-act="open"],[data-act="edit"]')return ['open','edit'].includes(dataset.act)?b:null;
  if(s==='[data-act="speak-product"]')return dataset.act==='speak-product'?b:null;
  if(s==='[data-search="true"]')return dataset.search==='true'?b:null;
  if(s==='input,button,a,label')return b;
  return null;
 };
 return b;
}
function feedbackHarness(options={}){
 const trace=[],spoken=[],tones=[];let enabled=options.enabled!==false,active=false,stopCalls=0,speechOptions,feedbackOptions;
 const feedback={create(win,opts){feedbackOptions=opts;return {
  support:()=>({sound:true,vibration:true}),settings:()=>({sound:true,vibration:false}),set(){},
  play(event){trace.push('feedback');if(event?.isTrusted&&opts.soundMuted?.()!==true)tones.push(event);},
  duckSound(){trace.push('duck');},stop(){trace.push('stop-feedback');}
 };}};
 const speech={create(win,opts){speechOptions=opts;return {
  support:()=>true,settings:()=>({enabled}),set(on){enabled=on===true;if(!enabled){active=false;stopCalls++;}return {enabled};},
  active:()=>active,
  speak(name,event){trace.push('speech');if(!enabled||event?.isTrusted!==true)return false;active=true;spoken.push({name,event});opts.onActiveChange(true);return true;},
  stop(){active=false;stopCalls++;}
 };}};
 const h=harness(true,feedback,options.speech||speech);
 return {...h,spoken,tones,trace,end(){active=false;speechOptions.onActiveChange(false);},isMuted:()=>feedbackOptions.soundMuted(),stops:()=>stopCalls};
}
function setup(product,role,path,options={}){
 const h=feedbackHarness(options);
 h.ctx.confirm=()=>true;
 h.run("releaseLocked=false;user={uid:'speech-"+role+"'};member={role:"+q(role)+"};peerEnabled=true;peerApi={};flushCloud=()=>{};");
 h.run('globalThis.testId='+q(product.id)+';globalThis.testProduct=product(testId);globalThis.testIndex=draft.catalog.findIndex(p=>p.id===testId);');
 h.run("for(const p of draft.catalog){const r=draft.items[p.id];r.unit=r.unit||C.units.choices[p.id]?.[0]?.[0]||'包';r.stockUnit=r.stockUnit||r.unit;r.stock=p.hasStock?'12':'';r.stockStatus=p.hasStock?'counted':'exempt';r.quantity='2';r.decision='order';}draft.seen={};");
 h.run("peerBase={localId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerLatest=peerBase;");
 if(path.finalized)h.run("order={id:'count-speech-order',schema:'ccx-cloud-1',date:draft.date,revision:1,orderStage:'finalized',snapshot:JSON.stringify(draft),quantities:Object.fromEntries(draft.catalog.map(p=>[p.id,2000])),units:Object.fromEntries(draft.catalog.map(p=>[p.id,draft.items[p.id].unit]))};rememberStocks();baseQty={...order.quantities};baseUnits={...order.units};orderBase=C.clone(order);orderDirty=false;");
 h.run('screen='+q(path.count?'count':'order')+';viewCat=Flow.catOf(testProduct);orderCat=viewCat;query='+(path.search?'Flow.largeName(testProduct)':"''")+';');
 const dataset=path.name==='editable-count'?{act:'open',id:product.id,i:String(source.products.indexOf(product))}:{act:'speak-product',id:product.id};
 const markup=()=>h.run(path.name==='editable-count'?'countRows()':path.count?'searchHits(true)':path.search?'searchHits()':'blockHtml(orderCat)');
 const data=()=>h.run('JSON.stringify([draft.catalog,draft.items,draft.contentVersion,draft.seen,draft.stockText,order?.quantities,order?.units,order?.stockEdits,order?.stockUnits,orderDirty])');
 return {...h,dataset,markup,data};
}
const paths=[
 {name:'editable-count',count:true},
 {name:'editable-search',search:true},
 {name:'finalized-order',finalized:true},
 {name:'finalized-count',finalized:true,count:true}
];

// Each workflow verifies a real catalog name, role and different rendering /
// permission path, not an arbitrary repeated speech-engine invocation.
for(const product of source.products)for(const role of ['owner','editor'])for(const path of paths){
 test('product narration '+product.id+' / '+role+' / '+path.name,async()=>{
  const h=setup(product,role,path),before=h.data(),html=h.markup();
  const target=button(h.dataset);
  assert.ok(html.includes('data-act="'+h.dataset.act+'" data-id="'+product.id+'"'),'the actual row exposes the intended target');
  await h.handlers.click(tap(target));
  assert.equal(h.spoken.length,1);assert.equal(h.spoken[0].name,product.name);
  assert.deepEqual(h.trace.slice(-3),['speech','duck','feedback']);assert.equal(h.tones.length,0,'narration takes priority over the same tap tone');
  assert.equal(h.data(),before,'narration must not change quantities, inventory, units, names or permissions');
  if(path.name==='editable-count')assert.equal(h.run('draft.catalog[pos].id'),product.id);
  else {assert.equal(h.run('editId'),null);assert.equal(h.run('keypad'),false,'name-only speech cannot unlock/open an editor');}
  if(path.finalized)assert.equal(h.run('order.orderStage'),'finalized');
 });
}

test('speech off retains the existing count-name editing and click sound',async()=>{
 const p=source.products.find(p=>p.id==='cn:9'),h=setup(p,'owner',paths[0],{enabled:false});
 await h.handlers.click(tap(button(h.dataset)));assert.equal(h.spoken.length,0);assert.equal(h.tones.length,1);assert.equal(h.run('keypad'),true);
});
test('speech off leaves order and search names as their existing non-button text',()=>{
 const p=source.products.find(p=>p.id==='cn:9');for(const path of paths.slice(1)){
  const h=setup(p,'editor',path,{enabled:false});assert.doesNotMatch(h.markup(),/data-act="speak-product"/);
 }
});
for(const role of ['owner','editor'])for(const where of ['count','search','saved-count','saved-order'])for(const field of where==='saved-order'?['qty']:['stock','qty']){
 test('numeric selection narration '+role+'/'+where+'/'+field,async()=>{
  const p=source.products.find(p=>p.id==='cn:9'),path=where==='count'?paths[0]:where==='search'?paths[1]:where==='saved-count'?paths[3]:paths[2];
  const h=setup(p,role,path);if(path.finalized)h.run("order.orderStage='pending'");
  const b=button(where==='count'?{act:'open',id:p.id,field}:{act:'edit',id:p.id,field,search:'true'});
  await h.handlers.click(tap(b));assert.equal(h.spoken.length,1);assert.equal(h.spoken[0].name,p.name);
  const before=h.spoken.length;
  await h.handlers.click(tap(button({act:'key',key:'8'})));
  assert.equal(h.spoken.length,before,'numeric keys must not read the product again');
  assert.equal(h.run("orderValue(testId,"+q(field)+")"),'8');assert.equal(h.tones.length,0,'pending name still suppresses tones');
  h.end();await h.handlers.click(tap(button({act:'key',key:'1'})));
  assert.equal(h.run("orderValue(testId,"+q(field)+")"),'81');assert.equal(h.tones.length,1,'a fresh numeric tone resumes after speech');
 });
}
test('render, local save and unrelated peer updates never narrate by themselves',async()=>{
 const p=source.products.find(p=>p.id==='cn:9'),h=setup(p,'editor',paths[0]);
 await h.handlers.click(tap(button(h.dataset)));h.run("render();paintRows();persistLocal();globalThis.remote=C.clone(peerBase);remote.revision++;remote.draft.items['kr:7'].quantity='3';peerReceive(remote)");
 assert.equal(h.spoken.length,1);
});
test('locked entry and busy operations cannot trigger product narration',async()=>{
 const p=source.products.find(p=>p.id==='cn:9'),h=setup(p,'editor',paths[1]),b=button(h.dataset);
 h.run('releaseLocked=true');await h.handlers.click(tap(b));h.run('releaseLocked=false;busy=true');await h.handlers.click(tap(b));
 assert.equal(h.spoken.length,0);assert.equal(h.tones.length,0);
});
test('a disabled product target and unknown ID do not announce a different active product',async()=>{
 const p=source.products.find(p=>p.id==='cn:9'),h=setup(p,'editor',paths[1]),b=button(h.dataset);b.disabled=true;
 await h.handlers.click(tap(b));await h.handlers.click(tap(button({act:'speak-product',id:'missing-product'})));assert.equal(h.spoken.length,0);
});
test('untrusted programmatic clicks may follow existing UI behavior but never create speech audio',async()=>{
 const p=source.products.find(p=>p.id==='cn:9'),h=setup(p,'editor',paths[0]);
 await h.handlers.click({...tap(button(h.dataset)),isTrusted:false});assert.equal(h.spoken.length,0);assert.equal(h.tones.length,0);
});
test('focused search pointerup announces once and suppresses its subsequent synthetic click',async()=>{
 const p=source.products.find(p=>p.id==='cn:9'),h=setup(p,'editor',paths[1]),b=button(h.dataset);
 h.document.activeElement=h.find;
 const pointer={...tap(b),pointerId:1,isPrimary:true,button:0,clientX:100,clientY:100};
 h.handlers.pointerdown(pointer);h.handlers.pointerup(pointer);await h.handlers.click(tap(b));
 assert.equal(h.spoken.length,1);assert.equal(h.spoken[0].name,p.name);
});
for(const movement of ['move','cancel','outside']){
 test('scroll/cancel gesture never announces a product: '+movement,async()=>{
  const p=source.products.find(p=>p.id==='cn:9'),h=setup(p,'editor',paths[1]),b=button(h.dataset);
  h.document.activeElement=h.find;
  const pointer={...tap(b),pointerId:1,isPrimary:true,button:0,clientX:100,clientY:100};h.handlers.pointerdown(pointer);
  if(movement==='move'){h.handlers.pointermove({...pointer,clientY:130});h.handlers.pointerup({...pointer,clientY:130});}
  else if(movement==='cancel')h.handlers.pointercancel(pointer);
  else h.handlers.pointerup({...pointer,target:button({act:'speak-product',id:'kr:7'})});
  await h.handlers.click(tap(b));assert.equal(h.spoken.length,0);
 });
}
test('normal unfocused pointer selection defers to exactly one native click',async()=>{
 const p=source.products.find(p=>p.id==='cn:9'),h=setup(p,'owner',paths[0]),b=button(h.dataset);h.document.activeElement=null;
 const pointer={...tap(b),pointerId:2,isPrimary:true,button:0,clientX:120,clientY:120};
 h.handlers.pointerdown(pointer);h.handlers.pointerup(pointer);assert.equal(h.spoken.length,0);
 await h.handlers.click(tap(b));assert.equal(h.spoken.length,1);
});
test('keyboard activation of a search numeric cell opens and speaks in the same gesture',()=>{
 const p=source.products.find(p=>p.id==='cn:9'),h=setup(p,'editor',paths[1]),b=button({act:'edit',id:p.id,field:'qty',search:'true'});
 b.classList={contains:()=>false};const event={...tap(b),key:'Enter',isComposing:false};h.handlers.keydown(event);
 assert.equal(event.prevented,true);assert.equal(h.spoken.length,1);assert.equal(h.run('editId'),p.id);
});
test('narration preference has its own toggle and test action without changing order state',async()=>{
 const p=source.products.find(p=>p.id==='cn:9'),h=setup(p,'owner',paths[0],{enabled:false}),before=h.data();
 assert.match(h.run('feedbackHtml()'),/商品名称播报/);
 await h.handlers.click(tap(button({act:'speech-toggle'})));assert.equal(h.run('productSpeech.settings().enabled'),true);assert.equal(h.spoken.length,0);assert.equal(h.data(),before);
 await h.handlers.click(tap(button({act:'feedback-test'})));assert.equal(h.spoken.at(-1).name,'川川香');assert.equal(h.spoken.length,1);
 await h.handlers.click(tap(button({act:'speech-toggle'})));assert.equal(h.run('productSpeech.settings().enabled'),false);assert.ok(h.stops()>0);assert.equal(h.data(),before);
});
for(const kind of ['copy','share']){
 test('active narration never waits before the original-gesture supplier '+kind,async()=>{
  const p=source.products.find(p=>p.id==='cn:9'),h=setup(p,'editor',paths[2]);let deliveries=0;
  h.ctx.navigator={clipboard:{writeText:()=>{deliveries++;return Promise.resolve();}},share:()=>{deliveries++;return Promise.resolve();}};
  await h.handlers.click(tap(button(h.dataset)));assert.equal(h.isMuted(),true);
  const pending=h.handlers.click(tap(button({act:kind,cat:'cn'})));assert.equal(deliveries,1,'the native API must be invoked before awaiting speech or the network');await pending;
  assert.equal(h.spoken.length,1);assert.equal(h.run('order.orderStage'),'finalized');
 });
}
for(const failure of ['constructor','speak','getVoices']){
 test('native speech '+failure+' failure cannot interrupt opening or changing a stock field',async()=>{
  const speech={create(win,opts){
   const env={document:{visibilityState:'visible',hidden:false},localStorage:{getItem:()=>'{"enabled":true}',setItem(){}},setTimeout:()=>1,clearTimeout(){},
    SpeechSynthesisUtterance:class{constructor(text){if(failure==='constructor')throw Error('voice unavailable');this.text=text;}},
    speechSynthesis:{cancel(){},getVoices(){if(failure==='getVoices')throw Error('voices unavailable');return [];},speak(){if(failure==='speak')throw Error('playback denied');}}};
   return Speech.create(env,opts);
  }};
  const p=source.products.find(p=>p.id==='cn:9'),h=setup(p,'owner',paths[0],{speech});
  await h.handlers.click(tap(button(h.dataset)));assert.equal(h.run('keypad'),true);
  await h.handlers.click(tap(button({act:'key',key:'8'})));assert.equal(h.run("draft.items['cn:9'].stock"),'8');
 });
}

function oldUnitEditor(role='owner'){
 const h=harness(true);h.run("member={role:"+q(role)+"};peerEnabled=true;peerApi={};screen='count';flushCloud=()=>{};draft.items['kr:31'].stock='12';draft.items['kr:31'].stockStatus='counted';draft.items['kr:31'].stockUnit='박스';peerBase={localId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerLatest=peerBase;pos=draft.catalog.findIndex(p=>p.id==='kr:31');openCount(pos,'stock')");return h;
}
for(const role of ['owner','editor']){
 test('remote stock unit changes cannot turn an untouched edit into undoable local work: '+role,()=>{
  const h=oldUnitEditor(role);h.run("globalThis.remote=C.clone(peerBase);remote.revision=2;remote.draft.items['kr:31'].stockUnit='개';peerReceive(remote)");
  if(h.run('cloudConflict'))assert.equal(h.run("draft.items['kr:31'].stockUnit"),'박스');
  else {h.run('closePad()');assert.equal(h.run('undo'),null);assert.equal(h.run("draft.items['kr:31'].stockUnit"),'개');}
 });
 test('receiving a different clean draft closes the old editor without creating cross-draft undo: '+role,()=>{
  const h=oldUnitEditor(role);h.run("globalThis.remote={localId:'count-new-other',stage:'draft',revision:2,draft:Core().create(source,'2026-10-26','count-new-other')};peerReceive(remote);closePad()");
  assert.equal(h.run('draft.id'),'count-new-other');assert.equal(h.run('undo'),null);assert.equal(h.run('entered'),null);assert.equal(h.run('editId'),null);assert.equal(h.run('keySelection'),null);
  assert.equal(h.run("draft.items['kr:31'].stock"),'');assert.equal(h.run("draft.items['kr:31'].stockUnit"),'개');
 });
}

for(const [id,from,to] of [['kr:31','박스','개'],['cn:21','箱','包']])for(const role of ['owner','editor'])for(const where of ['count','order-search']){
 test('corrected stock value and unit persist and undo together: '+id+'/'+role+'/'+where,()=>{
  const h=harness(true);h.ctx.confirm=()=>true;
  h.run("member={role:"+q(role)+"};peerEnabled=true;peerApi={};screen="+q(where==='count'?'count':'order')+";flushCloud=()=>{};globalThis.testId="+q(id)+";globalThis.testIndex=draft.catalog.findIndex(p=>p.id===testId);draft.items[testId].stock='12';draft.items[testId].stockStatus='counted';draft.items[testId].stockUnit="+q(from)+";draft.items[testId].quantity='3';draft.items[testId].decision='order';peerBase={localId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerLatest=peerBase;");
  const open=()=>h.run(where==='count'?"openCount(testIndex,'stock')":"openOrderKey(testId,'stock')");
  const type=k=>h.run((where==='count'?'typeKey':'typeOrderKey')+'('+q(k)+')');
  open();h.run('closePad()');assert.equal(h.run('draft.items[testId].stock'),'12');assert.equal(h.run('draft.items[testId].stockUnit'),from);
  open();type('1');type('2');assert.equal(h.run('draft.items[testId].stock'),'12');assert.equal(h.run('draft.items[testId].stockUnit'),to);
  const stored=JSON.parse(h.saved.get(h.run('KEY'))).draft.items[id];assert.equal(stored.stock,'12');assert.equal(stored.stockUnit,to);assert.equal(stored.quantity,'3');
  h.run('closePad();doUndo()');assert.equal(h.run('draft.items[testId].stock'),'12');assert.equal(h.run('draft.items[testId].stockUnit'),from);
  const restored=JSON.parse(h.saved.get(h.run('KEY'))).draft.items[id];assert.equal(restored.stock,'12');assert.equal(restored.stockUnit,from);assert.equal(restored.quantity,'3');
 });
 test('same-number native input repairs only an explicitly entered stock unit: '+id+'/'+role+'/'+where,()=>{
  const h=harness(true);h.run("member={role:"+q(role)+"};peerEnabled=true;peerApi={};screen="+q(where==='count'?'count':'order')+";flushCloud=()=>{};globalThis.testId="+q(id)+";globalThis.testIndex=draft.catalog.findIndex(p=>p.id===testId);draft.items[testId].stock='12';draft.items[testId].stockStatus='counted';draft.items[testId].stockUnit="+q(from)+";peerBase={localId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerLatest=peerBase;");
  h.run(where==='count'?"openCount(testIndex,'stock')":"openOrderKey(testId,'stock')");h.run('textMode=true');
  const input={classList:{contains:className=>className==='plain'},value:'12'};
  h.document.querySelector=s=>s==='input.plain'?input:null;
  h.run('readPlain()');assert.equal(h.run('draft.items[testId].stockUnit'),from,'merely leaving native input cannot reinterpret the old value');
  h.handlers.input({target:input});assert.equal(h.run('draft.items[testId].stock'),'12');assert.equal(h.run('draft.items[testId].stockUnit'),to,'an explicit same-number entry has the same repair semantics in both views');
  h.run('closePad();doUndo()');assert.equal(h.run('draft.items[testId].stock'),'12');assert.equal(h.run('draft.items[testId].stockUnit'),from,'native-input undo restores the old value and its recorded unit together');
 });
}
test('blank-stock correction preserves the acknowledged cloud base and merges unrelated quantity updates',()=>{
 const h=harness(true);h.run("member={role:'editor'};peerEnabled=true;peerApi={};flushCloud=()=>{};draft.items['kr:31'].stockUnit='박스';draft.items['cn:21'].stockUnit='箱';globalThis.remote={localId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerBase=null;peerLatest=null;peerReceive(remote)");
 assert.equal(h.run("peerBase.draft.items['kr:31'].stockUnit"),'박스');assert.equal(h.run("peerBase.draft.items['cn:21'].stockUnit"),'箱');
 assert.equal(h.run("draft.items['kr:31'].stockUnit"),'개');assert.equal(h.run("draft.items['cn:21'].stockUnit"),'包');assert.equal(h.run('cloudPending'),true);
 h.run("remote=C.clone(peerBase);remote.revision=2;remote.draft.items['cn:21'].quantity='4';remote.draft.items['cn:21'].decision='order';peerReceive(remote)");
 assert.equal(h.run('cloudConflict'),false);assert.equal(h.run("draft.items['cn:21'].stockUnit"),'包');assert.equal(h.run("draft.items['cn:21'].quantity"),'4');
 assert.equal(h.run("peerBase.draft.items['cn:21'].stockUnit"),'箱');assert.equal(h.run('peerDirty()'),true);
});

for(const role of ['owner','editor'])for(const surface of ['draft-order','draft-search'])for(const exit of ['close','switch-product']){
 test('draft decimal zero normalizes on editor exit without losing undo: '+role+'/'+surface+'/'+exit,()=>{
  const h=harness(true);
  h.run("member={role:"+q(role)+"};peerEnabled=true;peerApi={};screen='order';query="+q(surface==='draft-search'?'鸡精，辣椒':'')+";flushCloud=()=>{};draft.items['cn:9'].quantity='12';draft.items['cn:9'].decision='order';draft.items['cn:5'].quantity='3';draft.items['cn:5'].decision='order';peerBase={localId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerLatest=peerBase;openOrderKey('cn:9','qty')");
  const untouched=h.run("JSON.stringify([draft.items['cn:9'].stock,draft.items['cn:9'].stockUnit,draft.items['cn:9'].unit])");
  h.run("typeOrderKey('.');typeOrderKey('0')");
  assert.equal(h.run('editRaw'),'0.0','zero remains an editable prefix while entering a positive decimal');
  h.run(exit==='close'?"closePad()":"openOrderKey('cn:5','qty')");
  assert.equal(h.run("draft.items['cn:9'].quantity"),'','a completed zero cannot remain an ordered quantity after leaving its editor');
  assert.equal(h.run("draft.items['cn:9'].decision"),'pending');
  assert.equal(JSON.parse(h.saved.get(h.run('KEY'))).draft.items['cn:9'].quantity,'');
  assert.equal(h.run('undo.value'),'12');assert.equal(h.run('undo.expected'),'');
  assert.equal(h.run("JSON.stringify([draft.items['cn:9'].stock,draft.items['cn:9'].stockUnit,draft.items['cn:9'].unit])"),untouched);
  h.run('doUndo()');assert.equal(h.run("draft.items['cn:9'].quantity"),'12');assert.equal(h.run("draft.items['cn:9'].decision"),'order');
 });
}
for(const surface of ['draft-order','draft-search']){
 test('draft zero decimal prefix can still continue to a positive fraction: '+surface,()=>{
  const h=harness(true);
  h.run("member={role:'editor'};peerEnabled=true;peerApi={};screen='order';query="+q(surface==='draft-search'?'鸡精':'')+";flushCloud=()=>{};draft.items['cn:9'].quantity='12';draft.items['cn:9'].decision='order';peerBase={localId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerLatest=peerBase;openOrderKey('cn:9','qty');typeOrderKey('.');typeOrderKey('0');typeOrderKey('1');closePad()");
  assert.equal(h.run("draft.items['cn:9'].quantity"),'0.01');assert.equal(h.run("draft.items['cn:9'].decision"),'order');
  assert.equal(JSON.parse(h.saved.get(h.run('KEY'))).draft.items['cn:9'].quantity,'0.01');
  h.run('doUndo()');assert.equal(h.run("draft.items['cn:9'].quantity"),'12');
 });
}
