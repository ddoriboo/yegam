#!/usr/bin/env node
/**
 * 비밀번호 리셋 스크립트
 * Railway에서 실행: railway run node scripts/reset-password.js
 */

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL 환경변수가 설정되지 않았습니다.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function resetPassword(username, newPassword) {
    try {
        // 유저 확인
        const userResult = await pool.query(
            'SELECT id, username, email FROM users WHERE username = $1',
            [username]
        );

        if (userResult.rows.length === 0) {
            console.error(`❌ 유저 "${username}"를 찾을 수 없습니다.`);
            
            // 전체 유저 목록 출력
            const allUsers = await pool.query('SELECT id, username, email FROM users ORDER BY id');
            console.log('\n📋 전체 유저 목록:');
            allUsers.rows.forEach(u => {
                console.log(`  - [${u.id}] ${u.username} (${u.email})`);
            });
            return;
        }

        const user = userResult.rows[0];
        console.log(`✅ 유저 발견: [${user.id}] ${user.username} (${user.email})`);

        // 비밀번호 해시
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // 비밀번호 업데이트
        await pool.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [hashedPassword, user.id]
        );

        console.log(`🔐 비밀번호가 성공적으로 변경되었습니다!`);
        console.log(`   새 비밀번호: ${newPassword}`);

    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await pool.end();
    }
}

// 실행
const username = process.argv[2] || '희둥이';
const newPassword = process.argv[3] || 'Heedungi2026!';

console.log(`\n🔧 비밀번호 리셋: ${username}`);
resetPassword(username, newPassword);
