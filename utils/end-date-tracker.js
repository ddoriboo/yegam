const { getPool } = require('../database/postgres');
const winston = require('winston');

// end_date 변경 추적을 위한 전용 로거 설정
const endDateLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: 'logs/end-date-security.log',
            maxsize: 10485760, // 10MB
            maxFiles: 5
        }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

class EndDateTracker {
    /**
     * 데이터베이스 세션 변수 설정
     * @param {Object} client - 데이터베이스 클라이언트
     * @param {Object} context - 변경 컨텍스트 정보
     */
    static async setSessionContext(client, context) {
        const {
            currentUser = 'SYSTEM',
            changeType = 'UPDATE',
            changeReason = 'No reason provided',
            clientIp = null,
            userAgent = null,
            requestId = null,
            sessionId = null
        } = context;

        try {
            await client.query(`SELECT set_config('app.current_user', $1, true)`, [currentUser]);
            await client.query(`SELECT set_config('app.change_type', $1, true)`, [changeType]);
            await client.query(`SELECT set_config('app.change_reason', $1, true)`, [changeReason]);
            
            if (clientIp) {
                await client.query(`SELECT set_config('app.client_ip', $1, true)`, [clientIp]);
            }
            if (userAgent) {
                await client.query(`SELECT set_config('app.user_agent', $1, true)`, [userAgent]);
            }
            if (requestId) {
                await client.query(`SELECT set_config('app.request_id', $1, true)`, [requestId]);
            }
            if (sessionId) {
                await client.query(`SELECT set_config('app.session_id', $1, true)`, [sessionId]);
            }
        } catch (error) {
            endDateLogger.error('Failed to set session context:', error);
        }
    }

    /**
     * end_date 변경 전 보안 검증
     * @param {number} issueId - 이슈 ID
     * @param {string} username - 사용자명
     * @param {Date} newEndDate - 새로운 마감시간
     * @returns {Object} 검증 결과
     */
    static async validateEndDateChange(issueId, username, newEndDate) {
        const pool = getPool();
        const client = await pool.connect();
        
        try {
            // 1. 차단된 사용자인지 확인
            const blockCheck = await client.query(`
                SELECT check_and_block_suspicious_changes($1, $2) as should_block
            `, [issueId, username]);
            
            if (blockCheck.rows[0]?.should_block) {
                endDateLogger.warn('End date change blocked for suspicious activity', {
                    issueId,
                    username,
                    newEndDate,
                    reason: 'Excessive changes detected'
                });
                
                return {
                    allowed: false,
                    reason: 'BLOCKED_SUSPICIOUS_ACTIVITY',
                    message: '의심스러운 활동이 감지되어 마감시간 변경이 차단되었습니다.'
                };
            }

            // 2. 현재 이슈 정보 조회
            const issueResult = await client.query(`
                SELECT end_date, title, created_by 
                FROM issues 
                WHERE id = $1
            `, [issueId]);

            if (issueResult.rows.length === 0) {
                return {
                    allowed: false,
                    reason: 'ISSUE_NOT_FOUND',
                    message: '해당 이슈를 찾을 수 없습니다.'
                };
            }

            const currentIssue = issueResult.rows[0];

            // 3. 최근 변경 이력 확인
            const recentChanges = await client.query(`
                SELECT COUNT(*) as change_count,
                       MAX(created_at) as last_change
                FROM end_date_audit_log
                WHERE issue_id = $1 
                AND created_at > NOW() - INTERVAL '1 hour'
                AND change_type != 'BLOCKED'
            `, [issueId]);

            const changeCount = parseInt(recentChanges.rows[0]?.change_count) || 0;
            const lastChange = recentChanges.rows[0]?.last_change;

            // 4. 변경 빈도 검증
            if (changeCount >= 5) {
                endDateLogger.warn('End date change frequency limit exceeded', {
                    issueId,
                    username,
                    changeCount,
                    timeWindow: '1 hour'
                });

                return {
                    allowed: false,
                    reason: 'FREQUENCY_LIMIT_EXCEEDED',
                    message: '1시간 내 너무 많은 변경이 발생했습니다. 잠시 후 다시 시도해주세요.'
                };
            }

            // 5. 연속 변경 간격 검증 (5분 이내 2회 이상)
            if (lastChange && new Date(lastChange) > new Date(Date.now() - 5 * 60 * 1000)) {
                endDateLogger.warn('Rapid end date changes detected', {
                    issueId,
                    username,
                    lastChange,
                    currentTime: new Date()
                });

                return {
                    allowed: false,
                    reason: 'RAPID_CHANGES_DETECTED',
                    message: '너무 빠른 연속 변경이 감지되었습니다. 5분 후 다시 시도해주세요.'
                };
            }

            // 6. 시간 유효성 검증
            const now = new Date();
            const endDate = new Date(newEndDate);
            
            if (endDate <= now) {
                return {
                    allowed: false,
                    reason: 'INVALID_END_DATE',
                    message: '마감시간은 현재 시간보다 이후여야 합니다.'
                };
            }

            // 7. 최대 마감시간 제한 (1년 이내)
            const maxEndDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
            if (endDate > maxEndDate) {
                return {
                    allowed: false,
                    reason: 'END_DATE_TOO_FAR',
                    message: '마감시간은 1년 이내로 설정해야 합니다.'
                };
            }

            // 모든 검증 통과
            return {
                allowed: true,
                currentEndDate: currentIssue.end_date,
                changeCount
            };

        } catch (error) {
            endDateLogger.error('End date validation error:', error);
            return {
                allowed: false,
                reason: 'VALIDATION_ERROR',
                message: '마감시간 변경 검증 중 오류가 발생했습니다.'
            };
        } finally {
            client.release();
        }
    }

