# 데이터베이스 스키마 변경사항

## 📋 개요
예겜 서비스 개발 과정에서 적용된 데이터베이스 스키마 변경사항을 정리한 문서입니다.

## 🔄 OAuth 지원을 위한 스키마 변경

### 변경 일자
2025년 1월 (OAuth 구현 시)

### 변경 내용
기존 로컬 계정 전용 구조에서 OAuth 소셜 로그인을 지원하는 구조로 확장

#### 추가된 컬럼들
```sql
-- 사용자 계정 제공자 (local, google, github)
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'local';

-- 소셜 로그인 제공자의 사용자 ID
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);

-- 프로필 이미지 URL
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;

-- 이메일 인증 상태
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;

-- 비밀번호 해시를 선택적으로 변경 (OAuth 사용자는 비밀번호 없음)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
```

### 변경 전 스키마
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    gam_balance INTEGER DEFAULT 10000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 변경 후 스키마
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- NOT NULL 제거
    gam_balance INTEGER DEFAULT 10000,
    provider VARCHAR(20) DEFAULT 'local', -- 신규
    provider_id VARCHAR(255), -- 신규
    profile_image TEXT, -- 신규
    verified BOOLEAN DEFAULT false, -- 신규
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🗂️ 데이터 타입 설명

### provider 컬럼
- **타입**: VARCHAR(20)
- **기본값**: 'local'
- **설명**: 사용자 계정 유형 구분
- **가능한 값**:
  - `'local'`: 일반 회원가입
  - `'google'`: Google 소셜 로그인
  - `'github'`: GitHub 소셜 로그인

### provider_id 컬럼
- **타입**: VARCHAR(255)
- **기본값**: NULL
- **설명**: 소셜 로그인 제공자의 고유 사용자 ID
- **예시**:
  - Google: `"1234567890123456789"`
  - GitHub: `"87654321"`

### profile_image 컬럼
- **타입**: TEXT
- **기본값**: NULL
- **설명**: 프로필 이미지 URL
- **예시**: `"https://lh3.googleusercontent.com/..."`

### verified 컬럼
- **타입**: BOOLEAN
- **기본값**: false
- **설명**: 이메일 인증 상태
- **로직**:
  - 로컬 계정: 이메일 인증 완료 시 `true`
  - OAuth 계정: 생성 시 자동으로 `true`

## 🔧 마이그레이션 실행

### 수동 실행
```bash
# PostgreSQL 콘솔에서 직접 실행
psql $DATABASE_URL

# 각 명령어 순서대로 실행
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
```

### 자동화 스크립트
```javascript
// scripts/migrate-oauth.js
const { query } = require('../database/postgres');

async function migrateOAuth() {
    try {
        console.log('OAuth 마이그레이션 시작...');
        
        await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT \'local\'');
        await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255)');
        await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT');
        await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false');
        await query('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL');
        
        console.log('OAuth 마이그레이션 완료!');
    } catch (error) {
        console.error('마이그레이션 오류:', error);
    }
}

migrateOAuth();
```

## 📊 데이터 예시

### 로컬 계정 사용자
```sql
INSERT INTO users (username, email, password_hash, provider, verified) 
VALUES ('user123', 'user@example.com', '$2b$10$...', 'local', true);
```

### Google 소셜 로그인 사용자
```sql
INSERT INTO users (username, email, provider, provider_id, profile_image, verified) 
VALUES ('김철수', 'kimcs@gmail.com', 'google', '1234567890123456789', 'https://lh3.googleusercontent.com/...', true);
```

### GitHub 소셜 로그인 사용자
```sql
INSERT INTO users (username, email, provider, provider_id, profile_image, verified) 
VALUES ('developer', 'dev@github.com', 'github', '87654321', 'https://avatars.githubusercontent.com/...', true);
```

## 🔍 쿼리 예시

### 소셜 로그인 사용자 조회
```sql
-- Google 로그인 사용자만 조회
SELECT * FROM users WHERE provider = 'google';

-- 소셜 로그인 사용자 전체 조회
SELECT * FROM users WHERE provider != 'local';
```

### 중복 계정 확인
```sql
-- 동일 이메일로 여러 제공자 계정 확인
SELECT email, provider, username 
FROM users 
WHERE email IN (
    SELECT email 
    FROM users 
    GROUP BY email 
    HAVING COUNT(*) > 1
);
```

### 프로필 이미지 있는 사용자 조회
```sql
SELECT username, email, profile_image 
FROM users 
WHERE profile_image IS NOT NULL;
```

## 🚨 주의사항

### 1. 데이터 무결성
- **provider_id는 provider별로 고유**해야 함
- **이메일 중복 허용**: 같은 이메일로 여러 제공자 계정 생성 가능
- **username 중복 방지**: 모든 제공자에서 username은 고유

### 2. 백업
마이그레이션 전 반드시 데이터베이스 백업:
```bash
pg_dump $DATABASE_URL > backup_before_oauth_migration.sql
```

### 3. 롤백
문제 발생 시 롤백 스크립트:
```sql
-- 주의: 데이터 손실 가능성 있음
ALTER TABLE users DROP COLUMN IF EXISTS provider;
ALTER TABLE users DROP COLUMN IF EXISTS provider_id;
ALTER TABLE users DROP COLUMN IF EXISTS profile_image;
ALTER TABLE users DROP COLUMN IF EXISTS verified;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
```

## 🔄 향후 확장 계획

### 1. 추가 OAuth 제공자
- **Kakao**: 한국 사용자 대상
- **Naver**: 한국 사용자 대상
- **Discord**: 게이머 대상

### 2. 프로필 정보 확장
```sql
-- 향후 추가 가능한 컬럼들
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN location VARCHAR(100);
ALTER TABLE users ADD COLUMN website VARCHAR(255);
ALTER TABLE users ADD COLUMN github_username VARCHAR(50);
```

### 3. 계정 연결 기능
여러 OAuth 제공자를 하나의 계정으로 연결하는 기능
```sql
-- 계정 연결 테이블
CREATE TABLE user_providers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    provider VARCHAR(20),
    provider_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_id)
);
```

## 📈 성능 최적화

### 인덱스 추가
```sql
-- provider별 조회 성능 향상
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider);

-- provider_id 조회 성능 향상
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider, provider_id);

-- 이메일 조회 성능 향상 (이미 UNIQUE 제약으로 인덱스 존재)
-- CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

## 🔍 모니터링

### 사용자 유형별 통계
```sql
SELECT 
    provider,
    COUNT(*) as user_count,
    COUNT(*) * 100.0 / (SELECT COUNT(*) FROM users) as percentage
FROM users 
GROUP BY provider 
ORDER BY user_count DESC;
```

### 신규 가입 추이 (제공자별)
```sql
SELECT 
    DATE(created_at) as date,
    provider,
    COUNT(*) as new_users
FROM users 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), provider
ORDER BY date DESC, provider;
```

---

**⚠️ 중요**: 모든 스키마 변경사항은 프로덕션 환경 적용 전에 개발 환경에서 충분히 테스트해야 합니다.