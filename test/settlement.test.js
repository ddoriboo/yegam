'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { settleIssue, calculatePayouts } = require('../services/settlement');

const bet = (id, user_id, choice, amount) => ({ id, user_id, issue_id: 7, choice, amount });
const basicBets = () => [bet(3, 2, 'no', 100), bet(1, 1, 'yes', 100)];

// Transaction-state fake only. These tests are NOT actual multiprocess PostgreSQL proof.
// SQL dispatch is deliberately strict: unrecognized operations fail immediately.
function fakeDatabase(options = {}) {
    let state = {
        issue: { id: 7, result: null, status: 'active', has_ended: true, ...options.issue },
        bets: options.bets ?? basicBets(),
        users: options.users ?? [{ id: 1, gam_balance: 1000 }, { id: 2, gam_balance: 2000 }],
        rewards: [], ledger: [], credits: [], settlements: [],
        prior: options.prior ?? false
    };
    if (options.missing) state.issue = null;
    const calls = [];
    let clients = 0, releases = 0, tail = Promise.resolve();
    const getClient = async () => {
        const clientId = ++clients;
        let tx, unlock;
        return {
            async query(sql, params = []) {
                sql = sql.replace(/\s+/g, ' ').trim();
                calls.push({ sql, params, clientId });
                if (options.failAt && sql.startsWith(options.failAt)) throw Object.assign(new Error('forced failure'), { code: 'FORCED' });
                if (sql === 'BEGIN') { assert.equal(tx, undefined); tx = null; return { rowCount: null, rows: [] }; }
                if (sql.startsWith('SELECT id, result, status')) {
                    assert.equal(tx, null);
                    // Serialize at the issue lock, refreshing state after the previous commit.
                    const previous = tail;
                    tail = new Promise(resolve => { unlock = resolve; });
                    await previous;
                    tx = structuredClone(state);
                    return { rows: tx.issue ? [structuredClone(tx.issue)] : [], rowCount: tx.issue ? 1 : 0 };
                }
                if (sql === 'COMMIT') { assert.ok(tx); state = tx; tx = undefined; unlock(); return { rows: [], rowCount: null }; }
                if (sql === 'ROLLBACK') { tx = undefined; if (unlock) unlock(); return { rows: [], rowCount: null }; }
                assert.ok(tx, 'all reads/writes must occur in a transaction after issue lock');
                if (sql.startsWith('SELECT EXISTS')) return { rows: [{ has_prior_settlement: tx.prior || tx.rewards.length > 0 || tx.ledger.length > 0 || tx.credits.length > 0 || tx.settlements.length > 0 }] };
                if (sql.startsWith('SELECT id, user_id, issue_id')) {
                    assert.match(sql, /ORDER BY id FOR UPDATE$/);
                    return { rows: structuredClone(tx.bets).sort((a, b) => a.id - b.id) };
                }
                if (sql.startsWith('SELECT id, gam_balance')) {
                    assert.match(sql, /ORDER BY id FOR UPDATE$/);
                    assert.deepEqual(params[0], [...params[0]].sort((a, b) => a - b));
                    return { rows: structuredClone(tx.users.filter(u => params[0].includes(u.id))).sort((a, b) => a.id - b.id) };
                }
                if (options.zeroRowAt && sql.startsWith(options.zeroRowAt)) return { rows: [], rowCount: 0 };
                if (sql.startsWith('UPDATE users')) {
                    const user = tx.users.find(u => u.id === params[1] && String(u.gam_balance) === params[2]);
                    if (!user) return { rows: [], rowCount: 0 };
                    user.gam_balance += Number(params[0]);
                } else if (sql.startsWith('INSERT INTO settlement_credits')) {
                    tx.credits.push(params);
                } else if (sql.startsWith('INSERT INTO rewards')) {
                    tx.rewards.push(params);
                } else if (sql.startsWith('INSERT INTO gam_transactions')) {
                    tx.ledger.push(params);
                } else if (sql.startsWith('INSERT INTO issue_settlements')) {
                    tx.settlements.push(params);
                } else if (sql.startsWith('UPDATE issues')) {
                    assert.match(sql, /AND result IS NULL$/);
                    if (tx.issue.result !== null) return { rows: [], rowCount: 0 };
                    Object.assign(tx.issue, { result: params[0], status: 'resolved', decided_by: params[1], decision_reason: params[2] });
                } else throw new Error('Unexpected SQL: ' + sql);
                return { rows: [], rowCount: 1 };
            },
            release() { assert.equal(tx, undefined, 'release only after transaction end'); releases++; }
        };
    };
    return { getClient, calls, get state() { return state; }, get releases() { return releases; }, get clients() { return clients; } };
}
const settle = (db, options = {}) => settleIssue(7, { result: 'Yes', reason: 'test', ...options }, { getClient: db.getClient });

 test('normalizes lower/mixed case choices without mutating bets', () => {
    const input = [bet(1, 1, 'yEs', '100'), bet(2, 2, 'NO', 100)];
    const saved = structuredClone(input);
    const got = calculatePayouts(input, 'yes');
    assert.equal(got.result, 'Yes');
    assert.deepEqual(got.credits.map(c => [c.kind, c.amount]), [['win', '190'], ['loss', '0']]);
    assert.deepEqual(input, saved);
});
test('zero bets yields a valid zero pool', () => {
    assert.deepEqual(calculatePayouts([], 'No'), { result: 'No', totalStaked: '0', totalPaid: '0', winningTotal: '0', credits: [] });
});
test('fractional 5% payouts floor individually and do not redistribute dust', () => {
    const got = calculatePayouts([bet(1, 1, 'yes', 1), bet(2, 2, 'Yes', 2), bet(3, 3, 'no', 4)], 'Yes');
    assert.deepEqual(got.credits.map(c => c.amount), ['2', '4', '0']);
    assert.equal(got.totalStaked, '7');
    assert.equal(got.totalPaid, '6');
});
test('BigInt intermediates stay exact beyond Number safe integer multiplication', () => {
    const n = 2147483647;
    const got = calculatePayouts([bet(1, 1, 'yes', n), bet(2, 2, 'yes', n - 1), bet(3, 3, 'no', n)], 'yes');
    const expected = BigInt(n) * (BigInt(n) * 3n - 1n) * 95n / ((BigInt(n) * 2n - 1n) * 100n);
    assert.equal(got.credits[0].amount, expected.toString());
});
for (const result of ['Draw', 'Cancelled']) test(result + ' refunds each exact stake', () => {
    const got = calculatePayouts(basicBets(), result);
    assert.equal(got.totalPaid, '200');
    assert.ok(got.credits.every(c => c.kind === 'refund' && c.amount === '100'));
});
test('no winners retain pool by default; refunds require explicit boolean opt-in', () => {
    const bets = [bet(1, 1, 'no', 75)];
    assert.equal(calculatePayouts(bets, 'Yes').totalPaid, '0');
    assert.equal(calculatePayouts(bets, 'Yes', { refundNoWinners: 'true' }).totalPaid, '0');
    const got = calculatePayouts(bets, 'Yes', { refundNoWinners: true });
    assert.equal(got.totalPaid, '75');
    assert.equal(got.credits[0].kind, 'refund');
});
test('rejects malformed amounts, choices, ids, and duplicate bet ids', () => {
    for (const amount of [0, -1, 1.2, NaN, Infinity, '1.0', '01', null, 2147483648]) {
        assert.throws(() => calculatePayouts([bet(1, 1, 'yes', amount)], 'Yes'), { code: 'INVALID_BET' });
    }
    for (const b of [bet(0, 1, 'yes', 1), bet(1, 0, 'yes', 1), bet(1, 1, 'other', 1)]) {
        assert.throws(() => calculatePayouts([b], 'Yes'), { code: 'INVALID_BET' });
    }
    assert.throws(() => calculatePayouts([bet(1, 1, 'yes', 1), bet(1, 2, 'no', 1)], 'Yes'), { code: 'INVALID_BET' });
});
test('invalid result rejected before client acquisition', async () => {
    const db = fakeDatabase();
    await assert.rejects(settle(db, { result: 'unknown' }), { code: 'INVALID_RESULT' });
    assert.equal(db.clients, 0);
});
test('single-client atomic success, deterministic locks, zero losers, positive reward/ledger', async () => {
    const db = fakeDatabase();
    const got = await settle(db, { decidedBy: 1, source: 'manual', evidence: { proof: 'test' } });
    assert.equal(got.alreadySettled, false);
    assert.equal(got.totalPaid, '190');
    assert.equal(db.clients, 1);
    assert.equal(db.releases, 1);
    assert.ok(db.calls.every(c => c.clientId === 1));
    assert.equal(db.calls[0].sql, 'BEGIN');
    assert.equal(db.calls.at(-1).sql, 'COMMIT');
    assert.equal(db.calls.filter(c => c.sql === 'COMMIT').length, 1);
    assert.ok(db.calls[1].sql.endsWith('FOR UPDATE'));
    const betLock = db.calls.findIndex(c => c.sql.startsWith('SELECT id, user_id'));
    const userLock = db.calls.findIndex(c => c.sql.startsWith('SELECT id, gam_balance'));
    const firstWrite = db.calls.findIndex(c => c.sql.startsWith('UPDATE users'));
    assert.ok(betLock < userLock && userLock < firstWrite);
    assert.equal(db.state.users[0].gam_balance, 1190);
    assert.equal(db.state.users[1].gam_balance, 2000);
    assert.equal(db.state.credits.length, 2);
    assert.equal(db.state.rewards.length, 1);
    assert.equal(db.state.ledger.length, 1);
    assert.deepEqual(db.state.ledger[0].slice(1, 4), ['earn', 'issue_settlement', '190']);
    assert.equal(db.state.ledger[0][5], 'settlement:v1:issue:7:bet:1');
    assert.equal(got.credits[0].referenceId, db.state.ledger[0][5]);
    assert.equal(db.state.issue.status, 'resolved');
    assert.equal(db.state.issue.decided_by, 1);
    assert.equal(db.state.settlements[0][3], '{"proof":"test"}');
});
test('zero-bet issue records settlement and resolves without money writes', async () => {
    const db = fakeDatabase({ bets: [] });
    const got = await settle(db);
    assert.equal(got.totalPaid, '0');
    assert.equal(db.state.settlements.length, 1);
    assert.equal(db.state.issue.result, 'Yes');
    assert.equal(db.state.ledger.length, 0);
    assert.equal(db.state.credits.length, 0);
});
test('duplicate retry commits a no-op without additional credit', async () => {
    const db = fakeDatabase();
    await settle(db);
    const saved = structuredClone(db.state);
    const got = await settle(db);
    assert.equal(got.alreadySettled, true);
    assert.deepEqual(got.credits, []);
    assert.deepEqual(db.state, saved);
    assert.equal(db.releases, 2);
});
test('already resolved/settled status skips even when result null', async () => {
    for (const status of ['resolved', 'settled']) {
        const db = fakeDatabase({ issue: { status, has_ended: false } });
        assert.equal((await settle(db)).alreadySettled, true);
        assert.equal(db.state.ledger.length, 0);
    }
});
test('fake serialized concurrent calls pay once (not a PostgreSQL concurrency proof)', async () => {
    const db = fakeDatabase();
    const results = await Promise.all([settle(db), settle(db)]);
    assert.deepEqual(results.map(r => r.alreadySettled).sort(), [false, true]);
    assert.equal(db.state.ledger.length, 1);
    assert.equal(db.state.users[0].gam_balance, 1190);
    assert.equal(db.releases, 2);
});
test('early Yes/No rejected even for closed status; closed cancellation allowed', async () => {
    for (const result of ['Yes', 'No']) {
        const db = fakeDatabase({ issue: { status: 'closed', has_ended: false } });
        await assert.rejects(settle(db, { result }), { code: 'ISSUE_NOT_CLOSED' });
        assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
    }
    const db = fakeDatabase({ issue: { status: 'closed', has_ended: false } });
    assert.equal((await settle(db, { result: 'Cancelled' })).totalPaid, '200');
});
test('active future Draw and missing issue rejected', async () => {
    await assert.rejects(settle(fakeDatabase({ issue: { has_ended: false } }), { result: 'Draw' }), { code: 'ISSUE_NOT_CLOSED' });
    await assert.rejects(settle(fakeDatabase({ missing: true })), { code: 'ISSUE_NOT_FOUND' });
});
test('old reward or settlement ledger signals require reconciliation', async () => {
    const db = fakeDatabase({ prior: true });
    await assert.rejects(settle(db), { code: 'RECONCILIATION_REQUIRED' });
    assert.equal(db.state.ledger.length, 0);
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
    const check = db.calls.find(c => c.sql.startsWith('SELECT EXISTS')).sql;
    assert.match(check, /FROM rewards/);
    assert.match(check, /FROM gam_transactions/);
    assert.match(check, /FROM settlement_credits/);
});
test('overflow or invalid existing balances fail before first write', async () => {
    for (const balance of [2147483647, -1, null, 1.5]) {
        const db = fakeDatabase({ users: [{ id: 1, gam_balance: balance }, { id: 2, gam_balance: 0 }] });
        await assert.rejects(settle(db), { code: 'BALANCE_OVERFLOW' });
        assert.ok(!db.calls.some(c => c.sql.startsWith('UPDATE users')));
    }
});
test('missing users and mismatched issue ids fail without writes', async () => {
    await assert.rejects(settle(fakeDatabase({ users: [] })), { code: 'INVALID_BET' });
    await assert.rejects(settle(fakeDatabase({ bets: [{ ...bet(1, 1, 'yes', 10), issue_id: 8 }] })), { code: 'INVALID_BET' });
});
test('aggregate multiple credits for one user into one checked balance update', async () => {
    const db = fakeDatabase({ bets: [bet(1, 1, 'yes', 100), bet(2, 1, 'yes', 100)] });
    await settle(db);
    assert.equal(db.calls.filter(c => c.sql.startsWith('UPDATE users')).length, 1);
    assert.equal(db.state.users[0].gam_balance, 1190);
    assert.equal(db.state.ledger.length, 2);
});
for (const failAt of ['INSERT INTO rewards', 'INSERT INTO gam_transactions', 'INSERT INTO issue_settlements', 'UPDATE issues', 'COMMIT']) {
    test('forced ' + failAt + ' failure rolls back all balances and ledger changes', async () => {
        const db = fakeDatabase({ failAt });
        const before = structuredClone(db.state);
        await assert.rejects(settle(db), { code: 'FORCED' });
        assert.deepEqual(db.state, before);
        assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
        assert.equal(db.releases, 1);
    });
}
for (const zeroRowAt of ['UPDATE users', 'INSERT INTO settlement_credits', 'INSERT INTO rewards', 'INSERT INTO gam_transactions', 'INSERT INTO issue_settlements', 'UPDATE issues']) {
    test('unexpected rowCount at ' + zeroRowAt + ' rolls back', async () => {
        const db = fakeDatabase({ zeroRowAt });
        const before = structuredClone(db.state);
        await assert.rejects(settle(db), { code: 'RECONCILIATION_REQUIRED' });
        assert.deepEqual(db.state, before);
    });
}
test('winner floored to zero has audit credit but no reward or earn row', async () => {
    const db = fakeDatabase({ bets: [bet(1, 1, 'yes', 1)] });
    await settle(db);
    assert.equal(db.state.credits[0][3], 'win');
    assert.equal(db.state.credits[0][4], '0');
    assert.equal(db.state.ledger.length, 0);
    assert.equal(db.state.rewards.length, 0);
});

