// Complete working app with API integration
console.log('🚀 Working app starting...');

// Global state
let currentUser = null;
let issues = [];
let userToken = localStorage.getItem('yegame-token');

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing app...');
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Check authentication
    await checkAuthentication();
    
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
    if (!userToken) {
        updateHeader(false);
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
            updateHeader(true);
            console.log('User authenticated:', currentUser.username);
        } else {
            // Invalid token, clear it
            localStorage.removeItem('yegame-token');
            userToken = null;
            updateHeader(false);
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('yegame-token');
        userToken = null;
        updateHeader(false);
    }
}

function updateHeader(isLoggedIn) {
    const userActionsContainer = document.getElementById('header-user-actions');
    if (!userActionsContainer) return;
    
    if (isLoggedIn && currentUser) {
        userActionsContainer.innerHTML = `
            <span class="text-sm font-medium text-gray-600 hidden sm:block">${currentUser.username}</span>
            <div class="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm">
                <i data-lucide="coins" class="w-4 h-4 text-yellow-500"></i>
                <span class="text-sm font-semibold text-gray-900">${(currentUser.gam_balance || currentUser.coins || 0).toLocaleString()}</span>
            </div>
            <button onclick="logout()" class="text-gray-600 hover:text-gray-900 transition-colors text-sm">로그아웃</button>
        `;
    } else {
        userActionsContainer.innerHTML = `
            <a href="login.html" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
                로그인/회원가입
            </a>
        `;
    }
    
    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function logout() {
    localStorage.removeItem('yegame-token');
    userToken = null;
    currentUser = null;
    alert('로그아웃되었습니다.');
    window.location.href = 'index.html';
}

// Home page functions
async function initHomePage() {
    console.log('Initializing home page...');
    
    showLoading('popular-issues-grid');
    
    try {
        // Load issues from API
        const response = await fetch('/api/issues');
        const data = await response.json();
        
        if (data.success) {
            issues = data.issues;
            console.log('Loaded', issues.length, 'issues');
            
            setupCategoryFilters();
            renderPopularIssues();
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
    if (!filtersContainer) return;
    
    // Extract unique categories from issues
    const categories = ['전체', ...new Set(issues.map(issue => issue.category))];
    
    filtersContainer.innerHTML = categories.map((category, index) => `
        <button class="category-filter-btn ${index === 0 ? 'active' : ''} px-4 py-2 rounded-full text-sm font-medium transition-colors
                       ${index === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
                data-category="${category}">
            ${category}
        </button>
    `).join('');
    
    // Add click handlers
    filtersContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.category-filter-btn');
        if (!button) return;
        
        // Update active state
        filtersContainer.querySelectorAll('.category-filter-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-blue-600', 'text-white');
            btn.classList.add('bg-gray-100', 'text-gray-700');
        });
        
        button.classList.add('active', 'bg-blue-600', 'text-white');
        button.classList.remove('bg-gray-100', 'text-gray-700');
        
        const category = button.dataset.category;
        renderPopularIssues(category);
    });
}

