const express = require('express');
const { secureAdminMiddleware: adminBoundaryMiddleware } = require('./middleware/admin-auth-secure');
const automaticSettlement = require('./services/automaticSettlement');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config(); // production config
// require('dotenv').config({ path: '.env.local' }); local config

// 환경변수 검증 (서버 시작 전 실행)
const EnvironmentValidator = require('./utils/env-validator');
const envConfig = EnvironmentValidator.validate();

const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const issueRequestRoutes = require('./routes/issue-requests');
const betRoutes = require('./routes/bets');
const commentRoutes = require('./routes/comments');
const adminCommentRoutes = require('./routes/admin-comments');
const adminRoutes = require('./routes/admin');
const { router: secureAdminAuthRoutes } = require('./routes/admin-auth-secure');
const adminAuditRoutes = require('./routes/admin-audit');
const issueLogsRoutes = require('./routes/issue-logs');
const uploadRoutes = require('./routes/upload');
const notificationRoutes = require('./routes/notifications');
const testNotificationRoutes = require('./routes/test-notifications');
const gamRoutes = require('./routes/gam');
const debugGamRoutes = require('./routes/debug-gam');
const userInfoRoutes = require('./routes/user-info');
const discussionsRoutes = require('./routes/discussions');
const { router: agentRoutes, initializeAgents } = require('./routes/agents');
const externalAgentsRoutes = require('./routes/external-agents');
const visitorsRoutes = require('./routes/visitors');
const testOpenAIRoutes = require('./routes/test-openai');
const minigamesRoutes = require('./routes/minigames');
const { initializeBustabitEngine } = require('./services/minigames/bustabit-engine');
const { initDatabase } = require('./database/database');
const { initAIAgentsDatabase } = require('./database/init-ai-agents');
const issueScheduler = require('./services/scheduler');
const { errorHandler } = require('./middleware/errorHandler');
const visitorTrackingMiddleware = require('./middleware/visitor-tracking');
const HealthCheck = require('./utils/health-check');

// End Date 보안 시스템 모듈들
// const { recoveryService } = require('./services/end-date-recovery'); // Temporarily disabled
const { aiRestrictions } = require('./middleware/ai-agent-restrictions');

// Passport 설정 로드
require('./config/passport');

const app = express();
const PORT = envConfig.port || 3000;

// 헬스체크 인스턴스 생성
const healthCheck = new HealthCheck();

// 버전 정보 - End Date 보안 시스템 통합 버전
console.log('🚀 예겜 서버 v2.2 - End Date 데이터 일관성 보장 시스템');

// Railway 프록시 신뢰 설정 (HTTPS 리다이렉션을 위해 필요)
app.set('trust proxy', true);

// 미들웨어 (개발/프로덕션 환경에 따라 보안 설정 조정)
if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
        contentSecurityPolicy: false, // CSP 비활성화로 일단 해결
        crossOriginEmbedderPolicy: false
    }));
} else {
    app.use(helmet({ contentSecurityPolicy: false }));
}
// www 리다이렉션 미들웨어 (프로덕션 환경에서만)
const wwwRedirect = require('./middleware/www-redirect');
app.use(wwwRedirect);

// 세션 설정
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS에서만 secure
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24시간
    }
}));

// Passport 초기화
app.use(passport.initialize());
app.use(passport.session());

