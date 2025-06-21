/**
 * 입력 검증 및 정제 유틸리티
 * SQL injection, XSS, 기타 보안 취약점 방지
 */

class InputValidator {
    
    /**
     * 이메일 형식 검증
     */
    static validateEmail(email) {
        if (!email || typeof email !== 'string') {
            return { valid: false, message: '이메일이 필요합니다.' };
        }
        
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(email.trim())) {
            return { valid: false, message: '올바른 이메일 형식이 아닙니다.' };
        }
        
        if (email.length > 254) {
            return { valid: false, message: '이메일이 너무 깁니다.' };
        }
        
        return { valid: true, sanitized: email.trim().toLowerCase() };
    }
    
    /**
     * 사용자명 검증
     */
    static validateUsername(username) {
        if (!username || typeof username !== 'string') {
            return { valid: false, message: '사용자명이 필요합니다.' };
        }
        
        const trimmed = username.trim();
        
        if (trimmed.length < 2 || trimmed.length > 30) {
            return { valid: false, message: '사용자명은 2-30자 사이여야 합니다.' };
        }
        
        // 허용된 문자만 사용 (한글, 영문, 숫자, 일부 특수문자)
        const usernameRegex = /^[가-힣a-zA-Z0-9._-]+$/;
        if (!usernameRegex.test(trimmed)) {
            return { valid: false, message: '사용자명에 허용되지 않은 문자가 포함되어 있습니다.' };
        }
        
        // 금지된 단어 체크
        const forbiddenWords = ['admin', 'administrator', 'root', 'system', 'test', 'null', 'undefined'];
        if (forbiddenWords.some(word => trimmed.toLowerCase().includes(word))) {
            return { valid: false, message: '사용할 수 없는 사용자명입니다.' };
        }
        
        return { valid: true, sanitized: trimmed };
    }
    
    /**
     * 비밀번호 검증
     */
    static validatePassword(password) {
        if (!password || typeof password !== 'string') {
            return { valid: false, message: '비밀번호가 필요합니다.' };
        }
        
        if (password.length < 8) {
            return { valid: false, message: '비밀번호는 최소 8자 이상이어야 합니다.' };
        }
        
        if (password.length > 128) {
            return { valid: false, message: '비밀번호가 너무 깁니다.' };
        }
        
        // 기본적인 복잡성 검증
        const hasLower = /[a-z]/.test(password);
        const hasUpper = /[A-Z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        
        const strength = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
        
        if (strength < 2) {
            return { 
                valid: false, 
                message: '비밀번호는 대소문자, 숫자, 특수문자 중 최소 2가지를 포함해야 합니다.' 
            };
        }
        
        return { valid: true, sanitized: password };
    }
    
    /**
     * 텍스트 내용 검증 및 XSS 방지
     */
    static validateText(text, maxLength = 1000, allowEmpty = false) {
        if (!text && !allowEmpty) {
            return { valid: false, message: '내용이 필요합니다.' };
        }
        
        if (!text && allowEmpty) {
            return { valid: true, sanitized: '' };
        }
        
        if (typeof text !== 'string') {
            return { valid: false, message: '텍스트 형식이 아닙니다.' };
        }
        
        const trimmed = text.trim();
        
        if (trimmed.length > maxLength) {
            return { valid: false, message: `내용이 너무 깁니다. (최대 ${maxLength}자)` };
        }
        
        // XSS 방지를 위한 기본적인 HTML 태그 제거
        const sanitized = trimmed
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
        
        return { valid: true, sanitized };
    }
    
    /**
     * 숫자 검증
     */
    static validateNumber(value, min = null, max = null, isInteger = false) {
        if (value === null || value === undefined) {
            return { valid: false, message: '숫자 값이 필요합니다.' };
        }
        
        const num = Number(value);
        
        if (isNaN(num)) {
            return { valid: false, message: '올바른 숫자가 아닙니다.' };
        }
        
        if (isInteger && !Number.isInteger(num)) {
            return { valid: false, message: '정수여야 합니다.' };
        }
        
        if (min !== null && num < min) {
            return { valid: false, message: `${min} 이상이어야 합니다.` };
        }
        
        if (max !== null && num > max) {
            return { valid: false, message: `${max} 이하여야 합니다.` };
        }
        
        return { valid: true, sanitized: num };
    }
    
    /**
     * ID 검증 (양의 정수)
     */
    static validateId(id) {
        const result = this.validateNumber(id, 1, null, true);
        if (!result.valid) {
            return { valid: false, message: '올바른 ID가 아닙니다.' };
        }
        return result;
    }
    
    /**
     * 베팅 선택 검증 (Yes/No)
     */
    static validateChoice(choice) {
        if (!choice || typeof choice !== 'string') {
            return { valid: false, message: '베팅 선택이 필요합니다.' };
        }
        
        const normalized = choice.trim();
        
        if (!['Yes', 'No', 'yes', 'no'].includes(normalized)) {
            return { valid: false, message: '올바른 베팅 선택이 아닙니다. (Yes/No)' };
        }
        
        // 대문자로 정규화
        return { valid: true, sanitized: normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase() };
    }
    
    /**
     * 카테고리 검증
     */
    static validateCategory(category) {
        if (!category || typeof category !== 'string') {
            return { valid: false, message: '카테고리가 필요합니다.' };
        }
        
        const validCategories = ['정치', '스포츠', '테크', '코인', '연예', '기타'];
        const trimmed = category.trim();
        
        if (!validCategories.includes(trimmed)) {
            return { valid: false, message: '올바른 카테고리가 아닙니다.' };
        }
        
        return { valid: true, sanitized: trimmed };
    }
    
    /**
     * URL 검증
     */
    static validateUrl(url, allowEmpty = true) {
        if (!url && allowEmpty) {
            return { valid: true, sanitized: null };
        }
        
        if (!url) {
            return { valid: false, message: 'URL이 필요합니다.' };
        }
        
        try {
            const urlObj = new URL(url);
            
            // 허용된 프로토콜만
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                return { valid: false, message: 'HTTP 또는 HTTPS URL만 허용됩니다.' };
            }
            
            return { valid: true, sanitized: urlObj.toString() };
        } catch (error) {
            return { valid: false, message: '올바른 URL 형식이 아닙니다.' };
        }
    }
    
    /**
     * 날짜 검증
     */
    static validateDate(dateString) {
        if (!dateString) {
            return { valid: false, message: '날짜가 필요합니다.' };
        }
        
        const date = new Date(dateString);
        
        if (isNaN(date.getTime())) {
            return { valid: false, message: '올바른 날짜 형식이 아닙니다.' };
        }
        
        // 과거 날짜는 허용하지 않음 (이슈 마감일의 경우)
        if (date <= new Date()) {
            return { valid: false, message: '마감일은 현재 시간보다 이후여야 합니다.' };
        }
        
        return { valid: true, sanitized: date.toISOString() };
    }
    
    /**
     * 일괄 검증 헬퍼
     */
    static validateFields(data, rules) {
        const errors = {};
        const sanitized = {};
        
        for (const [field, rule] of Object.entries(rules)) {
            const value = data[field];
            let result;
            
            switch (rule.type) {
                case 'email':
                    result = this.validateEmail(value);
                    break;
                case 'username':
                    result = this.validateUsername(value);
                    break;
                case 'password':
                    result = this.validatePassword(value);
                    break;
                case 'text':
                    result = this.validateText(value, rule.maxLength, rule.allowEmpty);
                    break;
                case 'number':
                    result = this.validateNumber(value, rule.min, rule.max, rule.isInteger);
                    break;
                case 'id':
                    result = this.validateId(value);
                    break;
                case 'choice':
                    result = this.validateChoice(value);
                    break;
                case 'category':
                    result = this.validateCategory(value);
                    break;
                case 'url':
                    result = this.validateUrl(value, rule.allowEmpty);
                    break;
                case 'date':
                    result = this.validateDate(value);
                    break;
                default:
                    result = { valid: false, message: `알 수 없는 검증 타입: ${rule.type}` };
            }
            
            if (!result.valid) {
                errors[field] = result.message;
            } else {
                sanitized[field] = result.sanitized;
            }
        }
        
        return {
            valid: Object.keys(errors).length === 0,
            errors,
            sanitized
        };
    }
}

module.exports = InputValidator;