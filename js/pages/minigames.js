// 미니게임방 메인 페이지 관리
class MinigamesPage {
    constructor() {
        // 메모리 누수 방지를 위한 정리 배열
        this.intervals = [];
        this.timeouts = [];
        this.eventListeners = [];
        this.isDestroyed = false;
        this.statsInitialized = false;
        this.errorCount = 0;
        this.currentDelay = 10000;
        
        this.games = {
            bustabit: {
                name: 'Bustabit',
                description: '실시간으로 증가하는 배수에서 언제 캐시아웃할지 결정하는 스릴 넘치는 게임',
                minBet: 10,
                maxBet: 10000,
                status: 'active',
                playerCount: 0
            },
            monster: {
                name: '몬스터 강화',
                description: '몬스터를 강화하여 더 강력하게 만드는 게임. 강화에 성공하면 배수 획득!',
                minBet: 10,
                maxBet: 10000,
                status: 'coming_soon',
                playerCount: 0
            },
            slots: {
                name: '슬롯머신',
                description: '클래식한 슬롯머신 게임으로 행운을 시험해보세요!',
                minBet: 10,
                maxBet: 10000,
                status: 'coming_soon',
                playerCount: 0
            }
        };
        
        this.init();
    }
    
    init() {
        console.log('🎮 미니게임방 페이지 초기화');
        
        // DOM 로드 완료 후 초기화
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupEventListeners();
                this.loadGameStats();
            });
        } else {
            this.setupEventListeners();
            this.loadGameStats();
        }
    }
    
    setupEventListeners() {
        console.log('🔧 미니게임방 이벤트 리스너 설정');
        
        // 게임 플레이 버튼 클릭 (이벤트 리스너 추적)
        const gamePlayHandler = (e) => {
            if (e.target.matches('.game-play-btn')) {
                const gameType = e.target.getAttribute('data-game');
                this.handleGameStart(gameType);
            }
        };
        document.addEventListener('click', gamePlayHandler);
        this.eventListeners.push({ element: document, event: 'click', handler: gamePlayHandler });
        
        // 게임 카드 클릭 (상세 정보) (이벤트 리스너 추적)
        const gameCardHandler = (e) => {
            const gameCard = e.target.closest('.game-card');
            if (gameCard && !e.target.matches('.game-play-btn')) {
                const gameType = gameCard.getAttribute('data-game');
                this.showGameDetails(gameType);
            }
        };
        document.addEventListener('click', gameCardHandler);
        this.eventListeners.push({ element: document, event: 'click', handler: gameCardHandler });
        
        // 검색 기능 (이벤트 리스너 추적)
        const searchInput = document.getElementById('header-search-input');
        if (searchInput) {
            const searchHandler = (e) => {
                this.handleSearch(e.target.value);
            };
            searchInput.addEventListener('input', searchHandler);
            
            // 정리를 위해 배열에 추가
            this.eventListeners.push({ element: searchInput, event: 'input', handler: searchHandler });
        }
    }
    
    async loadGameStats() {
        // 재귀 호출 대신 단일 interval만 사용
        if (!this.statsInitialized) {
            this.statsInitialized = true;
            this.errorCount = 0;
            this.currentDelay = 10000; // 기본 10초
            
            // 단일 interval 설정
            const statsInterval = setInterval(async () => {
                if (this.isDestroyed) {
                    clearInterval(statsInterval);
                    return;
                }
                
                // 페이지가 숨겨져 있으면 API 호출 건너뛰기
                if (document.hidden) {
                    return;
                }
                
                try {
                    // Bustabit 실시간 플레이어 수 로드
                    const response = await fetch('/api/minigames/bustabit/state');
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        this.updateGameStats('bustabit', {
                            currentPlayers: result.gameState.playerCount,
                            gameState: result.gameState.gameState
                        });
                        
                        // 성공 시 에러 카운트 리셋
                        this.errorCount = 0;
                        this.currentDelay = 10000;
                    }
                } catch (error) {
                    this.errorCount++;
                    console.error(`게임 통계 로드 실패 (${this.errorCount}회):`, error.message);
                    
                    // 에러가 5회 이상 발생하면 interval 중단
                    if (this.errorCount >= 5) {
                        console.error('🛑 게임 통계 로드 중단 - 너무 많은 에러 발생');
                        clearInterval(statsInterval);
                        
                        // 30초 후 재시도
                        const retryTimeout = setTimeout(() => {
                            if (!this.isDestroyed) {
                                this.statsInitialized = false;
                                this.loadGameStats();
                            }
                        }, 30000);
                        this.timeouts.push(retryTimeout);
                    }
                }
            }, this.currentDelay);
            
            // 정리를 위해 배열에 추가
            this.intervals.push(statsInterval);
        }
        
        // 초기 로드 (interval과 별도)
        if (!document.hidden) {
            try {
                const response = await fetch('/api/minigames/bustabit/state');
                const result = await response.json();
                
                if (result.success) {
                    this.updateGameStats('bustabit', {
                        currentPlayers: result.gameState.playerCount,
                        gameState: result.gameState.gameState
                    });
                }
            } catch (error) {
                console.error('초기 게임 통계 로드 실패:', error.message);
            }
        }
    }
    
    updateGameStats(gameType, stats) {
        const playerElement = document.getElementById(`${gameType}-players`);
        if (playerElement) {
            playerElement.textContent = stats.currentPlayers || 0;
        }
        
        // 게임 정보 업데이트
        if (this.games[gameType]) {
            this.games[gameType].playerCount = stats.currentPlayers || 0;
        }
    }
    
    async handleGameStart(gameType) {
        console.log(`🎯 ${gameType} 게임 시작 시도`);
        
        // 로그인 검증
        const token = localStorage.getItem('yegame-token');
        if (!token) {
            this.showLoginRequired();
            return;
        }
        
        // 게임 상태 확인
        const game = this.games[gameType];
        if (!game) {
            this.showError('알 수 없는 게임입니다');
            return;
        }
        
        if (game.status !== 'active') {
            this.showWarning('준비 중인 게임입니다');
            return;
        }
        
        // 게임 접근 권한 확인
        const accessCheck = await MinigameGamIntegration.validateGameAccess(gameType);
        if (!accessCheck.canPlay) {
            this.showError(accessCheck.reason);
            return;
        }
        
        // 게임별 페이지로 이동 또는 모달 표시
        this.launchGame(gameType);
    }
    
    launchGame(gameType) {
        switch (gameType) {
            case 'bustabit':
                this.launchBustabitGame();
                break;
            case 'monster':
                this.showComingSoon('몬스터 강화 게임');
                break;
            case 'slots':
                this.showComingSoon('슬롯머신 게임');
                break;
            default:
                this.showError('게임을 시작할 수 없습니다');
        }
    }
    
    launchBustabitGame() {
        console.log('🚀 Bustabit 게임 시작');
        
        // 실제 Bustabit 게임 클라이언트 초기화
        this.showBustabitModal();
    }
    
    showBustabitModal() {
        // 모달 HTML 생성
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bustabit-container max-w-6xl w-full mx-2 sm:mx-4 h-[95vh] flex flex-col pt-4 sm:pt-6">
                <!-- 헤더 (모바일 상단 여백 추가) -->
                <div class="flex justify-between items-center mb-3 sm:mb-4 flex-shrink-0">
                    <h2 class="text-2xl sm:text-3xl font-bold text-white">🚀 Bustabit</h2>
                    <button id="close-bustabit" class="text-white hover:text-gray-300 text-2xl">✕</button>
                </div>
                
                <!-- 메인 게임 영역 (모바일 최적화) -->
                <div class="flex-1 flex flex-col lg:grid lg:grid-cols-3 gap-3 sm:gap-4 min-h-0">
                    <!-- 그래프 영역 -->
                    <div class="lg:col-span-2 flex flex-col">
                        <!-- 배수 및 상태 표시 (모바일에서 상단) -->
                        <div class="flex justify-between items-center mb-1 sm:mb-2 lg:order-2">
                            <div class="multiplier-display text-white text-2xl sm:text-3xl font-bold" id="multiplier-display">
                                1.00x
                            </div>
                            <div class="game-status betting text-white text-sm sm:text-base" id="game-status">
                                베팅 시간
                            </div>
                        </div>
                        
                        <!-- 그래프 (높이 반응형) -->
                        <div class="bustabit-graph lg:order-1 flex-1" style="min-height: 200px; height: 40vh; max-height: 400px;">
                            <canvas id="bustabit-canvas" class="bustabit-graph-canvas w-full h-full"></canvas>
                        </div>
                    </div>
                    
                    <!-- 베팅 패널 (모바일에서 하단 고정) -->
                    <div class="lg:col-span-1 flex-shrink-0">
                        <div class="betting-panel p-4 bg-gray-800/50 rounded-lg">
                            <h3 class="text-white font-semibold mb-3 text-sm sm:text-base">베팅</h3>
                            
                            <!-- 현재 상태 표시 (모바일 우선) -->
                            <div class="text-white text-xs sm:text-sm mb-3 p-2 bg-gray-700/50 rounded">
                                <div class="flex justify-between mb-1">
                                    <span>보유 GAM:</span>
                                    <span id="user-balance">-</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>현재 베팅:</span>
                                    <span id="current-bet">0 GAM</span>
                                </div>
                            </div>
                            
                            <!-- 베팅 입력 -->
                            <div class="mb-3">
                                <label class="block text-white text-xs sm:text-sm mb-1">베팅 금액</label>
                                <input type="number" id="bet-amount" class="betting-input w-full p-2 text-sm rounded bg-gray-700 text-white border border-gray-600" placeholder="10 - 10,000 GAM" min="10" max="10000">
                            </div>
                            
                            <!-- 베팅 버튼 -->
                            <div class="grid grid-cols-2 gap-2 mb-3">
                                <button class="bet-btn py-2 px-3 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded transition-colors" id="bet-btn">베팅하기</button>
                                <button class="cashout-btn py-2 px-3 text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed" id="cashout-btn" disabled>캐시아웃</button>
                            </div>
                            
                            <!-- 플레이어 목록 (모바일에서 축소) -->
                            <div class="players-list">
                                <h4 class="text-white font-semibold mb-2 text-xs sm:text-sm">플레이어 (<span id="player-count">0</span>)</h4>
                                <div id="players-container" class="max-h-20 sm:max-h-32 overflow-y-auto text-xs">
                                    <!-- 플레이어 목록이 여기에 표시됩니다 -->
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 게임 히스토리 (최소 간격) -->
                <div class="flex-shrink-0">
                    <h4 class="text-white font-semibold mb-0 text-sm">최근 결과</h4>
                    <div class="game-history flex gap-1 overflow-x-auto" id="game-history">
                        <!-- 게임 히스토리가 여기에 표시됩니다 -->
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 모달 종료 함수 (완전한 리소스 정리)
        const closeModal = () => {
            console.log('🗑️ Bustabit 모달 종료 시작...');
            
            // Bustabit 클라이언트 완전 정리
            if (this.bustabitClient) {
                try {
                    this.bustabitClient.destroy();
                } catch (error) {
                    console.error('Bustabit 클라이언트 정리 오류:', error);
                }
                this.bustabitClient = null;
            }
            
            // 모달 제거
            if (modal.parentNode) {
                document.body.removeChild(modal);
            }
            
            // 이벤트 리스너 정리
            document.removeEventListener('keydown', handleEscape);
            
            // 강제 가비지 콜렉션 (메모리 정리)
            if (window.gc) {
                window.gc();
            }
            
            console.log('✅ Bustabit 모달 및 리소스 완전 정리 완룼');
        };
        
        // 모달 이벤트 리스너
        document.getElementById('close-bustabit').addEventListener('click', closeModal);
        
        // ESC 키로 닫기
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // 모달 외부 클릭으로 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // Bustabit 게임 초기화
        this.initBustabitGame(modal);
    }
    
    initBustabitGame(modal) {
        // 실제 Bustabit 게임 클라이언트 초기화
        console.log('🎮 Bustabit 클라이언트 초기화 중...');
        
        // BustabitClient 인스턴스 생성
        this.bustabitClient = new BustabitClient();
        
        // 사용자 잔액 표시
        this.updateBustabitBalance(modal);
        
        // 게임 엔진이 자동으로 게임을 시작하므로 수동 시작 불필요
        console.log('✅ Bustabit 클라이언트 초기화 완료');
    }
    
    async updateBustabitBalance(modal) {
        try {
            const accessCheck = await MinigameGamIntegration.validateGameAccess('bustabit');
            if (accessCheck.canPlay) {
                const balanceElement = modal.querySelector('#user-balance');
                if (balanceElement) {
                    balanceElement.textContent = GAMFormatter.format(accessCheck.userBalance);
                }
            }
        } catch (error) {
            console.error('잔액 업데이트 실패:', error);
        }
    }
    
    
    showGameDetails(gameType) {
        const game = this.games[gameType];
        if (!game) return;
        
        console.log(`ℹ️ ${gameType} 게임 상세 정보 표시`);
        
        // 간단한 정보 모달 표시
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-md mx-4">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold">${game.name}</h3>
                    <button class="text-gray-500 hover:text-gray-700" onclick="this.parentElement.parentElement.parentElement.remove()">✕</button>
                </div>
                <p class="text-gray-600 mb-4">${game.description}</p>
                <div class="text-sm text-gray-500 space-y-1">
                    <div>최소 베팅: ${GAMFormatter.format(game.minBet)}</div>
                    <div>최대 베팅: ${GAMFormatter.format(game.maxBet)}</div>
                    <div>현재 플레이어: ${game.playerCount}명</div>
                    <div>상태: ${game.status === 'active' ? '이용 가능' : '준비 중'}</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 모달 외부 클릭시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }
    
    handleSearch(query) {
        console.log(`🔍 게임 검색: ${query}`);
        
        const gameCards = document.querySelectorAll('.game-card');
        gameCards.forEach(card => {
            const gameType = card.getAttribute('data-game');
            const game = this.games[gameType];
            
            if (game) {
                const searchText = `${game.name} ${game.description}`.toLowerCase();
                const isMatch = searchText.includes(query.toLowerCase());
                
                card.style.display = isMatch ? 'block' : 'none';
            }
        });
    }
    
    showLoginRequired() {
        this.showWarning('게임을 플레이하려면 로그인이 필요합니다');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
    }
    
    showComingSoon(gameName) {
        this.showNotification(`${gameName}은 곧 출시 예정입니다!`, 'warning');
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `game-notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
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
    
    // 완전한 리소스 정리 (메모리 누수 방지)
    destroy() {
        console.log('🗑️ MinigamesPage 정리 시작...');
        
        this.isDestroyed = true;
        
        // 모든 interval 정리
        this.intervals.forEach(interval => {
            try {
                clearInterval(interval);
            } catch (error) {
                console.error('Interval 정리 오류:', error);
            }
        });
        this.intervals = [];
        
        // 모든 timeout 정리
        this.timeouts.forEach(timeout => {
            try {
                clearTimeout(timeout);
            } catch (error) {
                console.error('Timeout 정리 오류:', error);
            }
        });
        this.timeouts = [];
        
        // 모든 이벤트 리스너 정리
        this.eventListeners.forEach(({ element, event, handler }) => {
            try {
                element.removeEventListener(event, handler);
            } catch (error) {
                console.error('이벤트 리스너 정리 오류:', error);
            }
        });
        this.eventListeners = [];
        
        // Bustabit 클라이언트 정리
        if (this.bustabitClient) {
            try {
                this.bustabitClient.destroy();
            } catch (error) {
                console.error('Bustabit 클라이언트 정리 오류:', error);
            }
            this.bustabitClient = null;
        }
        
        console.log('✅ MinigamesPage 리소스 완전 정리 완료');
    }
}

// 페이지 로드 시 초기화 (리소스 정리 포함)
document.addEventListener('DOMContentLoaded', () => {
    // 기존 인스턴스 정리
    if (window.minigamesPage) {
        try {
            window.minigamesPage.destroy();
        } catch (error) {
            console.error('기존 MinigamesPage 정리 오류:', error);
        }
    }
    
    window.minigamesPage = new MinigamesPage();
});

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
    if (window.minigamesPage) {
        try {
            window.minigamesPage.destroy();
        } catch (error) {
            console.error('MinigamesPage 언로드 정리 오류:', error);
        }
    }
});

// 페이지 숨김 시 리소스 절약
document.addEventListener('visibilitychange', () => {
    if (window.minigamesPage && document.hidden) {
        // 페이지가 숨겨지면 성능 최적화
        console.log('😴 페이지 비활성 - 성능 최적화 모드');
        
        // Bustabit 클라이언트 성능 모드 활성화
        if (window.minigamesPage.bustabitClient) {
            window.minigamesPage.bustabitClient.performanceMode = true;
        }
    } else if (window.minigamesPage && !document.hidden) {
        console.log('😄 페이지 활성 - 정상 모드');
        
        // 페이지가 다시 활성화되면 성능 모드 해제
        if (window.minigamesPage.bustabitClient) {
            window.minigamesPage.bustabitClient.performanceMode = false;
        }
    }
});

console.log('✅ 미니게임방 페이지 스크립트 로드 완료');