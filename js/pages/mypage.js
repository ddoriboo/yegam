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

    const user = auth.getCurrentUser();
    if (!user) {
        console.log('No user data found');
        return;
    }

    console.log('Rendering mypage for user:', user.username);

    // 사용자 기본 정보 표시
    updateUserProfile(user);
    
    // 티어 정보 표시
    updateTierInfo(user);
    
    // 베팅 기록 로드
    await loadUserBets();
    
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
    const userJoinedEl = document.getElementById('user-joined');

    if (userNameEl) userNameEl.textContent = user.username;
    if (userEmailEl) userEmailEl.textContent = user.email;
    if (userCoinsEl) userCoinsEl.textContent = `${(user.coins || 0).toLocaleString()} GAM`;
    
    if (userJoinedEl && user.created_at) {
        const joinDate = new Date(user.created_at).toLocaleDateString('ko-KR');
        userJoinedEl.textContent = `가입일: ${joinDate}`;
    }
}

function updateTierInfo(user) {
    const userGam = user.coins || 0;
    const currentTier = getUserTier(userGam);
    const nextTierInfo = getNextTierInfo(userGam);
    
    // 왼쪽 프로필 아이콘을 티어에 맞게 업데이트
    const tierIconEl = document.getElementById('user-tier-icon');
    if (tierIconEl) {
        const tierIcon = currentTier.icon || '👤';
        const tierColor = currentTier.color || '#6b7280';
        
        tierIconEl.innerHTML = `
            <div class="text-4xl">${tierIcon}</div>
        `;
        tierIconEl.style.background = `linear-gradient(135deg, ${tierColor}, ${tierColor}dd)`;
        tierIconEl.classList.add('tier-profile-icon');
    }
    
    // 이름 옆 티어 배지 표시
    const tierBadgeEl = document.getElementById('user-tier-badge');
    if (tierBadgeEl) {
        tierBadgeEl.innerHTML = createTierDisplay(currentTier, false);
        tierBadgeEl.classList.add('tier-display-large');
    }
    
    // 상세 티어 진행률 섹션 표시
    const tierProgressEl = document.getElementById('tier-progress-section');
    if (tierProgressEl) {
        let progressHtml = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                    <div class="flex items-center space-x-4">
                        <div class="current-tier-display">
                            ${createTierDisplay(currentTier, true)}
                        </div>
                        <div>
                            <p class="text-sm text-gray-600">현재 등급</p>
                            <p class="text-lg font-semibold text-gray-900">레벨 ${currentTier.level}</p>
                        </div>
                    </div>
                    
                    <div class="bg-white rounded-lg p-4 border border-gray-200">
                        <p class="text-sm text-gray-600 mb-1">보유 GAM</p>
                        <p class="text-2xl font-bold text-blue-600">${formatNumber(userGam)}</p>
                    </div>
                </div>
        `;
        
        if (nextTierInfo) {
            const progressPercent = Math.min(nextTierInfo.progress, 100);
            progressHtml += `
                <div class="space-y-4">
                    <div class="flex items-center space-x-4">
                        <div class="next-tier-display opacity-70">
                            ${createTierDisplay(nextTierInfo.nextTier, true)}
                        </div>
                        <div>
                            <p class="text-sm text-gray-600">다음 등급</p>
                            <p class="text-lg font-semibold text-gray-900">레벨 ${nextTierInfo.nextTier.level}</p>
                        </div>
                    </div>
                    
                    <div class="bg-white rounded-lg p-4 border border-gray-200">
                        <div class="flex justify-between items-center mb-2">
                            <p class="text-sm text-gray-600">다음 등급까지</p>
                            <p class="text-sm font-semibold text-purple-600">${Math.round(progressPercent)}%</p>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-3 mb-2">
                            <div class="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-500" 
                                 style="width: ${progressPercent}%"></div>
                        </div>
                        <p class="text-sm text-gray-600">
                            <span class="font-semibold text-red-500">${formatNumber(nextTierInfo.requiredGam)}</span> GAM 더 필요
                        </p>
                    </div>
                </div>
            `;
        } else {
            progressHtml += `
                <div class="space-y-4">
                    <div class="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg p-6 text-center">
                        <div class="text-4xl mb-2">🏆</div>
                        <p class="text-white font-bold text-lg">최고 등급 달성!</p>
                        <p class="text-yellow-100 text-sm mt-1">당신은 예측의 신입니다</p>
                    </div>
                </div>
            `;
        }
        
        progressHtml += '</div>';
        
        // 등급별 특별 메시지 추가
        let specialMessage = '';
        if (currentTier.level >= 20) {
            specialMessage = `
                <div class="mt-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg p-4 text-center">
                    <p class="text-white font-semibold">✨ 모든 것을 보는 눈 ✨</p>
                    <p class="text-purple-100 text-sm">전설 속의 존재가 되었습니다!</p>
                </div>
            `;
        } else if (currentTier.level >= 15) {
            specialMessage = `
                <div class="mt-4 bg-gradient-to-r from-yellow-500 to-red-500 rounded-lg p-4 text-center">
                    <p class="text-white font-semibold">🌟 전설 등급 달성! 🌟</p>
                    <p class="text-yellow-100 text-sm">놀라운 예측 능력을 보여주고 있습니다!</p>
                </div>
            `;
        } else if (currentTier.level >= 10) {
            specialMessage = `
                <div class="mt-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-4 text-center">
                    <p class="text-white font-semibold">👑 고급 등급 달성!</p>
                    <p class="text-blue-100 text-sm">뛰어난 통찰력을 인정받았습니다!</p>
                </div>
            `;
        }
        
        progressHtml += specialMessage;
        tierProgressEl.innerHTML = progressHtml;
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
    try {
        const token = localStorage.getItem('yegame-token');
        const response = await fetch('/api/notifications/read', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            await loadNotifications(currentNotificationPage);
        }
    } catch (error) {
        console.error('읽은 알림 삭제 실패:', error);
    }
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