# YEGAM (예겜) CODEBASE AUDIT - TECHNICAL HANDOVER DOCUMENT

## Executive Summary

**Project**: Yegam (예겜) - Korean Prediction Market Platform
**Production URL**: https://yegam.ai.kr
**Deployment**: Railway (Nixpacks)
**Database**: PostgreSQL (Railway hosted)
**Codebase Size**: 11MB, 117 JavaScript files, ~16,000 lines of server code
**Primary Language**: Korean (한국어)
**Last Audit**: 2025-12-30

---

## 1. SYSTEM ARCHITECTURE & TECH STACK

### Core Stack
| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | ≥18.0.0 |
| Framework | Express.js | 4.18.2 |
| Database | PostgreSQL | 8.11.0 (pg) |
| Authentication | JWT + Passport.js | 9.0.0 / 0.7.0 |
| AI Integration | OpenAI | 4.20.0 |
| Image Storage | Cloudinary | 1.41.0 |
| Scheduling | node-cron | 4.1.0 |
| Logging | Winston | 3.11.0 |

### Deployment Pipeline
```
GitHub → Railway Auto-deploy → Nixpacks Build → PostgreSQL + Node.js Container
```

**Key Configuration** (`railway.toml`):
- Health check: `/` with 100s timeout
- Restart policy: on_failure
- Timezone: Asia/Seoul

### Server Architecture
- **Entry Point**: `server.js` (687 lines)
- **Middleware Stack**: 15+ layers (Helmet, CORS, compression, session, visitor tracking)
- **Route Modules**: 27 API routes under `/api/`
- **Background Services**: 6 scheduled services (issue scheduler, AI agents, audit monitoring)

### Integration Points
| Integration | Purpose | Dependency |
|-------------|---------|------------|
| OpenAI API | AI agent content generation | Optional (graceful degradation) |
| Cloudinary | Image upload/storage | Optional |
| Google OAuth | Social login | Optional |
| GitHub OAuth | Social login | Optional |

---

## 2. CORE FEATURE IMPLEMENTATION

### 2.1 Prediction Betting System
**Location**: `/routes/issues.js`, `/routes/bets.js`, `/routes/betting.js`

**Mechanics**:
- Binary predictions (YES/NO) on time-bounded issues
- Virtual currency: GAM (감), initial balance 10,000
- Betting limits: 10-10,000 GAM per bet
- One bet per user per issue (UNIQUE constraint)

**Pricing Formula**:
```javascript
yes_price = (yes_volume / total_volume) * 100
// Simple volume-weighted probability
```

**Limitations**:
- No market maker or liquidity pools
- No short-selling or complex derivatives
- Fixed payout ratios (not AMM-based)
- Manual issue resolution by admins (no oracle integration)

### 2.2 User System
**Location**: `/routes/auth.js`, `/routes/user-info.js`

**Features**:
- Email/password registration with bcrypt hashing
- JWT tokens (stored in httpOnly cookies)
- OAuth 2.0 (Google, GitHub) via Passport.js
- Level/rank system based on experience points
- Daily login bonuses (1,000-5,000 GAM based on consecutive days)

**Rank System** (Korean):
```
티끌 → 풀잎 → 새싹 → 가지 → 나무 → 숲 → 산 → 바다 → 하늘 → 우주 → 전설
```

### 2.3 Discussion Forum
**Location**: `/routes/discussions.js`

**Features**:
- 9 categories (정치, 스포츠, 경제, 코인, 테크, 엔터, 날씨, 해외)
- Threaded comments with parent_id
- Like system with duplicate prevention
- AI-powered content generation (10 AI personalities)
- Media attachments (Cloudinary)

### 2.4 AI Agent System
**Location**: `/services/agentManager.js`, `/services/agentScheduler.js`

**Features**:
- 10 distinct AI personalities (data-kim, chart-king, hipster-choi, etc.)
- Automated post generation every 15 minutes
- Reply generation every 10 minutes (30% probability)
- Emergency stop capability via database flag

**Limitations**:
- No rate limiting on OpenAI API calls
- Content filtering is regex-based (not ML)
- Model preference for gpt-4o-mini may not exist
- Token usage unpredictable (800-2000 per request)

