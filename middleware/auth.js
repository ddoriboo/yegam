const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const authMiddleware = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: '인증 토큰이 필요합니다.' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            message: '유효하지 않은 토큰입니다.' 
        });
    }
};

const adminMiddleware = (req, res, next) => {
    // For now, we'll assume all authenticated users can access admin functions
    // In a real app, you'd check user roles/permissions
    authMiddleware(req, res, next);
};

module.exports = {
    authMiddleware,
    adminMiddleware
};