const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Core=require('../count-core.js'),Backup=require('../redesign-preview/draft-backup.cjs'),Entry=require('../redesign-preview/entry-mode.cjs');
const fixture=JSON.parse(fs.readFileSync(require.resolve('../current-order.json'),'utf8'));
function harness(shared=new Map()){
 const events={},timers=[],h={remote:null,reads:0,writes:0,readWait:null,writeWait:null,failWrite:false};
 const document={body:{addEventListener(n,fn){events[n]=fn;},classList:{toggle(){},remove(){}}},getElementById(){return {};},querySelector(){return null;},querySelectorAll(){return [];},addEventListener(n,fn){events[n]=fn;}};
 const ctx=vm.createContext({document,Entry,window:{CountCore:Core,addEventListener(n,fn){events[n]=fn;}},navigator:{onLine:true},
 localStorage:{getItem(k){return shared.get(k)||null;},setItem(k,v){shared.set(k,v);}},
 setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){},console,Date,Intl,URL,URLSearchParams,
 C:require('../cloud/core.cjs'),A:require('../cloud/account.cjs'),S:require('../redesign-preview/search.cjs'),Flow:require('../redesign-preview/count-flow.cjs'),Feedback:require('../redesign-preview/interaction-feedback.cjs'),Speech:require('../redesign-preview/product-speech.cjs'),StockRepair:require('../redesign-preview/stock-unit-corrections.cjs'),Backup,
 fixture:structuredClone(fixture),crypto:{randomUUID:()=>String(Math.random()).slice(2)},
 doc:()=>({id:'owner'}),serverTimestamp:()=>({server:true}),
 getDocFromServer:async()=>{h.reads++;if(h.readWait)await h.readWait;const data=h.remote;return {exists:()=>!!data,data:()=>data};},
 runTransaction:async(db,fn)=>{if(h.failWrite)throw Error('network failure');await fn({get:async()=>({exists:()=>!!h.remote,data:()=>h.remote}),set(ref,data){h.remote=JSON.parse(JSON.stringify(data));h.writes++;}});if(h.writeWait)await h.writeWait;}});
 let js=fs.readFileSync(require.resolve('../redesign-preview/preview.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/boot\(\)\.catch\([\s\S]*$/,'');
 vm.runInContext(js,ctx);const run=s=>vm.runInContext(s,ctx);
 run(`source=fixture;render=()=>{};scrollActive=()=>{};toast=t=>globalThis.lastToast=t;loadLocal();if(!draft&&!localBlocked)ensureDraft();`);
 return Object.assign(h,{run,ctx,events,timers,shared,login(){run(`user={uid:'owner'};member={role:'owner',name:'大伟'};db={};backupUid='owner';`);},
 edit(value){ctx.value=value;run(`Core().edit(draft,'cn:9','quantity',value);draft.seen['cn:9']=true;pos=draft.catalog.findIndex(p=>p.id==='cn:9');field='qty';persistLocal();`);},
 record(){return JSON.parse(run('JSON.stringify(draftRecord())'));}});
}
function defer(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('each keystroke is local immediately; reload restores last digit and position before upload',()=>{
 const h=harness();h.edit('1');h.edit('12');assert.equal(h.writes,0);assert.equal(h.timers.at(-1).ms,1500);
 const re=harness(h.shared);assert.equal(re.run(`draft.items['cn:9'].quantity`),'12');assert.equal(re.run('pos'),h.run('pos'));assert.equal(re.run('field'),'qty');
 assert.match(re.run('backupMessage()'),/登录大伟/);
});
test('offline edits remain local and a reconnect retries latest snapshot',async()=>{
 const h=harness();h.login();h.edit('12');h.run('navigator.onLine=false');await h.run('flushCloud()');assert.equal(h.writes,0);assert.match(h.run('backupMessage()'),/离线/);
 h.run('navigator.onLine=true');await h.run('flushCloud()');await h.run('flushCloud()');
 assert.equal(JSON.parse(h.remote.body).draft.items['cn:9'].quantity,'12');assert.equal(h.run('cloudPending'),false);assert.match(h.run('backupMessage()'),/云端已备份/);
});
test('an older successful upload cannot claim a later edit is backed up; writes are serialized',async()=>{
 const h=harness();h.login();h.edit('1');await h.run('pullDraft()');
 const wait=defer();h.writeWait=wait.promise;const upload=h.run('flushCloud()');
 await Promise.resolve();h.edit('12');await h.run('flushCloud()');assert.equal(h.writes,1);
 wait.resolve();await upload;assert.equal(h.run('cloudPending'),true);assert.doesNotMatch(h.run('backupMessage()'),/云端已备份/);
 h.writeWait=null;await h.run('flushCloud()');assert.equal(JSON.parse(h.remote.body).draft.items['cn:9'].quantity,'12');assert.equal(h.run('cloudPending'),false);
});
test('legacy different drafts conflict regardless of device timestamp; neither copy overwritten',async()=>{
 const remote=harness();remote.edit('3');const h=harness();h.edit('12');h.login();h.remote=remote.record();
 await h.run('pullDraft()');assert.equal(h.run('cloudConflict'),true);assert.equal(h.run(`draft.items['cn:9'].quantity`),'12');assert.equal(h.writes,0);
 await h.run('flushCloud()');assert.equal(JSON.parse(h.remote.body).draft.items['cn:9'].quantity,'3');
});
test('startup blank draft recovers cloud; typing during read prevents replacement',async()=>{
 const remote=harness();remote.edit('3');const h=harness();h.login();h.remote=remote.record();await h.run('pullDraft()');assert.equal(h.run(`draft.items['cn:9'].quantity`),'3');
 const race=harness();race.login();race.remote=remote.record();const wait=defer();race.readWait=wait.promise;const read=race.run('pullDraft()');race.edit('12');wait.resolve();await read;
 assert.equal(race.run(`draft.items['cn:9'].quantity`),'12');assert.equal(race.run('cloudConflict'),true);
});
test('cloud changes during transaction fail closed; explicit remote recovery keeps a local copy',async()=>{
 const h=harness();h.login();h.edit('1');await h.run('pullDraft()');await h.run('flushCloud()');h.edit('12');
 const other=harness();other.edit('99');h.remote=other.record();await h.run('flushCloud()');assert.equal(h.run('cloudConflict'),true);assert.equal(h.run(`draft.items['cn:9'].quantity`),'12');
 await h.run('pullDraft(true)');assert.equal(h.run(`draft.items['cn:9'].quantity`),'99');
 const old=[...h.shared].filter(([k])=>k.includes(':recovery:')).map(([,v])=>JSON.parse(v));assert.ok(old.some(x=>x.draft.items['cn:9'].quantity==='12'));
});
test('failed cloud acknowledgement is not success and retry is idempotent',async()=>{
 const h=harness();h.login();h.edit('12');await h.run('pullDraft()');h.failWrite=true;await h.run('flushCloud()');assert.match(h.run('backupMessage()'),/失败/);assert.equal(h.run('cloudPending'),true);assert.ok(h.timers.some(t=>t.ms===5000));
 h.failWrite=false;await h.run('flushCloud()');const writes=h.writes;await h.run('flushCloud()');assert.equal(h.writes,writes);
 const tx={get:async()=>({exists:()=>true,data:()=>h.remote}),set(){throw Error('duplicate write');}};
 await Backup.compareAndSave(tx,{},null,h.remote);
});
test('other tab changes and corrupt local data are retained rather than silently replaced',()=>{
 const h=harness();h.edit('1');const newer=harness(h.shared);newer.edit('12');assert.throws(()=>h.edit('2'),/另一页面/);
 assert.equal(JSON.parse(h.shared.get('ccx-redesign-draft-v2')).draft.items['cn:9'].quantity,'12');
 const bad=new Map([['ccx-redesign-draft-v2','broken-json']]);const re=harness(bad);assert.equal(re.run('localBlocked'),true);assert.equal(bad.get('ccx-redesign-draft-v2'),'broken-json');assert.match(re.run('backupMessage()'),/读取失败/);
});
test('known unchanged cloud base accepts offline changes without trusting clocks',async()=>{
 const h=harness();h.login();h.edit('1');await h.run('pullDraft()');await h.run('flushCloud()');
 const re=harness(h.shared);re.login();re.remote=h.remote;re.edit('12');await re.run('pullDraft()');assert.equal(re.run('cloudConflict'),false);await re.run('flushCloud()');assert.equal(JSON.parse(re.remote.body).draft.items['cn:9'].quantity,'12');
});
