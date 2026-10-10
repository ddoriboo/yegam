'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildIssueSummary, formatKst } = require('../js/ui/issue-summary');
const html = fs.readFileSync(path.join(__dirname, '..', 'issue.html'), 'utf8');
function issue(overrides = {}, ruleOverrides = {}) {
    return { description: '2026-10-09 18:08:43 KST 업비트 공식 체결가 1,917원, 전일 종가 대비 1.05%입니다.\n\n운영 식별자: YEGAM-XRP-20261010-1800-KRW-v1',
        end_date: '2026-10-10T09:00:00.000Z', betting_end_date: '2026-10-10T03:00:00.000Z',
        resolution_params: { version: 1, provider: 'upbit', market: 'KRW-XRP', metric: 'minute_close', operator: 'gt', threshold: 1930,
            observation_at: '2026-10-10T09:00:00.000Z', missing_data_policy: 'cancel_after_24h', ...ruleOverrides }, ...overrides };
}
test('XRP summary strictly above vs equal or below with distinct Korean times', () => {
    const value = buildIssueSummary(issue());
    assert.equal(value.yes, '1,930원 초과'); assert.equal(value.no, '1,930원 이하 (동률 포함)');
    assert.equal(value.bettingAt, '2026.10.10 12:00'); assert.equal(value.observationAt, '2026.10.10 18:00');
    assert.match(value.measurement, /1분봉의 종가/); assert.match(value.reference, /1,917원/); assert.match(value.reference, /현재 시세나 결과가 아닙니다/);
});
test('weather uses exact RKSI Celsius observation', () => {
    const value = buildIssueSummary(issue({}, { version: 2, provider: 'awc_metar', station: 'RKSI', metric: 'temperature_c', threshold: 22 }));
    assert.equal(value.yes, '22°C 초과'); assert.equal(value.no, '22°C 이하 (동률 포함)'); assert.match(value.measurement, /공식 관측 기온/); assert.equal(value.reference, '');
});
for (const threshold of [-3, 0, 19]) test('retains weather target ' + threshold, () => {
    assert.equal(buildIssueSummary(issue({}, { version: 2, provider: 'awc_metar', station: 'RKSI', metric: 'temperature_c', threshold })).target, threshold + '°C');
});
test('decimal target is not rounded', () => { assert.equal(buildIssueSummary(issue({}, { threshold: 1930.123456 })).target, '1,930.123456원'); });
test('serialized public JSON rule is handled', () => { const item = issue(); item.resolution_params = JSON.stringify(item.resolution_params); assert.equal(buildIssueSummary(item).yes, '1,930원 초과'); });
for (const [name, item] of [
    ['legacy', issue({ resolution_params: null })], ['malformed JSON', issue({ resolution_params: '{' })],
    ['unknown provider', issue({}, { provider: 'other' })], ['unknown version', issue({}, { version: 42 })],
    ['non-strict comparison', issue({}, { operator: 'gte' })], ['string threshold', issue({}, { threshold: '1930' })],
    ['non-finite threshold', issue({}, { threshold: Infinity })], ['wrong market', issue({}, { market: 'USD-XRP' })],
    ['mismatched observation', issue({ end_date: '2026-10-10T10:00:00.000Z' })],
    ['invalid cutoff', issue({ betting_end_date: 'invalid' })], ['cutoff at result', issue({ betting_end_date: '2026-10-10T09:00:00.000Z' })],
    ['timezone missing', issue({ betting_end_date: '2026-10-10T03:00:00' })],
    ['unknown missing-data policy', issue({}, { missing_data_policy: 'no' })]
]) test('preserves legacy full description for ' + name, () => { assert.equal(buildIssueSummary(item), null); });
test('never mutates frozen source rule dates or description', () => {
    const item = issue(); Object.freeze(item.resolution_params); Object.freeze(item);
    const before = JSON.stringify(item); buildIssueSummary(item); assert.equal(JSON.stringify(item), before);
});
test('explicit KST handles rollover and equivalent offset', () => {
    assert.equal(formatKst('2026-10-10T18:00:00.000Z'), '2026.10.11 03:00');
    assert.equal(formatKst('2026-10-10T12:00:00+09:00'), '2026.10.10 12:00');
    assert.equal(formatKst('invalid'), '시각 확인 필요'); assert.equal(formatKst(null), '시각 확인 필요');
});
test('safe original text retained inside collapsed keyboard-accessible details', () => {
    assert.match(html, /<details id="issue-rule-details"[^>]*>/); assert.doesNotMatch(html, /<details id="issue-rule-details"[^>]*\bopen(?:=|>|\s)/);
    assert.match(html, /<summary[^>]*>판정 상세 보기/);
    const source = html.slice(html.indexOf('function renderIssueDescription('), html.indexOf('// 베팅 마감과 결과 시각을 분리합니다.'));
    assert.match(source, /'issue-rule-original': issue.description \|\| ''/); assert.match(source, /\.textContent = value/); assert.doesNotMatch(source, /innerHTML|fetch\(|resolution_params\s*=/);
});
function countdown(item, now) {
    const nodes = new Map();
    const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, { textContent: '', disabled: false }); return nodes.get(id); } };
    const source = html.slice(html.indexOf('let countdownInterval = null;'), html.indexOf('        // 에러'));
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
    vm.runInNewContext(source + '\nupdateCountdown(issue);', { issue: item, document, window: { IssueSummary: { formatKst, buildIssueSummary } }, Date: Clock, setInterval: () => 1, clearInterval() {} });
    return nodes;
}
test('countdown targets betting cutoff not later outcome', () => {
    const nodes = countdown(issue(), Date.parse('2026-10-10T02:00:00.000Z'));
    assert.equal(nodes.get('countdown-timer').textContent, '1시간 0분 0초'); assert.equal(nodes.get('deadline-date').textContent, '2026.10.10 12:00 KST');
});
test('at exact cutoff waits and disables UI without transaction', () => {
    const nodes = countdown(issue(), Date.parse('2026-10-10T03:00:00.000Z'));
    assert.equal(nodes.get('countdown-timer').textContent, '결과 시각 대기');
    for (const id of ['bet-yes-btn', 'bet-no-btn', 'bet-amount']) assert.equal(nodes.get(id).disabled, true);
});
test('after outcome does not invent result or auto-settle', () => { assert.equal(countdown(issue(), Date.parse('2026-10-10T09:00:00.000Z')).get('countdown-timer').textContent, '공식 결과 확인 대기'); });
for (const signed of ['+1.05', '-1.05', '0.00']) test('reference percentage preserves sign ' + signed, () => {
    const item = issue(); item.description = item.description.replace('1.05%', signed + '%');
    assert.ok(buildIssueSummary(item).reference.includes('전일 대비 ' + signed + '%')); assert.doesNotMatch(buildIssueSummary(item).reference, /\+\+/);
});
test('invalid countdown fails closed without NaN text', () => {
    const nodes = countdown(issue({ betting_end_date: 'invalid' }), Date.parse('2026-10-10T02:00:00Z'));
    assert.equal(nodes.get('countdown-timer').textContent, '시각 확인 필요');
    for (const id of ['bet-yes-btn', 'bet-no-btn', 'bet-amount']) assert.equal(nodes.get(id).disabled, true);
});
test('legacy countdown preserves closed label', () => { assert.equal(countdown(issue({ resolution_params: null }), Date.parse('2026-10-10T09:00:00Z')).get('countdown-timer').textContent, '마감됨'); });
test('hostile original description is retained as text, never evaluated', () => {
    const nodes = new Map();
    const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, { textContent: '', classList: { toggle() {} } }); return nodes.get(id); } };
    const hostile = '<img src=x onerror="globalThis.compromised=true">\n<script>globalThis.compromised=true</script>';
    const item = issue({ description: hostile });
    const source = html.slice(html.indexOf('function renderIssueDescription('), html.indexOf('// 베팅 마감과 결과 시각을 분리합니다.'));
    const context = { document, window: { IssueSummary: { buildIssueSummary } }, issue: item };
    vm.runInNewContext(source + '\nrenderIssueDescription(issue);', context);
    assert.equal(nodes.get('issue-rule-original').textContent, hostile); assert.equal(context.compromised, undefined);
});
