'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {AutomaticSettlement}=require('../services/automaticSettlement');
const rule={version:1,provider:'upbit',market:'KRW-BTC',metric:'minute_close',operator:'gt',threshold:100,observation_at:'2000-01-01T00:00:00.000Z',missing_data_policy:'cancel_after_24h'};
const issue={id:138,title:'BTC',status:'closed',result:null,end_date:new Date(rule.observation_at),betting_end_date:new Date('1999-12-31T18:00:00.000Z'),resolution_params:rule};
function setup(overrides={}){
 const calls={queries:[],settles:[],notifications:[],resolves:0};
 const deps={enabled:()=>true,skipRateDelay:true,ensureSchema:async()=>{},
 query:async(sql,args)=>{calls.queries.push({sql,args});return{rows:sql.includes('SELECT * FROM issues')?[issue]:[],rowCount:1};},
 resolve:async()=>{calls.resolves++;return{status:'Yes',evidence:{candle_open_at:'1999-12-31T23:59:00.000Z',close:101}};},
 settle:async(id,options)=>{calls.settles.push({id,options});return{alreadySettled:false,issueId:id,result:options.result,totalStaked:'100',totalPaid:'95',credits:[]};},
 notifications:{createNotification:async(n)=>calls.notifications.push(n)},...overrides};
 const runner=new AutomaticSettlement(deps);runner.initialized=true;return{runner,calls};
}
test('uninitialized runner cannot touch database or pay',async()=>{const{runner,calls}=setup();runner.initialized=false;assert.equal((await runner.run()).reason,'SCHEMA_NOT_READY');assert.equal(calls.queries.length,0);});
test('feature is disabled by default boundary',async()=>{const{runner,calls}=setup({enabled:()=>false});assert.equal((await runner.run()).reason,'AUTO_RESOLUTION_DISABLED');assert.equal(calls.queries.length,0);});
test('dry run proposes official result without any writes',async()=>{const{runner,calls}=setup({enabled:()=>false});const report=await runner.run({dryRun:true});assert.equal(report.settled[0].proposedResult,'Yes');assert.equal(calls.settles.length,0);assert.equal(calls.queries.length,1);});
test('official result passes expected rule and evidence to atomic payout',async()=>{const{runner,calls}=setup();const report=await runner.run();assert.equal(report.settled[0].result,'Yes');assert.deepEqual(calls.settles[0].options.expectedRule,rule);assert.equal(calls.settles[0].options.source,'upbit');assert.equal(calls.settles[0].options.decidedBy,null);assert.equal(calls.settles[0].options.evidence.close,101);});
test('missing candle records pending but never pays',async()=>{const{runner,calls}=setup({resolve:async()=>({status:'pending',reason:'missing_candle'})});const report=await runner.run();assert.equal(report.pending.length,1);assert.equal(calls.settles.length,0);assert.ok(calls.queries[1].sql.includes('result IS NULL'));});
test('rate limiting stops this batch instead of sending more requests',async()=>{let count=0;const{runner}=setup({query:async(sql)=>({rows:sql.includes('SELECT *')?[issue,{...issue,id:139}]:[],rowCount:1}),resolve:async()=>{count++;return{status:'pending',reason:'rate_limited'};}});await runner.run();assert.equal(count,1);});
test('committed payout survives notification failure without retry',async()=>{const{runner,calls}=setup({settle:async(id,opts)=>{calls.settles.push(id);return{alreadySettled:false,issueId:id,result:opts.result,totalStaked:'100',totalPaid:'95',credits:[{userId:1,betId:1,choice:'Yes',stake:100,kind:'win',amount:'95'}]};},notifications:{createNotification:async()=>{throw new Error('delivery failure');}}});const report=await runner.run();assert.equal(report.settled.length,1);assert.equal(report.failed.length,0);assert.equal(calls.settles.length,1);});
test('payout failure remains unresolved and records only bounded code',async()=>{const{runner,calls}=setup({settle:async()=>{throw Object.assign(new Error('private database details'),{code:'RULE_CHANGED'});}});const report=await runner.run();assert.deepEqual(report.failed,[{id:138,code:'RULE_CHANGED'}]);assert.equal(report.settled.length,0);assert.equal(calls.queries[1].args[0],'RULE_CHANGED');});
test('invalid rule does not reach provider or payout',async()=>{const{runner,calls}=setup({query:async(sql)=>({rows:sql.includes('SELECT *')?[{...issue,resolution_params:{...rule,url:'https://not-upbit.invalid'}}]:[],rowCount:1})});const report=await runner.run();assert.equal(report.failed.length,1);assert.equal(calls.resolves,0);assert.equal(calls.settles.length,0);});
