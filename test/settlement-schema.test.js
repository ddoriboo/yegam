'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {SETTLEMENT_SCHEMA_SQL,ensureSettlementSchema,resolutionKey}=require('../database/settlement-schema');
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY); CREATE TABLE issues(id INTEGER PRIMARY KEY,description TEXT,end_date TIMESTAMPTZ,betting_end_date TIMESTAMPTZ,result TEXT); CREATE TABLE bets(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),issue_id INTEGER REFERENCES issues(id)); CREATE TABLE gam_transactions(id SERIAL,reference_id TEXT,category TEXT);`);
 const client={query:async(sql,params)=>{if(sql===SETTLEMENT_SCHEMA_SQL){await db.exec(sql);return{rows:[],rowCount:0};}const r=await db.query(sql,params);return{...r,rowCount:r.affectedRows??r.rows.length};},release(){}};
 return{db,getClient:async()=>client};
}
const description='기준가가 115,500,000원을 초과하면 YES. 운영 식별자: YEGAM-BTC-20261005-0900-KRW-v1';
test('schema migration atomically enrolls only approved legacy IDs and is repeatable',async()=>{
 const f=await fixture();try{
 await f.db.query('INSERT INTO issues(id,description,end_date,betting_end_date) VALUES ($1,$2,$3,$4)',[136,description,'2026-10-05T00:00:00.000Z','2026-10-04T14:00:00.000Z']);
 await f.db.query('INSERT INTO issues(id,description,end_date,betting_end_date) VALUES ($1,$2,$3,$4)',[999,description,'2026-10-05T00:00:00.000Z','2026-10-04T14:00:00.000Z']);
 await ensureSettlementSchema(f);await ensureSettlementSchema(f);
 const rows=(await f.db.query('SELECT id,resolution_params,resolution_key FROM issues ORDER BY id')).rows;
 assert.equal(rows[0].resolution_params.threshold,115500000);assert.equal(rows[0].resolution_key,'YEGAM-BTC-20261005-0900-KRW-v1');assert.equal(rows[1].resolution_params,null);
 }finally{await f.db.close();}
});
test('invalid legacy text is not auto-enrolled',async()=>{const f=await fixture();try{await f.db.query('INSERT INTO issues(id,description,end_date,betting_end_date) VALUES (136,$1,$2,$3)',['unverified ordinary prose','2026-10-05T00:00:00.000Z','2026-10-04T14:00:00.000Z']);await ensureSettlementSchema(f);assert.equal((await f.db.query('SELECT resolution_params FROM issues')).rows[0].resolution_params,null);}finally{await f.db.close();}});
test('duplicate oracle keys abort the whole migration rather than partially enrolling',async()=>{const f=await fixture();try{for(const id of [136,137])await f.db.query('INSERT INTO issues(id,description,end_date,betting_end_date) VALUES ($1,$2,$3,$4)',[id,description,'2026-10-05T00:00:00.000Z','2026-10-04T14:00:00.000Z']);await assert.rejects(ensureSettlementSchema(f));const cols=(await f.db.query("SELECT column_name FROM information_schema.columns WHERE table_name='issues'")).rows.map(r=>r.column_name);assert.ok(!cols.includes('resolution_params'));}finally{await f.db.close();}});
test('key uses declared KST date rather than host timezone',()=>{assert.equal(resolutionKey({market:'KRW-ETH',observation_at:'2026-10-06T09:00:00.000Z'}),'YEGAM-ETH-20261006-1800-KRW-v1');});
