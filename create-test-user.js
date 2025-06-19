const bcrypt = require('bcryptjs');
const { getDB, initDatabase } = require('./database/database');
const gamService = require('./services/gamService');

async function createTestUser() {
    try {
        // 데이터베이스 초기화
        await initDatabase();
        await gamService.init();
        
        const db = getDB();
        
        // 테스트 사용자 생성
        const testEmail = 'test@example.com';
        const testUsername = 'TestUser';
        const testPassword = 'password123';
        
        // 기존 사용자가 있는지 확인
        db.get('SELECT * FROM users WHERE email = ?', [testEmail], async (err, existingUser) => {
            if (existingUser) {
                console.log('✅ 테스트 사용자가 이미 존재합니다:');
                console.log(`📧 이메일: ${testEmail}`);
                console.log(`🔑 비밀번호: ${testPassword}`);
                process.exit(0);
                return;
            }
            
            // 비밀번호 해시
            const hashedPassword = await bcrypt.hash(testPassword, 10);
            
            // 사용자 생성
            db.run(
                'INSERT INTO users (username, email, password_hash, verified) VALUES (?, ?, ?, ?)',
                [testUsername, testEmail, hashedPassword, true],
                async function(err) {
                    if (err) {
                        console.error('❌ 테스트 사용자 생성 실패:', err);
                        process.exit(1);
                        return;
                    }
                    
                    const userId = this.lastID;
                    console.log('✅ 테스트 사용자가 생성되었습니다!');
                    
                    try {
                        // 회원가입 보상 지급
                        await gamService.giveSignupReward(userId);
                        console.log('💰 회원가입 보상 10,000감 지급 완료');
                        
                        console.log('\n='.repeat(50));
                        console.log('🎮 테스트 사용자 정보');
                        console.log('='.repeat(50));
                        console.log(`📧 이메일: ${testEmail}`);
                        console.log(`👤 사용자명: ${testUsername}`);
                        console.log(`🔑 비밀번호: ${testPassword}`);
                        console.log(`💎 초기 감 잔액: 10,000`);
                        console.log('='.repeat(50));
                        console.log('이제 웹사이트에서 로그인하실 수 있습니다!');
                        
                    } catch (gamError) {
                        console.error('⚠️ 회원가입 보상 지급 실패:', gamError);
                        console.log('\n테스트 사용자는 생성되었지만 보상 지급에 실패했습니다.');
                        console.log(`📧 이메일: ${testEmail}`);
                        console.log(`🔑 비밀번호: ${testPassword}`);
                    }
                    
                    process.exit(0);
                }
            );
        });
        
    } catch (error) {
        console.error('❌ 테스트 사용자 생성 중 오류:', error);
        process.exit(1);
    }
}

createTestUser();