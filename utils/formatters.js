// Utility functions for formatting data

/**
 * Format volume numbers with Korean units
 * @param {number} volume - The volume to format
 * @returns {string} Formatted volume string
 */
function formatVolume(volume) {
    if (volume >= 100000000) {
        return `${(volume / 100000000).toFixed(1)}억`;
    }
    if (volume >= 10000) {
        return `${(volume / 10000).toFixed(0)}만`;
    }
    return volume.toLocaleString();
}

/**
 * Calculate time until a given date
 * @param {string|Date} date - The target date
 * @returns {string} Formatted time string
 */
function timeUntil(date) {
    const now = new Date();
    const future = new Date(date);
    const diff = future - now;
    
    if (diff <= 0) return "마감";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    
    if (days > 0) return `${days}일 남음`;
    if (hours > 0) return `${hours}시간 남음`;
    return `${minutes}분 남음`;
}

/**
 * Format date for display
 * @param {string|Date} date - The date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    // 한국 시간대로 강제 설정하여 관리자 페이지와 시간 일치
    return d.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul'
    }).replace(/\. /g, '.').replace(/\.$/, '').replace(/ /g, ' ');
}

/**
 * Format currency with Korean units
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
    return amount.toLocaleString() + ' GAM';
}

/**
 * Validate email format
 * @param {string} email - The email to validate
 * @returns {boolean} Whether the email is valid
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate password strength
 * @param {string} password - The password to validate
 * @returns {object} Validation result with isValid and message
 */
function validatePassword(password) {
    if (password.length < 6) {
        return { isValid: false, message: '비밀번호는 최소 6자 이상이어야 합니다.' };
    }
    if (password.length > 50) {
        return { isValid: false, message: '비밀번호는 50자를 초과할 수 없습니다.' };
    }
    return { isValid: true, message: '' };
}

/**
 * Sanitize HTML content
 * @param {string} content - The content to sanitize
 * @returns {string} Sanitized content
 */
function sanitizeHTML(content) {
    const temp = document.createElement('div');
    temp.textContent = content;
    return temp.innerHTML;
}

/**
 * Debounce function calls
 * @param {Function} func - The function to debounce
 * @param {number} wait - The delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Get category image URL
 * @param {string} category - The category name
 * @returns {string} Image URL
 */
function getCategoryImage(category) {
    const imageMap = {
        '정치': 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=500&h=300&fit=crop&auto=format',
        '스포츠': 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=500&h=300&fit=crop&auto=format',
        '경제': 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=500&h=300&fit=crop&auto=format',
        '코인': 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=500&h=300&fit=crop&auto=format',
        '테크': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=500&h=300&fit=crop&auto=format',
        '엔터': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&h=300&fit=crop&auto=format',
        '날씨': 'https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=500&h=300&fit=crop&auto=format',
        '해외': 'https://images.unsplash.com/photo-1569234849653-2605b769c84e?w=500&h=300&fit=crop&auto=format'
    };
    
    return imageMap[category] || 'https://images.unsplash.com/photo-1604594849809-dfedbc827105?w=500&h=300&fit=crop&auto=format';
}

module.exports = {
    formatVolume,
    timeUntil,
    formatDate,
    formatCurrency,
    isValidEmail,
    validatePassword,
    sanitizeHTML,
    debounce,
    getCategoryImage
};