const USER_KEY = 'yegame-user';
const TOKEN_KEY = 'yegame-token';

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
            sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
            sessionStorage.setItem(TOKEN_KEY, data.token);
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
            sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
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
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
    return sessionStorage.getItem(USER_KEY) !== null && sessionStorage.getItem(TOKEN_KEY) !== null;
}

export function getCurrentUser() {
    const user = sessionStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
}

export function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
}

export function updateCurrentUser(updatedUser) {
    if (isLoggedIn()) {
        sessionStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
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
                    
                    // 코인 정보 업데이트
                    const userCoinsEl = document.getElementById('user-coins');
                    if (userCoinsEl) userCoinsEl.textContent = `${user.coins?.toLocaleString() || '0'} 감`;
                    
                    // 티어 정보 업데이트 (GAM 정보가 있다면)
                    const userGam = user.gam || 0;
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
