'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Core=require('../count-core.js'),source=require('../current-order.json');

// Reuse fixture definitions only. Importing a *.test.cjs would register all its
// cases again and falsely inflate the total, so no test module is required here.
const interaction=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const harnessCode=interaction.slice(interaction.indexOf('function harness('),interaction.indexOf("test('production mode"));
const harness=Function('require','Core','source',"const fs=require('node:fs'),vm=require('node:vm');"+harnessCode+';return harness;')(require,Core,source);
const replacement=fs.readFileSync(require.resolve('./keypad-replacement.test.cjs'),'utf8');
const fixtureCode=replacement.slice(replacement.indexOf('const paths='),replacement.indexOf('// Actual IDs'));
const {setup,paths}=Function('harness','q',fixtureCode+';return {setup,paths};')(harness,JSON.stringify);
const q=JSON.stringify;
const cellKey=which=>which==='stock'?'stock':'quantity';
const valueSignature="JSON.stringify([draft.items,draft.seen,draft.deferred,order?.quantities,order?.stockEdits])";
function press(h,key){
 return h.handlers.click({isTrusted:false,target:{closest:s=>s==='[data-act]'?{dataset:{act:'key',key}}:null}});
}
function fieldPath(p,which,role){
 const index=source.products.indexOf(p);
 return paths.find(x=>x.name===((index+(which==='stock'?1:0)+(role==='editor'?1:0))%2?'draft-search':'shared-count'));
}
function installSave(h){
 h.ctx.crypto={randomUUID:()=> 'test-keypad-boundary-mutation'};
 h.run([
  'api={history:async()=>[],save:(id,base,quantities,mutation,patch)=>{',
  'const saved={...C.clone(base),quantities:C.clone(quantities),units:C.clone(patch.units),stockEdits:C.clone(patch.stockEdits),stockUnits:C.clone(patch.stockUnits),revision:base.revision+1};',
  'return new Promise(resolve=>{globalThis.completeOrderSave=()=>resolve(saved)});}};',
  'beginOrderSession(order);'
 ].join('\n'));
}

for(const p of source.products)for(const role of ['owner','editor'])for(const which of p.hasStock?['stock','qty']:['qty']){
 const label=p.id+'/'+role+'/'+which,choice=fieldPath(p,which,role);
 test('active cloud conflict before replacement '+label,async()=>{
  const h=setup(p,which,choice,role);h.open();
  h.run("globalThis.remote=C.clone(peerBase);remote.revision=2;remote.draft.items[testId]["+q(cellKey(which))+"]='9';peerReceive(remote)");
  assert.equal(h.run('cloudConflict'),true);
  const before=h.run(valueSignature);await press(h,'8');
  assert.equal(h.run(valueSignature),before,'conflict must preserve selected local value');
  assert.equal(h.valueNow(),'12');
 });
 test('unrelated cloud field must not clear selected local value '+label,()=>{
  const h=setup(p,which,choice,role);h.open();
  const other=source.products.find(x=>x.id!==p.id);
  h.run('globalThis.remote=C.clone(peerBase);remote.revision=2;remote.draft.items['+q(other.id)+"].quantity='6';remote.draft.items["+q(other.id)+"].decision='order';peerReceive(remote)");
  assert.equal(h.run('cloudConflict'),false);
  h.type('8');assert.equal(h.valueNow(),'8');
  assert.equal(h.run('draft.items['+q(other.id)+'].quantity'),'6','independent cloud cell survives the local edit');
  assert.equal(h.run('keySelected('+q(h.where)+',testId,testField)'),false);
 });
 test('backup failure preserves first digit and continuation '+label,async()=>{
  const h=setup(p,which,choice,role);h.open();
  h.run("globalThis.savedWrite=localStorage.setItem;localStorage.setItem=()=>{throw Error('quota test')}");
  await press(h,'1');
  assert.equal(h.valueNow(),'1','failed backup cannot lose the new in-memory digit');
  assert.equal(h.run('localSaveFailed'),true);
  if(!choice.count)assert.equal(h.run('editRaw'),'1','editor must show the retained unsaved digit');
  assert.equal(h.run('keySelected('+q(h.where)+',testId,testField)'),false,'a received digit consumes selection even when local backup fails');
  h.run('localStorage.setItem=savedWrite');
  await press(h,'8');assert.equal(h.valueNow(),'18');
  assert.equal(h.run('localSaveFailed'),false);
  h.run('closePad();doUndo()');assert.equal(h.valueNow(),'12');
 });
 test('save response does not replace digits typed during flight '+label,async()=>{
  const savedPath=paths.find(x=>x.name===(which==='stock'?'saved-count':'saved-order'));
  const h=setup(p,which,savedPath,role);installSave(h);h.open();h.type('1');
  const saving=h.run('saveOrder(true)');
  assert.equal(h.run('typeof completeOrderSave'),'function','fixture must enter the real save transaction');
  h.type('8');assert.equal(h.valueNow(),'18');
  h.run('completeOrderSave()');await saving;
  assert.equal(h.valueNow(),'18','late save response keeps newer local input');
  assert.equal(h.run('editRaw'),'18');
  assert.equal(h.run("keySelected('order',testId,testField)"),false);
  assert.equal(h.run('order.revision'),2);
  assert.equal(h.run('dirtyCount()'),1,'the later edit remains unsaved');
  h.type('0');assert.equal(h.valueNow(),'180','post-save key must append, not rearm selection');
 });
}

