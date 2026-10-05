'use strict';

const MARKETS = new Set(['KRW-BTC', 'KRW-ETH', 'KRW-SOL', 'KRW-XRP', 'KRW-DOGE', 'KRW-ADA']);
const KEYS = ['version', 'provider', 'market', 'metric', 'operator', 'threshold', 'observation_at', 'missing_data_policy'];

// Parse zoned timestamps strictly: Date.parse alone normalizes invalid calendar days.
function timestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : NaN;
  if (typeof value !== 'string') return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return NaN;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(h, mi, s, 0);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return NaN;
  if (m[8] !== 'Z' && (Number(m[8].slice(1, 3)) > 23 || Number(m[8].slice(4)) > 59)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : NaN;
}

/** Return a canonical, fresh JSON rule; invalid input throws TypeError. */
function validateResolutionRule(rule, issueDates) {
  const fail = (message) => { throw new TypeError(`Invalid resolution rule: ${message}`); };
  if (!rule || typeof rule !== 'object' || Array.isArray(rule) || ![Object.prototype, null].includes(Object.getPrototypeOf(rule))) fail('expected a JSON object');
  if (Object.keys(rule).length !== KEYS.length || KEYS.some(key => !Object.hasOwn(rule, key)) || Reflect.ownKeys(rule).length !== KEYS.length) fail('unexpected or missing fields');
  if (rule.version !== 1 || rule.provider !== 'upbit' || !MARKETS.has(rule.market) || rule.metric !== 'minute_close' || rule.operator !== 'gt' || rule.missing_data_policy !== 'cancel_after_24h') fail('unsupported rule');
  if (!Number.isSafeInteger(rule.threshold) || rule.threshold <= 0) fail('threshold must be a positive safe integer');
  const observation = timestamp(rule.observation_at);
  if (!Number.isFinite(observation) || new Date(observation).toISOString() !== rule.observation_at || observation % 60000 !== 0) fail('observation_at must be canonical, minute-aligned UTC ISO');
  if (issueDates !== undefined) {
    if (!issueDates || typeof issueDates !== 'object') fail('issue dates required');
    const end = timestamp(issueDates.end_date);
    const bettingEnd = timestamp(issueDates.betting_end_date);
    if (end !== observation) fail('end_date must match observation_at');
    if (!Number.isFinite(bettingEnd) || bettingEnd >= observation) fail('betting_end_date must precede observation_at');
  }
  return Object.fromEntries(KEYS.map(key => [key, rule[key]]));
}

/** Migration/backfill only. Never infer settlement from ordinary prose. */
function inferLegacyRule(issue) {
  if (!issue || typeof issue.description !== 'string') return null;
  const description = issue.description;
  if ((description.match(/YEGAM-/g) || []).length !== 1) return null;
  const marker = /(?<![A-Za-z0-9_-])YEGAM-(BTC|ETH|SOL|XRP|DOGE|ADA)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})-KRW-v1(?![A-Za-z0-9_-])/.exec(description);
  if (!marker) return null;
  const [, symbol, year, month, day, hour, minute] = marker;
  const observation = timestamp(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);
  if (!Number.isFinite(observation) || timestamp(issue.end_date) !== observation) return null;
  const prices = [...description.matchAll(/기준가(?:가)? ([\d,]+)원을 초과하면 YES/g)];
  if (prices.length !== 1 || !/^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(prices[0][1])) return null;
  const threshold = Number(prices[0][1].replace(/,/g, ''));
  const rule = {
    version: 1, provider: 'upbit', market: `KRW-${symbol}`, metric: 'minute_close', operator: 'gt', threshold,
    observation_at: new Date(observation).toISOString(), missing_data_policy: 'cancel_after_24h'
  };
  try {
    return validateResolutionRule(rule, issue.betting_end_date === undefined ? undefined : issue);
  } catch { return null; }
}

module.exports = { validateResolutionRule, inferLegacyRule };
