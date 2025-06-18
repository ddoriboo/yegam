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
                <span id="user-coins" class="text-sm font-semibold text-gray-900">${(user.gam_balance || user.coins || 0).toLocaleString()}</span>
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
        userCoinsEl.textContent = (user.gam_balance || user.coins || 0).toLocaleString();
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
    const amountStr = prompt(`'${choice}'에 얼마나 예측하시겠습니까? (보유 감: ${(user.gam_balance || user.coins || 0).toLocaleString()})`, "100");

    if (amountStr === null) return;
    const amount = parseInt(amountStr);

    if (isNaN(amount) || amount <= 0) {
        alert("예측 금액은 0보다 큰 숫자여야 합니다.");
        return;
    }
    if (amount > (user.gam_balance || user.coins || 0)) {
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
            const submitBtn = e.target.querySelector('button[type="submit"]');

            // 버튼 비활성화
            submitBtn.disabled = true;
            submitBtn.textContent = '로그인 중...';

            const result = await auth.login(email, password);
            
            if (result.success) {
                if (result.message) {
                    alert(result.message); // 로그인 보상 메시지 표시
                }
                window.location.href = 'index.html';
            } else {
                errorEl.textContent = result.message || "로그인에 실패했습니다.";
                errorEl.classList.remove('hidden');
                
                // 버튼 다시 활성화
                submitBtn.disabled = false;
                submitBtn.textContent = '로그인';
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = e.target.username.value;
            const email = e.target.email.value;
            const password = e.target.password.value;
            const confirmPassword = e.target.confirmPassword.value;
            const errorEl = document.getElementById('signup-error');
            const submitBtn = e.target.querySelector('button[type="submit"]');

            if (password !== confirmPassword) {
                errorEl.textContent = "비밀번호가 일치하지 않습니다.";
                errorEl.classList.remove('hidden');
                return;
            }

            // 버튼 비활성화
            submitBtn.disabled = true;
            submitBtn.textContent = '가입 중...';

            try {
                const result = await auth.signup(username, email, password);
                
                if (result.success) {
                    alert(result.message + ' 이메일을 확인하여 인증을 완료해주세요.');
                    // 로그인 탭으로 전환
                    document.getElementById('login-tab').click();
                    document.getElementById('login-email').value = email;
                } else {
                    errorEl.textContent = result.message;
                    errorEl.classList.remove('hidden');
                }
            } catch (error) {
                console.error('회원가입 오류:', error);
                errorEl.textContent = '회원가입 중 오류가 발생했습니다.';
                errorEl.classList.remove('hidden');
            } finally {
                // 버튼 다시 활성화
                submitBtn.disabled = false;
                submitBtn.textContent = '회원가입';
            }
        });
    }
}

