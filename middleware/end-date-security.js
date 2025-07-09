/**
 * end_date 변경 보안 미들웨어
 * 마감시간 무단 변경을 완전히 차단하고 모든 변경 사항을 추적
 */

const { query } = require('../database/postgres');
const { logIssueModification } = require('../utils/issue-logger');

// end_date 변경 제한 설정
const END_DATE_CHANGE_LIMITS = {
    MAX_CHANGES_PER_HOUR: 3,
    MAX_CHANGES_PER_DAY: 10,
    MIN_CHANGE_INTERVAL: 5 * 60 * 1000, // 5분
    SUSPICIOUS_PATTERN_THRESHOLD: 5
};

// 의심스러운 User-Agent 패턴
const SUSPICIOUS_USER_AGENTS = [
    'AdminBot', 'TestBot', 'AutoAdmin', 'IssueBot', 'DeadlineBot',
    'bot', 'Bot', 'BOT', 'script', 'Script', 'SCRIPT',
    'automation', 'Automation', 'AUTOMATION'
];

// 메모리 캐시 (프로덕션에서는 Redis 사용 권장)
const recentChanges = new Map();
const suspiciousActivities = new Map();

/**
 * end_date 변경 시 추가 보안 검증
 */
async function validateEndDateChange(req, res, next) {
    try {
        const { id: issueId } = req.params;
        const { end_date: newEndDate, change_reason } = req.body;
        const userId = req.user?.id;
        const userAgent = req.headers['user-agent'] || '';
        const clientIP = req.ip || req.connection.remoteAddress;

        // 1. 의심스러운 User-Agent 검사
        if (SUSPICIOUS_USER_AGENTS.some(pattern => 
            userAgent.toLowerCase().includes(pattern.toLowerCase()))) {
            
            logSuspiciousActivity(userId, clientIP, userAgent, 'SUSPICIOUS_USER_AGENT');
            return res.status(403).json({
                success: false,
                message: '의심스러운 접근이 감지되었습니다. 보안상 요청이 차단되었습니다.',
                code: 'SUSPICIOUS_USER_AGENT'
            });
        }

        // 2. 현재 이슈 정보 조회
        const currentIssue = await query(
            'SELECT id, title, end_date, updated_at FROM issues WHERE id = $1',
            [issueId]
        );

        if (currentIssue.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '이슈를 찾을 수 없습니다.'
            });
        }

        const issue = currentIssue.rows[0];
        const currentEndDate = new Date(issue.end_date);
        const requestedEndDate = new Date(newEndDate);

        // 3. end_date 변경 여부 확인
        if (currentEndDate.getTime() !== requestedEndDate.getTime()) {
            
            // 4. 변경 사유 필수 확인
            if (!change_reason || change_reason.trim().length < 10) {
                return res.status(400).json({
                    success: false,
                    message: 'end_date 변경 시 변경 사유를 최소 10자 이상 입력해야 합니다.',
                    code: 'CHANGE_REASON_REQUIRED'
                });
            }

            // 5. 변경 빈도 제한 확인
            const changeKey = `${userId}_${issueId}`;
            const now = Date.now();
            const userChanges = recentChanges.get(changeKey) || [];
            
            // 최근 변경 이력 정리 (1시간 이전 기록 삭제)
            const recentUserChanges = userChanges.filter(
                timestamp => now - timestamp < 60 * 60 * 1000
            );

            // 시간당 변경 횟수 제한
            if (recentUserChanges.length >= END_DATE_CHANGE_LIMITS.MAX_CHANGES_PER_HOUR) {
                logSuspiciousActivity(userId, clientIP, userAgent, 'EXCESSIVE_CHANGES');
                return res.status(429).json({
                    success: false,
                    message: '시간당 end_date 변경 횟수를 초과했습니다. 1시간 후 다시 시도해주세요.',
                    code: 'RATE_LIMIT_EXCEEDED'
                });
            }

            // 최소 변경 간격 확인
            const lastChangeTime = recentUserChanges[recentUserChanges.length - 1];
            if (lastChangeTime && now - lastChangeTime < END_DATE_CHANGE_LIMITS.MIN_CHANGE_INTERVAL) {
                return res.status(429).json({
                    success: false,
                    message: `end_date 변경 간격이 너무 짧습니다. ${Math.ceil((END_DATE_CHANGE_LIMITS.MIN_CHANGE_INTERVAL - (now - lastChangeTime)) / 1000)}초 후 다시 시도해주세요.`,
                    code: 'CHANGE_INTERVAL_TOO_SHORT'
                });
            }

            // 6. 변경 패턴 분석
            const timeDiff = Math.abs(requestedEndDate.getTime() - currentEndDate.getTime());
            const hoursDiff = timeDiff / (1000 * 60 * 60);
            
            // 의심스러운 패턴 감지 (18시간 차이와 같은 비정상적인 변경)
            if (hoursDiff > 24 || hoursDiff < 0.5) {
                logSuspiciousActivity(userId, clientIP, userAgent, 'ABNORMAL_TIME_CHANGE', {
                    currentEndDate: currentEndDate.toISOString(),
                    requestedEndDate: requestedEndDate.toISOString(),
                    hoursDiff
                });
                
                // 관리자 승인 필요
                return res.status(403).json({
                    success: false,
                    message: `비정상적인 마감시간 변경이 감지되었습니다 (${hoursDiff.toFixed(1)}시간 차이). 관리자 승인이 필요합니다.`,
                    code: 'ABNORMAL_TIME_CHANGE_DETECTED'
                });
            }

            // 7. 변경 이력 업데이트
            recentUserChanges.push(now);
            recentChanges.set(changeKey, recentUserChanges);

            // 8. 변경 사항 로깅
            await logIssueModification(
                issueId,
                userId,
                'end_date_change',
                {
                    previous_end_date: currentEndDate.toISOString(),
                    new_end_date: requestedEndDate.toISOString(),
                    change_reason,
                    user_agent: userAgent,
                    client_ip: clientIP
                }
            );

            // 9. 요청 객체에 검증 정보 추가
            req.endDateChangeValidation = {
                isEndDateChanged: true,
                previousEndDate: currentEndDate,
                newEndDate: requestedEndDate,
                changeReason: change_reason,
                hoursDiff
            };
        }

        next();
    } catch (error) {
        console.error('end_date 변경 보안 검증 오류:', error);
        res.status(500).json({
            success: false,
            message: '보안 검증 중 오류가 발생했습니다.',
            error: error.message
        });
    }
}

