import * as auth from '../auth.js';

export function updateHeader() {
    const userActionsContainer = document.getElementById('header-user-actions');
    if (!userActionsContainer) return;

    if (auth.isLoggedIn()) {
        const user = auth.getCurrentUser();
        userActionsContainer.innerHTML = `
            <!-- 알림 아이콘 - 닉네임 바로 옆에 배치 -->
            <div class="flex items-center space-x-3">
                <!-- 사용자명 (PC에서만 표시) -->
                <span class="text-sm font-medium text-gray-600 hidden lg:block">${user.username}</span>
                
                <!-- 알림 아이콘 -->
                <div class="relative">
                    <button id="notification-button" class="relative p-2 text-gray-600 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100 touch-manipulation">
                        <i data-lucide="bell" class="w-5 h-5"></i>
                        <span id="notification-badge" class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center hidden">0</span>
                    </button>
                    
                    <!-- 알림 드롭다운 -->
                    <div id="notification-dropdown" class="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-xl border border-gray-200 hidden" style="z-index: 10050; transform: translateX(0); max-width: calc(100vw - 2rem);">
                        <div class="p-4 border-b border-gray-200">
                            <div class="flex items-center justify-between">
                                <h3 class="text-lg font-semibold text-gray-900">알림</h3>
                                <button id="mark-all-read" class="text-sm text-blue-600 hover:text-blue-700 font-medium">모두 읽기</button>
                            </div>
                        </div>
                        <div id="notification-list" class="max-h-96 overflow-y-auto">
                            <div class="p-4 text-center text-gray-500">
                                <i data-lucide="loader" class="w-6 h-6 animate-spin mx-auto mb-2"></i>
                                <p>알림을 불러오는 중...</p>
                            </div>
                        </div>
                        <div class="p-3 border-t border-gray-200 text-center">
                            <a href="mypage.html#notifications" class="text-sm text-blue-600 hover:text-blue-700 font-medium">모든 알림 보기</a>
                        </div>
                    </div>
                </div>
                
                <!-- GAM 잔액 -->
                <div id="user-wallet" class="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-md border border-gray-200 shadow-sm">
                    <i data-lucide="coins" class="w-4 h-4 text-yellow-500"></i>
                    <span id="user-coins" class="text-sm font-semibold text-gray-900">${(user.gam_balance || 0).toLocaleString()}</span>
                </div>
                
                <!-- 로그아웃 버튼 -->
                <button id="logout-button" class="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium px-2 py-1 rounded hover:bg-gray-100">로그아웃</button>
            </div>
        `;
        
        // 로그아웃 버튼 이벤트
        document.getElementById('logout-button')?.addEventListener('click', () => {
            auth.logout();
            window.location.href = 'index.html';
        });
        
        // 알림 관련 이벤트 리스너 설정
        setupNotificationEvents();
    } else {
        userActionsContainer.innerHTML = `
            <a href="login.html" class="btn-primary">로그인/회원가입</a>
        `;
    }
    
    // Lucide 아이콘 초기화 - 더 안정적인 방법
    initializeLucideIcons();
}

export function updateUserWallet() {
    const userCoinsEl = document.getElementById('user-coins');
    if (userCoinsEl && auth.isLoggedIn()) {
        const user = auth.getCurrentUser();
        userCoinsEl.textContent = (user.gam_balance || 0).toLocaleString();
    }
}

// 알림 관련 이벤트 설정
function setupNotificationEvents() {
    const notificationButton = document.getElementById('notification-button');
    const notificationDropdown = document.getElementById('notification-dropdown');
    const markAllReadButton = document.getElementById('mark-all-read');
    
    if (!notificationButton || !notificationDropdown) return;
    
    // 알림 버튼 클릭 시 드롭다운 토글
    notificationButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = notificationDropdown.classList.contains('hidden');
        
        if (isHidden) {
            notificationDropdown.classList.remove('hidden');
            loadNotifications();
        } else {
            notificationDropdown.classList.add('hidden');
        }
    });
    
    // 드롭다운 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
        if (!notificationDropdown.contains(e.target) && !notificationButton.contains(e.target)) {
            notificationDropdown.classList.add('hidden');
        }
    });
    
    // 모두 읽기 버튼
    markAllReadButton?.addEventListener('click', markAllNotificationsAsRead);
    
    // 페이지 로드 시 읽지 않은 알림 개수 확인
    updateNotificationCount();
    
    // 주기적으로 알림 개수 업데이트 (30초마다)
    setInterval(updateNotificationCount, 30000);
}

