const { initDatabase, getDB } = require('./database/database');

async function updateTestIssue() {
    await initDatabase();
    const db = getDB();
    
    console.log('Updating test issue to past date...');
    
    // 테스트 이슈를 과거 날짜로 수정
    const testIssue = await new Promise((resolve, reject) => {
        db.run(`UPDATE issues SET end_date = '2025-06-18 23:59:59' WHERE id = 4`, function(err) {
            if (err) {
                console.error('❌ Error updating test issue:', err.message);
                reject(err);
            } else {
                console.log('✅ Updated test issue to past date');
                resolve();
            }
        });
    });
    
    // 확인
    const updatedIssue = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM issues WHERE id = 4', (err, issue) => {
            if (err) reject(err);
            else resolve(issue);
        });
    });
    
    console.log('Updated issue:', updatedIssue);
    console.log('Test completed!');
    process.exit(0);
}

updateTestIssue().catch(console.error);