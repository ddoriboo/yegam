/**
 * Test script to demonstrate the issue logging system
 */

const { issueLogger } = require('./utils/issue-logging');

// Test data for demonstration
const testIssues = [
    { id: 1, title: "비트코인이 5만달러를 돌파할까?", oldDeadline: "2025-07-10T10:00:00Z", newDeadline: "2025-07-15T15:00:00Z" },
    { id: 2, title: "삼성전자 주가가 상승할까?", oldDeadline: "2025-07-08T14:00:00Z", newDeadline: "2025-07-08T16:00:00Z" },
    { id: 3, title: "올림픽에서 한국이 금메달을 딸까?", oldDeadline: "2025-07-12T20:00:00Z", newDeadline: "2025-07-20T20:00:00Z" }
];

console.log('🧪 이슈 로깅 시스템 테스트 시작...\n');

// Test 1: Create issue logs
console.log('📝 테스트 1: 이슈 생성 로그');
testIssues.forEach((issue, index) => {
    issueLogger.logIssueModification({
        issueId: issue.id,
        action: 'CREATE_ISSUE',
        fieldName: 'end_date',
        newValue: issue.newDeadline,
        adminId: 1,
        ipAddress: '192.168.1.' + (100 + index),
        userAgent: 'Mozilla/5.0 (Test Browser)',
        endpoint: '/api/admin/issues'
    });
});

// Test 2: Deadline change logs
console.log('⏰ 테스트 2: 마감일 변경 로그');
testIssues.forEach((issue, index) => {
    // Simulate delay between changes
    setTimeout(() => {
        issueLogger.logIssueModification({
            issueId: issue.id,
            action: 'UPDATE_ISSUE',
            fieldName: 'end_date',
            oldValue: issue.oldDeadline,
            newValue: issue.newDeadline,
            adminId: 2,
            ipAddress: '10.0.0.' + (50 + index),
            userAgent: 'Mozilla/5.0 (Admin Panel)',
            endpoint: `/api/admin/issues/${issue.id}`
        });
    }, index * 1000);
});

// Test 3: Rapid modifications (should trigger alerts)
console.log('🚨 테스트 3: 빠른 연속 수정 (보안 알림 테스트)');
setTimeout(() => {
    for (let i = 0; i < 12; i++) {
        issueLogger.logIssueModification({
            issueId: 1,
            action: 'UPDATE_ISSUE',
            fieldName: 'title',
            oldValue: `이전 제목 ${i}`,
            newValue: `새로운 제목 ${i + 1}`,
            userId: 999,
            ipAddress: '192.168.1.200',
            userAgent: 'Suspicious/1.0',
            endpoint: '/api/admin/issues/1'
        });
    }
}, 3000);

// Test 4: Multiple deadline changes (should trigger alerts)
console.log('⚠️ 테스트 4: 다중 마감일 변경 (보안 알림 테스트)');
setTimeout(() => {
    for (let i = 0; i < 5; i++) {
        const now = new Date();
        const oldDeadline = new Date(now.getTime() + i * 60 * 60 * 1000).toISOString();
        const newDeadline = new Date(now.getTime() + (i + 1) * 60 * 60 * 1000).toISOString();
        
        issueLogger.logIssueModification({
            issueId: 2,
            action: 'UPDATE_ISSUE',
            fieldName: 'end_date',
            oldValue: oldDeadline,
            newValue: newDeadline,
            adminId: 3,
            ipAddress: '203.0.113.100',
            userAgent: 'AdminBot/2.0',
            endpoint: '/api/admin/issues/2'
        });
    }
}, 5000);

// Test 5: Test deadline validation
console.log('🔍 테스트 5: 마감일 검증');
setTimeout(() => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days future
    const currentDate = new Date().toISOString();
    
    console.log('   ✅ 유효한 변경:', issueLogger.validateDeadlineChange(1, currentDate, futureDate));
    console.log('   ❌ 과거 날짜:', issueLogger.validateDeadlineChange(1, currentDate, pastDate));
    console.log('   ⚠️ 큰 변경:', issueLogger.validateDeadlineChange(1, currentDate, futureDate));
}, 6000);

// Test 6: Show recent logs
setTimeout(() => {
    console.log('\n📋 최근 로그 확인:');
    const recentLogs = issueLogger.getRecentLogs(10);
    recentLogs.forEach((log, index) => {
        console.log(`${index + 1}. [${log.severity}] ${log.action} - 이슈 ${log.issueId} (${new Date(log.timestamp).toLocaleTimeString()})`);
    });
    
    console.log('\n🚨 보안 알림 확인:');
    const alerts = issueLogger.getSecurityAlerts(5);
    alerts.forEach((alert, index) => {
        console.log(`${index + 1}. 사용자 ${alert.userKey}: ${alert.alerts.map(a => a.type).join(', ')}`);
    });
    
    console.log('\n✅ 테스트 완료!');
    console.log('🔗 관리자 페이지에서 로그를 확인하세요: http://localhost:3000/admin-issue-logs');
    
    process.exit(0);
}, 8000);