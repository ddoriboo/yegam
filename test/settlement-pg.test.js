'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { settleIssue } = require('../services/settlement');

// Actual PostgreSQL, in memory, on ONE connection. Not a concurrency/locking proof.
const SCHEMA = `
CREATE TABLE users (id INT PRIMARY KEY, gam_balance INT);
CREATE TABLE issues (
  id INT PRIMARY KEY, title TEXT, status TEXT, end_date TIMESTAMPTZ,
  betting_end_date TIMESTAMPTZ, result TEXT, decided_by INT,
  decided_at TIMESTAMPTZ, decision_reason TEXT, correct_answer TEXT,
  resolution_params JSONB
);
CREATE TABLE bets (
  id INT PRIMARY KEY, user_id INT REFERENCES users(id),
  issue_id INT REFERENCES issues(id), choice VARCHAR(10), amount INT
);
CREATE TABLE rewards (
  id SERIAL PRIMARY KEY, user_id INT, issue_id INT, bet_id INT,
  reward_amount INT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE gam_transactions (
  id SERIAL PRIMARY KEY, user_id INT, type TEXT CHECK (type IN ('earn','burn')),
  category TEXT, amount INT, description TEXT, reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX settlement_transaction_reference
  ON gam_transactions(reference_id) WHERE category = 'issue_settlement';
CREATE TABLE issue_settlements (
  issue_id INT PRIMARY KEY REFERENCES issues(id), result TEXT, source TEXT,
  evidence JSONB, total_staked BIGINT, total_paid BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE settlement_credits (
  issue_id INT REFERENCES issues(id), bet_id INT REFERENCES bets(id),
  user_id INT REFERENCES users(id), kind TEXT, amount BIGINT,
  PRIMARY KEY (issue_id, bet_id)
);`;

async function fixture(t, { users = [[1,100],[2,200],[3,300]], bets = [], future = false } = {}) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(SCHEMA);
  for (const [id, balance] of users) {
    await db.query('INSERT INTO users (id,gam_balance) VALUES ($1,$2)', [id,balance]);
  }
  await db.query(
    `INSERT INTO issues (id,title,status,end_date,betting_end_date)
     VALUES (1,'Settlement fixture','active',NOW() + $1::interval,NOW() + $1::interval)`,
    [future ? '1 day' : '-1 day']
  );
  for (const [id,userId,choice,amount] of bets) {
    await db.query('INSERT INTO bets (id,user_id,issue_id,choice,amount) VALUES ($1,$2,1,$3,$4)',
      [id,userId,choice,amount]);
  }
  const queries = [];
  let hook = null;
  const client = {
    async query(sql, params = []) {
      queries.push({sql,params});
      if (hook) await hook(sql,params);
      const result = await db.query(sql,params);
      return {...result, rowCount: result.affectedRows ?? result.rows.length};
    },
    release() {}
  };
  return {db,queries,dependencies:{getClient:async () => client},setHook(value) {hook = value;}};
}

function options(result, extra = {}) {
  return {result,reason:'Verified fixture outcome',...extra};
}

function money(summary, expected) {
  for (const [key,value] of Object.entries(expected)) {
    assert.equal(typeof summary[key], 'string', key + ' must be a JSON-safe decimal string');
    assert.match(summary[key], /^\d+$/);
    assert.equal(summary[key], value, key);
  }
  for (const credit of summary.credits) {
    assert.equal(typeof credit.amount, 'string');
    assert.match(credit.amount, /^\d+$/);
    assert.equal(typeof credit.stake, 'number');
  }
  assert.doesNotThrow(() => JSON.stringify(summary));
}

async function balances(db) {
  return (await db.query('SELECT id,gam_balance FROM users ORDER BY id')).rows;
}

async function audit(db) {
  return (await db.query(
    'SELECT issue_id,result,source,evidence,total_staked::text,total_paid::text FROM issue_settlements ORDER BY issue_id'
  )).rows;
}

async function credits(db) {
  return (await db.query('SELECT bet_id,user_id,kind,amount::text FROM settlement_credits ORDER BY bet_id')).rows;
}