test('expectedRule matches JSONB semantically despite reordered nested object keys', async () => {
    const expectedRule = { market: 'KRW-BTC', threshold: 100, details: { operator: 'gte', sources: [{ name: 'upbit', version: 1 }] } };
    const persistedRule = { details: { sources: [{ version: 1, name: 'upbit' }], operator: 'gte' }, threshold: 100, market: 'KRW-BTC' };
    const db = fakeDatabase({ issue: { resolution_params: persistedRule } });
    assert.equal((await settle(db, { expectedRule })).alreadySettled, false);
    assert.equal(db.state.ledger.length, 1);
    assert.match(db.calls[1].sql, /resolution_params/);
});
for (const persistedRule of [undefined, null, { threshold: 101 }, { threshold: '100' }]) {
    test('changed or missing persisted rule rejects and rolls back: ' + JSON.stringify(persistedRule), async () => {
        const db = fakeDatabase({ issue: { resolution_params: persistedRule } });
        const before = structuredClone(db.state);
        await assert.rejects(settle(db, { expectedRule: { threshold: 100 } }), { code: 'RULE_CHANGED' });
        assert.deepEqual(db.state, before);
        assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
        assert.equal(db.calls.length, 3, 'abort immediately after issue lock before bet/user reads or writes');
        assert.equal(db.releases, 1);
    });
}
test('expectedRule comparison preserves significant array order', async () => {
    const db = fakeDatabase({ issue: { resolution_params: { sources: ['upbit', 'other'] } } });
    await assert.rejects(settle(db, { expectedRule: { sources: ['other', 'upbit'] } }), { code: 'RULE_CHANGED' });
    assert.equal(db.state.ledger.length, 0);
});
test('already-settled retry precedes expectedRule mismatch guard', async () => {
    const db = fakeDatabase({ issue: { result: 'Yes', status: 'resolved', resolution_params: { threshold: 200 } } });
    const got = await settle(db, { expectedRule: { threshold: 100 } });
    assert.equal(got.alreadySettled, true);
    assert.equal(db.calls.at(-1).sql, 'COMMIT');
    assert.equal(db.state.ledger.length, 0);
});

