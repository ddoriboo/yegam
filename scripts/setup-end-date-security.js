#!/usr/bin/env node

/**
 * End Date 보안 시스템 초기화 스크립트
 * 
 * 이 스크립트는 다음을 수행합니다:
 * 1. 데이터베이스 트리거 및 테이블 생성
 * 2. 기존 데이터 마이그레이션
 * 3. 보안 정책 적용
 * 4. 시스템 상태 검증
 */

const fs = require('fs');
const path = require('path');
const pool = require('../database/connection');

console.log('🔧 End Date 보안 시스템 초기화 시작...\n');

async function setupEndDateSecurity() {
    const client = await pool.connect();
    
    try {
        console.log('📊 1. 현재 시스템 상태 확인...');
        
        // 현재 이슈 개수 확인
        const issueCountResult = await client.query('SELECT COUNT(*) as count FROM issues');
        const issueCount = parseInt(issueCountResult.rows[0].count);
        console.log(`   - 총 이슈 개수: ${issueCount}`);
        
        // 기존 감사 테이블 존재 여부 확인
        const auditTableExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'end_date_audit_log'
            )
        `);
        const hasAuditTable = auditTableExists.rows[0].exists;
        console.log(`   - 감사 테이블 존재: ${hasAuditTable ? '✅' : '❌'}`);
        
        if (hasAuditTable) {
            const auditCountResult = await client.query('SELECT COUNT(*) as count FROM end_date_audit_log');
            const auditCount = parseInt(auditCountResult.rows[0].count);
            console.log(`   - 기존 감사 로그 개수: ${auditCount}`);
        }
        
        console.log('\n🏗️  2. 데이터베이스 구조 생성...');
        
        // SQL 파일 실행
        const sqlFilePath = path.join(__dirname, '../database/create-end-date-audit.sql');
        
        if (!fs.existsSync(sqlFilePath)) {
            throw new Error(`SQL 파일을 찾을 수 없습니다: ${sqlFilePath}`);
        }
        
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        
        // SQL 파일을 세미콜론으로 분리하여 순차 실행
        const sqlStatements = sqlContent.split(';').filter(stmt => stmt.trim().length > 0);
        
        let executedStatements = 0;
        for (const statement of sqlStatements) {
            const trimmedStatement = statement.trim();
            if (trimmedStatement.length > 0 && !trimmedStatement.startsWith('--')) {
                try {
                    await client.query(trimmedStatement);
                    executedStatements++;
                } catch (error) {
                    // 이미 존재하는 객체는 무시
                    if (!error.message.includes('already exists')) {
                        console.warn(`   - SQL 실행 경고: ${error.message.substring(0, 100)}...`);
                    }
                }
            }
        }
        
        console.log(`   - SQL 문 실행 완료: ${executedStatements}개`);
        
        console.log('\n🔄 3. 기존 데이터 마이그레이션...');
        
        // 기존 이슈들에 대한 초기 감사 로그가 없다면 생성
        const existingLogsResult = await client.query(`
            SELECT COUNT(*) as count FROM end_date_audit_log 
            WHERE change_type = 'INSERT'
        `);
        const existingLogs = parseInt(existingLogsResult.rows[0].count);
        
        if (existingLogs === 0 && issueCount > 0) {
            console.log('   - 기존 이슈들에 대한 초기 감사 로그 생성 중...');
            
            await client.query(`
                INSERT INTO end_date_audit_log (issue_id, old_end_date, new_end_date, changed_by, change_type, change_reason)
                SELECT 
                    id,
                    NULL,
                    end_date,
                    'SYSTEM_MIGRATION',
                    'INSERT',
                    'Initial audit log creation during security system setup'
                FROM issues
                WHERE id NOT IN (SELECT DISTINCT issue_id FROM end_date_audit_log WHERE issue_id IS NOT NULL)
            `);
            
            console.log(`   - ${issueCount}개 이슈에 대한 초기 로그 생성 완료`);
        } else {
            console.log(`   - 초기 로그 이미 존재: ${existingLogs}개`);
        }
        
        console.log('\n🛡️  4. 보안 정책 검증...');
        
        // 트리거 존재 여부 확인
        const triggerResult = await client.query(`
            SELECT COUNT(*) as count FROM information_schema.triggers 
            WHERE trigger_name = 'trigger_track_end_date_changes'
        `);
        const triggerExists = parseInt(triggerResult.rows[0].count) > 0;
        console.log(`   - end_date 변경 트리거: ${triggerExists ? '✅ 활성' : '❌ 비활성'}`);
        
        // 함수 존재 여부 확인
        const functionResult = await client.query(`
            SELECT COUNT(*) as count FROM information_schema.routines 
            WHERE routine_name = 'track_end_date_changes'
        `);
        const functionExists = parseInt(functionResult.rows[0].count) > 0;
        console.log(`   - 감사 함수: ${functionExists ? '✅ 존재' : '❌ 없음'}`);
        
        // 인덱스 존재 여부 확인
        const indexResult = await client.query(`
            SELECT COUNT(*) as count FROM pg_indexes 
            WHERE tablename = 'end_date_audit_log'
        `);
        const indexCount = parseInt(indexResult.rows[0].count);
        console.log(`   - 감사 테이블 인덱스: ${indexCount}개`);
        
        console.log('\n🧪 5. 시스템 테스트...');
        
        // 테스트 이슈 생성 및 수정으로 트리거 동작 확인
        const testTitle = `Security Test ${Date.now()}`;
        const testEndDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        await client.query(`SELECT set_config('app.current_user', 'SETUP_TEST', true)`);
        await client.query(`SELECT set_config('app.change_type', 'SYSTEM_TEST', true)`);
        await client.query(`SELECT set_config('app.change_reason', 'Security system verification test', true)`);
        
        // 테스트 이슈 생성
        const createResult = await client.query(`
            INSERT INTO issues (title, category, description, end_date, created_at, updated_at)
            VALUES ($1, 'Tech', 'Security system test issue', $2, NOW(), NOW())
            RETURNING id
        `, [testTitle, testEndDate]);
        
        const testIssueId = createResult.rows[0].id;
        console.log(`   - 테스트 이슈 생성: ID ${testIssueId}`);
        
        // 트리거가 제대로 동작했는지 확인
        const auditLogResult = await client.query(`
            SELECT * FROM end_date_audit_log 
            WHERE issue_id = $1 AND change_type = 'SYSTEM_TEST'
        `, [testIssueId]);
        
        if (auditLogResult.rows.length > 0) {
            console.log('   - ✅ 트리거 동작 확인 완료');
        } else {
            console.log('   - ❌ 트리거 동작 실패');
        }
        
        // end_date 수정 테스트
        const newEndDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        await client.query(`SELECT set_config('app.change_reason', 'Testing end_date modification', true)`);
        
        await client.query(`
            UPDATE issues SET end_date = $1 WHERE id = $2
        `, [newEndDate, testIssueId]);
        
        // 수정 로그 확인
        const updateLogResult = await client.query(`
            SELECT * FROM end_date_audit_log 
            WHERE issue_id = $1 AND change_type = 'SYSTEM_TEST'
            ORDER BY created_at DESC
        `, [testIssueId]);
        
        if (updateLogResult.rows.length >= 2) {
            console.log('   - ✅ end_date 수정 추적 확인 완료');
        } else {
            console.log('   - ❌ end_date 수정 추적 실패');
        }
        
        // 테스트 이슈 정리
        await client.query('DELETE FROM issues WHERE id = $1', [testIssueId]);
        console.log('   - 테스트 이슈 정리 완료');
        
        console.log('\n📊 6. 설정 완료 상태 요약...');
        
        // 최종 상태 확인
        const finalStats = await Promise.all([
            client.query('SELECT COUNT(*) as count FROM end_date_audit_log'),
            client.query('SELECT COUNT(*) as count FROM issues WHERE status = \'active\''),
            client.query(`
                SELECT COUNT(*) as count FROM end_date_audit_log 
                WHERE created_at > NOW() - INTERVAL '1 minute'
            `)
        ]);
        
        console.log(`   - 총 감사 로그: ${finalStats[0].rows[0].count}개`);
        console.log(`   - 활성 이슈: ${finalStats[1].rows[0].count}개`);
        console.log(`   - 최근 1분간 변경: ${finalStats[2].rows[0].count}개`);
        
        console.log('\n✅ End Date 보안 시스템 초기화 완료!');
        console.log('\n📋 시스템 기능:');
        console.log('   • 모든 end_date 변경 자동 추적');
        console.log('   • 의심스러운 패턴 자동 감지');
        console.log('   • AI 에이전트 차단 시스템');
        console.log('   • 데이터 일관성 자동 복구');
        console.log('   • 실시간 모니터링 대시보드');
        console.log('\n🔗 관련 API:');
        console.log('   • GET /api/admin/audit/dashboard - 모니터링 대시보드');
        console.log('   • GET /api/admin/audit/end-date-logs - 변경 로그 조회');
        console.log('   • POST /api/admin/audit/validate-consistency - 일관성 검증');
        console.log('   • POST /api/admin/audit/trigger-recovery - 수동 복구 실행');
        
    } catch (error) {
        console.error('\n❌ 초기화 실패:', error);
        throw error;
    } finally {
        client.release();
    }
}

// 스크립트가 직접 실행된 경우
if (require.main === module) {
    setupEndDateSecurity()
        .then(() => {
            console.log('\n🎉 초기화가 성공적으로 완료되었습니다!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 초기화 실패:', error);
            process.exit(1);
        });
}

module.exports = { setupEndDateSecurity };