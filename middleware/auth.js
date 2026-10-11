const jwt = require('jsonwebtoken');

// Railway에서 환경변수가 설정되지 않은 경우를 대비해 기본값 사용
const JWT_SECRET = process.env.JWT_SECRET || 'yegame-production-secret-key-2025-very-secure-random-string';

// 프로덕션에서 기본값을 사용하는 경우 경고 출력
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    console.warn('⚠️ JWT_SECRET 환경변수가 설정되지 않았습니다. 기본값을 사용합니다.');
}

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: '인증 토큰이 필요합니다.' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        try {
            if (await require('./official-panel-guard').isOfficialPanelUser(decoded.id ?? decoded.userId)) {
                return res.status(403).json({success:false,code:'OFFICIAL_AI_ACCOUNT_RESTRICTED',message:'공식 AI 패널 계정은 전용 관리자 베팅 경로만 사용할 수 있습니다.'});
            }
        } catch (_) {
            return res.status(503).json({success:false,code:'ACCOUNT_GUARD_UNAVAILABLE',message:'계정 보호 상태를 확인할 수 없습니다.'});
        }
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            message: '유효하지 않은 토큰입니다.' 
        });
    }
};

const adminMiddleware = async (req, res, next) => {
    try {
        // 먼저 인증 확인
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: '관리자 인증이 필요합니다.' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        
        // 관리자 권한 확인
        const { get } = require('../database/database');
        const admin = await get('SELECT id FROM admins WHERE user_id = $1', [decoded.userId]);
        
        if (!admin) {
            return res.status(403).json({ 
                success: false, 
                message: '관리자 권한이 필요합니다.' 
            });
        }
        
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
    authMiddleware,
    adminMiddleware
};