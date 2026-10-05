'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { placeBet, BetPlacementError, MAX_DB_INT } = require('../services/placeBet');

// This is a transactional fake, not proof of PostgreSQL concurrency behavior.
function fixture(options = {}) {
    const calls = [];
    let releases = 0;
    let acquisitions = 0;
    let cutoffChecks = 0;
    const state = {
        issue: { id: 7, title: 'Market', status: 'active', result: null,
            end_date: '2026-10-04T02:00:00Z', betting_end_date: '2026-10-04T01:00:00Z',
            yes_volume: 100, no_volume: 100, total_volume: 200, yes_price: 50, ...options.issue },
        user: { gam_balance: options.balance ?? 1000 },
        bets: options.existing ? [{ id: 8, user_id: 9, issue_id: 7, choice: 'No', amount: 100 }] : [],
        ledger: []
    };
    let snapshot;
    const client = {
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (options.fail && sql.startsWith(options.fail)) throw Object.assign(new Error('injected failure'), { code: options.errorCode });
            if (sql === 'BEGIN') { snapshot = structuredClone(state); return { rows: [] }; }
            if (sql === 'ROLLBACK') { Object.assign(state, snapshot); return { rows: [] }; }
            if (sql === 'COMMIT') return { rows: [] };
            if (sql.startsWith('SELECT id, title')) return { rows: options.missingIssue ? [] : [{ ...state.issue }] };
            if (sql.startsWith('SELECT clock_timestamp()')) {
                assert.match(sql, /clock_timestamp\(\) < COALESCE\(betting_end_date, end_date\)/);
                cutoffChecks++;
                const now = options.afterUserCutoff && cutoffChecks > 1 ? options.afterUserCutoff : options.now || '2026-10-04T00:00:00Z';
                const deadline = state.issue.betting_end_date ?? state.issue.end_date;
                return { rows: [{ betting_open: !!deadline && new Date(now) < new Date(deadline) }] };
            }
            if (sql.startsWith('SELECT gam_balance')) return { rows: options.missingUser ? [] : [{ ...state.user }] };
            if (sql.startsWith('SELECT * FROM bets')) return { rows: structuredClone(state.bets) };
            if (sql.startsWith('INSERT INTO bets')) {
                const bet = { id: 10, user_id: params[0], issue_id: params[1], choice: params[2], amount: params[3], created_at: '2026-10-04T00:00:00Z' };
                state.bets.push(bet);
                return { rows: [{ ...bet }] };
            }
            if (sql.startsWith('UPDATE users')) { state.user.gam_balance -= params[0]; return { rows: [{ ...state.user }] }; }
            if (sql.startsWith('UPDATE issues')) {
                Object.assign(state.issue, { yes_volume: params[0], no_volume: params[1], total_volume: params[2], yes_price: params[3] });
                return { rows: [] };
            }
            if (sql.startsWith('INSERT INTO gam_transactions')) { state.ledger.push(params); return { rows: [] }; }
            throw new Error('Unexpected SQL: ' + sql);
        },
        release() { releases++; }
    };
    return { state, calls, client, dependencies: { getClient: async () => { acquisitions++; return client; } },
        stats: () => ({ releases, acquisitions }) };
}
const input = { issueId: 7, userId: 9, choice: 'Yes', amount: 100 };
function run(f, overrides = {}) { return placeBet({ ...input, ...overrides }, f.dependencies); }
async function rejected(f, code, overrides = {}, status) {
    await assert.rejects(run(f, overrides), error => error instanceof BetPlacementError && error.code === code && (!status || error.status === status));
    assert.equal(f.calls.at(-1).sql, 'ROLLBACK');
    assert.deepEqual(f.stats(), { releases: 1, acquisitions: 1 });
    assert.equal(f.state.user.gam_balance, 1000);
    assert.equal(f.state.ledger.length, 0);
}

