const { initDatabase, getDB } = require('./database/database');

async function migrate() {
    await initDatabase();
    const db = getDB();
    
    console.log('Starting database migration...');
    
    // Check if columns exist
    const checkColumns = [
        { name: 'result', sql: "ALTER TABLE issues ADD COLUMN result TEXT DEFAULT NULL" },
        { name: 'decided_by', sql: "ALTER TABLE issues ADD COLUMN decided_by INTEGER DEFAULT NULL" },
        { name: 'decided_at', sql: "ALTER TABLE issues ADD COLUMN decided_at DATETIME DEFAULT NULL" },
        { name: 'decision_reason', sql: "ALTER TABLE issues ADD COLUMN decision_reason TEXT DEFAULT NULL" }
    ];
    
    for (const column of checkColumns) {
        try {
            await new Promise((resolve, reject) => {
                db.run(column.sql, (err) => {
                    if (err) {
                        if (err.message.includes('duplicate column name')) {
                            console.log(`✅ Column ${column.name} already exists`);
                        } else {
                            console.error(`❌ Error adding column ${column.name}:`, err.message);
                        }
                    } else {
                        console.log(`✅ Added column ${column.name}`);
                    }
                    resolve();
                });
            });
        } catch (error) {
            console.error(`Error with column ${column.name}:`, error);
        }
    }
    
    // Create rewards table if it doesn't exist
    const createRewardsTable = `
        CREATE TABLE IF NOT EXISTS rewards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            issue_id INTEGER NOT NULL,
            bet_id INTEGER NOT NULL,
            reward_amount INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (issue_id) REFERENCES issues (id),
            FOREIGN KEY (bet_id) REFERENCES bets (id)
        )
    `;
    
    await new Promise((resolve, reject) => {
        db.run(createRewardsTable, (err) => {
            if (err) {
                console.error('❌ Error creating rewards table:', err.message);
            } else {
                console.log('✅ Rewards table created/verified');
            }
            resolve();
        });
    });
    
    console.log('Migration completed!');
    process.exit(0);
}

migrate().catch(console.error);