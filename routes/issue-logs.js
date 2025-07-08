/**
 * Issue Logs API
 * Provides endpoints for viewing issue modification logs and security alerts
 */

const express = require('express');
const { secureAdminMiddleware, requirePermission } = require('../middleware/admin-auth-secure');
const { issueLogger } = require('../utils/issue-logging');

const router = express.Router();

/**
 * Get recent issue modification logs
 */
router.get('/modifications', secureAdminMiddleware, requirePermission('view_logs'), (req, res) => {
    try {
        const { limit = 100, issueId } = req.query;
        const logs = issueLogger.getRecentLogs(parseInt(limit));
        
        // Filter by issue ID if provided
        const filteredLogs = issueId ? 
            logs.filter(log => log.issueId === parseInt(issueId)) : 
            logs;
        
        res.json({
            success: true,
            logs: filteredLogs,
            total: filteredLogs.length
        });
    } catch (error) {
        console.error('Failed to fetch modification logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch modification logs'
        });
    }
});

/**
 * Get security alerts
 */
router.get('/alerts', secureAdminMiddleware, requirePermission('view_logs'), (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const alerts = issueLogger.getSecurityAlerts(parseInt(limit));
        
        res.json({
            success: true,
            alerts,
            total: alerts.length
        });
    } catch (error) {
        console.error('Failed to fetch security alerts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch security alerts'
        });
    }
});

/**
 * Get log statistics
 */
router.get('/stats', secureAdminMiddleware, requirePermission('view_logs'), (req, res) => {
    try {
        const logs = issueLogger.getRecentLogs(1000); // Get more for stats
        const alerts = issueLogger.getSecurityAlerts(100);
        
        // Calculate statistics
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        
        const recentLogs = logs.filter(log => new Date(log.timestamp) > oneDayAgo);
        const hourlyLogs = logs.filter(log => new Date(log.timestamp) > oneHourAgo);
        const recentAlerts = alerts.filter(alert => new Date(alert.timestamp) > oneDayAgo);
        
        // Count by action type
        const actionCounts = {};
        recentLogs.forEach(log => {
            actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
        });
        
        // Count by severity
        const severityCounts = {};
        recentLogs.forEach(log => {
            severityCounts[log.severity] = (severityCounts[log.severity] || 0) + 1;
        });
        
        // Count deadline changes
        const deadlineChanges = recentLogs.filter(log => 
            log.fieldName === 'end_date' || log.fieldName === 'deadline'
        ).length;
        
        res.json({
            success: true,
            stats: {
                totalLogs: logs.length,
                last24Hours: recentLogs.length,
                lastHour: hourlyLogs.length,
                totalAlerts: alerts.length,
                recentAlerts: recentAlerts.length,
                deadlineChanges,
                actionCounts,
                severityCounts
            }
        });
    } catch (error) {
        console.error('Failed to calculate log statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate statistics'
        });
    }
});

/**
 * Search logs by criteria
 */
router.get('/search', secureAdminMiddleware, requirePermission('view_logs'), (req, res) => {
    try {
        const { 
            action, 
            severity, 
            fieldName, 
            userId, 
            adminId, 
            ipAddress,
            startDate,
            endDate,
            limit = 100 
        } = req.query;
        
        let logs = issueLogger.getRecentLogs(parseInt(limit) * 2); // Get more for filtering
        
        // Apply filters
        if (action) {
            logs = logs.filter(log => log.action && log.action.toLowerCase().includes(action.toLowerCase()));
        }
        
        if (severity) {
            logs = logs.filter(log => log.severity === severity.toUpperCase());
        }
        
        if (fieldName) {
            logs = logs.filter(log => log.fieldName === fieldName);
        }
        
        if (userId) {
            logs = logs.filter(log => log.userId === parseInt(userId));
        }
        
        if (adminId) {
            logs = logs.filter(log => log.adminId === parseInt(adminId));
        }
        
        if (ipAddress) {
            logs = logs.filter(log => log.ipAddress && log.ipAddress.includes(ipAddress));
        }
        
        if (startDate) {
            const start = new Date(startDate);
            logs = logs.filter(log => new Date(log.timestamp) >= start);
        }
        
        if (endDate) {
            const end = new Date(endDate);
            logs = logs.filter(log => new Date(log.timestamp) <= end);
        }
        
        // Limit results
        logs = logs.slice(0, parseInt(limit));
        
        res.json({
            success: true,
            logs,
            total: logs.length,
            filters: req.query
        });
    } catch (error) {
        console.error('Failed to search logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search logs'
        });
    }
});

module.exports = router;