// gzip 압축 미들웨어 (정적 파일 제공 전에 설정)
app.use(compression({
    level: 6, // 압축 레벨 (1-9, 6이 성능/압축률 균형점)
    threshold: 1024, // 1KB 이상 파일만 압축
    filter: (req, res) => {
        // 이미 압축된 파일은 제외
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

app.use(cors());
app.use(express.json());

// 방문자 트래킹 미들웨어 (정적 파일 제공 전에 실행)
app.use(visitorTrackingMiddleware);

app.use(express.static(path.join(__dirname), {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// AI Agent Skill 파일 제공
app.get('/skill.md', (req, res) => {
    res.type('text/markdown');
    res.sendFile(path.join(__dirname, 'skill.md'));
});

// 헬스체크 및 모니터링 라우트
app.get('/health', async (req, res) => {
    try {
        const result = await healthCheck.quickCheck();
        const statusCode = result.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(result);
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

app.get('/health/detailed', async (req, res) => {
    try {
        const result = await healthCheck.performHealthCheck();
        const statusCode = result.status === 'healthy' ? 200 : 
                          result.status === 'warning' ? 200 : 503;
        res.status(statusCode).json(result);
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// API 라우트
if (process.env.NODE_ENV === 'production') {
    for (const key of ['JWT_SECRET','SESSION_SECRET','ADMIN_JWT_SECRET']) {
        if (!process.env[key] || process.env[key].length < 32) throw new Error(`${key} must be securely configured`);
    }
}
app.use('/api/admin', adminBoundaryMiddleware);
app.use(['/api/test-notifications','/api/debug/gam','/api/test-openai'], adminBoundaryMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/issue-requests', issueRequestRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/test-notifications', testNotificationRoutes);
app.use('/api/gam', gamRoutes);
app.use('/api/debug/gam', debugGamRoutes);
app.use('/api/user', userInfoRoutes);
app.use('/api/discussions', discussionsRoutes);
app.use('/api/agents', externalAgentsRoutes);  // 외부 에이전트 API (먼저 등록)
app.use('/api/agents', agentRoutes);  // 내부 AI 관리용
app.use('/api/visitors', visitorsRoutes);
app.use('/api/test-openai', testOpenAIRoutes);
app.use('/api/minigames', minigamesRoutes);
app.use('/api/admin/comments', adminCommentRoutes);
app.use('/api/admin-auth', secureAdminAuthRoutes); // 보안 관리자 인증 API
app.use('/api/admin/audit', adminAuditRoutes); // 감사 로그 및 보안 모니터링 API
app.use('/api/admin/logs', issueLogsRoutes); // 이슈 수정 로그 API
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

// 관리자 초기 설정은 /setup-admin 엔드포인트에서 처리

// Cloudinary를 사용하므로 로컬 파일 서빙 불필요

// 프론트엔드 라우트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/ai-agents', (req, res) => {
    res.sendFile(path.join(__dirname, 'ai-agents-dashboard.html'));
});

app.get('/admin-issue-logs', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-issue-logs.html'));
});

// 테이블 구조 진단 엔드포인트
// Legacy unauthenticated administrator diagnostics/bootstrap removed.
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/issues', (req, res) => {
    res.sendFile(path.join(__dirname, 'issues.html'));
});

app.get('/mypage', (req, res) => {
    res.sendFile(path.join(__dirname, 'mypage.html'));
});

app.get('/tier_guide', (req, res) => {
    res.sendFile(path.join(__dirname, 'tier_guide.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'terms.html'));
});

app.get('/discussions', (req, res) => {
    res.sendFile(path.join(__dirname, 'discussions.html'));
});

app.get('/discussion-post', (req, res) => {
    res.sendFile(path.join(__dirname, 'discussion-post.html'));
});

// API 엔드포인트 테스트
// Legacy unauthenticated administrator diagnostics/bootstrap removed.
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: '요청하신 페이지를 찾을 수 없습니다.'
    });
});

// 전역 에러 핸들러
app.use(errorHandler);

// 데이터베이스 초기화 후 서버 시작
const startServer = async () => {
    try {
        console.log('🔄 데이터베이스 초기화 시작...');
        await initDatabase();
        console.log('✅ 기본 데이터베이스 초기화 완료');
        
        // AI 에이전트 데이터베이스 스키마 초기화
        try {
            console.log('🤖 AI 에이전트 데이터베이스 초기화 중...');
            const aiDbSuccess = await initAIAgentsDatabase();
            if (aiDbSuccess) {
                console.log('✅ AI 에이전트 DB 스키마 초기화 완료');
            } else {
                console.log('⚠️ AI 에이전트 DB 초기화 실패 - 계속 진행');
            }
        } catch (aiDbError) {
            console.error('❌ AI 에이전트 DB 초기화 오류:', aiDbError);
            console.error('❌ AI 에이전트 DB 없이 서버 계속 실행');
        }
        
        // AI 에이전트 시스템 초기화
        try {
            console.log('🤖 AI 에이전트 시스템 초기화 중...');
            await initializeAgents();
            console.log('✅ AI 에이전트 시스템 초기화 완료');
        } catch (agentError) {
            console.error('❌ AI 에이전트 초기화 실패:', agentError);
            console.error('❌ AI 에이전트 없이 서버 계속 실행');
        }
        
        // Bustabit 게임 엔진 초기화
        try {
            console.log('🚀 Bustabit 게임 엔진 초기화 중...');
            initializeBustabitEngine();
            console.log('✅ Bustabit 게임 엔진 초기화 완료');
        } catch (bustabitError) {
            console.error('❌ Bustabit 엔진 초기화 실패:', bustabitError);
            console.error('❌ Bustabit 게임 없이 서버 계속 실행');
        }
    } catch (err) {
        console.error('❌ 데이터베이스 초기화 실패:', err);
        console.error('❌ 에러 메시지:', err.message);
        console.error('❌ 에러 세부사항:', err.stack);
        console.error('❌ 환경 변수 확인:', {
            NODE_ENV: process.env.NODE_ENV,
            DATABASE_URL: process.env.DATABASE_URL ? '***설정됨***' : '설정되지 않음',
            PORT: process.env.PORT
        });
        
        // 에러가 있어도 서버는 시작해서 디버깅할 수 있게 함
        console.log('⚠️ 데이터베이스 초기화 실패했지만 서버를 시작합니다...');
    }
    
    try {
        await automaticSettlement.initialize();
        console.log('Atomic settlement schema ready');
    } catch (error) {
        console.error('Automatic settlement disabled: schema initialization failed', error.code || 'SCHEMA_NOT_READY');
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 예겜 서버가 포트 ${PORT}에서 실행 중입니다.`);
        if (process.env.NODE_ENV === 'production') {
            console.log(`🌐 Railway 공개 URL에서 접속하세요.`);
            console.log(`📍 Railway 대시보드에서 공개 URL을 확인하세요.`);
        } else {
            console.log(`🌐 http://localhost:${PORT} 에서 접속하세요.`);
        }
        
        // 이슈 자동 마감 스케줄러 시작
        try {
            console.log('🔄 스케줄러 초기화 중...');
            issueScheduler.start();
            automaticSettlement.start();
            console.log('✅ 스케줄러 시작 성공');
        } catch (schedulerError) {
            console.error('❌ 스케줄러 시작 실패:', schedulerError);
            console.error('❌ 서버는 계속 실행되지만 스케줄러는 비활성화됩니다.');
        }
        
        // 감사 모니터링 서비스 시작
        try {
            console.log('🛡️ 감사 모니터링 서비스 초기화 중...');
            const auditMonitoringService = require('./services/auditMonitoringService');
            auditMonitoringService.start();
            console.log('✅ 감사 모니터링 서비스 시작 성공');
        } catch (auditError) {
            console.error('❌ 감사 모니터링 서비스 시작 실패:', auditError);
            console.error('❌ 서버는 계속 실행되지만 감사 모니터링은 비활성화됩니다.');
        }
        
        // 데이터베이스 연결 상태 재확인
        try {
            const { getDB } = require('./database/database');
            const testDb = getDB();
            if (testDb) {
                console.log('✅ 서버 시작 후 데이터베이스 연결 확인됨');
            } else {
                console.error('❌ 서버 시작 후 데이터베이스 연결 실패');
            }
        } catch (dbTestError) {
            console.error('❌ 데이터베이스 연결 테스트 실패:', dbTestError);
        }
    });
};

// 서버 시작
startServer();