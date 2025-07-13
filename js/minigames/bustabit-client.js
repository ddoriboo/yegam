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
        
        // 게임 히스토리 (메모리 제한)
        this.gameHistory = [];
        this.maxHistorySize = 50;
        
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
    
    // Y좌표 계산 함수 (모든 곳에서 동일하게 사용, 1.0x = 하단 기준)
    calculateYPosition(multiplier, maxMultiplier, margin, graphHeight) {
        // 1.0x가 정확히 하단에 오도록 계산
        if (multiplier <= 1.0) {
            return margin.top + graphHeight; // 1.0x는 정확히 하단
        }
        
        const normalizedPosition = (multiplier - 1.0) / (maxMultiplier - 1.0);
        return margin.top + graphHeight - (normalizedPosition * graphHeight);
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
            
            // 오프스크린 캔버스 생성 (배경용)
            this.backgroundCanvas = document.createElement('canvas');
            this.backgroundCtx = this.backgroundCanvas.getContext('2d');
            
            this.resizeCanvas();
            
            // 윈도우 리사이즈 이벤트
            window.addEventListener('resize', () => {
                this.resizeCanvas();
                this.isBackgroundDirty = true; // 배경 다시 그리기 필요
            });
        }
    }
    
    // 캔버스 크기 조정
    resizeCanvas() {
        if (!this.canvas) return;
        
        const container = this.canvas.parentElement;
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        // 고해상도 디스플레이 대응
        const dpr = window.devicePixelRatio || 1;
        
        // 메인 캔버스 설정
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.ctx.scale(dpr, dpr);
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        
        // 배경 캔버스도 같은 크기로 설정
        if (this.backgroundCanvas) {
            this.backgroundCanvas.width = width * dpr;
            this.backgroundCanvas.height = height * dpr;
            this.backgroundCtx.scale(dpr, dpr);
        }
        
        // 렌더링 성능 최적화 설정
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        if (this.backgroundCtx) {
            this.backgroundCtx.imageSmoothingEnabled = true;
            this.backgroundCtx.imageSmoothingQuality = 'high';
        }
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
        
        // 게임 상태 폴링 (적응적 간격)
        this.startPolling();
        
        // 렌더링은 requestAnimationFrame 사용 (더 부드러운 60fps)
        this.startRenderLoop();
        
        console.log('🔄 게임 상태 폴링 및 최적화된 렌더링 시작');
    }
    
    // 최적화된 렌더링 루프 (메모리 누수 방지)
    startRenderLoop() {
        // 이미 실행 중이면 중복 실행 방지
        if (this.renderRequestId) {
            cancelAnimationFrame(this.renderRequestId);
        }
        
        this.isRenderLoopActive = true;
        
        const renderFrame = (currentTime) => {
            // 클라이언트가 파괴되었거나 비활성화되면 렌더링 중지
            if (!this.isRenderLoopActive || this.isDestroyed) {
                return;
            }
            
            // 항상 부드러운 60fps 렌더링 (게임 중일 때는 실시간 업데이트)
            if (this.gameState === 'playing') {
                this.updateMultiplierDisplay(); // 실시간 배수 계산
                this.optimizedDrawGraph(); // 부드러운 곡선 그리기
            } else {
                // 다른 상태에서도 기본 렌더링
                this.optimizedDrawGraph();
            }
            
            // 연속 렌더링 (부드러운 애니메이션)
            if (this.isRenderLoopActive && !this.isDestroyed) {
                this.renderRequestId = requestAnimationFrame(renderFrame);
            }
        };
        
        this.renderRequestId = requestAnimationFrame(renderFrame);
    }
    
    // 적응적 폴링 시스템 (메모리 누수 방지)
    startPolling() {
        // 기존 폴링 중지
        if (this.updateInterval) {
            clearTimeout(this.updateInterval);
        }
        
        this.pollingInterval = 200;
        this.consecutiveErrors = 0;
        this.maxErrors = 3;
        this.isPollingActive = true;
        
        const poll = async () => {
            // 클라이언트가 파괴되었거나 비활성화되면 폴링 중지
            if (!this.isPollingActive || this.isDestroyed) {
                return;
            }
            
            try {
                await this.updateGameState();
                
                // 성공 시 간격 초기화
                this.consecutiveErrors = 0;
                this.pollingInterval = this.gameState === 'playing' ? 150 : 250; // 적당한 간격
                
                // 안전한 재귀 호출
                if (this.isPollingActive && !this.isDestroyed) {
                    this.updateInterval = setTimeout(poll, this.pollingInterval);
                }
            } catch (error) {
                this.consecutiveErrors++;
                console.warn(`게임 상태 업데이트 실패 (${this.consecutiveErrors}/${this.maxErrors}):`, error);
                
                // 오류가 많이 발생하면 성능 모드 활성화
                if (this.consecutiveErrors >= this.maxErrors) {
                    this.performanceMode = true; // 성능 모드 활성화
                    console.warn('성능 모드 활성화 - 리소스 사용량 감소');
                }
                
                // 지수 백오프 적용
                this.pollingInterval = Math.min(this.pollingInterval * 2, 5000);
                
                if (this.consecutiveErrors < this.maxErrors && this.isPollingActive && !this.isDestroyed) {
                    this.updateInterval = setTimeout(poll, this.pollingInterval);
                } else if (this.consecutiveErrors >= this.maxErrors) {
                    console.error('서버 연결 실패가 지속됩니다. 재연결을 시도합니다.');
                    this.handleConnectionFailure();
                }
            }
        };
        
        poll();
    }
    
    // 게임 상태 업데이트
    async updateGameState() {
        const response = await fetch('/api/minigames/bustabit/state');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || '게임 상태 조회 실패');
        }
        
        this.processGameState(result.gameState);
    }
    
    // 연결 실패 처리
    handleConnectionFailure() {
        this.showError('서버와의 연결이 불안정합니다. 잠시 후 다시 시도해주세요.');
        
        // 5초 후 재연결 시도
        setTimeout(() => {
            this.consecutiveErrors = 0;
            this.pollingInterval = 200;
            this.startPolling();
        }, 5000);
    }
    
    // 게임 상태 처리
    processGameState(gameState) {
        const prevState = this.gameState;
        const prevMultiplier = this.currentMultiplier;
        
        this.gameState = gameState.gameState;
        this.currentMultiplier = gameState.currentMultiplier;
        this.bettingCountdown = gameState.bettingCountdown;
        this.waitingCountdown = gameState.waitingCountdown;
        this.elapsedTime = gameState.elapsedTime;
        this.playerCount = gameState.playerCount;
        
        // 게임 플레이 중에만 차트 데이터 수집
        if (this.gameState === 'playing' && this.elapsedTime > 0) {
            this.addChartDataPoint(this.elapsedTime / 1000, this.currentMultiplier);
        }
        
        // 상태 변경 시 UI 업데이트 및 배경 다시 그리기
        if (prevState !== this.gameState) {
            this.onGameStateChanged(prevState, this.gameState);
            this.isBackgroundDirty = true; // 상태 변경 시 배경 새로고침
            
            // 렌더링 최적화 플래그 초기화
            if (this.gameState === 'playing') {
                this.crashRendered = false;
            } else if (this.gameState === 'betting') {
                this.lastBettingCountdown = null;
            }
        }
        
        // 새 게임 시작 시 차트 데이터 초기화
        if (this.gameState === 'betting' && prevState !== 'betting') {
            this.chartData = [];
            this.gameStartTime = null; // 게임 시작 시간 리셋
            this.isBackgroundDirty = true;
        }
        
        // UI 업데이트 (그래프는 렌더링 루프에서 처리)
        this.updateMultiplierDisplay();
        this.updateStatusDisplay();
        this.updateCountdownDisplay();
        this.updatePlayersDisplay(gameState.players);
        
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
    
    // 차트 데이터 포인트 추가
    addChartDataPoint(time, multiplier) {
        this.chartData.push({ time, multiplier });
        
        // 데이터 포인트 수 제한 (성능 최적화)
        if (this.chartData.length > this.maxDataPoints) {
            this.chartData.shift(); // 오래된 데이터 제거
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
    
    // 배수 표시 업데이트 (실시간 보간 적용)
    updateMultiplierDisplay() {
        if (this.multiplierDisplay) {
            let displayMultiplier = this.currentMultiplier;
            
            // 게임 중일 때 실시간 계산된 배수 사용 (부드러운 애니메이션)
            if (this.gameState === 'playing' && this.gameStartTime) {
                const now = Date.now();
                const currentTimeSeconds = (now - this.gameStartTime) / 1000;
                displayMultiplier = Math.pow(Math.E, 0.06 * currentTimeSeconds);
                
                // 실제 배수 업데이트 (곡선 그리기용)
                this.currentMultiplier = displayMultiplier;
                this.elapsedTime = now - this.gameStartTime;
            }
            
            const multiplierText = displayMultiplier.toFixed(2) + 'x';
            this.multiplierDisplay.textContent = multiplierText;
            
            // 배수에 따른 색상 변경
            this.multiplierDisplay.className = 'multiplier-display text-white';
            if (displayMultiplier >= 10) {
                this.multiplierDisplay.classList.add('high-multiplier');
            } else if (displayMultiplier >= 5) {
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
    
    // 최적화된 그래프 그리기 (메인 메서드, 메모리 누수 방지)
    optimizedDrawGraph() {
        if (!this.ctx || !this.canvas || this.isDestroyed || !this.isRenderLoopActive) {
            return;
        }
        
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
    
    // 배경 요소 그리기 (캐싱됨)
    drawBackground(width, height, margin, graphWidth, graphHeight) {
        if (!this.backgroundCtx) return;
        
        // 배경 캔버스 클리어
        this.backgroundCtx.clearRect(0, 0, width, height);
        
        // 배경색
        this.backgroundCtx.fillStyle = '#0f172a';
        this.backgroundCtx.fillRect(0, 0, width, height);
        
        // 그리드와 축 (정적 요소)
        this.drawAxesAndGridToContext(this.backgroundCtx, margin, graphWidth, graphHeight);
    }
    
    // 기존 그래프 그리기 (호환성 유지)
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
        this.drawAxesAndGridToContext(this.ctx, margin, graphWidth, graphHeight);
        
        // 배수 곡선
        if (this.gameState === 'playing' || this.gameState === 'crashed') {
            this.drawMultiplierCurve(margin, graphWidth, graphHeight);
        }
        
        // 게임 상태별 오버레이
        if (this.gameState === 'betting') {
            this.drawBettingOverlay(width, height);
        }
    }
    
    // 축과 그리드 그리기 (컨텍스트 지정 가능)
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
        // 1.0x는 항상 표시하고, 그 이후는 스텝에 따라
        const gridMultipliers = [1.0]; // 1.0x는 항상 포함
        for (let m = 1 + multiplierStep; m <= maxMultiplier; m += multiplierStep) {
            gridMultipliers.push(m);
        }
        
        gridMultipliers.forEach(m => {
            // Y좌표 계산: 통일된 함수 사용으로 정확한 정렬 보장
            const y = this.calculateYPosition(m, maxMultiplier, margin, graphHeight);
            
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + graphWidth, y);
            ctx.stroke();
            
            // 배수 레이블 (1.0x는 항상 표시)
            ctx.fillStyle = '#64748b';
            ctx.font = '12px Inter';
            ctx.textAlign = 'right';
            const label = m === 1.0 ? '1.0' : (multiplierStep < 1 ? m.toFixed(1) : m.toFixed(m >= 10 ? 0 : 1));
            ctx.fillText(`${label}x`, margin.left - 10, y + 4);
        });
        
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
        
        // Y축 범위 계산 (최적화된 함수와 동일한 로직)
        const currentMultiplier = this.currentMultiplier || 1.0;
        let maxMultiplier;
        if (currentMultiplier <= 1.1) {
            maxMultiplier = 2;
        } else if (currentMultiplier <= 2) {
            maxMultiplier = Math.max(3, currentMultiplier * 1.5);
        } else if (currentMultiplier <= 5) {
            maxMultiplier = Math.max(currentMultiplier + 2, currentMultiplier * 1.4);
        } else if (currentMultiplier <= 10) {
            maxMultiplier = currentMultiplier * 1.3;
        } else {
            maxMultiplier = currentMultiplier * 1.2;
        }
        maxMultiplier = Math.ceil(maxMultiplier * 2) / 2;
        
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
            // Y좌표 계산: 정확한 정렬을 위해 통일된 공식 사용
            const normalizedPosition = (multiplier - 1) / (maxMultiplier - 1);
            const y = margin.top + graphHeight - (normalizedPosition * graphHeight);
            
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
            // Y좌표 계산: 통일된 공식 사용
            const normalizedPosition = (this.currentMultiplier - 1) / (maxMultiplier - 1);
            const currentY = margin.top + graphHeight - (normalizedPosition * graphHeight);
            
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
    
    // 최적화된 배수 곡선 그리기 (실시간 보간 적용)
    drawMultiplierCurveOptimized(margin, graphWidth, graphHeight) {
        const ctx = this.ctx;
        
        // 실시간 시간 계산 (더 정확한 타이밍)
        const now = Date.now();
        if (!this.gameStartTime && this.gameState === 'playing') {
            this.gameStartTime = now - (this.elapsedTime || 0);
        }
        
        // 그리드와 완전 동일한 값 사용 (정확한 정렬을 위해)
        const currentTimeSeconds = this.elapsedTime ? this.elapsedTime / 1000 : 0;
        const currentMultiplier = this.currentMultiplier || 1.0;
        
        // 시간 범위 계산 (그리드와 완전 동일)
        const maxTime = Math.max(currentTimeSeconds + 5, 10);
        
        // Y축 범위 계산: 통일된 함수 사용으로 정확한 정렬 보장
        const { maxMultiplier } = this.calculateYAxisRange();
        
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
                
                // 실제 Bustabit 공식 사용 (부드러운 실시간 곡선)
                const multiplier = Math.pow(Math.E, 0.06 * t);
                
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
            // 실시간 배수 계산 (정확한 현재 위치)
            const realTimeMultiplier = Math.pow(Math.E, 0.06 * currentTimeSeconds);
            const currentY = this.calculateYPosition(realTimeMultiplier, maxMultiplier, margin, graphHeight);
            
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
            ctx.fillText(`${realTimeMultiplier.toFixed(2)}x`, currentX, currentY - 12);
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
    
    // 완전한 리소스 정리 (메모리 누수 방지)
    destroy() {
        console.log('🗑️ Bustabit 클라이언트 종료 시작...');
        
        // 종료 플래그 설정
        this.isDestroyed = true;
        this.isRenderLoopActive = false;
        this.isPollingActive = false;
        this.performanceMode = true; // 완전 종료 시 성능 모드
        
        // 타이머 정리
        if (this.updateInterval) {
            clearTimeout(this.updateInterval);
            this.updateInterval = null;
        }
        
        if (this.renderInterval) {
            clearInterval(this.renderInterval);
            this.renderInterval = null;
        }
        
        if (this.renderRequestId) {
            cancelAnimationFrame(this.renderRequestId);
            this.renderRequestId = null;
        }
        
        if (this.renderAnimationFrame) {
            cancelAnimationFrame(this.renderAnimationFrame);
            this.renderAnimationFrame = null;
        }
        
        // 캔버스 메모리 정리
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
        
        // 데이터 정리
        this.chartData = [];
        this.gameHistory = [];
        
        // 객체 참조 해제
        this.canvas = null;
        this.ctx = null;
        this.backgroundCanvas = null;
        this.backgroundCtx = null;
        this.multiplierDisplay = null;
        this.statusDisplay = null;
        
        // 상태 리셋
        this.gameState = 'waiting';
        this.currentMultiplier = 1.00;
        this.gameStartTime = null;
        this.consecutiveErrors = 0;
        
        super.destroy();
        console.log('✅ Bustabit 클라이언트 리소스 정리 완료');
    }
}

// 전역으로 노출
window.BustabitClient = BustabitClient;

console.log('✅ Bustabit 클라이언트 로드 완료');