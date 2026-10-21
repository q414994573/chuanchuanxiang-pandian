'use strict';
const Core=require('../count-core.js');
const Cloud=require('../cloud/core.cjs');
function settings(production){return production?{test:false,key:'ccx-ordering-draft-v1',draftCollection:'liveCountDrafts'}:{test:true,key:'ccx-redesign-draft-v2',draftCollection:'countDrafts'};}
function orders(records,test){return records.filter(r=>{try{Cloud.assertCloudOrderId(r.id,test);return true;}catch(e){return false;}});}
function legacyDrafts(storage,source){
 const rows=[];
 for(let i=0;i<storage.length;i++){
  const key=storage.key(i);if(!key?.startsWith('ccx-count-session:')||key.endsWith(':previous'))continue;
  try{const raw=storage.getItem(key),draft=JSON.parse(raw);if(Core.validate(draft,source))rows.push({key,raw,draft});}catch(e){}
 }
 return rows.sort((a,b)=>String(b.draft.savedAt||'').localeCompare(String(a.draft.savedAt||'')));
}
module.exports={settings,orders,legacyDrafts};
