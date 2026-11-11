'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let prelude=fs.readFileSync(path.join(__dirname,'mobile-workflow.browser.cjs'),'utf8').split('(async()=>{\n const browser=')[0];
prelude=prelude.replace(' state(){return {screen,',String.raw`
 quotaSetup(role,mode){
  this.setup(role,'draft');screen='more';saveLocalEnvelope();
  let head=C.clone(peerBase);this.archives=[];this.newCalls=0;
  peerApi.read=async()=>C.clone(head);
  peerApi.newBlank=async(next,base)=>{this.newCalls++;this.archives.push(C.clone(head));head={localId:next.id,revision:head.revision+1,stage:'draft',date:next.date,draft:C.clone(next)};return C.clone(head);};
  window.confirm=()=>true;
  if(mode==='native-full'){
   let i=0;for(const size of [262144,4096,256]){while(true){try{localStorage.setItem('quota-fixture-'+i,'x'.repeat(size));i++;}catch(e){if(e.name!=='QuotaExceededError')throw e;break;}}}
   this.quotaName='';try{localStorage.setItem('extra-backup-probe',JSON.stringify({draft,pos,field,peerBase}));}catch(e){this.quotaName=e.name;}
  }else{
   const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(mode==='all-writes'||k.includes(':before-shared:'))throw new DOMException('The quota has been exceeded.','QuotaExceededError');return original.call(this,k,v);};
  }
  render();
 },
 quotaState(){return {calls:this.newCalls,archives:this.archives.length,quotaName:this.quotaName,failed:localSaveFailed,id:draft.id,saved:JSON.parse(localStorage.getItem(KEY)).draft.id,blank:draft.catalog.every(p=>!draft.items[p.id].stock&&!draft.items[p.id].quantity),conflict:cloudConflict};},
 state(){return {screen,`);
const run=String.raw`
(async()=>{
 const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();
 try{for(const role of ['owner','editor'])for(const mode of ['native-full','snapshot-writes','all-writes']){
  const context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/*',r=>r.request().url()==='https://ccx.invalid/ordering/'?r.fulfill({contentType:'text/html',body:html}):r.abort());await page.goto('https://ccx.invalid/ordering/');
  await runCase(role+' '+mode+' new blank via visible button',async()=>{
   await page.evaluate(({role,mode})=>window.__ccx.quotaSetup(role,mode),{role,mode});await page.locator('[data-act="new-blank"]').click();
   await page.waitForFunction(()=>window.__ccx.quotaState().calls===1);await settle(page);
   const state=await page.evaluate(()=>window.__ccx.quotaState()),toast=await page.locator('#toast').innerText();assert.equal(state.archives,1);
   if(mode==='all-writes'){assert.equal(state.failed,true);assert.ok(toast.includes('云端已新建'));assert.ok(toast.includes('本机保存失败'));assert.ok(!toast.includes('已打开新的共同盘货'));}
   else{assert.equal(state.failed,false);assert.equal(state.id,state.saved);assert.equal(state.blank,true);assert.ok(toast.includes('已打开新的共同盘货'));if(mode==='native-full')assert.equal(state.quotaName,'QuotaExceededError');}
  });await context.close();
 }}finally{await browser.close();}
 report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.length-report.passed;fs.writeFileSync(path.join(outputDir,'storage-quota-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({engine:report.engine,passed:report.passed,failed:report.failed,errors:report.errors}));if(report.failed||report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});`;
vm.runInThisContext('(function(require,__filename,__dirname){'+prelude+run+'\n})',{filename:__filename})(require,__filename,__dirname);
