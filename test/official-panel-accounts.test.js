'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { PERSONAS } = require('../services/officialPanelPolicy');
const { enrollPanel, getPanelStatus } = require('../services/officialPanelAccounts');
const { ensureOfficialPanelSchema } = require('../database/official-panel-schema');

async function fixture(t) {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`
        CREATE TABLE users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
            coins INTEGER DEFAULT 10000, gam_balance INTEGER DEFAULT 10000);
        CREATE TABLE admins (id SERIAL PRIMARY KEY);
        INSERT INTO admins(id) VALUES (42);
        CREATE TABLE issues (id SERIAL PRIMARY KEY);
        CREATE TABLE bets (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
            issue_id INTEGER REFERENCES issues(id),choice TEXT,amount INTEGER,UNIQUE(user_id,issue_id));
        CREATE TABLE gam_transactions (id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id),
            type TEXT CHECK (type IN ('earn','burn')),category TEXT,amount INTEGER,
            description TEXT,reference_id TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
    `);
    let hook;
    const queries = [];
    const deps = {getClient: async () => ({
        async query(sql, params = []) {
            queries.push(sql);
            if (hook) await hook(sql, params);
            // PGlite exec is needed for migration SQL containing multiple statements.
            if (sql.includes('ALTER TABLE users ADD COLUMN') && sql.includes('CREATE TABLE')) {
                await db.exec(sql); return {rows:[]};
            }
            return db.query(sql, params);
        }, release() {}
    })};
    return { db, deps, queries, setHook: value => {hook = value;} };
}
async function counts(db) {
    return (await db.query(`SELECT
        (SELECT COUNT(*)::int FROM users WHERE ai_panel_role IS NOT NULL) AS users,
        (SELECT COUNT(*)::int FROM gam_transactions WHERE category='ai_panel_initial') AS grants,
        (SELECT COALESCE(SUM(amount),0)::int FROM gam_transactions WHERE category='ai_panel_initial') AS amount`)).rows[0];
}

// Real in-memory PostgreSQL on a single connection. These tests are not concurrency proofs.
test('enroll exactly ten official AI accounts and 10000 GAM once; exhaustion and startup never refill', async t => {
    const f = await fixture(t);
    const first = await enrollPanel({adminId:42}, f.deps);
    assert.equal(first.members.length, 10);
    assert.equal(first.totalInitialGam, 10000);
    assert.ok(first.members.every(m => m.balance === 1000 && m.initial === 1000 && m.nickname.startsWith('[AI] ')));
    assert.deepEqual(await counts(f.db), {users:10,grants:10,amount:10000});
    const privateFields = (await f.db.query('SELECT email,password_hash,coins FROM users')).rows;
    assert.ok(privateFields.every(u => u.email.endsWith('.invalid') && /^\$2[aby]\$12\$/.test(u.password_hash) && u.coins === 0));
    const hashes = privateFields.map(u => u.password_hash);
    await f.db.query('UPDATE users SET gam_balance=0 WHERE ai_panel_role IS NOT NULL');
    const retry = await enrollPanel({adminId:42,personas:[{key:'eleventh'}]}, f.deps);
    assert.ok(retry.members.every(m => m.balance === 0));
    assert.deepEqual(await counts(f.db), {users:10,grants:10,amount:10000});
    assert.deepEqual((await f.db.query('SELECT password_hash FROM users ORDER BY id')).rows.map(u=>u.password_hash), hashes);
    // Execute actual startup balance statements, not a separately maintained test copy.
    const source = fs.readFileSync(path.join(__dirname,'../database/postgres.js'),'utf8');
    const updates = [...source.matchAll(/client\.query\(`\s*(UPDATE users[\s\S]*?)`\)/g)].map(m=>m[1]);
    assert.equal(updates.length, 4);
    for (const sql of updates) { assert.match(sql,/ai_panel_role IS NULL/); await f.db.query(sql); }
    assert.ok((await f.db.query('SELECT coins,gam_balance FROM users')).rows.every(u=>u.coins===0 && u.gam_balance===0));
    const status = await getPanelStatus(f.deps);
    assert.deepEqual(status.members, retry.members);
    assert.doesNotMatch(JSON.stringify(status), /password|hash|email|api.?key/i);
    const marker = source.indexOf("ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_panel_role TEXT");
    assert.ok(marker > 0 && marker < source.indexOf('UPDATE users SET gam_balance'));
});

