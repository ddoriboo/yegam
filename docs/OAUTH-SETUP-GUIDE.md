# OAuth 설정 가이드 (Google & GitHub)

## 📋 개요
예겜 서비스에 Google과 GitHub 소셜 로그인을 설정하는 완전한 가이드입니다.

## 🔧 서버 설정

### 1. 필수 의존성 설치
```bash
npm install passport passport-google-oauth20 passport-github2 express-session
```

### 2. 환경 변수 설정

#### 개발 환경 (.env)
```env
NODE_ENV=development
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
SESSION_SECRET=your-session-secret
```

#### 프로덕션 환경 (Railway)
Railway 대시보드에서 다음 환경변수 설정:
```
NODE_ENV=production
GOOGLE_CLIENT_ID=프로덕션용 Google 클라이언트 ID
GOOGLE_CLIENT_SECRET=프로덕션용 Google 클라이언트 시크릿
GITHUB_CLIENT_ID=프로덕션용 GitHub 클라이언트 ID
GITHUB_CLIENT_SECRET=프로덕션용 GitHub 클라이언트 시크릿
SESSION_SECRET=강력한 세션 시크릿
```

### 3. 데이터베이스 스키마 업데이트

OAuth 로그인을 위한 컬럼 추가:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
```

## 🌐 Google Cloud Console 설정

### 1. 프로젝트 생성
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. "APIs & Services" → "Credentials" 이동

### 2. OAuth 2.0 클라이언트 ID 생성
1. **"+ CREATE CREDENTIALS"** 클릭
2. **"OAuth client ID"** 선택
3. **애플리케이션 유형**: "Web application" 선택
4. **이름**: "Yegam Web Client" (또는 원하는 이름)

### 3. 승인된 자바스크립트 원본 설정
```
http://localhost:3000 (개발용)
https://yegam.ai.kr (프로덕션용)
```

### 4. 승인된 리디렉션 URI 설정
```
http://localhost:3000/api/auth/google/callback (개발용)
https://yegam.ai.kr/api/auth/google/callback (프로덕션용)
```

### 5. OAuth 동의 화면 설정
1. "OAuth consent screen" 탭 이동
2. **사용자 유형**: "External" 선택
3. **애플리케이션 이름**: "예겜 (Yegam)"
4. **사용자 지원 이메일**: 관리자 이메일
5. **개발자 연락처 정보**: 개발자 이메일
6. **범위**: email, profile 추가
7. **테스트 사용자**: 개발 중 사용할 Gmail 계정 추가

### 6. 클라이언트 ID 및 시크릿 복사
생성된 클라이언트 ID와 시크릿을 환경변수에 설정

## 🐱 GitHub OAuth 설정

### 1. GitHub OAuth App 생성
1. GitHub 설정 → Developer settings → OAuth Apps
2. **"New OAuth App"** 클릭
3. **Application name**: "Yegam"
4. **Homepage URL**: 
   - 개발: `http://localhost:3000`
   - 프로덕션: `https://yegam.ai.kr`
5. **Authorization callback URL**:
   - 개발: `http://localhost:3000/api/auth/github/callback`
   - 프로덕션: `https://yegam.ai.kr/api/auth/github/callback`

### 2. 클라이언트 ID 및 시크릿 설정
생성된 클라이언트 ID와 시크릿을 환경변수에 설정

## 🔍 문제 해결

### 1. redirect_uri_mismatch 오류
**원인**: 콜백 URL 불일치
**해결방법**:
1. Google Cloud Console에서 리디렉션 URI 정확히 확인
2. `config/passport.js`에서 절대 URL 사용:
```javascript
callbackURL: process.env.NODE_ENV === 'production' 
    ? "https://yegam.ai.kr/api/auth/google/callback"
    : "http://localhost:3000/api/auth/google/callback"
```

### 2. 세션 오류
**원인**: 세션 설정 문제
**해결방법**: `server.js`에서 세션 설정 확인
```javascript
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24시간
    }
}));
```

### 3. 토큰 구조 불일치
**원인**: OAuth 토큰과 일반 토큰 구조 차이
**해결방법**: 모든 토큰에 동일한 구조 사용
```javascript
const tokenPayload = {
    id: user.id,
    username: user.username,
    email: user.email
};
```

### 4. 프로필 이미지 표시 안됨
**원인**: Google/GitHub 프로필 이미지 URL 처리
**해결방법**: 프로필 이미지 저장 및 사용
```javascript
// passport.js에서
profile_image: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null
```

## 📝 테스트 체크리스트

### 개발 환경 테스트
- [ ] Google 로그인 버튼 클릭
- [ ] Google 계정 선택/로그인
- [ ] 콜백 처리 및 토큰 생성
- [ ] 사용자 정보 저장 확인
- [ ] 헤더 사용자 정보 표시 확인

### 프로덕션 환경 테스트
- [ ] HTTPS 환경에서 OAuth 동작 확인
- [ ] 실제 도메인에서 콜백 처리 확인
- [ ] 새 사용자 계정 생성 확인
- [ ] 기존 사용자 로그인 확인

## 🚀 배포 시 주의사항

### 1. 환경별 설정 분리
- 개발/프로덕션 환경 각각 별도 OAuth 앱 생성
- 환경변수 정확히 설정
- 콜백 URL 환경에 맞게 설정

### 2. 보안 고려사항
- CLIENT_SECRET 절대 노출 금지
- SESSION_SECRET 강력한 랜덤 값 사용
- HTTPS 환경에서만 프로덕션 배포
- 테스트 사용자 목록 관리

### 3. 모니터링
- OAuth 로그인 성공/실패 로그 확인
- 사용자 생성/로그인 통계 모니터링
- 오류 발생 시 알림 설정

## 📊 성공 지표
- OAuth 로그인 성공률 95% 이상
- 평균 로그인 시간 3초 이내
- 사용자 계정 생성 오류율 1% 이하

## 🔗 참고 링크
- [Google OAuth 2.0 가이드](https://developers.google.com/identity/protocols/oauth2)
- [GitHub OAuth 가이드](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [Passport.js 문서](http://www.passportjs.org/docs/)