'use strict';
const ProductNames = require('./product-names.cjs');
const {CATS} = require('./count-flow.cjs');
const {createActivity} = require('./search-activity.cjs');
const CHO='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function norm(s){return String(s??'').normalize('NFKC').toLowerCase().replace(/\s/g,'');}
function fold(s){
 let out='';
 for(const ch of norm(s)){
  const c=ch.codePointAt(0);
  if(c>=0xac00&&c<=0xd7a3) out+=CHO[Math.floor((c-0xac00)/588)];
  else if(c>=0x1100&&c<=0x1112) out+=CHO[c-0x1100];
  else out+=ch;
 }
 return out;
}
function haystack(product,aliases){return [product?.name,product?.alias,...ProductNames.searchNames(product),...(aliases||[])].filter(Boolean).join('\n');}
function matches(product,query,aliases){
 const q=norm(query);
 if(!q) return true;
 const text=haystack(product,aliases);
 if(norm(text).includes(q)) return true;
 // Complete Korean syllables are literal names, not initial-consonant queries.
 // Otherwise 분사 also matches 버섯 and unrelated products containing ㅂㅅ.
 if(/[\uac00-\ud7a3]/.test(q)) return false;
 const folded=fold(text);
 const needle=fold(query);
 return needle.length>0&&folded.includes(needle);
}

// Build once from the entire active catalog, before applying supplier filters.
// Query boundaries are retained: 莲藕、粉耗子 is two searches, while the
// unbroken 莲藕粉耗子 prefers that complete name over its shorter inner names.
const SEPARATORS=/[\s\p{P}\p{S}\p{Cf}]+/u;
function compact(s){return String(s??'').normalize('NFKC').toLowerCase().split(SEPARATORS).join('');}
function createIndex(products,aliasesFor=()=>[]){
 const rows=(products||[]).map(p=>{
  const names=[p.name,p.alias,...ProductNames.searchNames(p),...(aliasesFor(p)||[])].filter(Boolean);
  const text=[...new Set(names.map(compact).filter(Boolean))];
  const initials=[...new Set(text.map(s=>compact(fold(s))))];
  return {id:p.id,text,initials};
 });
 const root={children:new Map()};
 for(const row of rows)for(const term of new Set([...row.text,...row.initials])){
  let node=root;
  for(let i=0;i<term.length;i++){
   if(!node.children.has(term[i]))node.children.set(term[i],{children:new Map()});
   node=node.children.get(term[i]);
  }
  node.term=term;
 }
 return {find(query){
  const raw=String(query??'');
  // A pasted document is not a list of a few products. Bound work without
  // truncating it into a different, apparently valid search.
  if(raw.length>4096)return new Set();
  const parts=raw.normalize('NFKC').toLowerCase().split(SEPARATORS).filter(Boolean);
  const text=parts.join('');
  if(!text)return new Set(rows.map(r=>r.id));
  if(text.length>1024)return new Set();
  const memo=new Map();
  function literal(term){
   if(memo.has(term))return memo.get(term);
   const useInitials=!/[\uac00-\ud7a3]/.test(term),needle=useInitials?compact(fold(term)):'';
   const ids=rows.filter(r=>r.text.some(s=>s.includes(term))||(useInitials&&r.initials.some(s=>s.includes(needle)))).map(r=>r.id);
   memo.set(term,ids);return ids;
  }
  // Preserve the former letter-by-letter spacing tolerance (土 豆 淀 粉).
  // Spaces between complete names still separate requests (土豆 淀粉).
  const spacedLetters=parts.length>1&&parts.every(p=>p.length===1)&&!/[\p{P}\p{S}]/u.test(raw);
  const n=text.length,chunkEnds=new Map(),endsAt=new Array(n),boundary=new Array(n+1).fill(0);
  let offset=0;
  for(const part of parts){
   const end=offset+part.length;chunkEnds.set(offset,end);
   for(let i=offset;i<end;i++)endsAt[i]=end;
   if(end<n&&!spacedLetters)boundary[end]=1;
   offset=end;
  }
  for(let i=1;i<=n;i++)boundary[i]+=boundary[i-1];
  const best=new Array(n+1).fill(null);
  best[n]={score:[0,0,0,0],term:null,next:null,length:0};
  function prefer(a,b){
   if(!b)return true;
   for(let k=0;k<a.score.length;k++)if(a.score[k]!==b.score[k])return a.score[k]<b.score[k];
   return a.length>b.length;
  }
  for(let i=n-1;i>=0;i--){
   function consider(end,term,kind){
    const next=best[end];if(!next)return;
    const length=end-i;
    const score=[next.score[0]+(kind==='unknown'?length:0),next.score[1]+(kind==='partial'?length:0),next.score[2]+boundary[end-1]-boundary[i],next.score[3]+(term?1:0)];
    const option={score,term,next,length};if(prefer(option,best[i]))best[i]=option;
   }
   let node=root;
   for(let end=i;end<n;end++){
    node=node.children.get(text[end]);if(!node)break;
    if(node.term)consider(end+1,node.term,'full');
   }
   // Keep the established partial-name/initials behavior for each explicit
   // word, and for the unfinished last name after a recognized prefix.
   const end=endsAt[i],tail=text.slice(i,end);
   if(literal(tail).length)consider(end,tail,'partial');
   // An unknown separated word must not erase the other requested products.
   // Never mine single-character aliases from inside an unknown word.
   if(chunkEnds.has(i))consider(chunkEnds.get(i),null,'unknown');
  }
  const found=new Set();
  for(let path=best[0];path;path=path.next)if(path.term)for(const id of literal(path.term))found.add(id);
  return new Set(rows.filter(r=>found.has(r.id)).map(r=>r.id));
 }};
}
function typoRisk(current,last){
 const cs=String(current??'').trim(),ls=String(last??'').trim();
 if(!/^\d+(?:\.\d+)?$/.test(cs)||!/^\d+(?:\.\d+)?$/.test(ls)) return false;
 const c=Number(cs),l=Number(ls);
 if(!(c>0)||!(l>0)||!Number.isFinite(c)||!Number.isFinite(l)) return false;
 if(c>=l*8||l>=c*8) return true;
 return cs===ls+'0'||ls===cs+'0';
}
function supplierText(date,rows){
 const parts=String(date||'').split('-');
 const head=`${Number(parts[1])}/${Number(parts[2])} 천천향 주문`;
 return [head,...(rows||[]).map(r=>`${r.name} ${r.qty}${r.unit||''}`)].join('\n');
}
function bossShareText(date,counts,url){
 const parts=String(date||'').split('-');
 const summary=CATS.map(([id,name])=>`${name} ${counts?.[id]??0} 样`).join(' · ');
 return `${Number(parts[1])}月${Number(parts[2])}日 订货单\n${summary}\n请核对，点链接修改：${url}`;
}
module.exports={norm,fold,matches,createIndex,createActivity,typoRisk,supplierText,bossShareText};
