'use strict';

const { PERSONAS } = require('../services/officialPanelPolicy');
// Only policy-defined roles are schema input, never caller-provided roles.
const ROLES_SQL = PERSONAS.map(({ key }) => "'" + key.replace(/'/g, "''") + "'").join(',');
const PANEL_LOCK = 1977040510;
const OFFICIAL_PANEL_SCHEMA_SQL = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_panel_role TEXT;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_ai_panel_role_allowed' AND conrelid = 'users'::regclass) THEN
        ALTER TABLE users ADD CONSTRAINT users_ai_panel_role_allowed
            CHECK (ai_panel_role IS NULL OR ai_panel_role IN (${ROLES_SQL}));
    END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS users_ai_panel_role_unique
    ON users(ai_panel_role) WHERE ai_panel_role IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gam_ai_panel_initial_reference_unique
    ON gam_transactions(reference_id) WHERE category = 'ai_panel_initial';
CREATE UNIQUE INDEX IF NOT EXISTS gam_ai_panel_initial_user_unique
    ON gam_transactions(user_id) WHERE category = 'ai_panel_initial';
CREATE TABLE IF NOT EXISTS official_panel_bet_audits (
    id SERIAL PRIMARY KEY,
    bet_id INTEGER NOT NULL UNIQUE REFERENCES bets(id),
    persona_key TEXT NOT NULL CHECK (persona_key IN (${ROLES_SQL})),
    user_id INTEGER NOT NULL REFERENCES users(id),
    issue_id INTEGER NOT NULL REFERENCES issues(id),
    resolution_key TEXT NOT NULL,
    kst_day DATE NOT NULL,
    amount INTEGER NOT NULL CHECK (amount = 100),
    choice TEXT NOT NULL CHECK (choice IN ('Yes', 'No')),
    actor_admin_id INTEGER REFERENCES admins(id),
    rationale TEXT NOT NULL CHECK (length(btrim(rationale)) > 0),
    evidence_at TIMESTAMPTZ NOT NULL,
    source_urls JSONB NOT NULL CHECK (jsonb_typeof(source_urls) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(user_id, issue_id)
);
CREATE OR REPLACE FUNCTION protect_official_panel_bet_audit()
RETURNS TRIGGER AS $$ BEGIN
    RAISE EXCEPTION 'Official panel bet audits are append-only';
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS official_panel_bet_audit_immutable ON official_panel_bet_audits;
CREATE TRIGGER official_panel_bet_audit_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON official_panel_bet_audits
    FOR EACH STATEMENT EXECUTE FUNCTION protect_official_panel_bet_audit();
CREATE OR REPLACE FUNCTION validate_official_panel_bet_audit()
RETURNS TRIGGER AS $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM bets b JOIN users u ON u.id = b.user_id
        WHERE b.id = NEW.bet_id AND b.user_id = NEW.user_id
          AND b.issue_id = NEW.issue_id AND u.ai_panel_role = NEW.persona_key
          AND b.choice = NEW.choice AND b.amount = NEW.amount
    ) THEN
        RAISE EXCEPTION 'Official panel audit does not match panel bet identity';
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS official_panel_bet_audit_identity ON official_panel_bet_audits;
CREATE TRIGGER official_panel_bet_audit_identity
    BEFORE INSERT ON official_panel_bet_audits
    FOR EACH ROW EXECUTE FUNCTION validate_official_panel_bet_audit();
`;

async function ensureOfficialPanelSchema(dependencies = {}) {
    const getClient = dependencies.getClient || require('./postgres').getClient;
    const client = await getClient();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [PANEL_LOCK]);
        await client.query(OFFICIAL_PANEL_SCHEMA_SQL);
        await client.query('COMMIT');
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) { /* preserve original error */ }
        throw error;
    } finally { client.release(); }
}

module.exports = { ensureOfficialPanelSchema, OFFICIAL_PANEL_SCHEMA_SQL, PANEL_LOCK };
