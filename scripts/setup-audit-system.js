/**
 * Setup Audit System Script
 * 감사 시스템 데이터베이스 설정 스크립트
 */

const fs = require('fs');
const path = require('path');

async function setupAuditSystem() {
    try {
        // 환경변수 로드
        require('dotenv').config();
        
        console.log('🔧 감사 시스템 설정 시작...');
        
        // PostgreSQL 클라이언트 직접 생성
        const { Client } = require('pg');
        const client = new Client({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
        
        await client.connect();
        console.log('✅ 데이터베이스 연결 성공');
        
        // SQL 스크립트 읽기
        const sqlPath = path.join(__dirname, '../database/create-audit-system.sql');
        const sqlScript = fs.readFileSync(sqlPath, 'utf8');
        
        // SQL 스크립트를 개별 문장으로 분할
        const statements = sqlScript
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        console.log(`📝 ${statements.length}개의 SQL 문장 실행 중...`);
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            
            if (statement) {
                try {
                    console.log(`실행 중: ${i + 1}/${statements.length} - ${statement.substring(0, 50)}...`);
                    await client.query(statement);
                } catch (error) {
                    // 일부 오류는 무시 (이미 존재하는 함수/테이블 등)
                    if (error.code === '42P07' || // relation already exists
                        error.code === '42723' || // function already exists
                        error.code === '23505' || // unique violation
                        error.code === '42P01') { // relation does not exist (for DROP statements)
                        console.log(`⚠️ 경고 (무시됨): ${error.message}`);
                    } else {
                        console.error(`❌ SQL 실행 오류: ${error.message}`);
                        console.error(`문장: ${statement.substring(0, 100)}...`);
                        throw error;
                    }
                }
            }
        }
        
        // 설정 확인
        const verificationQueries = [
            'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = \'issue_audit_logs\'',
            'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = \'suspicious_activity_alerts\'',
            'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = \'issue_change_rules\'',
            'SELECT COUNT(*) as count FROM issue_change_rules WHERE is_active = true'
        ];
        
        console.log('\n🔍 설정 검증 중...');
        for (const query of verificationQueries) {
            try {
                const result = await client.query(query);
                console.log(`✅ ${query.substring(0, 50)}... : ${result.rows[0].count}`);
            } catch (error) {
                console.log(`❌ ${query.substring(0, 50)}... : ${error.message}`);
            }
        }
        
        await client.end();
        
        console.log('\n✅ 감사 시스템 설정 완료');
        console.log('📊 설정된 구성요소:');
        console.log('- issue_audit_logs 테이블: 모든 이슈 변경사항 추적');
        console.log('- suspicious_activity_alerts 테이블: 의심스러운 활동 알림');
        console.log('- issue_change_rules 테이블: 변경 제한 규칙');
        console.log('- track_issue_changes() 트리거 함수: 자동 변경 추적');
        console.log('- detect_suspicious_patterns() 함수: 패턴 감지');
        console.log('- validate_issue_change() 함수: 변경 유효성 검사');
        console.log('- issue_audit_summary 뷰: 감사 로그 요약');
        console.log('- 기본 제한 규칙 4개');
        
        console.log('\n🚀 감사 시스템이 활성화되었습니다!');
        console.log('   모든 이슈 변경사항이 자동으로 추적됩니다.');
        console.log('   의심스러운 활동은 자동으로 감지됩니다.');
        console.log('   관리자 페이지에서 /admin-audit.html 로 접근 가능합니다.');
        
    } catch (error) {
        console.error('❌ 감사 시스템 설정 실패:', error);
        process.exit(1);
    }
}

setupAuditSystem();