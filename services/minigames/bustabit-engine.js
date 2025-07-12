// Bustabit 게임 엔진
class BustabitEngine {
    constructor() {
        this.gameState = 'waiting'; // waiting, betting, playing, crashed
        this.currentMultiplier = 1.00;
        this.crashPoint = null;
        this.startTime = null;
        this.players = new Map(); // userId -> {betAmount, cashedOut, cashoutMultiplier}
        this.gameHistory = [];
        this.tickInterval = null;
        
        // 게임 설정
        this.config = {
            bettingTimeMs: 5000,    // 5초 베팅 시간
            tickIntervalMs: 100,    // 100ms마다 업데이트
            minMultiplier: 1.01,    // 최소 크래시 포인트
            maxMultiplier: 10000,   // 최대 크래시 포인트
            houseEdge: 0.01         // 1% 하우스 엣지
        };
        
        console.log('🚀 Bustabit 게임 엔진 초기화 완료');
    }
    
    // 새 게임 시작
    startNewGame() {
        if (this.gameState !== 'waiting') {
            console.warn('게임이 이미 진행 중입니다');
            return false;
        }
        
        console.log('🎮 새로운 Bustabit 게임 시작');
        
        // 게임 상태 초기화
        this.gameState = 'betting';
        this.currentMultiplier = 1.00;
        this.players.clear();
        this.crashPoint = this.generateCrashPoint();
        
        console.log(`💥 크래시 포인트 생성: ${this.crashPoint.toFixed(2)}x`);
        
        // 베팅 시간 시작
        setTimeout(() => {
            this.startGameRound();
        }, this.config.bettingTimeMs);
        
        return {
            gameState: this.gameState,
            bettingTimeMs: this.config.bettingTimeMs,
            crashPoint: this.crashPoint // 개발용 (실제로는 숨겨야 함)
        };
    }
    
    // 게임 라운드 시작 (배수 증가 시작)
    startGameRound() {
        if (this.gameState !== 'betting') {
            return;
        }
        
        console.log('🔥 게임 라운드 시작 - 배수 증가 시작');
        
        this.gameState = 'playing';
        this.startTime = Date.now();
        this.currentMultiplier = 1.00;
        
        // 배수 증가 타이머 시작
        this.tickInterval = setInterval(() => {
            this.updateMultiplier();
        }, this.config.tickIntervalMs);
    }
    
    // 배수 업데이트
    updateMultiplier() {
        if (this.gameState !== 'playing') {
            return;
        }
        
        const elapsed = Date.now() - this.startTime;
        this.currentMultiplier = this.calculateMultiplier(elapsed);
        
        // 크래시 포인트 도달 시 게임 종료
        if (this.currentMultiplier >= this.crashPoint) {
            this.crashGame();
        }
    }
    
    // 배수 계산 (시간 기반)
    calculateMultiplier(elapsedMs) {
        // 지수적 증가 함수 사용
        const seconds = elapsedMs / 1000;
        const growthRate = 0.1; // 증가율 조정
        return Math.max(1.00, 1 + (Math.exp(growthRate * seconds) - 1));
    }
    
    // 크래시 포인트 생성 (Provably Fair 알고리즘 기반)
    generateCrashPoint() {
        // 간단한 확률 기반 크래시 포인트 생성
        // 실제로는 더 복잡한 Provably Fair 알고리즘 사용
        
        const random = Math.random();
        const houseEdge = this.config.houseEdge;
        
        // 하우스 엣지를 고려한 크래시 포인트 계산
        let crashPoint;
        
        if (random < 0.5) {
            // 50% 확률로 1.01x ~ 2.00x
            crashPoint = 1.01 + (random * 2) * 0.99;
        } else if (random < 0.8) {
            // 30% 확률로 2.00x ~ 5.00x
            crashPoint = 2.00 + ((random - 0.5) / 0.3) * 3.00;
        } else if (random < 0.95) {
            // 15% 확률로 5.00x ~ 20.00x
            crashPoint = 5.00 + ((random - 0.8) / 0.15) * 15.00;
        } else {
            // 5% 확률로 20.00x ~ 100.00x
            crashPoint = 20.00 + ((random - 0.95) / 0.05) * 80.00;
        }
        
        // 하우스 엣지 적용
        crashPoint = Math.max(this.config.minMultiplier, crashPoint * (1 - houseEdge));
        
        return Math.min(crashPoint, this.config.maxMultiplier);
    }
    
    // 베팅 처리
    placeBet(userId, username, betAmount) {
        if (this.gameState !== 'betting') {
            return {
                success: false,
                message: '베팅 시간이 아닙니다'
            };
        }
        
        if (this.players.has(userId)) {
            return {
                success: false,
                message: '이미 베팅하셨습니다'
            };
        }
        
        if (betAmount < 10 || betAmount > 10000) {
            return {
                success: false,
                message: '베팅 금액은 10 GAM에서 10,000 GAM 사이여야 합니다'
            };
        }
        
        // 플레이어 추가
        this.players.set(userId, {
            username: username,
            betAmount: betAmount,
            cashedOut: false,
            cashoutMultiplier: null,
            joinedAt: Date.now()
        });
        
        console.log(`💸 베팅 접수: ${username} - ${betAmount} GAM`);
        
        return {
            success: true,
            message: '베팅이 접수되었습니다',
            playerCount: this.players.size
        };
    }
    
