const fs = require('fs');
const path = require('path');

// 이슈 변경 로그 파일 경로
const logFilePath = path.join(__dirname, '../logs/issue-changes.log');

// 로그 디렉토리가 없으면 생성
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

/**
 * 이슈 변경 사항을 로그 파일에 기록
 * @param {Object} logData - 로그 데이터
 */
function logIssueChange(logData) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        ...logData,
        source: 'issue-logger'
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
        fs.appendFileSync(logFilePath, logLine);
        console.log('📝 이슈 변경 로그 기록:', logData.action, logData.issue_id);
    } catch (error) {
        console.error('❌ 이슈 로그 기록 실패:', error);
    }
}

/**
 * 마감시간 변경 로그
 * @param {number} issueId - 이슈 ID
 * @param {string} oldDeadline - 이전 마감시간
 * @param {string} newDeadline - 새 마감시간
 * @param {string} userId - 사용자 ID
 * @param {string} userType - 사용자 타입 (admin/user)
 * @param {string} ip - IP 주소
 * @param {string} reason - 변경 사유
 */
function logDeadlineChange(issueId, oldDeadline, newDeadline, userId, userType, ip, reason = '') {
    const timeDiff = new Date(newDeadline) - new Date(oldDeadline);
    const timeDiffHours = timeDiff / (1000 * 60 * 60);
    
    logIssueChange({
        action: 'DEADLINE_CHANGE',
        issue_id: issueId,
        field_name: 'end_date',
        old_value: oldDeadline,
        new_value: newDeadline,
        user_id: userId,
        user_type: userType,
        ip_address: ip,
        reason: reason,
        metadata: {
            time_diff_hours: timeDiffHours,
            time_diff_minutes: timeDiff / (1000 * 60)
        }
    });
    
    // 의심스러운 패턴 감지
    if (Math.abs(timeDiffHours) > 24) {
        logSuspiciousActivity('LARGE_TIME_CHANGE', {
            issue_id: issueId,
            time_diff_hours: timeDiffHours,
            user_id: userId,
            user_type: userType,
            ip: ip
        });
    }
}

/**
 * 이슈 생성 로그
 * @param {number} issueId - 이슈 ID
 * @param {string} title - 이슈 제목
 * @param {string} deadline - 마감시간
 * @param {string} userId - 사용자 ID
 * @param {string} userType - 사용자 타입
 * @param {string} ip - IP 주소
 * @param {string} source - 생성 방식 (manual/ai/approval)
 */
function logIssueCreation(issueId, title, deadline, userId, userType, ip, source = 'manual') {
    logIssueChange({
        action: 'ISSUE_CREATED',
        issue_id: issueId,
        field_name: 'new_issue',
        old_value: null,
        new_value: JSON.stringify({ title, deadline }),
        user_id: userId,
        user_type: userType,
        ip_address: ip,
        metadata: {
            creation_source: source,
            title: title,
            deadline: deadline
        }
    });
}

/**
 * 이슈 상태 변경 로그
 * @param {number} issueId - 이슈 ID
 * @param {string} oldStatus - 이전 상태
 * @param {string} newStatus - 새 상태
 * @param {string} userId - 사용자 ID
 * @param {string} userType - 사용자 타입
 * @param {string} ip - IP 주소
 * @param {string} reason - 변경 사유
 */
function logStatusChange(issueId, oldStatus, newStatus, userId, userType, ip, reason = '') {
    logIssueChange({
        action: 'STATUS_CHANGE',
        issue_id: issueId,
        field_name: 'status',
        old_value: oldStatus,
        new_value: newStatus,
        user_id: userId,
        user_type: userType,
        ip_address: ip,
        reason: reason
    });
}

/**
 * 의심스러운 활동 로그
 * @param {string} alertType - 알림 타입
 * @param {Object} data - 상세 데이터
 */
function logSuspiciousActivity(alertType, data) {
    logIssueChange({
        action: 'SUSPICIOUS_ACTIVITY',
        alert_type: alertType,
        severity: 'high',
        metadata: data,
        requires_attention: true
    });
    
    console.log('🚨 의심스러운 활동 감지:', alertType, data);
}

/**
 * 최근 로그 읽기
 * @param {number} limit - 읽을 로그 수
 * @returns {Array} 로그 배열
 */
function getRecentLogs(limit = 100) {
    try {
        if (!fs.existsSync(logFilePath)) {
            return [];
        }
        
        const logs = fs.readFileSync(logFilePath, 'utf-8')
            .split('\n')
            .filter(line => line.trim())
            .slice(-limit)
            .map(line => JSON.parse(line));
        
        return logs.reverse(); // 최신 순으로 정렬
    } catch (error) {
        console.error('❌ 로그 읽기 실패:', error);
        return [];
    }
}

/**
 * 특정 이슈의 변경 히스토리 조회
 * @param {number} issueId - 이슈 ID
 * @returns {Array} 변경 히스토리
 */
function getIssueHistory(issueId) {
    const logs = getRecentLogs(1000); // 최근 1000개 로그에서 검색
    return logs.filter(log => log.issue_id === issueId);
}

/**
 * 빠른 마감시간 변경 패턴 감지
 * @param {number} issueId - 이슈 ID
 * @param {number} hoursWindow - 시간 윈도우 (기본 1시간)
 * @returns {number} 변경 횟수
 */
function detectRapidDeadlineChanges(issueId, hoursWindow = 1) {
    const logs = getRecentLogs(1000);
    const cutoffTime = new Date(Date.now() - hoursWindow * 60 * 60 * 1000);
    
    const recentChanges = logs.filter(log => 
        log.issue_id === issueId &&
        log.action === 'DEADLINE_CHANGE' &&
        new Date(log.timestamp) > cutoffTime
    );
    
    if (recentChanges.length >= 3) {
        logSuspiciousActivity('RAPID_DEADLINE_CHANGES', {
            issue_id: issueId,
            change_count: recentChanges.length,
            time_window_hours: hoursWindow,
            changes: recentChanges.map(log => ({
                timestamp: log.timestamp,
                old_value: log.old_value,
                new_value: log.new_value,
                user_id: log.user_id
            }))
        });
    }
    
    return recentChanges.length;
}

/**
 * 로그 파일 정리 (오래된 로그 삭제)
 * @param {number} maxLines - 최대 보관 라인 수
 */
function cleanupLogs(maxLines = 10000) {
    try {
        if (!fs.existsSync(logFilePath)) return;
        
        const logs = fs.readFileSync(logFilePath, 'utf-8')
            .split('\n')
            .filter(line => line.trim());
        
        if (logs.length > maxLines) {
            const recentLogs = logs.slice(-maxLines);
            fs.writeFileSync(logFilePath, recentLogs.join('\n') + '\n');
            console.log(`📋 로그 정리 완료: ${logs.length} → ${recentLogs.length} 라인`);
        }
    } catch (error) {
        console.error('❌ 로그 정리 실패:', error);
    }
}

// 주기적으로 로그 정리 (24시간마다)
setInterval(cleanupLogs, 24 * 60 * 60 * 1000);

module.exports = {
    logIssueChange,
    logDeadlineChange,
    logIssueCreation,
    logStatusChange,
    logSuspiciousActivity,
    getRecentLogs,
    getIssueHistory,
    detectRapidDeadlineChanges,
    cleanupLogs
};