'use strict';

const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { validateOfficialRule } = require('./officialResolutionRules');
const DAY = 86_400_000;
const MAX_BODY = 2 * 1024 * 1024;
const UA = 'Yegam-Official-Resolution/2.0 (+https://yegam.ai.kr)';
const ATOM = 'http://www.w3.org/2005/Atom';
const META = 'http://schemas.microsoft.com/ado/2007/08/dataservices/metadata';
const DATA = 'http://schemas.microsoft.com/ado/2007/08/dataservices';

function dependencies({ now = Date.now, fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new TypeError('timeoutMs must be a positive timer-safe integer');
  const clock = () => {
    const value = typeof now === 'function' ? now() : now;
    const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;
    if (typeof time !== 'number' || !Number.isSafeInteger(time) || !Number.isFinite(new Date(time).getTime())) throw new TypeError('now must be a valid timestamp');
    return time;
  };
  clock();
  return { clock, fetchImpl, timeoutMs };
}

function weatherUrl(observation) {
  return 'https://aviationweather.gov/api/data/metar?ids=RKSI&format=json' +
    (observation ? '&date=' + encodeURIComponent(observation) : '') + '&hours=2';
}
function treasuryUrl(month) {
  return 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=' + month;
}

async function boundedText(response, controller) {
  const declared = response.headers?.get?.('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_BODY) throw new Error('body_too_large');
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let text = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BODY) {
          controller.abort();
          Promise.resolve(reader.cancel()).catch(() => {});
          throw new Error('body_too_large');
        }
        text += decoder.decode(value, { stream: true });
      }
      return text + decoder.decode();
    } finally { reader.releaseLock(); }
  }
  const text = await response.text();
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BODY) throw new Error('invalid_body');
  return text;
}

async function request(url, deps, parse) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ reason: 'timeout' });
    }, deps.timeoutMs);
  });
  const work = async () => {
    let response;
    try {
      response = await deps.fetchImpl(url, {
        method: 'GET', redirect: 'error', signal: controller.signal,
        headers: { 'User-Agent': UA, Accept: url.startsWith('https://aviationweather.gov/') ? 'application/json' : 'application/atom+xml, application/xml' }
      });
    } catch { return { reason: controller.signal.aborted ? 'timeout' : 'network_error' }; }
    if (response?.status === 204) return { reason: 'missing_data' };
    if (response?.status !== 200) return { reason: response?.status === 429 ? 'rate_limited' : 'http_error' };
    try { return parse(await boundedText(response, controller)); }
    catch { return { reason: 'invalid_body' }; }
  };
  try { return await Promise.race([work(), timeout]); }
  finally { clearTimeout(timer); }
}

function parseWeather(text) {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) return { reason: 'invalid_body' };
  if (!rows.length) return { reason: 'missing_data' };
  return { rows };
}
function validWeather(row) {
  return row && typeof row === 'object' && !Array.isArray(row) && row.icaoId === 'RKSI' &&
    Number.isSafeInteger(row.obsTime) && Number.isFinite(new Date(row.obsTime * 1000).getTime()) &&
    typeof row.temp === 'number' && Number.isFinite(row.temp) && row.temp >= -100 && row.temp <= 80;
}

function namespaces(node, inherited = {}) {
  const ns = { ...inherited };
  if (node && typeof node === 'object') for (const [key, value] of Object.entries(node)) {
    if (key === '@_xmlns') ns[''] = value;
    else if (key.startsWith('@_xmlns:')) ns[key.slice(8)] = value;
  }
  return ns;
}
function children(node, inherited, name, uri) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
  const found = [];
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@_') || key === '#text') continue;
    const parts = key.split(':');
    const prefix = parts.length === 2 ? parts[0] : '';
    const local = parts.length === 2 ? parts[1] : parts[0];
    if (local !== name || parts.length > 2) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      const ns = namespaces(item, inherited);
      if (ns[prefix] === uri) found.push({ node: item, ns });
    }
  }
  return found;
}
function literal(item) {
  const { node, ns } = item;
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  for (const key of Object.keys(node)) {
    if (key !== '#text' && !key.startsWith('@_')) return null;
    if (key.startsWith('@_')) {
      const parts = key.slice(2).split(':');
      if (parts.length === 2 && ns[parts[0]] === META && parts[1] === 'null') return null;
    }
  }
  return typeof node['#text'] === 'string' ? node['#text'] : null;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function percentToBp(value) {
  // Bound arithmetic before BigInt conversion, including hostile giant XML literals.
  if (typeof value !== 'string' || value.length > 20 || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const bp = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return bp <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bp) : null;
}
function parseTreasury(text) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text) || XMLValidator.validate(text) !== true) return { reason: 'invalid_body' };
  const document = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, trimValues: false, processEntities: false }).parse(text);
  const roots = Object.keys(document).filter(key => !key.startsWith('?'));
  if (roots.length !== 1) return { reason: 'invalid_body' };
  const feeds = children(document, {}, 'feed', ATOM);
  if (feeds.length !== 1) return { reason: 'invalid_body' };
  const rows = [];
  for (const entry of children(feeds[0].node, feeds[0].ns, 'entry', ATOM)) {
    const contents = children(entry.node, entry.ns, 'content', ATOM);
    if (contents.length !== 1) return { reason: 'invalid_body' };
    const props = children(contents[0].node, contents[0].ns, 'properties', META);
    if (props.length !== 1) return { reason: 'invalid_body' };
    const dates = children(props[0].node, props[0].ns, 'NEW_DATE', DATA);
    const yields = children(props[0].node, props[0].ns, 'BC_10YEAR', DATA);
    if (dates.length !== 1) return { reason: 'invalid_body' };
    const rawDate = literal(dates[0]);
    if (!rawDate || !/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(rawDate) || !validDate(rawDate.slice(0, 10))) return { reason: 'invalid_body' };
    const value_percent = yields.length === 1 ? literal(yields[0]) : null;
    rows.push({ event_date: rawDate.slice(0, 10), value_percent, value_bp: percentToBp(value_percent) });
  }
  return { rows };
}

