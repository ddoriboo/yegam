const EndDateTracker = require('../utils/end-date-tracker');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

// 보안 로거
const securityLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: 'logs/api-security.log',
            maxsize: 10485760, // 10MB
            maxFiles: 5
        })
    ]
});

/**
 * end_date 변경을 위한 특별 Rate Limiting
 */
const endDateChangeRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000, // 5분
    max: 3, // 5분 내 최대 3회
    message: {
        error: 'TOO_MANY_END_DATE_CHANGES',
        message: '마감시간 변경이 너무 빈번합니다. 5분 후 다시 시도해주세요.',
        retryAfter: 300
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // 사용자별 + IP별 제한
        const user = req.user?.username || 'anonymous';
        const ip = req.ip || req.connection.remoteAddress;
        return `end_date_change:${user}:${ip}`;
    },
    onLimitReached: (req, res) => {
        securityLogger.warn('End date change rate limit exceeded', {
            user: req.user?.username,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date()
        });
    }
});

/**
 * end_date 변경 권한 검증 미들웨어
 */
const validateEndDateChangePermission = async (req, res, next) => {
    try {
        const { id: issueId } = req.params;
        const { end_date: newEndDate, change_reason } = req.body;
        const username = req.user?.username;
        const userRole = req.user?.role;

        // 1. 기본 권한 검증
        if (!username) {
            return res.status(401).json({
                error: 'UNAUTHORIZED',
                message: '로그인이 필요합니다.'
            });
        }

        // 2. 관리자가 아닌 경우 추가 제한
        if (userRole !== 'admin') {
            // 일반 사용자는 자신이 만든 이슈만 수정 가능
            const pool = require('../database/connection');
            const issueResult = await pool.query(
                'SELECT created_by FROM issues WHERE id = $1',
                [issueId]
            );

            if (issueResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'ISSUE_NOT_FOUND',
                    message: '해당 이슈를 찾을 수 없습니다.'
                });
            }

            if (issueResult.rows[0].created_by !== username) {
                securityLogger.warn('Unauthorized end date change attempt', {
                    user: username,
                    issueId,
                    issueCreatedBy: issueResult.rows[0].created_by,
                    ip: req.ip
                });

                return res.status(403).json({
                    error: 'FORBIDDEN',
                    message: '자신이 생성한 이슈만 수정할 수 있습니다.'
                });
            }
        }

        // 3. end_date가 변경되는 경우에만 보안 검증
        if (newEndDate) {
            const validation = await EndDateTracker.validateEndDateChange(
                issueId,
                username,
                newEndDate
            );

            if (!validation.allowed) {
                securityLogger.warn('End date change blocked', {
                    user: username,
                    issueId,
                    reason: validation.reason,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });

                return res.status(400).json({
                    error: validation.reason,
                    message: validation.message
                });
            }

            // 4. 변경 사유 필수 입력 (관리자 제외)
            if (userRole !== 'admin' && !change_reason) {
                return res.status(400).json({
                    error: 'CHANGE_REASON_REQUIRED',
                    message: '마감시간 변경 사유를 입력해주세요.'
                });
            }

            // 5. 요청 컨텍스트 정보를 req에 저장 (다음 미들웨어에서 사용)
            req.endDateContext = {
                issueId,
                oldEndDate: validation.currentEndDate,
                newEndDate,
                changeReason: change_reason || 'Admin modification',
                clientIp: req.ip,
                userAgent: req.get('User-Agent'),
                sessionId: req.sessionID,
                requestId: req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            };
        }

        next();
    } catch (error) {
        securityLogger.error('End date permission validation error:', error);
        res.status(500).json({
            error: 'VALIDATION_ERROR',
            message: '권한 검증 중 오류가 발생했습니다.'
        });
    }
};

/**
 * end_date 변경 후 로깅 미들웨어
 */
