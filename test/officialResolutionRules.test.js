'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../services/officialResolutionRules');
const { validateOfficialRule, officialRuleKey, officialPublicText, officialTitle, treasuryDateStartUtc, ruleCategory } = api;

const WEATHER_KEYS = ['version', 'provider', 'station', 'metric', 'operator', 'threshold', 'observation_at', 'missing_data_policy'];
const TREASURY_KEYS = ['version', 'provider', 'series', 'metric', 'operator', 'threshold_bp', 'event_date', 'observation_at', 'missing_data_policy'];
function weather(overrides = {}) {
  return { version: 2, provider: 'awc_metar', station: 'RKSI', metric: 'temperature_c', operator: 'gt', threshold: 20,
    observation_at: '2026-10-04T15:00:00.000Z', missing_data_policy: 'cancel_after_24h', ...overrides };
}
function treasury(overrides = {}) {
  return { version: 2, provider: 'us_treasury', series: 'BC_10YEAR', metric: 'par_yield_basis_points', operator: 'gt', threshold_bp: 400,
    event_date: '2026-10-05', observation_at: '2026-10-06T04:00:00.000Z', missing_data_policy: 'cancel_after_24h', ...overrides };
}
function issue(rule, betting_end_date) {
  return { id: 42, end_date: rule.observation_at, betting_end_date };
}
function reject(rule, dates) { assert.throws(() => validateOfficialRule(rule, dates), TypeError); }

test('exports exactly the six requested pure APIs', () => {
  assert.deepEqual(Object.keys(api).sort(), ['validateOfficialRule', 'officialRuleKey', 'officialPublicText', 'officialTitle', 'treasuryDateStartUtc', 'ruleCategory'].sort());
  for (const value of Object.values(api)) assert.equal(typeof value, 'function');
});

test('canonical weather and Treasury are fresh fixed-order objects without mutation', () => {
  for (const [original, keys] of [[weather(), WEATHER_KEYS], [treasury(), TREASURY_KEYS]]) {
    const reversed = Object.fromEntries(Object.entries(original).reverse());
    Object.freeze(reversed);
    const result = validateOfficialRule(reversed);
    assert.deepEqual(result, original);
    assert.notEqual(result, reversed);
    assert.deepEqual(Object.keys(result), keys);
    assert.equal(JSON.stringify(result), JSON.stringify(original));
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    const nullPrototype = Object.assign(Object.create(null), original);
    assert.deepEqual(validateOfficialRule(nullPrototype), original);
  }
});

test('exact schemas reject missing, unknown, symbol, hidden, inherited and URL fields', () => {
  for (const make of [weather, treasury]) {
    const base = make();
    for (const key of Object.keys(base)) {
      const incomplete = { ...base }; delete incomplete[key]; reject(incomplete);
    }
    for (const key of ['url', 'source_url', 'threshold_url', 'extra', '__proto__']) {
      const extra = { ...base }; Object.defineProperty(extra, key, { value: 'https://attacker.invalid', enumerable: true }); reject(extra);
    }
    const symbol = { ...base, [Symbol('url')]: 'https://attacker.invalid' }; reject(symbol);
    const hidden = { ...base }; Object.defineProperty(hidden, 'hidden', { value: 1 }); reject(hidden);
    const hiddenKnown = { ...base }; Object.defineProperty(hiddenKnown, 'provider', { value: base.provider, enumerable: false }); reject(hiddenKnown);
    reject(Object.assign(Object.create({ malicious: true }), base));
    reject(new Proxy(base, {}));
    for (const key of Object.keys(base)) {
      const accessor = { ...base };
      let reads = 0;
      Object.defineProperty(accessor, key, { enumerable: true, get() { reads++; throw new Error('must not execute'); } });
      reject(accessor); assert.equal(reads, 0);
    }
  }
  for (const malformed of [null, undefined, [], 'rule', 1, true, new Date(), new Map()]) reject(malformed);
});

test('only exact v2 provider, station, series, metric, operator and policy allowed', () => {
  for (const make of [weather, treasury]) {
    for (const patch of [{ version: 1 }, { version: '2' }, { provider: 'upbit' }, { provider: 'https://attacker.invalid' },
      { operator: 'gte' }, { operator: 'GT' }, { missing_data_policy: 'latest' }, { metric: 'price' }]) reject(make(patch));
  }
  for (const station of ['RKSS', 'rksi', 'RKSI&url=https://attacker.invalid', 1]) reject(weather({ station }));
  for (const series of ['BC_2YEAR', 'bc_10year', 'https://attacker.invalid', 10]) reject(treasury({ series }));
  reject(weather({ metric: 'par_yield_basis_points' }));
  reject(treasury({ metric: 'temperature_c' }));
});

