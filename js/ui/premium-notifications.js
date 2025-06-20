// 프리미엄 알림 시스템
class PremiumNotifications {
    constructor() {
        this.toasts = new Set();
        this.init();
    }
    
    init() {
        // 전역 alert, confirm 함수를 대체
        if (typeof window !== 'undefined') {
            window.showSuccess = (message, title = '성공') => this.success(message, title);
            window.showError = (message, title = '오류') => this.error(message, title);
            window.showInfo = (message, title = '알림') => this.info(message, title);
            window.showWarning = (message, title = '경고') => this.warning(message, title);
            window.showConfirm = (message, title = '확인') => this.confirm(message, title);
        }
    }
    
    // 성공 알림
    success(message, title = '성공') {
        return this.createToast({
            type: 'success',
            title,
            message,
            icon: 'check-circle',
            duration: 4000
        });
    }
    
    // 오류 알림
    error(message, title = '오류') {
        return this.createToast({
            type: 'error',
            title,
            message,
            icon: 'x-circle',
            duration: 6000
        });
    }
    
    // 정보 알림
    info(message, title = '알림') {
        return this.createToast({
            type: 'info',
            title,
            message,
            icon: 'info',
            duration: 4000
        });
    }
    
    // 경고 알림
    warning(message, title = '경고') {
        return this.createToast({
            type: 'warning',
            title,
            message,
            icon: 'alert-triangle',
            duration: 5000
        });
    }
    
    // 확인 다이얼로그
    confirm(message, title = '확인') {
        return new Promise((resolve) => {
            this.createConfirmModal(message, title, resolve);
        });
    }
    
    // 토스트 알림 생성
    createToast({ type, title, message, icon, duration }) {
        const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = 'premium-toast';
        
        toast.innerHTML = `
            <div class="toast-content ${type}">
                <div class="toast-header">
                    <div class="toast-title ${type}">
                        <i data-lucide="${icon}" class="w-5 h-5"></i>
                        ${title}
                    </div>
                    <button class="toast-close" onclick="window.premiumNotifications.closeToast('${toastId}')">
                        <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                </div>
                <div class="toast-message">
                    ${message}
                </div>
            </div>
        `;
        
        document.body.appendChild(toast);
        this.toasts.add(toastId);
        
        // 아이콘 초기화
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
        // 자동 닫기
        if (duration > 0) {
            setTimeout(() => {
                this.closeToast(toastId);
            }, duration);
        }
        
        return toastId;
    }
    
    // 토스트 닫기
    closeToast(toastId) {
        const toast = document.getElementById(toastId);
        if (toast && this.toasts.has(toastId)) {
            toast.classList.add('hide');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                this.toasts.delete(toastId);
            }, 300);
        }
    }
    
    // 확인 모달 생성
    createConfirmModal(message, title, resolve) {
        const modalId = 'confirm-modal-' + Date.now();
        
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'confirm-modal-overlay';
        
        modal.innerHTML = `
            <div class="confirm-modal-backdrop"></div>
            <div class="confirm-modal-container">
                <div class="confirm-modal-content">
                    <div class="confirm-modal-header">
                        <div class="confirm-modal-title">
                            <i data-lucide="help-circle" class="w-6 h-6 text-blue-500"></i>
                            <h3>${title}</h3>
                        </div>
                    </div>
                    
                    <div class="confirm-modal-body">
                        <p>${message}</p>
                    </div>
                    
                    <div class="confirm-modal-actions">
                        <button class="confirm-cancel-btn" onclick="window.premiumNotifications.resolveConfirm('${modalId}', false)">
                            <i data-lucide="x" class="w-4 h-4"></i>
                            취소
                        </button>
                        <button class="confirm-ok-btn" onclick="window.premiumNotifications.resolveConfirm('${modalId}', true)">
                            <i data-lucide="check" class="w-4 h-4"></i>
                            확인
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 아이콘 초기화
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
        // 애니메이션
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
        
        // ESC 키 지원
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.resolveConfirm(modalId, false);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // 백드롭 클릭
        modal.querySelector('.confirm-modal-backdrop').addEventListener('click', () => {
            this.resolveConfirm(modalId, false);
        });
        
        // resolve 함수 저장
        this.confirmResolvers = this.confirmResolvers || new Map();
        this.confirmResolvers.set(modalId, resolve);
    }
    
    // 확인 모달 결과 처리
    resolveConfirm(modalId, result) {
        const modal = document.getElementById(modalId);
        const resolve = this.confirmResolvers?.get(modalId);
        
        if (modal) {
            modal.classList.add('hide');
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }, 300);
        }
        
        if (resolve) {
            resolve(result);
            this.confirmResolvers?.delete(modalId);
        }
    }
    
    // 모든 토스트 닫기
    closeAll() {
        this.toasts.forEach(toastId => {
            this.closeToast(toastId);
        });
    }
}

// 전역 인스턴스 생성
window.premiumNotifications = new PremiumNotifications();

// 기존 알림 함수들을 프리미엄 버전으로 대체
window.showNotification = (message, type = 'info') => {
    switch (type) {
        case 'success':
            return window.showSuccess(message);
        case 'error':
            return window.showError(message);
        case 'warning':
            return window.showWarning(message);
        default:
            return window.showInfo(message);
    }
};

// alert, confirm 대체 (옵션)
window.premiumAlert = window.showInfo;
window.premiumConfirm = window.showConfirm;