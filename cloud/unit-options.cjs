'use strict';
// Permanent template, verified 2026-10-21: 中国食品!D45, 其他商品!C11.
// Options are independent choices, never conversion ratios or defaults.
const choices={
 'cn:45':[['박스','整箱'],['봉','单包']],
 'other:11':[['세트','盒身和盖子一套'],['몸통만','只要盒身，不要盖子']]
};
function valid(id,value){return typeof value==='string'&&(value===''||choices[id]?.some(([unit])=>unit===value));}
function checkChange(before,after){
 if(!after||Object.keys(before).length!==Object.keys(after).length)throw Error('单位目录不完整');
 for(const id of Object.keys(before))if(after[id]!==before[id]&&(!choices[id]||!valid(id,after[id])))throw Error('只能选择永久模板规定的单位');
 return after;
}
module.exports={choices,valid,checkChange};
