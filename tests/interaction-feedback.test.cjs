const {test}=require('node:test');
const assert=require('node:assert/strict');
const Feedback=require('../redesign-preview/interaction-feedback.cjs');

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const tap=()=>({isTrusted:true});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function device(options={}){
 let clock=1000;
 const storage=new Map(),writes=[],contexts=[],vibrations=[];
 if(options.saved!==undefined)storage.set('test-feedback',options.saved);
 const win={document:{hidden:false,visibilityState:'visible'},performance:{now:()=>clock},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{writes.push({key,value});storage.set(key,value);}},
  navigator:{vibrate(n){if(options.vibrateThrows)throw Error('vibration denied');vibrations.push(n);return options.vibrateResult??true;}}};
 class Audio{
  constructor(settings){
   if(options.constructorThrows)throw Error('audio unavailable');
   this.options=settings;this.state=options.initial||'running';this.currentTime=10;this.destination={};this.nodes=[];this.resumeCalls=0;this.closeCalls=0;contexts.push(this);
  }
  createOscillator(){
   if(options.oscillatorThrows)throw Error('oscillator unavailable');
   const n={frequency:{values:[],setValueAtTime(v,t){this.values.push([v,t]);}},started:[],stopped:[],disconnects:0,
    connect(target){this.connected=target;},disconnect(){this.disconnects++;},
    start(t){if(options.startThrows)throw Error('audio start rejected');this.started.push(t);},
    stop(t){this.stopped.push(t);if(options.stopThrows)throw Error('already stopped');},
    end(){this.onended?.();}};
   this.nodes.push(n);return n;
  }
  createGain(){
   if(options.gainThrows)throw Error('gain unavailable');
   return {gain:{steps:[],setValueAtTime(v,t){this.steps.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.steps.push(['ramp',v,t]);}},disconnects:0,
    connect(target){this.connected=target;},disconnect(){this.disconnects++;}};
  }
  resume(){
   this.resumeCalls++;
   if(options.resumeThrows)throw Error('resume denied');
   if(options.resumePromise)return options.resumePromise;
   this.state='running';return Promise.resolve();
  }
  close(){this.closeCalls++;this.state='closed';if(options.closeThrows)throw Error('close failed');return Promise.resolve();}
 }
 if(options.webkit)win.webkitAudioContext=Audio;else win.AudioContext=Audio;
 if(options.noAudio){delete win.AudioContext;delete win.webkitAudioContext;}
 if(options.noVibration)delete win.navigator.vibrate;
 if(options.readThrows)win.localStorage.getItem=()=>{throw Error('storage denied');};
 if(options.writeThrows)win.localStorage.setItem=()=>{throw Error('storage denied');};
 const feedback=Feedback.create(win,{key:'test-feedback',soundMuted:options.soundMuted});
 return {win,feedback,contexts,vibrations,storage,writes,advance(ms=50){clock+=ms;},finish(){for(const c of contexts)for(const n of c.nodes)n.end();}};
}

test('feedback defaults stay silent without creating audio or writing order/device data',()=>{
 const d=device();assert.deepEqual(d.feedback.support(),{sound:true,vibration:true});
 assert.deepEqual(d.feedback.settings(),{sound:false,vibration:false});
 assert.equal(d.feedback.play(tap()),false);assert.equal(d.contexts.length,0);assert.deepEqual(d.vibrations,[]);assert.deepEqual(d.writes,[]);
});

test('only supported channels and strict boolean preferences are restored',()=>{
 const a=device({saved:'{"sound":true,"vibration":true}',noVibration:true});
 assert.deepEqual(a.feedback.settings(),{sound:true,vibration:false});assert.equal(a.contexts.length,0);
 const b=device({saved:'{"sound":"true","vibration":1}'});assert.deepEqual(b.feedback.settings(),{sound:false,vibration:false});
 const c=device({saved:'{"sound":true,"vibration":true}',noAudio:true});assert.deepEqual(c.feedback.settings(),{sound:false,vibration:true});
});

