// Complete working app with API integration
import { getUserTier, createTierDisplay } from './utils/tier-utils.js';
import { updateHeader } from './ui/header.js';
import { renderMyPage } from './pages/mypage.js';
import { checkAuth } from './auth.js';

console.log('🚀 Working app starting...');

// Global state
let currentUser = null;
let issues = [];
let userToken = localStorage.getItem('yegame-token');

// 전역으로 노출
window.currentUser = currentUser;
window.updateCurrentUser = (newUserData) => {
    console.log('🌍 전역 updateCurrentUser 호출:', { 
        이전: currentUser ? { username: currentUser.username, gam: currentUser.gam_balance } : null,
        새로운: { username: newUserData.username, gam: newUserData.gam_balance }
    });
    
    currentUser = newUserData;
    window.currentUser = currentUser;
    
    // localStorage에도 업데이트
    localStorage.setItem('yegame-user', JSON.stringify(currentUser));
    
    // 헤더 업데이트도 함께 실행
    updateHeader();
    updateIssueRequestButtons(true);
    
    // 모든 GAM 잔액 표시 요소 즉시 업데이트 (다중 안전장치)
    const userCoinsElements = document.querySelectorAll('#user-coins');
    userCoinsElements.forEach((el, index) => {
        const oldValue = el.textContent;
        const newValue = (currentUser.gam_balance || 0).toLocaleString();
        el.textContent = newValue;
        
        console.log(`💰 전역 GAM 업데이트 [${index}]:`, {
            element: el.id || el.className,
            old: oldValue,
            new: newValue
        });
    });
    
    // updateUserWallet도 호출하여 이중 보장
    import('./ui/header.js').then(header => {
        if (header.updateUserWallet) {
            header.updateUserWallet(currentUser.gam_balance);
        }
    }).catch(err => console.warn('헤더 모듈 로드 실패:', err));
    
    console.log('✅ 전역 사용자 정보 업데이트 완료');
};

// 이슈 목록 새로고침 함수
window.refreshIssueList = async () => {
    try {
        const response = await fetch(`/api/issues?_t=${Date.now()}`);
        const data = await response.json();
        
        if (data.success) {
            allIssues = data.issues.sort((a, b) => 
                new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)
            );
            issues = allIssues;
            
            // 현재 페이지에 따라 다시 렌더링
            if (document.getElementById('all-issues-section')) {
                renderAllIssues();
            }
            if (document.getElementById('popular-issues-section')) {
                renderPopularIssues();
            }
            
            console.log('Issue list refreshed');
        }
    } catch (error) {
        console.error('Failed to refresh issue list:', error);
    }
};

// 헤더 강제 업데이트 함수 (베팅 후 호출용)
window.forceUpdateHeader = () => {
    if (currentUser) {
        console.log('🔄 forceUpdateHeader 호출 - 현재 사용자:', { 
            username: currentUser.username, 
            gam: currentUser.gam_balance 
        });
        
        // 헤더 전체 업데이트
        updateHeader();
        updateIssueRequestButtons(true);
        
        // 모든 GAM 잔액 표시 요소 강제 업데이트
        const allUserCoinsElements = document.querySelectorAll('#user-coins, [id*="user-coins"], [class*="user-coins"]');
        allUserCoinsElements.forEach((el, index) => {
            const oldValue = el.textContent;
            const newValue = (currentUser.gam_balance || 0).toLocaleString();
            el.textContent = newValue;
            
            console.log(`🔄 강제 GAM 업데이트 [${index}]:`, {
                element: el.id || el.className || el.tagName,
                old: oldValue,
                new: newValue,
                changed: oldValue !== newValue
            });
        });
        
        // updateUserWallet도 호출 (이중 보장)
        import('./ui/header.js').then(header => {
            if (header.updateUserWallet) {
                header.updateUserWallet(currentUser.gam_balance);
            }
        }).catch(err => console.warn('강제 헤더 업데이트 중 모듈 로드 실패:', err));
        
        console.log('✅ 강제 헤더 업데이트 완료');
    } else {
        console.warn('⚠️ forceUpdateHeader 실패 - currentUser가 null');
    }
};

// 실시간 사용자 정보 동기화 함수
async function refreshUserInfo() {
    if (!userToken || !currentUser) return;
    
    try {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.user) {
            // 사용자 정보가 변경된 경우에만 업데이트
            if (JSON.stringify(currentUser) !== JSON.stringify(data.user)) {
                currentUser = data.user;
                window.currentUser = currentUser;
                
                // localStorage 업데이트
                localStorage.setItem('yegame-user', JSON.stringify(currentUser));
                
                // 헤더 업데이트
                updateHeader();
        updateIssueRequestButtons(true);
                
                console.log('User info refreshed:', currentUser.username, 'GAM:', currentUser.gam_balance || currentUser.coins);
            }
        }
    } catch (error) {
        console.error('Failed to refresh user info:', error);
    }
}

// 실시간 사용자 정보 동기화 설정
function setupUserInfoSync() {
    // 페이지 포커스 시 사용자 정보 갱신
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden && currentUser) {
            await refreshUserInfo();
        }
    });
    
    // 윈도우 포커스 시 사용자 정보 갱신
    window.addEventListener('focus', async () => {
        if (currentUser) {
            await refreshUserInfo();
        }
    });
    
    // 5분마다 사용자 정보 갱신 (백그라운드에서)
    setInterval(async () => {
        if (currentUser && !document.hidden) {
            await refreshUserInfo();
        }
    }, 5 * 60 * 1000); // 5분
}

// Comments pagination state
const commentsPagination = new Map(); // issueId -> { currentPage, totalComments, allComments }

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing app...');
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // OAuth 토큰 처리 (URL 파라미터에서)
    handleOAuthCallback();
    
    // Check authentication
    await checkAuthentication();
    
    // Initialize mobile menu for all pages
    setupMobileMenu();
    
    // Initialize comments system
    initCommentsSystem();
    
    // Initialize real-time user info sync
    setupUserInfoSync();
    
    // Initialize the application based on current page
    const path = window.location.pathname.split("/").pop();
    console.log('Current page:', path);
    
    try {
        if (path === 'index.html' || path === '') {
            await initHomePage();
        } else if (path === 'login.html') {
            initLoginPage();
        } else if (path === 'admin.html') {
            await initAdminPage();
        } else if (path === 'issues.html') {
            await initIssuesPage();
        } else if (path === 'mypage.html') {
            await initMyPage();
        }
    } catch (error) {
        console.error('App initialization error:', error);
        showError('앱 초기화 중 오류가 발생했습니다.');
    }
});

// Authentication functions
async function checkAuthentication() {
    // 관리자 페이지에서는 별도 인증 처리
    if (window.isAdminPage && window.adminAuthCompleted) {
        console.log('🔐 관리자 페이지 - 관리자 인증 사용');
        updateHeader();
        updateIssueRequestButtons(true);
        return;
    }
    
    // localStorage에서 토큰과 사용자 정보 읽어오기
    const storedToken = localStorage.getItem('yegame-token');
    const storedUser = localStorage.getItem('yegame-user');
    
    if (storedToken) {
        userToken = storedToken;
        
        if (storedUser) {
            try {
                currentUser = JSON.parse(storedUser);
                window.currentUser = currentUser;
                console.log('Restored user session:', currentUser.username);
            } catch (error) {
                console.error('Error parsing stored user data:', error);
                localStorage.removeItem('yegame-user');
                currentUser = null;
                window.currentUser = null;
            }
        }
    }
    
    if (!userToken) {
        console.log('No token found, user not authenticated');
        updateHeader();
        updateIssueRequestButtons(false);
        return;
    }
    
    try {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.user) {
            currentUser = data.user;
            window.currentUser = currentUser; // 전역 변수 동기화
            
            // 사용자 정보를 localStorage에도 업데이트
            localStorage.setItem('yegame-user', JSON.stringify(currentUser));
            
            updateHeader();
            updateIssueRequestButtons(true);
            console.log('User authenticated:', currentUser.username);
        } else {
            // Invalid token, clear all auth data
            console.log('Token verification failed, clearing auth data');
            localStorage.removeItem('yegame-token');
            localStorage.removeItem('yegame-user');
            userToken = null;
            currentUser = null;
            window.currentUser = null;
            updateHeader();
            updateIssueRequestButtons(false);
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('yegame-token');
        localStorage.removeItem('yegame-user');
        userToken = null;
        currentUser = null;
        window.currentUser = null;
        updateHeader();
        updateIssueRequestButtons(false);
    }
}

function updateHeaderWithAuth(isLoggedIn) {
    // 이슈 신청 버튼 표시/숨김 처리
    updateIssueRequestButtons(isLoggedIn);
    
    // header.js의 updateHeader 호출
    updateHeader();
}

// 이슈 신청 버튼 표시/숨김 및 이벤트 설정
function updateIssueRequestButtons(isLoggedIn) {
    const desktopBtn = document.getElementById('desktop-issue-request-btn');
    const mobileBtn = document.getElementById('mobile-issue-request-btn');
    
    if (desktopBtn) {
        if (isLoggedIn) {
            desktopBtn.classList.remove('hidden');
            desktopBtn.onclick = () => openIssueRequestModal(currentUser);
        } else {
            desktopBtn.classList.add('hidden');
        }
    }
    
    if (mobileBtn) {
        if (isLoggedIn) {
            mobileBtn.classList.remove('hidden');
            mobileBtn.onclick = () => openIssueRequestModal(currentUser);
        } else {
            mobileBtn.classList.add('hidden');
        }
    }
}

function logout() {
    // localStorage 정리
    localStorage.removeItem('yegame-user');
    localStorage.removeItem('yegame-token');
    localStorage.removeItem('admin-user');
    localStorage.removeItem('admin-token');
    
    // 전역 변수 초기화
    userToken = null;
    currentUser = null;
    window.currentUser = null;
    
    // 관리자 관련 변수 정리
    window.adminAuthCompleted = false;
    window.isAdminPage = false;
    
    // 헤더 업데이트
    updateHeader();
        updateIssueRequestButtons(false);
    
    showSuccess('안전하게 로그아웃되었습니다.', '로그아웃 완료');
    window.location.href = 'index.html';
}

// 전역으로 로그아웃 함수 노출
window.logout = logout;

// Mobile menu functions
function setupMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const menuIcon = mobileMenuBtn?.querySelector('i');
    
    if (!mobileMenuBtn || !mobileMenu) return;
    
    let isMenuOpen = false;
    
    mobileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMobileMenu();
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (isMenuOpen && !mobileMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
            closeMobileMenu();
        }
    });
    
    // Close menu when pressing escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isMenuOpen) {
            closeMobileMenu();
        }
    });
    
    function toggleMobileMenu() {
        if (isMenuOpen) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    }
    
    function openMobileMenu() {
        isMenuOpen = true;
        mobileMenu.classList.remove('hidden');
        menuIcon.setAttribute('data-lucide', 'x');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
        // Add smooth slide down animation
        mobileMenu.style.opacity = '0';
        mobileMenu.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            mobileMenu.style.transition = 'all 0.2s ease-out';
            mobileMenu.style.opacity = '1';
            mobileMenu.style.transform = 'translateY(0)';
        }, 10);
    }
    
    function closeMobileMenu() {
        isMenuOpen = false;
        mobileMenu.style.transition = 'all 0.2s ease-in';
        mobileMenu.style.opacity = '0';
        mobileMenu.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            mobileMenu.classList.add('hidden');
            mobileMenu.style.transition = '';
            mobileMenu.style.opacity = '';
            mobileMenu.style.transform = '';
        }, 200);
        
        menuIcon.setAttribute('data-lucide', 'menu');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

// Home page functions
// Global state for home page
let allIssues = [];
let currentPage = 1;
let currentCategory = '전체';
let currentSort = 'ending'; // 기본 정렬을 마감 임박순으로 변경
let currentSearch = '';
let isLoading = false;

async function initHomePage() {
    console.log('Initializing unified home page...');
    
    try {
        // Load issues from API
        const response = await fetch(`/api/issues?_t=${Date.now()}`);
        const data = await response.json();
        
        if (data.success) {
            // 디버그: 백엔드에서 받은 원본 순서 로그
            console.log('🔍 백엔드에서 받은 순서 (첫 3개):');
            data.issues.slice(0, 3).forEach((issue, index) => {
                console.log(`${index + 1}. "${issue.title}" - ${issue.created_at} (인기: ${issue.is_popular})`);
                
                // 🔍 시간 데이터 상세 분석
                if (issue.end_date) {
                    const endDate = new Date(issue.end_date);
                    const now = new Date();
                    const diffHours = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
                    
                    console.log(`⏰ 시간 상세 분석:`, {
                        raw_end_date: issue.end_date,
                        parsed_date: endDate.toISOString(),
                        korean_time: endDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
                        current_time: now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
                        hours_remaining: diffHours.toFixed(2),
                        days_remaining: (diffHours / 24).toFixed(2),
                        getTimeLeft_result: typeof window.getTimeLeft === 'function' ? window.getTimeLeft(issue.end_date) : 'getTimeLeft not available'
                    });
                }
            });
            
            // 백엔드에서 정렬되어 오지만, 혹시 모르니 프론트엔드에서도 한 번 더 정렬
            allIssues = data.issues.sort((a, b) => 
                new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)
            );
            issues = allIssues; // Keep for backward compatibility
            
            // 디버그: 정렬 후 순서 로그
            console.log('🔍 프론트엔드 정렬 후 순서 (첫 3개):');
            allIssues.slice(0, 3).forEach((issue, index) => {
                console.log(`${index + 1}. "${issue.title}" - ${issue.created_at} (인기: ${issue.is_popular || issue.isPopular})`);
            });
            
            console.log('Loaded', allIssues.length, 'issues');
            
            setupCategoryFilters();
            setupHomePageEvents();
            setupScrollToTop();
            renderPopularIssues();
            renderAllIssues();
            
        } else {
            throw new Error(data.message || 'Failed to load issues');
        }
    } catch (error) {
        console.error('Failed to load issues:', error);
        showError('이슈를 불러오는데 실패했습니다.');
    }
}

function setupCategoryFilters() {
    const filtersContainer = document.getElementById('category-filters');
    const mobileFiltersContainer = document.getElementById('category-filters-mobile');
    
    // 카테고리 데이터 - 분석방과 동일한 이모지 사용
    const categoriesData = [
        { name: '전체', icon: '💬' },
        { name: '정치', icon: '🏛️' },
        { name: '스포츠', icon: '⚽' },
        { name: '경제', icon: '📈' },
        { name: '코인', icon: '₿' },
        { name: '테크', icon: '💻' },
        { name: '엔터', icon: '🎭' },
        { name: '날씨', icon: '🌤️' },
        { name: '해외', icon: '🌍' }
    ];
    
    // 분석방과 동일한 스타일의 버튼 생성
    const createCategoryButton = (category, index) => `
        <button class="category-btn ${index === 0 ? 'active' : ''}"
                data-category="${category.name}"
                style="white-space: nowrap;">
            ${category.icon} ${category.name}
        </button>
    `;
    
    // Setup desktop category filters
    if (filtersContainer) {
        filtersContainer.innerHTML = categoriesData.map((category, index) => 
            createCategoryButton(category, index)
        ).join('');
        
        filtersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (btn) {
                const category = btn.dataset.category;
                selectCategory(category, btn);
            }
        });
    }
    
    // Setup mobile category filters
    if (mobileFiltersContainer) {
        mobileFiltersContainer.innerHTML = categoriesData.map((category, index) => 
            createCategoryButton(category, index)
        ).join('');
        
        mobileFiltersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (btn) {
                const category = btn.dataset.category;
                selectCategory(category, btn, true);
            }
        });
    }
}

function selectCategory(category, buttonElement, isMobile = false) {
    // Update active state for both desktop and mobile
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Find corresponding buttons in both desktop and mobile versions
    const desktopBtn = document.querySelector(`#category-filters [data-category="${category}"]`);
    const mobileBtn = document.querySelector(`#category-filters-mobile [data-category="${category}"]`);
    
    // Activate corresponding buttons
    [desktopBtn, mobileBtn].forEach(btn => {
        if (btn) {
            btn.classList.add('active');
        }
    });
    
    currentCategory = category;
    currentPage = 1;
    renderAllIssues();
    renderPopularIssues(); // Re-render popular issues for the new category
}

function setupHomePageEvents() {
    // Scroll to all issues button
    const scrollBtn = document.getElementById('scroll-to-all-issues');
    if (scrollBtn) {
        scrollBtn.addEventListener('click', () => {
            document.getElementById('all-issues-section').scrollIntoView({ 
                behavior: 'smooth' 
            });
        });
    }
    
    // Header search functionality
    const headerSearchBtn = document.getElementById('header-search-btn');
    const searchOverlay = document.getElementById('search-overlay');
    const headerSearchInput = document.getElementById('header-search-input');
    const searchCloseBtn = document.getElementById('search-close-btn');
    const searchResults = document.getElementById('search-results');
    
    if (headerSearchBtn && searchOverlay) {
        headerSearchBtn.addEventListener('click', () => {
            searchOverlay.classList.remove('hidden');
            headerSearchInput.focus();
        });
    }
    
    if (searchCloseBtn && searchOverlay) {
        searchCloseBtn.addEventListener('click', () => {
            searchOverlay.classList.add('hidden');
            headerSearchInput.value = '';
            searchResults.classList.add('hidden');
        });
    }
    
    // Header search input
    if (headerSearchInput) {
        headerSearchInput.addEventListener('input', debounce((e) => {
            const query = e.target.value.trim();
            if (query.length > 0) {
                performHeaderSearch(query);
            } else {
                searchResults.classList.add('hidden');
            }
        }, 300));
    }
    
    // Close search on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !searchOverlay.classList.contains('hidden')) {
            searchOverlay.classList.add('hidden');
            headerSearchInput.value = '';
            searchResults.classList.add('hidden');
        }
    });
    
    // Legacy search input (if exists)
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            currentSearch = e.target.value.trim();
            currentPage = 1;
            renderAllIssues();
        }, 300));
    }
    
    // Sort select
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            currentPage = 1;
            renderAllIssues();
        });
    }
    
    // Load more button
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            currentPage++;
            renderAllIssues(true); // append mode
        });
    }
}

