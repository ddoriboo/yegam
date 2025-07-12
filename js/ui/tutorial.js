// 예겜 온보딩 튜토리얼 시스템
class YegamTutorial {
    constructor() {
        this.driver = null;
        this.currentStep = 0;
        this.totalSteps = 7;
        this.isRunning = false;
        this.storageKey = 'yegam-tutorial-completed';
        this.init();
    }

    init() {
        // Driver.js 라이브러리가 로드되었는지 확인
        if (typeof window.driver === 'undefined') {
            console.warn('Driver.js가 로드되지 않았습니다. CDN을 확인해주세요.');
            return;
        }

        this.setupDriver();
        this.createTutorialButton();
        this.checkFirstVisit();
    }

    setupDriver() {
        const driverObj = window.driver || window.Driver;
        if (!driverObj) {
            console.warn('Driver.js not loaded properly');
            return;
        }

        this.driver = driverObj({
            overlayColor: 'rgba(0, 0, 0, 0.6)',
            popoverClass: 'yegam-tutorial-popover',
            showProgress: true,
            progressText: '{{current}} / {{total}}',
            nextBtnText: '다음',
            prevBtnText: '이전',
            doneBtnText: '완료',
            closeBtnText: '×',
            onDestroyed: () => {
                this.isRunning = false;
                this.markAsCompleted();
            },
            onPopoverRender: (popover, { config, state }) => {
                this.addProgressBar(popover, state);
            },
            onHighlightStarted: (element, step, options) => {
                console.log('Highlighting:', element);
            },
            onDeselected: (element, step, options) => {
                console.log('Deselected:', element);
            }
        });
    }

    addProgressBar(popover, state) {
        const { activeIndex = 0, totalElements = this.totalSteps } = state;
        const progress = ((activeIndex + 1) / totalElements) * 100;
        
        const progressContainer = document.createElement('div');
        progressContainer.className = 'driver-popover-progress';
        progressContainer.innerHTML = `
            <span>단계 ${activeIndex + 1} / ${totalElements}</span>
            <div class="driver-popover-progress-bar">
                <div class="driver-popover-progress-fill" style="width: ${progress}%"></div>
            </div>
        `;
        
        const description = popover.querySelector('.driver-popover-description');
        if (description) {
            description.insertAdjacentElement('afterend', progressContainer);
        }
    }

