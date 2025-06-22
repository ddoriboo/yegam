import * as auth from '../auth.js';
import { getUserTier, getNextTierInfo, formatNumber, createTierDisplay, addTierStyles } from '../utils/tier-utils.js';

export async function renderMyPage() {
    console.log('renderMyPage called');
    
    // 티어 스타일 추가
    addTierStyles();
    
    if (!auth.isLoggedIn()) {
        console.log('User not logged in, redirecting to login');
        window.location.href = 'login.html';
        return;
    }

    // 최신 사용자 정보 가져오기 (서버에서 검증)
    const isTokenValid = await auth.verifyToken();
    if (!isTokenValid) {
        console.log('Token verification failed, redirecting to login');
        window.location.href = 'login.html';
        return;
    }

    const user = auth.getCurrentUser();
    if (!user) {
        console.log('No user data found after verification');
        return;
    }

    console.log('Rendering mypage for user:', user.username, 'GAM Balance:', user.gam_balance);

    // 사용자 기본 정보 표시
    updateUserProfile(user);
    
    // 티어 정보 표시
    updateTierInfo(user);
    
    // 베팅 기록 로드
    await loadUserBets();
    
    // 베팅 필터 이벤트 리스너 설정
    setupBettingFilter();
    
    // GAM 트랜잭션 기록 로드
    await loadGamTransactions();
    
    // 알림 로드
    console.log('Loading notifications...');
    await loadNotifications();
    
    // 알림 관련 이벤트 리스너 설정
    setupNotificationEventListeners();
    
    // Lucide 아이콘 초기화
    initializeLucideIcons();
}

// Lucide 아이콘 초기화 함수 (header.js와 동일한 로직)
function initializeLucideIcons() {
    const attemptIconInit = (attempt = 0) => {
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            try {
                lucide.createIcons();
                console.log('Lucide icons initialized in mypage');
                return true;
            } catch (error) {
                console.warn('Lucide icon initialization failed in mypage:', error);
            }
        }
        
        if (attempt < 10) {
            setTimeout(() => attemptIconInit(attempt + 1), 500);
        } else {
            console.error('Failed to initialize Lucide icons in mypage after multiple attempts');
        }
        return false;
    };
    
    attemptIconInit();
}

