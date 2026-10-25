const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createActivity}=require('../redesign-preview/search-activity.cjs');
const DAY=24*60*60*1000;
const START=Date.UTC(2026,9,26,12);
function device(options={}){
 let time=options.time??START;
 const data=new Map(),writes=[];
 if(options.saved!==undefined)data.set('search',options.saved);
 const env={localStorage:{
  getItem(key){if(options.readThrows)throw Error('denied');return data.get(key)??null;},
  setItem(key,value){if(options.writeThrows)throw Error('quota');writes.push({key,value});data.set(key,value);}
 }};
 if(options.noStorage)delete env.localStorage;
 if(options.storageGetterThrows)Object.defineProperty(env,'localStorage',{get(){throw Error('disabled');}});
 const activity=createActivity(env,{key:'search',now:()=>time});
 return {activity,env,data,writes,options,advance(ms){time+=ms;},time(){return time;},reload(){return createActivity(env,{key:'search',now:()=>time});}};
}
function state(history=[],events=[]){return JSON.stringify({version:1,history,events});}
function event(query,ids,at=START){return {query,ids,at};}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-10,`${actual} differs from ${expected}`);}

test('cold start is empty, does not fabricate heat, and performs no writes',()=>{
 const d=device();assert.deepEqual(d.activity.history(),[]);assert.deepEqual(d.activity.ranked(['cn:33']),[]);
 assert.deepEqual(d.activity.status(),{persistent:true});assert.equal(d.writes.length,0);
});
test('a confirmed multi-product search gives one total point split across unique matches',()=>{
 const d=device();assert.equal(d.activity.record('大葱腐竹虾丸',['kr:7','cn:33','cn:64','cn:33']),true);
 const list=d.activity.ranked(['kr:7','cn:33','cn:64']);assert.deepEqual(list.map(r=>r.id),['kr:7','cn:33','cn:64']);
 for(const r of list){close(r.score,1/3);assert.equal(r.count,1);assert.equal(r.lastAt,START);}
 assert.deepEqual(d.activity.history(),[{query:'大葱腐竹虾丸',at:START}]);
 assert.equal(d.writes.length,1);assert.equal(d.writes[0].key,'search');
});
test('a no-match search is useful history but never creates a hot item',()=>{
 const d=device();assert.equal(d.activity.record('还没有添加的商品',[]),true);
 assert.equal(d.activity.history()[0].query,'还没有添加的商品');assert.deepEqual(d.activity.ranked(['kr:7']),[]);
});
for(const q of ['', '   ', '，、 / ;', '🔥✨', '\u200b\u200c', null, 123, {}, 'a\u0000b', '\ud800', 'a'.repeat(1025), ' '.repeat(4097)]){
 test(`invalid or meaningless query is not recorded: ${JSON.stringify(q).slice(0,60)}`,()=>{
  const d=device();assert.equal(d.activity.record(q,['cn:33']),false);assert.deepEqual(d.activity.history(),[]);assert.equal(d.writes.length,0);
 });
}
test('valid Chinese, Korean syllables, Korean initials, letters and digits are preserved',()=>{
 const d=device();for(const q of ['腐竹','푸주','ㅍㅈ','PB','123','可乐 🥤']){assert.equal(d.activity.record(q,['cn:33']),true);d.advance(1);}
 assert.deepEqual(d.activity.history().map(r=>r.query),['可乐 🥤','123','PB','ㅍㅈ','푸주','腐竹']);
});
test('same query and matches within thirty seconds do not multiply heat or writes',()=>{
 const d=device();assert.equal(d.activity.record('腐竹',['cn:33']),true);d.advance(29999);
 assert.equal(d.activity.record('腐竹',['cn:33','cn:33']),false);assert.equal(d.writes.length,1);assert.equal(d.activity.ranked(['cn:33'])[0].count,1);
 d.advance(1);assert.equal(d.activity.record('腐竹',['cn:33']),true);assert.equal(d.activity.ranked(['cn:33'])[0].count,2);
 assert.equal(d.activity.history().length,1);assert.equal(d.activity.history()[0].at,START+30000);
});
test('normalization deduplicates case, width and equivalent explicit separators',()=>{
 const d=device();d.activity.record('ＰＢ，腐竹',['other:6','cn:33']);
 for(const q of ['pb 腐竹','PB、腐竹','  pb / 腐竹  '])assert.equal(d.activity.record(q,['cn:33','other:6']),false);
 assert.equal(d.writes.length,1);assert.equal(d.activity.history()[0].query,'ＰＢ，腐竹');
});
test('explicit product boundaries do not collapse into a different concatenated name',()=>{
 const d=device();assert.equal(d.activity.record('土豆淀粉',['cn:16']),true);
 assert.equal(d.activity.record('土豆、淀粉',['cn:16']),true);assert.equal(d.activity.history().length,2);
});
test('letter-by-letter whitespace matches existing search normalization but punctuation remains explicit',()=>{
 const d=device();d.activity.record('土豆淀粉',['cn:16']);
 assert.equal(d.activity.record('土 豆 淀 粉',['cn:16']),false);
 assert.equal(d.activity.record('土、豆、淀、粉',['cn:16']),true);
});
test('changed matches for the same query can create a new event while history stays unique',()=>{
 const d=device();d.activity.record('豆腐',['cn:1']);d.activity.record('豆腐',['cn:1','cn:2']);
 assert.equal(d.activity.history().length,1);const rank=d.activity.ranked(['cn:1','cn:2']);close(rank[0].score,1.5);close(rank[1].score,.5);
});
test('an interleaved second search does not defeat cooldown for the first',()=>{
 const d=device();d.activity.record('腐竹',['cn:33']);d.activity.record('大葱',['kr:7']);d.advance(5000);
 assert.equal(d.activity.record('腐竹',['cn:33']),false);assert.equal(d.activity.ranked(['cn:33'])[0].count,1);
});
test('cooldown survives reload',()=>{
 const d=device();d.activity.record('腐竹',['cn:33']);d.advance(1000);const restored=d.reload();
 assert.equal(restored.record('腐竹',['cn:33']),false);assert.equal(restored.ranked(['cn:33'])[0].count,1);
});
test('heat has a seven-day half-life and recent interest outranks an old single search',()=>{
 const d=device();d.activity.record('腐竹',['cn:33']);d.advance(7*DAY);
 close(d.activity.ranked(['cn:33'])[0].score,.5);d.activity.record('大葱',['kr:7']);
 const rank=d.activity.ranked(['cn:33','kr:7']);assert.deepEqual(rank.map(r=>r.id),['kr:7','cn:33']);close(rank[0].score,1);
 d.advance(7*DAY);close(d.activity.ranked(['cn:33'])[0].score,.25);
});
test('events expire after thirty days while recent search history remains recallable',()=>{
 const d=device();d.activity.record('腐竹',['cn:33']);d.advance(30*DAY);assert.equal(d.activity.ranked(['cn:33']).length,1);
 d.advance(1);assert.deepEqual(d.activity.ranked(['cn:33']),[]);assert.equal(d.activity.history()[0].query,'腐竹');
});
test('old history does not reintroduce expired heat on reload',()=>{
 const d=device();d.activity.record('腐竹',['cn:33']);d.advance(31*DAY);const restored=d.reload();
 assert.equal(restored.history().length,1);assert.deepEqual(restored.ranked(['cn:33']),[]);
});
test('ranking filters removed products without redistributing their original points',()=>{
 const d=device();d.activity.record('大葱腐竹',['kr:7','cn:33']);
 const rank=d.activity.ranked(['cn:33']);assert.equal(rank.length,1);close(rank[0].score,.5);
});
test('identical score and timestamp ties follow current catalog order, not storage or lexical order',()=>{
 const d=device();d.activity.record('大葱腐竹虾丸',new Set(['cn:64','cn:33','kr:7']));
 assert.deepEqual(d.activity.ranked(['kr:7','cn:64','cn:33']).map(r=>r.id),['kr:7','cn:64','cn:33']);
 assert.deepEqual(d.activity.ranked(new Set(['cn:33','kr:7','cn:64'])).map(r=>r.id),['cn:33','kr:7','cn:64']);
});
test('rank limits are bounded and zero explicitly means no rows',()=>{
 const d=device();d.activity.record('多个商品',Array.from({length:12},(_,i)=>'cn:'+i));
 const ids=Array.from({length:12},(_,i)=>'cn:'+i);
 assert.equal(d.activity.ranked(ids).length,8);assert.equal(d.activity.ranked(ids,3.9).length,3);
 assert.equal(d.activity.ranked(ids,0).length,0);assert.equal(d.activity.ranked(ids,-1).length,0);
 assert.equal(d.activity.ranked(ids,Infinity).length,8);assert.equal(d.activity.ranked(ids,999).length,12);
});
test('history is unique, newest first, capped at twenty, and repeating an older entry moves it up',()=>{
 const d=device();for(let i=0;i<25;i++){d.activity.record('商品'+i,['cn:'+i]);d.advance(30001);}
 assert.equal(d.activity.history().length,20);assert.equal(d.activity.history()[0].query,'商品24');assert.equal(d.activity.history()[19].query,'商品5');
 d.activity.record('商品10',['cn:10']);assert.equal(d.activity.history()[0].query,'商品10');assert.equal(d.activity.history().length,20);
});
test('the newest five hundred confirmations bound persisted data and scoring',()=>{
 const d=device();for(let i=0;i<507;i++){d.activity.record('商品'+i,['cn:1']);d.advance(30001);}
 const saved=JSON.parse(d.data.get('search'));assert.equal(saved.events.length,500);assert.equal(saved.history.length,20);
 assert.equal(saved.events[499].query,'商品7');assert.equal(d.activity.ranked(['cn:1'])[0].count,500);
});
test('clear resets both history and popularity, persists, and resets cooldown',()=>{
 const d=device();d.activity.record('腐竹',['cn:33']);d.activity.clear();
 assert.deepEqual(d.activity.history(),[]);assert.deepEqual(d.activity.ranked(['cn:33']),[]);
 assert.deepEqual(d.reload().history(),[]);assert.deepEqual(d.reload().ranked(['cn:33']),[]);
 assert.equal(d.activity.record('腐竹',['cn:33']),true);assert.equal(d.activity.ranked(['cn:33'])[0].count,1);
});
test('persisted histories and events round-trip with equal ranking and display text',()=>{
 const d=device();d.activity.record('  大葱，腐竹  ',['kr:7','cn:33']);d.advance(50000);d.activity.record('虾丸',['cn:64']);
 const restored=d.reload();assert.deepEqual(restored.history(),d.activity.history());assert.deepEqual(restored.ranked(['kr:7','cn:33','cn:64']),d.activity.ranked(['kr:7','cn:33','cn:64']));
 assert.equal(restored.history()[1].query,'大葱，腐竹');
});
for(const saved of ['{broken','null','[]','{}','{"version":2,"history":[],"events":[]}','{"version":1,"history":{},"events":[]}']){
 test(`corrupt or unknown saved format safely starts empty: ${saved}`,()=>{
  const d=device({saved});assert.deepEqual(d.activity.history(),[]);assert.deepEqual(d.activity.ranked(['cn:33']),[]);assert.equal(d.activity.status().persistent,false);
  assert.equal(d.activity.record('腐竹',['cn:33']),true);assert.equal(d.activity.status().persistent,true);assert.equal(d.reload().history()[0].query,'腐竹');
 });
}
test('malformed individual rows are ignored without discarding valid neighbors',()=>{
 const saved=state([{query:'腐竹',at:START},{query:'坏时间',at:'12'},null,{query:'未来',at:START+1}],
 [event('腐竹',['cn:33']),null,event('', ['cn:1']),event('过期',['cn:2'],START-31*DAY),event('未来',['cn:3'],START+1),{query:'坏IDs',at:START,ids:{}},{query:'坏数字',at:Infinity,ids:['cn:4']}]);
 const d=device({saved});assert.deepEqual(d.activity.history(),[{query:'腐竹',at:START}]);assert.deepEqual(d.activity.ranked(['cn:33','cn:1','cn:2','cn:3','cn:4']).map(r=>r.id),['cn:33']);
});
test('restored duplicate histories keep the newest normalized display query',()=>{
 const d=device({saved:state([{query:'PB 腐竹',at:START-1},{query:'ＰＢ，腐竹',at:START},{query:'大葱',at:START-2}])});
 assert.deepEqual(d.activity.history().map(r=>r.query),['ＰＢ，腐竹','大葱']);
});
test('restored event arrays are bounded and sorted newest first',()=>{
 const events=Array.from({length:600},(_,i)=>event('商品'+i,['cn:1'],START-1000*(600-i)));
 const d=device({saved:state([],events)});assert.equal(d.activity.ranked(['cn:1'])[0].count,500);
 d.activity.record('新商品',['cn:2']);const saved=JSON.parse(d.data.get('search'));
 assert.equal(saved.events.length,500);assert.equal(saved.events[0].query,'新商品');assert.equal(saved.events[499].query,'商品101');
});
for(const flag of ['readThrows','writeThrows','noStorage','storageGetterThrows']){
 test(`${flag} falls back to session memory without breaking search activity`,()=>{
  const d=device({[flag]:true});assert.doesNotThrow(()=>d.activity.record('腐竹',['cn:33']));
  assert.equal(d.activity.history()[0].query,'腐竹');assert.equal(d.activity.ranked(['cn:33'])[0].count,1);assert.equal(d.activity.status().persistent,false);
  assert.doesNotThrow(()=>d.activity.clear());assert.deepEqual(d.activity.history(),[]);assert.deepEqual(d.activity.ranked(['cn:33']),[]);
 });
}
test('quota recovery persists all in-memory events on a later successful write',()=>{
 const d=device({writeThrows:true});d.activity.record('腐竹',['cn:33']);assert.equal(d.activity.status().persistent,false);
 d.options.writeThrows=false;d.activity.record('大葱',['kr:7']);assert.equal(d.activity.status().persistent,true);
 assert.equal(d.reload().history().length,2);assert.equal(d.reload().ranked(['cn:33','kr:7']).length,2);
});
test('clearing after a write failure clears session memory and reports non-persistence honestly',()=>{
 const d=device();d.activity.record('腐竹',['cn:33']);d.options.writeThrows=true;d.activity.clear();
 assert.deepEqual(d.activity.history(),[]);assert.deepEqual(d.activity.ranked(['cn:33']),[]);assert.equal(d.activity.status().persistent,false);
});
test('exposed values and caller arrays cannot mutate stored history, scores or persistence state',()=>{
 const d=device(),ids=['cn:33'];d.activity.record('腐竹',ids);ids.push('kr:7');
 d.activity.history()[0].query='改掉';const rank=d.activity.ranked(['cn:33']);rank[0].score=999;rank.push({id:'kr:7'});d.activity.status().persistent=false;
 assert.equal(d.activity.history()[0].query,'腐竹');assert.equal(d.activity.ranked(['cn:33'])[0].score,1);assert.equal(d.activity.ranked(['kr:7']).length,0);assert.equal(d.activity.status().persistent,true);
});
test('special property names remain ordinary map keys and HTML-shaped history remains inert text',()=>{
 const d=device();const query='<img src=x onerror=alert(1)>腐竹';assert.equal(d.activity.record(query,['__proto__','constructor']),true);
 assert.equal(d.activity.history()[0].query,query);assert.equal(d.activity.ranked(['constructor','__proto__']).length,2);
 assert.equal({}.polluted,undefined);assert.equal(d.reload().history()[0].query,query);
});
test('invalid identifiers are ignored and overlarge match sets are rejected without truncated heat',()=>{
 const d=device();assert.equal(d.activity.record('腐竹',['cn:33','bad id','',null,{},'a'.repeat(129)]),true);
 assert.deepEqual(d.activity.ranked(['cn:33','bad id']).map(r=>r.id),['cn:33']);
 assert.equal(d.activity.record('太多商品',Array.from({length:257},(_,i)=>'cn:'+i)),false);
 assert.deepEqual(d.activity.ranked('cn:33'),[]);assert.equal(d.activity.history().length,1);
});
test('a clock moving backwards cannot let future events dominate rankings',()=>{
 const d=device();d.activity.record('腐竹',['cn:33']);d.advance(-1);assert.deepEqual(d.activity.ranked(['cn:33']),[]);
 assert.equal(d.activity.record('大葱',['kr:7']),true);assert.deepEqual(d.activity.ranked(['kr:7','cn:33']).map(r=>r.id),['kr:7']);
});
