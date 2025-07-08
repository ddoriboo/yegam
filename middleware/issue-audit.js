/**
 * Issue Audit Middleware
 * 이슈 변경 감사 및 보안 미들웨어
 * 
 * 기능:
 * - 모든 이슈 변경사항 추적
 * - 의심스러운 활동 패턴 감지
 * - 변경 전 유효성 검사
 * - 자동 알림 생성
 */

const { query, get, run } = require('../database/database');

class IssueAuditService {
    
    /**
     * 감사 로그 기록
     */
    static async logIssueChange({
        issueId,
        userId = null,
        adminId = null,
        action,
        fieldName = null,
        oldValue = null,
        newValue = null,
        changeSource = 'api',
        ipAddress = null,
        userAgent = null,
        sessionId = null,
        changeReason = null,
        metadata = {}
    }) {
        try {
            await query(`
                INSERT INTO issue_audit_logs (
                    issue_id, user_id, admin_id, action, field_name, 
                    old_value, new_value, change_source, ip_address, 
                    user_agent, session_id, change_reason, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [
                issueId, userId, adminId, action, fieldName,
                oldValue, newValue, changeSource, ipAddress,
                userAgent, sessionId, changeReason, JSON.stringify(metadata)
            ]);
            
            console.log(`📝 감사 로그 기록: ${action} - 이슈 ${issueId} - ${fieldName || 'N/A'}`);
        } catch (error) {
            console.error('❌ 감사 로그 기록 실패:', error);
        }
    }

    /**
     * 이슈 변경 유효성 검사
     */
    static async validateIssueChange(issueId, fieldName, newValue, userId = null, adminId = null) {
        try {
            const result = await query(`
                SELECT validate_issue_change($1, $2, $3, $4, $5) as validation_result
            `, [issueId, fieldName, newValue, userId, adminId]);
            
            const validationResult = result.rows[0]?.validation_result || { valid: false, errors: ['검증 함수 오류'] };
            
            if (!validationResult.valid) {
                console.warn(`⚠️ 이슈 변경 검증 실패: ${validationResult.errors.join(', ')}`);
                
                // 검증 실패 로그 기록
                await this.logIssueChange({
                    issueId,
                    userId,
                    adminId,
                    action: 'VALIDATION_FAILED',
                    fieldName,
                    newValue,
                    changeSource: 'validation',
                    metadata: { validation_errors: validationResult.errors }
                });
            }
            
            return validationResult;
        } catch (error) {
            console.error('❌ 이슈 변경 검증 오류:', error);
            return { valid: false, errors: ['검증 과정에서 오류가 발생했습니다.'] };
        }
    }

    /**
     * 의심스러운 활동 패턴 감지 실행
     */
    static async detectSuspiciousPatterns() {
        try {
            const result = await query('SELECT detect_suspicious_patterns() as alert_count');
            const alertCount = result.rows[0]?.alert_count || 0;
            
            if (alertCount > 0) {
                console.warn(`🚨 의심스러운 활동 패턴 감지: ${alertCount}건의 새로운 알림`);
            }
            
            return alertCount;
        } catch (error) {
            console.error('❌ 의심스러운 패턴 감지 오류:', error);
            return 0;
        }
    }

    /**
     * 최근 감사 로그 조회
     */
    static async getRecentAuditLogs(issueId = null, limit = 100) {
        try {
            let queryStr = `
                SELECT * FROM issue_audit_summary
                WHERE 1=1
            `;
            let params = [];
            
            if (issueId) {
                queryStr += ` AND issue_id = $1`;
                params.push(issueId);
            }
            
            queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
            params.push(limit);
            
            const result = await query(queryStr, params);
            return result.rows;
        } catch (error) {
            console.error('❌ 감사 로그 조회 오류:', error);
            return [];
        }
    }

    /**
     * 의심스러운 활동 알림 조회
     */
    static async getSuspiciousAlerts(status = 'open', limit = 50) {
        try {
            const result = await query(`
                SELECT 
                    saa.*,
                    u.username as related_username,
                    a.username as related_admin_username,
                    ra.username as resolved_by_username
                FROM suspicious_activity_alerts saa
                LEFT JOIN users u ON saa.related_user_id = u.id
                LEFT JOIN admins a ON saa.related_admin_id = a.id
                LEFT JOIN admins ra ON saa.resolved_by = ra.id
                WHERE status = $1
                ORDER BY severity DESC, created_at DESC
                LIMIT $2
            `, [status, limit]);
            
            return result.rows;
        } catch (error) {
            console.error('❌ 의심스러운 활동 알림 조회 오류:', error);
            return [];
        }
    }

    /**
     * 알림 해결 처리
     */
    static async resolveAlert(alertId, resolvedBy, resolutionNotes = null) {
        try {
            await query(`
                UPDATE suspicious_activity_alerts 
                SET status = 'resolved', resolved_by = $1, resolved_at = NOW(), resolution_notes = $2
                WHERE id = $3
            `, [resolvedBy, resolutionNotes, alertId]);
            
            console.log(`✅ 의심스러운 활동 알림 해결됨: ${alertId}`);
        } catch (error) {
            console.error('❌ 알림 해결 처리 오류:', error);
        }
    }
}

/**
 * 이슈 변경 전 검증 미들웨어
 */
const validateIssueChangeMiddleware = (fieldName) => {
    return async (req, res, next) => {
        try {
            const issueId = req.params.id;
            const newValue = req.body[fieldName];
            const userId = req.user?.id;
            const adminId = req.admin?.id;
            
            // 필드값이 없으면 검증 스킵
            if (newValue === undefined) {
                return next();
            }
            
            const validation = await IssueAuditService.validateIssueChange(
                issueId, fieldName, String(newValue), userId, adminId
            );
            
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: '변경 사항이 정책에 위반됩니다.',
                    errors: validation.errors
                });
            }
            
            next();
        } catch (error) {
            console.error('❌ 이슈 변경 검증 미들웨어 오류:', error);
            res.status(500).json({
                success: false,
                message: '변경 사항 검증 중 오류가 발생했습니다.'
            });
        }
    };
};

/**
 * 이슈 변경 후 감사 로깅 미들웨어
 */
const auditIssueChangeMiddleware = (action) => {
    return async (req, res, next) => {
        // 원본 응답 함수들 백업
        const originalJson = res.json;
        const originalSend = res.send;
        const originalEnd = res.end;
        
        // 응답 데이터 캡처
        let responseData = null;
        let responseSent = false;
        
        res.json = function(data) {
            responseData = data;
            responseSent = true;
            return originalJson.call(this, data);
        };
        
        res.send = function(data) {
            if (!responseSent) {
                responseData = data;
                responseSent = true;
            }
            return originalSend.call(this, data);
        };
        
        res.end = function(data) {
            if (!responseSent) {
                responseData = data;
                responseSent = true;
            }
            return originalEnd.call(this, data);
        };
        
        // 다음 미들웨어 실행
        next();
        
        // 응답 후 감사 로그 기록 (비동기)
        setImmediate(async () => {
            try {
                // 성공적인 응답인지 확인
                if (res.statusCode >= 200 && res.statusCode < 300 && responseData?.success) {
                    const issueId = req.params.id;
                    const userId = req.user?.id;
                    const adminId = req.admin?.id;
                    
                    await IssueAuditService.logIssueChange({
                        issueId,
                        userId,
                        adminId,
                        action,
                        changeSource: 'api',
                        ipAddress: req.ip,
                        userAgent: req.get('User-Agent'),
                        sessionId: req.sessionID,
                        metadata: {
                            api_endpoint: req.originalUrl,
                            method: req.method,
                            request_body: req.body,
                            response_status: res.statusCode,
                            timestamp: new Date().toISOString()
                        }
                    });
                    
                    // 의심스러운 패턴 감지 (백그라운드 실행)
                    IssueAuditService.detectSuspiciousPatterns().catch(err => {
                        console.error('패턴 감지 오류:', err);
                    });
                }
            } catch (error) {
                console.error('❌ 감사 로그 미들웨어 오류:', error);
            }
        });
    };
};

/**
 * 이슈 상세 변경 감사 미들웨어 (특정 필드 추적)
 */
const auditSpecificFieldMiddleware = (fieldName) => {
    return async (req, res, next) => {
        try {
            const issueId = req.params.id;
            
            // 기존 이슈 정보 조회
            const existingIssue = await get('SELECT * FROM issues WHERE id = $1', [issueId]);
            
            if (existingIssue) {
                req.auditData = {
                    issueId,
                    fieldName,
                    oldValue: existingIssue[fieldName]
                };
            }
            
            next();
        } catch (error) {
            console.error('❌ 필드별 감사 미들웨어 오류:', error);
            next();
        }
    };
};

/**
 * 특정 필드 변경 후 로깅
 */
const logFieldChangeMiddleware = () => {
    return async (req, res, next) => {
        const originalJson = res.json;
        
        res.json = function(data) {
            // 성공적인 응답 후 필드별 로깅
            if (data?.success && req.auditData) {
                setImmediate(async () => {
                    try {
                        const { issueId, fieldName, oldValue } = req.auditData;
                        const newValue = req.body[fieldName];
                        
                        if (oldValue !== newValue) {
                            await IssueAuditService.logIssueChange({
                                issueId,
                                userId: req.user?.id,
                                adminId: req.admin?.id,
                                action: 'FIELD_UPDATE',
                                fieldName,
                                oldValue: String(oldValue),
                                newValue: String(newValue),
                                changeSource: 'api',
                                ipAddress: req.ip,
                                userAgent: req.get('User-Agent'),
                                metadata: {
                                    api_endpoint: req.originalUrl,
                                    change_detection: 'middleware'
                                }
                            });
                        }
                    } catch (error) {
                        console.error('❌ 필드 변경 로깅 오류:', error);
                    }
                });
            }
            
            return originalJson.call(this, data);
        };
        
        next();
    };
};

module.exports = {
    IssueAuditService,
    validateIssueChangeMiddleware,
    auditIssueChangeMiddleware,
    auditSpecificFieldMiddleware,
    logFieldChangeMiddleware
};