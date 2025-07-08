-- Issue Audit System Schema
-- 포괄적인 이슈 변경 추적 및 보안 시스템

-- 이슈 변경 감사 로그 테이블
CREATE TABLE IF NOT EXISTS issue_audit_logs (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER,
    user_id INTEGER REFERENCES users(id),
    admin_id INTEGER REFERENCES admins(id),
    action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, STATUS_CHANGE, DEADLINE_CHANGE
    field_name VARCHAR(100), -- 변경된 필드명 (title, end_date, status 등)
    old_value TEXT, -- 이전 값 (JSON 형태로 저장)
    new_value TEXT, -- 새로운 값 (JSON 형태로 저장)
    change_source VARCHAR(50) DEFAULT 'manual', -- manual, scheduler, api, admin
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    change_reason TEXT, -- 변경 사유
    validation_status VARCHAR(20) DEFAULT 'valid', -- valid, suspicious, flagged
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB -- 추가 메타데이터 (API 호출 정보 등)
);

-- 의심스러운 활동 패턴 감지 테이블
CREATE TABLE IF NOT EXISTS suspicious_activity_alerts (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL, -- RAPID_DEADLINE_CHANGES, BULK_MODIFICATIONS, UNAUTHORIZED_ACCESS
    severity VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    description TEXT NOT NULL,
    related_user_id INTEGER REFERENCES users(id),
    related_admin_id INTEGER REFERENCES admins(id),
    related_issue_ids INTEGER[],
    detection_data JSONB,
    status VARCHAR(20) DEFAULT 'open', -- open, investigating, resolved, false_positive
    resolved_by INTEGER REFERENCES admins(id),
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 이슈 변경 제한 규칙 테이블
CREATE TABLE IF NOT EXISTS issue_change_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) NOT NULL,
    rule_type VARCHAR(50) NOT NULL, -- TIME_RESTRICTION, FIELD_PROTECTION, CHANGE_FREQUENCY
    field_name VARCHAR(100), -- 적용할 필드
    restriction_data JSONB NOT NULL, -- 규칙 설정 (시간 제한, 횟수 제한 등)
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES admins(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_issue_audit_logs_issue_id ON issue_audit_logs(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_audit_logs_user_id ON issue_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_issue_audit_logs_admin_id ON issue_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_issue_audit_logs_action ON issue_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_issue_audit_logs_created_at ON issue_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_issue_audit_logs_field_name ON issue_audit_logs(field_name);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_status ON suspicious_activity_alerts(status);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_severity ON suspicious_activity_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_created_at ON suspicious_activity_alerts(created_at);

-- 이슈 변경 트리거 함수
CREATE OR REPLACE FUNCTION track_issue_changes()
RETURNS TRIGGER AS $$
DECLARE
    changed_fields TEXT[] := ARRAY[]::TEXT[];
    field_name TEXT;
    old_val TEXT;
    new_val TEXT;
    change_count INTEGER;
BEGIN
    -- UPDATE 작업에서만 필드별 변경 추적
    IF TG_OP = 'UPDATE' THEN
        -- 각 필드별 변경 확인 및 로깅
        IF OLD.title IS DISTINCT FROM NEW.title THEN
            INSERT INTO issue_audit_logs (
                issue_id, action, field_name, old_value, new_value, 
                change_source, created_at, metadata
            ) VALUES (
                NEW.id, 'FIELD_UPDATE', 'title', OLD.title, NEW.title,
                'database_trigger', NOW(),
                jsonb_build_object(
                    'trigger_operation', TG_OP,
                    'table_name', TG_TABLE_NAME
                )
            );
        END IF;

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
            
            -- 마감시간 변경 빈도 검사 (지난 1시간 내 3회 이상 변경시 알림)
            SELECT COUNT(*) INTO change_count
            FROM issue_audit_logs 
            WHERE issue_id = NEW.id 
                AND field_name = 'end_date' 
                AND created_at > NOW() - INTERVAL '1 hour';
                
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

        IF OLD.result IS DISTINCT FROM NEW.result THEN
            INSERT INTO issue_audit_logs (
                issue_id, action, field_name, old_value, new_value, 
                change_source, created_at, metadata
            ) VALUES (
                NEW.id, 'RESULT_CHANGE', 'result', OLD.result, NEW.result,
                'database_trigger', NOW(),
                jsonb_build_object(
                    'trigger_operation', TG_OP,
                    'table_name', TG_TABLE_NAME
                )
            );
        END IF;

        IF OLD.category IS DISTINCT FROM NEW.category THEN
            INSERT INTO issue_audit_logs (
                issue_id, action, field_name, old_value, new_value, 
                change_source, created_at, metadata
            ) VALUES (
                NEW.id, 'FIELD_UPDATE', 'category', OLD.category, NEW.category,
                'database_trigger', NOW(),
                jsonb_build_object(
                    'trigger_operation', TG_OP,
                    'table_name', TG_TABLE_NAME
                )
            );
        END IF;

        RETURN NEW;
    END IF;

    -- INSERT 작업
    IF TG_OP = 'INSERT' THEN
        INSERT INTO issue_audit_logs (
            issue_id, action, field_name, old_value, new_value, 
            change_source, created_at, metadata
        ) VALUES (
            NEW.id, 'CREATE', 'full_record', NULL, 
            jsonb_build_object(
                'title', NEW.title,
                'category', NEW.category,
                'end_date', NEW.end_date,
                'status', NEW.status
            )::TEXT,
            'database_trigger', NOW(),
            jsonb_build_object(
                'trigger_operation', TG_OP,
                'table_name', TG_TABLE_NAME
            )
        );
        RETURN NEW;
    END IF;

    -- DELETE 작업
    IF TG_OP = 'DELETE' THEN
        INSERT INTO issue_audit_logs (
            issue_id, action, field_name, old_value, new_value, 
            change_source, created_at, metadata
        ) VALUES (
            OLD.id, 'DELETE', 'full_record', 
            jsonb_build_object(
                'title', OLD.title,
                'category', OLD.category,
                'end_date', OLD.end_date,
                'status', OLD.status
            )::TEXT,
            NULL,
            'database_trigger', NOW(),
            jsonb_build_object(
                'trigger_operation', TG_OP,
                'table_name', TG_TABLE_NAME
            )
        );
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 이슈 테이블에 트리거 설정
DROP TRIGGER IF EXISTS issue_audit_trigger ON issues;
CREATE TRIGGER issue_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON issues
    FOR EACH ROW EXECUTE FUNCTION track_issue_changes();

-- 기본 변경 제한 규칙 삽입
INSERT INTO issue_change_rules (rule_name, rule_type, field_name, restriction_data) VALUES
('마감시간_시간당_변경_제한', 'CHANGE_FREQUENCY', 'end_date', '{"max_changes": 2, "time_window_hours": 1}'),
('마감시간_최소_간격_제한', 'TIME_RESTRICTION', 'end_date', '{"min_interval_minutes": 10}'),
('결과_확정후_수정_금지', 'FIELD_PROTECTION', 'end_date', '{"conditions": ["result_not_null"]}'),
('상태_무결성_보호', 'FIELD_PROTECTION', 'status', '{"allowed_transitions": {"active": ["closed", "resolved"], "closed": ["resolved"], "resolved": []}}')
ON CONFLICT DO NOTHING;

-- 감사 로그 정리를 위한 함수 (90일 이전 로그 삭제)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM issue_audit_logs 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    INSERT INTO issue_audit_logs (
        issue_id, action, field_name, old_value, new_value, 
        change_source, created_at, metadata
    ) VALUES (
        NULL, 'CLEANUP', 'audit_logs', NULL, deleted_count::TEXT,
        'system', NOW(),
        jsonb_build_object(
            'cleanup_date', NOW(),
            'retention_days', 90
        )
    );
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 의심스러운 패턴 감지 함수
CREATE OR REPLACE FUNCTION detect_suspicious_patterns()
RETURNS INTEGER AS $$
DECLARE
    alert_count INTEGER := 0;
    rapid_changes RECORD;
    bulk_changes RECORD;
BEGIN
    -- 1. 급격한 마감시간 변경 패턴 감지 (1일 내 같은 이슈 5회 이상 변경)
    FOR rapid_changes IN
        SELECT issue_id, COUNT(*) as change_count
        FROM issue_audit_logs 
        WHERE field_name = 'end_date' 
            AND created_at > NOW() - INTERVAL '1 day'
        GROUP BY issue_id
        HAVING COUNT(*) >= 5
    LOOP
        INSERT INTO suspicious_activity_alerts (
            alert_type, severity, description, related_issue_ids,
            detection_data
        ) VALUES (
            'RAPID_DEADLINE_CHANGES', 'critical',
            format('이슈 %s의 마감시간이 24시간 내 %s회 변경됨 (의심스러운 활동)', 
                   rapid_changes.issue_id, rapid_changes.change_count),
            ARRAY[rapid_changes.issue_id],
            jsonb_build_object(
                'issue_id', rapid_changes.issue_id,
                'change_count', rapid_changes.change_count,
                'detection_period', '24 hours'
            )
        );
        alert_count := alert_count + 1;
    END LOOP;

    -- 2. 대량 수정 패턴 감지 (1시간 내 10개 이상 이슈 수정)
    FOR bulk_changes IN
        SELECT admin_id, user_id, COUNT(DISTINCT issue_id) as issue_count
        FROM issue_audit_logs 
        WHERE action IN ('UPDATE', 'FIELD_UPDATE', 'DEADLINE_CHANGE')
            AND created_at > NOW() - INTERVAL '1 hour'
        GROUP BY admin_id, user_id
        HAVING COUNT(DISTINCT issue_id) >= 10
    LOOP
        INSERT INTO suspicious_activity_alerts (
            alert_type, severity, description, 
            related_admin_id, related_user_id,
            detection_data
        ) VALUES (
            'BULK_MODIFICATIONS', 'high',
            format('사용자/관리자가 1시간 내 %s개 이슈를 대량 수정함', bulk_changes.issue_count),
            bulk_changes.admin_id,
            bulk_changes.user_id,
            jsonb_build_object(
                'issue_count', bulk_changes.issue_count,
                'time_window', '1 hour',
                'admin_id', bulk_changes.admin_id,
                'user_id', bulk_changes.user_id
            )
        );
        alert_count := alert_count + 1;
    END LOOP;

    RETURN alert_count;
END;
$$ LANGUAGE plpgsql;

-- 이슈 수정 전 유효성 검사 함수
CREATE OR REPLACE FUNCTION validate_issue_change(
    p_issue_id INTEGER,
    p_field_name TEXT,
    p_new_value TEXT,
    p_user_id INTEGER DEFAULT NULL,
    p_admin_id INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    issue_record RECORD;
    rule_record RECORD;
    recent_changes INTEGER;
    validation_result JSONB := '{"valid": true, "errors": []}'::JSONB;
    error_messages TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- 이슈 존재 확인
    SELECT * INTO issue_record FROM issues WHERE id = p_issue_id;
    IF NOT FOUND THEN
        error_messages := array_append(error_messages, '존재하지 않는 이슈입니다.');
        validation_result := jsonb_set(validation_result, '{valid}', 'false'::JSONB);
        validation_result := jsonb_set(validation_result, '{errors}', to_jsonb(error_messages));
        RETURN validation_result;
    END IF;

    -- 결과가 확정된 이슈는 마감시간 변경 불가
    IF p_field_name = 'end_date' AND issue_record.result IS NOT NULL THEN
        error_messages := array_append(error_messages, '결과가 확정된 이슈의 마감시간은 변경할 수 없습니다.');
    END IF;

    -- 마감시간 변경 빈도 제한 확인
    IF p_field_name = 'end_date' THEN
        SELECT COUNT(*) INTO recent_changes
        FROM issue_audit_logs 
        WHERE issue_id = p_issue_id 
            AND field_name = 'end_date' 
            AND created_at > NOW() - INTERVAL '1 hour';
            
        IF recent_changes >= 2 THEN
            error_messages := array_append(error_messages, '마감시간은 1시간에 최대 2회까지만 변경할 수 있습니다.');
        END IF;
    END IF;

    -- 상태 변경 유효성 확인
    IF p_field_name = 'status' THEN
        -- resolved -> active 변경 금지
        IF issue_record.status = 'resolved' AND p_new_value = 'active' THEN
            error_messages := array_append(error_messages, '해결된 이슈는 다시 활성화할 수 없습니다.');
        END IF;
    END IF;

    -- 오류가 있으면 결과 업데이트
    IF array_length(error_messages, 1) > 0 THEN
        validation_result := jsonb_set(validation_result, '{valid}', 'false'::JSONB);
        validation_result := jsonb_set(validation_result, '{errors}', to_jsonb(error_messages));
    END IF;

    RETURN validation_result;
END;
$$ LANGUAGE plpgsql;

-- 감사 로그 조회를 위한 뷰
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
    ial.user_id,
    u.username,
    ial.admin_id,
    a.username as admin_username,
    ial.ip_address,
    ial.validation_status,
    ial.created_at,
    ial.metadata
FROM issue_audit_logs ial
LEFT JOIN issues i ON ial.issue_id = i.id
LEFT JOIN users u ON ial.user_id = u.id
LEFT JOIN admins a ON ial.admin_id = a.id
ORDER BY ial.created_at DESC;

COMMENT ON TABLE issue_audit_logs IS '이슈 변경 감사 로그 - 모든 이슈 수정사항 추적';
COMMENT ON TABLE suspicious_activity_alerts IS '의심스러운 활동 알림 - 자동 패턴 감지';
COMMENT ON TABLE issue_change_rules IS '이슈 변경 규칙 - 수정 제한 사항 정의';
COMMENT ON FUNCTION track_issue_changes() IS '이슈 변경 트리거 함수 - 자동 감사 로그 생성';
COMMENT ON FUNCTION validate_issue_change(INTEGER, TEXT, TEXT, INTEGER, INTEGER) IS '이슈 변경 유효성 검사 함수';
COMMENT ON VIEW issue_audit_summary IS '감사 로그 요약 뷰 - 사용자/관리자 정보 포함';