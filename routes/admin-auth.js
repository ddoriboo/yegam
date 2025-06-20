const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, get } = require('../database/database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'yegame-production-secret-key-2025-very-secure-random-string';

// 관리자 로그인 (이메일/비밀번호 방식)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: '이메일과 비밀번호를 입력해주세요.'
            });
        }
        
        // 사용자 찾기
        const user = await get('SELECT * FROM users WHERE email = $1', [email]);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: '이메일 또는 비밀번호가 올바르지 않습니다.'
            });
        }
        
        // 비밀번호 확인
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: '이메일 또는 비밀번호가 올바르지 않습니다.'
            });
        }
        
        // 관리자 권한 확인
        const admin = await get('SELECT id FROM admins WHERE user_id = $1', [user.id]);
        if (!admin) {
            return res.status(403).json({
                success: false,
                message: '관리자 권한이 없습니다.'
            });
        }
        
        // JWT 토큰 생성 (관리자 전용)
        const adminToken = jwt.sign(
            { 
                userId: user.id, 
                email: user.email, 
                username: user.username,
                isAdmin: true,
                adminId: admin.id
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            message: '관리자 로그인 성공',
            adminToken,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                isAdmin: true
            }
        });
        
    } catch (error) {
        console.error('관리자 로그인 오류:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.'
        });
    }
});

// 관리자 토큰 검증
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: '관리자 토큰이 필요합니다.'
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // 관리자 권한 재확인
        if (!decoded.isAdmin) {
            return res.status(403).json({
                success: false,
                message: '관리자 권한이 없습니다.'
            });
        }
        
        // DB에서 사용자 및 관리자 상태 재확인
        const user = await get('SELECT * FROM users WHERE id = $1', [decoded.userId]);
        const admin = await get('SELECT id FROM admins WHERE user_id = $1', [decoded.userId]);
        
        if (!user || !admin) {
            return res.status(403).json({
                success: false,
                message: '관리자 권한이 취소되었습니다.'
            });
        }
        
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                isAdmin: true
            }
        });
        
    } catch (error) {
        console.error('관리자 토큰 검증 오류:', error);
        res.status(401).json({
            success: false,
            message: '유효하지 않은 관리자 토큰입니다.'
        });
    }
});

// 관리자 프로필 조회
router.get('/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: '관리자 토큰이 필요합니다.'
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (!decoded.isAdmin) {
            return res.status(403).json({
                success: false,
                message: '관리자 권한이 없습니다.'
            });
        }
        
        // 관리자 상세 정보 조회
        const adminInfo = await query(`
            SELECT 
                u.id, u.username, u.email, u.created_at,
                a.id as admin_id, a.created_at as admin_since
            FROM users u
            JOIN admins a ON u.id = a.user_id
            WHERE u.id = $1
        `, [decoded.userId]);
        
        if (adminInfo.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: '관리자 정보를 찾을 수 없습니다.'
            });
        }
        
        const info = adminInfo.rows[0];
        
        res.json({
            success: true,
            admin: {
                id: info.id,
                username: info.username,
                email: info.email,
                memberSince: info.created_at,
                adminSince: info.admin_since
            }
        });
        
    } catch (error) {
        console.error('관리자 프로필 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.'
        });
    }
});

module.exports = router;