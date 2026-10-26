'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const Core=require('../count-core.js'),source=require('../current-order.json');

// Reuse fixture declarations only; requiring another test module would
// register its cases again and inflate the reported coverage.
const interaction=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const harnessBody=interaction.slice(interaction.indexOf('function harness('),interaction.indexOf("test('production mode"));
const harness=Function('require','Core','source',"const fs=require('node:fs'),vm=require('node:vm');"+harnessBody+';return harness;')(require,Core,source);
const speechTests=fs.readFileSync(require.resolve('./product-speech-interactions.test.cjs'),'utf8');
const fixture=speechTests.slice(speechTests.indexOf('const q='),speechTests.indexOf('// Each workflow'));
const {setup,tap,button}=Function('harness','source',fixture+';return {setup,tap,button};')(harness,source);
const q=JSON.stringify;
const byId=new Map(source.products.map(p=>[p.id,p]));
const firstId='cn:9',secondId='cn:10';
const searchNames=[firstId,secondId].map(id=>byId.get(id).name).join('、');
const countIds=source.products.filter(p=>p.cat==='cn').map(p=>p.id);
const modes=[
 {name:'private-count',count:true,private:true,dual:true},
 {name:'shared-count',count:true,dual:true},
 {name:'count-search',count:true,search:true,dual:true},
 {name:'draft-order'},
 {name:'draft-search',search:true,dual:true},
 {name:'saved-count',count:true,saved:true,dual:true},
 {name:'saved-order',saved:true},
 {name:'saved-search',saved:true,search:true}
];
const roles=mode=>mode.private?['owner']:['owner','editor'];
function navSetup(mode,role,options={}){
 const base={name:mode.count&&!mode.saved?'editable-count':'editable-search',count:!!mode.count,search:!!mode.search,finalized:!!mode.saved};
 const h=setup(byId.get(firstId),role,base,options);
 h.run("query="+q(mode.search?searchNames:'')+";viewCat='cn';orderCat='cn';");
 if(mode.private)h.run('peerEnabled=false');
 if(mode.saved)h.run("order.orderStage='pending'");
 // Plain order navigation follows its rendered rows; search/count navigation
 // uses the actual catalog. These two adjacent visible rows give an explicit
 // independent destination oracle without reimplementing the app's algorithm.
 const rows=[firstId,secondId].map(id=>({dataset:{id},querySelector:()=>({})}));
 h.document.querySelectorAll=selector=>selector==='.order'?rows:[];
 h.document.activeElement=null;
 const count=mode.count&&!mode.saved;
 const open=(id,field)=>h.run(count?'openCount(draft.catalog.findIndex(p=>p.id==='+q(id)+'),'+q(field)+')':'openOrderKey('+q(id)+','+q(field)+')');
 const type=key=>h.run((count?'typeKey':'typeOrderKey')+'('+q(key)+')');
 const value=(id,field)=>h.run('orderValue('+q(id)+','+q(field)+')');
 return {...h,mode,role,count,open,type,value,next:count?'next':'order-next',prev:count?'prev':'order-prev'};
}
function cursor(h){return JSON.parse(h.run("JSON.stringify({id:screen==='count'&&!sharedCount()?draft.catalog[pos]?.id:editId,field:screen==='count'&&!sharedCount()?field:editField,screen,keypad})"));}
async function click(h,act,extra={}){
 const event=tap(button({act,...extra}));await h.handlers.click(event);return event;
}
async function expectMove(h,act,id,field,extra={}){
 h.end();const before=h.spoken.length,tones=h.tones.length;
 const event=await click(h,act,extra);
 assert.equal(cursor(h).id,id);assert.equal(cursor(h).field,field);assert.equal(cursor(h).keypad,true);
 assert.equal(h.spoken.length,before+1,'one explicit movement announces its destination exactly once');
 assert.equal(h.spoken.at(-1).name,byId.get(id).name,'speech uses the destination original displayed name');
 assert.equal(h.spoken.at(-1).event,event,'speech retains the same trusted user gesture');
 assert.equal(h.tones.length,tones,'the destination narration takes priority over the navigation tone');
}

