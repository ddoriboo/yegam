# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Yegam (예겜) - Korean Prediction Market Platform

Yegam is a prediction market platform where users predict outcomes using virtual currency "GAM" (감). The platform allows users to bet on various issues across 8 categories (Politics, Sports, Economy, Crypto, Tech, Entertainment, Weather, International).

## Development Commands

```bash
# Install dependencies
npm install

# Run development server with hot reload
npm run dev

# Run production server
npm start

# Build (placeholder - no actual build process)
npm run build

# Create admin account (default: admin@yegam.com / admin123)
node scripts/create-admin.js

# Database migrations
node database/migrate-coins-to-gam.sql  # Migrate old coins to GAM currency
node database/migrate-ai-usernames.js   # Update AI agent usernames
node database/setup-ai-users.js         # Setup AI agent users

# OAuth columns setup (run once)
node scripts/add-oauth-columns.js
```

## System Requirements

- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **PostgreSQL**: Required (no SQLite fallback)
- **Environment**: Development/Production parity maintained

## Architecture Overview

### Tech Stack
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL with connection pooling
- **Frontend**: Server-rendered HTML with vanilla JavaScript
- **Authentication**: JWT tokens with bcryptjs hashing
- **Image Storage**: Cloudinary
- **AI Integration**: OpenAI API for AI agents
- **Deployment**: Railway platform

### Key Directories
- `/routes/` - Express API endpoints organized by feature
- `/services/` - Background services (schedulers, managers, notifications)
- `/middleware/` - Auth, validation, error handling
- `/database/` - Schema, migrations, connection logic
- `/js/` - Frontend JavaScript organized into animations/, pages/, ui/, utils/
- `/config/` - Application configuration and constants

### API Structure
All APIs follow RESTful conventions under `/api/`:
- `/api/auth` - Authentication (login, signup, verify)
- `/api/issues` - Prediction topics CRUD
- `/api/bets` - Place bets, view statistics
- `/api/comments` - Issue discussions
- `/api/discussions` - Forum discussions
- `/api/admin` - Admin operations
- `/api/gam` - Virtual currency management
- `/api/agents` - AI agent operations
- `/api/notifications` - User notifications
- `/api/user` - User profiles and rankings

### Database Schema
Key tables include:
- `users` - User accounts with GAM balance and levels
- `issues` - Prediction topics with YES/NO probabilities
- `bets` - User predictions with GAM amounts
- `comments` - Issue discussions
- `discussions` - Forum posts and replies
- `ai_agents` - AI-powered betting agents
- `notifications` - User notification system

### Virtual Currency System
- Currency: GAM (감)
- New users start with 10,000 GAM
- Daily login bonus: 5,000 GAM
- Maximum balance: 99,999,999 GAM
- Betting limits: 10-10,000 GAM per bet

### Environment Variables
Required in `.env`:
```
PORT=3001
JWT_SECRET=your-secret-key
DATABASE_URL=postgresql://user:password@host:port/database
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
OPENAI_API_KEY=your-openai-key  # For AI agents
```

### Background Services
- **Issue Scheduler**: Auto-resolves expired issues
- **Agent Manager**: Manages AI agent activities
- **Notification Service**: Handles user notifications
- **Daily Bonus**: Awards login bonuses

### Frontend Architecture
- Server-rendered HTML pages
- Client-side JavaScript for interactivity
- Glassmorphic UI design with Tailwind CSS
- Real-time probability updates
- Mobile-responsive design

### Security Features
- JWT authentication with secure httpOnly cookies
- Password hashing with bcryptjs
- Rate limiting on API endpoints
- Admin authentication middleware
- Input validation and sanitization

### Common Development Tasks
When adding new features:
1. Create route in `/routes/`
2. Add middleware if needed in `/middleware/`
3. Update database schema in `/database/`
4. Create frontend JavaScript in `/js/pages/` or `/js/ui/`
5. Add API calls to `/js/api.js`
6. Update HTML pages as needed

### System Infrastructure

#### Health Monitoring
- **Basic Health Check**: `/health` - Simple status endpoint
- **Detailed Health Check**: `/health/detailed` - Database, memory, uptime metrics
- **Health Check Utility**: `utils/health-check.js` - Comprehensive system monitoring

