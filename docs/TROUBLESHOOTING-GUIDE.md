# 예겜(Yegam) 문제 해결 가이드 🔧

이 문서는 개발 과정에서 자주 발생하는 문제들과 검증된 해결방법을 정리한 가이드입니다.

## 🚨 Critical Issues (반드시 먼저 확인)

### 1. Authentication Issues (인증 문제)

#### **문제**: 회원가입/로그인 후 다시 로그인하라고 나옴
**증상**: 사용자가 성공적으로 가입/로그인했지만 페이지 새로고침 시 인증이 풀림

**진단 체크리스트**:
1. **JWT_SECRET 확인** (가장 중요)
   ```bash
   # 서버 로그에서 확인
   console.log('JWT_SECRET:', process.env.JWT_SECRET);
   ```
   - `undefined`이면 치명적 문제
   - 개발환경에서는 자동 생성되어야 함

2. **토큰 구조 확인**
   - OAuth 토큰: `{ id, username, email }`
   - 일반 토큰: `{ id, username, email }`
   - 구조가 다르면 검증 실패

3. **LocalStorage 키 확인**
   - 모든 곳에서 `yegame-token` 사용해야 함
   - `authToken` 등 다른 키 사용하면 문제

**해결방법**:
```javascript
// routes/auth.js에서 JWT_SECRET 할당 확인
if (!JWT_SECRET) {
    // 개발환경에서 임시 키 생성
    const tempSecret = require('crypto').randomBytes(32).toString('hex');
    process.env.JWT_SECRET = tempSecret;
    JWT_SECRET = tempSecret; // 이 라인이 중요!
}
```

#### **문제**: OAuth 로그인 시 "redirect_uri_mismatch" 오류
**진단**:
1. Google Cloud Console의 리디렉션 URI 확인
2. 서버의 콜백 URL 설정 확인
3. Railway의 `NODE_ENV=production` 설정 확인

**해결방법**:
```javascript
// config/passport.js에서 절대 URL 사용
callbackURL: process.env.NODE_ENV === 'production' 
    ? "https://yegam.ai.kr/api/auth/google/callback"
    : "http://localhost:3000/api/auth/google/callback"
```

Google Cloud Console 설정:
```
승인된 리디렉션 URI:
- https://yegam.ai.kr/api/auth/google/callback
- http://localhost:3000/api/auth/google/callback
```

### 2. Database Connection Issues

#### **문제**: 데이터베이스 연결 실패
**체크리스트**:
1. `DATABASE_URL` 환경변수 확인
2. Railway에서 제공한 외부 접속 URL 사용 (internal URL 아님)
3. SSL 설정 확인

**올바른 DATABASE_URL 형식**:
```
postgresql://postgres:password@hopper.proxy.rlwy.net:26469/railway
```

**잘못된 형식**:
```
postgresql://postgres:password@postgres.railway.internal:5432/railway  # internal URL
```

### 3. Module System Issues

#### **문제**: "The requested module does not provide an export named 'MESSAGES'"
**원인**: ES6/CommonJS 모듈 시스템 충돌

**해결방법**:
```javascript
// config/constants.js에서 ES6 export 사용
export {
    APP_CONFIG,
    STORAGE_KEYS,
    CATEGORIES,
    CATEGORY_NAMES,
    CATEGORY_COLORS,
    API_ENDPOINTS,
    MESSAGES
};

// CommonJS module.exports 사용하지 말것
```

## 🔧 Feature-Specific Issues

### Username Change Issues

#### **문제**: 닉네임 변경이 작동하지 않음
**체크리스트**:
1. API 엔드포인트 구현 확인 (`routes/user-info.js`)
2. 프론트엔드 이벤트 리스너 초기화 확인
3. JWT 토큰 전달 확인

**디버깅 스크립트**:
```javascript
// 브라우저 콘솔에서 실행
const token = localStorage.getItem('yegame-token');
console.log('Token:', token);

fetch('/api/user/check-username/test123', {
    headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(console.log);
```

### OAuth Setup Issues

#### **문제**: Google 로그인 버튼 클릭 시 아무 반응 없음
**체크리스트**:
1. 환경변수 설정 확인:
   ```
   GOOGLE_CLIENT_ID=설정됨
   GOOGLE_CLIENT_SECRET=설정됨
   ```
2. Passport 전략 초기화 확인
3. 세션 미들웨어 설정 확인

#### **문제**: OAuth 로그인 성공 후 토큰 처리 실패
**해결방법**:
```javascript
// js/app.js의 handleOAuthCallback 함수 확인
// localStorage 키가 'yegame-token'인지 확인
localStorage.setItem('yegame-token', token); // 올바름
localStorage.setItem('authToken', token); // 잘못됨
```

## 🗄️ Database Issues

### Schema Migration Issues

