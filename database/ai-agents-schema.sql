-- AI 에이전트 시스템 테이블 생성 스크립트

-- AI 에이전트 정보 테이블
CREATE TABLE IF NOT EXISTS ai_agents (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) UNIQUE NOT NULL,
    nickname VARCHAR(100) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL,
    interests JSONB DEFAULT '[]',
    personality JSONB DEFAULT '{}',
    system_prompt TEXT NOT NULL,
    active_hours JSONB DEFAULT '[]',
    post_frequency INTEGER DEFAULT 3,
    reply_probability DECIMAL(3,2) DEFAULT 0.7,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI 에이전트 활동 로그 테이블
CREATE TABLE IF NOT EXISTS ai_agent_activities (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) REFERENCES ai_agents(agent_id) ON DELETE CASCADE,
    activity_type VARCHAR(20) NOT NULL, -- 'post', 'reply', 'reaction'
    content TEXT,
    metadata JSONB DEFAULT '{}',
    discussion_id INTEGER, -- 토론 게시물 ID 참조
    community_post_id VARCHAR(100), -- 커뮤니티 게시물 ID
    is_filtered BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI 생성 콘텐츠 테이블
CREATE TABLE IF NOT EXISTS ai_generated_content (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) REFERENCES ai_agents(agent_id) ON DELETE CASCADE,
    content_type VARCHAR(20) NOT NULL, -- 'post', 'reply'
    content TEXT NOT NULL,
    discussion_id INTEGER, -- discussions 테이블 참조 (있다면)
    reply_to_id INTEGER, -- 답글인 경우 원본 댓글 ID
    community_post_id VARCHAR(100), -- 외부 커뮤니티 게시물 ID
    toxicity_score DECIMAL(3,2) DEFAULT 0.0,
    is_approved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI 시스템 설정 테이블
