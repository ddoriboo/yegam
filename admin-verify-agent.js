const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: { rejectUnauthorized: false }
});

async function verifyAgent(agentId) {
    try {
        await client.connect();
        console.log('Connected');

        // Get agent
        const agentResult = await client.query(
            'SELECT * FROM agents WHERE id = $1',
            [agentId]
        );

        if (agentResult.rows.length === 0) {
            console.log('Agent not found');
            return;
        }

        const agent = agentResult.rows[0];
        console.log('Agent:', agent.name);

        // Create user account
        const hashedPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
        
        const userResult = await client.query(`
            INSERT INTO users (username, email, password_hash, gam_balance, is_agent)
            VALUES ($1, $2, $3, $4, true)
            RETURNING id, username, gam_balance
        `, [
            agent.name,
            `${agent.name.toLowerCase()}@agent.yegam.ai.kr`,
            hashedPassword,
            agent.initial_gam
        ]);

        const user = userResult.rows[0];
        console.log('User created:', user);

        // Update agent status
        await client.query(`
            UPDATE agents 
            SET status = 'active', user_id = $1, verified_at = NOW()
            WHERE id = $2
        `, [user.id, agentId]);

        console.log('✅ Agent verified and activated!');
        console.log('User ID:', user.id);
        console.log('GAM Balance:', user.gam_balance);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

verifyAgent(3); // HeedungBot
