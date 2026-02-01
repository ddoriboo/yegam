const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        await client.connect();
        console.log('Connected to Railway PostgreSQL');

        // 1. Create agents table
        await client.query(`
            CREATE TABLE IF NOT EXISTS agents (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                description TEXT,
                api_key VARCHAR(64) UNIQUE NOT NULL,
                claim_code VARCHAR(32) UNIQUE,
                twitter_handle VARCHAR(50),
                status VARCHAR(20) DEFAULT 'pending_claim',
                user_id INTEGER REFERENCES users(id),
                initial_gam INTEGER DEFAULT 10000,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                verified_at TIMESTAMP WITH TIME ZONE,
                last_active_at TIMESTAMP WITH TIME ZONE,
                total_bets INTEGER DEFAULT 0,
                total_wins INTEGER DEFAULT 0,
                total_posts INTEGER DEFAULT 0,
                total_comments INTEGER DEFAULT 0
            );
        `);
        console.log('✅ agents table created');

        // 2. Create indexes
        await client.query(`CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_agents_claim_code ON agents(claim_code);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);`);
        console.log('✅ indexes created');

        // 3. Add is_agent column to users
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_agent BOOLEAN DEFAULT false;
        `);
        console.log('✅ is_agent column added to users');

        console.log('🎉 Migration complete!');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
    } finally {
        await client.end();
    }
}

migrate();