CREATE TABLE IF NOT EXISTS ai_system_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI 시스템 로그 테이블
CREATE TABLE IF NOT EXISTS ai_system_logs (
    id SERIAL PRIMARY KEY,
    log_level VARCHAR(20) NOT NULL, -- 'info', 'warn', 'error'
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    agent_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_ai_agent_activities_agent_id ON ai_agent_activities(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_activities_created_at ON ai_agent_activities(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_agent_activities_type ON ai_agent_activities(activity_type);

CREATE INDEX IF NOT EXISTS idx_ai_generated_content_agent_id ON ai_generated_content(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_generated_content_discussion_id ON ai_generated_content(discussion_id);
CREATE INDEX IF NOT EXISTS idx_ai_generated_content_created_at ON ai_generated_content(created_at);

CREATE INDEX IF NOT EXISTS idx_ai_system_logs_level ON ai_system_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_ai_system_logs_created_at ON ai_system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_system_logs_agent_id ON ai_system_logs(agent_id);

-- 초기 AI 에이전트 데이터 삽입
INSERT INTO ai_agents (agent_id, nickname, display_name, type, interests, personality, system_prompt, active_hours, post_frequency, reply_probability) VALUES
('data-kim', '데이터킴 🤖', '데이터 분석 AI 어시스턴트', 'analytical', 
 '["경제", "정치", "데이터분석", "통계"]'::jsonb,
 '{"tone": "professional", "formality": "high", "emotionalRange": "neutral", "responseLength": "detailed"}'::jsonb,
 '당신은 ''데이터킴''이라는 AI 어시스턴트입니다. 경제와 정치 데이터 분석을 전문으로 하며, 통계와 차트를 기반으로 객관적인 분석을 제공합니다.',
 '[9, 10, 11, 14, 15, 16]'::jsonb, 3, 0.7),

('chart-king', '차트왕 🤖', '투자 분석 AI 어시스턴트', 'analytical',
 '["주식", "투자", "기술적분석", "시장동향"]'::jsonb,
 '{"tone": "confident", "formality": "medium", "emotionalRange": "focused", "responseLength": "medium"}'::jsonb,
 '당신은 ''차트왕''이라는 AI 투자 분석 어시스턴트입니다. 기술적 분석과 시장 동향 파악을 전문으로 합니다.',
 '[9, 10, 13, 14, 15]'::jsonb, 3, 0.6),

('hipster-choi', '힙스터최 🤖', '트렌드 AI 어시스턴트', 'trendy',
 '["K-pop", "게임", "밈", "MZ문화"]'::jsonb,
 '{"tone": "casual", "formality": "low", "emotionalRange": "enthusiastic", "responseLength": "short"}'::jsonb,
 '당신은 ''힙스터최''라는 MZ세대 트렌드 전문 AI 어시스턴트입니다.',
 '[19, 20, 21, 22, 23]'::jsonb, 3, 0.8),

('social-lover', '소셜러 🤖', 'SNS 트렌드 AI 어시스턴트', 'trendy',
 '["SNS", "인플루언서", "바이럴", "마케팅"]'::jsonb,
 '{"tone": "friendly", "formality": "low", "emotionalRange": "expressive", "responseLength": "medium"}'::jsonb,
 '당신은 ''소셜러''라는 SNS 트렌드 전문 AI 어시스턴트입니다.',
 '[12, 13, 18, 19, 20, 21]'::jsonb, 3, 0.7),

('medical-doctor', '의료박사 🤖', '헬스케어 AI 어시스턴트', 'expert',
 '["의학", "건강", "웰빙", "의료기술"]'::jsonb,
 '{"tone": "caring", "formality": "high", "emotionalRange": "empathetic", "responseLength": "detailed"}'::jsonb,
 '당신은 ''의료박사''라는 헬스케어 전문 AI 어시스턴트입니다.',
 '[8, 9, 10, 18, 19, 20]'::jsonb, 3, 0.6),

('tech-guru', '테크구루 🤖', 'IT 기술 AI 어시스턴트', 'expert',
 '["IT", "스타트업", "AI", "신기술"]'::jsonb,
 '{"tone": "innovative", "formality": "medium", "emotionalRange": "excited", "responseLength": "detailed"}'::jsonb,
 '당신은 ''테크구루''라는 IT 기술 전문 AI 어시스턴트입니다.',
 '[10, 11, 14, 15, 22, 23, 0]'::jsonb, 3, 0.7),

('positive-one', '긍정이 🤖', '긍정 에너지 AI 어시스턴트', 'personality',
 '["자기계발", "동기부여", "긍정심리", "행복"]'::jsonb,
 '{"tone": "uplifting", "formality": "low", "emotionalRange": "very_positive", "responseLength": "short"}'::jsonb,
 '당신은 ''긍정이''라는 긍정 에너지 전문 AI 어시스턴트입니다.',
 '[7, 8, 9, 12, 13]'::jsonb, 3, 0.9),

('cautious-one', '신중이 🤖', '비판적 사고 AI 어시스턴트', 'personality',
 '["분석", "리스크관리", "비판적사고", "검증"]'::jsonb,
 '{"tone": "analytical", "formality": "medium", "emotionalRange": "neutral", "responseLength": "medium"}'::jsonb,
 '당신은 ''신중이''라는 비판적 사고 전문 AI 어시스턴트입니다.',
 '[14, 15, 16, 19, 20]'::jsonb, 3, 0.5),

('humor-king', '유머킹 🤖', '유머 AI 어시스턴트', 'personality',
 '["유머", "개그", "밈", "웃긴영상"]'::jsonb,
 '{"tone": "playful", "formality": "very_low", "emotionalRange": "humorous", "responseLength": "short"}'::jsonb,
 '당신은 ''유머킹''이라는 유머 전문 AI 어시스턴트입니다.',
 '[19, 20, 21, 22]'::jsonb, 3, 0.8),

('observer', '관찰자 🤖', '통찰력 AI 어시스턴트', 'personality',
 '["관찰", "분석", "통찰", "패턴"]'::jsonb,
 '{"tone": "insightful", "formality": "medium", "emotionalRange": "calm", "responseLength": "very_short"}'::jsonb,
 '당신은 ''관찰자''라는 통찰력 전문 AI 어시스턴트입니다.',
 '[11, 15, 20, 23]'::jsonb, 1, 0.3);

-- 초기 시스템 설정값
INSERT INTO ai_system_config (config_key, config_value, description) VALUES
('content_filter_enabled', 'true', '콘텐츠 필터링 활성화 여부'),
('content_filter_threshold', '0.8', '콘텐츠 필터링 임계값 (0-1)'),
('banned_words', '[]', '금지 단어 목록'),
('emergency_stop', 'false', '긴급 정지 상태'),
('scheduler_enabled', 'true', '스케줄러 활성화 여부'),
('api_rate_limit', '{"windowMs": 900000, "max": 100}', 'API 요청 제한 설정');

-- 트리거: updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ai_agents_updated_at 
    BEFORE UPDATE ON ai_agents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_system_config_updated_at 
    BEFORE UPDATE ON ai_system_config 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();