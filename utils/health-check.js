const { query } = require('../database/database');

/**
 * 시스템 상태 체크 유틸리티
 */
class HealthCheck {
    constructor() {
        this.checks = [];
        this.startTime = Date.now();
    }

    /**
     * 데이터베이스 연결 상태 체크
     */
    async checkDatabase() {
        try {
            const start = Date.now();
            await query('SELECT 1 as health_check');
            const duration = Date.now() - start;
            
            return {
                name: 'database',
                status: 'healthy',
                responseTime: `${duration}ms`,
                message: 'Database connection is working'
            };
        } catch (error) {
            return {
                name: 'database',
                status: 'unhealthy',
                error: error.message,
                message: 'Database connection failed'
            };
        }
    }

    /**
     * 메모리 사용량 체크
     */
    checkMemory() {
        const memUsage = process.memoryUsage();
        const formatBytes = (bytes) => {
            return Math.round(bytes / 1024 / 1024 * 100) / 100 + ' MB';
        };

        const memoryThreshold = 1000 * 1024 * 1024; // 1GB
        const isHealthy = memUsage.heapUsed < memoryThreshold;

        return {
            name: 'memory',
            status: isHealthy ? 'healthy' : 'warning',
            details: {
                heapUsed: formatBytes(memUsage.heapUsed),
                heapTotal: formatBytes(memUsage.heapTotal),
                external: formatBytes(memUsage.external),
                rss: formatBytes(memUsage.rss)
            },
            message: isHealthy ? 'Memory usage is normal' : 'High memory usage detected'
        };
    }

    /**
     * 서버 업타임 체크
     */
    checkUptime() {
        const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const formatUptime = (seconds) => {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            
            if (days > 0) return `${days}d ${hours}h ${minutes}m ${secs}s`;
            if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
            if (minutes > 0) return `${minutes}m ${secs}s`;
            return `${secs}s`;
        };

        return {
            name: 'uptime',
            status: 'healthy',
            uptime: formatUptime(uptimeSeconds),
            uptimeSeconds,
            message: 'Server is running'
        };
    }

    /**
     * 디스크 공간 체크 (간단한 버전)
     */
    checkDisk() {
        try {
            const fs = require('fs');
            const stats = fs.statSync(__dirname);
            
            return {
                name: 'disk',
                status: 'healthy',
                message: 'Disk access is working'
            };
        } catch (error) {
            return {
                name: 'disk',
                status: 'unhealthy',
                error: error.message,
                message: 'Disk access failed'
            };
        }
    }

    /**
     * 전체 시스템 상태 체크
     */
    async performHealthCheck() {
        const startTime = Date.now();
        
        try {
            const checks = await Promise.all([
                this.checkDatabase(),
                Promise.resolve(this.checkMemory()),
                Promise.resolve(this.checkUptime()),
                Promise.resolve(this.checkDisk())
            ]);

            const overallStatus = checks.every(check => check.status === 'healthy') ? 'healthy' : 
                                 checks.some(check => check.status === 'unhealthy') ? 'unhealthy' : 'warning';

            const responseTime = Date.now() - startTime;

            return {
                status: overallStatus,
                timestamp: new Date().toISOString(),
                responseTime: `${responseTime}ms`,
                version: process.env.npm_package_version || '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                checks: checks
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message,
                message: 'Health check failed'
            };
        }
    }

    /**
     * 간단한 상태 체크 (빠른 응답용)
     */
    async quickCheck() {
        try {
            await query('SELECT 1');
            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                message: 'Service is operational'
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message,
                message: 'Service is not operational'
            };
        }
    }
}

module.exports = HealthCheck;