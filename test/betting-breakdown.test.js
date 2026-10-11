const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const {loadBreakdowns, emptyBreakdown, PANEL_KEYS} = require('../services/bettingBreakdown');
test('batched groups conserve pooled GAM and count people independently from agents', async () => {
 const db = new PGlite();
 try {
 await db.exec(`CREATE TABLE users(id int primary key, ai_panel_role text, is_agent boolean); CREATE TABLE bets(id serial, issue_id int, user_id int, choice text, amount int);
 INSERT INTO users VALUES(1,NULL,false),(2,NULL,false),(3,'number',true),(4,'editor',true),(5,NULL,true),(6,'unknown',true);
 INSERT INTO bets(issue_id,user_id,choice,amount) VALUES(10,1,'Yes',150),(10,1,'Yes',50),(10,2,'No',100),(10,3,'Yes',100),(10,4,'No',100),(10,5,'No',80),(10,6,'Yes',20),(11,3,'Yes',100);`);
 let calls=0; const groups = await loadBreakdowns((sql,params)=>{calls++;return db.query(sql,params);},[10,11,10]);
 assert.equal(calls,1);
 const result=groups.get(10); assert.equal(result.humanStats.participantCount,2);assert.equal(result.humanStats.betCount,3);assert.equal(result.aiPanelStats.participantCount,2);assert.equal(result.externalAgentStats.participantCount,2);
 const pooled=(await db.query('SELECT SUM(amount)::int AS volume FROM bets WHERE issue_id=10')).rows[0].volume;
 assert.equal(Object.values(result).reduce((n,g)=>n+g.totalVolume,0),pooled);
 assert.equal(Object.values(result).reduce((n,g)=>n+g.yesAmount,0),320);
 assert.equal(Object.values(result).reduce((n,g)=>n+g.noAmount,0),280);
 assert.equal(groups.get(11).humanStats.yesRatio,null);assert.equal(groups.get(11).humanStats.noRatio,null);assert.equal(groups.get(11).aiPanelStats.yesRatio,100);
 } finally {await db.close();}
});
test('fresh fixtures need neither optional is_agent nor role columns', async () => {
 const db=new PGlite();try{await db.exec(`CREATE TABLE users(id int);CREATE TABLE bets(issue_id int,user_id int,choice text,amount int);INSERT INTO users VALUES(1);INSERT INTO bets VALUES(1,1,'No',100);`);
 const result=(await loadBreakdowns((s,p)=>db.query(s,p),[1])).get(1);assert.equal(result.humanStats.totalVolume,100);assert.equal(result.aiPanelStats.totalVolume,0);
 }finally{await db.close();}
});
test('empty stats return no invented human probability or query',async()=>{assert.equal(PANEL_KEYS.length,10);const empty=emptyBreakdown();assert.equal(empty.humanStats.yesRatio,null);let called=false;assert.equal((await loadBreakdowns(()=>{called=true;},[])).size,0);assert.equal(called,false);});