### 2.5 Mini-Games (Bustabit)
**Location**: `/services/minigames/bustabit-engine.js`

**Features**:
- Crash game with random multiplier (1.01x - 10,000x)
- 5-second betting phase, 3-second waiting phase
- House edge: 1%
- Real-time multiplier updates (50ms tick)

**Limitations**:
- All game state in-memory (lost on restart)
- No persistence of game history
- setTimeout-based scheduling (can drift)

---

## 3. DATABASE SCHEMA & DATA INTEGRITY

### Schema Overview
**Location**: `/database/postgres.js`

**Core Tables** (14+):
| Table | Purpose | Row Count (Est.) |
|-------|---------|------------------|
| users | User accounts | <1,000 |
| issues | Prediction topics | <100 |
| bets | User predictions | <10,000 |
| comments | Issue discussions | <5,000 |
| discussion_posts | Forum posts | <500 |
| discussion_comments | Forum replies | <2,000 |
| ai_agents | AI configurations | 10 |
| notifications | User notifications | <10,000 |
| gam_transactions | Currency ledger | <50,000 |
| issue_audit_logs | Change tracking | <10,000 |

### Key Constraints
```sql
-- One bet per user per issue
UNIQUE(user_id, issue_id) ON bets

-- One like per user per content
UNIQUE(post_id, user_id) ON discussion_post_likes
UNIQUE(comment_id, user_id) ON discussion_comment_likes

-- OAuth deduplication
UNIQUE(provider, provider_id) ON users
```

### Indexing Strategy
- 40+ indexes across all tables
- Coverage for: status/category/date queries, user lookups, sorting
- **Missing**: Time-range indexes on `created_at` for audit queries

### Data Integrity Features
1. **Timezone Safety**: TIMESTAMPTZ columns with Asia/Seoul global setting
2. **PostgreSQL Triggers**: Auto-updating comment_count, like_count
3. **Soft Deletes**: `deleted_at` timestamp for comments
4. **Transaction Safety**: ACID-compliant currency operations
5. **Audit Trail**: 90-day retention for issue changes

### Schema Technical Debt
- Legacy `coins` column still exists (should be removed)
- Mixed TIMESTAMP and TIMESTAMPTZ types
- No table partitioning for high-growth tables
- GAM transactions table could exceed storage limits over time

---

## 4. TECHNICAL DEBT & SCALABILITY

### Critical Issues

#### 4.1 In-Memory Session Storage
**Risk**: HIGH
**Location**: `server.js:77-86`
```javascript
app.use(session({
    secret: process.env.SESSION_SECRET,
    // Uses default MemoryStore
}));
```
**Problem**: Sessions lost on restart, single-node only
**Solution**: Implement connect-pg-simple for PostgreSQL session store

#### 4.2 OpenAI API Without Circuit Breaker
**Risk**: HIGH
**Location**: `/services/agentManager.js`
**Problem**: No rate limiting, no exponential backoff, cascade failures
**Solution**: Implement circuit breaker pattern with retry logic

#### 4.3 Static File Exposure
**Risk**: MEDIUM
**Location**: `server.js:111`
```javascript
app.use(express.static(__dirname));
```
**Problem**: Serves entire project root, exposes `.env.development`, configs
**Solution**: Limit to specific directories (`/public`, `/css`, `/js`)

#### 4.4 No Automated Testing
**Risk**: MEDIUM
**Problem**: Zero test coverage (no Jest, Mocha, Cypress)
**Solution**: Implement test suite before any major changes

#### 4.5 Hardcoded JWT Secret in Repository
**Risk**: MEDIUM
**Location**: `railway.toml`
```toml
JWT_SECRET = "yegame-production-secret-key-2025-very-secure-random-string"
```
**Problem**: Secret visible in version control
**Solution**: Use Railway secrets management

### Scalability Bottlenecks

| Bottleneck | Current Limit | Mitigation |
|------------|---------------|------------|
| Session Store | Single server | PostgreSQL sessions |
| GAM Transactions | Unbounded growth | Table partitioning, archiving |
| Notification Broadcast | O(n) per user | Message queue (Bull/RabbitMQ) |
| Image Processing | Synchronous | Background job processing |
| AI Content Generation | OpenAI rate limits | Request queuing, caching |

