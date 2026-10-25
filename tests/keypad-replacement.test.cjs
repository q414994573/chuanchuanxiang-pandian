'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('../count-core.js');
const source=require('../current-order.json');

// Exercise real app functions in the existing isolated, no-network VM. Each
// named matrix case is one complete edit workflow, not one assertion.
const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const body=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',"const fs=require('node:fs'),vm=require('node:vm');"+body+';return harness;')(require,Core,source);
const q=JSON.stringify;
const paths=[
 {name:'private-count',count:true,private:true,stock:true},
 {name:'shared-count',count:true,stock:true},
 {name:'count-search',count:true,search:true,stock:true},
 {name:'draft-order'},
 {name:'draft-search',search:true,stock:true},
 {name:'saved-order',saved:true},
 {name:'saved-search',saved:true,search:true},
 {name:'saved-count',saved:true,stock:true,countScreen:true}
];
function setup(p,which,path,role='owner',value='12'){
 const h=harness(true);h.ctx.confirm=()=>true;
 h.run([
  "releaseLocked=false;user={uid:'test-keypad-"+role+"'};member={role:"+q(role)+"};peerEnabled="+!path.private+";peerApi={};flushCloud=()=>{};",
  'globalThis.testId='+q(p.id)+';globalThis.testField='+q(which)+';',
  'globalThis.testIndex=draft.catalog.findIndex(p=>p.id===testId);globalThis.testProduct=draft.catalog[testIndex];',
  "for(const p of draft.catalog){const r=draft.items[p.id],unit=r.unit||C.units.choices[p.id]?.[0]?.[0]||'包';r.unit=unit;r.stockUnit=r.stockUnit||unit;}",
  "draft.items[testId].stock='7';draft.items[testId].stockStatus=testProduct.hasStock?'counted':'exempt';if(!testProduct.hasStock)draft.items[testId].stock='';",
  "draft.items[testId].quantity='4';draft.items[testId].decision='order';",
  "draft.items[testId][testField==='stock'?'stock':'quantity']="+q(value)+';',
  'draft.seen={};draft.deferred={};',
  "peerBase={localId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerLatest=peerBase;"
 ].join('\n'));
 if(path.saved)h.run([
  'const snap=C.clone(draft);',
  "order={id:'count-keypad-fixture',schema:'ccx-cloud-1',date:draft.date,revision:1,orderStage:'pending',snapshot:JSON.stringify(snap),",
  "quantities:Object.fromEntries(snap.catalog.map(p=>[p.id,p.id===testId?(testField==='qty'?Number("+q(value)+")*1000:4000):0])),",
  'units:Object.fromEntries(snap.catalog.map(p=>[p.id,snap.items[p.id].unit]))};',
  'rememberStocks();baseQty={...order.quantities};baseUnits={...order.units};orderBase=C.clone(order);orderDirty=false;'
 ].join('\n'));
 h.run('screen='+q(path.count||path.countScreen?'count':'order')+';viewCat=Flow.catOf(testProduct);orderCat=viewCat;query='+(path.search?'Flow.largeName(testProduct)':"''")+';');
 const where=path.count?'count':'order';
 const open=path.count?"openFromRow({dataset:{act:'open',id:testId,field:testField}})":
  path.search||path.countScreen||which==='stock'?"openFromRow({dataset:{act:'edit',id:testId,field:testField,search:'true'}})":
  "openFromRow({dataset:{act:'edit',id:testId}})";
 const type=k=>h.run((path.count?'typeKey':'typeOrderKey')+'('+q(k)+')');
 const valueNow=()=>h.run("order?orderValue(testId,testField):draft.items[testId][testField==='stock'?'stock':'quantity']");
 const stable=()=>h.run('JSON.stringify([draft.catalog,draft.items[testId].unit,draft.items[testId].stockUnit,order?.units,order?.stockUnits])');
 return {...h,path,where,open:()=>h.run(open),type,valueNow,stable};
}

// Actual IDs cover every supplier, stock permission and unit combination.
// Private counting is owner-only; shared/saved flows exercise both roles.
for(const p of source.products)for(const path of paths)for(const role of path.private?['owner']:['editor','owner']){
 for(const which of p.hasStock&&path.stock?['stock','qty']:['qty']){
  test('replace workflow '+p.id+' / '+path.name+' / '+role+' / '+which,()=>{
   const h=setup(p,which,path,role),stable=h.stable();
   const untouched=h.run('JSON.stringify([draft.items,draft.seen,draft.deferred,draft.contentVersion,order?.quantities,order?.stockEdits,orderDirty])');
   h.open();assert.equal(h.valueNow(),'12');
   assert.equal(h.run('keySelected('+q(h.where)+',testId,testField)'),true);
   h.run('closePad()');
   assert.equal(h.run('JSON.stringify([draft.items,draft.seen,draft.deferred,draft.contentVersion,order?.quantities,order?.stockEdits,orderDirty])'),untouched,'opening/closing must not count or edit');
   h.open();h.type('8');assert.equal(h.valueNow(),'8','first digit replaces twelve');
   h.open();h.type('1');assert.equal(h.valueNow(),'81','same cell must not rearm');
   h.run('closePad();doUndo()');
   assert.equal(h.valueNow(),'12','undo retains original baseline across same-cell tap');
   h.type('3');assert.equal(h.valueNow(),'123','undo keeps existing append behavior');
   h.run('closePad()');h.open();h.type('1');h.type('8');
   assert.equal(h.valueNow(),'18','new session replaces once, then appends');
   assert.equal(h.stable(),stable,'numbers must not modify names or units');
  });
 }
}

