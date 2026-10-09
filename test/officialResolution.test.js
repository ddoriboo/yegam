'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveOfficial, fetchWeatherReference, fetchTreasuryReference } = require('../services/officialResolution');
const W = Object.freeze({ version:2, provider:'awc_metar', station:'RKSI', metric:'temperature_c', operator:'gt', threshold:20, observation_at:'2026-10-02T03:00:00.000Z', missing_data_policy:'cancel_after_24h' });
const T = Object.freeze({ version:2, provider:'us_treasury', series:'BC_10YEAR', metric:'par_yield_basis_points', operator:'gt', threshold_bp:400, event_date:'2026-10-02', observation_at:'2026-10-03T04:00:00.000Z', missing_data_policy:'cancel_after_24h' });
const DAY = 86400000;
const OBS = Date.parse(W.observation_at);
const METAR = Object.freeze({ icaoId:'RKSI', obsTime:OBS/1000, temp:21 });
const body = (text, status=200) => async () => ({status, text:async()=>text});
const json = (rows,status=200) => body(JSON.stringify(rows),status);
const opts = (fetchImpl, now=OBS+5000, extra={}) => ({ fetchImpl, now, timeoutMs:100, ...extra });
const entry = (date='2026-10-02', value='4.01', attrs='') => `<entry><content type="application/xml"><m:properties><d:NEW_DATE m:type="Edm.DateTime">${date}T00:00:00</d:NEW_DATE><d:BC_10YEAR ${attrs}>${value}</d:BC_10YEAR></m:properties></content></entry>`;
const feed = (...entries) => `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices"><updated>2099-01-01T00:00:00Z</updated>${entries.join('')}</feed>`;
const topts = (xml=feed(entry()), now=Date.parse(T.observation_at)+5000) => opts(body(xml), now);

 test('weather exact fixed URL, headers, UTC seconds and complete evidence', async()=>{
  const result = await resolveOfficial(W,opts(async(url,init)=>{
    assert.equal(url,'https://aviationweather.gov/api/data/metar?ids=RKSI&format=json&date=2026-10-02T03%3A00%3A00.000Z&hours=2');
    assert.equal(init.method,'GET'); assert.equal(init.redirect,'error'); assert.ok(init.signal instanceof AbortSignal); assert.match(init.headers['User-Agent'],/Yegam/);
    return {status:200,text:async()=>JSON.stringify([{...METAR,reportTime:'2099-01-01T00:00:00Z'}])};
  }));
  assert.equal(result.status,'Yes');
  assert.deepEqual(result.evidence,{provider:'awc_metar',station:'RKSI',requested_observation_at:W.observation_at,obsTime:OBS/1000,temp:21,source_url:'https://aviationweather.gov/api/data/metar?ids=RKSI&format=json&date=2026-10-02T03%3A00%3A00.000Z&hours=2',retrieved_at:'2026-10-02T03:00:05.000Z'});
});
test('strict greater comparison, zero and negative Celsius are valid',async()=>{
  for(const [temp,status] of [[21,'Yes'],[20,'No'],[19,'No'],[0,'No'],[-100,'No'],[80,'Yes']]) assert.equal((await resolveOfficial(W,opts(json([{...METAR,temp}])))).status,status);
});
test('not ready never fetches, weather waits five seconds',async()=>{
  for(const now of [OBS-1,OBS,OBS+4999]) assert.equal((await resolveOfficial(W,opts(()=>assert.fail('fetch'),now))).reason,'observation_not_ready');
  assert.equal((await resolveOfficial(T,opts(()=>assert.fail('fetch'),Date.parse(T.observation_at)-1))).reason,'observation_not_ready');
});
test('weather never substitutes wrong station, nearest, current or reportTime',async()=>{
  for(const rows of [[],[{...METAR,icaoId:'RKSS'}],[{...METAR,obsTime:OBS/1000-60}],[{...METAR,obsTime:OBS/1000+60}],[{...METAR,obsTime:String(OBS/1000)}],[{...METAR,obsTime:OBS,reportTime:W.observation_at}]]) assert.equal((await resolveOfficial(W,opts(json(rows)))).status,'pending');
  assert.equal((await resolveOfficial(W,opts(json([{...METAR,obsTime:OBS/1000-60},METAR])))).status,'Yes');
});
test('weather duplicates and conflicting exact reports never settle',async()=>{
  for(const rows of [[METAR,METAR],[METAR,{...METAR,temp:19}],[METAR,{...METAR,temp:null}]]) assert.equal((await resolveOfficial(W,opts(json(rows)))).reason,'ambiguous_data');
});
test('weather malformed types and out-of-range values rejected',async()=>{
  for(const temp of [null,undefined,'21',true,[],{},81,-101,Infinity,NaN]) assert.equal((await resolveOfficial(W,opts(json([{...METAR,temp}])))).status,'pending');
  for(const value of [null,{},'text',1,[null],[[]],[true]]) assert.equal((await resolveOfficial(W,opts(json(value)))).status,'pending');
});
test('HTTP 204 body is not read, 429/routing/server errors fail safely',async()=>{
  for(const rule of [W,T]) for(const status of [204,429,500,404,302,201]) {
    const result = await resolveOfficial(rule,opts(async()=>({status,text:()=>assert.fail('must not read body')}),Date.parse(rule.observation_at)+5000));
    assert.equal(result.status,'pending'); assert.equal(result.reason,status===204?'missing_data':status===429?'rate_limited':'http_error');
  }
});
test('network and invalid JSON or XML stay pending',async()=>{
  for(const rule of [W,T]) {
    assert.equal((await resolveOfficial(rule,opts(async()=>{throw Error('offline');},Date.parse(rule.observation_at)+5000))).reason,'network_error');
    assert.equal((await resolveOfficial(rule,opts(body('not a body'),Date.parse(rule.observation_at)+5000))).reason,'invalid_body');
  }
});
test('24-hour exact cancellation boundary; late valid evidence may still settle',async()=>{
  for(const rule of [W,T]) for(const [delta,status] of [[DAY-1,'pending'],[DAY,'Cancelled'],[DAY+1,'Cancelled']]) {
    assert.equal((await resolveOfficial(rule,opts(body('',204),Date.parse(rule.observation_at)+delta))).status,status);
  }
  assert.equal((await resolveOfficial(W,opts(json([METAR]),OBS+2*DAY))).status,'Yes');
  assert.equal((await resolveOfficial(T,topts(feed(entry()),Date.parse(T.observation_at)+2*DAY))).status,'Yes');
});
test('timeouts cover fetch and body even if transport ignores AbortSignal',async()=>{
  for(const rule of [W,T]) for(const phase of ['fetch','body']) {
    let signal;
    const fetchImpl=async(url,init)=>{ signal=init.signal; if(phase==='fetch') return new Promise(()=>{}); return {status:200,text:()=>new Promise(()=>{})}; };
    const result=await resolveOfficial(rule,opts(fetchImpl,Date.parse(rule.observation_at)+5000,{timeoutMs:5}));
    assert.equal(result.reason,'timeout'); assert.equal(signal.aborted,true);
  }
});
test('clock rechecked after body for cancellation, rollback, and invalid time',async()=>{
  let clock=OBS+5000;
  const fetchImpl=async()=>({status:204});
  assert.equal((await resolveOfficial(W,opts(async()=>{clock=OBS+DAY;return fetchImpl();},()=>clock))).status,'Cancelled');
  clock=OBS+5000;
  assert.equal((await resolveOfficial(W,opts(async()=>({status:200,text:async()=>{clock=OBS-1;return JSON.stringify([METAR]);}}),()=>clock))).reason,'observation_not_ready');
  clock=OBS+5000;
  await assert.rejects(resolveOfficial(W,opts(async()=>{clock=NaN;return {status:204};},()=>clock)),TypeError);
});
test('timer-safe validation, valid Date and timezone clocks',async()=>{
  for(const timeoutMs of [0,-1,1.5,NaN,Infinity,2147483648,'10',null]) await assert.rejects(resolveOfficial(W,opts(json([METAR]),OBS+5000,{timeoutMs})),TypeError);
  for(const now of [NaN,Infinity,null,true,{},'bad']) await assert.rejects(resolveOfficial(W,opts(json([METAR]),now)),TypeError);
  await assert.rejects(resolveOfficial(W,opts(null)),TypeError);
  for(const now of [new Date(OBS+5000),'2026-10-02T12:00:05+09:00']) assert.equal((await resolveOfficial(W,opts(json([METAR]),now))).status,'Yes');
});
test('unauthorized rule keys and incompatible providers fail before fetch',async()=>{
  for(const rule of [{...W,url:'https://evil.test'},{...T,source_url:'https://evil.test'},{...W,provider:'other'},{...T,threshold_bp:'400'},{...W,station:'RKSS'}]) await assert.rejects(resolveOfficial(rule,opts(()=>assert.fail('fetch'))));
});
test('Treasury exact month endpoint and evidence ignore feed updated metadata',async()=>{
  const result=await resolveOfficial(T,{...topts(),fetchImpl:async(url,init)=>{
    assert.equal(url,'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=202610');
    assert.equal(init.redirect,'error'); assert.match(init.headers['User-Agent'],/Yegam/);return {status:200,text:async()=>feed(entry())};
  }});
  assert.equal(result.status,'Yes'); assert.deepEqual(result.evidence,{provider:'us_treasury',series:'BC_10YEAR',event_date:'2026-10-02',value_percent:'4.01',value_bp:401,source_url:'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=202610',retrieved_at:'2026-10-03T04:00:05.000Z'});
});
test('Treasury decimal basis points no floating drift and zero accepted',async()=>{
  for(const [value,bp,status] of [['4.01',401,'Yes'],['4.00',400,'No'],['3.99',399,'No'],['0',0,'No'],['0.00',0,'No'],['4.1',410,'Yes'],['1.13',113,'No']]) {
    const result=await resolveOfficial(T,topts(feed(entry('2026-10-02',value)))); assert.equal(result.status,status); assert.equal(result.evidence.value_bp,bp); assert.equal(result.evidence.value_percent,value);
  }
});
test('Treasury missing/null/negative/nonfinite/blank/coerced values never No',async()=>{
  for(const value of ['',' ','N/A','null','-0.01','NaN','Infinity','4.001','4e0','+4.00',' 4.00 ','99999999999999999999','&#52;.01']) assert.equal((await resolveOfficial(T,topts(feed(entry('2026-10-02',value))))).status,'pending');
  assert.equal((await resolveOfficial(T,topts(feed(entry('2026-10-02','4.01','m:null="true"'))))).status,'pending');
  assert.equal((await resolveOfficial(T,topts(feed(entry().replace(/<d:BC_10YEAR[^>]*>.*?<\/d:BC_10YEAR>/,''))))).status,'pending');
});
test('Treasury missing date never substitutes nearest, duplicates rejected',async()=>{
  for(const xml of [feed(),feed(entry('2026-10-01')),feed(entry('2026-10-05')),feed(entry(),entry()),feed(entry(),entry('2026-10-02','3.00'))]) assert.equal((await resolveOfficial(T,topts(xml))).status,'pending');
  assert.equal((await resolveOfficial(T,topts(feed(entry('2026-10-01'),entry())))).status,'Yes');
});
test('Treasury strict XML, dates, namespaces and entity defenses',async()=>{
  for(const xml of ['<html><body>error</body></html>',feed(entry()).replace('</feed>',''),feed(entry()).replace('http://www.w3.org/2005/Atom','https://evil.test'),feed(entry()).replace('http://schemas.microsoft.com/ado/2007/08/dataservices/metadata','https://evil.test'),feed(entry('2026-02-30')),feed(entry()).replace('2026-10-02T00:00:00','2026-10-02T00:00:00Z'),'<!DOCTYPE feed [<!ENTITY x "4.01">]>'+feed(entry()),feed(entry()).replace('4.01','&x;')]) assert.equal((await resolveOfficial(T,topts(xml))).status,'pending');
});
test('bounded text and streaming bodies reject over 2MB, real Response parsed',async()=>{
  for(const rule of [W,T]) {
    assert.equal((await resolveOfficial(rule,opts(body(' '.repeat(2*1024*1024+1)),Date.parse(rule.observation_at)+5000))).reason,'invalid_body');
    assert.equal((await resolveOfficial(rule,opts(async()=>new Response(' '.repeat(2*1024*1024+1)),Date.parse(rule.observation_at)+5000))).reason,'invalid_body');
    assert.equal((await resolveOfficial(rule,opts(async()=>({status:200,headers:{get:()=>String(2*1024*1024+1)},text:()=>assert.fail('oversize')}),Date.parse(rule.observation_at)+5000))).reason,'invalid_body');
  }
  assert.equal((await resolveOfficial(W,opts(async()=>new Response(JSON.stringify([METAR]))))).status,'Yes');
  assert.equal((await resolveOfficial(T,{...topts(),fetchImpl:async()=>new Response(feed(entry()))})).status,'Yes');
});
test('weather reference latest valid <=clock, at most two hours, read-only shape',async()=>{
  let url;
  const result=await fetchWeatherReference(opts(async u=>{url=u;return {status:200,text:async()=>JSON.stringify([{...METAR,obsTime:OBS/1000-60},{...METAR,obsTime:OBS/1000+60},METAR])};}));
  assert.equal(url,'https://aviationweather.gov/api/data/metar?ids=RKSI&format=json&hours=2');assert.deepEqual(Object.keys(result),['reference']);assert.equal(result.reference.temp,21);assert.equal(result.reference.observed_at,W.observation_at);assert.equal(result.result,undefined);
  assert.ok((await fetchWeatherReference(opts(json([METAR]),OBS+7200000))).reference);
  assert.equal((await fetchWeatherReference(opts(json([METAR]),OBS+7200001))).status,'pending');
  assert.equal((await fetchWeatherReference(opts(json([METAR,METAR])))).status,'pending');
});
test('Treasury reference UTC current month then previous, latest <=today within 7 days',async()=>{
  const urls=[];
  const now=Date.parse('2026-11-01T01:00:00Z');
  const result=await fetchTreasuryReference(opts(async url=>{urls.push(url);return {status:200,text:async()=>urls.length===1?feed():feed(entry('2026-10-30','4.12'),entry('2026-10-29','4.11'))};},now));
  assert.match(urls[0],/month=202611$/);assert.match(urls[1],/month=202610$/);assert.deepEqual(Object.keys(result),['reference']);assert.equal(result.reference.date,'2026-10-30');assert.equal(result.reference.value_bp,412);assert.equal(result.result,undefined);
  for(const [date,present] of [['2026-10-25',true],['2026-10-24',false],['2026-11-02',false]]) {
    const ref=await fetchTreasuryReference(opts(body(feed(entry(date))),now));assert.equal(Boolean(ref.reference),present);
  }
});
test('reference failures never become settlement outcomes or cancellation',async()=>{
  for(const fn of [fetchWeatherReference,fetchTreasuryReference]) for(const status of [204,429,500]) {
    const result=await fn(opts(body('',status),OBS+100*DAY));assert.equal(result.status,'pending');assert.equal(result.evidence,undefined);assert.equal(result.result,undefined);
  }
});

