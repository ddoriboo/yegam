const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: { rejectUnauthorized: false }
});

async function checkAllTables() {
    try {
        await client.connect();
        
        // 주요 테이블들
        const tables = [
            'users',
            'agents', 
            'issues',
            'bets',
            'comments',
            'discussion_posts',
            'discussion_comments',
            'discussion_post_likes',
            'discussion_comment_likes'
        ];

        for (const table of tables) {
            const result = await client.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = $1
                ORDER BY ordinal_position;
            `, [table]);
            
            console.log(`\n=== ${table.toUpperCase()} ===`);
            if (result.rows.length === 0) {
                console.log('  (table not found)');
            } else {
                result.rows.forEach(r => {
                    const nullable = r.is_nullable === 'YES' ? '?' : '';
                    console.log(`  ${r.column_name}${nullable}: ${r.data_type}`);
                });
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await client.end();
    }
}

checkAllTables();