async function renderMyPage() {
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
    
    try {
        // 서버에서 최신 사용자 정보 및 통계 가져오기
        const profileResponse = await fetch(`/api/profile/${user.id}`, {
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`
            }
        });
        const profileData = await profileResponse.json();
        
        const statsResponse = await fetch(`/api/profile/${user.id}/stats`, {
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`
            }
        });
        const statsData = await statsResponse.json();

        mainContent.innerHTML = `
            <div class="space-y-8">
                <!-- 페이지 헤더 -->
                <div>
                    <h1 class="text-3xl md:text-4xl font-bold text-white mb-2">마이페이지</h1>
                    <p class="text-gray-400">프로필 관리 및 예측 통계를 확인하세요.</p>
                </div>

                <!-- 탭 네비게이션 -->
                <div class="border-b border-gray-700">
                    <nav class="-mb-px flex space-x-8">
                        <button class="tab-btn active" data-tab="profile">
                            <i data-lucide="user" class="w-4 h-4"></i>
                            프로필
                        </button>
                        <button class="tab-btn" data-tab="stats">
                            <i data-lucide="bar-chart-3" class="w-4 h-4"></i>
                            통계
                        </button>
                        <button class="tab-btn" data-tab="transactions">
                            <i data-lucide="history" class="w-4 h-4"></i>
                            거래내역
                        </button>
                        <button class="tab-btn" data-tab="settings">
                            <i data-lucide="settings" class="w-4 h-4"></i>
                            설정
                        </button>
                    </nav>
                </div>

                <!-- 탭 컨텐츠 -->
                <div id="tab-content">
                    <!-- 프로필 탭 -->
                    <div id="profile-tab" class="tab-content active">
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <!-- 프로필 정보 -->
                            <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
                                <div class="text-center">
                                    <div class="relative inline-block">
                                        <img src="${profileData.profile_image || 'https://via.placeholder.com/120x120/374151/9CA3AF?text=👤'}" 
                                             alt="프로필 이미지" 
                                             class="w-24 h-24 rounded-full mx-auto mb-4 border-2 border-gray-600">
                                        <button id="change-profile-image" class="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 transition-colors">
                                            <i data-lucide="camera" class="w-4 h-4"></i>
                                        </button>
                                    </div>
                                    <h2 class="text-xl font-bold text-white mb-1">${profileData.username}</h2>
                                    <p class="text-gray-400 text-sm mb-2">${profileData.email}</p>
                                    <div class="flex items-center justify-center space-x-2 mb-4">
                                        <i data-lucide="coins" class="w-5 h-5 text-yellow-400"></i>
                                        <span class="text-lg font-semibold text-white">${profileData.gam_balance.toLocaleString()}감</span>
                                    </div>
                                    <button id="change-username" class="btn-secondary w-full">닉네임 변경</button>
                                </div>
                            </div>

                            <!-- 기본 통계 -->
                            <div class="lg:col-span-2 grid grid-cols-2 gap-6">
                                <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
                                    <div class="flex items-center justify-between mb-4">
                                        <i data-lucide="target" class="w-8 h-8 text-blue-400"></i>
                                        <span class="text-2xl font-bold text-white">${profileData.accuracy}%</span>
                                    </div>
                                    <h3 class="text-sm font-medium text-gray-400">예측 정확도</h3>
                                    <p class="text-xs text-gray-500 mt-1">${profileData.correct_predictions}/${profileData.total_predictions} 정답</p>
                                </div>
                                
                                <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
                                    <div class="flex items-center justify-between mb-4">
                                        <i data-lucide="calendar-days" class="w-8 h-8 text-green-400"></i>
                                        <span class="text-2xl font-bold text-white">${profileData.consecutive_login_days}</span>
                                    </div>
                                    <h3 class="text-sm font-medium text-gray-400">연속 접속</h3>
                                    <p class="text-xs text-gray-500 mt-1">일</p>
                                </div>
                                
                                <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
                                    <div class="flex items-center justify-between mb-4">
                                        <i data-lucide="trophy" class="w-8 h-8 text-purple-400"></i>
                                        <span class="text-2xl font-bold text-white">${profileData.total_predictions}</span>
                                    </div>
                                    <h3 class="text-sm font-medium text-gray-400">총 예측 수</h3>
                                    <p class="text-xs text-gray-500 mt-1">건</p>
                                </div>
                                
                                <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
                                    <div class="flex items-center justify-between mb-4">
                                        <i data-lucide="user-check" class="w-8 h-8 text-yellow-400"></i>
                                        <span class="text-xs font-bold text-white">${profileData.verified ? '인증완료' : '미인증'}</span>
                                    </div>
                                    <h3 class="text-sm font-medium text-gray-400">이메일 인증</h3>
                                    <p class="text-xs text-gray-500 mt-1">${new Date(profileData.created_at).toLocaleDateString()} 가입</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 통계 탭 -->
                    <div id="stats-tab" class="tab-content hidden">
                        <div id="stats-content">통계 로딩중...</div>
                    </div>

                    <!-- 거래내역 탭 -->
                    <div id="transactions-tab" class="tab-content hidden">
                        <div id="transactions-content">거래내역 로딩중...</div>
                    </div>

                    <!-- 설정 탭 -->
                    <div id="settings-tab" class="tab-content hidden">
                        <div class="max-w-2xl space-y-6">
                            <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
                                <h3 class="text-lg font-semibold text-white mb-4">계정 설정</h3>
                                <div class="space-y-4">
                                    <button id="change-password" class="btn-secondary w-full">비밀번호 변경</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        setupMyPageEventListeners();
        
    } catch (error) {
        console.error('프로필 정보 로딩 실패:', error);
        mainContent.innerHTML = `
            <div class="text-center py-16">
                <i data-lucide="alert-circle" class="w-24 h-24 mx-auto text-red-400"></i>
                <h1 class="mt-8 text-3xl font-bold text-white">오류가 발생했습니다</h1>
                <p class="mt-4 text-gray-400">프로필 정보를 불러올 수 없습니다.</p>
                <button onclick="renderMyPage()" class="mt-4 btn-primary">다시 시도</button>
            </div>
        `;
    }

    lucide.createIcons();
}

function setupMyPageEventListeners() {
    // 탭 전환
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });

    // 닉네임 변경
    document.getElementById('change-username')?.addEventListener('click', changeUsername);
    
    // 프로필 이미지 변경
    document.getElementById('change-profile-image')?.addEventListener('click', changeProfileImage);
    
    // 비밀번호 변경
    document.getElementById('change-password')?.addEventListener('click', changePassword);

    lucide.createIcons();
}

function switchTab(tabName) {
    // 모든 탭 버튼과 컨텐츠 비활성화
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    
    // 선택된 탭 활성화
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.remove('hidden');
    
    // 필요시 탭별 데이터 로딩
    if (tabName === 'stats') {
        loadStatsTab();
    } else if (tabName === 'transactions') {
        loadTransactionsTab();
    }
}

async function loadStatsTab() {
    const user = auth.getCurrentUser();
    const statsContent = document.getElementById('stats-content');
    
    try {
        const response = await fetch(`/api/profile/${user.id}/stats`, {
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`
            }
        });
        const data = await response.json();
        
        statsContent.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- 감 통계 -->
                <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <h3 class="text-lg font-semibold text-white mb-4">감 통계</h3>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span class="text-gray-400">현재 보유:</span>
                            <span class="text-white font-semibold">${data.gamStats.currentBalance.toLocaleString()}감</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">총 획득:</span>
                            <span class="text-green-400 font-semibold">+${data.gamStats.totalEarned.toLocaleString()}감</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">총 소모:</span>
                            <span class="text-red-400 font-semibold">-${data.gamStats.totalBurned.toLocaleString()}감</span>
                        </div>
                        <div class="flex justify-between border-t border-gray-600 pt-2">
                            <span class="text-gray-400">ROI:</span>
                            <span class="text-white font-semibold">${data.gamStats.roi > 0 ? '+' : ''}${data.gamStats.roi}%</span>
                        </div>
                    </div>
                </div>
                
                <!-- 베팅 통계 -->
                <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <h3 class="text-lg font-semibold text-white mb-4">베팅 통계</h3>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span class="text-gray-400">총 베팅:</span>
                            <span class="text-white font-semibold">${data.bettingStats.totalBets}건</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">승리:</span>
                            <span class="text-green-400 font-semibold">${data.bettingStats.wins}건</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">패배:</span>
                            <span class="text-red-400 font-semibold">${data.bettingStats.losses}건</span>
                        </div>
                        <div class="flex justify-between border-t border-gray-600 pt-2">
                            <span class="text-gray-400">승률:</span>
                            <span class="text-white font-semibold">${data.bettingStats.winRate}%</span>
                        </div>
                    </div>
                </div>
                
                <!-- 카테고리별 통계 -->
                <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <h3 class="text-lg font-semibold text-white mb-4">카테고리별 성공률</h3>
                    <div class="space-y-2">
                        ${Object.entries(data.categoryStats).map(([category, stats]) => `
                            <div class="flex justify-between items-center">
                                <span class="text-gray-400 text-sm">${category}</span>
                                <div class="flex items-center space-x-2">
                                    <div class="w-16 bg-gray-700 rounded-full h-2">
                                        <div class="bg-blue-500 h-2 rounded-full" style="width: ${stats.accuracy}%"></div>
                                    </div>
                                    <span class="text-white text-sm font-medium">${stats.accuracy}%</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('통계 로딩 실패:', error);
        statsContent.innerHTML = `
            <div class="text-center py-8">
                <i data-lucide="alert-circle" class="w-12 h-12 mx-auto text-red-400 mb-4"></i>
                <p class="text-gray-400">통계를 불러올 수 없습니다.</p>
            </div>
        `;
    }
    
    lucide.createIcons();
}

async function loadTransactionsTab() {
    const user = auth.getCurrentUser();
    const transactionsContent = document.getElementById('transactions-content');
    
    try {
        const response = await fetch(`/api/gam/transactions/${user.id}?limit=50`, {
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`
            }
        });
        const transactions = await response.json();
        
        transactionsContent.innerHTML = `
            <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                <div class="p-4 border-b border-gray-700">
                    <h3 class="text-lg font-semibold text-white">최근 거래 내역</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-700">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">타입</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">카테고리</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">금액</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">설명</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">날짜</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-700">
                            ${transactions.map(tx => `
                                <tr>
                                    <td class="px-4 py-3">
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            tx.type === 'earn' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }">
                                            ${tx.type === 'earn' ? '획득' : '소모'}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3 text-sm text-gray-300">${getCategoryName(tx.category)}</td>
                                    <td class="px-4 py-3 text-sm font-medium text-right ${
                                        tx.type === 'earn' ? 'text-green-400' : 'text-red-400'
                                    }">
                                        ${tx.type === 'earn' ? '+' : '-'}${tx.amount.toLocaleString()}감
                                    </td>
                                    <td class="px-4 py-3 text-sm text-gray-400">${tx.description || '-'}</td>
                                    <td class="px-4 py-3 text-sm text-gray-400">${new Date(tx.created_at).toLocaleDateString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('거래내역 로딩 실패:', error);
        transactionsContent.innerHTML = `
            <div class="text-center py-8">
                <i data-lucide="alert-circle" class="w-12 h-12 mx-auto text-red-400 mb-4"></i>
                <p class="text-gray-400">거래내역을 불러올 수 없습니다.</p>
            </div>
        `;
    }
    
    lucide.createIcons();
}

