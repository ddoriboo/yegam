require('dotenv').config();
const bcrypt = require('bcryptjs');
const { initDatabase, query, get } = require('./database/database');

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
        const existingUser = await get('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser) {
            console.error('이미 존재하는 이메일입니다.');
            process.exit(1);
        }
        
        // 비밀번호 암호화
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 사용자 생성
        const userResult = await query(`
            INSERT INTO users (username, email, password_hash, coins, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            RETURNING id
        `, [username, email, hashedPassword, 50000]); // 관리자는 초기 GAM 많이 지급
        
        const userId = userResult.rows[0].id;
        
        // 관리자 권한 부여
        await query('INSERT INTO admins (user_id, created_at) VALUES ($1, NOW())', [userId]);
        
        console.log('✅ 관리자 계정이 성공적으로 생성되었습니다!');
        console.log(`이메일: ${email}`);
        console.log(`사용자명: ${username}`);
        console.log(`사용자 ID: ${userId}`);
        console.log('');
        console.log('🔐 관리자 로그인 정보:');
        console.log(`- URL: /admin.html`);
        console.log(`- 이메일: ${email}`);
        console.log(`- 비밀번호: ${password}`);
        console.log('');
        console.log('⚠️ 보안을 위해 비밀번호를 안전한 곳에 보관하세요!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 관리자 계정 생성 실패:', error.message);
        process.exit(1);
    }
}

createAdminUser();