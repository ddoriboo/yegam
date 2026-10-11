'use strict';
const { PERSONAS, POLICY } = require('./officialPanelPolicy');
const contexts = new WeakMap();
const providers = require('./resolutionProviders');
function fail(code, status, message) {
    const { BetPlacementError } = require('./placeBet');
    throw new BetPlacementError(code, status, message);
}
// Read-only capability lookup. Only placePanelBet holds or creates a token.
function getInternalContext(token) { return token && typeof token === 'object' ? contexts.get(token) : undefined; }
function validateSources(urls, issueId, status) {
    if (!Array.isArray(urls) || urls.length < 1 || urls.length > 8) fail('INVALID_SOURCES',400,'공식 근거 URL이 필요합니다.');
    for (const raw of urls) {
        if (typeof raw !== 'string' || raw.length > 2048 || raw !== raw.trim() || /[\s\\]/.test(raw)) fail('INVALID_SOURCES',400,'잘못된 근거 URL입니다.');
        let u; try { u = new URL(raw); } catch { fail('INVALID_SOURCES',400,'잘못된 근거 URL입니다.'); }
        if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) fail('INVALID_SOURCES',400,'HTTPS 공식 출처만 허용합니다.');
        let allowed = false, keys = [];
        if (u.hostname === 'api.upbit.com' && ['/v1/ticker','/v1/candles/minutes/1'].includes(u.pathname)) {
            allowed = true; keys = u.pathname.endsWith('ticker') ? ['markets'] : ['market','to','count'];
        } else if (u.hostname === 'aviationweather.gov' && u.pathname === '/api/data/metar') {
            allowed = true; keys = ['ids','format','hours','date'];
        } else if (u.hostname === 'home.treasury.gov' && u.pathname === '/resource-center/data-chart-center/interest-rates/pages/xml'
            && status.providers?.some(p => p.provider === 'us_treasury' && p.enabled === true)) {
            allowed = true; keys = ['data','field_tdr_date_value_month'];
        } else if (raw === `https://yegam.ai.kr/issue.html?id=${issueId}`) { allowed = true; keys = ['id']; }
        if (!allowed || [...u.searchParams.keys()].some(k => !keys.includes(k)) || [...u.searchParams.values()].some(v => /[\s<>@]/.test(v))) fail('INVALID_SOURCES',400,'허용된 공식 자료 URL만 사용하세요.');
        if ([...u.searchParams.keys()].some(k => u.searchParams.getAll(k).length !== 1)) fail('INVALID_SOURCES',400,'중복 URL 매개변수입니다.');
    }
    return [...urls];
}
async function placePanelBet({personaKey,issueId,choice,amount,rationale,evidenceAt,sourceUrls,expectedResolutionKey}, deps = {}) {
    if (!PERSONAS.some(p => p.key === personaKey)) fail('INVALID_PERSONA',400,'고정 패널 역할이 아닙니다.');
    if (!Number.isSafeInteger(issueId) || issueId <= 0) fail('INVALID_ISSUE',400,'잘못된 이슈 ID입니다.');
    const normalized = typeof choice === 'string' ? choice.trim().toLowerCase() : '';
    if (!['yes','no'].includes(normalized)) fail('INVALID_CHOICE',400,'Yes/No 선택이 필요합니다.');
    const canonicalChoice = normalized === 'yes' ? 'Yes' : 'No';
    // Amount comparison also participates in retry conflict handling under lock.
    if (!Number.isSafeInteger(amount) || amount <= 0) fail('INVALID_AMOUNT',400,'100 GAM 고정 베팅입니다.');
    if (typeof rationale !== 'string' || rationale.trim().length < 30 || rationale.length > 1000) fail('INVALID_RATIONALE',400,'근거는 30~1000자여야 합니다.');
    if (typeof evidenceAt !== 'string' || !Number.isFinite(Date.parse(evidenceAt)) || new Date(evidenceAt).toISOString() !== evidenceAt) fail('INVALID_EVIDENCE_TIME',400,'근거 시각은 canonical UTC ISO여야 합니다.');
    if (typeof expectedResolutionKey !== 'string' || !expectedResolutionKey || expectedResolutionKey.length > 200) fail('INVALID_RESOLUTION_KEY',400,'판정 키가 필요합니다.');
    if (!Array.isArray(sourceUrls) || sourceUrls.some(u => typeof u !== 'string')) fail('INVALID_SOURCES',400,'공식 근거 URL이 필요합니다.');
    sourceUrls = [...sourceUrls];
    const automatic = deps.automaticSettlement || require('./automaticSettlement');
    const token = Object.freeze({});
    let kstDay;
    contexts.set(token, {
        personaKey,
        async beforeBet({client, issue, user}) {
            if (user.ai_panel_role !== personaKey) fail('PANEL_IDENTITY_MISMATCH',403,'패널 역할 불일치입니다.');
            const schema = await client.query("SELECT to_regclass('official_panel_bet_audits') IS NOT NULL AS ready");
            if (!schema.rows[0]?.ready) fail('SCHEMA_NOT_READY',503,'패널 스키마 준비 전입니다.');
            const existing = await client.query('SELECT * FROM bets WHERE user_id = $1 AND issue_id = $2',[user.id,issueId]);
            if (existing.rows.length) {
                const bet = existing.rows[0];
                const audit = (await client.query('SELECT * FROM official_panel_bet_audits WHERE bet_id = $1',[bet.id])).rows[0];
                // Never change provenance on retry; no provider/recency/cutoff gate for a committed identical request.
                if (!audit || bet.choice !== canonicalChoice || bet.amount !== amount || audit.persona_key !== personaKey
                    || audit.resolution_key !== expectedResolutionKey || audit.rationale !== rationale
                    || new Date(audit.evidence_at).toISOString() !== evidenceAt || JSON.stringify(audit.source_urls) !== JSON.stringify(sourceUrls)) {
                    fail('PANEL_RETRY_CONFLICT',409,'기존 베팅과 요청 내용이 다릅니다.');
                }
                return bet;
            }
            if (amount !== POLICY.betAmount) fail('INVALID_AMOUNT',400,'100 GAM 고정 베팅입니다.');
            const status = await automatic.getStatus();
            if (status.initialized !== true) fail('SCHEMA_NOT_READY',503,'자동 판정 스키마 준비 전입니다.');
            let rule;
            try { rule = providers.validateRule(issue.resolution_params, {end_date:issue.end_date,betting_end_date:issue.betting_end_date}); }
            catch { fail('INVALID_RESOLUTION_RULE',400,'유효한 구조화 공식 판정 규칙이 필요합니다.'); }
            if (providers.ruleKey(rule) !== expectedResolutionKey || issue.resolution_key !== expectedResolutionKey) fail('STALE_RESOLUTION_KEY',409,'판정 규칙이 변경되었습니다.');
            try {
                providers.publicCriteria(rule, issue);
                const definition = providers.DEFINITIONS.find(p => p.provider === rule.provider && p.version === rule.version);
                if (!definition || issue.category !== definition.category) throw new TypeError('Provider category mismatch');
            } catch { fail('INVALID_PUBLIC_CRITERIA',400,'공개 제목·설명·분류와 공식 판정 규칙이 일치해야 합니다.'); }
            if (!status.providers?.some(p => p.provider === rule.provider && p.version === rule.version && p.enabled === true)) fail('PROVIDER_DISABLED',409,'현재 활성화된 공식 판정 제공자가 아닙니다.');
            if (issue.status !== 'active' || issue.result != null) fail('BETTING_CLOSED',400,'베팅이 마감되었습니다.');
            validateSources(sourceUrls, issueId, status);
            // One DB wall-clock captured AFTER both locks. Explicit timezone, never session NOW()/timezone.
            const timing = (await client.query(`WITH t AS (SELECT clock_timestamp() AS now)
                SELECT (t.now AT TIME ZONE 'Asia/Seoul')::date::text AS kst_day,
                i.betting_end_date >= t.now + ($2::double precision * INTERVAL '1 millisecond') AS enough_time,
                $3::timestamptz >= t.now - INTERVAL '10 minutes' AND $3::timestamptz <= t.now + INTERVAL '30 seconds' AS fresh
                FROM issues i CROSS JOIN t WHERE i.id=$1`,[issueId,POLICY.minBettingTimeMs,evidenceAt])).rows[0];
            if (!timing?.enough_time) fail('BETTING_CLOSED',400,'베팅 마감까지 최소 3분이 필요합니다.');
            if (!timing.fresh) fail('STALE_EVIDENCE',400,'근거는 10분 이내이며 미래 시각이 아니어야 합니다.');
            kstDay = timing.kst_day;
            const bets = (await client.query(`SELECT b.*, a.bet_id AS audited_id, a.kst_day::text AS kst_day,
                a.amount AS audited_amount, a.choice AS audited_choice, a.persona_key AS audited_persona
                FROM bets b LEFT JOIN official_panel_bet_audits a ON a.bet_id=b.id WHERE b.user_id=$1`,[user.id])).rows;
            if (bets.some(b => b.audited_id == null || b.amount !== b.audited_amount || b.choice !== b.audited_choice || b.audited_persona !== personaKey)) fail('PANEL_ACCOUNT_UNSAFE',409,'미감사 패널 베팅이 있습니다.');
            const ledger = (await client.query('SELECT type, category, amount, reference_id FROM gam_transactions WHERE user_id=$1',[user.id])).rows;
            const initial = ledger.filter(l => l.category === 'ai_panel_initial');
            if (initial.length !== 1 || initial[0].type !== 'earn' || Number(initial[0].amount) !== POLICY.initialGam
                || initial[0].reference_id !== 'ai-panel-initial:' + personaKey
                || ledger.some(l => !['ai_panel_initial','bet','issue_settlement'].includes(l.category)
                    || !Number.isSafeInteger(Number(l.amount)) || Number(l.amount) < 0
                    || (l.category === 'bet' && l.type !== 'burn') || (l.category === 'issue_settlement' && l.type !== 'earn'))) fail('PANEL_ACCOUNT_UNSAFE',409,'허용되지 않은 패널 GAM 거래입니다.');
            const gross = bets.reduce((sum,b) => sum + BigInt(b.amount),0n);
            const returns = ledger.filter(l => l.category === 'issue_settlement').reduce((sum,l) => sum + BigInt(l.amount),0n);
            const debits = ledger.filter(l => l.category === 'bet');
            if (debits.length !== bets.length || bets.some(b => debits.filter(l => l.reference_id === 'bet:'+b.id && Number(l.amount) === b.amount).length !== 1)
                || BigInt(user.gam_balance) !== BigInt(POLICY.initialGam) - gross + returns) fail('PANEL_ACCOUNT_UNSAFE',409,'패널 GAM 잔액·원장 불일치입니다.');
            const daily = bets.filter(b => b.kst_day === kstDay).reduce((sum,b) => sum + BigInt(b.amount),0n);
            if (daily + BigInt(amount) > BigInt(POLICY.dailyLimit)) fail('PANEL_DAILY_LIMIT',409,'한국 날짜 기준 일일 200 GAM 한도입니다.');
        },
        async writeAudit({client,bet,userId}) {
            // Ledger checks can cross KST midnight. Capture one final DB instant while
            // the user lock is still held, and persist BOTH its day and full timestamp.
            const auditClock = (await client.query(`WITH audit_clock AS (SELECT clock_timestamp() AS now)
                SELECT (now AT TIME ZONE 'Asia/Seoul')::date::text AS kst_day,
                    now::text AS audit_created_at FROM audit_clock`)).rows[0];
            if (!auditClock?.kst_day || !auditClock.audit_created_at) fail('AUDIT_CLOCK_UNAVAILABLE',503,'감사 시각을 확인하지 못했습니다.');
            if (auditClock.kst_day !== kstDay) {
                const prior = (await client.query(`SELECT COALESCE(SUM(amount),0)::text AS daily_staked
                    FROM official_panel_bet_audits WHERE user_id=$1 AND kst_day=$2::date AND bet_id<>$3`,
                    [userId,auditClock.kst_day,bet.id])).rows[0];
                if (BigInt(prior.daily_staked) + BigInt(amount) > BigInt(POLICY.dailyLimit)) fail('PANEL_DAILY_LIMIT',409,'한국 날짜 기준 일일 200 GAM 한도입니다.');
            }
            kstDay = auditClock.kst_day;
            await client.query(`INSERT INTO official_panel_bet_audits
                (bet_id,persona_key,user_id,issue_id,rationale,evidence_at,source_urls,resolution_key,kst_day,amount,choice,actor_admin_id,created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::date,$10,$11,$12,$13::timestamptz)`,
                [bet.id,personaKey,userId,issueId,rationale,evidenceAt,JSON.stringify(sourceUrls),expectedResolutionKey,kstDay,amount,canonicalChoice,deps.actorAdminId ?? null,auditClock.audit_created_at]);
        }
    });
    try { return await require('./placeBet').placeBet({issueId,choice:canonicalChoice,amount},{getClient:deps.getClient,panelContext:token}); }
    finally { contexts.delete(token); }
}
module.exports = {placePanelBet,getInternalContext};
