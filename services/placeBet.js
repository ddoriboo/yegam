'use strict';

const MAX_DB_INT = 2147483647;

class BetPlacementError extends Error {
    constructor(code, status, message, details = {}) {
        super(message);
        this.name = 'BetPlacementError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

function reject(code, status, message, details) {
    throw new BetPlacementError(code, status, message, details);
}

function dbInteger(value, label) {
    const number = value == null ? 0 : value;
    if (!Number.isInteger(number) || number < 0 || number > MAX_DB_INT) {
        reject('INTEGER_LIMIT', 400, label + ' 값이 허용 범위를 벗어났습니다.');
    }
    return number;
}

async function placeBet({ issueId, userId, choice, amount }, dependencies = {}) {
    // Injecting a client factory avoids loading DB configuration in unit tests.
    const getClient = dependencies.getClient || require('../database/postgres').getClient;
    const client = await getClient();
    let transactionStarted = false;
    try {
        await client.query('BEGIN');
        transactionStarted = true;

        // Match settlement's lock order. Never lock/debit a user before the issue.
        const issueResult = await client.query(
            'SELECT id, title, status, result, end_date, betting_end_date, yes_volume, no_volume, total_volume, yes_price FROM issues WHERE id = $1 FOR UPDATE',
            [issueId]
        );
        const issue = issueResult.rows[0];
        if (!issue) reject('ISSUE_NOT_FOUND', 404, '존재하지 않는 이슈입니다.');
        if (issue.status !== 'active') reject('ISSUE_NOT_ACTIVE', 404, '존재하지 않는 이슈입니다.');
        if (issue.result != null) reject('BETTING_CLOSED', 400, '베팅이 마감되었습니다.');

        // Read the DB wall clock after acquiring the lock, not transaction-start NOW().
        // SQL comparison avoids losing timestamp precision through JS Date conversion.
        const checkCutoff = async () => {
            const cutoff = await client.query(
                'SELECT clock_timestamp() < COALESCE(betting_end_date, end_date) AS betting_open FROM issues WHERE id = $1',
                [issueId]
            );
            if (cutoff.rows[0]?.betting_open !== true) reject('BETTING_CLOSED', 400, '베팅이 마감되었습니다.');
        };
        await checkCutoff();

        const userResult = await client.query('SELECT gam_balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userResult.rows[0];
        if (!user) reject('USER_NOT_FOUND', 404, '사용자를 찾을 수 없습니다.');
        // A cross-issue bet may have waited on this user lock past the deadline.
        await checkCutoff();
        if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_DB_INT) {
            reject('INVALID_AMOUNT', 400, '베팅 금액은 양의 정수이며 허용 범위 내여야 합니다.');
        }
        const normalized = typeof choice === 'string' ? choice.trim().toLowerCase() : '';
        if (!['yes', 'no'].includes(normalized)) reject('INVALID_CHOICE', 400, '올바른 베팅 선택이 아닙니다. (Yes/No)');
        const canonicalChoice = normalized === 'yes' ? 'Yes' : 'No';
        const previousBalance = dbInteger(user.gam_balance, 'GAM 잔액');
        if (previousBalance < amount) reject('INSUFFICIENT_BALANCE', 400, '보유 GAM이 부족합니다.', { currentBalance: previousBalance });

        const existing = await client.query('SELECT * FROM bets WHERE user_id = $1 AND issue_id = $2', [userId, issueId]);
        if (existing.rows.length) reject('DUPLICATE_BET', 400, '이미 베팅한 이슈입니다.', { existingBet: existing.rows[0] });

        const yesVolume = dbInteger(issue.yes_volume, 'YES 볼륨') + (canonicalChoice === 'Yes' ? amount : 0);
        const noVolume = dbInteger(issue.no_volume, 'NO 볼륨') + (canonicalChoice === 'No' ? amount : 0);
        dbInteger(issue.total_volume, '총 볼륨');
        const totalVolume = yesVolume + noVolume;
        for (const value of [yesVolume, noVolume, totalVolume]) dbInteger(value, '이슈 볼륨');
        const yesPrice = totalVolume > 0 ? Math.round(yesVolume / totalVolume * 100) : 50;

        let inserted;
        try {
            inserted = await client.query(
                'INSERT INTO bets (user_id, issue_id, choice, amount) VALUES ($1, $2, $3, $4) RETURNING id, issue_id, choice, amount, created_at',
                [userId, issueId, canonicalChoice, amount]
            );
        } catch (error) {
            if (error.code === '23505') reject('DUPLICATE_BET', 409, '이미 베팅한 이슈입니다.');
            throw error;
        }
        const bet = inserted.rows[0];
        const updatedUser = await client.query(
            'UPDATE users SET gam_balance = gam_balance - $1 WHERE id = $2 RETURNING gam_balance',
            [amount, userId]
        );
        await client.query(
            'UPDATE issues SET yes_volume = $1, no_volume = $2, total_volume = $3, yes_price = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5',
            [yesVolume, noVolume, totalVolume, yesPrice, issueId]
        );
        await client.query(
            'INSERT INTO gam_transactions (user_id, type, category, amount, description, reference_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [userId, 'burn', 'bet', amount, '베팅: ' + issue.title, 'bet:' + bet.id]
        );
        await client.query('COMMIT');
        transactionStarted = false;
        return { bet, issue, previousBalance, balance: updatedUser.rows[0].gam_balance, yesPrice, totalVolume };
    } catch (error) {
        if (transactionStarted) {
            try { await client.query('ROLLBACK'); } catch (rollbackError) { error.rollbackError = rollbackError; }
        }
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { placeBet, BetPlacementError, MAX_DB_INT };
