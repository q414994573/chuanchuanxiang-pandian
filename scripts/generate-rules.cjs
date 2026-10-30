const fs=require('fs');
const products=JSON.parse(fs.readFileSync('current-order.json')).products;
const versions=[products,JSON.parse(fs.readFileSync('catalog-v137.json')).products,JSON.parse(fs.readFileSync('catalog-legacy.json')).products];
const stockPattern='(~|[0-9]{1,36}([.][0-9]{1,3})?|)';
function stockRegex(rows){const runs=[];for(const p of rows.slice().sort((a,b)=>a.id.localeCompare(b.id))){const pattern=p.hasStock?stockPattern:'~';if(runs.at(-1)?.pattern===pattern)runs.at(-1).count++;else runs.push({pattern,count:1});}return runs.map(r=>r.pattern+(r.count>1?'(,'+r.pattern+'){'+(r.count-1)+'}':'')).join(',');}
const production=versions.map(rows=>`(d.units.keys().hasOnly(${JSON.stringify(rows.map(p=>p.id))}) && d.units.size() == ${rows.length} && d.quantities.matches('^(0|[1-9][0-9]{0,8}|1000000000)(,(0|[1-9][0-9]{0,8}|1000000000)){${rows.length-1}}$'))`).join(' || ');
const inventory=versions.map(rows=>`(d.units.size() == ${rows.length} && edits.matches('^${stockRegex(rows)}$'))`).join(' || ');
fs.writeFileSync('firestore.rules',`rules_version = '2';
service cloud.firestore {
 match /databases/{database}/documents {
  function member() { return request.auth != null && get(/databases/$(database)/documents/members/$(request.auth.uid)).data.active == true && get(/databases/$(database)/documents/members/$(request.auth.uid)).data.role in ['owner','editor']; }
  function owner() { return member() && get(/databases/$(database)/documents/members/$(request.auth.uid)).data.role == 'owner'; }
  function sharedHead(id) { return id.matches('^test-.*') ? 'test-current' : 'current'; }
  function linked(id) { return exists(/databases/$(database)/documents/sharedCounts/$(sharedHead(id))) && get(/databases/$(database)/documents/sharedCounts/$(sharedHead(id))).data.orderId == id; }
  function sharedFinal(id) { let h=getAfter(/databases/$(database)/documents/sharedCounts/$(sharedHead(id))).data; return h.orderId == id && h.stage == 'finalized' && h.body == request.resource.data.snapshot && h.mutationId == request.resource.data.mutationId && h.updatedAt == request.time; }
  function qty(v) { return v.matches('^(0|[1-9][0-9]{0,8}|1000000000)$'); }
  function production(d) { return ${production}; }
  function sandbox(d) { return d.units.keys().hasOnly(['test:a','test:b','test:c']) && d.units.size() == 3 && d.quantities.matches('^(0|[1-9][0-9]{0,8}|1000000000)(,(0|[1-9][0-9]{0,8}|1000000000)){2}$'); }
  function unitChange() { return request.resource.data.units == resource.data.units || (groupSafeUnits()); }
  function groupSafeUnits() { return request.resource.data.units.diff(resource.data.units).affectedKeys().hasOnly(['cn:45','other:11']) && request.resource.data.units['cn:45'] in ['', '박스', '봉'] && request.resource.data.units['other:11'] in ['', '세트', '몸통만']; }
  function inventory(d,group) { let edits=d.get('stockEdits',''); let units=d.get('stockUnits',{}); return edits is string && units is map
    && units.keys().hasOnly(['cn:45']) && units.get('cn:45','') in ['', '박스','봉']
    && (edits == '' || (group == 'orders' ? (${inventory}) : edits.matches('^${[stockPattern,stockPattern,stockPattern].join(',')}$'))); }
  function shape(d,group) { return d.keys().hasOnly(['schema','date','snapshot','quantities','units','createdBy','createdAt','updatedBy','updatedAt','updatedByName','revision','mutationId','orderStage','stockEdits','stockUnits'])
    && inventory(d,group)
    && d.get('orderStage','pending') in ['pending','finalized']
    && d.schema == 'ccx-cloud-1' && d.date is string && d.date.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    && d.snapshot is string && d.snapshot.size() < 500000 && d.quantities is string && d.units is map
    && d.revision is int && d.revision > 0
    && d.mutationId is string && d.mutationId.matches('^[a-zA-Z0-9-]{10,80}$')
    && d.updatedBy == request.auth.uid && d.updatedAt == request.time
    && d.updatedByName is string && d.updatedByName.size() > 0 && d.updatedByName.size() <= 20
    && d.updatedByName == get(/databases/$(database)/documents/members/$(request.auth.uid)).data.name
    && (group == 'orders' ? production(d) : sandbox(d)); }
  match /members/{uid} { allow get: if request.auth != null && request.auth.uid == uid; allow list,write: if false; }
  match /{group}/{id} {
   function permitted() { return group in ['orders','sandboxOrders'] && member(); }
   function audit() { let d=request.resource.data; return !exists(/databases/$(database)/documents/$(group)/$(id)/revisions/$(d.mutationId)) && getAfter(/databases/$(database)/documents/$(group)/$(id)/revisions/$(d.mutationId)).data == d; }
   allow read: if permitted();
   allow create: if permitted() && shape(request.resource.data,group)
    && (request.resource.data.get('orderStage','pending') == 'pending' || sharedFinal(id))
    && request.resource.data.createdBy == request.auth.uid && request.resource.data.createdAt == request.time
    && request.resource.data.revision == 1 && audit();
   allow update: if permitted() && shape(request.resource.data,group)
    && request.resource.data.revision == resource.data.revision + 1 && audit()
    && ((!linked(id) && resource.data.get('orderStage','pending') == 'pending'
       && unitChange()
       && (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['quantities','units','stockEdits','stockUnits','revision','updatedBy','updatedAt','updatedByName','mutationId'])
        ))
      || (member() && !linked(id)
        && request.resource.data.get('orderStage','pending') != resource.data.get('orderStage','pending')
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['orderStage','revision','updatedBy','updatedAt','updatedByName','mutationId']))
      || (linked(id) && ((sharedFinal(id) && request.resource.data.createdBy == resource.data.createdBy && request.resource.data.createdAt == resource.data.createdAt)
       || (getAfter(/databases/$(database)/documents/sharedCounts/$(sharedHead(id))).data.stage == 'draft' && getAfter(/databases/$(database)/documents/sharedCounts/$(sharedHead(id))).data.mutationId == request.resource.data.mutationId && resource.data.orderStage == 'finalized' && request.resource.data.orderStage == 'pending' && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['orderStage','revision','updatedBy','updatedAt','updatedByName','mutationId']))))); 
   allow delete: if false;
   match /revisions/{mutation} {
    allow read: if group in ['orders','sandboxOrders'] && member();
    allow create: if group in ['orders','sandboxOrders'] && member()
     && request.resource.data.mutationId == mutation
     && request.resource.data == getAfter(/databases/$(database)/documents/$(group)/$(id)).data
     && (!exists(/databases/$(database)/documents/$(group)/$(id)) || get(/databases/$(database)/documents/$(group)/$(id)).data.revision < request.resource.data.revision);
    allow update,delete: if false;
   }
  }
  match /sharedCounts/{headId} {
   function validHead() { let d=request.resource.data; return headId in ['current','test-current'] && member()
    && d.keys().hasOnly(['schema','localId','orderId','date','stage','body','revision','mutationId','updatedBy','updatedByName','updatedAt'])
    && d.schema == 'ccx-shared-1' && d.localId.matches('^count-[a-zA-Z0-9-]{1,80}$')
    && d.orderId == (headId == 'current' ? d.localId : 'test-'+d.localId)
    && d.stage in ['draft','finalized'] && d.body is string && d.body.size() > 20 && d.body.size() < 400000
    && d.date.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$') && d.revision is int && d.revision > 0
    && d.mutationId.matches('^[a-zA-Z0-9-]{10,80}$') && d.updatedBy == request.auth.uid && d.updatedAt == request.time
    && d.updatedByName == get(/databases/$(database)/documents/members/$(request.auth.uid)).data.name; }
   function paired() { let d=request.resource.data; let o=getAfter(/databases/$(database)/documents/orders/$(d.orderId)).data; return o.mutationId == d.mutationId && o.updatedAt == request.time && (d.stage == 'finalized' ? o.orderStage == 'finalized' && o.snapshot == d.body : o.orderStage == 'pending'); }
   function preserved() { return getAfter(/databases/$(database)/documents/sharedCounts/$(headId)/archives/$(resource.data.orderId)).data == resource.data; }
   function unused() { return !exists(/databases/$(database)/documents/orders/$(request.resource.data.orderId)) && !exists(/databases/$(database)/documents/sharedCounts/$(headId)/archives/$(request.resource.data.orderId)); }
   allow read: if headId in ['current','test-current'] && member();
   allow create: if validHead() && request.resource.data.revision == 1 && request.resource.data.stage == 'draft' && unused();
   allow update: if validHead() && request.resource.data.revision == resource.data.revision+1
    && ((request.resource.data.localId == resource.data.localId && request.resource.data.orderId == resource.data.orderId
      && ((resource.data.stage == 'draft' && request.resource.data.stage == 'draft') || (request.resource.data.stage != resource.data.stage && paired())))
     || ((resource.data.stage == 'finalized' || preserved()) && request.resource.data.stage == 'draft' && request.resource.data.localId != resource.data.localId && unused()));
   allow delete: if false;
   match /archives/{id} {
    function oldHead() { return get(/databases/$(database)/documents/sharedCounts/$(headId)).data; }
    function newHead() { return getAfter(/databases/$(database)/documents/sharedCounts/$(headId)).data; }
    allow read: if headId in ['current','test-current'] && member();
    allow create: if member() && headId in ['current','test-current'] && id == oldHead().orderId
     && oldHead().stage == 'draft' && request.resource.data == oldHead()
     && newHead().localId != oldHead().localId && newHead().revision == oldHead().revision+1;
    allow update, delete: if false;
   }
  }
  match /{draftGroup}/{uid} {
    allow read: if draftGroup in ['countDrafts','liveCountDrafts'] && request.auth != null && request.auth.uid == uid && owner();
    allow create, update: if draftGroup in ['countDrafts','liveCountDrafts'] && request.auth != null && request.auth.uid == uid && owner()
      && request.resource.data.keys().hasOnly(['schema','date','localId','pos','field','body','updatedAt'])
      && request.resource.data.schema == 'ccx-draft-1'
      && request.resource.data.date is string && request.resource.data.date.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      && request.resource.data.localId is string && request.resource.data.localId.matches('^count-[a-zA-Z0-9-]{1,80}$')
      && request.resource.data.pos is int && request.resource.data.pos >= 0 && request.resource.data.pos < ${products.length}
      && request.resource.data.field in ['stock','qty']
      && request.resource.data.body is string && request.resource.data.body.size() > 20 && request.resource.data.body.size() < 400000
      && request.resource.data.updatedAt == request.time;
    allow delete: if false;
  }
 }
}
`);
