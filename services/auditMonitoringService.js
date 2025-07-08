/**
 * Audit Monitoring Service
 * 감사 및 보안 모니터링 서비스
 * 
 * 기능:
 * - 실시간 의심스러운 활동 패턴 감지
 * - 자동 알림 생성
 * - 시스템 헬스 체크
 * - 감사 로그 분석
 */

const { query, get } = require('../database/database');
const NotificationService = require('./notificationService');

class AuditMonitoringService {
    constructor() {
        this.isRunning = false;
        this.monitoringInterval = null;
        this.alertThresholds = {
            rapidDeadlineChanges: 3, // 1시간 내 3회 이상
            bulkModifications: 10,   // 1시간 내 10개 이슈 이상
            suspiciousTimeChanges: 5, // 5분 이내 연속 변경
            unauthorizedAccess: 3    // 실패한 접근 시도
        };
        
        this.lastCheckTime = new Date();
    }

    /**
     * 모니터링 서비스 시작
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️ 감사 모니터링 서비스가 이미 실행 중입니다.');
            return;
        }

        console.log('🚀 감사 모니터링 서비스 시작...');
        this.isRunning = true;

        // 5분마다 모니터링 실행
        this.monitoringInterval = setInterval(() => {
            this.performMonitoring().catch(error => {
                console.error('❌ 감사 모니터링 오류:', error);
            });
        }, 5 * 60 * 1000); // 5분

        // 즉시 첫 번째 모니터링 실행
        this.performMonitoring().catch(error => {
            console.error('❌ 초기 감사 모니터링 오류:', error);
        });

        console.log('✅ 감사 모니터링 서비스가 시작되었습니다.');
    }

    /**
     * 모니터링 서비스 중지
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('🛑 감사 모니터링 서비스 중지...');
        this.isRunning = false;

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        console.log('✅ 감사 모니터링 서비스가 중지되었습니다.');
    }

    /**
     * 모니터링 수행
     */
    async performMonitoring() {
        try {
            console.log('🔍 감사 모니터링 실행 중...');
            const startTime = Date.now();

            const results = await Promise.allSettled([
                this.detectRapidDeadlineChanges(),
                this.detectBulkModifications(),
                this.detectSuspiciousTimePatterns(),
                this.detectUnauthorizedModifications(),
                this.checkSystemHealth(),
                this.analyzeRecentActivity()
            ]);

            let alertCount = 0;
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    alertCount += result.value || 0;
                } else {
                    console.error(`모니터링 작업 ${index + 1} 실패:`, result.reason);
                }
            });

            const duration = Date.now() - startTime;
            console.log(`✅ 감사 모니터링 완료 (${duration}ms) - ${alertCount}건의 새로운 알림`);
            
            this.lastCheckTime = new Date();

        } catch (error) {
            console.error('❌ 감사 모니터링 수행 중 오류:', error);
        }
    }

    /**
     * 급격한 마감시간 변경 패턴 감지
     */
    async detectRapidDeadlineChanges() {
        try {
            const result = await query(`
                SELECT 
                    issue_id,
                    COUNT(*) as change_count,
                    array_agg(DISTINCT COALESCE(username, admin_username)) as actors
                FROM issue_audit_summary
                WHERE field_name = 'end_date' 
                    AND created_at >= NOW() - INTERVAL '1 hour'
                GROUP BY issue_id
                HAVING COUNT(*) >= $1
            `, [this.alertThresholds.rapidDeadlineChanges]);

            let alertCount = 0;
            for (const row of result.rows) {
                const existingAlert = await get(`
                    SELECT id FROM suspicious_activity_alerts
                    WHERE alert_type = 'RAPID_DEADLINE_CHANGES'
                        AND related_issue_ids @> ARRAY[$1]
                        AND status = 'open'
                        AND created_at >= NOW() - INTERVAL '1 hour'
                `, [row.issue_id]);

                if (!existingAlert) {
                    await this.createAlert({
                        alert_type: 'RAPID_DEADLINE_CHANGES',
                        severity: row.change_count >= 5 ? 'critical' : 'high',
                        description: `이슈 ${row.issue_id}의 마감시간이 1시간 내 ${row.change_count}회 변경됨`,
                        related_issue_ids: [row.issue_id],
                        detection_data: {
                            issue_id: row.issue_id,
                            change_count: row.change_count,
                            actors: row.actors,
                            time_window: '1 hour',
                            threshold: this.alertThresholds.rapidDeadlineChanges
                        }
                    });
                    alertCount++;
                }
            }

            return alertCount;
        } catch (error) {
            console.error('급격한 마감시간 변경 감지 오류:', error);
            return 0;
        }
    }

    /**
     * 대량 수정 패턴 감지
     */
    async detectBulkModifications() {
        try {
            const result = await query(`
                SELECT 
                    COALESCE(admin_id, user_id) as actor_id,
                    CASE WHEN admin_id IS NOT NULL THEN 'admin' ELSE 'user' END as actor_type,
                    COALESCE(admin_username, username) as actor_name,
                    COUNT(DISTINCT issue_id) as modified_issues,
                    COUNT(*) as total_changes
                FROM issue_audit_summary
                WHERE action IN ('UPDATE', 'FIELD_UPDATE', 'ADMIN_UPDATE_ISSUE')
                    AND created_at >= NOW() - INTERVAL '1 hour'
                GROUP BY actor_id, actor_type, actor_name
                HAVING COUNT(DISTINCT issue_id) >= $1
            `, [this.alertThresholds.bulkModifications]);

            let alertCount = 0;
            for (const row of result.rows) {
                const existingAlert = await get(`
                    SELECT id FROM suspicious_activity_alerts
                    WHERE alert_type = 'BULK_MODIFICATIONS'
                        AND ((related_admin_id = $1 AND $2 = 'admin') OR (related_user_id = $1 AND $2 = 'user'))
                        AND status = 'open'
                        AND created_at >= NOW() - INTERVAL '1 hour'
                `, [row.actor_id, row.actor_type]);

                if (!existingAlert) {
                    await this.createAlert({
                        alert_type: 'BULK_MODIFICATIONS',
                        severity: row.modified_issues >= 20 ? 'critical' : 'high',
                        description: `${row.actor_name} (${row.actor_type})이 1시간 내 ${row.modified_issues}개 이슈를 대량 수정함`,
                        related_admin_id: row.actor_type === 'admin' ? row.actor_id : null,
                        related_user_id: row.actor_type === 'user' ? row.actor_id : null,
                        detection_data: {
                            actor_id: row.actor_id,
                            actor_type: row.actor_type,
                            actor_name: row.actor_name,
                            modified_issues: row.modified_issues,
                            total_changes: row.total_changes,
                            time_window: '1 hour',
                            threshold: this.alertThresholds.bulkModifications
                        }
                    });
                    alertCount++;
                }
            }

            return alertCount;
        } catch (error) {
            console.error('대량 수정 패턴 감지 오류:', error);
            return 0;
        }
    }

    /**
     * 의심스러운 시간 패턴 감지
     */
    async detectSuspiciousTimePatterns() {
        try {
            // 짧은 시간 내 연속 변경 감지
            const result = await query(`
                WITH time_gaps AS (
                    SELECT 
                        issue_id,
                        created_at,
                        LAG(created_at) OVER (PARTITION BY issue_id ORDER BY created_at) as prev_time,
                        EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY issue_id ORDER BY created_at)))/60 as gap_minutes
                    FROM issue_audit_logs
                    WHERE field_name = 'end_date' 
                        AND created_at >= NOW() - INTERVAL '1 hour'
                )
                SELECT 
                    issue_id,
                    COUNT(*) as rapid_changes
                FROM time_gaps
                WHERE gap_minutes IS NOT NULL AND gap_minutes <= 5
                GROUP BY issue_id
                HAVING COUNT(*) >= $1
            `, [this.alertThresholds.suspiciousTimeChanges]);

            let alertCount = 0;
            for (const row of result.rows) {
                const existingAlert = await get(`
                    SELECT id FROM suspicious_activity_alerts
                    WHERE alert_type = 'SUSPICIOUS_TIME_PATTERN'
                        AND related_issue_ids @> ARRAY[$1]
                        AND status = 'open'
                        AND created_at >= NOW() - INTERVAL '1 hour'
                `, [row.issue_id]);

                if (!existingAlert) {
                    await this.createAlert({
                        alert_type: 'SUSPICIOUS_TIME_PATTERN',
                        severity: 'medium',
                        description: `이슈 ${row.issue_id}에서 5분 이내 연속 변경이 ${row.rapid_changes}회 감지됨`,
                        related_issue_ids: [row.issue_id],
                        detection_data: {
                            issue_id: row.issue_id,
                            rapid_changes: row.rapid_changes,
                            pattern_type: 'rapid_consecutive_changes',
                            threshold: this.alertThresholds.suspiciousTimeChanges
                        }
                    });
                    alertCount++;
                }
            }

            return alertCount;
        } catch (error) {
            console.error('의심스러운 시간 패턴 감지 오류:', error);
            return 0;
        }
    }

    /**
     * 무권한 수정 시도 감지
     */
    async detectUnauthorizedModifications() {
        try {
            const result = await query(`
                SELECT 
                    ip_address,
                    COUNT(*) as failed_attempts,
                    array_agg(DISTINCT action) as attempted_actions
                FROM issue_audit_logs
                WHERE validation_status = 'suspicious'
                    AND created_at >= NOW() - INTERVAL '1 hour'
                    AND ip_address IS NOT NULL
                GROUP BY ip_address
                HAVING COUNT(*) >= $1
            `, [this.alertThresholds.unauthorizedAccess]);

            let alertCount = 0;
            for (const row of result.rows) {
                const existingAlert = await get(`
                    SELECT id FROM suspicious_activity_alerts
                    WHERE alert_type = 'UNAUTHORIZED_ACCESS_ATTEMPTS'
                        AND detection_data->>'ip_address' = $1
                        AND status = 'open'
                        AND created_at >= NOW() - INTERVAL '1 hour'
                `, [row.ip_address]);

                if (!existingAlert) {
                    await this.createAlert({
                        alert_type: 'UNAUTHORIZED_ACCESS_ATTEMPTS',
                        severity: row.failed_attempts >= 10 ? 'critical' : 'high',
                        description: `IP ${row.ip_address}에서 1시간 내 ${row.failed_attempts}회의 의심스러운 접근 시도`,
                        detection_data: {
                            ip_address: row.ip_address,
                            failed_attempts: row.failed_attempts,
                            attempted_actions: row.attempted_actions,
                            time_window: '1 hour',
                            threshold: this.alertThresholds.unauthorizedAccess
                        }
                    });
                    alertCount++;
                }
            }

            return alertCount;
        } catch (error) {
            console.error('무권한 수정 시도 감지 오류:', error);
            return 0;
        }
    }

    /**
     * 시스템 헬스 체크
     */
    async checkSystemHealth() {
        try {
            const checks = await Promise.all([
                // 감사 로그 테이블 상태 확인
                query('SELECT COUNT(*) as count FROM issue_audit_logs WHERE created_at >= NOW() - INTERVAL \'1 day\''),
                
                // 미해결 알림 수 확인
                query('SELECT COUNT(*) as count FROM suspicious_activity_alerts WHERE status = \'open\''),
                
                // 활성 규칙 수 확인
                query('SELECT COUNT(*) as count FROM issue_change_rules WHERE is_active = true'),
                
                // 최근 이슈 활동 확인
                query('SELECT COUNT(*) as count FROM issues WHERE updated_at >= NOW() - INTERVAL \'1 hour\'')
            ]);

            const [auditLogs, openAlerts, activeRules, recentActivity] = checks.map(r => parseInt(r.rows[0].count));

            // 비정상적인 상황 감지
            if (openAlerts > 50) {
                await this.createAlert({
                    alert_type: 'SYSTEM_HEALTH_WARNING',
                    severity: 'medium',
                    description: `미해결 보안 알림이 ${openAlerts}건으로 과도하게 많습니다.`,
                    detection_data: {
                        check_type: 'open_alerts_overflow',
                        open_alerts: openAlerts,
                        threshold: 50
                    }
                });
                return 1;
            }

            if (activeRules === 0) {
                await this.createAlert({
                    alert_type: 'SYSTEM_HEALTH_WARNING',
                    severity: 'high',
                    description: '활성화된 이슈 변경 규칙이 없습니다. 보안 제한이 비활성 상태입니다.',
                    detection_data: {
                        check_type: 'no_active_rules',
                        active_rules: activeRules
                    }
                });
                return 1;
            }

            return 0;
        } catch (error) {
            console.error('시스템 헬스 체크 오류:', error);
            return 0;
        }
    }

    /**
     * 최근 활동 분석
     */
    async analyzeRecentActivity() {
        try {
            const analysis = await query(`
                SELECT 
                    action,
                    COUNT(*) as count,
                    COUNT(DISTINCT issue_id) as unique_issues,
                    COUNT(DISTINCT COALESCE(admin_id, user_id)) as unique_actors
                FROM issue_audit_logs
                WHERE created_at >= NOW() - INTERVAL '1 hour'
                GROUP BY action
                ORDER BY count DESC
            `);

            // 분석 결과를 로그로 출력
            if (analysis.rows.length > 0) {
                console.log('📊 최근 1시간 활동 분석:');
                analysis.rows.forEach(row => {
                    console.log(`   ${row.action}: ${row.count}건 (${row.unique_issues}개 이슈, ${row.unique_actors}명 실행자)`);
                });
            }

            return 0;
        } catch (error) {
            console.error('최근 활동 분석 오류:', error);
            return 0;
        }
    }

    /**
     * 보안 알림 생성
     */
    async createAlert(alertData) {
        try {
            await query(`
                INSERT INTO suspicious_activity_alerts 
                (alert_type, severity, description, related_user_id, related_admin_id, 
                 related_issue_ids, detection_data, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW())
            `, [
                alertData.alert_type,
                alertData.severity,
                alertData.description,
                alertData.related_user_id || null,
                alertData.related_admin_id || null,
                alertData.related_issue_ids || null,
                JSON.stringify(alertData.detection_data)
            ]);

            console.log(`🚨 새로운 보안 알림 생성: ${alertData.alert_type} (${alertData.severity})`);
            console.log(`   설명: ${alertData.description}`);

            // 중요도가 높은 알림은 즉시 관리자에게 알림
            if (alertData.severity === 'critical' || alertData.severity === 'high') {
                await this.notifyAdmins(alertData);
            }

        } catch (error) {
            console.error('보안 알림 생성 오류:', error);
        }
    }

    /**
     * 관리자에게 중요 알림 전송
     */
    async notifyAdmins(alertData) {
        try {
            // 모든 활성 관리자에게 알림 전송
            const admins = await query('SELECT id FROM admins WHERE is_active = true');
            
            for (const admin of admins.rows) {
                await NotificationService.createNotification({
                    userId: null, // 관리자는 별도 테이블
                    type: 'security_alert',
                    title: `🚨 ${alertData.severity.toUpperCase()} 보안 알림`,
                    message: alertData.description,
                    relatedType: 'security_alert',
                    metadata: {
                        alert_type: alertData.alert_type,
                        severity: alertData.severity,
                        detection_data: alertData.detection_data
                    }
                });
            }

            console.log(`📧 ${admins.rows.length}명의 관리자에게 보안 알림 전송 완료`);
        } catch (error) {
            console.error('관리자 알림 전송 오류:', error);
        }
    }

    /**
     * 서비스 상태 조회
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastCheckTime: this.lastCheckTime,
            alertThresholds: this.alertThresholds,
            nextCheckTime: this.isRunning ? 
                new Date(this.lastCheckTime.getTime() + 5 * 60 * 1000) : null
        };
    }

    /**
     * 임계값 업데이트
     */
    updateThresholds(newThresholds) {
        this.alertThresholds = { ...this.alertThresholds, ...newThresholds };
        console.log('📊 감사 모니터링 임계값 업데이트:', this.alertThresholds);
    }
}

module.exports = new AuditMonitoringService();