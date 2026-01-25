// Bustabit Game - Clean UI Version
class BustabitGame {
    constructor() {
        this.gameState = 'waiting';
        this.currentMultiplier = 1.00;
        this.currentBet = 0;
        this.hasBet = false;
        this.hasCashedOut = false;
        this.gameStartTime = null;
        this.userBalance = 0;
        
        // Canvas
        this.canvas = null;
        this.ctx = null;
        
        // Polling
        this.pollInterval = null;
        this.renderFrame = null;
        this.isDestroyed = false;
        
        // Chart data
        this.chartData = [];
        
        console.log('🎮 Bustabit Game 초기화');
        this.init();
    }
    
    async init() {
        await this.checkAuth();
        this.setupCanvas();
        this.setupEventListeners();
        this.startPolling();
        this.startRenderLoop();
        this.loadHistory();
        
        // Hide loading
        setTimeout(() => {
            const loading = document.getElementById('loading');
            if (loading) loading.style.display = 'none';
        }, 500);
    }
    
    async checkAuth() {
        const token = localStorage.getItem('yegame-token');
        if (!token) {
            window.location.href = 'login.html?redirect=bustabit.html';
            return;
        }
        
        try {
            const response = await fetch('/api/auth/verify', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success && data.user) {
                this.userBalance = data.user.gam_balance || 0;
                this.updateBalanceDisplay();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
        }
    }
    
    setupCanvas() {
        this.canvas = document.getElementById('bustabit-canvas');
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        if (!this.canvas) return;
        
        const container = this.canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = container.clientWidth * dpr;
        this.canvas.height = container.clientHeight * dpr;
        this.ctx.scale(dpr, dpr);
        
        this.canvas.style.width = container.clientWidth + 'px';
        this.canvas.style.height = container.clientHeight + 'px';
    }
    
    setupEventListeners() {
        // Bet button
        const betBtn = document.getElementById('bet-btn');
        if (betBtn) {
            betBtn.addEventListener('click', () => this.placeBet());
        }
        
        // Cashout button
        const cashoutBtn = document.getElementById('cashout-btn');
        if (cashoutBtn) {
            cashoutBtn.addEventListener('click', () => this.cashOut());
        }
        
        // Bet input enter key
        const betInput = document.getElementById('bet-amount');
        if (betInput) {
            betInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.placeBet();
            });
            
            betInput.addEventListener('input', () => this.updatePotentialProfit());
        }
        
