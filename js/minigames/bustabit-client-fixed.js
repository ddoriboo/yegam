// Bustabit 게임 클라이언트 (버그 수정 버전)
class BustabitClient extends MinigameBase {
    constructor() {
        super('bustabit');
        
        // 게임 상태
        this.gameState = 'waiting';
        this.currentMultiplier = 1.00;
        this.currentBet = 0;
        this.hasBet = false;
        this.hasCashedOut = false;
        this.gameStartTime = null;
        
        // 메모리 누수 방지
        this.isDestroyed = false;
        this.isRenderLoopActive = false;
        
        // UI 요소들
        this.canvas = null;
        this.ctx = null;
        this.multiplierDisplay = null;
        this.statusDisplay = null;
        
        // 렌더링 최적화 관련
        this.backgroundCanvas = null;
        this.backgroundCtx = null;
        this.lastRenderTime = 0;
        this.chartData = [];
        this.maxDataPoints = 500;
        this.isBackgroundDirty = true;
        
        // 업데이트 타이머
        this.updateInterval = null;
        this.renderInterval = null;
        this.renderAnimationFrame = null;
        
        // 게임 히스토리
        this.gameHistory = [];
        
        console.log('🚀 Bustabit 클라이언트 초기화 (메모리 누수 방지 적용)');
    }
    
    // Y축 범위 계산 (통일된 함수로 정확한 정렬 보장)
    calculateYAxisRange() {
        const currentMultiplier = this.currentMultiplier || 1.0;
        
        // 적응적 Y축 범위 계산 (현재 배수에 맞춰 동적 조정)
        let maxMultiplier;
        if (currentMultiplier <= 1.1) {
            maxMultiplier = 2; // 게임 시작 시 기본 범위
        } else if (currentMultiplier <= 2) {
            maxMultiplier = Math.max(3, currentMultiplier * 1.5); // 50% 여유분
        } else if (currentMultiplier <= 5) {
            maxMultiplier = Math.max(currentMultiplier + 2, currentMultiplier * 1.4); // 최소 +2 또는 40% 여유분
        } else if (currentMultiplier <= 10) {
            maxMultiplier = currentMultiplier * 1.3; // 30% 여유분
        } else {
            maxMultiplier = currentMultiplier * 1.2; // 20% 여유분
        }
        
        // 소수점 반올림으로 깔끔한 스케일
        maxMultiplier = Math.ceil(maxMultiplier * 2) / 2; // 0.5 단위로 반올림
        
        return { currentMultiplier, maxMultiplier };
    }
    
    // Y좌표 계산 함수 (모든 곳에서 동일하게 사용)
    calculateYPosition(multiplier, maxMultiplier, margin, graphHeight) {
        const normalizedPosition = (multiplier - 1) / (maxMultiplier - 1);
        return margin.top + graphHeight - (normalizedPosition * graphHeight);
    }
    
    // 축과 그리드 그리기 (수정된 버전)
    drawAxesAndGridToContext(ctx, margin, graphWidth, graphHeight) {
        
        // 축 색상
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        
        // Y축 (배수)
        ctx.beginPath();
        ctx.moveTo(margin.left, margin.top);
        ctx.lineTo(margin.left, margin.top + graphHeight);
        ctx.stroke();
        
        // X축 (시간)
        ctx.beginPath();
        ctx.moveTo(margin.left, margin.top + graphHeight);
        ctx.lineTo(margin.left + graphWidth, margin.top + graphHeight);
        ctx.stroke();
        
        // 그리드 설정
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        
        // 시간 범위 계산 (곡선과 동일하게 통일)
        const currentTimeSeconds = this.elapsedTime ? this.elapsedTime / 1000 : 0;
        const maxTime = Math.max(currentTimeSeconds + 5, 10); // 최소 10초
        const timeStep = maxTime <= 20 ? 2 : maxTime <= 60 ? 5 : 10;
        
        // Y축 범위 계산: 정확한 정렬을 위해 통일된 함수 사용
        const { maxMultiplier } = this.calculateYAxisRange();
        
        // 적응적 스텝 계산
        const multiplierStep = maxMultiplier <= 3 ? 0.5 : maxMultiplier <= 10 ? 1 : maxMultiplier <= 50 ? 5 : 10;
        
        // 세로 그리드 선 (시간)
        for (let t = 0; t <= maxTime; t += timeStep) {
            const x = margin.left + (t / maxTime) * graphWidth;
            
            ctx.beginPath();
            ctx.moveTo(x, margin.top);
            ctx.lineTo(x, margin.top + graphHeight);
            ctx.stroke();
            
            // 시간 레이블
            ctx.fillStyle = '#64748b';
            ctx.font = '12px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(`${t}s`, x, margin.top + graphHeight + 20);
        }
        
        // 가로 그리드 선 (배수) - 1.0x부터 시작, 정확한 위치 계산
        for (let m = 1; m <= maxMultiplier; m += multiplierStep) {
            // Y좌표 계산: 통일된 함수 사용으로 정확한 정렬 보장
            const y = this.calculateYPosition(m, maxMultiplier, margin, graphHeight);
            
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + graphWidth, y);
            ctx.stroke();
            
            // 배수 레이블 (소수점 표시 개선)
            ctx.fillStyle = '#64748b';
            ctx.font = '12px Inter';
            ctx.textAlign = 'right';
            const label = multiplierStep < 1 ? m.toFixed(1) : m.toFixed(m >= 10 ? 0 : 1);
            ctx.fillText(`${label}x`, margin.left - 10, y + 4);
        }
        
