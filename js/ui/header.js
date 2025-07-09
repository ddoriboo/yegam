import * as auth from '../auth.js';

// 사용자 지갑(GAM 잔액) 업데이트 함수를 export
export function updateUserWallet() {
    const userCoinsEl = document.getElementById('user-coins');
    if (userCoinsEl && auth.isLoggedIn()) {
        const user = auth.getCurrentUser();
        userCoinsEl.textContent = (user.gam_balance || 0).toLocaleString();
    }
}

export function updateHeader() {
    const userActionsContainer = document.getElementById('header-user-actions');
    if (!userActionsContainer) return;

    if (auth.isLoggedIn()) {
        const user = auth.getCurrentUser();
        userActionsContainer.innerHTML = `
            <!-- 모바일 최적화된 사용자 액션 -->
            <div class="flex items-center space-x-1 sm:space-x-2">
                <!-- 사용자명 (PC에서만 표시) -->
                <span class="text-sm font-medium text-gray-600 hidden lg:block">${user.username}</span>
                
                <!-- 알림 아이콘 -->
                <div class="relative">
                    <button id="notification-button" class="relative p-2.5 text-gray-600 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100 touch-manipulation">
                        <i data-lucide="bell" class="w-5 h-5"></i>
                        <span id="notification-badge" class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center hidden">0</span>
                    </button>
                    
                    <!-- 알림 드롭다운 -->
                    <div id="notification-dropdown" class="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-xl border border-gray-200 hidden" style="z-index: 50001 !important; transform: translateX(0); max-width: calc(100vw - 2rem); position: absolute !important; display: none !important;">
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
                
                <!-- GAM 잔액 - 모바일 최적화 -->
                <div id="user-wallet" class="flex items-center space-x-1 sm:space-x-2 bg-white px-2 sm:px-3 py-1.5 rounded-md border border-gray-200 shadow-sm">
                    <i data-lucide="coins" class="w-4 h-4 text-yellow-500 flex-shrink-0"></i>
                    <span id="user-coins" class="text-xs sm:text-sm font-semibold text-gray-900 truncate">${(user.gam_balance || 0).toLocaleString()}</span>
                </div>
                
                <!-- 로그아웃 버튼 - 모바일 최적화 -->
                <button id="logout-button" class="text-gray-600 hover:text-gray-900 transition-colors text-xs sm:text-sm font-medium px-2 py-1.5 rounded hover:bg-gray-100 touch-manipulation">
                    <span class="hidden sm:inline">로그아웃</span>
                    <i data-lucide="log-out" class="w-4 h-4 sm:hidden"></i>
                </button>
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

// 알림 인터벌 정리 함수
export function clearNotificationInterval() {
    if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
        console.log('Notification interval cleared');
    }
}

// 전역 알림 인터벌 변수
let notificationInterval = null;

// 알림 관련 이벤트 설정
function setupNotificationEvents() {
    const notificationButton = document.getElementById('notification-button');
    const notificationDropdown = document.getElementById('notification-dropdown');
    const markAllReadButton = document.getElementById('mark-all-read');
    
    console.log('Setting up notification events'); // 디버깅용
    console.log('Button found:', !!notificationButton); // 디버깅용
    console.log('Dropdown found:', !!notificationDropdown); // 디버깅용
    
    if (!notificationButton || !notificationDropdown) {
        console.log('Missing notification elements!'); // 디버깅용
        return;
    }
    
    // 드롭다운 토글 함수
    const toggleDropdown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('Notification button triggered'); // 디버깅용
        const isHidden = notificationDropdown.classList.contains('hidden');
        console.log('Is hidden:', isHidden); // 디버깅용
        
        if (isHidden) {
            // 버튼의 위치 계산
            const buttonRect = notificationButton.getBoundingClientRect();
            console.log('Button rect:', buttonRect); // 디버깅용
            
            // 드롭다운을 body에 추가 (포탈 방식)
            if (!document.getElementById('notification-dropdown-portal')) {
                const portal = notificationDropdown.cloneNode(true);
                portal.id = 'notification-dropdown-portal';
                portal.style.position = 'fixed';
                portal.style.top = (buttonRect.bottom + 8) + 'px';
                
                // 모바일에서 화면 중앙에 배치하되, 화면을 벗어나지 않도록 조정
                const dropdownWidth = 320; // w-80 = 320px
                const screenWidth = window.innerWidth;
                const buttonCenter = buttonRect.left + (buttonRect.width / 2);
                
                let leftPos = buttonCenter - (dropdownWidth / 2);
                
                // 화면 왼쪽을 벗어나지 않도록
                if (leftPos < 16) leftPos = 16;
                // 화면 오른쪽을 벗어나지 않도록  
                if (leftPos + dropdownWidth > screenWidth - 16) {
                    leftPos = screenWidth - dropdownWidth - 16;
                }
                
                portal.style.left = leftPos + 'px';
                portal.style.width = (dropdownWidth - 32) + 'px'; // 좌우 마진 고려
                portal.style.zIndex = '99999';
                document.body.appendChild(portal);
                
                // 기존 드롭다운 숨기기
                notificationDropdown.style.display = 'none';
                
                // 포탈 드롭다운 표시
                portal.classList.remove('hidden');
                portal.style.setProperty('display', 'block', 'important');
                portal.style.setProperty('visibility', 'visible', 'important');
                portal.style.setProperty('opacity', '1', 'important');
                portal.style.setProperty('pointer-events', 'auto', 'important');
                
                console.log('Portal dropdown created and shown'); // 디버깅용
                console.log('Portal styles:', portal.style.cssText); // 디버깅용
                
                // 포탈에서 알림 로드
                loadNotificationsInPortal(portal);
            } else {
                // 기존 포탈이 있으면 위치 업데이트
                const portal = document.getElementById('notification-dropdown-portal');
                portal.style.top = (buttonRect.bottom + 8) + 'px';
                
                // 위치 재계산
                const dropdownWidth = 320;
                const screenWidth = window.innerWidth;
                const buttonCenter = buttonRect.left + (buttonRect.width / 2);
                
                let leftPos = buttonCenter - (dropdownWidth / 2);
                
                if (leftPos < 16) leftPos = 16;
                if (leftPos + dropdownWidth > screenWidth - 16) {
                    leftPos = screenWidth - dropdownWidth - 16;
                }
                
                portal.style.left = leftPos + 'px';
                portal.style.width = (dropdownWidth - 32) + 'px';
                
                portal.classList.remove('hidden');
                portal.style.setProperty('display', 'block', 'important');
                console.log('Portal dropdown updated and shown'); // 디버깅용
            }
        } else {
            // 포탈 드롭다운 숨기기
            const portal = document.getElementById('notification-dropdown-portal');
            if (portal) {
                portal.classList.add('hidden');
                portal.style.setProperty('display', 'none', 'important');
                console.log('Portal dropdown hidden'); // 디버깅용
            }
            
            // 기존 방식도 적용
            notificationDropdown.classList.add('hidden');
            notificationDropdown.style.setProperty('display', 'none', 'important');
            notificationDropdown.style.setProperty('visibility', 'hidden', 'important');
            notificationDropdown.style.setProperty('opacity', '0', 'important');
            console.log('Hiding dropdown'); // 디버깅용
        }
    };
    
    // 알림 버튼 클릭/터치 이벤트
    notificationButton.addEventListener('click', toggleDropdown);
    notificationButton.addEventListener('touchend', toggleDropdown);
    
    // 드롭다운 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
        const portal = document.getElementById('notification-dropdown-portal');
        
        // 포탈 드롭다운이 있으면 포탈 기준으로 체크
        if (portal && !portal.classList.contains('hidden')) {
            if (!portal.contains(e.target) && !notificationButton.contains(e.target)) {
                portal.classList.add('hidden');
                portal.style.setProperty('display', 'none', 'important');
                console.log('Portal closed by outside click'); // 디버깅용
            }
        } else {
            // 기존 드롭다운 닫기
            if (!notificationDropdown.contains(e.target) && !notificationButton.contains(e.target)) {
                notificationDropdown.classList.add('hidden');
            }
        }
    });
    
    // 모두 읽기 버튼
    markAllReadButton?.addEventListener('click', markAllNotificationsAsRead);
    
    // 기존 인터벌 정리
    if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
    }
    
    // 페이지 로드 시 읽지 않은 알림 개수 확인
    updateNotificationCount();
    
    // 주기적으로 알림 개수 업데이트 (30초마다) - 로그인된 사용자만
    if (auth.isLoggedIn()) {
        notificationInterval = setInterval(() => {
            if (auth.isLoggedIn()) {
                updateNotificationCount();
            } else {
                // 로그아웃된 경우 인터벌 정리
                clearInterval(notificationInterval);
                notificationInterval = null;
            }
        }, 30000);
    }
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

// 포탈에서 알림 목록 로드
async function loadNotificationsInPortal(portalElement) {
    const notificationList = portalElement.querySelector('#notification-list');
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
            
            // Lucide 아이콘 초기화
            initializeLucideIcons();
            
            // 포탈 알림 아이템 클릭 이벤트
            notificationList.querySelectorAll('.notification-item').forEach(item => {
                item.addEventListener('click', () => {
                    const notificationId = item.dataset.notificationId;
                    const isRead = item.dataset.isRead === 'true';
                    
                    if (!isRead) {
                        markNotificationAsRead(notificationId);
                    }
                    
                    // 포탈 드롭다운 닫기
                    const portal = document.getElementById('notification-dropdown-portal');
                    if (portal) {
                        portal.classList.add('hidden');
                        portal.style.setProperty('display', 'none', 'important');
                    }
                });
            });
            
            // 포탈의 "모두 읽기" 버튼 이벤트
            const markAllReadBtn = portalElement.querySelector('#mark-all-read');
            if (markAllReadBtn) {
                markAllReadBtn.addEventListener('click', markAllNotificationsAsRead);
            }
            
        } else {
            notificationList.innerHTML = '<div class="p-4 text-center text-red-500">알림을 불러올 수 없습니다.</div>';
        }
        
    } catch (error) {
        console.error('포탈 알림 로드 실패:', error);
        notificationList.innerHTML = '<div class="p-4 text-center text-red-500">알림을 불러올 수 없습니다.</div>';
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
    
    return time.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' });
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