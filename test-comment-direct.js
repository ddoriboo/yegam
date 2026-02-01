const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: { rejectUnauthorized: false }
});

async function testComment() {
    try {
        await client.connect();
        console.log('Connected');

        const userId = 94; // HeedungBot
        const issueId = 124; // 야니스 이슈
        const content = '🤖 HeedungBot: NO에 1,000 GAM 베팅했습니다! 야니스는 밀워키 맨이에요.';

        // Create comment
        const result = await client.query(`
            INSERT INTO comments (issue_id, user_id, content, created_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING id, content, created_at
        `, [issueId, userId, content]);

        console.log('✅ Comment created:', result.rows[0]);

        // Update issue comment count
        await client.query(`
            UPDATE issues SET comment_count = COALESCE(comment_count, 0) + 1 WHERE id = $1
        `, [issueId]);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

testComment();
