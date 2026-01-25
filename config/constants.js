// Application constants
const APP_CONFIG = {
    DEFAULT_COINS: 10000,
    JWT_EXPIRY: '7d',
    ADMIN_PASSWORD: 'admin123', // TODO: Move to environment variables
    DEFAULT_YES_PRICE: 50
};

// Storage keys
const STORAGE_KEYS = {
    ISSUES: 'poli-view-issues',
    BETS_PREFIX: 'poli-view-bets-',
    ADMIN_AUTH: 'admin-auth',
    USER_SESSION: 'user-session'
};

// Category configurations
const CATEGORIES = {
    ALL: 'all',
    POLITICS: '정치',
    SPORTS: '스포츠',
    ECONOMY: '경제',
    CRYPTO: '코인',
    TECH: '테크',
    ENTERTAINMENT: '엔터',
    WEATHER: '날씨',
    INTERNATIONAL: '해외'
};

const CATEGORY_NAMES = {
    [CATEGORIES.ALL]: '전체',
    [CATEGORIES.POLITICS]: '정치',
    [CATEGORIES.SPORTS]: '스포츠',
    [CATEGORIES.ECONOMY]: '경제',
    [CATEGORIES.CRYPTO]: '코인',
    [CATEGORIES.TECH]: '테크',
    [CATEGORIES.ENTERTAINMENT]: '엔터',
    [CATEGORIES.WEATHER]: '날씨',
    [CATEGORIES.INTERNATIONAL]: '해외'
};

// Polymarket Style - Neutral gray for all categories
const CATEGORY_COLORS = {
    [CATEGORIES.POLITICS]: 'background: #F3F4F6; color: #4B5563;',
    [CATEGORIES.SPORTS]: 'background: #F3F4F6; color: #4B5563;',
    [CATEGORIES.ECONOMY]: 'background: #F3F4F6; color: #4B5563;',
    [CATEGORIES.CRYPTO]: 'background: #F3F4F6; color: #4B5563;',
    [CATEGORIES.TECH]: 'background: #F3F4F6; color: #4B5563;',
    [CATEGORIES.ENTERTAINMENT]: 'background: #F3F4F6; color: #4B5563;',
    [CATEGORIES.WEATHER]: 'background: #F3F4F6; color: #4B5563;',
    [CATEGORIES.INTERNATIONAL]: 'background: #F3F4F6; color: #4B5563;'
};

// API endpoints
const API_ENDPOINTS = {
    AUTH: {
        LOGIN: '/api/auth/login',
        SIGNUP: '/api/auth/signup',
        VERIFY: '/api/auth/verify'
    },
    ISSUES: {
        BASE: '/api/issues',
        BY_ID: (id) => `/api/issues/${id}`
    },
    BETS: {
        BASE: '/api/bets',
        MY_BETS: '/api/bets/my-bets',
        STATS: (issueId) => `/api/bets/issue/${issueId}/stats`
    }
};

// UI Messages
const MESSAGES = {
    ERROR: {
        LOGIN_REQUIRED: '예측을 하려면 로그인이 필요합니다.',
        INVALID_AMOUNT: '예측 금액은 0보다 큰 숫자여야 합니다.',
        INSUFFICIENT_COINS: '보유 GAM이 부족합니다.',
        BETTING_FAILED: '예측 실패',
        ALREADY_BETTED: '이미 베팅한 이슈',
        INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다.',
        PASSWORD_MISMATCH: '비밀번호가 일치하지 않습니다.',
        ADMIN_AUTH_FAILED: '잘못된 관리자 암호입니다.'
    },
    SUCCESS: {
        BET_PLACED: '예측이 성공적으로 완료되었습니다.',
        SIGNUP_COMPLETE: '회원가입이 완료되었습니다!',
        ISSUE_CREATED: '이슈가 성공적으로 생성되었습니다!',
        ISSUE_DELETED: '이슈가 삭제되었습니다.',
        ISSUE_UPDATED: '이슈가 수정되었습니다.'
    },
    CONFIRM: {
        DELETE_ISSUE: '정말로 이 이슈를 삭제하시겠습니까?'
    }
};

export {
    APP_CONFIG,
    STORAGE_KEYS,
    CATEGORIES,
    CATEGORY_NAMES,
    CATEGORY_COLORS,
    API_ENDPOINTS,
    MESSAGES
};