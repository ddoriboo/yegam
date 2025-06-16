const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const betRoutes = require('./routes/bets');
const { initDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// API 라우트
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/bets', betRoutes);

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
    app.listen(PORT, () => {
        console.log(`🚀 예겜 서버가 포트 ${PORT}에서 실행 중입니다.`);
        console.log(`🌐 http://localhost:${PORT} 에서 접속하세요.`);
    });
}).catch(err => {
    console.error('데이터베이스 초기화 실패:', err);
    process.exit(1);
});