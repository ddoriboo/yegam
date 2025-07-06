require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function addOAuthColumns() {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
        console.error('❌ DATABASE_URL 환경변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: connectionString,
        ssl: connectionString.includes('railway') || connectionString.includes('postgres://') 
             ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🚀 OAuth 컬럼 추가 시작...');
        
        // SQL 파일 읽기
        const sqlFile = path.join(__dirname, '../database/add-oauth-columns.sql');
        const sql = fs.readFileSync(sqlFile, 'utf8');
        
        // SQL 실행
        await pool.query(sql);
        
        console.log('✅ OAuth 컬럼 추가 완료!');
        
        // 현재 테이블 스키마 확인
        const result = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        console.log('\n📋 업데이트된 users 테이블 스키마:');
        result.rows.forEach(row => {
            console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
        });
        
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

addOAuthColumns();