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