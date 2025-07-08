const express = require('express');
const { secureAdminMiddleware } = require('../middleware/admin-auth-secure');
const { getRecentLogs, getIssueHistory } = require('../utils/issue-logger');

const router = express.Router();

// 감사 로그 조회 API
router.get('/logs', secureAdminMiddleware, async (req, res) => {
    try {
        const { limit = 100, issueId, action, startDate, endDate } = req.query;
        
        let logs = getRecentLogs(parseInt(limit));
        
        // 필터링 적용
        if (issueId) {
            logs = logs.filter(log => log.issue_id === parseInt(issueId));
        }
        
        if (action) {
            logs = logs.filter(log => log.action === action);
        }
        
        if (startDate) {
            const start = new Date(startDate);
            logs = logs.filter(log => new Date(log.timestamp) >= start);
        }
        
        if (endDate) {
            const end = new Date(endDate);
            logs = logs.filter(log => new Date(log.timestamp) <= end);
        }
        
        res.json({
            success: true,
            logs,
            total: logs.length,
            filters: { limit, issueId, action, startDate, endDate }
        });
        
    } catch (error) {
        console.error('감사 로그 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '감사 로그 조회 중 오류가 발생했습니다.'
        });
    }
});

// 특정 이슈의 변경 히스토리 조회
router.get('/issues/:id/history', secureAdminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const history = getIssueHistory(parseInt(id));
        
        res.json({
            success: true,
            issueId: parseInt(id),
            history,
            total: history.length
        });
        
    } catch (error) {
        console.error('이슈 히스토리 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '이슈 히스토리 조회 중 오류가 발생했습니다.'
        });
    }
});

// 의심스러운 활동 요약
router.get('/suspicious-activities', secureAdminMiddleware, async (req, res) => {
    try {
        const logs = getRecentLogs(1000); // 최근 1000개 로그 확인
        
        const suspiciousActivities = logs.filter(log => 
            log.action === 'SUSPICIOUS_ACTIVITY' || 
            log.requires_attention === true
        );
        
        // 타입별 분류
        const alertTypes = {};
        suspiciousActivities.forEach(activity => {
            const type = activity.alert_type || 'UNKNOWN';
            if (!alertTypes[type]) {
                alertTypes[type] = [];
            }
            alertTypes[type].push(activity);
        });
        
        res.json({
            success: true,
            suspiciousActivities,
            alertTypes,
            total: suspiciousActivities.length
        });
        
    } catch (error) {
        console.error('의심스러운 활동 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '의심스러운 활동 조회 중 오류가 발생했습니다.'
        });
    }
});

// 감사 로그 통계
router.get('/stats', secureAdminMiddleware, async (req, res) => {
    try {
        const logs = getRecentLogs(1000);
        
        // 액션별 통계
        const actionStats = {};
        logs.forEach(log => {
            const action = log.action || 'UNKNOWN';
            actionStats[action] = (actionStats[action] || 0) + 1;
        });
        
        // 사용자별 통계
        const userStats = {};
        logs.forEach(log => {
            const userId = log.user_id || 'unknown';
            const userType = log.user_type || 'unknown';
            const key = `${userId}(${userType})`;
            userStats[key] = (userStats[key] || 0) + 1;
        });
        
        // 시간대별 통계 (최근 24시간)
        const now = new Date();
        const timeStats = {};
        for (let i = 0; i < 24; i++) {
            const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
            const hourKey = hour.toISOString().slice(0, 13) + ':00';
            timeStats[hourKey] = 0;
        }
        
        logs.forEach(log => {
            const logTime = new Date(log.timestamp);
            const hourKey = logTime.toISOString().slice(0, 13) + ':00';
            if (timeStats[hourKey] !== undefined) {
                timeStats[hourKey]++;
            }
        });
        
        res.json({
            success: true,
            stats: {
                totalLogs: logs.length,
                actionStats,
                userStats,
                timeStats
            }
        });
        
    } catch (error) {
        console.error('감사 로그 통계 오류:', error);
        res.status(500).json({
            success: false,
            message: '감사 로그 통계 조회 중 오류가 발생했습니다.'
        });
    }
});

module.exports = router;