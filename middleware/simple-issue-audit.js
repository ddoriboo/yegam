/**
 * Simple Issue Audit Middleware
 * Lightweight alternative to the complex audit system
 * Focuses on tracking issue modifications with file-based logging
 */

const { issueLogger } = require('../utils/issue-logging');
const { get } = require('../database/database');

/**
 * Middleware to log issue modifications
 */
const logIssueModification = (action) => {
    return async (req, res, next) => {
        // Store original issue data for comparison
        if (req.params.id) {
            try {
                const originalIssue = await get('SELECT * FROM issues WHERE id = $1', [req.params.id]);
                req.originalIssue = originalIssue;
            } catch (error) {
                console.error('Failed to fetch original issue data:', error);
            }
        }
        
        // Override response methods to capture successful operations
        const originalJson = res.json;
        const originalSend = res.send;
        
        res.json = function(data) {
            // Log after successful response
            if (data && data.success && req.params.id) {
                setImmediate(() => {
                    logModification(req, res, action, data);
                });
            }
            return originalJson.call(this, data);
        };
        
        res.send = function(data) {
            // Handle send responses
            if (res.statusCode >= 200 && res.statusCode < 300 && req.params.id) {
                setImmediate(() => {
                    logModification(req, res, action, data);
                });
            }
            return originalSend.call(this, data);
        };
        
        next();
    };
};

/**
 * Log the actual modification
 */
function logModification(req, res, action, responseData) {
    try {
        const issueId = req.params.id;
        const userId = req.user?.id;
        const adminId = req.admin?.id;
        const ipAddress = req.ip || req.connection?.remoteAddress;
        const userAgent = req.get('User-Agent');
        const endpoint = req.originalUrl;
        
        // Log general modification
        issueLogger.logIssueModification({
            issueId,
            action,
            userId,
            adminId,
            ipAddress,
            userAgent,
            endpoint
        });
        
        // Log specific field changes if we have original data
        if (req.originalIssue && req.body) {
            const fieldsToTrack = ['title', 'end_date', 'status', 'is_popular', 'category'];
            
            for (const field of fieldsToTrack) {
                const oldValue = req.originalIssue[field];
                const newValue = req.body[field];
                
                if (newValue !== undefined && String(oldValue) !== String(newValue)) {
                    issueLogger.logIssueModification({
                        issueId,
                        action: `UPDATE_${field.toUpperCase()}`,
                        fieldName: field,
                        oldValue: String(oldValue),
                        newValue: String(newValue),
                        userId,
                        adminId,
                        ipAddress,
                        userAgent,
                        endpoint
                    });
                }
            }
        }
    } catch (error) {
        console.error('Failed to log issue modification:', error);
    }
}

/**
 * Middleware to validate deadline changes
 */
const validateDeadlineChange = () => {
    return async (req, res, next) => {
        try {
            const { end_date, deadline } = req.body;
            const newDeadline = end_date || deadline;
            
            if (newDeadline && req.params.id) {
                const issueId = req.params.id;
                
                // Get current issue data
                const currentIssue = await get('SELECT end_date FROM issues WHERE id = $1', [issueId]);
                
                if (currentIssue) {
                    const validation = issueLogger.validateDeadlineChange(
                        issueId,
                        currentIssue.end_date,
                        newDeadline,
                        req.user?.id,
                        req.admin?.id
                    );
                    
                    if (!validation.valid) {
                        return res.status(400).json({
                            success: false,
                            message: 'Invalid deadline change',
                            errors: validation.errors
                        });
                    }
                    
                    if (validation.warnings.length > 0) {
                        console.warn(`🔔 Deadline change warnings for issue ${issueId}:`, validation.warnings);
                        
                        // Log warning
                        issueLogger.logIssueModification({
                            issueId,
                            action: 'DEADLINE_CHANGE_WARNING',
                            fieldName: 'end_date',
                            oldValue: String(currentIssue.end_date),
                            newValue: String(newDeadline),
                            userId: req.user?.id,
                            adminId: req.admin?.id,
                            ipAddress: req.ip,
                            userAgent: req.get('User-Agent'),
                            endpoint: req.originalUrl
                        });
                    }
                }
            }
            
            next();
        } catch (error) {
            console.error('Deadline validation error:', error);
            next(); // Continue anyway, don't block the request
        }
    };
};

/**
 * Rate limiting middleware for issue modifications
 */
const rateLimitIssueModifications = () => {
    const userActionCounts = new Map();
    
    // Clean up old data every 5 minutes
    setInterval(() => {
        const fiveMinutesAgo = Date.now() - 300000;
        for (const [key, data] of userActionCounts.entries()) {
            data.actions = data.actions.filter(time => time > fiveMinutesAgo);
            if (data.actions.length === 0) {
                userActionCounts.delete(key);
            }
        }
    }, 300000);
    
    return (req, res, next) => {
        const userKey = req.user?.id || req.admin?.id || req.ip;
        
        if (!userKey) {
            return next();
        }
        
        const now = Date.now();
        const fiveMinutesAgo = now - 300000;
        
        if (!userActionCounts.has(userKey)) {
            userActionCounts.set(userKey, { actions: [] });
        }
        
        const userData = userActionCounts.get(userKey);
        userData.actions = userData.actions.filter(time => time > fiveMinutesAgo);
        userData.actions.push(now);
        
        // Allow up to 20 modifications per 5 minutes
        if (userData.actions.length > 20) {
            // Log the rate limit violation
            issueLogger.logIssueModification({
                issueId: req.params.id || 'N/A',
                action: 'RATE_LIMIT_EXCEEDED',
                userId: req.user?.id,
                adminId: req.admin?.id,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl
            });
            
            return res.status(429).json({
                success: false,
                message: 'Too many issue modifications. Please wait before making more changes.',
                retryAfter: 300 // 5 minutes
            });
        }
        
        next();
    };
};

module.exports = {
    logIssueModification,
    validateDeadlineChange,
    rateLimitIssueModifications
};