function renderPopularIssues() {
    const listContainer = document.getElementById('popular-issues-list');
    const mobileContainer = document.getElementById('popular-issues-mobile');
    
    // 인기 이슈는 필터링하지 않고 항상 고정된 인기 이슈를 표시 (popular_order 우선, 그 다음 최신순)
    const popularIssues = allIssues
        .filter(issue => issue.is_popular || issue.isPopular)
        .sort((a, b) => {
            // popular_order가 있으면 그것으로 정렬 (오름차순)
            const orderA = a.popular_order || 999999;
            const orderB = b.popular_order || 999999;
            
            if (orderA !== orderB) {
                return orderA - orderB; // popular_order 오름차순
            }
            
            // popular_order가 같으면 created_at으로 정렬 (최신순)
            return new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt);
        })
        .slice(0, 8); // 최대 8개까지 표시
    
    if (popularIssues.length === 0) {
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="text-center py-8">
                    <i data-lucide="star" class="w-8 h-8 mx-auto text-gray-300 mb-3"></i>
                    <p class="text-gray-500">인기 이슈가 없습니다.</p>
                </div>
            `;
        }
        if (mobileContainer) {
            mobileContainer.innerHTML = `
                <div class="popular-issue-card text-center py-8">
                    <i data-lucide="star" class="w-8 h-8 mx-auto text-gray-300 mb-3"></i>
                    <p class="text-gray-500">인기 이슈가 없습니다.</p>
                </div>
            `;
        }
        return;
    }
    
    // Polymarket-style: Render desktop version as list
    if (listContainer) {
        listContainer.innerHTML = popularIssues.map((issue) => {
            const yesPrice = issue.yesPercentage || issue.yes_price || 50;
            const volume = issue.total_volume || issue.totalVolume || 0;
            const timeLeft = getTimeLeft(issue.end_date || issue.endDate);
            
            return `
                <div class="popular-issue-item flex items-center justify-between p-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 cursor-pointer"
                     onclick="scrollToIssueInAllSection(${issue.id})">
                    <div class="flex-1 min-w-0 mr-4">
                        <h3 class="text-sm font-medium text-gray-900 truncate">${issue.title}</h3>
                        <div class="text-xs text-gray-400 mt-0.5">${timeLeft} · ${formatEndDate(issue.end_date || issue.endDate)}</div>
                    </div>
                    <div class="flex items-center gap-3 flex-shrink-0">
                        <div class="text-right">
                            <div class="text-lg font-bold text-gray-900">${yesPrice}%</div>
                            <div class="text-xs text-gray-400">${formatVolume(volume)} Vol.</div>
                        </div>
                        <div class="flex gap-1" onclick="event.stopPropagation()">
                            <button class="px-3 py-1.5 bg-emerald-400 hover:bg-emerald-500 text-white text-xs font-semibold rounded transition-colors"
                                    onclick="placeBet(${issue.id}, 'Yes')">
                                Yes
                            </button>
                            <button class="px-3 py-1.5 bg-rose-400 hover:bg-rose-500 text-white text-xs font-semibold rounded transition-colors"
                                    onclick="placeBet(${issue.id}, 'No')">
                                No
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // Polymarket-style: Render mobile version as horizontal scroll cards
    if (mobileContainer) {
        mobileContainer.innerHTML = popularIssues.map((issue) => {
            const yesPrice = issue.yesPercentage || issue.yes_price || 50;
            const volume = issue.total_volume || issue.totalVolume || 0;
            const timeLeft = getTimeLeft(issue.end_date || issue.endDate);
            
            return `
                <div class="popular-issue-card bg-white rounded-lg border border-gray-200 p-3 hover:border-gray-300 transition-colors cursor-pointer"
                     data-issue-id="${issue.id}"
                     onclick="scrollToIssueInAllSection(${issue.id})">
                    <div class="text-xs text-gray-400 mb-1">${timeLeft} · ${formatEndDate(issue.end_date || issue.endDate)}</div>
                    <h3 class="text-sm font-medium text-gray-900 mb-2 leading-tight line-clamp-2 min-h-[2.5rem]">
                        ${issue.title}
                    </h3>
                    <div class="mb-1">
                        <span class="text-xl font-bold text-gray-900">${yesPrice}%</span>
                    </div>
                    <div class="text-xs text-gray-400 mb-3">${formatVolume(volume)} Vol.</div>
                    <div class="flex gap-2" onclick="event.stopPropagation()">
                        <button class="flex-1 py-1.5 bg-emerald-400 hover:bg-emerald-500 text-white text-xs font-semibold rounded transition-colors"
                                onclick="placeBet(${issue.id}, 'Yes')">
                            Yes
                        </button>
                        <button class="flex-1 py-1.5 bg-rose-400 hover:bg-rose-500 text-white text-xs font-semibold rounded transition-colors"
                                onclick="placeBet(${issue.id}, 'No')">
                            No
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // 인기 이슈 렌더링 후 배당률 로드
    setTimeout(() => {
        loadAllBettingOdds();
    }, 100);
}

function renderAllIssues(append = false) {
    const grid = document.getElementById('all-issues-grid');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const noMoreMsg = document.getElementById('no-more-issues');
    const issuesCount = document.getElementById('issues-count');
    
    if (!grid) return;
    
    // Filter and sort issues
    let filteredIssues = allIssues;
    
    // Apply category filter
    if (currentCategory !== '전체') {
        filteredIssues = filteredIssues.filter(issue => issue.category === currentCategory);
    }
    
    // Apply search filter
    if (currentSearch) {
        filteredIssues = filteredIssues.filter(issue => 
            issue.title.toLowerCase().includes(currentSearch.toLowerCase())
        );
    }
    
    // Apply sorting
    filteredIssues = sortIssues(filteredIssues, currentSort);
    
    // Update issues count
    if (issuesCount) {
        issuesCount.textContent = filteredIssues.length;
    }
    
    // Pagination
    const itemsPerPage = 6;
    const startIndex = append ? 0 : 0;
    const endIndex = currentPage * itemsPerPage;
    const issuesToShow = filteredIssues.slice(startIndex, endIndex);
    
    if (issuesToShow.length === 0 && !append) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i data-lucide="search" class="w-12 h-12 mx-auto text-gray-300 mb-4"></i>
                <p class="text-gray-500">검색 결과가 없습니다.</p>
            </div>
        `;
        loadMoreBtn.classList.add('hidden');
        noMoreMsg.classList.add('hidden');
        return;
    }
    
    // Render issues
    if (append) {
        const newIssues = filteredIssues.slice((currentPage - 1) * itemsPerPage, endIndex);
        grid.innerHTML += newIssues.map(issue => createIssueCard(issue)).join('');
    } else {
        grid.innerHTML = issuesToShow.map(issue => createIssueCard(issue)).join('');
    }
    
    // Show/hide load more button
    if (endIndex >= filteredIssues.length) {
        loadMoreBtn.classList.add('hidden');
        if (filteredIssues.length > itemsPerPage) {
            noMoreMsg.classList.remove('hidden');
        }
    } else {
        loadMoreBtn.classList.remove('hidden');
        noMoreMsg.classList.add('hidden');
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // 카드 클릭 시 상세 페이지로 이동 (버튼 클릭 제외)
    grid.querySelectorAll('[data-id]').forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
            // 버튼 클릭은 무시 (베팅 버튼)
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                return;
            }
            const issueId = card.getAttribute('data-id');
            goToIssueDetail(issueId);
        });
    });
    
    // 이슈 렌더링 후 배당률 로드
    setTimeout(() => {
        loadAllBettingOdds();
    }, 100);
}

function sortIssues(issues, sortType) {
    const sortedIssues = [...issues];
    
    switch (sortType) {
        case 'newest':
            return sortedIssues.sort((a, b) => 
                new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)
            );
        case 'popular':
            return sortedIssues.sort((a, b) => 
                (b.total_volume || b.totalVolume || 0) - (a.total_volume || a.totalVolume || 0)
            );
        case 'ending':
            return sortedIssues.sort((a, b) => window.MarketCard
                ? window.MarketCard.compareClosing(a, b)
                : new Date(a.betting_end_date || a.end_date || a.endDate) - new Date(b.betting_end_date || b.end_date || b.endDate)
            );
        case 'volume':
            return sortedIssues.sort((a, b) => 
                (b.total_volume || b.totalVolume || 0) - (a.total_volume || a.totalVolume || 0)
            );
        default:
            return sortedIssues.sort((a, b) => 
                new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)
            );
    }
}

// Utility function for debouncing
function debounce(func, wait) {
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

// Get category badge style - Polymarket Style (Neutral)
function getCategoryBadgeStyle(category) {
    return 'background: #F3F4F6; color: #4B5563;';
}

// Scroll to issue in all section
function scrollToIssueInAllSection(issueId) {
    // First, ensure the issue is visible by loading all issues if needed
    const itemsPerPage = 6;
    let filteredIssues = allIssues;
    
    // Apply current category filter to match the display
    if (currentCategory !== '전체') {
        filteredIssues = filteredIssues.filter(issue => issue.category === currentCategory);
    }
    
    // Apply current search filter to match the display
    if (currentSearch) {
        filteredIssues = filteredIssues.filter(issue => 
            issue.title.toLowerCase().includes(currentSearch.toLowerCase())
        );
    }
    
    // Find the index of the target issue
    const issueIndex = filteredIssues.findIndex(issue => issue.id === issueId);
    
    if (issueIndex === -1) {
        console.warn('Issue not found in current filter:', issueId);
        return;
    }
    
    // Calculate which page the issue is on
    const targetPage = Math.ceil((issueIndex + 1) / itemsPerPage);
    
    // Load enough pages to include the target issue
    if (targetPage > currentPage) {
        currentPage = targetPage;
        renderAllIssues(); // Re-render with more pages
    }
    
    // Scroll to all issues section first
    document.getElementById('all-issues-section').scrollIntoView({ 
        behavior: 'smooth' 
    });
    
    // Wait for scroll and render to complete, then highlight the issue
    setTimeout(() => {
        const issueCard = document.querySelector(`[data-id="${issueId}"]`);
        if (issueCard) {
            issueCard.scrollIntoView({ 
                behavior: 'smooth',
                block: 'center'
            });
            
            // Add highlight effect
            issueCard.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.5)';
            issueCard.style.transform = 'scale(1.02)';
            
            // Remove highlight after 2 seconds
            setTimeout(() => {
                issueCard.style.boxShadow = '';
                issueCard.style.transform = '';
            }, 2000);
        } else {
            console.warn('Issue card not found after loading:', issueId);
        }
    }, 800); // Increased timeout to allow for render completion
}

