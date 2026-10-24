const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Core=require('../count-core.js'),source=require('../current-order.json');
const Flow=require('../redesign-preview/count-flow.cjs'),S=require('../redesign-preview/search.cjs');
// Independent, reviewed acceptance list; do not derive expected names from implementation.
const confirmed=require('./confirmed-names.json');
const aliases=new Map(require('../redesign-preview/aliases.json').items.map(p=>[p.id,p.aliases]));
const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const body=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${body};return harness;`)(require,Core,source);
const q=JSON.stringify;
// The initials oracle is independent of search.fold.
const initials=text=>Array.from(text).map(c=>{const n=c.charCodeAt(0)-0xac00;return n>=0&&n<11172?'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(n/588)]:c;}).join('');

for(const [id,zh,ko,...hidden] of confirmed){
 test(`literal Korean lookup ${id}: exclude unrelated items sharing only initial consonants`,()=>{
  const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s/g,'');
  for(const term of [ko,...hidden]){
   const expected=source.products.filter(p=>{
    const entry=confirmed.find(row=>row[0]===p.id);
    return [p.name,p.alias,...(entry?entry.slice(1):[]),...(aliases.get(p.id)||[])].some(s=>norm(s).includes(norm(term)));
   }).map(p=>p.id);
   const actual=source.products.filter(p=>S.matches(p,term,aliases.get(p.id))).map(p=>p.id);
   assert.deepEqual(actual,expected,'exact name query '+term);
  }
 });
 test(`bilingual display ${id}: both roles, existing draft and finalized snapshot, no record rewrite`,()=>{
  for(const role of ['owner','editor']){
   const h=harness(true);h.run(`peerEnabled=true;peerApi={};peerBase={localId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerViewing=true;member={role:${q(role)}};viewCat=${q(id.split(':')[0])};screen='count';applyQty(${q(id)},'2.5');`);
   const before=h.run('JSON.stringify(draft)');
   for(const html of [h.run('countRows()'),h.run(`blockHtml(${q(id.split(':')[0])})`),h.run('searchHits()')]){
    assert.ok(html.includes('>'+ko+'</b>'),`${id}: visible Korean`);assert.ok(html.includes(zh),`${id}: visible Chinese`);
    for(const alias of hidden)assert.ok(!html.includes(alias),'search-only alias must not be displayed');
   }
   assert.equal(h.run('JSON.stringify(draft)'),before);
   assert.equal(h.run('Core().validate(draft,source)'),true);
   h.run(`buildSample('boss');order.orderStage='finalized';order.quantities[${q(id)}]=2500;query=${q(ko)};`);
   const snapshot=h.run('order.snapshot');
   for(const html of [h.run('searchHits()'),h.run(`blockHtml(${q(id.split(':')[0])})`)]){assert.ok(html.includes('>'+ko+'</b>'));assert.ok(html.includes(zh));}
   assert.equal(h.run('order.snapshot'),snapshot);
   assert.equal(h.run(`JSON.parse(order.snapshot).catalog.find(p=>p.id===${q(id)}).name`),source.products.find(p=>p.id===id).name);
  }
 });
 test(`bilingual lookup ${id}: Chinese, Korean, initials, spacing, legacy and hidden aliases`,()=>{
  const p=source.products.find(p=>p.id===id),old=JSON.stringify(p);
  const terms=[zh,ko,initials(ko),ko.replace(/ /g,''),Array.from(ko).join(' '),p.name,p.alias,...hidden,...(aliases.get(id)||[])].filter(Boolean);
  for(const term of terms){
   assert.ok(S.matches(p,term,aliases.get(id)),id+' must match '+term);
   assert.ok(source.products.filter(row=>S.matches(row,term,aliases.get(row.id))).some(row=>row.id===id));
  }
  assert.equal(S.matches(p,'绝对不存在的商品名-zzzz',aliases.get(id)),false);
  assert.equal(JSON.stringify(p),old);
 });
 test(`bilingual input ${id}: both search panels target same ID and preserve all unrelated quantities`,()=>{
  for(const role of ['owner','editor'])for(const panel of ['count','order'])for(const term of [zh,ko,...hidden]){
   const h=harness(true);h.run(`peerEnabled=true;peerApi={};peerBase={localId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};peerViewing=true;member={role:${q(role)}};viewCat=${q(id.split(':')[0])};screen=${q(panel)};query=${q(term)};`);
   const before=JSON.parse(h.run('JSON.stringify(draft.items)'));
   const cells=h.run(panel==='count'?'countNavigationCells()':'orderNavigationCells()');
   assert.ok(cells.some(c=>c.id===id),'navigation must include queried item '+term);
   h.run(panel==='count'?`openCount(draft.catalog.findIndex(p=>p.id===${q(id)}),'qty')`:`openOrderKey(${q(id)},'qty')`);
   h.handlers.input({target:{value:'12.5',classList:{contains:c=>c==='plain'}}});h.run('closePad()');
   assert.equal(h.run(`qtyOf(${q(id)})`),'12.5');
   assert.equal(h.run(`seen(${q(id)})`),true);
   const after=JSON.parse(h.run('JSON.stringify(draft.items)'));
   for(const other of source.products)if(other.id!==id)assert.deepEqual(after[other.id],before[other.id],other.id+' must not change');
   assert.equal(h.run('Core().validate(draft,source)'),true);
   assert.ok(h.saved.size>0,'input persists locally');
  }
 });
}

test('exactly 32 IDs change display; salted duck egg and remaining 96 products keep their names',()=>{
 const ids=new Set(confirmed.map(r=>r[0]));assert.equal(ids.size,32);
 for(const p of source.products)if(!ids.has(p.id)){assert.equal(Flow.largeName(p),p.name);assert.equal(Flow.smallName(p),p.alias===p.name?'':p.alias||'');}
 const egg=source.products.find(p=>p.id==='cn:84');assert.equal(Flow.largeName(egg),'咸鸭蛋');
 assert.ok(!S.matches(egg,'짠 오리알',aliases.get(egg.id)));
});
test('four requested hidden Korean aliases stay searchable without replacing the display name',()=>{
 assert.deepEqual(confirmed.filter(r=>r.length>3).map(r=>[r[0],r[3]]),[['cn:20','새우살'],['cn:47','넙적분모자'],['cn:60','옥수수콘 소세지'],['cn:75','분사']]);
 for(const [id,zh,ko,alias] of confirmed.filter(r=>r.length>3)){
  const p=source.products.find(p=>p.id===id);assert.equal(Flow.largeName(p),ko);assert.ok(S.matches(p,alias));assert.ok(!Flow.countTitleHtml(p,s=>s).includes(alias));
 }
});
test('all existing search aliases across all 129 items continue to find their original IDs',()=>{
 for(const p of source.products)for(const alias of aliases.get(p.id)||[])assert.ok(S.matches(p,alias,aliases.get(p.id)),p.id+': '+alias);
});
test('PB remains searchable with either Latin case as well as Korean and Chinese',()=>{
 const p=source.products.find(p=>p.id==='other:7');for(const term of ['PB','pb','피비','去油污洗洁剂'])assert.ok(S.matches(p,term,aliases.get(p.id)));
 assert.equal(Flow.largeName(p),'피비');
});
test('cuttlefish ball and the separate large squid fish ball are not conflated',()=>{
 const p=source.products.find(p=>p.id==='cn:63'),other=source.products.find(p=>p.id==='cn:54');
 assert.equal(Flow.largeName(p),'갑오징어완자');assert.equal(Flow.largeName(other),'갑오징어피쉬볼(大)');
 assert.ok(!S.matches(other,'갑오징어완자',aliases.get(other.id)));assert.ok(!S.matches(other,'墨鱼丸',aliases.get(other.id)));
});
test('tofu products, starch noodles and shrimp retain distinct IDs and independent quantities',()=>{
 const groups=[['cn:12','cn:13'],['cn:47','cn:77'],['cn:20','cn:58','cn:64']];
 for(const ids of groups){const d=Core.create(source,'2026-10-25','count-names-distinct');ids.forEach((id,i)=>Core.edit(d,id,'quantity',String(i+1)));ids.forEach((id,i)=>assert.equal(d.items[id].quantity,String(i+1)));assert.equal(new Set(ids.map(id=>Flow.largeName(d.catalog.find(p=>p.id===id)))).size,ids.length);}
});
test('name presentation leaves current draft backup bytes and cloud base comparisons untouched',()=>{
 const h=harness(true);h.run(`peerEnabled=true;member={role:'owner'};peerBase={localId:draft.id,stage:'draft',revision:1,draft:C.clone(draft)};persistLocal();`);
 const before=h.run('JSON.stringify(draft)'),baseBefore=h.run('JSON.stringify(peerBase.draft)'),saved=[...h.saved.entries()];
 for(const [id,zh,ko] of confirmed){h.run(`query=${q(ko)};countRows();searchHits();blockHtml(${q(id.split(':')[0])})`);}
 assert.equal(h.run('JSON.stringify(draft)'),before);assert.deepEqual([...h.saved.entries()],saved);assert.equal(h.run('JSON.stringify(peerBase.draft)'),baseBefore);
});
test('no mapping is applied to unknown IDs or anonymous archived name records',()=>{
 assert.equal(Flow.largeName({id:'unknown',name:'虾丸'}),'虾丸');
 assert.equal(Flow.largeName({name:'虾丸',alias:'虾丸'}),'虾丸');
 assert.equal(Flow.largeName(null),'');assert.equal(Flow.smallName(null),'');
});

test('분사 only finds vermicelli; ㅂㅅ still supports initial-consonant search',()=>{
 const find=term=>source.products.filter(p=>S.matches(p,term,aliases.get(p.id))).map(p=>p.id);
 assert.deepEqual(find('분사'),['cn:75']);
 assert.ok(find('ㅂㅅ').includes('cn:75'));assert.ok(find('ㅂㅅ').includes('cn:34'));
 assert.ok(!find('분사').includes('cn:22'));assert.ok(!find('분사').includes('cn:34'));assert.ok(!find('분사').includes('cn:35'));
});
