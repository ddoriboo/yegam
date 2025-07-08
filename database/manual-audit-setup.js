const { query } = require('./database');

async function setupAuditSystem() {
    console.log('🔐 이슈 감사 시스템 수동 설정 시작...');
    
    try {
        // 1. 이슈 감사 로그 테이블 생성
        console.log('📋 감사 로그 테이블 생성 중...');
        await query(`
            CREATE TABLE IF NOT EXISTS issue_audit_logs (
                id SERIAL PRIMARY KEY,
                issue_id INTEGER,
                user_id INTEGER,
                admin_id INTEGER,
                action VARCHAR(50) NOT NULL,
                field_name VARCHAR(100),
                old_value TEXT,
                new_value TEXT,
                change_source VARCHAR(50) DEFAULT 'manual',
                ip_address TEXT,
                user_agent TEXT,
                session_id VARCHAR(255),
                change_reason TEXT,
                validation_status VARCHAR(20) DEFAULT 'valid',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                metadata JSONB
            )
        `);
        
        // 2. 의심스러운 활동 알림 테이블 생성
        console.log('🚨 의심스러운 활동 알림 테이블 생성 중...');
        await query(`
            CREATE TABLE IF NOT EXISTS suspicious_activity_alerts (
                id SERIAL PRIMARY KEY,
                alert_type VARCHAR(50) NOT NULL,
                severity VARCHAR(20) DEFAULT 'medium',
                description TEXT NOT NULL,
                related_user_id INTEGER,
                related_admin_id INTEGER,
                related_issue_ids INTEGER[],
                detection_data JSONB,
                status VARCHAR(20) DEFAULT 'open',
                resolved_by INTEGER,
                resolved_at TIMESTAMP,
                resolution_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 3. 이슈 변경 규칙 테이블 생성
        console.log('📏 이슈 변경 규칙 테이블 생성 중...');
        await query(`
            CREATE TABLE IF NOT EXISTS issue_change_rules (
                id SERIAL PRIMARY KEY,
                rule_name VARCHAR(100) NOT NULL UNIQUE,
                rule_type VARCHAR(50) NOT NULL,
                field_name VARCHAR(100),
                restriction_data JSONB NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 4. 인덱스 생성
        console.log('🔍 인덱스 생성 중...');
        await query(`CREATE INDEX IF NOT EXISTS idx_issue_audit_logs_issue_id ON issue_audit_logs(issue_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_issue_audit_logs_created_at ON issue_audit_logs(created_at)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_issue_audit_logs_action ON issue_audit_logs(action)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_suspicious_activity_status ON suspicious_activity_alerts(status)`);
        
        // 5. 기본 규칙 삽입
        console.log('⚙️ 기본 규칙 설정 중...');
        await query(`
            INSERT INTO issue_change_rules (rule_name, rule_type, field_name, restriction_data)
            VALUES 
                ('deadline_change_frequency', 'CHANGE_FREQUENCY', 'end_date', '{"max_changes_per_hour": 2}'),
                ('post_resolution_protection', 'FIELD_PROTECTION', 'end_date', '{"prevent_after_result": true}'),
                ('critical_field_tracking', 'FIELD_PROTECTION', 'status', '{"log_all_changes": true}')
            ON CONFLICT (rule_name) DO NOTHING
        `);
        
        // 6. 이슈 변경 추적 함수 생성
        console.log('🔧 추적 함수 생성 중...');
        await query(`
            CREATE OR REPLACE FUNCTION track_issue_changes()
            RETURNS TRIGGER AS $$
            DECLARE
                change_count INTEGER;
            BEGIN
                IF TG_OP = 'UPDATE' THEN
                    -- 마감시간 변경 추적
                    IF OLD.end_date IS DISTINCT FROM NEW.end_date THEN
                        INSERT INTO issue_audit_logs (
                            issue_id, action, field_name, old_value, new_value, 
                            change_source, created_at, metadata
                        ) VALUES (
                            NEW.id, 'DEADLINE_CHANGE', 'end_date', OLD.end_date::TEXT, NEW.end_date::TEXT,
                            'database_trigger', NOW(),
                            jsonb_build_object(
                                'trigger_operation', TG_OP,
                                'table_name', TG_TABLE_NAME,
                                'time_diff_minutes', EXTRACT(EPOCH FROM (NEW.end_date - OLD.end_date))/60
                            )
                        );
                        
                        -- 1시간 내 변경 횟수 확인
                        SELECT COUNT(*) INTO change_count
                        FROM issue_audit_logs
                        WHERE issue_id = NEW.id
                        AND field_name = 'end_date'
                        AND created_at > NOW() - INTERVAL '1 hour';
                        
                        -- 3회 이상 변경 시 알림
                        IF change_count >= 3 THEN
                            INSERT INTO suspicious_activity_alerts (
                                alert_type, severity, description, related_issue_ids,
                                detection_data, created_at
                            ) VALUES (
                                'RAPID_DEADLINE_CHANGES', 'high',
                                format('이슈 ID %s의 마감시간이 1시간 내 %s회 변경됨', NEW.id, change_count),
                                ARRAY[NEW.id],
                                jsonb_build_object(
                                    'issue_id', NEW.id,
                                    'change_count', change_count,
                                    'time_window', '1 hour',
                                    'latest_change', NEW.end_date
                                ),
                                NOW()
                            );
                        END IF;
                    END IF;
                    
                    -- 상태 변경 추적
                    IF OLD.status IS DISTINCT FROM NEW.status THEN
                        INSERT INTO issue_audit_logs (
                            issue_id, action, field_name, old_value, new_value, 
                            change_source, created_at, metadata
                        ) VALUES (
                            NEW.id, 'STATUS_CHANGE', 'status', OLD.status, NEW.status,
                            'database_trigger', NOW(),
                            jsonb_build_object(
                                'trigger_operation', TG_OP,
                                'table_name', TG_TABLE_NAME
                            )
                        );
                    END IF;
                END IF;
                
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        // 7. 트리거 생성
        console.log('🎯 트리거 생성 중...');
        await query(`
            DROP TRIGGER IF EXISTS issue_changes_trigger ON issues;
            CREATE TRIGGER issue_changes_trigger
                AFTER UPDATE ON issues
                FOR EACH ROW
                EXECUTE FUNCTION track_issue_changes();
        `);
        
        // 8. 감사 로그 뷰 생성
        console.log('👁️ 감사 로그 뷰 생성 중...');
        await query(`
            CREATE OR REPLACE VIEW issue_audit_summary AS
            SELECT 
                ial.id,
                ial.issue_id,
                i.title as issue_title,
                ial.action,
                ial.field_name,
                ial.old_value,
                ial.new_value,
                ial.change_source,
                ial.ip_address,
                ial.created_at,
                ial.metadata,
                u.username as user_name,
                a.username as admin_name
            FROM issue_audit_logs ial
            LEFT JOIN issues i ON ial.issue_id = i.id
            LEFT JOIN users u ON ial.user_id = u.id
            LEFT JOIN admins a ON ial.admin_id = a.id
            ORDER BY ial.created_at DESC;
        `);
        
        console.log('✅ 이슈 감사 시스템 수동 설정 완료!');
        console.log('🔍 이제 모든 이슈 변경 사항이 추적됩니다.');
        console.log('🚨 의심스러운 활동은 자동으로 감지됩니다.');
        console.log('📊 관리자는 감사 로그를 확인할 수 있습니다.');
        
        return true;
        
    } catch (error) {
        console.error('❌ 감사 시스템 설정 실패:', error);
        throw error;
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    setupAuditSystem()
        .then(() => {
            console.log('🎉 설정 완료! 프로세스를 종료합니다.');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 설정 실패:', error);
            process.exit(1);
        });
}

module.exports = setupAuditSystem;