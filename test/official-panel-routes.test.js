'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {createAdminPanelRouter,createPublicPanelRouter}=require('../routes/official-panel');
const {isOfficialPanelUser,rejectPanelRewardTarget}=require('../middleware/official-panel-guard');
async function withApp(fn){
 const calls=[];const app=express();app.use(express.json());
 app.use((req,res,next)=>{if(req.headers['x-test-role'])req.admin={id:7,role:req.headers['x-test-role']};next();});
 const deps={requireRole:role=>(req,res,next)=>req.admin?.role===role?next():res.status(req.admin?403:401).json({success:false}),getPanelStatus:async()=>({members:[],bets:[],totalInitialGam:0}),settlement:{getStatus:()=>({initialized:true})},enrollPanel:async a=>(calls.push(['enroll',a]),{members:[],totalInitialGam:10000}),placePanelBet:async(a,d)=>(calls.push(['bet',a,d]),{bet:{id:1},replayed:false})};
 app.use('/api/admin/ai-panel',createAdminPanelRouter(deps));app.use('/api/ai-panel',createPublicPanelRouter(deps));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{await fn({base,calls});}finally{await new Promise(r=>server.close(r));}
}
const post=(body,role='super_admin')=>({method:'POST',headers:{'content-type':'application/json',...(role?{'x-test-role':role}:{})},body:JSON.stringify(body)});
test('public status is read only and empty before enrollment',()=>withApp(async({base,calls})=>{const r=await fetch(base+'/api/ai-panel');assert.equal(r.status,200);assert.equal((await r.json()).totalInitialGam,0);assert.equal(calls.length,0);assert.equal(r.headers.get('cache-control'),'no-store');}));
test('enrollment requires authenticated super administrator',()=>withApp(async({base,calls})=>{for(const role of [null,'admin']){const r=await fetch(base+'/api/admin/ai-panel/enroll',post({confirm:'ENROLL_OFFICIAL_AI_PANEL_10'},role));assert.equal(r.status,role?403:401);}assert.equal(calls.length,0);}));
test('funding cannot accept arbitrary amounts or users',()=>withApp(async({base,calls})=>{for(const b of [{},{confirm:'ENROLL_OFFICIAL_AI_PANEL_10',amount:100000}]){assert.equal((await fetch(base+'/api/admin/ai-panel/enroll',post(b))).status,400);}assert.equal(calls.length,0);}));
test('fixed enrollment uses trusted administrator identity',()=>withApp(async({base,calls})=>{assert.equal((await fetch(base+'/api/admin/ai-panel/enroll',post({confirm:'ENROLL_OFFICIAL_AI_PANEL_10'}))).status,200);assert.deepEqual(calls,[['enroll',{adminId:7}]]);}));
test('betting cannot select arbitrary user or administrator',()=>withApp(async({base,calls})=>{assert.equal((await fetch(base+'/api/admin/ai-panel/bets',post({userId:30}))).status,400);assert.equal(calls.length,0);}));
test('bet request passes server administrator separately',()=>withApp(async({base,calls})=>{const body={personaKey:'number',issueId:1,choice:'No',amount:100,rationale:'verified input',evidenceAt:'2026-10-11T00:00:00.000Z',sourceUrls:[],expectedResolutionKey:'x'};assert.equal((await fetch(base+'/api/admin/ai-panel/bets',post(body))).status,200);assert.deepEqual(calls[0],['bet',body,{actorAdminId:7}]);}));
test('normal real secure admin boundary precedes panel route',()=>{const s=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');assert.ok(s.indexOf("app.use('/api/admin', adminBoundaryMiddleware)")<s.indexOf("app.use('/api/admin/ai-panel', createAdminPanelRouter())"));assert.match(s,/await ensureOfficialPanelSchema\(\)/);});
test('panel marker lookup never guesses from nickname',async()=>{assert.equal(await isOfficialPanelUser(100,async()=>({rows:[{is_panel:true}]})),true);assert.equal(await isOfficialPanelUser(101,async()=>({rows:[{is_panel:false}]})),false);assert.equal(await isOfficialPanelUser('abc',()=>{throw Error('must not query')}),false);});
test('legacy reward target blocks marked accounts',async()=>{let next=false;const res={status(n){this.code=n;return this},json(x){this.body=x;return this}};await rejectPanelRewardTarget(async()=>({rows:[{is_panel:true}]}))({method:'POST'},res,()=>{next=true},100);assert.equal(res.code,403);assert.equal(next,false);});
test('reward target read and human requests unchanged',async()=>{for(const method of ['GET','POST']){let next=false;await rejectPanelRewardTarget(async()=>({rows:[{is_panel:false}]}))({method},{},()=>{next=true},100);assert.equal(next,true);}});
test('ordinary token and reward routes use panel guards',()=>{assert.match(fs.readFileSync(path.join(__dirname,'../middleware/auth.js'),'utf8'),/isOfficialPanelUser\(decoded.id \?\? decoded.userId\)/);assert.match(fs.readFileSync(path.join(__dirname,'../routes/gam.js'),'utf8'),/router.param\('userId'.*rejectPanelRewardTarget/);});

function loadAuthFixture({panel=false,dbFailure=false,badToken=false}={}) {
 const vm=require('node:vm');const module={exports:{}};
 const source=fs.readFileSync(path.join(__dirname,'../middleware/auth.js'),'utf8');
 vm.runInNewContext(source,{module,exports:module.exports,process:{env:{JWT_SECRET:'test-only-placeholder'}},console:{error(){}},require(name){
   if(name==='jsonwebtoken')return {verify(){if(badToken)throw Error('invalid');return {id:100};}};
   if(name==='./official-panel-guard')return {async isOfficialPanelUser(){if(dbFailure)throw Error('offline');return panel;}};
   if(name==='dotenv')return {config(){}};
   throw Error('unexpected dependency '+name);
 }});
 return module.exports.authMiddleware;
}
test('actual normal authentication module parses and permits human',async()=>{let next=false;const req={headers:{authorization:'Bearer test'}};await loadAuthFixture()(req,{},()=>{next=true});assert.equal(next,true);assert.equal(req.user.id,100);});
test('actual normal authentication blocks panel tokens',async()=>{let next=false;const res={status(n){this.code=n;return this},json(x){this.body=x;return this}};await loadAuthFixture({panel:true})({headers:{authorization:'Bearer test'}},res,()=>{next=true});assert.equal(res.code,403);assert.equal(next,false);});
test('account lookup failure is unavailable not invalid authentication',async()=>{const res={status(n){this.code=n;return this},json(x){this.body=x;return this}};await loadAuthFixture({dbFailure:true})({headers:{authorization:'Bearer test'}},res,()=>assert.fail('must close'));assert.equal(res.code,503);});
test('invalid token stays 401',async()=>{const res={status(n){this.code=n;return this},json(x){this.body=x;return this}};await loadAuthFixture({badToken:true})({headers:{authorization:'Bearer test'}},res,()=>assert.fail('must close'));assert.equal(res.code,401);});
