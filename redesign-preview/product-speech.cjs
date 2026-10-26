'use strict';

// This controller owns only device feedback. It never reads or writes orders.
// Start speech inside the accepted user gesture; do not await a voice download,
// queue old taps, or let delayed platform callbacks block quantity editing.
const START_TIMEOUT_MS=6000;
const SPEAK_TIMEOUT_MS=10000;
const MAX_NAME_LENGTH=160;

function languageOf(text){
 const script=String(text).match(/[\p{Script=Han}\p{Script=Hangul}]/u)?.[0];
 if(script)return /\p{Script=Hangul}/u.test(script)?'ko-KR':'zh-CN';
 return /[A-Za-z]/.test(text)?'en-US':'zh-CN';
}
function voiceFor(voices,lang){
 let best=null,score=-1;
 for(const voice of voices){
  try{
   const code=String(voice.lang||'').replaceAll('_','-').toLowerCase();
   const family=lang.slice(0,2);
   // Mandarin names should not acquire a Cantonese voice just because both
   // languages are sometimes advertised with the broad "zh" prefix.
   const match=family==='zh'?(/^(zh|cmn)(?:-|$)/.test(code)&&!/^zh-(hk|mo)(?:-|$)/.test(code)):
    code===family||code.startsWith(family+'-');
   if(!match)continue;
   const value=(voice.localService===true?100:0)+(code===lang.toLowerCase()?20:0)+(voice.default===true?1:0);
   if(value>score){best=voice;score=value;}
  }catch(e){}
 }
 return best;
}

function create(win,options={}){
 const key=options.key||'ccx-product-speech-v1';
 let synth=null,Utterance=null,storage=null,available=false;
 try{synth=win?.speechSynthesis;Utterance=win?.SpeechSynthesisUtterance;
  available=typeof Utterance==='function'&&typeof synth?.speak==='function'&&typeof synth?.cancel==='function';
 }catch(e){}
 try{storage=win?.localStorage;}catch(e){}
 let enabled=false;
 try{enabled=available&&JSON.parse(storage?.getItem(key)||'null')?.enabled===true;}catch(e){}
 let flight=null,generation=0;
 const events=new WeakSet();
 const support=()=>available;
 const settings=()=>({enabled});
 const active=()=>flight!==null;
 function visible(){
  try{return !!win?.document&&win.document.visibilityState!=='hidden'&&win.document.hidden!==true;}catch(e){return false;}
 }
 function notify(on){try{options.onActiveChange?.(on);}catch(e){}}
 function clearTimer(timer){
  if(timer===null)return;
  try{if(typeof win?.clearTimeout==='function')win.clearTimeout(timer);else clearTimeout(timer);}catch(e){}
 }
 function timer(fn,ms){
  const id=typeof win?.setTimeout==='function'?win.setTimeout(fn,ms):setTimeout(fn,ms);
  // Avoid keeping command-line validation alive; browser timer IDs are numbers.
  try{id?.unref?.();}catch(e){}
  return id;
 }
 function clearFlight(item){
  clearTimer(item.startTimer);clearTimer(item.endTimer);
  item.startTimer=null;item.endTimer=null;
  try{item.utterance.onstart=null;item.utterance.onend=null;item.utterance.onerror=null;}catch(e){}
 }
 function cancelEngine(){try{synth?.cancel();}catch(e){}}
 function finish(item,cancel=false){
  if(flight!==item)return;
  flight=null;generation++;clearFlight(item);
  // Invalidate the old callbacks before cancel(), which can fire synchronously.
  if(cancel)cancelEngine();
  // A callback from a hostile/broken engine must not unmute a newer utterance.
  if(flight===null)notify(false);
 }
 function stop(){
  if(flight)finish(flight,true);
 }
 function watchCompletion(item){
  if(flight!==item)return;
  if(!enabled||!visible()){finish(item,true);return;}
  if(item.started)return;
  item.started=true;
  clearTimer(item.startTimer);item.startTimer=null;
  clearTimer(item.endTimer);item.endTimer=null;
  try{item.endTimer=timer(()=>finish(item,true),SPEAK_TIMEOUT_MS);}catch(e){finish(item,true);}
 }
 function set(on){
  enabled=available&&on===true;
  if(!enabled)stop();
  try{storage?.setItem(key,JSON.stringify({enabled}));}catch(e){}
  return settings();
 }
 function speak(name,event){
  try{
   if(!available||!enabled||!event||event.isTrusted!==true)return false;
   if(!visible()){stop();return false;}
   if(typeof name!=='string')return false;
   const text=name.trim();
   if(!text||text.length>MAX_NAME_LENGTH||/[\u0000-\u001f\u007f]/.test(text)||/[\ud800-\udfff]/u.test(text))return false;
   if(events.has(event))return false;
   events.add(event);
   stop();
   // stop() may notify the host, so recheck a preference changed by that hook.
   if(flight||!enabled||!visible())return false;
   const utterance=new Utterance(text),lang=languageOf(text);
   utterance.lang=lang;utterance.rate=1;utterance.pitch=1;utterance.volume=1;
   let voices=[];
   try{const list=synth.getVoices?.();if(Array.isArray(list))voices=list.slice(0,4096);}catch(e){}
   const voice=voiceFor(voices,lang);if(voice)utterance.voice=voice;
   // Empty/later-loaded voice lists are valid: explicit lang lets the platform
   // choose. Re-read voices on the next tap; never replay a tap on voiceschanged.
   const item={id:++generation,utterance,started:false,startTimer:null,endTimer:null};
   flight=item;
   utterance.onstart=()=>watchCompletion(item);
   utterance.onend=()=>finish(item);
   utterance.onerror=()=>finish(item);
   notify(true);
   if(flight!==item||!enabled||!visible()){if(flight===item)finish(item,true);return false;}
   try{
    item.startTimer=timer(()=>{
     if(flight!==item||item.started)return;
     // A delayed/missing start event need not mean silent playback. Honor a
     // playing engine once, then retain a hard bound if it never finishes.
     let speaking=false;
     try{speaking=synth.speaking===true;}catch(e){}
     if(flight!==item||item.started)return;
     if(speaking)watchCompletion(item);else finish(item,true);
    },START_TIMEOUT_MS);
    synth.speak(utterance);
    // cancel() and speak() need not clear a platform's paused state. Recover
    // only this fresh visible gesture, after its utterance has been queued.
    try{
     if(flight===item&&enabled&&visible()&&synth.paused===true){
      const resume=synth.resume;
      if(typeof resume==='function'&&flight===item&&enabled&&visible())resume.call(synth);
     }
    }catch(e){}
    return true;
   }catch(e){finish(item,true);return false;}
  }catch(e){stop();return false;}
 }
 // Lifecycle cleanup belongs to feedback, independent of whether the page is
 // currently editing a row. Events never cause speech to start or resume.
 try{win?.document?.addEventListener?.('visibilitychange',()=>{if(!visible())stop();});}catch(e){}
 try{win?.addEventListener?.('pagehide',stop);}catch(e){}
 return {support,settings,set,speak,stop,active};
}

module.exports={create,languageOf,voiceFor,START_TIMEOUT_MS,SPEAK_TIMEOUT_MS,MAX_NAME_LENGTH};
