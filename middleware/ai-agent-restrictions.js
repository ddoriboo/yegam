/**
 * AI 에이전트 식별 및 차단 시스템
 */

const EndDateTracker = require('../utils/end-date-tracker');
const winston = require('winston');

// AI 에이전트 제한 전용 로거
const aiLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: 'logs/ai-agent-restrictions.log',
            maxsize: 10485760, // 10MB
            maxFiles: 5
        }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

/**
 * AI 에이전트 식별 및 차단 시스템
 */
class AIAgentRestrictions {
    constructor() {
        // AI 에이전트 식별 패턴
        this.aiPatterns = {
            usernames: [
                /^ai[_\-]?agent/i,
                /^auto[_\-]?admin/i,
                /^deadline[_\-]?bot/i,
                /^issue[_\-]?bot/i,
                /^scheduler/i,
                /^system[_\-]?admin/i,
                /^bot[_\-]?user/i,
                /^admin[_\-]?bot/i,
                /^test[_\-]?bot/i,
                /^automated/i
            ],
            userAgents: [
                /bot/i,
                /crawler/i,
                /spider/i,
                /automation/i,
                /script/i,
                /headless/i,
                /phantom/i,
                /selenium/i,
                /puppeteer/i,
                /playwright/i
            ],
            ips: [
                // RFC 5737 테스트 IP 대역
                '192.0.2.0/24',
                '198.51.100.0/24', 
                '203.0.113.0/24',
                // localhost 변형들
                '127.0.0.1',
                '::1',
                '0.0.0.0'
            ]
        };

        // AI 에이전트 차단 기록
        this.blockedAgents = new Map();
    }

    /**
     * 요청이 AI 에이전트에서 온 것인지 감지
     * @param {Object} req - Express 요청 객체
     * @returns {Object} 감지 결과
     */
    detectAIAgent(req) {
        const username = req.user?.username || '';
        const userAgent = req.get('User-Agent') || '';
        const ip = req.ip || req.connection.remoteAddress || '';
        
        const detectionResult = {
            isAIAgent: false,
            confidence: 0,
            reasons: [],
            username,
            userAgent,
            ip
        };

        // 1. 사용자명 패턴 검사
        for (const pattern of this.aiPatterns.usernames) {
            if (pattern.test(username)) {
                detectionResult.isAIAgent = true;
                detectionResult.confidence += 40;
                detectionResult.reasons.push(`Username matches AI pattern: ${pattern}`);
            }
        }

        // 2. User-Agent 패턴 검사
        for (const pattern of this.aiPatterns.userAgents) {
            if (pattern.test(userAgent)) {
                detectionResult.isAIAgent = true;
                detectionResult.confidence += 30;
                detectionResult.reasons.push(`User-Agent matches AI pattern: ${pattern}`);
            }
        }

        // 3. IP 주소 검사
        if (this.isTestIP(ip)) {
            detectionResult.isAIAgent = true;
            detectionResult.confidence += 20;
            detectionResult.reasons.push(`IP address is in test range: ${ip}`);
        }

        // 신뢰도가 50 이상이면 AI 에이전트로 판단
        if (detectionResult.confidence >= 50) {
            detectionResult.isAIAgent = true;
        }

        return detectionResult;
    }

    /**
     * 테스트/개발용 IP인지 확인
     * @param {string} ip - IP 주소
     * @returns {boolean} 테스트 IP 여부
     */
    isTestIP(ip) {
        const localhost = ['127.0.0.1', '::1', '0.0.0.0', 'localhost'];
        return localhost.includes(ip);
    }
}

// 전역 인스턴스 생성
const aiRestrictions = new AIAgentRestrictions();

/**
 * AI 에이전트 차단 미들웨어
 */
const blockAIAgentsAdvanced = (req, res, next) => {
    const detection = aiRestrictions.detectAIAgent(req);
    
    if (detection.isAIAgent && req.method !== 'GET') {
        aiLogger.warn('AI agent request blocked', {
            method: req.method,
            path: req.path,
            detection,
            timestamp: new Date()
        });

        return res.status(403).json({
            error: 'AI_AGENT_BLOCKED',
            message: 'AI 에이전트의 데이터 변경 요청이 차단되었습니다.',
            detection: {
                confidence: detection.confidence,
                reasons: detection.reasons
            }
        });
    }

    // 감지 정보를 req에 추가
    req.aiDetection = detection;
    next();
};

module.exports = {
    AIAgentRestrictions,
    aiRestrictions,
    blockAIAgentsAdvanced
};