const stockProduct=source.products.find(p=>p.id==='cn:9');
const quantityProduct=source.products.find(p=>p.id==='other:18');
for(const path of paths)for(const which of path.stock?['stock','qty']:['qty']){
 const p=which==='stock'?stockProduct:quantityProduct;
 const label=path.name+'/'+which+': ';
 test(label+'decimal first replaces and finishes as 0.5',()=>{
  const h=setup(p,which,path);h.open();h.type('.');
  assert.equal(h.run(path.count?'draft.items[testId][testField==="stock"?"stock":"quantity"]':'editRaw'),'0.');
  if(path.saved)assert.equal(h.valueNow(),'12','incomplete decimal preserves saved number');
  if(!path.count)assert.equal(h.run('closePad()'),false);
  h.open();h.type('5');assert.equal(h.valueNow(),'0.5');
  h.run('closePad();doUndo()');assert.equal(h.valueNow(),'12');
 });
 test(label+'delete retains single-character behavior and consumes selection',()=>{
  const h=setup(p,which,path);h.open();h.type('del');assert.equal(h.valueNow(),'1');h.type('8');assert.equal(h.valueNow(),'18');
 });
 test(label+'stock zero and order no-order semantics remain distinct',()=>{
  const h=setup(p,which,path);h.open();h.type('0');
  if(which==='stock')assert.equal(h.valueNow(),'0');
  else if(path.count){assert.equal(h.valueNow(),'0');h.run('finishTyping()');assert.equal(h.valueNow(),'');}
  else assert.equal(h.valueNow(),'');
 });
 test(label+'closing then reopening selects the new number again',()=>{
  const h=setup(p,which,path);h.open();h.type('2');h.type('0');h.run('closePad()');h.open();h.type('7');assert.equal(h.valueNow(),'7');
 });
 test(label+'render, row updates and local autosave never rearm selection',()=>{
  const h=setup(p,which,path);h.open();h.type('1');h.run('render();paintRows();persistLocal()');h.type('8');assert.equal(h.valueNow(),'18');
 });
 test(label+'decimal precision limits still apply after replacement',()=>{
  const h=setup(p,which,path);h.open();h.type('1');h.type('.');h.type('2');h.type('3');h.type('4');h.type('5');assert.equal(h.valueNow(),'1.234');
 });
 test(label+'selection is not persisted in an order or draft',()=>{
  const h=setup(p,which,path);h.open();h.run('persistLocal()');
  for(const raw of h.saved.values())assert.doesNotMatch(raw,/keySelection|key-selection/);
 });
}
for(const path of paths.filter(p=>!p.count)){
 test(path.name+': plus/minus consume selection and retain arithmetic',()=>{
  const h=setup(quantityProduct,'qty',path);h.open();h.run('stepQty(1)');assert.equal(h.valueNow(),'13');h.type('4');assert.equal(h.valueNow(),'134');
  h.run('closePad()');h.open();h.run('stepQty(-1)');assert.equal(h.valueNow(),'133');h.type('5');assert.equal(h.valueNow(),'1335');
 });
 test(path.name+': cancel/undo restores original quantity',()=>{
  const h=setup(quantityProduct,'qty',path);h.open();h.run('cancelLine(testId)');assert.equal(h.valueNow(),'');h.run('doUndo()');assert.equal(h.valueNow(),'12');h.type('3');assert.equal(h.valueNow(),'123');
 });
}
for(const which of ['stock','qty']){
 test('shared '+which+': unrelated peer updates preserve selection and later continuation',()=>{
  const h=setup(stockProduct,which,paths.find(p=>p.name==='shared-count'),'editor');h.open();
  h.run("globalThis.remote=C.clone(peerBase);remote.revision=2;remote.draft.items['kr:7'].quantity='2';remote.draft.items['kr:7'].decision='order';peerReceive(remote)");
  h.type('1');assert.equal(h.valueNow(),'1');
  h.run("remote=C.clone(peerBase);remote.revision=3;remote.draft.items['kr:7'].quantity='3';peerReceive(remote)");
  h.type('8');assert.equal(h.valueNow(),'18');assert.equal(h.run('cloudConflict'),false);
 });
 test('shared '+which+': conflicting peer value blocks numeric replacement',()=>{
  const h=setup(stockProduct,which,paths.find(p=>p.name==='shared-count'),'editor');h.open();
  h.run("globalThis.remote=C.clone(peerBase);remote.revision=2;remote.draft.items[testId][testField==='stock'?'stock':'quantity']='9';peerReceive(remote)");
  assert.equal(h.run('cloudConflict'),true);h.type('8');assert.equal(h.valueNow(),'12');
 });
}
for(const role of ['owner','editor'])for(const path of paths.filter(p=>p.saved)){
 test(path.name+'/'+role+': finalized order cannot select or change a number',()=>{
  const h=setup(quantityProduct,'qty',path,role);h.run("order.orderStage='finalized'");h.open();
  assert.equal(h.run('editId'),null);assert.equal(h.run('keySelection'),null);assert.equal(h.valueNow(),'12');assert.equal(h.run('orderDirty'),false);
 });
}
test('count highlight is inside existing number and changes to caret after first digit',()=>{
 const h=setup(stockProduct,'stock',paths[0]);h.open();
 let html=h.run('countCell(testProduct,testIndex,testField)');assert.match(html,/<span class="key-selection">12<\/span>/);assert.doesNotMatch(html,/class="caret"/);
 h.type('8');html=h.run('countCell(testProduct,testIndex,testField)');assert.doesNotMatch(html,/class="key-selection"/);assert.match(html,/class="caret"/);
});
test('order and search share selection markup without new content rows',()=>{
 for(const name of ['draft-order','draft-search','saved-order','saved-count']){
  const h=setup(stockProduct,'qty',paths.find(p=>p.name===name));h.open();
  const html=h.run(name.includes('search')||name==='saved-count'?"searchInput(testProduct,'qty')":'blockHtml(Flow.catOf(testProduct))');
  assert.match(html,/<span class="key-selection">12<\/span>/);
 }
});
test('native text mode consumes keypad selection and retains existing text entry',async()=>{
 const h=setup(stockProduct,'stock',paths[0]);h.open();
 await h.handlers.click({isTrusted:false,target:{closest:s=>s==='[data-act]'?{dataset:{act:'mode',mode:'text'}}:null}});
 assert.equal(h.run('keySelection'),null);assert.equal(h.valueNow(),'12');h.run('textMode=false');h.type('3');assert.equal(h.valueNow(),'123');
});
test('restored incomplete edit continues the fraction without a new selection',()=>{
 const h=setup(stockProduct,'qty',paths.find(p=>p.name==='saved-order'));
 h.run("editId=testId;editField='qty';editSnap='12';editRaw='2.';keypad=true");h.type('5');assert.equal(h.valueNow(),'2.5');
});
test('selected value is scoped to document identity and login session',()=>{
 const h=setup(stockProduct,'stock',paths[0]);h.open();h.run('sessionEpoch++');assert.equal(h.run("keySelected('count',testId,'stock')"),false);
 h.run("draft.id='count-another-session'");h.type('3');assert.equal(h.valueNow(),'123');
});
for(const path of paths.filter(p=>p.stock)){
 test(path.name+': moving to a prefilled next field arms only that field',()=>{
  const h=setup(stockProduct,'stock',path);
  h.open();h.run(path.count?'nextCell()':'advanceOrder()');
  assert.equal(h.run(path.count?'field':'editField'),'qty');
  h.type('8');assert.equal(h.run("qtyOf(testId)"),'8');
  assert.equal(h.run("stockShown(testProduct)"),'12');
 });
}
for(const role of ['owner','editor']){
 test('saved stock undo stays in counting view and remains editable ('+role+')',()=>{
  const h=setup(stockProduct,'stock',paths.find(p=>p.name==='saved-count'),role);
  h.open();h.type('8');h.run('closePad();doUndo()');
  assert.equal(h.run('screen'),'count');assert.equal(h.valueNow(),'12');
  assert.equal(h.run("keySelected('order',testId,'stock')"),false);
  h.type('3');assert.equal(h.valueNow(),'123');
 });
}
test('count numeric zero is selected and replaced rather than gaining a leading zero',()=>{
 const h=setup(stockProduct,'stock',paths[0],'owner','0');
 h.open();assert.equal(h.run("keySelected('count',testId,'stock')"),true);
 h.type('8');assert.equal(h.valueNow(),'8');
});
test('return to the same selected count field without typing keeps the original undo baseline',()=>{
 const h=setup(stockProduct,'stock',paths[0]);h.open();h.open();h.type('8');h.open();h.type('1');h.run('closePad();doUndo()');assert.equal(h.valueNow(),'12');
});
test('an unfinished restored count decimal appends without becoming selected',()=>{
 const h=setup(stockProduct,'stock',paths[0],'owner','2.');
 h.open();assert.equal(h.run("keySelected('count',testId,'stock')"),false);h.type('5');assert.equal(h.valueNow(),'2.5');
});