/** Reads exact official evidence only. The caller atomically freezes the first
 * successful resolution; Treasury can revise historical rows, so this is NOT
 * an immutable first-release oracle. Reference helpers never produce outcomes. */
async function resolveOfficial(rule, options = {}) {
  const validated = validateOfficialRule(rule);
  const deps = dependencies(options);
  const observation = Date.parse(validated.observation_at);
  const ready = observation + (validated.provider === 'awc_metar' ? 5000 : 0);
  if (deps.clock() < ready) return { status: 'pending', reason: 'observation_not_ready' };
  const weather = validated.provider === 'awc_metar';
  const url = weather ? weatherUrl(validated.observation_at) : treasuryUrl(validated.event_date.slice(0, 7).replace('-', ''));
  const data = await request(url, deps, weather ? parseWeather : parseTreasury);
  const retrievedAt = deps.clock();
  if (retrievedAt < ready) return { status: 'pending', reason: 'observation_not_ready' };
  let reason = data.reason;
  let row;
  if (!reason) {
    const exact = data.rows.filter(item => weather
      ? item && item.icaoId === 'RKSI' && item.obsTime === observation / 1000
      : item.event_date === validated.event_date);
    if (exact.length !== 1) reason = exact.length ? 'ambiguous_data' : 'missing_data';
    else {
      row = exact[0];
      if (weather ? !validWeather(row) : row.value_bp === null) reason = 'invalid_value';
    }
  }
  if (reason) return { status: retrievedAt >= observation + DAY ? 'Cancelled' : 'pending', reason };
  return {
    status: (weather ? row.temp > validated.threshold : row.value_bp > validated.threshold_bp) ? 'Yes' : 'No',
    evidence: weather ? {
      provider: validated.provider, station: validated.station, requested_observation_at: validated.observation_at,
      obsTime: row.obsTime, temp: row.temp, source_url: url, retrieved_at: new Date(retrievedAt).toISOString()
    } : {
      provider: validated.provider, series: validated.series, event_date: validated.event_date,
      value_percent: row.value_percent, value_bp: row.value_bp, source_url: url, retrieved_at: new Date(retrievedAt).toISOString()
    }
  };
}

async function fetchWeatherReference(options = {}) {
  const deps = dependencies(options);
  const url = weatherUrl();
  const data = await request(url, deps, parseWeather);
  const retrievedAt = deps.clock();
  if (data.reason) return { status: 'pending', reason: data.reason };
  const rows = data.rows.filter(row => validWeather(row) && row.obsTime * 1000 <= retrievedAt && retrievedAt - row.obsTime * 1000 <= 2 * 60 * 60 * 1000);
  rows.sort((a, b) => b.obsTime - a.obsTime);
  if (!rows.length) return { status: 'pending', reason: 'missing_data' };
  const row = rows[0];
  if (data.rows.filter(item => item && item.icaoId === 'RKSI' && item.obsTime === row.obsTime).length !== 1) return { status: 'pending', reason: 'ambiguous_data' };
  return { reference: { observed_at: new Date(row.obsTime * 1000).toISOString(), temp: row.temp, source_url: url, retrieved_at: new Date(retrievedAt).toISOString() } };
}

async function fetchTreasuryReference(options = {}) {
  const deps = dependencies(options);
  const started = new Date(deps.clock());
  const month = started.toISOString().slice(0, 7).replace('-', '');
  const previous = new Date(started);
  previous.setUTCDate(1);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const months = [month, previous.toISOString().slice(0, 7).replace('-', '')];
  let reason = 'missing_data';
  for (const target of months) {
    const url = treasuryUrl(target);
    const data = await request(url, deps, parseTreasury);
    const retrievedAt = deps.clock();
    const today = new Date(retrievedAt).toISOString().slice(0, 10);
    const todayStart = Date.parse(today + 'T00:00:00.000Z');
    if (data.reason) {
      reason = data.reason;
      if (reason !== 'missing_data') return { status: 'pending', reason };
      continue;
    }
    const rows = data.rows.filter(row => row.value_bp !== null && row.event_date <= today && todayStart - Date.parse(row.event_date + 'T00:00:00.000Z') <= 7 * DAY);
    rows.sort((a, b) => b.event_date.localeCompare(a.event_date));
    if (!rows.length) continue;
    const row = rows[0];
    if (data.rows.filter(item => item.event_date === row.event_date).length !== 1) return { status: 'pending', reason: 'ambiguous_data' };
    return { reference: { date: row.event_date, value_bp: row.value_bp, value_percent: row.value_percent, source_url: url, retrieved_at: new Date(retrievedAt).toISOString() } };
  }
  return { status: 'pending', reason };
}

module.exports = { resolveOfficial, fetchWeatherReference, fetchTreasuryReference };
