'use strict';

const { validateResolutionRule } = require('./marketResolutionRule');
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * Resolve only the last completed minute candle at the declared observation.
 * Returns {status: 'pending'|'Yes'|'No'|'Cancelled', reason?, evidence?}.
 * Validation errors throw. Provider failures never become Yes or No.
 */
async function resolveUpbit(rule, { now = Date.now, fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const validated = validateResolutionRule(rule);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new TypeError('timeoutMs must be a positive timer-safe integer');
  const clock = () => {
    const value = typeof now === 'function' ? now() : now;
    const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;
    if (!Number.isSafeInteger(time) || !Number.isFinite(new Date(time).getTime())) throw new TypeError('now must be a valid timestamp');
    return time;
  };
  const observation = Date.parse(validated.observation_at);
  const startedAt = clock();
  if (startedAt < observation + 5_000) return { status: 'pending', reason: 'observation_not_ready' };
  const sourceUrl = `https://api.upbit.com/v1/candles/minutes/1?market=${validated.market}&to=${encodeURIComponent(validated.observation_at)}&count=1`;
  const candleOpen = new Date(observation - MINUTE).toISOString();
  const controller = new AbortController();
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ reason: 'timeout' });
    }, timeoutMs);
  });
  // Race includes body reading and validation, not just response headers.
  const request = async () => {
    try {
      const response = await fetchImpl(sourceUrl, { method: 'GET', signal: controller.signal, redirect: 'error' });
      if (!response || response.status !== 200) return { reason: response?.status === 429 ? 'rate_limited' : 'http_error' };
      let body;
      try { body = await response.json(); } catch { return { reason: 'invalid_body' }; }
      if (!Array.isArray(body)) return { reason: 'invalid_body' };
      if (body.length === 0) return { reason: 'missing_candle' };
      if (body.length !== 1 || !body[0] || typeof body[0] !== 'object' || Array.isArray(body[0])) return { reason: 'invalid_body' };
      const candle = body[0];
      if (candle.market !== validated.market) return { reason: 'wrong_market' };
      // Upbit UTC timestamps omit a timezone suffix. Compare exact documented format.
      if (candle.candle_date_time_utc !== candleOpen.slice(0, 19)) return { reason: 'wrong_candle' };
      if (typeof candle.trade_price !== 'number' || !Number.isFinite(candle.trade_price) || candle.trade_price <= 0) return { reason: 'invalid_close' };
      return { close: candle.trade_price };
    } catch {
      return { reason: controller.signal.aborted ? 'timeout' : 'network_error' };
    }
  };
  let result;
  try { result = await Promise.race([request(), timeout]); } finally { clearTimeout(timer); }
  const retrievedAt = clock();
  if (result.reason) {
    return { status: retrievedAt >= observation + DAY ? 'Cancelled' : 'pending', reason: result.reason };
  }
  return {
    status: result.close > validated.threshold ? 'Yes' : 'No',
    evidence: {
      provider: validated.provider, market: validated.market, requested_observation_at: validated.observation_at,
      candle_open_at: candleOpen, close: result.close, source_url: sourceUrl, retrieved_at: new Date(retrievedAt).toISOString()
    }
  };
}

module.exports = { resolveUpbit };
