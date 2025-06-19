const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const betRoutes = require('./routes/bets');
const commentRoutes = require('./routes/comments');
const adminCommentRoutes = require('./routes/admin-comments');
const { initDatabase } = require('./database/database');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use('/api/bets', betRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/admin/comments', adminCommentRoutes);

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

// 데이터베이스 초기화 후 서버 시작
initDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 예겜 서버가 포트 ${PORT}에서 실행 중입니다.`);
        if (process.env.NODE_ENV === 'production') {
            console.log(`🌐 Railway 공개 URL에서 접속하세요.`);
            console.log(`📍 Railway 대시보드에서 공개 URL을 확인하세요.`);
        } else {
            console.log(`🌐 http://localhost:${PORT} 에서 접속하세요.`);
        }
    });
}).catch(err => {
    console.error('데이터베이스 초기화 실패:', err);
    process.exit(1);
});