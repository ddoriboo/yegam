require('dotenv').config();
const express = require('express');
const path = require('path');
const passport = require('./config/passport');
const { configureMiddleware } = require('./config/middleware');
const { errorHandler } = require('./middleware/errorHandler');
const { validateEnvironment, getConfig } = require('./config/env');

// 환경 변수 검증
validateEnvironment();
const config = getConfig();

const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const betRoutes = require('./routes/bets');
const bettingRoutes = require('./routes/betting');
const gamRoutes = require('./routes/gam');
const settlementRoutes = require('./routes/settle');
const achievementRoutes = require('./routes/achievements');
const rankingRoutes = require('./routes/rankings');
const profileRoutes = require('./routes/profile');
const commentRoutes = require('./routes/comments');
const adminRoutes = require('./routes/admin');
const { initDatabase } = require('./database/init');
const gamService = require('./services/gamService');

const app = express();
const PORT = config.port;

// 미들웨어 설정
configureMiddleware(app);

// Passport 미들웨어
app.use(passport.initialize());
app.use(passport.session());

// API 라우트
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/betting', bettingRoutes);
app.use('/api/gam', gamRoutes);
app.use('/api/settle', settlementRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/rankings', rankingRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/admin', adminRoutes);

// 에러 처리 미들웨어 (모든 라우트 이후에 추가)
app.use(errorHandler);

// 프론트엔드 라우트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
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

// 서버를 먼저 시작하고 데이터베이스를 비동기로 초기화
const server = app.listen(PORT, () => {
    console.log(`🚀 예겜 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`🌐 http://localhost:${PORT} 에서 접속하세요.`);
    
    // 서버 시작 후 데이터베이스 초기화
    initDatabase().then(() => {
        // GamService 초기화
        gamService.init();
        console.log('✅ GamService 초기화 완료');
        console.log('✅ 서버가 완전히 준비되었습니다!');
    }).catch(err => {
        console.error('⚠️ 데이터베이스 초기화 실패:', err);
        console.log('서버는 실행 중이지만 일부 기능이 제한될 수 있습니다.');
    });
});

    // 서버 에러 처리
    server.on('error', (err) => {
        console.error('❌ 서버 에러:', err);
        if (err.code === 'EADDRINUSE') {
            console.error(`포트 ${PORT}가 이미 사용 중입니다. 다른 포트를 사용하거나 기존 프로세스를 종료하세요.`);
        }
    });

    // 프로세스 종료 시 정리
    process.on('SIGINT', () => {
        console.log('\n⏹️  서버를 종료합니다...');
        server.close(() => {
            console.log('✅ 서버가 정상적으로 종료되었습니다.');
            process.exit(0);
        });
    });

    process.on('SIGTERM', () => {
        console.log('\n⏹️  서버를 종료합니다...');
        server.close(() => {
            console.log('✅ 서버가 정상적으로 종료되었습니다.');
            process.exit(0);
        });
    });