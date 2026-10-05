'use strict';

const { inferLegacyRule } = require('../services/marketResolutionRule');

const SETTLEMENT_SCHEMA_SQL = `
ALTER TABLE issues ADD COLUMN IF NOT EXISTS resolution_params JSONB;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS resolution_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS issues_resolution_key_unique
    ON issues(resolution_key) WHERE resolution_key IS NOT NULL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS resolution_attempted_at TIMESTAMPTZ;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS resolution_last_error TEXT;
CREATE TABLE IF NOT EXISTS issue_settlements (
    issue_id INTEGER PRIMARY KEY REFERENCES issues(id),
    result TEXT NOT NULL CHECK (result IN ('Yes','No','Draw','Cancelled')),
    source TEXT NOT NULL,
    evidence JSONB,
    total_staked BIGINT NOT NULL CHECK (total_staked >= 0),
    total_paid BIGINT NOT NULL CHECK (total_paid >= 0 AND total_paid <= total_staked),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS settlement_credits (
    issue_id INTEGER NOT NULL REFERENCES issues(id),
    bet_id INTEGER NOT NULL REFERENCES bets(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('win','loss','refund')),
    amount BIGINT NOT NULL CHECK (amount >= 0),
    PRIMARY KEY (issue_id, bet_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS gam_issue_settlement_reference_unique
    ON gam_transactions(reference_id) WHERE category = 'issue_settlement';
CREATE INDEX IF NOT EXISTS issues_pending_upbit_resolution
    ON issues(end_date) WHERE resolution_params IS NOT NULL AND result IS NULL;
`;

function resolutionKey(rule) {
    const kst = new Date(Date.parse(rule.observation_at) + 9 * 60 * 60 * 1000).toISOString();
    return `YEGAM-${rule.market.slice(4)}-${kst.slice(0,10).replace(/-/g,'')}-${kst.slice(11,16).replace(':','')}-KRW-v1`;
}

async function ensureSettlementSchema(dependencies = {}) {
    const getClient = dependencies.getClient || require('./postgres').getClient;
    const client = await getClient();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [1977040501]);
        await client.query(SETTLEMENT_SCHEMA_SQL);
        // Only the eight issues explicitly created and verified by the operator.
        // Do not auto-enroll historical community issues based on free text.
        const legacy = await client.query(
            'SELECT * FROM issues WHERE id BETWEEN 136 AND 143 AND resolution_params IS NULL AND result IS NULL ORDER BY id FOR UPDATE'
        );
        for (const issue of legacy.rows) {
            const rule = inferLegacyRule(issue);
            if (!rule) {
                console.warn('Legacy market issue not enrolled: invalid or missing canonical rule', {issueId:issue.id});
                continue;
            }
            await client.query(
                'UPDATE issues SET resolution_params=$1::jsonb,resolution_key=$2 WHERE id=$3 AND resolution_params IS NULL AND result IS NULL',
                [JSON.stringify(rule), resolutionKey(rule), issue.id]
            );
        }
        await client.query('COMMIT');
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) { /* preserve original error */ }
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { SETTLEMENT_SCHEMA_SQL, ensureSettlementSchema, resolutionKey };
