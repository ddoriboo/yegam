import * as auth from './auth.js';
import * as backend from './backend.js';

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initializeApplication();
});

async function initializeApplication() {
    await backend.init();
    updateHeader();
    const path = window.location.pathname.split("/").pop();

    if (path === 'index.html' || path === '') {
        renderCategoryFilters();
        renderPopularIssues();
        setupEventListeners();
        setupCategoryFilters();
    } else if (path === 'issues.html') {
        renderAllIssues();
        setupFilters();
        setupEventListeners();
    } else if (path === 'login.html') {
        setupLoginForm();
    } else if (path === 'mypage.html') {
        renderMyPage();
    } else if (path === 'admin.html') {
        renderAdminPage();
        setupAdminFunctions();
    }
}

function updateHeader() {
    const userActionsContainer = document.getElementById('header-user-actions');
    if (!userActionsContainer) return;

    if (auth.isLoggedIn()) {
        const user = auth.getCurrentUser();
        userActionsContainer.innerHTML = `
            <span class="text-sm font-medium text-gray-600 hidden sm:block">${user.username}</span>
            <div id="user-wallet" class="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm">
                <i data-lucide="coins" class="w-4 h-4 text-yellow-500"></i>
                <span id="user-coins" class="text-sm font-semibold text-gray-900">${user.coins.toLocaleString()}</span>
            </div>
            <button id="logout-button" class="text-gray-600 hover:text-gray-900 transition-colors text-sm">로그아웃</button>
        `;
        document.getElementById('logout-button')?.addEventListener('click', () => {
            auth.logout();
            window.location.href = 'index.html';
        });
    } else {
        userActionsContainer.innerHTML = `
            <a href="login.html" class="btn-primary">로그인/회원가입</a>
        `;
    }
    lucide.createIcons();
}

function updateUserWallet() {
    const userCoinsEl = document.getElementById('user-coins');
    if (userCoinsEl && auth.isLoggedIn()) {
        const user = auth.getCurrentUser();
        userCoinsEl.textContent = user.coins.toLocaleString();
    }
}

function setupEventListeners() {
    const grid = document.querySelector('#popular-issues-grid, #all-issues-grid');
    if (grid) grid.addEventListener('click', handleBettingClick);
}

function handleBettingClick(event) {
    const betButton = event.target.closest('.bet-btn');
    if (!betButton || betButton.disabled) return;

    if (!auth.isLoggedIn()) {
        alert("예측을 하려면 로그인이 필요합니다.");
        window.location.href = 'login.html';
        return;
    }

    const card = betButton.closest('.issue-card');
    const issueId = parseInt(card.dataset.id);
    const choice = betButton.dataset.choice;
    placeBet(issueId, choice, card);
}

function placeBet(issueId, choice, cardElement) {
    const user = auth.getCurrentUser();
    const amountStr = prompt(`'${choice}'에 얼마나 예측하시겠습니까?\n보유 감: ${user.coins.toLocaleString()}`, "100");

    if (amountStr === null) return;
    const amount = parseInt(amountStr);

    if (isNaN(amount) || amount <= 0) {
        alert("예측 금액은 0보다 큰 숫자여야 합니다.");
        return;
    }
    if (amount > user.coins) {
        alert("보유 감이 부족합니다.");
        return;
    }

    const result = backend.placeBet(user.id, issueId, choice, amount);

    if (result.success) {
        alert("예측이 성공적으로 완료되었습니다.");
        auth.updateUserInSession(result.updatedUser);
        updateUserWallet();
        updateCardAfterBet(cardElement, choice, amount);
    } else {
        alert(`예측 실패: ${result.message}`);
    }
}

function updateCardAfterBet(cardElement, choice, amount) {
    const betControls = cardElement.querySelector('.bet-controls');
    const feedbackEl = cardElement.querySelector('.bet-feedback');
    if (betControls) betControls.classList.add('hidden');
    if (feedbackEl) {
        feedbackEl.innerHTML = `<strong>${choice}</strong>에 <strong>${amount.toLocaleString()}</strong> 감 예측 완료.`;
        feedbackEl.className = 'bet-feedback mt-4 text-center text-sm text-green-400 font-semibold';
    }
    const buttons = cardElement.querySelectorAll('.bet-btn');
    buttons.forEach(btn => btn.disabled = true);
}

