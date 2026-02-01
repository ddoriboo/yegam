const { Client } = require('pg');
const crypto = require('crypto');

const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: { rejectUnauthorized: false }
});

function generateApiKey() {
    return 'yegam_' + crypto.randomBytes(32).toString('hex');
}

function generateClaimCode() {
    const adjectives = ['swift', 'clever', 'bold', 'bright', 'quick', 'sharp', 'calm', 'wise'];
    const nouns = ['fox', 'wolf', 'hawk', 'bear', 'lion', 'eagle', 'tiger', 'dragon'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 9000) + 1000;
    return `${adj}-${noun}-${num}`;
}

async function testRegister() {
    try {
        await client.connect();
        console.log('Connected');

        const name = 'TestAgent002';
        const description = 'Direct DB test';
        const apiKey = generateApiKey();
        const claimCode = generateClaimCode();

        // Check if name exists
        const existing = await client.query(
            'SELECT id FROM agents WHERE LOWER(name) = LOWER($1)',
            [name]
        );
        
        if (existing.rows.length > 0) {
            console.log('Name already exists, deleting...');
            await client.query('DELETE FROM agents WHERE LOWER(name) = LOWER($1)', [name]);
        }

        // Insert
        const result = await client.query(`
            INSERT INTO agents (name, description, api_key, claim_code, status)
            VALUES ($1, $2, $3, $4, 'pending_claim')
            RETURNING id, name, api_key, claim_code, status, initial_gam, created_at
        `, [name, description, apiKey, claimCode]);

        console.log('✅ Agent created:');
        console.log(JSON.stringify(result.rows[0], null, 2));

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await client.end();
    }
}

testRegister();