    getTutorialSteps() {
        const steps = [
            {
                element: 'body',
                popover: {
                    title: '🎮 예겜에 오신 것을 환영합니다!',
                    description: '예겜은 다양한 이슈에 대해 예측하고 GAM을 이용해 참여하는 예측 플랫폼입니다. 함께 주요 기능들을 살펴볼까요?',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '#header-user-actions',
                popover: {
                    title: '💰 GAM 잔액 & 출석 보상',
                    description: '로그인하면 여기서 GAM 잔액을 확인할 수 있어요. 매일 로그인하면 출석 보상으로 5,000 GAM을 받을 수 있습니다! 연속 출석할수록 더 많은 보너스도 있어요.',
                    side: 'bottom',
                    align: 'end'
                }
            }
        ];

        // 카테고리 필터가 있는 경우 추가
        if (document.querySelector('#category-filters') || document.querySelector('.category-filters')) {
            steps.push({
                element: '#category-filters, .category-filters',
                popover: {
                    title: '🏷️ 8개 카테고리',
                    description: '정치, 스포츠, 경제, 코인, 테크, 엔터, 날씨, 해외 등 8개 카테고리로 구분된 다양한 이슈들을 탐색해보세요.',
                    side: 'bottom',
                    align: 'center'
                }
            });
        }

        // 이슈 카드가 있는 경우 추가
        const issueCard = document.querySelector('.issue-card') || document.querySelector('[data-id]');
        if (issueCard) {
            steps.push({
                element: '.issue-card, [data-id]',
                popover: {
                    title: '📊 이슈 카드',
                    description: '각 이슈에서 Yes/No로 예측할 수 있어요. 실시간 확률, 총 참여 GAM, 참여 인원을 확인하고 베팅에 참여해보세요!',
                    side: 'top',
                    align: 'center'
                }
            });

            // 베팅 버튼이 있는 경우 추가
            if (document.querySelector('.bet-btn') || document.querySelector('.bg-green-600')) {
                steps.push({
                    element: '.bet-btn, .bg-green-600',
                    popover: {
                        title: '🎯 예측 참여하기',
                        description: 'Yes 또는 No 버튼을 클릭해서 예측에 참여하세요. 10~10,000 GAM 사이에서 베팅 금액을 선택할 수 있어요.',
                        side: 'top',
                        align: 'center'
                    }
                });
            }

            // 댓글 버튼이 있는 경우 추가
            if (document.querySelector('.comments-toggle-btn')) {
                steps.push({
                    element: '.comments-toggle-btn',
                    popover: {
                        title: '💬 토론 참여하기',
                        description: '이슈에 대한 의견을 댓글로 나누고, 좋아요를 누르거나 대댓글을 작성할 수 있어요. 다른 사용자들과 활발하게 소통해보세요!',
                        side: 'top',
                        align: 'center'
                    }
                });
            }
        }

        // 이슈 신청 버튼이 표시되어 있는 경우에만 추가
        const issueRequestBtn = document.querySelector('#desktop-issue-request-btn:not(.hidden)') || 
                               document.querySelector('#mobile-issue-request-btn:not(.hidden)');
        if (issueRequestBtn) {
            steps.push({
                element: '#desktop-issue-request-btn, #mobile-issue-request-btn',
                popover: {
                    title: '✏️ 이슈 신청하기',
                    description: '원하는 예측 주제가 없다면 직접 이슈를 신청해보세요! 관리자 검토 후 승인되면 다른 사용자들과 함께 예측할 수 있어요. (로그인 필요)',
                    side: 'bottom',
                    align: 'center'
                }
            });
        } else {
            // 이슈 신청 버튼이 없으면 설명만 추가
            steps.push({
                element: 'nav',
                popover: {
                    title: '✏️ 이슈 신청하기',
                    description: '로그인하면 네비게이션에 "이슈 신청" 버튼이 나타납니다. 원하는 예측 주제를 직접 제안해보세요!',
                    side: 'bottom',
                    align: 'center'
                }
            });
        }

        this.totalSteps = steps.length;
        return steps;
    }

    startTutorial() {
        if (this.isRunning || !this.driver) return;
        
        this.isRunning = true;
        this.currentStep = 0;
        
        const steps = this.getTutorialSteps();
        
        try {
            // Driver.js 1.3.1 방식으로 실행
            this.driver.setSteps(steps);
            this.driver.drive();
        } catch (error) {
            console.error('튜토리얼 시작 오류:', error);
            // 폴백: 단순 highlight 방식
            this.driver.highlight({
                element: steps[0].element,
                popover: steps[0].popover
            });
        }
    }

    createTutorialButton() {
        // 튜토리얼 시작 버튼이 이미 있는지 확인
        if (document.querySelector('.tutorial-start-btn')) return;

        const button = document.createElement('button');
        button.className = 'tutorial-start-btn';
        button.innerHTML = '?';
        button.title = '튜토리얼 시작하기';
        button.setAttribute('aria-label', '예겜 사용법 튜토리얼 시작하기');
        
        button.addEventListener('click', () => {
            this.showWelcomeModal();
        });

        document.body.appendChild(button);

        // 튜토리얼 완료 여부에 따라 버튼 표시/숨김
        if (this.isCompleted()) {
            button.style.opacity = '0.7';
        }
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
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    checkFirstVisit() {
        // 신규 사용자이고 로그인되어 있지 않은 경우 자동으로 환영 모달 표시
        if (!this.isCompleted() && !this.isLoggedIn()) {
            setTimeout(() => {
                this.showWelcomeModal();
            }, 2000); // 2초 후 표시
        }
    }

    isLoggedIn() {
        // 로그인 상태 확인 (기존 auth 시스템 활용)
        return localStorage.getItem('yegame-token') !== null;
    }

    isCompleted() {
        return localStorage.getItem(this.storageKey) === 'true';
    }

    markAsCompleted() {
        localStorage.setItem(this.storageKey, 'true');
        
        // 완료 알림 표시
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
        
        // 튜토리얼 버튼 스타일 초기화
        const button = document.querySelector('.tutorial-start-btn');
        if (button) {
            button.style.opacity = '1';
        }
    }

    // 특정 단계로 이동 (디버깅용)
    goToStep(stepIndex) {
        if (stepIndex >= 0 && stepIndex < this.totalSteps) {
            this.currentStep = stepIndex;
            const steps = this.getTutorialSteps();
            this.driver.highlight({
                element: steps[stepIndex].element,
                popover: steps[stepIndex].popover
            });
        }
    }
}

// 전역 접근을 위한 인스턴스 생성
window.yegamTutorial = null;

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', () => {
    // Driver.js가 로드되었는지 확인 후 초기화
    if (typeof window.driver !== 'undefined') {
        window.yegamTutorial = new YegamTutorial();
    } else {
        console.warn('Driver.js를 먼저 로드해주세요.');
    }
});

// 개발자 도구용 헬퍼 함수들
window.tutorialHelpers = {
    start: () => window.yegamTutorial?.showWelcomeModal(),
    reset: () => window.yegamTutorial?.resetTutorial(),
    complete: () => window.yegamTutorial?.markAsCompleted(),
    goToStep: (step) => window.yegamTutorial?.goToStep(step)
};

// 모듈 내보내기 (ES6 modules 사용 시)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = YegamTutorial;
}

export default YegamTutorial;