        // Quick bet buttons
        document.querySelectorAll('.quick-bet-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const amount = btn.dataset.amount;
                const multiply = btn.dataset.multiply;
                const action = btn.dataset.action;
                
                const input = document.getElementById('bet-amount');
                if (!input) return;
                
                if (amount) {
                    input.value = amount;
                } else if (multiply) {
                    const current = parseInt(input.value) || 0;
                    input.value = Math.floor(current * parseFloat(multiply));
                } else if (action === 'max') {
                    input.value = Math.min(this.userBalance, 10000);
                } else if (action === 'clear') {
                    input.value = '';
                }
                
                this.updatePotentialProfit();
            });
        });
    }
    
    startPolling() {
        const poll = async () => {
            if (this.isDestroyed) return;
            
            try {
                const response = await fetch('/api/minigames/bustabit/state');
                const result = await response.json();
                
                if (result.success) {
                    this.processGameState(result.gameState);
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
            
            if (!this.isDestroyed) {
                this.pollInterval = setTimeout(poll, this.gameState === 'playing' ? 100 : 200);
            }
        };
        
        poll();
    }
    
    startRenderLoop() {
        const render = () => {
            if (this.isDestroyed) return;
            
            this.drawGraph();
            this.renderFrame = requestAnimationFrame(render);
        };
        
        render();
    }
    
    processGameState(state) {
        const prevState = this.gameState;
        
        this.gameState = state.gameState;
        this.currentMultiplier = state.currentMultiplier;
        
        // Update UI
        this.updateMultiplierDisplay();
        this.updateStatusDisplay(state);
        this.updatePlayersDisplay(state.players);
        this.updateButtonStates();
        
        // State change handlers
        if (prevState !== this.gameState) {
            this.onStateChange(prevState, this.gameState);
        }
        
        // Chart data
        if (this.gameState === 'playing' && state.elapsedTime > 0) {
            if (!this.gameStartTime) {
                this.gameStartTime = Date.now() - state.elapsedTime;
            }
            this.chartData.push({
                time: state.elapsedTime / 1000,
                multiplier: this.currentMultiplier
            });
            
            if (this.chartData.length > 300) {
                this.chartData.shift();
            }
        }
        
        // Update potential profit during game
        if (this.gameState === 'playing' && this.hasBet && !this.hasCashedOut) {
            this.updateCashoutValue();
        }
    }
    
    onStateChange(from, to) {
        console.log(`State: ${from} → ${to}`);
        
        if (to === 'betting') {
            this.chartData = [];
            this.gameStartTime = null;
            this.hasCashedOut = false;
            this.loadHistory();
        }
        
        if (to === 'playing') {
            this.gameStartTime = Date.now();
        }
        
        if (to === 'crashed') {
            if (this.hasBet && !this.hasCashedOut) {
                this.showNotification(`💥 ${this.currentMultiplier.toFixed(2)}×에서 크래시!`, 'error');
            }
            this.hasBet = false;
            this.currentBet = 0;
            this.updateCurrentBetDisplay();
            this.checkBalance();
        }
    }
    
    updateMultiplierDisplay() {
        const display = document.getElementById('multiplier-display');
        if (!display) return;
        
        let multiplier = this.currentMultiplier;
        
        // Real-time interpolation during play
        if (this.gameState === 'playing' && this.gameStartTime) {
            const elapsed = (Date.now() - this.gameStartTime) / 1000;
            multiplier = Math.pow(Math.E, 0.06 * elapsed);
            this.currentMultiplier = multiplier;
        }
        
        display.textContent = multiplier.toFixed(2) + '×';
        
        // Color based on state
        display.className = 'multiplier-value ' + this.gameState;
    }
    
    updateStatusDisplay(state) {
        const statusEl = document.getElementById('game-status');
        const countdownEl = document.getElementById('countdown');
        
        if (!statusEl) return;
        
        switch (this.gameState) {
            case 'waiting':
                statusEl.textContent = '다음 라운드 대기';
                countdownEl.textContent = state.waitingCountdown > 0 ? `${state.waitingCountdown}초` : '';
                break;
            case 'betting':
                statusEl.textContent = '베팅 시간';
                countdownEl.textContent = state.bettingCountdown > 0 ? `${state.bettingCountdown}초` : '';
                break;
            case 'playing':
                statusEl.textContent = '진행 중';
                countdownEl.textContent = '';
                break;
            case 'crashed':
                statusEl.textContent = 'CRASHED!';
                countdownEl.textContent = '';
                break;
        }
    }
    
    updatePlayersDisplay(players) {
        const container = document.getElementById('players-container');
        const countEl = document.getElementById('player-count');
        
        if (!container || !players) return;
        
        countEl.textContent = players.length;
        
        container.innerHTML = players.map(player => {
            let statusClass = 'waiting';
            let statusText = `${player.betAmount.toLocaleString()}`;
            
            if (player.cashedOut) {
                statusClass = 'cashed-out';
                statusText = `${player.cashoutMultiplier.toFixed(2)}×`;
            } else if (this.gameState === 'crashed') {
                statusClass = 'crashed';
                statusText = '💥';
            }
            
            const initial = (player.username || 'U')[0].toUpperCase();
            
            return `
                <div class="player-item">
                    <div class="player-info">
                        <div class="player-avatar">${initial}</div>
                        <div>
                            <div class="player-name">${player.username}</div>
                            <div class="player-bet">${player.betAmount.toLocaleString()} GAM</div>
                        </div>
                    </div>
                    <div class="player-status ${statusClass}">${statusText}</div>
                </div>
            `;
        }).join('');
    }
    
    updateButtonStates() {
        const betBtn = document.getElementById('bet-btn');
        const cashoutBtn = document.getElementById('cashout-btn');
        
        if (betBtn) {
            const canBet = this.gameState === 'betting' && !this.hasBet;
            betBtn.disabled = !canBet;
            betBtn.textContent = this.hasBet ? '베팅 완료' : '베팅하기';
        }
        
        if (cashoutBtn) {
            const canCashout = this.gameState === 'playing' && this.hasBet && !this.hasCashedOut;
            cashoutBtn.disabled = !canCashout;
        }
    }
    
    updateCashoutValue() {
        const valueEl = document.getElementById('cashout-value');
        if (!valueEl || !this.hasBet) return;
        
        const payout = Math.floor(this.currentBet * this.currentMultiplier);
        valueEl.textContent = `(${payout.toLocaleString()} GAM)`;
    }
    
    updatePotentialProfit() {
        const input = document.getElementById('bet-amount');
        const profitEl = document.getElementById('potential-profit');
        
        if (!input || !profitEl) return;
        
        const amount = parseInt(input.value) || 0;
        const potentialProfit = Math.floor(amount * 2) - amount; // 2x 기준
        profitEl.textContent = `+${potentialProfit.toLocaleString()} GAM (2×)`;
    }
    
    updateBalanceDisplay() {
        const balanceEl = document.getElementById('user-balance');
        if (balanceEl) {
            balanceEl.textContent = this.userBalance.toLocaleString();
        }
    }
    
    updateCurrentBetDisplay() {
        const betEl = document.getElementById('current-bet');
        if (betEl) {
            betEl.textContent = `${this.currentBet.toLocaleString()} GAM`;
        }
    }
    
    async checkBalance() {
        try {
            const token = localStorage.getItem('yegame-token');
            const response = await fetch('/api/auth/verify', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success && data.user) {
                this.userBalance = data.user.gam_balance || 0;
                this.updateBalanceDisplay();
            }
        } catch (error) {
            console.error('Balance check failed:', error);
        }
    }
    
    async placeBet() {
        if (this.gameState !== 'betting') {
            this.showNotification('베팅 시간이 아닙니다', 'error');
            return;
        }
        
        if (this.hasBet) {
            this.showNotification('이미 베팅했습니다', 'error');
            return;
        }
        
        const input = document.getElementById('bet-amount');
        const amount = parseInt(input?.value) || 0;
        
        if (amount < 10 || amount > 10000) {
            this.showNotification('베팅 금액: 10 ~ 10,000 GAM', 'error');
            return;
        }
        
        if (amount > this.userBalance) {
            this.showNotification('잔액이 부족합니다', 'error');
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
                this.updateButtonStates();
                
                this.showNotification(`${amount.toLocaleString()} GAM 베팅 완료!`, 'success');
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Bet error:', error);
            this.showNotification('베팅 중 오류 발생', 'error');
        }
    }
    
    async cashOut() {
        if (this.gameState !== 'playing' || !this.hasBet || this.hasCashedOut) {
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
                this.updateButtonStates();
                
                this.showNotification(`🎉 ${result.multiplier.toFixed(2)}×에서 캐시아웃! +${result.payout.toLocaleString()} GAM`, 'success');
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Cashout error:', error);
            this.showNotification('캐시아웃 중 오류 발생', 'error');
        }
    }
    
    async loadHistory() {
        try {
            const response = await fetch('/api/minigames/bustabit/history?limit=15');
            const result = await response.json();
            
            if (result.success) {
                this.updateHistoryDisplay(result.history);
            }
        } catch (error) {
            console.error('History load error:', error);
        }
    }
    
    updateHistoryDisplay(history) {
        const container = document.getElementById('game-history');
        if (!container) return;
        
        container.innerHTML = history.map(game => {
            let className = 'low';
            if (game.crashPoint >= 5) className = 'high';
            else if (game.crashPoint >= 2) className = 'medium';
            
            return `<div class="history-item ${className}">${game.crashPoint.toFixed(2)}×</div>`;
        }).join('');
    }
    
    // Graph Drawing
    drawGraph() {
        if (!this.ctx || !this.canvas) return;
        
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        // Clear
        this.ctx.fillStyle = '#0d0d0f';
        this.ctx.fillRect(0, 0, width, height);
        
        const margin = { top: 40, right: 60, bottom: 40, left: 60 };
        const graphWidth = width - margin.left - margin.right;
        const graphHeight = height - margin.top - margin.bottom;
        
        // Calculate ranges
        const currentTime = this.gameStartTime ? (Date.now() - this.gameStartTime) / 1000 : 0;
        const maxTime = Math.max(currentTime + 3, 8);
        
        let maxMultiplier = 2;
        if (this.currentMultiplier > 1.5) {
            maxMultiplier = Math.ceil(this.currentMultiplier * 1.3);
        }
        
        // Draw grid
        this.drawGrid(margin, graphWidth, graphHeight, maxTime, maxMultiplier);
        
        // Draw curve
        if (this.gameState === 'playing' || this.gameState === 'crashed') {
            this.drawCurve(margin, graphWidth, graphHeight, maxTime, maxMultiplier, currentTime);
        }
    }
    
    drawGrid(margin, graphWidth, graphHeight, maxTime, maxMultiplier) {
        const ctx = this.ctx;
        
        // Grid lines
        ctx.strokeStyle = '#1a1a1f';
        ctx.lineWidth = 1;
        
        // Vertical lines (time)
        const timeStep = maxTime <= 10 ? 2 : 5;
        for (let t = 0; t <= maxTime; t += timeStep) {
            const x = margin.left + (t / maxTime) * graphWidth;
            ctx.beginPath();
            ctx.moveTo(x, margin.top);
            ctx.lineTo(x, margin.top + graphHeight);
            ctx.stroke();
            
            // Label
            ctx.fillStyle = '#4b5563';
            ctx.font = '11px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${t}s`, x, margin.top + graphHeight + 20);
        }
        
        // Horizontal lines (multiplier)
        const multiplierStep = maxMultiplier <= 3 ? 0.5 : maxMultiplier <= 10 ? 1 : 2;
        for (let m = 1; m <= maxMultiplier; m += multiplierStep) {
            const y = margin.top + graphHeight - ((m - 1) / (maxMultiplier - 1)) * graphHeight;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + graphWidth, y);
            ctx.stroke();
            
            // Label
            ctx.fillStyle = '#4b5563';
            ctx.font = '11px JetBrains Mono, monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`${m.toFixed(1)}×`, margin.left - 10, y + 4);
        }
    }
    
    drawCurve(margin, graphWidth, graphHeight, maxTime, maxMultiplier, currentTime) {
        const ctx = this.ctx;
        
        if (currentTime <= 0) return;
        
        // Gradient for curve
        const gradient = ctx.createLinearGradient(margin.left, 0, margin.left + graphWidth, 0);
        if (this.gameState === 'crashed') {
            gradient.addColorStop(0, '#ef4444');
            gradient.addColorStop(1, '#ef4444');
        } else {
            gradient.addColorStop(0, '#22c55e');
            gradient.addColorStop(1, '#4ade80');
        }
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        
        const steps = Math.min(currentTime * 30, 200);
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * currentTime;
            const multiplier = Math.pow(Math.E, 0.06 * t);
            
            const x = margin.left + (t / maxTime) * graphWidth;
            const y = margin.top + graphHeight - ((multiplier - 1) / (maxMultiplier - 1)) * graphHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Current point (glow effect)
        if (this.gameState === 'playing') {
            const currentX = margin.left + (currentTime / maxTime) * graphWidth;
            const currentY = margin.top + graphHeight - ((this.currentMultiplier - 1) / (maxMultiplier - 1)) * graphHeight;
            
            // Glow
            ctx.shadowColor = '#22c55e';
            ctx.shadowBlur = 20;
            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.arc(currentX, currentY, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // White center
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(currentX, currentY, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    destroy() {
        this.isDestroyed = true;
        
        if (this.pollInterval) {
            clearTimeout(this.pollInterval);
        }
        
        if (this.renderFrame) {
            cancelAnimationFrame(this.renderFrame);
        }
        
        console.log('🗑️ Bustabit Game destroyed');
    }
}

// Initialize
let bustabitGame = null;

document.addEventListener('DOMContentLoaded', () => {
    bustabitGame = new BustabitGame();
});

window.addEventListener('beforeunload', () => {
    if (bustabitGame) {
        bustabitGame.destroy();
    }
});

console.log('✅ Bustabit Game script loaded');
