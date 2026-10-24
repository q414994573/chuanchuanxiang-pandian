'use strict';
// Confirmed with the shop on 2026-10-24. Presentation/search only:
// never rewrite catalog snapshots, product IDs, quantities, or source hashes.
const entries = [
 ['cn:5','辣椒段','건고추'],
 ['cn:7','特辣辣椒面','매운 고춧가루'],
 ['cn:9','鸡精','치킨스톡'],
 ['cn:10','双效泡打粉','베이킹파우더'],
 ['cn:12','人造肉','두부피'],
 ['cn:13','水晶豆皮','두유피'],
 ['cn:14','粉条','중국당면'],
 ['cn:19','干豆腐','건두부'],
 ['cn:20','炒饭虾仁','새우알','새우살'],
 ['cn:21','水饺','물만두'],
 ['cn:22','面包虾','멘보샤'],
 ['cn:25','芝麻酱','즈마장'],
 ['cn:26','绿豆','녹두'],
 ['cn:33','腐竹','푸주'],
 ['cn:34','银耳','백목이버섯'],
 ['cn:35','木耳','흑목이버섯'],
 ['cn:39','藤椒油','등초유'],
 ['cn:41','海鲜酱油','해선간장'],
 ['cn:46','牛筋面','뉴진면'],
 ['cn:47','火锅粉','넓적분모자','넙적분모자'],
 ['cn:55','木棉豆腐','목면두부'],
 ['cn:57','手抓饼','쇼좌빙'],
 ['cn:58','去皮大虾','깐새우'],
 ['cn:60','玉米肠','옥수수콘 소시지','옥수수콘 소세지'],
 ['cn:62','章鱼丸','문어완자'],
 ['cn:63','墨鱼丸','갑오징어완자'],
 ['cn:64','虾丸','새우완자'],
 ['cn:75','粉丝','실당면','분사'],
 ['cn:77','火锅炖粉','훠궈당면'],
 ['cn:79','牛油','우지'],
 ['cn:81','冰红茶','빙홍차'],
 ['other:7','去油污洗洁剂','피비']
];
const byId=new Map(entries.map(([id,zh,ko,...aliases])=>[id,Object.freeze({zh,ko,aliases:Object.freeze(aliases)})]));
function get(p){return p && byId.get(p.id);}
function large(p){return get(p)?.ko ?? String(p?.name ?? '');}
function small(p){const n=get(p);if(n)return n.zh;const alias=String(p?.alias??'');return alias===large(p)?'':alias;}
function searchNames(p){const n=get(p);return n?[n.zh,n.ko,...n.aliases]:[];}
module.exports={large,small,searchNames};
