const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('../config/passport');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { findUserByEmail, findUserById, createUser, updateUser } = require('../utils/database');
const { validateSignupData } = require('../utils/validation');
const { asyncHandler, createError } = require('../middleware/errorHandler');
const gamService = require('../services/gamService');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Email transporter setup (only if email credentials are provided)
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
}

// 회원가입
router.post('/signup', asyncHandler(async (req, res) => {
    const { username, email, password } = req.body;
    
    validateSignupData({ username, email, password });
    
    // 중복 사용자 확인
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
        throw createError(400, '이미 존재하는 이메일입니다.');
    }
    
    // 비밀번호 암호화
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 이메일 인증 토큰 생성
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // 사용자 생성
    const result = await createUser({
        username,
        email,
        hashedPassword,
        verificationToken
    });
    
    const userId = result.id;
                    
    // 개발 환경에서는 즉시 인증 처리
    if (process.env.NODE_ENV === 'development') {
        // 즉시 사용자를 verified로 설정
        await updateUser(userId, { verified: true, verification_token: null });
        
        // 회원가입 보상 지급
        try {
            await gamService.giveSignupReward(userId);
            console.log(`사용자 ${userId}에게 회원가입 보상 10,000감 지급 완료`);
        } catch (gamError) {
            console.error('회원가입 보상 지급 실패:', gamError);
        }
        
        res.json({
            success: true,
            message: '회원가입이 완료되었습니다! (개발 모드: 이메일 인증 자동 완료, 10,000감 지급)',
            user: {
                id: userId,
                username,
                email,
                verified: true,
                gam_balance: 10000
            }
        });
    } else {
        // 프로덕션 환경에서는 이메일 발송
        try {
            await sendVerificationEmail(email, username, verificationToken);
            
            res.json({
                success: true,
                message: '회원가입이 완료되었습니다. 이메일을 확인하여 인증을 완료해주세요.',
                user: {
                    id: userId,
                    username,
                    email,
                    verified: false
                }
            });
        } catch (emailError) {
            console.error('이메일 발송 실패:', emailError);
            res.json({
                success: true,
                message: '회원가입이 완료되었습니다. 이메일 발송에 실패했지만 수동으로 인증을 요청할 수 있습니다.',
                user: {
                    id: userId,
                    username,
                    email,
                    verified: false
                }
            });
        }
    }
}));

// 로그인
router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        throw createError(400, '이메일과 비밀번호를 입력해주세요.');
    }
    
    const user = await findUserByEmail(email);
    if (!user) {
        throw createError(400, '존재하지 않는 사용자입니다.');
    }
    
    // 이메일 인증 확인 (개발 환경에서는 건너뛰기)
    if (!user.verified && process.env.NODE_ENV !== 'development') {
        throw createError(400, '이메일 인증이 필요합니다. 인증 이메일을 확인해주세요.', {
            needsVerification: true,
            email: user.email
        });
    }
    
    // 비밀번호 확인
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
        throw createError(400, '비밀번호가 올바르지 않습니다.');
    }
            
    try {
        // 로그인 보상 지급
        const loginReward = await gamService.giveLoginReward(user.id);
        let rewardMessage = '';
        if (loginReward.success) {
            rewardMessage = ` 로그인 보상 ${loginReward.amount}감을 받았습니다! (${loginReward.consecutiveDays}일 연속)`;
        }
        
        // 사용자 감 잔액 조회
        const gamBalance = await gamService.getUserGamBalance(user.id);
        
        // JWT 토큰 생성
        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email }, 
            JWT_SECRET, 
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            message: `로그인 성공!${rewardMessage}`,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                gam_balance: gamBalance,
                verified: user.verified
            },
            loginReward: loginReward.success ? {
                amount: loginReward.amount,
                consecutiveDays: loginReward.consecutiveDays
            } : null
        });
    } catch (error) {
        console.error('로그인 처리 중 오류:', error);
        // 감 서비스 오류가 있어도 로그인은 진행
        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email }, 
            JWT_SECRET, 
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            message: '로그인 성공!',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                gam_balance: user.gam_balance || 10000,
                verified: user.verified
            }
        });
    }
}));

