require('dotenv').config();
const bcrypt = require('bcryptjs');
const { initDatabase } = require('./database/database');
const { createUser, findUserByEmail, executeQuery } = require('./utils/database');

async function createAdminUser() {
    try {
        await initDatabase();
        
        const email = process.argv[2];
        const username = process.argv[3];
        const password = process.argv[4];
        
        if (!email || !username || !password) {
            console.error('사용법: npm run create-admin <email> <username> <password>');
            process.exit(1);
        }
        
        // 기존 사용자 확인
        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            console.error('이미 존재하는 이메일입니다.');
            process.exit(1);
        }
        
        // 비밀번호 암호화
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 사용자 생성
        const result = await createUser({
            username,
            email,
            hashedPassword,
            verificationToken: null
        });
        
        // 이메일 인증 완료로 설정
        await executeQuery('UPDATE users SET verified = TRUE WHERE id = ?', [result.id]);
        
        // 관리자 권한 부여
        await executeQuery('INSERT INTO admins (user_id) VALUES (?)', [result.id]);
        
        console.log('✅ 관리자 계정이 성공적으로 생성되었습니다!');
        console.log(`이메일: ${email}`);
        console.log(`사용자명: ${username}`);
        console.log(`사용자 ID: ${result.id}`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 관리자 계정 생성 실패:', error.message);
        process.exit(1);
    }
}

createAdminUser();