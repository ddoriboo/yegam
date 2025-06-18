const express = require('express');
const router = express.Router();
const { getDB } = require('../database/init');
const gamService = require('../services/gamService');
const crypto = require('crypto');

// 사용자 프로필 조회
router.get('/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const db = getDB();
        
        db.get(`
            SELECT 
                id, username, email, profile_image, gam_balance,
                last_login_date, consecutive_login_days, 
                total_predictions, correct_predictions,
                first_prediction_reward, first_comment_reward,
                created_at, verified
            FROM users 
            WHERE id = ?
        `, [userId], async (err, user) => {
            if (err) {
                console.error('사용자 조회 실패:', err);
                return res.status(500).json({ error: '사용자 조회에 실패했습니다.' });
            }
            
            if (!user) {
                return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
            }
            
            try {
                // 최신 감 잔액 조회
                const currentBalance = await gamService.getUserGamBalance(userId);
                
                // 정확도 계산
                const accuracy = user.total_predictions > 0 
                    ? Math.round((user.correct_predictions / user.total_predictions) * 100)
                    : 0;
                
                res.json({
                    ...user,
                    gam_balance: currentBalance,
                    accuracy: accuracy
                });
            } catch (error) {
                console.error('프로필 조회 중 오류:', error);
                res.json({
                    ...user,
                    accuracy: user.total_predictions > 0 
                        ? Math.round((user.correct_predictions / user.total_predictions) * 100)
                        : 0
                });
            }
        });
        
    } catch (error) {
        console.error('프로필 조회 실패:', error);
        res.status(500).json({ error: '프로필 조회에 실패했습니다.' });
    }
});

// 닉네임 변경 (30일 제한)
router.put('/:userId/username', (req, res) => {
    const { userId } = req.params;
    const { newUsername } = req.body;
    
    if (!newUsername || newUsername.trim().length < 2) {
        return res.status(400).json({ error: '닉네임은 2글자 이상이어야 합니다.' });
    }
    
    if (newUsername.length > 20) {
        return res.status(400).json({ error: '닉네임은 20글자 이하여야 합니다.' });
    }
    
    // 특수문자 제한
    const usernameRegex = /^[가-힣a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(newUsername)) {
        return res.status(400).json({ error: '닉네임에는 한글, 영문, 숫자, _, - 만 사용할 수 있습니다.' });
    }
    
    const db = getDB();
    
    // 현재 사용자 정보 조회
    db.get('SELECT username, updated_at FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }
        
        // 30일 제한 확인
        const lastUpdate = new Date(user.updated_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        if (lastUpdate > thirtyDaysAgo) {
            const nextAllowedDate = new Date(lastUpdate);
            nextAllowedDate.setDate(nextAllowedDate.getDate() + 30);
            
            return res.status(400).json({ 
                error: '닉네임은 30일에 한 번만 변경할 수 있습니다.',
                nextAllowedDate: nextAllowedDate.toISOString().split('T')[0]
            });
        }
        
        // 중복 확인
        db.get('SELECT id FROM users WHERE username = ? AND id != ?', [newUsername, userId], (err, duplicate) => {
            if (err) {
                return res.status(500).json({ error: '닉네임 중복 확인에 실패했습니다.' });
            }
            
            if (duplicate) {
                return res.status(400).json({ error: '이미 사용 중인 닉네임입니다.' });
            }
            
            // 닉네임 업데이트
            db.run(
                'UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newUsername, userId],
                function(err) {
                    if (err) {
                        console.error('닉네임 변경 실패:', err);
                        return res.status(500).json({ error: '닉네임 변경에 실패했습니다.' });
                    }
                    
                    res.json({ 
                        success: true, 
                        message: '닉네임이 변경되었습니다.',
                        newUsername: newUsername
                    });
                }
            );
        });
    });
});

