// 프리미엄 베팅 모달 시스템
class BettingModal {
    constructor() {
        this.modal = null;
        this.isOpen = false;
        this.currentIssueId = null;
        this.currentChoice = null;
        this.currentUser = null;
        this.selectedAmount = 1000;
        this.maxAmount = 0;
        this.currentOdds = { yesOdds: 2.0, noOdds: 2.0 }; // 기본값
        
        this.createModal();
        this.setupEventListeners();
    }
    
    createModal() {
        // 모달 HTML 생성
        const modalHTML = `
            <div id="betting-modal" class="betting-modal hidden">
                <div class="betting-modal-backdrop"></div>
                <div class="betting-modal-container">
                    <div class="betting-modal-content">
                        <!-- 헤더 -->
                        <div class="betting-modal-header">
                            <div class="betting-modal-title">
                                <div class="betting-icon">🎯</div>
                                <h2>예측 참여</h2>
                            </div>
                            <button class="betting-modal-close" id="betting-modal-close">
                                <i data-lucide="x" class="w-6 h-6"></i>
                            </button>
                        </div>
                        
                        <!-- 이슈 정보 -->
                        <div class="betting-issue-info">
                            <div class="betting-choice-display">
                                <span id="betting-choice-text">Yes</span>에 베팅하시겠습니까?
                            </div>
                            <div class="betting-issue-title" id="betting-issue-title">
                                <!-- 이슈 제목이 여기에 표시됩니다 -->
                            </div>
                        </div>
                        
                        <!-- GAM 잔액 표시 -->
                        <div class="betting-balance">
                            <div class="balance-label">보유 GAM</div>
                            <div class="balance-amount">
                                <div class="coin-icon">🪙</div>
                                <span id="betting-balance-amount">0</span>
                            </div>
                        </div>
                        
                        <!-- 베팅 금액 슬라이더 -->
                        <div class="betting-amount-section">
                            <div class="amount-label">베팅 금액</div>
                            <div class="amount-display">
                                <span id="betting-amount-display">1,000</span> GAM
                            </div>
                            <div class="amount-slider-container">
                                <input type="range" 
                                       id="betting-amount-slider" 
                                       class="betting-slider"
                                       min="100" 
                                       max="10000" 
                                       value="1000"
                                       step="100">
                                <div class="slider-marks">
                                    <span>100</span>
                                    <span>1K</span>
                                    <span>5K</span>
                                    <span>10K+</span>
                                </div>
                            </div>
                            
                            <!-- 퀵 선택 버튼들 -->
                            <div class="quick-amount-buttons">
                                <button class="quick-amount-btn" data-amount="1000">1K</button>
                                <button class="quick-amount-btn" data-amount="5000">5K</button>
                                <button class="quick-amount-btn" data-amount="10000">10K</button>
                                <button class="quick-amount-btn" data-amount="max">MAX</button>
                            </div>
                        </div>
                        
                        <!-- 예상 수익률 -->
                        <div class="betting-prediction">
                            <div class="prediction-label">예상 수익</div>
                            <div class="prediction-amount">
                                <span id="betting-prediction-amount">+2,000</span> GAM
                            </div>
                            <div class="prediction-odds">
                                <span id="betting-odds">2.0x</span> 배수
                            </div>
                        </div>
                        
                        <!-- 베팅 버튼 -->
                        <div class="betting-actions">
                            <button class="betting-cancel-btn" id="betting-cancel">취소</button>
                            <button class="betting-confirm-btn" id="betting-confirm">
                                <div class="btn-content">
                                    <span class="btn-icon">🚀</span>
                                    <span class="btn-text">베팅 확정</span>
                                </div>
                                <div class="btn-glow"></div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // DOM에 추가
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('betting-modal');
    }
    
    setupEventListeners() {
        // 모달 닫기
        document.getElementById('betting-modal-close').addEventListener('click', () => this.close());
        document.getElementById('betting-cancel').addEventListener('click', () => this.close());
        
        // 백드롭 클릭으로 닫기
        this.modal.querySelector('.betting-modal-backdrop').addEventListener('click', () => this.close());
        
        // 슬라이더 이벤트
        const slider = document.getElementById('betting-amount-slider');
        slider.addEventListener('input', (e) => this.updateAmount(parseInt(e.target.value)));
        
        // 퀵 선택 버튼들
        document.querySelectorAll('.quick-amount-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const amount = e.target.dataset.amount;
                if (amount === 'max') {
                    this.updateAmount(this.maxAmount);
                } else {
                    this.updateAmount(parseInt(amount));
                }
            });
        });
        
        // 베팅 확정
        document.getElementById('betting-confirm').addEventListener('click', () => this.confirmBet());
        
        // ESC 키로 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }
    
    async open(issueId, choice, issueTitle, currentUser) {
        this.currentIssueId = issueId;
        this.currentChoice = choice;
        this.currentUser = currentUser;
        this.maxAmount = Math.min(currentUser.gam_balance || currentUser.coins || 0, 50000);
        
        // 모달 정보 업데이트
        document.getElementById('betting-choice-text').textContent = choice;
        document.getElementById('betting-choice-text').className = `choice-${choice.toLowerCase()}`;
        document.getElementById('betting-issue-title').textContent = issueTitle;
        document.getElementById('betting-balance-amount').textContent = (currentUser.gam_balance || currentUser.coins || 0).toLocaleString();
        
        // 슬라이더 범위 설정
        const slider = document.getElementById('betting-amount-slider');
        slider.max = this.maxAmount;
        slider.value = Math.min(1000, this.maxAmount);
        
        // 배당률 정보 로드
        await this.loadBettingOdds();
        
        this.updateAmount(parseInt(slider.value));
        
        // 모달 표시
        this.modal.classList.remove('hidden');
        this.modal.classList.add('show');
        this.isOpen = true;
        
        // 포커스
        document.getElementById('betting-amount-slider').focus();
        
        // 바디 스크롤 방지
        document.body.style.overflow = 'hidden';
    }
    
    close() {
        this.modal.classList.remove('show');
        this.modal.classList.add('hiding');
        
        setTimeout(() => {
            this.modal.classList.add('hidden');
            this.modal.classList.remove('hiding');
            this.isOpen = false;
            
            // 바디 스크롤 복원
            document.body.style.overflow = '';
        }, 300);
    }
    
    async loadBettingOdds() {
        try {
            const response = await fetch(`/api/issues/${this.currentIssueId}/betting-stats`);
            const data = await response.json();
            
            if (data.success && data.stats) {
                this.currentOdds = {
                    yesOdds: data.stats.yesOdds || 2.0,
                    noOdds: data.stats.noOdds || 2.0
                };
                console.log('배당률 로드 완료:', this.currentOdds);
            } else {
                console.warn('배당률 로드 실패, 기본값 사용');
                this.currentOdds = { yesOdds: 2.0, noOdds: 2.0 };
            }
        } catch (error) {
            console.error('배당률 로드 오류:', error);
            this.currentOdds = { yesOdds: 2.0, noOdds: 2.0 };
        }
    }
    
    updateAmount(amount) {
        this.selectedAmount = Math.max(100, Math.min(amount, this.maxAmount));
        
        // 디스플레이 업데이트
        document.getElementById('betting-amount-display').textContent = this.selectedAmount.toLocaleString();
        document.getElementById('betting-amount-slider').value = this.selectedAmount;
        
        // 동적 배당률을 기반으로 예상 수익 계산
        const currentOdds = this.currentChoice === 'Yes' ? this.currentOdds.yesOdds : this.currentOdds.noOdds;
        const expectedReturn = Math.round(this.selectedAmount * currentOdds);
        const profit = expectedReturn - this.selectedAmount;
        
        document.getElementById('betting-prediction-amount').textContent = `+${profit.toLocaleString()}`;
        document.getElementById('betting-odds').textContent = `${currentOdds.toFixed(2)}x`;
        
        // 퀵 버튼 활성화 상태 업데이트
        document.querySelectorAll('.quick-amount-btn').forEach(btn => {
            btn.classList.remove('active');
            const btnAmount = btn.dataset.amount;
            if ((btnAmount === 'max' && this.selectedAmount === this.maxAmount) ||
                (btnAmount !== 'max' && parseInt(btnAmount) === this.selectedAmount)) {
                btn.classList.add('active');
            }
        });
    }
    
    async confirmBet() {
        const confirmBtn = document.getElementById('betting-confirm');
        const originalContent = confirmBtn.innerHTML;
        
        // 로딩 상태
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `
            <div class="btn-content">
                <span class="btn-spinner">⏳</span>
                <span class="btn-text">처리중...</span>
            </div>
        `;
        
        try {
            // 베팅 API 호출
            const response = await fetch('/api/bets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('yegame-token')}`
                },
                body: JSON.stringify({
                    userId: this.currentUser.id,
                    issueId: this.currentIssueId,
                    choice: this.currentChoice,
                    amount: this.selectedAmount
                })
            });
            
            const data = await response.json();
            
            if (data.success || response.ok) {
                // 성공 애니메이션 실행
                this.close();
                await this.showSuccessAnimation();
                
                // 사용자 정보 업데이트
                if (data.currentBalance !== undefined) {
                    this.currentUser.gam_balance = data.currentBalance;
                    this.currentUser.coins = data.currentBalance;
                    
                    // 전역 currentUser 객체도 업데이트
                    if (typeof window.currentUser === 'object' && window.currentUser) {
                        window.currentUser.gam_balance = data.currentBalance;
                        window.currentUser.coins = data.currentBalance;
                    }
                    
                    // 헤더의 잔액 직접 업데이트 (더 구체적인 선택자 사용)
                    const balanceContainer = document.querySelector('#header-user-actions .bg-white.px-3.py-1\\.5');
                    if (balanceContainer) {
                        const balanceSpan = balanceContainer.querySelector('span.font-semibold');
                        if (balanceSpan) {
                            balanceSpan.textContent = data.currentBalance.toLocaleString();
                        }
                    }
                    
                    // 헤더 업데이트 함수 호출 (백업)
                    if (typeof updateHeader === 'function') {
                        updateHeader(true);
                    }
                    
                    console.log('GAM 잔액 업데이트:', data.currentBalance);
                }
                
                // 페이지별 새로고침 (이슈 목록 업데이트)
                const currentPath = window.location.pathname.split("/").pop();
                if (currentPath === 'issues.html') {
                    // Issues 페이지: 필터 상태 유지하며 목록만 새로고침
                    try {
                        const response = await fetch('/api/issues');
                        const issueData = await response.json();
                        if (issueData.success) {
                            window.allIssues = issueData.issues;
                            window.issues = issueData.issues;
                            
                            if (typeof renderAllIssuesOnPage === 'function') {
                                renderAllIssuesOnPage();
                            } else {
                                await initIssuesPage();
                            }
                        }
                    } catch (error) {
                        console.error('Failed to reload issues:', error);
                        await initIssuesPage();
                    }
                } else if (typeof initHomePage === 'function') {
                    await initHomePage();
                } else if (typeof loadIssues === 'function') {
                    loadIssues();
                }
                
            } else {
                throw new Error(data.message || '베팅 처리에 실패했습니다.');
            }
            
        } catch (error) {
            console.error('베팅 실패:', error);
            alert('베팅 처리 중 오류가 발생했습니다: ' + error.message);
            
            // 버튼 복원
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = originalContent;
        }
    }
    
    async showSuccessAnimation() {
        return new Promise((resolve) => {
            // 코인 폭발 애니메이션 실행
            if (typeof window.CoinExplosion !== 'undefined') {
                window.CoinExplosion.explode();
            }
            
            // 성공 메시지 표시
            const successOverlay = document.createElement('div');
            successOverlay.className = 'betting-success-overlay';
            successOverlay.innerHTML = `
                <div class="success-content">
                    <div class="success-icon">🎉</div>
                    <div class="success-title">베팅 성공!</div>
                    <div class="success-amount">-${this.selectedAmount.toLocaleString()} GAM</div>
                </div>
            `;
            
            document.body.appendChild(successOverlay);
            
            // 애니메이션 후 제거
            setTimeout(() => {
                successOverlay.classList.add('fade-out');
                setTimeout(() => {
                    document.body.removeChild(successOverlay);
                    resolve();
                }, 500);
            }, 2000);
        });
    }
}

// 전역 인스턴스 생성
window.bettingModal = new BettingModal();

// 전역 함수로 노출 (기존 코드 호환성)
window.openBettingModal = (issueId, choice, issueTitle, currentUser) => {
    window.bettingModal.open(issueId, choice, issueTitle, currentUser);
};