const fs = require('fs');
const path = require('path');

// FIFA 관련 키워드로 파일 검색
function searchFIFAInFiles() {
    const keywords = ['FIFA', '클럽월드컵', 'Club World Cup', '4강'];
    const filesToSearch = [
        '../logs/issue-modifications.log',
        '../server.log',
        '../app.log',
        '../routes/issues.js',
        '../services/scheduler.js',
        '../services/agentManager.js'
    ];
    
    console.log('=== FIFA 클럽월드컵 관련 검색 ===\n');
    
    filesToSearch.forEach(file => {
        const filePath = path.join(__dirname, file);
        
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            
            keywords.forEach(keyword => {
                const matches = lines.filter(line => line.includes(keyword));
                
                if (matches.length > 0) {
                    console.log(`\n파일: ${file}`);
                    console.log(`키워드: "${keyword}"`);
                    console.log(`매치 수: ${matches.length}개`);
                    console.log('---');
                    matches.slice(0, 5).forEach(match => {
                        console.log(match.substring(0, 200));
                    });
                }
            });
        }
    });
    
    // 테스트 로그 파일 검색
    console.log('\n=== 테스트 로그 검색 ===');
    const testLogPattern = /test.*\.log|debug.*\.log|adminbot.*\.log/i;
    const logsDir = path.join(__dirname, '../logs');
    
    if (fs.existsSync(logsDir)) {
        const logFiles = fs.readdirSync(logsDir);
        logFiles.forEach(file => {
            if (testLogPattern.test(file)) {
                console.log(`발견된 테스트 로그: ${file}`);
                const content = fs.readFileSync(path.join(logsDir, file), 'utf-8');
                const lines = content.split('\n').slice(-10); // 마지막 10줄만
                console.log('마지막 활동:');
                lines.forEach(line => console.log(line));
            }
        });
    }
    
    // AdminBot 관련 파일 검색
    console.log('\n=== AdminBot 관련 파일 검색 ===');
    const adminBotFiles = [
        '../test-adminbot.js',
        '../scripts/test-adminbot.js',
        '../utils/adminbot.js',
        '../services/adminbot.js'
    ];
    
    adminBotFiles.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            console.log(`⚠️ AdminBot 파일 발견: ${file}`);
            const stats = fs.statSync(filePath);
            console.log(`   크기: ${stats.size} bytes`);
            console.log(`   수정일: ${stats.mtime}`);
        }
    });
}

searchFIFAInFiles();