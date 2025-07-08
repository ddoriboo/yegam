import * as auth from '../auth.js';
import { MESSAGES } from '../../config/constants.js';

export function setupLoginPage() {
    setupTabSwitching();
    setupLoginForm();
    setupSignupForm();
    setupInputFields();
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
            const result = await auth.login(email, password);
            if (result.success) {
                window.location.href = 'index.html';
            } else {
                showError(errorEl, result.message || MESSAGES.ERROR.INVALID_CREDENTIALS);
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

function setupInputFields() {
    // 로그인 필드 초기화 및 개선된 UX
    const loginEmailField = document.getElementById('login-email');
    const loginPasswordField = document.getElementById('login-password');
    
    // 입력 필드 초기화 및 클릭 시 즉시 입력 가능하도록 설정
    if (loginEmailField) {
        // 페이지 로드 시 필드가 비어있는지 확인하고 포커스 시 선택
        loginEmailField.addEventListener('focus', function() {
            this.select(); // 기존 내용이 있으면 모두 선택하여 덮어쓸 수 있게 함
        });
        
        // 클릭 시에도 같은 동작
        loginEmailField.addEventListener('click', function() {
            this.select();
        });
        
        // 입력 시작하면 placeholder 효과 개선
        loginEmailField.addEventListener('input', function() {
            if (this.value.length > 0) {
                this.classList.add('has-value');
            } else {
                this.classList.remove('has-value');
            }
        });
    }
    
    if (loginPasswordField) {
        loginPasswordField.addEventListener('focus', function() {
            this.select();
        });
        
        loginPasswordField.addEventListener('click', function() {
            this.select();
        });
        
        loginPasswordField.addEventListener('input', function() {
            if (this.value.length > 0) {
                this.classList.add('has-value');
            } else {
                this.classList.remove('has-value');
            }
        });
    }
    
    // 회원가입 필드들도 같은 방식으로 처리
    const signupFields = [
        'signup-username',
        'signup-email', 
        'signup-password',
        'signup-confirm-password'
    ];
    
    signupFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('focus', function() {
                this.select();
            });
            
            field.addEventListener('click', function() {
                this.select();
            });
            
            field.addEventListener('input', function() {
                if (this.value.length > 0) {
                    this.classList.add('has-value');
                } else {
                    this.classList.remove('has-value');
                }
            });
        }
    });
}