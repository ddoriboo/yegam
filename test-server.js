const express = require('express');
const app = express();
const PORT = 8080;

app.get('/', (req, res) => {
    res.send('Hello World! 서버가 정상 작동합니다.');
});

app.listen(PORT, () => {
    console.log(`테스트 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`http://localhost:${PORT} 에서 접속하세요.`);
});