function getCategoryName(category) {
    const categoryNames = {
        'signup': '회원가입 보상',
        'login': '로그인 보상',
        'betting': '베팅',
        'betting_win': '베팅 승리',
        'betting_fail': '베팅 실패',
        'commission': '수수료',
        'achievement': '업적 보상',
        'first_prediction': '첫 예측 보상',
        'first_comment': '첫 댓글 보상',
        'comment_highlight': '댓글 강조',
        'weekly_ranking': '주간 랭킹 보상',
        'best_comment': '베스트 댓글 보상'
    };
    return categoryNames[category] || category;
}

async function changeUsername() {
    const user = auth.getCurrentUser();
    const newUsername = prompt('새로운 닉네임을 입력하세요 (30일마다 1회 변경 가능):', user.username);
    
    if (!newUsername || newUsername === user.username) return;
    
    try {
        const response = await fetch(`/api/profile/${user.id}/username`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.getToken()}`
            },
            body: JSON.stringify({ newUsername })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('닉네임이 변경되었습니다.');
            // 사용자 정보 업데이트
            const updatedUser = { ...user, username: newUsername };
            auth.updateCurrentUser(updatedUser);
            renderMyPage(); // 페이지 새로고침
        } else {
            alert(result.error || '닉네임 변경에 실패했습니다.');
        }
    } catch (error) {
        console.error('닉네임 변경 실패:', error);
        alert('닉네임 변경 중 오류가 발생했습니다.');
    }
}

async function changeProfileImage() {
    const imageUrl = prompt('프로필 이미지 URL을 입력하세요:');
    
    if (!imageUrl) return;
    
    try {
        const user = auth.getCurrentUser();
        const response = await fetch(`/api/profile/${user.id}/profile-image`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.getToken()}`
            },
            body: JSON.stringify({ imageUrl })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('프로필 이미지가 변경되었습니다.');
            renderMyPage(); // 페이지 새로고침
        } else {
            alert(result.error || '프로필 이미지 변경에 실패했습니다.');
        }
    } catch (error) {
        console.error('프로필 이미지 변경 실패:', error);
        alert('프로필 이미지 변경 중 오류가 발생했습니다.');
    }
}

