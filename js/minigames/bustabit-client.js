// Bustabit 게임 클라이언트
class BustabitClient extends MinigameBase {
    constructor() {
        super('bustabit');
        
        // 게임 상태
        this.gameState = 'waiting';
        this.currentMultiplier = 1.00;
        this.currentBet = 0;
        this.hasBet = false;
        this.hasCashedOut = false;
        
        // UI 요소들
        this.canvas = null;
        this.ctx = null;
        this.multiplierDisplay = null;
        this.statusDisplay = null;
        
        // 업데이트 타이머
        this.updateInterval = null;
        
        // 게임 히스토리
        this.gameHistory = [];
        
        console.log('🚀 Bustabit 클라이언트 초기화');
    }
    
    // 게임 UI 초기화
    initGame() {
        this.setupCanvas();
        this.setupUI();
        this.startGameStatePolling();
        this.loadGameHistory();
    }
    
    // 캔버스 설정
    setupCanvas() {
        this.canvas = document.getElementById('bustabit-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.resizeCanvas();
            
            // 윈도우 리사이즈 이벤트
            window.addEventListener('resize', () => {
                this.resizeCanvas();
            });
        }
    }
    
    // 캔버스 크기 조정
    resizeCanvas() {
        if (!this.canvas) return;
        
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        
        // 고해상도 디스플레이 대응
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width *= dpr;
        this.canvas.height *= dpr;
        this.ctx.scale(dpr, dpr);
        this.canvas.style.width = container.clientWidth + 'px';
        this.canvas.style.height = container.clientHeight + 'px';
    }
    
