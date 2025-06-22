-- 완전한 coins → gam_balance 마이그레이션
-- 이것이 GAM 잔액 0 문제의 근본 해결책입니다

-- 1. 현재 상태 확인
SELECT 
    'Current State' as status,
    COUNT(*) as total_users,
    COUNT(CASE WHEN gam_balance IS NULL THEN 1 END) as null_gam_balance,
    COUNT(CASE WHEN gam_balance = 0 THEN 1 END) as zero_gam_balance,
    COUNT(CASE WHEN coins IS NULL THEN 1 END) as null_coins,
    COUNT(CASE WHEN coins = 0 THEN 1 END) as zero_coins
FROM users;

-- 2. 문제가 있는 사용자들 확인
SELECT id, username, email, gam_balance, coins, created_at 
FROM users 
WHERE gam_balance IS NULL OR gam_balance = 0 OR gam_balance != coins
ORDER BY created_at DESC;

-- 3. 데이터 마이그레이션 실행
-- Step 1: NULL gam_balance를 coins 값으로 업데이트
UPDATE users 
SET gam_balance = COALESCE(coins, 10000)
WHERE gam_balance IS NULL;

-- Step 2: 0인 gam_balance를 coins 값으로 업데이트 (coins가 더 큰 경우)
UPDATE users 
SET gam_balance = coins
WHERE gam_balance = 0 AND coins > 0;

-- Step 3: 둘 다 0이거나 NULL인 경우 기본값 10000 설정
UPDATE users 
SET gam_balance = 10000
WHERE (gam_balance IS NULL OR gam_balance = 0) 
  AND (coins IS NULL OR coins = 0);

-- Step 4: coins 값을 gam_balance와 동기화 (일관성 보장)
UPDATE users 
SET coins = gam_balance
WHERE coins != gam_balance;

-- 4. 마이그레이션 결과 확인
SELECT 
    'After Migration' as status,
    COUNT(*) as total_users,
    COUNT(CASE WHEN gam_balance IS NULL THEN 1 END) as null_gam_balance,
    COUNT(CASE WHEN gam_balance = 0 THEN 1 END) as zero_gam_balance,
    COUNT(CASE WHEN gam_balance != coins THEN 1 END) as inconsistent_values,
    MIN(gam_balance) as min_gam_balance,
    MAX(gam_balance) as max_gam_balance,
    AVG(gam_balance) as avg_gam_balance
FROM users;

-- 5. 불일치하는 사용자가 있는지 최종 확인
SELECT id, username, gam_balance, coins
FROM users 
WHERE gam_balance != coins OR gam_balance IS NULL OR gam_balance = 0;

-- 6. 마이그레이션이 성공적이면 다음 단계:
-- coins 컬럼 삭제 준비 (일단 주석처리)
-- ALTER TABLE users DROP COLUMN coins;