// 토큰 검증
router.get('/verify', asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        throw createError(401, '토큰이 없습니다.');
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await findUserByEmail(decoded.email) || await findUserById(decoded.id);
    
    if (!user) {
        throw createError(401, '유효하지 않은 토큰입니다.');
    }
    
    try {
        // 최신 감 잔액 조회
        const currentBalance = await gamService.getUserGamBalance(user.id);
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                gam_balance: currentBalance,
                verified: user.verified
            }
        });
    } catch (error) {
        // 감 서비스 오류 시 DB 값 사용
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                gam_balance: user.gam_balance || 10000,
                verified: user.verified
            }
        });
    }
}));

// OAuth Routes (only if credentials are configured)
// Google OAuth
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    router.get('/google', passport.authenticate('google', {
        scope: ['profile', 'email']
    }));

    router.get('/google/callback', 
        passport.authenticate('google', { failureRedirect: '/login' }),
        (req, res) => {
        // Generate JWT token for OAuth user
        const token = jwt.sign(
            { id: req.user.id, username: req.user.username, email: req.user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Redirect to frontend with token
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}?token=${token}&user=${encodeURIComponent(JSON.stringify({
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            coins: req.user.coins
        }))}`);
    }
    );
}

// GitHub OAuth
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    router.get('/github', passport.authenticate('github', {
        scope: ['user:email']
    }));

    router.get('/github/callback',
        passport.authenticate('github', { failureRedirect: '/login' }),
        (req, res) => {
        // Generate JWT token for OAuth user
        const token = jwt.sign(
            { id: req.user.id, username: req.user.username, email: req.user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Redirect to frontend with token
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}?token=${token}&user=${encodeURIComponent(JSON.stringify({
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            coins: req.user.coins
        }))}`);
    }
    );
}

// Email verification
router.post('/send-verification', async (req, res) => {
    try {
        const { email } = req.body;
        const db = getDB();
        
        // Check if user exists
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
            if (err || !user) {
                return res.status(400).json({
                    success: false,
                    message: '사용자를 찾을 수 없습니다.'
                });
            }
            
            if (user.verified) {
                return res.status(400).json({
                    success: false,
                    message: '이미 인증된 사용자입니다.'
                });
            }
            
            // Generate verification token
            const verificationToken = crypto.randomBytes(32).toString('hex');
            
            // Update user with verification token
            db.run('UPDATE users SET verification_token = ? WHERE id = ?', 
                [verificationToken, user.id], async (err) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: '인증 토큰 생성에 실패했습니다.'
                    });
                }
                
                // Send verification email
                const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
                
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: email,
                    subject: '예겜 - 이메일 인증',
                    html: `
                        <h2>예겜 이메일 인증</h2>
                        <p>안녕하세요 ${user.username}님!</p>
                        <p>아래 링크를 클릭하여 이메일 인증을 완료해주세요:</p>
                        <a href="${verificationUrl}" style="background-color: #3B82F6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">이메일 인증하기</a>
                        <p>링크가 작동하지 않으면 다음 주소를 복사하여 브라우저에 붙여넣어주세요:</p>
                        <p>${verificationUrl}</p>
                    `
                };
                
                try {
                    if (!transporter) {
                        return res.status(500).json({
                            success: false,
                            message: '이메일 서비스가 설정되지 않았습니다.'
                        });
                    }
                    
                    await transporter.sendMail(mailOptions);
                    res.json({
                        success: true,
                        message: '인증 이메일이 발송되었습니다.'
                    });
                } catch (emailError) {
                    console.error('Email sending failed:', emailError);
                    res.status(500).json({
                        success: false,
                        message: '이메일 발송에 실패했습니다.'
                    });
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

// Verify email
router.get('/verify-email/:token', (req, res) => {
    const { token } = req.params;
    const db = getDB();
    
    db.get('SELECT * FROM users WHERE verification_token = ?', [token], async (err, user) => {
        if (err || !user) {
            return res.status(400).json({
                success: false,
                message: '유효하지 않은 인증 토큰입니다.'
            });
        }
        
        if (user.verified) {
            return res.status(400).json({
                success: false,
                message: '이미 인증된 사용자입니다.'
            });
        }
        
        try {
            // Update user as verified
            db.run('UPDATE users SET verified = TRUE, verification_token = NULL WHERE id = ?', 
                [user.id], async (err) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: '인증 처리 중 오류가 발생했습니다.'
                    });
                }
                
                // 회원가입 보상 지급 (이메일 인증 완료 시)
                try {
                    await gamService.giveSignupReward(user.id);
                    console.log(`사용자 ${user.id}에게 회원가입 보상 10,000감 지급 완료`);
                } catch (gamError) {
                    console.error('회원가입 보상 지급 실패:', gamError);
                }
                
                res.json({
                    success: true,
                    message: '이메일 인증이 완료되었습니다! 회원가입 보상 10,000감을 받았습니다.'
                });
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: '인증 처리 중 오류가 발생했습니다.'
            });
        }
    });
});

