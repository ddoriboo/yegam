require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPool, initPostgreSQL } = require('./postgres');

async function setupVisitorTracking() {
    let client;
    try {
        console.log('방문자 트래킹 시스템 설정 시작...');
        
        // PostgreSQL 초기화
        await initPostgreSQL();
        const pool = getPool();
        client = await pool.connect();
        
        // SQL 파일 읽기
        const sqlPath = path.join(__dirname, 'create-visitor-tracking.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // SQL 실행
        await client.query(sql);
        
        console.log('✅ 방문자 트래킹 테이블 생성 완료');
        console.log('✅ 인덱스 생성 완료');
        console.log('✅ 통계 뷰 및 함수 생성 완료');
        
        // 테이블 확인
        const result = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'visitor_tracking'
            );
        `);
        
        if (result.rows[0].exists) {
            console.log('✅ 방문자 트래킹 시스템 설정 성공!');
        } else {
            throw new Error('테이블 생성 확인 실패');
        }
        
    } catch (error) {
        console.error('❌ 방문자 트래킹 시스템 설정 실패:', error);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
        // process.exit() 를 호출하여 연결 종료
        process.exit(0);
    }
}

setupVisitorTracking();