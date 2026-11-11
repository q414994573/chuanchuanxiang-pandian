'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let prelude=fs.readFileSync(path.join(__dirname,'mobile-workflow.browser.cjs'),'utf8').split('(async()=>{\n const browser=')[0];
prelude=prelude.replace(' state(){return {screen,',String.raw`
 cleanupSetup(role,mode){
  this.setup(role,'draft');screen='more';saveLocalEnvelope();storagePlan=null;storageNotice='';moreSections.storage=true;
  const duplicate=JSON.stringify({draft}),old=Core().create(source,'2026-11-01','count-safe-old'),unique=Core().create(source,'2026-11-02','count-unique-old');
  unique.items['kr:7'].quantity='9';
  this.cleanupOriginal=localStorage.getItem(KEY);this.cleanupCalls=0;
  localStorage.setItem(KEY+':before-shared:1',duplicate);
  localStorage.setItem(KEY+':before-shared:2',JSON.stringify({draft:old}));
  localStorage.setItem(KEY+':before-shared:3',JSON.stringify({draft:unique}));
  localStorage.setItem(KEY+':recovery:4','damaged record');
  localStorage.setItem('firebase:authUser:fixture','keep-login');
  localStorage.setItem('unrelated-site-data','keep-other');
  localStorage.setItem(KEY+':feedback','keep-preferences');
  peerApi.archive=async id=>{this.cleanupCalls++;if(mode==='offline'||id!=='count-safe-old')throw Error('not found or offline');return {localId:old.id,draft:C.clone(old)};};
  window.confirm=()=>mode!=='cancel';
  if(mode==='full'){
   let i=0;for(const size of [262144,4096,256]){while(true){try{localStorage.setItem('quota-fixture-'+i,'x'.repeat(size));i++;}catch(e){if(e.name!=='QuotaExceededError')throw e;break;}}}
   this.fullConfirmed=false;try{localStorage.setItem('extra-quota-probe','x'.repeat(65536));}catch(e){this.fullConfirmed=e.name==='QuotaExceededError';}
  }
  render();
 },
 cleanupChange(){localStorage.setItem(KEY,JSON.stringify({draft,changed:true}));},
 cleanupState(){return {plan:storagePlan?Entry.storageCleanup.summary(storagePlan):null,notice:storageNotice,full:this.fullConfirmed,calls:this.cleanupCalls,activeSame:localStorage.getItem(KEY)===this.cleanupOriginal,duplicate:localStorage.getItem(KEY+':before-shared:1'),archived:localStorage.getItem(KEY+':before-shared:2'),unique:localStorage.getItem(KEY+':before-shared:3'),damaged:localStorage.getItem(KEY+':recovery:4'),auth:localStorage.getItem('firebase:authUser:fixture'),prefs:localStorage.getItem(KEY+':feedback'),other:localStorage.getItem('unrelated-site-data')};},
 state(){return {screen,`);
const run=String.raw`
(async()=>{
 const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();
 try{for(const role of ['owner','editor'])for(const mode of ['clean','cancel','full','changed','offline']){
  const context=await browser.newContext({viewport:{width:mode==='clean'?320:430,height:932},isMobile:true,hasTouch:true});const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/*',r=>r.request().url()==='https://ccx.invalid/ordering/'?r.fulfill({contentType:'text/html',body:html}):r.abort());await page.goto('https://ccx.invalid/ordering/');
  await runCase(role+' '+mode+' safe cleanup with actual visible buttons',async()=>{
   await page.evaluate(({role,mode})=>window.__ccx.cleanupSetup(role,mode),{role,mode});
   await page.locator('[data-act="storage-inspect"]').click();await page.waitForFunction(()=>window.__ccx.cleanupState().plan!==null);await settle(page);
   const before=await page.evaluate(()=>window.__ccx.cleanupState());assert.equal(before.plan.removable,mode==='offline'?1:2);assert.ok(before.duplicate);assert.ok(before.archived);
   if(mode==='full')assert.equal(before.full,true);
   if(mode==='changed')await page.evaluate(()=>window.__ccx.cleanupChange());
   await page.locator('[data-act="storage-clean"]').click();await settle(page);
   const state=await page.evaluate(()=>window.__ccx.cleanupState());
   if(mode==='cancel'||mode==='changed'){assert.ok(state.duplicate);assert.ok(state.archived);if(mode==='changed')assert.match(await page.locator('#toast').innerText(),/已变化/);}
   else{assert.equal(state.duplicate,null);assert.equal(state.archived===null,mode!=='offline');assert.match(state.notice,mode==='offline'?/已清理 1/:/已清理 2/);}
   if(mode!=='changed')assert.equal(state.activeSame,true);
   assert.ok(state.unique.includes('count-unique-old'));assert.equal(state.damaged,'damaged record');assert.equal(state.auth,'keep-login');assert.equal(state.prefs,'keep-preferences');assert.equal(state.other,'keep-other');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
   if(mode==='clean')await page.screenshot({path:path.join(outputDir,role+'-cleanup.png'),fullPage:true});
  });await context.close();
 }}finally{await browser.close();}
 report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.length-report.passed;fs.writeFileSync(path.join(outputDir,'storage-cleanup-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({engine:report.engine,passed:report.passed,failed:report.failed,errors:report.errors}));if(report.failed||report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});`;
vm.runInThisContext('(function(require,__filename,__dirname){'+prelude+run+'\n})',{filename:__filename})(require,__filename,__dirname);
