const USER_KEY = 'poli-view-user';
const USERS_KEY = 'poli-view-users';

async function initUsers() {
    if (!localStorage.getItem(USERS_KEY)) {
        try {
            const response = await fetch('data/users.json');
            const users = await response.json();
            localStorage.setItem(USERS_KEY, JSON.stringify(users));
        } catch (error) {
            localStorage.setItem(USERS_KEY, JSON.stringify([]));
        }
    }
}

function getUsers() {
    const users = localStorage.getItem(USERS_KEY);
    return users ? JSON.parse(users) : [];
}

function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export async function login(email, password) {
    await initUsers();
    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        sessionStorage.setItem(USER_KEY, JSON.stringify(user));
        return true;
    }
    return false;
}

export async function signup(username, email, password) {
    try {
        await initUsers();
        const users = getUsers();
        
        if (users.find(u => u.email === email)) {
            return { success: false, message: "이미 존재하는 이메일입니다." };
        }
        
        if (users.find(u => u.username === username)) {
            return { success: false, message: "이미 존재하는 사용자명입니다." };
        }
        
        const newUser = {
            id: 'user_' + Date.now(),
            username,
            email,
            password,
            coins: 10000
        };
        
        users.push(newUser);
        saveUsers(users);
        
        sessionStorage.setItem(USER_KEY, JSON.stringify(newUser));
        return { success: true };
    } catch (error) {
        console.error('Signup error:', error);
        return { success: false, message: "회원가입 중 오류가 발생했습니다." };
    }
}

export function logout() {
    sessionStorage.removeItem(USER_KEY);
}

export function isLoggedIn() {
    return sessionStorage.getItem(USER_KEY) !== null;
}

export function getCurrentUser() {
    const user = sessionStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
}

export function updateUserInSession(updatedUser) {
    if(isLoggedIn()){
        sessionStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
    }
}