test('weather thresholds allow inclusive negative and positive integer bounds but reject negative zero', () => {
  for (const threshold of [-100, -1, 0, 1, 80]) assert.equal(validateOfficialRule(weather({ threshold })).threshold, threshold);
  for (const threshold of [-101, 81, -0, 0.5, -0.5, NaN, Infinity, -Infinity, '20', null, true, new Number(20), Number.MAX_SAFE_INTEGER + 1]) reject(weather({ threshold }));
});

test('Treasury thresholds require safe integer basis points 0 through 10000', () => {
  for (const threshold_bp of [0, 1, 400, 10000]) assert.equal(validateOfficialRule(treasury({ threshold_bp })).threshold_bp, threshold_bp);
  for (const threshold_bp of [-1, 10001, -0, 0.5, NaN, Infinity, '400', null, false, new Number(400), Number.MAX_SAFE_INTEGER + 1]) reject(treasury({ threshold_bp }));
});

test('observations require exact canonical UTC .000Z and valid real calendar dates', () => {
  const bad = ['2026-02-30T15:00:00.000Z', '2025-02-29T15:00:00.000Z', '2026-13-01T15:00:00.000Z',
    '2026-00-01T15:00:00.000Z', '2026-10-00T15:00:00.000Z', '2026-10-04T24:00:00.000Z',
    '2026-10-04T15:60:00.000Z', '2026-10-04T15:00:60.000Z', '2026-10-04T15:00:00.001Z',
    '2026-10-04T15:00:00Z', '2026-10-04T15:00:00.00Z', '2026-10-04T15:00:00.000z',
    '2026-10-05T00:00:00.000+09:00', '2026-10-04T15:00:00', '2026-10-04 15:00:00.000Z',
    '0000-10-04T15:00:00.000Z', 'invalid', 1791126000000, new Date('2026-10-04T15:00:00Z')];
  for (const observation_at of bad) {
    reject(weather({ observation_at })); reject(treasury({ observation_at }));
  }
  assert.equal(validateOfficialRule(weather({ observation_at: '2024-02-29T00:00:00.000Z' })).observation_at, '2024-02-29T00:00:00.000Z');
});

test('weather is whole-hour aligned and Treasury minute aligned', () => {
  reject(weather({ observation_at: '2026-10-04T15:01:00.000Z' }));
  reject(weather({ observation_at: '2026-10-04T15:00:01.000Z' }));
  assert.equal(validateOfficialRule(treasury({ observation_at: '2026-10-06T04:01:00.000Z' })).observation_at, '2026-10-06T04:01:00.000Z');
  reject(treasury({ observation_at: '2026-10-06T04:00:01.000Z' }));
});

test('Treasury strict event-date calendar accepts weekdays including leap day but never weekends', () => {
  for (const event_date of ['2026-10-03', '2026-10-04', '2026-02-30', '2025-02-29', '2100-02-29',
    '2026-13-01', '2026-00-01', '2026-10-00', '2026-1-05', '2026-10-5', '2026-10-05T00:00:00Z', '0000-01-01', new Date(), 20261005]) {
    reject(treasury({ event_date }));
  }
  for (const event_date of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) {
    assert.equal(validateOfficialRule(treasury({ event_date, observation_at: '2026-10-10T04:00:00.000Z' })).event_date, event_date);
  }
  assert.equal(validateOfficialRule(treasury({ event_date: '2024-02-29', observation_at: '2024-03-01T05:00:00.000Z' })).event_date, '2024-02-29');
});

test('New York midnight helper returns epoch milliseconds and derives EST/EDT via timezone data', () => {
  const cases = {
    '2026-01-05': '2026-01-05T05:00:00.000Z',
    '2026-07-06': '2026-07-06T04:00:00.000Z',
    '2026-03-08': '2026-03-08T05:00:00.000Z',
    '2026-03-09': '2026-03-09T04:00:00.000Z',
    '2026-11-01': '2026-11-01T04:00:00.000Z',
    '2026-11-02': '2026-11-02T05:00:00.000Z',
    '2024-02-29': '2024-02-29T05:00:00.000Z'
  };
  for (const [date, iso] of Object.entries(cases)) {
    const timestamp = treasuryDateStartUtc(date);
    assert.equal(typeof timestamp, 'number');
    assert.equal(timestamp, Date.parse(iso));
  }
  assert.equal(treasuryDateStartUtc('2026-03-09') - treasuryDateStartUtc('2026-03-08'), 23 * 3600000);
  assert.equal(treasuryDateStartUtc('2026-11-02') - treasuryDateStartUtc('2026-11-01'), 25 * 3600000);
  for (const date of ['2026-02-30', '2025-02-29', '2026-3-08', '2026-03-08T00:00:00Z', null, 20260308]) assert.throws(() => treasuryDateStartUtc(date), TypeError);
});

