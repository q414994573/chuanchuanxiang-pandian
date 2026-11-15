'use strict';
// Reuse the existing isolated actual-app fixture; no live Firebase requests.
const fs=require('node:fs'),path=require('node:path');
let fixture=fs.readFileSync(path.join(__dirname,'mobile-layout.browser.cjs'),'utf8').split('const report={baseline,')[0];
fixture=fixture.replace(' state(){return',' tab(value){screen=value;render();},\n state(){return');
const run=String.raw`
(async()=>{
 const browser=await playwright[process.env.CCX_BROWSER_ENGINE||'chromium'].launch();let passed=0;
 try{for(const width of [320,390,430])for(const mode of ['draft','finalized']){
 const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url()==='https://fixture.invalid/redesign-preview/'?r.fulfill({contentType:'text/html',body:html}):r.request().url().includes('footer-relief-v68.png')?r.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(repo,'ordering/assets/footer-relief-v68.png'))}):r.abort());
 await page.goto('https://fixture.invalid/redesign-preview/');
 await page.evaluate(m=>window.__ccx.setup('owner',m),mode);
 const before=await page.evaluate(()=>JSON.stringify(window.__ccx.state().draftValues));
 for(const tab of ['count','order','more']){
 await page.evaluate(t=>window.__ccx.tab(t),tab);
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 const result=await page.evaluate(()=>{const app=document.getElementById('app'),s=getComputedStyle(app,'::after'),rect=app.getBoundingClientRect(),tabs=document.querySelector('.tabs').getBoundingClientRect();return {display:s.display,pointer:s.pointerEvents,width:parseFloat(s.width),height:parseFloat(s.height),bottom:rect.bottom-parseFloat(getComputedStyle(app).paddingBottom),tabs:tabs.top,overflow:document.documentElement.scrollWidth>innerWidth};});
 assert.equal(result.display,'block');assert.equal(result.pointer,'none');assert.ok(result.width>=130&&result.width<=170);assert.equal(result.overflow,false);assert.ok(result.bottom<result.tabs,'mark ends above fixed navigation');
 if(width===390&&mode==='finalized'){await page.waitForTimeout(150);await page.screenshot({path:path.join(outputDir,'footer-'+tab+'.png')});}
 for(const cls of ['key-open','text-mode','order-search']){assert.equal(await page.evaluate(c=>{document.body.classList.add(c);const d=getComputedStyle(document.getElementById('app'),'::after').display;document.body.classList.remove(c);return d;},cls),'none');}
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__ccx.state().draftValues)),before,'decoration must preserve inventory values');passed++;
 }
 await page.locator('[data-tab="count"]').click();assert.equal(await page.evaluate(()=>window.__ccx.state().screen),'count');assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
 console.log(JSON.stringify({footerCases:passed,failed:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});`;
new Function('require','__dirname',fixture+run)(require,__dirname);
