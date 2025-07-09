-- end_date 변경 추적을 위한 감사 테이블 및 트리거 생성
-- 실행 방법: psql -d your_database -f database/create-end-date-audit.sql

-- 1. end_date 변경 감사 로그 테이블 생성
CREATE TABLE IF NOT EXISTS end_date_audit_log (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER NOT NULL REFERENCES issues(id),
    old_end_date TIMESTAMP WITH TIME ZONE,
    new_end_date TIMESTAMP WITH TIME ZONE,
    changed_by VARCHAR(255),  -- username 또는 시스템명
    change_type VARCHAR(50) NOT NULL,  -- INSERT, UPDATE, SYSTEM, API, AI_AGENT
    change_reason TEXT,  -- 변경 사유
    ip_address INET,  -- 변경 요청 IP
    user_agent TEXT,  -- 브라우저/클라이언트 정보
    request_id VARCHAR(255),  -- 요청 추적용 고유 ID
    session_id VARCHAR(255),  -- 세션 추적용
    suspicious_pattern BOOLEAN DEFAULT FALSE,  -- 의심스러운 패턴 감지
    auto_blocked BOOLEAN DEFAULT FALSE,  -- 자동 차단 여부
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 인덱스를 위한 제약조건
    CONSTRAINT valid_change_type CHECK (change_type IN (
        'INSERT', 'UPDATE', 'SYSTEM', 'API', 'AI_AGENT', 'ADMIN', 'SCHEDULER'
    ))
);

-- 2. 빠른 검색을 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_end_date_audit_issue_id ON end_date_audit_log(issue_id);
CREATE INDEX IF NOT EXISTS idx_end_date_audit_created_at ON end_date_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_end_date_audit_changed_by ON end_date_audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_end_date_audit_change_type ON end_date_audit_log(change_type);
CREATE INDEX IF NOT EXISTS idx_end_date_audit_suspicious ON end_date_audit_log(suspicious_pattern);

-- 3. end_date 변경 추적 트리거 함수 생성
CREATE OR REPLACE FUNCTION track_end_date_changes()
RETURNS TRIGGER AS $$
DECLARE
    change_count INTEGER;
    last_change_time TIMESTAMP WITH TIME ZONE;
    is_suspicious BOOLEAN := FALSE;
    change_frequency INTERVAL;
BEGIN
    -- INSERT 작업의 경우
    IF TG_OP = 'INSERT' THEN
        INSERT INTO end_date_audit_log (
            issue_id, 
            old_end_date, 
            new_end_date, 
            changed_by, 
            change_type,
            change_reason
        ) VALUES (
            NEW.id,
            NULL,
            NEW.end_date,
            COALESCE(current_setting('app.current_user', TRUE), 'SYSTEM'),
            COALESCE(current_setting('app.change_type', TRUE), 'INSERT'),
            COALESCE(current_setting('app.change_reason', TRUE), 'Issue created')
        );
        RETURN NEW;
    END IF;

    -- UPDATE 작업의 경우 - end_date가 실제로 변경된 경우만
    IF TG_OP = 'UPDATE' AND OLD.end_date IS DISTINCT FROM NEW.end_date THEN
        
        -- 최근 1시간 내 변경 횟수 확인 (의심스러운 패턴 감지)
        SELECT COUNT(*), MAX(created_at)
        INTO change_count, last_change_time
        FROM end_date_audit_log 
        WHERE issue_id = NEW.id 
        AND created_at > NOW() - INTERVAL '1 hour';
        
        -- 의심스러운 패턴 감지 로직
        IF change_count >= 3 THEN
            is_suspicious := TRUE;
            
            -- 보안 알림 로그
            RAISE NOTICE 'SECURITY ALERT: Issue % end_date changed % times in 1 hour by %', 
                NEW.id, change_count + 1, COALESCE(current_setting('app.current_user', TRUE), 'UNKNOWN');
        END IF;
        
        -- 변경 빈도가 너무 높은 경우 (5분 내 2회 이상)
        IF last_change_time IS NOT NULL AND last_change_time > NOW() - INTERVAL '5 minutes' THEN
            is_suspicious := TRUE;
            RAISE NOTICE 'SECURITY ALERT: Rapid end_date changes detected for issue % by %', 
                NEW.id, COALESCE(current_setting('app.current_user', TRUE), 'UNKNOWN');
        END IF;
        
        -- 감사 로그 기록
        INSERT INTO end_date_audit_log (
            issue_id,
            old_end_date,
            new_end_date,
            changed_by,
            change_type,
            change_reason,
            ip_address,
            user_agent,
            request_id,
            session_id,
            suspicious_pattern
        ) VALUES (
            NEW.id,
            OLD.end_date,
            NEW.end_date,
            COALESCE(current_setting('app.current_user', TRUE), 'SYSTEM'),
            COALESCE(current_setting('app.change_type', TRUE), 'UPDATE'),
            COALESCE(current_setting('app.change_reason', TRUE), 'End date modified'),
            COALESCE(current_setting('app.client_ip', TRUE), NULL)::INET,
            COALESCE(current_setting('app.user_agent', TRUE), NULL),
            COALESCE(current_setting('app.request_id', TRUE), NULL),
            COALESCE(current_setting('app.session_id', TRUE), NULL),
            is_suspicious
        );
        
        -- 의심스러운 활동의 경우 추가 처리
        IF is_suspicious THEN
            -- 보안 알림 테이블에 기록 (있다면)
            -- 또는 외부 알림 시스템 트리거
            PERFORM pg_notify('security_alert', json_build_object(
                'type', 'suspicious_end_date_change',
                'issue_id', NEW.id,
                'user', COALESCE(current_setting('app.current_user', TRUE), 'UNKNOWN'),
                'change_count', change_count + 1,
                'timestamp', NOW()
            )::text);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. 트리거 생성
