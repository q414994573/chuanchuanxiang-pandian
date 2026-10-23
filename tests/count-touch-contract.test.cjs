const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Core=require('../count-core.js'),source=require('../current-order.json');
const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const body=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${body};return harness;`)(require,Core,source);
function setup(role,cat){
 const h=harness(true);h.run(`peerEnabled=true;peerApi={};member={role:'${role}'};screen='count';viewCat='${cat}';peerBase={localId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerLatest=peerBase;flushCloud=()=>{};globalThis.first=draft.catalog.findIndex(p=>p.cat===viewCat);globalThis.id=draft.catalog[first].id;globalThis.target=first+2;openCount(first);`);return h;
}
for(const role of ['owner','editor'])for(const cat of ['kr','cn','other']){
 test(`${role}/${cat}: untouched product stays unseen when tapping two rows ahead`,()=>{
  const h=setup(role,cat);h.run('openCount(target)');assert.equal(h.run('seen(id)'),false);assert.equal(h.run('draft.items[id].quantity'),'');assert.equal(h.run('pos'),h.run('target'));
 });
 test(`${role}/${cat}: quantity entry is seen without Next and survives direct tap`,()=>{
  const h=setup(role,cat);h.run(`openCount(first,'qty');typeKey('2');openCount(target);`);assert.equal(h.run('seen(id)'),true);assert.equal(h.run('draft.items[id].quantity'),'2');assert.equal(JSON.parse(h.saved.get(h.run('KEY'))).draft.items[h.run('id')].quantity,'2');
 });
 test(`${role}/${cat}: pending product remains deferred after editing and direct tap`,()=>{
  const h=setup(role,cat);h.run(`openCount(first,'qty');typeKey('2');deferActive();openCount(first,'qty');typeKey('3');openCount(target);`);assert.equal(h.run('seen(id)'),false);assert.equal(h.run('draft.deferred[id]'),true);assert.equal(h.run('draft.items[id].quantity'),'23');
 });
 test(`${role}/${cat}: leaving quantity with Next resolves deferred without losing value`,()=>{
  const h=setup(role,cat);h.run(`openCount(first,'qty');typeKey('2');deferActive();openCount(first,'qty');nextCell();`);assert.equal(h.run('seen(id)'),true);assert.equal(h.run('draft.deferred[id]'),undefined);assert.equal(h.run('draft.items[id].quantity'),'2');
 });
 test(`${role}/${cat}: explicit blank quantity Next marks skipped goods seen`,()=>{
  const h=setup(role,cat);h.run(`openCount(first,'qty');nextCell();`);assert.equal(h.run('seen(id)'),true);assert.equal(h.run('draft.items[id].quantity'),'');assert.equal(h.run('draft.items[id].stock'),'');
 });
 test(`${role}/${cat}: incomplete decimal blocks Next and preserves pending digits`,()=>{
  const h=setup(role,cat);h.run(`openCount(first,'qty');typeKey('.');nextCell();`);assert.equal(h.run('pos'),h.run('first'));assert.equal(h.run('draft.items[id].quantity'),'0.');assert.equal(h.run('seen(id)'),false);assert.match(h.run('lastToast'),/没写完/);
 });
 if(cat!=='other')test(`${role}/${cat}: stock-only zero counts seen, does not invent an order`,()=>{
  const h=setup(role,cat);h.run(`openCount(first,'stock');typeKey('0');openCount(target);`);assert.equal(h.run('seen(id)'),true);assert.equal(h.run('draft.items[id].stock'),'0');assert.equal(h.run('draft.items[id].quantity'),'');
 });
}