async function changePassword() {
    const currentPassword = prompt('현재 비밀번호를 입력하세요:');
    if (!currentPassword) return;
    
    const newPassword = prompt('새 비밀번호를 입력하세요 (최소 6자):');
    if (!newPassword) return;
    
    const confirmPassword = prompt('새 비밀번호를 다시 입력하세요:');
    if (newPassword !== confirmPassword) {
        alert('새 비밀번호가 일치하지 않습니다.');
        return;
    }
    
    try {
        const user = auth.getCurrentUser();
        const response = await fetch(`/api/profile/${user.id}/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.getToken()}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('비밀번호가 변경되었습니다.');
        } else {
            alert(result.error || '비밀번호 변경에 실패했습니다.');
        }
    } catch (error) {
        console.error('비밀번호 변경 실패:', error);
        alert('비밀번호 변경 중 오류가 발생했습니다.');
    }
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
    <div class="issue-card manifold-style" data-id="${issue.id}">
        <!-- Header with metadata -->
        <div class="card-header">
            <div class="flex justify-between items-start mb-3">
                <div class="flex items-center space-x-3">
                    <div>
                        <span class="category-badge" style="${getCategoryBadgeStyle(issue.category)}">${issue.category}</span>
                        <div class="text-xs text-gray-500 flex items-center mt-1">
                            <i data-lucide="clock" class="w-3 h-3 mr-1"></i>
                            ${timeUntil(issue.endDate)}
                        </div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="flex items-center space-x-2 text-xs text-gray-500">
                        <i data-lucide="users" class="w-3 h-3"></i>
                        <span>${issue.participantCount || 0}</span>
                    </div>
                    <div class="flex items-center space-x-2 text-xs text-gray-500 mt-1">
                        <i data-lucide="coins" class="w-3 h-3"></i>
                        <span>${formatVolumeShort(issue.totalVolume)}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Prominent Probability Display -->
        <div class="probability-display mb-4">
            <div class="flex items-center justify-between">
                <div class="flex-grow pr-4">
                    <h3 class="text-lg font-semibold text-gray-900 mb-2 leading-tight">${issue.title}</h3>
                    ${issue.description ? `<p class="text-sm text-gray-600 leading-relaxed">${issue.description}</p>` : ''}
                </div>
                <div class="probability-badge">
                    <span class="text-2xl font-bold text-white">${yesPrice}%</span>
                    <div class="text-xs text-white text-center opacity-90">확률</div>
                </div>
            </div>
        </div>
        
        <!-- Issue Image (클릭 시 댓글 열기) -->
        <div class="issue-image-container mb-4">
            <img src="${getIssueImage(issue.category, issue.title)}" alt="${issue.category} 관련 이미지" class="issue-image cursor-pointer rounded-lg" loading="lazy" onclick="openCommentModal(${issue.id}, '${issue.title.replace(/'/g, "\\'")}')">
        </div>
        
        <!-- 확률 게이지 -->
        <div class="probability-gauge mb-4">
            <div class="gauge-container">
                <div class="gauge-track">
                    <div class="gauge-fill-yes" style="width: ${yesPrice}%"></div>
                    <div class="gauge-fill-no" style="width: ${noPrice}%; left: ${yesPrice}%"></div>
                    <div class="gauge-thumb" style="left: ${yesPrice}%"></div>
                </div>
                <div class="gauge-labels mt-3">
                    <span class="text-green-600 font-semibold">${yesPrice}% YES</span>
                    <span class="text-red-500 font-semibold">${noPrice}% NO</span>
                </div>
            </div>
        </div>
        
        <!-- Enhanced Prediction Buttons -->
        <div class="prediction-buttons mb-4">
            <div class="bet-controls ${userBetDisplay ? 'hidden' : ''}">
                <div class="flex space-x-3">
                    <button data-choice="Yes" class="bet-btn bet-btn-yes">
                        <div class="btn-content">
                            <span class="btn-label">Bet YES</span>
                            <span class="btn-odds">${yesPrice}%</span>
                        </div>
                        <div class="btn-arrow">↗</div>
                    </button>
                    <button data-choice="No" class="bet-btn bet-btn-no">
                        <div class="btn-content">
                            <span class="btn-label">Bet NO</span>
                            <span class="btn-odds">${noPrice}%</span>
                        </div>
                        <div class="btn-arrow">↘</div>
                    </button>
                </div>
            </div>
            ${userBetDisplay || '<div class="bet-feedback"></div>'}
        </div>
        
        <!-- Enhanced Footer -->
        <div class="card-footer">
            <div class="flex justify-between items-center text-sm">
                <div class="flex items-center space-x-4">
                    <div class="flex items-center space-x-1 text-gray-500">
                        <i data-lucide="trending-up" class="w-4 h-4"></i>
                        <span>${formatVolume(issue.totalVolume)}</span>
                    </div>
                    <div class="flex items-center space-x-1 text-gray-500">
                        <i data-lucide="message-circle" class="w-4 h-4"></i>
                        <span id="comment-count-${issue.id}">${issue.commentCount || 0}</span>
                    </div>
                </div>
                <div class="text-gray-400 text-xs">
                    ${new Date(issue.createdAt).toLocaleDateString('ko-KR')}
                </div>
            </div>
        </div>
        
        <!-- 관련 질문 섹션 -->
        <div class="related-questions mt-4 pt-4 border-t border-gray-100">
            <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-medium text-gray-700">관련 질문</h4>
                <button class="text-xs text-blue-600 hover:text-blue-700" onclick="toggleRelatedQuestions(${issue.id})">
                    <span id="related-toggle-${issue.id}">보기</span>
                    <i data-lucide="chevron-down" class="w-3 h-3 inline ml-1"></i>
                </button>
            </div>
            <div id="related-content-${issue.id}" class="hidden">
                <div class="space-y-2" id="related-list-${issue.id}">
                    <!-- 관련 질문들이 여기에 로드됩니다 -->
                </div>
            </div>
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
        // 댓글 수 로드
        popularIssues.forEach(issue => loadCommentCount(issue.id));
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
        // 댓글 수 로드
        filteredIssues.forEach(issue => loadCommentCount(issue.id));
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
    const openFilter = document.getElementById('open-filter');
    const timeTabs = document.querySelectorAll('.time-tab');
    
    let currentTimeFilter = 'ALL';

    // Time-based filtering functions
    function filterByTime(issues, timeFilter) {
        if (timeFilter === 'ALL') return issues;
        
        const now = new Date();
        let timeLimit;
        
        switch (timeFilter) {
            case '1H':
                timeLimit = new Date(now - 1 * 60 * 60 * 1000);
                break;
            case '6H':
                timeLimit = new Date(now - 6 * 60 * 60 * 1000);
                break;
            case '1D':
                timeLimit = new Date(now - 24 * 60 * 60 * 1000);
                break;
            case '1W':
                timeLimit = new Date(now - 7 * 24 * 60 * 60 * 1000);
                break;
            case '1M':
                timeLimit = new Date(now - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                return issues;
        }
        
        return issues.filter(issue => new Date(issue.createdAt) >= timeLimit);
    }

    const applyFilters = () => {
        const issues = backend.getIssues();
        let filtered = [...issues];

        // Apply time-based filter
        filtered = filterByTime(filtered, currentTimeFilter);

        // Apply search filter
        const searchTerm = searchInput?.value.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(issue => 
                issue.title.toLowerCase().includes(searchTerm) ||
                issue.description?.toLowerCase().includes(searchTerm)
            );
        }

        // Apply category filter
        const category = categoryFilter?.value;
        if (category && category !== 'all') {
            filtered = filtered.filter(issue => issue.category === category);
        }

        // Apply open/closed filter
        const openStatus = openFilter?.value;
        if (openStatus && openStatus !== 'all') {
            const now = new Date();
            if (openStatus === 'open') {
                filtered = filtered.filter(issue => new Date(issue.endDate) > now);
            } else if (openStatus === 'closed') {
                filtered = filtered.filter(issue => new Date(issue.endDate) <= now);
            }
        }

        // Apply sorting
        const sort = sortFilter?.value;
        if (sort === 'newest') {
            filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } else if (sort === 'hot') {
            // Hot sorting: recent activity + high volume
            filtered.sort((a, b) => {
                const aScore = (a.totalVolume || 0) * Math.exp(-(new Date() - new Date(a.createdAt)) / (1000 * 60 * 60 * 24));
                const bScore = (b.totalVolume || 0) * Math.exp(-(new Date() - new Date(b.createdAt)) / (1000 * 60 * 60 * 24));
                return bScore - aScore;
            });
        } else if (sort === 'ending_soon') {
            filtered.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
        } else if (sort === 'volume') {
            filtered.sort((a, b) => (b.totalVolume || 0) - (a.totalVolume || 0));
        }

        renderAllIssues(filtered);
    };

    // Setup time tab event listeners
    timeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            timeTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update current filter
            currentTimeFilter = tab.dataset.time;
            
            // Apply filters
            applyFilters();
        });
    });

    // Setup other filter event listeners
    searchInput?.addEventListener('input', applyFilters);
    categoryFilter?.addEventListener('change', applyFilters);
    sortFilter?.addEventListener('change', applyFilters);
    openFilter?.addEventListener('change', applyFilters);
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

function formatVolumeShort(volume) {
    if (volume >= 100000000) {
        return `${(volume / 100000000).toFixed(1)}억`;
    }
    if (volume >= 10000) {
        return `${(volume / 10000).toFixed(0)}만`;
    }
    if (volume >= 1000) {
        return `${(volume / 1000).toFixed(1)}k`;
    }
    return volume.toString();
}

// Related questions functionality
function toggleRelatedQuestions(issueId) {
    const content = document.getElementById(`related-content-${issueId}`);
    const toggle = document.getElementById(`related-toggle-${issueId}`);
    const icon = toggle.nextElementSibling;
    
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        toggle.textContent = '숨기기';
        icon.style.transform = 'rotate(180deg)';
        
        // Load related questions if not already loaded
        loadRelatedQuestions(issueId);
    } else {
        content.classList.add('hidden');
        toggle.textContent = '보기';
        icon.style.transform = 'rotate(0deg)';
    }
}

function loadRelatedQuestions(issueId) {
    const container = document.getElementById(`related-list-${issueId}`);
    if (!container || container.children.length > 0) return; // Already loaded
    
    // Get all issues and find related ones
    const allIssues = backend.getIssues();
    const currentIssue = allIssues.find(issue => issue.id === issueId);
    
    if (!currentIssue) return;
    
    // Simple recommendation algorithm: same category + keyword matching
    const relatedIssues = findRelatedIssues(currentIssue, allIssues).slice(0, 3);
    
    if (relatedIssues.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500">관련 질문을 찾을 수 없습니다.</p>';
        return;
    }
    
    container.innerHTML = relatedIssues.map(issue => `
        <div class="related-item p-2 bg-gray-50 rounded border hover:bg-gray-100 transition-colors cursor-pointer" onclick="window.location.hash='#issue-${issue.id}'">
            <div class="flex items-center justify-between">
                <div class="flex-grow">
                    <p class="text-xs font-medium text-gray-900 leading-tight">${issue.title}</p>
                    <div class="flex items-center space-x-2 mt-1">
                        <span class="text-xs text-gray-500">${issue.category}</span>
                        <span class="text-xs font-semibold text-blue-600">${issue.yesPercentage || issue.yesPrice || 50}%</span>
                    </div>
                </div>
                <div class="text-xs text-gray-400 ml-2">
                    <i data-lucide="users" class="w-3 h-3 inline"></i>
                    ${issue.participantCount || 0}
                </div>
            </div>
        </div>
    `).join('');
    
    lucide.createIcons();
}

function findRelatedIssues(currentIssue, allIssues) {
    return allIssues
        .filter(issue => issue.id !== currentIssue.id && issue.status === 'active')
        .map(issue => {
            let score = 0;
            
            // Same category gets higher score
            if (issue.category === currentIssue.category) {
                score += 10;
            }
            
            // Keyword matching in title
            const currentWords = currentIssue.title.toLowerCase().split(' ');
            const issueWords = issue.title.toLowerCase().split(' ');
            
            const commonWords = currentWords.filter(word => 
                word.length > 2 && issueWords.some(w => w.includes(word) || word.includes(w))
            );
            
            score += commonWords.length * 3;
            
            // Boost newer issues slightly
            const daysDiff = Math.abs(new Date(issue.createdAt) - new Date(currentIssue.createdAt)) / (1000 * 60 * 60 * 24);
            if (daysDiff < 7) score += 2;
            
            // Boost popular issues
            if (issue.isPopular) score += 5;
            
            return { ...issue, score };
        })
        .filter(issue => issue.score > 0)
        .sort((a, b) => b.score - a.score);
}


// 관리자 페이지 함수들
async function renderAdminPage() {
    // 관리자 인증 확인
    if (!checkAdminAccess()) {
        showAdminLogin();
        return;
    }
    await renderAdminIssueTable();
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
    const imageInput = document.getElementById('issue-image');
    const imagePreview = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    const removeImageBtn = document.getElementById('remove-image');
    const uploadArea = document.getElementById('upload-area');

    let uploadedImageUrl = null;

    // 모달 열기
    createBtn?.addEventListener('click', () => {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        lucide.createIcons(); // 모달 열릴 때 아이콘 다시 생성
    });

    // 모달 닫기
    const closeModal = () => {
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
        form.reset();
        resetImageUpload();
    };

    // 이미지 업로드 초기화
    const resetImageUpload = () => {
        uploadedImageUrl = null;
        imagePreview.classList.add('hidden');
        uploadArea.classList.remove('hidden');
        previewImg.src = '';
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    
    // 모달 외부 클릭시 닫기
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // 이미지 업로드 처리
    imageInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await uploadImage(file);
        }
    });

    // 이미지 제거 버튼
    removeImageBtn?.addEventListener('click', () => {
        resetImageUpload();
        imageInput.value = '';
    });

    // 드래그 앤 드롭 처리
    uploadArea?.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('border-blue-500', 'bg-blue-50');
    });

    uploadArea?.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('border-blue-500', 'bg-blue-50');
    });

    uploadArea?.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadArea.classList.remove('border-blue-500', 'bg-blue-50');
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            imageInput.files = files;
            await uploadImage(files[0]);
        }
    });

    // 이미지 업로드 함수
    async function uploadImage(file) {
        try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch('/api/admin/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${auth.getToken()}`
                },
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                uploadedImageUrl = result.imageUrl;
                previewImg.src = result.imageUrl;
                imagePreview.classList.remove('hidden');
                uploadArea.classList.add('hidden');
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('이미지 업로드 실패:', error);
            alert('이미지 업로드에 실패했습니다: ' + error.message);
        }
    }

    // 이슈 생성 폼 제출
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        
        const newIssue = {
            title: formData.get('title'),
            category: formData.get('category'),
            description: formData.get('description'),
            endDate: formData.get('endDate'),
            yesPrice: parseInt(formData.get('yesPrice')),
            isPopular: formData.get('isPopular') === 'on',
            image_url: uploadedImageUrl
        };

        // 백엔드에 이슈 추가
        const result = await addNewIssue(newIssue);
        if (result.success) {
            alert('이슈가 성공적으로 생성되었습니다!');
            closeModal();
            await renderAdminIssueTable();
        } else {
            alert('이슈 생성에 실패했습니다: ' + result.message);
        }
    });
}

