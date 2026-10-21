const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const Flow=require('../redesign-preview/count-flow.cjs');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

function officialProducts(){
 const html=read('index.html');
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
 const data=JSON.parse(scripts.find(x=>x[1].includes('embedded-data'))[2]);
 return data.products;
}

function boldText(html){
 return [...html.matchAll(/<b>([\s\S]*?)<\/b>/g)].map(m=>m[1].replace(/<[^>]+>/g,''));
}

test('preview large names match the 129 original names, order, and units',()=>{
 const official=officialProducts();
 const loaded=JSON.parse(read('current-order.json')).products;
 assert.equal(official.length,129);
 assert.deepEqual(official.map(p=>p.cat).slice(0,45),Array(45).fill('kr'));
 assert.deepEqual(official.map(p=>p.cat).slice(45,111),Array(66).fill('cn'));
 assert.deepEqual(official.map(p=>p.cat).slice(111),Array(18).fill('other'));
 assert.deepEqual(loaded.map(p=>[p.id,p.name,p.unit??'',p.cat]),official.map(p=>[p.id,p.name,p.unit??'',p.cat]));

 const rows=Flow.sheetRows(loaded);
 assert.equal(rows.length,129);
 assert.equal(rows.filter(r=>r.block==='韩国食品').length,45);
 assert.equal(rows.filter(r=>r.block==='中国食品').length,66);
 assert.equal(rows.filter(r=>r.block==='其他商品').length,18);
 assert.deepEqual(rows.map(r=>r.large),official.map(p=>p.name));
 assert.deepEqual(rows.map(r=>r.unit),official.map(p=>p.unit??''));
 assert.equal(new Set(rows.map(r=>r.large)).size,129);
 assert.equal(new Set(loaded.map(p=>p.id)).size,129);

 const rendered=loaded.map(p=>Flow.countTitleHtml(p,s=>s)).join('\n');
 assert.deepEqual(boldText(rendered),official.map(p=>p.name));
 const orderHits=loaded.map(p=>Flow.boldName(p,s=>s)).join('');
 assert.deepEqual(boldText(orderHits),official.map(p=>p.name));

 const byId=new Map(rows.map(r=>[loaded.find(p=>p.name===r.large).id,r]));
 assert.equal(byId.get('kr:3').large,'양상추');
 assert.equal(byId.get('kr:3').small,'生菜');
 assert.equal(byId.get('cn:3').large,'월계수잎');
 assert.equal(byId.get('cn:3').small,'香叶');
 assert.equal(byId.get('cn:5').small,'');
 assert.equal(byId.get('cn:9').large,'鸡精');
 assert.equal(byId.get('cn:9').small,'');
 assert.equal(byId.get('cn:54').large,'갑오징어피쉬볼(大)');
 assert.equal(byId.get('cn:54').small,'');
 assert.equal(byId.get('other:8').large,'대나무 꼬치 (길이18cm·지름2.5mm)');
 assert.equal(byId.get('other:8').small,'');
 assert.equal(byId.get('cn:45').unit,'');
 assert.equal(byId.get('other:11').unit,'');
 assert.equal(Flow.smallName({name:'双效泡打粉',alias:'泡打粉'}),'泡打粉');
 assert.equal(Flow.countTitleHtml({name:'양상추',alias:'生菜',unit:'통'},s=>s).includes('>生菜 · 통<'),true);
 assert.equal(Flow.countTitleHtml({name:'鸡精',alias:'鸡精',unit:'包'},s=>s).includes('生菜'),false);
 assert.equal(Flow.countTitleHtml({name:'鸡精',alias:'鸡精',unit:'包'},s=>s).includes('>鸡精<'),true);

 const js=read('redesign-preview/preview.js');
 assert.match(js,/Flow\.countTitleHtml\(\{\.\.\.p,hideUnit:true/);
 assert.match(js,/Flow\.boldName\(p,E\)/);
 assert.match(js,/Flow\.smallName\(p\)/);
 assert.equal(js.includes('showName'),false);
 assert.equal(js.includes('alias||p.name'),false);
 assert.match(js,/name:p\.name/);

 const lines=rows.map(r=>[r.n,r.block,r.large,r.small,r.unit].join('\t'));
 assert.equal(lines.length,129);
 const out=path.join('/opt/cursor/artifacts/redesign-v2/items-check.txt');
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,lines.join('\n')+'\n');
});