test('structured issue cannot use old settlement entry without an oracle rule',async()=>{const db=fakeDatabase({issue:{resolution_params:{provider:'awc_metar',version:2}}});const before=structuredClone(db.state);await assert.rejects(settle(db),{code:'RULE_REQUIRED'});assert.deepEqual(db.state,before);assert.equal(db.calls.length,3);});
test('observation date binding is rechecked under the financial lock',async()=>{const expectedRule={provider:'awc_metar',version:2,observation_at:'2000-01-01T00:00:00.000Z'};const db=fakeDatabase({issue:{resolution_params:expectedRule,end_date:'2000-01-02T00:00:00.000Z'}});const before=structuredClone(db.state);await assert.rejects(settle(db,{expectedRule}),{code:'RULE_CHANGED'});assert.deepEqual(db.state,before);assert.equal(db.calls.length,3);});
test('betting cutoff changes during acquisition roll back before money reads',async()=>{const dates={end_date:'2000-01-01T00:00:00.000Z',betting_end_date:'1999-12-31T18:00:00.000Z'},expectedRule={provider:'awc_metar',version:2,observation_at:dates.end_date};const db=fakeDatabase({issue:{...dates,betting_end_date:'1999-12-31T19:00:00.000Z',resolution_params:expectedRule}});const before=structuredClone(db.state);await assert.rejects(settle(db,{expectedRule,expectedDates:dates}),{code:'RULE_CHANGED'});assert.deepEqual(db.state,before);assert.equal(db.calls.length,3);});
test('same exact rule and dates still settle with equivalent zoned instants',async()=>{const dates={end_date:'2000-01-01T00:00:00.000Z',betting_end_date:'1999-12-31T18:00:00.000Z'},expectedRule={provider:'awc_metar',version:2,observation_at:dates.end_date};const db=fakeDatabase({issue:{...dates,resolution_params:expectedRule}});assert.equal((await settle(db,{expectedRule,expectedDates:{end_date:'2000-01-01T09:00:00+09:00',betting_end_date:dates.betting_end_date}})).alreadySettled,false);});

test('future oracle caller cannot omit captured cutoff for a real observation rule',async()=>{const expectedRule={provider:'awc_metar',version:2,observation_at:'2000-01-01T00:00:00.000Z'};const db=fakeDatabase({issue:{resolution_params:expectedRule,end_date:expectedRule.observation_at}});const before=structuredClone(db.state);await assert.rejects(settle(db,{expectedRule}),{code:'RULE_REQUIRED'});assert.deepEqual(db.state,before);assert.equal(db.calls.length,3);});