test('reserved username collision after partial enrollment rolls everything back; existing member never adopted', async t => {
    const f = await fixture(t);
    await ensureOfficialPanelSchema(f.deps);
    await f.db.query('INSERT INTO users(username,email,password_hash,gam_balance) VALUES ($1,$2,$3,77)', ['[AI] '+PERSONAS[5].name,'real@example.invalid','existing']);
    await assert.rejects(enrollPanel({adminId:42}, f.deps), {code:'PANEL_IDENTITY_COLLISION'});
    assert.deepEqual(await counts(f.db), {users:0,grants:0,amount:0});
    assert.equal((await f.db.query('SELECT gam_balance FROM users')).rows[0].gam_balance,77);
});

test('reserved email collision also aborts without adopting or changing user', async t => {
    const f = await fixture(t);
    await ensureOfficialPanelSchema(f.deps);
    await f.db.query('INSERT INTO users(username,email,password_hash) VALUES ($1,$2,$3)', ['ordinary','official-ai-panel+number@yegam.invalid','existing']);
    await assert.rejects(enrollPanel({adminId:42}, f.deps), {code:'PANEL_IDENTITY_COLLISION'});
    assert.deepEqual(await counts(f.db), {users:0,grants:0,amount:0});
});

test('mid-ledger failure rolls back both identities and grants', async t => {
    const f = await fixture(t);
    await ensureOfficialPanelSchema(f.deps);
    let inserts = 0;
    f.setHook(sql => {if (sql.includes('INSERT INTO gam_transactions') && ++inserts===5) throw new Error('Injected ledger failure');});
    await assert.rejects(enrollPanel({adminId:42}, f.deps), /Injected ledger failure/);
    assert.deepEqual(await counts(f.db), {users:0,grants:0,amount:0});
    f.setHook(null);
    assert.equal((await enrollPanel({adminId:42}, f.deps)).members.length,10);
});

test('role allowlist/uniqueness prevents an eleventh panel; grants cannot duplicate', async t => {
    const f = await fixture(t);
    await enrollPanel({adminId:42}, f.deps);
    for (const role of ['eleventh','number']) {
        await assert.rejects(f.db.query(`INSERT INTO users(username,email,password_hash,ai_panel_role) VALUES ('other','other@yegam.invalid','unused',$1)`,[role]));
    }
    const user = (await f.db.query('SELECT id FROM users ORDER BY id LIMIT 1')).rows[0];
    await assert.rejects(f.db.query(`INSERT INTO gam_transactions(user_id,type,category,amount,reference_id) VALUES ($1,'earn','ai_panel_initial',1000,'other')`,[user.id]));
    await assert.rejects(enrollPanel({adminId:99}, f.deps), {code:'ADMIN_REQUIRED'});
    await f.db.query("DELETE FROM gam_transactions WHERE reference_id='ai-panel-initial:editor'");
    await assert.rejects(enrollPanel({adminId:42}, f.deps), {code:'PANEL_LEDGER_CONFLICT'});
});

test('schema idempotence, audited status, identity and append-only enforcement', async t => {
    const f = await fixture(t);
    await ensureOfficialPanelSchema(f.deps);
    await ensureOfficialPanelSchema(f.deps);
    const panel = await enrollPanel({adminId:42},f.deps);
    const userId = panel.members[0].userId;
    await f.db.exec("INSERT INTO issues(id) VALUES(1),(2); ");
    const betId = (await f.db.query("INSERT INTO bets(user_id,issue_id,choice,amount) VALUES($1,1,'Yes',100) RETURNING id",[userId])).rows[0].id;
    const sql = `INSERT INTO official_panel_bet_audits(bet_id,persona_key,user_id,issue_id,resolution_key,kst_day,choice,amount,rationale,evidence_at,source_urls,actor_admin_id)
      VALUES ($1,$2,$3,1,'verified-rule',CURRENT_DATE,'Yes',100,'Official evidence reviewed',NOW(),$4::jsonb,42)`;
    await assert.rejects(f.db.query(sql,[betId,'counter',userId,'[]']),/identity/);
    await f.db.query(sql,[betId,'number',userId,JSON.stringify(['https://official.example.invalid/data'])]);
    await assert.rejects(f.db.query(sql,[betId,'number',userId,'[]']));
    for (const mutation of ['UPDATE official_panel_bet_audits SET rationale=\'changed\'','DELETE FROM official_panel_bet_audits','TRUNCATE official_panel_bet_audits']) {
        await assert.rejects(f.db.query(mutation),/append-only/);
    }
    const status = await getPanelStatus(f.deps);
    assert.equal(status.bets.length,1);
    assert.equal(status.bets[0].betId,betId);
    assert.equal(status.bets[0].personaKey,'number');
    assert.equal(status.bets[0].amount,100);
    assert.equal(status.bets[0].rationale,'Official evidence reviewed');
    assert.deepEqual(status.bets[0].sourceUrls,['https://official.example.invalid/data']);
});
