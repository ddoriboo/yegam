const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, run, get } = require('../database/database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
}

// 회원가입
router.post('/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: '모든 필드를 입력해주세요.' 
            });
        }
        
        // Basic validation
        if (username.length < 2 || username.length > 20) {
            return res.status(400).json({ 
                success: false, 
                message: '사용자명은 2-20자 사이여야 합니다.' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: '비밀번호는 최소 6자 이상이어야 합니다.' 
            });
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                message: '올바른 이메일 형식이 아닙니다.' 
            });
        }
        
        try {
            // 중복 사용자 확인
            const existingUser = await get('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
            
            if (existingUser) {
                return res.status(400).json({ 
                    success: false, 
                    message: '이미 존재하는 이메일 또는 사용자명입니다.' 
                });
            }
            
            // 비밀번호 암호화
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // 사용자 생성
            const result = await run('INSERT INTO users (username, email, password_hash, coins) VALUES ($1, $2, $3, $4)', 
                [username, email, hashedPassword, 10000]);
            
            const userId = result.lastID || result.rows[0]?.id;
            
            // JWT 토큰 생성
            const token = jwt.sign(
                { id: userId, username, email }, 
                JWT_SECRET, 
                { expiresIn: '7d' }
            );
            
            res.json({
                success: true,
                token,
                user: {
                    id: userId,
                    username,
                    email,
                    coins: 10000
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
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: '이메일과 비밀번호를 입력해주세요.' 
            });
        }
        
        const user = await get('SELECT * FROM users WHERE email = $1', [email]);
        
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: '존재하지 않는 사용자입니다.' 
            });
        }
        
        // 비밀번호 확인
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ 
                success: false, 
                message: '비밀번호가 올바르지 않습니다.' 
            });
        }
        
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
                coins: user.coins || 10000
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
                coins: user.coins || 10000
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