async function renderAdminIssueTable() {
    try {
        const response = await fetch('/api/admin/issues', {
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`
            }
        });
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message);
        }
        
        const issues = data.issues;
        const tbody = document.getElementById('issues-table-body');
        
        if (!tbody) {
            console.error('Admin table body not found');
            return;
        }
        
        if (issues.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-4 text-center text-gray-500">
                        <div class="flex flex-col items-center">
                            <i data-lucide="inbox" class="w-8 h-8 mb-2 text-gray-400"></i>
                            <p>등록된 이슈가 없습니다.</p>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = issues.map(issue => {
                const endDate = new Date(issue.end_date);
                return `
                    <tr class="hover:bg-gray-50">
                        <td class="px-6 py-4">
                            <div class="text-sm font-medium text-gray-900">${issue.title}</div>
                            <div class="text-sm text-gray-500">마감: ${endDate.toLocaleDateString('ko-KR')} ${endDate.toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'})}</div>
                        </td>
                        <td class="px-6 py-4 text-sm text-gray-900">${issue.category}</td>
                        <td class="px-6 py-4 text-sm text-gray-900">${issue.yes_price}%</td>
                        <td class="px-6 py-4 text-sm text-gray-900">-</td>
                        <td class="px-6 py-4">
                            <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                issue.is_popular ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }">
                                ${issue.is_popular ? '인기' : '일반'}
                            </span>
                        </td>
                        <td class="px-6 py-4 text-sm font-medium">
                            <div class="flex space-x-2">
                                <button onclick="editIssue(${issue.id})" class="text-indigo-600 hover:text-indigo-900">편집</button>
                                <button onclick="togglePopular(${issue.id})" class="text-blue-600 hover:text-blue-900">인기토글</button>
                                <button onclick="deleteIssue(${issue.id})" class="text-red-600 hover:text-red-900">삭제</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
        lucide.createIcons();
    } catch (error) {
        console.error('이슈 목록 로드 실패:', error);
        const tbody = document.getElementById('issues-table-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-4 text-center text-red-500">
                        이슈 목록을 불러오는데 실패했습니다.
                    </td>
                </tr>
            `;
        }
    }
}

async function addNewIssue(issueData) {
    try {
        const requestData = {
            title: issueData.title,
            category: issueData.category,
            description: issueData.description || '',
            image_url: issueData.image_url || null,
            yes_price: issueData.yesPrice || 50,
            end_date: issueData.endDate,
            is_popular: issueData.isPopular || false
        };
        
        const response = await fetch('/api/admin/issues', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.getToken()}`
            },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message);
        }
        
        return result;
    } catch (error) {
        console.error('이슈 생성 실패:', error);
        return { success: false, message: error.message };
    }
}