async function assertLedgerMatchesCredits(db) {
  const paid = (await credits(db)).filter(credit => BigInt(credit.amount) > 0n);
  const ledger = (await db.query(
    'SELECT user_id,type,category,amount,reference_id FROM gam_transactions ORDER BY id'
  )).rows;
  assert.equal(ledger.length, paid.length);
  const sort = (a,b) => a[0]-b[0] || a[1]-b[1];
  assert.deepEqual(ledger.map(c => [c.user_id,c.amount]).sort(sort),
    paid.map(c => [c.user_id,Number(c.amount)]).sort(sort));
  assert.equal(new Set(ledger.map(c => c.reference_id)).size, ledger.length);
  for (const row of ledger) {
    assert.equal(row.type, 'earn');
    assert.equal(row.category, 'issue_settlement');
    assert.equal(typeof row.reference_id, 'string');
    assert.ok(row.reference_id.length > 0);
  }
}

async function assertUnresolved(db) {
  const issue = (await db.query('SELECT status,result,decided_by,decided_at,decision_reason,correct_answer FROM issues WHERE id=1')).rows[0];
  assert.deepEqual(issue, {status:'active',result:null,decided_by:null,decided_at:null,decision_reason:null,correct_answer:null});
  assert.deepEqual(await audit(db), []);
  assert.deepEqual(await credits(db), []);
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM gam_transactions')).rows[0].count, 0);
}

async function persistentState(db) {
  const state = {};
  for (const table of ['users','issues','rewards','gam_transactions','issue_settlements','settlement_credits']) {
    state[table] = (await db.query('SELECT * FROM ' + table + ' ORDER BY 1,2')).rows;
  }
  return state;
}

test('lowercase winning bet: 5% edge and per-bet floor are preserved in PostgreSQL', async t => {
  const f = await fixture(t, {bets:[[11,1,'yes',2],[12,2,'YES',5],[13,3,'no',94]]});
  const evidence = {provider:'fixture',observed:true};
  const summary = await settleIssue(1, options('Yes', {decidedBy:9,source:'manual',evidence}), f.dependencies);
  assert.equal(summary.alreadySettled, false);
  assert.equal(summary.issueId, 1);
  assert.equal(summary.result, 'Yes');
  money(summary, {totalStaked:'101',totalPaid:'95',winningTotal:'7'});
  // floor(101 * .95 * 2/7)=27; floor(101 * .95 * 5/7)=68.
  assert.deepEqual(summary.credits.map(c => [c.betId,c.userId,c.amount]).sort((a,b) => a[0]-b[0]), [[11,1,'27'],[12,2,'68'],[13,3,'0']]);
  assert.deepEqual(await balances(f.db), [{id:1,gam_balance:127},{id:2,gam_balance:268},{id:3,gam_balance:300}]);
  assert.deepEqual((await credits(f.db)).map(c => [c.bet_id,c.user_id,c.amount]), [[11,1,'27'],[12,2,'68'],[13,3,'0']]);
  assert.deepEqual(await audit(f.db), [{issue_id:1,result:'Yes',source:'manual',evidence,total_staked:'101',total_paid:'95'}]);
  await assertLedgerMatchesCredits(f.db);
  const issue = (await f.db.query('SELECT status,result,decided_by,decided_at,decision_reason FROM issues WHERE id=1')).rows[0];
  assert.equal(issue.status, 'resolved');
  assert.equal(issue.result, 'Yes');
  assert.equal(issue.decided_by, 9);
  assert.ok(issue.decided_at);
  assert.equal(issue.decision_reason, 'Verified fixture outcome');
});

for (const result of ['Draw','Cancelled']) {
  test(result + ' refunds each stake exactly, with no house fee', async t => {
    const f = await fixture(t, {bets:[[11,1,'Yes',19],[12,2,'No',101],[13,1,'No',7]]});
    const summary = await settleIssue(1, options(result), f.dependencies);
    money(summary, {totalStaked:'127',totalPaid:'127'});
    assert.deepEqual(summary.credits.map(c => [c.betId,c.amount]).sort((a,b) => a[0]-b[0]), [[11,'19'],[12,'101'],[13,'7']]);
    assert.deepEqual(await balances(f.db), [{id:1,gam_balance:126},{id:2,gam_balance:301},{id:3,gam_balance:300}]);
    assert.deepEqual((await credits(f.db)).map(c => [c.bet_id,c.amount]), [[11,'19'],[12,'101'],[13,'7']]);
    await assertLedgerMatchesCredits(f.db);
  });
}

