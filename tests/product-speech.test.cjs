const {test}=require('node:test');
const assert=require('node:assert/strict');
const Speech=require('../redesign-preview/product-speech.cjs');
const Flow=require('../redesign-preview/count-flow.cjs');
const products=require('../current-order.json').products;
const tap=()=>({isTrusted:true});

function device(options={}){
 let clock=0,nextTimer=1;
 const storage=new Map(),writes=[],utterances=[],spoken=[],cancelled=[],resumed=[],activity=[],timers=new Map(),documentEvents=new Map(),windowEvents=new Map();
 if(options.saved!==undefined)storage.set('speech',options.saved);
 const win={document:{hidden:false,visibilityState:'visible',addEventListener(type,fn){documentEvents.set(type,fn);}},
  addEventListener(type,fn){windowEvents.set(type,fn);},
  localStorage:{getItem(key){if(options.readThrows)throw Error('blocked storage');return storage.get(key)||null;},
   setItem(key,value){if(options.writeThrows)throw Error('quota');storage.set(key,value);writes.push({key,value});}},
  setTimeout(fn,ms){if(options.timerThrows)throw Error('timer unavailable');const id=nextTimer++;timers.set(id,{fn,at:clock+ms});return id;},
  clearTimeout(id){timers.delete(id);}};
 class Utterance{
  constructor(text){if(options.constructorThrows)throw Error('no utterance');this.text=text;utterances.push(this);
   if(options.langThrows)Object.defineProperty(this,'lang',{set(){throw Error('bad language');}});
   if(options.voiceThrows)Object.defineProperty(this,'voice',{set(){throw Error('bad voice');}});
  }
 }
 let pending=[];
 const synth={
  paused:options.paused===true,speaking:false,
  getVoices(){if(options.voicesThrows)throw Error('voices unavailable');return options.voices??[];},
  speak(utterance){
   if(options.speakThrows)throw Error('speech unavailable');
   spoken.push(utterance);pending.push(utterance);
   options.onSpeak?.(utterance);
   if(options.autoStart&&!this.paused){this.speaking=true;utterance.onstart?.();}
   if(options.autoEnd){pending=pending.filter(x=>x!==utterance);this.speaking=false;utterance.onend?.();}
   if(options.autoError){pending=pending.filter(x=>x!==utterance);this.speaking=false;utterance.onerror?.({error:'not-allowed'});}
  },
  cancel(){cancelled.push(pending.slice());const old=pending;pending=[];this.speaking=false;
   for(const utterance of old){if(options.cancelEnds)utterance.onend?.();if(options.cancelErrors)utterance.onerror?.({error:'interrupted'});}
   options.onCancel?.();if(options.cancelThrows)throw Error('cancel unavailable');
  },
  resume(){resumed.push(pending.slice());options.onResume?.();if(options.resumeThrows)throw Error('resume unavailable');
   this.paused=false;
   if(options.resumeStarts&&pending[0]){this.speaking=true;pending[0].onstart?.();}
  }
 };
 win.speechSynthesis=synth;win.SpeechSynthesisUtterance=Utterance;
 if(options.missing==='synth')delete win.speechSynthesis;
 if(options.missing==='utterance')delete win.SpeechSynthesisUtterance;
 if(options.missing==='speak')delete synth.speak;
 if(options.missing==='cancel')delete synth.cancel;
 if(options.missing==='voices')delete synth.getVoices;
 if(options.storageGetterThrows)Object.defineProperty(win,'localStorage',{get(){throw Error('blocked storage');}});
 if(options.synthGetterThrows)Object.defineProperty(win,'speechSynthesis',{get(){throw Error('blocked speech');}});
 const controller=Speech.create(win,{key:'speech',onActiveChange(value){activity.push(value);options.onActive?.(value,controller);}});
 function advance(ms){const target=clock+ms;let guard=1000;while(guard--){
  const first=[...timers.entries()].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
  if(!first)break;const [id,t]=first;timers.delete(id);clock=t.at;t.fn();
 }clock=target;}
 return {win,controller,options,storage,writes,utterances,spoken,cancelled,resumed,activity,timers,advance,
  hidden(){win.document.hidden=true;win.document.visibilityState='hidden';documentEvents.get('visibilitychange')?.();},
  visible(){win.document.hidden=false;win.document.visibilityState='visible';documentEvents.get('visibilitychange')?.();},
  pagehide(){windowEvents.get('pagehide')?.();},pending:()=>pending.slice(),
  start(u=spoken.at(-1)){synth.speaking=true;u.onstart?.();},end(u=spoken.at(-1)){pending=pending.filter(x=>x!==u);synth.speaking=false;u.onend?.();},
  error(u=spoken.at(-1),error='synthesis-failed'){pending=pending.filter(x=>x!==u);synth.speaking=false;u.onerror?.({error});}};
}

