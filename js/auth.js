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
    }
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