function renderPopularIssues(categoryFilter = '전체') {
    const grid = document.getElementById('popular-issues-grid');
    if (!grid) return;
    
    let filteredIssues = issues;
    
    if (categoryFilter !== '전체') {
        filteredIssues = issues.filter(issue => issue.category === categoryFilter);
    } else {
        // Show popular issues or first few issues
        filteredIssues = issues.filter(issue => issue.isPopular || issue.is_popular).slice(0, 6);
        if (filteredIssues.length === 0) {
            filteredIssues = issues.slice(0, 6);
        }
    }
    
    if (filteredIssues.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-gray-500">해당 카테고리에 이슈가 없습니다.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filteredIssues.map(issue => createIssueCard(issue)).join('');
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function createIssueCard(issue) {
    const yesPrice = issue.yesPercentage || issue.yes_price || 50;
    const noPrice = 100 - yesPrice;
    const timeLeft = getTimeLeft(issue.end_date || issue.endDate);
    const volume = issue.total_volume || issue.totalVolume || 0;
    
    return `
        <div class="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
            <div class="flex justify-between items-start mb-4">
                <span class="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    ${issue.category}
                </span>
                <span class="text-xs text-gray-500 flex items-center">
                    <i data-lucide="clock" class="w-3 h-3 mr-1"></i>
                    ${timeLeft}
                </span>
            </div>
            
            <h3 class="text-lg font-semibold text-gray-900 mb-4 leading-tight">
                ${issue.title}
            </h3>
            
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
            
            <div class="relative mb-6">
                <div class="w-full bg-gradient-to-r from-green-500 to-red-500 rounded-full h-2 mb-2">
                    <div class="absolute top-[-2px] bg-white border-2 border-blue-500 rounded-full w-3 h-3" 
                         style="left: calc(${yesPrice}% - 6px)"></div>
                </div>
            </div>
            
            <div class="flex space-x-3 mb-4">
                <button class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                        onclick="placeBet(${issue.id}, 'Yes')">
                    Yes ${yesPrice}%
                </button>
                <button class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                        onclick="placeBet(${issue.id}, 'No')">
                    No ${noPrice}%
                </button>
            </div>
            
            <div class="pt-4 border-t border-gray-200 flex justify-between items-center">
                <span class="text-sm text-gray-600">총 참여 감</span>
                <span class="font-semibold text-gray-900 flex items-center">
                    <i data-lucide="coins" class="w-4 h-4 mr-1 text-yellow-500"></i>
                    ${formatVolume(volume)}
                </span>
            </div>
        </div>
    `;
}

// Betting function
async function placeBet(issueId, choice) {
    if (!currentUser) {
        alert('예측을 하려면 로그인이 필요합니다.');
        window.location.href = 'login.html';
        return;
    }
    
    const amount = prompt(`'${choice}'에 얼마나 예측하시겠습니까?\\n보유 감: ${(currentUser.gam_balance || currentUser.coins || 0).toLocaleString()}`, "1000");
    
    if (!amount || isNaN(amount) || parseInt(amount) <= 0) {
        return;
    }
    
    const betAmount = parseInt(amount);
    
    if (betAmount > (currentUser.gam_balance || currentUser.coins || 0)) {
        alert('보유 감이 부족합니다.');
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
            alert('예측이 완료되었습니다!');
            
            // Update user balance
            if (data.currentBalance !== undefined) {
                currentUser.gam_balance = data.currentBalance;
                currentUser.coins = data.currentBalance;
                updateHeader(true);
            }
            
            // Refresh issues
            await initHomePage();
        } else {
            alert(data.error || data.message || '예측에 실패했습니다.');
        }
    } catch (error) {
        console.error('Betting failed:', error);
        alert('예측 처리 중 오류가 발생했습니다.');
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
            localStorage.setItem('yegame-token', data.token);
            userToken = data.token;
            currentUser = data.user;
            
            alert(data.message || '로그인 성공!');
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
                localStorage.setItem('yegame-token', data.token);
                userToken = data.token;
                currentUser = data.user;
            }
            
            alert(data.message || '회원가입이 완료되었습니다!');
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
    await loadAdminIssues();
    setupCreateIssueForm();
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
}

function checkAdminAccess() {
    // 관리자 접근을 위해서는 사용자 로그인도 필요
    return sessionStorage.getItem('admin-auth') === 'authenticated' && userToken;
}

function showAdminLogin() {
    const mainContent = document.querySelector('main');
    if (!mainContent) return;
    
    // 사용자 로그인 상태 확인
    if (!userToken) {
        mainContent.innerHTML = `
            <div class="max-w-md mx-auto mt-16">
                <div class="bg-white rounded-lg shadow-lg p-8">
                    <h2 class="text-2xl font-bold text-center mb-6">관리자 접근 오류</h2>
                    <p class="text-center text-gray-600 mb-4">관리자 기능을 사용하려면 먼저 사용자 로그인이 필요합니다.</p>
                    <a href="login.html" class="w-full block bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 text-center">로그인하러 가기</a>
                </div>
            </div>
        `;
        return;
    }
    
    mainContent.innerHTML = `
        <div class="max-w-md mx-auto mt-16">
            <div class="bg-white rounded-lg shadow-lg p-8">
                <h2 class="text-2xl font-bold text-center mb-6">관리자 로그인</h2>
                <p class="text-center text-gray-600 mb-4">사용자: <strong>${currentUser?.username || '알 수 없음'}</strong></p>
                <form id="admin-login-form">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">관리자 암호</label>
                        <input type="password" id="admin-password" class="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="관리자 암호를 입력하세요" required>
                    </div>
                    <button type="submit" class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700">로그인</button>
                    <div id="admin-login-error" class="hidden mt-3 text-red-600 text-sm text-center"></div>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('admin-password').value;
        const errorEl = document.getElementById('admin-login-error');
        
        if (password === 'admin123') {
            sessionStorage.setItem('admin-auth', 'authenticated');
            setupAdminPageEvents();
            await loadAdminIssues();
            setupCreateIssueForm();
        } else {
            errorEl.textContent = '잘못된 관리자 암호입니다.';
            errorEl.classList.remove('hidden');
        }
    });
}

async function loadAdminIssues() {
    try {
        const response = await fetch('/api/issues');
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
    
    tbody.innerHTML = issues.map(issue => `
        <tr>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">${issue.title}</div>
                <div class="text-sm text-gray-500">ID: ${issue.id}</div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    ${issue.category}
                </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">${issue.yesPercentage || issue.yes_price || 50}%</td>
            <td class="px-6 py-4 text-sm text-gray-900">${formatVolume(issue.total_volume || issue.totalVolume || 0)} 감</td>
            <td class="px-6 py-4">
                <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${(issue.isPopular || issue.is_popular) ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                    ${(issue.isPopular || issue.is_popular) ? '인기' : '일반'}
                </span>
            </td>
            <td class="px-6 py-4 text-sm space-x-2">
                <button onclick="deleteIssue(${issue.id})" class="text-red-600 hover:text-red-900">삭제</button>
            </td>
        </tr>
    `).join('');
}

function setupCreateIssueForm() {
    const form = document.getElementById('create-issue-form');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = e.target.title.value;
        const category = e.target.category.value;
        const endDate = e.target.endDate.value;
        const isPopular = e.target.isPopular.checked;
        
        try {
            const response = await fetch('/api/issues', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                },
                body: JSON.stringify({
                    title,
                    category,
                    endDate,
                    isPopular
                })
            });
            
            const data = await response.json();
            
            if (data.success || response.ok) {
                alert('이슈가 성공적으로 생성되었습니다!');
                e.target.reset();
                await loadAdminIssues();
            } else {
                alert(data.message || '이슈 생성에 실패했습니다.');
            }
        } catch (error) {
            console.error('Issue creation failed:', error);
            alert('이슈 생성 중 오류가 발생했습니다.');
        }
    });
}

// Global functions
async function deleteIssue(issueId) {
    if (!confirm('정말로 이 이슈를 삭제하시겠습니까?')) return;
    
    try {
        const response = await fetch(`/api/issues/${issueId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
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

function formatVolume(volume) {
    if (volume >= 100000000) {
        return `${(volume / 100000000).toFixed(1)}억`;
    }
    if (volume >= 10000) {
        return `${(volume / 10000).toFixed(0)}만`;
    }
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
    const grid = document.getElementById('popular-issues-grid');
    if (grid) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-red-600">${message}</p>
                <button onclick="location.reload()" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md">다시 시도</button>
            </div>
        `;
    }
}

// OAuth functions (placeholder)
function loginWithGoogle() {
    alert('Google 로그인은 현재 설정 중입니다. 이메일로 로그인해주세요.');
}

function loginWithGithub() {
    alert('GitHub 로그인은 현재 설정 중입니다. 이메일로 로그인해주세요.');
}

// Placeholder functions for other pages
async function initIssuesPage() {
    console.log('Issues page - redirecting to home');
    window.location.href = 'index.html';
}

async function initMyPage() {
    if (!currentUser) {
        alert('로그인이 필요합니다.');
        window.location.href = 'login.html';
        return;
    }
    console.log('My page functionality coming soon');
}

console.log('✅ Working app script loaded successfully');