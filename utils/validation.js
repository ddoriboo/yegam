const { createError } = require('../middleware/errorHandler');

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validatePassword = (password) => {
    return password && password.length >= 6;
};

const validateUsername = (username) => {
    const usernameRegex = /^[a-zA-Z0-9가-힣_]{2,20}$/;
    return usernameRegex.test(username);
};

const validateAmount = (amount) => {
    return Number.isInteger(amount) && amount > 0;
};

const validateCategory = (category) => {
    const validCategories = ['정치', '스포츠', '경제', '코인', '테크', '엔터', '날씨', '해외'];
    return validCategories.includes(category);
};

const validateChoice = (choice) => {
    return choice === 'yes' || choice === 'no';
};

const validateDate = (dateString) => {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && date > new Date();
};

const validateSignupData = (data) => {
    const { username, email, password } = data;
    
    if (!username || !email || !password) {
        throw createError(400, '모든 필드를 입력해주세요.');
    }
    
    if (!validateUsername(username)) {
        throw createError(400, '사용자명은 2-20자의 영문, 숫자, 한글, 밑줄만 사용 가능합니다.');
    }
    
    if (!validateEmail(email)) {
        throw createError(400, '유효한 이메일 주소를 입력해주세요.');
    }
    
    if (!validatePassword(password)) {
        throw createError(400, '비밀번호는 최소 6자 이상이어야 합니다.');
    }
    
    return true;
};

const validateBetData = (data) => {
    const { issueId, choice, amount } = data;
    
    if (!issueId || !choice || !amount) {
        throw createError(400, '모든 필드를 입력해주세요.');
    }
    
    if (!validateChoice(choice)) {
        throw createError(400, '올바른 선택을 해주세요 (yes 또는 no).');
    }
    
    if (!validateAmount(amount)) {
        throw createError(400, '베팅 금액은 양의 정수여야 합니다.');
    }
    
    return true;
};

const validateIssueData = (data) => {
    const { title, category, endDate } = data;
    
    if (!title || !category || !endDate) {
        throw createError(400, '제목, 카테고리, 마감일은 필수입니다.');
    }
    
    if (title.length < 5 || title.length > 200) {
        throw createError(400, '제목은 5-200자 사이여야 합니다.');
    }
    
    if (!validateCategory(category)) {
        throw createError(400, '유효한 카테고리를 선택해주세요.');
    }
    
    if (!validateDate(endDate)) {
        throw createError(400, '마감일은 미래 날짜여야 합니다.');
    }
    
    return true;
};

module.exports = {
    validateEmail,
    validatePassword,
    validateUsername,
    validateAmount,
    validateCategory,
    validateChoice,
    validateDate,
    validateSignupData,
    validateBetData,
    validateIssueData
};