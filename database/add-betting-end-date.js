/**
 * 베팅 마감일 분리 마이그레이션
 * - betting_end_date 컬럼 추가
 * - 기존 데이터는 end_date 값으로 초기화
 */

const { Pool } = require('pg');
require('dotenv').config();

async function migrate() {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
        console.error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }
    
    const pool = new Pool({
        connectionString,
        ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : false
    });
    
    const client = await pool.connect();
    
    try {
        console.log('🚀 베팅 마감일 분리 마이그레이션 시작...\n');
        
        await client.query('BEGIN');
        
        // 1. betting_end_date 컬럼 추가
        console.log('1️⃣ betting_end_date 컬럼 추가 중...');
        await client.query(`
            ALTER TABLE issues 
            ADD COLUMN IF NOT EXISTS betting_end_date TIMESTAMPTZ
        `);
        console.log('   ✅ 컬럼 추가 완료\n');
        
        // 2. 기존 데이터 마이그레이션 (betting_end_date = end_date)
        console.log('2️⃣ 기존 데이터 마이그레이션 중...');
        const result = await client.query(`
            UPDATE issues 
            SET betting_end_date = end_date 
            WHERE betting_end_date IS NULL
        `);
        console.log(`   ✅ ${result.rowCount}개 이슈 업데이트 완료\n`);
        
        // 3. 인덱스 추가
        console.log('3️⃣ 인덱스 추가 중...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_issues_betting_end_date 
            ON issues(betting_end_date)
        `);
        console.log('   ✅ 인덱스 추가 완료\n');
        
        await client.query('COMMIT');
        
        console.log('🎉 마이그레이션 완료!\n');
        console.log('📋 변경 사항:');
        console.log('   - issues 테이블에 betting_end_date 컬럼 추가');
        console.log('   - 기존 이슈들의 betting_end_date를 end_date로 초기화');
        console.log('   - betting_end_date 인덱스 생성\n');
        console.log('💡 이제 이슈 생성 시 베팅 마감일을 별도로 설정할 수 있습니다.');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ 마이그레이션 실패:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

migrate().catch(console.error);
