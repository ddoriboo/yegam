const express = require('express');
const router = express.Router();
// Panel balances must not receive legacy attendance/achievement refills.
router.param('userId', require('../middleware/official-panel-guard').rejectPanelRewardTarget());
const gamService = require('../services/gamService');
const { authMiddleware } = require('../middleware/auth');

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

// 사용자 거래 내역 조회 (기존 - 보안상 문제 있음)
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

// 내 거래 내역 조회 (인증된 사용자 전용)
router.get('/my-transactions', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { limit = 50, page = 1 } = req.query;
    
    try {
        // PostgreSQL 직접 사용 (gamService에서 PostgreSQL 지원하지 않을 수 있음)
        const { query } = require('../database/postgres');
        
        const offset = (page - 1) * limit;
        const sql = `
            SELECT 
                id,
                type,
                category,
                amount,
                description,
                reference_id,
                created_at
            FROM gam_transactions 
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `;
        
        const result = await query(sql, [userId, parseInt(limit), offset]);
        const transactions = result.rows;
        
        // 총 개수도 조회
        const countResult = await query('SELECT COUNT(*) as total FROM gam_transactions WHERE user_id = $1', [userId]);
        const total = parseInt(countResult.rows[0].total);
        
        res.json({
            success: true,
            transactions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('거래 내역 조회 실패:', error);
        res.status(500).json({ 
            success: false, 
            message: '거래 내역 조회에 실패했습니다.' 
        });
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

// 튜토리얼 완료 보상 받기 (1회 한정)
router.post('/tutorial-reward', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    
    try {
        const { query } = require('../database/postgres');
        
        // 사용자 정보 조회 (튜토리얼 완료 여부 확인)
        const userResult = await query(
            'SELECT id, username, email, gam_balance, tutorial_completed FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '사용자를 찾을 수 없습니다.'
            });
        }
        
        const user = userResult.rows[0];
        
        // 이미 튜토리얼 보상을 받았는지 확인
        if (user.tutorial_completed) {
            return res.json({
                success: true,
                message: '이미 튜토리얼 보상을 받으셨습니다.',
                alreadyClaimed: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    gam_balance: user.gam_balance
                }
            });
        }
        
        // 10,000 GAM 지급
        const rewardAmount = 10000;
        const newBalance = user.gam_balance + rewardAmount;
        
        // 사용자 GAM 잔액 업데이트 및 튜토리얼 완료 플래그 설정
        await query(
            'UPDATE users SET gam_balance = $1, tutorial_completed = true, updated_at = NOW() WHERE id = $2',
            [newBalance, userId]
        );
        
        // GAM 거래 내역 기록
        await query(`
            INSERT INTO gam_transactions (user_id, type, category, amount, description, reference_id)
            VALUES ($1, 'earn', 'tutorial_reward', $2, '튜토리얼 완주 보상', $1)
        `, [userId, rewardAmount]);
        
        console.log(`✅ 튜토리얼 보상 지급: 사용자 ${userId}에게 ${rewardAmount} GAM 지급`);
        
        res.json({
            success: true,
            message: `축하합니다! 튜토리얼 완주 보상 ${rewardAmount.toLocaleString()} GAM을 받으셨습니다!`,
            alreadyClaimed: false,
            rewardAmount,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                gam_balance: newBalance
            }
        });
        
    } catch (error) {
        console.error('튜토리얼 보상 지급 실패:', error);
        res.status(500).json({
            success: false,
            message: '튜토리얼 보상 지급에 실패했습니다. 잠시 후 다시 시도해주세요.'
        });
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

// =====================================
// 미니게임 관련 GAM 처리 함수들
// =====================================

// 미니게임 베팅 처리
router.post('/minigame-bet', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { amount, gameType, gameData } = req.body;
    
    try {
        console.log(`🎮 미니게임 베팅 요청: 사용자 ${userId}, 게임 ${gameType}, 금액 ${amount} GAM`);
        
        // 입력 값 검증
        if (!amount || !gameType) {
            return res.status(400).json({
                success: false,
                message: '베팅 금액과 게임 타입이 필요합니다'
            });
        }
        
        if (amount < 10 || amount > 10000) {
            return res.status(400).json({
                success: false,
                message: '베팅 금액은 10 GAM에서 10,000 GAM 사이여야 합니다'
            });
        }
        
        const { query } = require('../database/postgres');
        
        // 트랜잭션 시작
        await query('BEGIN');
        
        try {
            // 사용자 잔액 확인 및 잠금
            const userResult = await query(
                'SELECT id, username, gam_balance FROM users WHERE id = $1 FOR UPDATE',
                [userId]
            );
            
            if (userResult.rows.length === 0) {
                await query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    message: '사용자를 찾을 수 없습니다'
                });
            }
            
            const user = userResult.rows[0];
            
            // 잔액 확인
            if (user.gam_balance < amount) {
                await query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: '보유 GAM이 부족합니다'
                });
            }
            
            // GAM 차감
            const newBalance = user.gam_balance - amount;
            await query(
                'UPDATE users SET gam_balance = $1 WHERE id = $2',
                [newBalance, userId]
            );
            
            // 미니게임 거래 기록 (별도 테이블 사용 예정)
            // 현재는 기존 gam_transactions 테이블 활용
            await query(
                `INSERT INTO gam_transactions 
                (user_id, type, category, amount, description, reference_id) 
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    userId,
                    'burn',
                    'minigame_bet',
                    amount,
                    `${gameType} 게임 베팅`,
                    JSON.stringify({ gameType, ...gameData })
                ]
            );
            
            await query('COMMIT');
            
            console.log(`✅ 미니게임 베팅 성공: 사용자 ${userId}, ${amount} GAM 차감, 잔액 ${newBalance}`);
            
            res.json({
                success: true,
                message: '베팅이 성공적으로 처리되었습니다',
                newBalance: newBalance,
                betAmount: amount,
                gameType: gameType
            });
            
        } catch (innerError) {
            await query('ROLLBACK');
            throw innerError;
        }
        
    } catch (error) {
        console.error('미니게임 베팅 실패:', error);
        res.status(500).json({
            success: false,
            message: '베팅 처리 중 오류가 발생했습니다'
        });
    }
});

// 미니게임 수익 지급 처리
router.post('/minigame-payout', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { amount, gameType, gameData } = req.body;
    
    try {
        console.log(`💰 미니게임 수익 지급 요청: 사용자 ${userId}, 게임 ${gameType}, 금액 ${amount} GAM`);
        
        // 입력 값 검증
        if (!amount || !gameType) {
            return res.status(400).json({
                success: false,
                message: '지급 금액과 게임 타입이 필요합니다'
            });
        }
        
        if (amount <= 0 || amount > 100000) {
            return res.status(400).json({
                success: false,
                message: '잘못된 지급 금액입니다'
            });
        }
        
        const { query } = require('../database/postgres');
        
        // 트랜잭션 시작
        await query('BEGIN');
        
        try {
            // 사용자 잔액 확인 및 잠금
            const userResult = await query(
                'SELECT id, username, gam_balance FROM users WHERE id = $1 FOR UPDATE',
                [userId]
            );
            
            if (userResult.rows.length === 0) {
                await query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    message: '사용자를 찾을 수 없습니다'
                });
            }
            
            const user = userResult.rows[0];
            
            // GAM 지급 (최대 잔액 제한 확인)
            const newBalance = Math.min(user.gam_balance + amount, 99999999);
            const actualPayout = newBalance - user.gam_balance;
            
            await query(
                'UPDATE users SET gam_balance = $1 WHERE id = $2',
                [newBalance, userId]
            );
            
            // 미니게임 수익 기록
            await query(
                `INSERT INTO gam_transactions 
                (user_id, type, category, amount, description, reference_id) 
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    userId,
                    'earn',
                    'minigame_win',
                    actualPayout,
                    `${gameType} 게임 수익`,
                    JSON.stringify({ gameType, originalPayout: amount, ...gameData })
                ]
            );
            
            await query('COMMIT');
            
            console.log(`✅ 미니게임 수익 지급 성공: 사용자 ${userId}, ${actualPayout} GAM 지급, 잔액 ${newBalance}`);
            
            res.json({
                success: true,
                message: '수익이 성공적으로 지급되었습니다',
                newBalance: newBalance,
                payoutAmount: actualPayout,
                gameType: gameType
            });
            
        } catch (innerError) {
            await query('ROLLBACK');
            throw innerError;
        }
        
    } catch (error) {
        console.error('미니게임 수익 지급 실패:', error);
        res.status(500).json({
            success: false,
            message: '수익 지급 처리 중 오류가 발생했습니다'
        });
    }
});

