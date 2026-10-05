'use strict';
// Isolated-handler tests, NOT end-to-end routing/authentication tests.
// Extract the actual current POST/PUT lambdas using route boundaries. All SQL,
// auditing and acquisition are controlled fakes; no server, provider, database
// module, environment loader, credentials or middleware is loaded.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {validateResolutionRule, inferLegacyRule} = require('../services/marketResolutionRule');
const {resolutionKey} = require('../database/settlement-schema');
const source = fs.readFileSync(path.join(__dirname, '../routes/admin.js'), 'utf8');
const MARKER = 'YEGAM-BTC-20261006-1800-KRW-v1';
const END = '2026-10-06T09:00:00Z';
const BETTING_END = '2026-10-06T03:00:00Z';
const TITLE = '비트코인 가격이 117,000,000원을 초과할까요?';
const DESCRIPTION = '기준가가 117,000,000원을 초과하면 YES. 운영 식별자: ' + MARKER;
function rule(overrides = {}) {
  return {version:1, provider:'upbit', market:'KRW-BTC', metric:'minute_close', operator:'gt', threshold:117000000,
    observation_at:'2026-10-06T09:00:00.000Z', missing_data_policy:'cancel_after_24h', ...overrides};
}
function body(overrides = {}) {
  return {title:TITLE, category:'crypto', description:DESCRIPTION, end_date:END, betting_end_date:BETTING_END, ...overrides};
}
function existing(overrides = {}) {
  return {id:42, ...body(), resolution_params:rule(), resolution_key:MARKER, result:null, yes_price:50, is_popular:false, ...overrides};
}
function handler(method, deps) {
  const startMarker = method === 'post' ? "router.post('/issues'," : "router.put('/issues/:id',";
  const endMarker = method === 'post' ? "router.put('/issues/:id'," : "router.delete('/issues/:id',";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, 'actual handler route boundaries must exist');
  const section = source.slice(start, end);
  const lambdaStart = section.indexOf('async (req');
  const lambdaEnd = section.lastIndexOf('});');
  assert.ok(lambdaStart >= 0 && lambdaEnd > lambdaStart, 'actual async handler must exist');
  return vm.runInNewContext('(' + section.slice(lambdaStart, lambdaEnd + 1) + ')', {
    validateResolutionRule, inferLegacyRule, resolutionKey,
    require(name) {
      assert.equal(name, '../database/postgres');
      return {getPool:() => ({connect:deps.acquire}), getClient:deps.acquire};
    },
    EndDateTracker:{setSessionContext:deps.context},
    logIssueCreation:() => {}, detectRapidDeadlineChanges:() => {},
    console:{error:() => {}}
  }, {filename:'admin.js:isolated-' + method, timeout:1000});
}
async function invoke(method, input = body(), options = {}) {
  const calls = [];
  let releases = 0, acquisitions = 0, contexts = 0;
  const row = options.existing === undefined ? existing() : options.existing;
  const failure = options.error || new Error('controlled SQL failure');
  const client = {
    async query(sql, params) {
      const text = sql.trim().replace(/\s+/g, ' ');
      calls.push({sql:text, params});
      if (options.fail && text.startsWith(options.fail)) throw failure;
      if (options.rollbackFails && text === 'ROLLBACK') throw new Error('controlled rollback failure');
      if (['BEGIN','COMMIT','ROLLBACK'].includes(text)) return {rows:[]};
      if (text.startsWith('SELECT * FROM issues')) return {rows:row ? [row] : []};
      if (text.startsWith('SELECT EXISTS')) return {rows:[{value:options.hasBets === true}]};
      if (text.startsWith('INSERT INTO issues') || text.startsWith('UPDATE issues SET')) {
        const persisted = {id:42, title:params[0], category:params[1], description:params[2], image_url:params[3], yes_price:params[4],
          end_date:params[5], betting_end_date:params[6], is_popular:params[7], resolution_params:params[8] === null ? null : JSON.parse(params[8]), resolution_key:params[9]};
        return {rows:[persisted]};
      }
      assert.fail('Unexpected SQL: ' + text);
    },
    release() { releases++; }
  };
  const deps = {
    async acquire() { acquisitions++; if (options.acquireFails) throw failure; return client; },
    async context() { contexts++; if (options.contextFails) throw failure; }
  };
  const req = {body:input, params:{id:'42'}, user:{id:7, username:'offline-admin'}, ip:'127.0.0.1', sessionID:'offline', get:() => 'offline-test'};
  if (options.endDateContext) req.endDateContext = {requestId:'offline-request'};
  const res = {statusCode:200, payload:null, status(code) {this.statusCode=code; return this;}, json(payload) {assert.equal(this.payload,null,'one response only'); this.payload=payload; return this;}};
  await handler(method, deps)(req, res);
  assert.ok(res.payload, 'handler must respond');
  return {res,calls,releases,acquisitions,contexts};
}
function writes(out) { return out.calls.filter(call => /^(INSERT|UPDATE) /.test(call.sql)); }
function rejected(out, status, acquired = true) {
  assert.equal(out.res.statusCode,status);
  assert.equal(out.res.payload.success,false);
  assert.equal(writes(out).length,0,'rejected requests must not write');
  assert.equal(out.releases,acquired ? 1 : 0);
  assert.equal(out.calls.some(call => call.sql === 'COMMIT'),false);
}
function persistedRule(out, expected = rule(), key = MARKER) {
  assert.equal(out.res.statusCode,200);
  assert.equal(out.res.payload.success,true);
  const [write] = writes(out);
  assert.equal(writes(out).length,1);
  assert.match(write.sql,/resolution_params/);
  assert.match(write.sql,/\$9::jsonb/);
  assert.match(write.sql,/\$10/);
  assert.equal(typeof write.params[8],'string');
  assert.deepEqual(JSON.parse(write.params[8]),expected);
  assert.equal(write.params[9],key);
  assert.deepEqual(out.res.payload.issue.resolution_params,expected);
  assert.equal(out.res.payload.issue.resolution_key,key);
  assert.equal(out.releases,1);
}
for (const kind of ['explicit snake_case', 'explicit camelCase', 'inferred']) {
  test('POST accepts ' + kind + ' canonical YEGAM rule and persists $9 JSONB / $10 key', async () => {
    const input = body(kind === 'explicit snake_case' ? {resolution_params:rule()} : kind === 'explicit camelCase' ? {resolutionParams:rule()} : {});
    const out = await invoke('post',input);
    persistedRule(out);
    assert.equal(out.acquisitions,1);
    assert.equal(out.contexts,1);
    assert.equal(out.res.payload.issue.isPopular,false);
    assert.equal(writes(out)[0].params[5],END);
    assert.equal(writes(out)[0].params[6],BETTING_END);
  });
}
const mismatches = [
  ['body vs structured threshold', {description:DESCRIPTION.replace('117,000,000','118,000,000'),resolution_params:rule()}],
  ['structured vs body threshold', {resolution_params:rule({threshold:118000000})}],
  ['title vs body/structured threshold', {title:TITLE.replace('117,000,000','118,000,000'),resolution_params:rule()}],
  ['marker vs end date', {end_date:'2026-10-06T10:00:00Z',resolution_params:rule()}],
  ['betting end not before observation', {betting_end_date:END,resolution_params:rule()}],
  ['malformed YEGAM marker', {description:DESCRIPTION.replace(MARKER,'YEGAM-BTC-invalid-KRW-v1')}]
];
for (const method of ['post','put']) {
  for (const [label,change] of mismatches) {
    test(method.toUpperCase() + ' rejects ' + label, async () => {
      const out = await invoke(method,body(change));
      rejected(out,400,method === 'put');
      if (method === 'put') assert.equal(out.calls.at(-1).sql,'ROLLBACK');
      else assert.equal(out.acquisitions,0);
    });
  }
}
const mutations = [
  ['threshold', body({title:TITLE.replace('117,000,000','118,000,000'), description:DESCRIPTION.replace('117,000,000','118,000,000'),resolution_params:rule({threshold:118000000})}),rule({threshold:118000000}),MARKER],
  ['market', body({title:TITLE.replace('비트코인','이더리움'),description:DESCRIPTION.replace('-BTC-','-ETH-'),resolution_params:rule({market:'KRW-ETH'})}),rule({market:'KRW-ETH'}),MARKER.replace('-BTC-','-ETH-')],
  ['observation/end time', body({end_date:'2026-10-06T10:00:00Z',description:DESCRIPTION.replace('-1800-','-1900-'),resolution_params:rule({observation_at:'2026-10-06T10:00:00.000Z'})}),rule({observation_at:'2026-10-06T10:00:00.000Z'}),MARKER.replace('-1800-','-1900-')],
  ['betting end time', body({betting_end_date:'2026-10-06T04:00:00Z'}),rule(),MARKER],
  ['rule removal', body({title:'일반 예측 이슈',description:'수동 판정 이슈',resolution_params:null}),null,null]
];
for (const [label,input,expected,key] of mutations) {
  test('PUT permits zero-bet unresolved ' + label + ' edit', async () => {
    const out = await invoke('put',input,{endDateContext:true});
    if (expected) persistedRule(out,expected,key);
    else {
      assert.equal(out.res.statusCode,200);
      assert.equal(writes(out)[0].params[8],null);
      assert.equal(writes(out)[0].params[9],null);
      assert.equal(out.releases,1);
    }
    assert.equal(out.calls[0].sql,'BEGIN');
    assert.match(out.calls[1].sql,/FOR UPDATE$/);
    assert.equal(out.calls.at(-1).sql,'COMMIT');
    assert.equal(out.contexts,1);
  });
  for (const [state,opts] of [['bets exist',{hasBets:true}],['resolved Yes',{existing:existing({result:'Yes'})}],['resolved Cancelled',{existing:existing({result:'Cancelled'})}]]) {
    test('PUT rejects ' + label + ' mutation when ' + state, async () => {
      const out = await invoke('put',input,opts);
      rejected(out,409);
      assert.equal(out.calls.at(-1).sql,'ROLLBACK');
    });
  }
}
for (const [state,opts] of [['bets exist',{hasBets:true}],['resolved',{existing:existing({result:'No'})}]]) {
  test('PUT rejects rule enrollment when ' + state, async () => {
    const old = existing({description:'기존 수동 판정 이슈',resolution_params:null,resolution_key:null,...(opts.existing ? {result:opts.existing.result} : {})});
    const out = await invoke('put',body({resolution_params:rule()}),{...opts,existing:old});
    rejected(out,409);
    assert.equal(out.calls.at(-1).sql,'ROLLBACK');
  });
}
test('PUT permits zero-bet rule enrollment', async () => {
  const out = await invoke('put',body({resolution_params:rule()}),{existing:existing({description:'수동 판정',resolution_params:null,resolution_key:null})});
  persistedRule(out);
  assert.equal(out.calls.at(-1).sql,'COMMIT');
});
for (const [state,opts] of [['unresolved',{hasBets:false}],['bets exist',{hasBets:true}],['resolved',{existing:existing({result:'Yes'})}]]) {
  test('PUT permits harmless description edit with identical rule/times when ' + state, async () => {
    const out = await invoke('put',body({description:DESCRIPTION + '\n출처 설명만 추가합니다.',resolution_params:rule()}),opts);
    persistedRule(out);
    assert.equal(writes(out)[0].params[2],DESCRIPTION + '\n출처 설명만 추가합니다.');
    assert.equal(out.calls.at(-1).sql,'COMMIT');
  });
}
test('PUT permits equivalent timestamp representations, not a time mutation, after bets', async () => {
  const out = await invoke('put',body({end_date:'2026-10-06T18:00:00+09:00',betting_end_date:'2026-10-06T12:00:00+09:00'}),{hasBets:true});
  persistedRule(out);
});
for (const stage of ['BEGIN','SELECT * FROM issues','SELECT EXISTS','UPDATE issues SET','COMMIT']) {
  test('PUT rolls back and releases on SQL failure at ' + stage, async () => {
    const out = await invoke('put',body(),{fail:stage});
    assert.equal(out.res.statusCode,500);
    assert.equal(out.res.payload.success,false);
    assert.equal(out.calls.at(-1).sql,'ROLLBACK');
    assert.equal(out.releases,1);
  });
}
test('PUT releases even if failure rollback also fails', async () => {
  const out = await invoke('put',body(),{fail:'UPDATE issues SET',rollbackFails:true});
  assert.equal(out.res.statusCode,500);
  assert.equal(out.calls.at(-1).sql,'ROLLBACK');
  assert.equal(out.releases,1);
});
test('PUT rolls back and releases on session context failure', async () => {
  const out = await invoke('put',body(),{contextFails:true,endDateContext:true});
  rejected(out,500);
  assert.equal(out.calls.at(-1).sql,'ROLLBACK');
});
test('POST releases acquired client on INSERT failure (single statement, no transaction)', async () => {
  const out = await invoke('post',body(),{fail:'INSERT INTO issues'});
  assert.equal(out.res.statusCode,500);
  assert.equal(out.res.payload.success,false);
  assert.equal(out.releases,1);
  assert.equal(out.calls.some(call => ['BEGIN','COMMIT','ROLLBACK'].includes(call.sql)),false);
});
test('POST releases acquired client on session context failure', async () => {
  const out = await invoke('post',body(),{contextFails:true});
  rejected(out,500);
});
for (const method of ['post','put']) {
  test(method.toUpperCase() + ' handles acquisition failure without release', async () => {
    const out = await invoke(method,body(),{acquireFails:true});
    rejected(out,500,false);
    assert.equal(out.acquisitions,1);
    assert.equal(out.calls.length,0);
  });
}
test('PUT missing issue rolls back and releases without write', async () => {
  const out = await invoke('put',body(),{existing:null});
  rejected(out,404);
  assert.equal(out.calls.at(-1).sql,'ROLLBACK');
});

