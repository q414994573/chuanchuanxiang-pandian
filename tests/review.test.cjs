const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];const data=JSON.parse(scripts.find(x=>x[1].includes('embedded-data'))[2]);
const elements=new Map();let doc;function el(id){if(elements.has(id))return elements.get(id);const classes=new Set();const e={id,tagName:'DIV',dataset:{},style:{},value:'',hidden:false,innerHTML:'',textContent:'',inert:false,listeners:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle:(c,b)=>b?classes.add(c):classes.delete(c)},setAttribute(){},addEventListener(k,f){(this.listeners[k]??=[]).push(f)},fire(k,event={}){for(const f of this.listeners[k]||[])f(event)},focus(){doc.activeElement=this},scrollIntoView(){},appendChild(){},click(){},remove(){},querySelectorAll(){return []},getClientRects(){return [1]}};elements.set(id,e);return e;}
const quick=['kr','cn','other','all','star','ordered','stocked'].map(x=>{const e=el('quick-'+x);e.dataset.quick=x;return e});const cat=['all','kr','cn','other'].map(x=>{let e=el('cat-'+x);e.dataset.cat=x;return e});const sub=['all','star','stocked'].map(x=>{let e=el('sub-'+x);e.dataset.sub=x;return e});
doc={querySelector:s=>el(s),querySelectorAll:s=>s==='#searchQuick [data-quick]'?quick:s==='#catButtons .filter'?cat:s==='#subButtons .filter'?sub:[],getElementById:id=>({textContent:JSON.stringify(data)}),createElement:t=>el('new-'+t),body:{children:[el('main'),el('#searchOverlay')],style:{},classList:el('body').classList,appendChild(){}},addEventListener(){}};
const mem=new Map();const ctx={document:doc,localStorage:{getItem:k=>mem.get(k),setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)},window:{scrollY:540,scrollTo(o){this.lastScroll=o.top}},location:{protocol:'file:',hash:'',search:''},navigator:{},Intl,Date,URLSearchParams,console,setTimeout:()=>{},matchMedia:()=>({matches:true}),fetch:async()=>{throw Error('offline test')},confirm:()=>true,Blob,URL};vm.createContext(ctx);for(const s of scripts.filter(s=>!s[1].includes('embedded-data')&&!s[1].includes('src=')))vm.runInContext(s[2],ctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../workspace-ui.js'),'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx);
assert.equal(data.products.length,129);assert.equal(data.products.filter(p=>p.star).length,0);
assert.equal((el('#allRows').innerHTML.match(/class="product-record"/g)||[]).length,129);
assert(!el('body').classList.contains('card-layout'));el('#cardMode').fire('click');assert(el('body').classList.contains('card-layout'));el('#compactMode').fire('click');assert(!el('body').classList.contains('card-layout'));
el('#find').fire('click');assert(el('#searchOverlay').classList.contains('open'));el('#searchEntry').value='고수';el('#searchEntry').fire('input');assert(el('#searchMatches').innerHTML.includes('고수'));el('#searchGo').fire('click');assert(!el('#searchOverlay').classList.contains('open'));assert.equal(ctx.window.lastScroll,540);assert(mem.get('ccx-search-history-v1').includes('고수'));el('#find').fire('click');quick[0].fire('click');assert.equal(run('itemsFiltered().length'),45);

assert(!el('#allRows').innerHTML.includes('data-review'));assert(!el('#allRows').innerHTML.includes('★'));
const positive=list=>list.filter(p=>typeof p.order==='number'&&p.order>0);
assert.equal(data.products.filter(p=>p.cat==='kr').length,45);
assert.equal(data.products.filter(p=>p.cat==='cn').length,66);
assert.equal(data.products.filter(p=>p.cat==='other').length,18);
assert.equal(positive(data.products).length,29);
assert.equal(positive(data.products.filter(p=>p.cat==='kr')).length,11);
assert.equal(positive(data.products.filter(p=>p.cat==='cn')).length,18);
assert.equal(positive(data.products.filter(p=>p.cat==='other')).length,0);
const summary=el('#orderDate').textContent;
assert.equal(summary,`订单日期：${data.date} · 共29种有订货（韩国食品11种，中国食品18种，其他商品0种）。某类为0表示该类没有大于0的订货。空白不等于0，也不等于已确认不订。`);
const flipped=run(`(()=>{const p=P.find(x=>x.id==='other:3');p.order=2;renderStats();const up=document.querySelector('#orderDate').textContent;p.order=0;renderStats();const zero=document.querySelector('#orderDate').textContent;p.order=null;renderStats();return {up,zero,back:document.querySelector('#orderDate').textContent};})()`);
assert.match(flipped.up,/其他商品1种/);assert.match(flipped.up,/共30种/);assert.match(flipped.zero,/其他商品0种/);assert.match(flipped.zero,/共29种/);assert.equal(flipped.back,summary);
assert(!html.includes('本网站仅展示已同步数据'));assert(!html.includes('其他商品本次无已填订货量'));assert(!html.includes('查看旧网站备份'));assert(!html.includes('已同步的本次订货明细'));
console.log('PASS: archive page initialization, 129 products, no star/review controls, layout, search, and computed category order summary.');
