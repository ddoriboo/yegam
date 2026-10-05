'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','issue.html'),'utf8');
function between(from,to){const a=html.indexOf(from),b=html.indexOf(to,a);assert.ok(a>=0&&b>a);return html.slice(a,b);}
function dom(){const nodes=new Map();return{nodes,document:{getElementById(id){if(!nodes.has(id)){const classes=new Set(id==='result-section'?['hidden']:[]);nodes.set(id,{textContent:'',className:'',classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)}});}return nodes.get(id);}}};}
const resultBlock=between('// 결과 (정산된 경우)','// 베팅 통계');
for(const value of ['Yes','yes','YES','No','no','NO','Draw','draw','DRAW','Cancelled','cancelled','CANCELLED'])test('public outcome label handles '+value,()=>{const d=dom();vm.runInNewContext(resultBlock,{issue:{result:value},document:d.document});const node=d.nodes.get('result-text');const key=value.toLowerCase();assert.equal(node.textContent,{yes:'YES 승리!',no:'NO 승리!',draw:'무승부 · GAM 원금 환불',cancelled:'취소 · GAM 원금 환불'}[key]);assert.ok(node.className.includes(key==='yes'?'green':key==='no'?'red':'gray'));assert.equal(d.nodes.get('result-section').classList.contains('hidden'),false);});
test('unknown outcome never falsely says No won',()=>{const d=dom();vm.runInNewContext(resultBlock,{issue:{result:'unexpected'},document:d.document});assert.equal(d.nodes.get('result-text').textContent,'결과 확인 필요');});
test('unresolved issue does not announce a winner',()=>{const d=dom();vm.runInNewContext(resultBlock,{issue:{result:null},document:d.document});assert.equal(d.nodes.has('result-text'),false);});
const choiceBlock=between('// 내 베팅','// 로그인 상태에 따른 UI');
for(const choice of ['Yes','yes','YES','No','no','NO'])test('existing bet choice color handles '+choice,()=>{const d=dom();vm.runInNewContext(choiceBlock,{issue:{myBet:{choice,amount:1000}},document:d.document});assert.ok(d.nodes.get('my-bet-choice').className.includes(choice.toLowerCase()==='yes'?'green':'red'));});
const cutoffExpression=/const canBet = ([^;\n]+);/.exec(html)[1];
const now=Date.parse('2026-10-06T03:00:00.000Z');
for(const [name,issue,expected]of[
 ['active before cutoff',{status:'active',isBettingClosed:false,betting_end_date:'2026-10-06T04:00:00.000Z'},true],
 ['API already closed betting',{status:'active',isBettingClosed:true,betting_end_date:'2026-10-06T04:00:00.000Z'},false],
 ['exact cutoff has arrived',{status:'active',isBettingClosed:false,betting_end_date:'2026-10-06T03:00:00.000Z'},false],
 ['closed issue',{status:'closed',isBettingClosed:false,betting_end_date:'2026-10-06T04:00:00.000Z'},false],
 ['resolved issue',{status:'resolved',isBettingClosed:false,betting_end_date:'2026-10-06T04:00:00.000Z'},false],
 ['invalid cutoff',{status:'active',isBettingClosed:false,betting_end_date:'invalid'},false]
])test('bet UI respects '+name,()=>{assert.equal(vm.runInNewContext('('+cutoffExpression+')',{issue,Date:{now:()=>now,parse:Date.parse}}),expected);});