// 이메일 발송 헬퍼 함수
async function sendVerificationEmail(email, username, verificationToken) {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/auth/verify-email/${verificationToken}`;
    
    // 개발 환경에서는 이메일을 실제로 보내지 않고 콘솔에 로그 출력
    if (!transporter || process.env.NODE_ENV === 'development') {
        console.log('\n='.repeat(80));
        console.log('📧 이메일 인증 링크 (개발 모드)');
        console.log('='.repeat(80));
        console.log(`받는 사람: ${email}`);
        console.log(`사용자명: ${username}`);
        console.log(`인증 링크: ${verificationUrl}`);
        console.log('\n💡 브라우저에서 위 링크로 접속하여 이메일 인증을 완료하세요!');
        console.log('='.repeat(80));
        return; // 실제 이메일 발송하지 않음
    }
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: '예겜 - 이메일 인증',
        html: `
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
                <h2 style="color: #3B82F6; text-align: center;">🎮 예겜 이메일 인증</h2>
                <p>안녕하세요 <strong>${username}</strong>님!</p>
                <p>예겜에 가입해주셔서 감사합니다. 아래 버튼을 클릭하여 이메일 인증을 완료해주세요:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${verificationUrl}" 
                       style="background-color: #3B82F6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                        이메일 인증하기
                    </a>
                </div>
                <p style="color: #666; font-size: 14px;">
                    버튼이 작동하지 않으면 다음 링크를 복사하여 브라우저에 붙여넣어주세요:<br>
                    <span style="word-break: break-all;">${verificationUrl}</span>
                </p>
                <div style="margin-top: 30px; padding: 15px; background-color: #F3F4F6; border-radius: 8px;">
                    <p style="margin: 0; color: #374151; font-size: 14px;">
                        💎 <strong>인증 완료 시 혜택:</strong><br>
                        • 회원가입 보상 10,000감 즉시 지급<br>
                        • 모든 예측 기능 이용 가능<br>
                        • 매일 로그인 보상 수령 가능
                    </p>
                </div>
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
                <p style="color: #9CA3AF; font-size: 12px; text-align: center;">
                    이 이메일은 예겜 회원가입 시 자동으로 발송됩니다.<br>
                    문의사항이 있으시면 고객센터로 연락해주세요.
                </p>
            </div>
        `
    };
    
    await transporter.sendMail(mailOptions);
}

// 소셜 로그인이 설정되어 있지 않을 때를 위한 라우트들
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    router.get('/google', (req, res) => {
        res.status(503).json({
            success: false,
            message: 'Google 로그인이 현재 설정되어 있지 않습니다. 이메일로 회원가입해주세요.'
        });
    });
}

if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    router.get('/github', (req, res) => {
        res.status(503).json({
            success: false,
            message: 'GitHub 로그인이 현재 설정되어 있지 않습니다. 이메일로 회원가입해주세요.'
        });
    });
}

module.exports = router;