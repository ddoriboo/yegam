require('dotenv').config();
const { Pool } = require('pg');

// PostgreSQL 연결 설정
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString: connectionString,
    ssl: connectionString && (connectionString.includes('railway') || connectionString.includes('postgres://')) 
         ? { rejectUnauthorized: false } : false
});

async function showDatabaseInfo() {
    try {
        console.log('📊 데이터베이스 정보 조회 중...\n');
        
        // 모든 테이블 목록
        const tables = await pool.query(`
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public' 
            ORDER BY tablename;
        `);
        
        console.log('📋 테이블 목록:');
        for (const table of tables.rows) {
            console.log(`  - ${table.tablename}`);
        }
        
        // 각 테이블의 행 수
        console.log('\n📈 테이블별 데이터 수:');
        for (const table of tables.rows) {
            const count = await pool.query(`SELECT COUNT(*) FROM ${table.tablename}`);
            console.log(`  - ${table.tablename}: ${count.rows[0].count}개`);
        }
        
        // 사용자 통계
        const userStats = await pool.query(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
                AVG(gam) as avg_gam,
                MAX(gam) as max_gam
            FROM users
        `);
        
        console.log('\n👥 사용자 통계:');
        console.log(`  - 총 사용자: ${userStats.rows[0].total_users}명`);
        console.log(`  - 활성 사용자: ${userStats.rows[0].active_users}명`);
        console.log(`  - 평균 GAM: ${Math.round(userStats.rows[0].avg_gam || 0)}`);
        console.log(`  - 최대 GAM: ${userStats.rows[0].max_gam || 0}`);
        
        // 이슈 통계
        const issueStats = await pool.query(`
            SELECT 
                COUNT(*) as total_issues,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_issues,
                COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_issues
            FROM issues
        `);
        
        console.log('\n📌 이슈 통계:');
        console.log(`  - 총 이슈: ${issueStats.rows[0].total_issues}개`);
        console.log(`  - 진행중: ${issueStats.rows[0].active_issues}개`);
        console.log(`  - 종료됨: ${issueStats.rows[0].resolved_issues}개`);
        
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
    } finally {
        await pool.end();
    }
}

showDatabaseInfo();