// Header search functionality
function performHeaderSearch(query) {
    const searchResults = document.getElementById('search-results');
    
    if (!allIssues || allIssues.length === 0) {
        searchResults.innerHTML = '<div class="p-4 text-center text-gray-500">검색할 이슈가 없습니다.</div>';
        searchResults.classList.remove('hidden');
        return;
    }
    
    // Filter issues based on search query
    const filteredIssues = allIssues.filter(issue => 
        issue.title.toLowerCase().includes(query.toLowerCase()) ||
        (issue.description && issue.description.toLowerCase().includes(query.toLowerCase())) ||
        issue.category.toLowerCase().includes(query.toLowerCase())
    );
    
    if (filteredIssues.length === 0) {
        searchResults.innerHTML = '<div class="p-4 text-center text-gray-500">검색 결과가 없습니다.</div>';
        searchResults.classList.remove('hidden');
        return;
    }
    
    // Limit to top 5 results
    const topResults = filteredIssues.slice(0, 5);
    
    const resultsHTML = topResults.map(issue => {
        const cardView = window.MarketCard?.model(issue, window.IssueSummary?.buildIssueSummary(issue));
        const bettingAt = issue.betting_end_date || issue.end_date || issue.endDate;
        const timeLeft = cardView?.state || getTimeLeft(bettingAt);
        const volume = Number(issue.total_volume || issue.totalVolume || 0);
        const activity = cardView?.participation || (volume > 0 ? formatVolume(volume) + ' GAM' : '참여 전 · 초기값은 실제 확률이 아닙니다');
        
        return `
            <div class="search-result-item p-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors" 
                 onclick="selectSearchResult(${issue.id})">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="inline-block px-2 py-0.5 text-xs font-medium rounded" style="${getCategoryBadgeStyle(issue.category)}">
                                ${issue.category}
                            </span>
                            <div class="text-xs text-gray-500 flex items-center">
                                <i data-lucide="clock" class="w-3 h-3 mr-1 flex-shrink-0"></i>
                                <div class="flex flex-col leading-tight">
                                    <span class="font-medium">${timeLeft}</span>
                                    <span class="text-gray-400 text-xs">참여 마감 ${cardView?.bettingAt || formatEndDate(bettingAt)}</span>
                                </div>
                            </div>
                        </div>
                        <h4 class="text-sm font-medium text-gray-900 truncate">${issue.title}</h4>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <div class="text-xs text-gray-500 max-w-40">${activity}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    searchResults.innerHTML = resultsHTML;
    searchResults.classList.remove('hidden');
    
    // Re-initialize Lucide icons for search results
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Handle search result selection
function selectSearchResult(issueId) {
    const searchOverlay = document.getElementById('search-overlay');
    const headerSearchInput = document.getElementById('header-search-input');
    const searchResults = document.getElementById('search-results');
    
    // Close search overlay
    searchOverlay.classList.add('hidden');
    headerSearchInput.value = '';
    searchResults.classList.add('hidden');
    
    // Scroll to the issue in the all issues section
    scrollToIssueInAllSection(issueId);
}

// Setup scroll to top functionality
function setupScrollToTop() {
    const scrollToTopBtn = document.getElementById('scroll-to-top');
    if (!scrollToTopBtn) return;
    
    // Show/hide button based on scroll position
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            scrollToTopBtn.classList.remove('opacity-0', 'pointer-events-none');
            scrollToTopBtn.classList.add('opacity-75');
        } else {
            scrollToTopBtn.classList.add('opacity-0', 'pointer-events-none');
            scrollToTopBtn.classList.remove('opacity-75');
        }
    });
    
    // Click handler
    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// Comments System
let userLikedComments = new Set();

function initCommentsSystem() {
    // 댓글 토글 버튼 이벤트 리스너
    document.addEventListener('click', async (e) => {
        if (e.target.closest('.comments-toggle-btn')) {
            const btn = e.target.closest('.comments-toggle-btn');
            const issueId = btn.dataset.issueId;
            await toggleComments(issueId);
        }
        
        // 좋아요 버튼
        if (e.target.closest('.comment-like-btn')) {
            const btn = e.target.closest('.comment-like-btn');
            const commentId = btn.dataset.commentId;
            await handleCommentLike(commentId, btn);
        }
        
        // 댓글 삭제 버튼
        if (e.target.closest('.comment-delete-btn')) {
            const btn = e.target.closest('.comment-delete-btn');
            const commentId = btn.dataset.commentId;
            await handleCommentDelete(commentId);
        }
        
        // 답글 버튼
        if (e.target.closest('.comment-reply-btn')) {
            const btn = e.target.closest('.comment-reply-btn');
            const commentId = btn.dataset.commentId;
            toggleReplyForm(commentId);
        }
    });
    
    // 댓글 폼 제출 이벤트
    document.addEventListener('submit', async (e) => {
        if (e.target.classList.contains('comment-form')) {
            e.preventDefault();
            const form = e.target;
            const issueId = form.dataset.issueId;
            const parentId = form.dataset.parentId || null;
            await handleCommentSubmit(form, issueId, parentId);
        }
    });
}

async function toggleComments(issueId) {
    const commentsSection = document.querySelector(`.comments-section[data-issue-id="${issueId}"]`);
    const toggleBtn = document.querySelector(`.comments-toggle-btn[data-issue-id="${issueId}"]`);
    const chevron = toggleBtn.querySelector('[data-lucide="chevron-down"]');
    
    if (commentsSection.classList.contains('hidden')) {
        commentsSection.classList.remove('hidden');
        chevron.classList.add('rotate-180');
        await loadComments(issueId);
        if (currentUser) {
            showCommentForm(issueId);
        }
    } else {
        commentsSection.classList.add('hidden');
        chevron.classList.remove('rotate-180');
    }
}

async function loadComments(issueId, loadMore = false) {
    // issueId를 항상 문자열로 통일
    issueId = String(issueId);
    console.log('🔄 loadComments issueId 정규화:', issueId, 'type:', typeof issueId);
    
    const commentsSection = document.querySelector(`.comments-section[data-issue-id="${issueId}"]`);
    const loadingEl = commentsSection.querySelector('.comments-loading');
    const containerEl = commentsSection.querySelector('.comments-container');
    
    try {
        if (!loadMore) {
            loadingEl.classList.remove('hidden');
            containerEl.classList.add('hidden');
        }
        
        const response = await fetch(`/api/comments/issue/${issueId}`);
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ 댓글 API 성공, 댓글 수:', data.comments.length);
            
            if (currentUser) {
                await loadUserLikeStatus(issueId);
            }
            
            // 페이지네이션 상태 초기화 또는 업데이트
            if (!commentsPagination.has(issueId) || !loadMore) {
                const paginationData = {
                    currentPage: 1,
                    totalComments: data.comments.length,
                    allComments: data.comments,
                    commentsPerPage: 3
                };
                commentsPagination.set(issueId, paginationData);
                console.log('📊 pagination 초기화:', paginationData);
                console.log('🔑 저장된 key 타입:', typeof issueId, '값:', issueId);
            }
            
            console.log('🎨 renderPaginatedComments 호출 중...');
            const renderedHtml = renderPaginatedComments(issueId);
            console.log('📝 렌더된 HTML 길이:', renderedHtml.length);
            
            containerEl.innerHTML = renderedHtml;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
                console.log('🎯 Lucide 아이콘 초기화 완료');
            }
            loadingEl.classList.add('hidden');
            containerEl.classList.remove('hidden');
            console.log('👁️ 댓글 컨테이너 표시됨');
        } else {
            throw new Error(data.error || '댓글을 불러올 수 없습니다.');
        }
    } catch (error) {
        console.error('댓글 로드 실패:', error);
        loadingEl.innerHTML = `
            <div class="text-center py-4 text-red-500">
                <i data-lucide="alert-circle" class="w-5 h-5 mx-auto mb-2"></i>
                <span>댓글을 불러올 수 없습니다.</span>
            </div>
        `;
    }
}

async function loadUserLikeStatus(issueId) {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`/api/comments/likes/${currentUser.id}/${issueId}`);
        const data = await response.json();
        
        if (data.success) {
            userLikedComments = new Set(data.likedComments);
        }
    } catch (error) {
        console.error('좋아요 상태 로드 실패:', error);
    }
}

function renderPaginatedComments(issueId) {
    // issueId를 항상 문자열로 통일
    issueId = String(issueId);
    console.log('📄 renderPaginatedComments 호출됨, issueId:', issueId, 'type:', typeof issueId);
    
    const pagination = commentsPagination.get(issueId);
    if (!pagination) {
        console.log('❌ pagination 없음');
        return '';
    }
    
    const { currentPage, allComments, commentsPerPage, totalComments } = pagination;
    console.log('📊 pagination 정보:', { currentPage, totalComments, commentsPerPage, allCommentsLength: allComments.length });
    
    if (totalComments === 0) {
        console.log('📭 댓글 없음 - 빈 상태 표시');
        return `
            <div class="text-center py-8 text-gray-500">
                <i data-lucide="message-circle" class="w-8 h-8 mx-auto mb-3 text-gray-300"></i>
                <p>첫 번째 댓글을 작성해보세요!</p>
            </div>
        `;
    }
    
    // 현재 페이지까지의 댓글들 표시
    const endIndex = currentPage * commentsPerPage;
    const visibleComments = allComments.slice(0, endIndex);
    const hasMore = endIndex < totalComments;
    
    console.log('📋 표시할 댓글:', { endIndex, visibleCommentsCount: visibleComments.length, hasMore });
    
    let html = `
        <div class="comments-header mb-4">
            <div class="flex items-center justify-between">
                <h4 class="font-semibold text-gray-900">댓글 ${totalComments}개</h4>
                ${totalComments > commentsPerPage ? `
                    <span class="text-sm text-gray-500">
                        ${Math.min(endIndex, totalComments)}/${totalComments}개 표시
                    </span>
                ` : ''}
            </div>
        </div>
        <div class="comments-list space-y-4">
            ${visibleComments.map(comment => renderComment(comment)).join('')}
        </div>
    `;
    
    // 더보기 버튼
    if (hasMore) {
        const remainingComments = totalComments - endIndex;
        console.log('➕ 더보기 버튼 생성:', { remainingComments, totalComments, endIndex });
        console.log('🔧 더보기 버튼에 사용될 issueId:', issueId, 'type:', typeof issueId);
        html += `
            <div class="comments-load-more mt-6 text-center">
                <button class="load-more-comments-btn inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border border-blue-200 rounded-lg text-blue-700 font-medium transition-all duration-200 hover:shadow-md" 
                        onclick="loadMoreComments(${issueId})">
                    <i data-lucide="chevron-down" class="w-4 h-4 mr-2"></i>
                    댓글 ${Math.min(3, remainingComments)}개 더보기
                </button>
            </div>
        `;
    } else {
        console.log('✅ 모든 댓글 표시됨 - 더보기 버튼 없음');
    }
    
    console.log('🏁 renderPaginatedComments 완료, HTML 길이:', html.length);
    return html;
}

function renderComments(comments) {
    if (comments.length === 0) {
        return `
            <div class="text-center py-8 text-gray-500">
                <i data-lucide="message-circle" class="w-8 h-8 mx-auto mb-3 text-gray-300"></i>
                <p>첫 번째 댓글을 작성해보세요!</p>
            </div>
        `;
    }
    
    return comments.map(comment => renderComment(comment)).join('');
}

// 더보기 댓글 로드 함수
window.loadMoreComments = function(issueId) {
    // issueId를 항상 문자열로 통일
    issueId = String(issueId);
    console.log('🔄 loadMoreComments 호출됨:', issueId, 'type:', typeof issueId);
    console.log('🗂️ 현재 commentsPagination 전체:', commentsPagination);
    console.log('🔑 commentsPagination keys:', Array.from(commentsPagination.keys()));
    
    let pagination = commentsPagination.get(issueId);
    if (!pagination) {
        console.log('❌ pagination 데이터 없음, issueId:', issueId, 'type:', typeof issueId);
        
        // 다른 타입으로 시도해보기
        const stringId = String(issueId);
        const numberId = Number(issueId);
        console.log('🔍 String ID로 시도:', stringId, commentsPagination.get(stringId));
        console.log('🔍 Number ID로 시도:', numberId, commentsPagination.get(numberId));
        
        // 타입 변환해서 찾기
        pagination = commentsPagination.get(stringId) || commentsPagination.get(numberId);
        
        if (!pagination) {
            console.log('❌ 모든 시도 실패 - pagination 데이터를 찾을 수 없음');
            
            // 댓글 데이터를 다시 로드해보기
            console.log('🔄 댓글 데이터 재로드 시도...');
            loadComments(issueId, false);
            return;
        } else {
            console.log('✅ 타입 변환으로 pagination 발견:', pagination);
        }
    }
    
    console.log('📊 현재 pagination 상태:', pagination);
    
    // 현재 위치 저장 (새로 추가될 첫 번째 댓글의 위치)
    const commentsSection = document.querySelector(`.comments-section[data-issue-id="${issueId}"]`);
    const containerEl = commentsSection.querySelector('.comments-container');
    const currentShowing = pagination.currentPage * pagination.commentsPerPage;
    
    console.log('📈 현재 표시 중인 댓글 수:', currentShowing);
    
    // 현재 표시된 댓글 수에 더 추가 (단순하게 3개씩 추가)
    const newCommentsToShow = Math.min(3, pagination.totalComments - currentShowing);
    
    console.log('➕ 새로 추가할 댓글 수:', newCommentsToShow);
    
    if (newCommentsToShow <= 0) {
        console.log('✅ 더 이상 표시할 댓글 없음');
        return;
    }
    
    // 페이지 증가 및 업데이트
    pagination.currentPage++;
    
    // pagination 객체를 올바른 key로 다시 저장
    const originalKey = Array.from(commentsPagination.keys()).find(key => String(key) === String(issueId));
    if (originalKey) {
        commentsPagination.set(originalKey, pagination);
        console.log('📄 새로운 페이지:', pagination.currentPage, '저장 key:', originalKey);
    } else {
        console.log('⚠️ 원본 key를 찾을 수 없음, 현재 key로 저장');
        commentsPagination.set(issueId, pagination);
    }
    
    // 댓글 섹션 다시 렌더링 (같은 key 타입 사용)
    const keyToUse = Array.from(commentsPagination.keys()).find(key => String(key) === String(issueId));
    console.log('🔑 렌더링에 사용할 key:', keyToUse);
    containerEl.innerHTML = renderPaginatedComments(keyToUse || issueId);
    
    console.log('🎨 렌더링 완료');
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // 새로 로드된 댓글로 스크롤 (부드럽게)
    setTimeout(() => {
        const commentsList = containerEl.querySelector('.comments-list');
        if (commentsList) {
            const allComments = commentsList.querySelectorAll('.comment');
            if (allComments.length > currentShowing) {
                // 새로 추가된 첫 번째 댓글로 스크롤
                const firstNewComment = allComments[currentShowing];
                if (firstNewComment) {
                    firstNewComment.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start',
                        inline: 'nearest'
                    });
                    
                    // 시각적 강조 효과
                    firstNewComment.style.background = 'linear-gradient(135deg, #dbeafe, #e0e7ff)';
                    firstNewComment.style.transition = 'background 0.3s ease';
                    
                    setTimeout(() => {
                        firstNewComment.style.background = '';
                    }, 2000);
                }
            }
        }
    }, 100);
}

// 전역으로 노출
window.loadMoreComments = loadMoreComments;

function renderComment(comment) {
    const isLiked = userLikedComments.has(comment.id);
    const isOwner = currentUser && currentUser.id === comment.user_id;
    const isHighlighted = comment.is_highlighted;
    
    let highlightClass = '';
    let highlightBadge = '';
    
    if (isHighlighted) {
        highlightClass = 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200';
        highlightBadge = `
            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 font-medium">
                <i data-lucide="star" class="w-3 h-3 mr-1"></i>
                강조
            </span>
        `;
    }
    
    const repliesHtml = comment.replies ? comment.replies.map(reply => renderReply(reply)).join('') : '';
    
    return `
        <div class="comment ${highlightClass} border rounded-lg p-4 mb-4" data-comment-id="${comment.id}">
            <div class="flex items-start space-x-3 mb-3">
                <div class="flex-shrink-0">
                    ${generateCommentTierIcon(Math.max(comment.gam_balance || 0, comment.coins || 0))}
                </div>
                <div class="flex-grow min-w-0">
                    <div class="flex items-center space-x-2 mb-1">
                        <span class="font-medium text-gray-900">${comment.username}</span>
                        ${generateCommentTierBadge(Math.max(comment.gam_balance || 0, comment.coins || 0))}
                        ${highlightBadge}
                        <span class="text-xs text-gray-500">${comment.timeAgo}</span>
                    </div>
                    <p class="text-gray-800 text-sm leading-relaxed">${comment.content}</p>
                </div>
            </div>
            
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-4">
                    ${currentUser ? `
                        <button class="comment-like-btn flex items-center space-x-1 text-sm ${isLiked ? 'text-red-500' : 'text-gray-500'} hover:text-red-500 transition-colors" data-comment-id="${comment.id}">
                            <i data-lucide="heart" class="w-4 h-4 ${isLiked ? 'fill-current' : ''}"></i>
                            <span>${comment.likes || 0}</span>
                        </button>
                        <button class="comment-reply-btn text-sm text-gray-500 hover:text-blue-500 transition-colors" data-comment-id="${comment.id}">
                            <i data-lucide="reply" class="w-4 h-4 mr-1"></i>
                            답글
                        </button>
                    ` : ''}
                </div>
                
                ${isOwner ? `
                    <button class="comment-delete-btn text-xs text-red-500 hover:text-red-700 transition-colors" data-comment-id="${comment.id}">
                        <i data-lucide="trash-2" class="w-3 h-3 mr-1"></i>
                        삭제
                    </button>
                ` : ''}
            </div>
            
            <div class="reply-form-container hidden mt-4"></div>
            
            ${repliesHtml ? `
                <div class="replies-container mt-4 pl-8 border-l-2 border-gray-100">
                    ${repliesHtml}
                </div>
            ` : ''}
        </div>
    `;
}

function renderReply(reply) {
    const isLiked = userLikedComments.has(reply.id);
    const isOwner = currentUser && currentUser.id === reply.user_id;
    
    return `
        <div class="reply border-b border-gray-100 pb-3 mb-3 last:border-b-0 last:pb-0 last:mb-0" data-comment-id="${reply.id}">
            <div class="flex items-start space-x-3">
                <div class="flex-shrink-0">
                    ${generateReplyTierIcon(Math.max(reply.gam_balance || 0, reply.coins || 0))}
                </div>
                <div class="flex-grow min-w-0">
                    <div class="flex items-center space-x-2 mb-1">
                        <span class="font-medium text-gray-900 text-sm">${reply.username}</span>
                        ${generateCommentTierBadge(Math.max(reply.gam_balance || 0, reply.coins || 0))}
                        <span class="text-xs text-gray-500">${reply.timeAgo}</span>
                    </div>
                    <p class="text-gray-800 text-sm leading-relaxed">${reply.content}</p>
                    
                    <div class="flex items-center justify-between mt-2">
                        <div class="flex items-center space-x-3">
                            ${currentUser ? `
                                <button class="comment-like-btn flex items-center space-x-1 text-xs ${isLiked ? 'text-red-500' : 'text-gray-500'} hover:text-red-500 transition-colors" data-comment-id="${reply.id}">
                                    <i data-lucide="heart" class="w-3 h-3 ${isLiked ? 'fill-current' : ''}"></i>
                                    <span>${reply.likes || 0}</span>
                                </button>
                            ` : ''}
                        </div>
                        
                        ${isOwner ? `
                            <button class="comment-delete-btn text-xs text-red-500 hover:text-red-700 transition-colors" data-comment-id="${reply.id}">
                                <i data-lucide="trash-2" class="w-3 h-3 mr-1"></i>
                                삭제
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function showCommentForm(issueId) {
    const commentsSection = document.querySelector(`.comments-section[data-issue-id="${issueId}"]`);
    const formContainer = commentsSection.querySelector('.comment-form-container');
    
    formContainer.innerHTML = `
        <form class="comment-form bg-gray-50 rounded-lg p-4" data-issue-id="${issueId}">
            <textarea 
                name="content" 
                placeholder="이 이슈에 대한 의견을 남겨보세요..." 
                class="w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows="3"
                maxlength="500"
                required
            ></textarea>
            <div class="flex items-center justify-between mt-3">
                <span class="text-xs text-gray-500">
                    <span class="character-count">0</span> / 500자
                </span>
                <div class="flex items-center space-x-2">
                    <button type="button" class="cancel-comment text-sm text-gray-500 hover:text-gray-700 transition-colors">
                        취소
                    </button>
                    <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        댓글 작성
                    </button>
                </div>
            </div>
        </form>
    `;
    
    formContainer.classList.remove('hidden');
    
    const textarea = formContainer.querySelector('textarea');
    const charCount = formContainer.querySelector('.character-count');
    
    textarea.addEventListener('input', () => {
        charCount.textContent = textarea.value.length;
    });
    
    formContainer.querySelector('.cancel-comment').addEventListener('click', () => {
        formContainer.classList.add('hidden');
    });
    
    textarea.focus();
}

function toggleReplyForm(commentId) {
    const comment = document.querySelector(`[data-comment-id="${commentId}"]`);
    const replyContainer = comment.querySelector('.reply-form-container');
    
    if (replyContainer.classList.contains('hidden')) {
        const issueId = comment.closest('.comments-section').dataset.issueId;
        
        replyContainer.innerHTML = `
            <form class="comment-form bg-blue-50 rounded-lg p-3" data-issue-id="${issueId}" data-parent-id="${commentId}">
                <textarea 
                    name="content" 
                    placeholder="답글을 작성하세요..." 
                    class="w-full p-2 border border-blue-200 rounded resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    rows="2"
                    maxlength="500"
                    required
                ></textarea>
                <div class="flex items-center justify-between mt-2">
                    <span class="text-xs text-gray-500">
                        <span class="character-count">0</span> / 500자
                    </span>
                    <div class="flex items-center space-x-2">
                        <button type="button" class="cancel-reply text-xs text-gray-500 hover:text-gray-700 transition-colors">
                            취소
                        </button>
                        <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors">
                            답글 작성
                        </button>
                    </div>
                </div>
            </form>
        `;
        
        replyContainer.classList.remove('hidden');
        
        const textarea = replyContainer.querySelector('textarea');
        const charCount = replyContainer.querySelector('.character-count');
        
        textarea.addEventListener('input', () => {
            charCount.textContent = textarea.value.length;
        });
        
        replyContainer.querySelector('.cancel-reply').addEventListener('click', () => {
            replyContainer.classList.add('hidden');
        });
        
        textarea.focus();
    } else {
        replyContainer.classList.add('hidden');
    }
}

async function handleCommentSubmit(form, issueId, parentId = null) {
    const formData = new FormData(form);
    const content = formData.get('content').trim();
    
    if (!content) return;
    
    // 사용자 인증 확인
    if (!currentUser || !currentUser.id) {
        showError('로그인이 필요합니다.');
        return;
    }
    
    const submitBtn = form.querySelector('[type="submit"]');
    const originalText = submitBtn.textContent;
    
    try {
        submitBtn.disabled = true;
        submitBtn.textContent = '작성 중...';
        
        
        const response = await fetch('/api/comments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: currentUser.id,
                issueId: parseInt(issueId),
                content: content,
                parentId: parentId ? parseInt(parentId) : null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 페이지네이션 상태 리셋하고 댓글 다시 로드
            commentsPagination.delete(issueId);
            await loadComments(issueId);
            form.reset();
            
            if (parentId) {
                form.closest('.reply-form-container').classList.add('hidden');
            }
            
            showNotification('댓글이 작성되었습니다.', 'success');
        } else {
            throw new Error(data.error || '댓글 작성에 실패했습니다.');
        }
    } catch (error) {
        console.error('댓글 작성 실패:', error);
        showNotification(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

async function handleCommentLike(commentId, btn) {
    if (!currentUser) {
        showNotification('로그인이 필요합니다.', 'error');
        return;
    }
    
    const isLiked = userLikedComments.has(parseInt(commentId));
    const action = isLiked ? 'unlike' : 'like';
    
    try {
        const response = await fetch(`/api/comments/${commentId}/like`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: currentUser.id,
                action: action
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const heartIcon = btn.querySelector('[data-lucide="heart"]');
            const countSpan = btn.querySelector('span');
            
            if (action === 'like') {
                userLikedComments.add(parseInt(commentId));
                btn.classList.remove('text-gray-500');
                btn.classList.add('text-red-500');
                heartIcon.classList.add('fill-current');
                countSpan.textContent = parseInt(countSpan.textContent) + 1;
            } else {
                userLikedComments.delete(parseInt(commentId));
                btn.classList.remove('text-red-500');
                btn.classList.add('text-gray-500');
                heartIcon.classList.remove('fill-current');
                countSpan.textContent = parseInt(countSpan.textContent) - 1;
            }
        } else {
            throw new Error(data.error || '좋아요 처리에 실패했습니다.');
        }
    } catch (error) {
        console.error('좋아요 처리 실패:', error);
        showNotification(error.message, 'error');
    }
}

async function handleCommentDelete(commentId) {
    if (!confirm('정말로 이 댓글을 삭제하시겠습니까?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/comments/${commentId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: currentUser.id
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
            const issueId = commentEl.closest('.comments-section').dataset.issueId;
            
            // 페이지네이션 상태 리셋하고 댓글 다시 로드
            commentsPagination.delete(issueId);
            await loadComments(issueId);
            showNotification('댓글이 삭제되었습니다.', 'success');
        } else {
            throw new Error(data.error || '댓글 삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('댓글 삭제 실패:', error);
        showNotification(error.message, 'error');
    }
}

function showNotification(message, type = 'info') {
    // 쿨다운 알림인경우 특별한 모달 스타일로 표시
    if (message.includes('30초에 한 번만 가능') || message.includes('쿨다운') || message.includes('후에 다시 시도')) {
        showCooldownModal(message);
        return;
    }
    
    // 기존 알림 제거
    const existingNotifications = document.querySelectorAll('.yegam-notification');
    existingNotifications.forEach(notif => notif.remove());
    
    const notification = document.createElement('div');
    notification.className = `yegam-notification fixed top-20 right-4 px-4 py-3 rounded-lg text-white text-sm font-medium transition-all duration-300 transform translate-x-full opacity-0 shadow-lg border ${
        type === 'success' ? 'bg-green-500 border-green-600' : 
        type === 'error' ? 'bg-red-500 border-red-600' : 
        'bg-blue-500 border-blue-600'
    }`;
    notification.style.zIndex = '50001'; // 헤더보다 위에 표시
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // 애니메이션
    requestAnimationFrame(() => {
        notification.classList.remove('translate-x-full', 'opacity-0');
    });
    
    // 3초 후 제거
    setTimeout(() => {
        notification.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// 쿨다운 전용 모달 알림 (전역 함수)
function showCooldownModal(message) {
    // 기존 쿨다운 모달 제거
    const existingModal = document.querySelector('.cooldown-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // 쿨다운 시간 추출
    const timeMatch = message.match(/(\d+)초/);
    const cooldownTime = timeMatch ? parseInt(timeMatch[1]) : 30;
    
    const modal = document.createElement('div');
    modal.className = 'cooldown-modal fixed inset-0 flex items-center justify-center transition-all duration-300 opacity-0';
    modal.style.zIndex = '50002'; // 최상위 레이어
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    
    modal.innerHTML = `
        <div class="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-2xl transform scale-95 transition-all duration-300">
            <div class="text-center">
                <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 mb-4">
                    <i data-lucide="clock" class="h-6 w-6 text-orange-600"></i>
                </div>
                <h3 class="text-lg font-medium text-gray-900 mb-2">잠시만 기다려주세요</h3>
                <p class="text-sm text-gray-600 mb-4">
                    댓글 작성은 <span class="font-semibold text-orange-600">${cooldownTime}초에 한 번씩</span> 가능합니다.
                </p>
                <div class="countdown-display bg-orange-50 rounded-lg p-3 mb-4">
                    <span class="text-2xl font-bold text-orange-600 countdown-number">${cooldownTime}</span>
                    <span class="text-sm text-orange-600 ml-1">초 후 다시 시도</span>
                </div>
                <button class="close-cooldown-modal w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors">
                    확인
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Lucide 아이콘 초기화
    if (window.lucide) {
        window.lucide.createIcons();
    }
    
    // 애니메이션 시작
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        const content = modal.querySelector('div > div');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    });
    
    // 카운트다운 타이머
    let remainingTime = cooldownTime;
    const countdownNumber = modal.querySelector('.countdown-number');
    
    const countdownTimer = setInterval(() => {
        remainingTime--;
        if (remainingTime > 0) {
            countdownNumber.textContent = remainingTime;
        } else {
            clearInterval(countdownTimer);
            countdownNumber.textContent = '0';
            countdownNumber.parentElement.innerHTML = '<span class="text-green-600 font-medium">이제 댓글을 작성할 수 있습니다!</span>';
        }
    }, 1000);
    
    // 모달 닫기 이벤트
    const closeModal = () => {
        clearInterval(countdownTimer);
        modal.classList.add('opacity-0');
        const content = modal.querySelector('div > div');
        content.classList.add('scale-95');
        setTimeout(() => {
            modal.remove();
        }, 300);
    };
    
    modal.querySelector('.close-cooldown-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // 자동 닫기 (카운트다운 완료 후 3초)
    setTimeout(() => {
        if (document.body.contains(modal)) {
            closeModal();
        }
    }, (cooldownTime + 3) * 1000);
}


// 배당률 정보를 로드하고 업데이트하는 함수
async function loadAndUpdateBettingOdds(issueId) {
    try {
        const response = await fetch(`/api/issues/${issueId}/betting-stats`);
        const data = await response.json();
        
        const oddsElement = document.getElementById(`odds-${issueId}`);
        if (!oddsElement) return;
        
        if (data.success && data.stats) {
            const { yesOdds, noOdds } = data.stats;
            oddsElement.innerHTML = `
                <div class="flex justify-between items-center text-xs">
                    <div class="flex items-center space-x-1">
                        <span class="text-green-600 font-medium">Yes:</span>
                        <span class="text-green-700 font-bold">${yesOdds.toFixed(2)}배</span>
                    </div>
                    <div class="flex items-center space-x-1">
                        <span class="text-red-600 font-medium">No:</span>
                        <span class="text-red-700 font-bold">${noOdds.toFixed(2)}배</span>
                    </div>
                </div>
            `;
        } else {
            oddsElement.innerHTML = `
                <div class="flex justify-center items-center text-xs text-gray-500">
                    <span>배당률 정보 없음</span>
                </div>
            `;
        }
    } catch (error) {
        console.error(`배당률 로드 실패 (이슈 ${issueId}):`, error);
        const oddsElement = document.getElementById(`odds-${issueId}`);
        if (oddsElement) {
            oddsElement.innerHTML = `
                <div class="flex justify-center items-center text-xs text-gray-500">
                    <span>배당률 로드 실패</span>
                </div>
            `;
        }
    }
}

// 모든 이슈의 배당률을 로드하는 함수
async function loadAllBettingOdds() {
    const allIssueCards = document.querySelectorAll('[id^="odds-"]');
    const promises = [];
    
    allIssueCards.forEach(element => {
        const issueId = element.id.replace('odds-', '');
        if (issueId && !isNaN(issueId)) {
            promises.push(loadAndUpdateBettingOdds(parseInt(issueId)));
        }
    });
    
    // 모든 배당률을 병렬로 로드
    await Promise.allSettled(promises);
}

// Display-only cards: stored descriptions, rules and financial actions are unchanged.
function createIssueCard(issue) {
    if (window.MarketCard) {
        return window.MarketCard.renderCard(issue, window.IssueSummary?.buildIssueSummary(issue));
    }
    const yesPrice = issue.yesPercentage || issue.yes_price || 50;
    const noPrice = 100 - yesPrice;
    const volume = issue.total_volume || issue.totalVolume || 0;
    const isClosed = issue.status === 'closed' || new Date(issue.end_date || issue.endDate) <= new Date();
    const timeLeft = getTimeLeft(issue.end_date || issue.endDate);
    
    return `
        <div class="bg-white rounded-lg border border-gray-200 p-3 md:p-4 hover:border-gray-300 transition-colors ${isClosed ? 'opacity-60' : ''}" 
             data-id="${issue.id}">
            
            <!-- Header: End date -->
            <div class="flex items-center justify-between mb-2">
                <div class="text-xs text-gray-400 flex items-center gap-1">
                    <i data-lucide="clock" class="w-3 h-3"></i>
                    <span>${isClosed ? '종료됨' : `${timeLeft} · ${formatEndDate(issue.end_date || issue.endDate)}`}</span>
                </div>
                ${isClosed ? '<span class="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">종료</span>' : ''}
            </div>
            
            <!-- Title + Thumbnail -->
            <div class="flex gap-3 mb-3">
                <div class="flex-1 min-w-0">
                    <h3 class="text-sm md:text-base font-semibold text-gray-900 leading-snug line-clamp-2">
                        ${issue.title}
                    </h3>
                    ${issue.description ? 
                        `<p class="text-sm text-gray-500 mt-1 line-clamp-2">${issue.description}</p>` : ''
                    }
                </div>
                ${issue.image_url || issue.imageUrl ? 
                    `<div class="flex-shrink-0">
                        <img src="${issue.image_url || issue.imageUrl}" 
                             alt="" 
                             class="w-16 h-16 object-cover rounded-lg"
                             loading="lazy"
                             onerror="this.parentElement.style.display='none'">
                    </div>` : ''
                }
            </div>
            
            <!-- Main percentage + Volume -->
            <div class="flex items-baseline justify-between mb-3">
                <span class="text-xl font-bold text-gray-900">${yesPrice}%</span>
                <span class="text-xs text-gray-400">${formatVolume(volume)} Vol.</span>
            </div>
            
            <!-- YES/NO Buttons -->
            <div class="flex gap-2">
                ${isClosed ? 
                    `<div class="flex-1 bg-gray-100 text-gray-500 py-1.5 px-3 rounded-lg text-xs font-medium text-center">
                        종료됨
                    </div>` :
                    `<button class="flex-1 bg-emerald-400 hover:bg-emerald-500 text-white py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors"
                            onclick="placeBet(${issue.id}, 'Yes')">
                        Yes
                    </button>
                    <button class="flex-1 bg-rose-400 hover:bg-rose-500 text-white py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors"
                            onclick="placeBet(${issue.id}, 'No')">
                        No
                    </button>`
                }
            </div>
        </div>
    `;
}

// Betting function - 이제 새로운 모달을 사용
async function placeBet(issueId, choice) {
    if (!currentUser) {
        showInfo('예측을 하려면 로그인이 필요합니다.', '로그인 필요');
        window.location.href = 'login.html';
        return;
    }
    
    // 이슈 정보 찾기
    let issueTitle = '';
    try {
        const allIssues = [...(issues || [])];
        const issue = allIssues.find(i => i.id === issueId);
        issueTitle = issue ? issue.title : `이슈 #${issueId}`;
    } catch (error) {
        console.error('이슈 정보 조회 실패:', error);
        issueTitle = `이슈 #${issueId}`;
    }
    
    // 새로운 베팅 모달 열기
    if (typeof window.openBettingModal === 'function') {
        window.openBettingModal(issueId, choice, issueTitle, currentUser);
    } else {
        // 폴백: 기존 방식
        await placeBetLegacy(issueId, choice);
    }
}

// 기존 베팅 로직 (폴백용)
async function placeBetLegacy(issueId, choice) {
    const amount = prompt(`'${choice}'에 얼마나 예측하시겠습니까?\\n보유 GAM: ${(currentUser.gam_balance || currentUser.coins || 0).toLocaleString()}`, "1000");
    
    if (!amount || isNaN(amount) || parseInt(amount) <= 0) {
        return;
    }
    
    const betAmount = parseInt(amount);
    
    if (betAmount > (currentUser.gam_balance || currentUser.coins || 0)) {
        showWarning('보유 GAM이 부족합니다.', '잔액 부족');
        return;
    }
    
    try {
        const response = await fetch('/api/bets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                userId: currentUser.id,
                issueId: issueId,
                choice: choice,
                amount: betAmount
            })
        });
        
        const data = await response.json();
        
        if (data.success || response.ok) {
            showSuccess('예측이 완료되었습니다!', '베팅 성공');
            
            // Update user balance
            if (data.currentBalance !== undefined) {
                currentUser.gam_balance = data.currentBalance;
                currentUser.coins = data.currentBalance;
                
                // localStorage 업데이트
                localStorage.setItem('yegame-user', JSON.stringify(currentUser));
                
                // 전역 변수 동기화
                window.currentUser = currentUser;
                
                updateHeader();
        updateIssueRequestButtons(true);
            }
            
            // Refresh issues based on current page
            const currentPath = window.location.pathname.split("/").pop();
            if (currentPath === 'issues.html') {
                // Reload issues for issues page
                try {
                    const response = await fetch(`/api/issues?_t=${Date.now()}`);
                    const data = await response.json();
                    if (data.success) {
                        allIssues = data.issues.sort((a, b) => 
                            new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)
                        );
                        issues = allIssues;
                        console.log('Issues reloaded for issues.html, count:', allIssues.length);
                        
                        // renderAllIssuesOnPage 함수가 존재하는지 확인
                        if (typeof renderAllIssuesOnPage === 'function') {
                            renderAllIssuesOnPage();
                        } else {
                            console.error('renderAllIssuesOnPage function not found');
                            // 폴백: 페이지 새로고침
                            window.location.reload();
                        }
                    } else {
                        console.error('Failed to load issues:', data);
                        throw new Error(data.message || 'API request failed');
                    }
                } catch (error) {
                    console.error('Failed to reload issues:', error);
                    // 폴백: 페이지 새로고침
                    window.location.reload();
                }
            } else {
                // Refresh home page
                await initHomePage();
            }
        } else {
            showError(data.error || data.message || '예측에 실패했습니다.', '베팅 실패');
        }
    } catch (error) {
        console.error('Betting failed:', error);
        showError('예측 처리 중 오류가 발생했습니다.', '네트워크 오류');
    }
}

