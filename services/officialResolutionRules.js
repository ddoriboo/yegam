'use strict';

const { types: { isProxy } } = require('node:util');

const WEATHER_KEYS = ['version', 'provider', 'station', 'metric', 'operator', 'threshold', 'observation_at', 'missing_data_policy'];
const TREASURY_KEYS = ['version', 'provider', 'series', 'metric', 'operator', 'threshold_bp', 'event_date', 'observation_at', 'missing_data_policy'];
const DAY = 86_400_000;
const NEW_YORK = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

function fail(message) { throw new TypeError('Invalid official rule: ' + message); }

function plainObject(value) {
  return value !== null && typeof value === 'object' && !isProxy(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

// Inspect descriptors before reading values: JSON input cannot carry getters,
// hidden fields, symbol keys, inherited fields or custom prototypes.
function dataObject(value) {
  if (!plainObject(value)) fail('expected a plain JSON object');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      fail('only enumerable own data fields are allowed');
    }
  }
  return descriptors;
}

function utcDate(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  const result = new Date(0);
  result.setUTCFullYear(year, month - 1, day);
  result.setUTCHours(hour, minute, second, millisecond);
  return result;
}

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('event_date must be a real YYYY-MM-DD date');
  const [year, month, day] = value.split('-').map(Number);
  const date = utcDate(year, month, day);
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    fail('event_date must be a real YYYY-MM-DD date');
  }
  return date;
}

function canonicalObservation(value, alignment) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(value)) {
    fail('observation_at must be canonical UTC ISO with .000Z');
  }
  calendarDate(value.slice(0, 10));
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value || time % alignment !== 0) {
    fail('observation_at has an invalid calendar or alignment');
  }
  return time;
}

// Issue dates may be real Date objects or strictly valid zoned ISO strings.
// Do not let Date.parse silently normalize impossible calendar dates.
function issueTimestamp(value) {
  if (value instanceof Date) {
    if (Object.getPrototypeOf(value) !== Date.prototype) return NaN;
    return Date.prototype.getTime.call(value);
  }
  if (typeof value !== 'string') return NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return NaN;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const date = utcDate(year, month, day);
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
      || hour > 23 || minute > 59 || second > 59) return NaN;
  if (match[8] !== 'Z' && (Number(match[8].slice(1, 3)) > 23 || Number(match[8].slice(4)) > 59)) return NaN;
  return Date.parse(value);
}

/** UTC epoch milliseconds of the supplied calendar day's New York midnight.
 * Uses the timezone database, not a fixed EST/EDT offset. Weekends are valid
 * here because a Friday event's next local midnight is a Saturday.
 */
function treasuryDateStartUtc(date) {
  const target = calendarDate(date).getTime();
  let instant = target + DAY / 2;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(NEW_YORK.formatToParts(new Date(instant))
      .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const localAsUtc = utcDate(Number(parts.year), Number(parts.month), Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second)).getTime();
    const delta = target - localAsUtc;
    if (delta === 0) return instant;
    instant += delta;
  }
  fail('could not determine New York midnight');
}

/** Return a fresh canonical fixed-order rule. No future-time gate: historical
 * rules must remain usable for read-only previews and settlement evidence.
 */
function validateOfficialRule(rule, issue) {
  const descriptors = dataObject(rule);
  const provider = descriptors.provider?.value;
  const keys = provider === 'awc_metar' ? WEATHER_KEYS : provider === 'us_treasury' ? TREASURY_KEYS : null;
  if (!keys) fail('unsupported provider');
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))) {
    fail('unexpected or missing fields');
  }
  const canonical = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
  if (canonical.version !== 2 || canonical.operator !== 'gt' || canonical.missing_data_policy !== 'cancel_after_24h') {
    fail('unsupported version, operator or missing-data policy');
  }
  const weather = provider === 'awc_metar';
  if (weather) {
    if (canonical.station !== 'RKSI' || canonical.metric !== 'temperature_c') fail('unsupported weather station or metric');
    if (!Number.isSafeInteger(canonical.threshold) || Object.is(canonical.threshold, -0)
        || canonical.threshold < -100 || canonical.threshold > 80) fail('threshold must be an integer from -100 to 80');
  } else {
    if (canonical.series !== 'BC_10YEAR' || canonical.metric !== 'par_yield_basis_points') fail('unsupported Treasury series or metric');
    if (!Number.isSafeInteger(canonical.threshold_bp) || Object.is(canonical.threshold_bp, -0)
        || canonical.threshold_bp < 0 || canonical.threshold_bp > 10_000) fail('threshold_bp must be a safe integer from 0 to 10000');
    const eventDate = calendarDate(canonical.event_date);
    if (eventDate.getUTCDay() === 0 || eventDate.getUTCDay() === 6) fail('event_date must be Monday through Friday');
  }
  const observation = canonicalObservation(canonical.observation_at, weather ? 3_600_000 : 60_000);
  if (!weather) {
    const nextDate = new Date(calendarDate(canonical.event_date).getTime() + DAY).toISOString().slice(0, 10);
    if (!/^\d{4}-/.test(nextDate)) fail('next local date is outside supported calendar');
    if (observation < treasuryDateStartUtc(nextDate)) fail('observation_at must be at or after next New York midnight');
  }
  if (issue !== undefined) {
    const dates = dataObject(issue);
    const end = issueTimestamp(dates.end_date?.value);
    const bettingEnd = issueTimestamp(dates.betting_end_date?.value);
    if (end !== observation) fail('end_date must equal observation_at');
    if (!Number.isFinite(bettingEnd) || bettingEnd >= observation) fail('betting_end_date must be finite and before observation_at');
    if (weather && bettingEnd > observation - 6 * 3_600_000) fail('Weather betting must close at least six hours before observation');
    if (!weather && bettingEnd > treasuryDateStartUtc(canonical.event_date)) {
      fail('Treasury betting_end_date must be at or before event-date New York midnight');
    }
  }
  return canonical;
}