// 프로필 이미지 업로드 (URL 저장)
router.put('/:userId/profile-image', (req, res) => {
    const { userId } = req.params;
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
        return res.status(400).json({ error: '이미지 URL이 필요합니다.' });
    }
    
    // URL 형식 검증
    const urlRegex = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i;
    if (!urlRegex.test(imageUrl)) {
        return res.status(400).json({ error: '올바른 이미지 URL 형식이 아닙니다.' });
    }
    
    const db = getDB();
    
    db.run(
        'UPDATE users SET profile_image = ? WHERE id = ?',
        [imageUrl, userId],
        function(err) {
            if (err) {
                console.error('프로필 이미지 업데이트 실패:', err);
                return res.status(500).json({ error: '프로필 이미지 업데이트에 실패했습니다.' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
            }
            
            res.json({ 
                success: true, 
                message: '프로필 이미지가 변경되었습니다.',
                imageUrl: imageUrl
            });
        }
    );
});

// 상세 예측 통계 조회
router.get('/:userId/stats', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const db = getDB();
        
        // 기본 통계 조회
        db.get(`
            SELECT 
                total_predictions,
                correct_predictions,
                gam_balance,
                consecutive_login_days,
                created_at
            FROM users 
            WHERE id = ?
        `, [userId], (err, userStats) => {
            if (err || !userStats) {
                return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
            }
            
            // 베팅 관련 통계 조회
            db.all(`
                SELECT 
                    b.amount,
                    b.choice,
                    b.created_at,
                    i.title,
                    i.category,
                    i.correct_answer,
                    i.status,
                    CASE 
                        WHEN i.status = 'settled' AND i.correct_answer = b.choice THEN 'win'
                        WHEN i.status = 'settled' AND i.correct_answer != b.choice THEN 'lose'
                        ELSE 'pending'
                    END as result
                FROM bets b
                JOIN issues i ON b.issue_id = i.id
                WHERE b.user_id = ?
                ORDER BY b.created_at DESC
            `, [userId], async (err, bets) => {
                if (err) {
                    console.error('베팅 통계 조회 실패:', err);
                    return res.status(500).json({ error: '베팅 통계 조회에 실패했습니다.' });
                }
                
                // 통계 계산
                const totalBets = bets.length;
                const settledBets = bets.filter(bet => bet.result !== 'pending');
                const wins = bets.filter(bet => bet.result === 'win');
                const losses = bets.filter(bet => bet.result === 'lose');
                
                const totalInvested = bets.reduce((sum, bet) => sum + bet.amount, 0);
                const totalWinAmount = wins.reduce((sum, bet) => sum + bet.amount, 0);
                const totalLossAmount = losses.reduce((sum, bet) => sum + bet.amount, 0);
                
                // 카테고리별 통계
                const categoryStats = {};
                bets.forEach(bet => {
                    if (!categoryStats[bet.category]) {
                        categoryStats[bet.category] = {
                            total: 0,
                            wins: 0,
                            totalAmount: 0
                        };
                    }
                    
                    categoryStats[bet.category].total++;
                    categoryStats[bet.category].totalAmount += bet.amount;
                    
                    if (bet.result === 'win') {
                        categoryStats[bet.category].wins++;
                    }
                });
                
                // 카테고리별 성공률 계산
                Object.keys(categoryStats).forEach(category => {
                    const stats = categoryStats[category];
                    const settledInCategory = bets.filter(bet => 
                        bet.category === category && bet.result !== 'pending'
                    ).length;
                    
                    stats.accuracy = settledInCategory > 0 
                        ? Math.round((stats.wins / settledInCategory) * 100)
                        : 0;
                });
                
                try {
                    // 감 거래 내역 조회
                    const transactions = await gamService.getUserTransactions(userId, 100);
                    const earnTransactions = transactions.filter(t => t.type === 'earn');
                    const burnTransactions = transactions.filter(t => t.type === 'burn');
                    
                    const totalEarned = earnTransactions.reduce((sum, t) => sum + t.amount, 0);
                    const totalBurned = burnTransactions.reduce((sum, t) => sum + t.amount, 0);
                    
                    // 현재 감 잔액
                    const currentBalance = await gamService.getUserGamBalance(userId);
                    
                    // ROI 계산 (투자 대비 수익률)
                    const roi = totalInvested > 0 
                        ? Math.round(((currentBalance + totalEarned - 10000 - totalInvested) / totalInvested) * 100)
                        : 0;
                    
                    res.json({
                        userInfo: {
                            totalPredictions: userStats.total_predictions,
                            correctPredictions: userStats.correct_predictions,
                            accuracy: userStats.total_predictions > 0 
                                ? Math.round((userStats.correct_predictions / userStats.total_predictions) * 100)
                                : 0,
                            consecutiveLoginDays: userStats.consecutive_login_days,
                            memberSince: userStats.created_at
                        },
                        gamStats: {
                            currentBalance: currentBalance,
                            totalEarned: totalEarned,
                            totalBurned: totalBurned,
                            totalInvested: totalInvested,
                            roi: roi
                        },
                        bettingStats: {
                            totalBets: totalBets,
                            settledBets: settledBets.length,
                            wins: wins.length,
                            losses: losses.length,
                            winRate: settledBets.length > 0 
                                ? Math.round((wins.length / settledBets.length) * 100)
                                : 0,
                            totalWinAmount: totalWinAmount,
                            totalLossAmount: totalLossAmount,
                            netProfit: totalWinAmount - totalLossAmount
                        },
                        categoryStats: categoryStats,
                        recentTransactions: transactions.slice(0, 10)
                    });
                    
                } catch (error) {
                    console.error('감 통계 조회 실패:', error);
                    // 감 서비스 오류 시 기본 통계만 반환
                    res.json({
                        userInfo: {
                            totalPredictions: userStats.total_predictions,
                            correctPredictions: userStats.correct_predictions,
                            accuracy: userStats.total_predictions > 0 
                                ? Math.round((userStats.correct_predictions / userStats.total_predictions) * 100)
                                : 0,
                            consecutiveLoginDays: userStats.consecutive_login_days,
                            memberSince: userStats.created_at
                        },
                        gamStats: {
                            currentBalance: userStats.gam_balance || 10000,
                            totalEarned: 0,
                            totalBurned: 0,
                            totalInvested: totalInvested,
                            roi: 0
                        },
                        bettingStats: {
                            totalBets: totalBets,
                            settledBets: settledBets.length,
                            wins: wins.length,
                            losses: losses.length,
                            winRate: settledBets.length > 0 
                                ? Math.round((wins.length / settledBets.length) * 100)
                                : 0,
                            totalWinAmount: totalWinAmount,
                            totalLossAmount: totalLossAmount,
                            netProfit: totalWinAmount - totalLossAmount
                        },
                        categoryStats: categoryStats
                    });
                }
            });
        });
        
    } catch (error) {
        console.error('사용자 통계 조회 실패:', error);
        res.status(500).json({ error: '사용자 통계 조회에 실패했습니다.' });
    }
});

// 비밀번호 변경
router.put('/:userId/password', async (req, res) => {
    const { userId } = req.params;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ error: '새 비밀번호는 6글자 이상이어야 합니다.' });
    }
    
    try {
        const db = getDB();
        
        // 현재 비밀번호 확인
        db.get('SELECT password_hash FROM users WHERE id = ?', [userId], async (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
            }
            
            const bcrypt = require('bcryptjs');
            const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
            
            if (!validPassword) {
                return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
            }
            
            // 새 비밀번호 암호화
            const hashedNewPassword = await bcrypt.hash(newPassword, 10);
            
            // 비밀번호 업데이트
            db.run(
                'UPDATE users SET password_hash = ? WHERE id = ?',
                [hashedNewPassword, userId],
                function(err) {
                    if (err) {
                        console.error('비밀번호 변경 실패:', err);
                        return res.status(500).json({ error: '비밀번호 변경에 실패했습니다.' });
                    }
                    
                    res.json({ 
                        success: true, 
                        message: '비밀번호가 변경되었습니다.'
                    });
                }
            );
        });
        
    } catch (error) {
        console.error('비밀번호 변경 실패:', error);
        res.status(500).json({ error: '비밀번호 변경에 실패했습니다.' });
    }
});

module.exports = router;