'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let prelude=fs.readFileSync(path.join(__dirname,'multi-search.browser.cjs'),'utf8').split('(async()=>{')[0];
const labels=Object.fromEntries(require('../current-order.json').products.map(p=>[p.id,require('../redesign-preview/product-names.cjs').small(p)]));
prelude=prelude.replace('state(){return {screen,',`show(which,cat){screen=which;viewCat=orderCat=cat;query='';orderSearchOpen=false;render();},state(){return {screen,`);
const run=String.raw`
(async()=>{const expected=LABELS;const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();try{
for(const width of [430,375,320])for(const role of ['owner','editor'])for(const mode of ['draft','finalized']){
 const context=await browser.newContext({viewport:{width,height:700},isMobile:true,hasTouch:true});const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));await page.route('**/*',r=>r.request().url()==='https://ccx.invalid/ordering/'?r.fulfill({contentType:'text/html',body:html}):r.abort());await page.goto('https://ccx.invalid/ordering/');await page.evaluate(({role,mode})=>window.__ccx.setup(role,mode),{role,mode});const before=await page.evaluate(()=>window.__ccx.values());
 for(const cat of ['kr','cn','other','drinks']){
  const texts={};for(const screen of ['count','order']){await page.evaluate(({screen,cat})=>window.__ccx.show(screen,cat),{screen,cat});texts[screen]=await page.locator('#rows').evaluate(el=>[...el.querySelectorAll('.line,.order')].map(row=>({id:row.dataset.id||row.querySelector('[data-id]')?.dataset.id,text:row.innerText})));}
  for(const row of texts.count)await runCase(width+' '+role+' '+mode+' '+row.id+' bilingual count/order agreement',async()=>{const p=fixture.products.find(p=>p.id===row.id),other=texts.order.find(r=>r.id===row.id);assert.ok(p);assert.ok(other);assert.ok(row.text.includes(p.name));assert.ok(other.text.includes(p.name));assert.ok(expected[p.id]);assert.ok(row.text.includes(expected[p.id]));assert.ok(other.text.includes(expected[p.id]));assert.ok(other.text.includes(p.unit||''));});
  await runCase(width+' '+role+' '+mode+' '+cat+' complete rows and no overflow',async()=>{assert.equal(texts.count.length,fixture.products.filter(p=>(['other:18','other:19','other:20','other:21','other:22'].includes(p.id)?'drinks':p.cat)===cat).length);assert.equal(texts.order.length,texts.count.length);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));});
 }
 const after=await page.evaluate(()=>window.__ccx.values());await runCase(width+' '+role+' '+mode+' display leaves all quantities and snapshots unchanged',async()=>{assert.deepEqual(after,before);assert.equal(after.items['cn:42'].stockUnit,'단');assert.equal(after.items['cn:42'].unit,'포대');assert.equal(after.items['other:23'].unit,'박스');assert.equal(after.items['other:24'].unit,'박스');});
 if(width===375&&role==='owner'&&mode==='finalized'){await page.screenshot({path:path.join(outputDir,'bilingual-order.png'),fullPage:true});}
 await context.close();
}
}finally{await browser.close();}
report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.length-report.passed;fs.writeFileSync(path.join(outputDir,'bilingual-consistency-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({engine:report.engine,passed:report.passed,failed:report.failed,errors:report.errors}));if(report.failed||report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});`;
vm.runInThisContext('(function(require,__filename,__dirname){'+prelude+run.replace('LABELS',JSON.stringify(labels))+'\n})',{filename:__filename})(require,__filename,__dirname);
