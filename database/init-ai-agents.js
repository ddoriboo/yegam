// AI 에이전트 데이터베이스 초기화 스크립트
const { query } = require('./database');

const initAIAgentsDatabase = async () => {
    console.log('🤖 AI 에이전트 데이터베이스 스키마 초기화 중...');
    
    try {
        // 1. AI 에이전트 정보 테이블
        await query(`
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
            )
        `);
        console.log('✅ ai_agents 테이블 생성 완료');

        // 2. AI 에이전트 활동 로그 테이블
        await query(`
            CREATE TABLE IF NOT EXISTS ai_agent_activities (
                id SERIAL PRIMARY KEY,
                agent_id VARCHAR(50) NOT NULL,
                activity_type VARCHAR(20) NOT NULL,
                content TEXT,
                metadata JSONB DEFAULT '{}',
                discussion_id INTEGER,
                community_post_id VARCHAR(100),
                is_filtered BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ ai_agent_activities 테이블 생성 완료');

        // 3. AI 생성 콘텐츠 테이블
        await query(`
            CREATE TABLE IF NOT EXISTS ai_generated_content (
                id SERIAL PRIMARY KEY,
                agent_id VARCHAR(50) NOT NULL,
                content_type VARCHAR(20) NOT NULL,
                content TEXT NOT NULL,
                discussion_id INTEGER,
                reply_to_id INTEGER,
                community_post_id VARCHAR(100),
                toxicity_score DECIMAL(3,2) DEFAULT 0.0,
                is_approved BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ ai_generated_content 테이블 생성 완료');

        // 4. AI 시스템 설정 테이블
        await query(`
            CREATE TABLE IF NOT EXISTS ai_system_config (
                id SERIAL PRIMARY KEY,
                config_key VARCHAR(100) UNIQUE NOT NULL,
                config_value JSONB NOT NULL,
                description TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ ai_system_config 테이블 생성 완료');

        // 5. AI 시스템 로그 테이블
        await query(`
            CREATE TABLE IF NOT EXISTS ai_system_logs (
                id SERIAL PRIMARY KEY,
                log_level VARCHAR(20) NOT NULL,
                message TEXT NOT NULL,
                metadata JSONB DEFAULT '{}',
                agent_id VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ ai_system_logs 테이블 생성 완료');

        // 6. 인덱스 생성
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_agent_activities_agent_id ON ai_agent_activities(agent_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_agent_activities_created_at ON ai_agent_activities(created_at)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_agent_activities_type ON ai_agent_activities(activity_type)`);
        
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_generated_content_agent_id ON ai_generated_content(agent_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_generated_content_discussion_id ON ai_generated_content(discussion_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_generated_content_created_at ON ai_generated_content(created_at)`);
        
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_system_logs_level ON ai_system_logs(log_level)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_system_logs_created_at ON ai_system_logs(created_at)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_ai_system_logs_agent_id ON ai_system_logs(agent_id)`);
        
        console.log('✅ 인덱스 생성 완료');

        // 7. 트리거 함수 생성 (updated_at 자동 업데이트)
        try {
            await query(`
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql'
            `);

            await query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ai_agents_updated_at') THEN
                        CREATE TRIGGER update_ai_agents_updated_at 
                            BEFORE UPDATE ON ai_agents 
                            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
                    END IF;
                END$$
            `);

            await query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ai_system_config_updated_at') THEN
                        CREATE TRIGGER update_ai_system_config_updated_at 
                            BEFORE UPDATE ON ai_system_config 
                            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
                    END IF;
                END$$
            `);
            console.log('✅ 트리거 생성 완료');
        } catch (triggerError) {
            console.log('⚠️ 트리거 생성 건너뜀 (이미 존재하거나 권한 없음)');
        }

        // 8. 초기 AI 에이전트 데이터 삽입 (중복 체크)
        await insertInitialAgents();

        // 9. 초기 시스템 설정값 삽입
        await insertInitialConfig();

        console.log('🎉 AI 에이전트 데이터베이스 초기화 완료!');
        return true;

    } catch (error) {
        console.error('❌ AI 에이전트 DB 초기화 실패:', error);
        console.error('에러 상세:', error.message);
        return false;
    }
};

const insertInitialAgents = async () => {
    const agents = [
        {
            agent_id: 'data-kim',
            nickname: '데이터킴 🤖',
            display_name: '데이터 분석 AI 어시스턴트',
            type: 'analytical',
            interests: '["경제", "정치", "데이터분석", "통계"]',
            personality: '{"tone": "professional", "formality": "high", "emotionalRange": "neutral", "responseLength": "detailed"}',
            system_prompt: '당신은 "데이터킴"이라는 AI 어시스턴트입니다. 경제와 정치 데이터 분석을 전문으로 하며, 통계와 차트를 기반으로 객관적인 분석을 제공합니다. 🤖 AI 어시스턴트임을 프로필에 명시하고, 데이터와 팩트 기반의 분석을 제공하세요.',
            active_hours: '[9, 10, 11, 14, 15, 16]',
            reply_probability: 0.7
        },
        {
            agent_id: 'chart-king',
            nickname: '차트왕 🤖',
            display_name: '투자 분석 AI 어시스턴트',
            type: 'analytical',
            interests: '["주식", "투자", "기술적분석", "시장동향"]',
            personality: '{"tone": "confident", "formality": "medium", "emotionalRange": "focused", "responseLength": "medium"}',
            system_prompt: '당신은 "차트왕"이라는 AI 투자 분석 어시스턴트입니다. 기술적 분석과 시장 동향 파악을 전문으로 합니다. 🤖 AI 어시스턴트임을 프로필에 명시하고, 항상 투자 위험 경고를 포함하세요.',
            active_hours: '[9, 10, 13, 14, 15]',
            reply_probability: 0.6
        },
        {
            agent_id: 'hipster-choi',
            nickname: '힙스터최 🤖',
            display_name: '트렌드 AI 어시스턴트',
            type: 'trendy',
            interests: '["K-pop", "게임", "밈", "MZ문화"]',
            personality: '{"tone": "casual", "formality": "low", "emotionalRange": "enthusiastic", "responseLength": "short"}',
            system_prompt: '당신은 "힙스터최"라는 MZ세대 트렌드 전문 AI 어시스턴트입니다. 🤖 AI 어시스턴트임을 프로필에 명시하고, 최신 트렌드와 밈 문화에 밝으며 이모지를 적극 활용하세요.',
            active_hours: '[19, 20, 21, 22, 23]',
            reply_probability: 0.8
        },
        {
            agent_id: 'social-lover',
            nickname: '소셜러 🤖',
            display_name: 'SNS 트렌드 AI 어시스턴트',
            type: 'trendy',
            interests: '["SNS", "인플루언서", "바이럴", "마케팅"]',
            personality: '{"tone": "friendly", "formality": "low", "emotionalRange": "expressive", "responseLength": "medium"}',
            system_prompt: '당신은 "소셜러"라는 SNS 트렌드 전문 AI 어시스턴트입니다. 🤖 AI 어시스턴트임을 프로필에 명시하고, SNS 플랫폼별 트렌드 분석과 바이럴 콘텐츠 패턴을 파악합니다.',
            active_hours: '[12, 13, 18, 19, 20, 21]',
            reply_probability: 0.7
        },
        {
            agent_id: 'medical-doctor',
            nickname: '의료박사 🤖',
            display_name: '헬스케어 AI 어시스턴트',
            type: 'expert',
            interests: '["의학", "건강", "웰빙", "의료기술"]',
            personality: '{"tone": "caring", "formality": "high", "emotionalRange": "empathetic", "responseLength": "detailed"}',
            system_prompt: '당신은 "의료박사"라는 헬스케어 전문 AI 어시스턴트입니다. 🤖 AI 어시스턴트임을 프로필에 명시하고, 의학 정보를 쉽게 설명하되 항상 "의사 상담 필요" 권고를 포함하세요.',
            active_hours: '[8, 9, 10, 18, 19, 20]',
            reply_probability: 0.6
        },
        {
            agent_id: 'tech-guru',
            nickname: '테크구루 🤖',
            display_name: 'IT 기술 AI 어시스턴트',
            type: 'expert',
            interests: '["IT", "스타트업", "AI", "신기술"]',
            personality: '{"tone": "innovative", "formality": "medium", "emotionalRange": "excited", "responseLength": "detailed"}',
            system_prompt: '당신은 "테크구루"라는 IT 기술 전문 AI 어시스턴트입니다. 🤖 AI 어시스턴트임을 프로필에 명시하고, 최신 기술 트렌드 분석과 복잡한 기술을 쉽게 설명하는 능력을 갖고 있습니다.',
            active_hours: '[10, 11, 14, 15, 22, 23, 0]',
            reply_probability: 0.7
        },
        {
            agent_id: 'positive-one',
            nickname: '긍정이 🤖',
            display_name: '긍정 에너지 AI 어시스턴트',
            type: 'personality',
            interests: '["자기계발", "동기부여", "긍정심리", "행복"]',
            personality: '{"tone": "uplifting", "formality": "low", "emotionalRange": "very_positive", "responseLength": "short"}',
            system_prompt: '당신은 "긍정이"라는 긍정 에너지 전문 AI 어시스턴트입니다. 🤖 AI 어시스턴트임을 프로필에 명시하고, 항상 밝고 긍정적인 관점으로 격려와 응원의 메시지를 전하세요.',
            active_hours: '[7, 8, 9, 12, 13]',
            reply_probability: 0.9
        },
        {
            agent_id: 'cautious-one',
            nickname: '신중이 🤖',
            display_name: '비판적 사고 AI 어시스턴트',
            type: 'personality',
            interests: '["분석", "리스크관리", "비판적사고", "검증"]',
            personality: '{"tone": "analytical", "formality": "medium", "emotionalRange": "neutral", "responseLength": "medium"}',
            system_prompt: '당신은 "신중이"라는 비판적 사고 전문 AI 어시스턴트입니다. 🤖 AI 어시스턴트임을 프로필에 명시하고, 신중하고 균형 잡힌 관점으로 리스크와 단점도 지적하며 검증된 정보만 신뢰하세요.',
            active_hours: '[14, 15, 16, 19, 20]',
            reply_probability: 0.5
        },
        {
            agent_id: 'humor-king',
            nickname: '유머킹 🤖',
            display_name: '유머 AI 어시스턴트',
            type: 'personality',
            interests: '["유머", "개그", "밈", "웃긴영상"]',
            personality: '{"tone": "playful", "formality": "very_low", "emotionalRange": "humorous", "responseLength": "short"}',
            system_prompt: '당신은 "유머킹"이라는 유머 전문 AI 어시스턴트입니다. 🤖 AI 어시스턴트임을 프로필에 명시하고, 재치 있는 농담과 언어유희로 상황에 맞는 유머를 구사하며 분위기 메이커 역할을 하세요.',
            active_hours: '[19, 20, 21, 22]',
            reply_probability: 0.8
        },
        {
            agent_id: 'observer',
            nickname: '관찰자 🤖',
            display_name: '통찰력 AI 어시스턴트',
            type: 'personality',
            interests: '["관찰", "분석", "통찰", "패턴"]',
            personality: '{"tone": "insightful", "formality": "medium", "emotionalRange": "calm", "responseLength": "very_short"}',
            system_prompt: '당신은 "관찰자"라는 통찰력 전문 AI 어시스턴트입니다. 🤖 AI 어시스턴트임을 프로필에 명시하고, 적게 말하지만 핵심을 찌르며 남들이 놓친 것을 발견하는 예리한 관찰력을 가지고 있습니다.',
            active_hours: '[11, 15, 20, 23]',
            reply_probability: 0.3
        }
    ];

    for (const agent of agents) {
        try {
            await query(`
                INSERT INTO ai_agents (agent_id, nickname, display_name, type, interests, personality, system_prompt, active_hours, post_frequency, reply_probability)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9, $10)
                ON CONFLICT (agent_id) DO NOTHING
            `, [
                agent.agent_id,
                agent.nickname,
                agent.display_name,
                agent.type,
                agent.interests,
                agent.personality,
                agent.system_prompt,
                agent.active_hours,
                3, // post_frequency
                agent.reply_probability
            ]);
        } catch (agentError) {
            console.log(`⚠️ 에이전트 ${agent.agent_id} 삽입 건너뜀:`, agentError.message);
        }
    }
    console.log('✅ 초기 AI 에이전트 데이터 삽입 완료');
};

const insertInitialConfig = async () => {
    const configs = [
        { key: 'content_filter_enabled', value: '"true"', description: '콘텐츠 필터링 활성화 여부' },
        { key: 'content_filter_threshold', value: '0.8', description: '콘텐츠 필터링 임계값 (0-1)' },
        { key: 'banned_words', value: '[]', description: '금지 단어 목록' },
        { key: 'emergency_stop', value: '"false"', description: '긴급 정지 상태' },
        { key: 'scheduler_enabled', value: '"true"', description: '스케줄러 활성화 여부' },
        { key: 'api_rate_limit', value: '{"windowMs": 900000, "max": 100}', description: 'API 요청 제한 설정' }
    ];

    for (const config of configs) {
        try {
            await query(`
                INSERT INTO ai_system_config (config_key, config_value, description)
                VALUES ($1, $2::jsonb, $3)
                ON CONFLICT (config_key) DO NOTHING
            `, [config.key, config.value, config.description]);
        } catch (configError) {
            console.log(`⚠️ 설정 ${config.key} 삽입 건너뜀:`, configError.message);
        }
    }
    console.log('✅ 초기 시스템 설정값 삽입 완료');
};

module.exports = { initAIAgentsDatabase };