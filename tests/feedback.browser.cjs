'use strict';
// Native AudioContext integration on an isolated fixture of the real app.
// This verifies oscillator calls and timing, not audible loudness or physical
// vibration. Clipboard/share are captured; Firebase boot/network are blocked.
// Use the same CCX_PLAYWRIGHT_MODULE, CCX_BROWSER_ENGINE and browser paths as
// mobile-workflow.browser.cjs. Reports default to /tmp/ccx-feedback-browser.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const engine=process.env.CCX_BROWSER_ENGINE||'chromium';
const playwright=require(process.env.CCX_PLAYWRIGHT_MODULE||'playwright');
const output=process.env.CCX_FEEDBACK_OUTPUT||`/tmp/ccx-feedback-browser/${engine}`;
fs.mkdirSync(output,{recursive:true});
// Reuse its actual source/styling fixture without running its existing cases.
// Unlike that runner, a setup must preserve the feedback device preference.
const fixtureRunner=path.join(__dirname,'mobile-workflow.browser.cjs');
const existing=fs.readFileSync(fixtureRunner,'utf8');
const prefix=existing.slice(0,existing.indexOf('(async()=>{')).replace('localStorage.clear();','localStorage.removeItem(KEY);');
const {html,sourceHashes}=Function('require','__dirname','__filename','process',prefix+'\nreturn {html,sourceHashes:report.sourceHashes};')(require,__dirname,fixtureRunner,process);
const report={engine,sourceHashes:{...sourceHashes,fixtureRunner:sourceHashes.runner,runner:require('node:crypto').createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')},cases:[],errors:[],limitations:['No real iPhone system audio or hardware vibration measurement','No real clipboard/share delivery or production Firebase access']};
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const metrics=page=>page.evaluate(()=>({created:window.__audio.created,started:window.__audio.started,resumes:window.__audio.resumes,closed:window.__audio.closed,states:window.__audio.contexts.map(x=>x.state),deliveries:window.__audio.deliveries,clicks:window.__audio.clicks}));
async function runCase(name,fn){try{report.cases.push({name,pass:true,...(await fn()||{})});}catch(e){report.cases.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message);}}

(async()=>{
 const browser=await playwright[engine].launch({headless:true});report.browserVersion=browser.version();
 try{
  for(const role of ['owner','editor']){
   const context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   await context.addInitScript(()=>{
    const metrics=window.__audio={created:0,started:0,resumes:0,closed:0,contexts:[],deliveries:[],clicks:[]};
    const Native=window.AudioContext||window.webkitAudioContext;
    if(Native){
     class ObservedAudioContext extends Native {
      constructor(options){
       super(options);metrics.created++;metrics.contexts.push(this);
       const create=this.createOscillator.bind(this),resume=this.resume.bind(this),close=this.close.bind(this);
       this.createOscillator=()=>{const oscillator=create(),start=oscillator.start.bind(oscillator);oscillator.start=(...args)=>{metrics.started++;return start(...args);};return oscillator;};
       this.resume=(...args)=>{metrics.resumes++;return resume(...args);};
       this.close=(...args)=>{metrics.closed++;return close(...args);};
      }
     }
     window.AudioContext=ObservedAudioContext;
    }
    document.addEventListener('click',e=>{const b=e.target.closest?.('[data-act]');if(b)metrics.clicks.push({act:b.dataset.act,time:performance.now(),trusted:e.isTrusted});},true);
   });
   const page=await context.newPage();page.setDefaultTimeout(5000);
   page.on('pageerror',e=>report.errors.push(`${role}: ${e.message}`));
   await page.route('**/*',async route=>{if(route.request().url()==='https://ccx.invalid/ordering/')await route.fulfill({status:200,contentType:'text/html',body:html});else{report.errors.push('Blocked network '+route.request().url());await route.abort();}});
   await page.goto('https://ccx.invalid/ordering/');
   await page.evaluate(role=>window.__ccx.setup(role),role);await settle(page);
   const initial=await page.evaluate(()=>JSON.stringify(window.__ccx.state().order));
   await runCase(`${role}: default settings never create audio or autoplay`,async()=>{
    assert.equal((await metrics(page)).created,0);
    await page.locator('[data-tab="more"]').click();await settle(page);
    assert.match(await page.locator('[data-kind="sound"]').innerText(),/关/);
    assert.equal(await page.locator('[data-act="feedback-test"]').isDisabled(),true);
    assert.equal((await metrics(page)).created,0);
    if(!await page.evaluate(()=>typeof navigator.vibrate==='function')){
     assert.equal(await page.locator('[data-kind="vibration"]').isDisabled(),true);
     assert.match(await page.locator('[data-feedback]').innerText(),/当前浏览器不支持网页震动/);
    }
   });
   await runCase(`${role}: a trusted enabling tap starts a real reusable AudioContext`,async()=>{
    await page.locator('[data-kind="sound"]').click();await settle(page);
    await page.waitForFunction(()=>window.__audio.contexts.some(c=>c.state==='running'));
    // Separate the test tap from the 40 ms rapid-tap guard.
    await page.waitForTimeout(60);
    await page.locator('[data-act="feedback-test"]').click();
    await page.waitForFunction(()=>window.__audio.started>0);
    const m=await metrics(page);assert.equal(m.created,1);assert.ok(m.started>=1);
    assert.ok(m.clicks.every(x=>x.trusted),'all UI taps must be trusted browser input');
    await page.screenshot({path:path.join(output,`${role}-feedback-controls.png`)});
    return {audio:m};
   });
   await runCase(`${role}: alternating copy/share remains immediate with feedback enabled`,async()=>{
    await page.locator('[data-tab="order"]').click();await settle(page);
    await page.evaluate(()=>{
     const copy=navigator.clipboard.writeText.bind(navigator.clipboard),share=navigator.share.bind(navigator);
     navigator.clipboard.writeText=text=>{window.__audio.deliveries.push({kind:'copy',time:performance.now(),text});return copy(text);};
     Object.defineProperty(navigator,'share',{configurable:true,value:value=>{window.__audio.deliveries.push({kind:'share',time:performance.now(),text:value.text});return share(value);}});
    });
    for(const kind of ['copy','share','copy','share']){await page.locator(`[data-act="${kind}"]`).click();await settle(page);}
    const m=await metrics(page);assert.equal(m.deliveries.length,4);
    const timings=m.deliveries.map((delivery,i)=>{const click=m.clicks.filter(x=>x.act==='copy'||x.act==='share')[i];return delivery.time-click.time;});
    assert.ok(timings.every(t=>t>=0&&t<250),JSON.stringify(timings));
    const text=await page.evaluate(()=>window.__ccx.block('kr'));assert.ok(m.deliveries.every(x=>x.text===text));
    assert.equal(await page.evaluate(()=>window.__ccx.state().reads),0);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__ccx.state().order)),initial);
    return {deliveryDelayMs:timings,audioContexts:m.created};
   });
   await runCase(`${role}: disabling sound stops it without changing data or later actions`,async()=>{
    await page.locator('[data-tab="more"]').click();await settle(page);
    await page.locator('[data-kind="sound"]').click();await settle(page);
    assert.match(await page.locator('[data-kind="sound"]').innerText(),/关/);
    const before=await metrics(page);assert.ok(before.closed>=1);
    await page.locator('[data-tab="order"]').click();await page.locator('[data-act="copy"]').click();await settle(page);
    const after=await metrics(page);assert.equal(after.started,before.started);assert.equal(after.created,before.created);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__ccx.state().order)),initial);
   });
   await runCase(`${role}: preference survives reload without autoplay`,async()=>{
    await page.locator('[data-tab="more"]').click();await page.locator('[data-kind="sound"]').click();
    assert.match(await page.locator('[data-kind="sound"]').innerText(),/开/);
    await page.reload();await page.evaluate(role=>window.__ccx.setup(role),role);await settle(page);
    assert.equal((await metrics(page)).created,0,'restoring an enabled preference must not autoplay');
    assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('ccx-ordering-draft-v1:feedback'))).sound,true);
    await page.locator('[data-tab="more"]').click();await settle(page);
    assert.match(await page.locator('[data-kind="sound"]').innerText(),/开/);
   });
   await context.close();
  }
 }finally{await browser.close();}
 report.passed=report.cases.filter(x=>x.pass).length;report.failed=report.cases.filter(x=>!x.pass).length;
 fs.writeFileSync(path.join(output,'feedback-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({engine:report.engine,browserVersion:report.browserVersion,passed:report.passed,failed:report.failed,pageErrors:report.errors,report:path.join(output,'feedback-report.json')}));
 if(report.failed||report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
