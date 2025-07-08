/**
 * AdminBot 차단 미들웨어
 * 악성 봇이나 자동화 시스템으로부터 시스템 보호
 */

const { logSuspiciousActivity } = require('../utils/issue-logger');

// 차단할 User-Agent 패턴들
const BLOCKED_USER_AGENTS = [
    /AdminBot/i,
    /TestBot/i,
    /AutoAdmin/i,
    /IssueBot/i,
    /DeadlineBot/i
];

// 차단할 IP 주소 범위들
const BLOCKED_IP_RANGES = [
    // RFC 5737 - 테스트용 IP 범위
    '192.0.2.0/24',
    '198.51.100.0/24', 
    '203.0.113.0/24',
    // 기타 의심스러운 IP들
    '127.0.0.1', // localhost (특정 경우 제외하고 차단)
    '0.0.0.0'
];

// IP가 차단 범위에 포함되는지 확인
function isIPBlocked(clientIP) {
    // localhost는 개발 환경에서만 허용
    if (clientIP === '127.0.0.1' || clientIP === '::1') {
        return process.env.NODE_ENV === 'production';
    }
    
    // 테스트 IP 범위 차단
    const testRanges = ['192.0.2.', '198.51.100.', '203.0.113.'];
    for (const range of testRanges) {
        if (clientIP.startsWith(range)) {
            return true;
        }
    }
    
    return false;
}

// User-Agent가 차단 대상인지 확인
function isUserAgentBlocked(userAgent) {
    if (!userAgent) return false;
    
    return BLOCKED_USER_AGENTS.some(pattern => pattern.test(userAgent));
}

// AdminBot 차단 미들웨어
function adminBotBlocker(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    const userAgent = req.get('User-Agent') || '';
    
    // User-Agent 기반 차단
    if (isUserAgentBlocked(userAgent)) {
        console.log('🚫 AdminBot User-Agent 차단:', {
            ip: clientIP,
            userAgent: userAgent,
            url: req.originalUrl,
            method: req.method
        });
        
        // 의심스러운 활동 로깅
        logSuspiciousActivity('ADMINBOT_BLOCKED', {
            ip: clientIP,
            userAgent: userAgent,
            url: req.originalUrl,
            method: req.method,
            timestamp: new Date().toISOString(),
            reason: 'Blocked User-Agent pattern detected'
        });
        
        return res.status(403).json({
            success: false,
            message: 'Access denied: Automated requests not allowed',
            error: 'ADMINBOT_BLOCKED'
        });
    }
    
    // IP 기반 차단
    if (isIPBlocked(clientIP)) {
        console.log('🚫 의심스러운 IP 차단:', {
            ip: clientIP,
            userAgent: userAgent,
            url: req.originalUrl
        });
        
        // 의심스러운 활동 로깅
        logSuspiciousActivity('SUSPICIOUS_IP_BLOCKED', {
            ip: clientIP,
            userAgent: userAgent,
            url: req.originalUrl,
            method: req.method,
            timestamp: new Date().toISOString(),
            reason: 'Blocked IP range detected'
        });
        
        return res.status(403).json({
            success: false,
            message: 'Access denied: Request from blocked IP range',
            error: 'IP_BLOCKED'
        });
    }
    
    // adminId 3 차단 (테스트 계정)
    if (req.user && req.user.adminId === 3) {
        console.log('🚫 테스트 계정 차단:', {
            adminId: req.user.adminId,
            ip: clientIP,
            userAgent: userAgent
        });
        
        logSuspiciousActivity('TEST_ADMIN_BLOCKED', {
            adminId: req.user.adminId,
            ip: clientIP,
            userAgent: userAgent,
            url: req.originalUrl,
            reason: 'Test admin account blocked'
        });
        
        return res.status(403).json({
            success: false,
            message: 'Access denied: Test account not allowed in production',
            error: 'TEST_ACCOUNT_BLOCKED'
        });
    }
    
    next();
}

// 관리자 API 전용 강화된 차단 미들웨어
function adminApiProtection(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    
    // 관리자 API에 대한 추가 검증
    if (req.originalUrl.includes('/admin')) {
        // 빠른 연속 요청 감지 (DDoS 방지)
        const now = Date.now();
        const requestKey = `${clientIP}_${req.originalUrl}`;
        
        if (!global.requestTracker) {
            global.requestTracker = new Map();
        }
        
        const lastRequest = global.requestTracker.get(requestKey);
        if (lastRequest && (now - lastRequest) < 1000) { // 1초 미만 간격
            logSuspiciousActivity('RAPID_ADMIN_REQUESTS', {
                ip: clientIP,
                userAgent: userAgent,
                url: req.originalUrl,
                timeDiff: now - lastRequest,
                reason: 'Rapid consecutive admin requests'
            });
            
            return res.status(429).json({
                success: false,
                message: 'Too many requests. Please wait.',
                error: 'RATE_LIMITED'
            });
        }
        
        global.requestTracker.set(requestKey, now);
        
        // 오래된 기록 정리 (메모리 누수 방지)
        setTimeout(() => {
            global.requestTracker.delete(requestKey);
        }, 60000); // 1분 후 삭제
    }
    
    next();
}

module.exports = {
    adminBotBlocker,
    adminApiProtection,
    isIPBlocked,
    isUserAgentBlocked
};