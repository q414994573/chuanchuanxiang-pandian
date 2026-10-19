const fs=require('fs');
const ids=JSON.parse(fs.readFileSync('current-order.json')).products.map(p=>p.id);
fs.writeFileSync('firestore.rules',`rules_version = '2';
service cloud.firestore {
 match /databases/{database}/documents {
  function member() { return request.auth != null && get(/databases/$(database)/documents/members/$(request.auth.uid)).data.active == true && get(/databases/$(database)/documents/members/$(request.auth.uid)).data.role in ['owner','editor']; }
  function owner() { return member() && get(/databases/$(database)/documents/members/$(request.auth.uid)).data.role == 'owner'; }
  function qty(v) { return v.matches('^(0|[1-9][0-9]{0,8}|1000000000)$'); }
  function production(d) { return d.units.keys().hasOnly(${JSON.stringify(ids)}) && d.units.size() == 129 && d.quantities.matches('^(0|[1-9][0-9]{0,8}|1000000000)(,(0|[1-9][0-9]{0,8}|1000000000)){128}$'); }
  function sandbox(d) { return d.units.keys().hasOnly(['test:a','test:b','test:c']) && d.units.size() == 3 && d.quantities.matches('^(0|[1-9][0-9]{0,8}|1000000000)(,(0|[1-9][0-9]{0,8}|1000000000)){2}$'); }
  function shape(d,group) { return d.keys().hasOnly(['schema','date','snapshot','quantities','units','createdBy','createdAt','updatedBy','updatedAt','revision','mutationId'])
    && d.schema == 'ccx-cloud-1' && d.date is string && d.date.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    && d.snapshot is string && d.snapshot.size() < 500000 && d.quantities is string && d.units is map
    && d.revision is int && d.revision > 0
    && d.mutationId is string && d.mutationId.matches('^[a-zA-Z0-9-]{10,80}$')
    && d.updatedBy == request.auth.uid && d.updatedAt == request.time
    && (group == 'orders' ? production(d) : sandbox(d)); }
  match /members/{uid} { allow get: if request.auth != null && request.auth.uid == uid; allow list,write: if false; }
  match /{group}/{id} {
   function permitted() { return group in ['orders','sandboxOrders'] && member(); }
   function audit() { let d=request.resource.data; return !exists(/databases/$(database)/documents/$(group)/$(id)/revisions/$(d.mutationId)) && getAfter(/databases/$(database)/documents/$(group)/$(id)/revisions/$(d.mutationId)).data == d; }
   allow read: if permitted();
   allow create: if permitted() && owner() && shape(request.resource.data,group)
    && request.resource.data.createdBy == request.auth.uid && request.resource.data.createdAt == request.time
    && request.resource.data.revision == 1 && audit();
   allow update: if permitted() && shape(request.resource.data,group)
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['quantities','revision','updatedBy','updatedAt','mutationId'])
    && request.resource.data.revision == resource.data.revision + 1 && audit();
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
 }
}
`);