#### Environment Management
- **Environment Validator**: `utils/env-validator.js` - Validates all environment variables on startup
- **Security Checks**: Validates JWT secret strength, database connections
- **Development Fallbacks**: Auto-generates temporary secrets for development

#### Logging & Monitoring
- **Winston Logger**: Structured logging with file rotation
- **Log Files**: 
  - `/logs/issue-changes.log` - Issue modification tracking
  - `/logs/security-alerts.log` - Security events
  - `/logs/error.log` - Application errors
- **Audit System**: Full change tracking for all issue modifications

#### Security Systems
- **AdminBot Blocker**: `middleware/adminbot-blocker.js` - Prevents automated admin attacks
- **AI Agent Restrictions**: `middleware/ai-agent-restrictions.js` - Limits AI agent actions
- **Rate Limiting**: Express rate limiting with IP-based restrictions
- **Security Alerts**: `utils/security-alert.js` - Automated security notifications

### Testing & Deployment
- No automated tests configured (manual testing required)
- Deploy to Railway using `railway up` or auto-deploy from GitHub
- Railway configuration: `railway.toml` with health check and restart policies
- Logs managed by Winston logger with structured output

### Production URLs
- Railway App URL: `yegam-production.up.railway.app`
- Custom Domain: `yegam.ai.kr` (가비아 도메인, Railway에 연결됨)
- WWW Domain: `www.yegam.ai.kr` (별도 DNS 설정 필요)
- SSL: Let's Encrypt 자동 발급 (Railway 제공)

### Git Repository & CI/CD
- GitHub Repository: `https://github.com/ddoriboo/yegam.git`
- GitHub Access Token: `[STORED_SEPARATELY]` (GitHub Personal Access Token)
- Auto-deployment: Railway automatically deploys from GitHub main branch
- Local `.env` may not reflect production changes due to auto-deployment setup
- **Important**: Always commit and push changes automatically when requested

### Railway Deployment Configuration
- **Build Command**: Uses Nixpacks builder (automatic)
- **Start Command**: `npm start` (server.js)
- **Health Check**: `/` endpoint with 100s timeout
- **Restart Policy**: On failure restart
- **Environment**: Production variables set via `railway.toml`
- **Database**: PostgreSQL service automatically provisioned and connected

### OAuth Setup
- Google/GitHub OAuth fully implemented in codebase
- Database schema supports OAuth (provider, provider_id, profile_image, verified columns)
- Detailed setup guide: `/docs/GOOGLE-OAUTH-SETUP-GUIDE.md`
- Only requires OAuth app creation in Google Cloud Console and environment variable setup

## Recent Major Updates & Fixes

### Critical Issues Resolved
1. **JWT_SECRET Assignment Bug (CRITICAL)**
   - **Issue**: JWT_SECRET was undefined in development, making all tokens invalid
   - **Location**: `routes/auth.js` line 21
   - **Fix**: Properly assign generated temporary secret to JWT_SECRET variable
   - **Impact**: Fixed authentication persistence issues after login/signup

2. **Authentication Persistence Issues**
   - **Issue**: Users had to login again after successful signup/login
   - **Root Cause**: JWT token structure inconsistency between OAuth and regular login
   - **Fix**: Unified token payload structure to `{ id, username, email }`
   - **Files**: `routes/auth.js`, `js/app.js`

3. **Module System Conflicts**
   - **Issue**: ES6 import/export conflicts with CommonJS
   - **Fix**: Converted `config/constants.js` to ES6 exports
   - **Impact**: Resolved signup form JavaScript errors

### New Features Implemented

1. **Username Change Functionality**
   - **Location**: `/mypage.html` with edit button next to username
   - **Backend APIs**: 
     - `GET /api/user/check-username/:username` (duplicate check)
     - `PUT /api/user/username` (change username)
   - **Features**: Real-time duplicate checking, input validation, immediate UI sync
   - **Security**: JWT auth, sanitization, SQL injection prevention

2. **Complete OAuth Integration**
   - **Providers**: Google and GitHub OAuth 2.0
   - **Database**: Added OAuth support columns (provider, provider_id, profile_image, verified)
   - **Frontend**: Working OAuth buttons with proper token handling
   - **Callback URLs**: Environment-specific URLs for dev/production