// Login page functions
function initLoginPage() {
    console.log('Initializing login page...');
    
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }
    
    // Setup tab switching
    setupLoginTabs();
}

function setupLoginTabs() {
    const loginTab = document.getElementById('login-tab');
    const signupTab = document.getElementById('signup-tab');
    const loginSection = document.getElementById('login-section');
    const signupSection = document.getElementById('signup-section');
    
    if (loginTab && signupTab && loginSection && signupSection) {
        loginTab.addEventListener('click', () => {
            switchTab(loginTab, signupTab, loginSection, signupSection);
        });
        
        signupTab.addEventListener('click', () => {
            switchTab(signupTab, loginTab, signupSection, loginSection);
        });
    }
}

function switchTab(activeTab, inactiveTab, activeSection, inactiveSection) {
    activeTab.classList.add('border-blue-500', 'text-blue-600');
    activeTab.classList.remove('border-transparent', 'text-gray-500');
    inactiveTab.classList.add('border-transparent', 'text-gray-500');
    inactiveTab.classList.remove('border-blue-500', 'text-blue-600');
    activeSection.classList.remove('hidden');
    inactiveSection.classList.add('hidden');
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = e.target.email.value;
    const password = e.target.password.value;
    const errorEl = document.getElementById('login-error');
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success && data.token) {
            // localStorage에 토큰과 사용자 정보 모두 저장
            localStorage.setItem('yegame-token', data.token);
            localStorage.setItem('yegame-user', JSON.stringify(data.user));
            
            userToken = data.token;
            currentUser = data.user;
            window.currentUser = currentUser; // 전역 변수 동기화
            
            console.log('Login successful, user data saved:', data.user.username);
            
            showSuccess(data.message || '로그인 성공!', '환영합니다');
            window.location.href = 'index.html';
        } else {
            showLoginError(errorEl, data.message || '로그인에 실패했습니다.');
        }
    } catch (error) {
        console.error('Login failed:', error);
        showLoginError(errorEl, '로그인 처리 중 오류가 발생했습니다.');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    
    const username = e.target.username.value;
    const email = e.target.email.value;
    const password = e.target.password.value;
    const confirmPassword = e.target.confirmPassword.value;
    const errorEl = document.getElementById('signup-error');
    
    if (password !== confirmPassword) {
        showLoginError(errorEl, '비밀번호가 일치하지 않습니다.');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.token) {
                // localStorage에 토큰과 사용자 정보 모두 저장
                localStorage.setItem('yegame-token', data.token);
                localStorage.setItem('yegame-user', JSON.stringify(data.user));
                
                userToken = data.token;
                currentUser = data.user;
                window.currentUser = currentUser; // 전역 변수 동기화
                
                console.log('Signup successful, user data saved:', data.user.username);
            }
            
            showSuccess(data.message || '회원가입이 완료되었습니다!', '계정 생성 완료');
            window.location.href = 'index.html';
        } else {
            showLoginError(errorEl, data.message || '회원가입에 실패했습니다.');
        }
    } catch (error) {
        console.error('Signup failed:', error);
        showLoginError(errorEl, '회원가입 처리 중 오류가 발생했습니다.');
    }
}

function showLoginError(errorEl, message) {
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
}

// Admin page functions
async function initAdminPage() {
    console.log('Initializing admin page...');
    
    // Check admin access
    if (!checkAdminAccess()) {
        showAdminLogin();
        return;
    }
    
    // Setup admin page UI events
    setupAdminPageEvents();
    setupAdminTabs();
    await loadAdminIssues();
    setupCreateIssueForm();
    
    // 결과관리와 스케줄러 데이터 미리 로드
    try {
        await loadResultsData();
        await loadSchedulerStatus();
    } catch (error) {
        console.error('관리자 데이터 초기 로딩 실패:', error);
    }
}

function setupAdminPageEvents() {
    // 새 이슈 생성 버튼
    const createBtn = document.getElementById('create-issue-btn');
    const modal = document.getElementById('create-issue-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    
    if (createBtn && modal) {
        createBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
        });
    }
    
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            // Reset form and image upload UI
            document.getElementById('create-issue-form')?.reset();
            document.getElementById('image-preview').classList.add('hidden');
            document.getElementById('upload-area').classList.remove('hidden');
            document.getElementById('image-url').value = '';
        });
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn && modal) {
        cancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            // Reset form and image upload UI
            document.getElementById('create-issue-form')?.reset();
            document.getElementById('image-preview').classList.add('hidden');
            document.getElementById('upload-area').classList.remove('hidden');
            document.getElementById('image-url').value = '';
        });
    }
    
    // 모달 배경 클릭 시 닫기
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }
    
    // 이슈 수정 모달 이벤트
    const editModal = document.getElementById('edit-issue-modal');
    const editCloseBtn = document.getElementById('close-edit-modal-btn');
    const editCancelBtn = document.getElementById('edit-cancel-btn');
    
    if (editCloseBtn && editModal) {
        editCloseBtn.addEventListener('click', () => {
            editModal.classList.add('hidden');
        });
    }
    
    if (editCancelBtn && editModal) {
        editCancelBtn.addEventListener('click', () => {
            editModal.classList.add('hidden');
        });
    }
    
    // 수정 모달 배경 클릭 시 닫기
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) {
                editModal.classList.add('hidden');
            }
        });
    }
    
    // 이미지 업로드 이벤트 설정
    setupImageUpload();
    setupEditImageUpload();
}

// 관리자 탭 설정
function setupAdminTabs() {
    const issuesTab = document.getElementById('issues-tab');
    const issueRequestsTab = document.getElementById('issue-requests-tab');
    const resultsTab = document.getElementById('results-tab');
    const commentsTab = document.getElementById('comments-tab');
    const schedulerTab = document.getElementById('scheduler-tab');
    const issuesSection = document.getElementById('issues-section');
    const issueRequestsSection = document.getElementById('issue-requests-section');
    const resultsSection = document.getElementById('results-section');
    const commentsSection = document.getElementById('comments-section');
    const schedulerSection = document.getElementById('scheduler-section');
    const createBtn = document.getElementById('create-issue-btn');
    
    if (!issuesTab || !issueRequestsTab || !resultsTab || !commentsTab || !schedulerTab) return;
    
    issuesTab.addEventListener('click', () => {
        switchAdminTab('issues', issuesTab, [issueRequestsTab, resultsTab, commentsTab, schedulerTab], [issuesSection], [issueRequestsSection, resultsSection, commentsSection, schedulerSection], createBtn, true);
    });
    
    issueRequestsTab.addEventListener('click', () => {
        switchAdminTab('issue-requests', issueRequestsTab, [issuesTab, resultsTab, commentsTab, schedulerTab], [issueRequestsSection], [issuesSection, resultsSection, commentsSection, schedulerSection], createBtn, false);
        loadIssueRequests();
    });
    
    resultsTab.addEventListener('click', () => {
        switchAdminTab('results', resultsTab, [issuesTab, issueRequestsTab, commentsTab, schedulerTab], [resultsSection], [issuesSection, issueRequestsSection, commentsSection, schedulerSection], createBtn, false);
        loadResultsData();
    });
    
    commentsTab.addEventListener('click', () => {
        switchAdminTab('comments', commentsTab, [issuesTab, issueRequestsTab, resultsTab, schedulerTab], [commentsSection], [issuesSection, issueRequestsSection, resultsSection, schedulerSection], createBtn, false);
        loadAdminComments();
    });
    
    schedulerTab.addEventListener('click', () => {
        switchAdminTab('scheduler', schedulerTab, [issuesTab, issueRequestsTab, resultsTab, commentsTab], [schedulerSection], [issuesSection, issueRequestsSection, resultsSection, commentsSection], createBtn, false);
        loadSchedulerStatus();
    });
    
    // 결과 관리 이벤트
    setupResultManagementEvents();
    // 댓글 관리 이벤트
    setupCommentManagementEvents();
    // 스케줄러 관리 이벤트
    setupSchedulerManagementEvents();
    // 이슈 신청 관리 이벤트
    setupIssueRequestManagementEvents();
}

function switchAdminTab(tabName, activeTabEl, inactiveTabEls, activeSectionEls, inactiveSectionEls, createBtn, showCreateBtn) {
    // 모든 탭을 비활성화
    inactiveTabEls.forEach(tab => {
        tab.className = 'admin-tab pb-4 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium';
    });
    
    // 활성 탭 스타일 적용
    activeTabEl.className = 'admin-tab active pb-4 border-b-2 border-blue-500 text-blue-600 font-medium';
    
    // 모든 섹션 숨김
    inactiveSectionEls.forEach(section => {
        section.classList.add('hidden');
    });
    
    // 활성 섹션 표시
    activeSectionEls.forEach(section => {
        section.classList.remove('hidden');
    });
    
    // 새 이슈 생성 버튼 표시/숨김
    if (createBtn) {
        if (showCreateBtn) {
            createBtn.classList.remove('hidden');
        } else {
            createBtn.classList.add('hidden');
        }
    }
}