function updateUserProfile(user) {
    const userNameEl = document.getElementById('user-name');
    const userEmailEl = document.getElementById('user-email');
    const userCoinsEl = document.getElementById('user-coins');
    const userJoinedDaysEl = document.getElementById('user-joined-days');

    if (userNameEl) userNameEl.textContent = user.username;
    if (userEmailEl) userEmailEl.textContent = user.email;
    if (userCoinsEl) {
        // Use same default as server (10000) to ensure consistency
        const gamBalance = user.gam_balance ?? 10000;
        userCoinsEl.textContent = gamBalance.toLocaleString();
        console.log('GAM Balance updated:', gamBalance, 'Raw value:', user.gam_balance);
    }
    
    if (userJoinedDaysEl && user.created_at) {
        const joinDate = new Date(user.created_at);
        const now = new Date();
        const diffTime = Math.abs(now - joinDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        userJoinedDaysEl.textContent = `${diffDays}일째`;
    }
}

function updateTierInfo(user) {
    // Use nullish coalescing with same default as server
    const userGam = user.gam_balance ?? 10000;
    const currentTier = getUserTier(userGam);
    const nextTierInfo = getNextTierInfo(userGam);
    
    // 왼쪽 프로필 아이콘을 티어에 맞게 업데이트
    const tierIconEl = document.getElementById('user-tier-icon');
    if (tierIconEl) {
        const tierIcon = currentTier.icon || '👤';
        const tierColor = currentTier.color || '#6b7280';
        
        tierIconEl.innerHTML = `
            <div class="text-3xl md:text-4xl">${tierIcon}</div>
        `;
        tierIconEl.style.background = `linear-gradient(135deg, ${tierColor}, ${tierColor}dd)`;
    }
    
    // 현재 등급명 표시
    const currentTierNameEl = document.getElementById('current-tier-name');
    if (currentTierNameEl) {
        currentTierNameEl.textContent = `${currentTier.name} Lv.${currentTier.level}`;
    }
    
    // 다음 등급 진행률 표시
    const nextTierProgressEl = document.getElementById('next-tier-progress');
    if (nextTierProgressEl) {
        if (nextTierInfo) {
            const progressPercent = Math.min(nextTierInfo.progress, 100);
            nextTierProgressEl.textContent = `${Math.round(progressPercent)}%`;
        } else {
            nextTierProgressEl.textContent = '최고등급';
        }
    }
    
    // 상세 티어 진행률 섹션 표시 (간소화)
    const tierProgressEl = document.getElementById('tier-progress-section');
    if (tierProgressEl) {
        if (nextTierInfo) {
            const progressPercent = Math.min(nextTierInfo.progress, 100);
            tierProgressEl.innerHTML = `
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center space-x-2">
                        <span class="text-2xl">${nextTierInfo.nextTier.icon}</span>
                        <div>
                            <p class="text-sm font-medium text-gray-900">${nextTierInfo.nextTier.name} Lv.${nextTierInfo.nextTier.level}</p>
                            <p class="text-xs text-gray-600">다음 등급</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-lg font-bold text-purple-600">${Math.round(progressPercent)}%</p>
                        <p class="text-xs text-gray-600">${formatNumber(nextTierInfo.requiredGam)} GAM 더 필요</p>
                    </div>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div class="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500" 
                         style="width: ${progressPercent}%"></div>
                </div>
            `;
        } else {
            tierProgressEl.innerHTML = `
                <div class="text-center py-4">
                    <div class="text-3xl mb-2">🏆</div>
                    <p class="font-bold text-gray-900">최고 등급 달성!</p>
                    <p class="text-sm text-gray-600 mt-1">당신은 예측의 신입니다</p>
                </div>
            `;
        }
    }
}

async function loadUserBets() {
    // 로딩 상태 표시
    const betHistoryEl = document.getElementById('bet-history');
    if (betHistoryEl) {
        betHistoryEl.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i data-lucide="loader" class="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400"></i>
                <p>예측 기록을 불러오는 중...</p>
            </div>
        `;
        // Lucide 아이콘 초기화
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
    
    try {
        console.log('Loading user bets with token:', auth.getToken() ? 'present' : 'missing');
        
        const response = await fetch('/api/bets/my-bets', {
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`
            }
        });
        
        console.log('Bets API response status:', response.status);
        
        const data = await response.json();
        console.log('Bets API response data:', data);
        
        if (data.success && data.bets) {
            allBets = data.bets; // 전역 변수에 저장
            updateBetStats(data.bets);
            renderBetHistory(data.bets);
            console.log('Successfully loaded', data.bets.length, 'bets');
        } else {
            throw new Error(data.message || '베팅 기록을 불러올 수 없습니다.');
        }
    } catch (error) {
        console.error('베팅 기록 로드 실패:', error);
        
        // 에러 상태 표시
        if (betHistoryEl) {
            betHistoryEl.innerHTML = `
                <div class="text-center py-8 text-red-500">
                    <i data-lucide="alert-circle" class="w-8 h-8 mx-auto mb-4 text-red-400"></i>
                    <p>베팅 기록을 불러오는데 실패했습니다.</p>
                    <button onclick="window.location.reload()" class="mt-2 text-blue-600 hover:text-blue-700 underline">새로고침</button>
                </div>
            `;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
        
        // 통계도 기본값으로 설정
        updateBetStats([]);
    }
}