### Code Quality Issues
- No TypeScript (runtime type errors possible)
- Mixed CommonJS and ES6 modules
- Inconsistent error handling patterns
- Console.log debugging left in production code
- Korean comments without English alternatives

---

## 5. PRODUCT-MARKET FIT (TECHNICAL PERSPECTIVE)

### Why Users Are Not Engaging

#### 5.1 UX Friction Points
| Issue | Technical Cause | User Impact |
|-------|-----------------|-------------|
| Slow initial load | No SSR, large JS bundles | 3-5 second wait time |
| No real-time updates | HTTP polling, no WebSocket | Stale betting odds |
| Mobile scroll jank | Unoptimized DOM updates | Poor mobile experience |
| Tutorial complexity | 58KB tutorial.js | Users skip onboarding |

#### 5.2 Feature Implementation Gaps
| Missing Feature | Market Expectation | Technical Gap |
|-----------------|-------------------|---------------|
| Real-time odds | WebSocket/SSE updates | Only HTTP polling |
| Price charts | Historical data visualization | No charting library |
| Social sharing | Deep links, OG tags | Basic metadata only |
| Push notifications | Service worker | None implemented |
| Leaderboard live updates | Real-time ranking | Manual page refresh |

#### 5.3 Engagement Mechanics Analysis
| Mechanic | Implementation | Effectiveness |
|----------|---------------|---------------|
| Daily bonus | 1,000-5,000 GAM | Low (no streak incentive) |
| Achievements | Implemented | Hidden, not promoted |
| AI agents | 10 personalities | Feel robotic, detectable |
| Comments | Basic threading | No @mentions, no reactions |
| Notifications | In-app only | No push, no email |

#### 5.4 Performance vs. Competitors
```
Feature Gap Analysis:
- Polymarket: AMM pricing, decentralized, real money → Yegam: Fixed odds, centralized, virtual
- Metaculus: Question calibration, forecaster scoring → Yegam: Binary YES/NO only
- PredictIt: Real money, regulatory compliance → Yegam: No monetization path
```

#### 5.5 Technical Barriers to Pivot

**If pivoting to real money**:
- No KYC/AML integration
- No payment processor integration
- No regulatory compliance features
- No fraud detection system

**If pivoting to social platform**:
- No follower/following system
- No direct messaging
- No activity feed algorithm
- No content discovery beyond categories

**If pivoting to gamification**:
- Level system is passive (no active progression)
- No daily challenges or quests
- No seasonal events infrastructure
- No leaderboard competitions

---

## 6. RECOMMENDATIONS FOR PIVOT

### Option A: Social Prediction Community
**Technical Requirements**:
1. Implement follower graph (new users table relationships)
2. Add activity feed with algorithm
3. WebSocket for real-time updates
4. Push notifications via service workers
5. @mentions and reaction system

**Estimated Effort**: 3-4 weeks

### Option B: Gamified Learning Platform
**Technical Requirements**:
1. Expand achievement system
2. Add daily challenges infrastructure
3. Implement streak rewards
4. Create seasonal event framework
5. Add team/guild system

**Estimated Effort**: 2-3 weeks

### Option C: B2B Prediction API
**Technical Requirements**:
1. API key authentication system
2. Rate limiting per client
3. Webhook notifications
4. Documentation (OpenAPI/Swagger)
5. Client dashboard

**Estimated Effort**: 2-3 weeks

### Option D: Clean Slate Rebuild
**Keep**:
- PostgreSQL schema (mostly sound)
- Railway deployment pipeline
- Authentication system
- Admin panel

**Replace**:
- Frontend (consider Next.js/SvelteKit for SSR)
- Real-time layer (add Socket.io or Ably)
- Testing (add Jest + Playwright)
- Type safety (migrate to TypeScript)

**Estimated Effort**: 6-8 weeks

---

## 7. HANDOVER CHECKLIST

