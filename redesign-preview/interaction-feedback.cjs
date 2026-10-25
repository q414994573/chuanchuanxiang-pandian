'use strict';

// Feedback is a device preference, never an order field or a save confirmation.
// WebKit does not expose the Vibration API:
// https://w3c.github.io/vibration/reports/implementation.html
// Start/resume audio only from a trusted gesture. Never await it before an action:
// https://webaudio.github.io/web-audio-api/#dom-audiocontext-resume
const GAP_MS=40;
const SOUND_SECONDS=0.03;

function create(win,options={}){
 const key=options.key||'ccx-interaction-feedback-v1';
 let Audio=null,nav=null,storage=null,canVibrate=false;
 try{Audio=win?.AudioContext||win?.webkitAudioContext;}catch(e){}
 try{nav=win?.navigator;}catch(e){}
 try{canVibrate=typeof nav?.vibrate==='function';}catch(e){}
 try{storage=win?.localStorage;}catch(e){}
 const available={sound:typeof Audio==='function',vibration:canVibrate};
 let prefs={sound:false,vibration:false};
 try{
  const saved=JSON.parse(storage?.getItem(key)||'null');
  prefs={sound:available.sound&&saved?.sound===true,vibration:available.vibration&&saved?.vibration===true};
 }catch(e){}

 let context=null,resuming=null,generation=0,lastAt=-Infinity,vibrationStarted=false;
 const active=new Set(),events=new WeakSet();
 const support=()=>({...available});
 const settings=()=>({...prefs});
 function visible(){
  try{return !!win?.document&&win.document.visibilityState!=='hidden'&&win.document.hidden!==true;}catch(e){return false;}
 }
 function now(){
  try{const n=win?.performance?.now();if(Number.isFinite(n))return n;}catch(e){}
  return Date.now();
 }
 function ignorePromise(value){
  try{if(value&&typeof value.then==='function')Promise.resolve(value).catch(()=>{});}catch(e){}
 }
 function release(node){
  active.delete(node);
  try{node.osc.onended=null;}catch(e){}
  try{node.osc.disconnect();}catch(e){}
  try{node.gain.disconnect();}catch(e){}
 }
 function stopSound(){
  generation++;resuming=null;
  for(const node of [...active]){
   try{node.osc.stop();}catch(e){}
   release(node);
  }
  const old=context;context=null;
  try{if(old&&old.state!=='closed')ignorePromise(old.close());}catch(e){}
 }
 function duckSound(){
  // Product narration briefly takes priority. Keep the reusable audio context
  // and the stored preference intact; vibration remains an independent channel.
  for(const node of [...active]){
   try{node.osc.stop();}catch(e){}
   release(node);
  }
 }
 function soundMuted(){
  try{return options.soundMuted?.()===true;}catch(e){return false;}
 }
 function stopVibration(){
  if(vibrationStarted){try{nav.vibrate(0);}catch(e){}vibrationStarted=false;}
 }
 function stop(){stopSound();stopVibration();lastAt=-Infinity;}
 function set(kind,on){
  if(kind!=='sound'&&kind!=='vibration')return settings();
  prefs[kind]=available[kind]&&on===true;
  if(!prefs[kind]){if(kind==='sound')stopSound();else stopVibration();}
  // A storage failure must not prevent the user's immediate setting or action.
  try{storage?.setItem(key,JSON.stringify(prefs));}catch(e){}
  return settings();
 }
 function resume(ctx){
  if(resuming?.context===ctx)return;
  const flight={context:ctx,generation};
  try{
   const result=ctx.resume();
   if(result&&typeof result.then==='function'){
    resuming=flight;
    // Deliberately no playback continuation. A delayed resume can only enable
    // a later, fresh tap; it must never replay an old click after 10–20 seconds.
    Promise.resolve(result).then(()=>{if(resuming===flight)resuming=null;},()=>{
     if(context===ctx&&generation===flight.generation)stopSound();
    });
   }
  }catch(e){if(context===ctx)stopSound();}
 }
 function sound(){
  let ctx,node;
  try{
   if(context?.state==='closed')stopSound();
   if(!context)context=new Audio({latencyHint:'interactive'});
   ctx=context;
   if(ctx.state!=='running')resume(ctx);
   if(context!==ctx)return false;
   // Pending/interrupted audio is skipped, not queued. The underlying app
   // action continues immediately even if the browser never permits audio.
   if(ctx.state!=='running')return true;
   if(active.size>=2)return false;
   node={osc:ctx.createOscillator(),gain:ctx.createGain()};
   active.add(node);
   const t=ctx.currentTime;
   node.osc.type='sine';node.osc.frequency.setValueAtTime(900,t);
   node.gain.gain.setValueAtTime(0,t);
   node.gain.gain.linearRampToValueAtTime(0.035,t+0.003);
   node.gain.gain.linearRampToValueAtTime(0,t+SOUND_SECONDS);
   node.osc.connect(node.gain);node.gain.connect(ctx.destination);
   node.osc.onended=()=>release(node);
   node.osc.start(t);node.osc.stop(t+SOUND_SECONDS);
   return true;
  }catch(e){
   if(node){try{node.osc.stop();}catch(e){}release(node);}
   if(context===ctx)stopSound();
   return false;
  }
 }
 function play(event){
  try{
   if(!event||event.isTrusted!==true)return false;
   if(!visible()){stop();return false;}
   if((!prefs.sound&&!prefs.vibration)||events.has(event))return false;
   const at=now();
   if(at>=lastAt&&at-lastAt<GAP_MS)return false;
   lastAt=at;events.add(event);
   let attempted=false;
   if(prefs.vibration){try{nav.vibrate(8);vibrationStarted=true;attempted=true;}catch(e){}}
   if(prefs.sound&&!soundMuted())attempted=sound()||attempted;
   return attempted;
  }catch(e){return false;}
 }
 return {support,settings,set,play,stop,duckSound};
}

module.exports={create};