test('sound supports the prefixed WebKit constructor and never advertises missing vibration',()=>{
 const d=device({webkit:true,noVibration:true});assert.deepEqual(d.feedback.support(),{sound:true,vibration:false});
 d.feedback.set('sound',true);d.feedback.play(tap());assert.equal(d.contexts.length,1);
 assert.deepEqual(d.feedback.set('vibration',true),{sound:true,vibration:false});
});

test('set changes only the named channel and persists only feedback preferences',()=>{
 const d=device();d.feedback.set('sound',true);d.feedback.set('vibration',true);d.feedback.set('sound',false);
 assert.deepEqual(d.feedback.settings(),{sound:false,vibration:true});
 assert.deepEqual(JSON.parse(d.storage.get('test-feedback')),{sound:false,vibration:true});
 assert.equal(d.storage.size,1);assert.ok(d.writes.every(w=>w.key==='test-feedback'));
 const count=d.writes.length;assert.deepEqual(d.feedback.set('quantity',true),{sound:false,vibration:true});assert.equal(d.writes.length,count);
});

test('settings and capability return values cannot mutate the controller',()=>{
 const d=device();d.feedback.settings().sound=true;d.feedback.support().vibration=false;
 assert.deepEqual(d.feedback.settings(),{sound:false,vibration:false});assert.equal(d.feedback.support().vibration,true);
});

for(const options of [{saved:'{broken'},{readThrows:true},{writeThrows:true}]){
 test(`storage failure leaves feedback and the underlying action usable (${JSON.stringify(options)})`,()=>{
  const d=device(options);assert.doesNotThrow(()=>d.feedback.set('sound',true));
  assert.equal(d.feedback.settings().sound,true);assert.doesNotThrow(()=>d.feedback.play(tap()));assert.equal(d.contexts.length,1);
 });
}

test('blocked localStorage property and missing browser APIs are safe',()=>{
 const win={document:{visibilityState:'visible'},navigator:{}};
 Object.defineProperty(win,'localStorage',{get(){throw Error('sandbox denies storage');}});
 const f=Feedback.create(win,{key:'test-feedback'});
 assert.deepEqual(f.support(),{sound:false,vibration:false});assert.deepEqual(f.set('sound',true),{sound:false,vibration:false});
 assert.equal(f.play(tap()),false);assert.doesNotThrow(()=>f.stop());
});

test('untrusted and absent events never create audio or vibrate',()=>{
 const d=device();d.feedback.set('sound',true);d.feedback.set('vibration',true);
 for(const e of [undefined,null,{}, {isTrusted:false},{isTrusted:1}])assert.equal(d.feedback.play(e),false);
 assert.equal(d.contexts.length,0);assert.deepEqual(d.vibrations,[]);
});

test('hidden documents suppress playback while keeping the preferences enabled',()=>{
 const d=device();d.feedback.set('sound',true);d.feedback.set('vibration',true);d.win.document.visibilityState='hidden';
 assert.equal(d.feedback.play(tap()),false);assert.equal(d.contexts.length,0);assert.deepEqual(d.vibrations,[]);
 d.win.document.visibilityState='visible';d.win.document.hidden=true;assert.equal(d.feedback.play(tap()),false);
 assert.deepEqual(d.feedback.settings(),{sound:true,vibration:true});
});

test('accepted interaction produces one quiet 30 ms sound and one 8 ms vibration',()=>{
 const d=device();d.feedback.set('sound',true);d.feedback.set('vibration',true);
 const result=d.feedback.play(tap());assert.equal(result,true);assert.equal(typeof result?.then,'undefined');
 assert.deepEqual(d.vibrations,[8]);assert.equal(d.contexts.length,1);
 const c=d.contexts[0],n=c.nodes[0];assert.equal(c.options.latencyHint,'interactive');
 assert.deepEqual(n.started,[10]);assert.equal(n.stopped[0],10.03);
 assert.deepEqual(n.connected.gain.steps,[['set',0,10],['ramp',0.035,10.003],['ramp',0,10.03]]);
});

