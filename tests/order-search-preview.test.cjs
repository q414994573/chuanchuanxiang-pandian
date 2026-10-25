const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('../count-core.js');
const source=require('../current-order.json');

// Reuse the application VM harness without registering its existing tests twice.
const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const body=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${body};return harness;`)(require,Core,source);
const cats=['kr','cn','other','drinks'];

function finalized(role){
 const h=harness(true),deliveries=[],calls=[];
 h.ctx.navigator={onLine:true,clipboard:{writeText(text){calls.push('copy');deliveries.push({kind:'copy',text});return Promise.resolve();}},share({text}){calls.push('share');deliveries.push({kind:'share',text});return Promise.resolve();}};
 h.run(`buildSample('boss');sample=false;peerEnabled=true;member={role:'${role}',name:'测试账号'};user={uid:'test-${role}'};order.orderStage='finalized';
  order.quantities=Object.fromEntries(catalog().map((p,i)=>[p.id,(i%3+1)*1000]));baseQty={...order.quantities};baseUnits={...order.units};orderBase=C.clone(order);
  globalThis.serverReads=0;api={read:()=>{serverReads++;throw Error('preview must not read the network')}};`);
 return {h,deliveries,calls};
}

// The user can enter search while the sticky controls remain visible but the
// list is far below its beginning. Replacing its rows must reveal the first hit.
function geometry(h,{scroll=900,previewHeight=0,visualOffset=0}={}){
 const moves=[],rowDocumentTop=260+previewHeight;
 const rows={innerHTML:'',getBoundingClientRect:()=>({top:rowDocumentTop-h.window.scrollY,bottom:rowDocumentTop-h.window.scrollY+120})};
 const search={classList:{toggle(){}},getBoundingClientRect:()=>({top:208,bottom:252})};
 const bar={contains:el=>el===search,getBoundingClientRect:()=>({top:58,bottom:260})};
 const banner={getBoundingClientRect:()=>({top:0,bottom:58})};
 h.find.id='find';h.find.value='';h.find.classList={contains:()=>false};h.find.focus=()=>{h.document.activeElement=h.find;};
 h.find.getBoundingClientRect=search.getBoundingClientRect;
 h.document.activeElement=h.find;
 h.document.getElementById=id=>id==='find'?h.find:id==='rows'?rows:{};
 h.document.querySelector=s=>s==='.search'?search:s==='.bar'?bar:s==='.banner'?banner:null;
 h.window.scrollY=scroll;
 h.window.visualViewport.offsetTop=visualOffset;
 h.window.visualViewport.height=440;
 h.window.scrollBy=(x,y)=>{h.window.scrollY=Math.max(0,h.window.scrollY+y);moves.push(y);};
 h.window.scrollTo=(x,y)=>{h.window.scrollY=typeof x==='object'?x.top:y;};
 return {rows,search,bar,moves};
}

for(const role of ['owner','editor'])for(const screen of ['count','order']){
 test(`deep ${screen} search shows its first hit and cancel restores the origin (${role})`,()=>{
  const {h}=finalized(role);const g=geometry(h);
  h.run(`screen='${screen}';viewCat='cn';orderCat='cn';query='';rememberSearchOrigin();`);
  const before=h.run('JSON.stringify([order.quantities,order.units,order.snapshot])');
  h.find.value='鸡精';h.handlers.input({target:h.find});
  assert.equal(h.run('query'),'鸡精');
  assert.ok(g.rows.getBoundingClientRect().top>=g.bar.getBoundingClientRect().bottom-2,'first result must not remain behind the sticky controls');
  assert.ok(g.rows.getBoundingClientRect().top<=g.bar.getBoundingClientRect().bottom+20,'first result must be immediately below the search controls');
  assert.equal(h.document.activeElement,h.find,'search composition input must not be replaced or blurred');
  assert.equal(h.run('searchScroll'),900,'result alignment must not overwrite the original list position');
  h.run('cancelFind()');
  assert.equal(h.window.scrollY,900);assert.equal(h.run(screen==='order'?'orderCat':'viewCat'),'cn');
  assert.equal(h.run('JSON.stringify([order.quantities,order.units,order.snapshot])'),before);
 });
}

test('search anchors below sticky controls even when a supplier preview precedes the bar',()=>{
 const {h}=finalized('owner');h.run(`supplierPreview('cn')`);
 const g=geometry(h,{scroll:1100,previewHeight:350});
 h.run(`screen='order';orderCat='cn';rememberSearchOrigin()`);
 h.find.value='鸡精';h.handlers.input({target:h.find});
 const top=g.rows.getBoundingClientRect().top;
 assert.ok(top>=258&&top<=280,'result should align below the bar, not under the preceding text preview');
 assert.ok(h.window.scrollY>=330&&h.window.scrollY<=352,'scrolling to document zero would expose the preview and hide the search hit');
 assert.equal(h.run('searchScroll'),1100);
 h.run('cancelFind()');assert.equal(h.window.scrollY,1100);
});

for(const role of ['owner','editor'])for(const previewHeight of [0,350]){
 test(`shrinking results recover a sticky bar pushed above its parent boundary (${role}, preview ${previewHeight})`,()=>{
  const {h}=finalized(role);if(previewHeight)h.run(`supplierPreview('cn')`);
  const originalScroll=900+previewHeight,g=geometry(h,{scroll:originalScroll,previewHeight});
  // Real-browser failure: shrinking the long list gives a transient bar rect
  // top=-85/bottom=79, although CSS still declares top:58px and height:164px.
  // Once scrolling is corrected, it sticks at 58 again. Using the transient
  // bottom would leave the first hit hidden under the restored bar.
  g.bar.getBoundingClientRect=()=>{
   const top=Math.min(58,815+previewHeight-h.window.scrollY);
   return {top,bottom:top+164,height:164};
  };
  g.rows.getBoundingClientRect=()=>{
   const top=238+previewHeight-h.window.scrollY;
   return {top,bottom:top+80,height:80};
  };
  h.window.getComputedStyle=el=>({top:el===g.bar?'58px':'0px'});
  assert.equal(g.bar.getBoundingClientRect().top,-85);
  assert.equal(g.bar.getBoundingClientRect().bottom,79);
  h.run(`screen='order';orderCat='cn';query='';rememberSearchOrigin()`);
  h.find.value='鸡精';h.handlers.input({target:h.find});
  assert.equal(g.bar.getBoundingClientRect().top,58,'bar returns to its actual declared sticky position');
  assert.equal(g.rows.getBoundingClientRect().top,58+164+8,'first hit follows the stable sticky bottom with an eight-pixel gap');
  assert.equal(h.document.activeElement,h.find,'native input remains focused');
  assert.equal(h.run('searchScroll'),originalScroll);
  h.run('cancelFind()');assert.equal(h.window.scrollY,originalScroll);
 });
}

test('native keyboard resize never snaps a manually scrolled search list back to the first match',()=>{
 const {h}=finalized('editor');const g=geometry(h);
 h.run(`query='粉';scrollSearch(true)`);
 h.window.scrollY=145;g.moves.length=0;
 h.window.visualViewport.height=340;h.viewportHandlers.resize();
 assert.equal(h.window.scrollY,145);assert.equal(g.moves.length,0);
 h.document.activeElement=null;h.run('scrollSearch(true)');
 assert.equal(h.window.scrollY,145,'an inactive search must not move the page');
});

test('clearing an active deep search reveals the list top while returning keeps its original position',()=>{
 const {h}=finalized('owner');const g=geometry(h);
 h.run(`orderCat='cn';rememberSearchOrigin();query='粉'`);
 h.window.scrollY=400;h.run('clearFind()');
 assert.equal(h.run('query'),'');assert.equal(h.document.activeElement,h.find);
 assert.ok(g.rows.getBoundingClientRect().top>=258&&g.rows.getBoundingClientRect().top<=280);
 assert.equal(h.run('searchScroll'),900);
 h.run('cancelFind()');assert.equal(h.window.scrollY,900);
});

test('switching category ends the prior search origin before starting another search',()=>{
 const {h}=finalized('editor');geometry(h);
 h.run(`orderCat='cn';rememberSearchOrigin();query='鸡精';showOrderCat('kr')`);
 assert.equal(h.run('searchScroll'),null);assert.equal(h.run('searchCat'),null);
 h.window.scrollY=123;h.run(`rememberSearchOrigin();query='土豆';cancelFind()`);
 assert.equal(h.run('orderCat'),'kr');assert.equal(h.window.scrollY,123);
});

for(const role of ['owner','editor'])for(const cat of cats){
 test(`open supplier preview switches to ${cat} with immediate matching copy and share (${role})`,async()=>{
  const {h,deliveries,calls}=finalized(role);
  h.run(`supplierPreview('cn')`);
  const before=h.run('JSON.stringify([order,draft])');
  h.window.scrollY=650;h.run(`showOrderCat('${cat}')`);
  assert.equal(h.run('orderCat'),cat);
  assert.equal(h.run('preparedExport.cat'),cat);
  const expected=h.run(`blockText('${cat}')`);
  assert.equal(h.run('preparedExport.text'),expected);
  const label=h.run(`CATS.find(c=>c[0]==='${cat}')[2]`);
  assert.ok(h.run('exportPanel()').includes(label),'preview explicitly identifies the selected supplier category');
  assert.equal(h.window.scrollY,0,'open preview remains visible at the top when changing categories');
  const copying=h.run('deliverPrepared(false)');assert.deepEqual(calls,['copy']);await copying;
  const sharing=h.run('deliverPrepared(true)');assert.deepEqual(calls,['copy','share']);await sharing;
  assert.deepEqual(deliveries,[{kind:'copy',text:expected},{kind:'share',text:expected}]);
  assert.equal(h.run('serverReads'),0);
  assert.equal(h.run('JSON.stringify([order,draft])'),before);
 });

 test(`empty ${cat} preview never retains another supplier's order text (${role})`,async()=>{
  const {h,deliveries}=finalized(role),origin=cat==='cn'?'kr':'cn',seed=cat==='cn'?'kr:7':'cn:5';
  h.run(`order.quantities=Object.fromEntries(catalog().map(p=>[p.id,0]));order.quantities['${seed}']=1000;baseQty={...order.quantities};orderBase=C.clone(order);supplierPreview('${origin}');`);
  const previous=h.run('preparedExport.text');assert.doesNotMatch(previous,/这次不订/);
  h.run(`showOrderCat('${cat}')`);
  const expected=h.run(`blockText('${cat}')`);
  assert.match(expected,/这次不订/);assert.equal(h.run('preparedExport.text'),expected);assert.notEqual(expected,previous);
  await h.run('deliverPrepared(false)');await h.run('deliverPrepared(true)');
  assert.ok(deliveries.every(x=>x.text===expected));assert.equal(h.run('serverReads'),0);
 });
}

