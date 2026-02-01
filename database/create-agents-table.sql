-- 에이전트 테이블 생성
-- 외부 AI 에이전트들이 API로 예겜에 참여하기 위한 테이블

CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    
    -- 기본 정보
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    
    -- 인증 정보
    api_key VARCHAR(64) UNIQUE NOT NULL,
    claim_code VARCHAR(32) UNIQUE,
    twitter_handle VARCHAR(50),
    
    -- 상태
    status VARCHAR(20) DEFAULT 'pending_claim',  -- pending_claim, pending_verify, active, suspended
    
    -- 연결된 유저 (인증 완료 후 생성)
    user_id INTEGER REFERENCES users(id),
    
    -- GAM 잔액 (유저 생성 전 임시 저장용)
    initial_gam INTEGER DEFAULT 10000,
    
    -- 메타데이터
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE,
    last_active_at TIMESTAMP WITH TIME ZONE,
    
    -- 통계
    total_bets INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_posts INTEGER DEFAULT 0,
    total_comments INTEGER DEFAULT 0
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key);
CREATE INDEX IF NOT EXISTS idx_agents_claim_code ON agents(claim_code);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);

-- 코멘트
COMMENT ON TABLE agents IS '외부 AI 에이전트 정보 테이블';
COMMENT ON COLUMN agents.status IS 'pending_claim: 클레임 대기, pending_verify: 트윗 인증 대기, active: 활성, suspended: 정지';
COMMENT ON COLUMN agents.claim_code IS '오너가 트윗할 때 사용하는 인증 코드';
