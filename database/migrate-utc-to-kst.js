/**
 * UTC 데이터를 KST로 변환하는 마이그레이션
 * 기존 TIMESTAMPTZ 데이터가 UTC로 저장된 것을 KST로 변환
 */

const { Pool } = require('pg');

async function migrateUTCtoKST() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
    });
    
    try {
        console.log('🔄 UTC → KST 데이터 마이그레이션 시작...');
        
        // 1. 현재 데이터 상태 확인
        const currentData = await pool.query(`
            SELECT id, title, end_date, 
                   end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul' as kst_end_date
            FROM issues 
            WHERE status = 'active' 
            ORDER BY id 
            LIMIT 5
        `);
        
        console.log('📊 현재 데이터 샘플:');
        currentData.rows.forEach(row => {
            console.log(`ID ${row.id}: "${row.title}"`);
            console.log(`  UTC: ${row.end_date}`);
            console.log(`  KST: ${row.kst_end_date}`);
        });
        
        // 2. 사용자 확인
        console.log('\n⚠️  주의: 이 마이그레이션은 기존 시간 데이터를 변경합니다.');
        console.log('계속 진행하려면 아래 명령을 실행하세요:');
        console.log('node database/migrate-utc-to-kst.js --confirm');
        
        // 3. 확인 플래그가 있는 경우에만 실제 마이그레이션 수행
        if (process.argv.includes('--confirm')) {
            await pool.query('BEGIN');
            
            // 모든 issues 테이블의 timestamp 컬럼들을 KST로 변환
            const updateResult = await pool.query(`
                UPDATE issues 
                SET 
                    end_date = end_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul',
                    created_at = created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul',
                    updated_at = updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul',
                    decided_at = CASE 
                        WHEN decided_at IS NOT NULL 
                        THEN decided_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul' 
                        ELSE NULL 
                    END
                WHERE status = 'active'
            `);
            
            console.log(`✅ ${updateResult.rowCount}개 이슈의 시간 데이터가 KST로 변환되었습니다.`);
            
            // 변환 결과 확인
            const verifyData = await pool.query(`
                SELECT id, title, end_date
                FROM issues 
                WHERE status = 'active' 
                ORDER BY id 
                LIMIT 5
            `);
            
            console.log('🔍 변환 결과 확인:');
            verifyData.rows.forEach(row => {
                console.log(`ID ${row.id}: "${row.title}" → ${row.end_date}`);
            });
            
            await pool.query('COMMIT');
            console.log('✅ 마이그레이션 완료!');
        }
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('❌ 마이그레이션 실패:', error);
    } finally {
        await pool.end();
    }
}

// 실행
migrateUTCtoKST();