test('Treasury observation is at least next LOCAL midnight, Friday includes Saturday, and may be later', () => {
  for (const [event_date, observation_at] of [
    ['2026-03-06', '2026-03-07T05:00:00.000Z'],
    ['2026-03-09', '2026-03-10T04:00:00.000Z'],
    ['2026-10-30', '2026-10-31T04:00:00.000Z'],
    ['2026-11-02', '2026-11-03T05:00:00.000Z'],
    ['2026-12-31', '2027-01-01T05:00:00.000Z']
  ]) {
    assert.equal(validateOfficialRule(treasury({ event_date, observation_at })).observation_at, observation_at);
    reject(treasury({ event_date, observation_at: new Date(Date.parse(observation_at) - 60000).toISOString() }));
    assert.equal(validateOfficialRule(treasury({ event_date, observation_at: new Date(Date.parse(observation_at) + 60000).toISOString() })).event_date, event_date);
  }
  reject(treasury({ observation_at: '2026-10-05T23:59:00.000Z' }));
});

test('optional issue dates accept exact zoned instants and real Date instances', () => {
  assert.deepEqual(validateOfficialRule(weather(), { end_date: '2026-10-05T00:00:00+09:00', betting_end_date: '2026-10-04T18:00:00.000+09:00' }), weather());
  assert.deepEqual(validateOfficialRule(weather(), issue(weather(), new Date('2026-10-04T09:00:00.000Z'))), weather());
  assert.deepEqual(validateOfficialRule(treasury(), { end_date: new Date(treasury().observation_at), betting_end_date: new Date('2026-10-05T04:00:00Z') }), treasury());
});

test('issue end must match observation and betting end must be valid and strictly earlier', () => {
  for (const make of [weather, treasury]) {
    const rule = make();
    for (const dates of [null, [], {}, { end_date: rule.observation_at },
      issue(rule, rule.observation_at), issue(rule, new Date(Date.parse(rule.observation_at) + 1)),
      issue(rule, new Date(NaN)), issue(rule, 0), issue(rule, '2026-02-30T00:00:00Z'),
      issue(rule, '2026-10-01T00:00:00'), issue(rule, '2026-10-01T00:00:00+24:00'),
      { end_date: new Date(Date.parse(rule.observation_at) + 1), betting_end_date: '2026-01-01T00:00:00Z' },
      { end_date: '2026-02-30T15:00:00Z', betting_end_date: '2026-01-01T00:00:00Z' }]) reject(rule, dates);
    const dates = issue(rule, '2026-01-01T00:00:00Z');
    let read = false;
    Object.defineProperty(dates, 'end_date', { enumerable: true, get() { read = true; return rule.observation_at; } });
    reject(rule, dates); assert.equal(read, false);
  }
});

test('Treasury betting cutoff <= event-date New York midnight includes equality and correctly follows DST', () => {
  for (const [event_date, observation_at, midnight] of [
    ['2026-03-06', '2026-03-07T05:00:00.000Z', '2026-03-06T05:00:00.000Z'],
    ['2026-03-09', '2026-03-10T04:00:00.000Z', '2026-03-09T04:00:00.000Z'],
    ['2026-11-02', '2026-11-03T05:00:00.000Z', '2026-11-02T05:00:00.000Z']
  ]) {
    const rule = treasury({ event_date, observation_at });
    assert.deepEqual(validateOfficialRule(rule, issue(rule, midnight)), rule);
    assert.deepEqual(validateOfficialRule(rule, issue(rule, new Date(Date.parse(midnight) - 1))), rule);
    reject(rule, issue(rule, new Date(Date.parse(midnight) + 1)));
    reject(rule, issue(rule, new Date(Date.parse(observation_at) - 60000)));
  }
  assert.deepEqual(validateOfficialRule(treasury(), issue(treasury(), '2026-10-05T00:00:00-04:00')), treasury());
});

test('past rules remain valid for read-only previews without a current/future clock dependency', () => {
  assert.equal(validateOfficialRule(weather({ observation_at: '2000-01-01T00:00:00.000Z' })).version, 2);
  assert.equal(validateOfficialRule(treasury({ event_date: '2000-01-03', observation_at: '2000-01-04T05:00:00.000Z' })).version, 2);
});

test('weather key is exact KST event identity, independent of threshold with rollover', () => {
  assert.equal(officialRuleKey(weather()), 'YEGAM-METAR-RKSI-20261005-0000-v2');
  assert.equal(officialRuleKey(weather({ threshold: -100 })), officialRuleKey(weather({ threshold: 80 })));
  assert.equal(officialRuleKey(weather({ observation_at: '2026-10-04T14:00:00.000Z' })), 'YEGAM-METAR-RKSI-20261004-2300-v2');
  assert.equal(officialRuleKey(weather({ observation_at: '2026-12-31T15:00:00.000Z' })), 'YEGAM-METAR-RKSI-20270101-0000-v2');
  assert.notEqual(officialRuleKey(weather()), officialRuleKey(weather({ observation_at: '2026-10-04T16:00:00.000Z' })));
});