test('one gesture cannot be replayed even after cooldown and rapid separate gestures are bounded',()=>{
 const d=device();d.feedback.set('vibration',true);const event=tap();
 assert.equal(d.feedback.play(event),true);assert.equal(d.feedback.play(tap()),false);
 d.advance(39);assert.equal(d.feedback.play(tap()),false);d.advance(1);assert.equal(d.feedback.play(tap()),true);
 d.advance();assert.equal(d.feedback.play(event),false);assert.deepEqual(d.vibrations,[8,8]);
});

test('fresh taps reuse a single audio context and ended nodes disconnect',()=>{
 const d=device();d.feedback.set('sound',true);d.feedback.play(tap());const n=d.contexts[0].nodes[0],gain=n.connected;
 d.finish();assert.equal(n.disconnects,1);assert.equal(gain.disconnects,1);
 d.advance();d.feedback.play(tap());assert.equal(d.contexts.length,1);assert.equal(d.contexts[0].nodes.length,2);
});

test('unreported ended events cannot accumulate unlimited active nodes',()=>{
 const d=device();d.feedback.set('sound',true);
 for(let i=0;i<20;i++){d.feedback.play(tap());d.advance();}
 assert.equal(d.contexts.length,1);assert.equal(d.contexts[0].nodes.length,2);
 d.finish();assert.equal(d.feedback.play(tap()),true);assert.equal(d.contexts[0].nodes.length,3);
});

test('synchronous resume may play on the same trusted event without any await',()=>{
 const d=device({initial:'suspended'});d.feedback.set('sound',true);assert.equal(d.feedback.play(tap()),true);
 assert.equal(d.contexts[0].resumeCalls,1);assert.equal(d.contexts[0].nodes.length,1);
});

test('pending resume never delays the caller, queues tones, or repeatedly resumes',async()=>{
 const wait=deferred(),d=device({initial:'suspended',resumePromise:wait.promise});d.feedback.set('sound',true);
 const result=d.feedback.play(tap());let businessAction=false;businessAction=true;
 assert.equal(businessAction,true);assert.equal(typeof result,'boolean');assert.equal(d.contexts[0].nodes.length,0);
 for(let i=0;i<10;i++){d.advance();d.feedback.play(tap());}
 assert.equal(d.contexts[0].resumeCalls,1);assert.equal(d.contexts[0].nodes.length,0);
 d.advance(20000);d.contexts[0].state='running';wait.resolve();await settle();
 assert.equal(d.contexts[0].nodes.length,0,'an old tap must not sound 20 seconds later');
 assert.equal(d.feedback.play(tap()),true);assert.equal(d.contexts[0].nodes.length,1);
});

for(const cancel of ['disable','stop','hide']){
 test(`late resume after ${cancel} cannot replay an old sound`,async()=>{
  const wait=deferred(),d=device({initial:'suspended',resumePromise:wait.promise});d.feedback.set('sound',true);d.feedback.play(tap());const old=d.contexts[0];
  if(cancel==='disable')d.feedback.set('sound',false);else if(cancel==='stop')d.feedback.stop();else {d.win.document.hidden=true;d.feedback.play(tap());}
  wait.resolve();await settle();assert.equal(old.nodes.length,0);assert.equal(old.closeCalls,1);
 });
}

test('disabling sound immediately stops/disconnects active nodes but preserves vibration preference',()=>{
 const d=device();d.feedback.set('sound',true);d.feedback.set('vibration',true);d.feedback.play(tap());
 const c=d.contexts[0],n=c.nodes[0];d.feedback.set('sound',false);
 assert.equal(n.stopped.length,2);assert.equal(n.stopped[1],undefined);assert.equal(n.disconnects,1);assert.equal(c.closeCalls,1);
 assert.deepEqual(d.feedback.settings(),{sound:false,vibration:true});assert.deepEqual(d.vibrations,[8]);
});

test('disabling vibration cancels its pulse without interrupting enabled sound',()=>{
 const d=device();d.feedback.set('sound',true);d.feedback.set('vibration',true);d.feedback.play(tap());d.feedback.set('vibration',false);
 assert.deepEqual(d.vibrations,[8,0]);assert.equal(d.contexts[0].closeCalls,0);assert.equal(d.feedback.settings().sound,true);
});