test('one injected client owns BEGIN, all statements, COMMIT, and one release', async () => {
    const f = fixture();
    const result = await run(f);
    assert.equal(f.calls[0].sql, 'BEGIN');
    assert.equal(f.calls.at(-1).sql, 'COMMIT');
    assert.deepEqual(f.stats(), { releases: 1, acquisitions: 1 });
    assert.equal(result.balance, 900);
    assert.equal(result.previousBalance, 1000);
    assert.equal(result.yesPrice, 67);
    assert.equal(result.totalVolume, 300);
    assert.deepEqual(f.state.ledger[0], [9, 'burn', 'bet', 100, '베팅: Market', 'bet:10']);
});
test('locks issue first, then user, before duplicate check/insert/debit', async () => {
    const f = fixture(); await run(f);
    const issue = f.calls.findIndex(c => /FROM issues.*FOR UPDATE/.test(c.sql));
    const user = f.calls.findIndex(c => /FROM users.*FOR UPDATE/.test(c.sql));
    const duplicate = f.calls.findIndex(c => c.sql.startsWith('SELECT * FROM bets'));
    const insert = f.calls.findIndex(c => c.sql.startsWith('INSERT INTO bets'));
    const debit = f.calls.findIndex(c => c.sql.startsWith('UPDATE users'));
    assert.equal(issue, 1);
    assert.ok(issue < user && user < duplicate && duplicate < insert && insert < debit);
    assert.match(f.calls[issue].sql, /end_date, betting_end_date/);
});
for (const [choice, canonical, yes, no] of [['yes', 'Yes', 200, 100], ['no', 'No', 100, 200], ['yEs', 'Yes', 200, 100], ['NO', 'No', 100, 200]]) {
    test('normalizes ' + choice + ' to canonical ' + canonical, async () => {
        const f = fixture(); const result = await run(f, { choice });
        assert.equal(result.bet.choice, canonical);
        assert.equal(f.state.issue.yes_volume, yes);
        assert.equal(f.state.issue.no_volume, no);
    });
}
for (const now of ['2026-10-04T01:00:00Z', '2026-10-04T01:00:01Z']) {
    test('rejects betting cutoff equality/past ' + now, async () => {
        const f = fixture({ now }); await rejected(f, 'BETTING_CLOSED');
        assert.ok(!f.calls.some(c => /FROM users/.test(c.sql)));
    });
}
test('end_date is the fallback cutoff and equality is rejected', async () => {
    await rejected(fixture({ issue: { betting_end_date: null }, now: '2026-10-04T02:00:00Z' }), 'BETTING_CLOSED');
    const f = fixture({ issue: { betting_end_date: null }, now: '2026-10-04T01:59:59Z' }); await run(f);
});
test('rejects when user lock wait has crossed cutoff, before insert or debit', async () => {
    const f = fixture({ afterUserCutoff: '2026-10-04T01:00:00Z' });
    await rejected(f, 'BETTING_CLOSED');
    assert.ok(f.calls.some(c => /FROM users.*FOR UPDATE/.test(c.sql)));
    assert.ok(!f.calls.some(c => c.sql.startsWith('INSERT INTO bets')));
});
test('closed/inactive issue rejected even with future dates', async () => {
    await rejected(fixture({ issue: { status: 'closed' } }), 'ISSUE_NOT_ACTIVE', {}, 404);
});
test('active issue with result present is rejected', async () => {
    for (const result of ['Yes', 'No', '']) await rejected(fixture({ issue: { result } }), 'BETTING_CLOSED');
});
test('missing issue and user preserve 404 service errors', async () => {
    await rejected(fixture({ missingIssue: true }), 'ISSUE_NOT_FOUND', {}, 404);
    await rejected(fixture({ missingUser: true }), 'USER_NOT_FOUND', {}, 404);
});
test('insufficient balance rolls back without inserts or debit', async () => {
    const f = fixture(); await rejected(f, 'INSUFFICIENT_BALANCE', { amount: 1001 });
    assert.ok(!f.calls.some(c => c.sql.startsWith('INSERT INTO bets') || c.sql.startsWith('UPDATE users')));
});
test('amount must be positive integer within PostgreSQL INT', async () => {
    for (const amount of [0, -1, 1.5, '100', NaN, Infinity, MAX_DB_INT + 1]) await rejected(fixture(), 'INVALID_AMOUNT', { amount });
});
test('invalid choice rolls back', async () => {
    for (const choice of ['maybe', null, 1]) await rejected(fixture(), 'INVALID_CHOICE', { choice });
});
test('existing duplicate preserves existing bet details and is never debited', async () => {
    const f = fixture({ existing: true });
    await assert.rejects(run(f), e => e.code === 'DUPLICATE_BET' && e.status === 400 && e.details.existingBet.id === 8);
    assert.equal(f.state.bets.length, 1); assert.equal(f.state.user.gam_balance, 1000);
    assert.equal(f.calls.at(-1).sql, 'ROLLBACK'); assert.equal(f.stats().releases, 1);
});
test('unique constraint duplicate maps to 409 and never debits', async () => {
    const f = fixture({ fail: 'INSERT INTO bets', errorCode: '23505' });
    await rejected(f, 'DUPLICATE_BET', {}, 409);
    assert.ok(!f.calls.some(c => c.sql.startsWith('UPDATE users')));
});
test('volume and total integer overflow rejected before mutation', async () => {
    for (const issue of [{ yes_volume: MAX_DB_INT }, { yes_volume: MAX_DB_INT - 100, no_volume: 101 }, { total_volume: MAX_DB_INT + 1 }, { no_volume: -1 }]) {
        const f = fixture({ issue }); await rejected(f, 'INTEGER_LIMIT');
        assert.ok(!f.calls.some(c => c.sql.startsWith('INSERT INTO bets')));
    }
});
test('MAX_DB_INT amount accepted at valid balance and zero volumes', async () => {
    const f = fixture({ balance: MAX_DB_INT, issue: { yes_volume: null, no_volume: null, total_volume: null } });
    const result = await run(f, { amount: MAX_DB_INT });
    assert.equal(result.balance, 0); assert.equal(result.totalVolume, MAX_DB_INT); assert.equal(result.yesPrice, 100);
});
for (const phase of ['INSERT INTO bets', 'UPDATE users', 'UPDATE issues', 'INSERT INTO gam_transactions', 'COMMIT']) {
    test('later failure at ' + phase + ' rolls back bet, debit, volumes and ledger', async () => {
        const f = fixture({ fail: phase }); const original = structuredClone(f.state);
        await assert.rejects(run(f), /injected failure/);
        assert.deepEqual(f.state, original);
        assert.equal(f.calls.at(-1).sql, 'ROLLBACK');
        assert.deepEqual(f.stats(), { releases: 1, acquisitions: 1 });
    });
}
test('BEGIN failure still releases once and does not attempt a transaction rollback', async () => {
    const f = fixture({ fail: 'BEGIN' }); await assert.rejects(run(f), /injected failure/);
    assert.deepEqual(f.calls.map(c => c.sql), ['BEGIN']); assert.equal(f.stats().releases, 1);
});
test('rollback failure preserves original error and still releases once', async () => {
    const f = fixture({ fail: 'UPDATE issues' }); const query = f.client.query.bind(f.client);
    f.client.query = async (sql, params) => { if (sql === 'ROLLBACK') throw new Error('rollback failed'); return query(sql, params); };
    await assert.rejects(run(f), e => e.message === 'injected failure' && e.rollbackError.message === 'rollback failed');
    assert.equal(f.stats().releases, 1);
});
