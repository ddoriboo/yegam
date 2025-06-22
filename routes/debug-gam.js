const express = require('express');
const { query } = require('../database/postgres');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 디버그용: 사용자의 실제 GAM 잔액 확인
router.get('/check-balance', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 1. users 테이블의 현재 잔액 확인
        const userResult = await query(
            'SELECT id, username, email, gam_balance, created_at FROM users WHERE id = $1',
            [userId]
        );
        const user = userResult.rows[0];
        
        // 2. 트랜잭션 기록에서 계산한 잔액 확인
        const transactionResult = await query(`
            SELECT 
                SUM(CASE WHEN type = 'earn' THEN amount ELSE -amount END) as calculated_balance,
                COUNT(*) as total_transactions,
                SUM(CASE WHEN type = 'earn' THEN amount ELSE 0 END) as total_earned,
                SUM(CASE WHEN type = 'burn' THEN amount ELSE 0 END) as total_burned
            FROM gam_transactions 
            WHERE user_id = $1
        `, [userId]);
        const transactionStats = transactionResult.rows[0];
        
        // 3. 최근 트랜잭션 5개 확인
        const recentTransactions = await query(`
            SELECT id, type, category, amount, description, created_at
            FROM gam_transactions 
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 5
        `, [userId]);
        
        res.json({
            success: true,
            data: {
                userTable: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    gam_balance: user.gam_balance,
                    created_at: user.created_at,
                    gam_balance_is_null: user.gam_balance === null,
                    gam_balance_is_zero: user.gam_balance === 0
                },
                calculatedFromTransactions: {
                    calculated_balance: parseInt(transactionStats.calculated_balance || 0),
                    total_transactions: parseInt(transactionStats.total_transactions || 0),
                    total_earned: parseInt(transactionStats.total_earned || 0),
                    total_burned: parseInt(transactionStats.total_burned || 0)
                },
                recentTransactions: recentTransactions.rows,
                discrepancy: user.gam_balance !== parseInt(transactionStats.calculated_balance || 0)
            }
        });
        
    } catch (error) {
        console.error('GAM 잔액 확인 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: 'GAM 잔액 확인 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 디버그용: GAM 잔액 재계산 및 수정
router.post('/fix-balance', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 트랜잭션에서 실제 잔액 계산
        const transactionResult = await query(`
            SELECT 
                SUM(CASE WHEN type = 'earn' THEN amount ELSE -amount END) as calculated_balance
            FROM gam_transactions 
            WHERE user_id = $1
        `, [userId]);
        
        const calculatedBalance = parseInt(transactionResult.rows[0].calculated_balance || 0);
        
        // 기본 시작 금액 10000 추가 (회원가입 보너스)
        const finalBalance = calculatedBalance + 10000;
        
        // users 테이블 업데이트
        await query(
            'UPDATE users SET gam_balance = $1 WHERE id = $2',
            [finalBalance, userId]
        );
        
        // 업데이트된 사용자 정보 조회
        const updatedUser = await query(
            'SELECT id, username, email, gam_balance FROM users WHERE id = $1',
            [userId]
        );
        
        res.json({
            success: true,
            message: 'GAM 잔액이 수정되었습니다.',
            data: {
                previous_calculated: calculatedBalance,
                new_balance: finalBalance,
                user: updatedUser.rows[0]
            }
        });
        
    } catch (error) {
        console.error('GAM 잔액 수정 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: 'GAM 잔액 수정 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

module.exports = router;