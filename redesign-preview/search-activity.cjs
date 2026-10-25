'use strict';

// Search preferences only. This module never reads or writes order/cloud data.
// An event is a confirmed search, not an input keystroke. One event contributes
// one total point, shared by its matches, with a seven-day half-life.
const DAY=24*60*60*1000;
const HORIZON=30*DAY,HALF_LIFE=7*DAY,COOLDOWN=30*1000;
const HISTORY_LIMIT=20,EVENT_LIMIT=500,ID_LIMIT=256;
const SEPARATORS=/[\s\p{P}\p{S}\p{Cf}]+/u;

function queryValue(value){
 if(typeof value!=='string'||value.length>4096)return null;
 const query=value.trim();
 if(!query||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ud800-\udfff]/u.test(query))return null;
 const parts=query.normalize('NFKC').toLowerCase().split(SEPARATORS).filter(Boolean);
 const compact=parts.join('');
 if(!compact||compact.length>1024||!/[\p{L}\p{N}]/u.test(compact))return null;
 // Match the search engine's letter-spacing tolerance without conflating
 // explicit name boundaries: 土豆淀粉 and 土豆、淀粉 remain different searches.
 const letters=parts.length>1&&parts.every(p=>p.length===1)&&!/[\p{P}\p{S}]/u.test(query);
 return {query,key:parts.join(letters?'':'\u001f')};
}

function idsValue(value){
 if(!Array.isArray(value)&&!(value instanceof Set))return null;
 const ids=new Set();
 for(const id of value){
  if(typeof id!=='string'||!id||id.length>128||/[\s\p{C}]/u.test(id))continue;
  ids.add(id);
  if(ids.size>ID_LIMIT)return null;
 }
 return [...ids].sort();
}

function createActivity(env={},options={}){
 const key=typeof options.key==='string'&&options.key?options.key:'ccx-search-activity-v1';
 const clock=typeof options.now==='function'?options.now:Date.now;
 function now(){let value;try{value=clock();}catch(e){}return Number.isFinite(value)&&value>=0?value:Date.now();}
 let storage=null,persistent=false,history=[],events=[];

 function recent(t){
  events=events.filter(e=>e.at>=t-HORIZON&&e.at<=t).sort((a,b)=>b.at-a.at).slice(0,EVENT_LIMIT);
 }
 function write(){
  if(!storage){persistent=false;return;}
  try{storage.setItem(key,JSON.stringify({version:1,history,events}));persistent=true;}
  catch(e){persistent=false;}
 }
 function restore(raw,t){
  if(raw==null)return;
  if(typeof raw!=='string'||raw.length>4*1024*1024)throw Error('Invalid search preferences');
  const data=JSON.parse(raw);
  if(!data||data.version!==1||!Array.isArray(data.history)||!Array.isArray(data.events))throw Error('Invalid search preferences');
  const seen=new Set();
  history=data.history.slice(0,2000).flatMap(row=>{
   const q=queryValue(row?.query);
   return q&&typeof row.at==='number'&&Number.isFinite(row.at)&&row.at>=0&&row.at<=t?[{query:q.query,at:row.at,key:q.key}]:[];
  }).sort((a,b)=>b.at-a.at).filter(row=>{
   if(seen.has(row.key))return false;seen.add(row.key);return true;
  }).slice(0,HISTORY_LIMIT).map(({query,at})=>({query,at}));
  events=data.events.slice(0,2000).flatMap(row=>{
   const q=queryValue(row?.query),ids=idsValue(row?.ids);
   return q&&ids&&typeof row.at==='number'&&Number.isFinite(row.at)&&row.at>=0&&row.at<=t&&row.at>=t-HORIZON?[{query:q.query,ids,at:row.at}]:[];
  });
  recent(t);
 }

 try{
  storage=env?.localStorage;
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')storage=null;
  if(storage){
   // If storage cannot be read, do not overwrite history we could not inspect.
   // Malformed readable JSON can instead be replaced by the next valid write.
   let raw;try{raw=storage.getItem(key);}catch(e){storage=null;throw e;}
   restore(raw,now());persistent=true;
  }
 }catch(e){history=[];events=[];persistent=false;}

 return {
  history(){return history.map(row=>({...row}));},
  record(value,matchedIds=[]){
   const q=queryValue(value),ids=idsValue(matchedIds);
   if(!q||!ids)return false;
   const t=now();recent(t);
   const signature=JSON.stringify(ids);
   if(events.some(e=>t-e.at<COOLDOWN&&queryValue(e.query)?.key===q.key&&JSON.stringify(e.ids)===signature))return false;
   history=[{query:q.query,at:t},...history.filter(row=>queryValue(row.query)?.key!==q.key)].slice(0,HISTORY_LIMIT);
   events.unshift({query:q.query,ids,at:t});events=events.slice(0,EVENT_LIMIT);
   write();return true;
  },
  ranked(validIds,limit=8){
   const ids=idsValue(validIds);if(!ids)return [];
   // The caller's catalog order is the final tie-breaker, so stable product
   // ordering survives equal scores and identical timestamps.
   const order=new Map();let index=0;
   for(const id of validIds)if(ids.includes(id)&&!order.has(id))order.set(id,index++);
   const t=now();recent(t);const scores=new Map();
   for(const event of events){
    if(!event.ids.length)continue;
    const weight=Math.pow(0.5,(t-event.at)/HALF_LIFE)/event.ids.length;
    for(const id of event.ids){
     if(!order.has(id))continue;
     const value=scores.get(id)||{id,score:0,count:0,lastAt:0};
     value.score+=weight;value.count++;value.lastAt=Math.max(value.lastAt,event.at);scores.set(id,value);
    }
   }
   const count=Number.isFinite(limit)?Math.min(ID_LIMIT,Math.max(0,Math.floor(limit))):8;
   return [...scores.values()].sort((a,b)=>b.score-a.score||b.lastAt-a.lastAt||order.get(a.id)-order.get(b.id)).slice(0,count);
  },
  clear(){history=[];events=[];write();},
  status(){return {persistent};}
 };
}

module.exports={createActivity};
