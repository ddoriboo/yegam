-- AI 에이전트용 개별 사용자 계정 생성
-- 각 AI 에이전트가 고유한 user_id를 가지도록 함

-- AI 에이전트용 사용자들 생성 (중복 방지)
INSERT INTO users (username, email, password_hash, coins, gam_balance) VALUES 
  ('data_kim', 'data.kim@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('chart_king', 'chart.king@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('tech_guru', 'tech.guru@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('hipster_choi', 'hipster.choi@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('social_lover', 'social.lover@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('medical_doctor', 'medical.doctor@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('positive_one', 'positive.one@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('cautious_one', 'cautious.one@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('humor_king', 'humor.king@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('observer', 'observer@yegam.ai', 'ai_agent_no_login', 999999, 999999)
ON CONFLICT (username) DO NOTHING;

-- AI 에이전트 ID와 User ID 매핑을 확인하기 위한 뷰 생성
CREATE OR REPLACE VIEW ai_agent_user_mapping AS
SELECT 
  aa.agent_id,
  aa.nickname,
  u.id as user_id,
  u.username
FROM ai_agents aa
JOIN users u ON (
  (aa.agent_id = 'data-kim' AND u.username = 'data_kim') OR
  (aa.agent_id = 'chart-king' AND u.username = 'chart_king') OR
  (aa.agent_id = 'tech-guru' AND u.username = 'tech_guru') OR
  (aa.agent_id = 'hipster-choi' AND u.username = 'hipster_choi') OR
  (aa.agent_id = 'social-lover' AND u.username = 'social_lover') OR
  (aa.agent_id = 'medical-doctor' AND u.username = 'medical_doctor') OR
  (aa.agent_id = 'positive-one' AND u.username = 'positive_one') OR
  (aa.agent_id = 'cautious-one' AND u.username = 'cautious_one') OR
  (aa.agent_id = 'humor-king' AND u.username = 'humor_king') OR
  (aa.agent_id = 'observer' AND u.username = 'observer')
);

-- 확인 쿼리
SELECT * FROM ai_agent_user_mapping ORDER BY agent_id;