// 미니게임 접근 권한 확인
router.get('/minigame-access-check', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { gameType } = req.query;
    
    try {
        const { query } = require('../database/postgres');
        
        // 사용자 정보 조회
        const userResult = await query(
            'SELECT id, username, gam_balance FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '사용자를 찾을 수 없습니다'
            });
        }
        
        const user = userResult.rows[0];
        
        // 게임별 접근 권한 확인
        const gameAccessRules = {
            'bustabit': { minBalance: 10, maxBet: 10000 },
            'monster': { minBalance: 10, maxBet: 10000 },
            'slots': { minBalance: 10, maxBet: 10000 }
        };
        
        const gameRule = gameAccessRules[gameType];
        if (!gameRule) {
            return res.status(400).json({
                success: false,
                message: '지원하지 않는 게임입니다'
            });
        }
        
        const canPlay = user.gam_balance >= gameRule.minBalance;
        
        res.json({
            success: canPlay,
            message: canPlay ? '게임을 플레이할 수 있습니다' : '최소 GAM 잔액이 부족합니다',
            userBalance: user.gam_balance,
            minBalance: gameRule.minBalance,
            maxBet: gameRule.maxBet
        });
        
    } catch (error) {
        console.error('미니게임 접근 권한 확인 실패:', error);
        res.status(500).json({
            success: false,
            message: '접근 권한 확인 중 오류가 발생했습니다'
        });
    }
});

module.exports = router;