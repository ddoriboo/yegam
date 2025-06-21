const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, run, get } = require('../database/database');
const InputValidator = require('../utils/input-validation');

const router = express.Router();

// JWT_SECRET 보안 강화 - 프로덕션에서 환경변수 필수
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET 환경변수가 필수입니다.');
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ 프로덕션 환경에서는 JWT_SECRET 설정 없이 실행할 수 없습니다.');
        process.exit(1);
    } else {
        console.warn('⚠️ 개발 환경: JWT_SECRET이 설정되지 않았습니다. 임시 키를 생성합니다.');
        // 개발 환경에서만 임시 키 생성
        require('crypto').randomBytes(32).toString('hex');
    }
}

// Rate limiting을 위한 간단한 메모리 저장소
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15분
const MAX_ATTEMPTS = 5;

// Rate limiting 함수
function checkRateLimit(identifier) {
    const now = Date.now();
    const attemptData = loginAttempts.get(identifier) || { count: 0, lastAttempt: now };
    
    // 시간 윈도우가 지났으면 카운트 리셋
    if (now - attemptData.lastAttempt > RATE_LIMIT_WINDOW) {
        attemptData.count = 0;
    }
    
    if (attemptData.count >= MAX_ATTEMPTS) {
        const timeLeft = Math.ceil((RATE_LIMIT_WINDOW - (now - attemptData.lastAttempt)) / 1000 / 60);
        return { blocked: true, timeLeft };
    }
    
    return { blocked: false };
}

function recordFailedAttempt(identifier) {
    const now = Date.now();
    const attemptData = loginAttempts.get(identifier) || { count: 0, lastAttempt: now };
    
    if (now - attemptData.lastAttempt > RATE_LIMIT_WINDOW) {
        attemptData.count = 1;
    } else {
        attemptData.count++;
    }
    
    attemptData.lastAttempt = now;
    loginAttempts.set(identifier, attemptData);
}

function clearFailedAttempts(identifier) {
    loginAttempts.delete(identifier);
}

// 회원가입
router.post('/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // 입력값 검증
        const validation = InputValidator.validateFields(req.body, {
            username: { type: 'username' },
            email: { type: 'email' },
            password: { type: 'password' }
        });
        
        if (!validation.valid) {
            const firstError = Object.values(validation.errors)[0];
            return res.status(400).json({ 
                success: false, 
                message: firstError,
                errors: validation.errors
            });
        }
        
        const { username: validUsername, email: validEmail, password: validPassword } = validation.sanitized;
        
        try {
            // 중복 사용자 확인
            const existingUser = await get('SELECT id FROM users WHERE email = $1 OR username = $2', [validEmail, validUsername]);
            
            if (existingUser) {
                return res.status(400).json({ 
                    success: false, 
                    message: '이미 존재하는 이메일 또는 사용자명입니다.' 
                });
            }
            
            // 비밀번호 암호화
            const hashedPassword = await bcrypt.hash(validPassword, 12);
            
            // 사용자 생성
            const result = await run('INSERT INTO users (username, email, password_hash, coins, gam_balance) VALUES ($1, $2, $3, $4, $5)', 
                [validUsername, validEmail, hashedPassword, 10000, 10000]);
            
            const userId = result.lastID || result.rows[0]?.id;
            
            // JWT 토큰 생성
            const token = jwt.sign(
                { id: userId, username: validUsername, email: validEmail }, 
                JWT_SECRET, 
                { expiresIn: '7d' }
            );
            
            res.json({
                success: true,
                token,
                user: {
                    id: userId,
                    username: validUsername,
                    email: validEmail,
                    coins: 10000,
                    gam_balance: 10000
                }
            });
        } catch (error) {
            console.error('회원가입 오류:', error);
            return res.status(500).json({ 
                success: false, 
                message: '회원가입 중 오류가 발생했습니다.' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '서버 오류가 발생했습니다.' 
        });
    }
});

// 로그인
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 입력값 검증
        const validation = InputValidator.validateFields(req.body, {
            email: { type: 'email' },
            password: { type: 'text', maxLength: 128, allowEmpty: false }
        });
        
        if (!validation.valid) {
            const firstError = Object.values(validation.errors)[0];
            return res.status(400).json({ 
                success: false, 
                message: firstError
            });
        }
        
        const { email: validEmail } = validation.sanitized;
        const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
        const identifier = `${validEmail}_${clientIp}`;
        
        // Rate limiting 체크
        const rateLimitCheck = checkRateLimit(identifier);
        if (rateLimitCheck.blocked) {
            return res.status(429).json({
                success: false,
                message: `로그인 시도가 너무 많습니다. ${rateLimitCheck.timeLeft}분 후에 다시 시도해주세요.`
            });
        }
        
        const user = await get('SELECT * FROM users WHERE email = $1', [validEmail]);
        
        if (!user) {
            recordFailedAttempt(identifier);
            return res.status(400).json({ 
                success: false, 
                message: '이메일 또는 비밀번호가 올바르지 않습니다.' 
            });
        }
        
        // 비밀번호 확인
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            recordFailedAttempt(identifier);
            return res.status(400).json({ 
                success: false, 
                message: '이메일 또는 비밀번호가 올바르지 않습니다.' 
            });
        }
        
        // 로그인 성공 시 실패 카운트 초기화
        clearFailedAttempts(identifier);
        
        // JWT 토큰 생성
        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email }, 
            JWT_SECRET, 
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                coins: user.coins ?? 10000
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '서버 오류가 발생했습니다.' 
        });
    }
});

// 토큰 검증
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: '토큰이 없습니다.' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const user = await get('SELECT id, username, email, coins FROM users WHERE id = $1', [decoded.id]);
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: '유효하지 않은 토큰입니다.' 
            });
        }
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                coins: user.coins ?? 10000
            }
        });
    } catch (error) {
        console.error('토큰 검증 오류:', error);
        res.status(401).json({ 
            success: false, 
            message: '유효하지 않은 토큰입니다.' 
        });
    }
});

module.exports = router;