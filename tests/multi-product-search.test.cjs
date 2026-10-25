'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('../count-core.js');
const source=require('../current-order.json');
const Search=require('../redesign-preview/search.cjs');
const Names=require('../redesign-preview/product-names.cjs');
const aliases=new Map(require('../redesign-preview/aliases.json').items.map(x=>[x.id,x.aliases]));
const products=source.products;
const index=Search.createIndex(products,p=>aliases.get(p.id));
const find=q=>[...index.find(q)];
const oldFind=q=>products.filter(p=>Search.matches(p,q,aliases.get(p.id))).map(p=>p.id);
const union=(...queries)=>products.filter(p=>queries.some(q=>oldFind(q).includes(p.id))).map(p=>p.id);
const three=['kr:7','cn:33','cn:64'],five=[...three,'other:8','other:22'];

for(const separator of ['',',','，','、',' ','  ','\t','\n',';','；','/','\\','|','·','—','。','：','+','&','😀']){
 test(`multiple complete names separated by ${JSON.stringify(separator)} return the same three products`,()=>{
  assert.deepEqual(find(['大葱','腐竹','虾丸'].join(separator)),three);
 });
}

test('five continuous names cover all four suppliers in catalog order, independent of input order',()=>{
 assert.deepEqual(find('大葱腐竹虾丸竹签芬达'),five);
 assert.deepEqual(find('芬达虾丸竹签腐竹大葱'),five);
 assert.deepEqual(find('【芬达】（虾丸）/竹签，腐竹；大葱'),five);
});
test('duplicates and synonymous Chinese/Korean queries never duplicate result rows',()=>{
 assert.deepEqual(find('大葱腐竹大葱푸주虾丸새우완자'),three);
});
test('Chinese, Korean, English aliases, and Korean initials combine without server translation',()=>{
 for(const q of ['대파푸주새우완자','大葱푸주虾丸','ㄷㅍㅍㅈㅅㅇㅇㅈ','ㄷㅍ / ㅍㅈ / ㅅㅇㅇㅈ'])assert.deepEqual(find(q),three,q);
 assert.deepEqual(find('大葱푸주虾丸ＰＢ芬达'),[...three,'other:7','other:22']);
});
test('nested complete names are not mined for unrelated short aliases',()=>{
 assert.deepEqual(find('莲藕粉耗子'),['cn:45']);
 assert.deepEqual(find('土豆淀粉'),['cn:16']);
 assert.deepEqual(find('木棉豆腐'),['cn:55']);
 assert.deepEqual(find('玉米肠虾丸'),['cn:60','cn:64']);
 assert.deepEqual(find('土豆淀粉莲藕粉耗子木棉豆腐'),['cn:16','cn:45','cn:55']);
});
test('explicit complete-word boundaries distinguish a compound from two separate requests',()=>{
 const expected=union('莲藕','粉耗子');
 for(const q of ['莲藕、粉耗子','莲藕 粉耗子','莲藕,粉耗子'])assert.deepEqual(find(q),expected);
 assert.deepEqual(find('土豆、淀粉'),union('土豆','淀粉'));
 assert.deepEqual(find('芝麻、油豆腐'),union('芝麻','油豆腐'));
 assert.deepEqual(find('芝麻油、豆腐'),union('芝麻油','豆腐'));
});
test('ambiguous unseparated names have a stable longer-name tie break',()=>{
 assert.deepEqual(find('芝麻油豆腐'),union('芝麻油','豆腐'));
 assert.notDeepEqual(find('芝麻油豆腐'),find('芝麻、油豆腐'));
});
test('existing partial searches stay broad, also when separated from other products',()=>{
 for(const q of ['土豆','豆腐','粉耗子','辣椒粉','虾','葱','粉','PB','zero'])assert.deepEqual(find(q),oldFind(q),q);
 assert.deepEqual(find('葱、腐竹、虾丸'),union('葱','腐竹','虾丸'));
 assert.deepEqual(find('大葱腐'),union('大葱','腐'),'unfinished final name remains searchable while typing');
});
test('complete Hangul syllables never become unrelated initial-consonant searches',()=>{
 assert.deepEqual(find('분사'),['cn:75']);
 assert.deepEqual(find('분사腐竹'),['cn:33','cn:75']);
 assert.deepEqual(find('갑오징어완자'),['cn:63']);
 assert.deepEqual(find('갑오징어완자大葱'),['kr:7','cn:63']);
});
test('punctuation and spacing inside real catalog names do not corrupt multi-product input',()=>{
 const cases=[['매운 고춧가루','cn:7'],['소스 1호','other:15'],['맛소금（2kg）','kr:25'],['(zero)코카콜라','other:21'],['대나무 꼬치 (길이18cm·지름2.5mm)','other:8']];
 for(const [q,id] of cases){
  assert.deepEqual(find(q),[id],q);
  assert.deepEqual(find(q+'腐竹'),products.filter(p=>['cn:33',id].includes(p.id)).map(p=>p.id),q+' joined');
  assert.deepEqual(find(q+'、腐竹'),products.filter(p=>['cn:33',id].includes(p.id)).map(p=>p.id),q+' separated');
 }
});
test('unknown separated words retain known products without extracting aliases from unknown words',()=>{
 assert.deepEqual(find('大葱、完全不存在的商品、腐竹'),['kr:7','cn:33']);
 for(const q of ['不存在米','abcdef虾xyz','未知虾丸词','绝对不存在的商品名-zzzz'])assert.deepEqual(find(q),[],q);
});
test('empty and separators-only input behaves as empty search',()=>{
 for(const q of ['',null,undefined,'  \n\t','，、 /；'])assert.deepEqual(find(q),products.map(p=>p.id));
});
test('oversized input is rejected as a whole instead of silently truncating to a different product',()=>{
 assert.deepEqual(find('大葱'.repeat(513)),[]);
 assert.deepEqual(find(' '.repeat(4097)+'大葱'),[]);
 assert.deepEqual(find('大葱'.repeat(512)),['kr:7']);
 assert.deepEqual(find('x'.repeat(1024)),[]);
});
test('index creation and repeated searching do not modify any catalog or alias data',()=>{
 const before=JSON.stringify([products,[...aliases]]);
 for(const q of ['大葱腐竹虾丸','대파푸주','，','莲藕粉耗子','木棉豆腐'])find(q);
 assert.equal(JSON.stringify([products,[...aliases]]),before);
});