for(const mode of modes)for(const role of roles(mode)){
 const label=mode.name+'/'+role;
 test('speech navigation forward/backward and same-product fields '+label,async()=>{
  const h=navSetup(mode,role);h.open(firstId,mode.dual?'stock':'qty');
  if(mode.dual)await expectMove(h,h.next,firstId,'qty');
  await expectMove(h,h.next,secondId,mode.dual?'stock':'qty');
  await expectMove(h,h.prev,firstId,'qty');
  if(mode.dual)await expectMove(h,h.prev,firstId,'stock');
  const before=h.spoken.length;h.run('render();render();paintRows();persistLocal();orderEdited()');
  assert.equal(h.spoken.length,before,'render/autobackup are not user navigation');
  assert.equal(h.value(firstId,'qty'),'2');assert.equal(h.value(secondId,'qty'),'2');
 });
 test('speech navigation native Enter and unfinished native value '+label,()=>{
  const h=navSetup(mode,role),field=mode.dual?'stock':'qty';h.open(firstId,field);
  const input={value:field==='stock'?'12':'2',classList:{contains:name=>name==='plain'},closest:()=>null};
  h.document.querySelector=selector=>selector==='input.plain'?input:null;h.run('textMode=true');
  const event={...tap(input),key:'Enter',isComposing:false};h.handlers.keydown(event);
  assert.equal(event.prevented,true);assert.equal(h.spoken.length,1);
  const expected=mode.dual?firstId:secondId;
  assert.equal(cursor(h).id,expected);assert.equal(cursor(h).field,'qty');
  assert.equal(h.spoken[0].name,byId.get(expected).name);assert.equal(h.spoken[0].event,event);
  h.end();input.value='2.';h.run('textMode=true');const before=cursor(h);
  h.handlers.keydown({...tap(input),key:'Enter',isComposing:false});
  assert.equal(cursor(h).id,before.id);assert.equal(cursor(h).field,before.field);
  assert.equal(h.spoken.length,1,'unfinished native input cannot narrate a destination that was not opened');
 });
 test('speech navigation rejects unfinished keypad movement '+label,async()=>{
  const h=navSetup(mode,role);h.open(secondId,'qty');h.type('.');
  const before=cursor(h);
  await click(h,h.next);await click(h,h.prev);
  assert.equal(cursor(h).id,before.id);assert.equal(cursor(h).field,before.field);
  assert.equal(h.spoken.length,0);assert.equal(h.run(h.count?'draft.items[draft.catalog[pos].id].quantity':'editRaw'),'0.');
 });
 test('speech navigation remains silent at beginning and end '+label,async()=>{
  const h=navSetup(mode,role),catalogPath=mode.count&&!mode.search;
  const first=catalogPath?countIds[0]:firstId,last=catalogPath?countIds.at(-1):secondId;
  h.open(first,mode.dual?'stock':'qty');const before=cursor(h);
  await click(h,h.prev);assert.equal(cursor(h).id,before.id);assert.equal(cursor(h).field,before.field);assert.equal(h.spoken.length,0);
  h.open(last,'qty');await click(h,h.next);await click(h,h.next);
  assert.equal(h.spoken.length,0,'end-of-list or repeated no-op must not read a stale/current product as a new target');
 });
 test('speech navigation undo announces the restored product '+label,async()=>{
  const h=navSetup(mode,role);h.open(firstId,'qty');h.type('8');h.run('closePad()');h.open(secondId,'qty');
  await expectMove(h,'undo',firstId,'qty');assert.equal(h.value(firstId,'qty'),'2');
  const before=h.spoken.length;await click(h,'undo');assert.equal(h.spoken.length,before,'a consumed undo cannot announce another product');
 });
}

for(const mode of modes.filter(m=>!m.saved))for(const role of roles(mode)){
 test('speech navigation defer preserves partial input and announces next product '+mode.name+'/'+role,async()=>{
  const h=navSetup(mode,role);h.open(firstId,mode.dual?'stock':'qty');h.type('.');
  await expectMove(h,'defer',secondId,mode.dual?'stock':'qty');
  assert.equal(h.run('draft.deferred['+q(firstId)+']'),true);
  assert.equal(h.value(firstId,mode.dual?'stock':'qty'),'0.','explicit defer retains unfinished work under its established rule');
 });
 test('speech navigation defer at last product closes without narration '+mode.name+'/'+role,async()=>{
  const h=navSetup(mode,role),last=mode.count&&!mode.search?countIds.at(-1):secondId;
  h.open(last,'qty');await click(h,'defer');assert.equal(h.run('keypad'),false);assert.equal(h.spoken.length,0);
  assert.equal(h.run('draft.deferred['+q(last)+']'),true);
 });
}