test('stop releases both channels and the next fresh tap can create a new context',()=>{
 const d=device();d.feedback.set('sound',true);d.feedback.set('vibration',true);d.feedback.play(tap());const writes=d.writes.length;
 d.feedback.stop();assert.deepEqual(d.feedback.settings(),{sound:true,vibration:true});assert.equal(d.writes.length,writes);
 assert.deepEqual(d.vibrations,[8,0]);assert.equal(d.contexts[0].closeCalls,1);
 assert.equal(d.feedback.play(tap()),true);assert.equal(d.contexts.length,2);
});

test('a browser-closed context is replaced on the next gesture',()=>{
 const d=device();d.feedback.set('sound',true);d.feedback.play(tap());d.contexts[0].state='closed';d.advance();d.feedback.play(tap());
 assert.equal(d.contexts.length,2);assert.equal(d.contexts[1].nodes.length,1);
 assert.equal(d.contexts[0].nodes[0].disconnects,1,'closed-context nodes cannot consume the active-node limit');
 d.advance();d.feedback.play(tap());assert.equal(d.contexts[1].nodes.length,2);
});

test('resume rejection is swallowed and a later gesture can retry a fresh context',async()=>{
 const wait=deferred(),options={initial:'suspended',resumePromise:wait.promise},d=device(options);d.feedback.set('sound',true);d.feedback.play(tap());
 wait.reject(Error('autoplay blocked'));await settle();assert.equal(d.contexts[0].closeCalls,1);assert.equal(d.contexts[0].nodes.length,0);
 options.initial='running';delete options.resumePromise;d.advance();assert.equal(d.feedback.play(tap()),true);assert.equal(d.contexts.length,2);
});

test('a stale resume rejection cannot close a newly enabled context',async()=>{
 const wait=deferred(),options={initial:'suspended',resumePromise:wait.promise},d=device(options);d.feedback.set('sound',true);d.feedback.play(tap());
 d.feedback.set('sound',false);d.feedback.set('sound',true);options.initial='running';delete options.resumePromise;d.advance();d.feedback.play(tap());
 wait.reject(Error('old context denied'));await settle();assert.equal(d.contexts.length,2);assert.equal(d.contexts[1].closeCalls,0);assert.equal(d.contexts[1].nodes.length,1);
});

for(const field of ['constructorThrows','oscillatorThrows','gainThrows','startThrows','resumeThrows']){
 test(`audio ${field} never prevents the caller's underlying action`,()=>{
  const d=device({[field]:true,...(field==='resumeThrows'?{initial:'suspended'}:{})});d.feedback.set('sound',true);d.feedback.set('vibration',true);
  let actionRan=false;assert.doesNotThrow(()=>{d.feedback.play(tap());actionRan=true;});assert.equal(actionRan,true);assert.deepEqual(d.vibrations,[8]);
 });
}

test('vibration API failure does not silence working audio',()=>{
 const d=device({vibrateThrows:true});d.feedback.set('sound',true);d.feedback.set('vibration',true);assert.equal(d.feedback.play(tap()),true);
 assert.equal(d.contexts[0].nodes.length,1);assert.doesNotThrow(()=>d.feedback.stop());
});

test('API acceptance is only an attempt, not a promise that vibration hardware exists',()=>{
 const d=device({vibrateResult:false});d.feedback.set('vibration',true);assert.equal(d.feedback.support().vibration,true);
 assert.equal(d.feedback.play(tap()),true);assert.deepEqual(d.vibrations,[8]);
});

test('cleanup exceptions never escape when the app hides or a preference is disabled',()=>{
 const d=device({stopThrows:true,closeThrows:true});d.feedback.set('sound',true);assert.doesNotThrow(()=>d.feedback.play(tap()));
 assert.doesNotThrow(()=>d.feedback.set('sound',false));assert.doesNotThrow(()=>d.feedback.stop());
});

test('speech ducking suppresses only click sounds and preserves vibration and settings',()=>{
 const d=device({soundMuted:()=>true});d.feedback.set('sound',true);d.feedback.set('vibration',true);const writes=d.writes.length;
 assert.equal(d.feedback.play(tap()),true);assert.equal(d.contexts.length,0);assert.deepEqual(d.vibrations,[8]);
 assert.deepEqual(d.feedback.settings(),{sound:true,vibration:true});assert.equal(d.writes.length,writes);
});

