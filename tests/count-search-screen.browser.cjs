'use strict';
// Screen-level regression from the two user screenshots. Reuse fixture setup,
// but assert the requested behavior rather than the former category filtering.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const prelude=fs.readFileSync(path.join(__dirname,'multi-search.browser.cjs'),'utf8').split('(async()=>{')[0];
const run=String.raw`
(async()=>{
 const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();
 try{for(const width of [430,375,320])for(const role of ['owner','editor']){
  const context=await browser.newContext({viewport:{width,height:530},isMobile:true,hasTouch:true,deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/*',async r=>{if(r.request().url()==='https://ccx.invalid/ordering/')await r.fulfill({contentType:'text/html',body:html});else{report.errors.push('Unexpected request '+r.request().url());await r.abort();}});
  try{
   await page.goto('https://ccx.invalid/ordering/');
   await runCase(width+'px '+role+' screenshot query exposes all three rows in a keyboard-sized viewport',async()=>{
    await reset(page,role,'draft','count','kr');await page.locator('#find').evaluate(el=>{window.originalFind=el;});await fill(page,'大葱腐竹粉丝');
    assert.deepEqual(await ids(page),['kr:7','cn:33','cn:75']);
    const info=await page.evaluate(()=>({retained:document.querySelector('#find')===window.originalFind,active:document.activeElement.id,rows:[...document.querySelectorAll('#rows .line')].map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}),viewport:innerHeight,bar:document.querySelector('.bar').getBoundingClientRect().bottom}));
    assert.equal(info.retained,true);assert.equal(info.active,'find');assert.ok(info.rows[0].top>=info.bar-1);assert.ok(info.rows.at(-1).bottom<=info.viewport-4,JSON.stringify(info));
    assert.equal(await page.locator('[data-act="jumpcat"]').first().isVisible(),false);assert.equal(await page.locator('[data-act="next-gap"]').isVisible(),false);
    assert.equal(await page.locator('.search-result-note').innerText(),'搜到 3 种商品 · 全部分类');
    await page.screenshot({path:path.join(outputDir,width+'-'+role+'-count-search.png')});
    await page.locator('[data-act="clear-find"]').click();await settle(page);assert.equal((await page.evaluate(()=>window.__ccx.state())).query,'');assert.equal(await page.locator('[data-act="jumpcat"]').first().isVisible(),true);assert.equal((await ids(page)).length,49);
    return {query:'大葱腐竹粉丝',expectedIds:['kr:7','cn:33','cn:75'],viewportHeight:530,inputRetained:true,allThreeOnScreen:true};
   });
  }finally{await context.close();}
 }}finally{await browser.close();}
 report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.length-report.passed;fs.writeFileSync(path.join(outputDir,'count-search-screen-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({engine:report.engine,passed:report.passed,failed:report.failed,errors:report.errors}));if(report.failed||report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});`;
vm.runInThisContext('(function(require,__filename,__dirname){'+prelude+run+'\n})',{filename:__filename})(require,__filename,__dirname);
