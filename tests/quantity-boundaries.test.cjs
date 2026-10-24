const {test}=require('node:test'),assert=require('node:assert/strict');
const Core=require('../count-core.js'),Flow=require('../redesign-preview/count-flow.cjs');
// Explicit business expectations: stock permits zero; orders must be positive.
const examples=[
 ['',null],['0',0],['0.000',0],['0.001',0.001],['1',1],['1.0',1],['1.250',1.25],['0001',1],
 ['999999.999',999999.999],['1000000',1000000],['1000000.000',1000000],['1000000.001',null],
 ['1000001',null],['0.0001',null],['1.2345',null],['-1',null],['+1',null],['1e3',null],
 ['NaN',null],['Infinity',null],['1,000',null],['１',null],['1/2',null],['2箱',null]
];
for(const [value,expected] of examples)test(`quantity boundary ${JSON.stringify(value)}: inventory/order numeric agreement`,()=>{
 assert.equal(Core.number(value),expected);assert.equal(Flow.isNumericQty(value),expected!==null&&expected>0);
});
