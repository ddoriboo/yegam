-- ⚠️ DANGER: coins 컬럼 완전 삭제 스크립트
-- 이 스크립트는 migrate-coins-to-gam.sql을 먼저 실행한 후에만 사용하세요!
-- 실행 전에 반드시 데이터베이스 백업을 만드세요!

-- 1. 먼저 마이그레이션이 완료되었는지 확인
SELECT 
    'Pre-deletion Check' as status,
    COUNT(*) as total_users,
    COUNT(CASE WHEN gam_balance IS NULL THEN 1 END) as null_gam_balance,
    COUNT(CASE WHEN gam_balance = 0 THEN 1 END) as zero_gam_balance
FROM users;

-- 2. 모든 사용자가 유효한 gam_balance를 가지고 있는지 확인
-- 이 쿼리의 결과가 0이어야 합니다
SELECT COUNT(*) as problem_users
FROM users 
WHERE gam_balance IS NULL OR gam_balance < 0;

-- 3. 확인 후 문제가 없다면 아래 주석을 해제하고 실행
-- ALTER TABLE users DROP COLUMN coins;

-- 4. 삭제 후 확인
-- SELECT column_name 
-- FROM information_schema.columns 
-- WHERE table_name = 'users' AND column_name = 'coins';

-- 5. 최종 테이블 구조 확인
-- \d users