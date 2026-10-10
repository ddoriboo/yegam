const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cards = require('../js/ui/market-card');
const { buildIssueSummary } = require('../js/ui/issue-summary');
const now = Date.parse('2026-10-10T02:30:00Z');
function issue(overrides = {}) {
    return { id: 160, title: '엑스알피, 10/10 오후 6시 1,930원 넘을까?', description: '기존 원문 그대로', status: 'active', result: null, category: '코인', total_volume: '0', participant_count: '0', yes_price: 50, betting_end_date: '2026-10-10T03:00:00.000Z', end_date: '2026-10-10T09:00:00.000Z', resolution_params: { version: 1, provider: 'upbit', metric: 'minute_close', market: 'KRW-XRP', threshold: 1930, operator: 'gt', observation_at: '2026-10-10T09:00:00.000Z', missing_data_policy: 'cancel_after_24h' }, ...overrides };
}
function render(value = issue(), at = now) { return cards.renderCard(value, buildIssueSummary(value), at); }
test('card uses validated strict YES/NO conditions, not a generic price probability', () => {
    const html = render();
    assert.match(html, /1,930원 초과/); assert.match(html, /1,930원 이하/); assert.match(html, /동률은 NO/);
    assert.match(html, /참여 전 · 초기값 50:50, 실제 확률 아님/); assert.doesNotMatch(html, /50%|Vol\./);
    assert.match(html, /placeBet\(160, 'Yes'\)/); assert.match(html, /placeBet\(160, 'No'\)/);
});
test('card separates KST betting deadline from observation', () => {
    const value = cards.model(issue(), buildIssueSummary(issue()), now);
    assert.equal(value.bettingAt, '10/10 12:00'); assert.equal(value.observationAt, '10/10 18:00'); assert.equal(value.timeLeft, '30분 남음');
});
test('betting deadline disables action before observation time', () => {
    const html = render(issue(), Date.parse('2026-10-10T03:00:00Z'));
    assert.match(html, /참여 마감 · 결과 대기/); assert.doesNotMatch(html, /onclick="placeBet/);
});
for (const status of ['closed', 'resolved', 'cancelled', 'deleted']) {
    test('terminal state ' + status + ' never exposes an action', () => { assert.doesNotMatch(render(issue({status})), /onclick="placeBet/); });
}
test('record with a final result never exposes action', () => { assert.doesNotMatch(render(issue({result: 'Yes'})), /onclick="placeBet/); });
test('unsupported/missing rule is clearly marked without inviting new bets', () => {
    const html = render(issue({resolution_params: null, total_volume: '3600', participant_count: '2'}));
    assert.match(html, /판정 규칙 확인 필요/); assert.match(html, /2명 참여 · 3,600 GAM/); assert.doesNotMatch(html, /onclick="placeBet/);
});
test('unknown rule semantics do not fabricate outcomes', () => {
    const value = issue(); value.resolution_params.operator = 'gte';
    const html = render(value); assert.match(html, /판정 규칙 확인 필요/); assert.doesNotMatch(html, /1,930원 초과/);
});
test('stored initial price is not presented as actual opinion with real participation', () => {
    const html = render(issue({total_volume: '1000', participant_count: '3', yes_price: 80}));
    assert.match(html, /3명 참여 · 1,000 GAM/); assert.doesNotMatch(html, /80%|초기값|Vol\./);
});
test('signed/invalid ids cannot reach an inline action', () => { assert.doesNotMatch(render(issue({id: '1);alert(1)'})), /onclick="placeBet/); });
test('escapes title/category/image URL before HTML output', () => {
    const html = render(issue({title: '<img onerror="alert(1)">', category: '<script>', image_url: 'javascript:alert(1)'}));
    assert.match(html, /&lt;img/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /src="javascript:|<img onerror/);
});
test('safe images are optional and escaped', () => {
    assert.match(render(issue({image_url: 'https://example.com/a" onerror="x'})), /a&quot; onerror=&quot;x/);
});
test('weather title is readable without altering the saved technical title', () => {
    const value = issue({category: '날씨', title: '인천공항(RKSI) 2026-10-10 18:00 KST 기온이 22°C를 초과할까?', resolution_params: {version: 2, provider: 'awc_metar', station: 'RKSI', metric: 'temperature_c', threshold: 22, operator: 'gt', observation_at: '2026-10-10T09:00:00.000Z', missing_data_policy: 'cancel_after_24h'}});
    const before = JSON.stringify(value); const html = render(value);
    assert.match(html, /인천공항, 10\/10 18:00 기온이 22°C 넘을까/); assert.match(html, /22°C 이하/); assert.equal(JSON.stringify(value), before);
});
test('missing/ambiguous deadline fails closed', () => { assert.doesNotMatch(render(issue({betting_end_date: '2026-10-10 12:00:00'})), /onclick="placeBet/); });
test('sort and ending section use betting deadline, not result timestamp', () => {
    const earlierResult = issue({id: 1, betting_end_date: '2026-10-10T04:00:00Z', end_date: '2026-10-10T06:00:00Z'});
    const earlierBetting = issue({id: 2, betting_end_date: '2026-10-10T03:00:00Z', end_date: '2026-10-10T09:00:00Z'});
    assert.deepEqual(cards.selectEndingSoon([earlierResult, earlierBetting], 4, now).map(i => i.id), [2, 1]);
});
test('ending section excludes closed, expired, invalid dates and result states without mutating input', () => {
    const list = [issue(), issue({id: 2, status: 'closed'}), issue({id: 3, betting_end_date: '2026-10-10T01:00:00Z'}), issue({id: 4, result: 'No'}), issue({id: 5, betting_end_date: 'not-a-date'})];
    const before = JSON.stringify(list); assert.deepEqual(cards.selectEndingSoon(list, 4, now).map(i => i.id), [160]); assert.equal(JSON.stringify(list), before);
});
test('ending comparator puts still-open deadlines before expired ones', () => {
    assert.equal(cards.compareClosing(issue(), issue({betting_end_date: '2026-10-10T01:00:00Z'}), now), -1);
});
test('deadline row uses validated summary, actual deadline and no false market metrics', () => {
    const value = issue(); const html = cards.renderDeadline(value, buildIssueSummary(value), now);
    assert.match(html, /참여 마감 10\/10 12:00 KST/); assert.doesNotMatch(html, /50%|Vol\./);
    assert.equal(cards.renderDeadline(value, null, now), '');
});
test('countdown handles minute, hour, day and exact boundary', () => {
    assert.equal(cards.remaining(now + 1, now), '1분 남음'); assert.equal(cards.remaining(now + 61 * 60000, now), '1시간 1분 남음');
    assert.equal(cards.remaining(now + 25 * 3600000, now), '1일 1시간 남음'); assert.equal(cards.remaining(now, now), '참여 마감');
});
test('all stored issue fields survive rendering unchanged', () => {
    const value = issue(); const before = JSON.stringify(value); Object.freeze(value.resolution_params); Object.freeze(value);
    render(value); cards.renderDeadline(value, buildIssueSummary(value), now); assert.equal(JSON.stringify(value), before);
});
test('both listing entrypoints load summary/card helpers before app and use scoped styles', () => {
    for (const file of ['index.html', 'issues.html']) {
        const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        assert.ok(html.indexOf('js/ui/issue-summary.js') < html.indexOf('js/ui/market-card.js'));
        assert.ok(html.indexOf('js/ui/market-card.js') < html.indexOf('src="js/app.js'));
        assert.match(html, /css\/market-cards\.css/);
    }
    const home = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(home, /id="search-input" type="search"/); assert.match(home, /selectEndingSoon\(data\.issues\.filter/);
    assert.doesNotMatch(home, /sortBy=deadline/);
});

test('participant records with zero volume are not called participation-free', () => {
    const html = render(issue({participant_count: '2', total_volume: '0'}));
    assert.match(html, /2명 참여 · 0 GAM/); assert.doesNotMatch(html, /참여 전/);
});
test('non-active status never offers an action', () => { assert.doesNotMatch(render(issue({status: 'paused'})), /onclick="placeBet/); });
test('live clock removes actions at the exact betting deadline without API or financial writes', () => {
    const state = {textContent: '', classList: {remove() {}, toggle() {}}};
    const choices = {innerHTML: '<button onclick="placeBet(160, \'Yes\')">YES</button>'};
    let removed = false;
    const element = {getAttribute: () => String(now), querySelector: selector => selector === '.market-card__state' ? state : choices, removeAttribute: () => { removed = true; }};
    cards.updateClosingTime({querySelectorAll: () => [element]}, now);
    assert.equal(state.textContent, '참여 마감 · 결과 대기'); assert.equal(removed, true); assert.doesNotMatch(choices.innerHTML, /placeBet/);
});
test('homepage presents selectable question cards before secondary analysis and deadline lists', () => {
    const home = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(home.indexOf('id="all-issues-section"') < home.indexOf('id="featured-section"'));
});