### Environment Variables Required
```bash
DATABASE_URL=postgresql://...  # Railway provided
JWT_SECRET=...                 # 32+ chars
SESSION_SECRET=...             # For express-session
CLOUDINARY_CLOUD_NAME=...      # Optional
CLOUDINARY_API_KEY=...         # Optional
CLOUDINARY_API_SECRET=...      # Optional
OPENAI_API_KEY=...             # For AI agents (optional)
GOOGLE_CLIENT_ID=...           # For OAuth (optional)
GOOGLE_CLIENT_SECRET=...       # For OAuth (optional)
```

### Critical Files to Review First
1. `/server.js` - Main application entry
2. `/database/postgres.js` - Schema and migrations
3. `/routes/auth.js` - Authentication logic
4. `/routes/issues.js` - Core betting logic
5. `/services/scheduler.js` - Background jobs
6. `/js/app.js` - Frontend entry point

### Known Working Features
- User registration/login
- Google OAuth
- Issue CRUD (admin)
- Betting placement
- Comment system
- Discussion forum
- Admin panel
- AI agent posts
- Daily login bonus

### Known Issues
- Session lost on Railway restart
- AI agents may generate inappropriate content
- Mobile scroll performance
- No real-time updates
- Large bundle sizes

---

## 8. QUICK START FOR NEW AGENT

```bash
# Clone and install
git clone https://github.com/ddoriboo/yegam.git
cd yegam
npm install

# Set up environment
cp .env.example .env
# Edit .env with DATABASE_URL from Railway

# Run locally
npm run dev

# Deploy
git push origin main  # Auto-deploys to Railway
```

### Key API Endpoints for Testing
```bash
# Health check
curl https://yegam.ai.kr/health

# Detailed health
curl https://yegam.ai.kr/health/detailed

# Login
curl -X POST https://yegam.ai.kr/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Get issues
curl https://yegam.ai.kr/api/issues
```

---

## 9. FILE STRUCTURE REFERENCE

```
yegam/
├── server.js                 # Main application entry (687 lines)
├── package.json              # Dependencies and scripts
├── railway.toml              # Railway deployment config
├── CLAUDE.md                 # AI agent instructions
│
├── routes/                   # API endpoints (27 files)
│   ├── auth.js              # Authentication
│   ├── issues.js            # Prediction issues
│   ├── bets.js              # Betting operations
│   ├── betting.js           # Betting logic
│   ├── discussions.js       # Forum
│   ├── admin.js             # Admin operations
│   └── ...
│
├── services/                 # Background services
│   ├── scheduler.js         # Issue auto-closer
│   ├── agentManager.js      # AI content generator
│   ├── agentScheduler.js    # AI task orchestrator
│   ├── notificationService.js
│   ├── gamService.js        # Currency manager
│   ├── auditMonitoringService.js
│   └── minigames/
│       └── bustabit-engine.js
│
├── database/                 # Database layer
│   ├── postgres.js          # Connection and schema
│   ├── database.js          # Query abstraction
│   └── *.sql                # Migration scripts
│
├── middleware/               # Express middleware
│   ├── auth.js              # JWT validation
│   ├── adminbot-blocker.js  # Security
│   └── ...
│
├── js/                       # Frontend JavaScript
│   ├── app.js               # Main entry (201KB)
│   ├── auth.js              # Authentication
│   ├── pages/               # Page-specific JS
│   ├── ui/                  # UI components
│   ├── utils/               # Utilities
│   └── animations/          # Visual effects
│
├── utils/                    # Server utilities
│   ├── timezone.js          # Timezone handling
│   ├── formatters.js        # GAM formatting
│   ├── issue-logger.js      # Audit logging
│   └── ...
│
├── config/                   # Configuration
│   ├── constants.js         # App constants
│   └── passport.js          # OAuth config
│
├── logs/                     # Log files
│   ├── issue-changes.log
│   ├── security-alerts.log
│   └── error.log
│
└── docs/                     # Documentation
    ├── TECHNICAL-HANDOVER.md # This file
    ├── TROUBLESHOOTING-GUIDE.md
    └── GOOGLE-OAUTH-SETUP-GUIDE.md
```

---

**Document Generated**: 2025-12-30
**Audit Completed By**: Claude Code Agent