// 읽지 않은 알림 개수 업데이트
async function updateNotificationCount() {
    if (!auth.isLoggedIn()) return;
    
    try {
        const token = localStorage.getItem('yegame-token');
        const response = await fetch('/api/notifications/unread-count', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const badge = document.getElementById('notification-badge');
            const count = data.data.unreadCount;
            
            if (badge) {
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        }
    } catch (error) {
        console.error('알림 개수 조회 실패:', error);
    }
}

// 알림 목록 로드
async function loadNotifications() {
    const notificationList = document.getElementById('notification-list');
    if (!notificationList || !auth.isLoggedIn()) return;
    
    notificationList.innerHTML = '<div class="p-4 text-center text-gray-500">알림을 불러오는 중...</div>';
    
    try {
        const token = localStorage.getItem('yegame-token');
        const response = await fetch('/api/notifications?limit=10', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const notifications = data.data.notifications;
            
            if (notifications.length === 0) {
                notificationList.innerHTML = '<div class="p-4 text-center text-gray-500">새로운 알림이 없습니다.</div>';
                return;
            }
            
            notificationList.innerHTML = notifications.map(notification => `
                <div class="notification-item p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${!notification.is_read ? 'bg-blue-50' : ''}" 
                     data-notification-id="${notification.id}" data-is-read="${notification.is_read}">
                    <div class="flex items-start space-x-3">
                        <div class="flex-shrink-0">
                            ${getNotificationIcon(notification.type)}
                        </div>
                        <div class="flex-1 min-w-0">
                            <h4 class="text-sm font-medium text-gray-900 truncate">${notification.title}</h4>
                            <p class="text-sm text-gray-600 mt-1 line-clamp-2">${notification.message}</p>
                            <p class="text-xs text-gray-400 mt-1">${formatNotificationTime(notification.created_at)}</p>
                        </div>
                        ${!notification.is_read ? '<div class="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>' : ''}
                    </div>
                </div>
            `).join('');
            
            // Lucide 아이콘 초기화 (헤더 드롭다운용)
            initializeLucideIcons();
            
            // 알림 아이템 클릭 이벤트
            notificationList.querySelectorAll('.notification-item').forEach(item => {
                item.addEventListener('click', () => {
                    const notificationId = item.dataset.notificationId;
                    const isRead = item.dataset.isRead === 'true';
                    
                    if (!isRead) {
                        markNotificationAsRead(notificationId);
                    }
                    
                    // 드롭다운 닫기
                    document.getElementById('notification-dropdown').classList.add('hidden');
                });
            });
            
        } else {
            notificationList.innerHTML = '<div class="p-4 text-center text-red-500">알림을 불러올 수 없습니다.</div>';
        }
        
    } catch (error) {
        console.error('알림 로드 실패:', error);
        notificationList.innerHTML = '<div class="p-4 text-center text-red-500">알림을 불러올 수 없습니다.</div>';
    }
}

// 특정 알림을 읽음으로 표시
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
            updateNotificationCount();
        }
    } catch (error) {
        console.error('알림 읽음 처리 실패:', error);
    }
}

// 모든 알림을 읽음으로 표시
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
            loadNotifications(); // 목록 새로고침
            updateNotificationCount();
        }
    } catch (error) {
        console.error('모든 알림 읽음 처리 실패:', error);
    }
}

// 알림 타입별 아이콘 반환
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

// 알림 시간 포맷팅
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

// Lucide 아이콘 초기화 함수
function initializeLucideIcons() {
    // 여러 번 시도해서 아이콘 초기화 보장
    const attemptIconInit = (attempt = 0) => {
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            try {
                lucide.createIcons();
                console.log('Lucide icons initialized successfully');
                return true;
            } catch (error) {
                console.warn('Lucide icon initialization failed:', error);
            }
        }
        
        // 최대 10번 시도 (총 5초간)
        if (attempt < 10) {
            setTimeout(() => attemptIconInit(attempt + 1), 500);
        } else {
            console.error('Failed to initialize Lucide icons after multiple attempts');
        }
        return false;
    };
    
    attemptIconInit();
}