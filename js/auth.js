const USER_KEY = 'yegame-user';
const TOKEN_KEY = 'yegame-token';

// localStorage를 사용하도록 변경 (app.js와 통일)
const storage = localStorage;

export async function login(email, password) {
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            storage.setItem(USER_KEY, JSON.stringify(data.user));
            storage.setItem(TOKEN_KEY, data.token);
            
            // 일일 출석 보상 알림 표시
            if (data.dailyReward) {
                showDailyRewardNotification(data.dailyReward);
            }
            
            return { success: true, user: data.user, message: data.message };
        } else {
            return { success: false, message: data.message };
        }
    } catch (error) {
        console.error('로그인 오류:', error);
        return { success: false, message: '서버 오류가 발생했습니다.' };
    }
}

export async function signup(username, email, password) {
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
            return { success: true, message: data.message, user: data.user };
        } else {
            return { success: false, message: data.message };
        }
    } catch (error) {
        console.error('회원가입 오류:', error);
        return { success: false, message: '서버 오류가 발생했습니다.' };
    }
}

export async function verifyToken() {
    const token = getToken();
    if (!token) return false;
    
    try {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            storage.setItem(USER_KEY, JSON.stringify(data.user));
            return true;
        } else {
            logout();
            return false;
        }
    } catch (error) {
        console.error('토큰 검증 오류:', error);
        logout();
        return false;
    }
}

export function logout() {
    storage.removeItem(USER_KEY);
    storage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
    return storage.getItem(USER_KEY) !== null && storage.getItem(TOKEN_KEY) !== null;
}

export function getCurrentUser() {
    const user = storage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
}

export function getToken() {
    return storage.getItem(TOKEN_KEY);
}

export function updateCurrentUser(updatedUser) {
    if (isLoggedIn()) {
        storage.setItem(USER_KEY, JSON.stringify(updatedUser));
        // localStorage의 token도 함께 관리
        localStorage.setItem('yegame-token', getToken());
    }
}

// betting-handler.js에서 사용하는 함수
export function updateUserInSession(updatedUser) {
    updateCurrentUser(updatedUser);
}

export async function sendVerificationEmail(email) {
    try {
        const response = await fetch('/api/auth/send-verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('이메일 발송 오류:', error);
        return { success: false, message: '서버 오류가 발생했습니다.' };
    }
}

// 사용자 인증 상태 확인 및 UI 업데이트
// 일일 출석 보상 알림 표시 함수
function showDailyRewardNotification(rewardInfo) {
    // 커스텀 알림 모달 생성
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-md mx-4 text-center animate-bounce">
            <div class="text-6xl mb-4">🎁</div>
            <h3 class="text-xl font-bold text-gray-900 mb-2">출석 완료!</h3>
            <p class="text-gray-600 mb-4">${rewardInfo.message}</p>
            <div class="bg-gradient-to-r from-yellow-100 to-orange-100 rounded-lg p-4 mb-4">
                <p class="text-2xl font-bold text-orange-800 mb-1">+${rewardInfo.amount} GAM</p>
                <p class="text-sm text-orange-600 mb-2">연속 ${rewardInfo.consecutiveDays}일 출석</p>
                ${rewardInfo.consecutiveDays >= 5 ? '<p class="text-xs text-red-600 font-bold">🔥 연속 출석 마스터!</p>' : 
                  rewardInfo.consecutiveDays >= 3 ? '<p class="text-xs text-blue-600 font-bold">⭐ 연속 출석 보너스!</p>' : ''}
            </div>
            ${rewardInfo.thankMessage ? `
                <div class="bg-blue-50 rounded-lg p-3 mb-4">
                    <p class="text-sm text-blue-700 font-medium">${rewardInfo.thankMessage}</p>
                </div>
            ` : ''}
            <button onclick="this.closest('.fixed').remove()" 
                    class="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all transform hover:scale-105 font-bold">
                고마워요! 😊
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 5초 후 자동 닫기 (감사 메시지를 읽을 시간 제공)
    setTimeout(() => {
        if (modal.parentNode) {
            modal.remove();
        }
    }, 5000);
}

export async function checkAuth() {
    try {
        const { addTierStyles, updateUserTierDisplay } = await import('./utils/tier-utils.js');
        
        // 티어 스타일 추가
        addTierStyles();
        
        const userInfo = document.getElementById('user-info');
        const authButtons = document.getElementById('auth-buttons');
        
        if (isLoggedIn()) {
            const isValid = await verifyToken();
            if (isValid) {
                const user = getCurrentUser();
                if (userInfo) {
                    userInfo.classList.remove('hidden');
                    userInfo.classList.add('flex');
                    
                    // 사용자 이름 업데이트
                    const userNameEl = document.getElementById('user-name');
                    if (userNameEl) userNameEl.textContent = user.username;
                    
                    // GAM 정보 업데이트 (서버와 동일한 기본값 사용)
                    const userCoinsEl = document.getElementById('user-coins');
                    if (userCoinsEl) {
                        const gamBalance = user.gam_balance ?? 10000;
                        userCoinsEl.textContent = `${gamBalance.toLocaleString()} GAM`;
                    }
                    
                    // 티어 정보 업데이트 (서버와 동일한 기본값 사용)
                    const userGam = user.gam_balance ?? 10000;
                    updateUserTierDisplay(userGam, 'user-tier-display');
                }
                
                if (authButtons) {
                    authButtons.classList.add('hidden');
                }
                
                // 로그아웃 버튼 이벤트
                const logoutBtn = document.getElementById('logout-btn');
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', () => {
                        logout();
                        window.location.reload();
                    });
                }
                
                return true;
            }
        }
        
        // 로그인되지 않은 상태
        if (userInfo) {
            userInfo.classList.add('hidden');
            userInfo.classList.remove('flex');
        }
        if (authButtons) {
            authButtons.classList.remove('hidden');
        }
        
        return false;
    } catch (error) {
        console.error('인증 상태 확인 오류:', error);
        return false;
    }
}