    /**
     * end_date 변경 로그 수동 기록 (트리거 외 추가 로깅)
     * @param {Object} changeInfo - 변경 정보
     */
    static async logEndDateChange(changeInfo) {
        const {
            issueId,
            oldEndDate,
            newEndDate,
            changedBy,
            changeType,
            changeReason,
            additionalData = {}
        } = changeInfo;

        try {
            endDateLogger.info('End date change detected', {
                issueId,
                oldEndDate,
                newEndDate,
                changedBy,
                changeType,
                changeReason,
                timestamp: new Date(),
                ...additionalData
            });

            // 즉시 알림이 필요한 경우
            if (changeType === 'SUSPICIOUS' || additionalData.suspicious) {
                await this.sendSecurityAlert({
                    type: 'SUSPICIOUS_END_DATE_CHANGE',
                    issueId,
                    changedBy,
                    changeReason,
                    timestamp: new Date()
                });
            }

        } catch (error) {
            endDateLogger.error('Failed to log end date change:', error);
        }
    }

    /**
     * 보안 알림 전송
     * @param {Object} alertInfo - 알림 정보
     */
    static async sendSecurityAlert(alertInfo) {
        try {
            // 1. 데이터베이스 알림 기록
            const pool = getPool();
            const client = await pool.connect();
            
            // 관리자들에게 알림 전송
            await client.query(`
                INSERT INTO notifications (user_id, title, message, type, priority, created_at)
                SELECT 
                    u.id,
                    'Security Alert: 의심스러운 마감시간 변경',
                    $1,
                    'security',
                    'high',
                    NOW()
                FROM users u
                WHERE u.role = 'admin'
            `, [`이슈 ${alertInfo.issueId}의 마감시간이 의심스러운 패턴으로 변경되었습니다. 사용자: ${alertInfo.changedBy}, 시간: ${alertInfo.timestamp}`]);
            
            client.release();

            // 2. 로그 기록
            endDateLogger.warn('Security alert sent', alertInfo);

            // 3. 실시간 알림 (WebSocket이 있다면)
            // await this.sendRealTimeAlert(alertInfo);

        } catch (error) {
            endDateLogger.error('Failed to send security alert:', error);
        }
    }

