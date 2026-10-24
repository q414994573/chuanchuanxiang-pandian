'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const products=require('../current-order.json').products;
const Search=require('../redesign-preview/search.cjs');
const Flow=require('../redesign-preview/count-flow.cjs');
const confirmed=new Map(require('./confirmed-names.json').map(([id,zh,ko,...hidden])=>[id,{zh,ko,hidden}]));
const aliases=new Map(require('../redesign-preview/aliases.json').items.map(x=>[x.id,x.aliases]));
const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/\s/g,'');

// Expected matches come from the immutable original catalog and separately
// confirmed translations, rather than from the search implementation itself.
function terms(p){
 const c=confirmed.get(p.id);
 return [p.name,p.alias,...(c?[c.zh,c.ko,...c.hidden]:[]),...(aliases.get(p.id)||[])].filter(Boolean);
}
function expected(term){
 const q=norm(term);
 return products.filter(p=>terms(p).some(s=>norm(s).includes(q))).map(p=>p.id);
}
function actual(term){return products.filter(p=>Search.matches(p,term,aliases.get(p.id))).map(p=>p.id);}
function assertResultSet(term,id){
 const got=actual(term);
 assert.ok(got.includes(id),`${id} missing when searching ${term}`);
 assert.deepEqual(got,expected(term),`unrelated result from literal search ${term}`);
}

for(const p of products){
 const original=p.name;
 test(`weekend ${p.id}: exact original name has no initial-consonant false positives`,()=>{
  assert.equal(Flow.largeName(p),original);
  assertResultSet(original,p.id);
  assert.equal(Search.matches(p,original,aliases.get(p.id)),true);
 });
 test(`weekend ${p.id}: leading, trailing and internal spaces preserve search results`,()=>{
  const spaced=Array.from(original).join(' ');
  assert.deepEqual(actual(' \t'+spaced+' \n'),actual(original));
  assert.deepEqual(actual(original+'   '),actual(original));
 });
 test(`weekend ${p.id}: original name is searchable and never rewritten`,()=>{
  assertResultSet(p.name,p.id);
  assert.equal(Flow.largeName(p),p.name);
 });
}

for(const [id,alt] of aliases){
 test(`weekend ${id}: old aliases still find target without literal Hangul false hits`,()=>{
  for(const term of alt){
   assert.ok(actual(term).includes(id),`${id} search failed for ${term}`);
   if(!/[ㄱ-ㅎ]/.test(norm(term)))assert.deepEqual(actual(term),expected(term));
  }
 });
}