// 결과 관리 이벤트 설정
function setupResultManagementEvents() {
    // 결과 필터 변경
    const resultFilter = document.getElementById('result-filter');
    if (resultFilter) {
        resultFilter.addEventListener('change', () => {
            loadResultsData();
        });
    }
    
    // 새로고침 버튼
    const refreshBtn = document.getElementById('refresh-results');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadResultsData();
        });
    }
    
    // 결과 모달 이벤트
    setupResultModal();
    
    // 결과 액션 이벤트 (이벤트 위임)
    document.addEventListener('click', async (e) => {
        if (e.target.closest('.result-decide-btn')) {
            const btn = e.target.closest('.result-decide-btn');
            const issueId = btn.dataset.issueId;
            openResultModal(issueId);
        }
        
        if (e.target.closest('.result-close-btn')) {
            const btn = e.target.closest('.result-close-btn');
            const issueId = btn.dataset.issueId;
            await handleCloseIssue(issueId);
        }
    });
}

async function loadResultsData() {
    const tbody = document.getElementById('results-table-body');
    const filterSelect = document.getElementById('result-filter');
    
    if (!tbody) {
        console.error('results-table-body element not found');
        return;
    }
    
    try {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8"><i data-lucide="loader" class="w-6 h-6 animate-spin mx-auto mb-2 text-gray-400"></i><br>로딩 중...</td></tr>';
        
        const filter = filterSelect ? filterSelect.value : 'closed';
        console.log('Loading results with filter:', filter);
        console.log('User token:', userToken ? 'Available' : 'Missing');
        
        const response = await window.adminFetch(`/api/admin/issues/closed?filter=${filter}`);
        
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success) {
            if (data.issues.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">해당하는 이슈가 없습니다.</td></tr>';
                return;
            }
            
            console.log('Rendering', data.issues.length, 'issues');
            tbody.innerHTML = data.issues.map(issue => renderResultRow(issue)).join('');
            
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        } else {
            console.error('API returned failure:', data.message);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">데이터 로딩에 실패했습니다: ${data.message || ''}</td></tr>`;
        }
    } catch (error) {
        console.error('결과 데이터 로딩 실패:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">데이터 로딩 중 오류가 발생했습니다: ${error.message}</td></tr>`;
    }
}

function renderResultRow(issue) {
    // 필드명 통일 및 시간 포맷 통일
    const endDate = issue.end_date || issue.endDate;
    const formattedEndDate = formatEndDate(endDate);
    const timeLeft = getTimeLeft(endDate);
    
    // 디버깅을 위한 로그
    console.log('Result row - Issue:', issue.id, 'EndDate:', endDate, 'Formatted:', formattedEndDate);
    
    // 임시로 단순화된 데이터 사용
    const totalVolume = issue.total_volume || 0;
    const yesCount = 0; // 임시로 0 설정
    const noCount = 0; // 임시로 0 설정
    
    let statusBadge = '';
    let resultBadge = '';
    let actionButtons = '';
    
    if (issue.result) {
        const resultColors = {
            'Yes': 'bg-green-100 text-green-800',
            'No': 'bg-red-100 text-red-800',
            'Draw': 'bg-yellow-100 text-yellow-800',
            'Cancelled': 'bg-gray-100 text-gray-800'
        };
        
        statusBadge = '<span class="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">결과 확정</span>';
        resultBadge = `<span class="px-2 py-1 text-xs font-medium ${resultColors[issue.result]} rounded-full">${issue.result}</span>`;
        
        if (issue.decided_by_name) {
            resultBadge += `<br><small class="text-gray-500">${issue.decided_by_name}</small>`;
        }
    } else {
        const now = new Date();
        const isExpired = endDate < now;
        
        if (isExpired || issue.status === 'closed') {
            statusBadge = '<span class="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">마감</span>';
            actionButtons = `
                <button class="result-decide-btn px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors" data-issue-id="${issue.id}">
                    결과 결정
                </button>
            `;
        } else {
            statusBadge = '<span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">진행중</span>';
            actionButtons = `
                <button class="result-close-btn px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors" data-issue-id="${issue.id}">
                    수동 마감
                </button>
            `;
        }
        
        resultBadge = '<span class="text-gray-500">대기 중</span>';
    }
    
    return `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4">
                <div class="max-w-xs">
                    <p class="text-sm font-medium text-gray-900 truncate">${issue.title}</p>
                    ${issue.description ? `<p class="text-xs text-gray-500 mt-1 truncate">${issue.description}</p>` : ''}
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 text-xs font-medium rounded-full ${getCategoryBadgeClass(issue.category)}">${issue.category}</span>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${formattedEndDate}</div>
                <div class="text-xs text-gray-500">${timeLeft}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900">
                    <div>참여 정보</div>
                    <div class="text-xs text-gray-500">${totalVolume.toLocaleString()} GAM</div>
                    <div class="text-xs text-gray-500">Yes 확률: ${issue.yes_price}%</div>
                </div>
            </td>
            <td class="px-6 py-4">${statusBadge}</td>
            <td class="px-6 py-4">${resultBadge}</td>
            <td class="px-6 py-4">${actionButtons}</td>
        </tr>
    `;
}

function getCategoryBadgeClass(category) {
    const classes = {
        '정치': 'bg-red-100 text-red-800',
        '스포츠': 'bg-cyan-100 text-cyan-800', 
        '경제': 'bg-green-100 text-green-800',
        '코인': 'bg-orange-100 text-orange-800',
        '테크': 'bg-purple-100 text-purple-800',
        '엔터': 'bg-pink-100 text-pink-800',
        '날씨': 'bg-blue-100 text-blue-800',
        '해외': 'bg-indigo-100 text-indigo-800'
    };
    return classes[category] || 'bg-gray-100 text-gray-800';
}

function setupResultModal() {
    const modal = document.getElementById('result-modal');
    const closeBtn = document.getElementById('close-result-modal-btn');
    const cancelBtn = document.getElementById('result-cancel-btn');
    const form = document.getElementById('result-form');
    
    if (!modal || !form) return;
    
    // 모달 닫기
    [closeBtn, cancelBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                modal.classList.add('hidden');
                form.reset();
            });
        }
    });
    
    // 결과 옵션 선택
    modal.addEventListener('click', (e) => {
        if (e.target.closest('.result-option')) {
            const option = e.target.closest('.result-option');
            const radio = option.parentElement.querySelector('input[type="radio"]');
            
            // 모든 옵션 선택 해제
            modal.querySelectorAll('.result-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // 선택된 옵션 표시
            option.classList.add('selected');
            radio.checked = true;
        }
    });
    
    // 폼 제출
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleResultSubmit(e);
    });
}

async function openResultModal(issueId) {
    const modal = document.getElementById('result-modal');
    
    try {
        // 관리자용 이슈 정보 조회
        const response = await window.adminFetch(`/api/admin/issues/${issueId}`);
        
        const data = await response.json();
        
        if (data.success && data.issue) {
            const issue = data.issue;
            
            // 모달에 이슈 정보 표시
            document.getElementById('result-issue-id').value = issueId;
            document.getElementById('result-issue-title').textContent = issue.title;
            document.getElementById('result-issue-category').textContent = issue.category;
            
            // 사용자 페이지와 동일한 시간 포맷 사용
            const endDate = issue.end_date || issue.endDate;
            document.getElementById('result-issue-end-date').textContent = formatEndDate(endDate);
            console.log('Result modal - Issue:', issue.id, 'EndDate:', endDate);
            
            modal.classList.remove('hidden');
        } else {
            alert('이슈 정보를 불러올 수 없습니다.');
        }
    } catch (error) {
        console.error('이슈 정보 조회 실패:', error);
        alert('이슈 정보를 불러오는 중 오류가 발생했습니다.');
    }
}