DROP TRIGGER IF EXISTS trigger_track_end_date_changes ON issues;
CREATE TRIGGER trigger_track_end_date_changes
    AFTER INSERT OR UPDATE ON issues
    FOR EACH ROW
    EXECUTE FUNCTION track_end_date_changes();

-- 5. 의심스러운 패턴 자동 차단을 위한 함수
CREATE OR REPLACE FUNCTION check_and_block_suspicious_changes(
    p_issue_id INTEGER,
    p_user VARCHAR(255)
) RETURNS BOOLEAN AS $$
DECLARE
    recent_changes INTEGER;
    should_block BOOLEAN := FALSE;
BEGIN
    -- 최근 30분 내 변경 횟수 확인
    SELECT COUNT(*)
    INTO recent_changes
    FROM end_date_audit_log
    WHERE issue_id = p_issue_id
    AND changed_by = p_user
    AND created_at > NOW() - INTERVAL '30 minutes';
    
    -- 30분 내 5회 이상 변경 시 차단
    IF recent_changes >= 5 THEN
        should_block := TRUE;
        
        -- 차단 로그 기록
        INSERT INTO end_date_audit_log (
            issue_id,
            changed_by,
            change_type,
            change_reason,
            suspicious_pattern,
            auto_blocked
        ) VALUES (
            p_issue_id,
            p_user,
            'BLOCKED',
            'Auto-blocked due to excessive end_date changes',
            TRUE,
            TRUE
        );
        
        RAISE NOTICE 'AUTO-BLOCK: User % blocked from changing issue % due to excessive modifications', 
            p_user, p_issue_id;
    END IF;
    
    RETURN should_block;
END;
$$ LANGUAGE plpgsql;

-- 6. 데이터 정합성 검증 함수
CREATE OR REPLACE FUNCTION validate_end_date_consistency()
RETURNS TABLE (
    issue_id INTEGER,
    current_end_date TIMESTAMP WITH TIME ZONE,
    last_recorded_end_date TIMESTAMP WITH TIME ZONE,
    inconsistent BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id as issue_id,
        i.end_date as current_end_date,
        eal.new_end_date as last_recorded_end_date,
        (i.end_date IS DISTINCT FROM eal.new_end_date) as inconsistent
    FROM issues i
    LEFT JOIN (
        SELECT DISTINCT ON (issue_id) 
            issue_id, 
            new_end_date,
            created_at
        FROM end_date_audit_log
        WHERE change_type != 'BLOCKED'
        ORDER BY issue_id, created_at DESC
    ) eal ON i.id = eal.issue_id
    WHERE i.end_date IS DISTINCT FROM eal.new_end_date
    OR eal.new_end_date IS NULL;
END;
$$ LANGUAGE plpgsql;

-- 7. 권한 설정 (필요한 경우)
-- GRANT SELECT, INSERT ON end_date_audit_log TO your_app_user;
-- GRANT USAGE ON SEQUENCE end_date_audit_log_id_seq TO your_app_user;

-- 8. 초기 데이터 마이그레이션 (기존 이슈들에 대한 기본 로그)
INSERT INTO end_date_audit_log (issue_id, old_end_date, new_end_date, changed_by, change_type, change_reason)
SELECT 
    id,
    NULL,
    end_date,
    'MIGRATION',
    'INSERT',
    'Initial audit log creation'
FROM issues
WHERE id NOT IN (SELECT DISTINCT issue_id FROM end_date_audit_log WHERE issue_id IS NOT NULL);

-- 완료 메시지
DO $$
BEGIN
    RAISE NOTICE 'End date audit system successfully created!';
    RAISE NOTICE 'Tables: end_date_audit_log';
    RAISE NOTICE 'Triggers: trigger_track_end_date_changes';
    RAISE NOTICE 'Functions: track_end_date_changes, check_and_block_suspicious_changes, validate_end_date_consistency';
END $$;