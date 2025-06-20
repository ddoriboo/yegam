const jwt = require('jsonwebtoken');
const { get } = require('../database/database');

const JWT_SECRET = process.env.JWT_SECRET || 'yegame-production-secret-key-2025-very-secure-random-string';

// 새로운 관리자 미들웨어 (JWT 토큰 기반)
const adminAuthMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: '관리자 인증 토큰이 필요합니다.' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // 관리자 권한 확인
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
        
        req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            isAdmin: true,
            adminId: admin.id
        };
        
        next();
    } catch (error) {
        console.error('관리자 권한 확인 실패:', error);
        return res.status(401).json({ 
            success: false, 
            message: '유효하지 않은 관리자 토큰입니다.' 
        });
    }
};

module.exports = {
    adminAuthMiddleware
};