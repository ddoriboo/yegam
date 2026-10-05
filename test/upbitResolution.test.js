'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveUpbit } = require('../services/upbitResolution');
const RULE = { version:1, provider:'upbit', market:'KRW-BTC', metric:'minute_close', operator:'gt', threshold:100_000, observation_at:'2026-10-04T03:30:00.000Z', missing_data_policy:'cancel_after_24h' };
const OBS = Date.parse(RULE.observation_at);
const DAY = 86_400_000;
const CANDLE = {market:'KRW-BTC', candle_date_time_utc:'2026-10-04T03:29:00', trade_price:100_001};
const fetchBody = (body, status=200) => async () => ({status, json:async()=>body});
const options = (fetchImpl, extra={}) => ({now:OBS+5_000, fetchImpl, timeoutMs:100, ...extra});

test('pending before observation plus five seconds without any fetch', async () => {
  for (const now of [OBS-1, OBS, OBS+4_999]) {
    const result = await resolveUpbit(RULE, options(()=>{throw new Error('must not fetch');}, {now}));
    assert.deepEqual(result, {status:'pending', reason:'observation_not_ready'});
  }
});
test('only fixed Upbit minute endpoint, exact query, bounded GET and no redirects', async () => {
  let calls=0;
  const fetchImpl = async (url, init) => {
    calls++;
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.upbit.com');
    assert.equal(parsed.pathname, '/v1/candles/minutes/1');
    assert.deepEqual([...parsed.searchParams.entries()], [['market','KRW-BTC'],['to',RULE.observation_at],['count','1']]);
    assert.equal(init.method,'GET'); assert.equal(init.redirect,'error'); assert.ok(init.signal instanceof AbortSignal);
    return {status:200, json:async()=>[CANDLE]};
  };
  const result = await resolveUpbit(RULE,options(fetchImpl));
  assert.equal(calls,1); assert.equal(result.status,'Yes');
  assert.deepEqual(result.evidence, {provider:'upbit', market:'KRW-BTC', requested_observation_at:RULE.observation_at, candle_open_at:'2026-10-04T03:29:00.000Z', close:100_001, source_url:'https://api.upbit.com/v1/candles/minutes/1?market=KRW-BTC&to=2026-10-04T03%3A30%3A00.000Z&count=1', retrieved_at:'2026-10-04T03:30:05.000Z'});
});
test('greater -> Yes, equality and below -> No', async () => {
  for (const [price,status] of [[100_001,'Yes'],[100_000,'No'],[99_999,'No']]) assert.equal((await resolveUpbit(RULE, options(fetchBody([{...CANDLE,trade_price:price}])))).status,status);
});
test('now with KST offset yields same exact UTC result', async () => {
  const result = await resolveUpbit(RULE, options(fetchBody([CANDLE]), {now:'2026-10-04T12:30:05+09:00'}));
  assert.equal(result.status,'Yes'); assert.equal(result.evidence.retrieved_at,'2026-10-04T03:30:05.000Z');
});
test('missing candle pending until exact 24h deadline, then Cancelled', async () => {
  for (const [now,status] of [[OBS+5_000,'pending'],[OBS+DAY-1,'pending'],[OBS+DAY,'Cancelled'],[OBS+DAY+1,'Cancelled']]) assert.deepEqual(await resolveUpbit(RULE, options(fetchBody([]),{now})), {status,reason:'missing_candle'});
});
test('wrong market, prior/future candles never substituted even after deadline', async () => {
  for (const [candle,reason] of [[{...CANDLE,market:'KRW-ETH'},'wrong_market'], [{...CANDLE,candle_date_time_utc:'2026-10-04T03:28:00'},'wrong_candle'], [{...CANDLE,candle_date_time_utc:'2026-10-04T03:30:00'},'wrong_candle'], [{...CANDLE,candle_date_time_utc:'2026-10-05T03:29:00'},'wrong_candle'], [{...CANDLE,candle_date_time_utc:'2026-02-30T03:29:00'},'wrong_candle']]) {
    assert.deepEqual(await resolveUpbit(RULE, options(fetchBody([candle]))), {status:'pending',reason});
    assert.deepEqual(await resolveUpbit(RULE, options(fetchBody([candle]),{now:OBS+DAY})), {status:'Cancelled',reason});
  }
});
test('HTTP 429 and all non-200 errors never interpreted as candle prices', async () => {
  for (const status of [429,500,404,201,302]) {
    const expectedReason = status === 429 ? 'rate_limited':'http_error';
    assert.deepEqual(await resolveUpbit(RULE, options(fetchBody([CANDLE],status))),{status:'pending',reason:expectedReason});
    assert.deepEqual(await resolveUpbit(RULE, options(fetchBody([CANDLE],status),{now:OBS+DAY})),{status:'Cancelled',reason:expectedReason});
  }
});
test('network errors and JSON parse errors are pending', async () => {
  assert.deepEqual(await resolveUpbit(RULE, options(async()=>{throw new Error('offline');})),{status:'pending',reason:'network_error'});
  assert.deepEqual(await resolveUpbit(RULE, options(async()=>({status:200,json:async()=>{throw new SyntaxError('bad');}}))), {status:'pending',reason:'invalid_body'});
});
test('invalid body shape and multiple candles rejected, never searched for fallback', async () => {
  for (const body of [null,{},'text',[null],[5],[[CANDLE]],[CANDLE,CANDLE],[{...CANDLE,candle_date_time_utc:'2026-10-04T03:28:00'},CANDLE]]) assert.deepEqual(await resolveUpbit(RULE,options(fetchBody(body))),{status:'pending',reason:'invalid_body'});
});
test('invalid and coerced closes rejected', async () => {
  for (const trade_price of [0,-1,NaN,Infinity,-Infinity,'100001',null,undefined]) assert.deepEqual(await resolveUpbit(RULE, options(fetchBody([{...CANDLE,trade_price}]))), {status:'pending',reason:'invalid_close'});
});
test('timeout aborts fetch even when injected fetch ignores signal', async () => {
  let signal;
  const never = (_url,init) => {signal=init.signal;return new Promise(()=>{});};
  assert.deepEqual(await resolveUpbit(RULE, options(never,{timeoutMs:5})), {status:'pending',reason:'timeout'});
  assert.equal(signal.aborted,true);
});
test('timeout covers JSON body reading and respects cancellation deadline', async () => {
  const fetchImpl = async()=>({status:200,json:()=>new Promise(()=>{})});
  assert.deepEqual(await resolveUpbit(RULE, options(fetchImpl,{timeoutMs:5,now:OBS+DAY})), {status:'Cancelled',reason:'timeout'});
});
test('valid exact candle remains factual even when retrieved after deadline', async () => {
  assert.equal((await resolveUpbit(RULE,options(fetchBody([CANDLE]),{now:OBS+DAY}))).status,'Yes');
});
test('retrieved_at reflects completion clock and deadline crossing', async () => {
  let calls=0;
  const now=()=>calls++ === 0 ? OBS+DAY-1 : OBS+DAY;
  assert.deepEqual(await resolveUpbit(RULE,options(fetchBody([]),{now})),{status:'Cancelled',reason:'missing_candle'});
});
test('invalid dates and injection-like arbitrary URLs rejected before fetching', async () => {
  let calls=0; const fetchImpl=()=>{calls++;throw new Error('should not be called');};
  for (const extra of [{observation_at:'2026-02-30T03:30:00.000Z'},{observation_at:'2026-10-04T03:30:01.000Z'},{provider:'https://attacker.test'},{market:'KRW-BTC&to=now'},{source_url:'https://attacker.test'},{url:'http://127.0.0.1/'}]) await assert.rejects(resolveUpbit({...RULE,...extra},options(fetchImpl)),TypeError);
  assert.equal(calls,0);
});
test('invalid resolver clock, timeout and fetch options rejected', async () => {
  for (const extra of [{now:'invalid'}, {now:new Date(NaN)}, {now:Infinity}, {timeoutMs:0}, {timeoutMs:1.5}, {timeoutMs:2_147_483_648}, {fetchImpl:null}]) await assert.rejects(resolveUpbit(RULE, options(fetchBody([CANDLE]),extra)),TypeError);
});
