'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const playwright=require(process.env.CCX_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=process.env.CCX_BROWSER_OUTPUT||path.join(root,'test-output/splash');fs.mkdirSync(output,{recursive:true});
const report={engine:process.env.CCX_BROWSER_ENGINE||'chromium',cases:[],errors:[]};
const html=fs.readFileSync(path.join(root,'ordering/index.html'),'utf8');
(async()=>{
 const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();
 try{for(const width of [320,390,430])for(const mode of ['ready','slow-app','failed-image','slow-image','missing-script','reduced-motion','return']){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:mode==='reduced-motion'?'reduce':'no-preference'}),page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/ordering/')return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname==='/ordering/splash.js')return route.fulfill({contentType:'text/javascript',body:mode==='missing-script'?'':fs.readFileSync(path.join(root,'ordering/splash.js'),'utf8')});
   if(url.pathname.endsWith('welcome-v63.png')){
    if(mode==='failed-image')return route.abort();
    if(mode==='slow-image'){await new Promise(r=>setTimeout(r,1700));}
    return route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'ordering/assets/welcome-v63.png'))});
   }
   if(url.pathname.endsWith('preview.bundle.js'))return route.fulfill({contentType:'text/javascript',body:`localStorage.setItem('splash-test-order','unchanged');setTimeout(()=>{document.getElementById('app').innerHTML='<button id="fixture-action">测试盘货按钮</button>';document.getElementById('fixture-action').onclick=()=>window.clicked=true;},${mode==='slow-app'?1800:100});`});
   return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:''});
  });
  try{
   await page.goto('https://ccx.invalid/ordering/',{waitUntil:'domcontentloaded'});
   if(mode==='ready'){
    await page.waitForFunction(()=>document.querySelector('#ccx-welcome')?.classList.contains('art-ready'));
    const box=await page.locator('#ccx-welcome').boundingBox();assert.equal(box.width,width);assert.equal(box.height,844);
    assert.equal(await page.locator('#ccx-welcome').getAttribute('aria-hidden'),'true');
    if(width===390)await page.screenshot({path:path.join(output,'welcome.png')});
   }
   if(mode==='return')await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   await page.waitForTimeout(1450);
   const gone=await page.evaluate(()=>{const e=document.getElementById('ccx-welcome');return !e||getComputedStyle(e).visibility==='hidden'||getComputedStyle(e).display==='none';});
   assert.ok(gone,'opening cannot remain over application');
   await page.locator('#fixture-action').click({timeout:3000});assert.ok(await page.evaluate(()=>window.clicked));
   await page.evaluate(()=>{document.getElementById('app').textContent='切换到订单';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
   assert.equal(await page.evaluate(()=>localStorage.getItem('splash-test-order')),'unchanged');
   assert.ok(await page.evaluate(()=>{const e=document.getElementById('ccx-welcome');return !e||getComputedStyle(e).visibility==='hidden'||getComputedStyle(e).display==='none';}),'navigation/resume must not replay');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   report.cases.push({width,mode,pass:true});
  }catch(e){report.cases.push({width,mode,pass:false,error:e.message});}
  await context.close();
 }}finally{await browser.close();}
 report.passed=report.cases.filter(x=>x.pass).length;report.failed=report.cases.length-report.passed;fs.writeFileSync(path.join(output,'splash-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.failed||report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