for(const p of source.products)for(const role of ['owner','editor']){
 test('remote finalization closes the active selected item '+p.id+'/'+role,async()=>{
  const h=setup(p,'qty',fieldPath(p,'qty',role),role);h.open();
  h.run("openOrder=async()=>{};globalThis.remote=C.clone(peerBase);remote.revision=2;remote.stage='finalized';remote.orderId='count-test-final';remote.draft.status='reviewed';peerReceive(remote)");
  assert.equal(h.run('keypad'),false);
  assert.equal(h.run('keySelected('+q(h.where)+",testId,'qty')"),false);
  const before=h.run(valueSignature);await press(h,'8');assert.equal(h.run(valueSignature),before);
 });
}

const p=source.products.find(x=>x.id==='cn:9');
for(const name of ['shared-count','draft-search','saved-order']){
 for(const original of ['12','12.345','0.001','999999.999','1000000']){
  test('decimal boundary retains exact replacement '+name+'/'+original,()=>{
   const h=setup(p,'qty',paths.find(x=>x.name===name),'editor',original);
   h.open();h.type('.');h.type('0');h.type('0');h.type('1');
   assert.equal(h.valueNow(),'0.001');h.type('9');assert.equal(h.valueNow(),'0.001','fourth decimal digit is rejected');
   h.run('closePad();doUndo()');assert.equal(h.valueNow(),original);
  });
 }
}
for(const name of ['shared-count','draft-search']){
 test(name+': draft save in flight keeps selected state consumed and both independent fields',async()=>{
  const h=setup(p,'qty',paths.find(x=>x.name===name),'editor');h.open();h.type('1');
  h.run("peerApi.save=(base,sent)=>new Promise(resolve=>{globalThis.completePeerSave=()=>resolve({...base,revision:base.revision+1,draft:C.clone(sent)})})");
  const saving=h.run('peerSave()');h.type('8');h.run('completePeerSave()');await saving;
  assert.equal(h.valueNow(),'18');assert.equal(h.run('peerDirty()'),true);assert.equal(h.run('cloudConflict'),false);
  h.type('0');assert.equal(h.valueNow(),'180');
 });
 test(name+': switching to a different product does not reuse the former selected value',()=>{
  const h=setup(p,'qty',paths.find(x=>x.name===name),'editor');h.open();h.type('1');
  const other=source.products.find(x=>x.id==='kr:7');
  h.run("draft.items['kr:7'].quantity='24';draft.items['kr:7'].decision='order'");
  h.run(h.path.count?"openCount(draft.catalog.findIndex(p=>p.id==='kr:7'),'qty')":"openOrderKey('kr:7','qty')");
  h.type('9');assert.equal(h.run("draft.items['kr:7'].quantity"),'9');assert.equal(h.valueNow(),'1');
 });
}
test('saved quantity limit rejection keeps the last accepted digits and undo baseline',async()=>{
 const h=setup(p,'qty',paths.find(x=>x.name==='saved-order'));h.open();
 for(const key of '1000000')h.type(key);
 assert.equal(h.valueNow(),'1000000');await press(h,'1');assert.equal(h.valueNow(),'1000000');
 assert.equal(h.run('editRaw'),'1000000');
 h.run('closePad();doUndo()');assert.equal(h.valueNow(),'12');
});
test('changing account during a save prevents its response from restoring the previous order',async()=>{
 const h=setup(p,'qty',paths.find(x=>x.name==='saved-order'));installSave(h);h.open();h.type('1');
 const saving=h.run('saveOrder(true)');h.run("sessionEpoch++;user=null;member=null;order=null;editId=null;keypad=false;completeOrderSave()");await saving;
 assert.equal(h.run('order'),null);assert.equal(h.run('keypad'),false);assert.equal(h.run("keySelected('order',testId,'qty')"),false);
});
for(const role of ['owner','editor'])for(const name of ['shared-count','draft-search'])for(const which of ['stock','qty']){
 test('active cloud unit-only change cannot relabel the selected value '+name+'/'+role+'/'+which,async()=>{
  const h=setup(p,which,paths.find(x=>x.name===name),role);h.open();
  const oldUnit=h.run("draft.items[testId]["+q(which==='stock'?'stockUnit':'unit')+']');
  h.run("globalThis.remote=C.clone(peerBase);remote.revision=2;remote.draft.items[testId]["+q(which==='stock'?'stockUnit':'unit')+"]='测试新单位';peerReceive(remote)");
  assert.equal(h.run('cloudConflict'),true);
  assert.equal(h.run("draft.items[testId]["+q(which==='stock'?'stockUnit':'unit')+']'),oldUnit);
  await press(h,'8');assert.equal(h.valueNow(),'12');
 });
}
for(const role of ['owner','editor'])for(const name of ['shared-count','draft-search']){
 test('accepted new shared document clears the former editor and undo '+name+'/'+role,()=>{
  const h=setup(p,'qty',paths.find(x=>x.name===name),role);h.open();h.type('8');h.run('closePad()');
  assert.ok(h.run('undo'));
  h.run("peerBase={...peerBase,revision:2,draft:C.clone(draft)};peerLatest=peerBase;globalThis.remote=C.clone(peerBase);remote.revision=3;remote.localId='count-next-boundary';remote.draft.id=remote.localId;remote.draft.items[testId].quantity='4';peerReceive(remote)");
  assert.equal(h.run('draft.id'),'count-next-boundary');assert.equal(h.run('keypad'),false);assert.equal(h.run('undo'),null);assert.equal(h.run('entered'),null);assert.equal(h.run('editId'),null);
  h.run('doUndo()');assert.equal(h.valueNow(),'4');
 });
}
test('pending zero fraction is locally recoverable but not a cloud quantity',()=>{
 const h=setup(p,'qty',paths.find(x=>x.name==='saved-order'));installSave(h);h.open();h.type('.');h.type('0');h.type('0');
 assert.equal(h.run('editRaw'),'0.00');assert.equal(h.valueNow(),'12');
 assert.equal(h.run('unfinishedOrderInput()'),true);assert.equal(h.run('closePad()'),false);
 h.run('orderEdited()');
 const stored=JSON.parse(h.saved.get(h.run('orderKey()')));
 assert.equal(stored.editor.raw,'0.00');assert.equal(stored.working.quantities[p.id],12000);
 h.run('editId=null;editRaw=null;keypad=false;clearKeySelection();beginOrderSession(order)');
 assert.equal(h.run('editRaw'),'0.00');assert.equal(h.run('keySelection'),null);
 h.type('1');assert.equal(h.valueNow(),'0.001');
});
test('rejected missing-unit input does not consume an unmodified selected number',async()=>{
 const h=setup(p,'qty',paths.find(x=>x.name==='draft-search'));h.open();
 h.run("draft.items[testId].unit=''");
 const before=h.run('draft.contentVersion');await press(h,'8');
 assert.equal(h.valueNow(),'12');assert.equal(h.run('editRaw'),'12');assert.equal(h.run('draft.contentVersion'),before);
 assert.equal(h.run("keySelected('order',testId,'qty')"),true);
});

