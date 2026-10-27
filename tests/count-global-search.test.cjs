'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Core=require('../count-core.js'),source=require('../current-order.json');
const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const body=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${body};return harness;`)(require,Core,source);
const aliases=require('../redesign-preview/aliases.json').items;
const expected=['kr:7','cn:33','cn:75'];
function setup(role,cat,mode='draft'){
 const h=harness(true);h.ctx.navigator={onLine:true};
 h.run(`releaseLocked=false;member={role:${JSON.stringify(role)}};user={uid:'test-${role}'};peerEnabled=true;peerViewing=true;aliasById=new Map(${JSON.stringify(aliases)}.map(x=>[x.id,x.aliases]));
 peerBase={localId:draft.id,orderId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerLatest=peerBase;peerApi={save:async(base,next)=>({...base,revision:base.revision+1,draft:C.clone(next)})};cloudReady=true;`);
 if(mode!=='draft')h.run(`buildSample('boss');sample=false;order.orderStage=${JSON.stringify(mode)};orderBase=C.clone(order);`);
 h.run(`screen='count';viewCat=${JSON.stringify(cat)};query='大葱腐竹粉丝';`);
 return h;
}
function rowIds(h){
 const html=h.run('countRows()');
 return h.run('sharedCount()')?[...html.matchAll(/class="line search-hit[^>]*data-id="([^"]+)"/g)].map(m=>m[1]):[...html.matchAll(/data-row="(\d+)"/g)].map(m=>h.run(`draft.catalog[${m[1]}].id`));
}
for(const role of ['owner','editor'])for(const cat of ['kr','cn','other','drinks'])for(const mode of ['draft','pending','finalized']){
 test(`screenshot query shows all three products from ${cat}, ${role}, ${mode}`,()=>{
  const h=setup(role,cat,mode),before=h.run('JSON.stringify([draft,order])');
  assert.deepEqual(rowIds(h),expected);
  assert.match(h.run('countRows()'),/搜到 3 种商品 · 全部分类/);
  const cells=JSON.parse(h.run('JSON.stringify(sharedCount()?orderNavigationCells():countNavigationCells())'));
  assert.deepEqual([...new Set(cells.map(c=>c.id))],mode==='finalized'?[]:expected);
  assert.equal(h.run('JSON.stringify([draft,order])'),before);
 });
}
for(const role of ['owner','editor']){
 test(`cross-category next, previous, defer and cancel retain the complete result: ${role}`,()=>{
  const h=setup(role,'kr');h.run(`query='';rememberSearchOrigin();query='大葱腐竹粉丝';openCount(draft.catalog.findIndex(p=>p.id==='kr:7'),'qty');typeKey('2');nextCell()`);
  assert.equal(h.run('draft.catalog[pos].id'),'cn:33');assert.equal(h.run('field'),'stock');assert.deepEqual(rowIds(h),expected);
  h.run('nextCell(-1)');assert.equal(h.run('draft.catalog[pos].id'),'kr:7');assert.equal(h.run('field'),'qty');
  h.run('deferActive()');assert.equal(h.run('draft.catalog[pos].id'),'cn:33');assert.equal(h.run("deferred('kr:7')"),true);assert.deepEqual(rowIds(h),expected);
  h.run('cancelFind()');assert.equal(h.run('viewCat'),'kr');assert.equal(h.run('query'),'');
  assert.equal(h.run("draft.items['kr:7'].quantity"),'2');assert.ok(rowIds(h).every(id=>id.startsWith('kr:')));
 });
 test(`empty search still shows only the selected category: ${role}`,()=>{
  const h=setup(role,'cn');h.run("query=''");const ids=rowIds(h);assert.equal(ids.length,70);assert.ok(ids.every(id=>id.startsWith('cn:')));
 });
}