test('Treasury key excludes both threshold and observation to prevent competing same-date markets', () => {
  assert.equal(officialRuleKey(treasury()), 'YEGAM-TREASURY-10Y-20261005-v2');
  assert.equal(officialRuleKey(treasury({ threshold_bp: 0 })), officialRuleKey(treasury({ threshold_bp: 10000, observation_at: '2026-10-07T04:01:00.000Z' })));
  assert.notEqual(officialRuleKey(treasury()), officialRuleKey(treasury({ event_date: '2026-10-06', observation_at: '2026-10-07T04:00:00.000Z' })));
});

test('titles and categories are deterministic, concise Korean with visible timezone and exact threshold', () => {
  assert.equal(ruleCategory(weather()), '날씨'); assert.equal(ruleCategory(treasury()), '경제');
  assert.equal(officialTitle(weather()), '인천공항(RKSI) 2026-10-05 00:00 KST 기온이 20°C를 초과할까?');
  assert.equal(officialTitle(treasury()), '미국 10년 국채 2026-10-05 뉴욕(ET) 금리가 400bp를 초과할까?');
  for (const rule of [weather(), treasury()]) {
    const shuffled = Object.fromEntries(Object.entries(rule).reverse());
    assert.equal(officialTitle(rule), officialTitle(shuffled));
    assert.equal(officialPublicText(rule), officialPublicText(shuffled));
    assert.notEqual(officialTitle(rule), officialTitle(rule.provider === 'awc_metar' ? weather({ threshold: 21 }) : treasury({ threshold_bp: 401 })));
  }
});

test('public text contains exactly one key, strict criterion, tie No, 24h missing cancellation and no silent No', () => {
  for (const rule of [weather(), treasury()]) {
    const text = officialPublicText(rule);
    assert.equal(text.split(officialRuleKey(rule)).length - 1, 1);
    assert.equal((text.match(/YEGAM-/g) || []).length, 1);
    assert.ok(text.includes(rule.observation_at));
    assert.match(text, /엄격히 초과하면 Yes/);
    assert.match(text, /같거나 낮으면 No/);
    assert.match(text, /관측 기준 시각에서 24시간/);
    assert.match(text, /Cancelled.*취소.*환불/);
    assert.match(text, /조회 실패나 누락은 No가 아닙니다/);
    assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}]|—/u);
  }
});

test('weather public text identifies exact AWC METAR instant, RKSI, Celsius and bans nearest/latest fallback', () => {
  const text = officialPublicText(weather({ threshold: -1 }));
  for (const term of ['NOAA', 'Aviation Weather Center', 'https://aviationweather.gov/data/api/', 'RKSI', '2026-10-05 00:00 KST', 'Asia/Seoul', 'temperature_c', '섭씨 °C', '-1°C', '반올림하지', '최신값으로 대체하지']) assert.ok(text.includes(term), term);
});

test('Treasury text specifies official exact-date row, basis points, first COMMITTED successful capture and nonretroactive corrections', () => {
  const text = officialPublicText(treasury());
  for (const term of ['U.S. Treasury', 'Daily Treasury Par Yield Curve Rates', 'home.treasury.gov', '2026-10-05', 'America/New_York',
    'BC_10YEAR', '1bp = 0.01%p', '공식 백분율 값 × 100', '400bp', '해당 시각 포함', '원자적 정산 트랜잭션',
    '처음 성공적으로 기록', '롤백', '재시도 시 정정된 공식 행', '최초 발표값이나 최초 공표 당시 빈티지를 의미하지 않습니다',
    '정산 확정 후의 정정은 소급 반영하지 않습니다', '다른 날짜나 최신 행으로 대체하지 않습니다']) assert.ok(text.includes(term), term);
  assert.notEqual(text, officialPublicText(treasury({ observation_at: '2026-10-07T04:00:00.000Z' })));
});

test('all descriptor APIs validate inputs rather than rendering unknown or unsafe rules', () => {
  for (const fn of [officialRuleKey, officialPublicText, officialTitle, ruleCategory]) {
    for (const bad of [null, {}, weather({ threshold: '20' }), treasury({ url: 'https://attacker.invalid' })]) assert.throws(() => fn(bad), TypeError);
  }
});

test('weather betting cutoff has mandatory six-hour lead including millisecond boundary',()=>{const w=weather(),safe=Date.parse(w.observation_at)-6*3600000;assert.deepEqual(validateOfficialRule(w,issue(w,new Date(safe))),w);reject(w,issue(w,new Date(safe+1)));reject(w,issue(w,new Date(Date.parse(w.observation_at)-1)));});