/**
 * 의심스러운 활동 로깅
 */
function logSuspiciousActivity(userId, clientIP, userAgent, activityType, details = {}) {
    const suspiciousKey = `${userId}_${clientIP}`;
    const now = Date.now();
    
    const activities = suspiciousActivities.get(suspiciousKey) || [];
    activities.push({
        timestamp: now,
        activityType,
        userAgent,
        details
    });
    
    suspiciousActivities.set(suspiciousKey, activities);
    
    // 콘솔에 즉시 로깅
    console.warn('🚨 의심스러운 활동 감지:', {
        userId,
        clientIP,
        userAgent,
        activityType,
        details,
        timestamp: new Date(now).toISOString()
    });
    
    // 파일 로깅 (선택사항)
    try {
        const fs = require('fs');
        const path = require('path');
        
        const logDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        const logFile = path.join(logDir, 'suspicious-activities.log');
        const logEntry = `${new Date().toISOString()} - ${activityType} - User: ${userId} - IP: ${clientIP} - UA: ${userAgent} - Details: ${JSON.stringify(details)}\n`;
        
        fs.appendFileSync(logFile, logEntry);
    } catch (logError) {
        console.error('의심스러운 활동 로그 저장 실패:', logError);
    }
}

/**
 * 의심스러운 활동 조회 (관리자용)
 */
function getSuspiciousActivities(hours = 24) {
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    const activities = [];
    
    for (const [key, userActivities] of suspiciousActivities.entries()) {
        const recentActivities = userActivities.filter(
            activity => activity.timestamp > cutoffTime
        );
        
        if (recentActivities.length > 0) {
            activities.push({
                key,
                activities: recentActivities
            });
        }
    }
    
    return activities;
}

/**
 * 캐시 정리 (주기적으로 호출)
 */
function cleanupCache() {
    const now = Date.now();
    const cutoffTime = now - (24 * 60 * 60 * 1000); // 24시간 이전 데이터 삭제
    
    // 최근 변경 이력 정리
    for (const [key, changes] of recentChanges.entries()) {
        const recentChanges = changes.filter(timestamp => timestamp > cutoffTime);
        if (recentChanges.length === 0) {
            recentChanges.delete(key);
        } else {
            recentChanges.set(key, recentChanges);
        }
    }
    
    // 의심스러운 활동 정리
    for (const [key, activities] of suspiciousActivities.entries()) {
        const recentActivities = activities.filter(
            activity => activity.timestamp > cutoffTime
        );
        if (recentActivities.length === 0) {
            suspiciousActivities.delete(key);
        } else {
            suspiciousActivities.set(key, recentActivities);
        }
    }
    
    console.log('🧹 end_date 보안 캐시 정리 완료');
}

// 1시간마다 캐시 정리
setInterval(cleanupCache, 60 * 60 * 1000);

module.exports = {
    validateEndDateChange,
    getSuspiciousActivities,
    cleanupCache
};