/**
 * Simple Issue Logging System
 * Tracks issue modifications with file-based logging for accountability
 */

const fs = require('fs');
const path = require('path');

class IssueLogger {
    constructor() {
        this.logDir = path.join(__dirname, '../logs');
        this.logFile = path.join(this.logDir, 'issue-modifications.log');
        this.alertFile = path.join(this.logDir, 'security-alerts.log');
        
        // Ensure log directory exists
        this.ensureLogDirectory();
        
        // Rate limiting cache
        this.rateLimitCache = new Map();
        this.cleanupInterval = setInterval(() => this.cleanupRateLimit(), 60000); // Clean every minute
    }
    
    ensureLogDirectory() {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
        } catch (error) {
            console.error('Failed to create log directory:', error);
        }
    }
    
    /**
     * Log issue modification
     */
    logIssueModification({
        issueId,
        action,
        fieldName = null,
        oldValue = null,
        newValue = null,
        userId = null,
        adminId = null,
        ipAddress = null,
        userAgent = null,
        endpoint = null,
        timestamp = new Date()
    }) {
        const logEntry = {
            timestamp: timestamp.toISOString(),
            issueId,
            action,
            fieldName,
            oldValue,
            newValue,
            userId,
            adminId,
            ipAddress,
            userAgent: userAgent?.substring(0, 200), // Truncate for log size
            endpoint,
            severity: this.calculateSeverity(action, fieldName, oldValue, newValue)
        };
        
        const logLine = JSON.stringify(logEntry) + '\n';
        
        try {
            fs.appendFileSync(this.logFile, logLine);
            console.log(`📝 Issue modification logged: ${action} on issue ${issueId} by ${userId || adminId || 'unknown'}`);
            
            // Check for suspicious activity
            this.checkForSuspiciousActivity(logEntry);
            
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }
    
    /**
     * Calculate severity level based on action and changes
     */
    calculateSeverity(action, fieldName, oldValue, newValue) {
        // High severity for deadline changes
        if (fieldName === 'end_date' || fieldName === 'deadline') {
            const oldDate = oldValue ? new Date(oldValue) : null;
            const newDate = newValue ? new Date(newValue) : null;
            
            if (oldDate && newDate) {
                const timeDiff = Math.abs(newDate - oldDate);
                const hoursDiff = timeDiff / (1000 * 60 * 60);
                
                if (hoursDiff > 24) return 'HIGH';
                if (hoursDiff > 6) return 'MEDIUM';
                return 'LOW';
            }
            return 'MEDIUM';
        }
        
        // Medium severity for title/status changes
        if (fieldName === 'title' || fieldName === 'status') {
            return 'MEDIUM';
        }
        
        // High severity for creation/deletion
        if (action.includes('DELETE') || action.includes('CREATE')) {
            return 'HIGH';
        }
        
        return 'LOW';
    }
    
    /**
     * Check for suspicious activity patterns
     */
    checkForSuspiciousActivity(logEntry) {
        const { userId, adminId, ipAddress, action, fieldName, issueId } = logEntry;
        const userKey = userId || adminId || ipAddress;
        const now = Date.now();
        
        if (!userKey) return;
        
        // Initialize rate limit tracking for user
        if (!this.rateLimitCache.has(userKey)) {
            this.rateLimitCache.set(userKey, {
                recentActions: [],
                deadlineChanges: []
            });
        }
        
        const userData = this.rateLimitCache.get(userKey);
        
        // Track recent actions (last 10 minutes)
        userData.recentActions = userData.recentActions.filter(time => now - time < 600000); // 10 minutes
        userData.recentActions.push(now);
        
        // Track deadline changes (last hour)
        if (fieldName === 'end_date' || fieldName === 'deadline') {
            userData.deadlineChanges = userData.deadlineChanges.filter(time => now - time < 3600000); // 1 hour
            userData.deadlineChanges.push({ time: now, issueId });
        }
        
        // Alert conditions
        const alerts = [];
        
        // Too many actions in short time
        if (userData.recentActions.length > 10) {
            alerts.push({
                type: 'RAPID_MODIFICATIONS',
                message: `User performed ${userData.recentActions.length} actions in 10 minutes`,
                severity: 'HIGH'
            });
        }
        
        // Multiple deadline changes
        if (userData.deadlineChanges.length > 3) {
            alerts.push({
                type: 'MULTIPLE_DEADLINE_CHANGES',
                message: `User changed deadlines ${userData.deadlineChanges.length} times in 1 hour`,
                severity: 'HIGH'
            });
        }
        
        // Same issue modified repeatedly
        const sameIssueActions = userData.recentActions.length > 0 ? 
            userData.recentActions.filter(() => true).length : 0;
        if (sameIssueActions > 5) {
            alerts.push({
                type: 'REPEATED_ISSUE_MODIFICATION',
                message: `Issue ${issueId} modified repeatedly`,
                severity: 'MEDIUM'
            });
        }
        
        // Log alerts
        if (alerts.length > 0) {
            this.logSecurityAlert(userKey, logEntry, alerts);
        }
    }
    
    /**
     * Log security alert
     */
    logSecurityAlert(userKey, originalLogEntry, alerts) {
        const alertEntry = {
            timestamp: new Date().toISOString(),
            userKey,
            originalAction: originalLogEntry,
            alerts,
            ipAddress: originalLogEntry.ipAddress,
            userAgent: originalLogEntry.userAgent
        };
        
        const alertLine = JSON.stringify(alertEntry) + '\n';
        
        try {
            fs.appendFileSync(this.alertFile, alertLine);
            console.warn(`🚨 Security alert: ${alerts.map(a => a.type).join(', ')} for user ${userKey}`);
        } catch (error) {
            console.error('Failed to write security alert:', error);
        }
    }
    
    /**
     * Validate deadline change
     */
    validateDeadlineChange(issueId, oldDeadline, newDeadline, userId = null, adminId = null) {
        const now = new Date();
        const oldDate = new Date(oldDeadline);
        const newDate = new Date(newDeadline);
        
        const validation = {
            valid: true,
            warnings: [],
            errors: []
        };
        
        // Check if new deadline is in the past
        if (newDate <= now) {
            validation.valid = false;
            validation.errors.push('Deadline cannot be set in the past');
        }
        
        // Check for suspicious large changes
        const timeDiff = Math.abs(newDate - oldDate);
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
        
        if (daysDiff > 30) {
            validation.warnings.push(`Large deadline change: ${daysDiff.toFixed(1)} days difference`);
        }
        
        // Check if deadline is being moved very close to current time
        const hoursUntilDeadline = (newDate - now) / (1000 * 60 * 60);
        if (hoursUntilDeadline < 1) {
            validation.warnings.push('Deadline is very close to current time (less than 1 hour)');
        }
        
        return validation;
    }
    
    /**
     * Clean up old rate limit data
     */
    cleanupRateLimit() {
        const now = Date.now();
        for (const [userKey, userData] of this.rateLimitCache.entries()) {
            userData.recentActions = userData.recentActions.filter(time => now - time < 600000);
            userData.deadlineChanges = userData.deadlineChanges.filter(item => now - item.time < 3600000);
            
            // Remove user data if no recent activity
            if (userData.recentActions.length === 0 && userData.deadlineChanges.length === 0) {
                this.rateLimitCache.delete(userKey);
            }
        }
    }
    
    /**
     * Get recent logs (for admin dashboard)
     */
    getRecentLogs(limit = 100) {
        try {
            if (!fs.existsSync(this.logFile)) {
                return [];
            }
            
            const logContent = fs.readFileSync(this.logFile, 'utf8');
            const lines = logContent.trim().split('\n').filter(line => line.length > 0);
            
            return lines
                .slice(-limit)
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(entry => entry !== null)
                .reverse(); // Most recent first
        } catch (error) {
            console.error('Failed to read log file:', error);
            return [];
        }
    }
    
    /**
     * Get security alerts
     */
    getSecurityAlerts(limit = 50) {
        try {
            if (!fs.existsSync(this.alertFile)) {
                return [];
            }
            
            const alertContent = fs.readFileSync(this.alertFile, 'utf8');
            const lines = alertContent.trim().split('\n').filter(line => line.length > 0);
            
            return lines
                .slice(-limit)
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(entry => entry !== null)
                .reverse(); // Most recent first
        } catch (error) {
            console.error('Failed to read alert file:', error);
            return [];
        }
    }
    
    /**
     * Cleanup - call when shutting down
     */
    cleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

// Create singleton instance
const issueLogger = new IssueLogger();

// Export both the class and instance
module.exports = {
    IssueLogger,
    issueLogger
};