test('Treasury namespace aliases accepted only with official namespace URIs',async()=>{
  const xml=feed(entry()).replaceAll('xmlns:m=','xmlns:meta=').replaceAll('xmlns:d=','xmlns:data=').replaceAll('m:properties','meta:properties').replaceAll('m:type','meta:type').replaceAll('d:NEW_DATE','data:NEW_DATE').replaceAll('d:BC_10YEAR','data:BC_10YEAR');
  assert.equal((await resolveOfficial(T,topts(xml))).status,'Yes');
  assert.equal((await resolveOfficial(T,topts(xml.replace('http://schemas.microsoft.com/ado/2007/08/dataservices"','https://evil.test"')))).status,'pending');
});
test('Treasury reference January fallback uses previous calendar year',async()=>{
  const urls=[];
  const result=await fetchTreasuryReference(opts(async url=>{urls.push(url);return {status:200,text:async()=>urls.length===1?feed():feed(entry('2025-12-31','0'))};},Date.parse('2026-01-01T00:00:00Z')));
  assert.match(urls[0],/month=202601$/);assert.match(urls[1],/month=202512$/);assert.equal(result.reference.value_bp,0);
});
test('references recheck clock after body and reject ambiguous exact reference dates',async()=>{
  let now=OBS;
  const result=await fetchWeatherReference(opts(async()=>({status:200,text:async()=>{now=OBS+7200001;return JSON.stringify([METAR]);}}),()=>now));
  assert.equal(result.status,'pending');
  assert.equal((await fetchTreasuryReference(opts(body(feed(entry(),entry())),Date.parse('2026-10-03T12:00:00Z')))).reason,'ambiguous_data');
});
test('stream reader body stalls are included in deadline',async()=>{
  for(const rule of [W,T]) {
    let signal;
    const result=await resolveOfficial(rule,opts(async(url,init)=>{signal=init.signal;return {status:200,body:{getReader:()=>({read:()=>new Promise(()=>{}),releaseLock(){}})}};},Date.parse(rule.observation_at)+5000,{timeoutMs:5}));
    assert.equal(result.reason,'timeout');assert.equal(signal.aborted,true);
  }
});