test('no-winner refund policy returns all stakes exactly', async t => {
  const f = await fixture(t, {bets:[[11,1,'No',3],[12,2,'no',109]]});
  const summary = await settleIssue(1, options('Yes', {refundNoWinners:true}), f.dependencies);
  money(summary, {totalStaked:'112',totalPaid:'112',winningTotal:'0'});
  assert.deepEqual(await balances(f.db), [{id:1,gam_balance:103},{id:2,gam_balance:309},{id:3,gam_balance:300}]);
  assert.deepEqual((await credits(f.db)).map(c => [c.bet_id,c.amount]), [[11,'3'],[12,'109']]);
  await assertLedgerMatchesCredits(f.db);
});

test('zero bets still resolves with one zero-valued settlement audit row', async t => {
  const f = await fixture(t);
  const before = await balances(f.db);
  const summary = await settleIssue(1, options('No'), f.dependencies);
  money(summary, {totalStaked:'0',totalPaid:'0',winningTotal:'0'});
  assert.deepEqual(summary.credits, []);
  assert.deepEqual(await balances(f.db), before);
  assert.deepEqual(await audit(f.db), [{issue_id:1,result:'No',source:'manual',evidence:null,total_staked:'0',total_paid:'0'}]);
  assert.deepEqual(await credits(f.db), []);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS count FROM gam_transactions')).rows[0].count, 0);
  assert.equal((await f.db.query('SELECT status FROM issues WHERE id=1')).rows[0].status, 'resolved');
});

test('repeat invocation is idempotent: no additional balances or ledger/audit rows', async t => {
  const f = await fixture(t, {bets:[[11,1,'Yes',20],[12,2,'No',80]]});
  const first = await settleIssue(1, options('Yes'), f.dependencies);
  const before = await persistentState(f.db);
  const second = await settleIssue(1, options('Yes'), f.dependencies);
  assert.equal(first.alreadySettled, false);
  assert.equal(second.alreadySettled, true);
  assert.equal(second.result, 'Yes');
  assert.deepEqual(second.credits, []);
  assert.deepEqual(await persistentState(f.db), before);
});

test('real PostgreSQL mid-credit error rolls back the first balance and every audit write', async t => {
  const f = await fixture(t, {bets:[[11,1,'Yes',2],[12,2,'Yes',5],[13,3,'No',94]]});
  let ledgerCount = 0;
  let observedFirstCredit = false;
  let observedAuditWrites = false;
  f.setHook(async sql => {
    if (/^\s*INSERT\s+INTO\s+gam_transactions\b/i.test(sql)) {
      ledgerCount++;
      if (ledgerCount === 2) {
        const inside = await balances(f.db);
        observedFirstCredit = inside.some(row => row.id <= 2 && row.gam_balance > (row.id === 1 ? 100 : 200));
        const priorLedger = (await f.db.query('SELECT COUNT(*)::int AS count FROM gam_transactions')).rows[0].count;
        const priorRewards = (await f.db.query('SELECT COUNT(*)::int AS count FROM rewards')).rows[0].count;
        observedAuditWrites = priorLedger > 0 && priorRewards > 0 && (await credits(f.db)).length > 0;
        // Real PostgreSQL error aborts the transaction. Not a fake query result.
        await f.db.query('SELECT 1 / 0');
      }
    }
  });
  await assert.rejects(settleIssue(1, options('Yes'), f.dependencies), error => error.code === '22012');
  assert.equal(ledgerCount, 2, 'failure was injected during the second credit ledger write');
  assert.equal(observedFirstCredit, true, 'first balance changed inside the transaction before failure');
  assert.equal(observedAuditWrites, true, 'ledger, rewards and credits existed inside the transaction before failure');
  assert.ok(f.queries.some(q => /^\s*ROLLBACK\b/i.test(q.sql)), 'service issued ROLLBACK');
  assert.deepEqual(await balances(f.db), [{id:1,gam_balance:100},{id:2,gam_balance:200},{id:3,gam_balance:300}]);
  await assertUnresolved(f.db);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS count FROM rewards')).rows[0].count, 0);
  // Retry verifies no fences/credits survived the failed transaction.
  f.setHook(null);
  const retry = await settleIssue(1, options('Yes'), f.dependencies);
  assert.equal(retry.alreadySettled, false);
  money(retry, {totalStaked:'101',totalPaid:'95',winningTotal:'7'});
  await assertLedgerMatchesCredits(f.db);
});

