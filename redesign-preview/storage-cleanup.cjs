'use strict';
// Only known recovery records are considered. Never clear a storage origin,
// authentication, preferences, active drafts, or unique unverified contents.
const Core=require('../count-core.js');
const stable=value=>JSON.stringify(sort(value));
function sort(value){
 if(Array.isArray(value))return value.map(sort);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));
 return value;
}
const bytes=(key,raw)=>2*(key.length+raw.length); // UTF-16 estimate, not disk/quota measurement.
function draftOf(raw,source,legacy=false){
 try{
  const value=JSON.parse(raw);
  if(legacy)return Core.validate(value,source)?value:null;
  if(!value||value.order||Object.keys(value).some(k=>!['draft','pos','field','peerBase','savedAt','backupUid','cloudBase','cloudAt'].includes(k)))return null;
  return Core.validate(value.draft,source)?value.draft:null;
 }catch(e){return null;}
}
function knownKey(k,key,legacy){
 if(!k)return false;
 const suffix=k.startsWith(key+':')?k.slice(key.length+1):'';
 return /^(before-shared|recovery|restored):\d+$/.test(suffix)||
  (legacy&&/^ccx-count-session:count-[^:]+(?::previous)?$/.test(k));
}
function inspect(storage,{key,source,legacy=false,activeIds=[]}){
 const activeRaw=storage.getItem(key),legacyId=legacy?storage.getItem('ccx-count-active'):null;
 const legacyKey=legacyId?'ccx-count-session:'+legacyId:null;
 const legacyRaw=legacyKey?storage.getItem(legacyKey):null;
 const guards=[{key,raw:activeRaw},...(legacy?[{key:'ccx-count-active',raw:legacyId}]:[]),...(legacyKey?[{key:legacyKey,raw:legacyRaw}]:[])];
 const anchors=new Map(),protectedIds=new Set(activeIds.filter(Boolean));
 for(const row of [{key,raw:activeRaw},{key:legacyKey,raw:legacyRaw,legacy:true}]){
  if(!row.key||row.raw===null)continue;
  const d=draftOf(row.raw,source,row.legacy);
  if(d){protectedIds.add(d.id);anchors.set(stable(d),row);}
 }
 const rows=[];
 // Snapshot the keys before deleting anything. Reading is deliberately separate.
 for(let i=0;i<storage.length;i++){
  const k=storage.key(i);if(k===legacyKey||!knownKey(k,key,legacy))continue;
  const raw=storage.getItem(k);if(raw===null)continue;
  const draft=draftOf(raw,source,k.startsWith('ccx-count-session:'));
  rows.push({key:k,raw,bytes:bytes(k,raw),draft,fingerprint:draft?stable(draft):null});
 }
 // Keep one exact complete draft if no active copy exists. Never use a row
 // scheduled for deletion as the retained copy for another row.
 rows.sort((a,b)=>b.key.localeCompare(a.key));
 const candidates=[],unverified=[];
 for(const row of rows){
  if(!row.draft){unverified.push(row);continue;}
  const anchor=anchors.get(row.fingerprint);
  if(anchor)candidates.push({...row,proof:{kind:'duplicate',key:anchor.key,raw:anchor.raw}});
  else{anchors.set(row.fingerprint,row);unverified.push(row);}
 }
 return {key,guards,protectedIds:[...protectedIds],rows,candidates,unverified,cloudChecked:0,cloudUnavailable:0};
}
async function verifyArchives(plan,source,readArchive){
 if(!readArchive)return plan;
 const records=new Map(),retained=[];
 // Duplicate anchors remain local; this makes partial deletion failures safe.
 const retainedAnchors=new Set(plan.candidates.map(c=>c.proof.key));
 for(const row of plan.unverified){
  if(!row.draft||plan.protectedIds.includes(row.draft.id)||retainedAnchors.has(row.key)){retained.push(row);continue;}
  if(!records.has(row.draft.id)){
   try{records.set(row.draft.id,await readArchive(row.draft.id));plan.cloudChecked++;}
   catch(e){records.set(row.draft.id,null);plan.cloudUnavailable++;}
  }
  const record=records.get(row.draft.id);
  if(record?.localId===row.draft.id&&Core.validate(record.draft,source)&&stable(record.draft)===row.fingerprint){
   plan.candidates.push({...row,proof:{kind:'archive',fingerprint:row.fingerprint}});
  }else retained.push(row);
 }
 plan.unverified=retained;return plan;
}
function execute(storage,plan){
 for(const g of plan.guards)if(storage.getItem(g.key)!==g.raw)throw Error('当前本机记录已变化，请重新检查后再清理');
 const result={removed:0,bytes:0,changed:0,failed:0};
 for(const row of plan.candidates){
  try{
   if(storage.getItem(row.key)!==row.raw){result.changed++;continue;}
   if(row.proof.kind==='duplicate'&&storage.getItem(row.proof.key)!==row.proof.raw){result.changed++;continue;}
   if(row.proof.kind!=='duplicate'&&row.proof.kind!=='archive'){result.changed++;continue;}
   storage.removeItem(row.key);
   if(storage.getItem(row.key)!==null){result.failed++;continue;}
   result.removed++;result.bytes+=row.bytes;
  }catch(e){result.failed++;}
 }
 return result;
}
function summary(plan){return {total:plan.rows.length,bytes:plan.rows.reduce((n,r)=>n+r.bytes,0),removable:plan.candidates.length,freeable:plan.candidates.reduce((n,r)=>n+r.bytes,0),retained:plan.unverified.length,duplicates:plan.candidates.filter(r=>r.proof.kind==='duplicate').length,archived:plan.candidates.filter(r=>r.proof.kind==='archive').length,cloudUnavailable:plan.cloudUnavailable};}
module.exports={inspect,verifyArchives,execute,summary};