async function handleResultSubmit(e) {
    const formData = new FormData(e.target);
    const issueId = formData.get('issueId');
    const result = formData.get('result');
    const reason = formData.get('reason');
    
    if (!result) {
        alert('결과를 선택해주세요.');
        return;
    }
    
    if (!reason.trim()) {
        alert('결정 사유를 입력해주세요.');
        return;
    }
    
    try {
        const response = await window.adminFetch(`/api/admin/issues/${issueId}/result`, {
            method: 'POST',
            body: JSON.stringify({ result, reason })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(data.message);
            document.getElementById('result-modal').classList.add('hidden');
            loadResultsData(); // 테이블 새로고침
        } else {
            alert(data.message || '결과 처리에 실패했습니다.');
        }
    } catch (error) {
        console.error('결과 처리 실패:', error);
        alert('결과 처리 중 오류가 발생했습니다.');
    }
}

async function handleCloseIssue(issueId) {
    if (!confirm('이슈를 수동으로 마감하시겠습니까?')) return;
    
    try {
        console.log('수동 마감 시작 - 이슈 ID:', issueId);
        
        // adminFetch 함수 확인
        if (!window.adminFetch) {
            console.error('adminFetch 함수를 찾을 수 없습니다.');
            alert('관리자 인증이 필요합니다. 다시 로그인해주세요.');
            return;
        }
        
        // 먼저 /close 엔드포인트 시도, 실패시 수정 방식으로 폴백
        let response;
        let data;
        
        try {
            response = await window.adminFetch(`/api/admin/issues/${issueId}/close`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            data = await response.json();
        } catch (closeError) {
            console.log('close 엔드포인트 실패, 수정 방식으로 폴백:', closeError);
            
            // 폴백: 이슈의 마감시간을 현재 시간으로 변경
            const now = new Date();
            const utcNow = now.toISOString();
            
            response = await window.adminFetch(`/api/admin/issues/${issueId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    end_date: utcNow
                })
            });
            data = await response.json();
        }
        
        console.log('수동 마감 응답 상태:', response.status);
        console.log('수동 마감 응답 데이터:', data);
        
        if (data.success || response.ok) {
            alert(data.message || '이슈가 성공적으로 마감되었습니다.');
            await loadResultsData(); // 테이블 새로고침
        } else {
            console.error('수동 마감 실패:', data);
            alert(data.message || data.error || '이슈 마감에 실패했습니다.');
        }
    } catch (error) {
        console.error('이슈 마감 실패:', error);
        if (error.message.includes('Failed to fetch')) {
            alert('네트워크 연결을 확인해주세요.');
        } else if (error.message.includes('401') || error.message.includes('403')) {
            alert('관리자 권한이 없습니다. 다시 로그인해주세요.');
        } else {
            alert('이슈 마감 중 오류가 발생했습니다: ' + error.message);
        }
    }
}

function setupCommentManagementEvents() {
    // 댓글 필터 변경
    const commentFilter = document.getElementById('comment-filter');
    if (commentFilter) {
        commentFilter.addEventListener('change', () => {
            loadAdminComments();
        });
    }
    
    // 새로고침 버튼
    const refreshBtn = document.getElementById('refresh-comments');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadAdminComments();
        });
    }
    
    // 댓글 액션 이벤트 (이벤트 위임)
    document.addEventListener('click', async (e) => {
        if (e.target.closest('.admin-delete-comment')) {
            const btn = e.target.closest('.admin-delete-comment');
            const commentId = btn.dataset.commentId;
            await handleAdminDeleteComment(commentId);
        }
        
        if (e.target.closest('.admin-highlight-comment')) {
            const btn = e.target.closest('.admin-highlight-comment');
            const commentId = btn.dataset.commentId;
            const action = btn.dataset.action;
            await handleAdminHighlightComment(commentId, action);
        }
    });
}

async function loadAdminComments() {
    const tbody = document.getElementById('comments-table-body');
    const loadingEl = document.getElementById('comments-loading');
    const emptyEl = document.getElementById('comments-empty');
    const filterSelect = document.getElementById('comment-filter');
    
    if (!tbody || !loadingEl || !emptyEl) return;
    
    try {
        loadingEl.classList.remove('hidden');
        tbody.classList.add('hidden');
        emptyEl.classList.add('hidden');
        
        const filter = filterSelect ? filterSelect.value : 'all';
        const response = await window.adminFetch(`/api/admin/comments/all?filter=${filter}&limit=100`);
        const data = await response.json();
        
        if (data.success) {
            if (data.comments.length === 0) {
                loadingEl.classList.add('hidden');
                emptyEl.classList.remove('hidden');
                return;
            }
            
            tbody.innerHTML = data.comments.map(comment => renderAdminCommentRow(comment)).join('');
            
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            
            loadingEl.classList.add('hidden');
            tbody.classList.remove('hidden');
        } else {
            throw new Error(data.error || '댓글을 불러올 수 없습니다.');
        }
    } catch (error) {
        console.error('관리자 댓글 로드 실패:', error);
        loadingEl.innerHTML = `
            <div class="flex items-center justify-center py-8 text-red-500">
                <i data-lucide="alert-circle" class="w-5 h-5 mr-2"></i>
                <span>댓글을 불러올 수 없습니다.</span>
            </div>
        `;
    }
}

function renderAdminCommentRow(comment) {
    const statusBadge = comment.isDeleted ? 
        '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">삭제됨</span>' :
        comment.is_highlighted ? 
        '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">강조됨</span>' :
        '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">정상</span>';
    
    const actions = comment.isDeleted ? 
        '' : // 삭제된 댓글은 액션 버튼 없음
        `<div class="flex items-center space-x-2">
            ${!comment.is_highlighted ? 
                `<button class="admin-highlight-comment text-xs text-yellow-600 hover:text-yellow-700" data-comment-id="${comment.id}" data-action="highlight">강조</button>` :
                `<button class="admin-highlight-comment text-xs text-gray-600 hover:text-gray-700" data-comment-id="${comment.id}" data-action="unhighlight">강조해제</button>`
            }
            <button class="admin-delete-comment text-xs text-red-600 hover:text-red-700" data-comment-id="${comment.id}">삭제</button>
        </div>`;
    
    return `
        <tr>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900 max-w-xs truncate" title="${comment.content}">
                    ${comment.contentPreview}
                </div>
                ${comment.parent_id ? '<div class="text-xs text-gray-500 mt-1">↳ 답글</div>' : ''}
                ${comment.reply_count > 0 ? `<div class="text-xs text-blue-600 mt-1">${comment.reply_count}개 답글</div>` : ''}
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${comment.username}</div>
                <div class="text-xs text-gray-500">ID: ${comment.user_id}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900 max-w-xs truncate" title="${comment.issue_title}">
                    ${comment.issue_title}
                </div>
                <div class="text-xs text-gray-500">ID: ${comment.issue_id}</div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
                <div class="flex items-center">
                    <i data-lucide="heart" class="w-4 h-4 mr-1 ${comment.likes > 0 ? 'text-red-500' : 'text-gray-400'}"></i>
                    ${comment.likes}
                </div>
            </td>
            <td class="px-6 py-4">${statusBadge}</td>
            <td class="px-6 py-4 text-sm text-gray-500">${comment.timeAgo}</td>
            <td class="px-6 py-4">${actions}</td>
        </tr>
    `;
}

async function handleAdminDeleteComment(commentId) {
    if (!confirm('정말로 이 댓글을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
        return;
    }
    
    try {
        const response = await window.adminFetch(`/api/admin/comments/${commentId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('댓글이 삭제되었습니다.', 'success');
            await loadAdminComments();
        } else {
            throw new Error(data.error || '댓글 삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('관리자 댓글 삭제 실패:', error);
        showNotification(error.message, 'error');
    }
}

async function handleAdminHighlightComment(commentId, action) {
    try {
        const response = await window.adminFetch(`/api/admin/comments/${commentId}/highlight`, {
            method: 'POST',
            body: JSON.stringify({ action })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            await loadAdminComments();
        } else {
            throw new Error(data.error || '댓글 강조 처리에 실패했습니다.');
        }
    } catch (error) {
        console.error('관리자 댓글 강조 처리 실패:', error);
        showNotification(error.message, 'error');
    }
}

function checkAdminAccess() {
    // 새로운 보안 관리자 인증 시스템 확인
    const adminToken = localStorage.getItem('admin-token');
    const adminUser = localStorage.getItem('admin-user');
    const adminAuthCompleted = window.adminAuthCompleted;
    
    // 관리자 페이지에서는 새로운 인증 시스템 사용
    if (window.isAdminPage && adminAuthCompleted) {
        console.log('✅ 관리자 페이지 인증 확인됨 (새 시스템)');
        return true;
    }
    
    // 관리자 토큰과 사용자 정보가 모두 있으면 인증된 것으로 간주
    if (adminToken && adminUser) {
        try {
            const admin = JSON.parse(adminUser);
            console.log('✅ 관리자 인증 확인됨:', admin.username);
            return true;
        } catch (error) {
            console.error('관리자 사용자 정보 파싱 오류:', error);
        }
    }
    
    console.log('❌ 관리자 인증 실패 - 토큰 또는 사용자 정보 없음');
    return false;
}

function showAdminLogin() {
    // 새로운 보안 관리자 인증 시스템으로 리다이렉트
    console.log('❌ 관리자 인증 필요 - 관리자 로그인 페이지로 이동');
    window.location.href = '/admin-login';
}

async function loadAdminIssues() {
    try {
        // adminFetch가 사용 가능하면 사용, 아니면 일반 fetch 사용
        const response = window.adminFetch ? 
            await window.adminFetch(`/api/issues?_t=${Date.now()}`) : 
            await fetch(`/api/issues?_t=${Date.now()}`);
        const data = await response.json();
        
        if (data.success) {
            issues = data.issues;
            renderAdminIssueTable();
        }
    } catch (error) {
        console.error('Failed to load admin issues:', error);
    }
}

function renderAdminIssueTable() {
    const tbody = document.getElementById('issues-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = issues.map(issue => {
        // 필드명 통일: 사용자 페이지와 동일하게 endDate 사용
        const endDate = issue.end_date || issue.endDate;
        const formattedEndDate = formatEndDate(endDate);
        const timeLeft = getTimeLeft(endDate);
        
        // 디버깅을 위한 로그
        console.log('Admin table - Issue:', issue.id, 'EndDate:', endDate, 'Formatted:', formattedEndDate);
        
        return `
        <tr>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${issue.title}</div>
                <div class="text-sm text-gray-500">ID: ${issue.id}</div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 text-xs font-semibold rounded-full" style="${getCategoryBadgeStyle(issue.category)}">
                    ${issue.category}
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${formattedEndDate}</div>
                <div class="text-xs text-gray-500">${timeLeft}</div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">${issue.yesPercentage || issue.yes_price || 50}%</td>
            <td class="px-6 py-4 text-sm text-gray-900">${formatVolume(issue.total_volume || issue.totalVolume || 0)} GAM</td>
            <td class="px-6 py-4">
                <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${(issue.isPopular || issue.is_popular) ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                    ${(issue.isPopular || issue.is_popular) ? '인기' : '일반'}
                </span>
            </td>
            <td class="px-6 py-4 text-sm space-x-2">
                <button onclick="editIssue(${issue.id})" class="text-blue-600 hover:text-blue-900">수정</button>
                <button onclick="deleteIssue(${issue.id})" class="text-red-600 hover:text-red-900">삭제</button>
            </td>
        </tr>
        `;
    }).join('');
}

function setupCreateIssueForm() {
    const form = document.getElementById('create-issue-form');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = e.target.title.value;
        const category = e.target.category.value;
        const endDate = e.target.endDate.value;
        const description = e.target.description.value;
        const imageUrl = e.target.imageUrl.value;
        const yesPrice = e.target.yesPrice.value;
        const isPopular = e.target.isPopular.checked;
        
        try {
            console.log('🔄 이슈 생성 시작:', { title, category, endDate });
            
            const response = await window.adminFetch('/api/admin/issues', {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    category,
                    end_date: endDate,
                    description,
                    image_url: imageUrl,
                    yes_price: parseInt(yesPrice) || 50,
                    is_popular: isPopular
                })
            });
            
            console.log('📡 이슈 생성 응답:', response.status, response.statusText);
            
            let data;
            try {
                data = await response.json();
                console.log('📄 응답 데이터:', data);
            } catch (jsonError) {
                console.error('❌ 응답 JSON 파싱 실패:', jsonError);
                throw new Error(`서버 응답을 처리할 수 없습니다 (상태: ${response.status})`);
            }
            
            if (data.success || response.ok) {
                console.log('✅ 이슈 생성 성공');
                alert('이슈가 성공적으로 생성되었습니다!');
                e.target.reset();
                document.getElementById('create-issue-modal').classList.add('hidden');
                // Reset image upload UI
                document.getElementById('image-preview').classList.add('hidden');
                document.getElementById('upload-area').classList.remove('hidden');
                document.getElementById('image-url').value = '';
                await loadAdminIssues();
            } else {
                console.warn('⚠️ 이슈 생성 실패:', data);
                alert(data.message || '이슈 생성에 실패했습니다.');
            }
        } catch (error) {
            console.error('❌ 이슈 생성 중 오류:', error);
            
            // 구체적인 오류 메시지 제공
            let errorMessage = '이슈 생성 중 오류가 발생했습니다.';
            
            if (error.message.includes('네트워크')) {
                errorMessage = '네트워크 연결을 확인해주세요.';
            } else if (error.message.includes('인증')) {
                errorMessage = '관리자 인증이 만료되었습니다. 다시 로그인해주세요.';
            } else if (error.message.includes('서버')) {
                errorMessage = '서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            alert(errorMessage);
        }
    });
    
    // Edit form setup
    const editForm = document.getElementById('edit-issue-form');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const issueId = e.target.issueId.value;
            const title = e.target.title.value;
            const category = e.target.category.value;
            const endDateValue = e.target.endDate.value;
            const description = e.target.description.value;
            const imageUrl = e.target.imageUrl.value;
            const yesPrice = e.target.yesPrice.value;
            const isPopular = e.target.isPopular.checked;
            
            // 한국 시간대로 마감일 처리
            let processedEndDate = endDateValue;
            if (endDateValue) {
                // datetime-local 값을 한국 시간대로 명시적으로 처리
                processedEndDate = new Date(endDateValue + '+09:00').toISOString();
                console.log('관리자 입력 시간:', endDateValue);
                console.log('서버로 전송할 UTC 시간:', processedEndDate);
                
                // 과거 시간 체크
                const inputDateKST = new Date(endDateValue + '+09:00');
                const nowKST = new Date();
                if (inputDateKST <= nowKST) {
                    if (!confirm('마감 시간이 현재 시간보다 이전입니다. 이슈가 즉시 마감처리됩니다. 계속하시겠습니까?')) {
                        return;
                    }
                }
            }
            
            try {
                const response = await window.adminFetch(`/api/admin/issues/${issueId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        title,
                        category,
                        end_date: processedEndDate,
                        description,
                        image_url: imageUrl,
                        yes_price: parseInt(yesPrice),
                        is_popular: isPopular
                    })
                });
                
                const data = await response.json();
                
                if (data.success || response.ok) {
                    alert('이슈가 성공적으로 수정되었습니다!');
                    document.getElementById('edit-issue-modal').classList.add('hidden');
                    
                    // 이슈 목록과 결과 관리 모두 새로고침
                    await loadAdminIssues();
                    await loadResultsData();
                } else {
                    console.error('이슈 수정 실패:', data);
                    alert(data.message || data.error || '이슈 수정에 실패했습니다.');
                }
            } catch (error) {
                console.error('Issue update failed:', error);
                alert('이슈 수정 중 오류가 발생했습니다.');
            }
        });
    }
}

// Image upload functions
function setupImageUpload() {
    const fileInput = document.getElementById('issue-image');
    const previewContainer = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    const uploadArea = document.getElementById('upload-area');
    const progressContainer = document.getElementById('upload-progress');
    const progressBar = progressContainer?.querySelector('.bg-blue-600');
    const removeBtn = document.getElementById('remove-image');
    const imageUrlInput = document.getElementById('image-url');
    
    if (!fileInput) return;
    
    fileInput.addEventListener('change', handleImageUpload);
    
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            fileInput.value = '';
            imageUrlInput.value = '';
            previewContainer.classList.add('hidden');
            uploadArea.classList.remove('hidden');
        });
    }
    
    async function handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Show progress
        uploadArea.classList.add('hidden');
        progressContainer.classList.remove('hidden');
        
        const formData = new FormData();
        formData.append('image', file);
        
        try {
            // 관리자 페이지에서는 관리자 토큰 사용
            const response = window.adminFetch ? 
                await window.adminFetch('/api/upload/image', {
                    method: 'POST',
                    body: formData
                }) : 
                await fetch('/api/upload/image', {
                    method: 'POST',
                    body: formData
                });
            
            const data = await response.json();
            
            if (data.success) {
                imageUrlInput.value = data.imageUrl;
                previewImg.src = data.imageUrl;
                previewContainer.classList.remove('hidden');
                progressContainer.classList.add('hidden');
            } else {
                throw new Error(data.error || '업로드 실패');
            }
        } catch (error) {
            console.error('Image upload failed:', error);
            alert('이미지 업로드에 실패했습니다: ' + error.message);
            uploadArea.classList.remove('hidden');
            progressContainer.classList.add('hidden');
            fileInput.value = '';
        }
    }
}

function setupEditImageUpload() {
    const fileInput = document.getElementById('edit-issue-image');
    const previewContainer = document.getElementById('edit-image-preview');
    const previewImg = document.getElementById('edit-preview-img');
    const uploadArea = document.getElementById('edit-upload-area');
    const progressContainer = document.getElementById('edit-upload-progress');
    const progressBar = progressContainer?.querySelector('.bg-blue-600');
    const removeBtn = document.getElementById('edit-remove-image');
    const imageUrlInput = document.getElementById('edit-image-url');
    
    if (!fileInput) return;
    
    fileInput.addEventListener('change', handleEditImageUpload);
    
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            fileInput.value = '';
            imageUrlInput.value = '';
            previewContainer.classList.add('hidden');
            uploadArea.classList.remove('hidden');
        });
    }
    
    async function handleEditImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Show progress
        uploadArea.classList.add('hidden');
        progressContainer.classList.remove('hidden');
        
        const formData = new FormData();
        formData.append('image', file);
        
        try {
            // 관리자 페이지에서는 관리자 토큰 사용
            const response = window.adminFetch ? 
                await window.adminFetch('/api/upload/image', {
                    method: 'POST',
                    body: formData
                }) : 
                await fetch('/api/upload/image', {
                    method: 'POST',
                    body: formData
                });
            
            const data = await response.json();
            
            if (data.success) {
                imageUrlInput.value = data.imageUrl;
                previewImg.src = data.imageUrl;
                previewContainer.classList.remove('hidden');
                progressContainer.classList.add('hidden');
            } else {
                throw new Error(data.error || '업로드 실패');
            }
        } catch (error) {
            console.error('Image upload failed:', error);
            alert('이미지 업로드에 실패했습니다: ' + error.message);
            uploadArea.classList.remove('hidden');
            progressContainer.classList.add('hidden');
            fileInput.value = '';
        }
    }
}

// Global functions
async function editIssue(issueId) {
    try {
        // Find the issue data
        const issue = issues.find(i => i.id === issueId);
        if (!issue) {
            alert('이슈를 찾을 수 없습니다.');
            return;
        }
        
        // Populate the edit form
        document.getElementById('edit-issue-id').value = issue.id;
        document.getElementById('edit-issue-title').value = issue.title;
        document.getElementById('edit-issue-category').value = issue.category;
        document.getElementById('edit-issue-description').value = issue.description || '';
        document.getElementById('edit-issue-yes-price').value = issue.yes_price || issue.yesPrice || 50;
        document.getElementById('edit-issue-popular').checked = issue.is_popular || issue.isPopular || false;
        
        // Format end date for datetime-local input (한국 시간대 적용)
        const endDate = new Date(issue.end_date || issue.endDate);
        if (!isNaN(endDate.getTime())) {
            // 한국 시간대로 datetime-local 형식 생성
            const datetimeLocal = endDate.toLocaleString('sv-SE', {
                timeZone: 'Asia/Seoul'
            }).replace(' ', 'T').slice(0, 16);
            document.getElementById('edit-issue-end-date').value = datetimeLocal;
            console.log('이슈 수정 폼 - 원본 UTC:', endDate.toISOString(), '한국시간 표시:', datetimeLocal);
        }
        
        // Handle existing image
        const imageUrl = issue.image_url || issue.imageUrl;
        if (imageUrl) {
            document.getElementById('edit-image-url').value = imageUrl;
            document.getElementById('edit-preview-img').src = imageUrl;
            document.getElementById('edit-image-preview').classList.remove('hidden');
            document.getElementById('edit-upload-area').classList.add('hidden');
        } else {
            document.getElementById('edit-image-url').value = '';
            document.getElementById('edit-image-preview').classList.add('hidden');
            document.getElementById('edit-upload-area').classList.remove('hidden');
        }
        
        // Show the edit modal
        document.getElementById('edit-issue-modal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Failed to open edit modal:', error);
        alert('이슈 수정 화면을 열 수 없습니다.');
    }
}

async function deleteIssue(issueId) {
    if (!confirm('정말로 이 이슈를 삭제하시겠습니까?')) return;
    
    try {
        const response = await window.adminFetch(`/api/admin/issues/${issueId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success || response.ok) {
            alert('이슈가 삭제되었습니다.');
            await loadAdminIssues();
        } else {
            alert(data.message || '이슈 삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('Issue deletion failed:', error);
        alert('이슈 삭제 중 오류가 발생했습니다.');
    }
}

// Utility functions
function getTimeLeft(endDate) {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end - now;
    
    if (diff <= 0) return "마감";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    
    if (days > 0) return `${days}일 남음`;
    if (hours > 0) return `${hours}시간 남음`;
    return "곧 마감";
}

function formatEndDate(endDate) {
    const date = new Date(endDate);
    if (isNaN(date.getTime())) return '';
    
    // 짧은 포맷: M/D HH:mm
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
}

function formatVolume(volume) {
    if (volume >= 100000000) {
        // 억 단위: 1억 이상
        const eok = Math.floor(volume / 100000000);
        const remainder = volume % 100000000;
        if (remainder >= 10000000) {
            const cheonMan = Math.floor(remainder / 10000000);
            return `${eok}억 ${cheonMan}천만`;
        }
        return `${eok}억`;
    }
    
    if (volume >= 10000000) {
        // 천만 단위: 1천만 이상
        const cheonMan = Math.floor(volume / 10000000);
        const remainder = volume % 10000000;
        if (remainder >= 1000000) {
            const baekMan = Math.floor(remainder / 1000000);
            return `${cheonMan}천${baekMan}백만`;
        }
        return `${cheonMan}천만`;
    }
    
    if (volume >= 10000) {
        // 만 단위: 1만 이상
        const man = Math.floor(volume / 10000);
        const remainder = volume % 10000;
        
        if (remainder >= 1000) {
            const cheon = Math.floor(remainder / 1000);
            return `${man}만 ${cheon}천`;
        }
        
        return `${man}만`;
    }
    
    if (volume >= 1000) {
        // 천 단위: 1000 이상
        const cheon = Math.floor(volume / 1000);
        const remainder = volume % 1000;
        
        if (remainder >= 100) {
            const baek = Math.floor(remainder / 100);
            return `${cheon}천 ${baek}백`;
        }
        
        return `${cheon}천`;
    }
    
    // 1000 미만은 그대로 표시
    return volume.toLocaleString();
}

function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `
            <div class="col-span-full text-center py-12">
                <div class="animate-spin inline-block w-6 h-6 border-[3px] border-current border-t-transparent text-blue-600 rounded-full"></div>
                <p class="mt-4 text-gray-600">로딩 중...</p>
            </div>
        `;
    }
}

function showError(message) {
    const allGrid = document.getElementById('all-issues-grid');
    if (allGrid) {
        allGrid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-red-600">${message}</p>
                <button onclick="location.reload()" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md">다시 시도</button>
            </div>
        `;
    }
}

function showSuccess(message) {
    const allGrid = document.getElementById('all-issues-grid');
    if (allGrid) {
        allGrid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-green-600">${message}</p>
                <button onclick="location.reload()" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md">새로고침</button>
            </div>
        `;
    }
}

// OAuth functions (placeholder)
function loginWithGoogle() {
    // Google OAuth 로그인 시작
    window.location.href = '/api/auth/google';
}

function loginWithGithub() {
    // GitHub OAuth 로그인 시작
    window.location.href = '/api/auth/github';
}

function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const oauth = urlParams.get('oauth');
    const error = urlParams.get('error');
    
    if (error) {
        let errorMessage = 'OAuth 로그인 중 오류가 발생했습니다.';
        switch (error) {
            case 'oauth':
                errorMessage = 'OAuth 인증에 실패했습니다. 다시 시도해주세요.';
                break;
            case 'callback':
                errorMessage = '로그인 처리 중 오류가 발생했습니다.';
                break;
        }
        alert(errorMessage);
        // URL에서 에러 파라미터 제거
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }
    
    if (token && oauth === 'success') {
        // OAuth 로그인 성공 - 토큰 저장 (일관된 키 사용)
        localStorage.setItem('yegame-token', token);
        console.log('OAuth 로그인 성공');
        
        // URL에서 토큰 파라미터 제거 (보안)
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // 성공 메시지 표시
        showSuccess('로그인이 완료되었습니다!');
        
        // 페이지 새로고침으로 인증 상태 업데이트
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
}

function showInfo(message, title = '알림') {
    const allGrid = document.getElementById('all-issues-grid');
    if (allGrid) {
        allGrid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <h3 class="text-lg font-medium text-gray-900 mb-2">${title}</h3>
                <p class="text-blue-600">${message}</p>
                <button onclick="location.reload()" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md">확인</button>
            </div>
        `;
    } else {
        alert(`${title}: ${message}`);
    }
}

// 전역으로 함수들 노출 (ES6 모듈에서 onclick 접근을 위해)
window.showError = showError;
window.showSuccess = showSuccess;
window.showInfo = showInfo;
window.loginWithGoogle = loginWithGoogle;
window.loginWithGithub = loginWithGithub;
window.logout = logout;
window.loadMoreComments = loadMoreComments;
window.scrollToIssueInAllSection = scrollToIssueInAllSection;
window.selectSearchResult = selectSearchResult;
window.placeBet = placeBet;
window.editIssue = editIssue;
window.deleteIssue = deleteIssue;
window.showIssueRequestDetails = showIssueRequestDetails;

// Placeholder functions for other pages
async function initIssuesPage() {
    console.log('Initializing Issues page...');
    
    try {
        // Load issues from API with status filter
        await loadIssuesWithStatus();
        setupIssuesPageEvents();
        renderAllIssuesOnPage();
    } catch (error) {
        console.error('Failed to load issues on Issues page:', error);
        showError('이슈를 불러오는데 실패했습니다.');
    }
}

// 상태별 이슈 로드 함수
async function loadIssuesWithStatus() {
    const statusMap = {
        'open': 'active',
        'closed': 'closed', 
        'all': 'all'
    };
    
    const status = statusMap[currentOpenFilter] || 'active';
    const response = await fetch(`/api/issues?status=${status}&_t=${Date.now()}`);
    const data = await response.json();
    
    if (data.success) {
        allIssues = data.issues.sort((a, b) => 
            new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)
        );
        issues = allIssues; // Keep for backward compatibility
        console.log('Loaded', allIssues.length, 'issues on Issues page with status:', status);
    } else {
        throw new Error(data.message || 'Failed to load issues');
    }
}

// Global filters for issues page
let currentTimeFilter = 'ALL';
let currentOpenFilter = 'open';

function setupIssuesPageEvents() {
    // Issues page specific event setup
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const sortFilter = document.getElementById('sort-filter');
    const openFilter = document.getElementById('open-filter');
    const timeFilterTabs = document.querySelectorAll('.time-tab');
    
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            currentSearch = e.target.value;
            currentPage = 1;
            renderAllIssuesOnPage();
        }, 300));
    }
    
    if (categoryFilter) {
        categoryFilter.addEventListener('change', (e) => {
            currentCategory = e.target.value === 'all' ? '전체' : e.target.value;
            currentPage = 1;
            renderAllIssuesOnPage();
        });
    }
    
    if (sortFilter) {
        sortFilter.addEventListener('change', (e) => {
            currentSort = e.target.value;
            currentPage = 1;
            renderAllIssuesOnPage();
        });
    }
    
    if (openFilter) {
        openFilter.addEventListener('change', async (e) => {
            currentOpenFilter = e.target.value;
            currentPage = 1;
            
            // API에서 새로운 상태의 이슈들을 다시 로드
            try {
                await loadIssuesWithStatus();
                renderAllIssuesOnPage();
            } catch (error) {
                console.error('Failed to reload issues with new status:', error);
                showError('이슈를 불러오는데 실패했습니다.');
            }
        });
    }
    
    // Time filter tabs
    timeFilterTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Remove active class from all tabs
            timeFilterTabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            e.target.classList.add('active');
            
            currentTimeFilter = e.target.dataset.time;
            currentPage = 1;
            renderAllIssuesOnPage();
        });
    });
    
    // Comments system already initialized globally, no need to reinitialize
}

function renderAllIssuesOnPage() {
    const grid = document.getElementById('all-issues-grid');
    if (!grid) return;
    
    // Filter and sort issues
    let filteredIssues = allIssues;
    
    // Apply category filter
    if (currentCategory !== '전체') {
        filteredIssues = filteredIssues.filter(issue => issue.category === currentCategory);
    }
    
    // Apply search filter
    if (currentSearch) {
        filteredIssues = filteredIssues.filter(issue => 
            issue.title.toLowerCase().includes(currentSearch.toLowerCase())
        );
    }
    
    // Open/closed filter is now handled by backend API
    // No need for client-side filtering
    
    // Apply time filter
    if (currentTimeFilter !== 'ALL') {
        const now = new Date();
        const timeMap = {
            '1H': 1 * 60 * 60 * 1000,
            '6H': 6 * 60 * 60 * 1000,
            '1D': 24 * 60 * 60 * 1000,
            '1W': 7 * 24 * 60 * 60 * 1000,
            '1M': 30 * 24 * 60 * 60 * 1000
        };
        
        const timeLimit = timeMap[currentTimeFilter];
        if (timeLimit) {
            const cutoffTime = new Date(now.getTime() - timeLimit);
            filteredIssues = filteredIssues.filter(issue => {
                const createdDate = new Date(issue.created_at || issue.createdAt || issue.created_date);
                return createdDate >= cutoffTime;
            });
        }
    }
    
    // Apply sorting
    filteredIssues = sortIssues(filteredIssues, currentSort);
    
    if (filteredIssues.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i data-lucide="search" class="w-12 h-12 mx-auto text-gray-300 mb-4"></i>
                <p class="text-gray-500">검색 결과가 없습니다.</p>
            </div>
        `;
        return;
    }
    
    // Render all issues on the dedicated page
    grid.innerHTML = filteredIssues.map(issue => createIssueCard(issue)).join('');
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // 카드 클릭 시 상세 페이지로 이동 (버튼 클릭 제외)
    grid.querySelectorAll('[data-id]').forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
            // 버튼 클릭은 무시 (베팅 버튼)
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                return;
            }
            const issueId = card.getAttribute('data-id');
            goToIssueDetail(issueId);
        });
    });
    
    // 이슈 렌더링 후 배당률 로드
    setTimeout(() => {
        loadAllBettingOdds();
    }, 100);
}

