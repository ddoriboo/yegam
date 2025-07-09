const express = require('express');
const { getPool } = require('../database/postgres');
const { secureAdminMiddleware, requirePermission } = require('../middleware/admin-auth-secure');
const { getRecentLogs, getIssueHistory } = require('../utils/issue-logger');
const EndDateTracker = require('../utils/end-date-tracker');
// const { recoveryService } = require('../services/end-date-recovery'); // Temporarily disabled
const { aiRestrictions } = require('../middleware/ai-agent-restrictions');

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

/**
 * end_date 변경 로그 조회 (새로운 감사 시스템)
 */
router.get('/end-date-logs', requirePermission('view_audit'), async (req, res) => {
    try {
        const pool = getPool();
        const {
            page = 1,
            limit = 50,
            issue_id,
            changed_by,
            change_type,
            suspicious_only,
            date_from,
            date_to
        } = req.query;

        const offset = (page - 1) * limit;
        let whereClause = '1=1';
        let params = [];
        let paramIndex = 1;

        // 필터 조건 구성
        if (issue_id) {
            whereClause += ` AND issue_id = $${paramIndex}`;
            params.push(issue_id);
            paramIndex++;
        }

        if (changed_by) {
            whereClause += ` AND changed_by ILIKE $${paramIndex}`;
            params.push(`%${changed_by}%`);
            paramIndex++;
        }

        if (change_type) {
            whereClause += ` AND change_type = $${paramIndex}`;
            params.push(change_type);
            paramIndex++;
        }

        if (suspicious_only === 'true') {
            whereClause += ' AND suspicious_pattern = true';
        }

        if (date_from) {
            whereClause += ` AND created_at >= $${paramIndex}`;
            params.push(date_from);
            paramIndex++;
        }

        if (date_to) {
            whereClause += ` AND created_at <= $${paramIndex}`;
            params.push(date_to);
            paramIndex++;
        }

        // 총 개수 조회
        const countQuery = `
            SELECT COUNT(*) as total
            FROM end_date_audit_log
            WHERE ${whereClause}
        `;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);

        // 로그 데이터 조회
        const logsQuery = `
            SELECT 
                eal.*,
                i.title as issue_title,
                EXTRACT(EPOCH FROM (eal.new_end_date - eal.old_end_date)) as time_diff_seconds
            FROM end_date_audit_log eal
            LEFT JOIN issues i ON eal.issue_id = i.id
            WHERE ${whereClause}
            ORDER BY eal.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);

        const logsResult = await pool.query(logsQuery, params);

        res.json({
            success: true,
            data: {
                logs: logsResult.rows,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('End date audit logs query error:', error);
        res.status(500).json({
            success: false,
            message: 'end_date 감사 로그 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 실시간 모니터링 대시보드 데이터
 */
router.get('/dashboard', requirePermission('view_audit'), async (req, res) => {
    try {
        const pool = getPool();
        const dashboardData = await Promise.all([
            // 최근 24시간 활동 요약
            pool.query(`
                SELECT 
                    COUNT(*) as total_changes,
                    COUNT(*) FILTER (WHERE suspicious_pattern = true) as suspicious_changes,
                    COUNT(*) FILTER (WHERE auto_blocked = true) as blocked_changes,
                    COUNT(DISTINCT issue_id) as affected_issues,
                    COUNT(DISTINCT changed_by) as active_users
                FROM end_date_audit_log
                WHERE created_at > NOW() - INTERVAL '24 hours'
            `),
            
            // 최근 10개 변경사항
            pool.query(`
                SELECT 
                    eal.*,
                    i.title as issue_title
                FROM end_date_audit_log eal
                LEFT JOIN issues i ON eal.issue_id = i.id
                ORDER BY eal.created_at DESC
                LIMIT 10
            `),
            
            // 현재 활성 이슈 수
            pool.query(`
                SELECT 
                    COUNT(*) as total_active,
                    COUNT(*) FILTER (WHERE end_date < NOW()) as expired,
                    COUNT(*) FILTER (WHERE end_date > NOW() + INTERVAL '24 hours') as future
                FROM issues
                WHERE status = 'active'
            `),
            
            // AI 에이전트 활동 통계
            pool.query(`
                SELECT 
                    COUNT(*) as ai_attempts,
                    COUNT(*) FILTER (WHERE auto_blocked = true) as ai_blocked
                FROM end_date_audit_log
                WHERE created_at > NOW() - INTERVAL '24 hours'
                AND (changed_by ILIKE '%bot%' OR changed_by ILIKE '%ai%')
            `)
        ]);

        // 복구 서비스 상태
        // const recoveryStatus = recoveryService.getServiceStatus(); // Temporarily disabled
        const recoveryStatus = { message: 'Recovery service temporarily disabled' };
        
        // AI 제한 시스템 상태
        const aiStats = aiRestrictions.getAIAgentStats();

        const dashboard = {
            timestamp: new Date(),
            activity: dashboardData[0].rows[0],
            recentChanges: dashboardData[1].rows,
            issueStatus: dashboardData[2].rows[0],
            aiActivity: dashboardData[3].rows[0],
            recoveryService: recoveryStatus,
            aiRestrictions: aiStats
        };

        res.json({
            success: true,
            dashboard
        });

    } catch (error) {
        console.error('Dashboard data error:', error);
        res.status(500).json({
            success: false,
            message: '대시보드 데이터 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 데이터 일관성 검증 및 복구
 */
router.post('/validate-consistency', requirePermission('manage_audit'), async (req, res) => {
    try {
        const result = await EndDateTracker.validateAndRepairConsistency();
        
        res.json({
            success: true,
            message: '데이터 일관성 검증이 완료되었습니다.',
            result
        });

    } catch (error) {
        console.error('Consistency validation error:', error);
        res.status(500).json({
            success: false,
            message: '일관성 검증 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 복구 서비스 수동 실행
 */
router.post('/trigger-recovery', requirePermission('manage_audit'), async (req, res) => {
    try {
        // const result = await recoveryService.performConsistencyCheck(); // Temporarily disabled
        const result = { message: 'Recovery service temporarily disabled' };
        
        res.json({
            success: true,
            message: '복구 시스템이 수동으로 실행되었습니다.',
            result
        });

    } catch (error) {
        console.error('Manual recovery trigger error:', error);
        res.status(500).json({
            success: false,
            message: '복구 시스템 실행 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 불일치 보고 접수 (클라이언트에서)
 */
router.post('/report-inconsistency', async (req, res) => {
    try {
        const pool = getPool();
        const {
            type,
            issueId,
            clientEndDate,
            serverEndDate,
            timeDifference,
            userAgent,
            timestamp
        } = req.body;

        // 불일치 보고를 감사 로그에 기록
        await pool.query(`
            INSERT INTO end_date_audit_log (
                issue_id,
                old_end_date,
                new_end_date,
                changed_by,
                change_type,
                change_reason,
                user_agent,
                suspicious_pattern,
                ip_address
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            issueId,
            clientEndDate,
            serverEndDate,
            'CLIENT_REPORT',
            'INCONSISTENCY_REPORT',
            `Client reported inconsistency: ${timeDifference}ms difference`,
            userAgent,
            true,
            req.ip
        ]);

        res.json({
            success: true,
            message: '불일치 보고가 접수되었습니다.'
        });

    } catch (error) {
        console.error('Inconsistency report error:', error);
        res.status(500).json({
            success: false,
            message: '불일치 보고 처리 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 실시간 경고 알림 조회
 */
router.get('/alerts', requirePermission('view_audit'), async (req, res) => {
    try {
        const pool = getPool();
        // 현재 활성 경고들 조회
        const alerts = await pool.query(`
            SELECT 
                'suspicious_activity' as type,
                COUNT(*) as count,
                'high' as severity,
                'end_date_changes' as category,
                'End date 의심스러운 변경 패턴이 감지되었습니다' as message
            FROM end_date_audit_log
            WHERE created_at > NOW() - INTERVAL '1 hour'
            AND suspicious_pattern = true
            HAVING COUNT(*) > 0
            
            UNION ALL
            
            SELECT 
                'rapid_changes' as type,
                COUNT(*) as count,
                'medium' as severity,
                'end_date_changes' as category,
                '빠른 연속 마감시간 변경이 감지되었습니다' as message
            FROM end_date_audit_log
            WHERE created_at > NOW() - INTERVAL '5 minutes'
            HAVING COUNT(*) > 10
            
            UNION ALL
            
            SELECT 
                'ai_agent_activity' as type,
                COUNT(*) as count,
                'low' as severity,
                'security' as category,
                'AI 에이전트의 차단된 활동이 감지되었습니다' as message
            FROM end_date_audit_log
            WHERE created_at > NOW() - INTERVAL '1 hour'
            AND auto_blocked = true
            HAVING COUNT(*) > 0
        `);

        res.json({
            success: true,
            alerts: alerts.rows,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('Alerts query error:', error);
        res.status(500).json({
            success: false,
            message: '경고 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

module.exports = router;