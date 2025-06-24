-- 사용자 레벨/등급 시스템 추가
-- 사용자들의 업적과 등급을 관리하기 위한 컬럼 추가

-- users 테이블에 레벨 관련 컬럼 추가
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS experience INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rank VARCHAR(20) DEFAULT '티끌',
ADD COLUMN IF NOT EXISTS total_posts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_comments INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_bets INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS win_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_win_streak INTEGER DEFAULT 0;

-- 등급 시스템 정의 (레벨에 따른 등급 자동 계산)
CREATE OR REPLACE FUNCTION get_user_rank(user_level INTEGER) 
RETURNS VARCHAR(20) AS $$
BEGIN
  CASE 
    WHEN user_level >= 100 THEN RETURN '전설';
    WHEN user_level >= 80 THEN RETURN '다이아';
    WHEN user_level >= 60 THEN RETURN '플래티넘';
    WHEN user_level >= 40 THEN RETURN '골드';
    WHEN user_level >= 20 THEN RETURN '실버';
    WHEN user_level >= 10 THEN RETURN '브론즈';
    WHEN user_level >= 5 THEN RETURN '아이언';
    WHEN user_level >= 1 THEN RETURN '새싹';
    ELSE RETURN '티끌';
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- 경험치에 따른 레벨 계산 함수
CREATE OR REPLACE FUNCTION calculate_level(exp INTEGER)
RETURNS INTEGER AS $$
BEGIN
  -- 경험치 기반 레벨 계산 (100경험치당 1레벨)
  RETURN FLOOR(exp / 100);
END;
$$ LANGUAGE plpgsql;

-- 사용자 레벨/등급 업데이트 함수
CREATE OR REPLACE FUNCTION update_user_level_and_rank()
RETURNS TRIGGER AS $$
BEGIN
  -- 레벨 계산
  NEW.level = calculate_level(NEW.experience);
  
  -- 등급 계산
  NEW.rank = get_user_rank(NEW.level);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성 (experience 컬럼 변경 시 자동으로 레벨/등급 업데이트)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_level_rank_trigger') THEN
    CREATE TRIGGER update_user_level_rank_trigger
      BEFORE UPDATE OF experience ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_user_level_and_rank();
  END IF;
END$$;

-- AI 에이전트들에게 특별한 레벨 부여
UPDATE users 
SET 
  level = 99,
  experience = 9900,
  rank = '다이아',
  total_posts = 999,
  total_comments = 999
WHERE username LIKE 'ai_%';

-- 기존 일반 사용자들 기본값 설정 (아직 레벨이 없는 경우)
UPDATE users 
SET 
  level = 0,
  experience = 0,
  rank = '티끌',
  total_posts = 0,
  total_comments = 0
WHERE level IS NULL;

-- 레벨 시스템 확인용 뷰
CREATE OR REPLACE VIEW user_levels_view AS
SELECT 
  id,
  username,
  level,
  experience,
  rank,
  total_posts,
  total_comments,
  total_bets,
  win_streak,
  max_win_streak,
  CASE 
    WHEN username LIKE 'ai_%' THEN '🤖 AI'
    ELSE '👤 User'
  END as user_type
FROM users
ORDER BY level DESC, experience DESC;