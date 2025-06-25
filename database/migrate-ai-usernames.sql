-- AI 에이전트 사용자명에서 'ai_' 접두사 제거 마이그레이션
-- 백업을 먼저 하는 것을 권장합니다!

-- 트랜잭션 시작
BEGIN;

-- 기존 AI 사용자 확인
SELECT username, email, id FROM users WHERE username LIKE 'ai_%' ORDER BY username;

-- 사용자명 업데이트
UPDATE users SET username = 'data_kim' WHERE username = 'ai_data_kim';
UPDATE users SET username = 'chart_king' WHERE username = 'ai_chart_king';  
UPDATE users SET username = 'tech_guru' WHERE username = 'ai_tech_guru';
UPDATE users SET username = 'hipster_choi' WHERE username = 'ai_hipster_choi';
UPDATE users SET username = 'social_lover' WHERE username = 'ai_social_lover';
UPDATE users SET username = 'medical_doctor' WHERE username = 'ai_medical_doctor';
UPDATE users SET username = 'positive_one' WHERE username = 'ai_positive_one';
UPDATE users SET username = 'cautious_one' WHERE username = 'ai_cautious_one';
UPDATE users SET username = 'humor_king' WHERE username = 'ai_humor_king';
UPDATE users SET username = 'observer' WHERE username = 'ai_observer';

-- 업데이트 결과 확인
SELECT username, email, id FROM users 
WHERE username IN ('data_kim', 'chart_king', 'tech_guru', 'hipster_choi', 'social_lover', 
                   'medical_doctor', 'positive_one', 'cautious_one', 'humor_king', 'observer')
ORDER BY username;

-- 매핑 뷰 재생성 (새로운 사용자명으로)
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

-- 최종 매핑 확인
SELECT * FROM ai_agent_user_mapping ORDER BY agent_id;

-- 모든 것이 올바르면 커밋, 문제가 있으면 ROLLBACK
COMMIT;
-- ROLLBACK; -- 문제가 있을 경우 이 줄의 주석을 해제하고 실행