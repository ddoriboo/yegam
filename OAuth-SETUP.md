# 🔐 OAuth 설정 가이드

예겜 플랫폼에 Google 및 GitHub 소셜 로그인을 추가하는 방법입니다.

## 🚀 새로운 기능

✅ **Google OAuth 로그인**  
✅ **GitHub OAuth 로그인**  
✅ **이메일 인증 시스템**  
✅ **통합 사용자 관리**  

## 📋 OAuth 앱 설정

### 1. Google OAuth 설정

1. **Google Cloud Console** 방문
   - https://console.developers.google.com

2. **새 프로젝트 생성** 또는 기존 프로젝트 선택

3. **OAuth 2.0 설정**
   - APIs & Services → Credentials
   - "Create Credentials" → "OAuth client ID"
   - Application type: Web application
   - Authorized redirect URIs:
     ```
     https://your-railway-app.up.railway.app/api/auth/google/callback
     http://localhost:3000/api/auth/google/callback (개발용)
     ```

4. **클라이언트 ID와 Secret 복사**

### 2. GitHub OAuth 설정

1. **GitHub 설정** 페이지 방문
   - https://github.com/settings/applications/new

2. **새 OAuth App 등록**
   - Application name: `예겜 (YeGame)`
   - Homepage URL: `https://your-railway-app.up.railway.app`
   - Authorization callback URL:
     ```
     https://your-railway-app.up.railway.app/api/auth/github/callback
     ```

3. **Client ID와 Client Secret 복사**

## 🔧 Railway 환경 변수 설정

Railway 대시보드 → Variables 탭에서 다음 변수들을 추가하세요:

### 기본 설정
```
NODE_ENV=production
JWT_SECRET=your-super-strong-jwt-secret-32chars-minimum
SESSION_SECRET=your-session-secret-key
PORT=3000
```

### OAuth 설정
```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

### 이메일 설정 (Gmail)
```
EMAIL_USER=your-gmail-address@gmail.com
EMAIL_PASS=your-gmail-app-password
```

### 기타 설정
```
FRONTEND_URL=https://your-railway-app.up.railway.app
```

## 📧 Gmail 앱 비밀번호 설정

1. **Google 계정** → 보안 → 2단계 인증 활성화

2. **앱 비밀번호 생성**
   - Google 계정 관리 → 보안 → 앱 비밀번호
   - "앱 선택" → 메일
   - "기기 선택" → 기타 (사용자 설정 이름)
   - 이름: "예겜 플랫폼"
   - 생성된 16자리 비밀번호를 `EMAIL_PASS`에 사용

## 🔄 데이터베이스 업데이트

새로운 사용자 테이블 스키마가 자동으로 적용됩니다:

```sql
- provider: 'local', 'google', 'github'
- provider_id: OAuth 제공자 고유 ID
- profile_image: 프로필 이미지 URL
- verified: 이메일 인증 상태
- verification_token: 이메일 인증 토큰
```

## 🎯 사용 방법

### 사용자 관점

1. **로그인 페이지** 방문
2. **"Google로 로그인"** 또는 **"GitHub로 로그인"** 클릭
3. OAuth 제공자에서 권한 승인
4. 자동으로 계정 생성 및 로그인 완료

### 개발자 관점

#### API 엔드포인트
```
GET  /api/auth/google          # Google OAuth 시작
GET  /api/auth/google/callback # Google OAuth 콜백
GET  /api/auth/github          # GitHub OAuth 시작  
GET  /api/auth/github/callback # GitHub OAuth 콜백
POST /api/auth/send-verification # 이메일 인증 발송
GET  /api/auth/verify-email/:token # 이메일 인증 확인
```

#### 사용자 데이터 구조
```javascript
{
  id: 1,
  username: "user123",
  email: "user@example.com",
  provider: "google", // 'local', 'google', 'github'
  provider_id: "google-oauth-id",
  profile_image: "https://...",
  verified: true,
  coins: 10000
}
```

## 🔒 보안 고려사항

1. **JWT Secret**: 32자 이상의 강력한 랜덤 키 사용
2. **Session Secret**: 세션 암호화용 별도 키
3. **OAuth Redirect URI**: 정확한 도메인만 허용
4. **이메일 인증**: 새로운 로컬 계정은 이메일 인증 필수
5. **환경 변수**: 민감한 정보는 절대 코드에 하드코딩 금지

## 🧪 테스트 방법

### 로컬 테스트
1. `.env` 파일에 OAuth 설정 추가
2. `npm run dev` 실행
3. `http://localhost:3000/login` 접속
4. 소셜 로그인 버튼 테스트

### 프로덕션 테스트
1. Railway에 배포 후
2. OAuth 앱의 콜백 URL을 프로덕션 도메인으로 설정
3. 실제 소셜 로그인 플로우 테스트

## 🚨 문제 해결

### 자주 발생하는 오류

1. **"redirect_uri_mismatch"**
   - OAuth 앱에서 콜백 URL이 정확히 설정되었는지 확인
   - 프로토콜(http/https) 및 포트 번호 정확성 확인

2. **"invalid_client"**
   - Client ID와 Secret이 올바르게 설정되었는지 확인
   - 환경 변수 이름 오타 확인

3. **"email sending failed"**
   - Gmail 앱 비밀번호가 올바른지 확인
   - 2단계 인증이 활성화되어 있는지 확인

4. **"session error"**
   - SESSION_SECRET 환경 변수 설정 확인
   - 프로덕션에서 secure cookie 설정 확인

## 📞 지원

OAuth 설정에 문제가 있으면:
1. Railway 배포 로그 확인
2. 브라우저 개발자 도구에서 네트워크 오류 확인
3. OAuth 제공자의 개발자 콘솔에서 오류 로그 확인

---

✅ **설정 완료!** 이제 사용자들이 Google과 GitHub으로 쉽게 로그인할 수 있습니다.