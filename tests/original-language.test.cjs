'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const source=require('../current-order.json');
const Flow=require('../redesign-preview/count-flow.cjs');
const Search=require('../redesign-preview/search.cjs');
const confirmed=new Map(require('./confirmed-names.json').map(([id,zh,ko,...hidden])=>[id,{zh,ko,hidden}]));
const aliases=new Map(require('../redesign-preview/aliases.json').items.map(p=>[p.id,p.aliases]));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

for(const p of source.products){
 test(`v40 original language ${p.id}: original name stays primary in counting and ordering`,()=>{
  const original=p.name,translation=confirmed.get(p.id)?.ko;
  assert.equal(Flow.largeName(p),original);
  assert.equal(Flow.sheetRows([p])[0].large,original);
  assert.ok(Flow.countTitleHtml(p,esc).includes(`${esc(original)}</b>`));
  assert.ok(Flow.boldName(p,esc).includes(`>${esc(original)}</b>`));
  assert.ok(Search.matches(p,original,aliases.get(p.id)));
  if(translation){
   assert.equal(Flow.smallName(p),translation);
   assert.ok(Flow.countTitleHtml(p,esc).includes(`<small>${esc(translation)}`));
   assert.ok(Search.matches(p,translation,aliases.get(p.id)));
  }else{
   const originalAlias=p.alias===p.name?'':p.alias||'';
   assert.equal(Flow.smallName(p),originalAlias);
  }
 });
}

test('v40 originals include Chinese, Korean and original PB; translation is never a primary name',()=>{
 const map=new Map(source.products.map(p=>[p.id,p]));
 for(const [id,name,translated] of [
  ['cn:9','鸡精','치킨스톡'],['cn:12','人造肉','두부피'],
  ['cn:75','粉丝','실당면'],['other:7','pb','피비'],
  ['kr:3','양상추','生菜'],['cn:84','咸鸭蛋','']
 ]){
  assert.equal(Flow.largeName(map.get(id)),name);
  assert.equal(Flow.smallName(map.get(id)),translated);
 }
 const p=map.get('cn:75');
 assert.ok(Search.matches(p,'분사',aliases.get(p.id)));
 assert.equal(Flow.largeName(p),'粉丝');
});
