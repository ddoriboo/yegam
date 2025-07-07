const { getClient } = require('../database/postgres');
const { v4: uuidv4 } = require('uuid');

const visitorTrackingMiddleware = async (req, res, next) => {
    if (req.path.startsWith('/api/') || 
        req.path.startsWith('/health') || 
        req.path.includes('.css') || 
        req.path.includes('.js') || 
        req.path.includes('.png') || 
        req.path.includes('.jpg') || 
        req.path.includes('.ico') ||
        req.path.includes('.svg') ||
        req.path.includes('.woff') ||
        req.path.includes('.ttf') ||
        req.method !== 'GET') {
        return next();
    }
    
    try {
        const user_id = req.user?.id || null;
        const ip_address = req.ip || req.connection.remoteAddress || 'unknown';
        const user_agent = req.get('User-Agent') || 'unknown';
        const page_url = req.originalUrl || req.path;
        
        let session_id = req.session?.visitor_session_id;
        if (!session_id) {
            session_id = uuidv4();
            if (req.session) {
                req.session.visitor_session_id = session_id;
            }
        }
        
        const client = await getClient();
        
        try {
            const query = `
                INSERT INTO visitor_tracking (
                    user_id, ip_address, user_agent, page_url, session_id
                ) VALUES ($1, $2, $3, $4, $5)
            `;
            
            await client.query(query, [
                user_id, ip_address, user_agent, page_url, session_id
            ]);
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('방문자 트래킹 미들웨어 오류:', error);
    }
    
    next();
};

module.exports = visitorTrackingMiddleware;