for(const role of ['owner','editor']){
 test(`repeated category switching always delivers the category currently selected (${role})`,async()=>{
  const {h,deliveries}=finalized(role);h.run(`supplierPreview('cn')`);
  for(const [i,cat] of ['drinks','kr','other','cn','kr','drinks','cn','other'].entries()){
   h.run(`showOrderCat('${cat}')`);const expected=h.run(`blockText('${cat}')`);
   await h.run(`deliverPrepared(${i%2===1})`);
   assert.equal(deliveries.at(-1).text,expected);assert.equal(h.run('preparedExport.cat'),cat);
  }
  assert.equal(h.run('serverReads'),0);
 });

 test(`mismatched category or newer order revision blocks a stale supplier preview (${role})`,async()=>{
  for(const mutation of ["orderCat='kr'","order.revision++","order.orderStage='pending'"]){
   const {h,deliveries}=finalized(role);h.run(`supplierPreview('cn');${mutation}`);
   await assert.rejects(h.run('deliverPrepared(false)'),/分类|切换|预览|定稿|变化/);
   assert.equal(deliveries.length,0);
  }
 });

 for(const replacement of ['another order','newer revision']){
  test(`category selection does not resurrect a hidden preview after accepting ${replacement} (${role})`,()=>{
   const {h}=finalized(role);h.run(`supplierPreview('cn')`);
   assert.match(h.run('exportPanel()'),/订货文字预览/);
   const change=replacement==='another order'?"next.id='test-count-another-finalized'":"next.revision++";
   h.run(`globalThis.next=C.clone(order);${change};acceptOrder(next)`);
   assert.equal(h.run('orderBase.id'),h.run('order.id'));
   assert.equal(h.run('orderBase.revision'),h.run('order.revision'));
   assert.equal(h.run('exportPanel()'),'','old order/version preview must be hidden');
   h.run(`showOrderCat('kr')`);
   assert.equal(h.run('orderCat'),'kr');
   assert.equal(h.run('exportPanel()'),'','selecting a category must not reopen an old hidden preview');
   assert.equal(h.run('preparedExport'),null,'obsolete preview state is discarded');
   assert.equal(h.run('serverReads'),0);
  });
 }
}