test('speech defaults off, performs no writes or playback and has no active-state callback at construction',()=>{
 const d=device();assert.equal(d.controller.support(),true);assert.deepEqual(d.controller.settings(),{enabled:false});
 assert.equal(d.controller.active(),false);assert.equal(d.controller.speak('腐竹',tap()),false);
 assert.deepEqual(d.activity,[]);assert.deepEqual(d.spoken,[]);assert.deepEqual(d.writes,[]);assert.equal(d.timers.size,0);
});
test('speech saves only a separate device preference, and restored opt-in does not autoplay',()=>{
 const d=device();assert.deepEqual(d.controller.set(true),{enabled:true});
 assert.deepEqual(d.writes,[{key:'speech',value:'{"enabled":true}'}]);assert.equal(d.storage.size,1);
 const r=device({saved:d.storage.get('speech')});assert.deepEqual(r.controller.settings(),{enabled:true});
 assert.equal(r.spoken.length,0);assert.equal(r.controller.active(),false);assert.equal(r.writes.length,0);
});
for(const saved of ['{broken','null','[]','{}','{"enabled":1}','{"enabled":"true"}','true']){
 test(`invalid speech preference starts safely disabled: ${saved}`,()=>{
  const d=device({saved});assert.deepEqual(d.controller.settings(),{enabled:false});assert.equal(d.controller.speak('水饺',tap()),false);
 });
}
for(const missing of ['synth','utterance','speak','cancel']){
 test(`missing ${missing} cannot be enabled or block an app action`,()=>{
  const d=device({missing,saved:'{"enabled":true}'});assert.equal(d.controller.support(),false);
  assert.deepEqual(d.controller.set(true),{enabled:false});assert.equal(d.controller.speak('水饺',tap()),false);
  assert.doesNotThrow(()=>d.controller.stop());assert.equal(d.spoken.length,0);
 });
}
for(const option of ['readThrows','writeThrows','storageGetterThrows','synthGetterThrows']){
 test(`${option} never prevents a quantity action or throws to the caller`,()=>{
  const d=device({[option]:true});assert.doesNotThrow(()=>d.controller.set(true));let changed=false;
  assert.doesNotThrow(()=>{d.controller.speak('腐竹',tap());changed=true;});assert.equal(changed,true);
  assert.equal(d.controller.settings().enabled,option!=='synthGetterThrows');
 });
}
test('a copied settings object cannot enable speech',()=>{
 const d=device();d.controller.settings().enabled=true;assert.equal(d.controller.settings().enabled,false);
 assert.equal(d.controller.speak('水饺',tap()),false);
});
for(const on of [false,0,1,'true',undefined,null,{}]){
 test(`only true enables narration: ${String(on)}`,()=>{
  const d=device();d.controller.set(on);assert.equal(d.controller.settings().enabled,false);assert.equal(d.spoken.length,0);
 });
}
for(const event of [undefined,null,{},false,{isTrusted:false},{isTrusted:1}]){
 test(`absent or untrusted speech event is rejected: ${JSON.stringify(event)}`,()=>{
  const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());const current=d.spoken[0];
  assert.equal(d.controller.speak('水饺',event),false);assert.equal(d.spoken.length,1);assert.equal(d.controller.active(),true);
  assert.equal(d.cancelled.length,0);assert.equal(current.onend instanceof Function,true);
 });
}
for(const value of ['', '   ',null,123,{},'a'.repeat(Speech.MAX_NAME_LENGTH+1),'腐\u0000竹','腐\n竹','腐\u007f竹','\ud800','\udfff']){
 test(`invalid product name never cancels the currently valid name: ${JSON.stringify(value).slice(0,45)}`,()=>{
  const d=device();d.controller.set(true);d.controller.speak('水饺',tap());
  assert.equal(d.controller.speak(value,tap()),false);assert.equal(d.spoken.length,1);assert.equal(d.cancelled.length,0);assert.equal(d.controller.active(),true);
 });
}
for(const [name,lang] of [['腐竹','zh-CN'],['水饺','zh-CN'],['감자','ko-KR'],['알배기배추','ko-KR'],['PB 去油污洗洁剂','zh-CN'],['피비 PB','ko-KR'],['PB','en-US'],['100','zh-CN'],['玉米면','zh-CN'],['옥수수面','ko-KR'],['쥬스 🥤','ko-KR'],['  饮料 🥤  ','zh-CN']]){
 test(`primary name and matching speech language are preserved: ${name}`,()=>{
  const d=device();d.controller.set(true);assert.equal(d.controller.speak(name,tap()),true);
  assert.equal(d.spoken[0].text,name.trim());assert.equal(d.spoken[0].lang,lang);
  assert.equal(d.spoken[0].rate,1);assert.equal(d.spoken[0].pitch,1);assert.equal(d.spoken[0].volume,1);
  assert.equal(d.controller.active(),true);assert.deepEqual(d.activity,[true]);
 });
}
test('markup-shaped product names are passed as inert text, never interpreted as HTML',()=>{
 const d=device(),name='<img src=x onerror=alert(1)>腐竹';d.controller.set(true);d.controller.speak(name,tap());
 assert.equal(d.spoken[0].text,name);assert.equal(d.spoken.length,1);
});
test('maximum supported primary name is accepted without truncation',()=>{
 const d=device(),name='菜'.repeat(Speech.MAX_NAME_LENGTH);d.controller.set(true);assert.equal(d.controller.speak(name,tap()),true);
 assert.equal(d.spoken[0].text,name);
});
test('getVoices may be missing or temporarily empty and never delays the fresh gesture',()=>{
 for(const options of [{},{missing:'voices'},{voicesThrows:true},{voices:'not a voice array'}]){
  const d=device(options);d.controller.set(true);const result=d.controller.speak('水饺',tap());
  assert.equal(result,true);assert.equal(typeof result?.then,'undefined');assert.equal(d.spoken[0].lang,'zh-CN');assert.equal(d.spoken[0].voice,undefined);
 }
});
test('later-loaded voices are used by the next fresh tap without replaying a stale name',()=>{
 const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());d.end();
 const voice={name:'普通话',lang:'zh-CN',localService:true};d.options.voices=[voice];
 assert.equal(d.spoken.length,1);d.controller.speak('水饺',tap());assert.equal(d.spoken[1].voice,voice);assert.equal(d.spoken[1].text,'水饺');
});
test('voice choice prefers local speech in the same language over a remote exact-region voice',()=>{
 const remote={lang:'zh-CN',localService:false},local={lang:'zh-TW',localService:true};
 const d=device({voices:[remote,{lang:'en-US',localService:true},local]});d.controller.set(true);d.controller.speak('腐竹',tap());
 assert.equal(d.spoken[0].voice,local);
});
test('exact Mandarin region wins among local voices',()=>{
 const traditional={lang:'zh-TW',localService:true,default:true},mainland={lang:'zh_CN',localService:true};
 assert.equal(Speech.voiceFor([traditional,mainland],'zh-CN'),mainland);
});
test('Korean words use a Korean voice even when a Chinese voice is default',()=>{
 const ko={lang:'ko-KR',localService:true},zh={lang:'zh-CN',localService:true,default:true};
 const d=device({voices:[zh,ko]});d.controller.set(true);d.controller.speak('감자',tap());assert.equal(d.spoken[0].voice,ko);
});
test('Latin-only codes can use an English voice without changing their displayed name',()=>{
 const en={lang:'en-US',localService:true};const d=device({voices:[{lang:'zh-CN',localService:true},en]});
 d.controller.set(true);d.controller.speak('PB',tap());assert.equal(d.spoken[0].voice,en);assert.equal(d.spoken[0].text,'PB');
});
test('Cantonese and unrelated default voices are not chosen for Mandarin names',()=>{
 for(const lang of ['zh-HK','zh-MO','yue-HK','en-US','ko-KR'])assert.equal(Speech.voiceFor([{lang,localService:true,default:true}],'zh-CN'),null);
});
test('Mandarin cmn voices and language-only voices are valid fallbacks',()=>{
 for(const lang of ['zh','cmn','cmn-Hans-CN','zh-Hans-CN']){const voice={lang};assert.equal(Speech.voiceFor([voice],'zh-CN'),voice);}
 for(const lang of ['ko','en']){const voice={lang};assert.equal(Speech.voiceFor([voice],lang==='ko'?'ko-KR':'en-US'),voice);}
});
test('equal voice matches have stable device order with default preferred at equal quality',()=>{
 const a={lang:'ko-KR',localService:true},b={lang:'ko-KR',localService:true};assert.equal(Speech.voiceFor([a,b],'ko-KR'),a);
 b.default=true;assert.equal(Speech.voiceFor([a,b],'ko-KR'),b);
});
test('malformed voices and throwing voice property access are ignored independently',()=>{
 const bad={get lang(){throw Error('broken voice');}},good={lang:'ko-KR',localService:true};
 assert.equal(Speech.voiceFor([null,{},bad,good],'ko-KR'),good);
});
test('one trusted event cannot produce duplicate narration, even after completion',()=>{
 const d=device(),event=tap();d.controller.set(true);assert.equal(d.controller.speak('水饺',event),true);
 assert.equal(d.controller.speak('水饺',event),false);d.end();assert.equal(d.controller.speak('水饺',event),false);
 assert.equal(d.spoken.length,1);assert.equal(d.cancelled.length,0);
});
test('an explicitly repeated tap on the same product starts a new latest announcement',()=>{
 const d=device();d.controller.set(true);d.controller.speak('水饺',tap());d.controller.speak('水饺',tap());
 assert.equal(d.spoken.length,2);assert.equal(d.cancelled.length,1);assert.deepEqual(d.pending(),[d.spoken[1]]);assert.equal(d.controller.active(),true);
});
test('rapidly choosing different products cancels older names instead of queueing',()=>{
 const d=device();d.controller.set(true);for(const name of ['腐竹','水饺','감자','鸡精','大葱'])d.controller.speak(name,tap());
 assert.equal(d.spoken.length,5);assert.equal(d.cancelled.length,4);assert.deepEqual(d.pending().map(u=>u.text),['大葱']);
 d.end();assert.equal(d.controller.active(),false);assert.equal(d.timers.size,0);
});
for(const endKind of ['end','error']){
 test(`late ${endKind} callback from a cancelled product cannot unmute the next product`,()=>{
  const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());const old=d.spoken[0],callback=endKind==='end'?old.onend:old.onerror;
  d.controller.speak('水饺',tap());callback();assert.equal(d.controller.active(),true);assert.equal(d.activity.at(-1),true);
  assert.deepEqual(d.pending().map(u=>u.text),['水饺']);d.end();assert.equal(d.controller.active(),false);
 });
}
test('late onstart from a cancelled product cannot arm a watchdog or cancel the latest product',()=>{
 const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());const onstart=d.spoken[0].onstart;
 d.controller.speak('水饺',tap());const size=d.timers.size;onstart();assert.equal(d.timers.size,size);d.start();
 d.advance(Speech.START_TIMEOUT_MS);assert.equal(d.controller.active(),true);assert.equal(d.pending()[0].text,'水饺');
});
for(const option of ['cancelEnds','cancelErrors','cancelThrows']){
 test(`platform ${option} cannot interfere with replacement narration`,()=>{
  const d=device({[option]:true});d.controller.set(true);d.controller.speak('腐竹',tap());
  assert.doesNotThrow(()=>d.controller.speak('水饺',tap()));assert.equal(d.controller.active(),true);assert.equal(d.pending()[0].text,'水饺');
 });
}
test('synchronous platform start/end returns immediately with no stuck mute or timer',()=>{
 const d=device({autoStart:true,autoEnd:true});d.controller.set(true);assert.equal(d.controller.speak('水饺',tap()),true);
 assert.deepEqual(d.activity,[true,false]);assert.equal(d.controller.active(),false);assert.equal(d.timers.size,0);
});
test('synchronous platform error restores sound without throwing or disabling future speech',()=>{
 const d=device({autoError:true});d.controller.set(true);assert.equal(d.controller.speak('水饺',tap()),true);
 assert.equal(d.controller.active(),false);assert.deepEqual(d.activity,[true,false]);assert.equal(d.controller.settings().enabled,true);
 d.options.autoError=false;assert.equal(d.controller.speak('腐竹',tap()),true);
});
test('a never-starting platform is cancelled after a bounded delay and never replays old text',()=>{
 const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());const callback=d.spoken[0].onstart;
 d.advance(Speech.START_TIMEOUT_MS-1);assert.equal(d.controller.active(),true);d.advance(1);assert.equal(d.controller.active(),false);
 assert.equal(d.cancelled.length,1);assert.equal(d.pending().length,0);callback();assert.equal(d.timers.size,0);d.advance(20000);assert.equal(d.spoken.length,1);
});
test('started speech has a longer bounded timeout, preventing a permanent muted keypad',()=>{
 const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());d.advance(500);d.start();
 d.advance(Speech.SPEAK_TIMEOUT_MS-1);assert.equal(d.controller.active(),true);d.advance(1);assert.equal(d.controller.active(),false);
 assert.equal(d.pending().length,0);assert.equal(d.cancelled.length,1);assert.equal(d.controller.settings().enabled,true);
});
test('duplicate start events cannot extend the speech watchdog indefinitely',()=>{
 const d=device();d.controller.set(true);d.controller.speak('水饺',tap());d.start();d.advance(500);d.start();
 assert.equal(d.timers.size,1);d.advance(Speech.SPEAK_TIMEOUT_MS-501);assert.equal(d.controller.active(),true);d.advance(1);assert.equal(d.controller.active(),false);
});
test('a 2.2 second platform startup is allowed without delaying the caller or replaying speech',()=>{
 const d=device();d.options.onSpeak=u=>d.win.setTimeout(()=>d.start(u),2200);d.controller.set(true);
 let actionRan=false;assert.equal(d.controller.speak('水饺',tap()),true);actionRan=true;
 assert.equal(actionRan,true);assert.equal(d.spoken.length,1);assert.equal(d.win.speechSynthesis.speaking,false);
 d.advance(1800);assert.equal(d.controller.active(),true);assert.equal(d.cancelled.length,0);
 d.advance(400);assert.equal(d.win.speechSynthesis.speaking,true);assert.equal(d.cancelled.length,0);
 d.end();assert.equal(d.controller.active(),false);assert.equal(d.timers.size,0);assert.equal(d.spoken.length,1);
});
test('missing onstart preserves a speaking engine until its normal end event',()=>{
 const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());d.win.speechSynthesis.speaking=true;
 d.advance(Speech.START_TIMEOUT_MS);assert.equal(d.cancelled.length,0);assert.equal(d.controller.active(),true);assert.equal(d.timers.size,1);
 d.advance(200);d.end();assert.equal(d.controller.active(),false);assert.equal(d.timers.size,0);assert.equal(d.cancelled.length,0);assert.equal(d.spoken.length,1);
});
test('missing start and end events with a permanently speaking engine have one bounded completion window',()=>{
 const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());d.win.speechSynthesis.speaking=true;
 d.advance(Speech.START_TIMEOUT_MS);assert.equal(d.controller.active(),true);assert.equal(d.cancelled.length,0);
 d.advance(Speech.SPEAK_TIMEOUT_MS-1);assert.equal(d.controller.active(),true);d.advance(1);
 assert.equal(d.controller.active(),false);assert.equal(d.cancelled.length,1);assert.equal(d.timers.size,0);assert.equal(d.pending().length,0);
 d.advance(60000);assert.equal(d.spoken.length,1);assert.equal(d.resumed.length,0);assert.equal(d.controller.settings().enabled,true);
});
test('a late onstart after the speaking-state fallback cannot extend its completion deadline',()=>{
 const d=device();d.controller.set(true);d.controller.speak('水饺',tap());d.win.speechSynthesis.speaking=true;
 d.advance(Speech.START_TIMEOUT_MS);d.advance(500);d.start();d.advance(Speech.SPEAK_TIMEOUT_MS-500);
 assert.equal(d.controller.active(),false);assert.equal(d.cancelled.length,1);assert.equal(d.timers.size,0);
});
test('a queued stale start-timeout callback cannot cancel speech whose start event already arrived',()=>{
 const d=device();d.controller.set(true);d.controller.speak('水饺',tap());const callback=[...d.timers.values()][0].fn;
 d.start();d.win.speechSynthesis.speaking=false;callback();assert.equal(d.controller.active(),true);assert.equal(d.cancelled.length,0);assert.equal(d.timers.size,1);
 d.end();assert.equal(d.controller.active(),false);
});
test('stale startup and completion watchdogs cannot affect the latest product',()=>{
 const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());const startTimeout=[...d.timers.values()][0].fn;
 d.start();const endTimeout=[...d.timers.values()][0].fn;d.controller.speak('水饺',tap());
 const cancels=d.cancelled.length,timers=d.timers.size;startTimeout();endTimeout();
 assert.equal(d.controller.active(),true);assert.equal(d.cancelled.length,cancels);assert.equal(d.timers.size,timers);assert.equal(d.pending()[0].text,'水饺');
});
test('a throwing speaking-state getter cannot leave the startup watchdog unbounded',()=>{
 const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());
 Object.defineProperty(d.win.speechSynthesis,'speaking',{get(){throw Error('state unavailable');},set(){}});
 assert.doesNotThrow(()=>d.advance(Speech.START_TIMEOUT_MS));assert.equal(d.controller.active(),false);assert.equal(d.cancelled.length,1);assert.equal(d.timers.size,0);
});
test('a missed hidden-page event still stops speech at the speaking-state fallback',()=>{
 const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());d.win.speechSynthesis.speaking=true;d.win.document.hidden=true;
 d.advance(Speech.START_TIMEOUT_MS);assert.equal(d.controller.active(),false);assert.equal(d.cancelled.length,1);assert.equal(d.timers.size,0);
});
test('a paused engine resumes synchronously after this gesture queues its utterance',()=>{
 const calls=[],d=device({paused:true,resumeStarts:true,onSpeak:()=>calls.push('speak'),onResume:()=>calls.push('resume')});d.controller.set(true);
 assert.equal(d.resumed.length,0);assert.equal(d.controller.speak('水饺',tap()),true);calls.push('quantity action');
 assert.deepEqual(calls,['speak','resume','quantity action']);assert.equal(d.resumed.length,1);assert.equal(d.resumed[0][0],d.spoken[0]);
 assert.equal(d.win.speechSynthesis.paused,false);assert.equal(d.controller.active(),true);
 d.end();assert.equal(d.controller.active(),false);assert.equal(d.timers.size,0);
});
test('a running engine is never resumed or delayed unnecessarily',()=>{
 const d=device({autoStart:true});d.controller.set(true);d.controller.speak('水饺',tap());assert.equal(d.resumed.length,0);assert.equal(d.spoken.length,1);d.end();
});
for(const ended of ['autoEnd','autoError']){
 test('resume is skipped when the native call already completed: '+ended,()=>{
  const d=device({paused:true,[ended]:true});d.controller.set(true);d.controller.speak('水饺',tap());
  assert.equal(d.controller.active(),false);assert.equal(d.resumed.length,0);assert.equal(d.timers.size,0);
 });
}
for(const changed of ['hidden','disabled','superseded']){
 test('native-call state changes prevent resuming an obsolete utterance: '+changed,()=>{
  const d=device({paused:true});let changedOnce=false;
  d.options.onSpeak=()=>{if(changedOnce)return;changedOnce=true;
   if(changed==='hidden')d.hidden();else if(changed==='disabled')d.controller.set(false);else d.controller.speak('鸡精',tap());
  };
  d.controller.set(true);d.controller.speak('水饺',tap());
  if(changed==='superseded'){assert.equal(d.resumed.length,1);assert.equal(d.resumed[0][0].text,'鸡精');assert.equal(d.pending()[0].text,'鸡精');}
  else{assert.equal(d.resumed.length,0);assert.equal(d.controller.active(),false);}
 });
}
for(const failure of ['missing','throws','getter','paused-getter']){
 test('optional resume failure cannot block quantity actions or leave speech active indefinitely: '+failure,()=>{
  const d=device({paused:true,resumeThrows:failure==='throws'});
  if(failure==='missing')delete d.win.speechSynthesis.resume;
  if(failure==='getter')Object.defineProperty(d.win.speechSynthesis,'resume',{get(){throw Error('resume unavailable');}});
  if(failure==='paused-getter')Object.defineProperty(d.win.speechSynthesis,'paused',{get(){throw Error('pause state unavailable');}});
  d.controller.set(true);let actionRan=false;assert.doesNotThrow(()=>{d.controller.speak('水饺',tap());actionRan=true;});assert.equal(actionRan,true);
  d.advance(Speech.START_TIMEOUT_MS);assert.equal(d.controller.active(),false);assert.equal(d.timers.size,0);assert.equal(d.controller.settings().enabled,true);
 });
}
test('resume property access cannot resume a newer reentrant request through an older gesture',()=>{
 const d=device({paused:true});let replaced=false,calls=0;
 Object.defineProperty(d.win.speechSynthesis,'resume',{get(){
  if(!replaced){replaced=true;d.controller.speak('鸡精',tap());}
  return ()=>{calls++;d.win.speechSynthesis.paused=false;};
 }});
 d.controller.set(true);d.controller.speak('水饺',tap());assert.equal(calls,1);assert.equal(d.pending()[0].text,'鸡精');assert.equal(d.controller.active(),true);
});
test('persistent no-response engines can be retried by fresh taps without automatic replay',()=>{
 const d=device({paused:true});d.controller.set(true);
 for(let i=0;i<3;i++){
  assert.equal(d.controller.speak('水饺',tap()),true);assert.equal(d.spoken.length,i+1);d.advance(Speech.START_TIMEOUT_MS);
  assert.equal(d.controller.active(),false);assert.equal(d.pending().length,0);assert.equal(d.timers.size,0);
 }
 d.advance(60000);d.hidden();d.visible();assert.equal(d.spoken.length,3);assert.equal(d.cancelled.length,3);assert.equal(d.resumed.length,1);assert.equal(d.controller.settings().enabled,true);
});
for(const kind of ['end','error','stop','off','hidden','pagehide']){
 test(`${kind} immediately clears narration and timers, keeping only intended preference changes`,()=>{
  const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());d.start();const writes=d.writes.length;
  if(kind==='off')d.controller.set(false);else if(kind==='hidden')d.hidden();else if(kind==='pagehide')d.pagehide();else if(kind==='stop')d.controller.stop();else d[kind]();
  assert.equal(d.controller.active(),false);assert.equal(d.timers.size,0);assert.equal(d.activity.at(-1),false);
  assert.equal(d.controller.settings().enabled,kind!=='off');assert.equal(d.writes.length,writes+(kind==='off'?1:0));
  d.advance(30000);assert.equal(d.spoken.length,1);
 });
}
test('returning from the background never replays the previous name',()=>{
 const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());d.hidden();d.visible();d.advance(30000);
 assert.equal(d.spoken.length,1);assert.equal(d.controller.active(),false);d.controller.speak('水饺',tap());assert.equal(d.spoken.length,2);
});
test('a hidden fresh gesture also stops existing speech even without a lifecycle event',()=>{
 const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());d.win.document.hidden=true;
 assert.equal(d.controller.speak('水饺',tap()),false);assert.equal(d.controller.active(),false);assert.equal(d.spoken.length,1);
});
test('a late start while hidden is cancelled instead of talking from the background',()=>{
 const d=device();d.controller.set(true);d.controller.speak('腐竹',tap());d.win.document.hidden=true;d.start();
 assert.equal(d.controller.active(),false);assert.equal(d.pending().length,0);
});
for(const option of ['constructorThrows','langThrows','voiceThrows','speakThrows','timerThrows']){
 test(`${option} cannot leave sound muted or interrupt the business action`,()=>{
  const d=device({[option]:true,voices:[{lang:'zh-CN',localService:true}]});d.controller.set(true);let actionRan=false;
  assert.doesNotThrow(()=>{d.controller.speak('水饺',tap());actionRan=true;});assert.equal(actionRan,true);
  assert.equal(d.controller.active(),false);assert.equal(d.timers.size,0);
 });
}
test('a ducking callback failure cannot prevent speech or quantity input',()=>{
 const d=device({onActive(){throw Error('bad host callback');}});d.controller.set(true);
 assert.equal(d.controller.speak('腐竹',tap()),true);assert.equal(d.spoken.length,1);d.end();assert.equal(d.controller.active(),false);
});
test('disabling speech synchronously from its activity callback prevents playback',()=>{
 const d=device({onActive(on,controller){if(on)controller.set(false);}});d.controller.set(true);
 assert.equal(d.controller.speak('水饺',tap()),false);assert.equal(d.spoken.length,0);assert.equal(d.controller.active(),false);assert.equal(d.timers.size,0);
});
test('a newer selection inside the active callback supersedes the older selection',()=>{
 let replaced=false;const d=device({onActive(on,controller){if(on&&!replaced){replaced=true;controller.speak('水饺',tap());}}});d.controller.set(true);
 assert.equal(d.controller.speak('腐竹',tap()),false);assert.deepEqual(d.spoken.map(u=>u.text),['水饺']);assert.equal(d.controller.active(),true);
});
test('a newer selection inside the stop callback stays authoritative',()=>{
 let replaced=false;const d=device({onActive(on,controller){if(!on&&!replaced){replaced=true;controller.speak('鸡精',tap());}}});d.controller.set(true);
 d.controller.speak('腐竹',tap());assert.equal(d.controller.speak('水饺',tap()),false);
 assert.deepEqual(d.spoken.map(u=>u.text),['腐竹','鸡精']);assert.equal(d.pending()[0].text,'鸡精');assert.equal(d.controller.active(),true);
});
test('two controllers on different phones use the same rules but independent preferences',()=>{
 const first=device(),second=device();first.controller.set(true);
 assert.equal(first.controller.speak('腐竹',tap()),true);assert.equal(second.controller.speak('腐竹',tap()),false);
 second.controller.set(true);assert.equal(second.controller.speak('감자',tap()),true);assert.equal(first.spoken[0].lang,'zh-CN');assert.equal(second.spoken[0].lang,'ko-KR');
});

// The real catalog deliberately mixes Chinese and Korean primary names. Each
// item must remain pronounceable as its original name rather than an alias or
// the entire row (which would leak quantities into the announcement).
for(const product of products){
 test(`catalog narration preserves the original primary name and data: ${product.id} ${product.name}`,()=>{
  const before=JSON.stringify(product),voices=[{lang:'zh-CN',localService:true},{lang:'ko-KR',localService:true},{lang:'en-US',localService:true}];
  const d=device({voices});d.controller.set(true);
  assert.equal(d.controller.speak(Flow.largeName(product),tap()),true);
  assert.equal(d.spoken[0].text,product.name.trim());assert.ok(voices.includes(d.spoken[0].voice));
  assert.equal(JSON.stringify(product),before);d.start();d.end();assert.equal(d.controller.active(),false);assert.equal(d.timers.size,0);
 });
}
