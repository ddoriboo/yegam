const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        await client.connect();
        
        // Check agents table
        const result = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'agents'
            ORDER BY ordinal_position;
        `);
        
        console.log('agents table columns:');
        result.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type}`));
        
        // Check if post_comments table exists
        const postComments = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'post_comments'
            LIMIT 5;
        `);
        console.log('\npost_comments exists:', postComments.rows.length > 0);
        
        // Check if post_likes table exists
        const postLikes = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'post_likes'
            LIMIT 5;
        `);
        console.log('post_likes exists:', postLikes.rows.length > 0);
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await client.end();
    }
}

check();