        // 축 레이블
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 14px Inter';
        
        // X축 레이블 (시간)
        ctx.textAlign = 'center';
        ctx.fillText('시간 (초)', margin.left + graphWidth / 2, margin.top + graphHeight + 35);
        
        // Y축 레이블 (배수)
        ctx.save();
        ctx.translate(15, margin.top + graphHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('배수', 0, 0);
        ctx.restore();
    }
    
    // 최적화된 배수 곡선 그리기 (Y축 정렬 수정)
    drawMultiplierCurveOptimized(margin, graphWidth, graphHeight) {
        if (this.isDestroyed) return;
        
        const ctx = this.ctx;
        
        // 실시간 시간 계산 (더 정확한 타이밍)
        const now = Date.now();
        if (!this.gameStartTime && this.gameState === 'playing') {
            this.gameStartTime = now - (this.elapsedTime || 0);
        }
        
        // 그리드와 완전 동일한 값 사용 (정확한 정렬을 위해)
        const currentTimeSeconds = this.elapsedTime ? this.elapsedTime / 1000 : 0;
        
        // 시간 범위 계산 (그리드와 완전 동일)
        const maxTime = Math.max(currentTimeSeconds + 5, 10);
        
        // Y축 범위 계산: 통일된 함수 사용으로 정확한 정렬 보장
        const { currentMultiplier, maxMultiplier } = this.calculateYAxisRange();
        
        // 곡선 스타일 설정
        ctx.strokeStyle = this.gameState === 'crashed' ? '#ef4444' : '#10b981';
        ctx.lineWidth = 3;
        ctx.shadowColor = this.gameState === 'crashed' ? 'transparent' : '#10b981';
        ctx.shadowBlur = this.gameState === 'crashed' ? 0 : 8;
        
        // 실시간 부드러운 곡선 그리기
        if (currentTimeSeconds > 0) {
            const path = new Path2D();
            
            // 최적화된 스텝 계산 (성능 고려)
            const steps = Math.min(Math.max(currentTimeSeconds * 20, 40), 150); // 계산량 50% 감소
            
            for (let i = 0; i <= steps; i++) {
                const t = (i / steps) * currentTimeSeconds;
                
                // 서버 데이터 기준 정확한 비례 계산
                const ratio = currentTimeSeconds > 0 ? t / currentTimeSeconds : 0;
                const multiplier = 1.0 + (currentMultiplier - 1.0) * ratio;
                
                const x = margin.left + (t / maxTime) * graphWidth;
                // Y좌표 계산: 통일된 함수 사용으로 정확한 정렬 보장
                const y = this.calculateYPosition(multiplier, maxMultiplier, margin, graphHeight);
                
                if (i === 0) {
                    path.moveTo(x, y);
                } else {
                    path.lineTo(x, y);
                }
            }
            
            ctx.stroke(path);
        }
        
        // 그림자 효과 리셋
        ctx.shadowBlur = 0;
        
        // 현재 포인트 강조 (실시간 위치)
        if (this.gameState === 'playing' && currentTimeSeconds > 0) {
            const currentX = margin.left + (currentTimeSeconds / maxTime) * graphWidth;
            // Y좌표 계산: 통일된 함수 사용으로 정확한 정렬 보장
            const currentY = this.calculateYPosition(currentMultiplier, maxMultiplier, margin, graphHeight);
            
            // 현재 위치 점 (펄싱 애니메이션)
            const pulseSize = 6 + Math.sin(Date.now() / 200) * 2; // 펄싱 효과
            ctx.fillStyle = '#10b981';
            ctx.beginPath();
            ctx.arc(currentX, currentY, pulseSize, 0, Math.PI * 2);
            ctx.fill();
            
            // 더 선명한 외곽선
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(currentX, currentY, pulseSize, 0, Math.PI * 2);
            ctx.stroke();
            
            // 배수 텍스트 (개선된 스타일)
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(currentX - 30, currentY - 30, 60, 22);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(`${currentMultiplier.toFixed(2)}x`, currentX, currentY - 12);
        }
    }
    
