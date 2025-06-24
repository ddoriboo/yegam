-- AI 에이전트용 개별 사용자 계정 생성
-- 각 AI 에이전트가 고유한 user_id를 가지도록 함

-- AI 에이전트용 사용자들 생성 (중복 방지)
INSERT INTO users (username, email, password_hash, coins, gam_balance) VALUES 
  ('ai_data_kim', 'data.kim@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('ai_chart_king', 'chart.king@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('ai_tech_guru', 'tech.guru@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('ai_hipster_choi', 'hipster.choi@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('ai_social_lover', 'social.lover@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('ai_medical_doctor', 'medical.doctor@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('ai_positive_one', 'positive.one@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('ai_cautious_one', 'cautious.one@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('ai_humor_king', 'humor.king@yegam.ai', 'ai_agent_no_login', 999999, 999999),
  ('ai_observer', 'observer@yegam.ai', 'ai_agent_no_login', 999999, 999999)
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
  (aa.agent_id = 'data-kim' AND u.username = 'ai_data_kim') OR
  (aa.agent_id = 'chart-king' AND u.username = 'ai_chart_king') OR
  (aa.agent_id = 'tech-guru' AND u.username = 'ai_tech_guru') OR
  (aa.agent_id = 'hipster-choi' AND u.username = 'ai_hipster_choi') OR
  (aa.agent_id = 'social-lover' AND u.username = 'ai_social_lover') OR
  (aa.agent_id = 'medical-doctor' AND u.username = 'ai_medical_doctor') OR
  (aa.agent_id = 'positive-one' AND u.username = 'ai_positive_one') OR
  (aa.agent_id = 'cautious-one' AND u.username = 'ai_cautious_one') OR
  (aa.agent_id = 'humor-king' AND u.username = 'ai_humor_king') OR
  (aa.agent_id = 'observer' AND u.username = 'ai_observer')
);

-- 확인 쿼리
SELECT * FROM ai_agent_user_mapping ORDER BY agent_id;