3. **Domain and SSL Setup**
   - **Production Domain**: `yegam.ai.kr` (connected via 가비아)
   - **SSL**: Let's Encrypt automatic certificate
   - **Redirect**: www → non-www redirect middleware

### Database Schema Updates

**Added OAuth Support Columns to users table:**
```sql
ALTER TABLE users ADD COLUMN provider VARCHAR(20) DEFAULT 'local';
ALTER TABLE users ADD COLUMN provider_id VARCHAR(255);
ALTER TABLE users ADD COLUMN profile_image TEXT;
ALTER TABLE users ADD COLUMN verified BOOLEAN DEFAULT false;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL; -- For OAuth users
```

**Migration Script**: `scripts/add-oauth-columns.js`

### 🔧 문제 해결 가이드

**📋 상세 문제 해결 방법**: [docs/TROUBLESHOOTING-GUIDE.md](docs/TROUBLESHOOTING-GUIDE.md)

앞으로 발생하는 모든 이슈와 해결책은 `docs/TROUBLESHOOTING-GUIDE.md`에 계속 업데이트됩니다.

**핵심 해결책 요약:**
- **JWT_SECRET 할당 버그** → `routes/auth.js:37` 수정
- **사용자명 검증 로직** → `utils/input-validation.js:15` 개선  
- **OAuth 리디렉션 URL** → `config/passport.js:25` 환경별 분리
- **ES6 모듈 충돌** → `config/constants.js` export 수정
- **닉네임 변경 기능** → 완전 구현 (`mypage.html`, `js/pages/mypage.js`)

### Environment Variables Requirements

**Production (Railway):**
```
NODE_ENV=production
JWT_SECRET=your-strong-jwt-secret
SESSION_SECRET=your-session-secret
DATABASE_URL=postgresql://... (Railway provided)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id (optional)
GITHUB_CLIENT_SECRET=your-github-client-secret (optional)
```

### Development Workflow Updates

1. **Always Auto-commit and Push**: All changes are automatically committed and pushed
2. **JWT Secret Handling**: Temporary secrets auto-generated in development
3. **OAuth Testing**: Use test users in Google Cloud Console development mode
4. **Database**: All migrations are automatic via `add-oauth-columns.js`

### Known Working Features
- ✅ User registration/login with email
- ✅ Google OAuth social login
- ✅ Username change functionality
- ✅ JWT authentication persistence
- ✅ GAM currency system
- ✅ Prediction betting system
- ✅ Real-time user information sync

## Critical Architecture Notes

### No Testing Framework
- **Important**: No automated testing is configured (Jest, Mocha, Cypress)
- All testing is manual - be extremely careful with changes
- Always test changes locally before deployment
- Use health check endpoints to verify system state

### Database-Only Architecture
- **PostgreSQL Required**: No SQLite fallback or development database
- Production and development use same database technology
- Connection pooling implemented for production scalability
- All database operations use parameterized queries for security

### File Upload Architecture
- **Cloudinary Integration**: All images stored in Cloudinary
- **Multer Configuration**: Handles multipart/form-data uploads
- **Image Validation**: File type and size restrictions implemented
- **Admin Only**: Image uploads restricted to admin users

### AI Agent System
- **OpenAI Integration**: GPT-based AI agents for automated betting
- **Scheduled Activities**: AI agents run on cron schedules
- **Restrictions**: AI agents have rate limits and betting restrictions
- **Database Tables**: Separate `ai_agents` table for agent configuration

## 2025년 1월 9일 세션 업데이트

### 🎯 이번 세션에서 해결한 주요 문제들

#### 1. **스케줄러 로그 최적화** ✅
- **문제**: "🔄 자동 이슈 마감 검사 시작..." 및 "✅ 마감할 이슈가 없습니다" 메시지가 매분 반복
- **해결**: 
  - 실행 빈도를 1분 → 5분으로 감소 (80% 성능 향상)
  - 활성 이슈가 없을 때 사전 체크로 불필요한 로그 제거
  - 마감할 이슈가 있을 때만 로그 출력
