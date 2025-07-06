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

# Create admin account (default: admin@yegam.com / admin123)
node scripts/create-admin.js

# Database migrations
node database/migrate-coins-to-gam.sql  # Migrate old coins to GAM currency
node database/migrate-ai-usernames.js   # Update AI agent usernames
node database/setup-ai-users.js         # Setup AI agent users
```

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

### Testing & Deployment
- No automated tests configured (manual testing required)
- Deploy to Railway using `railway up`
- Health check endpoint: `/health`
- Logs managed by Winston logger

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