#### **문제**: OAuth 컬럼이 없어서 오류 발생
**해결방법**:
```bash
# OAuth 컬럼 추가 스크립트 실행
node scripts/add-oauth-columns.js
```

**수동 SQL 실행**:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
```

### GAM Balance Issues

#### **문제**: GAM 잔액이 0 또는 null로 표시
**원인**: 데이터베이스 마이그레이션 중 GAM 잔액 초기화 누락

**해결방법**:
```sql
-- 기본 GAM 잔액 설정
UPDATE users SET gam_balance = 10000 WHERE gam_balance IS NULL OR gam_balance = 0;
```

## 🌐 Production Deployment Issues

### Railway Deployment

#### **문제**: 배포 후 기능이 작동하지 않음
**체크리스트**:
1. 환경변수 설정 확인 (Railway 대시보드)
2. `NODE_ENV=production` 설정 확인
3. 데이터베이스 마이그레이션 실행 확인

**필수 환경변수**:
```
NODE_ENV=production
JWT_SECRET=strong-random-secret
SESSION_SECRET=session-secret
DATABASE_URL=postgresql://... (Railway 제공)
GOOGLE_CLIENT_ID=google-client-id
GOOGLE_CLIENT_SECRET=google-client-secret
```

### Domain and SSL Issues

#### **문제**: yegam.ai.kr 접속 시 "안전하지 않음" 표시
**해결시간**: DNS 전파 및 SSL 발급까지 최대 48시간 소요
**확인방법**: 
```bash
# DNS 전파 확인
nslookup yegam.ai.kr

# SSL 인증서 확인
curl -I https://yegam.ai.kr
```

## 🔍 Debugging Tools

### Database Information Script
```bash
# 데이터베이스 상태 확인
node scripts/db-info.js
```

### OAuth Configuration Check
```bash
# OAuth 설정 확인
node scripts/check-oauth-config.js
```

### DNS and SSL Check
```bash
# DNS 및 SSL 상태 확인
node scripts/check-dns.js
```

## 📝 Development Best Practices

### 1. 문제 발생 시 체크 순서
1. **서버 로그 확인** (Railway 또는 로컬 콘솔)
2. **브라우저 콘솔 확인** (JavaScript 오류)
3. **네트워크 탭 확인** (API 호출 상태)
4. **환경변수 확인** (누락된 설정)
5. **데이터베이스 연결 확인**

### 2. 자주 사용하는 디버깅 코드
```javascript
// JWT 토큰 확인
console.log('Token:', localStorage.getItem('yegame-token'));

// 사용자 정보 확인
console.log('User:', JSON.parse(localStorage.getItem('yegame-user') || '{}'));

// API 응답 확인
fetch('/api/auth/verify', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('yegame-token')}` }
})
.then(r => r.json())
.then(console.log);
```

### 3. 커밋 전 체크리스트
- ✅ 로컬에서 회원가입/로그인 테스트
- ✅ OAuth 로그인 테스트 (개발 모드)
- ✅ 닉네임 변경 기능 테스트
- ✅ 환경변수 파일에 민감 정보 포함 안됨
- ✅ 콘솔 오류 없음

## 🚑 Emergency Recovery

### 전체 인증 시스템 리셋
```bash
# 1. 데이터베이스 백업
pg_dump $DATABASE_URL > backup.sql

# 2. JWT SECRET 재생성
# Railway에서 JWT_SECRET 환경변수 새로 생성

# 3. 모든 사용자 로그아웃 (토큰 무효화)
# 서버 재시작으로 자동 처리됨

# 4. OAuth 앱 재설정
# Google Cloud Console에서 클라이언트 시크릿 재생성
```

### 데이터베이스 스키마 복구
```sql
-- 사용자 테이블 기본 구조 확인
\d users

-- OAuth 컬럼 추가 (없는 경우만)
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'local';
-- ... (위의 Schema Migration Issues 참조)
```

---

## 📝 문서 업데이트 정책

**⚠️ 중요**: 
1. 이 가이드의 해결방법들은 모두 실제 테스트를 거친 검증된 방법입니다.
2. **앞으로 발생하는 모든 새로운 이슈와 해결책은 이 문서에 계속 업데이트됩니다.**
3. 문제 발생 시 이 순서대로 진행하면 대부분의 이슈를 해결할 수 있습니다.

### 새 이슈 추가 형식
새로운 문제가 발생하면 다음 형식으로 추가:

```markdown
### [카테고리] 이슈 제목

#### **문제**: 구체적인 문제 설명
**증상**: 사용자가 경험하는 현상

**진단 체크리스트**:
1. 확인해야 할 첫 번째 사항
2. 확인해야 할 두 번째 사항

**해결방법**:
```code
실제 해결 코드 또는 명령어
```

**검증 방법**:
- 해결책이 제대로 작동하는지 확인하는 방법
```

이를 통해 지속적으로 업데이트되는 실용적인 문제 해결 가이드를 유지합니다.