'use strict';

const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');
const { PERSONAS, POLICY } = require('./officialPanelPolicy');
const { OFFICIAL_PANEL_SCHEMA_SQL, PANEL_LOCK } = require('../database/official-panel-schema');

class OfficialPanelAccountError extends Error {
    constructor(code, status, message) {
        super(message);
        this.name = 'OfficialPanelAccountError';
        this.code = code;
        this.status = status;
    }
}
function fail(code, status, message) { throw new OfficialPanelAccountError(code, status, message); }
function identity(persona) {
    return { nickname: '[AI] ' + persona.name, email: 'official-ai-panel+' + persona.key + '@yegam.invalid', reference: 'ai-panel-initial:' + persona.key };
}

async function readPanelStatus(client) {
    const users = (await client.query(`
        SELECT u.id, u.ai_panel_role, u.username, u.gam_balance,
               COALESCE(SUM(t.amount), 0)::int AS initial
        FROM users u LEFT JOIN gam_transactions t
          ON t.user_id = u.id AND t.category = 'ai_panel_initial' AND t.type = 'earn'
        WHERE u.ai_panel_role IS NOT NULL
        GROUP BY u.id, u.ai_panel_role, u.username, u.gam_balance
    `)).rows;
    const members = PERSONAS.flatMap(persona => {
        const user = users.find(row => row.ai_panel_role === persona.key);
        return user ? [{ personaKey: persona.key, userId: user.id, nickname: user.username, balance: user.gam_balance, initial: user.initial }] : [];
    });
    const audits = (await client.query(`
        SELECT a.persona_key, a.user_id, a.issue_id, a.bet_id, a.choice, a.amount,
               a.rationale, a.evidence_at, a.source_urls, a.created_at
        FROM official_panel_bet_audits a ORDER BY a.created_at, a.bet_id
    `)).rows;
    return {
        policy: POLICY,
        members,
        totalInitialGam: members.reduce((sum, member) => sum + member.initial, 0),
        bets: audits.map(a => ({personaKey: a.persona_key, userId: a.user_id, issueId: a.issue_id,
            choice: a.choice, amount: a.amount, betId: a.bet_id, rationale: a.rationale,
            evidenceAt: a.evidence_at, sourceUrls: a.source_urls, createdAt: a.created_at}))
    };
}

async function enrollPanel({ adminId } = {}, dependencies = {}) {
    if (!Number.isInteger(adminId) || adminId <= 0) fail('ADMIN_REQUIRED', 403, 'Administrator authorization is required.');
    if (PERSONAS.length !== 10 || POLICY.maxMembers !== 10 || POLICY.initialGam !== 1000 || POLICY.autoRefill !== false) {
        fail('PANEL_POLICY_INVALID', 500, 'Official panel enrollment policy is invalid.');
    }
    const getClient = dependencies.getClient || require('../database/postgres').getClient;
    const client = await getClient();
    let started = false;
    try {
        await client.query('BEGIN'); started = true;
        await client.query('SELECT pg_advisory_xact_lock($1)', [PANEL_LOCK]);
        // Runtime administrator identities are admins.id, not linked user IDs.
        const admin = await client.query('SELECT id FROM admins WHERE id = $1 FOR SHARE', [adminId]);
        if (!admin.rows.length) fail('ADMIN_REQUIRED', 403, 'Administrator authorization is required.');
        await client.query(OFFICIAL_PANEL_SCHEMA_SQL);
        for (const persona of PERSONAS) {
            const expected = identity(persona);
            const existing = (await client.query(
                'SELECT id, username, email, coins FROM users WHERE ai_panel_role = $1 FOR UPDATE', [persona.key]
            )).rows[0];
            if (existing) {
                if (existing.username !== expected.nickname || existing.email !== expected.email || existing.coins !== 0) {
                    fail('PANEL_IDENTITY_CONFLICT', 409, 'Existing official panel identity is inconsistent.');
                }
                const ledger = (await client.query(
                    'SELECT user_id, type, category, amount, reference_id FROM gam_transactions WHERE user_id = $1 AND category = $2',
                    [existing.id, 'ai_panel_initial']
                )).rows;
                if (ledger.length !== 1 || ledger[0].type !== 'earn' || ledger[0].amount !== POLICY.initialGam || ledger[0].reference_id !== expected.reference) {
                    fail('PANEL_LEDGER_CONFLICT', 409, 'Existing official panel initial grant is inconsistent.');
                }
                continue; // Spending and settlement may change GAM. Never reset it.
            }
            const collision = await client.query('SELECT id FROM users WHERE username = $1 OR email = $2', [expected.nickname, expected.email]);
            if (collision.rows.length) fail('PANEL_IDENTITY_COLLISION', 409, 'Reserved official panel identity is already in use.');
            // Hash an unguessable password and discard it. No credential is returned/logged.
            const passwordHash = await bcrypt.hash(randomBytes(48).toString('base64'), 12);
            const user = (await client.query(`
                INSERT INTO users (username, email, password_hash, ai_panel_role, gam_balance, coins)
                VALUES ($1, $2, $3, $4, $5, 0) RETURNING id
            `, [expected.nickname, expected.email, passwordHash, persona.key, POLICY.initialGam])).rows[0];
            await client.query(`
                INSERT INTO gam_transactions (user_id, type, category, amount, description, reference_id)
                VALUES ($1, 'earn', 'ai_panel_initial', $2, 'Official AI panel one-time initial grant', $3)
            `, [user.id, POLICY.initialGam, expected.reference]);
        }
        const status = await readPanelStatus(client);
        await client.query('COMMIT'); started = false;
        return status;
    } catch (error) {
        if (started) { try { await client.query('ROLLBACK'); } catch (_) { /* preserve original error */ } }
        // Do not expose PostgreSQL collision detail containing identity/credential values.
        if (error.code === '23505') fail('PANEL_IDENTITY_COLLISION', 409, 'Official panel identity or initial ledger collides with existing data.');
        throw error;
    } finally { client.release(); }
}

async function getPanelStatus(dependencies = {}) {
    const getClient = dependencies.getClient || require('../database/postgres').getClient;
    const client = await getClient();
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const status = await readPanelStatus(client);
        await client.query('COMMIT');
        return status;
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) { /* preserve original error */ }
        throw error;
    } finally { client.release(); }
}

module.exports = { enrollPanel, getPanelStatus, OfficialPanelAccountError };
