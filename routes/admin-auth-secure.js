const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, get, run } = require('../database/database');

const router = express.Router();

// 관리자 전용 JWT 시크릿 (일반 사용자와 분리)
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'yegam-admin-super-secure-secret-2025-fixed-key-for-development';

// 관리자 활동 로그 기록 함수
async function logAdminActivity(adminId, action, resourceType = null, resourceId = null, details = null, req = null) {
    try {
        const ipAddress = req?.ip || req?.connection?.remoteAddress || null;
        const userAgent = req?.get('User-Agent') || null;
        
        await query(`
            INSERT INTO admin_activity_logs (admin_id, action, resource_type, resource_id, details, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [adminId, action, resourceType, resourceId, JSON.stringify(details), ipAddress, userAgent]);
    } catch (error) {
        console.error('Failed to log admin activity:', error);
    }
}

// 관리자 로그인
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: '사용자명과 비밀번호를 입력해주세요.' 
            });
        }
        
        // 관리자 계정 확인
        const admin = await get(`
            SELECT id, username, email, password_hash, full_name, role, is_active, last_login
            FROM admins 
            WHERE (username = $1 OR email = $1) AND is_active = true
        `, [username]);
        
        if (!admin) {
            return res.status(401).json({ 
                success: false, 
                message: '관리자 계정을 찾을 수 없습니다.' 
            });
        }
        
        // 비밀번호 확인
        const validPassword = await bcrypt.compare(password, admin.password_hash);
        if (!validPassword) {
            await logAdminActivity(admin.id, 'LOGIN_FAILED', null, null, { reason: 'invalid_password' }, req);
            return res.status(401).json({ 
                success: false, 
                message: '비밀번호가 올바르지 않습니다.' 
            });
        }
        
        // JWT 토큰 생성 (관리자 전용)
        const tokenPayload = {
            adminId: admin.id,
            username: admin.username,
            email: admin.email,
            role: admin.role,
            isAdmin: true,
            type: 'admin'
        };
        
        const token = jwt.sign(tokenPayload, ADMIN_JWT_SECRET, { 
            expiresIn: '8h',  // 관리자 토큰은 8시간으로 제한
            issuer: 'yegam-admin',
            audience: 'yegam-admin-panel'
        });
        
        // 토큰 해시 생성 및 세션 저장
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8시간
        
        try {
            await query(`
                INSERT INTO admin_sessions (admin_id, token_hash, expires_at, ip_address, user_agent)
                VALUES ($1, $2, $3, $4, $5)
            `, [admin.id, tokenHash, expiresAt, req.ip, req.get('User-Agent')]);
            console.log('✅ 관리자 세션 저장 성공:', { adminId: admin.id, tokenHash: tokenHash.substring(0, 10) + '...' });
        } catch (sessionError) {
            console.error('❌ 관리자 세션 저장 실패:', sessionError);
            // 세션 저장 실패해도 토큰은 발급 (일시적 문제일 수 있음)
        }
        
        // 마지막 로그인 시간 업데이트
        await query(`
            UPDATE admins SET last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $1
        `, [admin.id]);
        
        // 로그인 성공 로그
        await logAdminActivity(admin.id, 'LOGIN_SUCCESS', null, null, null, req);
        
        res.json({
            success: true,
            token,
            admin: {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                fullName: admin.full_name,
                role: admin.role,
                lastLogin: admin.last_login
            },
            message: '관리자 로그인 성공'
        });
        
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ 
            success: false, 
            message: '로그인 처리 중 오류가 발생했습니다.' 
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
                message: '관리자 인증 토큰이 필요합니다.' 
            });
        }
        
        // JWT 토큰 검증
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET, {
            issuer: 'yegam-admin',
            audience: 'yegam-admin-panel'
        });
        
        if (decoded.type !== 'admin' || !decoded.isAdmin) {
            return res.status(403).json({ 
                success: false, 
                message: '관리자 권한이 없습니다.' 
            });
        }
        
        // 세션 유효성 확인
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        console.log('🔍 토큰 검증 시도:', { tokenHash: tokenHash.substring(0, 10) + '...', adminId: decoded.adminId });
        
        let session;
        try {
            session = await get(`
                SELECT s.*, a.username, a.email, a.full_name, a.role, a.is_active
                FROM admin_sessions s
                JOIN admins a ON s.admin_id = a.id
                WHERE s.token_hash = $1 AND s.is_active = true AND s.expires_at > CURRENT_TIMESTAMP
            `, [tokenHash]);
            
            console.log('🔍 세션 조회 결과:', session ? 'found' : 'not found');
            
            if (!session || !session.is_active) {
                console.warn('❌ 세션 없음 또는 비활성:', { hasSession: !!session, isActive: session?.is_active });
                return res.status(401).json({ 
                    success: false, 
                    message: '유효하지 않거나 만료된 관리자 토큰입니다.' 
                });
            }
        } catch (sessionError) {
            console.error('❌ 세션 조회 중 오류:', sessionError);
            return res.status(500).json({ 
                success: false, 
                message: '세션 조회 중 오류가 발생했습니다.' 
            });
        }
        
        res.json({
            success: true,
            admin: {
                id: session.admin_id,
                username: session.username,
                email: session.email,
                fullName: session.full_name,
                role: session.role
            }
        });
        
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: '유효하지 않은 관리자 토큰입니다.' 
            });
        }
        
        console.error('Admin token verification error:', error);
        res.status(500).json({ 
            success: false, 
            message: '토큰 검증 중 오류가 발생했습니다.' 
        });
    }
});

// 관리자 로그아웃
router.post('/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (token) {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            
            // 세션 비활성화
            await query(`
                UPDATE admin_sessions 
                SET is_active = false, updated_at = CURRENT_TIMESTAMP 
                WHERE token_hash = $1
            `, [tokenHash]);
            
            // 로그아웃 로그 (토큰에서 관리자 ID 추출)
            try {
                const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
                await logAdminActivity(decoded.adminId, 'LOGOUT', null, null, null, req);
            } catch (err) {
                // 토큰이 이미 만료되었을 수 있음
            }
        }
        
        res.json({
            success: true,
            message: '로그아웃 되었습니다.'
        });
        
    } catch (error) {
        console.error('Admin logout error:', error);
        res.status(500).json({ 
            success: false, 
            message: '로그아웃 처리 중 오류가 발생했습니다.' 
        });
    }
});

// 관리자 프로필 조회
router.get('/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: '인증 토큰이 필요합니다.' });
        }
        
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
        const admin = await get(`
            SELECT id, username, email, full_name, role, last_login, created_at
            FROM admins WHERE id = $1 AND is_active = true
        `, [decoded.adminId]);
        
        if (!admin) {
            return res.status(404).json({ success: false, message: '관리자를 찾을 수 없습니다.' });
        }
        
        res.json({
            success: true,
            admin: {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                fullName: admin.full_name,
                role: admin.role,
                lastLogin: admin.last_login,
                createdAt: admin.created_at
            }
        });
        
    } catch (error) {
        console.error('Admin profile error:', error);
        res.status(500).json({ success: false, message: '프로필 조회 중 오류가 발생했습니다.' });
    }
});

// 관리자 활동 로그 조회
router.get('/activity-logs', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: '인증 토큰이 필요합니다.' });
        }
        
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
        
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const logs = await query(`
            SELECT l.*, a.username 
            FROM admin_activity_logs l
            JOIN admins a ON l.admin_id = a.id
            ORDER BY l.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        
        res.json({
            success: true,
            logs: logs.rows
        });
        
    } catch (error) {
        console.error('Admin activity logs error:', error);
        res.status(500).json({ success: false, message: '활동 로그 조회 중 오류가 발생했습니다.' });
    }
});

module.exports = { 
    router, 
    logAdminActivity,
    ADMIN_JWT_SECRET
};