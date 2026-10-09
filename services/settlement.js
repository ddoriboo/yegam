'use strict';

const INT_MAX = 2147483647n;
const BIGINT_MAX = 9223372036854775807n;
function fail(code, message) { const error = new Error(message); error.code = code; return error; }
function integer(value, name, { zero = false, code = 'INVALID_BET' } = {}) {
    if (!((typeof value === 'number' && Number.isSafeInteger(value)) ||
          (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) || typeof value === 'bigint')) {
        throw fail(code, name + ' must be an integer');
    }
    const n = BigInt(value);
    if (n < (zero ? 0n : 1n) || n > INT_MAX) throw fail(code, name + ' is out of INT range');
    return n;
}
function normalizeResult(result) {
    const values = { yes: 'Yes', no: 'No', draw: 'Draw', cancelled: 'Cancelled' };
    if (typeof result !== 'string' || !Object.hasOwn(values, result.toLowerCase())) {
        throw fail('INVALID_RESULT', 'Result must be Yes, No, Draw or Cancelled');
    }
    return values[result.toLowerCase()];
}

/** Pure exact legacy payout math. Monetary totals and credits are decimal strings. */
function calculatePayouts(bets, result, { refundNoWinners = false } = {}) {
    result = normalizeResult(result);
    if (!Array.isArray(bets)) throw fail('INVALID_BET', 'Bets must be an array');
    const seen = new Set();
    const normalized = bets.map(bet => {
        if (!bet || typeof bet !== 'object') throw fail('INVALID_BET', 'Malformed bet');
        const betId = Number(integer(bet.id, 'bet id'));
        const userId = Number(integer(bet.user_id, 'user id'));
        const stake = integer(bet.amount, 'bet amount');
        if (seen.has(betId)) throw fail('INVALID_BET', 'Duplicate bet id');
        seen.add(betId);
        if (typeof bet.choice !== 'string' || !['yes', 'no'].includes(bet.choice.toLowerCase())) {
            throw fail('INVALID_BET', 'Bet choice must be yes or no');
        }
        return { betId, userId, choice: bet.choice.toLowerCase(), stake };
    }).sort((a, b) => a.betId - b.betId);
    const totalStaked = normalized.reduce((sum, bet) => sum + bet.stake, 0n);
    if (totalStaked > BIGINT_MAX) throw fail('INVALID_BET', 'Pool exceeds BIGINT range');
    const winningTotal = normalized.reduce((sum, bet) => sum + (bet.choice === result.toLowerCase() ? bet.stake : 0n), 0n);
    const refund = ['Draw', 'Cancelled'].includes(result) || (refundNoWinners === true && winningTotal === 0n);
    let totalPaid = 0n;
    const credits = normalized.map(bet => {
        const kind = refund ? 'refund' : bet.choice === result.toLowerCase() ? 'win' : 'loss';
        // Retain the 5% edge and per-winner floor. Never redistribute dust.
        const amount = refund ? bet.stake : kind === 'win' ? bet.stake * totalStaked * 95n / (winningTotal * 100n) : 0n;
        totalPaid += amount;
        return { ...bet, stake: Number(bet.stake), kind, amount: amount.toString() };
    });
    return { result, totalStaked: totalStaked.toString(), totalPaid: totalPaid.toString(), winningTotal: winningTotal.toString(), credits };
}
// PostgreSQL JSONB does not preserve object insertion order. Array order remains significant.
function stableJson(value) {
    return JSON.stringify(value, (_key, item) => {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
            return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
        }
        return item;
    });
}
function requireRow(result, code = 'RECONCILIATION_REQUIRED') {
    if (result.rowCount !== 1) throw fail(code, 'Expected exactly one affected row');
}