function setupLoginForm() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const loginTab = document.getElementById('login-tab');
    const signupTab = document.getElementById('signup-tab');
    const loginSection = document.getElementById('login-section');
    const signupSection = document.getElementById('signup-section');

    if (loginTab && signupTab && loginSection && signupSection) {
        loginTab.addEventListener('click', () => {
            loginTab.classList.add('border-blue-500', 'text-blue-600');
            loginTab.classList.remove('border-transparent', 'text-gray-500');
            signupTab.classList.add('border-transparent', 'text-gray-500');
            signupTab.classList.remove('border-blue-500', 'text-blue-600');
            loginSection.classList.remove('hidden');
            signupSection.classList.add('hidden');
        });

        signupTab.addEventListener('click', () => {
            signupTab.classList.add('border-blue-500', 'text-blue-600');
            signupTab.classList.remove('border-transparent', 'text-gray-500');
            loginTab.classList.add('border-transparent', 'text-gray-500');
            loginTab.classList.remove('border-blue-500', 'text-blue-600');
            signupSection.classList.remove('hidden');
            loginSection.classList.add('hidden');
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = e.target.email.value;
            const password = e.target.password.value;
            const errorEl = document.getElementById('login-error');

            const success = await auth.login(email, password);
            if (success) {
                window.location.href = 'index.html';
            } else {
                errorEl.textContent = "이메일 또는 비밀번호가 올바르지 않습니다.";
                errorEl.classList.remove('hidden');
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Signup form submitted');
            
            const username = e.target.username.value;
            const email = e.target.email.value;
            const password = e.target.password.value;
            const confirmPassword = e.target.confirmPassword.value;
            const errorEl = document.getElementById('signup-error');

            console.log('Form values:', { username, email, password, confirmPassword });

            if (password !== confirmPassword) {
                errorEl.textContent = "비밀번호가 일치하지 않습니다.";
                errorEl.classList.remove('hidden');
                return;
            }

            try {
                console.log('auth object:', auth);
                console.log('auth.signup function:', auth.signup);
                
                if (!auth.signup) {
                    throw new Error('auth.signup function not found');
                }
                
                const result = await auth.signup(username, email, password);
                console.log('Signup result:', result);
                
                if (result.success) {
                    alert('회원가입이 완료되었습니다!');
                    window.location.href = 'index.html';
                } else {
                    errorEl.textContent = result.message;
                    errorEl.classList.remove('hidden');
                }
            } catch (error) {
                console.error('Signup error:', error);
                errorEl.textContent = `회원가입 중 오류가 발생했습니다: ${error.message}`;
                errorEl.classList.remove('hidden');
            }
        });
    }
}

function renderMyPage() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    if (!auth.isLoggedIn()) {
        mainContent.innerHTML = `
            <div class="text-center py-16">
                <i data-lucide="user-cog" class="w-24 h-24 mx-auto text-gray-600"></i>
                <h1 class="mt-8 text-3xl md:text-4xl font-bold text-white">내 정보</h1>
                <p class="mt-4 text-gray-400">이 페이지를 보려면 먼저 <a href="login.html" class="text-blue-400 hover:underline">로그인</a>해주세요.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    const user = auth.getCurrentUser();
    const userBets = backend.getUserBets(user.id);
    const issues = backend.getIssues();

    mainContent.innerHTML = `
        <div class="space-y-12">
            <div>
                <h1 class="text-3xl md:text-4xl font-bold text-white mb-2">내 정보</h1>
                <p class="text-gray-400">프로필 및 코인 보유 현황입니다.</p>
            </div>
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-8 grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                <div class="md:col-span-1 text-center">
                    <i data-lucide="user-circle-2" class="w-24 h-24 mx-auto text-blue-400"></i>
                    <h2 class="mt-4 text-2xl font-bold text-white">${user.username}</h2>
                    <p class="text-gray-400">${user.email}</p>
                </div>
                <div class="md:col-span-2 grid grid-cols-2 gap-8">
                    <div class="bg-gray-700/50 p-6 rounded-lg text-center">
                        <p class="text-sm text-gray-400 mb-2">보유 감</p>
                        <div class="flex items-center justify-center space-x-2">
                             <i data-lucide="coins" class="w-8 h-8 text-yellow-400"></i>
                             <p class="text-3xl font-bold text-white">${user.coins.toLocaleString()}</p>
                        </div>
                    </div>
                     <div class="bg-gray-700/50 p-6 rounded-lg text-center">
                        <p class="text-sm text-gray-400 mb-2">총 예측 수</p>
                         <div class="flex items-center justify-center space-x-2">
                             <i data-lucide="ticket" class="w-8 h-8 text-gray-300"></i>
                             <p class="text-3xl font-bold text-white">${userBets.length}</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div>
                 <h2 class="text-2xl font-bold text-white mb-4">나의 예측 내역</h2>
                 <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                    <table class="history-table">
                        <thead>
                            <tr>
                                <th>이슈</th>
                                <th>나의 예측</th>
                                <th>예측 감</th>
                                <th>결과</th>
                            </tr>
                        </thead>
                        <tbody id="betting-history-body">
                            <!-- Bet history rows will be injected here -->
                        </tbody>
                    </table>
                 </div>
            </div>
        </div>
    `;

    const historyBody = document.getElementById('betting-history-body');
    if (userBets.length > 0) {
        historyBody.innerHTML = userBets.map(bet => {
            const issue = issues.find(i => i.id === bet.issueId);
            return `
            <tr>
                <td class="font-semibold">${issue.title}</td>
                <td>
                    <span class="px-2 py-1 text-xs font-bold rounded-md ${bet.choice === 'Yes' ? 'bg-blue-500/20 text-blue-300' : 'bg-red-500/20 text-red-300'}">
                        ${bet.choice}
                    </span>
                </td>
                <td class="text-gray-300">${bet.amount.toLocaleString()}</td>
                <td class="text-gray-500 italic">결과 대기 중</td>
            </tr>
            `;
        }).join('');
    } else {
        historyBody.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 py-8">아직 예측 내역이 없습니다.</td></tr>`;
    }

    lucide.createIcons();
}

