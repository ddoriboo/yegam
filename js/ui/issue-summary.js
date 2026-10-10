(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.IssueSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    function timeValue(value) {
        if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
        return Date.parse(value);
    }
    function formatKst(value) {
        const timestamp = timeValue(value);
        if (!Number.isFinite(timestamp)) return '시각 확인 필요';
        const parts = new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(new Date(timestamp));
        const get = type => parts.find(part => part.type === type).value;
        return get('year') + '.' + get('month') + '.' + get('day') + ' ' + get('hour') + ':' + get('minute');
    }
    function buildIssueSummary(issue) {
        if (!issue || typeof issue !== 'object') return null;
        let rule = issue.resolution_params;
        if (typeof rule === 'string') {
            try { rule = JSON.parse(rule); } catch (_) { return null; }
        }
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return null;
        if (rule.operator !== 'gt' || rule.missing_data_policy !== 'cancel_after_24h' ||
            typeof rule.threshold !== 'number' || !Number.isFinite(rule.threshold)) return null;
        const observation = timeValue(rule.observation_at);
        const end = timeValue(issue.end_date);
        const betting = timeValue(issue.betting_end_date);
        if (!Number.isFinite(observation) || observation !== end || !Number.isFinite(betting) || betting >= observation) return null;
        let unit, source, measurement, sourceUrl;
        if (rule.version === 1 && rule.provider === 'upbit' && rule.metric === 'minute_close' && /^KRW-[A-Z0-9]+$/.test(rule.market) && rule.threshold > 0) {
            unit = '원'; source = '업비트 ' + rule.market;
            measurement = '판정 시각 직전 1분봉의 종가로 비교합니다. 잠깐 넘는 것만으로는 YES가 아닙니다.';
            sourceUrl = ''; 
        } else if (rule.version === 2 && rule.provider === 'awc_metar' && rule.station === 'RKSI' && rule.metric === 'temperature_c') {
            unit = '°C'; source = '인천공항(RKSI) · NOAA AWC';
            measurement = '지정한 시각의 인천공항 공식 관측 기온으로 비교합니다. 체감온도나 다른 지역 기온은 사용하지 않습니다.';
            sourceUrl = 'https://aviationweather.gov/data/api/';
        } else return null;
        const number = rule.threshold.toLocaleString('ko-KR', { maximumFractionDigits: 20 });
        const target = number + unit;
        let reference = '';
        if (rule.provider === 'upbit' && typeof issue.description === 'string') {
            const match = issue.description.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) KST 업비트 공식 체결가 ([\d,]+(?:\.\d+)?)원, 전일 종가 대비 ([+-]?\d+(?:\.\d+)?)%/);
            if (match) reference = '게시 당시 참고 시세: ' + match[2] + '원 (전일 대비 ' + (Number(match[3]) > 0 && !/^[+-]/.test(match[3]) ? '+' : '') + match[3] + '%) · ' + match[1].slice(5, 16) + ' KST. 현재 시세나 결과가 아닙니다.';
        }
        return {
            target, yes: target + ' 초과', no: target + ' 이하 (동률 포함)', source, sourceUrl, measurement,
            bettingAt: formatKst(issue.betting_end_date), observationAt: formatKst(rule.observation_at),
            reference, notice: '공식 자료가 없으면 보류합니다. 결과 확인은 자료 조회·서버 상황에 따라 늦어질 수 있습니다.',
            assetNotice: '50%는 참여 전 시작값이며 실제 확률이 아닙니다. GAM은 환전·현금화할 수 없습니다.'
        };
    }
    return { buildIssueSummary, formatKst };
});
