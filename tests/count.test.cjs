const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),C=require('../count-core.js');
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../current-order.json'),'utf8')),original=JSON.stringify(source);
const d=C.create(source,'2026-10-19','count-test-1');
assert(C.validate(d,source));assert.equal(d.catalog.length,129);assert.deepEqual(d.catalog.map(p=>p.id),source.products.map(p=>p.id));assert(d.catalog.every(p=>d.items[p.id].stock===''&&d.items[p.id].quantity===''));assert.equal(d.catalog.filter(p=>C.complete(d,p)).length,0);
for(const bad of ['','-1','1e3','2箱','NaN','Infinity','1000001','1.0001'])assert.equal(C.number(bad),null);assert.equal(C.number('0'),0);assert.equal(C.number('0.5'),0.5);
const p=d.catalog.find(p=>p.id==='kr:4');C.edit(d,p.id,'stock','0');C.edit(d,p.id,'decision','skip');assert(C.warnings(d,p).length);assert(!C.complete(d,p));C.edit(d,p.id,'acknowledged',true);assert(C.complete(d,p));C.edit(d,p.id,'quantity','20');assert.equal(d.items[p.id].decision,'order');assert.equal(d.items[p.id].acknowledged,false);assert(C.warnings(d,p).some(x=>x.includes('变化')));C.edit(d,p.id,'unit','箱');assert(C.warnings(d,p).some(x=>x.includes('单位')));C.edit(d,p.id,'decision','skip');assert.equal(d.items[p.id].quantity,'');
assert.throws(()=>C.edit(d,p.id,'stockStatus','exempt'));
const star=d.catalog.find(p=>p.star);C.edit(d,star.id,'stock','1');C.edit(d,star.id,'decision','skip');assert(!C.complete(d,star));C.edit(d,star.id,'physical',true);assert(C.complete(d,star));
const other=d.catalog.find(p=>!p.hasStock);C.edit(d,other.id,'stockStatus','exempt');C.edit(d,other.id,'decision','skip');assert(C.complete(d,other));
assert.throws(()=>C.orderText(d,'kr'));
// Test fixture values only; production/source quantities are never changed.
for(const p of d.catalog){C.edit(d,p.id,'stock','1');C.edit(d,p.id,'stockUnit',p.unit||'个');C.edit(d,p.id,'decision','skip');if(p.star||C.special(p))C.edit(d,p.id,'physical',true);}
C.edit(d,'kr:4','quantity','2');C.edit(d,'kr:4','unit','봉');C.edit(d,'kr:4','stockUnit','봉');C.edit(d,'kr:4','acknowledged',true);
assert(d.catalog.every(p=>C.complete(d,p)));d.status='reviewed';assert(C.validate(d,source));assert(C.orderText(d,'kr').includes('깐마늘 2봉'));assert(C.orderText(d,'cn').includes('本次无订货'));assert.throws(()=>C.edit(d,'kr:4','quantity','3'));
const restored=JSON.parse(JSON.stringify(d));assert(C.validate(restored,source));restored.items['kr:4'].unit='';assert(!C.validate(restored,source));
const wrong=C.clone(d);wrong.catalog.reverse();assert(!C.validate(wrong,source));const inconsistent=C.clone(d);inconsistent.items['kr:3'].quantity='10';assert(!C.validate(inconsistent,source));
assert.equal(JSON.stringify(source),original);
console.log('PASS: route order, blank new counts, numeric validation, zero/skip distinction, special checks, unit and quantity warnings, positive-order validation, all-item final gate, locked orders, backup round-trip and source immutability.');