let currentCategory = 'all';

function renderCategoryFilters() {
    const issues = backend.getIssues();
    const categories = ['all', ...new Set(issues.map(issue => issue.category))];
    const categoryNames = {
        'all': '전체',
        '정치': '정치',
        '스포츠': '스포츠',
        '경제': '경제',
        '코인': '코인',
        '테크': '테크',
        '엔터': '엔터',
        '날씨': '날씨',
        '해외': '해외'
    };
    
    const filtersContainer = document.getElementById('category-filters');
    if (!filtersContainer) return;
    
    filtersContainer.innerHTML = categories.map(category => `
        <button 
            class="category-filter-btn category-${category} ${category === 'all' ? 'active' : ''}" 
            data-category="${category}"
        >
            ${categoryNames[category] || category}
        </button>
    `).join('');
}

function setupCategoryFilters() {
    const filtersContainer = document.getElementById('category-filters');
    if (!filtersContainer) return;
    
    filtersContainer.addEventListener('click', (e) => {
        const filterBtn = e.target.closest('.category-filter-btn');
        if (!filterBtn) return;
        
        const category = filterBtn.dataset.category;
        
        // Update active state
        filtersContainer.querySelectorAll('.category-filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        filterBtn.classList.add('active');
        
        // Update current category and render filtered issues
        currentCategory = category;
        renderFilteredIssues(category);
    });
}

function renderFilteredIssues(category) {
    const issues = backend.getIssues();
    let filteredIssues;
    
    // Update section title
    const sectionTitle = document.getElementById('section-title');
    const categoryNames = {
        'all': '인기 예측 이슈',
        '정치': '정치 예측 이슈',
        '스포츠': '스포츠 예측 이슈',
        '경제': '경제 예측 이슈',
        '코인': '코인 예측 이슈',
        '테크': '테크 예측 이슈',
        '엔터': '엔터 예측 이슈',
        '날씨': '날씨 예측 이슈',
        '해외': '해외 예측 이슈'
    };
    
    if (sectionTitle) {
        sectionTitle.textContent = categoryNames[category] || `${category} 예측 이슈`;
    }
    
    if (category === 'all') {
        filteredIssues = issues.filter(issue => issue.isPopular).slice(0, 2);
    } else {
        filteredIssues = issues.filter(issue => issue.category === category).slice(0, 2);
    }
    
    const grid = document.getElementById('popular-issues-grid');
    if (grid) {
        if (filteredIssues.length > 0) {
            grid.innerHTML = filteredIssues.map(createIssueCard).join('');
        } else {
            grid.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i data-lucide="folder-search" class="w-16 h-16 mx-auto text-gray-400 mb-4"></i>
                    <p class="text-gray-500">해당 카테고리에 이슈가 없습니다.</p>
                </div>
            `;
        }
        lucide.createIcons();
    }
}

function getIssueImage(category, title) {
    const imageMap = {
        '정치': 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=500&h=300&fit=crop&auto=format',
        '스포츠': 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=500&h=300&fit=crop&auto=format',
        '경제': 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=500&h=300&fit=crop&auto=format',
        '코인': 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=500&h=300&fit=crop&auto=format',
        '테크': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=500&h=300&fit=crop&auto=format',
        '엔터': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&h=300&fit=crop&auto=format',
        '날씨': 'https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=500&h=300&fit=crop&auto=format',
        '해외': 'https://images.unsplash.com/photo-1569234849653-2605b769c84e?w=500&h=300&fit=crop&auto=format'
    };
    
    return imageMap[category] || 'https://images.unsplash.com/photo-1604594849809-dfedbc827105?w=500&h=300&fit=crop&auto=format';
}

function getCategoryBadgeStyle(category) {
    const categoryColors = {
        '정치': 'background: linear-gradient(135deg, #EF4444, #F87171); color: white;',
        '스포츠': 'background: linear-gradient(135deg, #06B6D4, #67E8F9); color: white;',
        '경제': 'background: linear-gradient(135deg, #10B981, #34D399); color: white;',
        '코인': 'background: linear-gradient(135deg, #F59E0B, #FBBF24); color: white;',
        '테크': 'background: linear-gradient(135deg, #8B5CF6, #A78BFA); color: white;',
        '엔터': 'background: linear-gradient(135deg, #EC4899, #F472B6); color: white;',
        '날씨': 'background: linear-gradient(135deg, #3B82F6, #60A5FA); color: white;',
        '해외': 'background: linear-gradient(135deg, #6366F1, #8B5CF6); color: white;'
    };
    
    return categoryColors[category] || 'background: #F3F4F6; color: #6B7280;';
}

function createIssueCard(issue) {
    const yesPrice = issue.yesPrice;
    const noPrice = 100 - yesPrice;
    let userBetDisplay = '';
    if(auth.isLoggedIn()){
        const user = auth.getCurrentUser();
        const userBets = backend.getUserBets(user.id);
        const existingBet = userBets.find(b => b.issueId === issue.id);
        if(existingBet){
            userBetDisplay = `<div class="bet-feedback mt-4 text-center text-sm text-green-400 font-semibold"><strong>${existingBet.choice}</strong>에 <strong>${existingBet.amount.toLocaleString()}</strong> 감 예측 완료.</div>`;
        }
    }

    return `
    <div class="issue-card" data-id="${issue.id}">
        <div class="flex-grow">
            <div class="flex justify-between items-start mb-4">
                <span style="${getCategoryBadgeStyle(issue.category)} padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500;">${issue.category}</span>
                <span class="text-xs text-gray-500 flex items-center">
                    <i data-lucide="clock" class="w-3 h-3 mr-1.5"></i>
                    ${timeUntil(issue.endDate)}
                </span>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4 leading-tight">${issue.title}</h3>
            
            <!-- Issue Image -->
            <img src="${getIssueImage(issue.category, issue.title)}" alt="${issue.category} 관련 이미지" class="issue-image" loading="lazy">
            
            <!-- Prediction Prices -->
            <div class="flex justify-between items-center mb-3">
                <div class="flex items-center space-x-2">
                    <span class="text-sm font-medium text-green-600">Yes</span>
                    <span class="text-lg font-bold text-green-600">${yesPrice}%</span>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="text-lg font-bold text-red-500">${noPrice}%</span>
                    <span class="text-sm font-medium text-red-500">No</span>
                </div>
            </div>
            
            <!-- Prediction Gauge -->
            <div class="relative mb-6">
                <div style="background: linear-gradient(90deg, #10B981 0%, #EF4444 100%); border-radius: 12px; height: 8px; position: relative; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1); width: 100%;">
                    <div style="position: absolute; top: -2px; left: calc(${yesPrice}% - 6px); width: 12px; height: 12px; background: white; border: 2px solid #3B82F6; border-radius: 50%; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); z-index: 10;"></div>
                </div>
                <div class="flex justify-between text-xs text-gray-400 mt-2">
                    <span>${yesPrice}% Yes</span>
                    <span>${noPrice}% No</span>
                </div>
            </div>
        </div>
        
        <!-- Prediction Buttons -->
        <div class="mb-6">
            <div class="bet-controls ${userBetDisplay ? 'hidden' : ''}">
                <div class="flex space-x-3">
                    <button data-choice="Yes" class="bet-btn w-full" style="background: linear-gradient(135deg, #10B981, #059669); color: white; border: none; border-radius: 12px; padding: 0.875rem 1.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); transition: all 0.2s ease; position: relative; overflow: hidden;">
                        <span style="position: relative; z-index: 10;">Yes ${yesPrice}%</span>
                    </button>
                    <button data-choice="No" class="bet-btn w-full" style="background: linear-gradient(135deg, #EF4444, #DC2626); color: white; border: none; border-radius: 12px; padding: 0.875rem 1.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); transition: all 0.2s ease; position: relative; overflow: hidden;">
                        <span style="position: relative; z-index: 10;">No ${noPrice}%</span>
                    </button>
                </div>
            </div>
            ${userBetDisplay || '<div class="bet-feedback"></div>'}
        </div>
        
        <!-- Volume Info -->
        <div class="pt-4 border-t border-gray-200/50 flex justify-between items-center">
            <span class="volume-display">총 참여 감</span>
            <span class="font-semibold text-gray-900 flex items-center">
                 <i data-lucide="coins" class="w-4 h-4 mr-2 text-yellow-500"></i>
                ${formatVolume(issue.totalVolume)}
            </span>
        </div>
    </div>
    `;
}

async function renderPopularIssues() {
    const issues = backend.getIssues();
    const popularIssues = issues.filter(issue => issue.isPopular).slice(0, 2);
    const grid = document.getElementById('popular-issues-grid');
    if (grid) {
        grid.innerHTML = popularIssues.map(createIssueCard).join('');
        lucide.createIcons();
    }
}

async function renderAllIssues(filteredIssues) {
    if(!filteredIssues) filteredIssues = backend.getIssues();
    const grid = document.getElementById('all-issues-grid');
    const noResults = document.getElementById('no-results');
    if(!grid || !noResults) return;
    
    if (filteredIssues.length > 0) {
        grid.innerHTML = filteredIssues.map(createIssueCard).join('');
        grid.classList.remove('hidden');
        noResults.classList.add('hidden');
    } else {
        grid.classList.add('hidden');
        noResults.classList.remove('hidden');
    }
    lucide.createIcons();
}

function setupFilters() {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const sortFilter = document.getElementById('sort-filter');
    const applyFilters = () => {
        const issues = backend.getIssues();
        let filtered = [...issues];

        const searchTerm = searchInput.value.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(issue => issue.title.toLowerCase().includes(searchTerm));
        }

        const category = categoryFilter.value;
        if (category !== 'all') {
            filtered = filtered.filter(issue => issue.category === category);
        }

        const sort = sortFilter.value;
        if (sort === 'newest') {
            filtered.sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
        } else if (sort === 'ending_soon') {
            filtered.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
        } else if (sort === 'volume') {
            filtered.sort((a, b) => b.totalVolume - a.totalVolume);
        }

        renderAllIssues(filtered);
    };

    searchInput?.addEventListener('input', applyFilters);
    categoryFilter?.addEventListener('change', applyFilters);
    sortFilter?.addEventListener('change', applyFilters);
}

function timeUntil(date) {
    const now = new Date();
    const future = new Date(date);
    const diff = future - now;
    if (diff <= 0) return "마감";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    if (days > 0) return `${days}일 남음`;
    if (hours > 0) return `${hours}시간 남음`;
    return `${minutes}분 남음`;
}

function formatVolume(volume) {
    if (volume >= 100000000) {
        return `${(volume / 100000000).toFixed(1)}억`;
    }
    if (volume >= 10000) {
        return `${(volume / 10000).toFixed(0)}만`;
    }
    return volume.toLocaleString();
}

// 관리자 페이지 함수들
function renderAdminPage() {
    // 관리자 인증 확인
    if (!checkAdminAccess()) {
        showAdminLogin();
        return;
    }
    renderAdminIssueTable();
}

function checkAdminAccess() {
    const adminAuth = sessionStorage.getItem('admin-auth');
    return adminAuth === 'authenticated';
}

function showAdminLogin() {
    const mainContent = document.querySelector('main');
    if (!mainContent) return;
    
    mainContent.innerHTML = `
        <div class="max-w-md mx-auto mt-16">
            <div class="bg-white rounded-lg shadow-lg p-8">
                <h2 class="text-2xl font-bold text-center mb-6">관리자 로그인</h2>
                <form id="admin-login-form">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">관리자 암호</label>
                        <input type="password" id="admin-password" class="modern-input w-full" placeholder="관리자 암호를 입력하세요" required>
                    </div>
                    <button type="submit" class="btn-primary w-full">로그인</button>
                    <div id="admin-login-error" class="hidden mt-3 text-red-600 text-sm text-center"></div>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('admin-login-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const password = document.getElementById('admin-password').value;
        const errorEl = document.getElementById('admin-login-error');
        
        // 간단한 암호 확인 (실제로는 더 안전한 방법 사용해야 함)
        if (password === 'admin123') {
            sessionStorage.setItem('admin-auth', 'authenticated');
            renderAdminPage();
        } else {
            errorEl.textContent = '잘못된 관리자 암호입니다.';
            errorEl.classList.remove('hidden');
        }
    });
}

function setupAdminFunctions() {
    const createBtn = document.getElementById('create-issue-btn');
    const modal = document.getElementById('create-issue-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const form = document.getElementById('create-issue-form');

    // 모달 열기
    createBtn?.addEventListener('click', () => {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    });

    // 모달 닫기
    const closeModal = () => {
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
        form.reset();
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    
    // 모달 외부 클릭시 닫기
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // 이슈 생성 폼 제출
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        
        const newIssue = {
            id: Date.now(),
            title: formData.get('title'),
            category: formData.get('category'),
            endDate: formData.get('endDate'),
            yesPrice: parseInt(formData.get('yesPrice')),
            totalVolume: 0,
            isPopular: formData.get('isPopular') === 'on',
            correct_answer: null,
            yesVolume: 0,
            noVolume: 0
        };

        // 백엔드에 이슈 추가
        const result = addNewIssue(newIssue);
        if (result.success) {
            alert('이슈가 성공적으로 생성되었습니다!');
            closeModal();
            renderAdminIssueTable();
        } else {
            alert('이슈 생성에 실패했습니다: ' + result.message);
        }
    });
}

function renderAdminIssueTable() {
    const issues = backend.getIssues();
    const tbody = document.getElementById('issues-table-body');
    
    if (!tbody) return;

    tbody.innerHTML = issues.map(issue => `
        <tr>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${issue.title}</div>
                <div class="text-sm text-gray-500">ID: ${issue.id}</div>
            </td>
            <td class="px-6 py-4">
                <span style="${getCategoryBadgeStyle(issue.category)} padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 500;">
                    ${issue.category}
                </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">${issue.yesPrice}%</td>
            <td class="px-6 py-4 text-sm text-gray-900">${formatVolume(issue.totalVolume)} 감</td>
            <td class="px-6 py-4">
                <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${issue.isPopular ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                    ${issue.isPopular ? '인기' : '일반'}
                </span>
            </td>
            <td class="px-6 py-4 text-sm space-x-2">
                <button onclick="editIssue(${issue.id})" class="text-blue-600 hover:text-blue-900">수정</button>
                <button onclick="deleteIssue(${issue.id})" class="text-red-600 hover:text-red-900">삭제</button>
            </td>
        </tr>
    `).join('');
}

function addNewIssue(issue) {
    try {
        const issues = backend.getIssues();
        issues.push(issue);
        sessionStorage.setItem('poli-view-issues', JSON.stringify(issues));
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

function deleteIssue(issueId) {
    if (!confirm('정말로 이 이슈를 삭제하시겠습니까?')) return;
    
    try {
        const issues = backend.getIssues();
        const filteredIssues = issues.filter(issue => issue.id !== issueId);
        sessionStorage.setItem('poli-view-issues', JSON.stringify(filteredIssues));
        renderAdminIssueTable();
        alert('이슈가 삭제되었습니다.');
    } catch (error) {
        alert('이슈 삭제에 실패했습니다: ' + error.message);
    }
}

function editIssue(issueId) {
    // 간단한 수정 - 인기 이슈 토글
    try {
        const issues = backend.getIssues();
        const issue = issues.find(i => i.id === issueId);
        if (issue) {
            issue.isPopular = !issue.isPopular;
            sessionStorage.setItem('poli-view-issues', JSON.stringify(issues));
            renderAdminIssueTable();
            alert(`이슈가 ${issue.isPopular ? '인기' : '일반'} 이슈로 변경되었습니다.`);
        }
    } catch (error) {
        alert('이슈 수정에 실패했습니다: ' + error.message);
    }
}
