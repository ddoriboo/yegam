// 예겜 온보딩 튜토리얼 시스템 (순수 JavaScript)
class YegamTutorial {
    constructor() {
        this.currentStep = 0;
        this.totalSteps = 0;
        this.isRunning = false;
        this.storageKey = 'yegam-tutorial-completed';
        this.overlay = null;
        this.tooltip = null;
        this.steps = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        console.log('🎯 예겜 튜토리얼 시스템 초기화 완료');
    }

    setupEventListeners() {
        // 데스크톱 튜토리얼 버튼
        const desktopBtn = document.getElementById('tutorial-btn');
        if (desktopBtn) {
            desktopBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showWelcomeModal();
            });
        }

        // 모바일 튜토리얼 버튼
        const mobileBtn = document.getElementById('mobile-tutorial-btn');
        if (mobileBtn) {
            mobileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showWelcomeModal();
            });
        }

        // ESC 키로 튜토리얼 종료
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isRunning) {
                this.endTutorial();
            }
        });

        console.log('✅ 튜토리얼 이벤트 리스너 설정 완료');
    }

    getTutorialSteps() {
        const currentPage = window.location.pathname;
        let steps = [];

        // 환영 단계
        steps.push({
            target: 'body',
            title: '🎮 예겜에 오신 것을 환영합니다!',
            content: '예겜은 다양한 이슈에 대해 예측하고 GAM을 이용해 참여하는 예측 플랫폼입니다. 함께 주요 기능들을 살펴볼까요?',
            position: 'center'
        });

        // 사용자 정보/GAM 잔액 설명
        const userActions = document.getElementById('header-user-actions');
        if (userActions && userActions.children.length > 0) {
            steps.push({
                target: '#header-user-actions',
                title: '💰 GAM 잔액 & 출석 보상',
                content: '로그인하면 여기서 GAM 잔액을 확인할 수 있어요. 매일 로그인하면 출석 보상으로 5,000 GAM을 받을 수 있습니다! 연속 출석할수록 더 많은 보너스도 있어요.',
                position: 'bottom'
            });
        } else {
            steps.push({
                target: '#header-user-actions',
                title: '💰 GAM 시스템',
                content: '로그인하면 여기에 GAM 잔액이 표시됩니다. 매일 로그인하여 출석 보상을 받고, 예측에 참여해보세요!',
                position: 'bottom'
            });
        }

        // 페이지별 특화 단계들
        if (currentPage.includes('index.html') || currentPage === '/') {
            this.addHomePageSteps(steps);
        } else if (currentPage.includes('issues.html')) {
            this.addIssuesPageSteps(steps);
        }

        // 이슈 신청 설명
        const issueRequestBtn = document.querySelector('#desktop-issue-request-btn:not(.hidden)') || 
                               document.querySelector('#mobile-issue-request-btn:not(.hidden)');
        if (issueRequestBtn) {
            steps.push({
                target: issueRequestBtn.id.includes('desktop') ? '#desktop-issue-request-btn' : '#mobile-issue-request-btn',
                title: '✏️ 이슈 신청하기',
                content: '원하는 예측 주제가 없다면 직접 이슈를 신청해보세요! 관리자 검토 후 승인되면 다른 사용자들과 함께 예측할 수 있어요.',
                position: 'bottom'
            });
        } else {
            steps.push({
                target: 'nav',
                title: '✏️ 이슈 신청하기',
                content: '로그인하면 네비게이션에 "이슈 신청" 버튼이 나타납니다. 원하는 예측 주제를 직접 제안해보세요!',
                position: 'bottom'
            });
        }

        this.steps = steps;
        this.totalSteps = steps.length;
        return steps;
    }

    addHomePageSteps(steps) {
        // 카테고리 필터 설명
        const categoryFilters = document.querySelector('#category-filters') || 
                               document.querySelector('.category-filters-desktop');
        if (categoryFilters) {
            steps.push({
                target: '#category-filters, .category-filters-desktop',
                title: '🏷️ 8개 카테고리',
                content: '정치, 스포츠, 경제, 코인, 테크, 엔터, 날씨, 해외 등 8개 카테고리로 구분된 다양한 이슈들을 탐색해보세요.',
                position: 'bottom'
            });
        }

        // 인기 이슈 목록 설명 (데스크톱)
        const popularList = document.querySelector('#popular-issues-list');
        if (popularList && popularList.children.length > 0) {
            steps.push({
                target: '#popular-issues-list',
                title: '⭐ 인기 이슈 목록',
                content: '가장 많은 관심을 받고 있는 인기 이슈들입니다. 클릭하면 해당 이슈로 바로 이동해요!',
                position: 'bottom'
            });
        }

        // 모바일 인기 이슈 설명
        const mobilePopular = document.querySelector('#popular-issues-mobile');
        if (mobilePopular && mobilePopular.children.length > 0 && window.innerWidth <= 768) {
            steps.push({
                target: '#popular-issues-mobile',
                title: '⭐ 인기 이슈 카드',
                content: '인기 이슈들을 좌우로 스크롤하며 둘러보세요. 각 카드를 터치하면 상세 정보를 볼 수 있어요!',
                position: 'bottom'
            });
        }

        // 전체 이슈 그리드 설명
        const allIssuesGrid = document.querySelector('#all-issues-grid');
        if (allIssuesGrid && allIssuesGrid.children.length > 0) {
            steps.push({
                target: '#all-issues-grid',
                title: '📊 예측 이슈 카드',
                content: '각 이슈에서 Yes/No로 예측할 수 있어요. 실시간 확률, 총 참여 GAM, 참여 인원을 확인하고 베팅에 참여해보세요!',
                position: 'top'
            });

            // 베팅 버튼 설명 (이슈 카드가 있을 때만)
            const betButtons = document.querySelectorAll('.bet-btn');
            if (betButtons.length > 0) {
                steps.push({
                    target: '.bet-btn',
                    title: '🎯 예측 참여하기',
                    content: 'Yes 또는 No 버튼을 클릭해서 예측에 참여하세요. 10~10,000 GAM 사이에서 베팅 금액을 선택할 수 있어요.',
                    position: 'top'
                });
            }

            // 댓글 버튼 설명
            const commentButtons = document.querySelectorAll('.comments-toggle-btn');
            if (commentButtons.length > 0) {
                steps.push({
                    target: '.comments-toggle-btn',
                    title: '💬 토론 참여하기',
                    content: '이슈에 대한 의견을 댓글로 나누고, 좋아요를 누르거나 대댓글을 작성할 수 있어요. 다른 사용자들과 활발하게 소통해보세요!',
                    position: 'top'
                });
            }
        }
    }

    addIssuesPageSteps(steps) {
        // 필터 설명
        const filters = document.querySelector('.filters-container');
        if (filters) {
            steps.push({
                target: '.filters-container',
                title: '🔍 필터 & 검색',
                content: '카테고리, 진행상태, 정렬 방식을 선택하여 원하는 이슈를 쉽게 찾을 수 있어요. 검색 기능도 활용해보세요!',
                position: 'bottom'
            });
        }

        // 이슈 그리드 설명
        const issueGrid = document.querySelector('#all-issues-grid');
        if (issueGrid && issueGrid.children.length > 0) {
            steps.push({
                target: '#all-issues-grid',
                title: '📊 전체 이슈 목록',
                content: '모든 예측 이슈가 카드 형태로 표시됩니다. 각 카드를 클릭해서 상세 정보를 확인하고 예측에 참여해보세요!',
                position: 'top'
            });
        }
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'tutorial-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(2px);
            z-index: 49999;
            pointer-events: none;
        `;
        document.body.appendChild(this.overlay);
    }

    createTooltip(step) {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'tutorial-tooltip';
        this.tooltip.style.cssText = `
            position: fixed;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 16px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            max-width: 360px;
            padding: 1.5rem;
            z-index: 50000;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        `;

        const progress = Math.round(((this.currentStep + 1) / this.totalSteps) * 100);
        
        this.tooltip.innerHTML = `
            <div class="tutorial-progress" style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: #6b7280; margin-bottom: 0.75rem;">
                <span>${this.currentStep + 1} / ${this.totalSteps}</span>
                <div style="flex: 1; height: 3px; background: #e5e7eb; border-radius: 2px; overflow: hidden;">
                    <div style="height: 100%; background: linear-gradient(90deg, #3b82f6, #1d4ed8); border-radius: 2px; width: ${progress}%; transition: width 0.3s ease;"></div>
                </div>
            </div>
            <h3 style="font-size: 1.125rem; font-weight: 600; color: #111827; margin-bottom: 0.5rem; line-height: 1.4;">${step.title}</h3>
            <p style="font-size: 0.875rem; color: #4b5563; line-height: 1.6; margin-bottom: 1rem;">${step.content}</p>
            <div style="display: flex; justify-content: space-between; gap: 0.75rem;">
                <button id="tutorial-prev" style="padding: 0.5rem 1rem; background: #f3f4f6; color: #6b7280; border: none; border-radius: 8px; font-size: 0.875rem; cursor: pointer; transition: all 0.2s ease;" ${this.currentStep === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>이전</button>
                <button id="tutorial-next" style="padding: 0.5rem 1rem; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; border-radius: 8px; font-size: 0.875rem; cursor: pointer; transition: all 0.2s ease;">${this.currentStep === this.totalSteps - 1 ? '완료' : '다음'}</button>
            </div>
        `;

        document.body.appendChild(this.tooltip);

        // 버튼 이벤트 리스너
        const prevBtn = this.tooltip.querySelector('#tutorial-prev');
        const nextBtn = this.tooltip.querySelector('#tutorial-next');

        if (prevBtn && !prevBtn.disabled) {
            prevBtn.addEventListener('click', () => this.prevStep());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (this.currentStep === this.totalSteps - 1) {
                    this.endTutorial();
                } else {
                    this.nextStep();
                }
            });
        }
    }

    highlightElement(selector) {
        // 기존 하이라이트 제거
        document.querySelectorAll('.tutorial-highlight').forEach(el => {
            el.classList.remove('tutorial-highlight');
        });

        if (selector === 'body') return;

        const element = document.querySelector(selector);
        if (element) {
            element.classList.add('tutorial-highlight');
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    positionTooltip(step) {
        if (!this.tooltip) return;

        const target = step.target === 'body' ? null : document.querySelector(step.target);
        
        if (!target || step.position === 'center') {
            // 화면 중앙에 배치
            this.tooltip.style.top = '50%';
            this.tooltip.style.left = '50%';
            this.tooltip.style.transform = 'translate(-50%, -50%)';
            return;
        }

        const rect = target.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();
        
        let top, left;

        switch (step.position) {
            case 'top':
                top = rect.top - tooltipRect.height - 16;
                left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'bottom':
                top = rect.bottom + 16;
                left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'left':
                top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
                left = rect.left - tooltipRect.width - 16;
                break;
            case 'right':
                top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
                left = rect.right + 16;
                break;
            default:
                top = rect.bottom + 16;
                left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        }

        // 화면 경계 체크 및 조정
        const margin = 16;
        const maxLeft = window.innerWidth - tooltipRect.width - margin;
        const maxTop = window.innerHeight - tooltipRect.height - margin;

        left = Math.max(margin, Math.min(left, maxLeft));
        top = Math.max(margin, Math.min(top, maxTop));

        this.tooltip.style.top = `${top}px`;
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.transform = 'none';
    }

    showStep(stepIndex) {
        const step = this.steps[stepIndex];
        if (!step) return;

        this.currentStep = stepIndex;

        // 기존 툴팁 제거
        if (this.tooltip) {
            this.tooltip.remove();
        }

        // 요소 하이라이트
        this.highlightElement(step.target);

        // 툴팁 생성 및 배치
        this.createTooltip(step);
        
        // 툴팁 위치 설정 (약간의 지연을 두어 렌더링 완료 대기)
        setTimeout(() => {
            this.positionTooltip(step);
        }, 10);
    }

    nextStep() {
        if (this.currentStep < this.totalSteps - 1) {
            this.showStep(this.currentStep + 1);
        }
    }

    prevStep() {
        if (this.currentStep > 0) {
            this.showStep(this.currentStep - 1);
        }
    }

    startTutorial() {
        if (this.isRunning) return;
        
        console.log('🎯 튜토리얼 시작');
        this.isRunning = true;
        this.currentStep = 0;
        
        this.getTutorialSteps();
        this.createOverlay();
        
        // 하이라이트 스타일 추가
        this.addHighlightStyles();
        
        this.showStep(0);
    }

    endTutorial() {
        console.log('✅ 튜토리얼 종료');
        this.isRunning = false;
        
        // 오버레이 제거
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        
        // 툴팁 제거
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }
        
        // 하이라이트 제거
        document.querySelectorAll('.tutorial-highlight').forEach(el => {
            el.classList.remove('tutorial-highlight');
        });
        
        // 완료 표시
        this.markAsCompleted();
    }

    addHighlightStyles() {
        if (document.querySelector('#tutorial-highlight-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'tutorial-highlight-styles';
        style.textContent = `
            .tutorial-highlight {
                position: relative !important;
                z-index: 50001 !important;
                box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.5) !important;
                border-radius: 8px !important;
                transition: all 0.3s ease !important;
            }
        `;
        document.head.appendChild(style);
    }

    showWelcomeModal() {
        const modal = document.createElement('div');
        modal.className = 'tutorial-welcome-modal';
        modal.innerHTML = `
            <div class="tutorial-welcome-content">
                <div class="tutorial-welcome-title">
                    🎮 예겜 사용법 안내
                </div>
                <div class="tutorial-welcome-subtitle">
                    예겜의 주요 기능들을 단계별로 알아보세요!
                </div>
                <div class="tutorial-welcome-features">
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">1</div>
                        <span>GAM 시스템 & 출석 보상 알아보기</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">2</div>
                        <span>8개 카테고리별 이슈 탐색하기</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">3</div>
                        <span>예측 참여하고 베팅하기</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">4</div>
                        <span>토론 참여하고 소통하기</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">5</div>
                        <span>이슈 신청하는 방법 배우기</span>
                    </div>
                </div>
                <div class="tutorial-welcome-actions">
                    <button class="tutorial-btn tutorial-btn-secondary" id="tutorial-skip">
                        나중에 하기
                    </button>
                    <button class="tutorial-btn tutorial-btn-primary" id="tutorial-start">
                        시작하기
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 버튼 이벤트 리스너
        modal.querySelector('#tutorial-start').addEventListener('click', () => {
            document.body.removeChild(modal);
            this.startTutorial();
        });

        modal.querySelector('#tutorial-skip').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // 모달 외부 클릭시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        // ESC 키로 닫기
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                if (document.body.contains(modal)) {
                    document.body.removeChild(modal);
                }
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    isCompleted() {
        return localStorage.getItem(this.storageKey) === 'true';
    }

    markAsCompleted() {
        localStorage.setItem(this.storageKey, 'true');
        this.showCompletionMessage();
    }

    showCompletionMessage() {
        const notification = document.createElement('div');
        notification.className = 'tutorial-completion-notification';
        notification.style.cssText = `
            position: fixed;
            top: 2rem;
            right: 2rem;
            background: rgba(16, 185, 129, 0.95);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(16, 185, 129, 0.3);
            z-index: 50001;
            font-weight: 500;
            animation: slideInFromRight 0.4s ease-out;
        `;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span>🎉</span>
                <span>튜토리얼을 완료했습니다!</span>
            </div>
        `;

        // 애니메이션 키프레임 추가
        if (!document.querySelector('#tutorial-animations')) {
            const style = document.createElement('style');
            style.id = 'tutorial-animations';
            style.textContent = `
                @keyframes slideInFromRight {
                    from { opacity: 0; transform: translateX(100%); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes slideOutToRight {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(100%); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // 3초 후 제거
        setTimeout(() => {
            notification.style.animation = 'slideOutToRight 0.4s ease-out forwards';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 400);
        }, 3000);
    }

    resetTutorial() {
        localStorage.removeItem(this.storageKey);
        this.currentStep = 0;
        console.log('🔄 튜토리얼 상태 초기화');
    }

    // 디버깅용 메서드
    goToStep(stepIndex) {
        if (stepIndex >= 0 && stepIndex < this.totalSteps && this.isRunning) {
            this.showStep(stepIndex);
        }
    }
}

// 전역 접근을 위한 인스턴스 생성
window.yegamTutorial = null;

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', () => {
    window.yegamTutorial = new YegamTutorial();
    console.log('🎯 예겜 튜토리얼 시스템 로드 완료');
});

// 개발자 도구용 헬퍼 함수들
window.tutorialHelpers = {
    start: () => window.yegamTutorial?.showWelcomeModal(),
    reset: () => window.yegamTutorial?.resetTutorial(),
    complete: () => window.yegamTutorial?.markAsCompleted(),
    goToStep: (step) => window.yegamTutorial?.goToStep(step),
    isRunning: () => window.yegamTutorial?.isRunning,
    currentStep: () => window.yegamTutorial?.currentStep
};

// 모듈 내보내기 (ES6 modules 사용 시)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = YegamTutorial;
}

export default YegamTutorial;