    // 최적화된 렌더링 루프 (메모리 누수 방지)
    startRenderLoop() {
        if (this.renderInterval) {
            clearInterval(this.renderInterval);
        }
        
        this.isRenderLoopActive = true;
        
        const renderLoop = () => {
            if (this.isDestroyed || !this.isRenderLoopActive) {
                return; // 정리된 상태면 렌더링 중단
            }
            
            try {
                this.renderOptimized();
            } catch (error) {
                console.error('렌더링 오류:', error);
                this.stopRenderLoop();
                return;
            }
            
            // 다음 프레임 예약
            this.renderAnimationFrame = requestAnimationFrame(renderLoop);
        };
        
        // 첫 프레임 시작
        this.renderAnimationFrame = requestAnimationFrame(renderLoop);
    }
    
    stopRenderLoop() {
        this.isRenderLoopActive = false;
        
        if (this.renderInterval) {
            clearInterval(this.renderInterval);
            this.renderInterval = null;
        }
        
        if (this.renderAnimationFrame) {
            cancelAnimationFrame(this.renderAnimationFrame);
            this.renderAnimationFrame = null;
        }
    }
    
    // 최적화된 렌더링 (메모리 누수 방지)
    renderOptimized() {
        if (!this.ctx || !this.canvas || this.isDestroyed || !this.isRenderLoopActive) {
            return;
        }
        
        // 현재 시간 기반 프레임 제한 (60fps)
        const now = performance.now();
        if (now - this.lastRenderTime < 16.67) {
            return;
        }
        this.lastRenderTime = now;
        
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        const margin = { top: 20, right: 20, bottom: 40, left: 60 };
        const graphWidth = width - margin.left - margin.right;
        const graphHeight = height - margin.top - margin.bottom;
        
        // 배경이 변경되었거나 처음 그릴 때만 배경 다시 그리기
        if (this.isBackgroundDirty) {
            this.drawBackground(width, height, margin, graphWidth, graphHeight);
            this.isBackgroundDirty = false;
        }
        
        // 메인 캔버스 클리어 후 배경 복사
        this.ctx.clearRect(0, 0, width, height);
        this.ctx.drawImage(this.backgroundCanvas, 0, 0);
        
        // 실시간 요소들만 다시 그리기
        if (this.gameState === 'playing' || this.gameState === 'crashed') {
            this.drawMultiplierCurveOptimized(margin, graphWidth, graphHeight);
        }
        
        // 게임 상태별 오버레이
        if (this.gameState === 'betting') {
            this.drawBettingOverlay(width, height);
        }
    }
    
    // 리소스 정리 (메모리 누수 방지)
    destroy() {
        console.log('🗑️ Bustabit 클라이언트 종료 시작...');
        
        // 종료 플래그 설정
        this.isDestroyed = true;
        this.isRenderLoopActive = false;
        
        // 폴링 중단
        this.stopGameStatePolling();
        
        // 렌더링 루프 중단
        this.stopRenderLoop();
        
        // 캔버스 참조 정리
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if (this.backgroundCtx) {
            this.backgroundCtx.clearRect(0, 0, this.backgroundCanvas.width, this.backgroundCanvas.height);
        }
        
        // 이벤트 리스너 정리
        if (typeof window !== 'undefined' && this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
        
        // 차트 데이터 정리
        this.chartData = [];
        
        // 객체 참조 해제
        this.canvas = null;
        this.ctx = null;
        this.backgroundCanvas = null;
        this.backgroundCtx = null;
        this.multiplierDisplay = null;
        this.statusDisplay = null;
        
        console.log('✅ Bustabit 클라이언트 리소스 정리 완료');
    }
}