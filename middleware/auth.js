const jwt = require('jsonwebtoken');
const { fetchOne } = require('../utils/database');
const { createError, asyncHandler } = require('./errorHandler');

const authMiddleware = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    
    if (!token) {
        throw createError(401, '인증 토큰이 필요합니다.');
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        const user = await fetchOne('SELECT id, username, email, verified FROM users WHERE id = ?', [decoded.id]);
        if (!user) {
            throw createError(401, '유효하지 않은 사용자입니다.');
        }
        
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            throw createError(401, '유효하지 않은 토큰입니다.');
        }
        throw error;
    }
});

const adminMiddleware = asyncHandler(async (req, res, next) => {
    await authMiddleware(req, res, async () => {
        if (!req.user || !req.user.id) {
            throw createError(401, '인증이 필요합니다.');
        }
        
        const admin = await fetchOne('SELECT * FROM admins WHERE user_id = ?', [req.user.id]);
        
        if (!admin) {
            throw createError(403, '관리자 권한이 필요합니다.');
        }
        
        next();
    });
});

const optionalAuthMiddleware = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    
    if (!token) {
        req.user = null;
        return next();
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await fetchOne('SELECT id, username, email, verified FROM users WHERE id = ?', [decoded.id]);
        req.user = user || null;
    } catch (error) {
        req.user = null;
    }
    
    next();
});

module.exports = {
    authMiddleware,
    adminMiddleware,
    optionalAuthMiddleware
};