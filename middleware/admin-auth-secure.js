const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { get } = require('../database/database');
const { ADMIN_JWT_SECRET, logAdminActivity } = require('../routes/admin-auth-secure');

// 보안 관리자 인증 미들웨어 (tempAdminMiddleware 대체)
const secureAdminMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: '관리자 인증 토큰이 필요합니다. /admin/login에서 로그인하세요.' 
            });
        }
        
        // JWT 토큰 검증
        let decoded;
        try {
            decoded = jwt.verify(token, ADMIN_JWT_SECRET, {
                issuer: 'yegam-admin',
                audience: 'yegam-admin-panel'
            });
        } catch (jwtError) {
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    success: false, 
                    message: '관리자 토큰이 만료되었습니다. 다시 로그인하세요.' 
                });
            }
            return res.status(401).json({ 
                success: false, 
                message: '유효하지 않은 관리자 토큰입니다.' 
            });
        }
        
        // 관리자 타입 확인
        if (decoded.type !== 'admin' || !decoded.isAdmin) {
            return res.status(403).json({ 
                success: false, 
                message: '관리자 권한이 없습니다.' 
            });
        }
        
        // 데이터베이스에서 세션 및 관리자 상태 재확인
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const session = await get(`
            SELECT s.*, a.username, a.email, a.full_name, a.role, a.is_active
            FROM admin_sessions s
            JOIN admins a ON s.admin_id = a.id
            WHERE s.token_hash = $1 
                AND s.is_active = true 
                AND s.expires_at > CURRENT_TIMESTAMP
                AND a.is_active = true
        `, [tokenHash]);
        
        if (!session) {
            return res.status(401).json({ 
                success: false, 
                message: '세션이 만료되었거나 비활성화되었습니다. 다시 로그인하세요.' 
            });
        }
        
        // 관리자 정보를 request 객체에 추가
        req.admin = {
            id: session.admin_id,
            username: session.username,
            email: session.email,
            fullName: session.full_name,
            role: session.role,
            isAdmin: true,
            sessionId: session.id
        };
        
        // 활동 로그 기록 (중요한 액션에 대해서만)
        const shouldLog = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
        if (shouldLog) {
            // 비동기로 로그 기록 (응답 지연 방지)
            setImmediate(() => {
                logAdminActivity(
                    session.admin_id, 
                    `${req.method}_${req.route?.path || req.path}`,
                    null,
                    null,
                    {
                        method: req.method,
                        path: req.path,
                        body: req.body,
                        query: req.query
                    },
                    req
                ).catch(err => console.error('Activity logging failed:', err));
            });
        }
        
        next();
        
    } catch (error) {
        console.error('Secure admin middleware error:', error);
        return res.status(500).json({ 
            success: false, 
            message: '관리자 인증 처리 중 오류가 발생했습니다.' 
        });
    }
};

// 역할 기반 접근 제어 미들웨어
const requireAdminRole = (requiredRole = 'admin') => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({ 
                success: false, 
                message: '관리자 인증이 필요합니다.' 
            });
        }
        
        // 역할 계층: super_admin > admin
        const roleHierarchy = {
            'admin': 1,
            'super_admin': 2
        };
        
        const userRole = roleHierarchy[req.admin.role] || 0;
        const requiredRoleLevel = roleHierarchy[requiredRole] || 1;
        
        if (userRole < requiredRoleLevel) {
            return res.status(403).json({ 
                success: false, 
                message: `${requiredRole} 권한이 필요합니다.` 
            });
        }
        
        next();
    };
};

// 액션별 권한 확인 미들웨어
const requirePermission = (action) => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({ 
                success: false, 
                message: '관리자 인증이 필요합니다.' 
            });
        }
        
        // 슈퍼 관리자는 모든 권한 허용
        if (req.admin.role === 'super_admin') {
            return next();
        }
        
        // 일반 관리자 권한 제한 (필요시 확장)
        const adminPermissions = [
            'view_issues', 'create_issue', 'update_issue', 'delete_issue',
            'view_users', 'view_bets', 'upload_files', 'manage_comments',
            'run_scheduler', 'view_logs'
        ];
        
        if (!adminPermissions.includes(action)) {
            return res.status(403).json({ 
                success: false, 
                message: `'${action}' 권한이 없습니다.` 
            });
        }
        
        next();
    };
};

module.exports = {
    secureAdminMiddleware,
    requireAdminRole,
    requirePermission
};