const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('../count-core.js');
const source=require('../current-order.json');

// Reuse the VM fixture without registering its test cases for a second time.
const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const body=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"))
 .replace("screen='order';render=()=>{};","screen='order';globalThis.originalRender=render;render=()=>{};")
 .replace('CountCore:Core,scrollY:80','CountCore:Core,localStorage:{setItem(k,v){saved.set(k,v);},getItem(k){return saved.get(k)??null;}},scrollY:80');
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${body};return harness;`)(require,Core,source);
const q=JSON.stringify;
function plain(value){return JSON.parse(JSON.stringify(value));}
function setup(role='owner',stage='pending'){
 const h=harness(true),nodes={app:h.run('app'),rows:{innerHTML:'',getBoundingClientRect:()=>({top:200,bottom:500})}};
 h.find.id='find';h.find.value='';h.find.classList={contains:()=>false};h.find.focus=()=>{h.document.activeElement=h.find;};h.find.closest=s=>s==='#find'?h.find:null;
 h.document.getElementById=id=>id==='find'?h.find:(nodes[id]||null);
 h.window.scrollBy=(x,y)=>{h.window.scrollY+=y;};
 h.ctx.navigator={onLine:true};h.ctx.confirm=()=>true;
 h.run(`buildSample('boss');sample=false;peerEnabled=true;member={role:${q(role)},name:'测试账号'};user={uid:${q('test-'+role)}};releaseLocked=false;
  order.orderStage=${q(stage)};baseQty={...order.quantities};baseUnits={...order.units};orderBase=C.clone(order);orderDirty=false;
  globalThis.serverReads=0;api={read:()=>{serverReads++;throw Error('search must stay local')}};`);
 return {...h,nodes};
}
function click(h,act,dataset={}){
 const button={dataset:{act,...dataset},disabled:false};
 return h.handlers.click({isTrusted:false,target:{closest:s=>s==='[data-act]'?button:null}});
}
function input(h,value,target=h.find){target.value=value;h.handlers.input({target});}
function key(h,name,extra={}){
 let prevented=false;h.handlers.keydown({target:h.find,key:name,keyCode:name==='Enter'?13:0,isComposing:false,preventDefault(){prevented=true;},...extra});return prevented;
}

for(const role of ['owner','editor']){
 for(const stage of ['pending','finalized'])test(`search hub opens locally and leaves ${stage} order values and units unchanged (${role})`,()=>{
  const h=setup(role,stage);h.run(`orderCat='cn'`);h.window.scrollY=730;
  const before=h.run('JSON.stringify([order,draft,stocks,baseQty,baseUnits,stockBase,stockBaseUnits])');
  h.run('openOrderSearch()');assert.equal(h.run('orderSearchOpen'),true);assert.equal(h.run('searchScroll'),730);assert.equal(h.run('searchCat'),'cn');assert.equal(h.window.scrollY,0);
  assert.equal(h.document.activeElement,h.find);assert.match(h.run('orderHtml()'),/^<section id="order-search-page"/);
  h.run(`query='大葱腐竹虾丸';submitOrderSearch();clearFind();cancelFind()`);
  assert.equal(h.run('JSON.stringify([order,draft,stocks,baseQty,baseUnits,stockBase,stockBaseUnits])'),before);assert.equal(h.run('serverReads'),0);
  assert.equal(h.run('orderSearchOpen'),false);assert.equal(h.run('orderCat'),'cn');assert.equal(h.window.scrollY,730);
 });
 for(const scenario of ['signed-out','unopened-link','reviewed-draft'])test(`search interface cannot bypass the ${scenario} guard (${role})`,()=>{
  const h=setup(role);h.run('openOrderSearch()');
  if(scenario==='signed-out')h.run('member=null;user=null');
  if(scenario==='unopened-link')h.run(`order=null;location.search='?order=count-not-opened';draft.status='draft'`);
  if(scenario==='reviewed-draft')h.run(`order=null;draft.status='reviewed';location.search=''`);
  h.run('originalRender()');const html=h.nodes.app.innerHTML;
  assert.doesNotMatch(html,/id="order-search-page"|search-hot-card/);assert.equal(h.run('orderSearchOpen'),false);assert.equal(h.run('query'),'');
  assert.match(html,scenario==='signed-out'?/去登录/:scenario==='unopened-link'?/这份订单尚未打开/:/云端订单尚未打开/);
 });
 test(`hot cards use actual historical quantities and independent saved units (${role})`,()=>{
  const h=setup(role,'finalized');h.run(`stocks['cn:9']='2';order.stockUnits={...order.stockUnits,'cn:9':'瓶'};order.units['cn:9']='箱';order.quantities['cn:9']=4500;
   draft.items['cn:9'].stock='999';draft.items['cn:9'].stockUnit='个';draft.items['cn:9'].unit='包';`);
  const before=h.run('JSON.stringify([order,draft,stocks])'),html=h.run(`searchHotCard(product('cn:9'),0,false)`);
  assert.match(html,/库存：2瓶/);assert.match(html,/订货：4\.5箱/);assert.doesNotMatch(html,/999|库存：2个|订货：4\.5包/);
  assert.equal(h.run('JSON.stringify([order,draft,stocks])'),before);
 });
 test(`zero inventory, blank inventory and exempt inventory remain distinct (${role})`,()=>{
  const h=setup(role);h.run(`stocks['kr:31']='0';order.stockUnits={...order.stockUnits,'kr:31':'개'};order.quantities['kr:31']=0`);
  assert.match(h.run(`searchHotCard(product('kr:31'),0,false)`),/库存：0개/);
  h.run(`stocks['kr:31']=''`);assert.match(h.run(`searchHotCard(product('kr:31'),0,false)`),/库存：未填写/);
  const noStock=h.run(`searchHotCard(product('other:18'),0,false)`);assert.match(noStock,/库存：无需盘库/);assert.doesNotMatch(noStock,/库存：0|库存：未填写/);
 });
 test(`blank, deferred and explicitly cancelled draft quantities have different labels (${role})`,()=>{
  const h=setup(role);h.run(`order=null;draft.status='draft';draft.seen={};draft.deferred={};draft.items['cn:33'].quantity='';draft.items['cn:33'].decision='pending'`);
  assert.match(h.run(`searchHotCard(product('cn:33'),0,false)`),/订货：未填写/);
  h.run(`draft.deferred['cn:33']=true`);assert.match(h.run(`searchHotCard(product('cn:33'),0,false)`),/订货：待定/);
  h.run(`delete draft.deferred['cn:33'];draft.items['cn:33'].decision='skip'`);assert.match(h.run(`searchHotCard(product('cn:33'),0,false)`),/订货：不订/);
  h.run(`draft.items['cn:33'].decision='order';draft.items['cn:33'].quantity='3.5';draft.items['cn:33'].unit='包'`);assert.match(h.run(`searchHotCard(product('cn:33'),0,false)`),/订货：3\.5包/);
 });
 test(`opening and typing do not count heat; confirm, edit and return do not triple-count (${role})`,()=>{
  const h=setup(role);h.run('openOrderSearch()');for(const text of ['腐','腐竹'])input(h,text);
  assert.equal(h.run('searchActivity.history().length'),0);assert.equal(h.run('searchActivity.ranked(catalog().map(p=>p.id)).length'),0);
  h.run('submitOrderSearch()');assert.equal(h.run('searchActivity.history().length'),1);assert.equal(h.run(`searchActivity.ranked(['cn:33'])[0].count`),1);
  h.run(`openFromRow({dataset:{act:'edit',search:'true',id:'cn:33',field:'qty'}});cancelFind()`);
  assert.equal(h.run(`searchActivity.ranked(['cn:33'])[0].count`),1);assert.equal(h.run('searchActivity.history().length'),1);
 });
 test(`back restores the selected category, scroll position and existing supplier preview (${role})`,()=>{
  const h=setup(role,'finalized');h.run(`orderCat='cn';supplierPreview('cn')`);h.window.scrollY=615;
  const preview=h.run('JSON.stringify(preparedExport)');h.run('openOrderSearch()');assert.doesNotMatch(h.run('orderHtml()'),/id="exportText"/);
  h.run(`query='腐竹';cancelFind()`);assert.equal(h.run('orderSearchOpen'),false);assert.equal(h.run('orderCat'),'cn');assert.equal(h.window.scrollY,615);
  assert.equal(h.run('JSON.stringify(preparedExport)'),preview);assert.match(h.run('orderHtml()'),/中国食品/);
 });
 test(`unfinished quantity blocks opening search without losing the editor (${role})`,()=>{
  const h=setup(role);h.run(`openOrderKey('cn:33');editRaw='2.';openOrderSearch()`);
  assert.equal(h.run('orderSearchOpen'),false);assert.equal(h.run('editRaw'),'2.');assert.equal(h.run('editId'),'cn:33');assert.equal(h.run('keypad'),true);assert.match(h.run('lastToast'),/还没写完/);
 });
 test(`unfinished quantity blocks search back and clear without changing the query (${role})`,()=>{
  const h=setup(role);h.run(`openOrderSearch();query='腐竹';openOrderKey('cn:33');editRaw='2.'`);
  for(const action of ['cancelFind()','clearFind()','submitOrderSearch("大葱")']){
   h.run(action);assert.equal(h.run('orderSearchOpen'),true);assert.equal(h.run('query'),'腐竹');assert.equal(h.run('editRaw'),'2.');assert.equal(h.run('keypad'),true);
  }
 });
 test(`clearing the query stays in the hub with its saved return position (${role})`,()=>{
  const h=setup(role);h.window.scrollY=840;h.run(`orderCat='drinks';openOrderSearch();query='腐竹';submitOrderSearch();clearFind()`);
  assert.equal(h.run('orderSearchOpen'),true);assert.equal(h.run('query'),'');assert.equal(h.run('searchScroll'),840);assert.equal(h.run('searchCat'),'drinks');
  assert.match(h.run('orderSearchRows()'),/川川香热搜榜/);assert.match(h.run('orderSearchRows()'),/搜索历史/);assert.equal(h.document.activeElement,h.find);
 });
 test(`finalized search results preserve read-only status and cannot open an editor (${role})`,()=>{
  const h=setup(role,'finalized');h.run(`openOrderSearch();query='腐竹'`);const before=h.run('JSON.stringify([order,stocks])');
  const html=h.run('orderSearchRows()');assert.match(html,/只读/);assert.doesNotMatch(html,/data-act="edit"/);
  h.run(`openFromRow({dataset:{act:'edit',search:'true',id:'cn:33',field:'qty'}})`);
  assert.equal(h.run('keypad'),false);assert.equal(h.run('JSON.stringify([order,stocks])'),before);assert.match(h.run('lastToast'),/已定稿/);
 });
}

test('search landing page labels cold-start recommendations honestly and ranks recorded items afterward',()=>{
 const h=setup();h.run(`orderCat='drinks'`);let html=h.run('orderSearchHome()');assert.match(html,/本次订货推荐/);assert.match(html,/暂无商品热搜记录/);assert.doesNotMatch(html,/>1<\/span>/);
 h.run(`searchActivity.record('腐竹',['cn:33'])`);html=h.run('orderSearchHome()');assert.match(html,/本机热搜/);assert.match(html,/本机近30天/);assert.match(html,/data-id="cn:33"/);assert.doesNotMatch(html,/本次订货推荐/);
});
test('no order quantities and no search events produce a truthful empty hot section',()=>{
 const h=setup();h.run(`order.quantities=Object.fromEntries(catalog().map(p=>[p.id,0]))`);const html=h.run('orderSearchHome()');
 assert.match(html,/暂无商品热搜记录，搜过的商品会出现在这里/);assert.doesNotMatch(html,/class="search-hot-card"/);assert.match(html,/还没有搜索历史/);
});
test('history chip text and attributes escape injected markup independently',()=>{
 const h=setup();const payload='腐竹"><img src=x onerror="evil()">';h.run(`searchActivity.record(${q(payload)},[])`);const html=h.run('orderSearchHome()');
 assert.ok(html.includes('data-query="腐竹&quot;&gt;&lt;img src=x onerror=&quot;evil()&quot;&gt;"'));
 assert.doesNotMatch(html,/<img|<script|data-query="腐竹">/);assert.match(html,/&lt;img/);
});
test('clear-history confirmation can cancel and confirm without changing order or current query',async()=>{
 const h=setup();h.run(`openOrderSearch();searchActivity.record('腐竹',['cn:33']);query='大葱'`);const before=h.run('JSON.stringify([order,draft,stocks])');
 h.ctx.confirm=()=>false;await click(h,'clear-history');assert.equal(h.run('searchActivity.history().length'),1);
 h.ctx.confirm=()=>true;await click(h,'clear-history');assert.equal(h.run('searchActivity.history().length'),0);assert.equal(h.run('searchActivity.ranked(catalog().map(p=>p.id)).length'),0);
 assert.equal(h.run('query'),'大葱');assert.equal(h.run('orderSearchOpen'),true);assert.equal(h.run('JSON.stringify([order,draft,stocks])'),before);
});
test('history selection reuses exact multi-item query and hot selection uses the chosen product name',async()=>{
 const h=setup();h.run('openOrderSearch()');await click(h,'history-find',{query:'大葱、腐竹 虾丸'});
 assert.equal(h.run('query'),'大葱、腐竹 虾丸');assert.deepEqual(plain(h.run('catalog().filter(matchesSearch).map(p=>p.id)')),['kr:7','cn:33','cn:64']);
 await click(h,'hot-find',{id:'cn:33'});assert.equal(h.run('query'),h.run(`product('cn:33').name`));assert.equal(h.run('orderSearchOpen'),true);
});
for(const action of ['clearFind()','cancelFind()'])test(`${action} cannot be undone by synchronous IME completion/input during blur`,()=>{
 const h=setup();h.run('openOrderSearch()');h.find.value='腐';h.handlers.compositionstart({target:h.find});input(h,'腐');
 h.find.blur=()=>{h.find.value='腐竹';h.handlers.compositionend({target:h.find});h.handlers.input({target:h.find});h.document.activeElement=null;};
 h.run(action);assert.equal(h.run('query'),'');assert.equal(h.run('searchComposing'),false);assert.equal(h.run('orderSearchOpen'),action==='clearFind()');
});
test('late input and compositionend from a detached old search input cannot overwrite the current query',()=>{
 const h=setup();h.run('openOrderSearch()');input(h,'大葱');h.handlers.compositionstart({target:h.find});
 const stale={id:'find',value:'腐竹',classList:{contains:()=>false}};h.handlers.input({target:stale});h.handlers.compositionend({target:stale});
 assert.equal(h.run('query'),'大葱');assert.equal(h.run('searchComposing'),true);
 h.find.value='大葱腐竹';h.handlers.compositionend({target:h.find});assert.equal(h.run('query'),'大葱腐竹');assert.equal(h.run('searchComposing'),false);
});
test('a normal active composition updates results without recording an unfinished query',()=>{
 const h=setup();h.run('openOrderSearch()');h.handlers.compositionstart({target:h.find});input(h,'腐');h.find.value='腐竹';h.handlers.compositionend({target:h.find});
 assert.equal(h.run('query'),'腐竹');assert.equal(h.run('searchComposing'),false);assert.equal(h.run('searchActivity.history().length'),0);
 assert.match(h.nodes.rows.innerHTML,/data-id="cn:33"/);assert.equal(h.document.activeElement,h.find);
});
test('Enter ignores native and application composition flags and key code 229 before confirming',()=>{
 const h=setup();h.run('openOrderSearch()');input(h,'腐竹');
 for(const event of [{isComposing:true},{keyCode:229}]){assert.equal(key(h,'Enter',event),false);assert.equal(h.run('searchActivity.history().length'),0);}
 h.run('searchComposing=true');assert.equal(key(h,'Enter'),false);assert.equal(h.run('searchActivity.history().length'),0);
 h.run('searchComposing=false');assert.equal(key(h,'Enter'),true);assert.equal(h.run('searchActivity.history().length'),1);
});
test('Escape ignores composition and returns to the order only after composition ends',()=>{
 const h=setup();h.window.scrollY=350;h.run('openOrderSearch();searchComposing=true');assert.equal(key(h,'Escape'),false);assert.equal(h.run('orderSearchOpen'),true);
 h.run('searchComposing=false');assert.equal(key(h,'Escape'),true);assert.equal(h.run('orderSearchOpen'),false);assert.equal(h.window.scrollY,350);
});
for(const context of ['session','order','screen'])test(`changing ${context} ends the old search scope before rendering another context`,()=>{
 const h=setup();h.run(`openOrderSearch();query='腐竹'`);
 if(context==='session')h.run('sessionEpoch++');
 if(context==='order')h.run(`order={...order,id:'another-order'}`);
 if(context==='screen')h.run(`screen='count'`);
 h.run('originalRender()');assert.equal(h.run('orderSearchOpen'),false);assert.equal(h.run('query'),'');assert.equal(h.run('searchScroll'),null);assert.equal(h.run('searchContext'),null);
});
