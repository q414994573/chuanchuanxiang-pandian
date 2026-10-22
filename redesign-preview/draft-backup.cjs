// Existing countDrafts schema is retained. Never decide overwrite permission by a device clock.
function token(record){return record?JSON.stringify([record.body,record.pos,record.field]):null;}
function body(record){return record?JSON.parse(record.body):null;}
function meaningful(d){return !!d&&(d.status!=='draft'||Object.values(d.deferred||{}).some(Boolean)||Object.values(d.seen||{}).some(Boolean)||Object.keys(d.stockText||{}).length>0||Object.values(d.items||{}).some(r=>String(r.stock??'').trim()||String(r.quantity??'').trim()||r.decision==='skip'));}
function content(record){if(!record)return null;const d=JSON.parse(JSON.stringify(body(record).draft));delete d.savedAt;delete d.contentVersion;delete d.lastId;return JSON.stringify(d);}
function choose(local,remote,base){
 if(!remote)return 'local';
 if(token(local)===token(remote)||content(local)===content(remote))return 'same';
 if(base!==undefined&&token(remote)===base)return 'local';
 if(!local||(base!==undefined&&token(local)===base)||!meaningful(body(local).draft))return 'remote';
 return 'conflict';
}
async function compareAndSave(tx,ref,expected,next){
 const snap=await tx.get(ref),current=snap.exists()?snap.data():null;
 if(token(current)===token(next))return; // Retry after a lost acknowledgement.
 if(token(current)!==expected){const e=Error('云端草稿已变化，本机内容已保留');e.code='draft/conflict';throw e;}
 tx.set(ref,next);
}
module.exports={token,body,meaningful,choose,compareAndSave};
