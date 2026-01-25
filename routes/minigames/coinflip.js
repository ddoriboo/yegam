const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middleware/auth');
const db = require('../../db');

// 게임 히스토리 (메모리)
let gameHistory = [];
const MAX_HISTORY = 100;

// 동전 던지기 플레이
router.post('/play', verifyToken, async (req, res) => {
    try {
        const { betAmount, choice } = req.body;
        const userId = req.user.id;
        
        // 유효성 검사
        if (!betAmount || !choice) {
            return res.json({ success: false, message: '베팅 금액과 선택을 입력해주세요' });
        }
        
        if (betAmount < 10 || betAmount > 10000) {
            return res.json({ success: false, message: '베팅 금액은 10 ~ 10,000 GAM입니다' });
        }
        
        if (!['heads', 'tails'].includes(choice)) {
            return res.json({ success: false, message: '올바른 선택이 아닙니다' });
        }
        
        // 사용자 잔액 확인
        const userResult = await db.query(
            'SELECT gam_balance FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.json({ success: false, message: '사용자를 찾을 수 없습니다' });
        }
        
        const currentBalance = userResult.rows[0].gam_balance;
        
        if (currentBalance < betAmount) {
            return res.json({ success: false, message: '잔액이 부족합니다' });
        }
        
        // 동전 던지기 결과 (50:50)
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = result === choice;
        
        let newBalance;
        let payout = 0;
        
        if (won) {
            // 승리: 2배 지급
            payout = betAmount * 2;
            newBalance = currentBalance - betAmount + payout;
        } else {
            // 패배: 베팅금 차감
            newBalance = currentBalance - betAmount;
        }
        
        // 잔액 업데이트
        await db.query(
            'UPDATE users SET gam_balance = $1 WHERE id = $2',
            [newBalance, userId]
        );
        
        // 히스토리에 추가
        gameHistory.unshift({
            gameId: Date.now(),
            userId: userId,
            choice: choice,
            result: result,
            betAmount: betAmount,
            won: won,
            payout: payout,
            timestamp: new Date()
        });
        
        if (gameHistory.length > MAX_HISTORY) {
            gameHistory = gameHistory.slice(0, MAX_HISTORY);
        }
        
        // GAM 트랜잭션 기록 (선택적)
        try {
            const transactionType = won ? 'minigame_win' : 'minigame_loss';
            const transactionAmount = won ? (payout - betAmount) : -betAmount;
            
            await db.query(
                `INSERT INTO gam_transactions (user_id, amount, type, description)
                 VALUES ($1, $2, $3, $4)`,
                [userId, transactionAmount, transactionType, `동전던지기 ${won ? '승리' : '패배'} (${choice} vs ${result})`]
            );
        } catch (txError) {
            console.warn('GAM 트랜잭션 기록 실패:', txError.message);
        }
        
        console.log(`🪙 동전던지기: ${req.user.username} - ${choice} vs ${result}, ${won ? '승리' : '패배'}, ${won ? '+' : '-'}${betAmount} GAM`);
        
        res.json({
            success: true,
            choice: choice,
            result: result,
            won: won,
            betAmount: betAmount,
            payout: payout,
            newBalance: newBalance
        });
        
    } catch (error) {
        console.error('동전던지기 오류:', error);
        res.json({ success: false, message: '게임 처리 중 오류가 발생했습니다' });
    }
});

// 게임 히스토리 조회
router.get('/history', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        
        res.json({
            success: true,
            history: gameHistory.slice(0, limit)
        });
    } catch (error) {
        console.error('히스토리 조회 오류:', error);
        res.json({ success: false, message: '히스토리 조회 실패' });
    }
});

module.exports = router;