function kstObservation(rule) {
  return new Date(Date.parse(rule.observation_at) + 9 * 3_600_000).toISOString();
}

function officialRuleKey(rule) {
  const validated = validateOfficialRule(rule);
  if (validated.provider === 'us_treasury') return 'YEGAM-TREASURY-10Y-' + validated.event_date.replace(/-/g, '') + '-v2';
  const kst = kstObservation(validated);
  return 'YEGAM-METAR-RKSI-' + kst.slice(0, 10).replace(/-/g, '') + '-' + kst.slice(11, 16).replace(':', '') + '-v2';
}

function ruleCategory(rule) {
  return validateOfficialRule(rule).provider === 'awc_metar' ? '날씨' : '경제';
}

function officialTitle(rule) {
  const validated = validateOfficialRule(rule);
  if (validated.provider === 'awc_metar') {
    const kst = kstObservation(validated);
    return '인천공항(RKSI) ' + kst.slice(0, 10) + ' ' + kst.slice(11, 16) + ' KST 기온이 ' + validated.threshold + '°C를 초과할까?';
  }
  return '미국 10년 국채 ' + validated.event_date + ' 뉴욕(ET) 금리가 ' + validated.threshold_bp + 'bp를 초과할까?';
}

function officialPublicText(rule) {
  const validated = validateOfficialRule(rule);
  const common = '값이 기준과 같거나 낮으면 No입니다. 누락·충돌·조회 오류·서버 또는 제공자 장애로 유효한 대상 공식 데이터를 확보하지 못하면 보류합니다. 관측 기준 시각에서 24시간이 지난 조회에도 유효한 자료를 확보하지 못하면 Cancelled로 취소하고 GAM 원금을 환불합니다. 조회 실패나 누락은 No가 아닙니다. 정확한 유효 자료가 확보되면 그 자료로 판정하며 다른 값으로 대체하지 않습니다.';
  if (validated.provider === 'awc_metar') {
    const kst = kstObservation(validated);
    return [
      officialRuleKey(validated),
      '공식 출처: 미국 NOAA Aviation Weather Center(AWC)의 METAR 데이터(https://aviationweather.gov/data/api/).',
      '대상: 인천국제공항 RKSI의 정확한 관측 시각 ' + validated.observation_at + ' (UTC), ' + kst.slice(0, 10) + ' ' + kst.slice(11, 16) + ' KST(Asia/Seoul)의 METAR 기온(temperature_c, 섭씨 °C).',
      '이 정확한 시각의 공식 관측 기온이 ' + validated.threshold + '°C를 엄격히 초과하면 Yes입니다. 반올림하지 않으며 다른 시각의 관측값이나 최신값으로 대체하지 않습니다.',
      common
    ].join('\n');
  }
  return [
    officialRuleKey(validated),
    '공식 출처: 미국 재무부(U.S. Treasury)의 Daily Treasury Par Yield Curve Rates(https://home.treasury.gov/treasury-daily-interest-rate-xml-feed).',
    '대상: ' + validated.event_date + ' 뉴욕 현지 날짜(America/New_York)의 정확한 공식 행에 있는 10년 만기 BC_10YEAR 금리. 단위는 bp(1bp = 0.01%p, 공식 백분율 값 × 100)이며 반올림하지 않습니다.',
    '선언한 관측 기준 시각 ' + validated.observation_at + ' (UTC) 이후(해당 시각 포함)에 조회한 이 정확한 날짜의 공식 행 중, 원자적 정산 트랜잭션에서 처음 성공적으로 기록하고 정산을 확정한 값을 판정값으로 사용합니다. 트랜잭션이 롤백되면 확보한 값은 확정되지 않으며 재시도 시 정정된 공식 행을 사용할 수 있습니다. 최초 발표값이나 최초 공표 당시 빈티지를 의미하지 않습니다. 정산 확정 후의 정정은 소급 반영하지 않습니다. 다른 날짜나 최신 행으로 대체하지 않습니다.',
    '그 값이 ' + validated.threshold_bp + 'bp를 엄격히 초과하면 Yes입니다.',
    common
  ].join('\n');
}

module.exports = { validateOfficialRule, officialRuleKey, officialPublicText, officialTitle, treasuryDateStartUtc, ruleCategory };
