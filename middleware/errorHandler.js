const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(400).json({
            success: false,
            message: '데이터 제약 조건 위반입니다.',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }

    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: '유효하지 않은 토큰입니다.'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: '토큰이 만료되었습니다.'
        });
    }

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: '입력 데이터가 유효하지 않습니다.',
            details: err.details
        });
    }

    res.status(err.status || 500).json({
        success: false,
        message: err.message || '서버 내부 오류가 발생했습니다.',
        error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
};

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const createError = (status, message, details = null) => {
    const error = new Error(message);
    error.status = status;
    error.details = details;
    return error;
};

module.exports = {
    errorHandler,
    asyncHandler,
    createError
};