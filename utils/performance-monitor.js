// 성능 모니터링 유틸리티
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            memoryUsage: [],
            apiCalls: [],
            errors: [],
            startTime: Date.now()
        };
        this.isMonitoring = false;
        this.monitorInterval = null;
    }
    
    // 모니터링 시작
    start() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log('📊 성능 모니터링 시작');
        
        // 5초마다 메모리 사용량 체크
        this.monitorInterval = setInterval(() => {
            this.collectMemoryMetrics();
        }, 5000);
    }
    
    // 모니터링 중지
    stop() {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        console.log('⏹️ 성능 모니터링 중지');
    }
    
    // 메모리 메트릭 수집
    collectMemoryMetrics() {
        if (!performance.memory) return;
        
        const memoryInfo = {
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit,
            timestamp: Date.now()
        };
        
        this.metrics.memoryUsage.push(memoryInfo);
        
        // 최대 100개까지만 보관
        if (this.metrics.memoryUsage.length > 100) {
            this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-50);
        }
        
        // 메모리 사용량이 80% 이상이면 경고
        const usagePercent = (memoryInfo.used / memoryInfo.limit) * 100;
        if (usagePercent > 80) {
            console.warn(`🚨 높은 메모리 사용량: ${usagePercent.toFixed(1)}%`);
        }
    }
    
    // API 호출 기록
    recordApiCall(url, success, duration = 0) {
        const callInfo = {
            url,
            success,
            duration,
            timestamp: Date.now()
        };
        
        this.metrics.apiCalls.push(callInfo);
        
        // 최대 200개까지만 보관
        if (this.metrics.apiCalls.length > 200) {
            this.metrics.apiCalls = this.metrics.apiCalls.slice(-100);
        }
    }
    
    // 에러 기록
    recordError(error, context = '') {
        const errorInfo = {
            message: error.message || error.toString(),
            context,
            timestamp: Date.now()
        };
        
        this.metrics.errors.push(errorInfo);
        
        // 최대 50개까지만 보관
        if (this.metrics.errors.length > 50) {
            this.metrics.errors = this.metrics.errors.slice(-25);
        }
    }
    
    // 성능 통계 반환
    getStats() {
        const now = Date.now();
        const uptime = now - this.metrics.startTime;
        
        // 최근 1분간 API 호출 통계
        const recentCalls = this.metrics.apiCalls.filter(
            call => now - call.timestamp < 60000
        );
        
        // 최근 5분간 에러 통계
        const recentErrors = this.metrics.errors.filter(
            error => now - error.timestamp < 300000
        );
        
        // 메모리 사용량 통계
        const currentMemory = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1];
        
        return {
            uptime,
            memory: {
                current: currentMemory ? {
                    used: this.formatBytes(currentMemory.used),
                    total: this.formatBytes(currentMemory.total),
                    usagePercent: currentMemory ? ((currentMemory.used / currentMemory.limit) * 100).toFixed(1) : 0
                } : null,
                trend: this.getMemoryTrend()
            },
            api: {
                callsPerMinute: recentCalls.length,
                successRate: recentCalls.length > 0 ? 
                    ((recentCalls.filter(c => c.success).length / recentCalls.length) * 100).toFixed(1) : 100,
                averageResponseTime: recentCalls.length > 0 ?
                    (recentCalls.reduce((sum, c) => sum + c.duration, 0) / recentCalls.length).toFixed(0) : 0
            },
            errors: {
                recentCount: recentErrors.length,
                totalCount: this.metrics.errors.length
            }
        };
    }
    
    // 메모리 사용량 트렌드 분석
    getMemoryTrend() {
        if (this.metrics.memoryUsage.length < 2) return 'stable';
        
        const recent = this.metrics.memoryUsage.slice(-5);
        const first = recent[0].used;
        const last = recent[recent.length - 1].used;
        
        const changePercent = ((last - first) / first) * 100;
        
        if (changePercent > 10) return 'increasing';
        if (changePercent < -10) return 'decreasing';
        return 'stable';
    }
    
    // 바이트를 읽기 쉬운 형태로 변환
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // 성능 리포트 출력
    printReport() {
        const stats = this.getStats();
        
        console.group('📊 성능 모니터링 리포트');
        console.log('⏱️ 가동 시간:', Math.floor(stats.uptime / 60000), '분');
        
        if (stats.memory.current) {
            console.log('💾 메모리 사용량:', stats.memory.current.used, '/', stats.memory.current.total, 
                       `(${stats.memory.current.usagePercent}%)`);
            console.log('📈 메모리 트렌드:', stats.memory.trend);
        }
        
        console.log('🌐 API 호출/분:', stats.api.callsPerMinute);
        console.log('✅ API 성공률:', stats.api.successRate + '%');
        console.log('⚡ 평균 응답시간:', stats.api.averageResponseTime + 'ms');
        console.log('❌ 최근 에러:', stats.errors.recentCount, '(총', stats.errors.totalCount, ')');
        console.groupEnd();
    }
    
    // 메모리 강제 정리 시도
    forceCleanup() {
        console.log('🗑️ 메모리 강제 정리 시도...');
        
        // 가비지 컬렉션 트리거 (개발자 도구에서만 작동)
        if (window.gc) {
            window.gc();
            console.log('✅ 가비지 컬렉션 실행');
        }
        
        // 메트릭 데이터 정리
        this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-20);
        this.metrics.apiCalls = this.metrics.apiCalls.slice(-50);
        this.metrics.errors = this.metrics.errors.slice(-10);
        
        console.log('✅ 메트릭 데이터 정리 완료');
    }
}

// 전역 인스턴스 생성
const performanceMonitor = new PerformanceMonitor();

// 자동 시작 (페이지 로드 시)
if (typeof window !== 'undefined') {
    performanceMonitor.start();
    
    // 페이지 언로드 시 정리
    window.addEventListener('beforeunload', () => {
        performanceMonitor.stop();
    });
    
    // 10분마다 리포트 출력
    setInterval(() => {
        performanceMonitor.printReport();
    }, 600000);
}

// export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceMonitor;
} else if (typeof window !== 'undefined') {
    window.PerformanceMonitor = PerformanceMonitor;
    window.performanceMonitor = performanceMonitor;
}