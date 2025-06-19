const express = require('express');
const router = express.Router();
const gamService = require('../services/gamService');

// 사용자 감 잔액 조회
router.get('/balance/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const balance = await gamService.getUserGamBalance(userId);
        res.json({ balance });
    } catch (error) {
        console.error('감 잔액 조회 실패:', error);
        res.status(500).json({ error: '감 잔액 조회에 실패했습니다.' });
    }
});

// 사용자 거래 내역 조회
router.get('/transactions/:userId', async (req, res) => {
    const { userId } = req.params;
    const { limit = 50 } = req.query;
    
    try {
        const transactions = await gamService.getUserTransactions(userId, parseInt(limit));
        res.json(transactions);
    } catch (error) {
        console.error('거래 내역 조회 실패:', error);
        res.status(500).json({ error: '거래 내역 조회에 실패했습니다.' });
    }
});

// 로그인 보상 받기
router.post('/login-reward/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const result = await gamService.giveLoginReward(userId);
        if (result.success) {
            res.json({ 
                success: true, 
                message: `로그인 보상 ${result.amount}감을 받았습니다! (${result.consecutiveDays}일 연속)`,
                amount: result.amount,
                consecutiveDays: result.consecutiveDays
            });
        } else {
            res.json({ success: false, message: result.message });
        }
    } catch (error) {
        console.error('로그인 보상 지급 실패:', error);
        res.status(500).json({ error: '로그인 보상 지급에 실패했습니다.' });
    }
});

// 댓글 강조 구매
router.post('/highlight-comment/:userId', async (req, res) => {
    const { userId } = req.params;
    const { commentId } = req.body;
    
    if (!commentId) {
        return res.status(400).json({ error: '댓글 ID가 필요합니다.' });
    }
    
    try {
        const result = await gamService.burnCommentHighlight(userId, commentId);
        if (result.success) {
            // 댓글 강조 처리 (24시간)
            const { getDB } = require('../database/database');
            const db = getDB();
            
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);
            
            db.run(
                'UPDATE comments SET is_highlighted = 1, highlight_expires_at = ? WHERE id = ?',
                [expiresAt.toISOString(), commentId],
                (err) => {
                    if (err) {
                        console.error('댓글 강조 처리 실패:', err);
                        return res.status(500).json({ error: '댓글 강조 처리에 실패했습니다.' });
                    }
                    
                    res.json({ 
                        success: true, 
                        message: '댓글이 24시간 동안 강조됩니다.',
                        expiresAt: expiresAt
                    });
                }
            );
        } else {
            res.status(400).json({ error: result.message });
        }
    } catch (error) {
        console.error('댓글 강조 구매 실패:', error);
        res.status(500).json({ error: '댓글 강조 구매에 실패했습니다.' });
    }
});

// 업적 확인 및 보상
router.post('/check-achievements/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const achievements = await gamService.checkAndRewardAchievements(userId);
        if (achievements.length > 0) {
            res.json({ 
                success: true, 
                message: '새로운 업적을 달성했습니다!',
                achievements: achievements
            });
        } else {
            res.json({ 
                success: false, 
                message: '달성한 새 업적이 없습니다.'
            });
        }
    } catch (error) {
        console.error('업적 확인 실패:', error);
        res.status(500).json({ error: '업적 확인에 실패했습니다.' });
    }
});

// 감 통계 조회
router.get('/stats/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const { getDB } = require('../database/database');
        const db = getDB();
        
        // 감 통계 조회
        db.all(`
            SELECT 
                type,
                category,
                SUM(amount) as total_amount,
                COUNT(*) as transaction_count
            FROM gam_transactions 
            WHERE user_id = ?
            GROUP BY type, category
            ORDER BY total_amount DESC
        `, [userId], (err, stats) => {
            if (err) {
                console.error('감 통계 조회 실패:', err);
                return res.status(500).json({ error: '감 통계 조회에 실패했습니다.' });
            }
            
            // 현재 잔액 조회
            db.get('SELECT gam_balance FROM users WHERE id = ?', [userId], (err, user) => {
                if (err) {
                    console.error('사용자 조회 실패:', err);
                    return res.status(500).json({ error: '사용자 조회에 실패했습니다.' });
                }
                
                const earnStats = stats.filter(s => s.type === 'earn');
                const burnStats = stats.filter(s => s.type === 'burn');
                
                const totalEarned = earnStats.reduce((sum, s) => sum + s.total_amount, 0);
                const totalBurned = burnStats.reduce((sum, s) => sum + s.total_amount, 0);
                
                res.json({
                    currentBalance: user ? user.gam_balance : 0,
                    totalEarned,
                    totalBurned,
                    netGain: totalEarned - totalBurned,
                    earnStats,
                    burnStats
                });
            });
        });
        
    } catch (error) {
        console.error('감 통계 조회 실패:', error);
        res.status(500).json({ error: '감 통계 조회에 실패했습니다.' });
    }
});

module.exports = router;