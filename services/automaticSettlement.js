'use strict';

const { validateResolutionRule } = require('./marketResolutionRule');
const { resolveUpbit } = require('./upbitResolution');
const { ensureSettlementSchema } = require('../database/settlement-schema');

async function notifySettlement(summary, issueTitle, dependencies = {}) {
    if (summary.alreadySettled) return;
    let notifications;
    try { notifications = dependencies.notifications || require('./notificationService'); }
    catch (_) { console.warn('Settlement committed; notification module unavailable', {issueId:summary.issueId}); return; }
    for (const credit of summary.credits) {
        const type = credit.kind === 'refund'
            ? (summary.result === 'Cancelled' ? 'betting_cancelled' : 'betting_draw')
            : (credit.kind === 'win' ? 'betting_win' : 'betting_loss');
        try {
            await notifications.createNotification({
                userId: credit.userId,
                type,
                title: '이슈 정산 완료',
                message: `"${issueTitle}" 결과: ${summary.result}. 선택: ${credit.choice}. 베팅 ${credit.stake} GAM, 지급 ${credit.amount} GAM.`,
                relatedId: summary.issueId,
                relatedType: 'issue'
            });
        } catch (_) {
            // Notification failure cannot roll back or repeat a committed payout.
            console.warn(`Settlement notification failed for issue ${summary.issueId}, bet ${credit.betId}`);
        }
    }
}

class AutomaticSettlement {
    constructor(dependencies = {}) {
        this.dependencies = dependencies;
        this.query = dependencies.query || ((...args) => require('../database/postgres').query(...args));
        this.resolve = dependencies.resolve || resolveUpbit;
        this.settle = dependencies.settle || ((...args) => require('./settlement').settleIssue(...args));
        this.enabled = dependencies.enabled || (() => process.env.AUTO_RESOLVE_UPBIT === 'true');
        this.initialized = false;
        this.running = false;
        this.timer = null;
        this.lastRun = null;
    }

    async initialize() {
        await (this.dependencies.ensureSchema || ensureSettlementSchema)();
        this.initialized = true;
    }

    getStatus() {
        return {
            version: 'upbit-atomic-v1', initialized: this.initialized,
            enabled: Boolean(this.enabled()), running: this.running,
            intervalSeconds: 60, lastRun: this.lastRun
        };
    }

    async run({ dryRun = false } = {}) {
        if (!this.initialized) return { skipped: true, reason: 'SCHEMA_NOT_READY', ...this.getStatus() };
        if (!dryRun && !this.enabled()) return { skipped: true, reason: 'AUTO_RESOLUTION_DISABLED', ...this.getStatus() };
        if (this.running) return { skipped: true, reason: 'ALREADY_RUNNING' };
        this.running = true;
        const report = { startedAt: new Date().toISOString(), dryRun, settled: [], pending: [], failed: [] };
        try {
            const due = await this.query(`
                SELECT * FROM issues
                WHERE resolution_params IS NOT NULL AND result IS NULL
                  AND status IN ('active','closed','pending')
                  AND end_date <= clock_timestamp() - INTERVAL '5 seconds'
                ORDER BY end_date, id LIMIT 50
            `);
            for (const issue of due.rows) {
                try {
                    const rule = validateResolutionRule(issue.resolution_params, issue);
                    const decision = await this.resolve(rule);
                    if (decision.status === 'pending') {
                        report.pending.push({ id: issue.id, reason: decision.reason });
                        if (!dryRun) await this.query(
                            'UPDATE issues SET resolution_attempted_at=NOW(),resolution_last_error=$1 WHERE id=$2 AND result IS NULL',
                            [String(decision.reason || 'CANDLE_NOT_AVAILABLE').slice(0, 500), issue.id]
                        );
                        if (decision.reason === 'rate_limited') break;
                        continue;
                    }
                    if (!['Yes','No','Cancelled'].includes(decision.status)) throw Object.assign(new Error('Invalid oracle outcome'), { code: 'INVALID_ORACLE_RESULT' });
                    const reason = decision.status === 'Cancelled'
                        ? `업비트 고정 1분봉 자료를 기준 시각 이후 24시간 내 확인하지 못해 취소합니다. ${decision.reason || ''}`
                        : `업비트 ${rule.market} ${decision.evidence.candle_open_at} 1분봉 종가 ${decision.evidence.close}원, 기준 ${rule.threshold}원 초과 여부: ${decision.status}.`;
                    if (dryRun) {
                        report.settled.push({ id: issue.id, proposedResult: decision.status, evidence: decision.evidence || null });
                        continue;
                    }
                    const summary = await this.settle(issue.id, {
                        result: decision.status, reason, decidedBy: null, source: 'upbit', expectedRule: rule,
                        evidence: { rule, ...(decision.evidence || {}), missingDataReason: decision.reason || null }
                    });
                    await notifySettlement(summary, issue.title, this.dependencies);
                    report.settled.push({ id: issue.id, result: summary.result, alreadySettled: summary.alreadySettled, totalStaked: summary.totalStaked, totalPaid: summary.totalPaid });
                    await this.query('UPDATE issues SET resolution_attempted_at=NOW(),resolution_last_error=NULL WHERE id=$1', [issue.id]);
                } catch (error) {
                    const code = String(error.code || 'RESOLUTION_FAILED').slice(0, 100);
                    report.failed.push({ id: issue.id, code });
                    if (!dryRun) await this.query(
                        'UPDATE issues SET resolution_attempted_at=NOW(),resolution_last_error=$1 WHERE id=$2 AND result IS NULL', [code, issue.id]
                    );
                } finally {
                    // Applies to pending and dry-run cases too; never burst around API limits.
                    if (!this.dependencies.skipRateDelay) await new Promise(resolve => setTimeout(resolve, 250));
                }
            }
        } catch (error) {
            report.failed.push({ code: String(error.code || 'DATABASE_UNAVAILABLE').slice(0, 100) });
        } finally {
            report.finishedAt = new Date().toISOString();
            this.lastRun = report;
            this.running = false;
        }
        return report;
    }

    start() {
        if (this.timer || !this.initialized) return;
        this.timer = setInterval(() => this.run().catch(() => console.warn('Automatic resolution retry pending')), 60000);
        this.timer.unref();
        this.run().catch(() => console.warn('Automatic resolution initial run pending'));
    }

    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

const automaticSettlement = new AutomaticSettlement();
module.exports = automaticSettlement;
module.exports.AutomaticSettlement = AutomaticSettlement;
module.exports.notifySettlement = notifySettlement;
