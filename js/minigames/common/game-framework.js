// 미니게임 공통 프레임워크
class MinigameBase {
    constructor(gameType) {
        this.gameType = gameType;
        this.isPlaying = false;
        this.currentBet = 0;
        this.userBalance = 0;
        this.gameContainer = null;
        
        console.log(`🎮 ${gameType} 게임 초기화`);
        this.initializeGame();
    }
    
    async initializeGame() {
        // 사용자 GAM 잔액 확인
        await this.loadUserBalance();
        
        // 게임 컨테이너 생성
        this.createGameContainer();
        
        // 게임별 초기화 (하위 클래스에서 구현)
        if (this.initGame) {
            this.initGame();
        }
    }
    
    async loadUserBalance() {
        try {
            const token = localStorage.getItem('yegame-token');
            if (!token) {
                throw new Error('로그인이 필요합니다');
            }
            
            const response = await fetch('/api/auth/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.userBalance = data.user?.gam_balance || 0;
                console.log(`💰 사용자 GAM 잔액: ${this.userBalance.toLocaleString()}`);
            } else {
                throw new Error('사용자 정보를 불러올 수 없습니다');
            }
        } catch (error) {
            console.error('잔액 로드 실패:', error);
            this.showError('사용자 정보를 불러오는데 실패했습니다.');
        }
    }
    
    createGameContainer() {
        // 기본 게임 컨테이너 구조 생성
        this.gameContainer = document.createElement('div');
        this.gameContainer.className = `${this.gameType}-game-container`;
        this.gameContainer.innerHTML = `
            <div class="${this.gameType}-header">
                <h2>${this.getGameDisplayName()}</h2>
                <div class="user-balance">
                    <span>보유 GAM: </span>
                    <span class="balance-amount">${this.userBalance.toLocaleString()}</span>
                </div>
            </div>
            <div class="${this.gameType}-content">
                <!-- 게임별 컨텐츠가 여기에 들어감 -->
            </div>
        `;
    }
    
    getGameDisplayName() {
        const gameNames = {
            'bustabit': '🚀 Bustabit',
            'monster': '🐉 몬스터 강화',
            'slots': '🎰 슬롯머신'
        };
        return gameNames[this.gameType] || this.gameType;
    }
    
    async placeBet(amount) {
        try {
            if (!this.validateBet(amount)) {
                return false;
            }
            
            const result = await MinigameGamIntegration.placeBet(amount, {
                gameType: this.gameType,
                gameData: this.getGameSpecificData()
            });
            
            if (result.success) {
                this.currentBet = amount;
                this.userBalance = result.newBalance;
                this.updateBalanceDisplay();
                this.onBetPlaced(amount);
                console.log(`✅ 베팅 성공: ${amount} GAM`);
                return true;
            } else {
                this.showError(result.message || '베팅에 실패했습니다');
                return false;
            }
        } catch (error) {
            console.error('베팅 오류:', error);
            this.showError('베팅 처리 중 오류가 발생했습니다');
            return false;
        }
    }
    
    validateBet(amount) {
        if (!amount || amount <= 0) {
            this.showError('베팅 금액을 입력해주세요');
            return false;
        }
        
        if (amount < 10) {
            this.showError('최소 베팅 금액은 10 GAM입니다');
            return false;
        }
        
        if (amount > 10000) {
            this.showError('최대 베팅 금액은 10,000 GAM입니다');
            return false;
        }
        
        if (amount > this.userBalance) {
            this.showError('보유 GAM이 부족합니다');
            return false;
        }
        
        return true;
    }
    
    async receivePayout(amount, gameData = {}) {
        try {
            const result = await MinigameGamIntegration.receivePayout(amount, {
                gameType: this.gameType,
                ...gameData
            });
            
            if (result.success) {
                this.userBalance = result.newBalance;
                this.updateBalanceDisplay();
                this.onPayoutReceived(amount);
                console.log(`💰 수익 지급: ${amount} GAM`);
                return true;
            } else {
                this.showError(result.message || '수익 지급에 실패했습니다');
                return false;
            }
        } catch (error) {
            console.error('수익 지급 오류:', error);
            this.showError('수익 지급 중 오류가 발생했습니다');
            return false;
        }
    }
    
    updateBalanceDisplay() {
        // 모달 내 잔액 업데이트 (Bustabit 모달의 경우)
        const balanceElement = document.getElementById('user-balance');
        if (balanceElement) {
            balanceElement.textContent = GAMFormatter.format(this.userBalance);
            console.log(`💰 모달 잔액 업데이트: ${this.userBalance} GAM`);
        }
        
        // 기본 게임 컨테이너 잔액 업데이트
        const containerBalanceElement = this.gameContainer?.querySelector('.balance-amount');
        if (containerBalanceElement) {
            containerBalanceElement.textContent = this.userBalance.toLocaleString();
        }
        
        // 헤더의 GAM 잔액도 업데이트
        if (window.updateUserWallet) {
            window.updateUserWallet(this.userBalance);
            console.log(`📱 헤더 GAM 잔액 업데이트: ${this.userBalance} GAM`);
        } else {
            console.warn('⚠️ window.updateUserWallet 함수를 찾을 수 없습니다');
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `game-notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // 3초 후 자동 제거
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
    
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    showSuccess(message) {
        this.showNotification(message, 'success');
    }
    
    showWarning(message) {
        this.showNotification(message, 'warning');
    }
    
    // 하위 클래스에서 구현해야 하는 메서드들
    getGameSpecificData() {
        return {};
    }
    
    onBetPlaced(amount) {
        // 베팅 완료 후 처리 (하위 클래스에서 구현)
    }
    
    onPayoutReceived(amount) {
        // 수익 지급 후 처리 (하위 클래스에서 구현)
    }
    
    // 게임 상태 관리
    startGame() {
        this.isPlaying = true;
        console.log(`🎯 ${this.gameType} 게임 시작`);
    }
    
    endGame() {
        this.isPlaying = false;
        this.currentBet = 0;
        console.log(`🏁 ${this.gameType} 게임 종료`);
    }
    
    // 게임 정리
    destroy() {
        if (this.gameContainer && this.gameContainer.parentNode) {
            this.gameContainer.parentNode.removeChild(this.gameContainer);
        }
        console.log(`🗑️ ${this.gameType} 게임 정리 완료`);
    }
}

// 게임 유틸리티 함수들
class GameUtils {
    static formatGAM(amount) {
        return amount.toLocaleString() + ' GAM';
    }
    
    static formatMultiplier(multiplier) {
        return multiplier.toFixed(2) + 'x';
    }
    
    static generateId() {
        return Math.random().toString(36).substr(2, 9);
    }
    
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }
    
    static getRandomColor() {
        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', 
            '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    static isValidNumber(value) {
        return !isNaN(value) && isFinite(value) && value > 0;
    }
}

// 전역으로 노출
window.MinigameBase = MinigameBase;
window.GameUtils = GameUtils;

console.log('✅ 미니게임 공통 프레임워크 로드 완료');