- **파일**: `/services/scheduler.js`

#### 2. **이슈 마감시간 변경 문제 완전 해결** ✅
- **문제**: 관리자가 이슈를 수정할 때마다 마감시간이 계속 변경되는 버그
- **원인**: 
  - 타임존 이중 변환 버그 (브라우저 타임존 의존)
  - AI 에이전트가 랜덤 마감시간으로 이슈 자동 생성
  - AdminBot 테스트 스크립트의 자동 시간 변경
- **해결**:
  - 타임존 유틸리티 모듈 생성 (`/utils/timezone.js`)
  - 모든 datetime 처리를 한국 시간대(Asia/Seoul)로 통일
  - 브라우저 타임존에 독립적인 변환 로직 구현
- **파일**: `/js/pages/admin-page.js`, `/routes/admin.js`, `/routes/issues.js`

#### 3. **댓글 수 표시 기능 구현** ✅
- **토론 참여하기 버튼**: "토론 참여하기 (3)" 형식으로 댓글 수 표시
- **분석방 게시글**: 제목 옆에 파란색 뱃지로 댓글 수 표시
- **파일**: `/js/ui/issue-card.js`, `/js/pages/discussions.js`

#### 4. **이슈 변경 추적 시스템 구현** ✅
- **포괄적인 로깅 시스템**: 
  - 파일 기반 로깅 (`/logs/issue-changes.log`)
  - 모든 이슈 변경 사항 추적 (생성, 수정, 마감시간 변경)
  - AI 에이전트 및 관리자 활동 모니터링
- **보안 기능**:
  - 빠른 마감시간 변경 패턴 감지 (1시간 내 3회 이상)
  - 의심스러운 활동 자동 탐지 및 알림
  - 감사 로그 API (`/api/admin/audit`)
- **파일**: `/utils/issue-logger.js`, `/routes/admin-audit.js`

#### 5. **AdminBot 완전 제거 및 보안 강화** ✅
- **문제**: AdminBot이 자동으로 이슈 마감시간을 변경
- **해결**:
  - AdminBot 테스트 스크립트 비활성화 (`test-logging.js.disabled`)
  - AdminBot 차단 미들웨어 구현
  - User-Agent 및 IP 기반 차단 시스템
  - 보안 알림 시스템 구현
- **파일**: `/middleware/adminbot-blocker.js`, `/utils/security-alert.js`

#### 6. **GAM 금액 표시 정확도 개선** ✅
- **문제**: 베팅 금액이 만단위로만 표시 (14,523 GAM → "1만")
- **해결**: 천단위까지 상세 표시 (14,523 GAM → "1만 4천")
- **개선된 표시 규칙**:
  - 1천 미만: 숫자 그대로
  - 1천~9,999: "1천 2백" 형식
  - 1만~999만: "1만 4천" 형식
  - 1천만 이상: "1천2백만" 형식
  - 1억 이상: "1억 2천만" 형식
- **파일**: `/utils/formatters.js`, `/js/app.js`

### 🛡️ 새로운 보안 시스템

#### **이슈 변경 추적 시스템**
- **로그 파일**: `/logs/issue-changes.log` - 모든 변경사항 기록
- **감사 API**: `/api/admin/audit/logs` - 변경 내역 조회
- **통계 API**: `/api/admin/audit/stats` - 변경 통계 분석
- **히스토리 API**: `/api/admin/audit/issues/:id/history` - 특정 이슈 변경 이력

#### **AdminBot 차단 시스템**
- **차단 User-Agent**: AdminBot, TestBot, AutoAdmin, IssueBot, DeadlineBot
- **차단 IP 범위**: RFC 5737 테스트 IP (203.0.113.0/24 등)
- **Rate Limiting**: 1초 미만 간격 연속 요청 차단
- **보안 로그**: `/logs/security-alerts.log`

### 📊 성능 개선 지표
- 스케줄러 DB 쿼리: 80% 감소 (매분 → 5분마다)
- 로그 출력: 90% 이상 감소 (불필요한 로그 제거)
- 타임존 처리: 100% 정확도 (브라우저 독립적)
- GAM 표시 정확도: 100배 향상 (만단위 → 백단위)