test('unresolved issue with legacy rewards is fenced for reconciliation', async t => {
  const f = await fixture(t, {bets:[[11,1,'Yes',20],[12,2,'No',80]]});
  await f.db.query('INSERT INTO rewards (user_id,issue_id,bet_id,reward_amount) VALUES (1,1,11,95)');
  const before = await persistentState(f.db);
  await assert.rejects(settleIssue(1, options('Yes'), f.dependencies), error => error.code === 'RECONCILIATION_REQUIRED');
  assert.deepEqual(await persistentState(f.db), before);
  await assertUnresolved(f.db);
});

test('INT balance overflow is rejected and the transaction is rolled back', async t => {
  const f = await fixture(t, {users:[[1,100],[2,2147483640],[3,300]],bets:[[11,1,'Yes',2],[12,2,'Yes',5],[13,3,'No',94]]});
  const before = await balances(f.db);
  await assert.rejects(settleIssue(1, options('Yes'), f.dependencies), error => error.code === 'BALANCE_OVERFLOW' || error.code === '22003');
  assert.ok(f.queries.some(q => /^\s*ROLLBACK\b/i.test(q.sql)));
  assert.deepEqual(await balances(f.db), before);
  await assertUnresolved(f.db);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS count FROM rewards')).rows[0].count, 0);
});

for (const result of ['Yes','No']) {
  test('future-date ' + result + ' settlement is refused without persisted changes', async t => {
    const f = await fixture(t, {future:true,bets:[[11,1,'Yes',20],[12,2,'No',80]]});
    const before = await persistentState(f.db);
    await assert.rejects(settleIssue(1, options(result), f.dependencies), error => error.code === 'ISSUE_NOT_CLOSED');
    assert.deepEqual(await persistentState(f.db), before);
    await assertUnresolved(f.db);
  });
}

const officialWeatherFixture={version:2,provider:'awc_metar',station:'RKSI',metric:'temperature_c',operator:'gt',threshold:17,observation_at:'2000-01-01T00:00:00.000Z',missing_data_policy:'cancel_after_24h'};
const officialDatesFixture={end_date:officialWeatherFixture.observation_at,betting_end_date:'1999-12-31T18:00:00.000Z'};
async function installOfficialFixture(f){await f.db.query('UPDATE issues SET resolution_params=$1::jsonb,end_date=$2::timestamptz,betting_end_date=$3::timestamptz WHERE id=1',[JSON.stringify(officialWeatherFixture),officialDatesFixture.end_date,officialDatesFixture.betting_end_date]);}
test('actual PostgreSQL official-v2 settlement binds dates, records source, and is idempotent',async t=>{const f=await fixture(t,{bets:[[1,1,'Yes',100],[2,2,'No',300]]});await installOfficialFixture(f);const opts=options('Yes',{source:'awc_metar',expectedRule:officialWeatherFixture,expectedDates:officialDatesFixture,evidence:{rule:officialWeatherFixture,temp:18}});const result=await settleIssue(1,opts,f.dependencies);money(result,{totalStaked:'400',totalPaid:'380'});assert.equal((await f.db.query('SELECT source,evidence FROM issue_settlements')).rows[0].source,'awc_metar');assert.equal((await settleIssue(1,opts,f.dependencies)).alreadySettled,true);assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM issue_settlements')).rows[0].n,1);});
test('actual PostgreSQL official-v2 changed cutoff aborts before any ledger or credit',async t=>{const f=await fixture(t,{bets:[[1,1,'Yes',100],[2,2,'No',300]]});await installOfficialFixture(f);await f.db.query("UPDATE issues SET betting_end_date=betting_end_date+interval '1 hour' WHERE id=1");await assert.rejects(settleIssue(1,options('Yes',{source:'awc_metar',expectedRule:officialWeatherFixture,expectedDates:officialDatesFixture}),f.dependencies),{code:'RULE_CHANGED'});assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM gam_transactions')).rows[0].n,0);assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM issue_settlements')).rows[0].n,0);assert.equal((await f.db.query('SELECT result FROM issues')).rows[0].result,null);});
