// 미니게임방 메인 페이지 관리
class MinigamesPage {
    constructor() {
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
        
        // 게임 플레이 버튼 클릭
        document.addEventListener('click', (e) => {
            if (e.target.matches('.game-play-btn')) {
                const gameType = e.target.getAttribute('data-game');
                this.handleGameStart(gameType);
            }
        });
        
        // 게임 카드 클릭 (상세 정보)
        document.addEventListener('click', (e) => {
            const gameCard = e.target.closest('.game-card');
            if (gameCard && !e.target.matches('.game-play-btn')) {
                const gameType = gameCard.getAttribute('data-game');
                this.showGameDetails(gameType);
            }
        });
        
        // 검색 기능
        const searchInput = document.getElementById('header-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }
    }
    
    async loadGameStats() {
        console.log('📊 게임 통계 로드 중...');
        
        try {
            // Bustabit 실시간 플레이어 수 로드
            const response = await fetch('/api/minigames/bustabit/state');
            const result = await response.json();
            
            if (result.success) {
                this.updateGameStats('bustabit', {
                    currentPlayers: result.gameState.playerCount,
                    gameState: result.gameState.gameState
                });
            }
        } catch (error) {
            console.error('게임 통계 로드 실패:', error);
        }
        
        // 주기적으로 업데이트 (5초마다)
        setInterval(() => {
            this.loadGameStats();
        }, 5000);
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
            <div class="bustabit-container max-w-6xl w-full mx-2 sm:mx-4 h-[95vh] flex flex-col">
                <!-- 헤더 -->
                <div class="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 class="text-2xl sm:text-3xl font-bold text-white">🚀 Bustabit</h2>
                    <button id="close-bustabit" class="text-white hover:text-gray-300 text-2xl">✕</button>
                </div>
                
                <!-- 메인 게임 영역 (모바일 최적화) -->
                <div class="flex-1 flex flex-col lg:grid lg:grid-cols-3 gap-4 min-h-0">
                    <!-- 그래프 영역 -->
                    <div class="lg:col-span-2 flex flex-col">
                        <!-- 배수 및 상태 표시 (모바일에서 상단) -->
                        <div class="flex justify-between items-center mb-2 lg:order-2">
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
                
                <!-- 게임 히스토리 (모바일에서 축소) -->
                <div class="mt-2 flex-shrink-0">
                    <h4 class="text-white font-semibold mb-2 text-sm">최근 결과</h4>
                    <div class="game-history flex gap-1 overflow-x-auto" id="game-history">
                        <!-- 게임 히스토리가 여기에 표시됩니다 -->
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 모달 이벤트 리스너
        document.getElementById('close-bustabit').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // ESC 키로 닫기
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
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
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    window.minigamesPage = new MinigamesPage();
});

console.log('✅ 미니게임방 페이지 스크립트 로드 완료');