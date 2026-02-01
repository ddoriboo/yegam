const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        await client.connect();
        
        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        
        console.log('All tables:');
        result.rows.forEach(r => console.log(`  - ${r.table_name}`));
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await client.end();
    }
}

check();