async function deleteIssue(issueId) {
    if (!confirm('정말로 이 이슈를 삭제하시겠습니까?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/issues/${issueId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`
            }
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message);
        }
        
        alert('이슈가 삭제되었습니다.');
        await renderAdminIssueTable();
    } catch (error) {
        console.error('이슈 삭제 실패:', error);
        alert('이슈 삭제에 실패했습니다: ' + error.message);
    }
}

async function togglePopular(issueId) {
    try {
        const response = await fetch(`/api/admin/issues/${issueId}/toggle-popular`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`
            }
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message);
        }
        
        alert(result.message);
        await renderAdminIssueTable();
    } catch (error) {
        console.error('이슈 상태 변경 실패:', error);
        alert('이슈 상태 변경에 실패했습니다: ' + error.message);
    }
}

async function editIssue(issueId) {
    // TODO: 이슈 편집 모달 구현
    alert('이슈 편집 기능은 추후 구현 예정입니다.');
}

// ===== 댓글 시스템 함수들 =====

// 댓글 수 로드
async function loadCommentCount(issueId) {
    try {
        const response = await fetch(`/api/comments/issue/${issueId}`);
        const data = await response.json();
        
        if (data.success) {
            const countElement = document.getElementById(`comment-count-${issueId}`);
            if (countElement) {
                const totalComments = data.comments.reduce((count, comment) => {
                    return count + 1 + (comment.replies ? comment.replies.length : 0);
                }, 0);
                countElement.textContent = totalComments;
            }
        }
    } catch (error) {
        console.error('댓글 수 로딩 실패:', error);
        const countElement = document.getElementById(`comment-count-${issueId}`);
        if (countElement) {
            countElement.textContent = '0';
        }
    }
}

// 댓글 모달 열기
function openCommentModal(issueId, issueTitle) {
    const modal = createCommentModal(issueId, issueTitle);
    document.body.appendChild(modal);
    
    // 모달 애니메이션
    setTimeout(() => {
        modal.classList.add('opacity-100');
        modal.querySelector('.modal-content').classList.add('scale-100');
    }, 10);
    
    // 댓글 로드
    loadComments(issueId);
}

// 댓글 모달 생성
function createCommentModal(issueId, issueTitle) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 opacity-0 transition-opacity duration-300';
    modal.id = `comment-modal-${issueId}`;
    
    modal.innerHTML = `
        <div class="modal-content bg-white rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col transform scale-95 transition-transform duration-300">
            <!-- 모달 헤더 -->
            <div class="flex items-center justify-between p-6 border-b">
                <h2 class="text-xl font-bold text-gray-900">${issueTitle}</h2>
                <button onclick="closeCommentModal(${issueId})" class="text-gray-400 hover:text-gray-600">
                    <i data-lucide="x" class="w-6 h-6"></i>
                </button>
            </div>
            
            <!-- 댓글 목록 -->
            <div class="flex-1 overflow-y-auto p-6">
                <div id="modal-comments-${issueId}" class="space-y-4">
                    <div class="text-center text-gray-500 py-8">댓글을 불러오는 중...</div>
                </div>
            </div>
            
            <!-- 댓글 작성 -->
            <div class="border-t p-6">
                ${auth.isLoggedIn() ? `
                    <div class="space-y-3">
                        <textarea id="modal-comment-input-${issueId}" placeholder="댓글을 작성하세요..." class="w-full p-3 border border-gray-300 rounded-lg resize-none" rows="3" maxlength="500"></textarea>
                        <div class="flex justify-between items-center">
                            <span class="text-xs text-gray-500">최대 500자</span>
                            <button onclick="submitModalComment(${issueId})" class="btn-primary">댓글 작성</button>
                        </div>
                    </div>
                ` : `
                    <div class="text-center p-4 bg-gray-50 rounded-lg">
                        <p class="text-gray-600">댓글을 작성하려면 <a href="login.html" class="text-blue-600 hover:underline">로그인</a>해주세요.</p>
                    </div>
                `}
            </div>
        </div>
    `;
    
    // 모달 외부 클릭 시 닫기
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeCommentModal(issueId);
        }
    });
    
    return modal;
}

// 댓글 모달 닫기
function closeCommentModal(issueId) {
    const modal = document.getElementById(`comment-modal-${issueId}`);
    if (modal) {
        modal.classList.remove('opacity-100');
        modal.querySelector('.modal-content').classList.remove('scale-100');
        setTimeout(() => {
            document.body.removeChild(modal);
        }, 300);
    }
}

async function loadComments(issueId) {
    const commentsContainer = document.getElementById(`modal-comments-${issueId}`);
    if (!commentsContainer) return;
    
    try {
        const response = await fetch(`/api/comments/issue/${issueId}`);
        const data = await response.json();
        
        if (data.success) {
            renderModalComments(commentsContainer, data.comments, issueId);
        } else {
            commentsContainer.innerHTML = '<div class="text-center text-red-500 py-8">댓글을 불러올 수 없습니다.</div>';
        }
    } catch (error) {
        console.error('댓글 로딩 실패:', error);
        commentsContainer.innerHTML = '<div class="text-center text-red-500 py-8">댓글 로딩 중 오류가 발생했습니다.</div>';
    }
}

function renderModalComments(container, comments, issueId) {
    if (comments.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-8">아직 댓글이 없습니다. 첫 댓글을 작성해보세요!</div>';
        return;
    }
    
    const currentUser = auth.getCurrentUser();
    const commentsHtml = comments.map(comment => createModalCommentHtml(comment, currentUser, issueId)).join('');
    container.innerHTML = commentsHtml;
    lucide.createIcons();
}

function createModalCommentHtml(comment, currentUser, issueId) {
    const isOwner = currentUser && currentUser.id === comment.user_id;
    const isHighlighted = comment.is_highlighted;
    
    return `
        <div class="comment ${isHighlighted ? 'highlighted-comment' : ''}" data-comment-id="${comment.id}">
            <div class="flex space-x-3 p-4 ${isHighlighted ? 'bg-yellow-50 border border-yellow-200 rounded-lg' : ''}">
                <img src="${comment.profile_image || 'https://via.placeholder.com/40x40/374151/9CA3AF?text=👤'}" 
                     alt="${comment.username}" 
                     class="w-8 h-8 rounded-full">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2">
                            <h4 class="text-sm font-semibold text-gray-900">${comment.username}</h4>
                            ${isHighlighted ? '<span class="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">강조</span>' : ''}
                        </div>
                        <div class="flex items-center space-x-2">
                            <span class="text-xs text-gray-500">${comment.timeAgo}</span>
                            ${isOwner ? `
                                <div class="relative">
                                    <button onclick="toggleCommentMenu(${comment.id})" class="text-gray-400 hover:text-gray-600">
                                        <i data-lucide="more-horizontal" class="w-4 h-4"></i>
                                    </button>
                                    <div id="comment-menu-${comment.id}" class="hidden absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-10 border">
                                        ${!isHighlighted ? `<button onclick="highlightComment(${comment.id})" class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">댓글 강조 (1000감)</button>` : ''}
                                        <button onclick="deleteComment(${comment.id})" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100">삭제</button>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <p class="text-sm text-gray-700 mt-1">${comment.content}</p>
                    <div class="flex items-center space-x-4 mt-2">
                        <button onclick="toggleCommentLike(${comment.id}, ${issueId})" 
                                class="flex items-center space-x-1 text-xs text-gray-500 hover:text-blue-600 transition-colors comment-like-btn"
                                data-comment-id="${comment.id}">
                            <i data-lucide="heart" class="w-4 h-4"></i>
                            <span class="like-count">${comment.likes}</span>
                        </button>
                        <button onclick="showReplyForm(${comment.id})" class="text-xs text-gray-500 hover:text-blue-600 transition-colors">
                            답글
                        </button>
                    </div>
                    
                    <!-- 답글 표시 -->
                    ${comment.replies && comment.replies.length > 0 ? `
                        <div class="mt-3 space-y-3">
                            ${comment.replies.map(reply => `
                                <div class="flex space-x-3 pl-4 border-l-2 border-gray-200">
                                    <img src="${reply.profile_image || 'https://via.placeholder.com/32x32/374151/9CA3AF?text=👤'}" 
                                         alt="${reply.username}" 
                                         class="w-6 h-6 rounded-full">
                                    <div class="flex-1">
                                        <div class="flex items-center space-x-2">
                                            <h5 class="text-sm font-medium text-gray-900">${reply.username}</h5>
                                            <span class="text-xs text-gray-500">${reply.timeAgo}</span>
                                        </div>
                                        <p class="text-sm text-gray-700 mt-1">${reply.content}</p>
                                        <button onclick="toggleCommentLike(${reply.id}, ${issueId})" 
                                                class="flex items-center space-x-1 text-xs text-gray-500 hover:text-blue-600 transition-colors mt-1 comment-like-btn"
                                                data-comment-id="${reply.id}">
                                            <i data-lucide="heart" class="w-3 h-3"></i>
                                            <span class="like-count">${reply.likes}</span>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    <!-- 답글 작성 폼 (숨김) -->
                    <div id="reply-form-${comment.id}" class="hidden mt-3">
                        <div class="pl-4 border-l-2 border-gray-200">
                            <textarea id="reply-input-${comment.id}" placeholder="답글을 작성하세요..." class="w-full p-2 text-sm border border-gray-300 rounded-lg resize-none" rows="2" maxlength="500"></textarea>
                            <div class="flex justify-end space-x-2 mt-2">
                                <button onclick="hideReplyForm(${comment.id})" class="px-3 py-1 text-xs text-gray-600 hover:text-gray-800">취소</button>
                                <button onclick="submitReply(${comment.id}, ${issueId})" class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">답글 작성</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function submitComment(issueId) {
    const user = auth.getCurrentUser();
    if (!user) {
        alert('로그인이 필요합니다.');
        return;
    }
    
    const input = document.getElementById(`comment-input-${issueId}`);
    const content = input.value.trim();
    
    if (!content) {
        alert('댓글 내용을 입력해주세요.');
        return;
    }
    
    if (content.length > 500) {
        alert('댓글은 500자 이내로 작성해주세요.');
        return;
    }
    
    try {
        const response = await fetch('/api/comments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.getToken()}`
            },
            body: JSON.stringify({
                userId: user.id,
                issueId: issueId,
                content: content
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            input.value = '';
            await loadComments(issueId);
            // 댓글 수 업데이트
            await loadCommentCount(issueId);
            if (data.message) {
                alert(data.message);
            }
        } else {
            alert(data.error || '댓글 작성에 실패했습니다.');
        }
    } catch (error) {
        console.error('댓글 작성 실패:', error);
        alert('댓글 작성 중 오류가 발생했습니다.');
    }
}

// 모달용 댓글 작성
async function submitModalComment(issueId) {
    const user = auth.getCurrentUser();
    if (!user) {
        alert('로그인이 필요합니다.');
        return;
    }
    
    const input = document.getElementById(`modal-comment-input-${issueId}`);
    const content = input.value.trim();
    
    if (!content) {
        alert('댓글 내용을 입력해주세요.');
        return;
    }
    
    if (content.length > 500) {
        alert('댓글은 500자 이내로 작성해주세요.');
        return;
    }
    
    try {
        const response = await fetch('/api/comments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.getToken()}`
            },
            body: JSON.stringify({
                userId: user.id,
                issueId: issueId,
                content: content
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            input.value = '';
            await loadComments(issueId);
            // 댓글 수 업데이트
            await loadCommentCount(issueId);
            if (data.message) {
                alert(data.message);
            }
        } else {
            alert(data.error || '댓글 작성에 실패했습니다.');
        }
    } catch (error) {
        console.error('댓글 작성 실패:', error);
        alert('댓글 작성 중 오류가 발생했습니다.');
    }
}

async function submitReply(parentId, issueId) {
    const user = auth.getCurrentUser();
    if (!user) {
        alert('로그인이 필요합니다.');
        return;
    }
    
    const input = document.getElementById(`reply-input-${parentId}`);
    const content = input.value.trim();
    
    if (!content) {
        alert('답글 내용을 입력해주세요.');
        return;
    }
    
    try {
        const response = await fetch('/api/comments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.getToken()}`
            },
            body: JSON.stringify({
                userId: user.id,
                issueId: issueId,
                content: content,
                parentId: parentId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            input.value = '';
            hideReplyForm(parentId);
            await loadComments(issueId);
        } else {
            alert(data.error || '답글 작성에 실패했습니다.');
        }
    } catch (error) {
        console.error('답글 작성 실패:', error);
        alert('답글 작성 중 오류가 발생했습니다.');
    }
}

async function toggleCommentLike(commentId, issueId) {
    const user = auth.getCurrentUser();
    if (!user) {
        alert('로그인이 필요합니다.');
        return;
    }
    
    const button = document.querySelector(`.comment-like-btn[data-comment-id="${commentId}"]`);
    const likeCountSpan = button.querySelector('.like-count');
    const heartIcon = button.querySelector('i[data-lucide="heart"]');
    
    const isLiked = button.classList.contains('liked');
    const action = isLiked ? 'unlike' : 'like';
    
    try {
        const response = await fetch(`/api/comments/${commentId}/like`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.getToken()}`
            },
            body: JSON.stringify({
                userId: user.id,
                action: action
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // UI 업데이트
            const currentCount = parseInt(likeCountSpan.textContent);
            const newCount = isLiked ? currentCount - 1 : currentCount + 1;
            likeCountSpan.textContent = newCount;
            
            if (isLiked) {
                button.classList.remove('liked', 'text-red-600');
                button.classList.add('text-gray-500');
                heartIcon.classList.remove('fill-current');
            } else {
                button.classList.add('liked', 'text-red-600');
                button.classList.remove('text-gray-500');
                heartIcon.classList.add('fill-current');
            }
        } else {
            alert(data.error || '좋아요 처리에 실패했습니다.');
        }
    } catch (error) {
        console.error('좋아요 처리 실패:', error);
        alert('좋아요 처리 중 오류가 발생했습니다.');
    }
}

function showReplyForm(commentId) {
    const replyForm = document.getElementById(`reply-form-${commentId}`);
    const replyInput = document.getElementById(`reply-input-${commentId}`);
    
    if (replyForm) {
        replyForm.classList.remove('hidden');
        replyInput.focus();
    }
}

function hideReplyForm(commentId) {
    const replyForm = document.getElementById(`reply-form-${commentId}`);
    const replyInput = document.getElementById(`reply-input-${commentId}`);
    
    if (replyForm) {
        replyForm.classList.add('hidden');
        replyInput.value = '';
    }
}

function toggleCommentMenu(commentId) {
    const menu = document.getElementById(`comment-menu-${commentId}`);
    if (menu) {
        menu.classList.toggle('hidden');
    }
    
    // 다른 메뉴들 닫기
    document.querySelectorAll('[id^="comment-menu-"]').forEach(otherMenu => {
        if (otherMenu.id !== `comment-menu-${commentId}`) {
            otherMenu.classList.add('hidden');
        }
    });
}

async function highlightComment(commentId) {
    const user = auth.getCurrentUser();
    if (!user) {
        alert('로그인이 필요합니다.');
        return;
    }
    
    if (!confirm('댓글을 24시간 동안 강조하시겠습니까? (1000감이 차감됩니다)')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/comments/${commentId}/highlight`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.getToken()}`
            },
            body: JSON.stringify({
                userId: user.id
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(data.message);
            // 메뉴 닫기
            toggleCommentMenu(commentId);
            // 사용자 정보 업데이트
            const updatedUser = { ...user, gam_balance: (user.gam_balance || user.coins || 0) - 1000 };
            auth.updateCurrentUser(updatedUser);
            updateUserWallet();
            // 댓글 다시 로드 (강조 표시 반영)
            const issueId = document.querySelector(`[data-comment-id="${commentId}"]`).closest('[id^="comments-"]').id.split('-')[1];
            await loadComments(issueId);
        } else {
            alert(data.error || '댓글 강조에 실패했습니다.');
        }
    } catch (error) {
        console.error('댓글 강조 실패:', error);
        alert('댓글 강조 중 오류가 발생했습니다.');
    }
}

async function deleteComment(commentId) {
    if (!confirm('댓글을 삭제하시겠습니까?')) {
        return;
    }
    
    const user = auth.getCurrentUser();
    if (!user) {
        alert('로그인이 필요합니다.');
        return;
    }
    
    try {
        const response = await fetch(`/api/comments/${commentId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.getToken()}`
            },
            body: JSON.stringify({
                userId: user.id
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(data.message);
            // 메뉴 닫기
            toggleCommentMenu(commentId);
            // 댓글 다시 로드
            const issueId = document.querySelector(`[data-comment-id="${commentId}"]`).closest('[id^="comments-"]').id.split('-')[1];
            await loadComments(issueId);
        } else {
            alert(data.error || '댓글 삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('댓글 삭제 실패:', error);
        alert('댓글 삭제 중 오류가 발생했습니다.');
    }
}

// 페이지 클릭 시 댓글 메뉴 닫기
document.addEventListener('click', (e) => {
    if (!e.target.closest('.relative')) {
        document.querySelectorAll('[id^="comment-menu-"]').forEach(menu => {
            menu.classList.add('hidden');
        });
    }
});
