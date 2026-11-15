'use strict';
// Reuse the existing isolated actual-app fixture; no live Firebase requests.
const fs=require('node:fs'),path=require('node:path');
let fixture=fs.readFileSync(path.join(__dirname,'mobile-layout.browser.cjs'),'utf8').split('const report={baseline,')[0];
fixture=fixture.replace(' state(){return',' tab(value){screen=value;render();},\n state(){return');
for(const file of ['ordering/index.html','redesign-preview/index.html']){const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');require('node:assert/strict').match(html,/<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/);}
const run=String.raw`
(async()=>{
 const browser=await playwright[process.env.CCX_BROWSER_ENGINE||'chromium'].launch();let passed=0;
 try{for(const width of [320,390,430])for(const mode of ['draft','finalized']){
 const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url()==='https://fixture.invalid/redesign-preview/'?r.fulfill({contentType:'text/html',body:html}):r.request().url().includes('overlay-relief-v70.png')?r.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(repo,'ordering/assets/overlay-relief-v70.png'))}):r.abort());
 await page.goto('https://fixture.invalid/redesign-preview/');
 await page.evaluate(m=>window.__ccx.setup('owner',m),mode);
 await page.evaluate(()=>document.documentElement.style.setProperty('--safe-top','59px'));
 const safe=await page.evaluate(()=>({padding:getComputedStyle(document.querySelector('.banner')).paddingTop,bar:document.querySelector('.bar')&&getComputedStyle(document.querySelector('.bar')).top}));
 assert.equal(safe.padding,'66px');if(safe.bar)assert.equal(safe.bar,'117px');
 await page.evaluate(()=>document.documentElement.style.removeProperty('--safe-top'));
 const before=await page.evaluate(()=>JSON.stringify(window.__ccx.state().draftValues));
 for(const tab of ['count','order','more']){
 await page.evaluate(t=>window.__ccx.tab(t),tab);
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 const geometry=()=>page.evaluate(()=>{const s=getComputedStyle(document.body,'::before');return {display:s.display,pointer:s.pointerEvents,width:parseFloat(s.width),left:parseFloat(s.left),top:parseFloat(s.top),position:s.position,transform:s.transform,z:s.zIndex,opacity:s.opacity,appZ:getComputedStyle(document.getElementById('app')).zIndex,old:getComputedStyle(document.getElementById('app'),'::after').content,overflow:document.documentElement.scrollWidth>innerWidth};});
 const result=await geometry();
 assert.equal(result.display,'block');assert.equal(result.pointer,'none');assert.equal(result.position,'fixed');assert.equal(result.left,width/2);assert.equal(result.top,422);assert.equal(result.z,'2');assert.equal(result.opacity,'0.25');assert.equal(result.appZ,'1');assert.equal(result.old,'none');assert.equal(result.overflow,false);
 await page.evaluate(()=>{const b=document.createElement('button');b.id='overlay-click-probe';b.style.cssText='position:fixed;left:calc(50% - 15px);top:calc(50% - 15px);width:30px;height:30px';b.onclick=()=>b.dataset.clicked='yes';document.getElementById('app').append(b);});
 await page.mouse.click(width/2,422);assert.equal(await page.locator('#overlay-click-probe').getAttribute('data-clicked'),'yes');await page.locator('#overlay-click-probe').evaluate(e=>e.remove());
 await page.evaluate(()=>window.scrollTo(0,0));assert.deepEqual(await geometry(),result,'scroll must not move background mark');
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 if(width===390&&mode==='finalized'){
  await page.waitForTimeout(150);await page.screenshot({path:path.join(outputDir,'center-'+tab+'.png')});
  // Reveal the background alone for visual review without changing stored data.
  await page.evaluate(()=>document.getElementById('app').style.visibility='hidden');
  await page.screenshot({path:path.join(outputDir,'background-'+tab+'.png')});
  await page.evaluate(()=>document.getElementById('app').style.visibility='');
 }
 for(const cls of ['key-open','text-mode','order-search']){assert.equal(await page.evaluate(c=>{document.body.classList.add(c);const d=getComputedStyle(document.body,'::before').display;document.body.classList.remove(c);return d;},cls),'none');}
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__ccx.state().draftValues)),before,'decoration must preserve inventory values');passed++;
 }
 await page.locator('[data-tab="count"]').click();assert.equal(await page.evaluate(()=>window.__ccx.state().screen),'count');assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
 console.log(JSON.stringify({footerCases:passed,failed:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});`;
new Function('require','__dirname',fixture+run)(require,__dirname);
