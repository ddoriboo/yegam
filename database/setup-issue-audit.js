const fs = require('fs');
const path = require('path');
const { query } = require('./database');

async function setupIssueAuditSystem() {
    console.log('🔐 이슈 감사 시스템 설정을 시작합니다...');
    
    try {
        // SQL 파일 읽기
        const sqlPath = path.join(__dirname, 'create-audit-system.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // SQL 문을 세미콜론으로 분리
        const statements = sql
            .split(';')
            .map(statement => statement.trim())
            .filter(statement => statement && !statement.startsWith('--'));
        
        console.log(`📋 ${statements.length}개의 SQL 문을 실행합니다...`);
        
        // 각 SQL 문을 순차적으로 실행
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement) {
                try {
                    await query(statement);
                    console.log(`✅ SQL 문 ${i + 1}/${statements.length} 완료`);
                } catch (error) {
                    console.error(`❌ SQL 문 ${i + 1} 실행 실패:`, error.message);
                    console.error(`문제가 된 SQL:`, statement);
                }
            }
        }
        
        // 감사 시스템 활성화
        console.log('🚀 감사 시스템 활성화 중...');
        
        // 기본 규칙 삽입
        await query(`
            INSERT INTO issue_change_rules (rule_name, rule_type, field_name, restriction_data)
            VALUES 
                ('deadline_change_frequency', 'CHANGE_FREQUENCY', 'end_date', '{"max_changes_per_hour": 2}'),
                ('post_resolution_protection', 'FIELD_PROTECTION', 'end_date', '{"prevent_after_result": true}'),
                ('critical_field_tracking', 'FIELD_PROTECTION', 'status', '{"log_all_changes": true}')
            ON CONFLICT (rule_name) DO NOTHING
        `);
        
        console.log('✅ 이슈 감사 시스템 설정 완료!');
        console.log('🔍 이제 모든 이슈 변경 사항이 추적됩니다.');
        console.log('📊 관리자 페이지에서 감사 로그를 확인할 수 있습니다.');
        
    } catch (error) {
        console.error('❌ 감사 시스템 설정 실패:', error);
        throw error;
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    setupIssueAuditSystem()
        .then(() => {
            console.log('🎉 설정 완료! 프로세스를 종료합니다.');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 설정 실패:', error);
            process.exit(1);
        });
}

module.exports = setupIssueAuditSystem;