-- OAuth 지원을 위한 사용자 테이블 컬럼 추가

-- provider 컬럼 추가 (기본값: 'local')
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'local';

-- provider_id 컬럼 추가 (OAuth 제공자의 사용자 ID)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);

-- profile_image 컬럼 추가 (프로필 이미지 URL)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS profile_image TEXT;

-- verified 컬럼 추가 (이메일 인증 여부, 기본값: false)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;

-- 기존 로컬 사용자들을 verified=true로 설정
UPDATE users 
SET verified = true 
WHERE provider = 'local' OR provider IS NULL;

-- provider가 NULL인 기존 사용자들을 'local'로 설정
UPDATE users 
SET provider = 'local' 
WHERE provider IS NULL;

-- 유니크 인덱스 추가 (같은 OAuth 제공자에서 중복 계정 방지)
CREATE UNIQUE INDEX IF NOT EXISTS users_provider_provider_id_unique 
ON users(provider, provider_id) 
WHERE provider_id IS NOT NULL;

-- password_hash를 NULL 허용으로 변경 (OAuth 사용자는 비밀번호가 없음)
ALTER TABLE users 
ALTER COLUMN password_hash DROP NOT NULL;