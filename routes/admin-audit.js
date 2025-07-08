/**
 * Admin Audit Routes
 * 관리자용 감사 로그 및 보안 모니터링 API
 */

const express = require('express');
const { query, get, run } = require('../database/database');
const { secureAdminMiddleware, requirePermission } = require('../middleware/admin-auth-secure');
const { IssueAuditService } = require('../middleware/issue-audit');

const router = express.Router();

// ===================== 감사 로그 조회 =====================

/**
 * 이슈 감사 로그 목록 조회
 */
router.get('/logs', secureAdminMiddleware, requirePermission('view_audit_logs'), async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            issue_id,
            user_id,
            admin_id,
            action,
            field_name,
            start_date,
            end_date,
            validation_status
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

        if (user_id) {
            whereClause += ` AND user_id = $${paramIndex}`;
            params.push(user_id);
            paramIndex++;
        }

        if (admin_id) {
            whereClause += ` AND admin_id = $${paramIndex}`;
            params.push(admin_id);
            paramIndex++;
        }

        if (action) {
            whereClause += ` AND action = $${paramIndex}`;
            params.push(action);
            paramIndex++;
        }

        if (field_name) {
            whereClause += ` AND field_name = $${paramIndex}`;
            params.push(field_name);
            paramIndex++;
        }

        if (validation_status) {
            whereClause += ` AND validation_status = $${paramIndex}`;
            params.push(validation_status);
            paramIndex++;
        }

        if (start_date) {
            whereClause += ` AND created_at >= $${paramIndex}::timestamptz`;
            params.push(start_date);
            paramIndex++;
        }

        if (end_date) {
            whereClause += ` AND created_at <= $${paramIndex}::timestamptz`;
            params.push(end_date);
            paramIndex++;
        }

        // 총 개수 조회
        const countQuery = `
            SELECT COUNT(*) as total
            FROM issue_audit_summary
            WHERE ${whereClause}
        `;
        const countResult = await query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);

        // 감사 로그 조회
        const logsQuery = `
            SELECT *
            FROM issue_audit_summary
            WHERE ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);
        const logsResult = await query(logsQuery, params);

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
        console.error('[관리자] 감사 로그 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '감사 로그 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 특정 이슈의 감사 로그 조회
 */
router.get('/logs/issue/:id', secureAdminMiddleware, requirePermission('view_audit_logs'), async (req, res) => {
    try {
        const issueId = req.params.id;
        const { limit = 100 } = req.query;

        const logs = await IssueAuditService.getRecentAuditLogs(issueId, limit);

        res.json({
            success: true,
            data: {
                issueId: parseInt(issueId),
                logs
            }
        });

    } catch (error) {
        console.error('[관리자] 이슈별 감사 로그 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '이슈별 감사 로그 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 감사 로그 통계 조회
 */
router.get('/logs/stats', secureAdminMiddleware, requirePermission('view_audit_logs'), async (req, res) => {
    try {
        const { period = '7d' } = req.query;
        
        let intervalClause = '7 days';
        switch (period) {
            case '1d': intervalClause = '1 day'; break;
            case '7d': intervalClause = '7 days'; break;
            case '30d': intervalClause = '30 days'; break;
            case '90d': intervalClause = '90 days'; break;
        }

        const stats = await Promise.all([
            // 전체 로그 수
            query('SELECT COUNT(*) as total FROM issue_audit_logs'),
            
            // 기간별 로그 수
            query(`SELECT COUNT(*) as total FROM issue_audit_logs WHERE created_at >= NOW() - INTERVAL '${intervalClause}'`),
            
            // 액션별 통계
            query(`
                SELECT action, COUNT(*) as count
                FROM issue_audit_logs 
                WHERE created_at >= NOW() - INTERVAL '${intervalClause}'
                GROUP BY action
                ORDER BY count DESC
            `),
            
            // 필드별 변경 통계
            query(`
                SELECT field_name, COUNT(*) as count
                FROM issue_audit_logs 
                WHERE field_name IS NOT NULL 
                    AND created_at >= NOW() - INTERVAL '${intervalClause}'
                GROUP BY field_name
                ORDER BY count DESC
            `),
            
            // 일별 활동 통계
            query(`
                SELECT DATE(created_at) as date, COUNT(*) as count
                FROM issue_audit_logs 
                WHERE created_at >= NOW() - INTERVAL '${intervalClause}'
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `),
            
            // 상위 활동 사용자/관리자
            query(`
                SELECT 
                    COALESCE(username, admin_username, 'Unknown') as actor_name,
                    CASE 
                        WHEN admin_id IS NOT NULL THEN 'admin'
                        WHEN user_id IS NOT NULL THEN 'user'
                        ELSE 'system'
                    END as actor_type,
                    COUNT(*) as activity_count
                FROM issue_audit_summary
                WHERE created_at >= NOW() - INTERVAL '${intervalClause}'
                GROUP BY actor_name, actor_type
                ORDER BY activity_count DESC
                LIMIT 10
            `)
        ]);

        res.json({
            success: true,
            stats: {
                totalLogs: parseInt(stats[0].rows[0].total),
                periodLogs: parseInt(stats[1].rows[0].total),
                actionStats: stats[2].rows,
                fieldStats: stats[3].rows,
                dailyActivity: stats[4].rows,
                topActors: stats[5].rows,
                period
            }
        });

    } catch (error) {
        console.error('[관리자] 감사 로그 통계 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '감사 로그 통계 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// ===================== 의심스러운 활동 알림 =====================

/**
 * 의심스러운 활동 알림 목록 조회
 */
router.get('/alerts', secureAdminMiddleware, requirePermission('view_security_alerts'), async (req, res) => {
    try {
        const {
            status = 'open',
            severity,
            alert_type,
            limit = 50
        } = req.query;

        let whereClause = 'status = $1';
        let params = [status];
        let paramIndex = 2;

        if (severity) {
            whereClause += ` AND severity = $${paramIndex}`;
            params.push(severity);
            paramIndex++;
        }

        if (alert_type) {
            whereClause += ` AND alert_type = $${paramIndex}`;
            params.push(alert_type);
            paramIndex++;
        }

        const alertsQuery = `
            SELECT 
                saa.*,
                u.username as related_username,
                a.username as related_admin_username,
                ra.username as resolved_by_username
            FROM suspicious_activity_alerts saa
            LEFT JOIN users u ON saa.related_user_id = u.id
            LEFT JOIN admins a ON saa.related_admin_id = a.id
            LEFT JOIN admins ra ON saa.resolved_by = ra.id
            WHERE ${whereClause}
            ORDER BY 
                CASE severity 
                    WHEN 'critical' THEN 1 
                    WHEN 'high' THEN 2 
                    WHEN 'medium' THEN 3 
                    WHEN 'low' THEN 4 
                END,
                created_at DESC
            LIMIT $${paramIndex}
        `;
        params.push(limit);

        const result = await query(alertsQuery, params);

        res.json({
            success: true,
            data: {
                alerts: result.rows
            }
        });

    } catch (error) {
        console.error('[관리자] 의심스러운 활동 알림 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '의심스러운 활동 알림 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 의심스러운 활동 알림 해결 처리
 */
router.put('/alerts/:id/resolve', secureAdminMiddleware, requirePermission('resolve_security_alerts'), async (req, res) => {
    try {
        const alertId = req.params.id;
        const { resolution_notes, status = 'resolved' } = req.body;
        const adminId = req.admin.id;

        await IssueAuditService.resolveAlert(alertId, adminId, resolution_notes);

        res.json({
            success: true,
            message: '알림이 성공적으로 해결되었습니다.'
        });

    } catch (error) {
        console.error('[관리자] 의심스러운 활동 알림 해결 오류:', error);
        res.status(500).json({
            success: false,
            message: '알림 해결 처리 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 의심스러운 패턴 수동 감지 실행
 */
router.post('/alerts/detect', secureAdminMiddleware, requirePermission('run_security_scan'), async (req, res) => {
    try {
        const alertCount = await IssueAuditService.detectSuspiciousPatterns();

        res.json({
            success: true,
            message: `패턴 감지가 완료되었습니다. ${alertCount}건의 새로운 알림이 생성되었습니다.`,
            alertCount
        });

    } catch (error) {
        console.error('[관리자] 의심스러운 패턴 감지 오류:', error);
        res.status(500).json({
            success: false,
            message: '패턴 감지 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// ===================== 이슈 변경 제한 규칙 관리 =====================

/**
 * 이슈 변경 규칙 목록 조회
 */
router.get('/rules', secureAdminMiddleware, requirePermission('manage_audit_rules'), async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                icr.*,
                a.username as created_by_username
            FROM issue_change_rules icr
            LEFT JOIN admins a ON icr.created_by = a.id
            ORDER BY icr.created_at DESC
        `);

        res.json({
            success: true,
            data: {
                rules: result.rows
            }
        });

    } catch (error) {
        console.error('[관리자] 이슈 변경 규칙 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '이슈 변경 규칙 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 이슈 변경 규칙 생성
 */
router.post('/rules', secureAdminMiddleware, requirePermission('manage_audit_rules'), async (req, res) => {
    try {
        const {
            rule_name,
            rule_type,
            field_name,
            restriction_data,
            is_active = true
        } = req.body;

        if (!rule_name || !rule_type || !restriction_data) {
            return res.status(400).json({
                success: false,
                message: '규칙 이름, 타입, 제한 데이터는 필수입니다.'
            });
        }

        const result = await query(`
            INSERT INTO issue_change_rules (rule_name, rule_type, field_name, restriction_data, is_active, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [rule_name, rule_type, field_name, JSON.stringify(restriction_data), is_active, req.admin.id]);

        res.json({
            success: true,
            message: '이슈 변경 규칙이 성공적으로 생성되었습니다.',
            rule: result.rows[0]
        });

    } catch (error) {
        console.error('[관리자] 이슈 변경 규칙 생성 오류:', error);
        res.status(500).json({
            success: false,
            message: '이슈 변경 규칙 생성 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 이슈 변경 규칙 수정
 */
router.put('/rules/:id', secureAdminMiddleware, requirePermission('manage_audit_rules'), async (req, res) => {
    try {
        const ruleId = req.params.id;
        const {
            rule_name,
            rule_type,
            field_name,
            restriction_data,
            is_active
        } = req.body;

        const result = await query(`
            UPDATE issue_change_rules 
            SET rule_name = $1, rule_type = $2, field_name = $3, 
                restriction_data = $4, is_active = $5, updated_at = NOW()
            WHERE id = $6
            RETURNING *
        `, [rule_name, rule_type, field_name, JSON.stringify(restriction_data), is_active, ruleId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '규칙을 찾을 수 없습니다.'
            });
        }

        res.json({
            success: true,
            message: '이슈 변경 규칙이 성공적으로 수정되었습니다.',
            rule: result.rows[0]
        });

    } catch (error) {
        console.error('[관리자] 이슈 변경 규칙 수정 오류:', error);
        res.status(500).json({
            success: false,
            message: '이슈 변경 규칙 수정 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 이슈 변경 규칙 삭제
 */
router.delete('/rules/:id', secureAdminMiddleware, requirePermission('manage_audit_rules'), async (req, res) => {
    try {
        const ruleId = req.params.id;

        const result = await run('DELETE FROM issue_change_rules WHERE id = $1', [ruleId]);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: '규칙을 찾을 수 없습니다.'
            });
        }

        res.json({
            success: true,
            message: '이슈 변경 규칙이 성공적으로 삭제되었습니다.'
        });

    } catch (error) {
        console.error('[관리자] 이슈 변경 규칙 삭제 오류:', error);
        res.status(500).json({
            success: false,
            message: '이슈 변경 규칙 삭제 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// ===================== 시스템 유지보수 =====================

/**
 * 오래된 감사 로그 정리
 */
router.post('/maintenance/cleanup-logs', secureAdminMiddleware, requirePermission('system_maintenance'), async (req, res) => {
    try {
        const result = await query('SELECT cleanup_old_audit_logs() as deleted_count');
        const deletedCount = result.rows[0]?.deleted_count || 0;

        res.json({
            success: true,
            message: `오래된 감사 로그 ${deletedCount}건이 정리되었습니다.`,
            deletedCount
        });

    } catch (error) {
        console.error('[관리자] 감사 로그 정리 오류:', error);
        res.status(500).json({
            success: false,
            message: '감사 로그 정리 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 감사 시스템 상태 조회
 */
router.get('/status', secureAdminMiddleware, requirePermission('view_system_status'), async (req, res) => {
    try {
        const stats = await Promise.all([
            query('SELECT COUNT(*) as total FROM issue_audit_logs'),
            query('SELECT COUNT(*) as total FROM suspicious_activity_alerts WHERE status = \'open\''),
            query('SELECT COUNT(*) as total FROM issue_change_rules WHERE is_active = true'),
            query('SELECT COUNT(*) as total FROM issue_audit_logs WHERE created_at >= CURRENT_DATE'),
            query(`
                SELECT 
                    action,
                    COUNT(*) as count
                FROM issue_audit_logs 
                WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY action
                ORDER BY count DESC
                LIMIT 5
            `)
        ]);

        res.json({
            success: true,
            status: {
                totalAuditLogs: parseInt(stats[0].rows[0].total),
                openAlerts: parseInt(stats[1].rows[0].total),
                activeRules: parseInt(stats[2].rows[0].total),
                todayLogs: parseInt(stats[3].rows[0].total),
                recentActions: stats[4].rows,
                lastUpdated: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('[관리자] 감사 시스템 상태 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '감사 시스템 상태 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

module.exports = router;