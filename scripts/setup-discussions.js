// Railway PostgreSQL에 discussion 테이블 생성하는 스크립트
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Railway DATABASE_URL 사용 (환경변수에서 가져옴)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function setupDiscussionTables() {
  try {
    console.log('🔄 Railway PostgreSQL 연결 중...');
    
    // SQL 파일 읽기
    const sqlPath = path.join(__dirname, '../database/railway-discussion-setup.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📊 Discussion 테이블 생성 중...');
    
    // SQL 실행
    await pool.query(sql);
    
    console.log('✅ Discussion 테이블 생성 완료!');
    
    // 카테고리 확인
    const result = await pool.query('SELECT * FROM discussion_categories ORDER BY display_order');
    console.log('📋 생성된 카테고리:');
    result.rows.forEach(row => {
      console.log(`  ${row.icon} ${row.name} (${row.color})`);
    });
    
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  } finally {
    await pool.end();
  }
}

// 스크립트 실행
if (require.main === module) {
  setupDiscussionTables();
}

module.exports = { setupDiscussionTables };