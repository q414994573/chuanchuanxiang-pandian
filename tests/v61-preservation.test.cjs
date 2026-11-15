'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('../count-core'),current=require('../catalog-v146.json'),old=require('../catalog-v144.json'),baseline=require('./v61-baseline-contract.json');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
test('preservation: archived144 is byte-identical to independently pinned v60 production catalog',()=>a.equal(hash(fs.readFileSync(path.join(__dirname,'../catalog-v144.json'))),'83fef9ad11b1042acc8be8f13929614fb8c3f6cdbeb56938b47a46892150bed8'));
for(const [name,expected] of Object.entries(baseline.coreFunctions))test('preservation: v60 business function unchanged '+name,()=>a.equal(hash(C[name].toString()),expected));
for(const [file,expected] of Object.entries(baseline.unchangedFiles))test('preservation: v60 business module unchanged '+file,()=>a.equal(hash(fs.readFileSync(path.join(__dirname,'..',file))),expected));
for(const original of old.products)test('preservation: '+original.id+' exact original fields, blank quantities, entered quantities, lock and restore',()=>{
 const actual=current.products.find(p=>p.id===original.id);a.deepEqual(actual,original);
 const before=C.create(old,'2026-11-15','count-preservation');const after=C.create(current,'2026-11-15','count-preservation');
 a.deepEqual(after.items[original.id],before.items[original.id]);a.deepEqual(after.catalog.find(p=>p.id===original.id),before.catalog.find(p=>p.id===original.id));
 a.equal(after.items[original.id].stock,'');a.equal(after.items[original.id].quantity,'');a.throws(()=>C.orderText(after,original.cat));
 for(const d of [before,after]){if(!d.items[original.id].unit){a.throws(()=>{C.edit(d,original.id,'quantity','2.5');C.finish(d,original.id);});C.edit(d,original.id,'unit',original.id==='cn:45'?'봉':'세트');}C.edit(d,original.id,'quantity','2.5');if(original.hasStock)C.edit(d,original.id,'stock','0');C.finish(d,original.id);}
 a.deepEqual(after.items[original.id],before.items[original.id]);a.equal(after.items[original.id].quantity,'2.5');
 const snapshot=JSON.stringify(before);a(C.validate(JSON.parse(snapshot),current));a.equal(JSON.stringify(before),snapshot);
 const saved=JSON.stringify(after.items[original.id]);after.status='reviewed';a.throws(()=>C.edit(after,original.id,'quantity','9'));a.throws(()=>C.finish(after,original.id,true));a.equal(JSON.stringify(after.items[original.id]),saved);
 after.status='draft';C.edit(after,original.id,'quantity','3');a.equal(after.items[original.id].quantity,'3');a.equal(after.items[original.id].unit,before.items[original.id].unit);
});
test('preservation: only two authorized additions; original sequence intact',()=>{a.deepEqual(current.products.filter(p=>!old.products.some(o=>o.id===p.id)).map(p=>[p.id,p.name,p.unit,p.stock,p.order]),[['cn:94','馄饨','箱',null,null],['other:23','롤백(17cm×25cm)','박스',null,null]]);a.deepEqual(current.products.filter(p=>old.products.some(o=>o.id===p.id)),old.products);});
