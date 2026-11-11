const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Core=require('../count-core.js');
const source=JSON.parse(fs.readFileSync(require.resolve('../current-order.json'),'utf8'));
const existing=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const harnessSource=existing.slice(existing.indexOf('function harness('),existing.indexOf("test('production mode"));
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${harnessSource};return harness;`)(require,Core,source);
function setup(role='owner'){
 const h=harness(true);h.ctx.confirm=()=>true;h.ctx.crypto=require('node:crypto').webcrypto;
 h.run(`peerEnabled=true;member={role:'${role}'};screen='more';paintBackupStatus=()=>{};
 peerBase={localId:draft.id,revision:1,stage:'draft',date:draft.date,draft:C.clone(draft)};peerLatest=peerBase;
 globalThis.head=C.clone(peerBase);globalThis.archives=[];globalThis.calls=0;
 peerApi={read:async()=>C.clone(head),newBlank:async(next,base)=>{calls++;archives.push(C.clone(head));head={localId:next.id,revision:head.revision+1,stage:'draft',date:next.date,draft:C.clone(next)};return C.clone(head);}};
 saveLocalEnvelope();`);return h;
}
function quota(h,all=false){const set=h.ctx.localStorage.setItem;h.ctx.localStorage.setItem=(k,v)=>{if(all||k.includes(':before-shared:')){const e=Error('The quota has been exceeded.');e.name='QuotaExceededError';throw e;}set(k,v);};}
for(const role of ['owner','editor'])test(`${role}: verified cloud draft can start blank when extra snapshot exceeds quota`,async()=>{
 const h=setup(role);quota(h);const before=h.run('JSON.stringify(draft)');await h.run('peerNewBlank()');
 assert.equal(h.run('calls'),1);assert.equal(h.run('JSON.stringify(archives[0].draft)'),before);
 assert.equal(h.run('draft.id'),h.run('head.localId'));assert.equal(h.run('localSaveFailed'),false);
 assert.match(h.run('globalThis.lastToast'),/已打开新的共同盘货/);
 assert.equal(JSON.parse(h.saved.get(h.run('KEY'))).draft.id,h.run('head.localId'));
});
test('unconfirmed local draft is preserved and cloud transition blocked on backup quota',async()=>{
 const h=setup();h.run(`peerBase=null;draft.items['kr:7'].quantity='9';`);quota(h);
 await assert.rejects(h.run('peerNewBlank()'),/本机.*空间|本机.*存储/);assert.equal(h.run('calls'),0);assert.equal(h.run("draft.items['kr:7'].quantity"),'9');
});
test('cloud-created blank followed by active-key quota must not announce success',async()=>{
 const h=setup();quota(h,true);await assert.rejects(h.run('peerNewBlank()'),/云端已新建.*本机保存失败/);
 assert.equal(h.run('calls'),1);assert.equal(h.run('archives.length'),1);assert.equal(h.run('localSaveFailed'),true);
 assert.doesNotMatch(h.run('globalThis.lastToast')||'',/已打开新的共同盘货/);
 await assert.rejects(h.run('peerNewBlank()'),/保存或同步/);assert.equal(h.run('calls'),1);
});
test('repeated cloud-confirmed new blanks do not accumulate local recovery snapshots',async()=>{
 const h=setup();for(let i=0;i<100;i++)await h.run('peerNewBlank()');
 assert.equal(h.run('calls'),100);assert.equal(h.run('archives.length'),100);
 assert.equal([...h.saved.keys()].filter(k=>k.includes(':before-shared:')).length,0);
});
for(const mutation of ["head.localId='different-id';head.draft.id=head.localId;", "head.draft.items['kr:7'].quantity='2';", "head.draft.catalog[0].name='different';"])test('fresh cloud mismatch requires backup: '+mutation,async()=>{
 const h=setup();h.run(mutation);quota(h);await assert.rejects(h.run('peerNewBlank()'),/本机存储/);assert.equal(h.run('calls'),0);
});
test('cancel does not create a snapshot or call the transition',async()=>{
 const h=setup();h.ctx.confirm=()=>false;quota(h,true);await h.run('peerNewBlank()');assert.equal(h.run('calls'),0);assert.equal(h.saved.size,1);
});
test('fresh server read failure preserves draft and does not create a snapshot',async()=>{
 const h=setup();const old=h.run('JSON.stringify(draft)');h.run(`peerApi.read=async()=>{throw Error('offline')}`);await assert.rejects(h.run('peerNewBlank()'),/offline/);assert.equal(h.run('JSON.stringify(draft)'),old);assert.equal(h.run('calls'),0);
});
test('failed transaction leaves old active storage and contents intact',async()=>{
 const h=setup();const before=h.saved.get(h.run('KEY'));h.run(`peerApi.newBlank=async()=>{throw Error('transaction rejected')}`);quota(h);
 await assert.rejects(h.run('peerNewBlank()'),/transaction rejected/);assert.equal(h.saved.get(h.run('KEY')),before);assert.equal(h.run('peerRestoreFlight'),null);
});
test('input during server read aborts before creating or overwriting anything',async()=>{
 const h=setup();h.run(`peerApi.read=async()=>{Core().edit(draft,'kr:7','quantity','8');return C.clone(head)}`);await assert.rejects(h.run('peerNewBlank()'),/读取期间内容变化/);assert.equal(h.run('calls'),0);assert.equal(h.run("draft.items['kr:7'].quantity"),'8');
});
test('input during newBlank is retained even if its recovery copy cannot be written',async()=>{
 const h=setup();h.run(`globalThis.originalNew=peerApi.newBlank;peerApi.newBlank=async(next,base)=>{const r=await originalNew(next,base);Core().edit(draft,'kr:7','quantity','8');return r;}`);quota(h);
 await assert.rejects(h.run('peerNewBlank()'),/本机存储/);assert.equal(h.run("draft.items['kr:7'].quantity"),'8');assert.equal(h.run('cloudConflict'),true);assert.equal(h.run('calls'),1);assert.doesNotMatch(h.run('globalThis.lastToast')||'',/已打开新的/);
});
test('zero, blank, deferred and text stocks are archived unchanged; next sheet is blank',async()=>{
 const h=setup();h.run(`Core().edit(draft,'kr:7','stock','0');Core().edit(draft,'kr:8','quantity','3');draft.deferred={'kr:8':true};draft.stockText={'kr:9':'半包'};head.draft=C.clone(draft);peerBase=C.clone(head);peerLatest=peerBase;saveLocalEnvelope();`);
 const old=h.run('JSON.stringify(draft)');quota(h);await h.run('peerNewBlank()');assert.equal(h.run('JSON.stringify(archives[0].draft)'),old);
 assert.equal(h.run(`draft.catalog.every(p=>!draft.items[p.id].stock&&!draft.items[p.id].quantity)`),true);assert.equal(h.run('Object.keys(draft.seen).length'),0);
});
test('existing recovery and unrelated storage bytes are never deleted',async()=>{
 const h=setup();h.saved.set('unknown','private');h.saved.set(h.run('KEY')+':before-shared:1','{old recovery}');quota(h);await h.run('peerNewBlank()');assert.equal(h.saved.get('unknown'),'private');assert.equal(h.saved.get(h.run('KEY')+':before-shared:1'),'{old recovery}');
});
