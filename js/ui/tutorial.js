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
        // 즉시 이벤트 리스너 설정 시도
        this.setupEventListeners();
        
        // DOM이 완전히 로드된 후 다시 시도
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupEventListeners();
            });
        }
        
        // 조금 더 기다린 후 다시 시도 (다른 스크립트가 DOM을 변경할 수 있음)
        setTimeout(() => {
            this.setupEventListeners();
        }, 1000);
        
        console.log('🎯 예겜 튜토리얼 시스템 초기화 완료');
    }

    setupEventListeners() {
        console.log('🔧 튜토리얼 이벤트 리스너 설정 시도...');

        // ESC 키로 튜토리얼 종료
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isRunning) {
                console.log('⌨️ ESC 키로 튜토리얼 종료');
                this.endTutorial();
            }
        });

        // about.html 페이지 내 "사용법 배우기" 버튼
        const startTutorialBtn = document.getElementById('start-tutorial-btn');
        console.log('🎯 사용법 배우기 버튼 찾기:', startTutorialBtn ? '성공' : '실패');
        
        if (startTutorialBtn) {
            // 기존 리스너 제거 (중복 방지)
            startTutorialBtn.removeEventListener('click', this.handleStartTutorialClick);
            // 새 리스너 추가
            startTutorialBtn.addEventListener('click', this.handleStartTutorialClick.bind(this));
            console.log('✅ 사용법 배우기 버튼 이벤트 리스너 설정 완료');
            
            // 버튼에 시각적 피드백 추가
            startTutorialBtn.style.cursor = 'pointer';
            startTutorialBtn.title = '예겜 사용법 튜토리얼을 시작합니다';
            
            // 강제로 이벤트 리스너 재설정 (다중 보장)
            setTimeout(() => {
                startTutorialBtn.removeEventListener('click', this.handleStartTutorialClick);
                startTutorialBtn.addEventListener('click', this.handleStartTutorialClick.bind(this));
                console.log('🔄 사용법 배우기 버튼 이벤트 리스너 재설정 완료');
            }, 500);
        }

        // 전역 직접 호출 함수 설정 (onclick 폴백용)
        window.startTutorialDirectly = () => {
            console.log('🚀 직접 호출로 튜토리얼 시작');
            this.handleStartTutorialClick({ 
                target: document.getElementById('start-tutorial-btn'),
                preventDefault: () => {},
                stopPropagation: () => {}
            });
        };

        // 전역 클릭 디버깅 (개발용)
        if (!this.globalClickSetup) {
            document.addEventListener('click', (e) => {
                if (e.target.id === 'start-tutorial-btn') {
                    console.log('🖱️ 사용법 배우기 버튼 클릭 감지:', e.target.id, e.target.textContent);
                    console.log('🔍 이벤트 객체:', e);
                }
            });
            this.globalClickSetup = true;
        }

        console.log('✅ 튜토리얼 이벤트 리스너 설정 완료');
    }


    handleStartTutorialClick(e) {
        console.log('🎯 사용법 배우기 버튼 클릭됨!', e.target?.id || 'direct call');
        
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        
        // 버튼 클릭 시각적 피드백
        const btn = e.target || document.getElementById('start-tutorial-btn');
        if (btn) {
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => {
                btn.style.transform = 'scale(1)';
            }, 100);
        }
        
        console.log('📋 튜토리얼 환영 모달 표시 시작...');
        // 튜토리얼 모달 표시
        this.showWelcomeModal();
    }

    getTutorialSteps() {
        const currentPage = window.location.pathname;
        let steps = [];

        // 환영 단계
        steps.push({
            target: 'body',
            title: '🎮 예겜에 오신 것을 환영합니다!',
            content: '예겜은 12가지 핵심 기능을 가진 종합 예측 플랫폼입니다. GAM 시스템부터 커뮤니티까지, 모든 기능을 마스터해보세요! 🚀',
            position: 'center'
        });

        // 헤더 네비게이션 설명
        steps.push({
            target: 'nav',
            title: '🧭 스마트 네비게이션',
            content: '예겜의 모든 기능에 쉽게 접근할 수 있는 네비게이션입니다. 예겜 소개, 전체 이슈, 분석방, 업적 안내 등을 확인하세요!',
            position: 'bottom'
        });

        // 검색 기능 설명
        const searchBtn = document.getElementById('header-search-btn');
        if (searchBtn) {
            steps.push({
                target: '#header-search-btn',
                title: '🔍 고급 검색 시스템',
                content: '이슈 제목으로 빠른 검색이 가능합니다. 실시간 자동완성과 필터링으로 원하는 이슈를 쉽게 찾아보세요!',
                position: 'bottom'
            });
        }

        // 사용자 정보/GAM 잔액 설명 (더 자세히)
        const userActions = document.getElementById('header-user-actions');
        if (userActions && userActions.children.length > 0) {
            steps.push({
                target: '#header-user-actions',
                title: '💰 GAM 시스템 마스터하기',
                content: '💎 GAM 잔액 확인, 📅 출석 체크, 🔔 알림 관리가 모두 여기서! 매일 출석하면 5,000 GAM + 연속 출석 보너스까지! 최대 99,999,999 GAM까지 모을 수 있어요.',
                position: 'bottom'
            });
        } else {
            steps.push({
                target: '#header-user-actions',
                title: '💰 GAM 시스템의 모든 것',
                content: '🎁 신규 가입시 10,000 GAM 지급! 📅 매일 출석 보상 5,000 GAM! 🏆 베팅 성공시 수익 획득! 로그인하면 여기에 GAM 잔액과 모든 기능이 표시됩니다.',
                position: 'bottom'
            });
        }

        // 모바일 메뉴 설명 (모바일에서만)
        if (window.innerWidth <= 768) {
            const mobileMenuBtn = document.getElementById('mobile-menu-btn');
            if (mobileMenuBtn) {
                steps.push({
                    target: '#mobile-menu-btn',
                    title: '📱 모바일 최적화 메뉴',
                    content: '모바일에서도 모든 기능을 편리하게! 햄버거 메뉴를 터치하면 전체 네비게이션이 나타납니다.',
                    position: 'bottom'
                });
            }
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
                title: '✏️ 이슈 신청 프로세스 완전정복',
                content: '📝 이슈 제목, 설명, 카테고리, 마감일 설정까지! 💡 창의적인 예측 주제를 제안하고 커뮤니티를 활성화하세요. 승인되면 최초 제안자 특전도 있어요!',
                position: 'bottom'
            });
        } else {
            steps.push({
                target: 'nav',
                title: '✏️ 이슈 신청의 모든 것',
                content: '🔐 로그인하면 "이슈 신청" 버튼이 활성화됩니다! 📋 상세한 가이드라인과 함께 누구나 쉽게 이슈를 제안할 수 있어요.',
                position: 'bottom'
            });
        }

        // 추가 기능들 설명
        this.addAdvancedFeatureSteps(steps);

        this.steps = steps;
        this.totalSteps = steps.length;
        return steps;
    }

    addHomePageSteps(steps) {
        // 정렬 옵션 설명
        const sortSelect = document.querySelector('#sort-select');
        if (sortSelect) {
            steps.push({
                target: '#sort-select',
                title: '📊 스마트 정렬 시스템',
                content: '🔥 인기순: 가장 HOT한 이슈들! ⏰ 최신순: 따끈따끈한 신규 이슈! 🚨 마감임박순: 놓치면 안 되는 이슈들! 📈 참여량순: 대규모 베팅 이슈들!',
                position: 'bottom'
            });
        }

        // 카테고리 필터 설명 (더 상세히)
        const categoryFilters = document.querySelector('#category-filters') || 
                               document.querySelector('.category-filters-desktop');
        if (categoryFilters) {
            steps.push({
                target: '#category-filters, .category-filters-desktop',
                title: '🏷️ 8개 카테고리 완전정복',
                content: '🏛️ 정치: 선거, 정책 예측 | ⚽ 스포츠: 경기 결과, 기록 | 💹 경제: 주가, 환율 | 🪙 코인: 암호화폐 | 💻 테크: IT 혁신 | 🎭 엔터: 연예계 이슈 | 🌤️ 날씨: 기상 예보 | 🌍 해외: 글로벌 이슈',
                position: 'bottom'
            });
        }

        // 인기 이슈 목록 설명 (데스크톱)
        const popularList = document.querySelector('#popular-issues-list');
        if (popularList && popularList.children.length > 0) {
            steps.push({
                target: '#popular-issues-list',
                title: '⭐ 인기 이슈 HOT 랭킹',
                content: '🔥 실시간 HOT 이슈들의 치열한 순위! 📊 참여자 수, GAM 규모, 댓글 활동을 종합한 인기도! 💡 트렌드를 읽고 기회를 잡으세요!',
                position: 'bottom'
            });
        }

        // 모바일 인기 이슈 설명
        const mobilePopular = document.querySelector('#popular-issues-mobile');
        if (mobilePopular && mobilePopular.children.length > 0 && window.innerWidth <= 768) {
            steps.push({
                target: '#popular-issues-mobile',
                title: '⭐ 모바일 인기 이슈 캐러셀',
                content: '📱 좌우 스와이프로 인기 이슈 탐색! 🎯 터치 한 번으로 즉시 베팅! ⚡ 빠르고 직관적인 모바일 경험을 즐기세요!',
                position: 'bottom'
            });
        }

        // 전체 이슈 그리드 설명
        const allIssuesGrid = document.querySelector('#all-issues-grid');
        if (allIssuesGrid && allIssuesGrid.children.length > 0) {
            steps.push({
                target: '#all-issues-grid',
                title: '📊 실시간 이슈 대시보드',
                content: '💡 각 카드는 살아있는 정보! 📈 실시간 확률 변동, 💰 GAM 풀 규모, 👥 참여자 수, ⏰ 마감 카운트다운까지! 모든 정보가 실시간으로 업데이트됩니다!',
                position: 'top'
            });

            // 베팅 버튼 설명 (이슈 카드가 있을 때만)
            const betButtons = document.querySelectorAll('.bet-btn');
            if (betButtons.length > 0) {
                steps.push({
                    target: '.bet-btn',
                    title: '🎯 스마트 베팅 시스템',
                    content: '💚 YES 버튼: 긍정적 예측! ❤️ NO 버튼: 부정적 예측! 💰 10~10,000 GAM 자유 선택! 🧠 전략적 베팅으로 수익 극대화하세요!',
                    position: 'top'
                });
            }

            // 댓글 버튼 설명
            const commentButtons = document.querySelectorAll('.comments-toggle-btn');
            if (commentButtons.length > 0) {
                steps.push({
                    target: '.comments-toggle-btn',
                    title: '💬 완전한 토론 생태계',
                    content: '💭 댓글, 대댓글 무제한! 👍 좋아요로 공감 표현! 🔥 실시간 토론 참여! 📊 댓글 수가 많을수록 더 뜨거운 이슈! 커뮤니티의 지혜를 나누세요!',
                    position: 'top'
                });
            }

            // 추가: 방문자 통계 설명 (홈페이지 하단)
            const visitorStats = document.querySelector('#today-visitors-count');
            if (visitorStats) {
                steps.push({
                    target: '#today-visitors-count',
                    title: '📊 실시간 커뮤니티 활동 지표',
                    content: '👥 오늘 방문자와 총 방문자 수를 실시간 확인! 📈 활발한 커뮤니티 규모를 체감하세요! 더 많은 사람들과 함께할수록 더 정확한 예측이 가능합니다!',
                    position: 'top'
                });
            }
        }
    }

    addIssuesPageSteps(steps) {
        // 필터 설명 (더 상세히)
        const filters = document.querySelector('.filters-container');
        if (filters) {
            steps.push({
                target: '.filters-container',
                title: '🔍 고급 필터링 & 검색 마스터',
                content: '📊 정렬: 인기순/최신순/마감임박순/참여량순 | 🏷️ 카테고리: 8개 분야별 필터 | ⏰ 시간: 1시간~1개월 범위 | 🔎 실시간 검색으로 정확한 이슈를 찾아보세요!',
                position: 'bottom'
            });
        }

        // 이슈 그리드 설명 (더 상세히)
        const issueGrid = document.querySelector('#all-issues-grid');
        if (issueGrid && issueGrid.children.length > 0) {
            steps.push({
                target: '#all-issues-grid',
                title: '📊 스마트 이슈 카드 시스템',
                content: '💡 실시간 확률, 참여 GAM, 참여 인원을 한눈에! 📈 확률 변화 추이, 💬 댓글 수, ⏰ 마감 임박 표시까지! 각 카드는 실시간으로 업데이트됩니다.',
                position: 'top'
            });
        }
    }

    addAdvancedFeatureSteps(steps) {
        // 마이페이지 기능 설명
        const mypageLink = document.querySelector('a[href="mypage.html"]');
        if (mypageLink) {
            steps.push({
                target: 'a[href="mypage.html"]',
                title: '📊 내 정보 & 베팅 통계 분석',
                content: '📈 승률, 수익률, 베팅 내역을 한눈에! 🏆 달성한 업적과 티어 확인! 👤 프로필 관리와 설정 변경까지! 나만의 예측 데이터를 분석해보세요.',
                position: 'bottom'
            });
        }

        // 티어 가이드 설명
        const tierGuideLink = document.querySelector('a[href="tier_guide.html"]');
        if (tierGuideLink) {
            steps.push({
                target: 'a[href="tier_guide.html"]',
                title: '🏆 티어 시스템 & 업적 달성 방법',
                content: '🥉 브론즈부터 🏆 마스터까지! 예측 성과에 따른 티어 승급 시스템! 🎯 다양한 업적과 특별 보상! 전략적 베팅으로 최고 티어에 도전하세요!',
                position: 'bottom'
            });
        }

        // 분석방 커뮤니티 설명
        const discussionsLink = document.querySelector('a[href="discussions.html"]');
        if (discussionsLink) {
            steps.push({
                target: 'a[href="discussions.html"]',
                title: '🎮 분석방 커뮤니티 참여하기',
                content: '💬 심층 토론과 분석 공유! 📊 전문가들의 예측 인사이트! 🤝 커뮤니티 멤버들과 정보 교환! 단순 베팅을 넘어 분석의 재미를 느껴보세요!',
                position: 'bottom'
            });
        }

        // 15-17단계 제거됨 (사용자 요청)
        
        // 18단계: 마지막 마무리 단계 (완료 시 특별 보상)
        steps.push({
            target: 'body',
            title: '🎉 예겜 마스터 완성!',
            content: '축하합니다! 예겜의 모든 기능을 완전히 마스터했습니다! 🎁 특별 완주 보상으로 10,000 GAM을 드립니다! 지금 바로 첫 베팅에 도전해보세요!',
            position: 'center',
            isLastStep: true
        });
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
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(2px);
            z-index: 49999;
            pointer-events: none;
            transition: all 0.3s ease;
        `;
        document.body.appendChild(this.overlay);
    }

    createSpotlight(targetElement) {
        if (!targetElement || targetElement === document.body) return;
        
        const rect = targetElement.getBoundingClientRect();
        const spotlight = document.createElement('div');
        spotlight.className = 'tutorial-spotlight';
        spotlight.style.cssText = `
            position: fixed;
            top: ${rect.top - 10}px;
            left: ${rect.left - 10}px;
            width: ${rect.width + 20}px;
            height: ${rect.height + 20}px;
            background: transparent;
            border-radius: 12px;
            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.8);
            z-index: 50000;
            pointer-events: none;
            transition: all 0.5s ease;
        `;
        
        if (this.spotlight) {
            this.spotlight.remove();
        }
        this.spotlight = spotlight;
        document.body.appendChild(spotlight);
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
                <div style="display: flex; gap: 0.5rem;">
                    <button id="tutorial-skip" style="padding: 0.5rem 1rem; background: transparent; color: #6b7280; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 0.875rem; cursor: pointer; transition: all 0.2s ease;">나중에</button>
                    <button id="tutorial-next" style="padding: 0.5rem 1rem; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; border-radius: 8px; font-size: 0.875rem; cursor: pointer; transition: all 0.2s ease;">${this.currentStep === this.totalSteps - 1 ? '완료' : '다음'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.tooltip);

        // 버튼 이벤트 리스너
        const prevBtn = this.tooltip.querySelector('#tutorial-prev');
        const nextBtn = this.tooltip.querySelector('#tutorial-next');
        const skipBtn = this.tooltip.querySelector('#tutorial-skip');

        if (prevBtn && !prevBtn.disabled) {
            prevBtn.addEventListener('click', () => this.prevStep());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (this.currentStep === this.totalSteps - 1) {
                    this.completeTutorialWithReward();
                } else {
                    this.nextStep();
                }
            });
        }

        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                console.log('🔚 튜토리얼 나중에 하기 선택');
                this.endTutorial();
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

        // 요소 하이라이트 및 스포트라이트
        const targetElement = step.target === 'body' ? null : document.querySelector(step.target);
        this.highlightElement(step.target);
        this.createSpotlight(targetElement);

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

    startInteractiveTutorial() {
        console.log('🎮 인터랙티브 튜토리얼 시작');
        
        // 현재 페이지가 about.html이면 홈페이지로 이동
        if (window.location.pathname.includes('about.html')) {
            console.log('📍 홈페이지로 이동하여 실제 UI에서 튜토리얼 진행');
            
            // 튜토리얼 모드 플래그 설정
            sessionStorage.setItem('tutorial-mode', 'true');
            sessionStorage.setItem('tutorial-step', '0');
            
            // 홈페이지로 이동
            window.location.href = 'index.html';
            return;
        }
        
        // 이미 홈페이지에 있다면 바로 시작
        this.startTutorial();
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

    async completeTutorialWithReward() {
        console.log('🎉 튜토리얼 완료 - 특별 보상 지급!');
        
        // 먼저 일반 종료 처리
        this.cleanupTutorial();
        
        try {
            // 1. 폭죽 애니메이션 실행
            this.triggerCelebrationAnimation();
            
            // 2. GAM 보상 지급 API 호출
            const rewardResult = await this.claimTutorialReward();
            
            // 3. 특별 완료 메시지 표시
            setTimeout(() => {
                this.showTutorialCompletionReward(rewardResult);
            }, 1500); // 폭죽 애니메이션 후
            
        } catch (error) {
            console.error('튜토리얼 보상 지급 오류:', error);
            // 오류가 있어도 일반 완료 처리
            this.markAsCompleted();
        }
    }

    triggerCelebrationAnimation() {
        console.log('🎆 축하 폭죽 애니메이션 실행!');
        
        // 폭죽 애니메이션 실행 (coin-explosion.js 사용)
        if (window.CoinExplosion) {
            window.CoinExplosion.explode();
        } else if (typeof CoinExplosion !== 'undefined') {
            const celebration = new CoinExplosion();
            celebration.explode();
        } else {
            console.warn('폭죽 애니메이션을 찾을 수 없습니다');
        }
        
        // 축하 효과음 (선택사항)
        this.playSuccessSound();
    }

    async claimTutorialReward() {
        const token = localStorage.getItem('yegame-token');
        if (!token) {
            throw new Error('로그인이 필요합니다');
        }

        const response = await fetch('/api/gam/tutorial-reward', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message || '보상 지급 실패');
        }

        return result;
    }

    showTutorialCompletionReward(rewardResult) {
        const modal = document.createElement('div');
        modal.className = 'tutorial-completion-reward-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            z-index: 60000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: tutorialFadeIn 0.3s ease;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 24px;
            padding: 2rem;
            max-width: 500px;
            width: 90%;
            text-align: center;
            color: white;
            box-shadow: 0 25px 50px rgba(0,0,0,0.3);
            position: relative;
            overflow: hidden;
        `;

        content.innerHTML = `
            <div style="font-size: 4rem; margin-bottom: 1rem;">🎉</div>
            <h2 style="font-size: 1.8rem; font-weight: bold; margin-bottom: 1rem; color: #FFD700;">튜토리얼 완주 축하!</h2>
            <div style="background: rgba(255,255,255,0.2); border-radius: 16px; padding: 1.5rem; margin: 1.5rem 0;">
                <div style="font-size: 1.1rem; margin-bottom: 0.5rem;">🎁 특별 완주 보상</div>
                <div style="font-size: 2.5rem; font-weight: bold; color: #FFD700; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
                    +10,000 GAM
                </div>
                ${rewardResult.alreadyClaimed ? 
                    '<div style="color: #ffcccb; font-size: 0.9rem; margin-top: 0.5rem;">※ 이미 지급받은 보상입니다</div>' : 
                    '<div style="color: #90EE90; font-size: 0.9rem; margin-top: 0.5rem;">✅ 계정에 지급 완료!</div>'
                }
            </div>
            <p style="margin: 1.5rem 0; line-height: 1.6; font-size: 1.1rem;">
                🚀 이제 예겜의 모든 기능을 마스터했습니다!<br>
                💰 받은 GAM으로 첫 베팅에 도전해보세요!
            </p>
            <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 2rem;">
                <button id="start-betting-btn" style="
                    background: linear-gradient(135deg, #FFD700, #FFA500);
                    color: #333;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 12px;
                    font-weight: bold;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(255,215,0,0.3);
                ">🎯 지금 베팅하기</button>
                <button id="close-reward-modal" style="
                    background: rgba(255,255,255,0.2);
                    color: white;
                    border: 1px solid rgba(255,255,255,0.3);
                    padding: 12px 24px;
                    border-radius: 12px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">나중에 하기</button>
            </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // 버튼 이벤트 리스너
        modal.querySelector('#start-betting-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
            this.highlightFirstBettingOpportunity();
        });

        modal.querySelector('#close-reward-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
            this.markAsCompleted();
        });

        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                this.markAsCompleted();
            }
        });

        // 사용자 정보 업데이트 (GAM 잔액 반영)
        if (window.updateCurrentUser && rewardResult.user) {
            window.updateCurrentUser(rewardResult.user);
        }
    }

    highlightFirstBettingOpportunity() {
        // 첫 번째 베팅 버튼을 찾아서 하이라이트
        const firstBetButton = document.querySelector('.bet-btn');
        if (firstBetButton) {
            // 해당 이슈 카드로 스크롤
            firstBetButton.closest('.issue-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 잠시 하이라이트
            setTimeout(() => {
                firstBetButton.style.boxShadow = '0 0 0 4px rgba(255, 215, 0, 0.8)';
                firstBetButton.style.transform = 'scale(1.05)';
                
                setTimeout(() => {
                    firstBetButton.style.boxShadow = '';
                    firstBetButton.style.transform = '';
                }, 2000);
            }, 500);
        }
        
        this.markAsCompleted();
    }

    playSuccessSound() {
        // 성공 효과음 재생 (선택사항)
        try {
            const audio = new Audio();
            audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IAAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+LvxnwgBSB+ze/eizEIGGS57+OZRQ0LTKXh7bllHgg2jdXzzn0vBSJ7x+7ejz8JFFyy5+mrWBELQ5zd7Mp4JAUff83u3Y0yBxhiuOvjnEIQC0ml4Oy9aB4INozU8tGAMgUie8bu3Y4+CRRaseTqrFoTC0CY2+bJdyIGHXvM7duNMQcYYrjq45xADAxKpd/ovWgeBzWP0vHSgzYEIHfH7d2QOwkUXLDj6qxZEwpCl9jrzZpIUgZGnNzi';
            audio.volume = 0.3;
            audio.play().catch(() => {}); // 실패해도 무시
        } catch (error) {
            // 효과음 재생 실패는 무시
        }
    }

    cleanupTutorial() {
        this.isRunning = false;
        
        // 오버레이 제거
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        
        // 스포트라이트 제거
        if (this.spotlight) {
            this.spotlight.remove();
            this.spotlight = null;
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
        
        // 세션 스토리지 정리
        sessionStorage.removeItem('tutorial-mode');
        sessionStorage.removeItem('tutorial-step');
    }

    endTutorial() {
        console.log('✅ 튜토리얼 종료');
        this.cleanupTutorial();
        this.markAsCompleted();
    }

    addHighlightStyles() {
        if (document.querySelector('#tutorial-highlight-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'tutorial-highlight-styles';
        style.textContent = `
            @keyframes tutorialPulse {
                0% { 
                    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.8),
                                0 0 20px 5px rgba(255, 255, 255, 0.3),
                                inset 0 0 0 3px rgba(59, 130, 246, 0.6);
                }
                50% { 
                    box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.4),
                                0 0 30px 10px rgba(255, 255, 255, 0.5),
                                inset 0 0 0 3px rgba(59, 130, 246, 0.8);
                }
                100% { 
                    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.8),
                                0 0 20px 5px rgba(255, 255, 255, 0.3),
                                inset 0 0 0 3px rgba(59, 130, 246, 0.6);
                }
            }
            
            @keyframes tutorialSpotlight {
                0% { background: rgba(255, 255, 255, 0.1); }
                50% { background: rgba(255, 255, 255, 0.2); }
                100% { background: rgba(255, 255, 255, 0.1); }
            }
            
            .tutorial-highlight {
                position: relative !important;
                z-index: 50001 !important;
                border-radius: 12px !important;
                transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1) !important;
                animation: tutorialPulse 2s infinite, tutorialSpotlight 3s infinite !important;
                background: rgba(255, 255, 255, 0.15) !important;
                backdrop-filter: saturate(150%) brightness(110%) !important;
            }
            
            .tutorial-highlight::before {
                content: '';
                position: absolute;
                top: -10px;
                left: -10px;
                right: -10px;
                bottom: -10px;
                background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
                border-radius: 20px;
                z-index: -1;
                animation: tutorialSpotlight 2s infinite;
            }
            
            .tutorial-highlight::after {
                content: '👆';
                position: absolute;
                top: -40px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 24px;
                animation: bounce 1s infinite;
                z-index: 50002;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
            }
            
            @keyframes bounce {
                0%, 20%, 50%, 80%, 100% { transform: translateX(-50%) translateY(0); }
                40% { transform: translateX(-50%) translateY(-10px); }
                60% { transform: translateX(-50%) translateY(-5px); }
            }
            
            @keyframes tutorialFadeIn {
                from { opacity: 0; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    showWelcomeModal() {
        console.log('🎮 환영 모달 표시');
        const modal = document.createElement('div');
        modal.className = 'tutorial-welcome-modal';
        modal.innerHTML = `
            <div class="tutorial-welcome-content">
                <div class="tutorial-welcome-title">
                    🎮 예겜 완전정복 가이드
                </div>
                <div class="tutorial-welcome-subtitle">
                    실제 화면에서 버튼을 직접 보며 배우는 인터랙티브 튜토리얼!
                </div>
                <div class="tutorial-welcome-notice" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 12px; border-radius: 8px; margin: 16px 0; text-align: center; font-size: 14px;">
                    💡 <strong>인터랙티브 가이드:</strong> 실제 홈페이지로 이동하여 모든 기능을 직접 체험하며 배웁니다!
                </div>
                <div class="tutorial-welcome-features" style="max-height: 300px; overflow-y: auto; padding-right: 10px;">
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">1</div>
                        <span>💰 GAM 시스템 & 출석 보상 마스터하기</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">2</div>
                        <span>🏷️ 8개 카테고리별 이슈 탐색 & 필터링</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">3</div>
                        <span>🎯 스마트한 예측 참여 & 베팅 전략</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">4</div>
                        <span>💬 토론 참여 & 댓글/대댓글 시스템</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">5</div>
                        <span>✏️ 이슈 신청 프로세스 완전정복</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">6</div>
                        <span>🔍 고급 검색 & 실시간 필터링 활용</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">7</div>
                        <span>🏆 티어 시스템 & 업적 달성 방법</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">8</div>
                        <span>📊 내 정보 & 베팅 통계 분석</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">9</div>
                        <span>🔔 알림 시스템 & 실시간 업데이트</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">10</div>
                        <span>📱 모바일 최적화 기능 활용법</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">11</div>
                        <span>🎮 분석방 커뮤니티 참여하기</span>
                    </div>
                    <div class="tutorial-welcome-feature">
                        <div class="tutorial-welcome-feature-icon">12</div>
                        <span>📈 실시간 확률 변화 읽는 법</span>
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
            console.log('🚀 튜토리얼 시작 버튼 클릭');
            document.body.removeChild(modal);
            this.startInteractiveTutorial();
        });

        modal.querySelector('#tutorial-skip').addEventListener('click', () => {
            console.log('⏭️ 튜토리얼 나중에 하기 클릭 - 완전 종료');
            document.body.removeChild(modal);
            // 튜토리얼 완전 종료
            this.endTutorial();
        });

        // 모달 외부 클릭시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                console.log('⏭️ 모달 외부 클릭으로 튜토리얼 종료');
                document.body.removeChild(modal);
                this.endTutorial();
            }
        });

        // ESC 키로 닫기
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                if (document.body.contains(modal)) {
                    console.log('⏭️ ESC 키로 튜토리얼 종료');
                    document.body.removeChild(modal);
                    this.endTutorial();
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
        
        // 헤더의 튜토리얼 프로모션 말풍선 제거
        this.removeTutorialPromotionBubbles();
    }

    removeTutorialPromotionBubbles() {
        // 모든 튜토리얼 프로모션 말풍선 제거
        const bubbles = document.querySelectorAll('.tutorial-promotion-bubble');
        bubbles.forEach(bubble => {
            bubble.remove();
        });
        console.log('🗑️ 튜토리얼 프로모션 말풍선 제거됨');
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

// 즉시 초기화 시도 (DOM이 이미 로드되었을 수 있음)
function initializeTutorial() {
    if (!window.yegamTutorial) {
        console.log('🎯 예겜 튜토리얼 시스템 초기화 시작...');
        window.yegamTutorial = new YegamTutorial();
        console.log('🎯 예겜 튜토리얼 시스템 로드 완료');
        
        // 즉시 버튼 존재 확인 및 테스트
        setTimeout(() => {
            const btn = document.getElementById('start-tutorial-btn');
            console.log('🔍 튜토리얼 초기화 후 버튼 확인:', btn ? '존재함' : '없음');
            if (btn) {
                console.log('✅ 사용법 배우기 버튼 준비 완료');
                console.log('🔧 테스트: window.startTutorialDirectly 함수:', typeof window.startTutorialDirectly);
            }
        }, 100);
    }
}

// 다양한 시점에 초기화 시도
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTutorial);
} else {
    // DOM이 이미 로드됨
    initializeTutorial();
}

// 페이지 완전 로드 후에도 다시 시도
window.addEventListener('load', () => {
    if (!window.yegamTutorial) {
        initializeTutorial();
    } else {
        // 이미 초기화되었다면 이벤트 리스너만 다시 설정
        window.yegamTutorial.setupEventListeners();
    }
    
    // 튜토리얼 모드 체크 및 재개
    checkAndResumeTutorial();
});

// 튜토리얼 재개 함수
function checkAndResumeTutorial() {
    const tutorialMode = sessionStorage.getItem('tutorial-mode');
    const tutorialStep = sessionStorage.getItem('tutorial-step');
    
    if (tutorialMode === 'true' && window.yegamTutorial) {
        console.log('🔄 튜토리얼 모드 감지 - 재개 중...');
        
        // 약간의 지연 후 튜토리얼 재개 (페이지 렌더링 완료 대기)
        setTimeout(() => {
            if (window.yegamTutorial && !window.yegamTutorial.isRunning) {
                const step = parseInt(tutorialStep) || 0;
                window.yegamTutorial.currentStep = step;
                window.yegamTutorial.startTutorial();
                
                // 플래그 제거
                sessionStorage.removeItem('tutorial-mode');
                sessionStorage.removeItem('tutorial-step');
            }
        }, 1000);
    }
}

// 개발자 도구용 헬퍼 함수들
window.tutorialHelpers = {
    start: () => {
        console.log('🔧 개발자 도구에서 튜토리얼 시작');
        return window.yegamTutorial?.showWelcomeModal();
    },
    reset: () => {
        console.log('🔧 개발자 도구에서 튜토리얼 리셋');
        return window.yegamTutorial?.resetTutorial();
    },
    complete: () => {
        console.log('🔧 개발자 도구에서 튜토리얼 완료 표시');
        return window.yegamTutorial?.markAsCompleted();
    },
    goToStep: (step) => {
        console.log('🔧 개발자 도구에서 특정 단계로 이동:', step);
        return window.yegamTutorial?.goToStep(step);
    },
    isRunning: () => window.yegamTutorial?.isRunning,
    currentStep: () => window.yegamTutorial?.currentStep,
    debug: () => {
        const tutorial = window.yegamTutorial;
        console.log('🔍 튜토리얼 시스템 디버그 정보:');
        console.log('- 튜토리얼 객체:', tutorial);
        console.log('- 실행 중:', tutorial?.isRunning);
        console.log('- 현재 단계:', tutorial?.currentStep);
        console.log('- 전체 단계:', tutorial?.totalSteps);
        console.log('- 완료 여부:', tutorial?.isCompleted());
        
        // 버튼 존재 여부 확인
        const startTutorialBtn = document.getElementById('start-tutorial-btn');
        
        console.log('- 사용법 배우기 버튼:', startTutorialBtn ? '존재' : '없음');
        console.log('- 현재 페이지:', window.location.pathname);
        
        if (startTutorialBtn) {
            console.log('- 사용법 배우기 버튼 텍스트:', startTutorialBtn.textContent.trim());
        }
        
        return {
            tutorial,
            startTutorialBtn,
            isRunning: tutorial?.isRunning,
            currentStep: tutorial?.currentStep,
            totalSteps: tutorial?.totalSteps,
            isCompleted: tutorial?.isCompleted(),
            currentPage: window.location.pathname
        };
    },
    testTutorialButton: () => {
        console.log('🔧 사용법 배우기 버튼 테스트');
        const startTutorialBtn = document.getElementById('start-tutorial-btn');
        if (startTutorialBtn) {
            console.log('- 사용법 배우기 버튼 클릭 테스트...');
            startTutorialBtn.click();
            return true;
        }
        console.warn('- 사용법 배우기 버튼을 찾을 수 없습니다');
        return false;
    },
    testDirectCall: () => {
        console.log('🔧 직접 호출 테스트');
        if (window.startTutorialDirectly) {
            window.startTutorialDirectly();
            return true;
        }
        console.warn('- startTutorialDirectly 함수를 찾을 수 없습니다');
        return false;
    },
    checkButtonStatus: () => {
        const btn = document.getElementById('start-tutorial-btn');
        console.log('🔍 버튼 상태 확인:');
        console.log('- 버튼 존재:', btn ? '예' : '아니오');
        if (btn) {
            console.log('- 버튼 텍스트:', btn.textContent.trim());
            console.log('- onclick 속성:', btn.onclick ? '설정됨' : '없음');
            console.log('- 클릭 이벤트 리스너:', btn._eventListeners ? '설정됨' : '확인불가');
            console.log('- 버튼 스타일:', btn.style.cursor);
            console.log('- title 속성:', btn.title);
        }
        return btn;
    },
    forceSetup: () => {
        console.log('🔧 강제 이벤트 리스너 재설정');
        return window.yegamTutorial?.setupEventListeners();
    }
};

// 모듈 내보내기 (ES6 modules 사용 시)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = YegamTutorial;
}

// ES6 export는 module 타입일 때만 사용 가능하므로 제거
// export default YegamTutorial;