    /**
     * 이슈별 end_date 변경 이력 조회
     * @param {number} issueId - 이슈 ID
     * @param {number} limit - 조회 개수 제한
     * @returns {Array} 변경 이력
     */
    static async getEndDateHistory(issueId, limit = 50) {
        const pool = getPool();
        const client = await pool.connect();
        
        try {
            const result = await client.query(`
                SELECT 
                    id,
                    old_end_date,
                    new_end_date,
                    changed_by,
                    change_type,
                    change_reason,
                    ip_address,
                    user_agent,
                    suspicious_pattern,
                    auto_blocked,
                    created_at
                FROM end_date_audit_log
                WHERE issue_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            `, [issueId, limit]);

            return result.rows;
        } finally {
            client.release();
        }
    }

    /**
     * 의심스러운 패턴 감지 및 분석
     * @param {string} username - 사용자명 (선택적)
     * @param {number} hours - 분석 시간 범위 (기본 24시간)
     * @returns {Object} 패턴 분석 결과
     */
    static async analyzeSuspiciousPatterns(username = null, hours = 24) {
        const pool = getPool();
        const client = await pool.connect();
        
        try {
            let query = `
                SELECT 
                    changed_by,
                    COUNT(*) as total_changes,
                    COUNT(*) FILTER (WHERE suspicious_pattern = true) as suspicious_changes,
                    COUNT(DISTINCT issue_id) as affected_issues,
                    MIN(created_at) as first_change,
                    MAX(created_at) as last_change,
                    AVG(EXTRACT(EPOCH FROM (
                        LEAD(created_at) OVER (
                            PARTITION BY changed_by 
                            ORDER BY created_at
                        ) - created_at
                    ))) as avg_interval_seconds
                FROM end_date_audit_log
                WHERE created_at > NOW() - INTERVAL '${hours} hours'
                AND change_type != 'BLOCKED'
            `;

            const params = [];
            if (username) {
                query += ` AND changed_by = $1`;
                params.push(username);
            }

            query += `
                GROUP BY changed_by
                HAVING COUNT(*) > 2
                ORDER BY suspicious_changes DESC, total_changes DESC
            `;

            const result = await client.query(query, params);
            return result.rows;
        } finally {
            client.release();
        }
    }

    /**
     * 데이터 일관성 검증 및 복구
     * @returns {Object} 검증 결과
     */
    static async validateAndRepairConsistency() {
        const pool = getPool();
        const client = await pool.connect();
        
        try {
            // 1. 일관성 검증
            const inconsistencies = await client.query(`
                SELECT * FROM validate_end_date_consistency()
                WHERE inconsistent = true
            `);

            const result = {
                totalIssues: 0,
                inconsistentIssues: inconsistencies.rows.length,
                repairedIssues: 0,
                errors: []
            };

            // 2. 전체 이슈 수 조회
            const totalResult = await client.query(`SELECT COUNT(*) as total FROM issues`);
            result.totalIssues = parseInt(totalResult.rows[0].total);

            // 3. 불일치 데이터 복구 시도
            for (const inconsistency of inconsistencies.rows) {
                try {
                    // 가장 최근의 올바른 end_date 조회
                    const lastValidChange = await client.query(`
                        SELECT new_end_date
                        FROM end_date_audit_log
                        WHERE issue_id = $1
                        AND change_type != 'BLOCKED'
                        AND new_end_date IS NOT NULL
                        ORDER BY created_at DESC
                        LIMIT 1
                    `, [inconsistency.issue_id]);

                    if (lastValidChange.rows.length > 0) {
                        const correctEndDate = lastValidChange.rows[0].new_end_date;
                        
                        // 세션 컨텍스트 설정
                        await this.setSessionContext(client, {
                            currentUser: 'SYSTEM_REPAIR',
                            changeType: 'REPAIR',
                            changeReason: 'Automatic consistency repair'
                        });

                        // 데이터 복구
                        await client.query(`
                            UPDATE issues 
                            SET end_date = $1 
                            WHERE id = $2
                        `, [correctEndDate, inconsistency.issue_id]);

                        result.repairedIssues++;
                        
                        endDateLogger.info('Data consistency repaired', {
                            issueId: inconsistency.issue_id,
                            correctedEndDate: correctEndDate
                        });
                    }
                } catch (error) {
                    result.errors.push({
                        issueId: inconsistency.issue_id,
                        error: error.message
                    });
                }
            }

            return result;
        } finally {
            client.release();
        }
    }
}

module.exports = EndDateTracker;