/** One checked-out PostgreSQL client owns every operation including transaction control. */
async function settleIssue(issueId, { result, reason, decidedBy = null, source = 'manual', evidence = null, refundNoWinners = false, expectedRule, expectedDates }, dependencies = {}) {
    issueId = Number(integer(issueId, 'issue id'));
    result = normalizeResult(result);
    if (decidedBy !== null) decidedBy = Number(integer(decidedBy, 'deciding user id'));
    const getClient = dependencies.getClient || (() => require('../database/postgres').getClient());
    const client = await getClient();
    let began = false;
    try {
        await client.query('BEGIN');
        began = true;
        const found = await client.query(
            'SELECT id, result, status, end_date, betting_end_date, resolution_params, end_date <= clock_timestamp() AS has_ended FROM issues WHERE id = $1 FOR UPDATE', [issueId]);
        const issue = found.rows[0];
        if (!issue) throw fail('ISSUE_NOT_FOUND', 'Issue not found');
        if (issue.result != null || ['resolved', 'settled'].includes(issue.status)) {
            await client.query('COMMIT');
            began = false;
            return { alreadySettled: true, issueId, result: issue.result, credits: [] };
        }
        if (issue.resolution_params != null && expectedRule === undefined) throw fail('RULE_REQUIRED', 'Structured official issues require verified oracle rule evidence');
        if (expectedRule !== undefined) {
            let matches = false;
            try {
                const persisted = stableJson(issue.resolution_params);
                const expected = stableJson(expectedRule);
                matches = persisted !== undefined && expected !== undefined && persisted === expected;
            } catch (_) {
                // Non-JSON/circular rules are not safe evidence for a financial settlement.
            }
            if (!matches) throw fail('RULE_CHANGED', 'Resolution rule changed after oracle evaluation');
            if (expectedRule.observation_at !== undefined) {
                const actual = new Date(issue.end_date).getTime(), declared = Date.parse(expectedRule.observation_at);
                if (!Number.isFinite(actual) || !Number.isFinite(declared) || actual !== declared) throw fail('RULE_CHANGED', 'Observation date changed after oracle evaluation');
                if (expectedDates === undefined) throw fail('RULE_REQUIRED', 'Official oracle settlement requires captured issue dates');
            }
            if (expectedDates !== undefined) {
                for (const key of ['end_date', 'betting_end_date']) {
                    const actual = new Date(issue[key]).getTime(), expected = new Date(expectedDates[key]).getTime();
                    if (issue[key] == null || expectedDates[key] == null || !Number.isFinite(actual) || !Number.isFinite(expected) || actual !== expected) throw fail('RULE_CHANGED', 'Issue dates changed after oracle evaluation');
                }
            }
        }
        const isRefundResult = ['Draw', 'Cancelled'].includes(result);
        if (!(issue.has_ended === true || (isRefundResult && issue.status === 'closed'))) {
            throw fail('ISSUE_NOT_CLOSED', 'Issue has not ended');
        }
        const old = await client.query(
            `SELECT EXISTS (
                SELECT 1 FROM rewards WHERE issue_id = $1
                UNION ALL SELECT 1 FROM issue_settlements WHERE issue_id = $1
                UNION ALL SELECT 1 FROM settlement_credits WHERE issue_id = $1
                UNION ALL SELECT 1 FROM gam_transactions
                WHERE (reference_id = $2 AND category IN ('issue_settlement', 'betting_win', 'betting_refund', 'bet_win', 'bet_refund', 'settlement', 'refund', 'commission'))
                   OR reference_id LIKE $3
            ) AS has_prior_settlement`, [issueId, String(issueId), 'settlement:v1:issue:' + issueId + ':bet:%']);
        if (old.rows[0]?.has_prior_settlement !== false) {
            throw fail('RECONCILIATION_REQUIRED', 'Existing settlement records require manual reconciliation');
        }
        const bets = await client.query('SELECT id, user_id, issue_id, choice, amount FROM bets WHERE issue_id = $1 ORDER BY id FOR UPDATE', [issueId]);
        for (const bet of bets.rows) {
            if (Number(integer(bet.issue_id, 'bet issue id')) !== issueId) throw fail('INVALID_BET', 'Bet belongs to another issue');
        }
        const payout = calculatePayouts(bets.rows, result, { refundNoWinners });
        const userIds = [...new Set(payout.credits.map(credit => credit.userId))].sort((a, b) => a - b);
        const users = await client.query('SELECT id, gam_balance FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [userIds]);
        const balances = new Map();
        for (const user of users.rows) {
            const id = Number(integer(user.id, 'user id'));
            if (balances.has(id) || !userIds.includes(id)) throw fail('INVALID_BET', 'Inconsistent user rows');
            balances.set(id, integer(user.gam_balance, 'user balance', { zero: true, code: 'BALANCE_OVERFLOW' }));
        }
        if (balances.size !== userIds.length) throw fail('INVALID_BET', 'Bet references a missing user');
        const additions = new Map(userIds.map(id => [id, 0n]));
        for (const credit of payout.credits) additions.set(credit.userId, additions.get(credit.userId) + BigInt(credit.amount));
        // Validate every resulting balance before the first write.
        for (const [userId, amount] of additions) {
            if (balances.get(userId) + amount > INT_MAX) throw fail('BALANCE_OVERFLOW', 'Settlement would overflow user balance');
        }
        for (const [userId, amount] of additions) {
            if (amount > 0n) requireRow(await client.query(
                'UPDATE users SET gam_balance = gam_balance + $1 WHERE id = $2 AND gam_balance = $3',
                [amount.toString(), userId, balances.get(userId).toString()]));
        }
        for (const credit of payout.credits) {
            credit.referenceId = 'settlement:v1:issue:' + issueId + ':bet:' + credit.betId;
            requireRow(await client.query(
                'INSERT INTO settlement_credits (issue_id, bet_id, user_id, kind, amount) VALUES ($1, $2, $3, $4, $5)',
                [issueId, credit.betId, credit.userId, credit.kind, credit.amount]));
            if (BigInt(credit.amount) > 0n) {
                requireRow(await client.query(
                    'INSERT INTO rewards (user_id, issue_id, bet_id, reward_amount) VALUES ($1, $2, $3, $4)',
                    [credit.userId, issueId, credit.betId, credit.amount]));
                requireRow(await client.query(
                    'INSERT INTO gam_transactions (user_id, type, category, amount, description, reference_id) VALUES ($1, $2, $3, $4, $5, $6)',
                    [credit.userId, 'earn', 'issue_settlement', credit.amount, 'Issue ' + issueId + ' ' + credit.kind, credit.referenceId]));
            }
        }
        requireRow(await client.query(
            'INSERT INTO issue_settlements (issue_id, result, source, evidence, total_staked, total_paid) VALUES ($1, $2, $3, $4::jsonb, $5, $6)',
            [issueId, result, source, evidence === null ? null : JSON.stringify(evidence), payout.totalStaked, payout.totalPaid]));
        requireRow(await client.query(
            `UPDATE issues SET result = $1, status = 'resolved', decided_by = $2, decided_at = NOW(), decision_reason = $3
             WHERE id = $4 AND result IS NULL`, [result, decidedBy, reason ?? null, issueId]));
        await client.query('COMMIT');
        began = false;
        return { alreadySettled: false, issueId, ...payout };
    } catch (error) {
        if (began) {
            try { await client.query('ROLLBACK'); } catch (rollbackError) { error.rollbackError = rollbackError; }
        }
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { settleIssue, calculatePayouts };
