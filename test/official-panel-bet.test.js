'use strict';
const {test,before,after,beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const {PGlite} = require('@electric-sql/pglite');
const {placeBet} = require('../services/placeBet');
const {placePanelBet} = require('../services/officialPanelBet');
const {OFFICIAL_PANEL_SCHEMA_SQL} = require('../database/official-panel-schema');
const {ruleKey,officialDescription} = require('../services/resolutionProviders');
const {officialTitle} = require('../services/officialResolutionRules');
let db, calls, inputs, status, deps, failAudit;
before(async()=>{
 db = new PGlite();
 await db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,gam_balance INTEGER,ai_panel_role TEXT UNIQUE);
 CREATE TABLE issues(id INTEGER PRIMARY KEY,title TEXT,category TEXT,description TEXT,status TEXT,result TEXT,end_date TIMESTAMPTZ,betting_end_date TIMESTAMPTZ,yes_volume INTEGER DEFAULT 0,no_volume INTEGER DEFAULT 0,total_volume INTEGER DEFAULT 0,yes_price INTEGER DEFAULT 50,resolution_params JSONB,resolution_key TEXT,updated_at TIMESTAMPTZ);
 CREATE TABLE bets(id SERIAL PRIMARY KEY,user_id INTEGER,issue_id INTEGER,choice TEXT,amount INTEGER,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,issue_id));
 CREATE TABLE gam_transactions(id SERIAL PRIMARY KEY,user_id INTEGER,type TEXT,category TEXT,amount INTEGER,description TEXT,reference_id TEXT);
 CREATE TABLE admins(id INTEGER PRIMARY KEY);`);
});
after(async()=>{await db.close();});
beforeEach(async()=>{
 await db.exec('DROP TABLE IF EXISTS official_panel_bet_audits CASCADE; TRUNCATE users,issues,bets,gam_transactions RESTART IDENTITY CASCADE;');
 await db.exec(OFFICIAL_PANEL_SCHEMA_SQL);
 await db.exec("INSERT INTO users VALUES(1,1000,'number'),(2,1000,NULL); INSERT INTO gam_transactions(user_id,type,category,amount,reference_id) VALUES(1,'earn','ai_panel_initial',1000,'ai-panel-initial:number');");
 calls=[];inputs=[];failAudit=false;
 status={initialized:true,providers:[{provider:'upbit',version:1,enabled:true}]};
 deps={automaticSettlement:{getStatus:()=>status},getClient:async()=>({query:async(sql,params)=>{calls.push(sql);if(failAudit&&sql.includes('INSERT INTO official_panel_bet_audits'))throw Error('audit failed');return db.query(sql,params);},release(){}})};
 for(let i=1;i<=3;i++){
  const obs=new Date(Math.ceil(Date.now()/60000)*60000+3600000+i*60000).toISOString();
  const rule={version:1,provider:'upbit',market:'KRW-BTC',metric:'minute_close',operator:'gt',threshold:100000000,observation_at:obs,missing_data_policy:'cancel_after_24h'};
  const title='비트코인 기준가 100,000,000원 초과 여부';
  const description=ruleKey(rule)+'\n업비트 고정 1분봉 종가가 기준가 100,000,000원을 초과하면 YES, 같거나 낮으면 NO. 자료 누락 시 24시간 후 취소.';
  await db.query("INSERT INTO issues(id,title,status,end_date,betting_end_date,resolution_params,resolution_key,category,description) VALUES($1,$6,'active',$2,$3,$4,$5,'코인',$7)",[i,obs,new Date(Date.parse(obs)-600000).toISOString(),JSON.stringify(rule),ruleKey(rule),title,description]);
  inputs.push({personaKey:'number',issueId:i,choice:'Yes',amount:100,rationale:'공식 업비트 자료를 확인했으며 기준선과 현재 가격 차이를 고려한 제한적 판단입니다.',evidenceAt:new Date().toISOString(),sourceUrls:['https://api.upbit.com/v1/ticker?markets=KRW-BTC'],expectedResolutionKey:ruleKey(rule)});
 }
});
const run=(i=0,changes={})=>placePanelBet({...inputs[i],...changes},deps);
async function reject(code,i=0,changes={}){await assert.rejects(run(i,changes),e=>e.code===code);}
async function count(table){return Number((await db.query('SELECT count(*) AS n FROM '+table)).rows[0].n);}
async function balance(){return (await db.query('SELECT gam_balance FROM users WHERE id=1')).rows[0].gam_balance;}
test('atomic success uses fixed persona, not supplied userId; locks issue before user before cap',async()=>{
 const r=await run(0,{userId:2});assert.equal(r.balance,900);assert.equal(await count('bets'),1);assert.equal(await count('official_panel_bet_audits'),1);
 assert.equal((await db.query('SELECT user_id FROM bets')).rows[0].user_id,1);
 const issue=calls.findIndex(s=>s.includes('FROM issues')&&s.includes('FOR UPDATE'));
 const user=calls.findIndex(s=>s.includes('FROM users')&&s.includes('FOR UPDATE'));
 const clock=calls.findIndex(s=>s.includes('WITH t AS'));
 assert.ok(issue<user&&user<clock);assert.ok(calls.at(-1)==='COMMIT');
 const a=(await db.query("SELECT kst_day::text, (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date::text AS today FROM official_panel_bet_audits")).rows[0];assert.equal(a.kst_day,a.today);
});
test('same-user cross-issue gross daily limit remains 200',async()=>{await run(0);await run(1);await reject('PANEL_DAILY_LIMIT',2);assert.equal(await balance(),800);assert.equal(await count('bets'),2);});
test('refund does not erase gross daily stake',async()=>{
 await run(0);await run(1);
 await db.exec("UPDATE users SET gam_balance=1000 WHERE id=1; INSERT INTO gam_transactions(user_id,type,category,amount,reference_id) VALUES(1,'earn','issue_settlement',200,'settlement:test'); UPDATE issues SET result='Cancelled' WHERE id IN (1,2);");
 await reject('PANEL_DAILY_LIMIT',2);
});
test('audit failure rolls back bet/debit/pool/ledger together',async()=>{failAudit=true;await assert.rejects(run(),/audit failed/);assert.equal(await balance(),1000);assert.equal(await count('bets'),0);assert.equal(await count('gam_transactions'),1);assert.equal((await db.query('SELECT total_volume FROM issues WHERE id=1')).rows[0].total_volume,0);});
test('generic path rejects marked account even with forged context/body flag',async()=>{
 for(const panelContext of [undefined,{personaKey:'number',beforeBet:()=>{}}]) await assert.rejects(placeBet({issueId:1,userId:1,choice:'Yes',amount:100,panelContext},{...deps,panelContext}),e=>e.code==='PANEL_PATH_REQUIRED');
 assert.equal(await balance(),1000);
});
test('human generic behavior remains available',async()=>{const r=await placeBet({issueId:1,userId:2,choice:'no',amount:75},deps);assert.equal(r.balance,925);assert.equal(r.bet.choice,'No');assert.equal(await count('official_panel_bet_audits'),0);});
test('identical retry after close/provider off/stale evidence returns saved bet without debit',async()=>{
 const old=new Date(Date.now()-590000).toISOString();const first=await run(0,{evidenceAt:old});
 await db.exec("UPDATE issues SET status='closed',result='Yes',betting_end_date=clock_timestamp()-INTERVAL '1 minute' WHERE id=1;");
 status={initialized:false,providers:[]};
 const retry=await run(0,{evidenceAt:old});assert.equal(retry.alreadyPlaced,true);assert.equal(retry.bet.id,first.bet.id);assert.equal(await balance(),900);assert.equal(await count('gam_transactions'),2);
});
test('conflicting retries never overwrite metadata or debit',async()=>{await run();for(const changes of [{choice:'No'},{amount:200},{rationale:inputs[0].rationale+' 다른 설명'},{expectedResolutionKey:'other'}])await reject('PANEL_RETRY_CONFLICT',0,changes);assert.equal(await balance(),900);});
test('provider disabled/schema not ready rejected',async()=>{status.providers[0].enabled=false;await reject('PROVIDER_DISABLED');status.initialized=false;await reject('SCHEMA_NOT_READY');});
test('invalid rule and stale key rejected',async()=>{await reject('STALE_RESOLUTION_KEY',0,{expectedResolutionKey:'different'});await db.exec("UPDATE issues SET resolution_params='{}' WHERE id=1");await reject('INVALID_RESOLUTION_RULE');});
test('less than 180 seconds remaining rejected',async()=>{await db.exec("UPDATE issues SET betting_end_date=clock_timestamp()+INTERVAL '179 seconds' WHERE id=1");await reject('BETTING_CLOSED');});
test('old/future/noncanonical evidence rejected',async()=>{
 await reject('STALE_EVIDENCE',0,{evidenceAt:new Date(Date.now()-601000).toISOString()});
 await reject('STALE_EVIDENCE',0,{evidenceAt:new Date(Date.now()+31000).toISOString()});
 await reject('INVALID_EVIDENCE_TIME',0,{evidenceAt:'2026-01-01'});
});
test('official URL allowlist rejects credentials/external hosts/secret query/disabled treasury',async()=>{
 for(const u of ['https://name:secret@api.upbit.com/v1/ticker?markets=KRW-BTC','https://evil.test/','https://api.upbit.com/v1/ticker?token=secret','https://api.upbit.com.evil.test/v1/ticker','https://yegam.ai.kr/issue.html?id=2','https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve'])await reject('INVALID_SOURCES',0,{sourceUrls:[u]});
});
test('unapproved role/fixed stake/short rationale fail closed',async()=>{await reject('INVALID_PERSONA',0,{personaKey:'admin'});await reject('INVALID_AMOUNT',0,{amount:101});await reject('INVALID_RATIONALE',0,{rationale:'short'});});
test('unknown credits and unexplained balance block rather than refill',async()=>{await db.exec('UPDATE users SET gam_balance=1100 WHERE id=1');await reject('PANEL_ACCOUNT_UNSAFE');await db.exec("UPDATE users SET gam_balance=1000 WHERE id=1;INSERT INTO gam_transactions(user_id,type,category,amount) VALUES(1,'earn','login_reward',100)");await reject('PANEL_ACCOUNT_UNSAFE');});
test('unaudited legacy bets block panel wagers',async()=>{await db.exec("INSERT INTO bets(user_id,issue_id,choice,amount) VALUES(1,3,'Yes',100)");await reject('PANEL_ACCOUNT_UNSAFE');});
// PGlite is single-client. These tests validate SQL transactions and lock ordering,
// not multi-connection PostgreSQL race behavior or deployment state.
test('audit foreign-key failure rolls back the entire wager',async()=>{
 deps.actorAdminId=999;
 await assert.rejects(run(),e=>e.code==='23503');
 assert.equal(await balance(),1000);assert.equal(await count('bets'),0);assert.equal(await count('gam_transactions'),1);
});
test('KST daily accounting is independent of the PostgreSQL session timezone',async()=>{
 await db.exec("SET TIME ZONE 'America/Los_Angeles'");
 try {await run(0);await run(1);await reject('PANEL_DAILY_LIMIT',2);const a=(await db.query("SELECT kst_day::text, (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date::text AS today FROM official_panel_bet_audits LIMIT 1")).rows[0];assert.equal(a.kst_day,a.today);}
 finally {await db.exec("SET TIME ZONE 'UTC'");}
});
test('active canonical AWC weather rules can use official evidence',async()=>{
 const obs=new Date(Math.ceil(Date.now()/3600000)*3600000+12*3600000).toISOString();
 const rule={version:2,provider:'awc_metar',station:'RKSI',metric:'temperature_c',operator:'gt',threshold:20,observation_at:obs,missing_data_policy:'cancel_after_24h'};
 const key=ruleKey(rule);
 const dates={end_date:obs,betting_end_date:new Date(Date.parse(obs)-6*3600000).toISOString()};
 await db.query("UPDATE issues SET end_date=$1,betting_end_date=$2,resolution_params=$3,resolution_key=$4,title=$5,category='날씨',description=$6 WHERE id=1",[obs,dates.betting_end_date,JSON.stringify(rule),key,officialTitle(rule),officialDescription(rule,dates)]);
 status.providers=[{provider:'awc_metar',version:2,enabled:true}];
 const result=await run(0,{expectedResolutionKey:key,sourceUrls:['https://aviationweather.gov/api/data/metar?ids=RKSI&format=json']});assert.equal(result.balance,900);
});

test('public description/title/category must agree with the locked rule',async()=>{
 const original=(await db.query('SELECT title,description,category FROM issues WHERE id=1')).rows[0];
 for(const changes of [
  {...original,description:original.description.replace('100,000,000','99,000,000')},
  {...original,title:'비트코인 99,000,000원 초과 여부'},
  {...original,category:'날씨'}
 ]) {
  await db.query('UPDATE issues SET title=$1,description=$2,category=$3 WHERE id=1',[changes.title,changes.description,changes.category]);
  await reject('INVALID_PUBLIC_CRITERIA');
 }
 assert.equal(await balance(),1000);assert.equal(await count('bets'),0);
});
test('initial grant reference must belong to the exact fixed persona',async()=>{
 await db.query("UPDATE gam_transactions SET reference_id='ai-panel-initial:counter' WHERE category='ai_panel_initial'");
 await reject('PANEL_ACCOUNT_UNSAFE');assert.equal(await balance(),1000);
});
// Simulate only DB-clock query output through the injected client. The real
// PostgreSQL cap SUM, immutable audit INSERT and transaction remain exercised.
async function simulateMidnightRollover() {
 const dates=(await db.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date::text AS today, ((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-1)::text AS yesterday")).rows[0];
 const getClient=deps.getClient;
 let captured;
 deps.getClient=async()=>{
  const client=await getClient();const query=client.query.bind(client);
  client.query=async(sql,params)=>{
   const result=await query(sql,params);
   if(sql.startsWith('WITH t AS')) result.rows[0].kst_day=dates.yesterday;
   if(sql.startsWith('WITH audit_clock AS')) captured={...result.rows[0]};
   return result;
  };
  return client;
 };
 return {dates,captured:()=>captured};
}
test('rollover stamps audit with the final DB day and the same captured timestamp',async()=>{
 const clock=await simulateMidnightRollover();
 await run();
 const audit=(await db.query("SELECT kst_day::text,created_at FROM official_panel_bet_audits")).rows[0];
 assert.equal(audit.kst_day,clock.dates.today);
 assert.equal(audit.created_at.toISOString(),new Date(clock.captured().audit_created_at).toISOString());
 assert.equal((await db.query('SELECT created_at=$1::timestamptz AS exact_instant FROM official_panel_bet_audits',[clock.captured().audit_created_at])).rows[0].exact_instant,true);
 assert.ok(calls.some(s=>s.includes('AS daily_staked')&&s.includes('bet_id<>$3')));
 assert.equal(await balance(),900);
});
test('rollover rechecks new-day prior stakes and rolls back an over-limit insertion',async()=>{
 await run(0);await run(1);
 await simulateMidnightRollover();
 await reject('PANEL_DAILY_LIMIT',2);
 assert.equal(await balance(),800);assert.equal(await count('bets'),2);assert.equal(await count('official_panel_bet_audits'),2);assert.equal(await count('gam_transactions'),3);
 assert.equal((await db.query('SELECT total_volume FROM issues WHERE id=3')).rows[0].total_volume,0);
 assert.ok(calls.some(s=>s.includes('AS daily_staked')));assert.equal(calls.at(-1),'ROLLBACK');
});
