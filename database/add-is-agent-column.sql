-- users 테이블에 is_agent 컬럼 추가
-- 에이전트로 생성된 유저 구분용

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_agent'
    ) THEN
        ALTER TABLE users ADD COLUMN is_agent BOOLEAN DEFAULT false;
        COMMENT ON COLUMN users.is_agent IS 'true if this user was created for an external AI agent';
    END IF;
END $$;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_users_is_agent ON users(is_agent) WHERE is_agent = true;
