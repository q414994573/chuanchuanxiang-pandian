'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let prelude=fs.readFileSync(path.join(__dirname,'multi-search.browser.cjs'),'utf8').split('(async()=>{')[0];
prelude=prelude.replace('state(){return {screen,','legacy(){draft.catalog.find(p=>p.id===\'kr:59\').name=\'고추장(2kg)\';if(order)order.snapshot=JSON.stringify(draft);render();},state(){return {screen,');
const run=String.raw`
(async()=>{const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();try{
 for(const width of [430,375,320])for(const role of ['owner','editor'])for(const mode of ['draft','finalized']){
 const context=await browser.newContext({viewport:{width,height:700},isMobile:true,hasTouch:true});const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));await page.route('**/*',r=>r.request().url()==='https://ccx.invalid/ordering/'?r.fulfill({contentType:'text/html',body:html}):r.abort());await page.goto('https://ccx.invalid/ordering/');
 await runCase(width+' '+role+' '+mode+' corrected pack name in legacy snapshot search and export',async()=>{
 await reset(page,role,mode,'order','kr');await page.evaluate(()=>window.__ccx.legacy());const before=await page.evaluate(()=>window.__ccx.values());
 await fill(page,'고추장(1kg)');assert.deepEqual(await ids(page),['kr:59']);const text=await page.locator('#rows').innerText();assert.ok(text.includes('고추장(1kg)'));assert.ok(!text.includes('고추장(2kg)'));
 const block=await page.evaluate(()=>window.__ccx.block('kr'));assert.ok(block.includes('고추장(1kg)'));assert.ok(!block.includes('고추장(2kg)'));const after=await page.evaluate(()=>window.__ccx.values());assert.deepEqual(after.items,before.items);if(mode==='finalized')assert.equal(after.order.snapshot,before.order.snapshot);
 });await context.close();}
 }finally{await browser.close();}report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.length-report.passed;fs.writeFileSync(path.join(outputDir,'catalog-name-correction-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({engine:report.engine,passed:report.passed,failed:report.failed,errors:report.errors}));if(report.failed||report.errors.length)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});`;
vm.runInThisContext('(function(require,__filename,__dirname){'+prelude+run+'\n})',{filename:__filename})(require,__filename,__dirname);
