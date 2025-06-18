require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// 기본 미들웨어만 사용
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 기본 라우트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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

app.listen(PORT, () => {
    console.log(`🚀 간단한 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`🌐 http://localhost:${PORT} 에서 접속하세요.`);
});