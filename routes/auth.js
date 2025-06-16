const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../database/init');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
        
        const db = getDB();
        
        // 중복 사용자 확인
        db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username], async (err, row) => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    message: '서버 오류가 발생했습니다.' 
                });
            }
            
            if (row) {
                return res.status(400).json({ 
                    success: false, 
                    message: '이미 존재하는 이메일 또는 사용자명입니다.' 
                });
            }
            
            // 비밀번호 암호화
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // 사용자 생성
            db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', 
                [username, email, hashedPassword], 
                function(err) {
                    if (err) {
                        return res.status(500).json({ 
                            success: false, 
                            message: '회원가입 중 오류가 발생했습니다.' 
                        });
                    }
                    
                    // JWT 토큰 생성
                    const token = jwt.sign(
                        { id: this.lastID, username, email }, 
                        JWT_SECRET, 
                        { expiresIn: '7d' }
                    );
                    
                    res.json({
                        success: true,
                        token,
                        user: {
                            id: this.lastID,
                            username,
                            email,
                            coins: 10000
                        }
                    });
                }
            );
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '서버 오류가 발생했습니다.' 
        });
    }
});

// 로그인
router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: '이메일과 비밀번호를 입력해주세요.' 
            });
        }
        
        const db = getDB();
        
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    message: '서버 오류가 발생했습니다.' 
                });
            }
            
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
                    coins: user.coins
                }
            });
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '서버 오류가 발생했습니다.' 
        });
    }
});

// 토큰 검증
router.get('/verify', (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: '토큰이 없습니다.' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const db = getDB();
        
        db.get('SELECT id, username, email, coins FROM users WHERE id = ?', [decoded.id], (err, user) => {
            if (err || !user) {
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
                    coins: user.coins
                }
            });
        });
    } catch (error) {
        res.status(401).json({ 
            success: false, 
            message: '유효하지 않은 토큰입니다.' 
        });
    }
});

module.exports = router;