async function initMyPage() {
    console.log('Initializing My Page...');
    
    // 인증 상태 확인 및 사용자 정보 로드
    await checkAuth();
    
    // localStorage에서 사용자 정보 다시 확인
    const userFromStorage = localStorage.getItem('yegame-user');
    const tokenFromStorage = localStorage.getItem('yegame-token');
    
    if (!userFromStorage || !tokenFromStorage) {
        console.log('No user or token found, redirecting to login');
        window.location.href = 'login.html';
        return;
    }
    
    try {
        currentUser = JSON.parse(userFromStorage);
        window.currentUser = currentUser;
        userToken = tokenFromStorage;
        
        console.log('Current user for mypage:', currentUser);
        
        // pages/mypage.js의 renderMyPage 사용
        await renderMyPage();
        
        // 헤더 업데이트
        updateHeader();
        
    } catch (error) {
        console.error('Error initializing mypage:', error);
        window.location.href = 'login.html';
    }
}

function showMyPageLogin() {
    document.getElementById('user-name').textContent = '로그인이 필요합니다';
    document.getElementById('user-email').textContent = '로그인 후 내 정보를 확인하세요';
    document.getElementById('user-coins').textContent = '0 GAM';
    document.getElementById('user-joined').textContent = '로그인 필요';
    
    document.getElementById('total-bets').textContent = '0';
    document.getElementById('win-rate').textContent = '0%';
    document.getElementById('total-volume').textContent = '0 GAM';
    
    document.getElementById('user-bets-loading').classList.add('hidden');
    document.getElementById('user-bets-empty').classList.remove('hidden');
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function loadMyPageData() {
    try {
        // Update user info
        document.getElementById('user-name').textContent = currentUser.username;
        document.getElementById('user-email').textContent = currentUser.email;
        document.getElementById('user-coins').textContent = `${currentUser.coins?.toLocaleString() || 0} GAM`;
        
        const joinedDate = new Date(currentUser.created_at || currentUser.createdAt || Date.now());
        document.getElementById('user-joined').textContent = `${joinedDate.getFullYear()}.${String(joinedDate.getMonth() + 1).padStart(2, '0')}.${String(joinedDate.getDate()).padStart(2, '0')} 가입`;
        
        // Update user tier
        updateUserTier(currentUser.coins || 0);
        
        // Load user bets
        await loadUserBets();
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
    } catch (error) {
        console.error('Failed to load my page data:', error);
        showError('내 정보를 불러오는데 실패했습니다.');
    }
}

// 사용자 티어 업데이트 함수
function updateUserTier(gamAmount) {
    const tierInfo = getUserTier(gamAmount);
    
    // 사용자 프로필 티어 아이콘 표시 (큰 크기)
    const tierIconEl = document.getElementById('user-tier-icon');
    if (tierIconEl) {
        tierIconEl.innerHTML = `
            <div class="text-4xl tier-icon" style="font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;" title="${tierInfo.name} (${tierInfo.minGam.toLocaleString()} GAM 이상)">
                ${tierInfo.icon}
            </div>
        `;
    }
    
    // 티어 뱃지 표시
    const tierBadgeEl = document.getElementById('user-tier-badge');
    if (tierBadgeEl) {
        tierBadgeEl.innerHTML = createTierDisplay(tierInfo, true);
    }
    
    // 향상된 티어 진행률 표시
    const tierProgressEl = document.getElementById('user-tier-progress');
    if (tierProgressEl) {
        // 향상된 티어 진행률은 간단하게 처리
        tierProgressEl.innerHTML = `<div class="text-sm text-gray-600">현재 등급: ${tierInfo.name}</div>`;
    }
}

// 향상된 티어 진행률 표시 (동기부여 포함)
function generateEnhancedTierProgress(tierInfo) {
    if (tierInfo.name === '모든 것을 보는 눈') {
        return `
            <div class="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl p-4">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center space-x-2">
                        <div class="text-2xl tier-icon" style="font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;">${tierInfo.icon}</div>
                        <div>
                            <div class="font-bold text-yellow-800">최고 티어 달성!</div>
                            <div class="text-sm text-yellow-700">축하합니다! 모든 업적을 달성했습니다.</div>
                        </div>
                    </div>
                </div>
                <div class="w-full bg-yellow-200 rounded-full h-3">
                    <div class="h-3 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400" style="width: 100%;"></div>
                </div>
                <div class="flex justify-between text-sm text-yellow-800 mt-2">
                    <span>완료</span>
                    <span class="font-semibold">${tierInfo.gamAmount.toLocaleString()} GAM</span>
                </div>
            </div>
        `;
    }
    
    // 현재 티어와 다음 티어 정보
    const nextTierIndex = tierInfo.tierIndex + 1;
    const allTiers = window.TierSystem.getAllTiers();
    const nextTier = nextTierIndex < allTiers.length ? allTiers[nextTierIndex] : null;
    
    if (!nextTier) {
        return window.TierSystem.generateTierProgress(tierInfo);
    }
    
    return `
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center space-x-3">
                    <div class="flex items-center space-x-1">
                        <div class="text-lg tier-icon" style="font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;" title="현재 티어">${tierInfo.icon}</div>
                        <i data-lucide="arrow-right" class="w-4 h-4 text-gray-400"></i>
                        <div class="text-lg tier-icon" style="font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;" title="다음 티어">${nextTier.icon}</div>
                    </div>
                    <div>
                        <div class="font-semibold text-gray-900">${tierInfo.name} → ${nextTier.name}</div>
                        <div class="text-sm text-gray-600">${tierInfo.remainingGam.toLocaleString()} GAM 더 필요</div>
                    </div>
                </div>
            </div>
            
            <div class="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div class="h-3 rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-500" 
                     style="width: ${tierInfo.progress}%;"></div>
            </div>
            
            <div class="flex justify-between items-center text-sm">
                <span class="text-gray-600">${tierInfo.gamAmount.toLocaleString()} GAM</span>
                <div class="flex items-center space-x-2">
                    <span class="text-gray-600">목표:</span>
                    <span class="font-semibold text-indigo-600">${nextTier.minGam.toLocaleString()} GAM</span>
                    <div class="flex items-center space-x-1 ml-2 px-2 py-1 bg-indigo-100 rounded-full">
                        <div class="text-sm tier-icon" style="font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;">${nextTier.icon}</div>
                        <span class="text-xs font-medium text-indigo-700">${nextTier.name}</span>
                    </div>
                </div>
            </div>
            
            <div class="mt-3 pt-3 border-t border-blue-200">
                <div class="text-xs text-blue-700 text-center">
                    <i data-lucide="target" class="w-3 h-3 inline mr-1"></i>
                    예측에 참여하여 GAM을 획득하고 더 높은 등급을 달성해보세요!
                </div>
            </div>
        </div>
    `;
}

// 댓글 시스템용 티어 뱃지 생성
function generateCommentTierBadge(userCoins) {
    const tierInfo = getUserTier(userCoins || 0);
    return createTierDisplay(tierInfo, true);
}

// 댓글 시스템용 티어 아이콘 생성 (아바타 대체용)
function generateCommentTierIcon(userCoins) {
    const tierInfo = getUserTier(userCoins || 0);
    return `
        <div class="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-medium tier-icon" 
             style="font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;"
             title="${tierInfo.name}">
            ${tierInfo.icon}
        </div>
    `;
}

// 답글 시스템용 티어 아이콘 생성 (작은 크기)
function generateReplyTierIcon(userCoins) {
    const tierInfo = getUserTier(userCoins || 0);
    return `
        <div class="w-6 h-6 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center text-white text-xs font-medium tier-icon" 
             style="font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;"
             title="${tierInfo.name}">
            ${tierInfo.icon}
        </div>
    `;
}

async function loadUserBets() {
    try {
        const response = await fetch('/api/bets/my-bets', {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.bets) {
            const bets = data.bets;
            
            // Update stats
            document.getElementById('total-bets').textContent = bets.length;
            
            const totalVolume = bets.reduce((sum, bet) => sum + bet.amount, 0);
            document.getElementById('total-volume').textContent = `${totalVolume.toLocaleString()} GAM`;
            
            // Calculate win rate (placeholder - would need actual results)
            const winRate = bets.length > 0 ? Math.floor(Math.random() * 100) : 0;
            document.getElementById('win-rate').textContent = `${winRate}%`;
            
            // Render bets list
            renderUserBets(bets);
            
        } else {
            // No bets found
            document.getElementById('total-bets').textContent = '0';
            document.getElementById('win-rate').textContent = '0%';
            document.getElementById('total-volume').textContent = '0 GAM';
            
            document.getElementById('user-bets-loading').classList.add('hidden');
            document.getElementById('user-bets-empty').classList.remove('hidden');
        }
        
    } catch (error) {
        console.error('Failed to load user bets:', error);
        
        // Show empty state on error
        document.getElementById('user-bets-loading').classList.add('hidden');
        document.getElementById('user-bets-empty').classList.remove('hidden');
    }
}

function renderUserBets(bets) {
    const container = document.getElementById('user-bets-list');
    const loading = document.getElementById('user-bets-loading');
    const empty = document.getElementById('user-bets-empty');
    
    loading.classList.add('hidden');
    
    if (bets.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    
    container.innerHTML = bets.map(bet => {
        const issueTitle = bet.issue_title || bet.issueTitle || '이슈 제목';
        const betDate = new Date(bet.created_at || bet.createdAt || Date.now());
        const formattedDate = `${betDate.getFullYear()}.${String(betDate.getMonth() + 1).padStart(2, '0')}.${String(betDate.getDate()).padStart(2, '0')}`;
        
        const choiceColor = String(bet.choice).trim().toLowerCase() === 'yes' ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';
        
        return `
            <div class="p-4 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <h3 class="font-medium text-gray-900 mb-1">${issueTitle}</h3>
                        <div class="flex items-center space-x-4 text-sm text-gray-600">
                            <span class="flex items-center">
                                <i data-lucide="calendar" class="w-4 h-4 mr-1"></i>
                                ${formattedDate}
                            </span>
                            <span class="flex items-center">
                                <i data-lucide="coins" class="w-4 h-4 mr-1 text-yellow-500"></i>
                                ${bet.amount?.toLocaleString() || 0} GAM
                            </span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3">
                        <span class="px-3 py-1 rounded-full text-sm font-medium ${choiceColor}">
                            ${bet.choice}
                        </span>
                        <span class="text-sm text-gray-500">
                            결과 대기
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    container.classList.remove('hidden');
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// 스케줄러 관리 함수들
function setupSchedulerManagementEvents() {
    // 상태 새로고침 버튼
    const refreshBtn = document.getElementById('refresh-scheduler-status');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadSchedulerStatus();
        });
    }
    
    // 수동 검사 실행 버튼
    const manualCheckBtn = document.getElementById('manual-check-btn');
    if (manualCheckBtn) {
        manualCheckBtn.addEventListener('click', async () => {
            await runManualSchedulerCheck();
        });
    }
}

// 이슈 신청 관리 이벤트 설정
function setupIssueRequestManagementEvents() {
    console.log('Setting up issue request management events...');
    
    // 상태 필터 변경
    const statusFilter = document.getElementById('request-status-filter');
    if (statusFilter) {
        statusFilter.addEventListener('change', loadIssueRequests);
    }
    
    // 새로고침 버튼
    const refreshBtn = document.getElementById('refresh-requests-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadIssueRequests);
    }
    
    // 상세 모달 닫기
    const closeModalBtn = document.getElementById('close-request-modal-btn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeRequestDetailModal);
    }
    
    // 승인/거부 버튼
    const approveBtn = document.getElementById('approve-request-btn');
    const rejectBtn = document.getElementById('reject-request-btn');
    if (approveBtn) {
        approveBtn.addEventListener('click', handleApproveRequest);
    }
    if (rejectBtn) {
        rejectBtn.addEventListener('click', handleRejectRequest);
    }
}

// 이슈 신청 목록 로드
async function loadIssueRequests() {
    try {
        console.log('Loading issue requests...');
        
        const statusFilter = document.getElementById('request-status-filter');
        const status = statusFilter ? statusFilter.value : 'pending';
        
        const tableBody = document.getElementById('issue-requests-table-body');
        const noRequestsMessage = document.getElementById('no-requests-message');
        const loadingMessage = document.getElementById('requests-loading');
        
        // 로딩 상태 표시
        if (loadingMessage) loadingMessage.classList.remove('hidden');
        if (noRequestsMessage) noRequestsMessage.classList.add('hidden');
        if (tableBody) tableBody.innerHTML = '';
        
        const response = await window.adminFetch(`/api/issue-requests/admin/all?status=${status}`);
        
        const data = await response.json();
        
        if (loadingMessage) loadingMessage.classList.add('hidden');
        
        if (!data.success) {
            throw new Error(data.message || '이슈 신청을 불러오는데 실패했습니다.');
        }
        
        if (!data.requests || data.requests.length === 0) {
            if (noRequestsMessage) noRequestsMessage.classList.remove('hidden');
            return;
        }
        
        // 테이블에 데이터 렌더링
        if (tableBody) {
            tableBody.innerHTML = data.requests.map(request => `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4">
                        <div>
                            <div class="font-medium text-gray-900 truncate max-w-xs" title="${request.title}">
                                ${request.title}
                            </div>
                            <div class="text-sm text-gray-500 mt-1">${request.timeAgo}</div>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <div>
                            <div class="font-medium text-gray-900">${request.username}</div>
                            <div class="text-sm text-gray-500">${request.email}</div>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            ${request.category}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900">
                        ${new Date(request.deadline).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                    </td>
                    <td class="px-6 py-4">
                        ${getStatusBadge(request.status)}
                    </td>
                    <td class="px-6 py-4">
                        <button onclick="showIssueRequestDetails(${request.id})" 
                                class="text-indigo-600 hover:text-indigo-900 text-sm font-medium">
                            상세보기
                        </button>
                    </td>
                </tr>
            `).join('');
        }
        
    } catch (error) {
        console.error('이슈 신청 로드 오류:', error);
        
        const loadingMessage = document.getElementById('requests-loading');
        if (loadingMessage) {
            loadingMessage.innerHTML = `
                <div class="text-center py-12">
                    <i data-lucide="alert-circle" class="w-6 h-6 mx-auto mb-2 text-red-400"></i>
                    <p class="text-red-500">오류: ${error.message}</p>
                </div>
            `;
        }
    }
}

// 상태 뱃지 생성
function getStatusBadge(status) {
    const badges = {
        pending: '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">대기 중</span>',
        approved: '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">승인됨</span>',
        rejected: '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">거부됨</span>'
    };
    return badges[status] || badges.pending;
}

// 이슈 신청 상세 모달 표시
async function showIssueRequestDetails(requestId) {
    try {
        const response = await window.adminFetch(`/api/issue-requests/${requestId}`);
        
        const data = await response.json();
        if (!data.success) throw new Error(data.message);
        
        const request = data.data;
        
        const modal = document.getElementById('request-detail-modal');
        const content = document.getElementById('request-detail-content');
        
        if (content) {
            content.innerHTML = `
                <div class="space-y-6">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-900 mb-3">기본 정보</h3>
                        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <dt class="text-sm font-medium text-gray-500">신청자</dt>
                                <dd class="mt-1 text-sm text-gray-900">${request.username} (${request.email})</dd>
                            </div>
                            <div>
                                <dt class="text-sm font-medium text-gray-500">카테고리</dt>
                                <dd class="mt-1 text-sm text-gray-900">${request.category}</dd>
                            </div>
                            <div>
                                <dt class="text-sm font-medium text-gray-500">신청일</dt>
                                <dd class="mt-1 text-sm text-gray-900">${new Date(request.created_at).toLocaleString('ko-KR')}</dd>
                            </div>
                            <div>
                                <dt class="text-sm font-medium text-gray-500">마감일</dt>
                                <dd class="mt-1 text-sm text-gray-900">${new Date(request.deadline).toLocaleString('ko-KR')}</dd>
                            </div>
                        </dl>
                    </div>
                    
                    <div>
                        <h4 class="text-sm font-medium text-gray-500 mb-2">제목</h4>
                        <p class="text-gray-900">${request.title}</p>
                    </div>
                    
                    <div>
                        <h4 class="text-sm font-medium text-gray-500 mb-2">상세 설명</h4>
                        <div class="bg-gray-50 rounded-lg p-4">
                            <p class="text-gray-900 whitespace-pre-wrap">${request.description}</p>
                        </div>
                    </div>
                    
                    ${request.admin_comments ? `
                        <div>
                            <h4 class="text-sm font-medium text-gray-500 mb-2">관리자 코멘트</h4>
                            <div class="bg-blue-50 rounded-lg p-4">
                                <p class="text-blue-900">${request.admin_comments}</p>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${request.status !== 'pending' ? `
                        <div>
                            <h4 class="text-sm font-medium text-gray-500 mb-2">처리 정보</h4>
                            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <dt class="text-sm font-medium text-gray-500">상태</dt>
                                    <dd class="mt-1">${getStatusBadge(request.status)}</dd>
                                </div>
                                <div>
                                    <dt class="text-sm font-medium text-gray-500">처리일</dt>
                                    <dd class="mt-1 text-sm text-gray-900">${new Date(request.approved_at).toLocaleString('ko-KR')}</dd>
                                </div>
                            </dl>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        // 승인/거부 버튼 상태 설정
        const approveBtn = document.getElementById('approve-request-btn');
        const rejectBtn = document.getElementById('reject-request-btn');
        
        if (request.status === 'pending') {
            if (approveBtn) approveBtn.style.display = 'inline-block';
            if (rejectBtn) rejectBtn.style.display = 'inline-block';
        } else {
            if (approveBtn) approveBtn.style.display = 'none';
            if (rejectBtn) rejectBtn.style.display = 'none';
        }
        
        // 현재 신청 ID 저장
        window.currentRequestId = requestId;
        
        if (modal) {
            modal.classList.remove('hidden');
        }
        
    } catch (error) {
        console.error('이슈 신청 상세 로드 오류:', error);
        alert('이슈 신청 상세 정보를 불러오는데 실패했습니다: ' + error.message);
    }
}

// 모달 닫기
function closeRequestDetailModal() {
    const modal = document.getElementById('request-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    window.currentRequestId = null;
}

// 이슈 신청 승인
async function handleApproveRequest() {
    if (!window.currentRequestId) return;
    
    const comments = prompt('승인 코멘트를 입력하세요 (선택사항):');
    if (comments === null) return; // 취소
    
    try {
        const response = await window.adminFetch(`/api/issue-requests/${window.currentRequestId}/approve`, {
            method: 'PUT',
            body: JSON.stringify({ adminComments: comments })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('이슈 신청이 승인되었습니다. 신청자에게 1000 GAM이 지급되었습니다.');
            closeRequestDetailModal();
            loadIssueRequests();
        } else {
            throw new Error(data.message);
        }
        
    } catch (error) {
        console.error('이슈 신청 승인 오류:', error);
        alert('이슈 신청 승인 중 오류가 발생했습니다: ' + error.message);
    }
}

// 이슈 신청 거부
async function handleRejectRequest() {
    if (!window.currentRequestId) return;
    
    const comments = prompt('거부 사유를 입력하세요:');
    if (!comments) return;
    
    try {
        const response = await window.adminFetch(`/api/issue-requests/${window.currentRequestId}/reject`, {
            method: 'PUT',
            body: JSON.stringify({ adminComments: comments })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('이슈 신청이 거부되었습니다.');
            closeRequestDetailModal();
            loadIssueRequests();
        } else {
            throw new Error(data.message);
        }
        
    } catch (error) {
        console.error('이슈 신청 거부 오류:', error);
        alert('이슈 신청 거부 중 오류가 발생했습니다: ' + error.message);
    }
}

async function loadSchedulerStatus() {
    try {
        console.log('Loading scheduler status...');
        
        const response = await window.adminFetch('/api/admin/scheduler/status');
        const data = await response.json();
        
        if (data.success) {
            updateSchedulerStatusDisplay(data.scheduler);
        } else {
            console.error('Failed to load scheduler status:', data.message);
            showSchedulerError('스케줄러 상태를 불러오는데 실패했습니다.');
        }
    } catch (error) {
        console.error('Error loading scheduler status:', error);
        showSchedulerError('스케줄러 상태를 불러오는 중 오류가 발생했습니다.');
    }
}

function updateSchedulerStatusDisplay(status) {
    const runningStatusEl = document.getElementById('scheduler-running-status');
    const nextRunEl = document.getElementById('scheduler-next-run');
    const currentTimeEl = document.getElementById('scheduler-current-time');
    
    if (runningStatusEl) {
        if (status.isRunning) {
            runningStatusEl.innerHTML = `
                <span class="inline-flex items-center text-green-600">
                    <i data-lucide="play-circle" class="w-4 h-4 mr-2"></i>
                    실행 중
                </span>
            `;
        } else {
            runningStatusEl.innerHTML = `
                <span class="inline-flex items-center text-red-600">
                    <i data-lucide="pause-circle" class="w-4 h-4 mr-2"></i>
                    중지됨
                </span>
            `;
        }
    }
    
    if (nextRunEl) {
        if (status.nextRun) {
            const nextRun = new Date(status.nextRun);
            nextRunEl.textContent = nextRun.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        } else {
            nextRunEl.textContent = '-';
        }
    }
    
    if (currentTimeEl) {
        if (status.currentTime) {
            const currentTime = new Date(status.currentTime);
            currentTimeEl.textContent = currentTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        } else {
            currentTimeEl.textContent = '-';
        }
    }
    
    // 아이콘 재생성
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function showSchedulerError(message) {
    const runningStatusEl = document.getElementById('scheduler-running-status');
    if (runningStatusEl) {
        runningStatusEl.innerHTML = `
            <span class="inline-flex items-center text-red-600">
                <i data-lucide="alert-circle" class="w-4 h-4 mr-2"></i>
                오류
            </span>
        `;
    }
    
    // 로그에 오류 추가
    addSchedulerLog(message, 'error');
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function runManualSchedulerCheck() {
    const btn = document.getElementById('manual-check-btn');
    const originalText = btn.innerHTML;
    
    try {
        // 버튼 로딩 상태로 변경
        btn.disabled = true;
        btn.innerHTML = `
            <i data-lucide="loader" class="w-4 h-4 mr-2 animate-spin"></i>
            실행 중...
        `;
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
        console.log('Running manual scheduler check...');
        
        const response = await window.adminFetch('/api/admin/scheduler/run', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            addSchedulerLog('수동 마감 검사가 성공적으로 실행되었습니다.', 'success');
            showSuccess('수동 마감 검사가 완료되었습니다.');
            
            // 상태 새로고침
            setTimeout(() => {
                loadSchedulerStatus();
            }, 1000);
        } else {
            addSchedulerLog(`수동 마감 검사 실패: ${data.message}`, 'error');
            showError(data.message || '수동 마감 검사에 실패했습니다.');
        }
    } catch (error) {
        console.error('Error running manual scheduler check:', error);
        addSchedulerLog(`수동 마감 검사 오류: ${error.message}`, 'error');
        showError('수동 마감 검사 중 오류가 발생했습니다.');
    } finally {
        // 버튼 복원
        btn.disabled = false;
        btn.innerHTML = originalText;
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

function addSchedulerLog(message, type = 'info') {
    const logsContainer = document.getElementById('scheduler-logs');
    if (!logsContainer) return;
    
    const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const logClass = type === 'error' ? 'text-red-600' : type === 'success' ? 'text-green-600' : 'text-gray-600';
    const icon = type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle' : 'info';
    
    const logEntry = document.createElement('div');
    logEntry.className = `flex items-start space-x-2 mb-2 pb-2 border-b border-gray-100 text-sm ${logClass}`;
    logEntry.innerHTML = `
        <i data-lucide="${icon}" class="w-4 h-4 mt-0.5 flex-shrink-0"></i>
        <div class="flex-1">
            <div class="font-medium">${message}</div>
            <div class="text-xs text-gray-500 mt-1">${timestamp}</div>
        </div>
    `;
    
    // 첫 번째 자식이 "로그가 없습니다" 메시지인 경우 제거
    const firstChild = logsContainer.firstElementChild;
    if (firstChild && firstChild.textContent.includes('로그가 없습니다')) {
        logsContainer.removeChild(firstChild);
    }
    
    logsContainer.insertBefore(logEntry, logsContainer.firstChild);
    
    // 최대 10개 로그만 유지
    const logs = logsContainer.children;
    while (logs.length > 10) {
        logsContainer.removeChild(logs[logs.length - 1]);
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// 전역 함수 노출 (betting-modal.js와 다른 모듈에서 사용)
window.initIssuesPage = initIssuesPage;
window.renderAllIssuesOnPage = renderAllIssuesOnPage;
window.initHomePage = initHomePage;

// 이슈 상세 페이지로 이동
function goToIssueDetail(issueId) {
    window.location.href = `issue.html?id=${issueId}`;
}
window.goToIssueDetail = goToIssueDetail;

// 관리자 페이지 전용 기능
if (window.isAdminPage) {
    // 인기이슈 관리 기능
    let popularIssuesData = [];
    let sortableInstance = null;

    // 인기이슈 관리 초기화
    function initPopularIssuesManagement() {
        console.log('🎯 인기이슈 관리 기능 초기화');
        
        // SortableJS 라이브러리 로드 확인
        if (typeof Sortable === 'undefined') {
            console.error('❌ SortableJS 라이브러리가 로드되지 않았습니다.');
            return;
        }
        console.log('✅ SortableJS 라이브러리 로드 확인됨');
        
        // 기존 이벤트 리스너 제거 (중복 방지)
        const popularIssuesTab = document.getElementById('popular-issues-tab');
        if (popularIssuesTab) {
            // 기존 리스너 제거
            popularIssuesTab.removeEventListener('click', handlePopularIssuesTabClick);
            // 새 리스너 추가
            popularIssuesTab.addEventListener('click', handlePopularIssuesTabClick);
        }

        // 새로고침 버튼
        const refreshBtn = document.getElementById('refresh-popular-issues');
        if (refreshBtn) {
            refreshBtn.removeEventListener('click', loadPopularIssues);
            refreshBtn.addEventListener('click', loadPopularIssues);
        }

        // 순서 저장 버튼
        const saveBtn = document.getElementById('save-popular-order');
        if (saveBtn) {
            saveBtn.removeEventListener('click', savePopularIssuesOrder);
            saveBtn.addEventListener('click', savePopularIssuesOrder);
        }
    }

    // 탭 클릭 핸들러 분리
    function handlePopularIssuesTabClick() {
        console.log('📋 인기이슈 탭 클릭됨');
        showPopularIssuesSection();
        loadPopularIssues();
    }

    // 인기이슈 섹션 표시
    function showPopularIssuesSection() {
        // 모든 섹션 숨기기
        document.querySelectorAll('[id$="-section"]').forEach(section => {
            section.classList.add('hidden');
        });
        
        // 모든 탭 비활성화
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.classList.remove('active', 'border-blue-500', 'text-blue-600');
            tab.classList.add('border-transparent', 'text-gray-500');
        });
        
        // 인기이슈 섹션 표시
        const section = document.getElementById('popular-issues-section');
        if (section) {
            section.classList.remove('hidden');
        }
        
        // 인기이슈 탭 활성화
        const tab = document.getElementById('popular-issues-tab');
        if (tab) {
            tab.classList.add('active', 'border-blue-500', 'text-blue-600');
            tab.classList.remove('border-transparent', 'text-gray-500');
        }
    }

    // 인기이슈 목록 로드
    async function loadPopularIssues() {
        console.log('📋 인기이슈 목록 로드 중...');
        
        showLoadingState();
        
        try {
            const response = await window.adminFetch('/api/admin/popular-issues');
            const data = await response.json();
            
            if (data.success) {
                popularIssuesData = data.issues;
                console.log('✅ 인기이슈 로드 완료:', popularIssuesData.length, '개');
                renderPopularIssuesList();
            } else {
                throw new Error(data.message || '인기이슈 로드 실패');
            }
        } catch (error) {
            console.error('❌ 인기이슈 로드 오류:', error);
            showErrorState(error.message);
        }
    }

    // 로딩 상태 표시
    function showLoadingState() {
        document.getElementById('popular-issues-loading').classList.remove('hidden');
        document.getElementById('popular-issues-list').classList.add('hidden');
        document.getElementById('no-popular-issues').classList.add('hidden');
    }

    // 인기이슈 목록 렌더링
    function renderPopularIssuesList() {
        const container = document.getElementById('sortable-popular-issues');
        console.log('🎨 인기이슈 목록 렌더링 시작, 컨테이너:', container ? '✅ 찾음' : '❌ 없음');
        
        if (!container) {
            console.error('❌ sortable-popular-issues 컨테이너를 찾을 수 없습니다.');
            showErrorState('컨테이너를 찾을 수 없습니다.');
            return;
        }
        
        if (popularIssuesData.length === 0) {
            console.log('📭 인기이슈 데이터가 없습니다.');
            document.getElementById('popular-issues-loading').classList.add('hidden');
            document.getElementById('popular-issues-list').classList.add('hidden');
            document.getElementById('no-popular-issues').classList.remove('hidden');
            return;
        }
        
        console.log('📋 렌더링할 인기이슈:', popularIssuesData.length, '개');

        container.innerHTML = popularIssuesData.map((issue, index) => `
            <div class="popular-issue-item bg-white border-2 border-gray-200 rounded-lg p-4 mb-2 transition-all duration-200 hover:border-blue-300 hover:shadow-lg select-none" 
                 data-issue-id="${issue.id}" 
                 style="cursor: grab; user-select: none;">
                <div class="flex items-center space-x-4">
                    <div class="drag-handle flex-shrink-0 p-2 -m-2 cursor-grab hover:bg-gray-100 rounded transition-colors" 
                         style="cursor: grab !important;">
                        <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M7 2a1 1 0 000 2h6a1 1 0 100-2H7zM4 6a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM4 10a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM5 15a1 1 0 100 2h10a1 1 0 100-2H5z"/>
                        </svg>
                    </div>
                    <div class="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm order-number">
                        ${issue.popular_order || index + 1}
                    </div>
                    <div class="flex-1 min-w-0 pointer-events-none">
                        <div class="flex items-center space-x-2 mb-1">
                            <span class="inline-block px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                                ${issue.category}
                            </span>
                            <span class="text-xs text-gray-500">
                                ID: ${issue.id}
                            </span>
                        </div>
                        <h4 class="text-sm font-medium text-gray-900 truncate">${issue.title}</h4>
                        <p class="text-xs text-gray-500 mt-1">
                            ${new Date(issue.end_date).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} 마감
                        </p>
                    </div>
                </div>
            </div>
        `).join('');

        // Sortable 초기화
        if (sortableInstance) {
            console.log('🗑️ 기존 Sortable 인스턴스 제거');
            sortableInstance.destroy();
            sortableInstance = null;
        }
        
        console.log('🎯 새 Sortable 인스턴스 생성 중...');
        
        try {
            sortableInstance = Sortable.create(container, {
                handle: '.drag-handle', // 드래그 핸들 지정
                animation: 150,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                dragClass: 'sortable-drag',
                forceFallback: true, // 모바일 지원 강화
                fallbackClass: 'sortable-fallback',
                onStart: function(evt) {
                    console.log('🖱️ 드래그 시작:', evt.oldIndex);
                    evt.item.style.cursor = 'grabbing';
                },
                onEnd: function(evt) {
                    console.log('🖱️ 드래그 종료:', evt.oldIndex, '->', evt.newIndex);
                    evt.item.style.cursor = 'grab';
                },
                onUpdate: function(evt) {
                    console.log('📝 순서 변경됨:', evt.oldIndex, '->', evt.newIndex);
                    
                    // 데이터 배열도 업데이트
                    const movedItem = popularIssuesData.splice(evt.oldIndex, 1)[0];
                    popularIssuesData.splice(evt.newIndex, 0, movedItem);
                    
                    // 순서 번호 업데이트
                    updateOrderNumbers();
                    
                    // 저장 버튼 활성화 표시
                    const saveBtn = document.getElementById('save-popular-order');
                    if (saveBtn) {
                        saveBtn.classList.add('animate-pulse');
                        saveBtn.textContent = '순서 저장 (변경됨)';
                    }
                },
                onMove: function(evt) {
                    console.log('👆 드래그 중:', evt.related.dataset.issueId);
                    return true; // 이동 허용
                }
            });
            
            console.log('✅ Sortable 인스턴스 생성 완료');
            
        } catch (error) {
            console.error('❌ Sortable 생성 오류:', error);
        }

        // 상태 표시 업데이트
        document.getElementById('popular-issues-loading').classList.add('hidden');
        document.getElementById('popular-issues-list').classList.remove('hidden');
        document.getElementById('no-popular-issues').classList.add('hidden');
        
        // Lucide 아이콘 다시 초기화
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // 순서 번호 업데이트
    function updateOrderNumbers() {
        const items = document.querySelectorAll('.popular-issue-item');
        console.log('🔢 순서 번호 업데이트:', items.length, '개 아이템');
        
        items.forEach((item, index) => {
            const numberElement = item.querySelector('.order-number');
            if (numberElement) {
                const newNumber = index + 1;
                numberElement.textContent = newNumber;
                console.log(`📍 아이템 ${item.dataset.issueId}: ${newNumber}번으로 변경`);
            }
        });
    }

    // 인기이슈 순서 저장
    async function savePopularIssuesOrder() {
        const items = document.querySelectorAll('.popular-issue-item');
        const orderedIssueIds = Array.from(items).map(item => 
            parseInt(item.getAttribute('data-issue-id'))
        );
        
        console.log('💾 순서 저장 중:', orderedIssueIds);
        
        const saveBtn = document.getElementById('save-popular-order');
        const originalText = '순서 저장';
        
        try {
            saveBtn.disabled = true;
            saveBtn.classList.remove('animate-pulse');
            saveBtn.textContent = '저장 중...';
            
            const response = await window.adminFetch('/api/admin/popular-issues/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderedIssueIds })
            });
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ 순서 저장 완료');
                saveBtn.textContent = '저장 완료!';
                saveBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                saveBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
                
                // 성공 메시지 후 원래 상태로 복구
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                    saveBtn.classList.add('bg-green-600', 'hover:bg-green-700');
                    saveBtn.disabled = false;
                }, 2000);
                
            } else {
                throw new Error(data.message || '순서 저장 실패');
            }
        } catch (error) {
            console.error('❌ 순서 저장 오류:', error);
            saveBtn.textContent = '저장 실패';
            saveBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
            saveBtn.classList.add('bg-red-600', 'hover:bg-red-700');
            
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
                saveBtn.classList.add('bg-green-600', 'hover:bg-green-700');
                saveBtn.disabled = false;
            }, 3000);
        }
    }

    // 오류 상태 표시
    function showErrorState(message) {
        document.getElementById('popular-issues-loading').classList.add('hidden');
        document.getElementById('popular-issues-list').classList.add('hidden');
        document.getElementById('no-popular-issues').classList.remove('hidden');
        
        const errorElement = document.getElementById('no-popular-issues');
        errorElement.innerHTML = `
            <i data-lucide="alert-circle" class="w-12 h-12 mx-auto text-red-300 mb-3"></i>
            <p class="text-red-500 font-medium">오류가 발생했습니다</p>
            <p class="text-sm text-gray-400 mt-1">${message}</p>
        `;
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // 관리자 인증 완료 후 초기화
    document.addEventListener('DOMContentLoaded', () => {
        if (window.adminAuthCompleted) {
            initPopularIssuesManagement();
        } else {
            // 인증 완료를 기다림
            const checkAuth = setInterval(() => {
                if (window.adminAuthCompleted) {
                    clearInterval(checkAuth);
                    initPopularIssuesManagement();
                }
            }, 100);
        }
    });
}

console.log('✅ Working app script loaded successfully');