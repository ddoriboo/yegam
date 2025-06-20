// Railway 배포된 서버에서 관리자 계정을 생성하는 스크립트
// URL: https://your-app.railway.app/setup-admin

const express = require('express');
const bcrypt = require('bcryptjs');

// 이 함수를 서버에 임시로 추가
async function setupAdminEndpoint(app) {
    app.get('/setup-admin', async (req, res) => {
        try {
            const { query } = require('./database/database');
            
            // 관리자 테이블이 이미 있는지 확인
            try {
                const existingAdmin = await query('SELECT id FROM admins LIMIT 1');
                if (existingAdmin.rows.length > 0) {
                    return res.json({
                        success: false,
                        message: '관리자 계정이 이미 존재합니다.',
                        instruction: 'https://your-app.railway.app/admin-login 에서 로그인하세요.'
                    });
                }
            } catch (e) {
                // 테이블이 없으면 생성
            }

            const defaultPassword = 'TempAdmin2025!';
            const hashedPassword = await bcrypt.hash(defaultPassword, 12);
            
            // 관리자 테이블 생성
            await query(`
                CREATE TABLE IF NOT EXISTS admins (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    full_name VARCHAR(100),
                    role VARCHAR(20) DEFAULT 'admin',
                    is_active BOOLEAN DEFAULT true,
                    last_login TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 관리자 세션 테이블
            await query(`
                CREATE TABLE IF NOT EXISTS admin_sessions (
                    id SERIAL PRIMARY KEY,
                    admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE,
                    token_hash VARCHAR(255) UNIQUE NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    ip_address INET,
                    user_agent TEXT,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 관리자 활동 로그 테이블
            await query(`
                CREATE TABLE IF NOT EXISTS admin_activity_logs (
                    id SERIAL PRIMARY KEY,
                    admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE,
                    action VARCHAR(100) NOT NULL,
                    resource_type VARCHAR(50),
                    resource_id INTEGER,
                    details JSONB,
                    ip_address INET,
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 기본 관리자 계정 생성
            const result = await query(`
                INSERT INTO admins (username, email, password_hash, full_name, role) 
                VALUES ($1, $2, $3, $4, $5) 
                ON CONFLICT (username) DO UPDATE SET 
                    password_hash = EXCLUDED.password_hash,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
            `, ['superadmin', 'admin@yegam.com', hashedPassword, '시스템 관리자', 'super_admin']);
            
            res.json({
                success: true,
                message: '관리자 계정이 성공적으로 생성되었습니다!',
                adminId: result.rows[0].id,
                loginInfo: {
                    url: req.protocol + '://' + req.get('host') + '/admin-login',
                    username: 'superadmin',
                    password: defaultPassword,
                    warning: '⚠️ 로그인 후 즉시 비밀번호를 변경하세요!'
                }
            });
            
        } catch (error) {
            console.error('Setup admin error:', error);
            res.status(500).json({
                success: false,
                message: '관리자 설정 중 오류가 발생했습니다.',
                error: error.message
            });
        }
    });
}

module.exports = { setupAdminEndpoint };