const logEndDateChange = async (req, res, next) => {
    // 응답을 가로채서 성공 시에만 로깅
    const originalSend = res.send;
    
    res.send = function(body) {
        // 성공적인 응답이고 end_date 변경이 있었던 경우
        if (res.statusCode >= 200 && res.statusCode < 300 && req.endDateContext) {
            const context = req.endDateContext;
            
            // 비동기 로깅 (응답 속도에 영향 없음)
            setImmediate(async () => {
                try {
                    await EndDateTracker.logEndDateChange({
                        issueId: context.issueId,
                        oldEndDate: context.oldEndDate,
                        newEndDate: context.newEndDate,
                        changedBy: req.user?.username,
                        changeType: 'API',
                        changeReason: context.changeReason,
                        additionalData: {
                            ip: context.clientIp,
                            userAgent: context.userAgent,
                            requestId: context.requestId,
                            sessionId: context.sessionId,
                            userRole: req.user?.role
                        }
                    });

                    securityLogger.info('End date change completed via API', {
                        user: req.user?.username,
                        issueId: context.issueId,
                        oldEndDate: context.oldEndDate,
                        newEndDate: context.newEndDate,
                        reason: context.changeReason,
                        requestId: context.requestId
                    });
                } catch (error) {
                    securityLogger.error('Failed to log end date change:', error);
                }
            });
        }

        // 원래 응답 전송
        originalSend.call(this, body);
    };

    next();
};

/**
 * 관리자 전용 end_date 변경 승인 시스템
 */
const requireAdminApprovalForCriticalChanges = async (req, res, next) => {
    try {
        const { end_date: newEndDate } = req.body;
        const userRole = req.user?.role;

        // 관리자는 바로 통과
        if (userRole === 'admin' || !newEndDate) {
            return next();
        }

        // 중요한 변경사항인지 확인
        const endDateObj = new Date(newEndDate);
        const now = new Date();
        const timeDiff = endDateObj - now;
        
        // 1시간 이내로 마감시간을 설정하려는 경우 관리자 승인 필요
        if (timeDiff < 60 * 60 * 1000) {
            securityLogger.warn('Critical end date change requires admin approval', {
                user: req.user?.username,
                issueId: req.params.id,
                newEndDate,
                timeDiffMinutes: timeDiff / (1000 * 60),
                ip: req.ip
            });

            // 관리자 승인 요청 생성 (실제 구현은 프로젝트에 맞게 조정)
            await createAdminApprovalRequest({
                type: 'END_DATE_CHANGE',
                requestedBy: req.user.username,
                issueId: req.params.id,
                newEndDate,
                reason: req.body.change_reason,
                urgency: 'high'
            });

            return res.status(202).json({
                error: 'ADMIN_APPROVAL_REQUIRED',
                message: '1시간 이내 마감시간 설정은 관리자 승인이 필요합니다.',
                approvalRequestId: `pending_${Date.now()}`
            });
        }

        next();
    } catch (error) {
        securityLogger.error('Admin approval check error:', error);
        next(); // 에러가 발생해도 계속 진행
    }
};

/**
 * 관리자 승인 요청 생성 (예시 구현)
 */
async function createAdminApprovalRequest(requestData) {
    try {
        const pool = require('../database/connection');
        
        // 관리자들에게 알림 전송
        await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, priority, data, created_at)
            SELECT 
                u.id,
                '마감시간 변경 승인 요청',
                $1,
                'approval_request',
                'high',
                $2,
                NOW()
            FROM users u
            WHERE u.role = 'admin'
        `, [
            `${requestData.requestedBy}님이 이슈 ${requestData.issueId}의 마감시간을 ${requestData.newEndDate}로 변경 요청했습니다.`,
            JSON.stringify(requestData)
        ]);

        securityLogger.info('Admin approval request created', requestData);
    } catch (error) {
        securityLogger.error('Failed to create admin approval request:', error);
    }
}

/**
 * AI 에이전트 차단 미들웨어
 */
const blockAIAgents = (req, res, next) => {
    const userAgent = req.get('User-Agent') || '';
    const username = req.user?.username || '';
    
    // AI 에이전트 식별 패턴
    const aiAgentPatterns = [
        /bot/i,
        /ai[\-_]?agent/i,
        /auto[\-_]?admin/i,
        /deadline[\-_]?bot/i,
        /issue[\-_]?bot/i,
        /scheduler/i
    ];

    const isAIAgent = aiAgentPatterns.some(pattern => 
        pattern.test(userAgent) || pattern.test(username)
    );

    if (isAIAgent && req.method !== 'GET') {
        securityLogger.warn('AI agent blocked from end date modification', {
            userAgent,
            username,
            ip: req.ip,
            method: req.method,
            path: req.path
        });

        return res.status(403).json({
            error: 'AI_AGENT_BLOCKED',
            message: 'AI 에이전트는 마감시간을 변경할 수 없습니다.'
        });
    }

    next();
};

module.exports = {
    endDateChangeRateLimit,
    validateEndDateChangePermission,
    logEndDateChange,
    requireAdminApprovalForCriticalChanges,
    blockAIAgents
};