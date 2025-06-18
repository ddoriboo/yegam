const express = require('express');
const path = require('path');

const app = express();
const PORT = 4000; // 완전히 다른 포트 사용

// 정적 파일 제공
app.use(express.static(__dirname));

// 메인 페이지
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 로그인 페이지
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// 이슈 페이지
app.get('/issues', (req, res) => {
    res.sendFile(path.join(__dirname, 'issues.html'));
});

// 마이페이지
app.get('/mypage', (req, res) => {
    res.sendFile(path.join(__dirname, 'mypage.html'));
});

// 테스트 API
app.get('/test', (req, res) => {
    res.json({ message: "서버가 정상 작동합니다!" });
});

app.listen(PORT, '127.0.0.1', () => {
    console.log('='.repeat(50));
    console.log('🎉 서버가 성공적으로 시작되었습니다!');
    console.log('='.repeat(50));
    console.log(`📍 접속 주소: http://localhost:${PORT}`);
    console.log(`📍 또는: http://127.0.0.1:${PORT}`);
    console.log('='.repeat(50));
});