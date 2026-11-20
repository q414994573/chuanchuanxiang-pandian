'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'redesign-preview/preview.js'),'utf8');
const style=fs.readFileSync(path.join(root,'redesign-preview/preview.css'),'utf8');
const store=fs.readFileSync(path.join(root,'cloud/store.js'),'utf8');
const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
const from=(a,b)=>{const first=source.indexOf(a);assert.notEqual(first,-1);const last=source.indexOf(b,first+1);assert.notEqual(last,-1);return source.slice(first,last);};
test('sticky header measures actual banner and adjusts its sticky offset',()=>{
 assert.match(source,/ResizeObserver\(syncBanner\)/);
 assert.match(source,/stickyBanner\.getBoundingClientRect\(\)\.height/);
 assert.match(source,/style\.setProperty\('--banner'/);
 assert.match(style,/\.bar\{position:sticky;top:var\(--banner\)/);
});
test('tab navigation preserves an independent scroll for every module and still validates editors',()=>{
 const code=from('function tryLeave(next){','document.body.addEventListener(\'click\'');
 assert.match(code,/if\(readPlain\(\)===false\)return/);
 assert.match(code,/commitOrderEdit\(\)===false/);
 assert.match(code,/moduleScroll\[departing\]=leavingY/);
 assert.match(code,/window\.scrollTo\(0,moduleScroll\[destination\]\|\|0\)/);
 assert.match(source,/const moduleScroll=\{count:0,order:0,more:0\}/);
});
test('cloud read-only failures are not described as unsaved writes',()=>{
 assert.match(store,/readonly\?'当前断网，暂时无法读取云端订单/);
 for(const f of ['read','list','history','listPage','onDate'])assert.match(store,new RegExp('(?:async function '+f+'\\([^)]*\\)\\{(?:\\n\\s*)?)online\\(true\\)'));
 for(const f of ['create','save','finalize'])assert.match(store,new RegExp('async function '+f+'\\([^)]*\\)\\{[\\s\\S]{0,250}online\\(\\)'));
});
const loader=from('async function loadArchives(){','async function boot(){');
function makeLoader(fetcher,initial=[]){
 const box={fetch:fetcher,archives:initial,archiveNotice:'',screen:'more',morePane:'history',renders:0,render(){box.renders++;}};
 vm.createContext(box);
 vm.runInContext(loader+';this.runLoad=loadArchives;',box);
 return box;
}
test('one broken archive does not erase successfully loaded neighbors',async()=>{
 const b=makeLoader(async url=>url.endsWith('index.json')?{ok:true,json:async()=>({entries:[{date:'a',file:'a.json'},{date:'b',file:'b.json'},{date:'c',file:'c.json'}]})}:url.endsWith('b.json')?{ok:false,status:404}:{ok:true,json:async()=>({products:[{name:url,order:1,unit:'箱'}]})});
 await b.runLoad();
 assert.equal(b.archives.length,2);assert.match(b.archiveNotice,/1 份/);assert.equal(b.renders,1);
});
test('index outage retains previous visible archived orders',async()=>{
 const saved=[{date:'previous',products:[{name:'preserved'}]}];
 const b=makeLoader(async()=>{throw Error('offline');},saved);
 await b.runLoad();
 assert.equal(b.archives.length,1);assert.equal(b.archives[0].date,'previous');
 assert.match(b.archiveNotice,/已保留/);
});
test('README records the current 147-item catalog and does not present v61 as current',()=>{
 assert.match(readme,/147 种商品/);assert.match(readme,/其他 15/);
 assert.doesNotMatch(readme,/## 当前版本 v61/);
});
