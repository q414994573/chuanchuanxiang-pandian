import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {readFileSync} from 'node:fs';
import {doc,setDoc,getDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp} from 'firebase/firestore';
import assert from 'node:assert/strict';
import {store} from '../cloud/store.js';
const env=await initializeTestEnvironment({projectId:'demo-ccx-collaboration',firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});
try{
await env.withSecurityRulesDisabled(async c=>{for(const [id,role] of [['chef','owner'],['boss','editor']])await setDoc(doc(c.firestore(),'members',id),{role,active:true});});
const chef=env.authenticatedContext('chef').firestore(),boss=env.authenticatedContext('boss').firestore(),stranger=env.authenticatedContext('stranger').firestore(),anon=env.unauthenticatedContext().firestore();
const a=store(chef,'chef','sandboxOrders'),b=store(boss,'boss','sandboxOrders');
const p={schema:'ccx-cloud-1',date:'2026-10-19',snapshot:JSON.stringify({test:true,stock:['','0','3']}),quantities:{'test:a':5000,'test:b':0,'test:c':1000},units:{'test:a':'袋','test:b':'包','test:c':'个'}};
const v1=await a.create('test-order',p,'mutation-create-001');assert.equal(v1.revision,1);
const repeated=await a.create('test-order',p,'mutation-repeat-001');assert.equal(repeated.revision,1);
const v2=await b.save('test-order',v1,{...v1.quantities,'test:a':3000},'mutation-boss-001');assert.equal(v2.quantities['test:a'],3000);assert.equal((await a.read('test-order')).snapshot,p.snapshot);
await assert.rejects(a.save('test-order',v1,{...v1.quantities,'test:b':1000},'mutation-stale-001'),/较新版本/);
await assertFails(getDoc(doc(anon,'sandboxOrders','test-order')));await assertFails(getDoc(doc(stranger,'sandboxOrders','test-order')));
await assertFails(setDoc(doc(stranger,'members','stranger'),{active:true,role:'owner'}));
await assertFails(updateDoc(doc(boss,'sandboxOrders','test-order'),{snapshot:'changed'}));
await assertFails(updateDoc(doc(boss,'sandboxOrders','test-order'),{quantities:'9000,0,1000',revision:3,updatedBy:'boss',updatedAt:serverTimestamp(),mutationId:'mutation-no-audit'}));
await assertFails(deleteDoc(doc(chef,'sandboxOrders','test-order')));
await assertFails(updateDoc(doc(chef,'sandboxOrders','test-order','revisions','mutation-create-001'),{snapshot:'changed'}));
assert.equal((await a.history('test-order')).length,2);
const race=await Promise.allSettled([a.save('test-order',v2,{...v2.quantities,'test:a':4000},'mutation-race-chef'),b.save('test-order',v2,{...v2.quantities,'test:a':6000},'mutation-race-boss')]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
console.log('PASS simulated three-product chain, reread, duplicate, audit, permissions and simultaneous conflict');
// Only after the isolated three-product chain passes, exercise catalog-sized documents in the LOCAL emulator.
const products=JSON.parse(readFileSync('current-order.json')).products;
const full={...p,quantities:Object.fromEntries(products.map(x=>[x.id,1000])),units:Object.fromEntries(products.map(x=>[x.id,x.unit||'']))};
// Missing units remain blank; use zero for those items rather than inventing units.
for(const id in full.units)if(!full.units[id])full.quantities[id]=0;
const prod=store(chef,'chef'),prodBoss=store(boss,'boss');
const first=await prod.create('emulator-only-catalog',full,'mutation-catalog-001');
await prodBoss.save(first.id,first,{...first.quantities,[products[0].id]:2000},'mutation-catalog-002');
const current=await prod.read(first.id), raw=(await getDoc(doc(boss,'orders',first.id))).data();
async function forged(patch,mutation){const batch=writeBatch(boss),r=doc(boss,'orders',first.id);const data={...raw,revision:3,updatedBy:'boss',updatedAt:serverTimestamp(),mutationId:mutation,...patch};batch.set(r,data);batch.set(doc(r,'revisions',mutation),data);await assertFails(batch.commit());}
await forged({snapshot:'altered inventory'},'mutation-stock-tamper');
await forged({units:{...raw.units,[products[0].id]:'wrong'}},'mutation-unit-tamper');
await forged({createdBy:'boss'},'mutation-owner-tamper');
await forged({revision:8},'mutation-version-jump');
await forged({quantities:raw.quantities.replace(/^[^,]+/,'-1')},'mutation-negative-qty');
await forged({quantities:raw.quantities+',1'},'mutation-extra-product');
await forged({quantities:raw.quantities.replace(/^[^,]+/,'1000000001')},'mutation-excess-qty');
Object.defineProperty(navigator,'onLine',{value:false,configurable:true});
await assert.rejects(prod.save(first.id,current,current.quantities,'mutation-offline-001'),/断网/);
Object.defineProperty(navigator,'onLine',{value:true,configurable:true});
assert.equal((await prod.read(first.id)).revision,2);
console.log('PASS 129-product rules, authorized edit, invalid quantity denied; no production service used');
}finally{await env.cleanup();}