// Leaving a count cell must use the same final-input rules as closing its
// keypad. These exits have different navigation/search state and used to
// bypass completion, leaving a hidden zero-order that finalization rejected.
const countExits=[
 {name:'category',run:"showCat('kr')",arrived:"screen==='count'&&viewCat==='kr'&&!keypad"},
 {name:'product',run:"openCount(draft.catalog.findIndex(p=>p.id==='cn:12'),'qty')",arrived:"screen==='count'&&draft.catalog[pos].id==='cn:12'&&keypad"},
 {name:'tab',run:"tryLeave('order')",arrived:"screen==='order'&&!keypad"},
 {name:'clear-search',search:true,run:'clearFind()',arrived:"screen==='count'&&query===''&&!keypad"},
 {name:'cancel-search',search:true,run:'cancelFind()',arrived:"screen==='count'&&query===''&&viewCat==='kr'&&searchCat===null&&searchScroll===null&&!keypad"}
];
function countExitSetup(exit,which,role){
 const h=setup(p,which,paths.find(x=>x.name===(exit.search?'count-search':'shared-count')),role);
 h.find.focus=()=>{};
 if(exit.search)h.run("searchCat='kr';searchScroll=190");
 h.open();
 return h;
}
for(const role of ['owner','editor'])for(const exit of countExits){
 for(const raw of ['0','00','0.0','0.00','0.000']){
  test('count exit normalizes complete zero and preserves undo '+role+'/'+exit.name+'/'+raw,()=>{
   const h=countExitSetup(exit,'qty',role),unit=h.run('draft.items[testId].unit');
   for(const key of raw)h.type(key);
   assert.equal(h.valueNow(),raw,'fixture must reach the exact numeric zero fragment');
   h.run(exit.run);
   assert.equal(h.run(exit.arrived),true,'successful exit must reach its requested destination');
   assert.equal(h.valueNow(),'','complete zero becomes the established blank/no-order value');
   assert.equal(h.run("draft.items[testId].decision==='order'"),false,'zero cannot remain a hidden invalid order');
   assert.equal(JSON.parse(h.saved.get(h.run('KEY'))).draft.items[p.id].quantity,'','local recovery must retain normalized data');
   assert.equal(h.run('draft.items[testId].unit'),unit,'leaving a numeric field never changes its order unit');
   h.run('doUndo()');
   assert.equal(h.valueNow(),'12');assert.equal(h.run('draft.items[testId].decision'),'order');
   assert.equal(h.run('screen'),'count');assert.equal(h.run('draft.catalog[pos].id'),p.id);
   assert.equal(h.run("keySelected('count',testId,'qty')"),false,'undo retains append semantics');
  });
 }
 for(const raw of ['0.','1.']){
  test('count exit retains unfinished decimal and search context '+role+'/'+exit.name+'/'+raw,()=>{
   const h=countExitSetup(exit,'qty',role);
   for(const key of raw==='0.'?'.':raw)h.type(key);
   assert.equal(h.valueNow(),raw);
   const before=h.run('JSON.stringify([screen,pos,field,viewCat,query,searchCat,searchScroll,keypad,entered,draft.contentVersion,draft.items[testId]])');
   h.run(exit.run);
   assert.equal(h.run('JSON.stringify([screen,pos,field,viewCat,query,searchCat,searchScroll,keypad,entered,draft.contentVersion,draft.items[testId]])'),before,'blocked exit must keep the visible editor and all search/navigation context');
   assert.match(h.run('lastToast'),/数量还没写完/);
   assert.equal(h.run('undo'),null,'an unfinished fragment is not committed as a finished edit');
   h.type('5');assert.equal(h.valueNow(),raw+'5');
   h.run(exit.run);assert.equal(h.run(exit.arrived),true,'finishing the fraction unblocks this same exit');
   h.run('doUndo()');assert.equal(h.valueNow(),'12');
  });
 }
 test('count exit retains genuine zero stock '+role+'/'+exit.name,()=>{
  const h=countExitSetup(exit,'stock',role);h.type('0');h.run(exit.run);
  assert.equal(h.run(exit.arrived),true);assert.equal(h.valueNow(),'0');
  assert.equal(h.run('draft.items[testId].stockStatus'),'counted');
  assert.equal(JSON.parse(h.saved.get(h.run('KEY'))).draft.items[p.id].stock,'0');
  h.run('doUndo()');assert.equal(h.valueNow(),'12');
 });
}
