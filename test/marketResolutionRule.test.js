'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateResolutionRule, inferLegacyRule } = require('../services/marketResolutionRule');

function rule(overrides = {}) {
  return { version: 1, provider: 'upbit', market: 'KRW-BTC', metric: 'minute_close', operator: 'gt', threshold: 100_000,
    observation_at: '2026-10-04T03:30:00.000Z', missing_data_policy: 'cancel_after_24h', ...overrides };
}
function issue(overrides = {}) {
  return { description: 'YEGAM-BTC-20261004-1230-KRW-v1\n기준가 100,000원을 초과하면 YES',
    end_date: '2026-10-04T12:30:00+09:00', betting_end_date: '2026-10-04T12:29:00+09:00', ...overrides };
}

test('canonical normalized rule is a fresh object and preserves only exact schema', () => {
  const input = rule();
  assert.deepEqual(validateResolutionRule(input), input);
  assert.notEqual(validateResolutionRule(input), input);
  assert.deepEqual(validateResolutionRule(input, issue()), input);
});
test('six whitelisted KRW markets only', () => {
  for (const symbol of ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA']) assert.equal(validateResolutionRule(rule({market:`KRW-${symbol}`})).market, `KRW-${symbol}`);
  for (const market of ['KRW-USDT', 'BTC-KRW', 'krw-btc', 'https://attacker.test', 'KRW-BTC&to=now']) assert.throws(() => validateResolutionRule(rule({market})), TypeError);
});
test('invalid providers, operators, versions and arbitrary URL fields rejected', () => {
  for (const overrides of [{provider:'https://attacker.test'}, {version:2}, {operator:'gte'}, {metric:'ticker'}, {missing_data_policy:'resolve_latest'}, {url:'https://attacker.test'}, {source_url:'https://attacker.test'}]) assert.throws(() => validateResolutionRule(rule(overrides)), TypeError);
  assert.throws(() => validateResolutionRule(null), TypeError);
  assert.throws(() => validateResolutionRule([]), TypeError);
  const incomplete = rule(); delete incomplete.threshold;
  assert.throws(() => validateResolutionRule(incomplete), TypeError);
});
test('positive safe integer threshold only', () => {
  for (const threshold of [0, -1, 0.5, Infinity, NaN, '100000', Number.MAX_SAFE_INTEGER+1]) assert.throws(() => validateResolutionRule(rule({threshold})), TypeError);
  assert.equal(validateResolutionRule(rule({threshold:Number.MAX_SAFE_INTEGER})).threshold, Number.MAX_SAFE_INTEGER);
});
test('invalid dates, timezone forms and non-minute observations rejected', () => {
  for (const observation_at of ['2026-02-30T03:30:00.000Z', '2026-13-01T00:00:00.000Z', '2026-10-04T24:00:00.000Z', '2026-10-04T03:30:01.000Z', '2026-10-04T03:30:00.001Z', '2026-10-04T12:30:00.000+09:00', '2026-10-04T03:30:00Z', '2026-10-04T03:30:00', 'invalid']) assert.throws(() => validateResolutionRule(rule({observation_at})), TypeError);
});
test('issue dates require exact end instant and strictly earlier betting end', () => {
  assert.deepEqual(validateResolutionRule(rule(), {end_date:new Date(rule().observation_at), betting_end_date:new Date('2026-10-04T03:29:00Z')}), rule());
  for (const dates of [{}, {end_date:rule().observation_at}, {end_date:'2026-10-04T03:31:00Z', betting_end_date:'2026-10-04T03:29:00Z'}, {end_date:rule().observation_at, betting_end_date:rule().observation_at}, {end_date:rule().observation_at, betting_end_date:'2026-10-04T03:31:00Z'}, {end_date:'2026-02-30T03:30:00Z', betting_end_date:'2026-02-28T03:29:00Z'}]) assert.throws(() => validateResolutionRule(rule(), dates), TypeError);
});
test('legacy KST marker and exact threshold yield canonical UTC rule', () => {
  assert.deepEqual(inferLegacyRule(issue()), rule());
  assert.deepEqual(inferLegacyRule(issue({description:'[YEGAM-BTC-20261004-1230-KRW-v1] 기준가가 100000원을 초과하면 YES'})), rule());
  assert.equal(inferLegacyRule(issue({description:'YEGAM-ETH-20261004-0030-KRW-v1 기준가 1원을 초과하면 YES', end_date:'2026-10-03T15:30:00Z', betting_end_date:'2026-10-03T15:29:00Z'})).observation_at, '2026-10-03T15:30:00.000Z');
});
test('legacy whitelist works for all six symbols', () => {
  for (const symbol of ['BTC','ETH','SOL','XRP','DOGE','ADA']) assert.equal(inferLegacyRule(issue({description:`YEGAM-${symbol}-20261004-1230-KRW-v1 기준가 1원을 초과하면 YES`})).market, `KRW-${symbol}`);
});
test('legacy rejects invalid calendars, unsupported symbols and malformed marker boundaries', () => {
  for (const marker of ['YEGAM-BTC-20260230-1230-KRW-v1', 'YEGAM-BTC-20261301-1230-KRW-v1', 'YEGAM-BTC-20261004-2400-KRW-v1', 'YEGAM-BTC-20261004-1260-KRW-v1', 'YEGAM-BTC-20261004-1230-KRW-v10', 'YEGAM-BTC-20261004-1230-KRW-v1-extra', 'xYEGAM-BTC-20261004-1230-KRW-v1', 'YEGAM-USDT-20261004-1230-KRW-v1']) assert.equal(inferLegacyRule(issue({description:`${marker} 기준가 100,000원을 초과하면 YES`})), null);
});
test('legacy leap day is checked, not normalized', () => {
  const valid = issue({description:'YEGAM-BTC-20240229-1230-KRW-v1 기준가 1원을 초과하면 YES', end_date:'2024-02-29T03:30:00Z', betting_end_date:'2024-02-29T03:29:00Z'});
  assert.equal(inferLegacyRule(valid).observation_at, '2024-02-29T03:30:00.000Z');
  assert.equal(inferLegacyRule({...valid, description:valid.description.replace('20240229','20230229'), end_date:'2023-03-01T03:30:00Z'}), null);
});
test('legacy refuses marker and threshold ambiguity and free-text inference', () => {
  const base = issue().description;
  for (const description of [base+' '+base, base+' YEGAM-ETH-20261004-1230-KRW-v1', base+' YEGAM-INVALID', base+' 기준가 100,000원을 초과하면 YES', 'BTC price will exceed 100000, answer YES', '기준가 100,000원을 초과하면 YES', 'YEGAM-BTC-20261004-1230-KRW-v1 가격은 100000원']) assert.equal(inferLegacyRule(issue({description})), null);
  assert.equal(inferLegacyRule(issue({end_date:'2026-10-04T03:31:00Z'})), null);
  assert.equal(inferLegacyRule(issue({betting_end_date:issue().end_date})), null);
  assert.equal(inferLegacyRule({}), null);
});
test('legacy threshold invalid values are refused', () => {
  for (const price of ['0', '01', '1,,000', '1,00', '9007199254740992', '-1', '0.5']) assert.equal(inferLegacyRule(issue({description:`YEGAM-BTC-20261004-1230-KRW-v1 기준가 ${price}원을 초과하면 YES`})), null);
});