for(const mode of modes.filter(m=>m.count&&!m.saved))for(const role of roles(mode)){
 test('speech navigation next gap selects the actual first unseen product '+mode.name+'/'+role,async()=>{
  const h=navSetup(mode,role);h.open(secondId,'qty');
  h.run("draft.seen=Object.fromEntries(draft.catalog.map(p=>[p.id,true]));draft.seen['kr:3']=false");
  await expectMove(h,'next-gap','kr:3','stock');
  h.run('draft.seen=Object.fromEntries(draft.catalog.map(p=>[p.id,true]))');
  const before=h.spoken.length;await click(h,'next-gap');
  assert.equal(h.run('screen'),'order');assert.equal(h.spoken.length,before,'all-seen changes the view without inventing a selected product');
 });
 test('speech navigation next gap cannot announce blocked unfinished input '+mode.name+'/'+role,async()=>{
  const h=navSetup(mode,role);h.open(secondId,'qty');h.type('.');
  h.run("draft.seen=Object.fromEntries(draft.catalog.map(p=>[p.id,true]));draft.seen['kr:3']=false");
  await click(h,'next-gap');assert.equal(cursor(h).id,secondId);assert.equal(cursor(h).field,'qty');assert.equal(h.spoken.length,0);
 });
}

for(const mode of modes.filter(m=>!m.count))for(const role of roles(mode)){
 test('speech navigation warning opens and narrates the named product '+mode.name+'/'+role,async()=>{
  const h=navSetup(mode,role);h.open(firstId,'qty');await expectMove(h,'warn','cn:5','qty',{id:'cn:5'});
 });
 test('speech navigation warning blocked by unfinished value stays silent '+mode.name+'/'+role,async()=>{
  const h=navSetup(mode,role);h.open(firstId,'qty');h.type('.');await click(h,'warn',{id:'cn:5'});
  assert.equal(cursor(h).id,firstId);assert.equal(h.spoken.length,0);
 });
}

for(const role of ['owner','editor'])for(const kind of ['release','busy','finalized']){
 test('speech navigation guarded state '+role+'/'+kind,async()=>{
  const mode=modes.find(m=>m.name==='saved-count'),h=navSetup(mode,role);h.open(firstId,'stock');
  h.run(kind==='release'?'releaseLocked=true':kind==='busy'?'busy=true':"order.orderStage='finalized'");
  const before=cursor(h);
  for(const act of [h.next,h.prev,'defer','warn'])await click(h,act,{id:secondId});
  assert.equal(cursor(h).id,before.id);assert.equal(cursor(h).field,before.field);assert.equal(h.spoken.length,0);
 });
}
for(const role of ['owner','editor'])for(const mode of [modes.find(m=>m.name==='shared-count'),modes.find(m=>m.name==='saved-order')]){
 test('speech navigation off and synthetic gestures remain silent '+role+'/'+mode.name,async()=>{
  const off=navSetup(mode,role,{enabled:false});off.open(firstId,mode.dual?'stock':'qty');await click(off,off.next);
  assert.equal(off.spoken.length,0);assert.equal(off.tones.length,1,'disabled narration keeps normal key feedback');
  const h=navSetup(mode,role);h.open(firstId,mode.dual?'stock':'qty');
  await h.handlers.click({...tap(button({act:h.next})),isTrusted:false});assert.equal(h.spoken.length,0);assert.equal(h.tones.length,0);
 });
}
for(const role of ['owner','editor']){
 test('speech navigation unrelated peer save and repaint never announce products '+role,async()=>{
  const h=navSetup(modes.find(m=>m.name==='shared-count'),role);h.open(firstId,'stock');
  await expectMove(h,h.next,firstId,'qty');const before=h.spoken.length;
  h.run("globalThis.remote=C.clone(peerBase);remote.revision++;remote.draft.items['kr:7'].quantity='3';remote.draft.items['kr:7'].decision='order';peerReceive(remote);render();paintRows();persistLocal();orderEdited()");
  assert.equal(h.spoken.length,before);assert.equal(h.run('cloudConflict'),false);
 });
}

