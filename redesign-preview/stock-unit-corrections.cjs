'use strict';

// These are inventory-label corrections, not order-unit choices or conversion
// ratios. Saved/finalized snapshots remain authoritative for their old values.
const corrections=Object.freeze({
 'kr:31':Object.freeze({from:'박스',to:'개'}),
 'cn:21':Object.freeze({from:'箱',to:'包'})
});

function candidate(draft,id){
 if(!draft||draft.status!=='draft'||!Object.hasOwn(corrections,id)||!Array.isArray(draft.catalog))return null;
 const product=draft.catalog.find(p=>p?.id===id),row=draft.items?.[id],change=corrections[id];
 if(!product?.hasStock||!row||row.stockUnit!==change.from)return null;
 return {id,from:change.from,to:change.to,row};
}
function canIncrement(draft,amount){
 return Number.isSafeInteger(draft.contentVersion)&&draft.contentVersion>=0&&draft.contentVersion<=Number.MAX_SAFE_INTEGER-amount;
}
function apply(draft,candidates){
 if(!candidates.length||!canIncrement(draft,candidates.length))return [];
 for(const change of candidates)change.row.stockUnit=change.to;
 draft.contentVersion+=candidates.length;
 return candidates.map(({id,from,to})=>({id,from,to}));
}
function applyBlank(draft){
 const pending=[];
 for(const id of Object.keys(corrections)){
  const change=candidate(draft,id);if(!change)continue;
  // Zero is a recorded count, not an empty cell. Parked text is data too.
  const parked=draft.stockText?.[id];
  if(change.row.stock!==''||change.row.stockStatus!=='pending'||(parked!==undefined&&parked!==''))continue;
  pending.push(change);
 }
 return apply(draft,pending);
}
function adoptEntered(draft,id,raw){
 const change=candidate(draft,id);if(!change)return null;
 // The caller invokes this only for an explicit numeric STOCK entry, after
 // Core.edit and before the one persist/render. Never invoke it on open, delete,
 // undo, quantity edits, cloud receive, restore, or plain-text inventory notes.
 // Requiring the entered value to be present avoids changing a unit before the
 // inventory write succeeded. A trailing dot is a live numeric editor fragment.
 if(typeof raw!=='string'||raw.length>12||!/^\d+(?:\.\d{0,3})?$/.test(raw)||Number(raw)>1000000)return null;
 if(change.row.stock!==raw||change.row.stockStatus!=='counted')return null;
 if(draft.stockText?.[id]!==undefined&&draft.stockText[id]!=='')return null;
 return apply(draft,[change])[0]||null;
}

module.exports={corrections,applyBlank,adoptEntered};