    // UI 이벤트 설정
    setupUI() {
        // 배수 및 상태 표시 요소
        this.multiplierDisplay = document.getElementById('multiplier-display');
        this.statusDisplay = document.getElementById('game-status');
        
        // 베팅 버튼
        const betBtn = document.getElementById('bet-btn');
        if (betBtn) {
            betBtn.addEventListener('click', () => {
                const betAmount = parseInt(document.getElementById('bet-amount')?.value || 0);
                this.placeBet(betAmount);
            });
        }
        
        // 캐시아웃 버튼
        const cashoutBtn = document.getElementById('cashout-btn');
        if (cashoutBtn) {
            cashoutBtn.addEventListener('click', () => {
                this.cashOut();
            });
        }
        
        // 베팅 금액 입력 엔터키 처리
        const betAmountInput = document.getElementById('bet-amount');
        if (betAmountInput) {
            betAmountInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const betAmount = parseInt(e.target.value || 0);
                    this.placeBet(betAmount);
                }
            });
        }
    }
    
    // 게임 상태 폴링 시작
    startGameStatePolling() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        if (this.renderInterval) {
            clearInterval(this.renderInterval);
        }
        
        // 게임 상태는 200ms마다, 렌더링은 16ms마다 (60fps)
        this.updateInterval = setInterval(() => {
            this.updateGameState();
        }, 200);
        
        this.renderInterval = setInterval(() => {
            if (this.gameState === 'playing') {
                this.drawGraph(); // 부드러운 그래프 업데이트
            }
        }, 16); // 60fps
        
        console.log('🔄 게임 상태 폴링 및 렌더링 시작');
    }
    
    // 게임 상태 업데이트
    async updateGameState() {
        try {
            const response = await fetch('/api/minigames/bustabit/state');
            const result = await response.json();
            
            if (result.success) {
                this.processGameState(result.gameState);
            }
        } catch (error) {
            console.warn('게임 상태 업데이트 실패:', error);
        }
    }
    
    // 게임 상태 처리
    processGameState(gameState) {
        const prevState = this.gameState;
        this.gameState = gameState.gameState;
        this.currentMultiplier = gameState.currentMultiplier;
        this.bettingCountdown = gameState.bettingCountdown;
        this.waitingCountdown = gameState.waitingCountdown;
        this.elapsedTime = gameState.elapsedTime;
        this.playerCount = gameState.playerCount;
        
        // 상태 변경 시 UI 업데이트
        if (prevState !== this.gameState) {
            this.onGameStateChanged(prevState, this.gameState);
        }
        
        // UI 업데이트
        this.updateMultiplierDisplay();
        this.updateStatusDisplay();
        this.updateCountdownDisplay();
        this.updatePlayersDisplay(gameState.players);
        this.drawGraph();
        
        // 게임 종료 시 히스토리 업데이트
        if (this.gameState === 'crashed' && prevState === 'playing') {
            this.loadGameHistory();
            this.resetPlayerState();
            
            // 크래시 포인트 표시
            if (gameState.crashPoint) {
                this.showNotification(`💥 ${gameState.crashPoint.toFixed(2)}x에서 크래시!`, 'error');
            }
        }
    }
    
    // 게임 상태 변경 이벤트
    onGameStateChanged(prevState, newState) {
        console.log(`🎮 게임 상태 변경: ${prevState} → ${newState}`);
        
        switch (newState) {
            case 'betting':
                this.onBettingPhase();
                break;
            case 'playing':
                this.onPlayingPhase();
                break;
            case 'crashed':
                this.onCrashedPhase();
                break;
            case 'waiting':
                this.onWaitingPhase();
                break;
        }
    }
    
    // 베팅 단계
    onBettingPhase() {
        this.enableBetting();
        this.disableCashout();
        this.showNotification('베팅 시간입니다!', 'info');
    }
    
    // 게임 플레이 단계
    onPlayingPhase() {
        this.disableBetting();
        
        console.log(`🎮 플레이 단계 진입: hasBet=${this.hasBet}, hasCashedOut=${this.hasCashedOut}`);
        
        // 베팅한 사용자만 캐시아웃 가능
        if (this.hasBet && !this.hasCashedOut) {
            this.enableCashout();
            this.showNotification('🚀 게임 시작! 캐시아웃 타이밍을 잡아보세요!', 'success');
            console.log('✅ 캐시아웃 버튼 활성화됨');
        } else {
            this.disableCashout();
            this.showNotification('🚀 게임 시작! 다음 라운드에 베팅해보세요!', 'info');
            console.log('❌ 캐시아웃 버튼 비활성화 상태 유지');
        }
    }
    
    // 크래시 단계
    onCrashedPhase() {
        this.disableCashout();
        this.disableBetting();
        
        // 사용자별 결과 메시지
        if (this.hasBet) {
            if (this.hasCashedOut) {
                this.showNotification(`🎉 성공! ${this.currentMultiplier.toFixed(2)}x에서 캐시아웃!`, 'success');
            } else {
                this.showNotification(`💥 ${this.currentMultiplier.toFixed(2)}x에서 크래시! 아쉬워요!`, 'error');
            }
        }
    }
    
    // 대기 단계
    onWaitingPhase() {
        this.disableAllButtons();
        this.resetPlayerState();
        if (this.waitingCountdown > 0) {
            this.showNotification(`⏳ 다음 라운드까지 ${this.waitingCountdown}초`, 'info');
        }
    }
    
    // 베팅하기
    async placeBet(amount) {
        if (this.gameState !== 'betting') {
            this.showError('베팅 시간이 아닙니다');
            return;
        }
        
        if (this.hasBet) {
            this.showError('이미 베팅하셨습니다');
            return;
        }
        
        // 클라이언트 검증
        const validation = await MinigameGamIntegration.quickBetValidation(amount, 'bustabit');
        if (!validation.valid) {
            this.showError(validation.message);
            return;
        }
        
        try {
            const token = localStorage.getItem('yegame-token');
            const response = await fetch('/api/minigames/bustabit/bet', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ betAmount: amount })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.currentBet = amount;
                this.hasBet = true;
                this.userBalance = result.newBalance;
                
                this.updateBalanceDisplay();
                this.updateCurrentBetDisplay();
                this.disableBetting();
                
                // 게임이 이미 시작되었다면 즉시 캐시아웃 활성화
                if (this.gameState === 'playing') {
                    this.enableCashout();
                }
                
                this.showSuccess(`${amount} GAM 베팅 완료!`);
                console.log(`✅ 베팅 성공: ${amount} GAM`);
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            console.error('베팅 실패:', error);
            this.showError('베팅 중 오류가 발생했습니다');
        }
    }
    
    // 캐시아웃하기
    async cashOut() {
        if (this.gameState !== 'playing') {
            this.showError('캐시아웃할 수 없는 상태입니다');
            return;
        }
        
        if (!this.hasBet) {
            this.showError('베팅하지 않으셨습니다');
            return;
        }
        
        if (this.hasCashedOut) {
            this.showError('이미 캐시아웃하셨습니다');
            return;
        }
        
        try {
            const token = localStorage.getItem('yegame-token');
            const response = await fetch('/api/minigames/bustabit/cashout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.hasCashedOut = true;
                this.userBalance = result.newBalance;
                this.cashoutMultiplier = result.multiplier;
                this.payoutAmount = result.payout;
                
                this.updateBalanceDisplay();
                this.disableCashout();
                
                this.showSuccess(`🎉 ${result.multiplier.toFixed(2)}x 캐시아웃! +${result.payout.toLocaleString()} GAM`);
                console.log(`💰 캐시아웃 성공: ${result.multiplier.toFixed(2)}x, ${result.payout} GAM`);
                
                // UI에 캐시아웃 상태 표시
                this.updateCurrentBetDisplay();
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            console.error('캐시아웃 실패:', error);
            this.showError('캐시아웃 중 오류가 발생했습니다');
        }
    }
    
    // 배수 표시 업데이트
    updateMultiplierDisplay() {
        if (this.multiplierDisplay) {
            const multiplierText = this.currentMultiplier.toFixed(2) + 'x';
            this.multiplierDisplay.textContent = multiplierText;
            
            // 배수에 따른 색상 변경
            this.multiplierDisplay.className = 'multiplier-display text-white';
            if (this.currentMultiplier >= 10) {
                this.multiplierDisplay.classList.add('high-multiplier');
            } else if (this.currentMultiplier >= 5) {
                this.multiplierDisplay.classList.add('medium-multiplier');
            } else {
                this.multiplierDisplay.classList.add('low-multiplier');
            }
        }
    }
    
    // 상태 표시 업데이트
    updateStatusDisplay() {
        if (!this.statusDisplay) return;
        
        let statusText = '';
        let statusClass = this.gameState;
        
        switch (this.gameState) {
            case 'waiting':
                if (this.waitingCountdown > 0) {
                    statusText = `다음 라운드까지 ${this.waitingCountdown}초`;
                } else {
                    statusText = '새 게임 준비 중...';
                }
                break;
            case 'betting':
                if (this.bettingCountdown > 0) {
                    statusText = `베팅 시간 ${this.bettingCountdown}초`;
                } else {
                    statusText = '베팅 마감!';
                }
                break;
            case 'playing':
                statusText = '🚀 게임 진행 중';
                break;
            case 'crashed':
                statusText = '💥 크래시!';
                break;
            default:
                statusText = '알 수 없음';
        }
        
        this.statusDisplay.textContent = statusText;
        this.statusDisplay.className = `game-status ${statusClass}`;
    }
    
    // 카운트다운 표시 업데이트
    updateCountdownDisplay() {
        // 베팅 시간 카운트다운은 statusDisplay에서 처리됨
        // 추가적인 카운트다운 UI가 필요하면 여기에 구현
    }
    
    // 현재 베팅 표시 업데이트
    updateCurrentBetDisplay() {
        const currentBetElement = document.getElementById('current-bet');
        if (currentBetElement) {
            if (this.hasBet) {
                if (this.hasCashedOut) {
                    currentBetElement.innerHTML = `
                        <span style="color: #10b981;">${GAMFormatter.format(this.currentBet)} (캐시아웃: ${this.cashoutMultiplier.toFixed(2)}x)</span>
                    `;
                } else {
                    currentBetElement.innerHTML = `
                        <span style="color: #f59e0b;">${GAMFormatter.format(this.currentBet)} (진행 중)</span>
                    `;
                }
            } else {
                currentBetElement.textContent = '0 GAM';
            }
        }
    }
    
    // 플레이어 목록 업데이트
    updatePlayersDisplay(players) {
        const playersContainer = document.getElementById('players-container');
        if (!playersContainer || !players) return;
        
        playersContainer.innerHTML = players.map(player => {
            let statusIcon = '⏳';
            let statusText = '베팅 중';
            
            if (player.cashedOut) {
                statusIcon = '💰';
                statusText = `${player.cashoutMultiplier.toFixed(2)}x`;
            } else if (this.gameState === 'crashed') {
                statusIcon = '💥';
                statusText = '크래시';
            }
            
            return `
                <div class="player-item">
                    <span class="player-name">${player.username}</span>
                    <span class="player-bet">${GAMFormatter.format(player.betAmount)}</span>
                    <span class="player-status">${statusIcon} ${statusText}</span>
                </div>
            `;
        }).join('');
    }
    
    // 그래프 그리기
    drawGraph() {
        if (!this.ctx || !this.canvas) return;
        
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        // 캔버스 클리어
        this.ctx.clearRect(0, 0, width, height);
        
        // 배경
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, width, height);
        
        // 마진 설정 (축 레이블 공간)
        const margin = { top: 20, right: 20, bottom: 40, left: 60 };
        const graphWidth = width - margin.left - margin.right;
        const graphHeight = height - margin.top - margin.bottom;
        
        // 그리드와 축
        this.drawAxesAndGrid(margin, graphWidth, graphHeight);
        
        // 배수 곡선
        if (this.gameState === 'playing' || this.gameState === 'crashed') {
            this.drawMultiplierCurve(margin, graphWidth, graphHeight);
        }
        
        // 게임 상태별 오버레이
        if (this.gameState === 'betting') {
            this.drawBettingOverlay(width, height);
        }
    }
    
    // 축과 그리드 그리기
    drawAxesAndGrid(margin, graphWidth, graphHeight) {
        const ctx = this.ctx;
        
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
        
        // 시간 범위 계산 (0초부터 현재 경과 시간 + 여유분)
        const maxTime = Math.max(this.elapsedTime / 1000 + 5, 10); // 최소 10초
        const timeStep = maxTime <= 20 ? 2 : maxTime <= 60 ? 5 : 10;
        
        // 배수 범위 계산
        const maxMultiplier = Math.max(this.currentMultiplier * 1.5, 5);
        const multiplierStep = maxMultiplier <= 10 ? 1 : maxMultiplier <= 50 ? 5 : 10;
        
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
        
        // 가로 그리드 선 (배수)
        for (let m = 1; m <= maxMultiplier; m += multiplierStep) {
            const y = margin.top + graphHeight - ((m - 1) / (maxMultiplier - 1)) * graphHeight;
            
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + graphWidth, y);
            ctx.stroke();
            
            // 배수 레이블
            ctx.fillStyle = '#64748b';
            ctx.font = '12px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(`${m.toFixed(m >= 10 ? 0 : 1)}x`, margin.left - 10, y + 4);
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
    
    // 배수 곡선 그리기 (개선된 버전)
    drawMultiplierCurve(margin, graphWidth, graphHeight) {
        if (this.currentMultiplier <= 1 || this.elapsedTime <= 0) return;
        
        const ctx = this.ctx;
        const currentTimeSeconds = this.elapsedTime / 1000;
        const maxTime = Math.max(currentTimeSeconds + 5, 10);
        const maxMultiplier = Math.max(this.currentMultiplier * 1.5, 5);
        
        // 곡선 색상 (게임 상태에 따라)
        ctx.strokeStyle = this.gameState === 'crashed' ? '#ef4444' : '#10b981';
        ctx.lineWidth = 3;
        ctx.lineShadow = this.gameState === 'crashed' ? 'none' : '0 0 10px rgba(16, 185, 129, 0.5)';
        
        ctx.beginPath();
        
        const steps = Math.min(currentTimeSeconds * 20, 200); // 더 부드러운 곡선
        
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * currentTimeSeconds;
            const multiplier = Math.pow(Math.E, 0.06 * t); // 실제 bustabit 스타일
            
            const x = margin.left + (t / maxTime) * graphWidth;
            const y = margin.top + graphHeight - ((multiplier - 1) / (maxMultiplier - 1)) * graphHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // 현재 포인트 강조
        if (this.gameState === 'playing') {
            const currentX = margin.left + (currentTimeSeconds / maxTime) * graphWidth;
            const currentY = margin.top + graphHeight - ((this.currentMultiplier - 1) / (maxMultiplier - 1)) * graphHeight;
            
            ctx.fillStyle = '#10b981';
            ctx.beginPath();
            ctx.arc(currentX, currentY, 6, 0, Math.PI * 2);
            ctx.fill();
            
            // 현재 배수 텍스트
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(`${this.currentMultiplier.toFixed(2)}x`, currentX, currentY - 15);
        }
    }
    
    // 베팅 중 오버레이
    drawBettingOverlay(width, height) {
        const ctx = this.ctx;
        
        // 반투명 오버레이
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);
        
        // 베팅 중 텍스트
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 32px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('베팅 중...', width / 2, height / 2 - 20);
        
        // 카운트다운
        if (this.bettingCountdown > 0) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px Inter';
            ctx.fillText(`${this.bettingCountdown}초`, width / 2, height / 2 + 20);
        }
    }
    
    // 게임 히스토리 로드
    async loadGameHistory() {
        try {
            const response = await fetch('/api/minigames/bustabit/history?limit=10');
            const result = await response.json();
            
            if (result.success) {
                this.gameHistory = result.history;
                this.updateHistoryDisplay();
            }
        } catch (error) {
            console.warn('히스토리 로드 실패:', error);
        }
    }
    
    // 히스토리 표시 업데이트
    updateHistoryDisplay() {
        const historyContainer = document.getElementById('game-history');
        if (!historyContainer) return;
        
        historyContainer.innerHTML = this.gameHistory.map(game => {
            let cssClass = 'history-item low';
            if (game.crashPoint >= 5.0) cssClass = 'history-item high';
            else if (game.crashPoint >= 2.0) cssClass = 'history-item medium';
            
            return `<div class="${cssClass}">${game.crashPoint.toFixed(2)}x</div>`;
        }).join('');
    }
    
    // 버튼 상태 관리
    enableBetting() {
        const betBtn = document.getElementById('bet-btn');
        if (betBtn) {
            betBtn.disabled = false;
            betBtn.style.opacity = '1';
            betBtn.style.cursor = 'pointer';
            console.log('✅ 베팅 버튼 활성화');
        } else {
            console.error('❌ 베팅 버튼을 찾을 수 없음');
        }
    }
    
    disableBetting() {
        const betBtn = document.getElementById('bet-btn');
        if (betBtn) {
            betBtn.disabled = true;
            betBtn.style.opacity = '0.5';
            betBtn.style.cursor = 'not-allowed';
            console.log('🚫 베팅 버튼 비활성화');
        }
    }
    
    enableCashout() {
        const cashoutBtn = document.getElementById('cashout-btn');
        if (cashoutBtn) {
            cashoutBtn.disabled = false;
            cashoutBtn.style.opacity = '1';
            cashoutBtn.style.cursor = 'pointer';
            cashoutBtn.style.backgroundColor = '#10b981';
            console.log('✅ 캐시아웃 버튼 활성화');
        } else {
            console.error('❌ 캐시아웃 버튼을 찾을 수 없음');
        }
    }
    
    disableCashout() {
        const cashoutBtn = document.getElementById('cashout-btn');
        if (cashoutBtn) {
            cashoutBtn.disabled = true;
            cashoutBtn.style.opacity = '0.5';
            cashoutBtn.style.cursor = 'not-allowed';
            cashoutBtn.style.backgroundColor = '#6b7280';
            console.log('🚫 캐시아웃 버튼 비활성화');
        }
    }
    
    disableAllButtons() {
        this.disableBetting();
        this.disableCashout();
    }
    
    // 플레이어 상태 리셋
    resetPlayerState() {
        this.currentBet = 0;
        this.hasBet = false;
        this.hasCashedOut = false;
        this.updateCurrentBetDisplay();
    }
    
    // 정리
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        if (this.renderInterval) {
            clearInterval(this.renderInterval);
            this.renderInterval = null;
        }
        
        super.destroy();
        console.log('🗑️ Bustabit 클라이언트 정리 완료');
    }
}

// 전역으로 노출
window.BustabitClient = BustabitClient;

console.log('✅ Bustabit 클라이언트 로드 완료');