for(const mode of modes.filter(m=>m.count||m.search))for(const role of roles(mode))for(const [group,first,second] of [['other','other:3','other:4'],['drinks','other:18','other:19']]){
 test('speech navigation no-stock supplier rows '+mode.name+'/'+role+'/'+group,async()=>{
  const h=navSetup(mode,role);
  h.run('viewCat='+q(group)+';orderCat=viewCat;query='+q(mode.search?[first,second].map(id=>byId.get(id).name).join('、'):'')+';');
  h.open(first,'qty');await expectMove(h,h.next,second,'qty');await expectMove(h,h.prev,first,'qty');
  assert.equal(h.value(first,'stock'),'');assert.equal(h.value(second,'stock'),'','navigation cannot invent inventory for no-stock products');
 });
}

for(const role of ['owner','editor'])for(const stage of ['draft','pending','finalized']){
 test('speech navigation explicit hot product selection '+role+'/'+stage,async()=>{
  const h=navSetup(modes.find(m=>m.name===(stage==='draft'?'draft-search':'saved-search')),role);
  if(stage==='finalized')h.run("order.orderStage='finalized'");
  h.run('orderSearchOpen=true;searchContext=orderSearchIdentity();query="";searchActivity.clear();searchActivity.record('+q(byId.get(firstId).name)+',['+q(firstId)+']);');
  assert.match(h.run('orderSearchHome()'),new RegExp('data-act="hot-find" data-id="'+firstId+'"'),'the named product is an actual visible hot-list target');
  const before=h.data(),event=await click(h,'hot-find',{id:firstId});
  assert.equal(h.run('query'),byId.get(firstId).name);assert.equal(h.run('editId'),null);assert.equal(h.run('keypad'),false);
  assert.equal(h.spoken.length,1);assert.equal(h.spoken[0].name,byId.get(firstId).name);assert.equal(h.spoken[0].event,event);assert.equal(h.tones.length,0);
  assert.equal(h.data(),before,'a hot-list selection only searches and narrates; it never edits/unlocks');
  if(stage==='finalized')assert.equal(h.run('order.orderStage'),'finalized');
  h.run('render();paintRows();orderEdited()');assert.equal(h.spoken.length,1);
 });
}
for(const role of ['owner','editor'])for(const guard of ['composition','unfinished','closed-search','unknown']){
 test('speech navigation rejected hot product selection '+role+'/'+guard,async()=>{
  const h=navSetup(modes.find(m=>m.name==='draft-search'),role);
  h.run('orderSearchOpen=true;searchContext=orderSearchIdentity()');
  if(guard==='composition')h.run('searchComposing=true');
  if(guard==='unfinished'){h.open(firstId,'qty');h.type('.');}
  if(guard==='closed-search')h.run('orderSearchOpen=false');
  const before=h.run('JSON.stringify([query,editId,editField,keypad,editRaw,draft.items])');
  await click(h,'hot-find',{id:guard==='unknown'?'missing-product':secondId});
  assert.equal(h.spoken.length,0);assert.equal(h.run('JSON.stringify([query,editId,editField,keypad,editRaw,draft.items])'),before);
 });
}
for(const role of ['owner','editor'])for(const act of ['history-find','submit-search']){
 test('speech navigation generic search does not invent a product selection '+role+'/'+act,async()=>{
  const h=navSetup(modes.find(m=>m.name==='draft-search'),role);
  h.run('orderSearchOpen=true;searchContext=orderSearchIdentity();query='+q(searchNames));
  await click(h,act,{query:byId.get(firstId).name});assert.equal(h.spoken.length,0);
  assert.equal(h.run('editId'),null);assert.equal(h.run('keypad'),false);
 });
}
for(const role of ['owner','editor'])for(const mode of [modes.find(m=>m.name==='shared-count'),modes.find(m=>m.name==='saved-order')]){
 test('speech navigation native composition Enter does not advance '+role+'/'+mode.name,()=>{
  const h=navSetup(mode,role);h.open(firstId,'qty');h.run('textMode=true');
  const input={value:'2',classList:{contains:name=>name==='plain'},closest:()=>null};
  h.document.querySelector=selector=>selector==='input.plain'?input:null;const before=cursor(h);
  for(const composition of [{isComposing:true},{isComposing:false,keyCode:229}])h.handlers.keydown({...tap(input),key:'Enter',...composition});
  assert.deepEqual(cursor(h),before);assert.equal(h.spoken.length,0);
 });
}
