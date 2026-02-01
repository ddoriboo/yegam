const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        await client.connect();
        
        const result = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users'
            ORDER BY ordinal_position;
        `);
        
        console.log('users table columns:');
        result.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type}`));
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await client.end();
    }
}

check();
