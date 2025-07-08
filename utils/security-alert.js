/**
 * 보안 알림 시스템
 * AdminBot 및 기타 보안 위협 실시간 감지 및 알림
 */

const fs = require('fs');
const path = require('path');

const alertLogPath = path.join(__dirname, '../logs/security-alerts.log');

// 보안 알림 생성
function createSecurityAlert(alertType, data) {
    const alert = {
        timestamp: new Date().toISOString(),
        alertType,
        severity: getSeverityLevel(alertType),
        data,
        status: 'active'
    };
    
    // 로그 파일에 기록
    try {
        const logEntry = JSON.stringify(alert) + '\n';
        fs.appendFileSync(alertLogPath, logEntry);
        
        // 콘솔에 경고 출력
        console.log(`🚨 보안 알림 [${alert.severity}]: ${alertType}`, data);
        
        // 심각한 경우 즉시 알림
        if (alert.severity === 'CRITICAL') {
            console.log('🔴 긴급 보안 알림! 즉시 확인 필요!');
        }
    } catch (error) {
        console.error('보안 알림 로깅 실패:', error);
    }
    
    return alert;
}

// 심각도 레벨 결정
function getSeverityLevel(alertType) {
    const severityMap = {
        'ADMINBOT_BLOCKED': 'HIGH',
        'SUSPICIOUS_IP_BLOCKED': 'MEDIUM',
        'TEST_ADMIN_BLOCKED': 'HIGH',
        'RAPID_ADMIN_REQUESTS': 'HIGH',
        'DEADLINE_MANIPULATION': 'CRITICAL',
        'UNAUTHORIZED_ACCESS': 'CRITICAL',
        'SYSTEM_COMPROMISE': 'CRITICAL'
    };
    
    return severityMap[alertType] || 'MEDIUM';
}

// AdminBot 탐지 시 즉시 알림
function alertAdminBotDetected(ip, userAgent, url) {
    return createSecurityAlert('ADMINBOT_BLOCKED', {
        ip,
        userAgent,
        url,
        message: 'AdminBot 접근 시도가 차단되었습니다.',
        action: 'ACCESS_DENIED',
        recommendation: 'IP를 영구 차단하고 접근 패턴을 모니터링하세요.'
    });
}

// 시스템 보안 상태 확인
function getSecurityStatus() {
    try {
        if (!fs.existsSync(alertLogPath)) {
            return {
                status: 'SECURE',
                alertCount: 0,
                recentAlerts: []
            };
        }
        
        const logs = fs.readFileSync(alertLogPath, 'utf-8')
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line))
            .slice(-50); // 최근 50개만
        
        const activeAlerts = logs.filter(alert => 
            alert.status === 'active' && 
            new Date(alert.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000) // 24시간 내
        );
        
        const criticalAlerts = activeAlerts.filter(alert => alert.severity === 'CRITICAL');
        const highAlerts = activeAlerts.filter(alert => alert.severity === 'HIGH');
        
        let status = 'SECURE';
        if (criticalAlerts.length > 0) {
            status = 'CRITICAL';
        } else if (highAlerts.length > 0) {
            status = 'WARNING';
        } else if (activeAlerts.length > 0) {
            status = 'ALERT';
        }
        
        return {
            status,
            alertCount: activeAlerts.length,
            recentAlerts: logs.slice(-10),
            criticalCount: criticalAlerts.length,
            highCount: highAlerts.length
        };
    } catch (error) {
        console.error('보안 상태 확인 실패:', error);
        return {
            status: 'UNKNOWN',
            alertCount: 0,
            recentAlerts: [],
            error: error.message
        };
    }
}

// AdminBot 완전 제거 확인
function verifyAdminBotRemoval() {
    const status = {
        testScriptDisabled: false,
        logsCleared: false,
        middlewareActive: false,
        overallStatus: 'CHECKING'
    };
    
    // 1. 테스트 스크립트 비활성화 확인
    const testScriptPath = path.join(__dirname, '../test-logging.js');
    const disabledScriptPath = path.join(__dirname, '../test-logging.js.disabled');
    
    status.testScriptDisabled = !fs.existsSync(testScriptPath) && fs.existsSync(disabledScriptPath);
    
    // 2. 로그에서 AdminBot 엔트리 제거 확인
    try {
        const logContent = fs.readFileSync(path.join(__dirname, '../logs/issue-modifications.log'), 'utf-8');
        status.logsCleared = !logContent.includes('AdminBot');
    } catch (error) {
        status.logsCleared = true; // 로그 파일이 없으면 정리된 것으로 간주
    }
    
    // 3. 미들웨어 활성화 확인 (파일 존재 여부로 확인)
    const middlewarePath = path.join(__dirname, '../middleware/adminbot-blocker.js');
    status.middlewareActive = fs.existsSync(middlewarePath);
    
    // 전체 상태 결정
    if (status.testScriptDisabled && status.logsCleared && status.middlewareActive) {
        status.overallStatus = 'COMPLETE';
        console.log('✅ AdminBot 완전 제거 및 보안 조치 완료');
    } else {
        status.overallStatus = 'INCOMPLETE';
        console.log('⚠️ AdminBot 제거 작업이 완전하지 않습니다:', status);
    }
    
    return status;
}

module.exports = {
    createSecurityAlert,
    alertAdminBotDetected,
    getSecurityStatus,
    verifyAdminBotRemoval,
    getSeverityLevel
};