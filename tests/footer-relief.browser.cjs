'use strict';
// Reuse the existing isolated actual-app fixture; no live Firebase requests.
const fs=require('node:fs'),path=require('node:path');
let fixture=fs.readFileSync(path.join(__dirname,'mobile-layout.browser.cjs'),'utf8').split('const report={baseline,')[0];
fixture=fixture.replace(' state(){return',' emptyOrder(){order=null;draft.status="draft";for(const r of Object.values(draft.items)){r.quantity="";r.decision="none";}screen="order";render();}, tab(value){screen=value;render();},\n state(){return');
for(const file of ['ordering/index.html','redesign-preview/index.html']){const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');require('node:assert/strict').doesNotMatch(html,/apple-mobile-web-app-status-bar-style/);}
const run=String.raw`
(async()=>{
 const browser=await playwright[process.env.CCX_BROWSER_ENGINE||'chromium'].launch();let passed=0,backgroundCases=0,navigationCases=0;
 try{for(const width of [320,390,430])for(const mode of ['draft','finalized']){
 const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url()==='https://fixture.invalid/redesign-preview/'?r.fulfill({contentType:'text/html',body:html}):r.request().url().includes('overlay-relief-v70.png')?r.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(repo,'ordering/assets/overlay-relief-v70.png'))}):r.abort());
 await page.goto('https://fixture.invalid/redesign-preview/');
 await page.evaluate(m=>window.__ccx.setup('owner',m),mode);
 const colors=()=>page.evaluate(()=>[getComputedStyle(document.documentElement).backgroundColor,getComputedStyle(document.body).backgroundColor]);
 const normalColors=await colors();assert.equal(normalColors[0],'rgb(187, 24, 39)');
 await page.evaluate(()=>{const e=document.createElement('div');e.id='ccx-welcome';document.body.append(e);});
 assert.deepEqual(await colors(),['rgb(168, 0, 28)','rgb(168, 0, 28)']);
 await page.evaluate(()=>document.getElementById('ccx-welcome').remove());assert.deepEqual(await colors(),normalColors);

 const clickTab=tab=>page.locator('.tabs [data-tab="'+tab+'"]').click();
 const move=y=>page.evaluate(y=>{window.scrollTo(0,y);return scrollY;},y);
 const position=()=>page.evaluate(()=>scrollY);
 for(const tab of ['order','count']){
  await clickTab(tab);
  for(const inset of [0,59]){
   await page.evaluate(inset=>document.documentElement.style.setProperty('--safe-top',inset+'px'),inset);
   await move(580);
   await page.waitForFunction(()=>{
    const banner=document.querySelector('.banner').getBoundingClientRect();
    const bar=document.querySelector('.bar').getBoundingClientRect();
    return scrollY>100&&banner.top===0&&Math.abs(banner.bottom-bar.top)<=1;
   },null,{timeout:3000});
   assert.equal(await page.locator('.banner').evaluate(e=>getComputedStyle(e).paddingTop),(7+inset)+'px');
   navigationCases++;
  }
 }
 await page.evaluate(()=>document.documentElement.style.removeProperty('--safe-top'));
 const countY=await move(530);
 await clickTab('more');assert.equal(await position(),0,'first visit to More starts at account');
 const moreY=await move(170);assert.ok(moreY>0);
 await clickTab('order');assert.equal(await position(),580,'restore order independently');
 const orderY=await move(280);assert.ok(orderY>0);
 await clickTab('count');assert.equal(await position(),countY,'restore count independently');
 await clickTab('more');assert.equal(await position(),moreY,'restore More independently');
 await clickTab('order');assert.equal(await position(),orderY,'retain new order position');
 navigationCases++;
 const before=await page.evaluate(()=>JSON.stringify(window.__ccx.state().draftValues));
 for(const tab of ['count','order','more']){
 await page.evaluate(t=>window.__ccx.tab(t),tab);
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 const geometry=()=>page.evaluate(()=>{const s=getComputedStyle(document.body,'::before');return {display:s.display,pointer:s.pointerEvents,width:parseFloat(s.width),left:parseFloat(s.left),top:parseFloat(s.top),position:s.position,transform:s.transform,z:s.zIndex,opacity:s.opacity,appZ:getComputedStyle(document.getElementById('app')).zIndex,old:getComputedStyle(document.getElementById('app'),'::after').content,overflow:document.documentElement.scrollWidth>innerWidth};});
 const result=await geometry();
 assert.ok(Math.abs(result.width-width*.6)<.1,'watermark stays at 60% viewport width');assert.equal(result.display,'block');assert.equal(result.pointer,'none');assert.equal(result.position,'fixed');assert.equal(result.left,width/2);assert.equal(result.top,422);assert.equal(result.z,'2');assert.equal(result.opacity,'0.25');assert.equal(result.appZ,'1');assert.equal(result.old,'none');assert.equal(result.overflow,false);
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
 await page.locator('[data-tab="count"]').click();assert.equal(await page.evaluate(()=>window.__ccx.state().screen),'count');assert.deepEqual(errors,[]);
 for(const height of [844,956]){
  await page.setViewportSize({width,height});
  await page.evaluate(m=>window.__ccx.setup('owner',m),mode);
  await page.locator('[data-tab="count"]').click();
  await page.locator('[data-act="jumpcat"][data-cat="drinks"]').click();
  for(const scene of ['drinks','empty-order']){
   if(scene==='empty-order')await page.evaluate(()=>window.__ccx.emptyOrder());
   await page.evaluate(()=>window.scrollTo(0,0));
   const coverage=await page.evaluate(()=>({height:document.body.getBoundingClientRect().height,viewport:innerHeight,color:getComputedStyle(document.body).backgroundColor}));
   assert.ok(coverage.height>=coverage.viewport-1,scene+' background must cover viewport');assert.equal(coverage.color,'rgb(243, 240, 238)');
   if(width===390&&mode==='draft'&&height===956)await page.screenshot({path:path.join(outputDir,'short-'+scene+'.png')});
   if(scene==='empty-order'&&height===956){
    const old=await page.evaluate(()=>{document.body.style.minHeight='0';const h=document.body.getBoundingClientRect().height;document.body.style.removeProperty('min-height');return h;});
    assert.ok(old<height,'negative control reproduces red canvas exposure without minimum height');
   }
   backgroundCases++;
  }
 }
 await page.close();
 }}finally{await browser.close();}
 const report={engine:process.env.CCX_BROWSER_ENGINE||'chromium',passed:passed+backgroundCases+navigationCases,failed:0,errors:[],footerCases:passed,backgroundCases,navigationCases};fs.writeFileSync(path.join(outputDir,'footer-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});`;
new Function('require','__dirname',fixture+run)(require,__dirname);
