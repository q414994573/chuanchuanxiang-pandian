'use strict';
const ProductNames = require('./product-names.cjs');
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
 const folded=fold(text);
 const needle=fold(query);
 return needle.length>0&&folded.includes(needle);
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
 return `${Number(parts[1])}月${Number(parts[2])}日 订货单\n韩国 ${counts.kr} 样 · 中国 ${counts.cn} 样 · 其他 ${counts.other} 样\n请核对，点链接修改：${url}`;
}
module.exports={norm,fold,matches,typoRisk,supplierText,bossShareText};
