const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: { rejectUnauthorized: false }
});

async function fix() {
    try {
        await client.connect();
        console.log('Connected');

        // Increase api_key column length
        await client.query(`
            ALTER TABLE agents ALTER COLUMN api_key TYPE VARCHAR(128);
        `);
        console.log('✅ api_key column increased to VARCHAR(128)');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

fix();
