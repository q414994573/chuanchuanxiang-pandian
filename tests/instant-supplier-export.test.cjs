const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('../count-core.js');
const source=require('../current-order.json');
const legacy=fs.readFileSync(require.resolve('./redesign-interactions.test.cjs'),'utf8');
const body=legacy.slice(legacy.indexOf('function harness('),legacy.indexOf("test('production mode"));
const harness=Function('require','Core','source',`const fs=require('node:fs'),vm=require('node:vm');${body};return harness;`)(require,Core,source);
const setup=(role,offline=false)=>{
 const h=harness(true),deliveries=[],calls=[];
 h.ctx.navigator={onLine:!offline,clipboard:{writeText(text){calls.push('clipboard');deliveries.push({kind:'copy',text});return Promise.resolve();}},share({text}){calls.push('share');deliveries.push({kind:'share',text});return Promise.resolve();}};
 h.run(`buildSample('boss');sample=false;member={role:'${role}',name:'测试账号'};order.orderStage='finalized';baseQty={...order.quantities};orderBase=C.clone(order);api={read:()=>{throw Error('copied with unnecessary server read')}};`);
 return {h,deliveries,calls};
};
for(const role of ['owner','editor'])for(const cat of ['kr','cn','other']){
 test(`one tap copy and share are equally immediate for ${role} / ${cat}`,async()=>{
  const {h,deliveries,calls}=setup(role);
  const expected=h.run(`blockText('${cat}')`);
  const copying=h.run(`supplierExport('${cat}')`);
  assert.deepEqual(calls,['clipboard'],'clipboard must be invoked synchronously');await copying;
  const sharing=h.run(`supplierExport('${cat}',true)`);
  assert.deepEqual(calls,['clipboard','share'],'system share must be invoked synchronously');await sharing;
  assert.deepEqual(deliveries,[{kind:'copy',text:expected},{kind:'share',text:expected}]);
  assert.equal(h.run('order.revision'),h.run('orderBase.revision'));
  assert.equal(h.run('preparedExport'),null,'one tap must not force a preview');
 });
 test(`repeat alternate buttons need zero network reads for ${role} / ${cat}`,async()=>{
  const {h,deliveries}=setup(role);
  for(let i=0;i<8;i++)await h.run(`supplierExport('${cat}',${i%2===1})`);
  assert.equal(deliveries.length,8);
  assert.ok(deliveries.every(x=>x.text===deliveries[0].text));
 });
 test(`offline copy and share use exactly the last confirmed version for ${role} / ${cat}`,async()=>{
  const {h,deliveries}=setup(role,true);
  await h.run(`supplierExport('${cat}')`);assert.match(h.run('lastToast'),/离线/);
  await h.run(`supplierExport('${cat}',true)`);assert.match(h.run('lastToast'),/离线/);
  assert.deepEqual(deliveries.map(x=>x.kind),['copy','share']);
  assert.match(h.run(`blockHtml('${cat}')`),/当前离线/);
 });
 test(`optional preview never becomes a mandatory extra step for ${role} / ${cat}`,async()=>{
  const {h,deliveries}=setup(role);
  h.run(`supplierPreview('${cat}')`);
  assert.equal(deliveries.length,0);
  assert.match(h.run('exportPanel()'),/订货文字预览/);
  await h.run('deliverPrepared(false)');await h.run('deliverPrepared(true)');
  assert.deepEqual(deliveries.map(x=>x.kind),['copy','share']);
 });
}
for(const role of ['owner','editor']){
 test(`unfinalized order never exports on either account (${role})`,async()=>{
  const {h,deliveries}=setup(role);
  h.run(`order.orderStage='pending'`);
  await assert.rejects(h.run(`supplierExport('kr')`),/定稿/);
  assert.throws(()=>h.run(`supplierPreview('kr')`),/定稿/);
  assert.equal(deliveries.length,0);
 });
 test(`unsaved stock, quantities and units block both accounts (${role})`,async()=>{
  for(const field of ['qty','stock','unit']){
   const {h,deliveries}=setup(role);
   const line=field==='qty'?"order.quantities['kr:7']+=1000":field==='stock'?"stocks['kr:43']='77'":"order.units['kr:7']='箱'";
   h.run(line);
   await assert.rejects(h.run(`supplierExport('kr')`),/先完成保存/);
   assert.equal(deliveries.length,0);
  }
 });
 test(`reopening, new revision or another order invalidates an old preview (${role})`,async()=>{
  for(const change of ["order.orderStage='pending'","order.revision++","order.id='other-order'"]){
   const {h,deliveries}=setup(role);
   h.run(`supplierPreview('kr')`);h.run(change);
   await assert.rejects(h.run('deliverPrepared(false)'),/切换|定稿/);
   assert.equal(deliveries.length,0);
  }
 });
 test(`no exported copy marks the order sent or changes any quantities (${role})`,async()=>{
  const {h}=setup(role);
  const before=h.run('JSON.stringify([order.quantities,order.units,order.sent,order.revision,order.orderStage])');
  for(let i=0;i<6;i++)await h.run(`supplierExport('cn',${i%2===1})`);
  assert.equal(h.run('JSON.stringify([order.quantities,order.units,order.sent,order.revision,order.orderStage])'),before);
 });
}
