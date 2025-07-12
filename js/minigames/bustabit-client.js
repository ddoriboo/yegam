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
        
        this.updateInterval = setInterval(() => {
            this.updateGameState();
        }, 200); // 200ms마다 업데이트
        
        console.log('🔄 게임 상태 폴링 시작');
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
        
        // 상태 변경 시 UI 업데이트
        if (prevState !== this.gameState) {
            this.onGameStateChanged(prevState, this.gameState);
        }
        
        // UI 업데이트
        this.updateMultiplierDisplay();
        this.updateStatusDisplay();
        this.updatePlayersDisplay(gameState.players);
        this.drawGraph();
        
        // 게임 종료 시 히스토리 업데이트
        if (this.gameState === 'crashed' && prevState === 'playing') {
            this.loadGameHistory();
            this.resetPlayerState();
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
        this.showNotification('베팅 시간입니다!', 'info');
    }
    
    // 게임 플레이 단계
    onPlayingPhase() {
        this.disableBetting();
        if (this.hasBet && !this.hasCashedOut) {
            this.enableCashout();
        }
        this.showNotification('게임 시작! 언제 캐시아웃하실건가요?', 'success');
    }
    
    // 크래시 단계
    onCrashedPhase() {
        this.disableCashout();
        this.showNotification(`💥 ${this.currentMultiplier.toFixed(2)}x에서 크래시!`, 'error');
    }
    
    // 대기 단계
    onWaitingPhase() {
        this.disableAllButtons();
        this.showNotification('새 게임을 기다리는 중...', 'info');
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
                
                this.updateBalanceDisplay();
                this.disableCashout();
                
                this.showSuccess(`🎉 ${result.multiplier.toFixed(2)}x 캐시아웃! +${result.payout} GAM`);
                console.log(`💰 캐시아웃 성공: ${result.multiplier.toFixed(2)}x, ${result.payout} GAM`);
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
        
        const statusMessages = {
            'waiting': '새 게임 대기 중...',
            'betting': '베팅 시간',
            'playing': '게임 진행 중',
            'crashed': '게임 종료'
        };
        
        this.statusDisplay.textContent = statusMessages[this.gameState] || '알 수 없음';
        this.statusDisplay.className = `game-status ${this.gameState}`;
    }
    
    // 현재 베팅 표시 업데이트
    updateCurrentBetDisplay() {
        const currentBetElement = document.getElementById('current-bet');
        if (currentBetElement) {
            currentBetElement.textContent = this.hasBet ? GAMFormatter.format(this.currentBet) : '0 GAM';
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
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, width, height);
        
        // 그리드
        this.drawGrid(width, height);
        
        // 배수 곡선
        if (this.gameState === 'playing' || this.gameState === 'crashed') {
            this.drawMultiplierCurve(width, height);
        }
        
        // 배수 텍스트
        this.drawMultiplierText(width, height);
    }
    
    // 그리드 그리기
    drawGrid(width, height) {
        this.ctx.strokeStyle = '#2a2a40';
        this.ctx.lineWidth = 1;
        
        // 세로선
        for (let x = 0; x < width; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }
        
        // 가로선
        for (let y = 0; y < height; y += 30) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, height - y);
            this.ctx.lineTo(width, height - y);
            this.ctx.stroke();
        }
    }
    
    // 배수 곡선 그리기
    drawMultiplierCurve(width, height) {
        if (this.currentMultiplier <= 1) return;
        
        this.ctx.strokeStyle = this.gameState === 'crashed' ? '#ef4444' : '#10b981';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        
        const maxMultiplier = Math.max(this.currentMultiplier * 1.2, 5);
        const steps = 100;
        
        for (let i = 0; i <= steps; i++) {
            const progress = i / steps;
            const x = progress * width;
            
            // 현재 시점까지만 그리기
            const currentProgress = Math.min(progress, this.currentMultiplier / maxMultiplier);
            const multiplier = 1 + (currentProgress * (maxMultiplier - 1));
            
            if (multiplier > this.currentMultiplier) break;
            
            const y = height - (multiplier - 1) / (maxMultiplier - 1) * height * 0.8;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.stroke();
    }
    
    // 배수 텍스트 그리기
    drawMultiplierText(width, height) {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const text = this.currentMultiplier.toFixed(2) + 'x';
        this.ctx.fillText(text, width / 2, height / 2);
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
        if (betBtn) betBtn.disabled = false;
    }
    
    disableBetting() {
        const betBtn = document.getElementById('bet-btn');
        if (betBtn) betBtn.disabled = true;
    }
    
    enableCashout() {
        const cashoutBtn = document.getElementById('cashout-btn');
        if (cashoutBtn) cashoutBtn.disabled = false;
    }
    
    disableCashout() {
        const cashoutBtn = document.getElementById('cashout-btn');
        if (cashoutBtn) cashoutBtn.disabled = true;
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
        
        super.destroy();
        console.log('🗑️ Bustabit 클라이언트 정리 완료');
    }
}

// 전역으로 노출
window.BustabitClient = BustabitClient;

console.log('✅ Bustabit 클라이언트 로드 완료');