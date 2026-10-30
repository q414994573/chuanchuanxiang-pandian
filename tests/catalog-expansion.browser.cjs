'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const prelude=fs.readFileSync(path.join(__dirname,'multi-search.browser.cjs'),'utf8').split('(async()=>{')[0];
const run=String.raw`
(async()=>{
 const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();
 const added=fixture.products.filter(p=>['kr:63','kr:59','kr:60','kr:61','kr:62','cn:85','cn:86','cn:87','cn:88'].includes(p.id));
 try{for(const width of [430,375,320])for(const role of ['owner','editor']){
 const context=await browser.newContext({viewport:{width,height:700},isMobile:true,hasTouch:true});const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',r=>r.request().url()==='https://ccx.invalid/ordering/'?r.fulfill({contentType:'text/html',body:html}):r.abort());await page.goto('https://ccx.invalid/ordering/');
 for(const p of added)await runCase(width+' '+role+' '+p.id+' search, display, units and stock entry',async()=>{
 await reset(page,role,'draft','count','kr');await fill(page,p.name);assert.ok((await ids(page)).includes(p.id));
 const row=page.locator('#rows .line').filter({has:page.locator('[data-id="'+p.id+'"]')});assert.ok((await row.innerText()).includes(p.name));
 await page.locator('[data-act="open"][data-id="'+p.id+'"][data-field="stock"]').click();await key(page,'7');
 const values=await page.evaluate(()=>window.__ccx.values());assert.equal(values.items[p.id].stock,'7');assert.equal(values.items[p.id].unit,p.unit);
 });
 await reset(page,role,'draft','count','kr');await fill(page,'칼국수면 辣椒酱蒜苔甜辣酱大酱酸菜榨菜豆角味精');
 await runCase(width+' '+role+' all nine across categories',async()=>{const found=await ids(page);for(const p of added)assert.ok(found.includes(p.id),p.id);await page.screenshot({path:path.join(outputDir,width+'-'+role+'-eight-products.png'),fullPage:true});});
 await context.close();
 }}finally{await browser.close();}
 report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.length-report.passed;fs.writeFileSync(path.join(outputDir,'catalog-expansion-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({engine:report.engine,passed:report.passed,failed:report.failed,errors:report.errors}));if(report.failed||report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});`;
vm.runInThisContext('(function(require,__filename,__dirname){'+prelude+run+'\n})',{filename:__filename})(require,__filename,__dirname);