    // 캐시아웃 처리
    cashOut(userId) {
        if (this.gameState !== 'playing') {
            return {
                success: false,
                message: '캐시아웃할 수 없는 상태입니다'
            };
        }
        
        const player = this.players.get(userId);
        if (!player) {
            return {
                success: false,
                message: '베팅하지 않은 플레이어입니다'
            };
        }
        
        if (player.cashedOut) {
            return {
                success: false,
                message: '이미 캐시아웃하셨습니다'
            };
        }
        
        // 캐시아웃 처리
        player.cashedOut = true;
        player.cashoutMultiplier = this.currentMultiplier;
        
        const payout = Math.floor(player.betAmount * this.currentMultiplier);
        
        console.log(`💰 캐시아웃: ${player.username} - ${this.currentMultiplier.toFixed(2)}x, ${payout} GAM`);
        
        return {
            success: true,
            message: '캐시아웃 완료',
            multiplier: this.currentMultiplier,
            payout: payout
        };
    }
    
    // 게임 크래시
    crashGame() {
        if (this.gameState !== 'playing') {
            return;
        }
        
        console.log(`💥 게임 크래시! ${this.crashPoint.toFixed(2)}x에서 종료`);
        
        this.gameState = 'crashed';
        
        // 타이머 중지
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
        
        // 최종 배수를 크래시 포인트로 설정
        this.currentMultiplier = this.crashPoint;
        
        // 게임 결과 계산
        const results = this.calculateGameResults();
        
        // 히스토리에 추가
        this.addToHistory(results);
        
        // 3초 후 새 게임 대기 상태로 변경
        setTimeout(() => {
            this.gameState = 'waiting';
            console.log('⏳ 새 게임 대기 상태로 변경');
        }, 3000);
        
        return results;
    }
    
    // 게임 결과 계산
    calculateGameResults() {
        const results = {
            crashPoint: this.crashPoint,
            players: [],
            totalBetAmount: 0,
            totalPayout: 0,
            houseProfit: 0
        };
        
        for (const [userId, player] of this.players) {
            results.totalBetAmount += player.betAmount;
            
            let payout = 0;
            let profit = 0;
            
            if (player.cashedOut) {
                payout = Math.floor(player.betAmount * player.cashoutMultiplier);
                profit = payout - player.betAmount;
            } else {
                profit = -player.betAmount; // 손실
            }
            
            results.totalPayout += payout;
            
            results.players.push({
                userId: userId,
                username: player.username,
                betAmount: player.betAmount,
                cashedOut: player.cashedOut,
                cashoutMultiplier: player.cashoutMultiplier,
                payout: payout,
                profit: profit
            });
        }
        
        results.houseProfit = results.totalBetAmount - results.totalPayout;
        
        return results;
    }
    
    // 히스토리에 게임 추가
    addToHistory(results) {
        this.gameHistory.unshift({
            gameId: Date.now(),
            crashPoint: results.crashPoint,
            playerCount: results.players.length,
            totalBetAmount: results.totalBetAmount,
            totalPayout: results.totalPayout,
            houseProfit: results.houseProfit,
            timestamp: new Date()
        });
        
        // 최대 100개까지만 보관
        if (this.gameHistory.length > 100) {
            this.gameHistory = this.gameHistory.slice(0, 100);
        }
    }
    
    // 현재 게임 상태 반환
    getGameState() {
        return {
            gameState: this.gameState,
            currentMultiplier: this.currentMultiplier,
            playerCount: this.players.size,
            players: Array.from(this.players.entries()).map(([userId, player]) => ({
                userId: userId,
                username: player.username,
                betAmount: player.betAmount,
                cashedOut: player.cashedOut,
                cashoutMultiplier: player.cashoutMultiplier
            })),
            recentHistory: this.gameHistory.slice(0, 10)
        };
    }
    
    // 플레이어별 상태 반환
    getPlayerState(userId) {
        const player = this.players.get(userId);
        if (!player) {
            return null;
        }
        
        return {
            betAmount: player.betAmount,
            cashedOut: player.cashedOut,
            cashoutMultiplier: player.cashoutMultiplier,
            currentMultiplier: this.currentMultiplier,
            gameState: this.gameState
        };
    }
    
    // 게임 통계 반환
    getGameStats() {
        const recentGames = this.gameHistory.slice(0, 20);
        
        if (recentGames.length === 0) {
            return {
                averageCrashPoint: 0,
                totalGames: 0,
                totalVolume: 0,
                currentPlayers: this.players.size
            };
        }
        
        const averageCrashPoint = recentGames.reduce((sum, game) => sum + game.crashPoint, 0) / recentGames.length;
        const totalVolume = recentGames.reduce((sum, game) => sum + game.totalBetAmount, 0);
        
        return {
            averageCrashPoint: averageCrashPoint,
            totalGames: this.gameHistory.length,
            totalVolume: totalVolume,
            currentPlayers: this.players.size
        };
    }
}

// 전역 Bustabit 엔진 인스턴스
let globalBustabitEngine = null;

// 엔진 초기화
function initializeBustabitEngine() {
    if (!globalBustabitEngine) {
        globalBustabitEngine = new BustabitEngine();
        console.log('🌟 전역 Bustabit 엔진 초기화 완료');
    }
    return globalBustabitEngine;
}

// 엔진 가져오기
function getBustabitEngine() {
    if (!globalBustabitEngine) {
        return initializeBustabitEngine();
    }
    return globalBustabitEngine;
}

module.exports = {
    BustabitEngine,
    initializeBustabitEngine,
    getBustabitEngine
};