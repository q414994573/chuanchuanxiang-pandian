'use strict';
// Reuse only fixture definitions, never import/register the older suite's cases.
// Browser localStorage and storage events are real; Firebase remains isolated.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let prelude=fs.readFileSync(path.join(__dirname,'search-progress.browser.cjs'),'utf8').split('(async()=>{')[0];
prelude=prelude.replace("'/tmp/ccx-search-progress'","'/tmp/ccx-resilience-round2'");
prelude=prelude.replace("setup(role='owner',mode='draft'){","setup(role=sessionStorage.getItem('round2-role')||'owner',mode='draft'){sessionStorage.setItem('round2-role',role);");
prelude=prelude.replace('};window.__ccx.setup();',`
 restoreDisk(raw){
  this.setup();localStorage.setItem(KEY,raw);lastLocalRaw=raw;loadLocal();
  peerBase=peerSavedBase;peerLatest=peerBase;render();
 },
 persist(){saveLocalEnvelope();},
 disk(){return localStorage.getItem(KEY);},
 inspect(){return {localConflict,localSaveFailed,localBlocked,cloudConflict,peerConflict,editRaw,keypad,editId,seen:C.clone(draft.seen),deferred:C.clone(draft.deferred||{}),items:C.clone(draft.items)};},
 storageFailure(on){
  if(!this.originalSet)this.originalSet=Storage.prototype.setItem;
  const original=this.originalSet;
  Storage.prototype.setItem=on?function(key,value){if(key===KEY)throw new DOMException('Test storage quota','QuotaExceededError');return original.call(this,key,value);}:original;
 },
 replaceDisk(raw){localStorage.setItem(KEY,raw);},
 stale(id){const record=C.clone(peerBase);record.revision--;record.draft.seen[id]=false;record.draft.items[id].quantity='999';peerReceive(record);},
};
const savedForReload=localStorage.getItem(KEY);
if(savedForReload)window.__ccx.restoreDisk(savedForReload);else window.__ccx.setup();
`);
const cases=String.raw`
(async()=>{
 const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();
 try{
  for(const role of ['owner','editor']){
   const context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   const page=await context.newPage();await route(page);await page.goto('https://ccx.invalid/ordering/');
   const inspect=()=>page.evaluate(()=>window.__ccx.inspect());
   async function fresh(){await page.setViewportSize({width:430,height:932});await setup(page,role);}
   async function input(id,field,keys){await tap(edit(page,id,field));for(const key of keys)await tap(page.locator('[data-act="key"][data-key="'+key+'"]'));await settle(page);}
   try{
    await runCase(role+' reload restores zero stock, fractional quantity and red dots together',async()=>{
     await fresh();await open(page);await search(page,'娃娃菜虾丸');
     await input('kr:31','stock','0');await close(page);await input('cn:64','qty','0.001');await close(page);
     const before=await inspect();await page.reload();await settle(page);await open(page);await search(page,'娃娃菜虾丸');
     const after=await inspect();assert.equal(after.items['kr:31'].stock,'0');assert.equal(after.items['cn:64'].quantity,'0.001');
     assert.deepEqual(after.seen,before.seen);await assertDot(row(page,'kr:31'),true);await assertDot(row(page,'cn:64'),true);
     return {usesBrowserReload:true,valuesAndProgressPreserved:true};
    });
    await runCase(role+' reload retains unfinished decimal and deferred gray dot',async()=>{
     await fresh();await open(page);await search(page,'腐竹虾丸');await input('cn:33','qty','1.');
     await tap(page.locator('[data-act="defer"]'));await settle(page);const before=await inspect();
     assert.equal(before.items['cn:33'].quantity,'1.');assert.equal(before.deferred['cn:33'],true);
     await page.reload();await settle(page);await open(page);await search(page,'腐竹');
     const after=await inspect();assert.equal(after.items['cn:33'].quantity,'1.');assert.equal(after.deferred['cn:33'],true);await assertDot(row(page,'cn:33'),false);
     return {partialDecimalPreserved:true,deferredStillUnfinished:true};
    });
    for(const raw of ['{broken-json',JSON.stringify({draft:{id:'count-wrong-schema',items:{}}})])await runCase(role+' corrupt local draft is retained and write-protected: '+raw,async()=>{
     await fresh();await page.evaluate(raw=>window.__ccx.replaceDisk(raw),raw);await page.reload();await settle(page);
     let actual=await inspect();assert.equal(actual.localBlocked,true);assert.equal(actual.localSaveFailed,true);
     await open(page);await search(page,'虾丸');await input('cn:64','qty','8');
     assert.equal(await page.evaluate(()=>window.__ccx.disk()),raw,'never overwrite unreadable local draft');
     assert.equal((await inspect()).localBlocked,true);return {originalBytesPreserved:true};
    });
    await runCase(role+' storage quota failure recovers continuation and progress after reload',async()=>{
     await fresh();await open(page);await search(page,'虾丸');await page.evaluate(()=>window.__ccx.storageFailure(true));
     try{await input('cn:64','qty','1');assert.equal((await inspect()).localSaveFailed,true);assert.equal((await inspect()).items['cn:64'].quantity,'1');await assertDot(row(page,'cn:64'),true);}
     finally{await page.evaluate(()=>window.__ccx.storageFailure(false));}
     await tap(page.locator('[data-act="key"][data-key="8"]'));await settle(page);assert.equal((await inspect()).localSaveFailed,false);await close(page);
     await page.reload();await settle(page);await open(page);await search(page,'虾丸');assert.equal((await inspect()).items['cn:64'].quantity,'18');await assertDot(row(page,'cn:64'),true);
     return {failedDigitKept:true,recoveryAppends:true,persistedAfterRecovery:true};
    });
    await runCase(role+' repeated portrait landscape changes preserve active selection and edit continuation',async()=>{
     await fresh();await open(page);await search(page,'虾丸');await input('cn:64','qty','1');
     for(const size of [{width:932,height:430},{width:375,height:812},{width:812,height:375},{width:430,height:932}]){
      await page.setViewportSize(size);await settle(page);assert.equal((await inspect()).editId,'cn:64');assert.equal((await inspect()).items['cn:64'].quantity,'1');await layout(page,size.width);
     }
     await tap(page.locator('[data-act="key"][data-key="8"]'));await settle(page);assert.equal((await inspect()).items['cn:64'].quantity,'18');await assertDot(row(page,'cn:64'),true);
     await page.screenshot({path:path.join(output,role+'-rotation.png')});return {rotations:4,valuePreserved:true};
    });
    await runCase(role+' out-of-order peer delivery after reload cannot regress value or progress',async()=>{
     await fresh();await open(page);await search(page,'虾丸');await page.evaluate(()=>window.__ccx.remote('cn:64',true));await settle(page);await page.reload();await settle(page);await open(page);await search(page,'虾丸');
     const before=await inspect();await page.evaluate(()=>window.__ccx.stale('cn:64'));await settle(page);const after=await inspect();
     assert.deepEqual(after.items,before.items);assert.deepEqual(after.seen,before.seen);await assertDot(row(page,'cn:64'),true);return {staleRevisionIgnoredAfterReload:true};
    });
    await runCase(role+' twelve search editor tab roundtrips retain edits and statuses',async()=>{
     await fresh();const expected={};
     for(let i=1;i<=12;i++){
      const id=i%2?'cn:64':'cn:33',name=i%2?'虾丸':'腐竹';await open(page);await search(page,name);await input(id,'qty',String(i));await close(page);expected[id]=String(i);await tap(page.locator('[data-act="cancel-find"]'));await settle(page);
      await tab(page,'count');await tab(page,'order');
     }
     await page.reload();await settle(page);await open(page);await search(page,'腐竹虾丸');const after=await inspect();
     for(const [id,value]of Object.entries(expected)){assert.equal(after.items[id].quantity,value);await assertDot(row(page,id),true);}return {roundtrips:12,persisted:true};
    });
    await runCase(role+' real second-tab storage event protects first-tab saved data',async()=>{
     await fresh();await page.evaluate(()=>window.__ccx.persist());
     const other=await context.newPage();await route(other);await other.goto('https://ccx.invalid/ordering/');await settle(other);
     try{
      await open(page);await search(page,'虾丸');await input('cn:64','qty','8');await close(page);
      await other.waitForFunction(()=>window.__ccx.inspect().localConflict===true);
      const saved=await page.evaluate(()=>window.__ccx.disk());await open(other);await search(other,'虾丸');
      await tap(edit(other,'cn:64','qty'));await tap(other.locator('[data-act="key"][data-key="9"]'));await settle(other);
      assert.equal(await other.evaluate(()=>window.__ccx.disk()),saved);assert.equal(JSON.parse(saved).draft.items['cn:64'].quantity,'8');
      assert.equal((await other.evaluate(()=>window.__ccx.inspect())).localConflict,true);
      return {nativeStorageEvent:true,firstTabWritePreserved:true};
     }finally{await other.close();}
    });
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 report.passed=report.cases.filter(x=>x.pass).length;report.failed=report.cases.length-report.passed;
 fs.writeFileSync(path.join(output,'resilience-round2-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({engine:report.engine,passed:report.passed,failed:report.failed,errors:report.errors}));
 if(report.failed||report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
`;
vm.runInThisContext('(function(require,__filename,__dirname){'+prelude+cases+'\n})',{filename:__filename})(require,__filename,__dirname);
