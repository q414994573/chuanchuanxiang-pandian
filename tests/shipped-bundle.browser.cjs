'use strict';
// Execute the shipped HTML and bundle without removing boot() or Firebase code.
// Every request is routed to this checkout or explicitly aborted. No real login.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const playwright=require(process.env.CCX_PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(__dirname,'..'),Core=require(repo+'/count-core.js'),source=require(repo+'/current-order.json');
const engine=process.env.CCX_BROWSER_ENGINE||'chromium',output=process.env.CCX_BROWSER_OUTPUT||'/tmp/ccx-boot-round2';fs.mkdirSync(output,{recursive:true});
const cases=[],pageErrors=[];const key='ccx-ordering-draft-v1';
const draft=Core.create(source,'2026-10-26','count-boot-local');Core.edit(draft,'cn:9','quantity','18');draft.seen={'cn:9':true};
const saved=JSON.stringify({draft,pos:0,field:'stock'});
const scenarios=[
 {name:'shipped production bundle boots to login and preserves saved local draft',mode:'normal',match:'请登录'},
 {name:'missing cloud config locks production entry and preserves original local bytes',mode:'config404',match:'新版正式入口准备中'},
 {name:'136-product catalog refuses startup and preserves original local bytes',mode:'catalog136',match:'商品目录应为138种'},
 {name:'malformed alias response fails safely without overwriting local draft',mode:'aliasMalformed',match:null}
];
(async()=>{
 const browser=await playwright[engine].launch({headless:true});
 try{for(const scenario of scenarios){
  const context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true});
  await context.addInitScript(({key,saved})=>localStorage.setItem(key,saved),{key,saved});
  const page=await context.newPage(),requested=[],blocked=[];page.on('pageerror',e=>pageErrors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());requested.push({path:url.pathname,method:route.request().method()});
   if(url.origin!=='https://ccx.invalid'){blocked.push(url.origin);await route.abort();return;}
   let rel=url.pathname.replace(/^\//,'');if(rel.endsWith('/'))rel+='index.html';
   if(scenario.mode==='config404'&&rel==='ordering/firebase-config.json'){await route.fulfill({status:404,body:'missing'});return;}
   if(scenario.mode==='catalog136'&&rel==='current-order.json'){await route.fulfill({contentType:'application/json',body:JSON.stringify({...source,products:source.products.slice(0,136)})});return;}
   if(scenario.mode==='aliasMalformed'&&rel==='redesign-preview/aliases.json'){await route.fulfill({contentType:'application/json',body:'{invalid-alias'});return;}
   const file=path.resolve(repo,rel);assert.ok(file.startsWith(repo+path.sep));
   if(!fs.existsSync(file)){await route.fulfill({status:404,body:'not found'});return;}
   const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.jpg')?'image/jpeg':'text/html';
   await route.fulfill({contentType:type,body:fs.readFileSync(file)});
  });
  try{
   await page.goto('https://ccx.invalid/ordering/');
   if(scenario.match)await page.waitForFunction(text=>document.querySelector('#app')?.textContent.includes(text),scenario.match,{timeout:10000});
   else await page.waitForFunction(()=>{const s=document.querySelector('#app')?.textContent;return s&&!s.includes('正在核对入口状态');},{timeout:10000});
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),saved);
   assert.equal(requested.some(x=>x.method!=='GET'),false,'startup must not write to any service');
   const text=await page.locator('#app').innerText();
   if(scenario.mode==='aliasMalformed'){assert.ok(text.trim().length>0);assert.equal(text.includes('请登录'),false);assert.equal(await page.locator('.line').count(),0);}
   if(scenario.mode==='normal'){assert.ok(requested.some(x=>x.path==='/redesign-preview/preview.bundle.js'));assert.ok(requested.some(x=>x.path==='/current-order.json'));await page.screenshot({path:path.join(output,'production-login.png')});}
   cases.push({name:scenario.name,pass:true,blockedOrigins:blocked,requests:requested});
  }catch(e){cases.push({name:scenario.name,pass:false,error:e.stack});console.error('FAIL',scenario.name,e.message);}
  finally{await context.close();}
 }}finally{await browser.close();}
 const hashes=Object.fromEntries(['ordering/index.html','redesign-preview/preview.bundle.js','count-core.js','current-order.json'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,p))).digest('hex')]));
 const report={engine,cases,sourceInputs:hashes,passed:cases.filter(x=>x.pass).length,failed:cases.filter(x=>!x.pass).length,pageErrors};
 fs.writeFileSync(path.join(output,'deployed-boot-round2-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 if(report.failed||pageErrors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
