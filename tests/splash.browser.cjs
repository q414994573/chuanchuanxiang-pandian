'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const playwright=require(process.env.CCX_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=process.env.CCX_BROWSER_OUTPUT||path.join(root,'test-output/splash');fs.mkdirSync(output,{recursive:true});
const report={engine:process.env.CCX_BROWSER_ENGINE||'chromium',cases:[],errors:[]};
const html=fs.readFileSync(path.join(root,'ordering/index.html'),'utf8');
(async()=>{
 const browser=await playwright[report.engine].launch({headless:true});report.browserVersion=browser.version();
 try{for(const width of [320,390,430])for(const mode of ['ready','slow-app','failed-image','slow-image','missing-script','reduced-motion','return','mouse-skip','touch-skip','held-expiry','keyboard-skip']){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:mode==='reduced-motion'?'reduce':'no-preference'}),page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/ordering/')return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname==='/ordering/splash.js')return route.fulfill({contentType:'text/javascript',body:mode==='missing-script'?'':fs.readFileSync(path.join(root,'ordering/splash.js'),'utf8')});
   if(url.pathname.endsWith('emblem-v65.png')){
    if(mode==='failed-image')return route.abort();
    if(mode==='slow-image'){await new Promise(r=>setTimeout(r,1700));}
    return route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'ordering/assets/emblem-v65.png'))});
   }
   if(url.pathname.endsWith('preview.bundle.js'))return route.fulfill({contentType:'text/javascript',body:`localStorage.setItem('splash-test-order','unchanged');setTimeout(()=>{document.getElementById('app').innerHTML='<button style="position:fixed;inset:0" id="fixture-action">测试盘货按钮</button>';document.getElementById('fixture-action').onclick=()=>window.clicked=(window.clicked||0)+1;},${mode==='slow-app'?1800:100});`});
   return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:''});
  });
  try{
   await page.goto('https://ccx.invalid/ordering/',{waitUntil:'domcontentloaded'});
   if(mode==='ready'){
    await page.waitForFunction(()=>document.querySelector('#ccx-welcome')?.classList.contains('art-ready'));
    const box=await page.locator('#ccx-welcome').boundingBox();assert.equal(box.width,width);assert.equal(box.height,844);
    assert.equal(await page.locator('#ccx-welcome').getAttribute('role'),'button');
    assert.equal(await page.locator('.welcome-title').innerText(),'川川香');
    assert.ok(!(await page.locator('#ccx-welcome').innerText()).includes('订货总控台'));
    assert.equal(await page.locator('.welcome-emblem').evaluate(e=>getComputedStyle(e).animationDuration),'1s');
    await page.waitForTimeout(650);
    if(width===390){
     await page.screenshot({path:path.join(output,'welcome.png')});
     await page.evaluate(()=>{const child=document.querySelector('.welcome-emblem');child.dispatchEvent(new AnimationEvent('animationend',{bubbles:true,animationName:'ccx-emblem-in'}));});
     assert.equal(await page.locator('#ccx-welcome').count(),1,'child animation end must not dismiss opening');
    }
   }
   if(mode==='return')await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   if(['mouse-skip','touch-skip','held-expiry','keyboard-skip'].includes(mode)){
    await page.locator('#fixture-action').waitFor({state:'attached'});
    if(mode==='touch-skip')await page.touchscreen.tap(150,400);
    if(mode==='mouse-skip')await page.mouse.click(150,400);
    if(mode==='keyboard-skip'){await page.locator('#ccx-welcome').focus();await page.keyboard.press('Enter');}
    if(mode==='held-expiry'){await page.mouse.move(150,400);await page.mouse.down();await page.waitForTimeout(3200);await page.mouse.up();}
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.clicked||0),0,'skip gesture must not reach underlying action');
    assert.equal(await page.locator('#ccx-welcome').count(),0,'skip removes opening immediately');
   }else{
    if(mode==='ready'){
     await page.waitForTimeout(1100);
     assert.equal(await page.locator('#ccx-welcome').evaluate(e=>getComputedStyle(e).visibility),'visible','opening remains before 2.4 seconds');
    }
    await page.waitForTimeout(3250);
   }
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
