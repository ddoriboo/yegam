// 미니게임 GAM 연동 클라이언트
class MinigameGamIntegration {
    static async placeBet(amount, gameData = {}) {
        try {
            console.log(`💸 미니게임 베팅 요청: ${amount} GAM`, gameData);
            
            const token = localStorage.getItem('yegame-token');
            if (!token) {
                throw new Error('로그인이 필요합니다');
            }
            
            const response = await fetch('/api/gam/minigame-bet', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: amount,
                    gameType: gameData.gameType,
                    gameData: gameData
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // 헤더의 GAM 잔액 업데이트
                if (window.updateUserWallet) {
                    window.updateUserWallet(result.newBalance);
                }
                
                console.log(`✅ 베팅 성공: ${amount} GAM, 잔액: ${result.newBalance}`);
                return result;
            } else {
                console.error('❌ 베팅 실패:', result.message);
                return result;
            }
        } catch (error) {
            console.error('베팅 API 오류:', error);
            return {
                success: false,
                message: '베팅 처리 중 오류가 발생했습니다'
            };
        }
    }
    
    static async receivePayout(amount, gameData = {}) {
        try {
            console.log(`💰 미니게임 수익 지급 요청: ${amount} GAM`, gameData);
            
            const token = localStorage.getItem('yegame-token');
            if (!token) {
                throw new Error('로그인이 필요합니다');
            }
            
            const response = await fetch('/api/gam/minigame-payout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: amount,
                    gameType: gameData.gameType,
                    gameData: gameData
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // 헤더의 GAM 잔액 업데이트
                if (window.updateUserWallet) {
                    window.updateUserWallet(result.newBalance);
                }
                
                console.log(`✅ 수익 지급 성공: ${amount} GAM, 잔액: ${result.newBalance}`);
                return result;
            } else {
                console.error('❌ 수익 지급 실패:', result.message);
                return result;
            }
        } catch (error) {
            console.error('수익 지급 API 오류:', error);
            return {
                success: false,
                message: '수익 지급 처리 중 오류가 발생했습니다'
            };
        }
    }
    
    static async getGameHistory(gameType, limit = 20) {
        try {
            const token = localStorage.getItem('yegame-token');
            if (!token) {
                throw new Error('로그인이 필요합니다');
            }
            
            const response = await fetch(`/api/minigames/history?gameType=${gameType}&limit=${limit}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log(`📊 ${gameType} 게임 히스토리 로드 성공`);
                return result.history;
            } else {
                console.error('게임 히스토리 로드 실패:', result.message);
                return [];
            }
        } catch (error) {
            console.error('게임 히스토리 API 오류:', error);
            return [];
        }
    }
    
    static async getCurrentGameStats(gameType) {
        try {
            const response = await fetch(`/api/minigames/stats?gameType=${gameType}`);
            const result = await response.json();
            
            if (result.success) {
                console.log(`📈 ${gameType} 현재 게임 통계 로드 성공`);
                return result.stats;
            } else {
                console.error('게임 통계 로드 실패:', result.message);
                return null;
            }
        } catch (error) {
            console.error('게임 통계 API 오류:', error);
            return null;
        }
    }
    
    static async validateGameAccess(gameType) {
        try {
            const token = localStorage.getItem('yegame-token');
            if (!token) {
                return {
                    canPlay: false,
                    reason: '로그인이 필요합니다'
                };
            }
            
            const response = await fetch(`/api/minigames/access-check?gameType=${gameType}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const result = await response.json();
            return {
                canPlay: result.success,
                reason: result.message || null,
                userBalance: result.userBalance || 0
            };
        } catch (error) {
            console.error('게임 접근 검증 오류:', error);
            return {
                canPlay: false,
                reason: '서버 연결에 실패했습니다'
            };
        }
    }
    
    // 실시간 베팅 검증 (빠른 응답)
    static async quickBetValidation(amount, gameType) {
        try {
            // 클라이언트 측 기본 검증
            if (!amount || amount <= 0) {
                return { valid: false, message: '베팅 금액을 입력해주세요' };
            }
            
            if (amount < 10) {
                return { valid: false, message: '최소 베팅 금액은 10 GAM입니다' };
            }
            
            if (amount > 10000) {
                return { valid: false, message: '최대 베팅 금액은 10,000 GAM입니다' };
            }
            
            // 서버 측 잔액 검증
            const accessCheck = await this.validateGameAccess(gameType);
            if (!accessCheck.canPlay) {
                return { valid: false, message: accessCheck.reason };
            }
            
            if (amount > accessCheck.userBalance) {
                return { valid: false, message: '보유 GAM이 부족합니다' };
            }
            
            return { valid: true, userBalance: accessCheck.userBalance };
        } catch (error) {
            console.error('베팅 검증 오류:', error);
            return { valid: false, message: '베팅 검증 중 오류가 발생했습니다' };
        }
    }
}

// GAM 포맷팅 유틸리티
class GAMFormatter {
    static format(amount) {
        if (typeof amount !== 'number') {
            amount = parseInt(amount) || 0;
        }
        return amount.toLocaleString() + ' GAM';
    }
    
    static formatShort(amount) {
        if (typeof amount !== 'number') {
            amount = parseInt(amount) || 0;
        }
        
        if (amount >= 1000000) {
            return (amount / 1000000).toFixed(1) + 'M GAM';
        } else if (amount >= 1000) {
            return (amount / 1000).toFixed(1) + 'K GAM';
        } else {
            return amount + ' GAM';
        }
    }
    
    static parse(gamString) {
        if (typeof gamString === 'number') {
            return gamString;
        }
        
        const numStr = gamString.toString().replace(/[^\d.-]/g, '');
        return parseInt(numStr) || 0;
    }
}

// 실시간 잔액 동기화
class BalanceSync {
    constructor() {
        this.syncInterval = null;
        this.isActive = false;
    }
    
    start(intervalMs = 30000) {
        if (this.isActive) return;
        
        this.isActive = true;
        this.syncInterval = setInterval(async () => {
            await this.syncBalance();
        }, intervalMs);
        
        console.log('🔄 실시간 GAM 잔액 동기화 시작');
    }
    
    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.isActive = false;
        console.log('⏸️ 실시간 GAM 잔액 동기화 중지');
    }
    
    async syncBalance() {
        try {
            const token = localStorage.getItem('yegame-token');
            if (!token) return;
            
            const response = await fetch('/api/auth/verify', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.user) {
                    // 헤더 잔액 업데이트
                    if (window.updateUserWallet) {
                        window.updateUserWallet(data.user.gam_balance);
                    }
                    
                    // 커스텀 이벤트 발생 (다른 컴포넌트에서 감지 가능)
                    window.dispatchEvent(new CustomEvent('gamBalanceUpdated', {
                        detail: { balance: data.user.gam_balance }
                    }));
                }
            }
        } catch (error) {
            console.warn('잔액 동기화 중 오류:', error);
        }
    }
}

// 전역으로 노출
window.MinigameGamIntegration = MinigameGamIntegration;
window.GAMFormatter = GAMFormatter;
window.BalanceSync = BalanceSync;

// 전역 잔액 동기화 인스턴스
window.globalBalanceSync = new BalanceSync();

console.log('✅ 미니게임 GAM 연동 클라이언트 로드 완료');