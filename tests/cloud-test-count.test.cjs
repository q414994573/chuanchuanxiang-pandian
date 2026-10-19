const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs'),path=require('path'),Core=require('../count-core.js');
const source=require('../current-order.json');
function boot(flags){
 const els=new Map(),mem=new Map(),events={};
 const make=id=>{if(els.has(id))return els.get(id);const el={id,value:'',innerHTML:'',textContent:'',className:'',hidden:false,dataset:{},listeners:{},addEventListener(k,f){this.listeners[k]=f},querySelector(s){return make(s)},querySelectorAll(){return []},scrollIntoView(){},focus(){},click(){}};els.set(id,el);return el;};
 const root=make('countRoot');
 const ctx={...flags,window:{CountCore:Core,addEventListener:(k,f)=>{events[k]=f;}},document:{getElementById:()=>root,createElement(){return make('created');},body:{appendChild(){}},activeElement:null},SOURCE:source,localStorage:{get length(){return mem.size},key:i=>[...mem.keys()][i],getItem:k=>mem.get(k)||null,setItem(k,v){mem.set(k,v)}},navigator:{onLine:true},Intl,Date,Math,JSON,Blob,console,confirm:()=>true,normalize:x=>String(x).toLowerCase(),downloadJSON(){},toast(){},copyText:async()=>{}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../count-app.js'),'utf8'),ctx);
 const click=(action,extra={})=>root.listeners.click({target:{closest:()=>({dataset:{action,...extra}})}});
 const edit=(id,field,value)=>root.listeners.input({target:{tagName:'INPUT',type:'text',dataset:{id,countField:field},value}});
 return {ctx,mem,click,edit,make};
}
test('test page keeps the ordered lines and does not use the live count storage key',()=>{
 const {ctx,mem,click,edit,make}=boot({CCX_CLOUD_TEST:true,CCX_COUNT_STORAGE_PREFIX:'ccx-cloud-test-session:',CCX_COUNT_ACTIVE_KEY:'ccx-cloud-test-active'});
 make('#countDate').value='2026-10-20';
 return click('start').then(()=>{
  edit('cn:5','quantity','2');
  edit('cn:4','quantity','1');
  ctx.window.CountBridge.prepareTestCount();
  const key=[...mem.keys()].find(k=>k.startsWith('ccx-cloud-test-session:')&&!k.endsWith('previous'));
  const saved=JSON.parse(mem.get(key));
  assert.equal(saved.items['cn:5'].decision,'order');
  assert.equal(saved.items['cn:5'].quantity,'2');
  assert.equal(saved.items['cn:5'].stock,'');
  assert.equal(saved.items['cn:4'].quantity,'1');
  assert.equal(saved.items['cn:4'].stock,'');
  assert.equal(saved.catalog.filter(p=>saved.items[p.id].decision==='skip').length,127);
  assert.equal(saved.catalog.filter(p=>saved.items[p.id].stock!=='').length,0);
  assert.match(saved.id,/^count-/);
  assert.equal(mem.has('ccx-count-active'),false);
  assert.equal([...mem.keys()].some(k=>k.startsWith('ccx-count-session:')),false);
 });
});
test('live count page cannot mark the rest skipped',()=>{
 const {ctx,click,edit,make}=boot({});
 make('#countDate').value='2026-10-20';
 return click('start').then(()=>{
  edit('cn:5','quantity','2');
  assert.throws(()=>ctx.window.CountBridge.prepareTestCount(),/仅云端测试页/);
 });
});
