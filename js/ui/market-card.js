(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else {
        root.MarketCard = api;
        root.setInterval(() => api.updateClosingTime(root.document), 1000);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function time(value) {
        return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
    }
    function cutoff(issue) {
        return time(issue.betting_end_date ?? issue.bettingEndDate ?? issue.end_date ?? issue.endDate);
    }
    function kst(value) {
        const stamp = time(value);
        if (!Number.isFinite(stamp)) return '시각 확인 필요';
        const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(stamp));
        const get = type => parts.find(p => p.type === type).value;
        return get('month') + '/' + get('day') + ' ' + get('hour') + ':' + get('minute');
    }
    function remaining(stamp, now) {
        const diff = stamp - now;
        if (!Number.isFinite(diff)) return '시각 확인 필요';
        if (diff <= 0) return '참여 마감';
        const minutes = Math.ceil(diff / 60000);
        if (minutes < 60) return minutes + '분 남음';
        if (minutes < 1440) return Math.floor(minutes / 60) + '시간' + (minutes % 60 ? ' ' + minutes % 60 + '분' : '') + ' 남음';
        return Math.floor(minutes / 1440) + '일 ' + Math.floor(minutes % 1440 / 60) + '시간 남음';
    }
    function terminal(issue) {
        return ['closed', 'resolved', 'cancelled', 'deleted'].includes(String(issue.status).toLowerCase()) || issue.result != null;
    }
    function compareClosing(a, b, now = Date.now()) {
        const activeA = !terminal(a) && cutoff(a) > now;
        const activeB = !terminal(b) && cutoff(b) > now;
        if (activeA !== activeB) return activeA ? -1 : 1;
        return (Number.isFinite(cutoff(a)) ? cutoff(a) : Infinity) - (Number.isFinite(cutoff(b)) ? cutoff(b) : Infinity) || Number(a.id) - Number(b.id);
    }
    function selectEndingSoon(issues, limit = 4, now = Date.now()) {
        return issues.filter(issue => issue.status === 'active' && !terminal(issue) && cutoff(issue) > now).slice().sort((a, b) => compareClosing(a, b, now)).slice(0, limit);
    }
    function count(value) {
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 ? number : 0;
    }
    function model(issue, summary = null, now = Date.now()) {
        const id = Number(issue.id);
        const validId = Number.isSafeInteger(id) && id > 0;
        const stamp = cutoff(issue);
        const ended = terminal(issue);
        const open = validId && issue.status === 'active' && Boolean(summary) && Number.isFinite(stamp) && stamp > now && !ended;
        const volume = count(issue.total_volume ?? issue.totalVolume);
        const participants = count(issue.participant_count ?? issue.participantCount);
        const category = typeof issue.category === 'string' ? issue.category : '이슈';
        const symbol = summary?.source?.match(/KRW-([A-Z0-9]+)/)?.[1];
        const weather = summary?.source?.startsWith('인천공항');
        const title = weather ? '인천공항, ' + kst(issue.end_date ?? issue.endDate) + ' 기온이 ' + summary.target + ' 넘을까?' : String(issue.title || '제목 확인 필요');
        return { id, validId, category, symbol, weather, title, summary, open, ended, closingAt: stamp,
            timeLeft: remaining(stamp, now), urgent: open && stamp - now < 3 * 3600000,
            bettingAt: kst(issue.betting_end_date ?? issue.bettingEndDate ?? issue.end_date ?? issue.endDate),
            observationAt: kst(issue.end_date ?? issue.endDate),
            participation: volume > 0 || participants > 0 ? (participants > 0 ? participants.toLocaleString('ko-KR') + '명 참여 · ' : '') + volume.toLocaleString('ko-KR') + ' GAM' : '참여 전 · 초기값 50:50, 실제 확률 아님',
            state: ended ? '종료됨' : !summary ? '판정 규칙 확인 필요' : open ? remaining(stamp, now) : Number.isFinite(stamp) ? '참여 마감 · 결과 대기' : '마감 시각 확인 필요'
        };
    }
    function choice(card, side) {
        const condition = card.summary ? (side === 'Yes' ? card.summary.yes : card.summary.no.replace(' (동률 포함)', '')) : (side === 'Yes' ? '그렇다' : '아니다');
        return '<button type="button" class="market-choice market-choice--' + side.toLowerCase() + '" aria-label="' + escape(side.toUpperCase() + ' · ' + condition) + '" onclick="placeBet(' + card.id + ', \'' + side + '\')"><strong>' + side.toUpperCase() + '</strong><span>' + escape(condition) + '</span></button>';
    }
    function renderCard(issue, summary = null, now = Date.now()) {
        const card = model(issue, summary, now);
        const url = card.validId ? 'issue.html?id=' + card.id : '#';
        const image = issue.image_url ?? issue.imageUrl;
        const safeImage = typeof image === 'string' && /^(?:https?:\/\/|\/[^/])/i.test(image);
        const categoryClass = card.weather ? 'weather' : card.symbol ? 'crypto' : 'general';
        return '<article class="market-card market-card--' + categoryClass + '"' + (card.validId ? ' data-id="' + card.id + '"' : '') + (card.open ? ' data-closing-at="' + card.closingAt + '"' : '') + '>' +
            '<div class="market-card__top"><span class="market-card__topic">' + escape(card.category) + (card.symbol ? ' · ' + escape(card.symbol) : '') + '</span><span class="market-card__state' + (card.urgent ? ' market-card__state--urgent' : '') + '">' + escape(card.state) + '</span></div>' +
            '<div class="market-card__heading"><h3><a href="' + url + '">' + escape(card.title) + '</a></h3>' +
            (safeImage ? '<img src="' + escape(image) + '" alt="" loading="lazy" class="market-card__image">' : '<span class="market-card__badge" aria-hidden="true">' + escape(card.symbol || (card.weather ? '기온' : card.category.slice(0, 2))) + '</span>') + '</div>' +
            '<p class="market-card__context">' + escape(card.summary ? (card.weather ? '정해진 시각의 공식 관측 기온으로 판정' : '정해진 시각 직전 1분봉 종가로 판정') + ' · 동률은 NO' : '판정 조건과 공식 출처는 상세에서 확인하세요.') + '</p>' +
            '<dl class="market-card__times"><div><dt>참여 마감</dt><dd>' + escape(card.bettingAt) + '</dd></div><div><dt>결과 확인 시작</dt><dd>' + escape(card.observationAt) + '</dd></div></dl>' +
            '<div class="market-card__choices">' + (card.open ? choice(card, 'Yes') + choice(card, 'No') : '<span class="market-card__unavailable">' + escape(card.state) + '</span>') + '</div>' +
            '<div class="market-card__footer"><span>' + escape(card.participation) + '</span><a href="' + url + '" aria-label="' + escape(card.title + ' 자세히 보기') + '">자세히 보기</a></div></article>';
    }
    function renderDeadline(issue, summary = null, now = Date.now()) {
        const card = model(issue, summary, now);
        if (!card.open) return '';
        return '<a href="issue.html?id=' + card.id + '" class="deadline-card"><span class="deadline-card__title">' + escape(card.title) + '</span><span class="deadline-card__meta"><strong>' + escape(card.timeLeft) + '</strong><span>참여 마감 ' + escape(card.bettingAt) + ' KST</span></span></a>';
    }
    function updateClosingTime(doc, now = Date.now()) {
        if (!doc) return;
        doc.querySelectorAll('.market-card[data-closing-at]').forEach(element => {
            const stamp = Number(element.getAttribute('data-closing-at'));
            const state = element.querySelector('.market-card__state');
            if (!Number.isFinite(stamp) || !state) return;
            if (stamp <= now) {
                state.textContent = '참여 마감 · 결과 대기';
                state.classList.remove('market-card__state--urgent');
                const choices = element.querySelector('.market-card__choices');
                if (choices) choices.innerHTML = '<span class="market-card__unavailable">참여 마감 · 결과 대기</span>';
                element.removeAttribute('data-closing-at');
            } else {
                state.textContent = remaining(stamp, now);
                state.classList.toggle('market-card__state--urgent', stamp - now < 3 * 3600000);
            }
        });
    }
    return { model, renderCard, renderDeadline, selectEndingSoon, compareClosing, remaining, kst, updateClosingTime };
});
