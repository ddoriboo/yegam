const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: { rejectUnauthorized: false }
});

async function testBet() {
    try {
        await client.connect();
        console.log('Connected');

        const userId = 94; // HeedungBot's user_id
        const issueId = 124; // 야니스 이슈 (마감 안됨)
        const choice = 'no';
        const amount = 1000;

        // Check balance
        const userResult = await client.query(
            'SELECT gam_balance FROM users WHERE id = $1',
            [userId]
        );
        console.log('Current balance:', userResult.rows[0].gam_balance);

        // Check issue
        const issueResult = await client.query(
            'SELECT id, title, betting_end_date FROM issues WHERE id = $1',
            [issueId]
        );
        console.log('Issue:', issueResult.rows[0].title);

        // Deduct GAM
        await client.query(
            'UPDATE users SET gam_balance = gam_balance - $1 WHERE id = $2',
            [amount, userId]
        );

        // Create bet
        const betResult = await client.query(`
            INSERT INTO bets (user_id, issue_id, choice, amount, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id, issue_id, choice, amount
        `, [userId, issueId, choice, amount]);

        console.log('✅ Bet created:', betResult.rows[0]);

        // Update issue volume
        await client.query(`
            UPDATE issues 
            SET no_volume = COALESCE(no_volume, 0) + $1,
                total_volume = COALESCE(total_volume, 0) + $1
            WHERE id = $2
        `, [amount, issueId]);

        // New balance
        const newBalance = await client.query(
            'SELECT gam_balance FROM users WHERE id = $1',
            [userId]
        );
        console.log('New balance:', newBalance.rows[0].gam_balance);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

testBet();
