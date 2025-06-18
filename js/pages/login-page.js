import * as auth from '../auth.js';
import { MESSAGES } from '../../config/constants.js';

export function setupLoginPage() {
    setupTabSwitching();
    setupLoginForm();
    setupSignupForm();
}

function setupTabSwitching() {
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

function setupLoginForm() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = e.target.email.value;
        const password = e.target.password.value;
        const errorEl = document.getElementById('login-error');

        try {
            const success = await auth.login(email, password);
            if (success) {
                window.location.href = 'index.html';
            } else {
                showError(errorEl, MESSAGES.ERROR.INVALID_CREDENTIALS);
            }
        } catch (error) {
            console.error('Login error:', error);
            showError(errorEl, '로그인 중 오류가 발생했습니다.');
        }
    });
}

function setupSignupForm() {
    const signupForm = document.getElementById('signup-form');
    if (!signupForm) return;

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = e.target.username.value;
        const email = e.target.email.value;
        const password = e.target.password.value;
        const confirmPassword = e.target.confirmPassword.value;
        const errorEl = document.getElementById('signup-error');

        // Client-side validation
        if (password !== confirmPassword) {
            showError(errorEl, MESSAGES.ERROR.PASSWORD_MISMATCH);
            return;
        }

        try {
            if (!auth.signup) {
                throw new Error('auth.signup function not found');
            }
            
            const result = await auth.signup(username, email, password);
            
            if (result.success) {
                alert(MESSAGES.SUCCESS.SIGNUP_COMPLETE);
                window.location.href = 'index.html';
            } else {
                showError(errorEl, result.message);
            }
        } catch (error) {
            console.error('Signup error:', error);
            showError(errorEl, `회원가입 중 오류가 발생했습니다: ${error.message}`);
        }
    });
}

function showError(errorElement, message) {
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
    }
}