test('temporarily muted taps never queue delayed click sounds after narration ends',()=>{
 let muted=true;const d=device({soundMuted:()=>muted});d.feedback.set('sound',true);
 for(let i=0;i<10;i++){d.feedback.play(tap());d.advance();}
 assert.equal(d.contexts.length,0);muted=false;assert.equal(d.contexts.length,0);
 assert.equal(d.feedback.play(tap()),true);assert.equal(d.contexts.length,1);assert.equal(d.contexts[0].nodes.length,1);
});

test('duckSound immediately releases a playing tone without closing its reusable context',()=>{
 const d=device();d.feedback.set('sound',true);d.feedback.set('vibration',true);d.feedback.play(tap());
 const c=d.contexts[0],n=c.nodes[0],gain=n.connected,writes=d.writes.length;
 d.feedback.duckSound();assert.deepEqual(n.stopped,[10.03,undefined]);assert.equal(n.disconnects,1);assert.equal(gain.disconnects,1);
 assert.equal(c.closeCalls,0);assert.deepEqual(d.vibrations,[8]);assert.equal(d.writes.length,writes);assert.deepEqual(d.feedback.settings(),{sound:true,vibration:true});
 d.advance();d.feedback.play(tap());assert.equal(d.contexts.length,1);assert.equal(c.nodes.length,2);
});

test('speech errors or completion can unmute the next tone on the existing audio context',()=>{
 let muted=false;const d=device({soundMuted:()=>muted});d.feedback.set('sound',true);d.feedback.play(tap());
 muted=true;d.feedback.duckSound();d.advance();assert.equal(d.feedback.play(tap()),false);assert.equal(d.contexts[0].nodes.length,1);
 muted=false;d.advance();assert.equal(d.feedback.play(tap()),true);assert.equal(d.contexts.length,1);assert.equal(d.contexts[0].nodes.length,2);
});

test('sound ducking while an audio resume is pending cannot replay the earlier tap',async()=>{
 let muted=false;const wait=deferred(),d=device({initial:'suspended',resumePromise:wait.promise,soundMuted:()=>muted});
 d.feedback.set('sound',true);d.feedback.play(tap());muted=true;d.feedback.duckSound();d.contexts[0].state='running';wait.resolve();await settle();
 assert.equal(d.contexts[0].nodes.length,0);d.advance();assert.equal(d.feedback.play(tap()),false);assert.equal(d.contexts[0].nodes.length,0);
 muted=false;d.advance();d.feedback.play(tap());assert.equal(d.contexts[0].nodes.length,1);
});

test('a failing speech mute callback cannot prevent normal feedback or the underlying app action',()=>{
 const d=device({soundMuted(){throw Error('speech controller failed');}});d.feedback.set('sound',true);let action=false;
 assert.doesNotThrow(()=>{d.feedback.play(tap());action=true;});assert.equal(action,true);assert.equal(d.contexts[0].nodes.length,1);
});

test('duckSound is safe before playback, after cleanup, and with a throwing oscillator stop',()=>{
 const d=device({stopThrows:true});assert.doesNotThrow(()=>d.feedback.duckSound());d.feedback.set('sound',true);d.feedback.play(tap());
 assert.doesNotThrow(()=>d.feedback.duckSound());assert.doesNotThrow(()=>d.feedback.duckSound());assert.doesNotThrow(()=>d.feedback.stop());
 assert.equal(d.contexts[0].nodes[0].disconnects,1);assert.equal(d.feedback.settings().sound,true);
});

test('speech muting does not enable a click sound that the user explicitly disabled',()=>{
 let muted=true;const d=device({soundMuted:()=>muted});d.feedback.set('vibration',true);d.feedback.play(tap());
 muted=false;d.advance();d.feedback.play(tap());assert.equal(d.contexts.length,0);assert.deepEqual(d.vibrations,[8,8]);
 assert.equal(d.feedback.settings().sound,false);
});