// These checks exercise the new catalog-aware engine, not just the legacy
// single-product function covered by the existing catalog tests.
for(const p of products){
 test(`multi-search preserves every existing name, alias and character-spaced form for ${p.id}`,()=>{
  const terms=[...new Set([p.name,p.alias,...Names.searchNames(p),...(aliases.get(p.id)||[])].filter(Boolean))];
  for(const term of terms){
   const expected=oldFind(term);
   assert.deepEqual(find(term),expected,term);
   assert.deepEqual(find(' \t'+term+' \n'),expected,'trimmed '+term);
   assert.deepEqual(find(Array.from(term).join(' ')),expected,'character-spaced '+term);
  }
 });
}

const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const body=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${body};return harness;`)(require,Core,source);
function ready(role){
 const h=harness(true);
 h.run(`aliasById=new Map(${JSON.stringify([...aliases])});releaseLocked=false;peerEnabled=true;peerViewing=true;member={role:'${role}'};user={uid:'test-${role}'};screen='order';query='大葱腐竹虾丸竹签芬达';`);
 return h;
}
for(const role of ['owner','editor']){
 test(`shared ${role}: matching rows, category counts and navigation use the same five-product result`,()=>{
  const h=ready(role),before=h.run('JSON.stringify([draft,order])');
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(catalog().filter(matchesSearch).map(p=>p.id))')),five);
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(Flow.searchHitCounts(catalog(),matchesSearch))')),{kr:1,cn:2,other:1,drinks:1});
  assert.deepEqual([...new Set(JSON.parse(h.run('JSON.stringify(orderNavigationCells().map(c=>c.id))')))],five);
  for(const [cat,expected] of [['kr',['kr:7']],['cn',['cn:33','cn:64']],['other',['other:8']],['drinks',['other:22']]]){
   h.run(`screen='count';viewCat='${cat}'`);
   assert.deepEqual([...new Set(JSON.parse(h.run('JSON.stringify(countNavigationCells().map(c=>c.id))')))],expected);
  }
  h.run(`viewCat='cn';followSearchCat()`);assert.equal(h.run('viewCat'),'cn');
  h.run(`query='大葱';followSearchCat()`);assert.equal(h.run('viewCat'),'kr');
  assert.equal(h.run('JSON.stringify([draft,order])'),before);
 });
 test(`shared ${role}: cached results invalidate on query, aliases, draft and order replacement`,()=>{
  const h=ready(role);
  h.run(`catalog().filter(matchesSearch);query='大葱';`);
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(catalog().filter(matchesSearch).map(p=>p.id))')),['kr:7']);
  h.run(`query='测试专用别名';catalog().filter(matchesSearch);aliasById=new Map(aliasById);aliasById.set('kr:7',['测试专用别名']);`);
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(catalog().filter(matchesSearch).map(p=>p.id))')),['kr:7']);
  h.run(`draft.catalog=draft.catalog.filter(p=>p.id!=='kr:7');`);
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(catalog().filter(matchesSearch).map(p=>p.id))')),[]);
  h.run(`buildSample('boss');query='大葱';catalog().filter(matchesSearch);globalThis.nextSnapshot=JSON.parse(order.snapshot);nextSnapshot.catalog=nextSnapshot.catalog.filter(p=>p.id!=='kr:7');order.snapshot=JSON.stringify(nextSnapshot);`);
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(catalog().filter(matchesSearch).map(p=>p.id))')),[]);
 });
}