for (const method of ['post','put']) {
  test(method.toUpperCase() + ' returns 409 and releases on duplicate resolution key SQL error', async () => {
    const out = await invoke(method,body(),{fail:method === 'post' ? 'INSERT INTO issues' : 'UPDATE issues SET',error:Object.assign(new Error('controlled duplicate'),{code:'23505'})});
    assert.equal(out.res.statusCode,409);
    assert.equal(out.res.payload.success,false);
    assert.equal(out.releases,1);
    if (method === 'put') assert.equal(out.calls.at(-1).sql,'ROLLBACK');
    assert.equal(out.calls.some(call => call.sql === 'COMMIT'),false);
  });
}
test('POST accepts camelCase issue dates while persisting canonical rule', async () => {
  const input = body({endDate:END,bettingEndDate:BETTING_END,resolutionParams:rule()});
  delete input.end_date;
  delete input.betting_end_date;
  persistedRule(await invoke('post',input));
});
test('PUT explicit camelCase null removes rule for zero-bet unresolved issue', async () => {
  const out = await invoke('put',body({title:'일반 예측 이슈',description:'수동 판정 이슈',resolutionParams:null}));
  assert.equal(out.res.statusCode,200);
  assert.equal(writes(out)[0].params[8],null);
  assert.equal(writes(out)[0].params[9],null);
  assert.equal(out.calls.at(-1).sql,'COMMIT');
  assert.equal(out.releases,1);
});

for (const alias of ['resolution_params','resolutionParams']) {
  test('POST explicit ' + alias + ' null with canonical YEGAM description rejects, never silently enables oracle', async () => {
    const out = await invoke('post',body({[alias]:null}));
    rejected(out,400,false);
    assert.equal(out.acquisitions,0);
    assert.equal(out.calls.length,0);
  });
  test('POST explicit ' + alias + ' null permits ordinary manual issue without oracle', async () => {
    const out = await invoke('post',body({title:'일반 예측 이슈',description:'수동 판정 이슈',[alias]:null}));
    assert.equal(out.res.statusCode,200);
    assert.equal(out.res.payload.success,true);
    assert.equal(writes(out).length,1);
    assert.equal(writes(out)[0].params[8],null);
    assert.equal(writes(out)[0].params[9],null);
    assert.equal(out.res.payload.issue.resolution_params,null);
    assert.equal(out.res.payload.issue.resolution_key,null);
    assert.equal(out.releases,1);
  });
}
