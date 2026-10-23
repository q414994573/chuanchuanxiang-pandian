const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Core=require('../count-core.js');
const source=JSON.parse(fs.readFileSync(require.resolve('../current-order.json'),'utf8'));
const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const harnessSource=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"))
 .replace(' const handlers=',' const lifecycle={};\n const handlers=')
 .replaceAll('addEventListener(){}','addEventListener(n,fn){(lifecycle[n]||=[]).push(fn);}')
 .replace('return {handlers,','return {lifecycle,handlers,');
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${harnessSource};return harness;`)(require,Core,source);
function setup(role='owner',screen='count',field='qty'){
 const h=harness(true);
 h.run(`peerEnabled=true;member={role:'${role}'};peerApi={};screen='${screen}';peerBase={localId:draft.id,orderId:draft.id,revision:1,stage:'draft',draft:C.clone(draft)};peerLatest=peerBase;globalThis.activeId='kr:7';pos=draft.catalog.findIndex(p=>p.id===activeId);field='${field}';keypad=true;${screen==='order'?`editId=activeId;editField='${field}';editRaw='';`:''}paintBackupStatus=()=>{};globalThis.remote=C.clone(peerBase);remote.revision=2;`);
 return h;
}
for(const role of ['owner','editor'])for(const screen of ['count','order'])for(const field of ['stock','qty']){
 test(`${role}/${screen}/${field}: remote unrelated update keeps native text editor mounted`,()=>{
  const h=setup(role,screen,field);h.run(`textMode=true;Core().edit(draft,activeId,'${field==='stock'?'stock':'quantity'}','2.');${screen==='order'?"editRaw='2.';":''}Core().edit(remote.draft,'kr:8','quantity','3');remote.draft.seen['kr:8']=true;globalThis.replacements=0;render=paintRows=()=>replacements++;peerReceive(remote);`);
  assert.equal(h.run('cloudConflict'),false);assert.equal(h.run(`draft.items[activeId].${field==='stock'?'stock':'quantity'}`),'2.');assert.equal(h.run(`draft.items['kr:8'].quantity`),'3');assert.equal(h.run('replacements'),0);assert.equal(h.run('textMode'),true);
 });
 test(`${role}/${screen}/${field}: identical acknowledged active value is not a conflicting edit`,()=>{
  const h=setup(role,screen,field),key=field==='stock'?'stock':'quantity';h.run(`Core().edit(draft,activeId,'${key}','1');draft.seen[activeId]=true;remote.draft=C.clone(draft);peerReceive(remote);`);
  assert.equal(h.run('cloudConflict'),false);assert.equal(h.run('peerBase.revision'),2);assert.equal(h.run(`draft.items[activeId].${key}`),'1');assert.equal(h.run('peerDirty()'),false);
 });
 test(`${role}/${screen}/${field}: genuinely different active value preserves input and pauses`,()=>{
  const h=setup(role,screen,field),key=field==='stock'?'stock':'quantity';h.run(`Core().edit(draft,activeId,'${key}','1');Core().edit(remote.draft,activeId,'${key}','2');peerReceive(remote);`);
  assert.equal(h.run('cloudConflict'),true);assert.equal(h.run(`draft.items[activeId].${key}`),'1');assert.equal(h.run('peerBase.revision'),1);
 });
}
for(const stage of ['finalized','new-draft'])for(const dirty of [false,true])test(`remote ${stage} while local ${dirty?'dirty':'clean'} never silently discards input`,()=>{
 const h=setup();h.run(`openOrder=async id=>globalThis.opened=id;${dirty?"Core().edit(draft,activeId,'quantity','7');":''}`);
 if(stage==='finalized')h.run(`remote.stage='finalized';remote.draft.status='reviewed';remote.draft.reviewedAt=new Date().toISOString();`);
 else h.run(`remote.localId='count-new-peer';remote.orderId=remote.localId;remote.draft=Core().create(source,'2026-10-23',remote.localId);`);
 h.run('peerReceive(remote)');assert.equal(h.run('cloudConflict'),dirty);
 if(dirty){assert.equal(h.run('draft.items[activeId].quantity'),'7');assert.equal(h.run('peerBase.revision'),1);}
 else{assert.equal(h.run('peerBase.revision'),2);assert.equal(h.run('draft.id'),h.run('remote.localId'));}
});
for(const failure of ['network','shared/conflict'])test(`save ${failure} with newer local input preserves memory and local backup`,async()=>{
 const h=setup();h.run(`Core().edit(draft,activeId,'quantity','1');persistLocal();peerApi.save=()=>new Promise((resolve,reject)=>globalThis.rejectSave=reject);`);
 const pending=h.run('peerSave()');h.run(`Core().edit(draft,activeId,'quantity','12');persistLocal();rejectSave(Object.assign(Error('test failure'),{code:'${failure}'}));`);await pending;
 assert.equal(h.run('draft.items[activeId].quantity'),'12');assert.equal(JSON.parse(h.saved.get(h.run('KEY'))).draft.items['kr:7'].quantity,'12');assert.equal(h.run('cloudPending'),true);assert.equal(h.run('peerFlight'),null);assert.equal(h.run('cloudConflict'),failure==='shared/conflict');
});
for(const watchFirst of [false,true])for(const newer of [false,true])test(`save/watch ordering watchFirst=${watchFirst} newerSnapshot=${newer}`,async()=>{
 const h=setup();h.run(`Core().edit(draft,activeId,'quantity','1');draft.seen[activeId]=true;peerApi.save=()=>new Promise(resolve=>globalThis.done=resolve);globalThis.savedHead={...peerBase,revision:2,draft:C.clone(draft)};`);
 const pending=h.run('peerSave()');h.run(`globalThis.watchHead=C.clone(savedHead);${newer?"watchHead.revision=3;Core().edit(watchHead.draft,'kr:8','quantity','4');":''}Core().edit(draft,activeId,'quantity','12');`);
 if(watchFirst)h.run('peerReceive(watchHead)');h.run('done(savedHead)');await pending;if(!watchFirst)h.run('peerReceive(watchHead)');
 assert.equal(h.run('cloudConflict'),false);assert.equal(h.run('draft.items[activeId].quantity'),'12');assert.equal(h.run('peerBase.revision'),newer?3:2);assert.equal(h.run('cloudPending'),true);if(newer)assert.equal(h.run(`draft.items['kr:8'].quantity`),'4');
});
for(const event of ['pagehide','hidden','visible','online'])test(`${event} retries pending shared input without waiting for another keystroke`,async()=>{
 const h=setup();h.run(`Core().edit(draft,activeId,'quantity','5');persistLocal();globalThis.saves=0;peerApi.save=async(base,local)=>{saves++;return {...base,revision:2,draft:C.clone(local)}};`);
 if(event==='hidden'||event==='visible')h.document.visibilityState=event;
 for(const fn of h.lifecycle[event==='hidden'||event==='visible'?'visibilitychange':event])fn({});
 await h.run('peerFlight');assert.equal(h.run('saves'),1);assert.equal(h.run('cloudPending'),false);assert.equal(h.run('draft.items[activeId].quantity'),'5');
});
test('offline then online retains local backup and retries the unchanged value',async()=>{
 const h=setup();h.run(`Core().edit(draft,activeId,'stock','0');persistLocal();peerApi.save=async(base,local)=>({...base,revision:2,draft:C.clone(local)});`);
 h.lifecycle.offline[0]();assert.equal(h.run('cloudPending'),true);assert.equal(JSON.parse(h.saved.get(h.run('KEY'))).draft.items['kr:7'].stock,'0');
 h.lifecycle.online[0]();await h.run('peerFlight');assert.equal(h.run('cloudPending'),false);assert.equal(h.run('draft.items[activeId].stock'),'0');
});
test('storage event from another tab blocks upload and preserves this tab input',async()=>{
 const h=setup();h.run(`Core().edit(draft,activeId,'quantity','8');persistLocal();peerApi.save=async()=>{throw Error('must not upload')};`);
 h.lifecycle.storage[0]({key:h.run('KEY'),newValue:'different tab'});await h.run('peerSave()');assert.equal(h.run('localConflict'),true);assert.equal(h.run('draft.items[activeId].quantity'),'8');assert.equal(h.run('cloudPending'),true);
});
test('storage echo and unrelated key do not falsely lock shared editing',()=>{
 const h=setup();h.run('persistLocal()');h.lifecycle.storage[0]({key:h.run('KEY'),newValue:h.run('lastLocalRaw')});h.lifecycle.storage[0]({key:'unrelated',newValue:'changed'});assert.equal(h.run('localConflict'),false);
});
for(const guard of ['localSaveFailed','localBlocked','cloudConflict','localConflict'])test(`${guard} prevents a retry from falsely confirming cloud save`,async()=>{
 const h=setup();h.run(`Core().edit(draft,activeId,'quantity','6');persistLocal();${guard}=true;globalThis.saves=0;peerApi.save=async()=>{saves++;throw Error('must not upload')};`);
 await h.run('peerSave()');assert.equal(h.run('saves'),0);assert.equal(h.run('cloudPending'),true);assert.equal(h.run('draft.items[activeId].quantity'),'6');
});
test('retry after transient failure saves latest input once and clears failed status',async()=>{
 const h=setup();h.run(`Core().edit(draft,activeId,'quantity','1');persistLocal();peerApi.save=async()=>{throw Error('offline')};`);await h.run('peerSave()');assert.equal(h.run('cloudPhase'),'failed');
 h.run(`Core().edit(draft,activeId,'quantity','12');persistLocal();globalThis.saves=0;peerApi.save=async(base,local)=>{saves++;return {...base,revision:2,draft:C.clone(local)}};`);await h.run('peerSave()');assert.equal(h.run('saves'),1);assert.equal(h.run('cloudPhase'),'saved');assert.equal(h.run('peerBase.draft.items[activeId].quantity'),'12');
});
