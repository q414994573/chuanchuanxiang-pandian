'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('../count-core.js');
const source=require('../current-order.json');
const Feedback=require('../redesign-preview/interaction-feedback.cjs');

// Exercise the same delegated handlers as the app, with no Firebase boot and
// no production data. Other suites test the sound generator itself.
const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const body=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${body};return harness;`)(require,Core,source);

function feedbackSpy(supported={sound:true,vibration:true}){
 const calls=[],settings={sound:false,vibration:false};
 const api={support:()=>({...supported}),settings:()=>({...settings}),set(kind,on){settings[kind]=supported[kind]&&on===true;return {...settings};},play(event){calls.push(event);return true;},stop(){}};
 return {calls,api,module:{create:()=>api}};
}
function ready(role='owner',override){
 const h=harness(true,override);
 h.run(`releaseLocked=false;member={role:'${role}',name:'测试账号'};screen='order';`);
 return h;
}
function target(act,fields={}){
 const button={dataset:{act,...fields},disabled:false,classList:{contains:()=>false}};
 button.closest=s=>{
  if(s==='[data-act]')return button;
  if(s==='[data-act="open"],[data-act="edit"]')return ['open','edit'].includes(act)?button:null;
  if(s==='[data-search="true"]')return button.dataset.search==='true'?button:null;
  if(s===`[data-act="${act}"]`)return button;
  if(s==='input,button,a,label')return button;
  return null;
 };
 return button;
}
const event=(button,more={})=>({target:button,isTrusted:true,button:0,isPrimary:true,pointerId:7,clientX:20,clientY:30,preventDefault(){this.prevented=true;},...more});

test('both account roles receive the same device feedback controls and defaults',()=>{
 const html=[];
 for(const role of ['owner','editor']){
  const spy=feedbackSpy(),h=ready(role,spy.module);
  html.push(h.run('feedbackHtml()'));
  assert.match(html.at(-1),/声音：关/);assert.match(html.at(-1),/震动：关/);
  assert.match(html.at(-1),/data-act="feedback-test" disabled/);
  assert.equal(spy.calls.length,0,'rendering settings must not sound');
 }
 assert.equal(html[0],html[1],'feedback options must not depend on account role');
});

test('an unsupported iPhone-style vibration API is honestly shown and cannot be enabled',()=>{
 const spy=feedbackSpy({sound:true,vibration:false}),h=ready('owner',spy.module);
 const html=h.run('feedbackHtml()');
 assert.match(html,/data-kind="vibration"[^>]*disabled[^>]*>震动：不支持/);
 assert.match(html,/当前浏览器不支持网页震动/);
 assert.match(html,/声音：关/);
});

for(const role of ['owner','editor'])test(`feedback toggle and test keep quantities, saved units, and order status unchanged (${role})`,async()=>{
 const spy=feedbackSpy(),h=ready(role,spy.module),card={outerHTML:''};
 h.document.querySelector=s=>s==='[data-feedback]'?card:null;
 h.run(`buildSample('boss');member={role:'${role}',name:'测试账号'};order.orderStage='finalized';`);
 const before=h.run('JSON.stringify([draft,order,orderDirty,cloudPending,preparedExport])');
 await h.handlers.click(event(target('feedback-toggle',{kind:'sound'})));
 assert.equal(spy.api.settings().sound,true);assert.match(card.outerHTML,/声音：开/);
 await h.handlers.click(event(target('feedback-test')));
 await h.handlers.click(event(target('feedback-toggle',{kind:'sound'})));
 assert.equal(spy.api.settings().sound,false);assert.match(card.outerHTML,/声音：关/);
 assert.equal(spy.calls.length,3,'one feedback request per accepted settings action');
 assert.equal(h.run('JSON.stringify([draft,order,orderDirty,cloudPending,preparedExport])'),before);
});

test('ordinary keypad clicks request feedback once and preserve their original action',async()=>{
 const spy=feedbackSpy(),h=ready('owner',spy.module);
 h.run(`globalThis.typed=[];typeKey=k=>typed.push(k);`);
 const button=target('key',{key:'7'});
 await h.handlers.click(event(button));
 assert.equal(spy.calls.length,1);assert.deepEqual(Array.from(h.run('typed')),['7']);
});

test('busy, disabled, and release-locked actions request no feedback and make no edit',async()=>{
 for(const blocked of ['busy','disabled','releaseLocked']){
  const spy=feedbackSpy(),h=ready('owner',spy.module),button=target('key',{key:'7'});
  h.run(`globalThis.typed=[];typeKey=k=>typed.push(k);`);
  if(blocked==='disabled')button.disabled=true;else h.run(`${blocked}=true`);
  await h.handlers.click(event(button));
  assert.equal(spy.calls.length,0,blocked);assert.equal(h.run('typed.length'),0,blocked);
 }
});

for(const act of ['clear-find','cancel-find'])test(`search ${act} emits once on pointerdown and suppresses the later click`,async()=>{
 const spy=feedbackSpy(),h=ready('owner',spy.module),button=target(act);
 h.run(`globalThis.searchActions=0;clearFind=cancelFind=()=>searchActions++;`);
 h.handlers.pointerdown(event(button));
 await h.handlers.click(event(button));
 assert.equal(spy.calls.length,1);assert.equal(h.run('searchActions'),1);
});

test('a search-focused result emits once on pointerup without duplicate synthetic click',async()=>{
 const spy=feedbackSpy(),h=ready('owner',spy.module),button=target('edit',{id:'cn:9',search:'true'});
 h.run(`globalThis.opened=[];openFromRow=b=>opened.push(b.dataset.id);`);
 h.document.activeElement=h.find;
 h.handlers.pointerdown(event(button));
 assert.equal(spy.calls.length,0,'touch-down may still become scrolling');
 h.handlers.pointerup(event(button));
 await h.handlers.click(event(button));
 assert.equal(spy.calls.length,1);assert.deepEqual(Array.from(h.run('opened')),['cn:9']);
});

test('an unfocused result leaves feedback and activation to the single native click',async()=>{
 const spy=feedbackSpy(),h=ready('owner',spy.module),button=target('open',{id:'cn:9'});
 h.run(`globalThis.opened=[];openFromRow=b=>opened.push(b.dataset.id);`);
 h.document.activeElement=null;
 h.handlers.pointerdown(event(button));h.handlers.pointerup(event(button));
 assert.equal(spy.calls.length,0);
 await h.handlers.click(event(button));
 assert.equal(spy.calls.length,1);assert.deepEqual(Array.from(h.run('opened')),['cn:9']);
});

test('dragging or cancelling a search result does not sound or open a row',async()=>{
 for(const cancellation of ['moved','cancelled','released-away']){
  const spy=feedbackSpy(),h=ready('owner',spy.module),button=target('edit',{id:'cn:9',search:'true'});
  h.run(`globalThis.opened=0;openFromRow=()=>opened++;`);h.document.activeElement=h.find;
  h.handlers.pointerdown(event(button));
  if(cancellation==='moved')h.handlers.pointermove(event(button,{clientY:60}));
  if(cancellation==='cancelled')h.handlers.pointercancel(event(button));
  h.handlers.pointerup(event(cancellation==='released-away'?target('edit',{id:'cn:8'}):button,{clientY:cancellation==='moved'?60:30}));
  await h.handlers.click(event(button));
  assert.equal(spy.calls.length,0,cancellation);assert.equal(h.run('opened'),0,cancellation);
 }
});

test('a row becoming busy or locked between touch-down and touch-up stays silent',async()=>{
 for(const block of ['busy','releaseLocked']){
  const spy=feedbackSpy(),h=ready('owner',spy.module),button=target('edit',{id:'cn:9',search:'true'});
  h.run(`globalThis.opened=0;openFromRow=()=>opened++;`);h.document.activeElement=h.find;
  h.handlers.pointerdown(event(button));h.run(`${block}=true`);h.handlers.pointerup(event(button));
  await h.handlers.click(event(button));
  assert.equal(spy.calls.length,0,block);assert.equal(h.run('opened'),0,block);
 }
});

test('Enter and Space on a search cell retain keyboard activation with one feedback request',()=>{
 for(const key of ['Enter',' ']){
  const spy=feedbackSpy(),h=ready('owner',spy.module),button=target('edit',{id:'cn:9',search:'true'});
  h.run(`globalThis.opened=0;openFromRow=()=>opened++;`);
  const e=event(button,{key});h.handlers.keydown(e);
  assert.equal(e.prevented,true);assert.equal(spy.calls.length,1);assert.equal(h.run('opened'),1);
 }
});

function realFeedbackHarness(mode,role='owner'){
 let clock=1000,resumes=0,constructed=0,vibrations=0;
 const storage=new Map();
 class Audio {
  constructor(){constructed++;if(mode==='constructor-throws')throw Error('audio denied');this.state='suspended';}
  resume(){resumes++;return mode==='rejected'?Promise.reject(Error('audio denied')):new Promise(()=>{});}
  close(){this.state='closed';return Promise.resolve();}
 }
 const override={create(win,options){
  Object.assign(win,{AudioContext:Audio,document:{visibilityState:'visible'},performance:{now:()=>clock},navigator:{vibrate(){vibrations++;if(mode==='vibration-throws')throw Error('no hardware');return true;}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
  const feedback=Feedback.create(win,options);feedback.set('sound',true);feedback.set('vibration',true);return feedback;
 }};
 const h=ready(role,override);
 const deliveries=[];
 h.ctx.navigator={onLine:true,clipboard:{writeText(text){deliveries.push({kind:'copy',text});return Promise.resolve();}},share(value){deliveries.push({kind:'share',text:value.text});return Promise.resolve();}};
 h.run(`buildSample('boss');sample=false;member={role:'${role}',name:'测试账号'};order.orderStage='finalized';baseQty={...order.quantities};baseUnits={...order.units};orderBase=C.clone(order);api={read:()=>{throw Error('no network permitted')}};`);
 return {h,deliveries,advance:()=>{clock+=100;},counts:()=>({resumes,constructed,vibrations})};
}

for(const role of ['owner','editor'])test(`copy/share stay synchronous with pending, rejected, or failing feedback APIs (${role})`,async()=>{
 for(const mode of ['pending','rejected','constructor-throws','vibration-throws']){
  const {h,deliveries,advance,counts}=realFeedbackHarness(mode,role);
  const before=h.run('JSON.stringify([order.quantities,order.units,order.snapshot,order.revision,order.orderStage])');
  const expected=h.run(`blockText('cn')`);
  for(const act of ['copy','share']){
   advance();const promise=h.handlers.click(event(target(act,{cat:'cn'})));
   assert.equal(deliveries.at(-1)?.kind,act,`${mode}: ${act} must begin before any await`);
   assert.equal(deliveries.at(-1)?.text,expected);
   await promise;
  }
  assert.ok(counts().constructed>=1,'feedback must have actually attempted audio');
  if(mode!=='constructor-throws')assert.ok(counts().resumes>=1);
  assert.equal(h.run('JSON.stringify([order.quantities,order.units,order.snapshot,order.revision,order.orderStage])'),before);
 }
});

test('untrusted or hidden events cannot trigger actual feedback while a normal app action remains nonblocking',async()=>{
 for(const blocked of ['untrusted','hidden']){
  const {h,counts}=realFeedbackHarness('pending');
  h.run(`globalThis.typed=[];typeKey=k=>typed.push(k);`);
  if(blocked==='hidden')h.window.document.visibilityState='hidden';
  await h.handlers.click(event(target('key',{key:'2'}),{isTrusted:blocked!=='untrusted'}));
  assert.equal(counts().constructed,0,blocked);assert.equal(counts().vibrations,0,blocked);
  assert.deepEqual(Array.from(h.run('typed')),['2'],'feedback never blocks the data handler');
 }
});
