const InputValidator = require('../utils/input-validation');

/**
 * 요청 유효성 검사 미들웨어
 */

/**
 * 베팅 요청 검증 미들웨어
 */
const validateBetRequest = (req, res, next) => {
    const validation = InputValidator.validateFields(req.body, {
        issueId: { type: 'id' },
        choice: { type: 'choice' },
        amount: { type: 'number', min: 100, max: 1000000, isInteger: true }
    });
    
    if (!validation.valid) {
        const firstError = Object.values(validation.errors)[0];
        return res.status(400).json({
            success: false,
            message: firstError,
            errors: validation.errors
        });
    }
    
    req.validatedData = validation.sanitized;
    next();
};

/**
 * 댓글 작성 검증 미들웨어
 */
const validateCommentRequest = (req, res, next) => {
    const rules = {
        issueId: { type: 'id' },
        content: { type: 'text', maxLength: 1000, allowEmpty: false }
    };
    
    // 대댓글인 경우 parentId 검증
    if (req.body.parentId) {
        rules.parentId = { type: 'id' };
    }
    
    const validation = InputValidator.validateFields(req.body, rules);
    
    if (!validation.valid) {
        const firstError = Object.values(validation.errors)[0];
        return res.status(400).json({
            success: false,
            message: firstError,
            errors: validation.errors
        });
    }
    
    req.validatedData = validation.sanitized;
    next();
};

/**
 * 이슈 생성 검증 미들웨어
 */
const validateIssueRequest = (req, res, next) => {
    const validation = InputValidator.validateFields(req.body, {
        title: { type: 'text', maxLength: 200, allowEmpty: false },
        category: { type: 'category' },
        description: { type: 'text', maxLength: 2000, allowEmpty: true },
        endDate: { type: 'date' },
        imageUrl: { type: 'url', allowEmpty: true }
    });
    
    if (!validation.valid) {
        const firstError = Object.values(validation.errors)[0];
        return res.status(400).json({
            success: false,
            message: firstError,
            errors: validation.errors
        });
    }
    
    req.validatedData = validation.sanitized;
    next();
};

/**
 * ID 파라미터 검증 미들웨어
 */
const validateIdParam = (paramName = 'id') => {
    return (req, res, next) => {
        const value = req.params[paramName];
        const validation = InputValidator.validateId(value);
        
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }
        
        req.validatedParams = req.validatedParams || {};
        req.validatedParams[paramName] = validation.sanitized;
        next();
    };
};

/**
 * 페이지네이션 파라미터 검증 미들웨어
 */
const validatePagination = (req, res, next) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    
    const pageValidation = InputValidator.validateNumber(page, 1, 1000, true);
    const limitValidation = InputValidator.validateNumber(limit, 1, 100, true);
    
    if (!pageValidation.valid) {
        return res.status(400).json({
            success: false,
            message: '올바른 페이지 번호가 아닙니다.'
        });
    }
    
    if (!limitValidation.valid) {
        return res.status(400).json({
            success: false,
            message: '올바른 페이지 크기가 아닙니다.'
        });
    }
    
    req.pagination = {
        page: pageValidation.sanitized,
        limit: limitValidation.sanitized,
        offset: (pageValidation.sanitized - 1) * limitValidation.sanitized
    };
    
    next();
};

/**
 * 검색 쿼리 검증 미들웨어
 */
const validateSearch = (req, res, next) => {
    const { query, category, status } = req.query;
    
    const validatedQuery = {};
    
    if (query) {
        const queryValidation = InputValidator.validateText(query, 100, true);
        if (!queryValidation.valid) {
            return res.status(400).json({
                success: false,
                message: '검색어가 올바르지 않습니다.'
            });
        }
        validatedQuery.query = queryValidation.sanitized;
    }
    
    if (category) {
        const categoryValidation = InputValidator.validateCategory(category);
        if (!categoryValidation.valid) {
            return res.status(400).json({
                success: false,
                message: categoryValidation.message
            });
        }
        validatedQuery.category = categoryValidation.sanitized;
    }
    
    if (status) {
        const validStatuses = ['active', 'closed', 'settled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: '올바른 상태가 아닙니다.'
            });
        }
        validatedQuery.status = status;
    }
    
    req.validatedQuery = validatedQuery;
    next();
};

/**
 * 일반적인 텍스트 입력 검증 헬퍼
 */
const validateTextInput = (fieldName, maxLength = 1000, allowEmpty = false) => {
    return (req, res, next) => {
        const value = req.body[fieldName];
        const validation = InputValidator.validateText(value, maxLength, allowEmpty);
        
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }
        
        req.body[fieldName] = validation.sanitized;
        next();
    };
};

module.exports = {
    validateBetRequest,
    validateCommentRequest,
    validateIssueRequest,
    validateIdParam,
    validatePagination,
    validateSearch,
    validateTextInput,
    InputValidator
};