function updateBetStats(bets) {
    const totalBetsEl = document.getElementById('total-bets');
    const winRateEl = document.getElementById('win-rate');
    const totalVolumeEl = document.getElementById('total-volume');
    
    // 총 베팅 수
    if (totalBetsEl) totalBetsEl.textContent = bets.length;
    
    // 승률 계산 (결과가 나온 베팅만)
    const resolvedBets = bets.filter(bet => bet.result);
    const wonBets = resolvedBets.filter(bet => bet.choice === bet.result);
    const winRate = resolvedBets.length > 0 ? (wonBets.length / resolvedBets.length * 100) : 0;
    
    if (winRateEl) winRateEl.textContent = `${winRate.toFixed(1)}%`;
    
    // 총 참여 금액 계산 (모든 베팅의 amount 합계)
    const totalVolume = bets.reduce((sum, bet) => sum + (bet.amount || 0), 0);
    if (totalVolumeEl) totalVolumeEl.textContent = `${totalVolume.toLocaleString()} GAM`;
}

function renderBetHistory(bets) {
    const betHistoryEl = document.getElementById('bet-history');
    if (!betHistoryEl) return;
    
    if (bets.length === 0) {
        betHistoryEl.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-4 text-gray-400"></i>
                <p>아직 예측 기록이 없습니다.</p>
                <a href="/" class="text-blue-600 hover:text-blue-700 font-medium">첫 예측하러 가기</a>
            </div>
        `;
        return;
    }
    
    const betHistoryHtml = bets.map(bet => {
        const statusClass = bet.result 
            ? (bet.choice === bet.result ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')
            : 'bg-yellow-100 text-yellow-800';
        
        const statusText = bet.result 
            ? (bet.choice === bet.result ? '성공' : '실패')
            : '진행중';
            
        return `
            <div class="bg-white rounded-lg border border-gray-200 p-4">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-medium text-gray-900 flex-1">${bet.issue_title}</h4>
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${statusClass}">
                        ${statusText}
                    </span>
                </div>
                <div class="flex justify-between text-sm text-gray-600">
                    <span>선택: <strong>${bet.choice}</strong></span>
                    <span>베팅: ${bet.amount.toLocaleString()} GAM</span>
                </div>
                ${bet.reward ? `
                    <div class="mt-2 text-sm">
                        <span class="text-green-600 font-medium">보상: +${bet.reward.toLocaleString()} GAM</span>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
    
    betHistoryEl.innerHTML = betHistoryHtml;
}

// 전역 변수로 베팅 데이터 저장
let allBets = [];

// 베팅 필터 설정
function setupBettingFilter() {
    const filterEl = document.getElementById('bet-filter');
    if (filterEl) {
        filterEl.addEventListener('change', (e) => {
            const filterValue = e.target.value;
            filterAndRenderBets(filterValue);
        });
    }
}

// 베팅 필터링 및 렌더링
function filterAndRenderBets(filterValue) {
    let filteredBets = allBets;
    
    switch (filterValue) {
        case 'yes':
            filteredBets = allBets.filter(bet => bet.choice === 'Yes');
            break;
        case 'no':
            filteredBets = allBets.filter(bet => bet.choice === 'No');
            break;
        case 'won':
            filteredBets = allBets.filter(bet => bet.status === '성공');
            break;
        case 'lost':
            filteredBets = allBets.filter(bet => bet.status === '실패');
            break;
        default:
            // 'all' - 모든 베팅 표시
            break;
    }
    
    renderBetHistory(filteredBets);
}

// GAM 트랜잭션 관련 전역 변수
let allTransactions = [];
let currentTransactionPage = 1;
const transactionsPerPage = 5;

// GAM 트랜잭션 기록 로드
async function loadGamTransactions() {
    const transactionHistoryEl = document.getElementById('gam-transaction-history');
    if (!transactionHistoryEl) return;
    
    // 로딩 상태 표시
    transactionHistoryEl.innerHTML = `
        <div class="text-center py-8 text-gray-500">
            <i data-lucide="loader" class="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400"></i>
            <p>GAM 증감 내역을 불러오는 중...</p>
        </div>
    `;
    
    // Lucide 아이콘 초기화
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    try {
        console.log('Loading GAM transactions with token:', auth.getToken() ? 'present' : 'missing');
        
        const response = await fetch('/api/gam/my-transactions?limit=100', {
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`
            }
        });
        
        console.log('GAM transactions API response status:', response.status);
        
        const data = await response.json();
        console.log('GAM transactions API response data:', data);
        
        if (data.success && data.transactions) {
            allTransactions = data.transactions;
            renderGamTransactionHistory();
            setupTransactionLoadMore();
            console.log('Successfully loaded', data.transactions.length, 'transactions');
        } else {
            throw new Error(data.message || 'GAM 증감 내역을 불러올 수 없습니다.');
        }
    } catch (error) {
        console.error('GAM 증감 내역 로드 실패:', error);
        
        // 에러 상태 표시
        transactionHistoryEl.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i data-lucide="alert-circle" class="w-8 h-8 mx-auto mb-4 text-red-400"></i>
                <p>GAM 증감 내역을 불러오는데 실패했습니다.</p>
                <button onclick="window.location.reload()" class="mt-2 text-blue-600 hover:text-blue-700 underline">새로고침</button>
            </div>
        `;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

function renderGamTransactionHistory() {
    const transactionHistoryEl = document.getElementById('gam-transaction-history');
    const loadMoreEl = document.getElementById('gam-transaction-load-more');
    if (!transactionHistoryEl) return;
    
    if (allTransactions.length === 0) {
        transactionHistoryEl.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-4 text-gray-400"></i>
                <p>GAM 증감 내역이 없습니다.</p>
            </div>
        `;
        if (loadMoreEl) loadMoreEl.classList.add('hidden');
        return;
    }
    
    // 현재 페이지까지의 트랜잭션 표시
    const endIndex = currentTransactionPage * transactionsPerPage;
    const displayTransactions = allTransactions.slice(0, endIndex);
    
    const transactionHistoryHtml = displayTransactions.map(transaction => {
        const isEarn = transaction.type === 'earn';
        const amountClass = isEarn ? 'text-green-600' : 'text-red-600';
        const amountSign = isEarn ? '+' : '-';
        const iconClass = isEarn ? 'text-green-500' : 'text-red-500';
        const icon = isEarn ? 'plus-circle' : 'minus-circle';
        
        // 카테고리별 한국어 표시
        const categoryNames = {
            'login': '출석 보상',
            'signup': '회원가입 보상',
            'betting_fail': '베팅 실패',
            'betting_win': '베팅 성공',
            'commission': '수수료',
            'comment_highlight': '댓글 강조',
            'issue_request_approved': '이슈 신청 승인',
            'achievement': '업적 달성'
        };
        
        const categoryDisplay = categoryNames[transaction.category] || transaction.category;
        const timeAgo = formatTimeAgo(new Date(transaction.created_at));
        
        return `
            <div class="bg-gray-50 rounded-lg p-4 mb-3 border border-gray-100">
                <div class="flex justify-between items-start">
                    <div class="flex items-center space-x-3">
                        <i data-lucide="${icon}" class="w-5 h-5 ${iconClass}"></i>
                        <div>
                            <h4 class="font-medium text-gray-900">${categoryDisplay}</h4>
                            <p class="text-sm text-gray-600">${transaction.description || '상세 정보 없음'}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-lg font-bold ${amountClass}">
                            ${amountSign}${transaction.amount.toLocaleString()}
                        </span>
                        <p class="text-xs text-gray-500">${timeAgo}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    transactionHistoryEl.innerHTML = transactionHistoryHtml;
    
    // 더보기 버튼 표시/숨기기
    if (loadMoreEl) {
        if (endIndex < allTransactions.length) {
            loadMoreEl.classList.remove('hidden');
        } else {
            loadMoreEl.classList.add('hidden');
        }
    }
    
    // Lucide 아이콘 초기화
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// 더보기 버튼 설정
function setupTransactionLoadMore() {
    const loadMoreBtn = document.getElementById('load-more-transactions-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            currentTransactionPage++;
            renderGamTransactionHistory();
        });
    }
}

function formatTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// 큰 티어 표시용 스타일 추가
function addMypageStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .tier-display-large .tier-icon {
            font-size: 1.5rem;
        }
        
        .tier-display-large .tier-name {
            font-size: 1rem;
            font-weight: 700;
        }
        
        .current-tier-display .tier-display {
            padding: 0.75rem 1rem;
            border-width: 2px;
        }
        
        .current-tier-display .tier-icon {
            font-size: 1.75rem;
        }
        
        .current-tier-display .tier-name {
            font-size: 1.1rem;
            font-weight: 700;
        }
        
        .tier-profile-icon {
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border: 3px solid rgba(255, 255, 255, 0.3);
        }
        
        .tier-profile-icon:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
        }
    `;
    document.head.appendChild(style);
}

// 페이지 로드 시 스타일 추가
document.addEventListener('DOMContentLoaded', () => {
    addMypageStyles();
});

// 알림 관련 기능들
let currentNotificationPage = 1;
const notificationsPerPage = 20;

async function loadNotifications(page = 1) {
    const loadingEl = document.getElementById('notifications-loading');
    const listEl = document.getElementById('notifications-list');
    const emptyEl = document.getElementById('notifications-empty');
    const paginationEl = document.getElementById('notifications-pagination');

    if (!loadingEl || !listEl || !emptyEl) return;

    // 로딩 상태 표시
    loadingEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    emptyEl.classList.add('hidden');
    paginationEl.classList.add('hidden');

    try {
        const token = localStorage.getItem('yegame-token');
        const response = await fetch(`/api/notifications?page=${page}&limit=${notificationsPerPage}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const notifications = data.data.notifications;
            const pagination = data.data.pagination;

            loadingEl.classList.add('hidden');

            if (notifications.length === 0) {
                emptyEl.classList.remove('hidden');
                return;
            }

            // 알림 목록 렌더링
            listEl.innerHTML = renderNotificationsList(notifications);
            listEl.classList.remove('hidden');

            // 페이지네이션 렌더링
            if (pagination.totalPages > 1) {
                paginationEl.innerHTML = renderNotificationsPagination(pagination);
                paginationEl.classList.remove('hidden');
            }

            currentNotificationPage = page;
            
            // Lucide 아이콘 초기화 (마이페이지 알림용)
            initializeLucideIcons();

        } else {
            loadingEl.classList.add('hidden');
            listEl.innerHTML = '<div class="p-4 text-center text-red-500">알림을 불러올 수 없습니다.</div>';
            listEl.classList.remove('hidden');
        }

    } catch (error) {
        console.error('알림 로드 실패:', error);
        loadingEl.classList.add('hidden');
        listEl.innerHTML = '<div class="p-4 text-center text-red-500">알림을 불러올 수 없습니다.</div>';
        listEl.classList.remove('hidden');
    }
}

function renderNotificationsList(notifications) {
    return notifications.map(notification => `
        <div class="notification-item border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer ${!notification.is_read ? 'bg-blue-50' : ''}" 
             data-notification-id="${notification.id}" data-is-read="${notification.is_read}">
            <div class="p-4 flex items-start space-x-4">
                <div class="flex-shrink-0">
                    ${getNotificationIcon(notification.type)}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between">
                        <h4 class="text-sm font-medium text-gray-900 pr-2">${notification.title}</h4>
                        <div class="flex items-center space-x-2">
                            <span class="text-xs text-gray-400">${formatNotificationTime(notification.created_at)}</span>
                            ${!notification.is_read ? '<div class="w-2 h-2 bg-blue-500 rounded-full"></div>' : ''}
                        </div>
                    </div>
                    <p class="text-sm text-gray-600 mt-1 whitespace-pre-line">${notification.message}</p>
                </div>
            </div>
        </div>
    `).join('');
}

function renderNotificationsPagination(pagination) {
    const pages = [];
    const { page, totalPages, hasPrev, hasNext } = pagination;

    if (hasPrev) {
        pages.push(`<button class="pagination-btn" data-page="${page - 1}">이전</button>`);
    }

    // 페이지 번호들
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);

    for (let i = startPage; i <= endPage; i++) {
        const isActive = i === page;
        pages.push(`
            <button class="pagination-btn ${isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}" 
                    data-page="${i}" ${isActive ? 'disabled' : ''}>${i}</button>
        `);
    }

    if (hasNext) {
        pages.push(`<button class="pagination-btn" data-page="${page + 1}">다음</button>`);
    }

    return `
        <div class="flex items-center justify-center space-x-2">
            ${pages.join('')}
        </div>
        <style>
            .pagination-btn {
                padding: 0.5rem 0.75rem;
                border: 1px solid #d1d5db;
                border-radius: 0.375rem;
                background: white;
                color: #374151;
                font-size: 0.875rem;
                cursor: pointer;
                transition: all 0.15s;
            }
            .pagination-btn:hover:not(:disabled) {
                background: #f3f4f6;
            }
            .pagination-btn:disabled {
                cursor: not-allowed;
                opacity: 0.6;
            }
        </style>
    `;
}

function setupNotificationEventListeners() {
    // 모두 읽기 버튼
    const markAllReadBtn = document.getElementById('mark-all-notifications-read');
    markAllReadBtn?.addEventListener('click', markAllNotificationsAsRead);

    // 읽은 알림 삭제 버튼
    const clearReadBtn = document.getElementById('clear-read-notifications');
    clearReadBtn?.addEventListener('click', clearReadNotifications);

    // 알림 아이템 클릭 이벤트 (이벤트 위임)
    const notificationsList = document.getElementById('notifications-list');
    notificationsList?.addEventListener('click', (e) => {
        const notificationItem = e.target.closest('.notification-item');
        if (!notificationItem) return;

        const notificationId = notificationItem.dataset.notificationId;
        const isRead = notificationItem.dataset.isRead === 'true';

        if (!isRead) {
            markNotificationAsRead(notificationId);
        }
    });

    // 페이지네이션 클릭 이벤트 (이벤트 위임)
    const paginationEl = document.getElementById('notifications-pagination');
    paginationEl?.addEventListener('click', (e) => {
        const btn = e.target.closest('.pagination-btn');
        if (!btn || btn.disabled) return;

        const page = parseInt(btn.dataset.page);
        if (page && page !== currentNotificationPage) {
            loadNotifications(page);
        }
    });
}

async function markAllNotificationsAsRead() {
    try {
        const token = localStorage.getItem('yegame-token');
        const response = await fetch('/api/notifications/read-all', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            await loadNotifications(currentNotificationPage);
            
            // 헤더의 알림 개수도 업데이트
            if (window.updateNotificationCount) {
                window.updateNotificationCount();
            }
        }
    } catch (error) {
        console.error('모든 알림 읽음 처리 실패:', error);
    }
}

async function clearReadNotifications() {
    const clearBtn = document.getElementById('clear-read-notifications');
    if (!clearBtn) return;
    
    // 확인 대화상자 표시
    if (!confirm('읽은 알림을 모두 삭제하시겠습니까?')) {
        return;
    }
    
    try {
        // 버튼 비활성화 및 로딩 상태 표시
        const originalText = clearBtn.textContent;
        clearBtn.disabled = true;
        clearBtn.textContent = '삭제 중...';
        clearBtn.classList.add('opacity-50', 'cursor-not-allowed');
        
        const token = localStorage.getItem('yegame-token');
        const response = await fetch('/api/notifications/read', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        
        if (response.ok && data.success) {
            // 성공 시 알림 목록 새로고침
            await loadNotifications(currentNotificationPage);
            
            // 헤더의 알림 개수도 업데이트
            if (window.updateNotificationCount) {
                window.updateNotificationCount();
            }
            
            // 성공 메시지 표시
            if (data.data && data.data.deletedCount > 0) {
                showTemporaryMessage(`${data.data.deletedCount}개의 읽은 알림이 삭제되었습니다.`, 'success');
            } else {
                showTemporaryMessage('삭제할 읽은 알림이 없습니다.', 'info');
            }
        } else {
            throw new Error(data.message || '읽은 알림 삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('읽은 알림 삭제 실패:', error);
        showTemporaryMessage('읽은 알림 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        // 버튼 상태 복구
        if (clearBtn) {
            clearBtn.disabled = false;
            clearBtn.textContent = '읽은 알림 삭제';
            clearBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

// 임시 메시지 표시 함수
function showTemporaryMessage(message, type = 'info') {
    const container = document.getElementById('notifications-section');
    if (!container) return;
    
    const messageDiv = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-100 text-green-800 border-green-200' : 
                   type === 'error' ? 'bg-red-100 text-red-800 border-red-200' : 
                   'bg-blue-100 text-blue-800 border-blue-200';
    
    messageDiv.className = `fixed top-4 right-4 z-50 px-4 py-2 rounded-lg border ${bgColor} shadow-lg transition-all duration-300`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

async function markNotificationAsRead(notificationId) {
    try {
        const token = localStorage.getItem('yegame-token');
        const response = await fetch(`/api/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            // 해당 알림 아이템의 읽음 상태 업데이트
            const notificationItem = document.querySelector(`[data-notification-id="${notificationId}"]`);
            if (notificationItem) {
                notificationItem.dataset.isRead = 'true';
                notificationItem.classList.remove('bg-blue-50');
                
                // 읽지 않음 표시 제거
                const unreadDot = notificationItem.querySelector('.bg-blue-500');
                if (unreadDot) unreadDot.remove();
            }
            
            // 헤더의 알림 개수도 업데이트
            if (window.updateNotificationCount) {
                window.updateNotificationCount();
            }
        }
    } catch (error) {
        console.error('알림 읽음 처리 실패:', error);
    }
}

// 알림 타입별 아이콘 반환 (header.js와 동일)
function getNotificationIcon(type) {
    const iconMap = {
        'issue_request_approved': '<i data-lucide="check-circle" class="w-5 h-5 text-green-500"></i>',
        'issue_request_rejected': '<i data-lucide="x-circle" class="w-5 h-5 text-red-500"></i>',
        'betting_win': '<i data-lucide="trophy" class="w-5 h-5 text-yellow-500"></i>',
        'betting_loss': '<i data-lucide="minus-circle" class="w-5 h-5 text-gray-500"></i>',
        'betting_draw': '<i data-lucide="rotate-ccw" class="w-5 h-5 text-blue-500"></i>',
        'betting_cancelled': '<i data-lucide="x-square" class="w-5 h-5 text-red-400"></i>',
        'issue_closed': '<i data-lucide="clock" class="w-5 h-5 text-blue-500"></i>',
        'gam_reward': '<i data-lucide="coins" class="w-5 h-5 text-yellow-500"></i>',
        'reward_distributed': '<i data-lucide="gift" class="w-5 h-5 text-purple-500"></i>',
        'premium_feature': '<i data-lucide="star" class="w-5 h-5 text-orange-500"></i>',
        'system_announcement': '<i data-lucide="megaphone" class="w-5 h-5 text-blue-500"></i>',
        'system_broadcast': '<i data-lucide="radio" class="w-5 h-5 text-blue-500"></i>'
    };
    
    return iconMap[type] || '<i data-lucide="bell" class="w-5 h-5 text-gray-500"></i>';
}

// 알림 시간 포맷팅 (header.js와 동일)
function formatNotificationTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now - time) / (1000 * 60));
    
    if (diffInMinutes < 1) return '방금 전';
    if (diffInMinutes < 60) return `${diffInMinutes}분 전`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}시간 전`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}일 전`;
    
    return time.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}