import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {readFileSync} from 'node:fs';
import {doc,setDoc} from 'firebase/firestore';
import assert from 'node:assert/strict';
import Core from '../count-core.js';
import Cloud from '../cloud/core.cjs';
import {store} from '../cloud/store.js';
const latest=JSON.parse(readFileSync('current-order.json')),legacy=JSON.parse(readFileSync('catalog-legacy.json'));
const env=await initializeTestEnvironment({projectId:'demo-ccx-catalog-versions',firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});
try{
await env.withSecurityRulesDisabled(async c=>{for(const role of ['owner','editor'])await setDoc(doc(c.firestore(),'members',role),{role,name:role,active:true});});
for(const source of [legacy,latest])for(const role of ['owner','editor']){
 const d=Core.create(source,'2026-10-27',`count-version-${source.products.length}-${role}`);
 for(const p of d.catalog){if(p.id==='cn:45')Core.edit(d,p.id,'unit','봉');if(p.id==='other:11')Core.edit(d,p.id,'unit','세트');Core.finish(d,p.id,true);}d.status='reviewed';
 const api=store(env.authenticatedContext(role).firestore(),role,'orders',role),payload=Cloud.submission(d,Core,latest);
 let order=await api.create(d.id,payload,`create-${d.id}`);
 for(const id of source===latest?['kr:59','kr:60','kr:61','kr:62','cn:85','cn:86','cn:87','cn:88']:['kr:7','cn:33']){
  order=await api.save(order.id,order,{...order.quantities,[id]:2000},`quantity-${d.id}-${id.replace(':','-')}`,{stockEdits:{[id]:'0'}});
  const loaded=await api.read(order.id);assert.equal(loaded.quantities[id],2000);assert.equal(loaded.stockEdits[id],'0');assert.equal(Core.validate(JSON.parse(loaded.snapshot),latest),true);
 }
 order=await api.finalize(order.id,order,`final-${d.id}`);
 await assert.rejects(api.save(order.id,order,order.quantities,`locked-${d.id}`,{stockEdits:{'kr:7':'9'}}));
 order=await api.finalize(order.id,order,`reopen-${d.id}`,'pending');assert.equal(order.orderStage,'pending');
 console.log(`PASS ${source.products.length} products ${role}: create, all added rows save/read, zero stock, finalize lock and reopen`);
}
}finally{await env.cleanup();}
