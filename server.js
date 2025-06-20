const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const issueRequestRoutes = require('./routes/issue-requests');
const betRoutes = require('./routes/bets');
const commentRoutes = require('./routes/comments');
const adminCommentRoutes = require('./routes/admin-comments');
const adminRoutes = require('./routes/admin');
const adminAuthRoutes = require('./routes/admin-auth');
const { router: secureAdminAuthRoutes } = require('./routes/admin-auth-secure');
const uploadRoutes = require('./routes/upload');
const { initDatabase } = require('./database/database');
const issueScheduler = require('./services/scheduler');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// 버전 정보 - PostgreSQL 완전 통일 버전
console.log('🚀 예겜 서버 v2.0 - PostgreSQL 완전 통일 버전');

// 미들웨어 (개발/프로덕션 환경에 따라 보안 설정 조정)
if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
        contentSecurityPolicy: false, // CSP 비활성화로 일단 해결
        crossOriginEmbedderPolicy: false
    }));
} else {
    app.use(helmet({ contentSecurityPolicy: false }));
}
app.use(cors());
app.use(express.json());
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

// API 라우트
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/issue-requests', issueRequestRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/admin/comments', adminCommentRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin-auth', secureAdminAuthRoutes); // 보안 관리자 인증 API
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

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

// 404 핸들러
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: '요청하신 페이지를 찾을 수 없습니다.'
    });
});

// 전역 에러 핸들러
app.use(errorHandler);

// 데이터베이스 초기화 후 서버 시작
console.log('🔄 데이터베이스 초기화 시작...');
initDatabase().then(() => {
    console.log('✅ 데이터베이스 초기화 완료');
    
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
            console.log('✅ 스케줄러 시작 성공');
        } catch (schedulerError) {
            console.error('❌ 스케줄러 시작 실패:', schedulerError);
            console.error('❌ 서버는 계속 실행되지만 스케줄러는 비활성화됩니다.');
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
}).catch(err => {
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
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다 (DB 연결 실패 상태)`);
    });
});